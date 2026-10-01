import jsPDF from "jspdf";
import { unzlibSync, zlibSync } from "fflate";

// PDF/X-1a:2001 output for print artwork, and a preflight that checks a
// finished PDF against the PDF/X-1a rules we can verify ourselves.
//
// PDF/X-1a means: CMYK (or grey) only, every font embedded, no
// transparency, a TrimBox on every page, and an output intent naming the
// printing condition the colours are meant for. A registered condition
// (FOGRA39 etc.) is identified by name, so no ICC profile is embedded.

export interface OutputCondition {
  id: string; // ICC registry name
  label: string;
  info: string;
}

export const OUTPUT_CONDITIONS: OutputCondition[] = [
  { id: "FOGRA39", label: "Coated paper (FOGRA39)", info: "Coated FOGRA39 (ISO 12647-2:2004)" },
  { id: "FOGRA29", label: "Uncoated paper (FOGRA29)", info: "Uncoated FOGRA29 (ISO 12647-2:2004)" },
  { id: "CGATS TR 006", label: "US coated (GRACoL / TR 006)", info: "GRACoL 2006 Coated #1 (CGATS TR 006)" },
];

const pdfString = (s: string) => `(${s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")})`;

type Box = { bottomLeftX: number; bottomLeftY: number; topRightX: number; topRightY: number };
interface PageContext {
  mediaBox: Box;
  trimBox?: Box;
  bleedBox?: Box;
}
interface JsPdfPrivate {
  __private__: { getDocumentProperties: () => Record<string, string> };
  getCreationDate: (type?: string) => string;
}

// Mark the document as PDF/X-1a:2001. Call before saving; pass the output
// through finishPdfX.
export const applyPdfX1a = (doc: jsPDF, condition: OutputCondition = OUTPUT_CONDITIONS[0]) => {
  const priv = doc as unknown as JsPdfPrivate;
  const props = priv.__private__.getDocumentProperties();
  props.GTS_PDFXVersion = "PDF/X-1a:2001";
  props.GTS_PDFXConformance = "PDF/X-1a:2001";
  props.ModDate = priv.getCreationDate();
  // Written as a string here and turned into the required name by
  // finishPdfX (same length, so offsets stay valid).
  props.Trapped = "False";

  // Every page needs a TrimBox; pages without artwork boxes trim to the page.
  for (let i = 1; i <= doc.getNumberOfPages(); i++) {
    const ctx = doc.getPageInfo(i).pageContext as unknown as PageContext;
    if (!ctx.trimBox) ctx.trimBox = { ...ctx.mediaBox };
  }

  doc.internal.events.subscribe("putCatalog", () => {
    (doc.internal as unknown as { write: (s: string) => void }).write(
      `/OutputIntents [<< /Type /OutputIntent /S /GTS_PDFX /OutputConditionIdentifier ${pdfString(condition.id)} ` +
        `/OutputCondition ${pdfString(condition.info)} /RegistryName (http://www.color.org) /Info ${pdfString(condition.info)} >>]`
    );
  });
};

// The PDF as a binary string, with Trapped written as a name.
export const finishPdfX = (doc: jsPDF): string =>
  doc.output().replace("/Trapped (False)", "/Trapped /False ");

export const pdfBytes = (binary: string): Uint8Array => {
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i) & 0xff;
  return out;
};

// ------------------------------------------------------------------
// CMYK images
// ------------------------------------------------------------------

// jsPDF writes PNGs as RGB with a soft mask, which PDF/X-1a forbids. Logos
// are converted to CMYK pixels here (flattened onto white) and added as a
// raw DeviceCMYK image instead.
const MARKER = [0x4c, 0x52, 0x43, 0x4b]; // "LRCK", so jsPDF doesn't sniff it as another format

type ProcessFn = (data: Uint8Array, index: number, alias: string) => unknown;
const api = jsPDF.API as unknown as Record<string, ProcessFn>;
api.processCMYKRAW = (data, index, alias) => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width = view.getUint32(4);
  const height = view.getUint32(8);
  // jsPDF marks DeviceCMYK images with /Decode [1 0 1 0 1 0 1 0] (the
  // inverted values Adobe CMYK JPEGs carry), so store the values inverted.
  const raw = data.subarray(12);
  const inverted = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) inverted[i] = 255 - raw[i];
  const pixels = zlibSync(inverted, { level: 6 });
  let s = "";
  for (let i = 0; i < pixels.length; i += 0x8000) s += String.fromCharCode(...pixels.subarray(i, i + 0x8000));
  return { data: s, width, height, colorSpace: "DeviceCMYK", bitsPerComponent: 8, filter: "FlateDecode", index, alias };
};

// Uncalibrated RGB -> CMYK (grey component replacement), alpha flattened
// onto white. Good enough for a logo proof; the printer should check colour.
export const rgbaToCmyk = (rgba: Uint8ClampedArray | Uint8Array): Uint8Array => {
  const n = rgba.length / 4;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3] / 255;
    const r = (rgba[i * 4] * a + 255 * (1 - a)) / 255;
    const g = (rgba[i * 4 + 1] * a + 255 * (1 - a)) / 255;
    const b = (rgba[i * 4 + 2] * a + 255 * (1 - a)) / 255;
    const k = 1 - Math.max(r, g, b);
    const d = 1 - k || 1;
    out[i * 4] = Math.round(((1 - r - k) / d) * 255);
    out[i * 4 + 1] = Math.round(((1 - g - k) / d) * 255);
    out[i * 4 + 2] = Math.round(((1 - b - k) / d) * 255);
    out[i * 4 + 3] = Math.round(k * 255);
  }
  return out;
};

export interface CmykImage {
  width: number;
  height: number;
  cmyk: Uint8Array;
}

export const addCmykImage = (doc: jsPDF, img: CmykImage, x: number, y: number, w: number, h: number, alias: string) => {
  const data = new Uint8Array(12 + img.cmyk.length);
  data.set(MARKER, 0);
  const view = new DataView(data.buffer);
  view.setUint32(4, img.width);
  view.setUint32(8, img.height);
  data.set(img.cmyk, 12);
  doc.addImage(data, "CMYKRAW", x, y, w, h, alias);
};

// ------------------------------------------------------------------
// Preflight
// ------------------------------------------------------------------

export interface PreflightCheck {
  label: string;
  ok: boolean;
  detail?: string;
}

interface PdfObject {
  dict: string;
  stream: Uint8Array | null;
}

const objects = (pdf: string): PdfObject[] => {
  const found: PdfObject[] = [];
  const re = /\d+ 0 obj\s*([\s\S]*?)endobj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pdf))) {
    const body = m[1];
    const s = body.search(/stream\r?\n/);
    if (s === -1) {
      found.push({ dict: body, stream: null });
      continue;
    }
    const dict = body.slice(0, s);
    const start = s + body.slice(s).indexOf("\n") + 1;
    const len = Number(/\/Length (\d+)/.exec(dict)?.[1] ?? NaN);
    const raw = pdfBytes(Number.isFinite(len) ? body.slice(start, start + len) : body.slice(start, body.lastIndexOf("endstream")));
    let stream: Uint8Array | null = raw;
    if (/\/FlateDecode/.test(dict)) {
      try {
        stream = unzlibSync(raw);
      } catch {
        stream = null;
      }
    }
    found.push({ dict, stream });
  }
  return found;
};

const boxOf = (dict: string, name: string): number[] | null => {
  const m = new RegExp(`/${name}\\s*\\[([^\\]]+)\\]`).exec(dict);
  return m ? m[1].trim().split(/\s+/).map(Number) : null;
};
const within = (inner: number[], outer: number[], eps = 0.01) =>
  inner[0] >= outer[0] - eps && inner[1] >= outer[1] - eps && inner[2] <= outer[2] + eps && inner[3] <= outer[3] + eps;

const text = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return s;
};

export const preflightPdfX1a = (pdf: string): PreflightCheck[] => {
  const objs = objects(pdf);
  const dicts = objs.map((o) => o.dict).join("\n");
  const checks: PreflightCheck[] = [];
  const add = (label: string, ok: boolean, detail?: string) => checks.push({ label, ok, detail });

  const version = /^%PDF-(\d\.\d)/.exec(pdf)?.[1] ?? "?";
  add("PDF version 1.3 or 1.4", version === "1.3" || version === "1.4", `PDF ${version}`);
  add("Identified as PDF/X-1a:2001", /\/GTS_PDFXVersion \(PDF\/X-1a:2001\)/.test(pdf));
  const intent = /\/OutputIntents \[<< [^\]]*\/S \/GTS_PDFX[^\]]*\/OutputConditionIdentifier \(([^)]*)\)/.exec(pdf);
  add("Output intent names the printing condition", Boolean(intent), intent?.[1]);
  add("Trapping stated", /\/Trapped \/(True|False)/.test(pdf));
  add("Not encrypted", !/\/Encrypt\s/.test(pdf));

  const pages = objs.filter((o) => /\/Type \/Page\b(?!s)/.test(o.dict));
  const badPages = pages.filter((p) => {
    const media = boxOf(p.dict, "MediaBox");
    const trim = boxOf(p.dict, "TrimBox") ?? boxOf(p.dict, "ArtBox");
    const bleed = boxOf(p.dict, "BleedBox");
    if (!media || !trim) return true;
    if (bleed && !(within(bleed, media) && within(trim, bleed))) return true;
    return !within(trim, media);
  });
  add("Every page has a TrimBox inside its BleedBox and MediaBox", pages.length > 0 && badPages.length === 0, `${pages.length} pages`);

  const fonts = objs.filter((o) => /\/Type \/Font\b/.test(o.dict) && !/\/Subtype \/Type0/.test(o.dict));
  const descriptors = objs.filter((o) => /\/Type \/FontDescriptor/.test(o.dict));
  const unembedded = descriptors.filter((d) => !/\/FontFile[23]?\s/.test(d.dict)).length + (fonts.length - descriptors.length > 0 ? fonts.length - descriptors.length : 0);
  add("All fonts embedded", fonts.length > 0 && unembedded === 0, `${fonts.length} fonts`);

  const contents = objs.filter((o) => o.stream && !/\/Subtype \/Image|\/FontFile|\/Length1/.test(o.dict)).map((o) => text(o.stream!));
  const rgbOps = contents.some((c) => /(^|\s)-?[\d.]+\s+-?[\d.]+\s+-?[\d.]+\s+(rg|RG)(?=\s|$)/m.test(c));
  add("Colour is CMYK or grey only (no RGB)", !rgbOps && !/\/DeviceRGB|\/CalRGB|\/ICCBased/.test(dicts));
  const transparency =
    /\/SMask\s(?!\/None)/.test(dicts) ||
    /\/(CA|ca)\s+0?\.\d+/.test(dicts) ||
    /\/S \/Transparency/.test(dicts);
  add("No transparency", !transparency);
  return checks;
};
