import { createContext, useContext, useState, ReactNode } from "react";
import type { ScanChanges } from "./scan-diff";
import { findAllergensInText, findFragranceAllergensInIngredients } from "./allergens";
import type { RuleFinding, RulebookStamp } from "../../supabase/functions/_shared/rule-engine";

export type { RuleFinding, RulebookStamp };

// Four-state field status, replacing a binary found/missing model:
//   verified       — clearly visible, extracted with high confidence
//   low_confidence — detected but unclear, blurry, or inferred rather than
//                    directly read
//   not_verified   — cannot be confirmed because the area where this would
//                    normally appear wasn't visible in the submitted image(s)
//   missing        — confirmed absent; only used once full packaging
//                    coverage has been analysed (see CoverageAssessment)
export type FieldStatus = "verified" | "low_confidence" | "not_verified" | "missing";

export interface DetectedField {
  label: string;
  value: string | null;
  status: FieldStatus;
  suggestedFix?: string | null;
}

// Whether the submitted image(s) show enough of the packaging to trust a
// "missing" verdict. isComplete must be true before any field may be
// reported as confirmed absent — see buildScanResult's enforcement below.
export interface CoverageAssessment {
  isComplete: boolean;
  visibleAreas: string[];
  missingAreas: string[];
  note: string;
}

export interface ScanResult {
  scanId?: string | null;
  fileName: string;
  category: string;
  fields: DetectedField[];
  foundCount: number;
  totalCount: number;
  needsAttentionCount: number;
  coverage: CoverageAssessment;
  // Deterministic checks against the versioned rulebook, ranked legal
  // first. Empty when no rulebook covers the category (only cosmetics so
  // far); rulebook is the version they were checked against.
  findings: RuleFinding[];
  rulebook: RulebookStamp | null;
  isSeasonal?: boolean;
  seasonTag?: string | null;
  changes?: ScanChanges | null;
  productKey?: string | null;
  productName?: string | null;
  lockedVersion?: {
    id: string;
    versionNumber: number;
    approvedAt: string;
    approvedBy: string | null;
  } | null;
  pendingChangeRequestId?: string | null;
  isLockedMaster?: boolean;
  lockedMasterVersionNumber?: number;
}

export interface ScanOptions {
  isSeasonal: boolean;
  seasonTag: string | null;
}

interface ScanContextType {
  files: File[];
  setFiles: (f: File[]) => void;
  options: ScanOptions;
  setOptions: (o: ScanOptions) => void;
  result: ScanResult | null;
  setResult: (r: ScanResult | null) => void;
  reset: () => void;
}

const defaultOptions: ScanOptions = { isSeasonal: false, seasonTag: null };

const ScanContext = createContext<ScanContextType | null>(null);

export const ScanProvider = ({ children }: { children: ReactNode }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [options, setOptions] = useState<ScanOptions>(defaultOptions);
  const [result, setResult] = useState<ScanResult | null>(null);

  const reset = () => {
    setFiles([]);
    setResult(null);
    setOptions(defaultOptions);
  };

  return (
    <ScanContext.Provider value={{ files, setFiles, options, setOptions, result, setResult, reset }}>
      {children}
    </ScanContext.Provider>
  );
};

export const useScan = () => {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error("useScan must be used within ScanProvider");
  return ctx;
};

const isCosmeticCategory = (category: string) => {
  const c = category.trim().toLowerCase();
  return c === "cosmetic" || c === "skincare";
};

const isFoodRegimeCategory = (category: string) => {
  const c = category.trim().toLowerCase();
  return c === "food" || c === "beverage" || c === "supplement" || c === "supplements";
};

// Fixes the allergen cross-reference gap: the AI already extracts the full
// ingredients list, but that text was never checked against the known
// allergen lists before deciding whether the Allergens field is verified.
// Upgrades (never fully to "verified" — this is an inference from
// composition, not a direct read of an explicit allergen statement) a
// not_verified/missing Allergens field to low_confidence when the
// ingredients list itself reveals known allergens.
const crossReferenceAllergens = (fields: DetectedField[], category: string): DetectedField[] => {
  const ingredientsField = fields.find((f) => f.label === "Ingredients");
  if (!ingredientsField?.value) return fields;

  let detectedDisplay: string[] = [];
  if (isCosmeticCategory(category)) {
    detectedDisplay = findFragranceAllergensInIngredients(ingredientsField.value);
  } else if (isFoodRegimeCategory(category)) {
    detectedDisplay = findAllergensInText(ingredientsField.value).map((a) =>
      a.replace(/\b\w/g, (c) => c.toUpperCase())
    );
  }
  if (detectedDisplay.length === 0) return fields;

  return fields.map((f) => {
    if (f.label !== "Allergens") return f;
    const note = `Cross-referenced from ingredients: ${detectedDisplay.join(", ")}.`;
    const upgraded: FieldStatus =
      f.status === "missing" || f.status === "not_verified" ? "low_confidence" : f.status;
    return { ...f, value: f.value ? `${f.value}\n${note}` : note, status: upgraded };
  });
};

// Convert AI response into a ScanResult
export const buildScanResult = (
  fileName: string,
  aiData: {
    category: string;
    fields: DetectedField[];
    coverage?: CoverageAssessment;
    findings?: RuleFinding[];
    rulebook?: RulebookStamp | null;
  }
): ScanResult => {
  const coverage: CoverageAssessment = aiData.coverage ?? {
    isComplete: false,
    visibleAreas: [],
    missingAreas: [],
    note: "Coverage could not be assessed for this image.",
  };

  // Critical rule: never treat a field as confirmed absent unless full
  // packaging coverage was confirmed. Enforced here as a client-side
  // safety net in addition to the edge function's own enforcement, so a
  // false "missing" can never reach the UI even if one layer slips.
  let fields = aiData.fields.map((f): DetectedField =>
    f.status === "missing" && !coverage.isComplete ? { ...f, status: "not_verified" } : f
  );

  fields = crossReferenceAllergens(fields, aiData.category);

  return {
    fileName,
    category: aiData.category,
    fields,
    foundCount: fields.filter((f) => f.status === "verified").length,
    totalCount: fields.length,
    needsAttentionCount: fields.filter((f) => f.status !== "verified").length,
    coverage,
    findings: Array.isArray(aiData.findings) ? aiData.findings : [],
    rulebook: aiData.rulebook ?? null,
  };
};

export interface OverallAssessment {
  tone: "needs-images" | "good" | "attention";
  banner: string;
  detail: string;
}

// Structurally prevents a partial-coverage scan from being read as a
// pass/fail score: the headline banner is non-numeric ("More Images
// Needed") whenever coverage isn't complete, with the percentage demoted
// to secondary detail instead of standing as a peer number next to it.
export const getOverallAssessment = (result: ScanResult): OverallAssessment => {
  const percent =
    result.totalCount > 0 ? Math.round((result.foundCount / result.totalCount) * 100) : 0;

  if (!result.coverage.isComplete) {
    return {
      tone: "needs-images",
      banner: "More Images Needed",
      detail: `Verified Compliance: ${percent}% · Packaging Coverage: Partial`,
    };
  }
  return {
    tone: percent >= 80 ? "good" : "attention",
    banner: `${percent}% Verified Compliance`,
    detail: "Packaging Coverage: Complete",
  };
};

// Shared between the results page and the PDF export so both report the
// same assessment in the same words.
export const getAssessmentSummary = (result: ScanResult): string => {
  const notVerifiedLabels = result.fields
    .filter((f) => f.status === "not_verified" || f.status === "missing")
    .map((f) => f.label);

  if (result.coverage.isComplete) {
    return `The submitted images cover the full packaging. ${result.foundCount} of ${result.totalCount} core labelling fields were verified.${
      notVerifiedLabels.length ? ` The following remain unclear: ${notVerifiedLabels.join(", ")}.` : ""
    }`;
  }
  return `The submitted image contains ${result.foundCount} of ${result.totalCount} core labelling fields. However, because ${
    result.coverage.visibleAreas.length
      ? `only ${result.coverage.visibleAreas.join(", ")} ${result.coverage.visibleAreas.length > 1 ? "are" : "is"} visible`
      : "the full packaging was not visible"
  }, the system could not verify: ${notVerifiedLabels.join(", ") || "some fields"}. Additional images${
    result.coverage.missingAreas.length ? ` of the ${result.coverage.missingAreas.join(", ")}` : ""
  } are recommended before concluding the product is non-compliant.`;
};

// Fallback mock result if AI fails
export const generateMockResult = (fileName: string): ScanResult => {
  const fields: DetectedField[] = [
    { label: "Product Name", value: "Organic Rosehip Face Oil", status: "verified" },
    {
      label: "Ingredients",
      value: "Rosa Canina Fruit Oil, Simmondsia Chinensis Seed Oil, Tocopherol",
      status: "verified",
    },
    { label: "Warnings", value: "For external use only. Avoid contact with eyes.", status: "verified" },
    {
      label: "Manufacturer / Responsible Person",
      value: null,
      status: "not_verified",
      suggestedFix:
        "Capture an additional image of the back-of-pack — manufacturer/responsible-person details are commonly printed there.",
    },
    { label: "Country of Origin", value: "United Kingdom", status: "verified" },
    {
      label: "Batch / Lot Number",
      value: null,
      status: "not_verified",
      suggestedFix:
        "Capture an image of the base or opposite side of the container — batch/lot numbers are commonly printed separately from the main label.",
    },
    {
      label: "Expiry / Best Before",
      value: null,
      status: "not_verified",
      suggestedFix: "Capture the full packaging to verify whether a PAO symbol or expiry date is present.",
    },
    { label: "Allergens", value: "Limonene, Geraniol, Linalool", status: "verified" },
    { label: "Net Quantity", value: "30ml / 1.0 fl oz", status: "verified" },
    {
      label: "Storage Instructions",
      value: null,
      status: "not_verified",
      suggestedFix: "Capture an additional image of the back-of-pack — storage instructions are commonly printed there.",
    },
  ];

  return {
    fileName,
    category: "Cosmetic",
    fields,
    foundCount: fields.filter((f) => f.status === "verified").length,
    totalCount: fields.length,
    needsAttentionCount: fields.filter((f) => f.status !== "verified").length,
    coverage: {
      isComplete: false,
      visibleAreas: ["front label"],
      missingAreas: ["back-of-pack", "base", "opposite side"],
      note: "Only the front label is visible in the submitted image; the back-of-pack, base and opposite side were not captured.",
    },
    findings: [],
    rulebook: null,
  };
};
