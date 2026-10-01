import { supabase } from "@/integrations/supabase/client";

export interface ProductRow {
  id: string;
  brand_id: string;
  product_key: string;
  name: string;
  sku: string | null;
  category: string | null;
  supplier_id: string | null;
  material_data: Record<string, unknown>;
  is_seasonal: boolean;
  season_tag: string | null;
  launch_date: string | null;
  label_status: string;
  label_version: string | null;
  label_types: string[];
  thumbnail: string | null;
  updated_at: string;
}

export interface SupplierRow {
  id: string;
  brand_id: string;
  name: string;
  verification_status: string;
  verification_score: number;
  last_activity_at: string;
  notes: string | null;
}

export const fetchProducts = async (brandId: string): Promise<ProductRow[]> => {
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("brand_id", brandId)
    .order("updated_at", { ascending: false });
  return (data ?? []) as unknown as ProductRow[];
};

export const fetchSuppliers = async (brandId: string): Promise<SupplierRow[]> => {
  const { data } = await supabase
    .from("suppliers")
    .select("*")
    .eq("brand_id", brandId)
    .order("verification_score", { ascending: false });
  return (data ?? []) as unknown as SupplierRow[];
};

// "today", "1 day ago", "5 days ago" — for alert timestamps taken from the
// rows themselves rather than made up.
export const daysAgo = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const days = Math.floor((Date.now() - +new Date(iso)) / 86400000);
  if (days <= 0) return "Today";
  return days === 1 ? "1 day ago" : `${days} days ago`;
};
