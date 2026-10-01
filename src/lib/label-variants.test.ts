import { describe, expect, it } from "vitest";
import { usesVariants, variantFields, variantsFor } from "./label-variants";
import { emptyLabel, type LabelFields } from "./label-rules";
import { draftToExtracted } from "../../supabase/functions/_shared/label-mapping";

const master: LabelFields = {
  ...emptyLabel,
  nutrition: {},
  fragranceAllergens: [],
  category: "Skincare",
  brandName: "Glow",
  productName: "Rose Face Cream",
  ingredients: "Aqua, Glycerin, Parfum",
  instructionsForUse: "Apply to clean skin. Avoid contact with eyes.",
  responsiblePerson: "Glow Ltd, 1 High Street, London",
  euResponsiblePerson: "Glow BV, Keizersgracht 1, Amsterdam",
  countryOfOrigin: "United Kingdom",
  netQuantity: "50 ml",
};

describe("variantsFor", () => {
  it("makes one version per market, and one per chosen EU country", () => {
    expect(variantsFor(["GB"], []).map((v) => v.id)).toEqual(["GB"]);
    expect(variantsFor(["GB", "NI", "EU"], ["DE", "FR"]).map((v) => `${v.id}:${v.language}`)).toEqual([
      "GB:en",
      "NI:en",
      "EU-DE:de",
      "EU-FR:fr",
    ]);
    expect(variantsFor(["EU"], []).map((v) => `${v.id}:${v.language}`)).toEqual(["EU:en"]);
  });

  it("shows versions for more than one market or a non-English one", () => {
    expect(usesVariants(variantsFor(["GB"], []))).toBe(false);
    expect(usesVariants(variantsFor(["EU"], ["DE"]))).toBe(true);
    expect(usesVariants(variantsFor(["GB", "NI"], []))).toBe(true);
  });
});

describe("variantFields", () => {
  const [gb, ni, de] = variantsFor(["GB", "NI", "EU"], ["DE"]);

  it("puts only the market's own Responsible Person on each version", () => {
    expect(variantFields(master, gb).responsiblePerson).toBe(master.responsiblePerson);
    expect(variantFields(master, ni).responsiblePerson).toBe(master.euResponsiblePerson);
    expect(variantFields(master, de).responsiblePerson).toBe(master.euResponsiblePerson);
    expect(variantFields(master, gb).euResponsiblePerson).toBe("");
  });

  it("uses the English master text for English versions and the translation for others", () => {
    expect(variantFields(master, gb).instructionsForUse).toBe(master.instructionsForUse);
    // Not translated yet: left empty so the check flags it.
    expect(variantFields(master, de).instructionsForUse).toBe("");
    const t = variantFields(master, de, {
      productName: "Rosen-Gesichtscreme",
      instructionsForUse: "Auf die gereinigte Haut auftragen. Kontakt mit den Augen vermeiden.",
      countryOfOrigin: "Vereinigtes Königreich",
    });
    expect(t.productName).toBe("Rosen-Gesichtscreme");
    expect(t.instructionsForUse).toMatch(/Augen/);
    expect(t.countryOfOrigin).toBe("Vereinigtes Königreich");
    // Product facts are shared.
    expect(t.ingredients).toBe(master.ingredients);
    expect(t.netQuantity).toBe("50 ml");
  });
});

describe("language check input", () => {
  const de = variantsFor(["EU"], ["DE"])[0];
  const languages = (f: LabelFields) =>
    draftToExtracted(f).find((x) => x.label === "Label Languages")?.value ?? "";

  it("reads a translated German version as German, and an untranslated one as English only", () => {
    expect(languages(variantFields(master, de))).toBe("en");
    const translated = variantFields(master, de, {
      productName: "Rosen-Gesichtscreme",
      instructionsForUse: "Auf die gereinigte Haut auftragen. Kontakt mit den Augen vermeiden.",
      storageInstructions: "Kühl und trocken lagern.",
    });
    expect(languages(translated)).toMatch(/de/);
  });

  it("checks each version's Responsible Person block on its own", () => {
    const gb = variantsFor(["GB"], [])[0];
    const rp = (f: LabelFields) => draftToExtracted(f).find((x) => x.label === "Manufacturer / Responsible Person")?.value;
    expect(rp(variantFields(master, gb))).toBe(master.responsiblePerson);
    expect(rp(variantFields(master, de))).toBe(master.euResponsiblePerson);
  });
});
