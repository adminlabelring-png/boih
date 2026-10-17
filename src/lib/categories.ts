// Shared product category list used by the label generator. The value
// stored in the database matches the label (title case) so it also drives
// the generator's rule pack via getPack().

export const CATEGORIES = [
  "Food",
  "Beverage",
  "Supplement",
  "Skincare",
  "Household",
  "Other",
] as const;

export type CategoryValue = (typeof CATEGORIES)[number];

// The early-access form and the lead-capture dialog ask what the brand
// sells: cosmetics first (what Labelring checks today), then the
// categories that are coming soon. Includes every generator category, so
// the generator's category is always a valid default for the dialog.
export const COSMETICS_CATEGORIES = ["Skincare", "Haircare", "Makeup", "Fragrance"] as const;
export const COMING_SOON_CATEGORIES = ["Food", "Beverage", "Supplement", "Household"] as const;
export const LEAD_CATEGORIES = [...COSMETICS_CATEGORIES, ...COMING_SOON_CATEGORIES, "Other"] as const;
