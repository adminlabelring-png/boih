// UK-FIC + Cosmetic label rule packs
import {
  findAllergensInText,
  formatAllergenList,
  FRAGRANCE_ALLERGEN_THRESHOLD,
} from "./allergens";

export type Pack = "food" | "cosmetic" | "generic";

export interface NutritionTable {
  energyKj?: string;
  energyKcal?: string;
  fat?: string;
  saturates?: string;
  carbs?: string;
  sugars?: string;
  protein?: string;
  salt?: string;
}

export interface LabelFields {
  // Core
  brandName: string;
  productName: string;
  category: string;
  ingredients: string;
  allergens: string;
  countryOfOrigin: string;
  netQuantity: string;
  batchNumber: string;
  bestBefore: string;
  responsiblePerson: string;
  // Cosmetics sold in the EU or Northern Ireland need an EU/NI-established
  // Responsible Person; a master label can carry both addresses.
  euResponsiblePerson: string;
  certifications: string;
  // UK FIC extensions
  dateType: "" | "use_by" | "best_before" | "pao" | "durability";
  storageInstructions: string;
  quidPercent: string;
  alcoholAbv: string;
  nutrition: NutritionTable;
  packagedProtectiveAtmosphere: boolean;
  nano: boolean;
  irradiated: boolean;
  // Cosmetic extensions
  paoMonths: string;
  fragranceAllergens: string[];
  cosmeticProductType: "" | "leave_on" | "rinse_off";
  instructionsForUse: string;
}

export const emptyLabel: LabelFields = {
  brandName: "",
  productName: "",
  category: "",
  ingredients: "",
  allergens: "",
  countryOfOrigin: "",
  netQuantity: "",
  batchNumber: "",
  bestBefore: "",
  responsiblePerson: "",
  euResponsiblePerson: "",
  certifications: "",
  dateType: "",
  storageInstructions: "",
  quidPercent: "",
  alcoholAbv: "",
  nutrition: {},
  packagedProtectiveAtmosphere: false,
  nano: false,
  irradiated: false,
  paoMonths: "",
  fragranceAllergens: [],
  cosmeticProductType: "",
  instructionsForUse: "",
};

export const getPack = (category: string): Pack => {
  const c = category.trim().toLowerCase();
  if (c === "food" || c === "beverage" || c === "supplement") return "food";
  if (c === "skincare" || c === "cosmetic") return "cosmetic";
  return "generic";
};

export type CheckStatus = "ok" | "missing" | "review";

export interface RuleResult {
  key: string;
  label: string;
  status: CheckStatus;
  why?: string;
}

const has = (v: string) => v.trim().length > 0;
const looksLikeAddress = (v: string) => v.trim().length > 10 && /,/.test(v);
const hasMetricUnit = (v: string) =>
  /\d/.test(v) && /(mg|g\b|kg|ml|cl|l\b)/i.test(v);
const hasAnyUnit = (v: string) =>
  /\d/.test(v) && /(ml|l\b|g\b|kg|mg|oz|fl|cl|pcs|count)/i.test(v);
const UK_POSTCODE =
  /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;

// Derives regulatory warning phrases based on the ingredients text
export interface DerivedWarning {
  key: string;
  phrase: string;
}
export const deriveWarnings = (f: LabelFields): DerivedWarning[] => {
  const ing = f.ingredients.toLowerCase();
  const w: DerivedWarning[] = [];
  if (/\baspartame\b|\be951\b/.test(ing)) {
    w.push({
      key: "aspartame",
      phrase: /\be951\b/.test(ing)
        ? "Contains aspartame (a source of phenylalanine)."
        : "Contains a source of phenylalanine.",
    });
  }
  if (/liquorice|glycyrrhiz/i.test(ing)) {
    w.push({
      key: "liquorice",
      phrase:
        "Contains liquorice – people suffering from hypertension should avoid excessive consumption.",
    });
  }
  if (/caffeine|guarana/i.test(ing) && getPack(f.category) === "food") {
    w.push({
      key: "caffeine",
      phrase:
        "High caffeine content. Not recommended for children or pregnant or breast-feeding women.",
    });
  }
  if (/sorbitol|xylitol|maltitol|isomalt|mannitol|polyol/i.test(ing)) {
    w.push({
      key: "polyol",
      phrase: "Excessive consumption may produce laxative effects.",
    });
  }
  if (/sweetener|acesulfame|sucralose|stevia|saccharin/i.test(ing)) {
    w.push({
      key: "sweetener",
      phrase: /sugar/i.test(ing)
        ? "With sugars and sweeteners."
        : "With sweeteners.",
    });
  }
  if (/phytosterol|plant sterol|plant stanol/i.test(ing)) {
    w.push({
      key: "sterols",
      phrase:
        "With added plant sterols. Intended exclusively for people who want to lower their blood cholesterol. Not nutritionally appropriate for pregnant or breastfeeding women or children under 5.",
    });
  }
  return w;
};

const nutritionFilled = (n: NutritionTable): boolean =>
  Boolean(
    (n.energyKj || n.energyKcal) &&
      n.fat &&
      n.saturates &&
      n.carbs &&
      n.sugars &&
      n.protein &&
      n.salt
  );

// ------------------------------------------------------------------
// Rule packs
// ------------------------------------------------------------------

const foodRules = (f: LabelFields): RuleResult[] => {
  const abv = parseFloat(f.alcoholAbv);
  const isDrinkOver12 = f.category.toLowerCase() === "beverage" && abv > 1.2;
  const detectedAllergens = findAllergensInText(f.ingredients);
  const needsQuid =
    /\bwith\b|\band\b|%/.test(f.productName) ||
    detectedAllergens.some((a) =>
      f.productName.toLowerCase().includes(a.split(" ")[0])
    );

  const rules: RuleResult[] = [
    {
      key: "identity",
      label: "Name of the food",
      status: has(f.productName) ? "ok" : "missing",
      why: "The legal name of the food is mandatory (UK FIC Art. 9).",
    },
    {
      key: "ingredients_heading",
      label: "Ingredients list (by weight)",
      status: has(f.ingredients)
        ? f.ingredients.split(",").length >= 2
          ? "ok"
          : "review"
        : "missing",
      why: "Ingredients must be listed under 'Ingredients:' in descending order of weight.",
    },
    {
      key: "allergens_caps",
      label: "Allergens emphasised in ingredients",
      status: has(f.ingredients) ? "ok" : "missing",
      why:
        detectedAllergens.length > 0
          ? `Auto-detected and emphasised in the ingredients list: ${formatAllergenList(
              detectedAllergens
            )}.`
          : "No listed allergens detected in the ingredients text.",
    },
    {
      key: "quid",
      label: "QUID % where required",
      status: needsQuid
        ? has(f.quidPercent)
          ? "ok"
          : "review"
        : "ok",
      why: "Quantitative Ingredients Declaration required when an ingredient is named, pictured or emphasised.",
    },
    {
      key: "net_quantity",
      label: "Net quantity with metric unit",
      status: has(f.netQuantity)
        ? hasMetricUnit(f.netQuantity)
          ? "ok"
          : "review"
        : "missing",
      why: "Net quantity must use g / kg / ml / cl / l.",
    },
    {
      key: "date_mark",
      label: "'Use by' or 'Best before' date",
      status:
        has(f.bestBefore) && f.dateType
          ? "ok"
          : has(f.bestBefore)
          ? "review"
          : "missing",
      why: "Use 'Use by' where a safety risk exists after the date, otherwise 'Best before'.",
    },
    {
      key: "fbo_uk_address",
      label: "UK FBO name & address",
      status: has(f.responsiblePerson)
        ? UK_POSTCODE.test(f.responsiblePerson)
          ? "ok"
          : "review"
        : "missing",
      why: "From 1 Jan 2024 pre-packaged food sold in GB requires a UK address for the FBO.",
    },
    {
      key: "storage",
      label: "Storage / handling instructions",
      status:
        f.dateType === "use_by"
          ? has(f.storageInstructions)
            ? "ok"
            : "missing"
          : has(f.storageInstructions)
          ? "ok"
          : "review",
      why: "Special storage conditions are mandatory whenever a 'Use by' date is applied.",
    },
    {
      key: "origin",
      label: "Country of origin",
      status: has(f.countryOfOrigin) ? "ok" : "review",
      why: "Origin is mandatory when omission would mislead the consumer.",
    },
    {
      key: "nutrition_table",
      label: "Nutrition declaration (per 100g)",
      status: nutritionFilled(f.nutrition) ? "ok" : "missing",
      why: "Mandatory on most pre-packed foods since Dec 2016.",
    },
    {
      key: "batch",
      label: "Batch / lot code",
      status: has(f.batchNumber) ? "ok" : "review",
      why: "A lot code is required when no date of minimum durability is shown.",
    },
  ];

  if (f.category.toLowerCase() === "beverage") {
    rules.push({
      key: "abv",
      label: "ABV displayed (drinks >1.2%)",
      status:
        abv > 1.2
          ? /%/.test(f.alcoholAbv) || abv > 0
            ? "ok"
            : "review"
          : "ok",
      why: "Alcoholic strength (% vol) must appear on drinks over 1.2% ABV, in the same field of vision as the name and net quantity.",
    });
  }

  const derived = deriveWarnings(f);
  if (derived.length > 0) {
    rules.push({
      key: "warnings",
      label: "Regulatory warnings included",
      status: "review",
      why:
        "Detected trigger ingredients require: " +
        derived.map((d) => d.key).join(", "),
    });
  }

  // Field of vision heuristic — checks that name + qty (+ ABV) exist
  rules.push({
    key: "field_of_vision",
    label: "Name / quantity in same view",
    status:
      has(f.productName) && has(f.netQuantity)
        ? isDrinkOver12
          ? has(f.alcoholAbv)
            ? "ok"
            : "review"
          : "ok"
        : "missing",
    why: "The name, net quantity and ABV (drinks) must all appear in the same field of vision.",
  });

  return rules;
};

const cosmeticRules = (f: LabelFields): RuleResult[] => [
  {
    key: "identity",
    label: "Product identity",
    status: has(f.productName) && has(f.brandName) ? "ok" : "missing",
    why: "Brand and product name are the base of any cosmetic label.",
  },
  {
    key: "inci",
    label: "INCI ingredient list",
    status: has(f.ingredients)
      ? f.ingredients.trim().length < 10
        ? "review"
        : "ok"
      : "missing",
    why: "Cosmetic ingredients must use INCI names in descending order.",
  },
  {
    key: "allergens",
    label: "Fragrance allergens (EU list)",
    status: f.cosmeticProductType ? "ok" : "review",
    why: f.cosmeticProductType
      ? `${
          f.fragranceAllergens.length
            ? `Declared: ${f.fragranceAllergens.join(", ")}.`
            : "None declared."
        } Threshold: ${FRAGRANCE_ALLERGEN_THRESHOLD[f.cosmeticProductType]} (${
          f.cosmeticProductType === "rinse_off" ? "rinse-off" : "leave-on"
        }).`
      : "Select leave-on or rinse-off, then list any of the EU fragrance allergens present above the threshold.",
  },
  {
    key: "origin",
    label: "Country of origin",
    status: has(f.countryOfOrigin) ? "ok" : "missing",
  },
  {
    key: "quantity",
    label: "Nominal contents",
    status: has(f.netQuantity)
      ? hasAnyUnit(f.netQuantity)
        ? "ok"
        : "review"
      : "missing",
  },
  {
    key: "responsible",
    label: "Responsible person",
    status: has(f.responsiblePerson)
      ? looksLikeAddress(f.responsiblePerson)
        ? "ok"
        : "review"
      : "missing",
    why: "A UK/EU responsible person address must appear on the pack.",
  },
  {
    key: "instructions_for_use",
    label: "Instructions for use / precautions",
    status: has(f.instructionsForUse) ? "ok" : "missing",
    why: "UK Cosmetic Products Enforcement Regulations require particular precautions to be observed in use — distinct from storage instructions.",
  },
  {
    key: "pao",
    label: "PAO symbol or minimum durability date",
    status:
      f.dateType === "pao"
        ? has(f.paoMonths)
          ? "ok"
          : "missing"
        : f.dateType === "durability"
        ? has(f.bestBefore)
          ? "ok"
          : "missing"
        : "review",
    why: "Products lasting ≥30 months use a Period-After-Opening (PAO) symbol (e.g. '12M'); shorter shelf life needs a date of minimum durability.",
  },
  {
    key: "batch",
    label: "Batch code",
    status: has(f.batchNumber) ? "ok" : "missing",
  },
];

const genericRules = (f: LabelFields): RuleResult[] => [
  {
    key: "identity",
    label: "Product identity",
    status: has(f.productName) && has(f.brandName) ? "ok" : "missing",
  },
  {
    key: "ingredients",
    label: "Ingredients declared",
    status: has(f.ingredients) ? "ok" : "missing",
  },
  {
    key: "quantity",
    label: "Quantity declared",
    status: has(f.netQuantity)
      ? hasAnyUnit(f.netQuantity)
        ? "ok"
        : "review"
      : "missing",
  },
  {
    key: "responsible",
    label: "Responsible person",
    status: has(f.responsiblePerson) ? "ok" : "missing",
  },
  {
    key: "origin",
    label: "Country of origin",
    status: has(f.countryOfOrigin) ? "ok" : "review",
  },
];

export function evaluateLabel(f: LabelFields): {
  score: number;
  rules: RuleResult[];
  pack: Pack;
} {
  const pack = getPack(f.category);
  const rules =
    pack === "food"
      ? foodRules(f)
      : pack === "cosmetic"
      ? cosmeticRules(f)
      : genericRules(f);
  const passed = rules.filter((r) => r.status === "ok").length;
  const score = Math.round((passed / rules.length) * 100);
  return { score, rules, pack };
}
