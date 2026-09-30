// Edge function: AI helper for the label generator.
// Modes:
//   - "field":   suggest a value for a single field given current context
//   - "preview": compose the on-pack copy block from current fields
// Packs: "food" (UK FIC), "cosmetic" (INCI/CPNP), "generic".

import { consumeQuota, dailyLimit, releaseQuota } from "../_shared/quota.ts";

// Generous: the preview regenerates as people type. This only stops abuse.
const GENERATE_LIMIT = dailyLimit("GENERATE_DAILY_LIMIT", 200);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// OpenRouter renamed its floating "always latest" aliases to a
// leading-tilde form (verified against their live /api/v1/models
// catalog) — the un-prefixed slug returns "is not a valid model ID".
const MODEL = "~google/gemini-flash-latest";

type Pack = "food" | "cosmetic" | "generic";

interface NutritionTable {
  energyKj?: string;
  energyKcal?: string;
  fat?: string;
  saturates?: string;
  carbs?: string;
  sugars?: string;
  protein?: string;
  salt?: string;
}

interface FieldsIn {
  brandName?: string;
  productName?: string;
  category?: string;
  ingredients?: string;
  allergens?: string;
  countryOfOrigin?: string;
  netQuantity?: string;
  batchNumber?: string;
  bestBefore?: string;
  responsiblePerson?: string;
  certifications?: string;
  dateType?: "use_by" | "best_before" | "pao" | "durability" | "";
  storageInstructions?: string;
  quidPercent?: string;
  alcoholAbv?: string;
  nutrition?: NutritionTable;
  packagedProtectiveAtmosphere?: boolean;
  nano?: boolean;
  irradiated?: boolean;
  paoMonths?: string;
  fragranceAllergens?: string[];
  cosmeticProductType?: "leave_on" | "rinse_off" | "";
  instructionsForUse?: string;
}

// ---------------------------------------------------------------
// Per-pack field instructions
//
// Only wording is suggested. Product facts — ingredients, allergens,
// quantities, dates, batch codes, addresses, origin, nutrition, QUID,
// ABV, PAO, certifications — must come from the brand; an invented value
// printed on a label is a liability, so those fields are refused here.
// ---------------------------------------------------------------
const NO_INVENTED_FACTS =
  "Use only facts given in the label context; never invent ingredients, quantities, temperatures, durations, claims or certifications that aren't there.";

const FOOD_FIELDS: Record<string, string> = {
  brandName: "Suggest a plausible UK food brand name that fits the category. Return ONLY the name.",
  productName: "Suggest a concise, marketable UK food product name (max 6 words) that doesn't imply ingredients the context doesn't list. Return ONLY the name.",
  storageInstructions: `Suggest clear wording for storage instructions for this product type. ${NO_INVENTED_FACTS} If a specific temperature or shelf life isn't in the context, use a placeholder like [temperature] for the brand to fill in. Return ONLY the instruction text.`,
};

const COSMETIC_FIELDS: Record<string, string> = {
  brandName: "Suggest a plausible skincare/cosmetic brand name. Return ONLY the name.",
  productName: "Suggest a concise, marketable cosmetic product name (max 6 words) that doesn't imply ingredients or effects the context doesn't support. Return ONLY the name.",
  storageInstructions: `Suggest clear wording for storage instructions for this product type. ${NO_INVENTED_FACTS} If a specific temperature isn't in the context, use a placeholder like [temperature]. Return ONLY the text.`,
  instructionsForUse: `Suggest clear wording for instructions for use and general precautions for this product type (e.g. 'For external use only. Avoid contact with eyes.'). ${NO_INVENTED_FACTS} Do not state ingredient-specific warnings — those come from the product's safety assessment. Return ONLY the text.`,
};

const GENERIC_FIELDS: Record<string, string> = {
  brandName: COSMETIC_FIELDS.brandName,
  productName: COSMETIC_FIELDS.productName,
  storageInstructions: COSMETIC_FIELDS.storageInstructions,
};

function pickFieldMap(pack: Pack): Record<string, string> {
  if (pack === "food") return FOOD_FIELDS;
  if (pack === "cosmetic") return COSMETIC_FIELDS;
  return GENERIC_FIELDS;
}

function contextBlock(fields: FieldsIn, pack: Pack): string {
  const lines: string[] = [`Regulatory pack: ${pack.toUpperCase()}`];
  if (fields.category) lines.push(`Category: ${fields.category}`);
  if (fields.brandName) lines.push(`Brand: ${fields.brandName}`);
  if (fields.productName) lines.push(`Product: ${fields.productName}`);
  if (fields.ingredients) lines.push(`Ingredients: ${fields.ingredients}`);
  if (fields.allergens) lines.push(`Allergens: ${fields.allergens}`);
  if (fields.cosmeticProductType)
    lines.push(
      `Product type: ${fields.cosmeticProductType === "leave_on" ? "Leave-on" : "Rinse-off"}`
    );
  if (fields.fragranceAllergens && fields.fragranceAllergens.length)
    lines.push(`Fragrance allergens present: ${fields.fragranceAllergens.join(", ")}`);
  if (fields.quidPercent) lines.push(`QUID: ${fields.quidPercent}`);
  if (fields.countryOfOrigin) lines.push(`Origin: ${fields.countryOfOrigin}`);
  if (fields.netQuantity) lines.push(`Net quantity: ${fields.netQuantity}`);
  if (fields.alcoholAbv) lines.push(`Alcohol: ${fields.alcoholAbv}`);
  if (fields.dateType === "use_by" || fields.dateType === "best_before") {
    if (fields.bestBefore)
      lines.push(
        `${fields.dateType === "use_by" ? "Use by" : "Best before"}: ${fields.bestBefore}`
      );
  } else if (fields.dateType === "pao") {
    if (fields.paoMonths) lines.push(`Period-After-Opening: ${fields.paoMonths}M`);
  } else if (fields.dateType === "durability") {
    if (fields.bestBefore) lines.push(`Minimum durability date: ${fields.bestBefore}`);
  } else if (fields.bestBefore) {
    lines.push(`Date: ${fields.bestBefore}`);
  }
  if (fields.batchNumber) lines.push(`Batch/Lot: ${fields.batchNumber}`);
  if (fields.storageInstructions) lines.push(`Storage: ${fields.storageInstructions}`);
  if (fields.instructionsForUse) lines.push(`Instructions for use: ${fields.instructionsForUse}`);
  if (fields.responsiblePerson) lines.push(`FBO / Responsible person: ${fields.responsiblePerson}`);
  if (fields.certifications) lines.push(`Certifications: ${fields.certifications}`);
  if (fields.packagedProtectiveAtmosphere) lines.push("Packaged in a protective atmosphere.");
  if (fields.nano) lines.push("Contains engineered nanomaterials.");
  if (fields.irradiated) lines.push("Treated with ionising radiation.");
  if (fields.nutrition && Object.keys(fields.nutrition).length > 0) {
    const n = fields.nutrition;
    lines.push(
      `Nutrition per 100g — Energy: ${n.energyKj || "?"}kJ / ${n.energyKcal || "?"}kcal, Fat: ${n.fat || "?"} (Saturates: ${n.saturates || "?"}), Carbohydrate: ${n.carbs || "?"} (Sugars: ${n.sugars || "?"}), Protein: ${n.protein || "?"}, Salt: ${n.salt || "?"}`
    );
  }
  return lines.length ? lines.join("\n") : "(no data yet)";
}

// ---------------------------------------------------------------
// Preview prompts per pack
// ---------------------------------------------------------------
const FOOD_PREVIEW_SYSTEM = `You compose the on-pack copy block for a UK pre-packed food label following the UK Food Information for Consumers (FIC) regulations. Return clean plain text (no markdown, no code fences).

Structure exactly in this order, skipping any section with no data:

=== FIELD OF VISION ===
PRODUCT NAME (uppercase, bold effect via caps)
Net quantity | ABV (if drink over 1.2%)

INGREDIENTS: comma-separated in descending order of weight. EMPHASISE any of the 14 UK allergens in ALL CAPS wherever they appear. Include (%) QUID after the ingredient name where required.

ALLERGENS: brief allergen advice sentence if not already obvious.

USE BY: date  OR  BEST BEFORE: date   (use the label the FBO chose; 'Use by' means a safety date)
BATCH / LOT: code

STORAGE: instructions (mandatory if 'Use by')
COUNTRY OF ORIGIN: country

NUTRITION (per 100g):
Energy: X kJ / Y kcal
Fat: Xg   of which saturates: Xg
Carbohydrate: Xg   of which sugars: Xg
Protein: Xg
Salt: Xg

WARNINGS: only the regulatory phrases that apply (aspartame, liquorice, caffeine, polyols, sweeteners, plant sterols). One per line.

RESPONSIBLE FBO: name and full UK address (must include a UK postcode).

CERTIFICATIONS: comma-separated.

Rules:
- British English.
- No markdown, no emojis, no fabricated data.
- If a field is empty, drop the whole line.
- Keep spacing tight and retail-ready.`;

const COSMETIC_PREVIEW_SYSTEM = `You compose the on-pack copy block for a UK cosmetic product. Return clean plain text (no markdown).
Line 1: PRODUCT NAME (uppercase, brand line underneath if provided).
Then labelled sections, each on its own paragraph, skipping empties:
- Ingredients (INCI): ...
- Fragrance allergens: only list allergens supplied in the context, and only if a product type/threshold was given. If none supplied, omit this line.
- Nominal content: ...
- PAO (Period-After-Opening) or minimum durability date: use whichever was supplied in the context.
- Instructions for use / precautions: ...
- Batch: ...
- Country of origin: ...
- Responsible person: ...
- Certifications: ...
British English. Concise, factual, retail-ready. Never invent fragrance allergens or a shelf-life type that wasn't supplied.`;

const GENERIC_PREVIEW_SYSTEM = COSMETIC_PREVIEW_SYSTEM;

function pickPreviewSystem(pack: Pack): string {
  if (pack === "food") return FOOD_PREVIEW_SYSTEM;
  if (pack === "cosmetic") return COSMETIC_PREVIEW_SYSTEM;
  return GENERIC_PREVIEW_SYSTEM;
}

async function callOpenRouter(system: string, user: string) {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) throw new Error("OPENROUTER_API_KEY not configured");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://labelring.com",
      "X-Title": "Labelring",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("OpenRouter error", res.status, t);
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 402) throw new Error("CREDITS");
    throw new Error(`OpenRouter request failed (${res.status}): ${t.slice(0, 300)}`);
  }
  const json = await res.json();
  return (json.choices?.[0]?.message?.content ?? "").trim();
}

async function callGemini(system: string, user: string) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY not configured");
  const model = Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
      }),
    }
  );
  if (!res.ok) {
    const t = await res.text();
    console.error("Gemini error", res.status, t);
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 402) throw new Error("CREDITS");
    throw new Error(`Gemini request failed (${res.status}): ${t.slice(0, 300)}`);
  }
  const json = await res.json();
  return (json.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
}

async function callAI(system: string, user: string) {
  const provider = (Deno.env.get("AI_PROVIDER") || "openrouter").toLowerCase();
  if (provider === "gemini") return callGemini(system, user);
  return callOpenRouter(system, user);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let quota: Awaited<ReturnType<typeof consumeQuota>> | null = null;
  try {
    const body = await req.json();
    quota = await consumeQuota(req, "generate", GENERATE_LIMIT, body.signupId);
    if (!quota.allowed) {
      return new Response(
        JSON.stringify({ code: "daily_limit", error: "Daily limit reached for AI suggestions. Try again tomorrow." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const mode = body.mode as "field" | "preview";
    const fields: FieldsIn = body.fields ?? {};
    const pack: Pack = (body.pack as Pack) || "generic";

    if (mode === "field") {
      const field = String(body.field ?? "");
      const map = pickFieldMap(pack);
      const instr = map[field];
      if (!instr) {
        return new Response(JSON.stringify({ error: "Suggestions are only available for wording, not product facts" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const system = `You are a product-label copywriter. ${instr} No quotes, no markdown, no explanations.`;
      const user = `Current label context:\n${contextBlock(fields, pack)}\n\nSuggest a value for: ${field}`;
      const value = (await callAI(system, user))
        .replace(/^```(?:json)?\s*|\s*```$/g, "")
        .replace(/^["'`]+|["'`]+$/g, "")
        .replace(/^\s*[-•]\s*/, "")
        .trim();
      return new Response(JSON.stringify({ value }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode === "preview") {
      const system = pickPreviewSystem(pack);
      const user = `Compose the on-pack copy block for this label:\n${contextBlock(fields, pack)}`;
      const preview = await callAI(system, user);
      return new Response(JSON.stringify({ preview }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown mode" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (quota) await releaseQuota("generate", quota);
    const msg = e instanceof Error ? e.message : "Unknown error";
    const status = msg === "RATE_LIMIT" ? 429 : msg === "CREDITS" ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
