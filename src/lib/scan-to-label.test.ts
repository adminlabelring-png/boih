import { describe, it, expect } from "vitest";
import { diffAgainstScan, scanToLabel } from "./scan-to-label";
import type { DetectedField, RuleFinding, ScanResult } from "./scan-context";

const f = (label: string, value: string | null, status: DetectedField["status"] = "verified"): DetectedField => ({
  label,
  value,
  status,
});

const finding = (ruleKey: string, status: RuleFinding["status"]): RuleFinding => ({
  ruleKey,
  title: ruleKey,
  severity: "legal",
  status,
  reason: "r",
  fix: "fix",
  field: null,
  markets: ["GB"],
  sources: [],
  verified: false,
});

const result = (overrides: Partial<ScanResult>): ScanResult => ({
  fileName: "x.jpg",
  category: "Cosmetic",
  fields: [],
  foundCount: 0,
  totalCount: 0,
  needsAttentionCount: 0,
  coverage: { isComplete: true, visibleAreas: [], missingAreas: [], note: "" },
  findings: [],
  rulebook: null,
  ...overrides,
});

describe("scanToLabel", () => {
  it("carries over what was read off a cosmetic pack", () => {
    const h = scanToLabel(
      result({
        fields: [
          f("Product Name", "Rose Face Cream"),
          f("Ingredients", "Aqua, Glycerin, Parfum, Linalool, Citronellol"),
          f("Manufacturer / Responsible Person", "Glow Ltd, London EC1A 1BB"),
          f("Warnings", "Avoid contact with eyes."),
          f("Expiry / Best Before", "12M"),
          f("Net Quantity", "50 ml"),
          f("Batch / Lot Number", null, "not_verified"),
        ],
        findings: [finding("batch_code", "not_verified"), finding("ingredient_list", "pass"), finding("prohibited", "fail")],
      })
    );
    expect(h.fields.category).toBe("Skincare");
    expect(h.fields.productName).toBe("Rose Face Cream");
    expect(h.fields.instructionsForUse).toBe("Avoid contact with eyes.");
    expect(h.fields.dateType).toBe("pao");
    expect(h.fields.paoMonths).toBe("12");
    expect([...h.fields.fragranceAllergens].sort()).toEqual(["Citronellol", "Linalool"]);
    expect(h.fields.batchNumber).toBe("");
    expect(h.findings.map((x) => x.ruleKey)).toEqual(["batch_code", "prohibited"]);
    expect(h.prefilled).toContain("productName");
    expect(h.prefilled).not.toContain("batchNumber");
  });

  it("never carries a value the scanner didn't actually read", () => {
    const h = scanToLabel(
      result({
        fields: [f("Product Name", "Guess", "not_verified"), f("Country of Origin", "UK", "missing")],
      })
    );
    expect(h.fields.productName).toBe("");
    expect(h.fields.countryOfOrigin).toBe("");
  });

  it("drops the scanner's cross-reference notes from allergens", () => {
    const h = scanToLabel(
      result({
        category: "Food",
        fields: [f("Allergens", "Contains milk\nCross-referenced from ingredients: Milk.", "low_confidence")],
      })
    );
    expect(h.fields.category).toBe("Food");
    expect(h.fields.allergens).toBe("Contains milk");
  });

  it("uses a durability date for cosmetics without a PAO and leaves the food date type to the brand", () => {
    const cosmetic = scanToLabel(result({ fields: [f("Expiry / Best Before", "06/2027")] }));
    expect(cosmetic.fields.dateType).toBe("durability");
    expect(cosmetic.fields.bestBefore).toBe("06/2027");

    const food = scanToLabel(result({ category: "Food", fields: [f("Expiry / Best Before", "06/2027")] }));
    expect(food.fields.dateType).toBe("");
    expect(food.fields.bestBefore).toBe("06/2027");
  });

  it("maps unknown categories to Other", () => {
    expect(scanToLabel(result({ category: "Toy" })).fields.category).toBe("Other");
  });
});

describe("diffAgainstScan", () => {
  const base = scanToLabel(
    result({
      fields: [
        f("Product Name", "Rose Cream"),
        f("Ingredients", "Aqua, Parfum, Lilial"),
        f("Manufacturer / Responsible Person", "Glow Ltd, London EC1A 1BB"),
        f("Expiry / Best Before", "12M"),
      ],
    })
  );
  const ingredientFinding: RuleFinding = {
    ...finding("prohibited_substances", "fail"),
    title: "No prohibited substances",
    field: "Ingredients",
    fix: "Remove the prohibited substance and reformulate.",
  };

  it("lists only fields that changed, each with a one-line reason", () => {
    const draft = {
      ...base.fields,
      ingredients: "Aqua, Parfum",
      euResponsiblePerson: "Glow BV, Amsterdam, Netherlands",
      paoMonths: "6",
    };
    const changes = diffAgainstScan(base.fields, draft, [ingredientFinding]);
    expect(changes.map((c) => c.key)).toEqual(["ingredients", "euResponsiblePerson", "date"]);
    expect(changes[0]).toMatchObject({
      before: "Aqua, Parfum, Lilial",
      after: "Aqua, Parfum",
      reason: "No prohibited substances: Remove the prohibited substance and reformulate.",
    });
    expect(changes[1].before).toBe("");
    expect(changes[2]).toMatchObject({ before: "PAO 12M", after: "PAO 6M", reason: "Edited by you" });
  });

  it("ignores whitespace-only edits and returns nothing when unchanged", () => {
    expect(diffAgainstScan(base.fields, { ...base.fields, productName: " Rose  Cream " }, [])).toEqual([]);
  });

  it("keeps reasons to one short line", () => {
    const long: RuleFinding = { ...ingredientFinding, fix: "x ".repeat(200) };
    const [c] = diffAgainstScan(base.fields, { ...base.fields, ingredients: "Aqua" }, [long]);
    expect(c.reason.length).toBeLessThanOrEqual(140);
    expect(c.reason).not.toMatch(/\n/);
  });
});
