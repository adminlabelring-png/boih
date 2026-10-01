import jsPDF from "jspdf";
import type { DerivedWarning, LabelFields, NutritionTable, Pack } from "./label-rules";
import { splitAllergenHighlights } from "./allergens";
import type { Market, RuleFinding, RulebookStamp } from "./scan-context";
import { describeMarkets, findingStatusLabel, rulebookStampText } from "./rule-findings";
import { CHECK_DISCLAIMER } from "./disclaimer";
import { BARCODE_GEOMETRY, barcodeSizeMm, fitMagnification, isGuardModule, type Barcode } from "./barcode";
import { addCmykImage, applyPdfX1a, OUTPUT_CONDITIONS, type CmykImage, type OutputCondition } from "./pdfx";

// Print-ready label artwork plus a compliance summary sheet, as PDF/X-1a.
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

export type Cmyk = [number, number, number, number]; // 0–1 each

// Optional artwork: a brand colour for the brand and product names, a
// logo, a retail barcode and the hand-in-book symbol.
export interface PrintExtras {
  accent?: Cmyk | null;
  logo?: (CmykImage & { heightMm: number }) | null;
  barcode?: Barcode | null;
  leafletSymbol?: boolean;
  outputCondition?: OutputCondition;
}

export interface FontData {
  regular: string; // base64 TTF
  bold: string;
}

interface Run {
  text: string;
  bold?: boolean;
  accent?: boolean;
}

export type Symbol = "hourglass" | "leaflet";

export type Block =
  | { kind: "text"; runs: Run[]; scale?: number; icon?: Symbol }
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
export const labelBlocks = (
  f: LabelFields,
  pack: Pack,
  warnings: DerivedWarning[] = [],
  opts: { leafletSymbol?: boolean } = {}
): Block[] => {
  const b: Block[] = [];
  if (has(f.brandName)) b.push({ kind: "text", runs: [{ text: f.brandName, bold: true, accent: true }] });
  if (has(f.productName)) b.push({ kind: "text", runs: [{ text: f.productName, bold: true, accent: true }], scale: 1.3 });

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
  // Hand-in-book (Reg. 1223/2009 Annex VII.1): information on an enclosed
  // leaflet, tag or card.
  if (opts.leafletSymbol) b.push({ kind: "text", runs: [{ text: "See enclosed information." }], icon: "leaflet" });
  if (has(f.ingredients)) b.push(labelled("Ingredients", f.ingredients));
  if (has(f.instructionsForUse)) b.push(text(f.instructionsForUse));
  if (f.dateType === "pao" && has(f.paoMonths)) b.push({ kind: "pao", months: f.paoMonths.replace(/\D/g, "") });
  // Hourglass (Annex VII.3) before the date of minimum durability.
  else if (has(f.bestBefore))
    b.push({ kind: "text", runs: [{ text: "Best before end: ", bold: true }, { text: f.bestBefore }], icon: "hourglass" });
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
  accent?: boolean;
  space: boolean; // followed by a space
}
interface Line {
  words: Word[];
  sizePt: number;
  indentMm?: number;
  icon?: Symbol;
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
      } else words.push({ text: p, bold: Boolean(r.bold), accent: r.accent, space: false });
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
      // A symbol sits before the first line; the text keeps clear of it.
      const indent = block.icon ? iconWidthMm(s) + s * PT_TO_MM * 0.4 : 0;
      wrap(doc, block.runs, s, widthMm - indent).forEach((line, i) => {
        y += s * PT_TO_MM * LINE_HEIGHT * (i === 0 && block.icon ? 1.15 : 1);
        placed.push({ kind: "line", line: { ...line, indentMm: indent, icon: i === 0 ? block.icon : undefined }, y });
      });
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

const iconWidthMm = (sizePt: number) => sizePt * PT_TO_MM * 1.35;

// Hourglass (Annex VII.3): two triangles meeting at the waist, with caps.
const drawHourglass = (doc: jsPDF, x: number, baseline: number, sizePt: number, color: Cmyk) => {
  const h = sizePt * PT_TO_MM * 1.05;
  const w = h * 0.62;
  const top = baseline - h + sizePt * PT_TO_MM * 0.12;
  const cx = x + iconWidthMm(sizePt) / 2;
  doc.setDrawColor(...color);
  doc.setLineWidth(Math.max(0.12, h * 0.07));
  doc.line(cx - w / 2 - h * 0.06, top, cx + w / 2 + h * 0.06, top);
  doc.line(cx - w / 2 - h * 0.06, top + h, cx + w / 2 + h * 0.06, top + h);
  doc.lines(
    [
      [w, 0],
      [-w, h],
      [w, 0],
      [-w, -h],
    ],
    cx - w / 2,
    top,
    [1, 1],
    "S",
    true
  );
  // sand in the lower bulb
  doc.setFillColor(...color);
  doc.triangle(cx, top + h * 0.55, cx - w * 0.36, top + h * 0.95, cx + w * 0.36, top + h * 0.95, "F");
};

// Filled or stroked polygon from points in a unit square scaled to size.
const polygon = (doc: jsPDF, pts: [number, number][], x: number, y: number, size: number, style: "F" | "S") => {
  const deltas = pts.slice(1).map((p, k) => [(p[0] - pts[k][0]) * size, (p[1] - pts[k][1]) * size]);
  doc.lines(deltas, x + pts[0][0] * size, y + pts[0][1] * size, [1, 1], style, true);
};

// Hand-in-book (Annex VII.1): an open book with a hand pointing into it.
const drawLeaflet = (doc: jsPDF, x: number, baseline: number, sizePt: number, color: Cmyk) => {
  const size = iconWidthMm(sizePt);
  const top = baseline - size * 0.92;
  doc.setDrawColor(...color);
  doc.setFillColor(...color);
  doc.setLineWidth(Math.max(0.1, size * 0.05));
  // open book, pages fanning out from the spine
  polygon(doc, [[0.02, 0.6], [0.46, 0.7], [0.46, 1], [0.02, 0.9]], x, top, size, "S");
  polygon(doc, [[0.46, 0.7], [0.9, 0.6], [0.9, 0.9], [0.46, 1]], x, top, size, "S");
  // hand from the top right, index finger pointing down into the book
  polygon(
    doc,
    [[0.44, 0.66], [0.5, 0.68], [0.72, 0.4], [0.84, 0.42], [0.94, 0.28], [0.98, 0.14], [0.86, 0.02], [0.68, 0.08], [0.6, 0.2], [0.64, 0.32]],
    x,
    top,
    size,
    "F"
  );
};

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

const drawPlaced = (doc: jsPDF, placed: Placed[], x: number, top: number, width: number, accent: Cmyk = K100) => {
  doc.setTextColor(...K100);
  for (const p of placed) {
    const baseline = top + p.y - (p.kind === "line" ? p.line.sizePt : p.sizePt) * PT_TO_MM * (LINE_HEIGHT - 1);
    if (p.kind === "line") {
      if (p.line.icon === "hourglass") drawHourglass(doc, x, baseline, p.line.sizePt, K100);
      if (p.line.icon === "leaflet") drawLeaflet(doc, x, baseline, p.line.sizePt, K100);
      let cx = x + (p.line.indentMm ?? 0);
      for (const w of p.line.words) {
        setFont(doc, w.bold, p.line.sizePt);
        doc.setTextColor(...(w.accent ? accent : K100));
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

// Bars as filled rectangles in 100% K, quiet zones left clear, digits
// underneath; guard bars run 5 modules longer.
const drawBarcode = (doc: jsPDF, bc: Barcode, x: number, top: number, magnification: number) => {
  const g = BARCODE_GEOMETRY[bc.type];
  const { moduleMm } = barcodeSizeMm(bc.type, magnification);
  const barH = g.barHeightMm * magnification - 5 * moduleMm;
  const x0 = x + g.quietLeft * moduleMm;
  doc.setFillColor(...K100);
  let i = 0;
  while (i < bc.modules.length) {
    if (bc.modules[i] !== "1") {
      i++;
      continue;
    }
    let j = i;
    while (j < bc.modules.length && bc.modules[j] === "1") j++;
    const guard = isGuardModule(bc.type, i);
    doc.rect(x0 + i * moduleMm, top, (j - i) * moduleMm, barH + (guard ? 5 * moduleMm : 0), "F");
    i = j;
  }
  const digitPt = (2.2 * magnification) / 0.716 / PT_TO_MM;
  setFont(doc, false, digitPt);
  doc.setTextColor(...K100);
  const base = top + barH + 2.6 * magnification;
  const groups =
    bc.type === "EAN13"
      ? [
          { s: bc.digits[0], at: -g.quietLeft / 2 - 1.5 },
          { s: bc.digits.slice(1, 7), at: 3 + 21 },
          { s: bc.digits.slice(7), at: 50 + 21 },
        ]
      : [
          { s: bc.digits.slice(0, 4), at: 3 + 14 },
          { s: bc.digits.slice(4), at: 36 + 14 },
        ];
  for (const grp of groups) doc.text(grp.s, x0 + grp.at * moduleMm, base, { align: "center" });
};

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
  extras?: PrintExtras;
}

export interface PrintResult {
  doc: jsPDF;
  layout: LayoutResult;
  // Things to fix or check before printing (barcode didn't fit, low-
  // resolution logo, heavy ink, …).
  warnings: string[];
  barcodeMagnification: number | null;
}

// Total area coverage of a CMYK colour, in %.
export const inkCoverage = (c: Cmyk) => Math.round((c[0] + c[1] + c[2] + c[3]) * 100);
const cmykText = (c: Cmyk) => `C${Math.round(c[0] * 100)} M${Math.round(c[1] * 100)} Y${Math.round(c[2] * 100)} K${Math.round(c[3] * 100)}`;

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
  const extras = input.extras ?? {};
  const accent = extras.accent ?? K100;
  const warnings: string[] = [];

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
  const gapMm = 1.5;

  // Logo at the top of the safe area.
  let textTop = safeY;
  let logoPpi: number | null = null;
  if (extras.logo) {
    let h = Math.min(extras.logo.heightMm, safeH * 0.3);
    let w = (h * extras.logo.width) / extras.logo.height;
    if (w > safeW) {
      w = safeW;
      h = (w * extras.logo.height) / extras.logo.width;
    }
    addCmykImage(doc, extras.logo, safeX, safeY, w, h, "brand-logo");
    logoPpi = Math.round(extras.logo.width / (w / 25.4));
    if (logoPpi < 300) warnings.push(`The logo is ${logoPpi} ppi at this size; 300 ppi or more prints sharp. Upload a larger image.`);
    textTop += h + gapMm;
  }

  // Barcode at the bottom of the safe area, as large as fits up to 100%.
  let barcodeMagnification: number | null = null;
  let textBottom = safeY + safeH;
  if (extras.barcode) {
    barcodeMagnification = fitMagnification(extras.barcode.type, safeW);
    if (barcodeMagnification === null) {
      warnings.push(
        `The barcode needs at least ${barcodeSizeMm(extras.barcode.type, 0.8).widthMm.toFixed(1)} mm of width (80% size with quiet zones); this label has ${safeW.toFixed(1)} mm inside the safe margin. Print it on the outer pack, or make the label wider.`
      );
    } else {
      const size = barcodeSizeMm(extras.barcode.type, barcodeMagnification);
      if (size.heightMm > (textBottom - textTop) * 0.6) {
        warnings.push("The barcode takes most of the label; consider printing it on the outer pack.");
      }
      drawBarcode(doc, extras.barcode, safeX, textBottom - size.heightMm, barcodeMagnification);
      textBottom -= size.heightMm + gapMm;
    }
  }

  const minPt = xHeightToPt(minXHeightMm(input.pack, spec));
  const blocks = labelBlocks(input.fields, input.pack, input.warnings, { leafletSymbol: extras.leafletSymbol });
  const layout = fitLayout(doc, blocks, safeW, Math.max(0, textBottom - textTop), Math.round(minPt * 4) / 4);
  drawPlaced(doc, layout.placed, safeX, textTop, safeW, accent);

  if (extras.accent) {
    const tac = inkCoverage(extras.accent);
    if (tac > 300) warnings.push(`The brand colour uses ${tac}% ink in total; most presses need 300% or less.`);
    const plates = extras.accent.filter((v) => v > 0.05).length;
    if (plates > 1 && layout.fontSizePt * 1.3 < 8) {
      warnings.push("The brand colour prints on more than one plate at a small size; slight misregistration can blur it. A single-plate colour or larger text is safer.");
    }
  }
  if (spec.bleedMm < 3) warnings.push(`Bleed is ${spec.bleedMm} mm; most printers ask for 3 mm.`);
  if (!layout.fits) warnings.push("The copy doesn't fit at the minimum text size.");

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

  const condition = extras.outputCondition ?? OUTPUT_CONDITIONS[0];
  line("Artwork", { size: 12, bold: true });
  line(`PDF/X-1a:2001, CMYK, for ${condition.info}. Ask your printer which printing condition they use.`);
  line(`Trim size ${spec.widthMm} × ${spec.heightMm} mm, ${spec.bleedMm} mm bleed, ${spec.safeMarginMm} mm safe margin. Body text 100% K (CMYK 0/0/0/100); crop marks in registration.`);
  if (extras.accent) line(`Brand colour (brand and product name): ${cmykText(extras.accent)}, ${inkCoverage(extras.accent)}% total ink.`);
  if (extras.logo) line(`Logo: ${extras.logo.width} × ${extras.logo.height} px, ${logoPpi} ppi as placed; converted from RGB to CMYK without colour management, so check its colours on a proof.`);
  if (extras.barcode) {
    line(
      barcodeMagnification === null
        ? `Barcode ${extras.barcode.digits}: not placed, it doesn't fit at the 80% minimum size.`
        : `Barcode ${extras.barcode.type === "EAN13" ? "EAN-13" : "EAN-8"} ${extras.barcode.digits} at ${Math.round(barcodeMagnification * 100)}% (${barcodeSizeMm(extras.barcode.type, barcodeMagnification).widthMm.toFixed(1)} mm wide with quiet zones), bars in 100% K. Verify with a barcode grader before a large run.`
    );
  }
  if (extras.leafletSymbol) line("Hand-in-book symbol: information is on an enclosed leaflet, tag or card (Reg. (EC) 1223/2009 Annex VII.1).");
  if (input.fields.dateType !== "pao" && input.pack === "cosmetic" && input.fields.bestBefore?.trim())
    line("Hourglass symbol before the date of minimum durability (Annex VII.3).");
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
  if (warnings.length) {
    y += 2;
    line("Check before printing", { size: 12, bold: true });
    warnings.forEach((w) => line(`• ${w}`, { indent: 3 }));
  }
  y += 4;
  line(CHECK_DISCLAIMER, { size: 8.5 });

  applyPdfX1a(doc, condition);
  return { doc, layout, warnings, barcodeMagnification };
};
