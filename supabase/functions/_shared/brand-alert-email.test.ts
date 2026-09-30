import { describe, expect, it } from "vitest";
import { brandAlertEmail, type BrandAlert } from "./brand-alert-email";

const alert: BrandAlert = {
  id: "a1",
  label_id: "11111111-1111-1111-1111-111111111111",
  email: "ana@brand.test",
  contact_name: "Ana Smith",
  brand_name: "Glow",
  product_name: "Rose <Serum>",
  from_version: "cosmetics 2026.1",
  to_version: "cosmetics 2026.2",
  changes: [
    { key: "substance:prohibited:X", title: "X (prohibited substance)", change: "added", markets: ["GB", "EU"] },
    { key: "eu_allergens_2026", title: "Expanded EU fragrance allergen list", change: "removed", markets: ["EU", "NI"] },
  ],
};

describe("brandAlertEmail", () => {
  const email = brandAlertEmail(alert, "https://www.labelring.co.uk/");

  it("names the product and the versions", () => {
    expect(email.subject).toBe("Labelling rule update affecting Rose <Serum>");
    expect(email.text).toContain("Hi Ana,");
    expect(email.text).toContain("version 2026.1 to 2026.2");
  });

  it("lists each change with its markets", () => {
    expect(email.text).toContain("- New check: X (prohibited substance) (Great Britain, EU)");
    expect(email.text).toContain("- Check withdrawn: Expanded EU fragrance allergen list (EU, Northern Ireland)");
  });

  it("links to the saved label without a double slash", () => {
    expect(email.text).toContain("https://www.labelring.co.uk/label/11111111-1111-1111-1111-111111111111");
    expect(email.text).toContain("https://www.labelring.co.uk/generate");
  });

  it("escapes HTML and never claims compliance", () => {
    expect(email.html).toContain("Rose &lt;Serum&gt;");
    expect(email.html).not.toContain("<Serum>");
    expect(`${email.text} ${email.html}`.toLowerCase()).not.toMatch(/\bcompliant\b/);
    expect(email.text).toContain("not legal advice");
  });

  it("falls back when there's no name or product", () => {
    const e = brandAlertEmail({ ...alert, contact_name: null, product_name: null }, "https://x.test");
    expect(e.text.startsWith("Hi,")).toBe(true);
    expect(e.subject).toBe("Labelling rule update affecting your product");
  });
});
