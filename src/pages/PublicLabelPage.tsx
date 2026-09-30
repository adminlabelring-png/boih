import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Loader2, ShieldCheck, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSeo } from "@/hooks/use-seo";

interface LabelRow {
  id: string;
  brand_name: string | null;
  product_name: string | null;
  category: string | null;
  ingredients: string | null;
  allergens: string | null;
  country_of_origin: string | null;
  net_quantity: string | null;
  batch_number: string | null;
  best_before: string | null;
  responsible_person: string | null;
  certifications: string | null;
  preview_text: string | null;
  compliance_score: number;
  created_at: string;
}

const Row = ({ label, value }: { label: string; value: string | null }) =>
  value ? (
    <div className="border-b border-border/60 py-2 last:border-none">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm text-foreground">{value}</div>
    </div>
  ) : null;

const PublicLabelPage = () => {
  const { id } = useParams<{ id: string }>();
  const [label, setLabel] = useState<LabelRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase
        .from("generated_labels")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) setNotFound(true);
      else setLabel(data as LabelRow);
      setLoading(false);
    })();
  }, [id]);

  // Auto-generated, per-user product records — not curated content, so
  // kept out of search results by default to avoid diluting the site
  // with thin/duplicate pages at scale.
  useSeo({
    title: label ? `${label.product_name || "Product"} label | Labelring` : "Label | Labelring",
    description: "A digital product label generated with Labelring.",
    noindex: true,
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !label) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-lg font-semibold">Label not found</p>
        <p className="text-sm text-muted-foreground">
          This link may have expired or been removed.
        </p>
        <Link to="/generate" className="text-sm text-primary underline">
          Create a new label
        </Link>
      </div>
    );
  }

  const score = label.compliance_score;
  const scoreColor =
    score >= 80
      ? "text-[hsl(var(--risk-low))]"
      : score >= 50
      ? "text-[hsl(var(--risk-medium))]"
      : "text-[hsl(var(--risk-high))]";

  return (
    <div className="min-h-screen bg-muted/40 py-6">
      <div className="mx-auto max-w-lg px-4">
        <Link
          to="/generate"
          className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Create your own
        </Link>

        <div className="rounded-xl border bg-card shadow-sm">
          <div className="rounded-t-xl bg-primary p-5 text-primary-foreground">
            <div className="flex items-center justify-between">
              <div>
                {label.brand_name && (
                  <div className="text-[11px] uppercase tracking-widest opacity-80">
                    {label.brand_name}
                  </div>
                )}
                <div className="mt-0.5 text-xl font-bold">
                  {label.product_name || "Product"}
                </div>
                {label.category && (
                  <div className="mt-0.5 text-xs opacity-80">{label.category}</div>
                )}
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider opacity-80">
                  Score
                </div>
                <div className={`text-3xl font-bold ${scoreColor} rounded bg-white/95 px-2 py-0.5`}>
                  {score}%
                </div>
              </div>
            </div>
          </div>

          {label.preview_text && (
            <div className="border-b bg-muted/30 p-5">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                On-pack copy
              </div>
              <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-foreground">
                {label.preview_text}
              </pre>
            </div>
          )}

          <div className="p-5">
            <Row label="Ingredients" value={label.ingredients} />
            <Row label="Allergens" value={label.allergens} />
            <Row label="Net quantity" value={label.net_quantity} />
            <Row label="Best before" value={label.best_before} />
            <Row label="Batch number" value={label.batch_number} />
            <Row label="Country of origin" value={label.country_of_origin} />
            <Row label="Responsible person" value={label.responsible_person} />
            <Row label="Certifications" value={label.certifications} />
          </div>

          <div className="flex items-center gap-2 rounded-b-xl border-t bg-muted/20 px-5 py-3 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Draft checked against current UK regulations · not a guarantee of compliance
          </div>
        </div>

        <p className="mt-3 text-center text-[10px] text-muted-foreground">
          Generated {new Date(label.created_at).toLocaleString("en-GB")}
        </p>
      </div>
    </div>
  );
};

export default PublicLabelPage;
