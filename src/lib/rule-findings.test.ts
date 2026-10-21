import { describe, it, expect } from "vitest";
import { rulebookStampText, summarizeFindings } from "./rule-findings";
import type { RuleFinding } from "./scan-context";

const finding = (
  ruleKey: string,
  status: RuleFinding["status"],
  severity: RuleFinding["severity"] = "legal"
): RuleFinding => ({
  ruleKey,
  title: ruleKey,
  severity,
  status,
  reason: "r",
  fix: null,
  field: null,
  markets: ["GB"],
  sources: [],
  verified: false,
});

describe("summarizeFindings", () => {
  it("counts couldn't-check separately from issues instead of reporting 0 issues", () => {
    const findings = [
      finding("claims", "review"),
      ...["inci", "allergens", "colourants", "date", "nominal", "rp", "batch", "precautions"].map((k) =>
        finding(k, "not_verified")
      ),
    ];
    expect(summarizeFindings(findings)).toEqual({ issues: 1, notChecked: 8, passed: 0 });
  });

  it("counts fails and reviews as issues, in both legal and best-practice findings", () => {
    const findings = [
      finding("a", "fail"),
      finding("b", "review", "best_practice"),
      finding("c", "fail", "best_practice"),
      finding("d", "pass"),
      finding("e", "pass", "best_practice"),
    ];
    expect(summarizeFindings(findings)).toEqual({ issues: 3, notChecked: 0, passed: 2 });
  });

  it("counts a reminder as passed, not as an issue", () => {
    expect(summarizeFindings([finding("restricted", "note"), finding("batch", "pass")])).toEqual({
      issues: 0,
      notChecked: 0,
      passed: 2,
    });
  });

  it("is all zero with no findings", () => {
    expect(summarizeFindings([])).toEqual({ issues: 0, notChecked: 0, passed: 0 });
  });
});

describe("rulebookStampText", () => {
  const stamp = {
    scope: "cosmetics",
    version: "2026.2",
    status: "published" as const,
    markets: ["GB" as const],
    checkedAt: "2026-10-19T10:00:00Z",
  };

  it("says which product type the checks assumed, and when it was read from the label", () => {
    expect(rulebookStampText({ ...stamp, productType: "eye_area", productTypeSource: "chosen" }, [])).toContain(
      "Checked as: eye-area product."
    );
    expect(rulebookStampText({ ...stamp, productType: "lip_oral", productTypeSource: "detected" }, [])).toContain(
      "Checked as: lip or oral product (read from the label; if that's wrong, scan again and choose the product type)."
    );
    expect(rulebookStampText(stamp, [])).not.toContain("Checked as");
    expect(rulebookStampText({ ...stamp, productType: "liquid_cream", productTypeSource: "chosen", exposure: "rinse_off" }, [])).toContain(
      "Checked as: liquid or cream, rinse-off."
    );
    expect(rulebookStampText({ ...stamp, exposure: "leave_on" }, [])).toContain("Checked as: leave-on.");
  });
});
