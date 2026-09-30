// Runs the rule engine against the real official-annex data that the
// 2026.2 rulebook migration loads, so a parsing or matching regression
// shows up here rather than on a customer's label.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateRules, type Market, type Rule, type Rulebook, type Substance } from "./rule-engine";

const migration = readFileSync(
  resolve(__dirname, "../../migrations/20261001120100_rulebook_2026_2_official_annexes.sql"),
  "utf8"
);
const substances: Substance[] = JSON.parse(migration.split("$annexes$")[1]).map(
  (r: Omit<Substance, "verification_status">) => ({ ...r, verification_status: "unverified" })
);

const rule = (rule_key: string, check_type: Rule["check_type"], params: Rule["params"] = {}): Rule => ({
  rule_key,
  title: rule_key,
  product_scope: "cosmetic",
  markets: ["GB", "NI", "EU"],
  field: "Ingredients",
  check_type,
  params,
  severity: "legal",
  explanation: "Required.",
  fix_hint: null,
  sources: [{ market: "GB", title: "t", url: "https://example.test", clause: "c" }],
  verification_status: "unverified",
});

const rulebook: Rulebook = {
  scope: "cosmetics",
  version: "2026.2",
  status: "draft",
  rules: [
    rule("prohibited_substances", "prohibited_substances"),
    rule("restricted_substances", "restricted_substances"),
    rule("colourants", "colourants"),
    rule("fragrance_allergens", "fragrance_allergens", { fragrance_markers: ["parfum", "fragrance"] }),
  ],
  substances,
};

const check = (ingredients: string, markets: Market[], today = "2026-09-30") => {
  const findings = evaluateRules(
    {
      fields: [{ label: "Ingredients", value: ingredients, status: "verified" }],
      category: "cosmetic",
      markets,
      today,
    },
    rulebook
  );
  return Object.fromEntries(findings.map((f) => [f.ruleKey, f]));
};

describe("official annex data", () => {
  it("loads every annex for both jurisdictions", () => {
    const count = (j: string, t: string) => substances.filter((s) => s.jurisdiction === j && s.list_type === t).length;
    expect(count("EU", "prohibited")).toBeGreaterThan(1700);
    expect(count("GB", "prohibited")).toBeGreaterThan(1700);
    expect(count("EU", "fragrance_allergen")).toBe(81);
    expect(count("GB", "fragrance_allergen")).toBe(25);
    expect(count("EU", "colourant")).toBe(154);
    expect(count("EU", "preservative")).toBeGreaterThan(50);
    expect(count("EU", "uv_filter")).toBeGreaterThan(30);
  });

  it("fails Lilial and Lyral by their INCI names (linked to Annex II by CosIng)", () => {
    for (const markets of [["GB"], ["EU"]] as Market[][]) {
      const lilial = check("Aqua, Glycerin, Butylphenyl Methylpropional, Parfum", markets);
      expect(lilial.prohibited_substances.status).toBe("fail");
      expect(lilial.prohibited_substances.reason).toContain("Annex II, entry 1666");
      const lyral = check("Aqua, Hydroxyisohexyl 3-Cyclohexene Carboxaldehyde", markets);
      expect(lyral.prohibited_substances.status).toBe("fail");
    }
  });

  it("fails zinc pyrithione in the EU (Annex II since 2022)", () => {
    const f = check("Aqua, Sodium Laureth Sulfate, Zinc Pyrithione", ["EU"]);
    expect(f.prohibited_substances.status).toBe("fail");
    expect(f.prohibited_substances.reason).toContain("ZINC PYRITHIONE");
  });

  it("doesn't flag common ingredients through words inside chemical names", () => {
    // "(sulfate)" and "(acetate)" appear inside Annex II nickel and cobalt
    // entries; they must not match Sodium Laureth Sulfate or Tocopheryl Acetate.
    const f = check(
      "Aqua, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Tocopheryl Acetate, Glycerin, Citric Acid",
      ["GB", "EU"]
    );
    expect(f.prohibited_substances.status).toBe("pass");
  });

  it("asks for a check on petrolatum (prohibited unless the refining history is known)", () => {
    const f = check("Petrolatum, Paraffinum Liquidum, Cera Alba", ["GB"]);
    expect(f.prohibited_substances.status).toBe("review");
    expect(f.prohibited_substances.reason).toContain("refining history");
  });

  it("asks for a check on hydroquinone (prohibited, with an exception for nail systems)", () => {
    const f = check("Aqua, Hydroquinone, Glycerin", ["EU"]);
    expect(f.prohibited_substances.status).toBe("review");
    expect(f.prohibited_substances.reason).toContain("Annex II, entry 1339");
  });

  it("doesn't treat Benzophenone-3 (a UV filter) as Benzophenone (prohibited)", () => {
    const f = check("Aqua, Benzophenone-3, Glycerin", ["EU"]);
    expect(f.prohibited_substances.status).toBe("pass");
    expect(f.restricted_substances.reason).toContain("UV filter");
  });

  it("passes a plain formula and states how many entries were checked", () => {
    const f = check("Aqua, Glycerin, Cetearyl Alcohol, Tocopherol", ["GB", "EU"]);
    expect(f.prohibited_substances.status).toBe("pass");
    expect(f.prohibited_substances.reason).toMatch(/None of the \d{4} entries/);
    expect(f.colourants.status).toBe("pass");
  });

  it("gives preservative limits (phenoxyethanol, 1 %)", () => {
    const f = check("Aqua, Glycerin, Phenoxyethanol", ["GB"]);
    expect(f.restricted_substances.status).toBe("review");
    expect(f.restricted_substances.reason).toContain("Phenoxyethanol");
    expect(f.restricted_substances.reason).toContain("1,0 %");
  });

  it("checks colourants against Annex IV by CI number", () => {
    // Purity criteria are the manufacturer's concern, not a label issue.
    expect(check("Mica, CI 77891, CI 77491", ["EU"]).colourants.status).toBe("pass");
    const bad = check("Mica, CI 12345", ["EU"]);
    expect(bad.colourants.status).toBe("fail");
    expect(bad.colourants.reason).toContain("CI 12345");
  });

  it("recognises the expanded EU allergens (2023/1545) from 1 August 2026", () => {
    const after = check("Aqua, Parfum, Lavandula Angustifolia Oil", ["EU"], "2026-09-30");
    expect(after.fragrance_allergens.status).toBe("pass");
    expect(after.fragrance_allergens.reason).toContain("Lavandula");
    const before = check("Aqua, Parfum, Lavandula Angustifolia Oil", ["EU"], "2026-07-01");
    expect(before.fragrance_allergens.reason).not.toContain("Lavandula");
  });

  it("keeps the GB allergen list separate (GB hasn't adopted 2023/1545)", () => {
    const f = check("Aqua, Parfum, Lavandula Angustifolia Oil", ["GB"]);
    expect(f.fragrance_allergens.reason).not.toContain("Lavandula");
    expect(check("Aqua, Parfum, Linalool", ["GB"]).fragrance_allergens.reason).toContain("Linalool");
  });
});
