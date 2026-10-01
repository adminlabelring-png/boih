import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import jsPDF from "jspdf";
import {
  buildPrintPdf,
  fitLayout,
  labelBlocks,
  minXHeightMm,
  registerFonts,
  xHeightToPt,
  DEFAULT_PRINT_SPEC,
  type FontData,
} from "./print-label";
import { emptyLabel, type LabelFields } from "./label-rules";
import { finishPdfX, preflightPdfX1a, rgbaToCmyk, type CmykImage } from "./pdfx";
import { parseGtin } from "./barcode";

let fonts: FontData;
beforeAll(() => {
  const read = (n: string) => readFileSync(resolve(__dirname, "../../public/fonts", n)).toString("base64");
  fonts = { regular: read("LiberationSans-Regular.ttf"), bold: read("LiberationSans-Bold.ttf") };
});

const cosmetic: LabelFields = {
  ...emptyLabel,
  nutrition: {},
  fragranceAllergens: [],
  category: "Skincare",
  brandName: "Glow",
  productName: "Rose Face Cream",
  netQuantity: "50 ml",
  ingredients: "Aqua, Glycerin, Cetearyl Alcohol, Parfum, Linalool, Citronellol",
  instructionsForUse: "Apply to clean skin. Avoid contact with eyes.",
  dateType: "pao",
  paoMonths: "12",
  batchNumber: "L2026-118A",
  responsiblePerson: "Glow Ltd, 1 High Street, London EC1A 1BB",
  euResponsiblePerson: "Glow BV, Keizersgracht 1, 1015 Amsterdam, Netherlands",
  countryOfOrigin: "United Kingdom",
};

describe("minimum text size", () => {
  it("follows the UK FIC x-height rule for food and a 0.9 mm guide for cosmetics", () => {
    expect(minXHeightMm("food", { ...DEFAULT_PRINT_SPEC, widthMm: 100, heightMm: 100 })).toBe(1.2);
    expect(minXHeightMm("food", { ...DEFAULT_PRINT_SPEC, widthMm: 70, heightMm: 50 })).toBe(0.9);
    expect(minXHeightMm("cosmetic", DEFAULT_PRINT_SPEC)).toBe(0.9);
    // 1.2 mm x-height in Liberation Sans ≈ 6.4 pt
    expect(xHeightToPt(1.2)).toBeCloseTo(6.44, 1);
  });
});

describe("labelBlocks", () => {
  it("uses the brand's own values, including both Responsible Persons and the PAO", () => {
    const blocks = labelBlocks(cosmetic, "cosmetic");
    const flat = JSON.stringify(blocks);
    expect(flat).toContain("Rose Face Cream");
    expect(flat).toContain("Keizersgracht");
    expect(flat).toContain("Made in United Kingdom");
    expect(blocks.some((b) => b.kind === "pao" && b.months === "12")).toBe(true);
  });

  it("emboldens allergens in food ingredients and adds the allergy advice line", () => {
    const food: LabelFields = { ...cosmetic, category: "Food", ingredients: "Wheat flour, sugar, milk powder", dateType: "best_before", bestBefore: "01/2027" };
    const blocks = labelBlocks(food, "food");
    const ing = blocks.find((b) => b.kind === "text" && b.runs[0].text === "Ingredients: ");
    expect(ing && ing.kind === "text" && ing.runs.filter((r) => r.bold).map((r) => r.text.toLowerCase())).toEqual(
      expect.arrayContaining(["wheat", "milk"])
    );
    expect(JSON.stringify(blocks)).toContain("Allergy advice");
  });
});

describe("fitLayout", () => {
  it("shrinks text to fit, and reports when it can't fit at the minimum size", () => {
    const doc = new jsPDF({ unit: "mm" });
    registerFonts(doc, fonts);
    const blocks = labelBlocks(cosmetic, "cosmetic");
    const roomy = fitLayout(doc, blocks, 90, 80, 5);
    expect(roomy.fits).toBe(true);
    expect(roomy.fontSizePt).toBe(9);

    const tight = fitLayout(doc, blocks, 40, 30, 5);
    expect(tight.fits).toBe(false);
    expect(tight.fontSizePt).toBe(5);

    const snug = fitLayout(doc, blocks, 60, 45, 4);
    expect(snug.fits).toBe(true);
    expect(snug.fontSizePt).toBeLessThan(9);
    expect(snug.heightMm).toBeLessThanOrEqual(45);
  });
});

describe("buildPrintPdf", () => {
  it("produces artwork at trim + bleed with TrimBox, BleedBox, K-only text and an embedded font", () => {
    const { doc, layout } = buildPrintPdf({
      fields: cosmetic,
      pack: "cosmetic",
      spec: { widthMm: 90, heightMm: 70, bleedMm: 3, safeMarginMm: 2 },
      fonts,
      markets: ["GB", "EU"],
    });
    expect(layout.fits).toBe(true);
    const pdf = doc.output();
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    expect(pdf).toMatch(/\/TrimBox \[/);
    expect(pdf).toMatch(/\/BleedBox \[/);
    expect(pdf).toContain("/FontFile2");
    expect(pdf).toContain("LiberationSans");
    // Page 1 media box = trim + 2 × (bleed + slug) = 90 + 22 by 70 + 22 mm
    const media = pdf.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
    expect(Number(media?.[1])).toBeCloseTo((112 * 72) / 25.4, 0);
    expect(Number(media?.[2])).toBeCloseTo((92 * 72) / 25.4, 0);
  });
});

describe("print extras and PDF/X-1a", () => {
  const logo = (): CmykImage & { heightMm: number } => {
    // 120 × 60 px red-on-transparent logo
    const w = 120;
    const h = 60;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) rgba.set(i % 3 ? [200, 20, 40, 255] : [0, 0, 0, 0], i * 4);
    return { width: w, height: h, cmyk: rgbaToCmyk(rgba), heightMm: 8 };
  };

  it("builds artwork with colour, logo, barcode and symbols that passes PDF/X-1a preflight", () => {
    const parsed = parseGtin("5012345678900");
    if (!parsed.ok) throw new Error("bad gtin");
    const { doc, warnings, barcodeMagnification, layout } = buildPrintPdf({
      fields: { ...cosmetic, dateType: "best_before", bestBefore: "06/2028" },
      pack: "cosmetic",
      spec: { widthMm: 90, heightMm: 120, bleedMm: 3, safeMarginMm: 3 },
      fonts,
      extras: { accent: [0, 0.9, 0.6, 0.1], logo: logo(), barcode: parsed.barcode, leafletSymbol: true },
    });
    expect(barcodeMagnification).toBe(1);
    expect(layout.fits).toBe(true);
    // 120 px across ~ 45 mm is well under 300 ppi
    expect(warnings.some((w) => /ppi/.test(w))).toBe(true);
    const pdf = finishPdfX(doc);
    expect(pdf).toContain("/GTS_PDFXVersion (PDF/X-1a:2001)");
    expect(pdf).toContain("/Trapped /False");
    expect(pdf).toContain("/OutputConditionIdentifier (FOGRA39)");
    expect(pdf).toContain("/ColorSpace /DeviceCMYK");
    const checks = preflightPdfX1a(pdf);
    expect(checks.filter((c) => !c.ok)).toEqual([]);
    expect(checks.length).toBeGreaterThanOrEqual(8);
  });

  it("warns, rather than shrinking below 80%, when the barcode doesn't fit", () => {
    const parsed = parseGtin("4006381333931");
    if (!parsed.ok) throw new Error("bad gtin");
    const { warnings, barcodeMagnification } = buildPrintPdf({
      fields: cosmetic,
      pack: "cosmetic",
      spec: DEFAULT_PRINT_SPEC,
      fonts,
      extras: { barcode: parsed.barcode },
    });
    // 70 mm label: 66 mm safe width fits at 100%
    expect(barcodeMagnification).toBe(1);
    const small = buildPrintPdf({
      fields: cosmetic,
      pack: "cosmetic",
      spec: { widthMm: 30, heightMm: 40, bleedMm: 3, safeMarginMm: 2 },
      fonts,
      extras: { barcode: parsed.barcode },
    });
    expect(small.barcodeMagnification).toBeNull();
    expect(small.warnings.some((w) => /barcode needs at least/.test(w))).toBe(true);
    expect(warnings.some((w) => /barcode needs/.test(w))).toBe(false);
  });

  it("puts the hourglass before a cosmetic best-before date and the hand-in-book on request", () => {
    const blocks = labelBlocks({ ...cosmetic, dateType: "best_before", bestBefore: "06/2028" }, "cosmetic", [], {
      leafletSymbol: true,
    });
    const icons = blocks.flatMap((b) => (b.kind === "text" && b.icon ? [b.icon] : []));
    expect(icons).toEqual(["leaflet", "hourglass"]);
  });

  it("preflight catches RGB colour, transparency and missing PDF/X marking", () => {
    const doc = new jsPDF({ unit: "mm", format: [50, 50] });
    doc.setTextColor(255, 0, 0);
    doc.text("RGB", 10, 10);
    const checks = preflightPdfX1a(doc.output());
    const failed = checks.filter((c) => !c.ok).map((c) => c.label);
    expect(failed).toEqual(
      expect.arrayContaining([
        "Identified as PDF/X-1a:2001",
        "Output intent names the printing condition",
        "Colour is CMYK or grey only (no RGB)",
        "All fonts embedded",
      ])
    );
  });

  it("converts RGB to CMYK, flattening transparency onto white", () => {
    const cmyk = rgbaToCmyk(new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 255]));
    expect(Array.from(cmyk.slice(0, 4))).toEqual([0, 255, 255, 0]); // red
    expect(Array.from(cmyk.slice(4, 8))).toEqual([0, 0, 0, 0]); // transparent -> white paper
    expect(Array.from(cmyk.slice(8, 12))).toEqual([0, 0, 0, 255]); // black -> K only
  });
});

describe("market version wording", () => {
  it("prints the fixed label wording in the version's language", () => {
    const f = { ...cosmetic, dateType: "best_before" as const, bestBefore: "06/2028" };
    const words = (lang: "en" | "de" | "fr") =>
      labelBlocks(f, "cosmetic", [], { language: lang, leafletSymbol: true })
        .flatMap((b) => (b.kind === "text" ? b.runs.map((r) => r.text) : []))
        .join(" ");
    expect(words("de")).toMatch(/Mindestens haltbar bis Ende: .*Charge: .*Hergestellt in United Kingdom/s);
    expect(words("de")).toMatch(/Siehe beiliegende Informationen/);
    expect(words("fr")).toMatch(/À utiliser de préférence avant fin: .*Lot: .*Fabriqué en United Kingdom/s);
    expect(words("en")).toMatch(/Best before end: .*Batch: .*Made in United Kingdom/s);
  });
});
