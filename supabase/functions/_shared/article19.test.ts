// Product function, EU languages, claims and the hand-in-book symbol, with
// the claim patterns taken from the migration that loads them, so the
// regular expressions stored in SQL are the ones tested here.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateRules, type ExtractedField, type Rule, type Rulebook } from "./rule-engine";
import { draftToExtracted, extrasToFields } from "./label-mapping";

const sql = readFileSync(
  resolve(__dirname, "../../migrations/20261001140000_rulebook_function_language_claims.sql"),
  "utf8"
);
const patterns = [...sql.matchAll(/'match', '((?:[^']|'')*)',\s*'advice', '((?:[^']|'')*)'/g)].map((m) => ({
  match: m[1].replace(/''/g, "'"),
  advice: m[2].replace(/''/g, "'"),
}));

const rule = (r: Partial<Rule> & Pick<Rule, "rule_key" | "check_type" | "field">): Rule => ({
  title: r.rule_key,
  product_scope: "cosmetic",
  markets: ["GB", "NI", "EU"],
  params: {},
  severity: "legal",
  explanation: "Required.",
  fix_hint: "Fix it.",
  sources: [{ market: "EU", title: "t", url: "https://example.test", clause: "c" }],
  verification_status: "unverified",
  ...r,
});

const rulebook: Rulebook = {
  scope: "cosmetics",
  version: "t",
  status: "draft",
  rules: [
    rule({ rule_key: "product_function", check_type: "present_if_applicable", field: "Product Function" }),
    rule({
      rule_key: "eu_languages",
      check_type: "language",
      field: "Label Languages",
      markets: ["EU"],
      params: {
        required: {
          DE: { language: "de", name: "German", country: "Germany" },
          FR: { language: "fr", name: "French", country: "France" },
        },
      },
    }),
    rule({ rule_key: "claims", check_type: "claims", field: "Claims", params: { absent_ok: true, absent_note: "No claims found.", patterns } }),
    rule({
      rule_key: "ingredient_list",
      check_type: "ingredient_list",
      field: "Ingredients",
      params: { leaflet_allowed_for_pack: ["leaflet", "small", "sample"] },
    }),
  ],
  substances: [],
};

const run = (fields: ExtractedField[], extra: { countries?: string[]; pack?: "leaflet" | null; markets?: ("GB" | "EU")[] } = {}) =>
  Object.fromEntries(
    evaluateRules(
      { fields, category: "Cosmetic", markets: extra.markets ?? ["EU"], countries: extra.countries, pack: extra.pack ?? null },
      rulebook
    ).map((f) => [f.ruleKey, f])
  );

const draft = (d: Parameters<typeof draftToExtracted>[0]) => draftToExtracted({ ingredients: "Aqua, Glycerin", ...d });

describe("claims", () => {
  it("loads every pattern from the migration", () => {
    expect(patterns.length).toBe(7);
  });

  it("gives advice per claim", () => {
    const f = run(draft({ productName: "Paraben-free Hypoallergenic Face Cream", certifications: "Dermatologically tested, 100% natural" }));
    expect(f.claims.status).toBe("review");
    for (const text of ['"Paraben-free"', '"Hypoallergenic"', '"Dermatologically tested"', "natural"]) {
      expect(f.claims.reason).toContain(text);
    }
  });

  it("treats cruelty-free as its own claim, not a 'free from' claim", () => {
    const f = run(draft({ productName: "Face Cream", certifications: "Cruelty-free" }));
    expect(f.claims.reason).toContain("testing cosmetics on animals is banned");
    expect(f.claims.reason).not.toContain('"Free from" claims');
  });

  it("flags medicinal claims", () => {
    expect(run(draft({ productName: "Balm that heals eczema" })).claims.reason).toContain("medicinal claim");
  });

  it("passes when there are no claims", () => {
    expect(run(draft({ productName: "Rose Face Cream" })).claims.status).toBe("pass");
    expect(run(extrasToFields({ claims: [] }, true)).claims.status).toBe("pass");
  });
});

describe("EU languages (Germany, France)", () => {
  it("asks which countries when none are given", () => {
    expect(run(draft({ productName: "Face Cream" })).eu_languages.reason).toContain("which EU countries");
  });

  it("finds German and French in a multilingual draft", () => {
    const f = run(
      draft({
        productName: "Face Cream",
        instructionsForUse:
          "Avoid contact with eyes. / Kontakt mit den Augen vermeiden. Für Kinder unzugänglich aufbewahren. / Éviter le contact avec les yeux. Tenir hors de portée des enfants.",
      }),
      { countries: ["DE", "FR"] }
    );
    expect(f.eu_languages.status).toBe("pass");
  });

  it("says which language is missing", () => {
    const f = run(draft({ productName: "Face Cream", instructionsForUse: "Avoid contact with eyes. Keep out of reach of children." }), {
      countries: ["DE", "FR"],
    });
    expect(f.eu_languages.status).toBe("review");
    expect(f.eu_languages.reason).toContain("No German text found (needed for Germany)");
    expect(f.eu_languages.reason).toContain("French");
  });

  it("uses the languages the scanner reported", () => {
    expect(run(extrasToFields({ languages: ["en", "de"] }, true), { countries: ["DE"] }).eu_languages.status).toBe("pass");
  });

  it("doesn't apply to GB-only labels", () => {
    expect(run(draft({ productName: "Face Cream" }), { markets: ["GB"] }).eu_languages).toBeUndefined();
  });
});

describe("product function and the hand-in-book symbol", () => {
  it("takes the function from the product type or name", () => {
    expect(run(draft({ productName: "Rose Face Cream" })).product_function.status).toBe("pass");
    expect(run(draft({})).product_function.status).toBe("review");
  });

  it("accepts ingredients on a leaflet when the pack shows the hand-in-book symbol", () => {
    const fields: ExtractedField[] = [
      { label: "Ingredients", value: null, status: "missing" },
      ...extrasToFields({ symbols: ["hand_in_book"] }, true),
    ];
    expect(run(fields, { pack: "leaflet" }).ingredient_list.status).toBe("pass");
    const noSymbol = [{ label: "Ingredients", value: null, status: "missing" as const }, ...extrasToFields({ symbols: [] }, true)];
    expect(run(noSymbol, { pack: "leaflet" }).ingredient_list.status).toBe("review");
  });
});
