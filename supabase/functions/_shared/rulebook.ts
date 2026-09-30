// Loads the current rulebook for a scope (Deno only): the published
// version if there is one, otherwise the latest draft (whose results the
// app labels provisional).

import type { Rulebook, Substance } from "./rule-engine.ts";
import { serviceClient } from "./quota.ts";

// The rulebook changes rarely (a new version is a reviewed, published
// event), so cache it per warm instance rather than query on every call.
const RULEBOOK_TTL_MS = 5 * 60 * 1000;
const rulebookCache = new Map<string, { at: number; rulebook: Rulebook | null }>();

const SUBSTANCE_COLUMNS =
  "list_type, inci_name, synonyms, markets, verification_status, jurisdiction, annex_ref, chemical_name, " +
  "match_terms, colour_index, product_type, max_concentration, other_conditions, label_warnings, " +
  "applies_from, sell_through_until";

// The official annexes run to thousands of entries; the API returns at
// most 1,000 rows per request.
async function loadSubstances(db: ReturnType<typeof serviceClient>, versionId: string): Promise<Substance[]> {
  const pageSize = 1000;
  const all: Substance[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("substances")
      .select(SUBSTANCE_COLUMNS)
      .eq("rulebook_version_id", versionId)
      .neq("verification_status", "rejected")
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    all.push(...((data ?? []) as unknown as Substance[]));
    if (!data || data.length < pageSize) return all;
  }
}

export async function loadRulebook(scope: "cosmetics"): Promise<Rulebook | null> {
  const cached = rulebookCache.get(scope);
  if (cached && Date.now() - cached.at < RULEBOOK_TTL_MS) return cached.rulebook;

  const db = serviceClient();

  const { data: versions, error: vErr } = await db
    .from("rulebook_versions")
    .select("id, version, status, created_at")
    .eq("scope", scope)
    .in("status", ["published", "draft"])
    .order("created_at", { ascending: false });
  if (vErr) throw vErr;

  const current =
    versions?.find((v) => v.status === "published") ?? versions?.find((v) => v.status === "draft");
  if (!current) {
    rulebookCache.set(scope, { at: Date.now(), rulebook: null });
    return null;
  }

  const [rules, substances] = await Promise.all([
    db
      .from("rules")
      .select("rule_key, title, product_scope, markets, field, check_type, params, severity, explanation, fix_hint, sources, verification_status")
      .eq("rulebook_version_id", current.id),
    loadSubstances(db, current.id),
  ]);
  if (rules.error) throw rules.error;

  const rulebook: Rulebook = {
    scope,
    version: current.version,
    status: current.status,
    rules: rules.data ?? [],
    substances,
  };
  rulebookCache.set(scope, { at: Date.now(), rulebook });
  return rulebook;
}
