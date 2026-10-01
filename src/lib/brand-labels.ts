import { supabase } from "@/integrations/supabase/client";
import { emptyLabel, type LabelFields } from "@/lib/label-rules";

// A brand's saved labels. Each save is a new version (brand_label_versions)
// holding the label builder's state; the database records what changed
// since the previous version.

export interface LabelData {
  fields: LabelFields;
  markets: string[];
  pack: string | null;
  countries: string[];
}

export interface BrandLabel {
  id: string;
  brand_id: string;
  product_name: string;
  category: string | null;
  current_version: number;
  compliance_score: number | null;
  template_of: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LabelChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface BrandLabelVersion {
  id: string;
  label_id: string;
  version: number;
  data: LabelData;
  compliance_score: number | null;
  rulebook_version: string | null;
  changes: LabelChange[];
  note: string | null;
  created_by_email: string | null;
  created_at: string;
}

// Saved data back into builder state; fields added to the builder since the
// label was saved get their empty value.
export const normaliseLabelData = (raw: unknown): LabelData => {
  const d = (raw ?? {}) as Partial<LabelData>;
  return {
    fields: { ...emptyLabel, ...(d.fields ?? {}) },
    markets: Array.isArray(d.markets) ? d.markets : ["GB"],
    pack: typeof d.pack === "string" ? d.pack : null,
    countries: Array.isArray(d.countries) ? d.countries : [],
  };
};

// Facts about one product, cleared when a label starts another product's
// label. What stays is what a brand's products share: brand, category,
// responsible persons, origin, certifications, how the date is marked,
// storage, product type, usage and precautions, markets and pack.
export const PRODUCT_SPECIFIC_FIELDS: (keyof LabelFields)[] = [
  "productName",
  "ingredients",
  "allergens",
  "netQuantity",
  "batchNumber",
  "bestBefore",
  "quidPercent",
  "alcoholAbv",
  "nutrition",
  "paoMonths",
  "fragranceAllergens",
];

export const templateFrom = (data: LabelData): LabelData => {
  const fields = { ...data.fields };
  for (const k of PRODUCT_SPECIFIC_FIELDS) {
    (fields as Record<string, unknown>)[k] = emptyLabel[k];
  }
  return { ...data, fields };
};

export const fetchBrandLabels = async (brandId: string): Promise<BrandLabel[]> => {
  const { data, error } = await supabase
    .from("brand_labels" as never)
    .select("*")
    .eq("brand_id", brandId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as BrandLabel[];
};

export const fetchLabelVersions = async (labelId: string): Promise<BrandLabelVersion[]> => {
  const { data, error } = await supabase
    .from("brand_label_versions" as never)
    .select("*")
    .eq("label_id", labelId)
    .order("version", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as BrandLabelVersion[];
};

export const fetchLabel = async (
  labelId: string
): Promise<{ label: BrandLabel; latest: BrandLabelVersion } | null> => {
  const { data: label, error } = await supabase
    .from("brand_labels" as never)
    .select("*")
    .eq("id", labelId)
    .maybeSingle();
  if (error) throw error;
  if (!label) return null;
  const l = label as unknown as BrandLabel;
  const { data: v, error: vErr } = await supabase
    .from("brand_label_versions" as never)
    .select("*")
    .eq("label_id", labelId)
    .eq("version", l.current_version)
    .maybeSingle();
  if (vErr) throw vErr;
  if (!v) return null;
  return { label: l, latest: v as unknown as BrandLabelVersion };
};

export interface SaveLabelInput {
  brandId: string;
  labelId: string | null;
  data: LabelData;
  score: number | null;
  rulebookVersion: string | null;
  note: string | null;
  templateOf: string | null;
}

export const saveBrandLabel = async (input: SaveLabelInput): Promise<{ labelId: string; version: number }> => {
  const { data, error } = await supabase.rpc("save_brand_label" as never, {
    p_brand: input.brandId,
    p_label: input.labelId,
    p_data: input.data,
    p_score: input.score,
    p_rulebook_version: input.rulebookVersion,
    p_note: input.note,
    p_template: input.templateOf,
  } as never);
  if (error) throw error;
  const rows = data as unknown as { label_id: string; version: number }[] | { label_id: string; version: number } | null;
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) throw new Error("The label wasn't saved.");
  return { labelId: row.label_id, version: row.version };
};

export const setLabelArchived = async (labelId: string, archived: boolean) => {
  const { error } = await supabase.rpc("set_brand_label_archived" as never, {
    p_label: labelId,
    p_archived: archived,
  } as never);
  if (error) throw error;
};

// "Aqua, Parfum" / ["GB","EU"] / true -> text for a change list.
export const formatChangeValue = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== "" && x != null);
    return entries.length ? entries.map(([k, x]) => `${k}: ${x}`).join(", ") : "—";
  }
  return String(v);
};

// Names for the change list.
export const CHANGE_FIELD_NAMES: Record<string, string> = {
  brandName: "Brand name",
  productName: "Product name",
  category: "Category",
  ingredients: "Ingredients",
  allergens: "Allergens",
  countryOfOrigin: "Country of origin",
  netQuantity: "Net quantity",
  batchNumber: "Batch / lot code",
  bestBefore: "Date mark",
  responsiblePerson: "Responsible person (UK)",
  euResponsiblePerson: "Responsible person (EU / NI)",
  certifications: "Certifications",
  dateType: "Date type",
  storageInstructions: "Storage instructions",
  quidPercent: "QUID declaration",
  alcoholAbv: "Alcohol strength",
  nutrition: "Nutrition",
  packagedProtectiveAtmosphere: "Packaged in a protective atmosphere",
  nano: "Nano ingredients",
  irradiated: "Irradiated",
  paoMonths: "Period after opening",
  fragranceAllergens: "Fragrance allergens",
  cosmeticProductType: "Leave-on / rinse-off",
  instructionsForUse: "Instructions and precautions",
  markets: "Markets",
  pack: "Pack",
  countries: "EU countries",
};
