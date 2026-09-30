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
  | "restricted_substances"
  | "colourants"
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

export type SubstanceList =
  | "fragrance_allergen"
  | "prohibited"
  | "restricted"
  | "colourant"
  | "preservative"
  | "uv_filter";

export interface Substance {
  list_type: SubstanceList;
  inci_name: string;
  // Other official names (INCI, chemical names, CI numbers).
  synonyms: string[];
  markets: Market[];
  verification_status: VerificationStatus;
  // Official annex entries (null/absent for hand-entered rows).
  jurisdiction?: "GB" | "EU" | null;
  annex_ref?: string | null;
  chemical_name?: string | null;
  // Names derived from the official ones ("X" from "X and its salts"):
  // a match only ever asks for a check.
  match_terms?: string[];
  colour_index?: string[];
  product_type?: string | null;
  max_concentration?: string | null;
  other_conditions?: string | null;
  label_warnings?: string | null;
  applies_from?: string | null;
  sell_through_until?: string | null;
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
  // For date-dependent entries (e.g. new allergens from 1 August 2026).
  today?: string;
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
// "Citronellol", "Benzyl Alcohol" doesn't match inside a longer name, and
// "Benzophenone" doesn't match "Benzophenone-3".
const termPatterns = new Map<string, RegExp>();
const termPattern = (term: string): RegExp => {
  const key = term.toLowerCase();
  let re = termPatterns.get(key);
  if (!re) {
    re = new RegExp(`(^|[^a-z0-9-])${escapeRegExp(key)}($|[^a-z0-9-]|-(?![a-z0-9]))`, "i");
    termPatterns.set(key, re);
  }
  return re;
};
const containsTerm = (haystack: string, term: string): boolean =>
  term.trim().length >= 3 && termPattern(term).test(haystack.toLowerCase());

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

const officialNames = (s: Substance) => [s.inci_name, ...s.synonyms];

const namedIn = (value: string, s: Substance) => officialNames(s).some((n) => containsTerm(value, n));

// The name as it appears on the label, for the finding text.
// plus the listed name when the label uses another one.
const nameOnLabel = (value: string, s: Substance) => {
  const found = [...officialNames(s), ...(s.match_terms ?? [])].find((n) => containsTerm(value, n)) ?? s.inci_name;
  return found.toLowerCase() === s.inci_name.toLowerCase() ? found : `${found} (${s.inci_name})`;
};

const clip = (text: string, max = 300) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

const where = (s: Substance) =>
  s.annex_ref ? ` (${s.jurisdiction === "GB" ? "GB" : "EU"} Annex ${s.annex_ref.replace("/", ", entry ")})` : "";

const listFor = (substances: Substance[], type: SubstanceList, markets: Market[]) =>
  substances.filter((s) => s.list_type === type && inMarkets(s.markets, markets));

// One line per substance, without repeating a name found under both the
// GB and EU lists.
const describe = (found: Substance[], line: (s: Substance) => string): string =>
  [...new Set(found.map(line))].join(" ");

const CI_NUMBER = /\bC\.?\s?I\.?\s?(\d{5})\b/gi;

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
    const allergens = listFor(substances, "fragrance_allergen", markets);
    const named = allergens.filter((s) => namedIn(value, s));
    const namedLower = new Set(named.flatMap((s) => officialNames(s).map((n) => n.toLowerCase())));

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
        ? `Declared: ${[...new Set(named.map((s) => s.inci_name))].join(", ")}.`
        : "No fragrance or allergen-bearing essential oils listed.",
    };
  },

  prohibited_substances: ({ value, markets, substances }) => {
    const prohibited = listFor(substances, "prohibited", markets);
    // An official name without an exception is a fail; a name derived
    // from one, or an entry with an exception, asks for a check.
    const certain = prohibited.filter((s) => !s.other_conditions && namedIn(value, s));
    const possible = prohibited.filter(
      (s) =>
        !certain.includes(s) &&
        (namedIn(value, s) || (s.match_terms ?? []).some((t) => containsTerm(value, t)))
    );
    const official = prohibited.some((s) => s.annex_ref);
    if (certain.length) {
      return {
        status: "fail",
        reason: `Contains a prohibited substance: ${describe(certain, (s) => `${nameOnLabel(value, s)}${where(s)}.`)}`,
      };
    }
    if (possible.length) {
      return {
        status: "review",
        reason: `May contain a prohibited substance; check against the entry: ${describe(
          possible,
          (s) => `${nameOnLabel(value, s)} — listed as "${clip(s.chemical_name ?? s.inci_name, 200)}"${where(s)}.`
        )}`,
      };
    }
    return {
      status: "pass",
      reason: official
        ? `None of the ${prohibited.length} entries on the prohibited list were found by name.`
        : `None of the ${prohibited.length} prohibited substances in this rulebook were found. This is not a full Annex II screen.`,
    };
  },

  restricted_substances: ({ value, markets, substances }) => {
    const listed = substances.filter(
      (s) =>
        (s.list_type === "restricted" || s.list_type === "preservative" || s.list_type === "uv_filter") &&
        inMarkets(s.markets, markets)
    );
    const found = listed.filter((s) => namedIn(value, s));
    if (!found.length) {
      return { status: "pass", reason: `None of the ${listed.length} restricted ingredients were found.` };
    }
    const kind = { restricted: "Restricted", preservative: "Preservative", uv_filter: "UV filter" } as Record<string, string>;
    const lines = describe(found, (s) => {
      const parts = [
        s.product_type && `product types: ${clip(s.product_type)}`,
        s.max_concentration && `maximum: ${clip(s.max_concentration)}`,
        s.other_conditions && `conditions: ${clip(s.other_conditions)}`,
        s.label_warnings && `required on the label: ${clip(s.label_warnings, 500)}`,
      ].filter(Boolean);
      return `${nameOnLabel(value, s)} — ${kind[s.list_type]}${where(s)}${parts.length ? `: ${parts.join("; ")}` : ""}.`;
    });
    const warnings = found.some((s) => s.label_warnings);
    return {
      status: "review",
      reason: `${warnings ? "Check the required warnings and limits" : "Allowed within limits; check them"}: ${lines}`,
    };
  },

  colourants: ({ value, markets, substances }) => {
    const permitted = listFor(substances, "colourant", markets);
    const used = [...new Set([...value.matchAll(CI_NUMBER)].map((m) => m[1]))];
    if (!used.length) return { status: "pass", reason: "No colourants (CI numbers) listed." };
    if (!permitted.length) return null;
    const byNumber = new Map<string, Substance[]>();
    for (const s of permitted) {
      for (const ci of s.colour_index ?? []) byNumber.set(ci, [...(byNumber.get(ci) ?? []), s]);
    }
    const unknown = used.filter((ci) => !byNumber.has(ci));
    if (unknown.length) {
      return {
        status: "fail",
        reason: `Not on the permitted colourant list: ${unknown.map((ci) => `CI ${ci}`).join(", ")}.`,
      };
    }
    // Where it may be used matters for the label; purity criteria are the
    // manufacturer's concern.
    const conditional = used
      .flatMap((ci) => byNumber.get(ci)!)
      .filter((s) => s.product_type || /not to be used|only|except|maximum|must not/i.test(s.other_conditions ?? ""));
    if (conditional.length) {
      return {
        status: "review",
        reason: `Permitted with conditions: ${describe(
          conditional,
          (s) => `${s.inci_name}${where(s)}: ${clip([s.product_type, s.other_conditions].filter(Boolean).join("; "))}.`
        )}`,
      };
    }
    return { status: "pass", reason: `All ${used.length} colourants are on the permitted list.` };
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
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const substances = rulebook.substances.filter(
    (s) => s.verification_status !== "rejected" && (!s.applies_from || s.applies_from <= today)
  );

  const findings = rulebook.rules
    .filter((r) => r.verification_status !== "rejected")
    .filter((r) => r.markets.some((m) => markets.includes(m)))
    .map((r) => evaluateRule(r, fieldsByLabel, markets, role, substances))
    .filter((f): f is RuleFinding => f !== null);

  return rankFindings(findings);
};
