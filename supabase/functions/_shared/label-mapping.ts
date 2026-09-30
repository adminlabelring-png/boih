// Maps a label draft from the label builder onto the fields the rule
// engine reads, so drafts and scanned labels are checked by the same
// rulebook. Pure TypeScript: used by the check-label edge function and
// covered by vitest.

import type { ExtractedField } from "./rule-engine.ts";

export interface LabelDraft {
  productName?: string;
  ingredients?: string;
  responsiblePerson?: string;
  euResponsiblePerson?: string;
  countryOfOrigin?: string;
  netQuantity?: string;
  batchNumber?: string;
  bestBefore?: string;
  dateType?: string;
  paoMonths?: string;
  instructionsForUse?: string;
  storageInstructions?: string;
}

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

// In a draft the brand sees every field, so an empty one is known to be
// absent ("missing"), never "couldn't see it".
const field = (label: string, value: string): ExtractedField =>
  value ? { label, value, status: "verified" } : { label, value: null, status: "missing" };

export const draftToExtracted = (d: LabelDraft): ExtractedField[] => {
  // One master label can carry both a UK and an EU Responsible Person;
  // each market's rule looks for its own address in the combined block.
  const rp = [clean(d.responsiblePerson), clean(d.euResponsiblePerson)].filter(Boolean).join("\n");

  const date =
    d.dateType === "pao"
      ? clean(d.paoMonths) && `${clean(d.paoMonths).replace(/\s*m(onths?)?$/i, "")}M`
      : clean(d.bestBefore);

  return [
    field("Product Name", clean(d.productName)),
    field("Ingredients", clean(d.ingredients)),
    field("Warnings", clean(d.instructionsForUse)),
    field("Manufacturer / Responsible Person", rp),
    field("Country of Origin", clean(d.countryOfOrigin)),
    field("Batch / Lot Number", clean(d.batchNumber)),
    field("Expiry / Best Before", date),
    field("Net Quantity", clean(d.netQuantity)),
    field("Storage Instructions", clean(d.storageInstructions)),
  ];
};
