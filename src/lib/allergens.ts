// Shared allergen detection logic used by both the label generator and the
// label scanner.

// UK's 14 allergens (FIC Annex II)
export const UK_ALLERGENS = [
  "gluten", "wheat", "rye", "barley", "oats", "spelt", "khorasan",
  "crustacean", "prawn", "crab", "lobster", "crayfish",
  "egg", "fish", "peanut", "soy", "soya", "soybean",
  "milk", "lactose", "butter", "cream", "cheese", "whey",
  "almond", "hazelnut", "pistachio", "pecan", "walnut", "brazil nut", "macadamia", "cashew",
  "celery", "celeriac", "mustard", "sesame",
  "sulphite", "sulphur dioxide", "sulfite",
  "lupin", "mollusc", "mussel", "oyster", "snail", "squid",
];

export const findAllergensInText = (text: string): string[] => {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  UK_ALLERGENS.forEach((a) => {
    if (lower.includes(a)) found.add(a);
  });
  return [...found];
};

export const formatAllergenList = (allergens: string[]): string =>
  allergens.map((a) => a.replace(/\b\w/g, (c) => c.toUpperCase())).join(", ");

// EU Cosmetic Regulation (EC) 1223/2009 Annex III fragrance allergens.
// Set to expand under EU 2023/1545, phased in 2026-2028.
export const EU_FRAGRANCE_ALLERGENS = [
  "Amyl cinnamal",
  "Benzyl alcohol",
  "Cinnamyl alcohol",
  "Citral",
  "Eugenol",
  "Hydroxycitronellal",
  "Isoeugenol",
  "Amylcinnamyl alcohol",
  "Benzyl salicylate",
  "Cinnamal",
  "Coumarin",
  "Geraniol",
  "Hydroxyisohexyl 3-cyclohexene carboxaldehyde (Lyral)",
  "Anisyl alcohol",
  "Benzyl cinnamate",
  "Farnesol",
  "Butylphenyl methylpropional (Lilial)",
  "Linalool",
  "Benzyl benzoate",
  "Citronellol",
  "Hexyl cinnamal",
  "Limonene",
  "Methyl heptin carbonate",
  "Alpha-Isomethyl ionone",
  "Evernia prunastri extract (oakmoss)",
  "Evernia furfuracea extract (treemoss)",
] as const;

// Cosmetic fragrance-allergen labelling thresholds (EU 1223/2009 Art. 19(1)(f))
export const FRAGRANCE_ALLERGEN_THRESHOLD: Record<"leave_on" | "rinse_off", string> = {
  leave_on: "0.001%",
  rinse_off: "0.01%",
};

export interface AllergenSegment {
  text: string;
  isAllergen: boolean;
}

// Splits ingredients text into segments so callers can render the 14 UK
// allergens with bold/emphasis styling wherever they're detected, instead
// of relying on the user to type them in caps themselves.
export const splitAllergenHighlights = (text: string): AllergenSegment[] => {
  const detected = findAllergensInText(text);
  if (detected.length === 0) return [{ text, isAllergen: false }];
  const pattern = detected
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const re = new RegExp(`\\b(${pattern})\\b`, "gi");
  const segments: AllergenSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), isAllergen: false });
    }
    segments.push({ text: match[0], isAllergen: true });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isAllergen: false });
  }
  return segments;
};

// Natural essential-oil / botanical-extract ingredients that commonly
// contain trace amounts of specific EU Annex III fragrance allergens as
// natural constituents, even when the allergen isn't listed by its own
// INCI name (e.g. "Citrus Limon Peel Oil" naturally contains Limonene and
// Citral). Not exhaustive — a starting set covering the most common
// essential-oil sources; an aid to review, not a definitive composition
// analysis. Keys are lowercase for case-insensitive substring matching.
export const FRAGRANCE_ALLERGEN_SOURCES: Record<string, string[]> = {
  "citrus aurantium": ["Limonene", "Linalool", "Citral"],
  "citrus limon": ["Limonene", "Citral"],
  "citrus bergamia": ["Limonene", "Linalool", "Citral"],
  "citrus nobilis": ["Limonene"],
  "citrus reticulata": ["Limonene"],
  "citrus aurantifolia": ["Limonene", "Citral"],
  "citrus grandis": ["Limonene", "Citral"],
  "citrus sinensis": ["Limonene", "Citral"],
  "linalyl acetate": ["Linalool"],
  "lavandula": ["Linalool", "Limonene", "Geraniol", "Coumarin"],
  "mentha piperita": ["Limonene"],
  "mentha spicata": ["Limonene"],
  "pelargonium graveolens": ["Citronellol", "Geraniol", "Linalool"],
  "rosa damascena": ["Citronellol", "Geraniol", "Farnesol", "Eugenol"],
  "rosa centifolia": ["Citronellol", "Geraniol", "Farnesol", "Eugenol"],
  "cananga odorata": ["Benzyl benzoate", "Benzyl salicylate", "Linalool", "Farnesol", "Geraniol"],
  "jasminum": ["Benzyl benzoate", "Linalool", "Farnesol"],
  "cinnamomum zeylanicum": ["Cinnamal", "Cinnamyl alcohol", "Eugenol"],
  "cinnamomum cassia": ["Cinnamal", "Cinnamyl alcohol", "Eugenol"],
  "eugenia caryophyllus": ["Eugenol"],
  "illicium verum": ["Limonene"],
  "anthemis nobilis": ["Limonene"],
  "chamomilla recutita": ["Limonene"],
  "salvia officinalis": ["Linalool"],
  "salvia sclarea": ["Linalool"],
  "origanum majorana": ["Linalool"],
  "coriandrum sativum": ["Linalool"],
  "myroxylon pereirae": ["Benzyl benzoate", "Benzyl cinnamate", "Cinnamal", "Cinnamyl alcohol", "Eugenol"],
  "styrax": ["Benzyl benzoate", "Benzyl cinnamate", "Cinnamal", "Cinnamyl alcohol"],
  "pogostemon cablin": ["Limonene"],
};

// Cross-references ingredients text against both the 26 EU fragrance
// allergens themselves (direct name match) and the natural-source lookup
// above (inferred match), for cosmetic ingredient lists that name an
// essential oil rather than the allergen compound directly.
const normaliseName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// The fragrance allergens named in an ingredient list, matched against
// whole ingredients so "Hexyl Cinnamal" doesn't also count as Cinnamal.
// Either name of an entry like "Butylphenyl methylpropional (Lilial)"
// counts.
export const namedFragranceAllergens = (ingredientsText: string): string[] => {
  const ingredients = new Set(ingredientsText.split(/[,;]/).map(normaliseName).filter(Boolean));
  return EU_FRAGRANCE_ALLERGENS.filter((a) => {
    const alias = a.match(/^(.*?)\s*\((.*)\)$/);
    const names = alias ? [alias[1], alias[2]] : [a];
    return names.some((n) => ingredients.has(normaliseName(n)));
  });
};

export const findFragranceAllergensInIngredients = (ingredientsText: string): string[] => {
  const lower = ingredientsText.toLowerCase();
  const found = new Set<string>(namedFragranceAllergens(ingredientsText));

  Object.entries(FRAGRANCE_ALLERGEN_SOURCES).forEach(([source, allergens]) => {
    if (lower.includes(source)) {
      allergens.forEach((a) => found.add(a));
    }
  });

  return [...found];
};
