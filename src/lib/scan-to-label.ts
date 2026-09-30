import { emptyLabel, type LabelFields } from "./label-rules";
import { EU_FRAGRANCE_ALLERGENS } from "./allergens";
import type { DetectedField, RuleFinding, RulebookStamp, ScanResult } from "./scan-context";

// Hands a scanned label to the label builder ("Fix these"): what was read
// off the pack becomes the starting draft, and the open rule findings
// become the to-do list. Only text actually read from the pack is carried
// over — nothing is guessed to fill a gap.

export interface ScanHandoff {
  scanId: string | null;
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
    scanId: result.scanId ?? null,
    fields,
    findings: result.findings.filter((f) => f.status !== "pass"),
    rulebook: result.rulebook,
    prefilled,
  };
};

// ------------------------------------------------------------------
// Old vs new: what changed between the scanned label and the new draft,
// with a one-line reason per change for the approval step.
// ------------------------------------------------------------------

export interface LabelChange {
  key: string;
  label: string;
  before: string;
  after: string;
  reason: string;
}

// Label-builder fields, grouped as they'd be read on the pack, with the
// scanner field the rulebook's findings refer to.
const CHANGE_FIELDS: { key: string; label: string; scanField: string; read: (f: LabelFields) => string }[] = [
  { key: "productName", label: "Product name", scanField: "Product Name", read: (f) => f.productName },
  { key: "ingredients", label: "Ingredients", scanField: "Ingredients", read: (f) => f.ingredients },
  {
    key: "fragranceAllergens",
    label: "Fragrance allergens",
    scanField: "Ingredients",
    read: (f) => f.fragranceAllergens.join(", "),
  },
  { key: "instructionsForUse", label: "Warnings / instructions for use", scanField: "Warnings", read: (f) => f.instructionsForUse },
  { key: "responsiblePerson", label: "Responsible Person (UK)", scanField: "Manufacturer / Responsible Person", read: (f) => f.responsiblePerson },
  {
    key: "euResponsiblePerson",
    label: "Responsible Person (EU / NI)",
    scanField: "Manufacturer / Responsible Person",
    read: (f) => f.euResponsiblePerson,
  },
  { key: "countryOfOrigin", label: "Country of origin", scanField: "Country of Origin", read: (f) => f.countryOfOrigin },
  { key: "netQuantity", label: "Net quantity", scanField: "Net Quantity", read: (f) => f.netQuantity },
  { key: "batchNumber", label: "Batch / lot code", scanField: "Batch / Lot Number", read: (f) => f.batchNumber },
  {
    key: "date",
    label: "Date mark / PAO",
    scanField: "Expiry / Best Before",
    read: (f) => (f.dateType === "pao" ? (f.paoMonths ? `PAO ${f.paoMonths}M` : "") : f.bestBefore),
  },
  { key: "storageInstructions", label: "Storage instructions", scanField: "Storage Instructions", read: (f) => f.storageInstructions },
  { key: "allergens", label: "Allergens", scanField: "Allergens", read: (f) => f.allergens },
];

const oneLine = (s: string) => {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > 140 ? `${flat.slice(0, 137)}…` : flat;
};

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

export const diffAgainstScan = (
  scanned: LabelFields,
  draft: LabelFields,
  findings: RuleFinding[]
): LabelChange[] =>
  CHANGE_FIELDS.flatMap(({ key, label, scanField, read }) => {
    const before = norm(read(scanned));
    const after = norm(read(draft));
    if (before === after) return [];
    // Findings are ranked (legal and action-needed first), so the first
    // match is the most important reason for this field to change.
    const finding = findings.find((f) => f.field === scanField && f.status !== "pass");
    const reason = finding
      ? oneLine(`${finding.title}: ${finding.fix ?? finding.reason}`)
      : "Edited by you";
    return [{ key, label, before, after, reason }];
  });
