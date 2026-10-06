import type { RuleFinding, RulebookStamp } from "./scan-context";

// Shared between the results page and the PDF export so both describe
// rule findings and the rulebook stamp in the same words.

export const findingStatusLabel = (status: RuleFinding["status"]) => {
  switch (status) {
    case "pass": return "Meets rule";
    case "review": return "Check";
    case "not_verified": return "Couldn't check";
    case "fail": return "Action needed";
  }
};

// The three numbers in the checks summary. "Issues found" is everything the
// label needs changing or evidence for (fail or review); "couldn't check" is
// a rule the photos didn't let us assess, which still needs action before the
// label can be relied on. Legal and best-practice findings both count.
export const summarizeFindings = (findings: RuleFinding[]) => ({
  issues: findings.filter((f) => f.status === "fail" || f.status === "review").length,
  notChecked: findings.filter((f) => f.status === "not_verified").length,
  passed: findings.filter((f) => f.status === "pass").length,
});

const MARKET_NAMES: Record<string, string> = { GB: "Great Britain", NI: "Northern Ireland", EU: "EU" };

export const describeMarkets = (markets: string[]) =>
  markets.map((m) => MARKET_NAMES[m] ?? m).join(", ");

// Which rulebook, for which markets, when, and whether it has been reviewed
// and published yet.
export const rulebookStampText = (rulebook: RulebookStamp, findings: RuleFinding[]) => {
  const date = new Date(rulebook.checkedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const base = `Checked against Labelring ${rulebook.scope} rulebook v${rulebook.version} for ${describeMarkets(rulebook.markets)} on ${date}.`;
  const provisional = rulebook.status !== "published" || findings.some((f) => !f.verified);
  return provisional
    ? `${base} Provisional: this rulebook version hasn't yet been reviewed and published by the Labelring team.`
    : base;
};
