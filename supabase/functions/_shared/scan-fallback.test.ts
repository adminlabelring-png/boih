import { describe, expect, it } from "vitest";
import { fallbackReason, mergeReads, type ScanRead } from "./scan-fallback";

const read = (fields: [string, string | null, string][], extra: Partial<ScanRead> = {}): ScanRead => ({
  category: "Cosmetic",
  fields: fields.map(([label, value, status]) => ({ label, value, status })),
  ...extra,
});

describe("fallbackReason", () => {
  it("re-reads when a key field was read with low confidence", () => {
    expect(fallbackReason(read([["Ingredients", "Aqua, Glyc", "low_confidence"]]))).toBe(
      "Low-confidence read: Ingredients"
    );
  });

  it("re-reads an ingredient list the model marked as partly unreadable", () => {
    expect(fallbackReason(read([["Ingredients", "Aqua, Glycerin, [illegible], Parfum", "verified"]]))).toBe(
      "Ingredient list partly unreadable"
    );
  });

  it("doesn't re-read for fields that weren't in the photos, or for confident reads", () => {
    expect(fallbackReason(read([["Batch / Lot Number", null, "not_verified"]]))).toBeNull();
    expect(fallbackReason(read([["Ingredients", "Aqua, Glycerin", "verified"]]))).toBeNull();
    // A hedge on a field the rules don't depend on isn't worth a re-read.
    expect(fallbackReason(read([["Storage Instructions", "Keep cool", "low_confidence"]]))).toBeNull();
  });
});

describe("mergeReads", () => {
  it("keeps the more certain read of each field", () => {
    const primary = read([
      ["Ingredients", "Aqua, Glyc", "low_confidence"],
      ["Batch / Lot Number", "L123", "verified"],
    ]);
    const fallback = read([
      ["Ingredients", "Aqua, Glycerin, Parfum", "verified"],
      ["Batch / Lot Number", null, "not_verified"],
    ]);
    const { read: merged, improved } = mergeReads(primary, fallback);
    expect(merged.fields).toEqual([
      { label: "Ingredients", value: "Aqua, Glycerin, Parfum", status: "verified" },
      { label: "Batch / Lot Number", value: "L123", status: "verified" },
    ]);
    expect(improved).toEqual(["Ingredients"]);
  });

  it("prefers the stronger read on ties and adds fields only it found", () => {
    const { read: merged, improved } = mergeReads(
      read([["Warnings", "Avoid eyes", "verified"]]),
      read([
        ["Warnings", "Avoid contact with eyes", "verified"],
        ["Net Quantity", "50 ml", "verified"],
      ], { category: "Cosmetic", extras: { languages: ["en"] } })
    );
    expect(merged.fields?.map((f) => f.value)).toEqual(["Avoid contact with eyes", "50 ml"]);
    expect(merged.extras).toEqual({ languages: ["en"] });
    expect(improved).toEqual([]);
  });
});
