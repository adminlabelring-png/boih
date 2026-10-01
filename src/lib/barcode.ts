// Retail barcodes (GS1 EAN-13, UPC-A, EAN-8) as bar patterns, drawn as
// vector rectangles on the label so they print sharp at any size.
//
// Sizes follow GS1 General Specifications §5.2: at 100% magnification the
// module (narrowest bar) is 0.330 mm; EAN-13/UPC-A bars are 22.85 mm tall
// with 11 + 7 modules of quiet zone, EAN-8 bars 18.23 mm with 7 + 7.
// Retail POS scanning allows 80% to 200%.

export type BarcodeType = "EAN13" | "EAN8";

export interface Barcode {
  type: BarcodeType;
  // All digits, including the check digit (12-digit UPC-A becomes EAN-13
  // with a leading 0, which encodes the same bars).
  digits: string;
  // "1" = bar, "0" = space, one character per module, guards included.
  modules: string;
}

export const MODULE_MM = 0.33;
export const MIN_MAGNIFICATION = 0.8;
export const MAX_MAGNIFICATION = 2;

export const BARCODE_GEOMETRY: Record<BarcodeType, { modules: number; quietLeft: number; quietRight: number; barHeightMm: number }> = {
  EAN13: { modules: 95, quietLeft: 11, quietRight: 7, barHeightMm: 22.85 },
  EAN8: { modules: 67, quietLeft: 7, quietRight: 7, barHeightMm: 18.23 },
};

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
// Which of L/G encodes digits 2–7 of an EAN-13, chosen by the first digit.
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

// GS1 check digit for the digits before it (weights 3,1,3,… from the right).
export const gs1CheckDigit = (body: string): number => {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10;
};

export type ParsedGtin = { ok: true; barcode: Barcode } | { ok: false; error: string };

export const parseGtin = (input: string): ParsedGtin => {
  const digits = input.replace(/[\s-]/g, "");
  if (!digits) return { ok: false, error: "Enter the barcode number." };
  if (!/^\d+$/.test(digits)) return { ok: false, error: "A barcode number has digits only." };
  if (![8, 12, 13].includes(digits.length)) {
    return { ok: false, error: "Use the 13-digit EAN, 12-digit UPC or 8-digit EAN number from GS1." };
  }
  const body = digits.slice(0, -1);
  const check = gs1CheckDigit(body);
  if (Number(digits[digits.length - 1]) !== check) {
    return { ok: false, error: `The last digit should be ${check}. Check the number against your GS1 allocation.` };
  }
  if (digits.length === 8) return { ok: true, barcode: { type: "EAN8", digits, modules: encodeEan8(digits) } };
  const ean13 = digits.length === 12 ? `0${digits}` : digits;
  return { ok: true, barcode: { type: "EAN13", digits: ean13, modules: encodeEan13(ean13) } };
};

export const encodeEan13 = (d: string): string => {
  const parity = PARITY[Number(d[0])];
  let m = "101";
  for (let i = 1; i <= 6; i++) m += (parity[i - 1] === "L" ? L : G)[Number(d[i])];
  m += "01010";
  for (let i = 7; i <= 12; i++) m += R[Number(d[i])];
  return m + "101";
};

export const encodeEan8 = (d: string): string => {
  let m = "101";
  for (let i = 0; i < 4; i++) m += L[Number(d[i])];
  m += "01010";
  for (let i = 4; i < 8; i++) m += R[Number(d[i])];
  return m + "101";
};

// Modules that belong to the guard bars (drawn longer than the others).
export const isGuardModule = (type: BarcodeType, i: number): boolean => {
  const n = BARCODE_GEOMETRY[type].modules;
  const mid = (n - 5) / 2;
  return i < 3 || i >= n - 3 || (i >= mid && i < mid + 5);
};

// Size of the whole symbol, quiet zones and digits included.
export const barcodeSizeMm = (type: BarcodeType, magnification: number) => {
  const g = BARCODE_GEOMETRY[type];
  const x = MODULE_MM * magnification;
  const textMm = 2.75 * magnification; // digits under the bars
  return {
    widthMm: (g.modules + g.quietLeft + g.quietRight) * x,
    heightMm: g.barHeightMm * magnification + textMm,
    moduleMm: x,
  };
};

// Largest magnification up to 100% that fits the width, or null when even
// the 80% minimum doesn't fit.
export const fitMagnification = (type: BarcodeType, availableWidthMm: number): number | null => {
  const at100 = barcodeSizeMm(type, 1).widthMm;
  const m = Math.min(1, Math.floor((availableWidthMm / at100) * 100) / 100);
  return m >= MIN_MAGNIFICATION ? m : null;
};
