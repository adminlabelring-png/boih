import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { LabelChange } from "@/lib/scan-to-label";

// Old (as scanned) vs new (the draft), one reason per change, and a single
// approve action that saves the new version against the scan it replaces.
const ChangeReview = ({
  open,
  onOpenChange,
  changes,
  approving,
  onApprove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changes: LabelChange[];
  approving: boolean;
  onApprove: () => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Review changes</DialogTitle>
        <DialogDescription>
          {changes.length === 0
            ? "The draft is the same as your scanned label. Make the fixes first, then come back here."
            : `${changes.length} change${changes.length === 1 ? "" : "s"} from your scanned label.`}
        </DialogDescription>
      </DialogHeader>

      {changes.length > 0 && (
        <div className="divide-y rounded-lg border">
          {changes.map((c) => (
            <div key={c.key} className="p-3 space-y-2">
              <p className="text-sm font-medium">{c.label}</p>
              <div className="grid gap-2 sm:grid-cols-[1fr,auto,1fr] sm:items-start text-sm">
                <div className="rounded-md bg-[hsl(var(--risk-high-bg))] px-2.5 py-1.5 break-words">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Before</span>
                  {c.before || <span className="italic text-muted-foreground">Not on the label</span>}
                </div>
                <ArrowRight className="hidden sm:block h-4 w-4 mt-3 text-muted-foreground" />
                <div className="rounded-md bg-[hsl(var(--risk-low-bg))] px-2.5 py-1.5 break-words">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">After</span>
                  {c.after || <span className="italic text-muted-foreground">Removed</span>}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Why: {c.reason}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Keep editing
        </Button>
        <Button onClick={onApprove} disabled={approving || changes.length === 0} className="gap-2">
          {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Approve new version
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

export default ChangeReview;
