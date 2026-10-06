import { describe, it, expect } from "vitest";
import { summarizeFindings } from "./rule-findings";
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

  it("is all zero with no findings", () => {
    expect(summarizeFindings([])).toEqual({ issues: 0, notChecked: 0, passed: 0 });
  });
});
