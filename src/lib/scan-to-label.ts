import { emptyLabel, type LabelFields } from "./label-rules";
import { EU_FRAGRANCE_ALLERGENS } from "./allergens";
import type { DetectedField, RuleFinding, RulebookStamp, ScanResult } from "./scan-context";

// Hands a scanned label to the label builder ("Fix these"): what was read
// off the pack becomes the starting draft, and the open rule findings
// become the to-do list. Only text actually read from the pack is carried
// over — nothing is guessed to fill a gap.

export interface ScanHandoff {
  fields: LabelFields;
  findings: RuleFinding[];
  rulebook: RulebookStamp | null;
  prefilled: (keyof LabelFields)[];
}

const SCAN_TO_GENERATOR_CATEGORY: Record<string, string> = {
  cosmetic: "Skincare",
  skincare: "Skincare",
  food: "Food",
  beverage: "Beverage",
  supplement: "Supplement",
  household: "Household",
};

const PAO = /\b(\d{1,2})\s?(?:m|months?)\b/i;

const readValue = (fields: DetectedField[], label: string): string => {
  const f = fields.find((x) => x.label === label);
  if (!f || !f.value || (f.status !== "verified" && f.status !== "low_confidence")) return "";
  // Drop the scanner's own cross-reference notes; keep only what was read.
  return f.value
    .split("\n")
    .filter((line) => !line.startsWith("Cross-referenced from ingredients:"))
    .join("\n")
    .trim();
};

export const scanToLabel = (result: ScanResult): ScanHandoff => {
  const category = SCAN_TO_GENERATOR_CATEGORY[result.category.trim().toLowerCase()] ?? "Other";
  const isCosmetic = category === "Skincare";
  const read = (label: string) => readValue(result.fields, label);

  const fields: LabelFields = {
    ...emptyLabel,
    nutrition: {},
    fragranceAllergens: [],
    category,
    productName: read("Product Name"),
    ingredients: read("Ingredients"),
    responsiblePerson: read("Manufacturer / Responsible Person"),
    countryOfOrigin: read("Country of Origin"),
    batchNumber: read("Batch / Lot Number"),
    netQuantity: read("Net Quantity"),
    storageInstructions: read("Storage Instructions"),
  };

  if (isCosmetic) {
    fields.instructionsForUse = read("Warnings");
    // Only allergens named in the ingredient list as printed.
    const ingredients = fields.ingredients.toLowerCase();
    fields.fragranceAllergens = EU_FRAGRANCE_ALLERGENS.filter((a) => ingredients.includes(a.toLowerCase()));
  } else {
    fields.allergens = read("Allergens");
  }

  const date = read("Expiry / Best Before");
  const pao = date.match(PAO);
  if (isCosmetic && pao) {
    fields.dateType = "pao";
    fields.paoMonths = pao[1];
  } else if (date) {
    fields.bestBefore = date;
    if (isCosmetic) fields.dateType = "durability";
  }

  const prefilled = (Object.keys(fields) as (keyof LabelFields)[]).filter((k) => {
    const v = fields[k];
    if (k === "category") return false;
    if (Array.isArray(v)) return v.length > 0;
    return typeof v === "string" && v.length > 0 && k !== "dateType";
  });

  return {
    fields,
    findings: result.findings.filter((f) => f.status !== "pass"),
    rulebook: result.rulebook,
    prefilled,
  };
};
