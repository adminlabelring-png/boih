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
