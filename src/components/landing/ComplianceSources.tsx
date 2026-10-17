import { ExternalLink } from "lucide-react";

// Where the cosmetics rulebook's requirements come from. The rulebook links
// each rule to these same texts.
const sources: { layer: string; links: { label: string; href: string }[]; use: string }[] = [
  {
    layer: "Legislation (GB)",
    links: [
      { label: "Regulation 1223/2009 (as it applies in GB)", href: "https://www.legislation.gov.uk/eur/2009/1223/contents" },
      { label: "Cosmetic Products Enforcement Regulations 2013", href: "https://www.legislation.gov.uk/uksi/2013/1478/contents" },
    ],
    use: "Primary legal text from legislation.gov.uk, including the banned and restricted substance annexes.",
  },
  {
    layer: "Guidance",
    links: [
      { label: "OPSS cosmetics guidance", href: "https://www.gov.uk/guidance/making-cosmetic-products-available-to-consumers-in-great-britain" },
    ],
    use: "The Office for Product Safety and Standards, which enforces the rules in GB and runs the SCPN notification portal.",
  },
  {
    layer: "EU reference",
    links: [
      { label: "EUR-Lex: Regulation (EC) No 1223/2009", href: "https://eur-lex.europa.eu/eli/reg/2009/1223/oj" },
      { label: "EUR-Lex: Regulation (EU) 2023/1545 (allergens)", href: "https://eur-lex.europa.eu/eli/reg/2023/1545/oj" },
      { label: "ECHA", href: "https://echa.europa.eu/" },
    ],
    use: "EU-side rules for products sold in the EU and Northern Ireland, relevant if you export.",
  },
];

const ComplianceSources = () => (
  <div className="rounded-xl border overflow-hidden">
    <div className="hidden md:grid grid-cols-[10rem_1fr_1fr] bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <div className="px-5 py-3">Layer</div>
      <div className="px-5 py-3">Source</div>
      <div className="px-5 py-3">How we use it</div>
    </div>
    {sources.map((s) => (
      <div key={s.layer} className="grid grid-cols-1 md:grid-cols-[10rem_1fr_1fr] border-t first:border-t-0 md:first:border-t bg-card">
        <div className="px-5 pt-4 md:py-4 text-sm font-semibold">{s.layer}</div>
        <div className="px-5 py-2 md:py-4 space-y-1">
          {s.links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-1 text-sm text-primary hover:underline underline-offset-2"
            >
              {l.label} <ExternalLink className="h-3 w-3 mt-1 shrink-0" />
            </a>
          ))}
        </div>
        <div className="px-5 pb-4 md:py-4 text-sm text-muted-foreground">{s.use}</div>
      </div>
    ))}
  </div>
);

export default ComplianceSources;
