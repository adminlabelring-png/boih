import { describe, it, expect } from "vitest";
import {
  evaluateRules,
  rankFindings,
  type ExtractedField,
  type PackFormat,
  type Rule,
  type Rulebook,
  type Substance,
} from "./rule-engine";

const source = (market: "GB" | "NI" | "EU") => ({
  market,
  title: `Test source ${market}`,
  url: `https://example.test/${market}`,
  clause: "Art. 19",
});

const rule = (overrides: Partial<Rule> & Pick<Rule, "rule_key" | "check_type">): Rule => ({
  title: overrides.rule_key,
  product_scope: "cosmetic",
  markets: ["GB", "NI", "EU"],
  field: null,
  params: {},
  severity: "legal",
  explanation: "Required.",
  fix_hint: "Fix it.",
  sources: [source("GB"), source("EU")],
  verification_status: "unverified",
  ...overrides,
});

const substance = (
  inci_name: string,
  list_type: Substance["list_type"],
  synonyms: string[] = [],
  markets: Substance["markets"] = ["GB", "NI", "EU"]
): Substance => ({ inci_name, list_type, synonyms, markets, verification_status: "unverified" });

const rulebook: Rulebook = {
  scope: "cosmetics",
  version: "test.1",
  status: "draft",
  rules: [
    rule({ rule_key: "rp_gb", check_type: "address_in_market", markets: ["GB"], field: "Manufacturer / Responsible Person", params: { market: "GB" } }),
    rule({ rule_key: "rp_eu", check_type: "address_in_market", markets: ["EU"], field: "Manufacturer / Responsible Person", params: { market: "EU" } }),
    rule({ rule_key: "rp_ni", check_type: "address_in_market", markets: ["NI"], field: "Manufacturer / Responsible Person", params: { market: "NI" } }),
    rule({ rule_key: "origin", check_type: "present", field: "Country of Origin", params: { required_when: "imported" } }),
    rule({ rule_key: "content", check_type: "present_with_unit", field: "Net Quantity" }),
    rule({ rule_key: "date", check_type: "date_or_pao", field: "Expiry / Best Before" }),
    rule({ rule_key: "precautions", check_type: "present_if_applicable", field: "Warnings" }),
    rule({ rule_key: "batch", check_type: "present", field: "Batch / Lot Number" }),
    rule({ rule_key: "inci", check_type: "ingredient_list", field: "Ingredients" }),
    rule({
      rule_key: "allergens",
      check_type: "fragrance_allergens",
      field: "Ingredients",
      params: {
        fragrance_markers: ["parfum", "fragrance"],
        natural_sources: { "citrus limon": ["Limonene", "Citral"] },
      },
    }),
    rule({ rule_key: "prohibited", check_type: "prohibited_substances", field: "Ingredients" }),
    rule({
      rule_key: "eu_2026",
      check_type: "advisory",
      markets: ["EU", "NI"],
      field: "Ingredients",
      explanation: "Expanded list not yet covered.",
      params: { only_if_any: ["parfum", "essential oil", "peel oil"] },
    }),
    rule({ rule_key: "storage", check_type: "present_if_applicable", field: "Storage Instructions", severity: "best_practice" }),
    rule({ rule_key: "rejected_rule", check_type: "present", field: "Product Name", verification_status: "rejected" }),
  ],
  substances: [
    substance("Limonene", "fragrance_allergen"),
    substance("Citral", "fragrance_allergen"),
    substance("Citronellol", "fragrance_allergen"),
    substance("Linalool", "fragrance_allergen"),
    substance("Butylphenyl Methylpropional", "prohibited", ["Lilial", "BMHCA"]),
  ],
};

const field = (
  label: string,
  value: string | null,
  status: ExtractedField["status"] = "verified"
): ExtractedField => ({ label, value, status });

const compliantUkLabel: ExtractedField[] = [
  field("Product Name", "Rose Face Cream"),
  field("Manufacturer / Responsible Person", "Glow Ltd, 1 High Street, London, EC1A 1BB"),
  field("Country of Origin", "United Kingdom"),
  field("Net Quantity", "50 ml"),
  field("Expiry / Best Before", "12M"),
  field("Warnings", "Avoid contact with eyes."),
  field("Batch / Lot Number", "L2026-118A"),
  field("Ingredients", "Aqua, Glycerin, Parfum, Linalool, Citronellol"),
  field("Storage Instructions", "Store below 25°C."),
];

const byKey = (findings: ReturnType<typeof evaluateRules>) =>
  Object.fromEntries(findings.map((f) => [f.ruleKey, f]));

describe("evaluateRules", () => {
  it("returns nothing for categories without a rulebook", () => {
    expect(evaluateRules({ fields: compliantUkLabel, category: "Food", markets: ["GB"] }, rulebook)).toEqual([]);
  });

  it("passes a complete GB cosmetics label", () => {
    const findings = evaluateRules({ fields: compliantUkLabel, category: "Cosmetic", markets: ["GB"] }, rulebook);
    expect(findings.every((f) => f.status === "pass")).toBe(true);
    // Only GB rules, and rejected rules are never run.
    const keys = findings.map((f) => f.ruleKey);
    expect(keys).toContain("rp_gb");
    expect(keys).not.toContain("rp_eu");
    expect(keys).not.toContain("eu_2026");
    expect(keys).not.toContain("rejected_rule");
  });

  it("applies each market's Responsible Person rule for exporters", () => {
    const f = byKey(evaluateRules({ fields: compliantUkLabel, category: "Cosmetic", markets: ["GB", "EU", "NI"] }, rulebook));
    expect(f.rp_gb.status).toBe("pass");
    expect(f.rp_eu.status).toBe("review");
    expect(f.rp_ni.status).toBe("review");
    expect(f.rp_eu.markets).toEqual(["EU"]);
    expect(f.rp_eu.sources.every((s) => s.market === "EU")).toBe(true);
  });

  it("recognises EU and Northern Ireland addresses", () => {
    const fields = compliantUkLabel.map((x) =>
      x.label === "Manufacturer / Responsible Person"
        ? field(x.label, "Glow Ltd, London EC1A 1BB. EU RP: Glow BV, Keizersgracht 1, Amsterdam, Netherlands")
        : x
    );
    const f = byKey(evaluateRules({ fields, category: "Cosmetic", markets: ["GB", "EU", "NI"] }, rulebook));
    expect(f.rp_gb.status).toBe("pass");
    expect(f.rp_eu.status).toBe("pass");
    expect(f.rp_ni.status).toBe("pass");
  });

  it("doesn't treat Northern Ireland as the Republic of Ireland", () => {
    const fields = compliantUkLabel.map((x) =>
      x.label === "Manufacturer / Responsible Person" ? field(x.label, "Glow Ltd, Belfast, Northern Ireland, BT1 1AA") : x
    );
    const f = byKey(evaluateRules({ fields, category: "Cosmetic", markets: ["EU", "NI"] }, rulebook));
    expect(f.rp_eu.status).toBe("review");
    expect(f.rp_ni.status).toBe("pass");
  });

  it("fails confirmed-absent mandatory fields and reports unseen ones as not verified", () => {
    const fields = compliantUkLabel.map((x) => {
      if (x.label === "Batch / Lot Number") return field(x.label, null, "missing");
      if (x.label === "Expiry / Best Before") return field(x.label, null, "not_verified");
      return x;
    });
    const f = byKey(evaluateRules({ fields, category: "Cosmetic", markets: ["GB"] }, rulebook));
    expect(f.batch.status).toBe("fail");
    expect(f.batch.fix).toBe("Fix it.");
    expect(f.date.status).toBe("not_verified");
    expect(f.date.fix).toMatch(/photo/i);
  });

  it("treats a field the model never returned as not verified", () => {
    const fields = compliantUkLabel.filter((x) => x.label !== "Net Quantity");
    const f = byKey(evaluateRules({ fields, category: "Cosmetic", markets: ["GB"] }, rulebook));
    expect(f.content.status).toBe("not_verified");
  });

  it("only requires country of origin for importers", () => {
    const fields = compliantUkLabel.map((x) => (x.label === "Country of Origin" ? field(x.label, null, "missing") : x));
    const unknown = byKey(evaluateRules({ fields, category: "Cosmetic", markets: ["GB"] }, rulebook));
    const manufacturer = byKey(evaluateRules({ fields, category: "Cosmetic", markets: ["GB"], role: "manufacturer" }, rulebook));
    const importer = byKey(evaluateRules({ fields, category: "Cosmetic", markets: ["GB"], role: "importer" }, rulebook));
    expect(unknown.origin.status).toBe("review");
    expect(manufacturer.origin.status).toBe("review");
    expect(importer.origin.status).toBe("fail");
  });

  it("asks for review rather than failing optional-if-applicable fields", () => {
    const fields = compliantUkLabel.map((x) => (x.label === "Warnings" ? field(x.label, null, "missing") : x));
    expect(byKey(evaluateRules({ fields, category: "Cosmetic", markets: ["GB"] }, rulebook)).precautions.status).toBe("review");
  });

  it("checks value formats", () => {
    const fields = compliantUkLabel.map((x) => {
      if (x.label === "Net Quantity") return field(x.label, "1.7 fl oz");
      if (x.label === "Expiry / Best Before") return field(x.label, "see base");
      if (x.label === "Ingredients") return field(x.label, "Aqua");
      return x;
    });
    const f = byKey(evaluateRules({ fields, category: "Cosmetic", markets: ["GB"] }, rulebook));
    expect(f.content.status).toBe("review");
    expect(f.date.status).toBe("review");
    expect(f.inci.status).toBe("review");
  });

  it("accepts common date and PAO formats", () => {
    for (const value of ["12M", "12 M", "24 months", "Best before end 06/2027", "EXP 2027-06", "Jun 2027", "BBE 01.06.27"]) {
      const fields = compliantUkLabel.map((x) => (x.label === "Expiry / Best Before" ? field(x.label, value) : x));
      expect(byKey(evaluateRules({ fields, category: "Cosmetic", markets: ["GB"] }, rulebook)).date.status, value).toBe("pass");
    }
  });

  it("flags undeclared allergens carried by essential oils", () => {
    const fields = compliantUkLabel.map((x) =>
      x.label === "Ingredients" ? field(x.label, "Aqua, Glycerin, Citrus Limon Peel Oil, Limonene") : x
    );
    const f = byKey(evaluateRules({ fields, category: "Cosmetic", markets: ["GB"] }, rulebook));
    expect(f.allergens.status).toBe("review");
    expect(f.allergens.reason).toContain("Citral");
    expect(f.allergens.reason).not.toContain("Limonene,");
  });

  it("flags fragrance with no allergens named, and matches whole terms only", () => {
    const fields = compliantUkLabel.map((x) =>
      x.label === "Ingredients" ? field(x.label, "Aqua, Parfum, Citronellyl Methylcrotonate") : x
    );
    expect(byKey(evaluateRules({ fields, category: "Cosmetic", markets: ["GB"] }, rulebook)).allergens.status).toBe("review");
  });

  it("fails prohibited substances by INCI name or synonym", () => {
    const fields = compliantUkLabel.map((x) =>
      x.label === "Ingredients" ? field(x.label, "Aqua, Parfum, Linalool, Lilial") : x
    );
    const f = byKey(evaluateRules({ fields, category: "Cosmetic", markets: ["GB"] }, rulebook));
    expect(f.prohibited.status).toBe("fail");
    expect(f.prohibited.reason).toContain("Butylphenyl Methylpropional");
  });

  it("only raises the EU 2026 advisory when fragrance or essential oils are present", () => {
    const withFragrance = byKey(evaluateRules({ fields: compliantUkLabel, category: "Cosmetic", markets: ["EU"] }, rulebook));
    expect(withFragrance.eu_2026.status).toBe("review");

    const fields = compliantUkLabel.map((x) => (x.label === "Ingredients" ? field(x.label, "Aqua, Glycerin, Squalane") : x));
    expect(byKey(evaluateRules({ fields, category: "Cosmetic", markets: ["EU"] }, rulebook)).eu_2026).toBeUndefined();
  });

  it("never passes a low-confidence read outright", () => {
    const fields = compliantUkLabel.map((x) => (x.label === "Batch / Lot Number" ? field(x.label, "L2026", "low_confidence") : x));
    const f = byKey(evaluateRules({ fields, category: "Cosmetic", markets: ["GB"] }, rulebook));
    expect(f.batch.status).toBe("review");
    expect(f.batch.reason).toMatch(/low confidence/i);
  });

  it("ranks legal failures first and best practice last", () => {
    const fields = compliantUkLabel.map((x) => {
      if (x.label === "Batch / Lot Number") return field(x.label, null, "missing");
      if (x.label === "Storage Instructions") return field(x.label, null, "missing");
      return x;
    });
    const findings = evaluateRules({ fields, category: "Cosmetic", markets: ["GB"] }, rulebook);
    expect(findings[0].ruleKey).toBe("batch");
    expect(findings[findings.length - 1].severity).toBe("best_practice");
    expect(rankFindings([...findings].reverse())).toEqual(findings);
  });

  it("reports whether each rule has been signed off", () => {
    const signed: Rulebook = {
      ...rulebook,
      rules: rulebook.rules.map((r) => (r.rule_key === "batch" ? { ...r, verification_status: "verified" } : r)),
    };
    const f = byKey(evaluateRules({ fields: compliantUkLabel, category: "Cosmetic", markets: ["GB"] }, signed));
    expect(f.batch.verified).toBe(true);
    expect(f.inci.verified).toBe(false);
  });
});

describe("pack-size exemptions (Article 19)", () => {
  const packRulebook: Rulebook = {
    scope: "cosmetics",
    version: "pack.1",
    status: "draft",
    rules: [
      rule({
        rule_key: "content",
        check_type: "present_with_unit",
        field: "Net Quantity",
        params: { not_required_for_pack: ["small", "sample"], not_required_note: "Not required on packs under 5 g or 5 ml." },
      }),
      rule({
        rule_key: "inci",
        check_type: "ingredient_list",
        field: "Ingredients",
        params: { leaflet_allowed_for_pack: ["leaflet", "small", "sample"], leaflet_note: "May be on an enclosed leaflet." },
      }),
    ],
    substances: [],
  };
  const missing = [field("Net Quantity", null, "missing"), field("Ingredients", null, "missing")];
  const run = (pack: PackFormat | null) =>
    byKey(evaluateRules({ fields: missing, category: "Cosmetic", markets: ["GB"], pack }, packRulebook));

  it("doesn't require nominal content on a small pack", () => {
    expect(run("small").content.status).toBe("pass");
    expect(run("small").content.reason).toContain("5 g");
  });

  it("allows ingredients on a leaflet for packs too small for them", () => {
    expect(run("leaflet").inci.status).toBe("review");
    expect(run("leaflet").inci.reason).toContain("leaflet");
  });

  it("still fails missing information on a normal pack, or when the pack wasn't given", () => {
    for (const pack of ["carton", null] as const) {
      expect(run(pack).content.status).toBe("fail");
      expect(run(pack).inci.status).toBe("fail");
    }
  });
});

describe("product types", () => {
  const typed: Rulebook = {
    scope: "cosmetics",
    version: "test.types",
    status: "draft",
    rules: [
      rule({ rule_key: "colourants", check_type: "colourants", field: "Ingredients" }),
      rule({ rule_key: "restricted", check_type: "restricted_substances", field: "Ingredients" }),
      rule({
        rule_key: "allergens",
        check_type: "fragrance_allergens",
        field: "Ingredients",
        params: { fragrance_markers: ["parfum"] },
      }),
      rule({
        rule_key: "solid_bar_not_food",
        check_type: "warning_text",
        field: "Warnings",
        severity: "best_practice",
        explanation: "Say it isn't food.",
        params: { product_types: ["solid_bar"], patterns: ["do not eat", "not edible"] },
      }),
    ],
    substances: [
      { ...substance("CI 45380", "colourant"), colour_index: ["45380"], product_type: "Not to be used in eye products" },
      { ...substance("CI 12150", "colourant"), colour_index: ["12150"], product_type: "Rinse-off products" },
      { ...substance("CI 15850", "colourant"), colour_index: ["15850"], product_type: "Not to be used in products applied on mucous membranes" },
      { ...substance("CI 77491", "colourant"), colour_index: ["77491"] },
      { ...substance("Chlorphenesin", "preservative"), other_conditions: "Not to be used in lip products" },
    ],
  };
  const label = (ingredients: string, warnings = "Avoid contact with eyes.") => [
    field("Ingredients", ingredients),
    field("Warnings", warnings),
  ];
  const run = (fields: ExtractedField[], productType?: Parameters<typeof evaluateRules>[0]["productType"], exposure?: "leave_on" | "rinse_off") =>
    byKey(evaluateRules({ fields, category: "Cosmetic", markets: ["GB"], productType, exposure }, typed));

  it("fails a colourant the annex rules out for eye products, only in an eye product", () => {
    const fields = label("Aqua, CI 45380");
    expect(run(fields, "eye_area").colourants.status).toBe("fail");
    expect(run(fields, "eye_area").colourants.reason).toContain("not to be used in eye products");
    expect(run(fields, "liquid_cream").colourants.status).toBe("review");
    expect(run(fields).colourants.status).toBe("review");
  });

  it("fails a rinse-off-only colourant in a leave-on product, and accepts it when rinse-off", () => {
    const fields = label("Aqua, CI 12150");
    expect(run(fields, "lip_oral").colourants.status).toBe("fail");
    expect(run(fields, "liquid_cream", "leave_on").colourants.status).toBe("fail");
    expect(run(fields, "solid_bar").colourants.status).toBe("review");
  });

  it("fails a colourant not allowed on mucous membranes in a lip product", () => {
    expect(run(label("Ricinus Communis Seed Oil, CI 15850"), "lip_oral").colourants.status).toBe("fail");
    expect(run(label("Ricinus Communis Seed Oil, CI 77491"), "lip_oral").colourants.status).toBe("pass");
  });

  it("fails a preservative the annex rules out for lip products", () => {
    const fields = label("Cera Alba, Chlorphenesin");
    expect(run(fields, "lip_oral").restricted.status).toBe("fail");
    expect(run(fields, "lip_oral").restricted.reason).toContain("not to be used in lip or oral products");
    expect(run(fields, "liquid_cream").restricted.status).toBe("review");
  });

  it("runs type-specific rules only for that type", () => {
    expect(run(label("Sodium Cocoate"), "liquid_cream").solid_bar_not_food).toBeUndefined();
    expect(run(label("Sodium Cocoate")).solid_bar_not_food).toBeUndefined();
    expect(run(label("Sodium Cocoate"), "solid_bar").solid_bar_not_food.status).toBe("review");
    expect(run(label("Sodium Cocoate", "Not edible. Keep dry."), "solid_bar").solid_bar_not_food.status).toBe("pass");
    // Missing warnings on a bar is a check, not a legal fail.
    expect(run([field("Ingredients", "Sodium Cocoate"), field("Warnings", null, "missing")], "solid_bar").solid_bar_not_food.status).toBe("review");
  });

  it("explains the higher allergen risk in a fragrance", () => {
    expect(run(label("Alcohol Denat., Parfum"), "fragrance").allergens.reason).toContain("Perfumes are leave-on");
  });
});

describe("required warnings", () => {
  const warned: Rulebook = {
    scope: "cosmetics",
    version: "test.warnings",
    status: "draft",
    rules: [rule({ rule_key: "warnings", check_type: "required_warnings", field: "Ingredients", params: { warnings_field: "Warnings" } })],
    substances: [
      { ...substance("Silver Nitrate", "restricted"), label_warnings: "Contains silver nitrate Rinse eyes immediately if product comes into contact with them" },
      { ...substance("Thimerosal", "preservative", ["Thiomersal"]), label_warnings: "Contains Thiomersal" },
      {
        ...substance("Sodium Fluoride", "restricted"),
        label_warnings:
          "Contains sodium fluoride. For any toothpaste with compounds containing fluorine in a concentration of 0,1 to 0,15 % calculated as F the following labelling is obligatory: ‘Children of 6 years and younger: Use a pea sized amount’.",
      },
      { ...substance("Resorcinol", "restricted"), label_warnings: "(a) To be printed on the label: The mixing ratio. Read and follow instructions." },
    ],
  };
  const run = (ingredients: string, warnings: string | null, status: ExtractedField["status"] = "verified", markets: ("GB" | "EU")[] = ["GB"]) =>
    evaluateRules(
      {
        fields: [field("Ingredients", ingredients), field("Warnings", warnings, status), field("Label Languages", "de")],
        category: "Cosmetic",
        markets,
      },
      warned
    )[0];

  it("passes when nothing needs a warning", () => {
    expect(run("Aqua, Glycerin", "Avoid contact with eyes.").status).toBe("pass");
  });

  it("passes when the required wording is on the label, in any order or case", () => {
    expect(run("Aqua, Silver Nitrate", "Rinse eyes immediately if the product comes into contact with them. Contains silver nitrate.").status).toBe("pass");
    // Any official name of the ingredient will do.
    expect(run("Aqua, Thimerosal", "Contains thimerosal.").status).toBe("pass");
  });

  it("fails when required wording is missing", () => {
    const f = run("Aqua, Silver Nitrate", "Contains silver nitrate.");
    expect(f.status).toBe("fail");
    expect(f.reason).toContain("Rinse eyes immediately");
  });

  it("fails when the warnings are confirmed absent", () => {
    expect(run("Aqua, Thimerosal", null, "missing").status).toBe("fail");
  });

  it("checks the unconditional part and lists the conditional part", () => {
    expect(run("Sodium Fluoride, Aqua", "Do not swallow.").status).toBe("fail");
    const f = run("Sodium Fluoride, Aqua", "Contains sodium fluoride.");
    expect(f.status).toBe("review");
    expect(f.reason).toContain("depends on the product type or concentration");
  });

  it("only asks for wording that depends on the product", () => {
    expect(run("Aqua, Resorcinol", "Keep out of reach of children.").status).toBe("review");
  });

  it("asks rather than fails when the warnings couldn't be seen, or for an EU-only label in another language", () => {
    expect(run("Aqua, Thimerosal", null, "not_verified").status).toBe("review");
    expect(run("Aqua, Thimerosal", "Enthält Thiomersal.", "verified", ["EU"]).status).toBe("review");
  });
});

describe("cosmetics categories", () => {
  it("checks skincare, haircare, makeup and fragrance against the cosmetics rulebook, and nothing else", async () => {
    const { rulebookScopeForCategory } = await import("./rule-engine");
    for (const c of ["Skincare", "Haircare", "Makeup", "Fragrance", "Cosmetic"]) expect(rulebookScopeForCategory(c)).toBe("cosmetics");
    for (const c of ["Food", "Beverage", "Supplement", "Household", "Other", ""]) expect(rulebookScopeForCategory(c)).toBeNull();
  });
});
