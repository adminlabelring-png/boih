// Deterministic label checks driven by the versioned rulebook
// (public.rulebook_versions / rules / substances).
//
// The vision model only reads the pack and reports what it saw per field
// (verified / low_confidence / not_verified / missing). Whether that is
// compliant is decided here, from rule data that links to its source
// clause and carries a human sign-off.
//
// Pure TypeScript with no imports: loaded by the analyze-label edge
// function (Deno) and by the frontend/vitest (Node) alike.

export type Market = "GB" | "NI" | "EU";
export type Severity = "legal" | "best_practice";
export type FindingStatus = "fail" | "review" | "not_verified" | "pass";
export type VerificationStatus = "unverified" | "verified" | "rejected";
export type Role = "manufacturer" | "importer" | "distributor";

export type CheckType =
  | "present"
  | "present_if_applicable"
  | "present_with_unit"
  | "address_in_market"
  | "date_or_pao"
  | "ingredient_list"
  | "fragrance_allergens"
  | "prohibited_substances"
  | "advisory";

export interface RuleSource {
  market: Market;
  title: string;
  url: string;
  clause: string;
}

export interface Rule {
  rule_key: string;
  title: string;
  product_scope: string;
  markets: Market[];
  field: string | null;
  check_type: CheckType;
  params: Record<string, unknown>;
  severity: Severity;
  explanation: string;
  fix_hint: string | null;
  sources: RuleSource[];
  verification_status: VerificationStatus;
}

export interface Substance {
  list_type: "fragrance_allergen" | "prohibited";
  inci_name: string;
  synonyms: string[];
  markets: Market[];
  verification_status: VerificationStatus;
}

export interface Rulebook {
  scope: "cosmetics";
  version: string;
  status: "draft" | "published";
  rules: Rule[];
  substances: Substance[];
}

export interface ExtractedField {
  label: string;
  value: string | null;
  status: "verified" | "low_confidence" | "not_verified" | "missing";
}

export interface RuleFinding {
  ruleKey: string;
  title: string;
  severity: Severity;
  status: FindingStatus;
  reason: string;
  fix: string | null;
  field: string | null;
  markets: Market[];
  sources: RuleSource[];
  // Whether a qualified reviewer has signed this rule off.
  verified: boolean;
}

export interface RulebookStamp {
  scope: string;
  version: string;
  status: "draft" | "published";
  markets: Market[];
  checkedAt: string;
}

export interface EvaluationInput {
  fields: ExtractedField[];
  category: string;
  markets: Market[];
  role?: Role | null;
}

export const ALL_MARKETS: Market[] = ["GB", "NI", "EU"];
export const DEFAULT_MARKETS: Market[] = ["GB"];

export const isMarket = (m: unknown): m is Market =>
  typeof m === "string" && (ALL_MARKETS as string[]).includes(m);

export const isRole = (r: unknown): r is Role =>
  r === "manufacturer" || r === "importer" || r === "distributor";

// Which rulebook (if any) covers a scan's detected category. Only cosmetics
// has a rulebook so far; everything else gets no rule findings.
export const rulebookScopeForCategory = (category: string | null | undefined): "cosmetics" | null => {
  const c = (category ?? "").trim().toLowerCase();
  return c === "cosmetic" || c === "cosmetics" || c === "skincare" ? "cosmetics" : null;
};

// ------------------------------------------------------------------
// Text helpers
// ------------------------------------------------------------------

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Case-insensitive whole-term match, so "Citral" doesn't match inside
// "Citronellol" and "Benzyl Alcohol" doesn't match inside a longer name.
const containsTerm = (haystack: string, term: string): boolean =>
  new RegExp(`(^|[^a-z0-9])${escapeRegExp(term.toLowerCase())}($|[^a-z0-9])`, "i").test(
    haystack.toLowerCase()
  );

const UK_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;
const NI_POSTCODE = /\bBT\d{1,2}\s*\d[A-Z]{2}\b/i;

// EU member states in English plus common native spellings.
const EU_COUNTRY_NAMES = [
  "austria", "österreich", "belgium", "belgique", "belgië", "bulgaria", "croatia", "hrvatska",
  "cyprus", "czech republic", "czechia", "česká republika", "denmark", "danmark", "estonia",
  "eesti", "finland", "suomi", "france", "germany", "deutschland", "greece", "hellas", "hungary",
  "magyarország", "ireland", "éire", "italy", "italia", "latvia", "latvija", "lithuania",
  "lietuva", "luxembourg", "malta", "netherlands", "the netherlands", "nederland", "holland",
  "poland", "polska", "portugal", "romania", "românia", "slovakia", "slovensko", "slovenia",
  "slovenija", "spain", "españa", "sweden", "sverige",
];

const mentionsEuCountry = (value: string): boolean => {
  // "Northern Ireland" is in the UK, not the Republic of Ireland.
  const v = value.toLowerCase().replace(/northern\s+ireland/g, "");
  return EU_COUNTRY_NAMES.some((c) => containsTerm(v, c));
};

const METRIC_UNIT = /\d\s*(mg|g|kg|ml|cl|l)\b/i;
const PAO = /\b\d{1,2}\s?(m|months?)\b|\bpao\b/i;
const DATE_LIKE =
  /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{1,2}[/.-]\d{4}\b|\b\d{4}[/.-]\d{1,2}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{2,4}\b|best (used )?before|\bexp(iry)?\b|\bbbe\b/i;

const splitIngredients = (value: string): string[] =>
  value
    .replace(/^\s*ingredients?\s*[:.-]?\s*/i, "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);

// ------------------------------------------------------------------
// Checks
// ------------------------------------------------------------------

type CheckOutcome = { status: Exclude<FindingStatus, "not_verified">; reason: string } | null;

interface CheckContext {
  rule: Rule;
  value: string;
  markets: Market[];
  role: Role | null;
  substances: Substance[];
}

const inMarkets = (itemMarkets: Market[], markets: Market[]) =>
  itemMarkets.some((m) => markets.includes(m));

const checks: Record<CheckType, (ctx: CheckContext) => CheckOutcome> = {
  present: ({ value }) => ({ status: "pass", reason: `Found: ${value}` }),

  present_if_applicable: ({ value }) => ({ status: "pass", reason: `Found: ${value}` }),

  present_with_unit: ({ value }) =>
    METRIC_UNIT.test(value)
      ? { status: "pass", reason: `Found: ${value}` }
      : { status: "review", reason: `"${value}" has no metric unit (g or ml).` },

  address_in_market: ({ rule, value }) => {
    const market = rule.params.market as Market;
    if (market === "GB") {
      return UK_POSTCODE.test(value)
        ? { status: "pass", reason: "UK address found." }
        : { status: "review", reason: "No UK postcode found in the Responsible Person address." };
    }
    if (market === "EU") {
      return mentionsEuCountry(value)
        ? { status: "pass", reason: "EU address found." }
        : { status: "review", reason: "No EU member state found in the Responsible Person address." };
    }
    return NI_POSTCODE.test(value) || mentionsEuCountry(value)
      ? { status: "pass", reason: "Northern Ireland or EU address found." }
      : {
          status: "review",
          reason: "No Northern Ireland (BT) postcode or EU member state found in the Responsible Person address.",
        };
  },

  date_or_pao: ({ value }) =>
    PAO.test(value) || DATE_LIKE.test(value)
      ? { status: "pass", reason: `Found: ${value}` }
      : { status: "review", reason: `"${value}" doesn't look like a date or a PAO period (e.g. 12M).` },

  ingredient_list: ({ value }) =>
    splitIngredients(value).length >= 2
      ? { status: "pass", reason: `${splitIngredients(value).length} ingredients listed.` }
      : { status: "review", reason: "The ingredient list looks incomplete." },

  fragrance_allergens: ({ rule, value, markets, substances }) => {
    const allergens = substances.filter(
      (s) => s.list_type === "fragrance_allergen" && inMarkets(s.markets, markets)
    );
    const named = allergens.filter((s) =>
      [s.inci_name, ...s.synonyms].some((n) => containsTerm(value, n))
    );
    const namedLower = new Set(named.map((s) => s.inci_name.toLowerCase()));

    const sources = (rule.params.natural_sources ?? {}) as Record<string, string[]>;
    const undeclared = new Map<string, string[]>();
    for (const [source, implied] of Object.entries(sources)) {
      if (!containsTerm(value, source)) continue;
      const missing = implied.filter((a) => !namedLower.has(a.toLowerCase()));
      if (missing.length) undeclared.set(source, missing);
    }

    const markers = (rule.params.fragrance_markers ?? []) as string[];
    const hasFragrance = markers.some((m) => containsTerm(value, m));

    if (undeclared.size > 0) {
      const detail = [...undeclared.entries()]
        .map(([src, a]) => `${src} (${a.join(", ")})`)
        .join("; ");
      return {
        status: "review",
        reason: `Contains ingredients that naturally carry fragrance allergens not named on the label: ${detail}. These must be declared if above the threshold.`,
      };
    }
    if (hasFragrance && named.length === 0) {
      return {
        status: "review",
        reason: "Contains fragrance but no fragrance allergens are named. Confirm with your supplier's allergen statement.",
      };
    }
    return {
      status: "pass",
      reason: named.length
        ? `Declared: ${named.map((s) => s.inci_name).join(", ")}.`
        : "No fragrance or allergen-bearing essential oils listed.",
    };
  },

  prohibited_substances: ({ value, markets, substances }) => {
    const prohibited = substances.filter(
      (s) => s.list_type === "prohibited" && inMarkets(s.markets, markets)
    );
    const found = prohibited.filter((s) =>
      [s.inci_name, ...s.synonyms].some((n) => containsTerm(value, n))
    );
    return found.length
      ? { status: "fail", reason: `Contains a prohibited substance: ${found.map((s) => s.inci_name).join(", ")}.` }
      : {
          status: "pass",
          reason: `None of the ${prohibited.length} prohibited substances in this rulebook were found. This is not a full Annex II screen.`,
        };
  },

  advisory: ({ rule, value }) => {
    const triggers = rule.params.only_if_any as string[] | undefined;
    if (triggers && value && !triggers.some((t) => value.toLowerCase().includes(t.toLowerCase()))) {
      return null;
    }
    return { status: "review", reason: rule.explanation };
  },
};

// ------------------------------------------------------------------
// Evaluation
// ------------------------------------------------------------------

const STATUS_ORDER: Record<FindingStatus, number> = { fail: 0, review: 1, not_verified: 2, pass: 3 };
const SEVERITY_ORDER: Record<Severity, number> = { legal: 0, best_practice: 1 };

// Legal requirements first, then best practice; within each, the things
// that need action first.
export const rankFindings = (findings: RuleFinding[]): RuleFinding[] =>
  [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      a.title.localeCompare(b.title)
  );

const evaluateRule = (
  rule: Rule,
  fieldsByLabel: Map<string, ExtractedField>,
  markets: Market[],
  role: Role | null,
  substances: Substance[]
): RuleFinding | null => {
  const applicableMarkets = rule.markets.filter((m) => markets.includes(m));
  const sources = rule.sources.filter((s) => applicableMarkets.includes(s.market));
  const base = {
    ruleKey: rule.rule_key,
    title: rule.title,
    severity: rule.severity,
    field: rule.field,
    markets: applicableMarkets,
    sources: sources.length ? sources : rule.sources,
    verified: rule.verification_status === "verified",
  };
  const finding = (status: FindingStatus, reason: string, fix: string | null): RuleFinding => ({
    ...base,
    status,
    reason,
    fix,
  });

  const field = rule.field ? fieldsByLabel.get(rule.field) : undefined;
  const value = field?.value?.trim() ?? "";

  // Advisories don't need the field to be readable.
  if (rule.check_type === "advisory") {
    const outcome = checks.advisory({ rule, value, markets, role, substances });
    return outcome ? finding(outcome.status, outcome.reason, rule.fix_hint) : null;
  }

  if (!field || field.status === "not_verified" || (!value && field.status !== "missing")) {
    return finding(
      "not_verified",
      `${rule.field ?? "This information"} wasn't visible in the images, so this couldn't be checked.`,
      `Add a photo of the side of the pack showing ${(rule.field ?? "this information").toLowerCase()}.`
    );
  }

  if (field.status === "missing") {
    if (rule.check_type === "present_if_applicable") {
      return finding("review", `Not found on the pack. ${rule.explanation}`, rule.fix_hint);
    }
    if (rule.params.required_when === "imported" && role !== "importer") {
      return finding(
        "review",
        role
          ? `Not found on the pack. Only required for imported products; you told us you're the ${role}.`
          : "Not found on the pack. Required if the product is imported.",
        rule.fix_hint
      );
    }
    return finding("fail", `Not found on the pack. ${rule.explanation}`, rule.fix_hint);
  }

  const outcome = checks[rule.check_type]({ rule, value, markets, role, substances });
  if (!outcome) return null;

  if (field.status === "low_confidence") {
    return finding(
      outcome.status === "fail" ? "fail" : "review",
      `${outcome.reason} (Read with low confidence; confirm on the pack.)`,
      rule.fix_hint
    );
  }
  return finding(outcome.status, outcome.reason, outcome.status === "pass" ? null : rule.fix_hint);
};

export const evaluateRules = (input: EvaluationInput, rulebook: Rulebook): RuleFinding[] => {
  if (rulebookScopeForCategory(input.category) !== rulebook.scope) return [];

  const markets = input.markets.length ? input.markets : DEFAULT_MARKETS;
  const role = input.role ?? null;
  const fieldsByLabel = new Map(input.fields.map((f) => [f.label, f]));
  const substances = rulebook.substances.filter((s) => s.verification_status !== "rejected");

  const findings = rulebook.rules
    .filter((r) => r.verification_status !== "rejected")
    .filter((r) => r.markets.some((m) => markets.includes(m)))
    .map((r) => evaluateRule(r, fieldsByLabel, markets, role, substances))
    .filter((f): f is RuleFinding => f !== null);

  return rankFindings(findings);
};
