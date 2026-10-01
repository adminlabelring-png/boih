import { CheckCircle2, Languages, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { findingStatusLabel } from "@/lib/rule-findings";
import type { DraftCheck } from "@/lib/generate-label";
import type { LabelFields } from "@/lib/label-rules";
import { LANGUAGE_NAMES, type Variant, type VariantText } from "@/lib/label-variants";

// One tab per market version: which Responsible Person it carries, its
// wording in the market's language (typed or AI-translated), and the
// rulebook check for that market alone.

const FIELDS: { key: "productName" | "instructionsForUse" | "storageInstructions" | "countryOfOrigin"; label: string; long?: boolean }[] = [
  { key: "productName", label: "Product name and function" },
  { key: "instructionsForUse", label: "Instructions for use and precautions", long: true },
  { key: "storageInstructions", label: "Storage instructions" },
  { key: "countryOfOrigin", label: "Country of origin" },
];

interface Props {
  master: LabelFields;
  variants: Variant[];
  text: Record<string, VariantText>;
  onChange: (id: string, text: VariantText) => void;
  checks: Record<string, DraftCheck | null>;
  translating: string | null;
  onTranslate: (v: Variant) => void;
}

const MarketVersions = ({ master, variants, text, onChange, checks, translating, onTranslate }: Props) => (
  <section className="rounded-lg border bg-card p-5">
    <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Market versions</h2>
    <p className="mb-4 text-xs text-muted-foreground">
      Each market gets its own label: only its own Responsible Person, and its required language for the function,
      usage and precautions. Ingredients, batch and quantity come from the master label.
    </p>
    <Tabs defaultValue={variants[0]?.id}>
      <TabsList className="flex flex-wrap h-auto">
        {variants.map((v) => {
          const c = checks[v.id];
          const failing = c?.findings.filter((f) => f.severity === "legal" && f.status === "fail").length ?? 0;
          return (
            <TabsTrigger key={v.id} value={v.id} className="text-xs gap-1.5">
              {v.label}
              {c && (failing ? <XCircle className="h-3.5 w-3.5 text-[hsl(var(--risk-high))]" /> : <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--risk-low))]" />)}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {variants.map((v) => {
        const t = text[v.id] ?? {};
        const rp = v.market === "GB" ? master.responsiblePerson : master.euResponsiblePerson;
        const check = checks[v.id];
        const open = check?.findings.filter((f) => f.status !== "pass") ?? [];
        return (
          <TabsContent key={v.id} value={v.id} className="space-y-4 pt-2">
            <div className="grid gap-1 text-xs">
              <div>
                <span className="text-muted-foreground">Language: </span>
                {LANGUAGE_NAMES[v.language]}
              </div>
              <div>
                <span className="text-muted-foreground">Responsible Person: </span>
                {rp?.trim() ? (
                  rp
                ) : (
                  <span className="text-[hsl(var(--risk-high))]">
                    missing: add the {v.market === "GB" ? "UK" : "EU / Northern Ireland"} Responsible Person under Business &amp; certifications
                  </span>
                )}
              </div>
            </div>

            {v.language === "en" ? (
              <p className="text-xs text-muted-foreground">Uses the master label's English wording.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Wording in {LANGUAGE_NAMES[v.language]}. The English is shown as a placeholder.
                  </p>
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={translating !== null} onClick={() => onTranslate(v)}>
                    {translating === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
                    Translate with AI
                  </Button>
                </div>
                {t.machineTranslated && (
                  <div className="rounded-md bg-[hsl(var(--risk-medium-bg))] p-3 text-xs flex flex-wrap items-center justify-between gap-2">
                    <span>Machine translation: have a native {LANGUAGE_NAMES[v.language]} speaker check it before printing.</span>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onChange(v.id, { ...t, machineTranslated: false })}>
                      It's been checked
                    </Button>
                  </div>
                )}
                {FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1.5">
                    <Label htmlFor={`v-${v.id}-${f.key}`} className="text-xs font-medium">{f.label}</Label>
                    {f.long ? (
                      <Textarea
                        id={`v-${v.id}-${f.key}`}
                        rows={3}
                        placeholder={master[f.key] || undefined}
                        value={t[f.key] ?? ""}
                        onChange={(e) => onChange(v.id, { ...t, [f.key]: e.target.value })}
                      />
                    ) : (
                      <Input
                        id={`v-${v.id}-${f.key}`}
                        placeholder={master[f.key] || undefined}
                        value={t[f.key] ?? ""}
                        onChange={(e) => onChange(v.id, { ...t, [f.key]: e.target.value })}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-md border p-3 text-xs space-y-1.5">
              <p className="font-medium">
                {check ? `Checked against ${v.label} rules: ${open.length ? `${open.length} to look at` : "all passed"}` : "Checking…"}
              </p>
              {open.map((f) => (
                <div key={f.ruleKey ?? f.title} className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    {f.status === "fail" ? (
                      <XCircle className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--risk-high))]" />
                    ) : (
                      <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-[hsl(var(--risk-medium))]" />
                    )}
                    <span className="font-medium">{f.title}</span>
                    <span className="text-muted-foreground">· {findingStatusLabel(f.status)}</span>
                  </div>
                  {f.fix && <p className="pl-5 text-muted-foreground">{f.fix}</p>}
                </div>
              ))}
            </div>
          </TabsContent>
        );
      })}
    </Tabs>
  </section>
);

export default MarketVersions;
