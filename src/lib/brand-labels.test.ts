import { describe, expect, it } from "vitest";
import { formatChangeValue, normaliseLabelData, templateFrom } from "./brand-labels";
import { emptyLabel } from "./label-rules";

describe("templateFrom", () => {
  it("keeps what a brand's products share and clears product facts", () => {
    const data = normaliseLabelData({
      fields: {
        brandName: "Glow & Co",
        productName: "Rose Oil",
        category: "Cosmetics",
        ingredients: "Aqua, Parfum",
        responsiblePerson: "Glow Ltd, 1 High St, London",
        netQuantity: "30 ml",
        batchNumber: "L123",
        paoMonths: "12",
        fragranceAllergens: ["Limonene"],
        instructionsForUse: "Avoid contact with eyes.",
      },
      markets: ["GB", "EU"],
      pack: "container_in_box",
      countries: ["DE"],
    });
    const t = templateFrom(data);
    expect(t.fields.brandName).toBe("Glow & Co");
    expect(t.fields.category).toBe("Cosmetics");
    expect(t.fields.responsiblePerson).toBe("Glow Ltd, 1 High St, London");
    expect(t.fields.instructionsForUse).toBe("Avoid contact with eyes.");
    expect(t.fields.productName).toBe("");
    expect(t.fields.ingredients).toBe("");
    expect(t.fields.netQuantity).toBe("");
    expect(t.fields.batchNumber).toBe("");
    expect(t.fields.paoMonths).toBe("");
    expect(t.fields.fragranceAllergens).toEqual([]);
    expect(t.markets).toEqual(["GB", "EU"]);
    expect(t.pack).toBe("container_in_box");
    expect(t.countries).toEqual(["DE"]);
    // The original is untouched.
    expect(data.fields.productName).toBe("Rose Oil");
  });
});

describe("normaliseLabelData", () => {
  it("fills fields added to the builder after the label was saved", () => {
    const d = normaliseLabelData({ fields: { productName: "Rose Oil" } });
    expect(d.fields).toEqual({ ...emptyLabel, productName: "Rose Oil" });
    expect(d.markets).toEqual(["GB"]);
    expect(d.pack).toBeNull();
    expect(d.countries).toEqual([]);
  });
});

describe("formatChangeValue", () => {
  it("formats saved values for the change list", () => {
    expect(formatChangeValue(null)).toBe("—");
    expect(formatChangeValue("")).toBe("—");
    expect(formatChangeValue(["GB", "EU"])).toBe("GB, EU");
    expect(formatChangeValue([])).toBe("—");
    expect(formatChangeValue(true)).toBe("Yes");
    expect(formatChangeValue({ energy: "100 kcal", fat: "" })).toBe("energy: 100 kcal");
    expect(formatChangeValue("Aqua")).toBe("Aqua");
  });
});
