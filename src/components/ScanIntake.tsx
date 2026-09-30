import { motion } from "framer-motion";
import { Globe, UserRound } from "lucide-react";
import type { Market, Role, ScanOptions } from "@/lib/scan-context";
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

const chip = (active: boolean) =>
  cn(
    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors text-left",
    active ? "border-primary bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"
  );

// The two intake questions the rule engine needs beyond what it can read
// off the pack: which markets to check against, and who is placing the
// product on the market.
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
    </motion.div>
  );
};

export default ScanIntake;
