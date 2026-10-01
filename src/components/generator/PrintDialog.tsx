import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Printer, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEFAULT_PRINT_SPEC, inkCoverage, type Cmyk, type PrintExtras, type PrintSpec } from "@/lib/print-label";
import { OUTPUT_CONDITIONS, rgbaToCmyk, type CmykImage, type PreflightCheck } from "@/lib/pdfx";
import { parseGtin } from "@/lib/barcode";

export interface PrintOutcome {
  fits: boolean;
  fontSizePt: number;
  minFontSizePt: number;
  warnings: string[];
  preflight: PreflightCheck[];
}

// Screen preview of a CMYK colour (uncalibrated).
const cmykToCss = ([c, m, y, k]: Cmyk) =>
  `rgb(${Math.round(255 * (1 - c) * (1 - k))}, ${Math.round(255 * (1 - m) * (1 - k))}, ${Math.round(255 * (1 - y) * (1 - k))})`;

// Longest side kept for the logo: plenty for 300 ppi at label sizes.
const MAX_LOGO_PX = 2000;

const loadLogo = (file: File): Promise<CmykImage> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_LOGO_PX / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Couldn't read the image."));
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      URL.revokeObjectURL(url);
      resolve({ width: w, height: h, cmyk: rgbaToCmyk(data) });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read the image. Use a PNG or JPG."));
    };
    img.src = url;
  });

// Asks for the label's size and optional artwork extras, then builds the
// print-ready PDF/X-1a file and shows its preflight.
const PrintDialog = ({
  open,
  onOpenChange,
  onExport,
  defaultLeafletSymbol = false,
  showSymbols = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (spec: PrintSpec, extras: PrintExtras) => Promise<PrintOutcome>;
  defaultLeafletSymbol?: boolean;
  showSymbols?: boolean;
}) => {
  const [spec, setSpec] = useState<PrintSpec>(DEFAULT_PRINT_SPEC);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<PrintOutcome | null>(null);
  const [useAccent, setUseAccent] = useState(false);
  const [accent, setAccent] = useState<Cmyk>([0, 0.85, 0.3, 0]);
  const [logo, setLogo] = useState<CmykImage | null>(null);
  const [logoName, setLogoName] = useState("");
  const [logoError, setLogoError] = useState("");
  const [logoHeight, setLogoHeight] = useState(8);
  const [gtin, setGtin] = useState("");
  const [leaflet, setLeaflet] = useState(defaultLeafletSymbol);
  const [condition, setCondition] = useState(OUTPUT_CONDITIONS[0].id);

  useEffect(() => setLeaflet(defaultLeafletSymbol), [defaultLeafletSymbol]);

  const changed = () => setOutcome(null);
  const parsedGtin = gtin.trim() ? parseGtin(gtin) : null;

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
        changed();
        setSpec((s) => ({ ...s, [k]: Number.isFinite(v) ? v : s[k] }));
      }}
    />
  );
  const valid =
    spec.widthMm >= 15 && spec.widthMm <= 400 && spec.heightMm >= 15 && spec.heightMm <= 400 &&
    spec.bleedMm >= 0 && spec.bleedMm <= 10 && spec.safeMarginMm >= 0 && spec.safeMarginMm * 2 < Math.min(spec.widthMm, spec.heightMm) &&
    !(parsedGtin && !parsedGtin.ok);

  const extras = (): PrintExtras => ({
    accent: useAccent ? accent : null,
    logo: logo ? { ...logo, heightMm: logoHeight } : null,
    barcode: parsedGtin && parsedGtin.ok ? parsedGtin.barcode : null,
    leafletSymbol: showSymbols && leaflet,
    outputCondition: OUTPUT_CONDITIONS.find((c) => c.id === condition),
  });

  const preflightOk = outcome?.preflight.every((c) => c.ok);

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setOutcome(null); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Print-ready PDF</DialogTitle>
          <DialogDescription>
            PDF/X-1a artwork at the label's real size, with bleed, crop marks, CMYK colour and embedded fonts, plus a
            compliance summary sheet.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Size</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label htmlFor="print-widthMm" className="text-xs">Width (mm)</Label>{num("widthMm", 15, 400)}</div>
            <div className="space-y-1"><Label htmlFor="print-heightMm" className="text-xs">Height (mm)</Label>{num("heightMm", 15, 400)}</div>
            <div className="space-y-1"><Label htmlFor="print-bleedMm" className="text-xs">Bleed (mm)</Label>{num("bleedMm", 0, 10)}</div>
            <div className="space-y-1"><Label htmlFor="print-safeMarginMm" className="text-xs">Safe margin (mm)</Label>{num("safeMarginMm", 0, 10)}</div>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Artwork</h3>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={useAccent} onCheckedChange={(v) => { setUseAccent(v === true); changed(); }} />
              Brand colour for the brand and product name
            </label>
            {useAccent && (
              <div className="flex items-end gap-2 pl-6">
                {(["C", "M", "Y", "K"] as const).map((ch, i) => (
                  <div key={ch} className="space-y-1 w-16">
                    <Label htmlFor={`accent-${ch}`} className="text-xs">{ch} %</Label>
                    <Input
                      id={`accent-${ch}`}
                      type="number"
                      min={0}
                      max={100}
                      value={Math.round(accent[i] * 100)}
                      onChange={(e) => {
                        const v = Math.min(100, Math.max(0, Number(e.target.value) || 0)) / 100;
                        setAccent((a) => a.map((x, j) => (j === i ? v : x)) as Cmyk);
                        changed();
                      }}
                    />
                  </div>
                ))}
                <div className="h-9 w-9 rounded border shrink-0" style={{ background: cmykToCss(accent) }} title="Screen preview" />
                <span className="text-[11px] text-muted-foreground pb-2">{inkCoverage(accent)}% ink</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="print-logo" className="text-xs">Logo (PNG or JPG, optional)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="print-logo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="text-xs"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  setLogoError("");
                  changed();
                  if (!f) return setLogo(null);
                  try {
                    setLogo(await loadLogo(f));
                    setLogoName(f.name);
                  } catch (err) {
                    setLogo(null);
                    setLogoError((err as Error).message);
                  }
                }}
              />
              {logo && (
                <div className="w-24 space-y-1 shrink-0">
                  <Label htmlFor="print-logo-h" className="text-[10px]">Height (mm)</Label>
                  <Input id="print-logo-h" type="number" min={3} max={60} value={logoHeight} onChange={(e) => { setLogoHeight(Math.max(3, Number(e.target.value) || 8)); changed(); }} />
                </div>
              )}
            </div>
            {logo && <p className="text-[11px] text-muted-foreground">{logoName}: {logo.width} × {logo.height} px, converted to CMYK.</p>}
            {logoError && <p className="text-[11px] text-destructive">{logoError}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="print-gtin" className="text-xs">Barcode number (EAN-13, UPC-A or EAN-8, optional)</Label>
            <Input id="print-gtin" inputMode="numeric" placeholder="e.g. 5012345678900" value={gtin} onChange={(e) => { setGtin(e.target.value); changed(); }} />
            {parsedGtin && !parsedGtin.ok && <p className="text-[11px] text-destructive">{(parsedGtin as { error: string }).error}</p>}
            {parsedGtin?.ok && <p className="text-[11px] text-muted-foreground">Placed at the bottom of the label at 80–100% size, in 100% black.</p>}
          </div>

          {showSymbols && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox className="mt-0.5" checked={leaflet} onCheckedChange={(v) => { setLeaflet(v === true); changed(); }} />
              <span>
                Hand-in-book symbol
                <span className="block text-[11px] text-muted-foreground">Some information is on an enclosed leaflet, tag or card.</span>
              </span>
            </label>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="print-condition" className="text-xs">Printing condition</Label>
            <Select value={condition} onValueChange={(v) => { setCondition(v); changed(); }}>
              <SelectTrigger id="print-condition"><SelectValue /></SelectTrigger>
              <SelectContent>
                {OUTPUT_CONDITIONS.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Ask your printer if unsure; most European label printers use FOGRA39.</p>
          </div>
        </section>

        {outcome && (
          <div className="space-y-2">
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
            {outcome.warnings.filter((w) => !/doesn't fit at the minimum/.test(w)).length > 0 && (
              <ul className="rounded-md bg-[hsl(var(--risk-medium-bg))] p-3 text-xs space-y-1">
                {outcome.warnings
                  .filter((w) => !/doesn't fit at the minimum/.test(w))
                  .map((w) => <li key={w}>• {w}</li>)}
              </ul>
            )}
            <div className="rounded-md border p-3 text-xs space-y-1">
              <p className="font-medium">
                PDF/X-1a preflight: {preflightOk ? "passed" : "problems found"}
              </p>
              {outcome.preflight.map((c) => (
                <div key={c.label} className="flex items-center gap-1.5">
                  {c.ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--risk-low))]" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-[hsl(var(--risk-high))]" />
                  )}
                  <span>{c.label}{c.detail ? ` (${c.detail})` : ""}</span>
                </div>
              ))}
            </div>
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
                setOutcome(await onExport(spec, extras()));
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
