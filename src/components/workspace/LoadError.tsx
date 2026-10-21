import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Shown when a workspace list couldn't be loaded, so a failed request never
// looks like an empty brand ("0 saved labels").
const LoadError = ({ what, onRetry }: { what: string; onRetry: () => void }) => (
  <div role="alert" className="rounded-lg border border-[hsl(var(--risk-high)/0.4)] bg-[hsl(var(--risk-high-bg))] p-4 flex flex-wrap items-center gap-3">
    <AlertTriangle className="h-4 w-4 text-[hsl(var(--risk-high))] shrink-0" />
    <p className="flex-1 min-w-0 text-sm">
      Couldn't load your {what}. Check your connection and try again.
    </p>
    <Button size="sm" variant="outline" className="gap-1.5" onClick={onRetry}>
      <RotateCcw className="h-3.5 w-3.5" /> Try again
    </Button>
  </div>
);

export default LoadError;
