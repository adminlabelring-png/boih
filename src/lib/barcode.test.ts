import { describe, expect, it } from "vitest";
import { barcodeSizeMm, encodeEan13, fitMagnification, gs1CheckDigit, parseGtin } from "./barcode";

describe("GS1 check digit", () => {
  it("matches published examples", () => {
    expect(gs1CheckDigit("400638133393")).toBe(1); // 4006381333931
    expect(gs1CheckDigit("501234567890")).toBe(0); // 5012345678900
    expect(gs1CheckDigit("9638507")).toBe(4); // EAN-8 96385074
    expect(gs1CheckDigit("03600029145")).toBe(2); // UPC-A 036000291452
  });
});

describe("parseGtin", () => {
  it("accepts EAN-13, UPC-A (as EAN-13 with a leading 0) and EAN-8", () => {
    const e13 = parseGtin("4006381333931");
    expect(e13.ok && e13.barcode.type).toBe("EAN13");
    const upc = parseGtin("0360 0029 1452");
    expect(upc.ok && upc.barcode.digits).toBe("0036000291452");
    const e8 = parseGtin("96385074");
    expect(e8.ok && e8.barcode.type).toBe("EAN8");
    expect(e8.ok && e8.barcode.modules.length).toBe(67);
  });

  it("rejects a wrong check digit, wrong length or letters", () => {
    const bad = parseGtin("4006381333932");
    expect(bad.ok).toBe(false);
    expect((bad as { error?: string }).error).toMatch(/should be 1/);
    expect(parseGtin("12345").ok).toBe(false);
    expect(parseGtin("40063813339A1").ok).toBe(false);
  });
});

describe("EAN-13 encoding", () => {
  it("encodes 4006381333931 to the standard bar pattern", () => {
    // first digit 4 -> parity LGLLGG
    const m = encodeEan13("4006381333931");
    expect(m).toHaveLength(95);
    expect(m.slice(0, 3)).toBe("101");
    expect(m.slice(3, 10)).toBe("0001101"); // 0, L
    expect(m.slice(10, 17)).toBe("0100111"); // 0, G
    expect(m.slice(45, 50)).toBe("01010");
    expect(m.slice(-3)).toBe("101");
  });
});

describe("size", () => {
  it("is 37.29 mm wide at 100% with quiet zones, and shrinks to fit down to 80%", () => {
    expect(barcodeSizeMm("EAN13", 1).widthMm).toBeCloseTo(37.29, 2);
    expect(fitMagnification("EAN13", 40)).toBe(1);
    expect(fitMagnification("EAN13", 32)).toBe(0.85);
    expect(fitMagnification("EAN13", 29)).toBeNull();
  });
});
