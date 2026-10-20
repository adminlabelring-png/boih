// Product categories. The value stored in the database matches the label
// (title case) and drives the label generator's rule pack via getPack().

// Checked by the cosmetics rulebook.
export const COSMETICS_CATEGORIES = ["Skincare", "Haircare", "Makeup", "Fragrance"] as const;
// Not checked against a rulebook yet: hidden from the label generator, and
// offered as "Coming soon" on the lead forms. Kept (with their old
// hard-coded checks) for when food and other rulebooks are added.
export const COMING_SOON_CATEGORIES = ["Food", "Beverage", "Supplement", "Household"] as const;

// Every category the generator understands, including hidden ones, so a
// label saved under an older category still opens.
export const CATEGORIES = [...COSMETICS_CATEGORIES, ...COMING_SOON_CATEGORIES, "Other"] as const;
export type CategoryValue = (typeof CATEGORIES)[number];

// What the label generator offers.
export const GENERATOR_CATEGORIES: readonly string[] = COSMETICS_CATEGORIES;

// The early-access form and the lead-capture dialog ask what the brand
// sells: cosmetics first (what Labelring checks today), then the
// categories that are coming soon. Includes every generator category, so
// the generator's category is always a valid default for the dialog.
export const LEAD_CATEGORIES = [...COSMETICS_CATEGORIES, ...COMING_SOON_CATEGORIES, "Other"] as const;
