import { useState } from "react";
import { CheckCircle, AlertTriangle, HelpCircle, XCircle, ChevronDown, ExternalLink } from "lucide-react";
import type { RuleFinding, RulebookStamp } from "@/lib/scan-context";
import { cn } from "@/lib/utils";
import { describeMarkets, findingStatusLabel, rulebookStampText, summarizeFindings } from "@/lib/rule-findings";

const statusIcon = (status: RuleFinding["status"]) => {
  switch (status) {
    case "pass": return <CheckCircle className="h-4 w-4 text-[hsl(var(--risk-low))] shrink-0 mt-0.5" />;
    case "review": return <AlertTriangle className="h-4 w-4 text-[hsl(var(--risk-medium))] shrink-0 mt-0.5" />;
    case "not_verified": return <HelpCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />;
    case "fail": return <XCircle className="h-4 w-4 text-[hsl(var(--risk-high))] shrink-0 mt-0.5" />;
  }
};

const statusBadgeClass = (status: RuleFinding["status"]) => {
  switch (status) {
    case "pass": return "compliance-badge-high";
    case "review": return "compliance-badge-medium";
    case "not_verified": return "bg-muted text-muted-foreground";
    case "fail": return "compliance-badge-low";
  }
};

const FindingRow = ({ finding }: { finding: RuleFinding }) => (
  <div className="flex items-start gap-3 p-4">
    {statusIcon(finding.status)}
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium">{finding.title}</p>
      <p className="text-sm text-muted-foreground mt-0.5 break-words">{finding.reason}</p>
      {finding.fix && finding.status !== "pass" && (
        <p className="text-xs text-primary mt-1.5">{finding.fix}</p>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
        {finding.sources.map((s) => (
          <a
            key={`${s.market}-${s.url}-${s.clause}`}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            {s.market} · {s.clause} <ExternalLink className="h-3 w-3" />
          </a>
        ))}
      </div>
    </div>
    <span className={`${statusBadgeClass(finding.status)} rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0`}>
      {findingStatusLabel(finding.status)}
    </span>
  </div>
);

const FindingGroup = ({ title, findings }: { title: string; findings: RuleFinding[] }) => {
  const [showPassed, setShowPassed] = useState(false);
  if (findings.length === 0) return null;
  const open = findings.filter((f) => f.status !== "pass");
  const passed = findings.filter((f) => f.status === "pass");

  return (
    <div>
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      </div>
      <div className="divide-y">
        {open.map((f) => <FindingRow key={f.ruleKey} finding={f} />)}
      </div>
      {passed.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowPassed((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-3 text-sm text-muted-foreground hover:text-foreground border-t"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", showPassed && "rotate-180")} />
            {showPassed ? "Hide" : "Show"} {passed.length} passed {passed.length === 1 ? "check" : "checks"}
          </button>
          {showPassed && (
            <div className="divide-y border-t">
              {passed.map((f) => <FindingRow key={f.ruleKey} finding={f} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// One of the three summary counts. Issues and couldn't-check carry the same
// weight: a rule we couldn't check still needs action before the label can
// be relied on. A zero is shown muted.
const SummaryCount = ({ count, label, tone }: { count: number; label: string; tone: "high" | "medium" | "low" }) => (
  <div
    className={cn(
      "rounded-md px-3 py-2",
      count === 0
        ? "bg-muted text-muted-foreground"
        : tone === "high"
          ? "compliance-badge-low"
          : tone === "medium"
            ? "compliance-badge-medium"
            : "compliance-badge-high"
    )}
  >
    <p className="text-2xl font-semibold leading-none tabular-nums">{count}</p>
    <p className="text-xs font-medium mt-1">{label}</p>
  </div>
);

const RuleFindings = ({ findings, rulebook }: { findings: RuleFinding[]; rulebook: RulebookStamp }) => {
  const legal = findings.filter((f) => f.severity === "legal");
  const bestPractice = findings.filter((f) => f.severity === "best_practice");
  const summary = summarizeFindings(findings);

  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 border-b">
        <h2 className="text-base font-semibold">Regulatory checks</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Checked against current {describeMarkets(rulebook.markets)} cosmetics regulations
        </p>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <SummaryCount count={summary.issues} label={summary.issues === 1 ? "Issue found" : "Issues found"} tone="high" />
          <SummaryCount count={summary.notChecked} label="Couldn't check" tone="medium" />
          <SummaryCount count={summary.passed} label="Passed" tone="low" />
        </div>
      </div>
      <div className="divide-y">
        <FindingGroup title="Legal requirements" findings={legal} />
        <FindingGroup title="Best practice" findings={bestPractice} />
      </div>
      <p className="p-4 border-t text-xs text-muted-foreground">{rulebookStampText(rulebook, findings)}</p>
    </div>
  );
};

export default RuleFindings;
