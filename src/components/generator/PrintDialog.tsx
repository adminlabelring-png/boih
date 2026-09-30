import { useState } from "react";
import { AlertTriangle, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEFAULT_PRINT_SPEC, type PrintSpec } from "@/lib/print-label";

export interface PrintOutcome {
  fits: boolean;
  fontSizePt: number;
  minFontSizePt: number;
}

// Asks for the label's physical size, then builds the print-ready PDF.
const PrintDialog = ({
  open,
  onOpenChange,
  onExport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (spec: PrintSpec) => Promise<PrintOutcome>;
}) => {
  const [spec, setSpec] = useState<PrintSpec>(DEFAULT_PRINT_SPEC);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<PrintOutcome | null>(null);

  const num = (k: keyof PrintSpec, min: number, max: number) => (
    <Input
      id={`print-${k}`}
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={0.5}
      value={spec[k]}
      onChange={(e) => {
        const v = Number(e.target.value);
        setOutcome(null);
        setSpec((s) => ({ ...s, [k]: Number.isFinite(v) ? v : s[k] }));
      }}
    />
  );
  const valid =
    spec.widthMm >= 15 && spec.widthMm <= 400 && spec.heightMm >= 15 && spec.heightMm <= 400 &&
    spec.bleedMm >= 0 && spec.bleedMm <= 10 && spec.safeMarginMm >= 0 && spec.safeMarginMm * 2 < Math.min(spec.widthMm, spec.heightMm);

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setOutcome(null); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Print-ready PDF</DialogTitle>
          <DialogDescription>
            Label artwork at its real size with bleed and crop marks, 100% black text and an embedded font, plus a
            compliance summary sheet.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label htmlFor="print-widthMm" className="text-xs">Width (mm)</Label>{num("widthMm", 15, 400)}</div>
          <div className="space-y-1"><Label htmlFor="print-heightMm" className="text-xs">Height (mm)</Label>{num("heightMm", 15, 400)}</div>
          <div className="space-y-1"><Label htmlFor="print-bleedMm" className="text-xs">Bleed (mm)</Label>{num("bleedMm", 0, 10)}</div>
          <div className="space-y-1"><Label htmlFor="print-safeMarginMm" className="text-xs">Safe margin (mm)</Label>{num("safeMarginMm", 0, 10)}</div>
        </div>
        {outcome && (
          <div
            className={
              outcome.fits
                ? "rounded-md bg-[hsl(var(--risk-low-bg))] p-3 text-xs"
                : "rounded-md bg-[hsl(var(--risk-high-bg))] p-3 text-xs flex gap-2"
            }
          >
            {!outcome.fits && <AlertTriangle className="h-4 w-4 shrink-0 text-[hsl(var(--risk-high))]" />}
            <span>
              {outcome.fits
                ? `Downloaded. Text set at ${outcome.fontSizePt.toFixed(2)} pt and fits the safe area.`
                : `Downloaded, but the copy doesn't fit even at the minimum ${outcome.minFontSizePt.toFixed(2)} pt. Make the label bigger, shorten the copy, or move information to a leaflet or outer pack before printing.`}
            </span>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            className="gap-2"
            disabled={!valid || busy}
            onClick={async () => {
              setBusy(true);
              try {
                setOutcome(await onExport(spec));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Download PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PrintDialog;
