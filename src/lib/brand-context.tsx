import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Vertical = "skincare" | "food" | "jewelry";

export interface Brand {
  id: string;
  name: string;
  slug: string;
  vertical: Vertical;
  logo_url: string | null;
  default_market: string | null;
}

interface BrandContextValue {
  brand: Brand | null;
  brands: Brand[];
  loading: boolean;
  switchBrand: (id: string) => void;
  refresh: () => void;
}

const BrandContext = createContext<BrandContextValue | undefined>(undefined);
export const ACTIVE_BRAND_KEY = "labelring.active_brand_id";
const STORAGE_KEY = ACTIVE_BRAND_KEY;

export const verticalColor = (v: Vertical): string => {
  switch (v) {
    case "jewelry": return "hsl(45 80% 50%)";
    case "food": return "hsl(20 75% 50%)";
    case "skincare":
    default: return "hsl(160 60% 45%)";
  }
};

export const verticalLabel = (v: Vertical): string => {
  switch (v) {
    case "jewelry": return "Jewelry";
    case "food": return "Food";
    case "skincare": return "Skincare";
  }
};

export const BrandProvider = ({ children }: { children: ReactNode }) => {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloads, setReloads] = useState(0);
  const refresh = useCallback(() => setReloads((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("id, name, slug, vertical, logo_url, default_market")
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (!error && data) {
        const list = data as Brand[];
        setBrands(list);
        const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
        const initial = stored && list.find(b => b.id === stored) ? stored : list[0]?.id ?? null;
        setActiveId(initial);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [reloads]);

  const switchBrand = useCallback((id: string) => {
    setActiveId(id);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const brand = brands.find(b => b.id === activeId) ?? null;

  return (
    <BrandContext.Provider value={{ brand, brands, loading, switchBrand, refresh }}>
      {children}
    </BrandContext.Provider>
  );
};

export const useBrand = () => {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error("useBrand must be used within BrandProvider");
  return ctx;
};
