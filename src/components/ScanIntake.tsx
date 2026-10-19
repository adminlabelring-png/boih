import { motion } from "framer-motion";
import { Globe, Languages, Package, Shapes, UserRound } from "lucide-react";
import type { Market, PackFormat, ProductType, Role, ScanOptions } from "@/lib/scan-context";
import { cn } from "@/lib/utils";

const MARKETS: { value: Market; label: string; hint: string }[] = [
  { value: "GB", label: "Great Britain", hint: "England, Scotland, Wales" },
  { value: "NI", label: "Northern Ireland", hint: "Follows EU cosmetics rules" },
  { value: "EU", label: "EU", hint: "Any EU member state" },
];

const ROLES: { value: Role; label: string }[] = [
  { value: "manufacturer", label: "Manufacturer / brand" },
  { value: "importer", label: "Importer" },
  { value: "distributor", label: "Distributor" },
];

export const PACK_OPTIONS: { value: PackFormat; label: string; hint: string }[] = [
  { value: "carton", label: "Container in a box", hint: "A bottle, jar or tube sold in an outer carton" },
  { value: "container_only", label: "No outer box", hint: "The container is all the customer gets" },
  { value: "small", label: "Under 5 g / 5 ml", hint: "Mini or travel size" },
  { value: "sample", label: "Free sample or single use", hint: "Sachets, testers, single-application packs" },
  { value: "leaflet", label: "Too small for all the text", hint: "Some information is on an enclosed leaflet, tag or card" },
];

// The kind of cosmetic: decides which annex conditions (e.g. "not to be
// used in eye products") and type-specific rules apply.
export const PRODUCT_TYPE_OPTIONS: { value: ProductType; label: string; hint: string }[] = [
  { value: "liquid_cream", label: "Liquid or cream", hint: "Lotions, creams, serums, gels, shampoos, cleansers, oils" },
  { value: "solid_bar", label: "Solid or bar", hint: "Soap bars, shampoo bars, solid deodorants" },
  { value: "eye_area", label: "Eye area", hint: "Mascara, eyeliner, eyeshadow, eye cream" },
  { value: "lip_oral", label: "Lip or oral", hint: "Lipstick, lip balm, lip gloss, toothpaste, mouthwash" },
  { value: "fragrance", label: "Fragrance", hint: "Perfume, eau de toilette, body mist" },
];

// EU countries whose language rules the rulebook covers.
export const EU_COUNTRY_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: "DE", label: "Germany", hint: "Label text in German" },
  { value: "FR", label: "France", hint: "Label text in French" },
];

const chip = (active: boolean) =>
  cn(
    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors text-left",
    active ? "border-primary bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"
  );

// The intake questions the rule engine needs beyond what it can read off
// the pack: which markets to check against, who is placing the product on
// the market, what kind of product it is, and what it's packed in
// (Article 19's small-pack rules).
const ScanIntake = ({ options, setOptions }: { options: ScanOptions; setOptions: (o: ScanOptions) => void }) => {
  const toggleMarket = (m: Market) => {
    const next = options.markets.includes(m)
      ? options.markets.filter((x) => x !== m)
      : [...options.markets, m];
    // At least one market is always checked.
    if (next.length > 0) setOptions({ ...options, markets: next });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="rounded-xl border bg-card p-4 space-y-4 text-left"
    >
      <div>
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">Where will you sell it?</p>
        </div>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Markets">
          {MARKETS.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={options.markets.includes(m.value)}
              onClick={() => toggleMarket(m.value)}
              className={chip(options.markets.includes(m.value))}
              title={m.hint}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      {options.markets.includes("EU") && (
        <div>
          <div className="flex items-center gap-2">
            <Languages className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">Which EU countries?</p>
          </div>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="EU countries">
            {EU_COUNTRY_OPTIONS.map((c) => {
              const active = options.countries.includes(c.value);
              return (
                <button
                  key={c.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setOptions({
                      ...options,
                      countries: active ? options.countries.filter((x) => x !== c.value) : [...options.countries, c.value],
                    })
                  }
                  className={chip(active)}
                  title={c.hint}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">Each country decides the language the label must use.</p>
        </div>
      )}
      <div>
        <div className="flex items-center gap-2">
          <UserRound className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">Your role <span className="text-muted-foreground font-normal">(optional)</span></p>
        </div>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Role">
          {ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={options.role === r.value}
              onClick={() => setOptions({ ...options, role: options.role === r.value ? null : r.value })}
              className={chip(options.role === r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-center gap-2">
          <Shapes className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">What kind of product? <span className="text-muted-foreground font-normal">(optional)</span></p>
        </div>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Product type">
          {PRODUCT_TYPE_OPTIONS.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={options.productType === t.value}
              onClick={() => setOptions({ ...options, productType: options.productType === t.value ? null : t.value })}
              className={chip(options.productType === t.value)}
              title={t.hint}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">If you skip this, we'll work it out from the label.</p>
      </div>
      <div>
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">How is it packed? <span className="text-muted-foreground font-normal">(optional)</span></p>
        </div>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Pack">
          {PACK_OPTIONS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={options.pack === p.value}
              onClick={() => setOptions({ ...options, pack: options.pack === p.value ? null : p.value })}
              className={chip(options.pack === p.value)}
              title={p.hint}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export default ScanIntake;
