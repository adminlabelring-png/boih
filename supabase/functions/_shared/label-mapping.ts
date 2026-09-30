// Maps a label draft from the label builder onto the fields the rule
// engine reads, so drafts and scanned labels are checked by the same
// rulebook. Pure TypeScript: used by the check-label edge function and
// covered by vitest.

import type { ExtractedField } from "./rule-engine.ts";
import { detectLanguages } from "./language.ts";

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
  cosmeticProductType?: string;
  certifications?: string;
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
    // What the product is for, as its name usually says (e.g. "Rose Face
    // Cream"); the rule asks for a check when there's no name.
    field("Product Function", clean(d.productName)),
    // Claims can appear anywhere the brand writes free text.
    field("Claims", [clean(d.productName), clean(d.instructionsForUse), clean(d.certifications)].filter(Boolean).join("; ")),
    {
      label: "Label Languages",
      value:
        detectLanguages(
          [d.productName, d.instructionsForUse, d.storageInstructions].map(clean).join(". ")
        ).join(", ") || "none",
      status: "verified",
    },
  ];
};

// What the scanner reports beyond the per-field transcription: the
// product's stated function, marketing claims, the languages on the pack
// and symbols such as the hand-in-book. Used only by the rules, not shown
// as fields.
export interface ScanExtras {
  function?: string | null;
  claims?: string[] | null;
  languages?: string[] | null;
  symbols?: string[] | null;
}

export const extrasToFields = (extras: ScanExtras | null | undefined, coverageComplete: boolean): ExtractedField[] => {
  // Something the scanner didn't see may be on a side it wasn't shown.
  const absent = coverageComplete ? "missing" : "not_verified";
  const list = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : [];
  const fn = clean(extras?.function);
  const claims = list(extras?.claims);
  const languages = list(extras?.languages).map((l) => l.toLowerCase().slice(0, 2));
  const symbols = list(extras?.symbols).map((x) => x.toLowerCase());
  return [
    fn ? { label: "Product Function", value: fn, status: "verified" } : { label: "Product Function", value: null, status: absent },
    claims.length ? { label: "Claims", value: claims.join("; "), status: "verified" } : { label: "Claims", value: null, status: absent },
    {
      label: "Label Languages",
      value: languages.join(", ") || "none",
      // A language missing from what was seen may be on an unseen side.
      status: coverageComplete ? "verified" : "low_confidence",
    },
    { label: "Pack Symbols", value: symbols.join(", ") || "none", status: coverageComplete ? "verified" : "low_confidence" },
  ];
};
