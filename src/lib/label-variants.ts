import type { LabelFields } from "./label-rules";
import type { Market } from "./scan-context";

// Market versions of one cosmetic label. The master label holds the
// product facts; each version is what's printed for one market:
// - GB: the UK Responsible Person, English.
// - Northern Ireland: the EU/NI Responsible Person, English.
// - EU, per country chosen (Germany, France): the EU Responsible Person,
//   with the function, usage and precautions in that country's language
//   (Reg. 1223/2009 Art. 19(5)). EU with no country chosen: English.
// Ingredients (INCI), batch and quantities are the same everywhere.

export type Language = "en" | "de" | "fr";

export interface Variant {
  id: string;
  market: Market;
  country: string | null;
  language: Language;
  label: string;
}

// Wording a version can override; empty means "same as the master".
export interface VariantText {
  productName?: string;
  instructionsForUse?: string;
  storageInstructions?: string;
  countryOfOrigin?: string;
  // Filled in by AI translation and not yet edited by a person.
  machineTranslated?: boolean;
}

export const TRANSLATABLE: (keyof Omit<VariantText, "machineTranslated">)[] = [
  "productName",
  "instructionsForUse",
  "storageInstructions",
  "countryOfOrigin",
];

const COUNTRY: Record<string, { name: string; language: Language }> = {
  DE: { name: "Germany", language: "de" },
  FR: { name: "France", language: "fr" },
};

export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", de: "German", fr: "French" };

export const variantsFor = (markets: Market[], countries: string[]): Variant[] => {
  const v: Variant[] = [];
  if (markets.includes("GB")) v.push({ id: "GB", market: "GB", country: null, language: "en", label: "Great Britain" });
  if (markets.includes("NI")) v.push({ id: "NI", market: "NI", country: null, language: "en", label: "Northern Ireland" });
  if (markets.includes("EU")) {
    const known = countries.filter((c) => COUNTRY[c]);
    if (!known.length) v.push({ id: "EU", market: "EU", country: null, language: "en", label: "EU" });
    for (const c of known) {
      v.push({ id: `EU-${c}`, market: "EU", country: c, language: COUNTRY[c].language, label: `EU · ${COUNTRY[c].name}` });
    }
  }
  return v;
};

// Versions are worth showing once a label goes to more than one market or
// needs a language other than English.
export const usesVariants = (variants: Variant[]) => variants.length > 1 || variants.some((v) => v.language !== "en");

// The label as printed for one market.
export const variantFields = (master: LabelFields, v: Variant, text: VariantText = {}): LabelFields => {
  const pick = (k: keyof Omit<VariantText, "machineTranslated">) => {
    const own = text[k]?.trim();
    if (own) return own;
    // A translated version starts empty: English isn't the required language.
    return v.language === "en" ? master[k] : "";
  };
  return {
    ...master,
    // The product name can stay as it is; the function it states must be
    // in the market's language, which the language check looks at.
    productName: text.productName?.trim() || master.productName,
    instructionsForUse: pick("instructionsForUse"),
    storageInstructions: pick("storageInstructions"),
    countryOfOrigin: text.countryOfOrigin?.trim() || master.countryOfOrigin,
    // Only this market's Responsible Person on this market's label.
    responsiblePerson: v.market === "GB" ? master.responsiblePerson : master.euResponsiblePerson,
    euResponsiblePerson: "",
  };
};

// Fixed label wording per language (cosmetics). "Ingredients" stays as is:
// the INCI list is headed the same way across the EU.
export const LABEL_WORDS: Record<Language, { ingredients: string; bestBeforeEnd: string; batch: string; madeIn: (c: string) => string; seeEnclosed: string }> = {
  en: {
    ingredients: "Ingredients",
    bestBeforeEnd: "Best before end",
    batch: "Batch",
    madeIn: (c) => (/^made in/i.test(c) ? c : `Made in ${c}`),
    seeEnclosed: "See enclosed information.",
  },
  de: {
    ingredients: "Ingredients",
    bestBeforeEnd: "Mindestens haltbar bis Ende",
    batch: "Charge",
    madeIn: (c) => (/^hergestellt in/i.test(c) ? c : `Hergestellt in ${c}`),
    seeEnclosed: "Siehe beiliegende Informationen.",
  },
  fr: {
    ingredients: "Ingredients",
    bestBeforeEnd: "À utiliser de préférence avant fin",
    batch: "Lot",
    madeIn: (c) => (/^fabriqu/i.test(c) ? c : `Fabriqué en ${c}`),
    seeEnclosed: "Voir les informations jointes.",
  },
};
