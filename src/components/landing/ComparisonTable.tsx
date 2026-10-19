import { XCircle, CheckCircle2 } from "lucide-react";

const rows: [string, string][] = [
  [
    "Brands piece together requirements from the UK Cosmetics Regulation, OPSS guidance and EU rules, with no single source of truth.",
    "One place that checks your label against the UK and EU cosmetics rules for each market you sell in, kept current as they change.",
  ],
  [
    "Label text, INCI lists and Responsible Person details are copied by hand between artwork files, spreadsheets and supplier emails.",
    "Scan your existing label or start a new one. Labelring reads what's there, so you fill the gaps, not the whole form.",
  ],
  [
    "Brands discover non-compliance during a Trading Standards inspection, or worse, a product recall.",
    "Each check shows what needs action, what couldn't be checked and what passed, before your label goes to print.",
  ],
  [
    "CMR bans, formaldehyde labelling and the EU allergen update are all landing in 2025 and 2026. Most brands aren't ready.",
    "Checks for banned and restricted substances, fragrance allergens and required label wording, with a print-ready label per market.",
  ],
];

const ComparisonTable = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 rounded-xl border overflow-hidden">
    <div className="bg-[hsl(var(--risk-high-bg))] px-5 py-3 border-b md:border-b-0 md:border-r">
      <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--risk-high))]">
        <XCircle className="h-4 w-4" /> The current reality
      </div>
    </div>
    <div className="bg-[hsl(var(--risk-low-bg))] px-5 py-3 border-b md:border-b-0">
      <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--risk-low))]">
        <CheckCircle2 className="h-4 w-4" /> With Labelring
      </div>
    </div>
    {rows.map(([reality, us], i) => (
      <div key={i} className="contents">
        <div className={`bg-card px-5 py-4 text-sm text-foreground/80 border-t ${i % 2 ? "md:bg-muted/30" : ""} md:border-r`}>
          {reality}
        </div>
        <div className={`bg-card px-5 py-4 text-sm text-foreground border-t ${i % 2 ? "md:bg-muted/30" : ""}`}>
          {us}
        </div>
      </div>
    ))}
  </div>
);

export default ComparisonTable;
