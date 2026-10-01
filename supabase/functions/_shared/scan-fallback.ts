// When to re-read a scan with a stronger model, and how to combine the two
// reads. Pure TypeScript (Deno and vitest).
//
// The everyday model reads most packs well; small, dense print (ingredient
// lists especially) is where it hedges. A re-read only helps where the
// first read saw the text but couldn't read it confidently: a field that
// wasn't in the photos ("not_verified") needs another photo, not another
// model.

export interface ReadField {
  label: string;
  value: string | null;
  status: string;
  suggestedFix?: string | null;
}

export interface ScanRead {
  category?: string;
  coverage?: unknown;
  fields?: ReadField[];
  extras?: unknown;
  [key: string]: unknown;
}

// Fields a label check depends on.
export const KEY_FIELDS = [
  "Ingredients",
  "Warnings",
  "Manufacturer / Responsible Person",
  "Batch / Lot Number",
  "Expiry / Best Before",
  "Net Quantity",
];

// Signs the model transcribed an ingredient list it couldn't fully read.
const UNREADABLE = /illegible|unreadable|unclear|cannot be read|can't be read|\?\?|\[\.\.\.\]|…|\.\.\.\s*$/i;

export function fallbackReason(read: ScanRead): string | null {
  const fields = Array.isArray(read.fields) ? read.fields : [];
  const low = fields.filter((f) => KEY_FIELDS.includes(f.label) && f.status === "low_confidence").map((f) => f.label);
  if (low.length) return `Low-confidence read: ${low.join(", ")}`;

  const ingredients = fields.find((f) => f.label === "Ingredients");
  if (ingredients?.status === "verified" && ingredients.value && UNREADABLE.test(ingredients.value)) {
    return "Ingredient list partly unreadable";
  }
  return null;
}

// How much a field's status tells us: a confident read beats a confirmed
// absence, which beats a hedge, which beats "not in the photos".
const RANK: Record<string, number> = { verified: 3, missing: 2, low_confidence: 1, not_verified: 0 };

// Keeps, field by field, whichever read is more certain (the stronger
// model wins ties). Category, coverage and extras come from the stronger
// read. Returns the merged read and the fields the re-read improved.
export function mergeReads(primary: ScanRead, fallback: ScanRead): { read: ScanRead; improved: string[] } {
  const primaryFields = Array.isArray(primary.fields) ? primary.fields : [];
  const fallbackFields = Array.isArray(fallback.fields) ? fallback.fields : [];
  const byLabel = new Map(fallbackFields.map((f) => [f.label, f]));
  const improved: string[] = [];

  const fields = primaryFields.map((p) => {
    const f = byLabel.get(p.label);
    if (!f) return p;
    byLabel.delete(p.label);
    const better = (RANK[f.status] ?? 0) >= (RANK[p.status] ?? 0);
    if (better && (RANK[f.status] ?? 0) > (RANK[p.status] ?? 0)) improved.push(p.label);
    return better ? f : p;
  });
  // Fields only the stronger read reported.
  fields.push(...byLabel.values());

  return {
    read: {
      ...primary,
      category: fallback.category ?? primary.category,
      coverage: fallback.coverage ?? primary.coverage,
      extras: fallback.extras ?? primary.extras,
      fields,
    },
    improved,
  };
}
