import { describe, it, expect } from "vitest";
import { draftToExtracted } from "./label-mapping";
import { evaluateRules, type Rule, type Rulebook } from "./rule-engine";

const byLabel = (d: Parameters<typeof draftToExtracted>[0]) =>
  Object.fromEntries(draftToExtracted(d).map((f) => [f.label, f]));

const rule = (rule_key: string, market: "GB" | "EU" | "NI"): Rule => ({
  rule_key,
  title: rule_key,
  product_scope: "cosmetic",
  markets: [market],
  field: "Manufacturer / Responsible Person",
  check_type: "address_in_market",
  params: { market },
  severity: "legal",
  explanation: "",
  fix_hint: null,
  sources: [{ market, title: "t", url: "u", clause: "c" }],
  verification_status: "unverified",
});

describe("draftToExtracted", () => {
  it("marks empty draft fields as missing, not unseen", () => {
    const f = byLabel({ productName: "Rose Cream", batchNumber: "  " });
    expect(f["Product Name"]).toEqual({ label: "Product Name", value: "Rose Cream", status: "verified" });
    expect(f["Batch / Lot Number"].status).toBe("missing");
  });

  it("renders a PAO as e.g. 12M and otherwise uses the durability date", () => {
    expect(byLabel({ dateType: "pao", paoMonths: "12" })["Expiry / Best Before"].value).toBe("12M");
    expect(byLabel({ dateType: "pao", paoMonths: "24 months" })["Expiry / Best Before"].value).toBe("24M");
    expect(byLabel({ dateType: "durability", bestBefore: "06/2027" })["Expiry / Best Before"].value).toBe("06/2027");
    expect(byLabel({ dateType: "pao" })["Expiry / Best Before"].status).toBe("missing");
  });

  it("uses instructions for use as the warnings text", () => {
    expect(byLabel({ instructionsForUse: "Avoid contact with eyes." })["Warnings"].value).toBe("Avoid contact with eyes.");
  });

  it("lets one master label satisfy both UK and EU Responsible Person rules", () => {
    const rulebook: Rulebook = {
      scope: "cosmetics",
      version: "t",
      status: "draft",
      rules: [rule("rp_gb", "GB"), rule("rp_eu", "EU"), rule("rp_ni", "NI")],
      substances: [],
    };
    const fields = draftToExtracted({
      responsiblePerson: "Glow Ltd, 1 High St, London EC1A 1BB",
      euResponsiblePerson: "Glow BV, Keizersgracht 1, Amsterdam, Netherlands",
    });
    const findings = evaluateRules({ fields, category: "Skincare", markets: ["GB", "EU", "NI"] }, rulebook);
    expect(findings.map((f) => [f.ruleKey, f.status])).toEqual(
      expect.arrayContaining([["rp_gb", "pass"], ["rp_eu", "pass"], ["rp_ni", "pass"]])
    );

    const ukOnly = evaluateRules(
      { fields: draftToExtracted({ responsiblePerson: "Glow Ltd, London EC1A 1BB" }), category: "Skincare", markets: ["GB", "EU"] },
      rulebook
    );
    expect(ukOnly.find((f) => f.ruleKey === "rp_eu")?.status).toBe("review");
  });
});
