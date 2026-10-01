import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  DEFAULT_MARKETS,
  evaluateRules,
  isMarket,
  isRole,
  isPackFormat,
  rulebookScopeForCategory,
  type Market,
  type Rulebook,
  type RulebookStamp,
} from "../_shared/rule-engine.ts";
import { consumeQuota, dailyLimit, releaseQuota } from "../_shared/quota.ts";
import { loadRulebook } from "../_shared/rulebook.ts";
import { extrasToFields, type ScanExtras } from "../_shared/label-mapping.ts";
import { geminiUsage, openRouterUsage, recordUsage, type AIResult } from "../_shared/ai-usage.ts";
import { fallbackReason, mergeReads, type ScanRead } from "../_shared/scan-fallback.ts";

// The everyday reader, and the stronger model that re-reads a scan when
// the first read of a key field is low-confidence (e.g. small, dense
// ingredient lists). FALLBACK_MODEL=off turns the re-read off.
const PRIMARY_MODEL = Deno.env.get("PRIMARY_MODEL") || "~google/gemini-flash-latest";
const FALLBACK_MODEL = Deno.env.get("FALLBACK_MODEL") || "anthropic/claude-sonnet-5.5";

// Free scans per person per day (by IP and by lead email). Set
// SCAN_DAILY_LIMIT to change it; 0 turns the limit off.
const SCAN_LIMIT = dailyLimit("SCAN_DAILY_LIMIT", 3);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a product label reader. Your job is to read and transcribe what is printed on the packaging — not to judge whether it is compliant; that is decided separately by deterministic rules from the text you return. Transcribe values exactly as printed (especially the full ingredient list and addresses): do not correct, summarise, translate or fill in anything you cannot read.

You receive one or more images of a single product's packaging — often different sides or faces of the same item (front, ingredients/nutrition panel, back-of-pack, base, etc), submitted together as one scan.

CRITICAL RULE: you may only report a field's status as "missing" if you have confirmed you can see the ENTIRE product packaging (all sides, the base, and the top/shoulder where applicable) across ALL submitted images combined. If you cannot see enough of the packaging to be sure, use "not_verified" instead — never guess "missing" from partial coverage. Getting this distinction right is the single most important part of your job: a false "missing" on a compliance tool causes real harm to a business relying on it.

Your job:
1. Assess image coverage first, across ALL submitted images together — not per image. Consider the packaging's shape (bottle, jar, tube, aerosol can, box, pouch, etc.) and judge what fraction of its surface is visible when you combine everything shown across every image. Cylindrical or wraparound packaging (cans, bottles, tubes, jars) almost always has information on faces not visible from a single angle — assume coverage is INCOMPLETE unless the combined images clearly show every panel (front, back, base, and any wraparound sides), or the packaging is flat and fully visible in one shot (e.g. a box photographed to show every panel at once).

2. Extract all visible text from every image (OCR). Treat all submitted images as one combined view of the same product — a field found in any one image counts as found; don't report a field as missing just because it wasn't in the first image if it's visible in another. Be thorough — examine every area including:
   - Near barcodes and QR codes (batch/lot numbers are often printed adjacent to or below barcodes)
   - Bottom edges and corners of the label
   - Small print areas
   - Back-of-pack panels
   - Regulatory information panels

3. Map the extracted text into the following fields. For each field, determine a FOUR-STATE status:
   - "verified" — clearly visible, extracted with high confidence, no ambiguity
   - "low_confidence" — detected but the text is unclear, blurry, partially obscured, or you're inferring it rather than reading it directly
   - "not_verified" — you cannot confirm this because the area where it would normally appear isn't visible in the submitted image
   - "missing" — ONLY if you've confirmed full packaging coverage (see the critical rule above) and the field is genuinely absent

Fields to extract:
- Product Name
- Ingredients (include both active and inactive ingredients if listed separately)
- Warnings
- Manufacturer / Responsible Person (also look for "Distributed by", "Manufactured by", "Made by" etc.)
- Country of Origin
- Batch / Lot Number (IMPORTANT: look near barcodes, at bottom of label, and in small print — often formatted as numeric codes like "30056090" or prefixed with "LOT", "Batch", "L:")
- Expiry / Best Before
- Allergens
- Net Quantity (weight, volume, count)
- Storage Instructions (also look for "Other information" sections)

4. Also report, in "extras" (transcribe, don't judge):
   - "function": the words on the pack that say what the product is or does (e.g. "Moisturising face cream", "Shampoo for dry hair"), or null if none.
   - "claims": every marketing claim printed on the pack, exactly as written (e.g. "Paraben free", "Dermatologically tested", "100% natural", "Hypoallergenic", "Vegan"). Empty list if none.
   - "languages": ISO 639-1 codes of every language the pack text is written in, excluding the ingredient list (e.g. ["en", "de", "fr"]).
   - "symbols": any of these symbols you can see: "hand_in_book" (an open book with a hand pointing at it), "pao" (open jar with a number and M), "e_mark" (℮), "hourglass" (best-before symbol). Empty list if none.

5. Detect the product category — one of: Cosmetic, Food, Beverage, Supplement, Household, Other.
   "Cosmetic" covers ALL personal care and cosmetic products — skincare, haircare (including hairsprays, shampoos, styling products), makeup, fragrance, oral care, personal-care aerosols, etc. Don't default to "Other" just because a product isn't facial skincare.

6. For each field with status other than "verified", provide a brief suggestedFix — phrase it according to WHY the field isn't verified:
   - "not_verified" (blocked by incomplete coverage): phrase it as a request for an ADDITIONAL IMAGE, not an instruction to add something to the label (e.g. "Capture an additional image showing the base or opposite side — batch/lot numbers are commonly printed separately from the main label.").
   - "missing" (confirmed absent after full coverage): phrase it as what needs to be ADDED to the label.
   - "low_confidence": phrase it as what would help clarify (e.g. re-take with better lighting/focus on that area).

You MUST respond with ONLY valid JSON matching this exact schema (no markdown, no code fences):
{
  "category": "string",
  "coverage": {
    "isComplete": boolean,
    "visibleAreas": ["string", ...],
    "missingAreas": ["string", ...],
    "note": "one plain-language sentence, e.g. 'Only the front label is visible; the base, top and opposite side were not captured.'"
  },
  "fields": [
    {
      "label": "string",
      "value": "string or null",
      "status": "verified | low_confidence | not_verified | missing",
      "suggestedFix": "string or null"
    }
  ],
  "extras": {
    "function": "string or null",
    "claims": ["string", ...],
    "languages": ["string", ...],
    "symbols": ["string", ...]
  }
}`;

class AIError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface ImageInput {
  mimeType: string;
  base64: string;
}

async function callOpenRouter(system: string, userText: string, images: ImageInput[], model: string): Promise<AIResult> {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) throw new Error("OPENROUTER_API_KEY is not configured");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://labelring.com",
      "X-Title": "Labelring",
    },
    body: JSON.stringify({
      // OpenRouter renamed its floating "always latest" aliases to a
      // leading-tilde form (verified against their live /api/v1/models
      // catalog) — the un-prefixed slug started returning
      // "is not a valid model ID" once this stopped being the direct
      // (and only working) path.
      model,
      // Ask OpenRouter to report what the call cost.
      usage: { include: true },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            ...images.map((img) => ({
              type: "image_url",
              image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
            })),
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenRouter error:", response.status, errorText);
    throw new AIError(response.status, `OpenRouter request failed (${response.status}): ${errorText.slice(0, 300)}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content in OpenRouter response");
  return { content, usage: openRouterUsage(json, model) };
}

async function callGemini(system: string, userText: string, images: ImageInput[]): Promise<AIResult> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not configured");

  const model = Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [
          {
            role: "user",
            parts: [
              { text: userText },
              ...images.map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.base64 } })),
            ],
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini error:", response.status, errorText);
    throw new AIError(response.status, `Gemini request failed (${response.status}): ${errorText.slice(0, 300)}`);
  }

  const json = await response.json();
  const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error("No content in Gemini response");
  return { content, usage: geminiUsage(json, model) };
}

async function callAI(system: string, userText: string, images: ImageInput[]): Promise<AIResult> {
  const provider = (Deno.env.get("AI_PROVIDER") || "openrouter").toLowerCase();
  if (provider === "gemini") return callGemini(system, userText, images);
  return callOpenRouter(system, userText, images, PRIMARY_MODEL);
}

const parseRead = (content: string): ScanRead => {
  const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Some models put a sentence before or after the JSON.
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw e;
  }
};

// Re-reads the scan with the stronger model when the first read hedged on
// a key field, and keeps the more certain read of each field. Any failure
// leaves the first read as it was. Every call is recorded with its cost.
async function withFallback(
  first: ScanRead,
  system: string,
  userText: string,
  images: ImageInput[],
  requestId: string
): Promise<ScanRead> {
  const reason = fallbackReason(first);
  const enabled = FALLBACK_MODEL.toLowerCase() !== "off" && !!Deno.env.get("OPENROUTER_API_KEY");
  if (!reason || !enabled) return first;

  const started = Date.now();
  try {
    const result = await callOpenRouter(system, userText, images, FALLBACK_MODEL);
    await recordUsage({
      functionName: "analyze-label",
      requestId,
      attempt: "fallback",
      usage: result.usage,
      fallbackReason: reason,
      latencyMs: Date.now() - started,
    });
    const { read, improved } = mergeReads(first, parseRead(result.content));
    return { ...read, reader: { fallback: { model: result.usage.model, reason, improved } } };
  } catch (e) {
    console.error("fallback read failed:", e);
    await recordUsage({
      functionName: "analyze-label",
      requestId,
      attempt: "fallback",
      usage: null,
      provider: "openrouter",
      model: FALLBACK_MODEL,
      fallbackReason: reason,
      error: e instanceof Error ? e.message : String(e),
      latencyMs: Date.now() - started,
    });
    return first;
  }
}

// Runs the deterministic rules over what the model read. Never fails the
// scan: if the rulebook can't be loaded the scan still returns its fields,
// just without rule findings.
async function applyRulebook(
  parsed: {
    category?: string;
    fields?: Array<{ label: string; value: string | null; status: string; suggestedFix?: string | null }>;
    extras?: ScanExtras;
  },
  markets: Market[],
  role: unknown,
  pack: unknown,
  countries: string[],
  coverageComplete: boolean
) {
  const scope = rulebookScopeForCategory(parsed.category);
  if (!scope || !Array.isArray(parsed.fields)) return { findings: [], rulebook: null };

  let rulebook: Rulebook | null;
  try {
    rulebook = await loadRulebook(scope);
  } catch (e) {
    console.error("rulebook load failed:", e);
    return { findings: [], rulebook: null };
  }
  if (!rulebook) return { findings: [], rulebook: null };

  const findings = evaluateRules(
    {
      // The extras (function, claims, languages, symbols) feed the rules
      // without being shown as fields.
      fields: [
        ...(parsed.fields as Parameters<typeof evaluateRules>[0]["fields"]),
        ...extrasToFields(parsed.extras, coverageComplete),
      ],
      category: parsed.category ?? "",
      markets,
      role: isRole(role) ? role : null,
      pack: isPackFormat(pack) ? pack : null,
      countries,
    },
    rulebook
  );

  // Where a rule covers a field the model confirmed absent, the fix comes
  // from the rule (tied to its source clause), not the model's own advice.
  parsed.fields = parsed.fields.map((f) => {
    if (f.status !== "missing") return f;
    const ruleFix = findings.find((r) => r.field === f.label && r.fix && r.status !== "pass")?.fix;
    return ruleFix ? { ...f, suggestedFix: ruleFix } : f;
  });

  const stamp: RulebookStamp = {
    scope: rulebook.scope,
    version: rulebook.version,
    status: rulebook.status,
    markets,
    pack: isPackFormat(pack) ? pack : null,
    countries,
    checkedAt: new Date().toISOString(),
  };
  return { findings, rulebook: stamp };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { images: rawImages, isSeasonal, seasonTag, markets: rawMarkets, role, pack, countries: rawCountries, signupId } = await req.json();
    const countries: string[] = Array.isArray(rawCountries)
      ? [...new Set(rawCountries.filter((c): c is string => typeof c === "string" && /^[A-Z]{2}$/.test(c)))]
      : [];
    const requestedMarkets: Market[] = Array.isArray(rawMarkets) ? [...new Set(rawMarkets.filter(isMarket))] : [];
    const markets = requestedMarkets.length ? requestedMarkets : DEFAULT_MARKETS;

    if (!Array.isArray(rawImages) || rawImages.length === 0) {
      return new Response(
        JSON.stringify({ error: "images (non-empty array) is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const quota = await consumeQuota(req, "scan", SCAN_LIMIT, signupId);
    if (!quota.allowed) {
      return new Response(
        JSON.stringify({
          code: "daily_limit",
          error: `You've used your ${quota.limit} free scans for today. Come back tomorrow, or book a label review with our team.`,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const seasonalAddendum = isSeasonal
      ? `\n\nSEASONAL / TEMPORARY SKU RISK MODE IS ACTIVE${seasonTag ? ` (tag: ${seasonTag})` : ""}.\nApply stricter scrutiny: be especially critical about (a) on-pack promotional claims and "limited edition" wording that must still meet labelling rules, (b) batch/lot codes — seasonal runs often skip these, (c) date markings (best-before / expiry) clearly visible, (d) allergen carry-over from shared seasonal production lines, (e) net quantity changes for promo packs / multipacks, (f) any temporary co-branding or partner logos that may need additional declarations. When in doubt, mark fields as "low_confidence" or "not_verified" rather than "verified" or "missing".`
      : "";

    // Detect mime type per image from its base64 header, default to jpeg
    const images: ImageInput[] = rawImages.map((img: { base64: string }) => {
      let mimeType = "image/jpeg";
      if (img.base64.startsWith("/9j/")) mimeType = "image/jpeg";
      else if (img.base64.startsWith("iVBOR")) mimeType = "image/png";
      else if (img.base64.startsWith("JVBER")) mimeType = "application/pdf";
      return { mimeType, base64: img.base64 };
    });

    const fileNames = rawImages.map((img: { fileName?: string }) => img.fileName || "unknown").join(", ");
    const userText =
      images.length > 1
        ? `Analyze these ${images.length} images together — they are different sides/faces of the same product's packaging, submitted as one scan. File names: ${fileNames}. Extract all fields and return JSON only.`
        : `Analyze this product label image. File name: ${fileNames}. Extract all fields and return JSON only.`;

    const system = SYSTEM_PROMPT + seasonalAddendum;
    // One id for this scan's AI calls; the frontend saves it with the scan.
    const requestId = crypto.randomUUID();
    const started = Date.now();
    let content: string;
    try {
      const result = await callAI(system, userText, images);
      content = result.content;
      await recordUsage({
        functionName: "analyze-label",
        requestId,
        attempt: "primary",
        usage: result.usage,
        latencyMs: Date.now() - started,
      });
    } catch (e) {
      await recordUsage({
        functionName: "analyze-label",
        requestId,
        attempt: "primary",
        usage: null,
        provider: (Deno.env.get("AI_PROVIDER") || "openrouter").toLowerCase(),
        model: PRIMARY_MODEL,
        error: e instanceof Error ? e.message : String(e),
        latencyMs: Date.now() - started,
      });
      // The person got nothing for this scan, so don't count it.
      await releaseQuota("scan", quota);
      if (e instanceof AIError) {
        if (e.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (e.status === 402) {
          return new Response(
            JSON.stringify({ error: "AI credits exhausted. Please add funds." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ error: e.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw e;
    }

    // Parse the JSON from the AI response (strip markdown fences if present)
    // deno-lint-ignore no-explicit-any
    let parsed: any;
    try {
      parsed = parseRead(content);
    } catch {
      await releaseQuota("scan", quota);
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse AI analysis result");
    }

    parsed = await withFallback(parsed, system, userText, images, requestId);
    parsed.aiRequestId = requestId;

    // Critical rule enforcement — defense in depth alongside the client's
    // own enforcement in buildScanResult(): a false "missing" must never
    // leave this function, even if the model didn't follow instructions.
    const coverageComplete = parsed?.coverage?.isComplete === true;
    if (!parsed?.coverage) {
      parsed.coverage = {
        isComplete: false,
        visibleAreas: [],
        missingAreas: [],
        note: "Coverage could not be assessed for this image.",
      };
    }
    if (!coverageComplete && Array.isArray(parsed.fields)) {
      parsed.fields = parsed.fields.map((f: { status?: string }) =>
        f?.status === "missing" ? { ...f, status: "not_verified" } : f
      );
    }

    const { findings, rulebook } = await applyRulebook(parsed, markets, role, pack, countries, coverageComplete);
    parsed.findings = findings;
    parsed.rulebook = rulebook;

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-label error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
