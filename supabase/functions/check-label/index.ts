// Edge function: checks a label draft from the label builder against the
// current rulebook — the same deterministic rules a scanned label gets.
// No AI involved. Only cosmetics has a rulebook so far; other categories
// get no findings.

import {
  DEFAULT_MARKETS,
  evaluateRules,
  isMarket,
  isPackFormat,
  isProductType,
  isRole,
  rulebookScopeForCategory,
  type Market,
  type RulebookStamp,
} from "../_shared/rule-engine.ts";
import { draftToExtracted, type LabelDraft } from "../_shared/label-mapping.ts";
import { loadRulebook } from "../_shared/rulebook.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { draft, category, markets: rawMarkets, role, pack, productType: rawType, countries: rawCountries } = await req.json();
    const productType = isProductType(rawType) ? rawType : null;
    // The builder's leave-on / rinse-off answer.
    const exposureAnswer = (draft as LabelDraft | undefined)?.cosmeticProductType;
    const exposure = exposureAnswer === "leave_on" || exposureAnswer === "rinse_off" ? exposureAnswer : null;
    const countries: string[] = Array.isArray(rawCountries)
      ? [...new Set(rawCountries.filter((c): c is string => typeof c === "string" && /^[A-Z]{2}$/.test(c)))]
      : [];
    const requested: Market[] = Array.isArray(rawMarkets) ? [...new Set(rawMarkets.filter(isMarket))] : [];
    const markets = requested.length ? requested : DEFAULT_MARKETS;

    const scope = rulebookScopeForCategory(typeof category === "string" ? category : "");
    if (!scope) return json({ findings: [], rulebook: null });

    const rulebook = await loadRulebook(scope);
    if (!rulebook) return json({ findings: [], rulebook: null });

    const findings = evaluateRules(
      {
        fields: draftToExtracted((draft ?? {}) as LabelDraft),
        category,
        markets,
        role: isRole(role) ? role : null,
        pack: isPackFormat(pack) ? pack : null,
        countries,
        productType,
        exposure,
      },
      rulebook
    );
    const stamp: RulebookStamp = {
      scope: rulebook.scope,
      version: rulebook.version,
      status: rulebook.status,
      markets,
      pack: isPackFormat(pack) ? pack : null,
      productType,
      productTypeSource: productType ? "chosen" : null,
      exposure,
      countries,
      checkedAt: new Date().toISOString(),
    };
    return json({ findings, rulebook: stamp });
  } catch (e) {
    console.error("check-label error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
