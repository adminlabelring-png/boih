import { X, ScanLine, GitCompare, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ScanHandoff } from "@/lib/scan-to-label";
import { findingStatusLabel, rulebookStampText } from "@/lib/rule-findings";
import { cn } from "@/lib/utils";

// Shown in the label builder after "Fix these" on a scan: the issues the
// rulebook found on the scanned label, as a to-do list for the new draft.
const ScanTodo = ({
  handoff,
  onDismiss,
  changeCount,
  approvedUrl,
  onReview,
}: {
  handoff: ScanHandoff;
  onDismiss: () => void;
  changeCount: number;
  approvedUrl: string | null;
  onReview: () => void;
}) => (
  <section className="mb-6 rounded-lg border border-primary/30 bg-primary/5 p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2">
        <ScanLine className="h-4 w-4 mt-0.5 text-primary shrink-0" />
        <div>
          <h2 className="text-sm font-semibold">From your scan</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {handoff.prefilled.length > 0
              ? `We've filled in ${handoff.prefilled.length} field${handoff.prefilled.length === 1 ? "" : "s"} with what we read off your label — check each one.`
              : "Nothing could be read reliably from the scan, so fill in the fields below."}{" "}
            {handoff.findings.length > 0 && "Then work through these issues:"}
          </p>
        </div>
      </div>
      <button type="button" onClick={onDismiss} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">
        <X className="h-4 w-4" />
      </button>
    </div>
    {handoff.findings.length > 0 && (
      <ul className="mt-4 space-y-3">
        {handoff.findings.map((f) => (
          <li key={f.ruleKey} className="rounded-md border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium">{f.title}</p>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0",
                  f.status === "fail" && "compliance-badge-low",
                  f.status === "review" && "compliance-badge-medium",
                  f.status === "not_verified" && "bg-muted text-muted-foreground"
                )}
              >
                {f.severity === "legal" ? "Legal · " : "Best practice · "}
                {findingStatusLabel(f.status)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{f.reason}</p>
            {f.fix && f.status !== "not_verified" && <p className="text-xs text-primary mt-1">{f.fix}</p>}
          </li>
        ))}
      </ul>
    )}
    <div className="mt-4 flex flex-wrap items-center gap-3">
      {approvedUrl ? (
        <p className="inline-flex items-center gap-1.5 text-sm text-[hsl(var(--risk-low))]">
          <CheckCircle2 className="h-4 w-4" /> New version approved ·{" "}
          <a href={approvedUrl} className="underline" target="_blank" rel="noopener noreferrer">
            view label
          </a>
        </p>
      ) : (
        <Button size="sm" className="gap-2" onClick={onReview}>
          <GitCompare className="h-4 w-4" />
          Review {changeCount > 0 ? `${changeCount} change${changeCount === 1 ? "" : "s"}` : "changes"} and approve
        </Button>
      )}
    </div>
    {handoff.rulebook && (
      <p className="mt-3 text-[11px] text-muted-foreground">{rulebookStampText(handoff.rulebook, handoff.findings)}</p>
    )}
  </section>
);

export default ScanTodo;
