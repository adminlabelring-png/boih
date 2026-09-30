import jsPDF from "jspdf";
import type { DerivedWarning, LabelFields, NutritionTable, Pack } from "./label-rules";
import { splitAllergenHighlights } from "./allergens";
import type { Market, RuleFinding, RulebookStamp } from "./scan-context";
import { describeMarkets, findingStatusLabel, rulebookStampText } from "./rule-findings";
import { CHECK_DISCLAIMER } from "./disclaimer";

// Print-ready label artwork plus a compliance summary sheet.
//
// Page 1 is the label at its real size: trim + bleed, crop marks outside
// the bleed, TrimBox/BleedBox set for the printer, text in 100% black on
// the K plate only, and an embedded font (Liberation Sans, SIL OFL). The
// copy comes straight from the brand's own field values — never from the
// AI-written preview — and is fitted to the label, down to a minimum
// legible size. Page 2 (A4) records what was checked, against which
// rulebook, and whether the text fitted.

const PT_TO_MM = 25.4 / 72;
// Liberation Sans x-height: 1082 units on a 2048-unit em.
const X_HEIGHT_EM = 1082 / 2048;
const FONT = "LiberationSans";
const LINE_HEIGHT = 1.2;
const MAX_FONT_PT = 9;
const SLUG_MM = 8; // room outside the bleed for crop marks
const CROP_MARK_MM = 5;

// Black on the K plate only: CMYK 0/0/0/100.
const K100: [number, number, number, number] = [0, 0, 0, 1];
// Registration colour for crop marks, so they print on every plate.
const REGISTRATION: [number, number, number, number] = [1, 1, 1, 1];

export interface PrintSpec {
  widthMm: number;
  heightMm: number;
  bleedMm: number;
  safeMarginMm: number;
}

export const DEFAULT_PRINT_SPEC: PrintSpec = { widthMm: 70, heightMm: 50, bleedMm: 3, safeMarginMm: 2 };

export interface FontData {
  regular: string; // base64 TTF
  bold: string;
}

interface Run {
  text: string;
  bold?: boolean;
}

export type Block =
  | { kind: "text"; runs: Run[]; scale?: number }
  | { kind: "table"; title: string; rows: [string, string][] }
  | { kind: "pao"; months: string };

// ------------------------------------------------------------------
// Minimum text size
// ------------------------------------------------------------------

// UK FIC Art. 13 / Annex IV: x-height at least 1.2 mm, or 0.9 mm when the
// largest surface is under 80 cm². Cosmetics have no statutory minimum, so
// the same 0.9 mm floor is used as a legibility guide.
export const minXHeightMm = (pack: Pack, spec: PrintSpec): number => {
  const areaCm2 = (spec.widthMm * spec.heightMm) / 100;
  if (pack === "food") return areaCm2 < 80 ? 0.9 : 1.2;
  return 0.9;
};

export const xHeightToPt = (xHeightMm: number) => xHeightMm / X_HEIGHT_EM / PT_TO_MM;

// ------------------------------------------------------------------
// Content
// ------------------------------------------------------------------

const has = (v: string | undefined | null): v is string => Boolean(v && v.trim());
const text = (s: string, bold = false): Block => ({ kind: "text", runs: [{ text: s, bold }] });
const labelled = (label: string, value: string): Block => ({
  kind: "text",
  runs: [{ text: `${label}: `, bold: true }, { text: value }],
});

const nutritionRows = (n: NutritionTable): [string, string][] =>
  (
    [
      ["Energy", n.energyKj || n.energyKcal ? [n.energyKj && `${n.energyKj}kJ`, n.energyKcal && `${n.energyKcal}kcal`].filter(Boolean).join(" / ") : ""],
      ["Fat", n.fat],
      ["of which saturates", n.saturates],
      ["Carbohydrate", n.carbs],
      ["of which sugars", n.sugars],
      ["Protein", n.protein],
      ["Salt", n.salt],
    ] as [string, string | undefined][]
  )
    .filter(([, v]) => has(v))
    .map(([k, v]) => [k, v as string]);

// Label copy as blocks, from the brand's own values only.
export const labelBlocks = (f: LabelFields, pack: Pack, warnings: DerivedWarning[] = []): Block[] => {
  const b: Block[] = [];
  if (has(f.brandName)) b.push(text(f.brandName, true));
  if (has(f.productName)) b.push({ kind: "text", runs: [{ text: f.productName, bold: true }], scale: 1.3 });

  if (pack === "food") {
    const qty = [f.netQuantity, has(f.alcoholAbv) ? `${f.alcoholAbv.replace(/%.*$/, "")}% vol` : ""].filter(has).join("   ");
    if (qty) b.push(text(qty, true));
    if (has(f.ingredients)) {
      b.push({
        kind: "text",
        runs: [
          { text: "Ingredients: ", bold: true },
          ...splitAllergenHighlights(f.ingredients).map((s) => ({ text: s.text, bold: s.isAllergen })),
        ],
      });
      if (splitAllergenHighlights(f.ingredients).some((s) => s.isAllergen)) {
        b.push(text("Allergy advice: for allergens, see ingredients in bold."));
      }
    }
    if (has(f.bestBefore)) b.push(labelled(f.dateType === "use_by" ? "Use by" : "Best before", f.bestBefore));
    if (has(f.storageInstructions)) b.push(text(f.storageInstructions));
    const rows = nutritionRows(f.nutrition);
    if (rows.length) b.push({ kind: "table", title: "Nutrition per 100g", rows });
    warnings.forEach((w) => b.push(text(w.phrase)));
    if (f.packagedProtectiveAtmosphere) b.push(text("Packaged in a protective atmosphere."));
    if (f.irradiated) b.push(text("Irradiated."));
    if (has(f.responsiblePerson)) b.push(text(f.responsiblePerson));
    if (has(f.countryOfOrigin)) b.push(labelled("Origin", f.countryOfOrigin));
    if (has(f.batchNumber)) b.push(labelled("Lot", f.batchNumber));
    return b;
  }

  if (has(f.netQuantity)) b.push(text(f.netQuantity, true));
  if (has(f.ingredients)) b.push(labelled("Ingredients", f.ingredients));
  if (has(f.instructionsForUse)) b.push(text(f.instructionsForUse));
  if (f.dateType === "pao" && has(f.paoMonths)) b.push({ kind: "pao", months: f.paoMonths.replace(/\D/g, "") });
  else if (has(f.bestBefore)) b.push(labelled("Best before end", f.bestBefore));
  if (has(f.storageInstructions)) b.push(text(f.storageInstructions));
  if (has(f.batchNumber)) b.push(labelled("Batch", f.batchNumber));
  if (has(f.responsiblePerson)) b.push(text(f.responsiblePerson));
  if (has(f.euResponsiblePerson)) b.push(text(f.euResponsiblePerson));
  if (has(f.countryOfOrigin)) b.push(text(/^made in/i.test(f.countryOfOrigin) ? f.countryOfOrigin : `Made in ${f.countryOfOrigin}`));
  if (has(f.certifications)) b.push(text(f.certifications));
  return b;
};

// ------------------------------------------------------------------
// Layout
// ------------------------------------------------------------------

interface Word {
  text: string;
  bold: boolean;
  space: boolean; // followed by a space
}
interface Line {
  words: Word[];
  sizePt: number;
}
type Placed =
  | { kind: "line"; line: Line; y: number }
  | { kind: "row"; left: string; right: string; sizePt: number; y: number; bold?: boolean }
  | { kind: "pao"; months: string; sizePt: number; y: number };

const setFont = (doc: jsPDF, bold: boolean, sizePt: number) => {
  doc.setFont(FONT, bold ? "bold" : "normal");
  doc.setFontSize(sizePt);
};

const widthOf = (doc: jsPDF, w: Word, sizePt: number) => {
  setFont(doc, w.bold, sizePt);
  return doc.getTextWidth(w.text);
};

const toWords = (runs: Run[]): Word[] =>
  runs.flatMap((r) => {
    const parts = r.text.split(/(\s+)/);
    const words: Word[] = [];
    parts.forEach((p) => {
      if (!p) return;
      if (/^\s+$/.test(p)) {
        if (words.length) words[words.length - 1].space = true;
      } else words.push({ text: p, bold: Boolean(r.bold), space: false });
    });
    // a run ending in a space marks its last word
    if (/\s$/.test(r.text) && words.length) words[words.length - 1].space = true;
    return words;
  });

const wrap = (doc: jsPDF, runs: Run[], sizePt: number, maxW: number): Line[] => {
  setFont(doc, false, sizePt);
  const spaceW = doc.getTextWidth(" ");
  const lines: Line[] = [];
  let cur: Word[] = [];
  let curW = 0;
  const flush = () => {
    if (cur.length) lines.push({ words: cur, sizePt });
    cur = [];
    curW = 0;
  };
  for (const w of toWords(runs)) {
    let ww = widthOf(doc, w, sizePt);
    // A single word wider than the line (long INCI names): hard-split it.
    if (ww > maxW) {
      flush();
      let rest = w.text;
      while (rest) {
        let n = rest.length;
        while (n > 1 && widthOf(doc, { ...w, text: rest.slice(0, n) }, sizePt) > maxW) n--;
        const piece = { ...w, text: rest.slice(0, n), space: n >= rest.length ? w.space : false };
        rest = rest.slice(n);
        if (rest) lines.push({ words: [piece], sizePt });
        else {
          cur = [piece];
          curW = widthOf(doc, piece, sizePt) + (piece.space ? spaceW : 0);
        }
      }
      continue;
    }
    if (cur.length && curW + ww > maxW) flush();
    cur.push(w);
    ww += w.space ? spaceW : 0;
    curW += ww;
  }
  flush();
  return lines;
};

export interface LayoutResult {
  placed: Placed[];
  heightMm: number;
  fontSizePt: number;
  minFontSizePt: number;
  fits: boolean;
}

const layoutAt = (doc: jsPDF, blocks: Block[], sizePt: number, widthMm: number) => {
  const placed: Placed[] = [];
  let y = 0;
  const gap = sizePt * PT_TO_MM * 0.35;
  for (const block of blocks) {
    if (block.kind === "text") {
      const s = sizePt * (block.scale ?? 1);
      for (const line of wrap(doc, block.runs, s, widthMm)) {
        y += s * PT_TO_MM * LINE_HEIGHT;
        placed.push({ kind: "line", line, y });
      }
    } else if (block.kind === "table") {
      y += sizePt * PT_TO_MM * LINE_HEIGHT;
      placed.push({ kind: "row", left: block.title, right: "", sizePt, y, bold: true });
      for (const [l, r] of block.rows) {
        y += sizePt * PT_TO_MM * LINE_HEIGHT;
        placed.push({ kind: "row", left: l, right: r, sizePt, y });
      }
    } else {
      // jar body (1.5 × size) plus the open lid above it
      const h = sizePt * 0.95 * PT_TO_MM * 1.5 * 1.6;
      y += h;
      placed.push({ kind: "pao", months: block.months, sizePt, y });
    }
    y += gap;
  }
  return { placed, heightMm: Math.max(0, y - gap) };
};

// Largest font size (≤ 9 pt, in 0.25 pt steps) at which the copy fits the
// safe area, but never below the minimum legible size.
export const fitLayout = (doc: jsPDF, blocks: Block[], widthMm: number, heightMm: number, minPt: number): LayoutResult => {
  for (let s = MAX_FONT_PT; s >= minPt; s -= 0.25) {
    const r = layoutAt(doc, blocks, s, widthMm);
    if (r.heightMm <= heightMm) return { ...r, fontSizePt: s, minFontSizePt: minPt, fits: true };
  }
  const r = layoutAt(doc, blocks, minPt, widthMm);
  return { ...r, fontSizePt: minPt, minFontSizePt: minPt, fits: false };
};

// ------------------------------------------------------------------
// Drawing
// ------------------------------------------------------------------

const mmToPt = (mm: number) => mm / PT_TO_MM;

const drawCropMarks = (doc: jsPDF, x0: number, y0: number, w: number, h: number, bleed: number) => {
  doc.setDrawColor(...REGISTRATION);
  doc.setLineWidth(0.25 * PT_TO_MM);
  const off = bleed + 1;
  const corners: [number, number, number, number][] = [
    [x0, y0, -1, -1],
    [x0 + w, y0, 1, -1],
    [x0, y0 + h, -1, 1],
    [x0 + w, y0 + h, 1, 1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    doc.line(cx + dx * off, cy, cx + dx * (off + CROP_MARK_MM), cy);
    doc.line(cx, cy + dy * off, cx, cy + dy * (off + CROP_MARK_MM));
  }
};

// Period-after-opening symbol: an open jar, sized to the months text
// inside it, with its lid hinged open at the back.
const drawPao = (doc: jsPDF, x: number, baseline: number, sizePt: number, months: string) => {
  const label = `${months}M`;
  const s = sizePt * 0.95;
  setFont(doc, true, s);
  const pad = 0.8;
  const w = doc.getTextWidth(label) + pad * 2;
  const bodyH = s * PT_TO_MM * 1.5;
  const top = baseline - bodyH;
  doc.setDrawColor(...K100);
  doc.setLineWidth(0.2);
  doc.rect(x, top, w, bodyH);
  // open lid: from the back-left corner, tilted up and over
  const lidRise = bodyH * 0.55;
  doc.line(x, top, x + w * 0.85, top - lidRise);
  doc.line(x + w * 0.85, top - lidRise, x + w * 0.95, top - lidRise * 0.7);
  doc.setTextColor(...K100);
  doc.text(label, x + w / 2, top + bodyH / 2, { align: "center", baseline: "middle" });
};

const drawPlaced = (doc: jsPDF, placed: Placed[], x: number, top: number, width: number) => {
  doc.setTextColor(...K100);
  for (const p of placed) {
    const baseline = top + p.y - (p.kind === "line" ? p.line.sizePt : p.sizePt) * PT_TO_MM * (LINE_HEIGHT - 1);
    if (p.kind === "line") {
      let cx = x;
      for (const w of p.line.words) {
        setFont(doc, w.bold, p.line.sizePt);
        doc.text(w.text, cx, baseline);
        cx += doc.getTextWidth(w.text) + (w.space ? doc.getTextWidth(" ") : 0);
      }
    } else if (p.kind === "row") {
      setFont(doc, Boolean(p.bold), p.sizePt);
      doc.text(p.left, x, baseline);
      if (p.right) doc.text(p.right, x + width, baseline, { align: "right" });
    } else {
      drawPao(doc, x, baseline, p.sizePt, p.months);
    }
  }
};

export const registerFonts = (doc: jsPDF, fonts: FontData) => {
  doc.addFileToVFS("LiberationSans-Regular.ttf", fonts.regular);
  doc.addFont("LiberationSans-Regular.ttf", FONT, "normal");
  doc.addFileToVFS("LiberationSans-Bold.ttf", fonts.bold);
  doc.addFont("LiberationSans-Bold.ttf", FONT, "bold");
};

const toBase64 = (buf: ArrayBuffer) => {
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export const loadFonts = async (baseUrl = import.meta.env?.BASE_URL ?? "/"): Promise<FontData> => {
  const get = async (name: string) => {
    const res = await fetch(`${baseUrl}fonts/${name}`);
    if (!res.ok) throw new Error(`Couldn't load font ${name}`);
    return toBase64(await res.arrayBuffer());
  };
  const [regular, bold] = await Promise.all([get("LiberationSans-Regular.ttf"), get("LiberationSans-Bold.ttf")]);
  return { regular, bold };
};

// ------------------------------------------------------------------
// Document
// ------------------------------------------------------------------

export interface PrintInput {
  fields: LabelFields;
  pack: Pack;
  warnings?: DerivedWarning[];
  spec: PrintSpec;
  fonts: FontData;
  markets?: Market[];
  findings?: RuleFinding[] | null;
  rulebook?: RulebookStamp | null;
  builtInChecks?: { label: string; status: "ok" | "review" | "missing" }[];
}

export interface PrintResult {
  doc: jsPDF;
  layout: LayoutResult;
}

export const buildPrintPdf = (input: PrintInput): PrintResult => {
  const { spec } = input;
  const margin = spec.bleedMm + SLUG_MM;
  const pageW = spec.widthMm + margin * 2;
  const pageH = spec.heightMm + margin * 2;

  const doc = new jsPDF({
    unit: "mm",
    format: [pageW, pageH],
    orientation: pageW > pageH ? "l" : "p",
    compress: true,
    // Only declare fonts actually used, so preflight sees no unembedded fonts.
    putOnlyUsedFonts: true,
  });
  registerFonts(doc, input.fonts);
  doc.setProperties({
    title: `${input.fields.productName || "Label"} — print artwork`,
    subject: "Label artwork and compliance summary",
    creator: "Labelring",
  });

  // Page 1: artwork
  const trimX = margin;
  const trimY = margin;
  const info = doc.getPageInfo(1).pageContext as {
    trimBox: unknown;
    bleedBox: unknown;
  };
  const box = (inset: number) => ({
    bottomLeftX: mmToPt(inset),
    bottomLeftY: mmToPt(inset),
    topRightX: mmToPt(pageW - inset),
    topRightY: mmToPt(pageH - inset),
  });
  info.trimBox = box(margin);
  info.bleedBox = box(margin - spec.bleedMm);

  drawCropMarks(doc, trimX, trimY, spec.widthMm, spec.heightMm, spec.bleedMm);

  const safeX = trimX + spec.safeMarginMm;
  const safeY = trimY + spec.safeMarginMm;
  const safeW = spec.widthMm - spec.safeMarginMm * 2;
  const safeH = spec.heightMm - spec.safeMarginMm * 2;
  const minPt = xHeightToPt(minXHeightMm(input.pack, spec));
  const blocks = labelBlocks(input.fields, input.pack, input.warnings);
  const layout = fitLayout(doc, blocks, safeW, safeH, Math.round(minPt * 4) / 4);
  drawPlaced(doc, layout.placed, safeX, safeY, safeW);

  // Page 2: compliance summary sheet
  doc.addPage("a4", "p");
  const W = 210;
  let y = 20;
  const line = (s: string, opts: { size?: number; bold?: boolean; indent?: number } = {}) => {
    setFont(doc, Boolean(opts.bold), opts.size ?? 10);
    doc.setTextColor(...K100);
    const wrapped = doc.splitTextToSize(s, W - 28 - (opts.indent ?? 0)) as string[];
    for (const l of wrapped) {
      if (y > 280) {
        doc.addPage("a4", "p");
        y = 20;
      }
      doc.text(l, 14 + (opts.indent ?? 0), y);
      y += (opts.size ?? 10) * PT_TO_MM * 1.35;
    }
  };
  line("Label compliance summary", { size: 16, bold: true });
  y += 2;
  line(`Product: ${input.fields.productName || "—"}${input.fields.brandName ? ` (${input.fields.brandName})` : ""}`);
  line(`Category: ${input.fields.category || "—"}`);
  if (input.markets?.length) line(`Markets: ${describeMarkets(input.markets)}`);
  line(`Generated: ${new Date().toLocaleString("en-GB")}`);
  y += 3;

  line("Artwork", { size: 12, bold: true });
  line(`Trim size ${spec.widthMm} × ${spec.heightMm} mm, ${spec.bleedMm} mm bleed, ${spec.safeMarginMm} mm safe margin. Text 100% K (CMYK 0/0/0/100); crop marks in registration.`);
  line(
    `Body text ${layout.fontSizePt.toFixed(2)} pt (x-height ${(layout.fontSizePt * PT_TO_MM * X_HEIGHT_EM).toFixed(2)} mm). Minimum used: ${layout.minFontSizePt.toFixed(2)} pt (x-height ${minXHeightMm(input.pack, spec)} mm${input.pack === "food" ? ", UK FIC Annex IV" : ", legibility guide — no statutory minimum for cosmetics"}).`
  );
  line(
    layout.fits
      ? "All copy fits inside the safe area."
      : "WARNING: the copy does not fit at the minimum size. Increase the label size, shorten the copy, or move information to a leaflet or outer pack.",
    { bold: !layout.fits }
  );
  y += 3;

  line("Checks", { size: 12, bold: true });
  if (input.findings && input.findings.length && input.rulebook) {
    for (const sev of ["legal", "best_practice"] as const) {
      const group = input.findings.filter((f) => f.severity === sev);
      if (!group.length) continue;
      line(sev === "legal" ? "Legal requirements" : "Best practice", { bold: true });
      for (const f of group) {
        line(`${f.title} — ${findingStatusLabel(f.status)}`, { indent: 3 });
        line(`${f.reason}${f.status !== "pass" && f.fix ? ` ${f.fix}` : ""}`, { size: 8.5, indent: 6 });
        line(f.sources.map((s) => `${s.market} ${s.clause}: ${s.url}`).join("; "), { size: 7.5, indent: 6 });
      }
    }
    y += 2;
    line(rulebookStampText(input.rulebook, input.findings), { size: 9 });
  } else if (input.builtInChecks?.length) {
    for (const c of input.builtInChecks) {
      line(`${c.label} — ${c.status === "ok" ? "OK" : c.status === "review" ? "Needs review" : "Not provided"}`, { indent: 3 });
    }
  } else {
    line("No checks were run for this label.");
  }
  y += 4;
  line(CHECK_DISCLAIMER, { size: 8.5 });

  return { doc, layout };
};
