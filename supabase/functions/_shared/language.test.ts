import { describe, expect, it } from "vitest";
import { detectLanguages } from "./language";

describe("detectLanguages", () => {
  it("recognises English precautions", () => {
    expect(detectLanguages("Avoid contact with eyes. Keep out of reach of children.")).toEqual(["en"]);
  });

  it("recognises German", () => {
    expect(detectLanguages("Kontakt mit den Augen vermeiden. Für Kinder unzugänglich aufbewahren.")).toEqual(["de"]);
  });

  it("recognises French", () => {
    expect(detectLanguages("Éviter le contact avec les yeux. Tenir hors de portée des enfants.")).toEqual(["fr"]);
  });

  it("finds every language on a multilingual label", () => {
    const text =
      "Avoid contact with eyes. / Kontakt mit den Augen vermeiden. / Éviter le contact avec les yeux. Keep out of reach of children.";
    expect(detectLanguages(text).sort()).toEqual(["de", "en", "fr"]);
  });

  it("doesn't guess from an ingredient list or a single word", () => {
    expect(detectLanguages("Aqua, Glycerin, Parfum, Linalool")).toEqual([]);
    expect(detectLanguages("Creme")).toEqual([]);
  });
});
