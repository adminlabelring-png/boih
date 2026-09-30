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

const MARKET_NAMES: Record<string, string> = { GB: "Great Britain", NI: "Northern Ireland", EU: "EU" };

export const describeMarkets = (markets: string[]) =>
  markets.map((m) => MARKET_NAMES[m] ?? m).join(", ");

// Which rulebook, for which markets, when, and whether its rules have been
// expert-verified yet.
export const rulebookStampText = (rulebook: RulebookStamp, findings: RuleFinding[]) => {
  const date = new Date(rulebook.checkedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const base = `Checked against Labelring ${rulebook.scope} rulebook v${rulebook.version} for ${describeMarkets(rulebook.markets)} on ${date}.`;
  const provisional = rulebook.status !== "published" || findings.some((f) => !f.verified);
  return provisional
    ? `${base} Provisional: these rules have not yet been signed off by a qualified reviewer.`
    : base;
};
