// Loads the current rulebook for a scope (Deno only): the published
// version if there is one, otherwise the latest draft (whose results the
// app labels provisional).

import type { Rulebook } from "./rule-engine.ts";
import { serviceClient } from "./quota.ts";

// The rulebook changes rarely (a new version is a reviewed, published
// event), so cache it per warm instance rather than query on every call.
const RULEBOOK_TTL_MS = 5 * 60 * 1000;
const rulebookCache = new Map<string, { at: number; rulebook: Rulebook | null }>();

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
    db
      .from("substances")
      .select("list_type, inci_name, synonyms, markets, verification_status")
      .eq("rulebook_version_id", current.id),
  ]);
  if (rules.error) throw rules.error;
  if (substances.error) throw substances.error;

  const rulebook: Rulebook = {
    scope,
    version: current.version,
    status: current.status,
    rules: rules.data ?? [],
    substances: substances.data ?? [],
  };
  rulebookCache.set(scope, { at: Date.now(), rulebook });
  return rulebook;
}
