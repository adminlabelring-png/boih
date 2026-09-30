import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Loader2, Download, QrCode, Share2, Copy } from "lucide-react";
import QRCode from "qrcode";
import jsPDF from "jspdf";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

import {
  emptyLabel,
  evaluateLabel,
  deriveWarnings,
  getPack,
  type LabelFields,
  type NutritionTable,
} from "@/lib/label-rules";
import {
  findAllergensInText,
  formatAllergenList,
  splitAllergenHighlights,
  EU_FRAGRANCE_ALLERGENS,
  FRAGRANCE_ALLERGEN_THRESHOLD,
} from "@/lib/allergens";
import { generatePreview, suggestField } from "@/lib/generate-label";
import { DRAFT_LABEL_DISCLAIMER } from "@/lib/disclaimer";
import { supabase } from "@/integrations/supabase/client";
import { getLeadId } from "@/lib/lead-tracker";
import { cn } from "@/lib/utils";
import LivePreview from "@/components/generator/LivePreview";
import ComplianceCheck from "@/components/generator/ComplianceCheck";

import { CATEGORIES } from "@/lib/categories";
import LeadCaptureDialog, { hasSubmittedLead, getSignupId } from "@/components/LeadCaptureDialog";
import { useSeo } from "@/hooks/use-seo";

const NUTRITION_ROWS: { key: keyof NutritionTable; label: string; placeholder: string }[] = [
  { key: "energyKj", label: "Energy (kJ)", placeholder: "1234" },
  { key: "energyKcal", label: "Energy (kcal)", placeholder: "295" },
  { key: "fat", label: "Fat", placeholder: "12g" },
  { key: "saturates", label: "Saturates", placeholder: "3g" },
  { key: "carbs", label: "Carbohydrate", placeholder: "34g" },
  { key: "sugars", label: "Sugars", placeholder: "8g" },
  { key: "protein", label: "Protein", placeholder: "9g" },
  { key: "salt", label: "Salt", placeholder: "0.5g" },
];

const GenerateLabelPage = () => {
  useSeo({
    title: "Create a Product Label Checked Against UK Rules | Labelring",
    description:
      "Build a digital product label checked against current UK labelling regulations, with ingredient, allergen, nutrition and regulatory checks for food and cosmetics.",
    path: "/generate",
  });

  const [fields, setFields] = useState<LabelFields>(emptyLabel);
  const [preview, setPreview] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [busyField, setBusyField] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const pendingActionRef = useRef<null | (() => void)>(null);

  const requireLead = (action: () => void) => {
    if (hasSubmittedLead()) {
      action();
      return;
    }
    pendingActionRef.current = action;
    setLeadOpen(true);
  };

  const set = <K extends keyof LabelFields>(k: K, v: LabelFields[K]) =>
    setFields((f) => ({ ...f, [k]: v }));

  const setNutrition = (k: keyof NutritionTable, v: string) =>
    setFields((f) => ({ ...f, nutrition: { ...f.nutrition, [k]: v } }));

  const pack = useMemo(() => getPack(fields.category), [fields.category]);
  const { score, rules } = useMemo(() => evaluateLabel(fields), [fields]);
  const derivedWarnings = useMemo(() => deriveWarnings(fields), [fields]);
  const detectedAllergens = useMemo(
    () => findAllergensInText(fields.ingredients),
    [fields.ingredients]
  );
  const ingredientSegments = useMemo(
    () => splitAllergenHighlights(fields.ingredients),
    [fields.ingredients]
  );

  const hasAnyData = useMemo(
    () =>
      fields.productName.trim().length > 0 ||
      fields.brandName.trim().length > 0 ||
      fields.ingredients.trim().length > 0,
    [fields.productName, fields.brandName, fields.ingredients]
  );

  const AI_FIELDS: (keyof LabelFields)[] = useMemo(() => {
    // AI only suggests wording. Product facts (ingredients, quantities,
    // dates, codes, addresses, nutrition, certifications) must come from
    // the brand: an invented value on a printed label is a liability.
    const base: (keyof LabelFields)[] = ["brandName", "productName", "storageInstructions"];
    if (pack === "cosmetic") base.push("instructionsForUse");
    return base;
  }, [pack]);

  // Debounced preview generation — skips while a Suggest is in flight to avoid rate limits
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPreviewAt = useRef(0);
  useEffect(() => {
    if (!hasAnyData || busyField) {
      if (!hasAnyData) setPreview("");
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const now = Date.now();
      if (now - lastPreviewAt.current < 2500) return; // hard throttle
      lastPreviewAt.current = now;
      setPreviewLoading(true);
      try {
        const p = await generatePreview(fields, pack);
        setPreview(p);
      } catch (e) {
        const status = (e as { status?: number })?.status;
        if (status === 429) {
          toast.error("Preview paused — AI rate limit. Retrying shortly.");
        }
      } finally {
        setPreviewLoading(false);
      }
    }, 2000);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(fields), pack, hasAnyData, busyField]);

  const handleSuggest = useCallback(
    async (field: keyof LabelFields) => {
      setBusyField(field);
      try {
        const value = await suggestField(field, fields, pack);
        set(field, value);
      } catch (e) {
        const status = (e as { status?: number })?.status;
        const message = e instanceof Error ? e.message : "";
        if (status === 429) toast.error(message || "Rate limit — try again in a moment.");
        else if (status === 402) toast.error("AI credits exhausted.");
        else toast.error(message || "Couldn't generate suggestion");
      } finally {
        setBusyField(null);
      }
    },
    [fields, pack]
  );


  const scoreColor =
    score >= 80
      ? "text-[hsl(var(--risk-low))]"
      : score >= 50
      ? "text-[hsl(var(--risk-medium))]"
      : "text-[hsl(var(--risk-high))]";

  const saveLabel = async (): Promise<string> => {
    setSaving(true);
    try {
      const allergensToSave =
        pack === "food"
          ? formatAllergenList(detectedAllergens) || null
          : pack === "cosmetic"
          ? fields.fragranceAllergens.join(", ") || null
          : fields.allergens || null;

      const { data, error } = await supabase
        .from("generated_labels")
        .insert({
          brand_name: fields.brandName || null,
          product_name: fields.productName || null,
          category: fields.category || null,
          ingredients: fields.ingredients || null,
          allergens: allergensToSave,
          country_of_origin: fields.countryOfOrigin || null,
          net_quantity: fields.netQuantity || null,
          batch_number: fields.batchNumber || null,
          best_before: fields.bestBefore || null,
          responsible_person: fields.responsiblePerson || null,
          certifications: fields.certifications || null,
          preview_text: preview || null,
          compliance_score: score,
          lead_id: getLeadId(),
          pack,
          date_type: fields.dateType || null,
          storage_instructions: fields.storageInstructions || null,
          quid_percent: fields.quidPercent || null,
          nutrition_json: (Object.keys(fields.nutrition).length ? fields.nutrition : null) as never,
          alcohol_abv: fields.alcoholAbv ? parseFloat(fields.alcoholAbv) : null,
          warnings_json: (derivedWarnings.length ? derivedWarnings : null) as never,
          packaged_protective_atmosphere: fields.packagedProtectiveAtmosphere,
          nano: fields.nano,
          irradiated: fields.irradiated,
          pao_months: fields.paoMonths || null,
          cosmetic_product_type: fields.cosmeticProductType || null,
          fragrance_allergens_json: (fields.fragranceAllergens.length
            ? fields.fragranceAllergens
            : null) as never,
          instructions_for_use: fields.instructionsForUse || null,
          signup_id: getSignupId(),
        })
        .select("id")
        .single();
      if (error) throw error;
      return `${window.location.origin}/label/${data.id}`;
    } finally {
      setSaving(false);
    }
  };

  const handleCopyQr = async () => {
    try {
      const url = await saveLabel();
      const dataUrl = await QRCode.toDataURL(url, { width: 240, margin: 1 });
      setShareUrl(url);
      setQrDataUrl(dataUrl);
      setQrOpen(true);
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Failed to generate QR link");
    }
  };

  const handleShare = async () => {
    try {
      const url = await saveLabel();
      if (navigator.share) {
        await navigator.share({
          title: fields.productName || "Product label",
          text: `Digital label for ${fields.productName || "product"}`,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard");
      }
    } catch {
      /* user cancelled */
    }
  };

  const handleExport = () => {
    // Persist in the background, same as Copy QR / Share — unlike those,
    // export doesn't need the saved row's id, so it shouldn't block the
    // download waiting on it.
    saveLabel().catch((e) => console.warn("label persist failed", e));

    const doc = new jsPDF();
    const w = doc.internal.pageSize.getWidth();
    doc.setFillColor(30, 64, 120);
    doc.rect(0, 0, w, 32, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Digital Product Label", 14, 14);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(
      `${pack.toUpperCase()} pack · Score ${score}% · ${new Date().toLocaleDateString("en-GB")}`,
      14,
      24
    );

    doc.setTextColor(40, 40, 40);
    doc.setFontSize(11);
    const body = preview || "(no preview yet)";
    const lines = doc.splitTextToSize(body, w - 28);
    doc.text(lines, 14, 44);

    let y = 44 + lines.length * 5 + 10;
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 64, 120);
    doc.text("AI Confidence", 14, y);
    y += 6;
    doc.setDrawColor(30, 64, 120);
    doc.line(14, y, w - 14, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    rules.forEach((r) => {
      const mark =
        r.status === "ok"
          ? "VERIFIED"
          : r.status === "review"
          ? "NEEDS REVIEW"
          : "NOT PROVIDED";
      doc.text(`• ${r.label} — ${mark}`, 16, y);
      y += 6;
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
    });

    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(doc.splitTextToSize(DRAFT_LABEL_DISCLAIMER, 182), 14, 284);

    const filename =
      (fields.productName || "label").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    doc.save(`${filename}-label.pdf`);
  };

  // Field row with optional AI suggest button
  const withSuggest = (field: keyof LabelFields, node: React.ReactNode) => (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={field} className="text-xs font-medium truncate min-w-0">
          {FIELD_LABELS[field]}
        </Label>
        {AI_FIELDS.includes(field) && (
          <button
            type="button"
            onClick={() => handleSuggest(field)}
            disabled={busyField === field}
            className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            {busyField === field ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            Suggest
          </button>
        )}
      </div>
      {node}
    </div>
  );

  const showFood = pack === "food";
  const showBeverage = fields.category.toLowerCase() === "beverage";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Label Generator</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {pack === "food"
              ? "UK FIC pre-packed food label — retail ready draft."
              : pack === "cosmetic"
              ? "UK/EU cosmetic label with INCI ingredients."
              : "Choose a category to unlock the correct rule pack."}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Compliance score</span>
          <span className={`text-2xl font-bold ${scoreColor}`}>{score}%</span>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr,400px]">
        {/* LEFT: form */}
        <div className="space-y-6">
          {/* Product identity */}
          <section className="rounded-lg border bg-card p-5">
            <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Product identity
            </h2>
            <div className="space-y-4">
              <div className="space-y-1.5 min-w-0">
                <Label htmlFor="category" className="text-xs font-medium">
                  Category (drives rule pack)
                </Label>
                <Select value={fields.category} onValueChange={(v) => set("category", v)}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {withSuggest(
                "brandName",
                <Input
                  id="brandName"
                  placeholder="e.g. Pura Naturals"
                  value={fields.brandName}
                  onChange={(e) => set("brandName", e.target.value)}
                />
              )}
              {withSuggest(
                "productName",
                <Input
                  id="productName"
                  placeholder={showFood ? "e.g. Steak & Ale Pie" : "e.g. Aloe Gel"}
                  value={fields.productName}
                  onChange={(e) => set("productName", e.target.value)}
                />
              )}
            </div>
          </section>

          {/* Ingredients */}
          <section className="rounded-lg border bg-card p-5">
            <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Ingredients &amp; allergens
            </h2>
            <div className="space-y-4">
              {withSuggest(
                "ingredients",
                <Textarea
                  id="ingredients"
                  rows={4}
                  placeholder={
                    showFood
                      ? "e.g. Beef (62%), Water, WHEAT flour, Onions, Ale (contains BARLEY)…"
                      : "e.g. Aqua, Aloe Barbadensis Leaf Juice, Glycerin…"
                  }
                  value={fields.ingredients}
                  onChange={(e) => set("ingredients", e.target.value)}
                />
              )}
              {showFood && (
                <div className="space-y-2">
                  <p className="rounded-md bg-muted/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                    The 14 UK allergens are detected automatically and emphasised in the
                    printed ingredients list below — no need to declare them separately.
                    List ingredients in descending order of weight.
                  </p>
                  <div className="rounded-md border bg-muted/20 px-3 py-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Ingredients as printed
                    </p>
                    {fields.ingredients.trim() ? (
                      <p className="text-[13px] leading-relaxed">
                        {ingredientSegments.map((seg, i) =>
                          seg.isAllergen ? (
                            <strong key={i} className="font-bold underline">
                              {seg.text}
                            </strong>
                          ) : (
                            <span key={i}>{seg.text}</span>
                          )
                        )}
                      </p>
                    ) : (
                      <p className="text-[13px] text-muted-foreground">
                        Add ingredients above to preview allergen emphasis.
                      </p>
                    )}
                    {detectedAllergens.length > 0 && (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Detected allergens: {formatAllergenList(detectedAllergens)}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {pack === "cosmetic" && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">
                      Product type (sets fragrance allergen threshold)
                    </Label>
                    <RadioGroup
                      value={fields.cosmeticProductType}
                      onValueChange={(v) =>
                        set("cosmeticProductType", v as LabelFields["cosmeticProductType"])
                      }
                      className="flex gap-4"
                    >
                      <label className="flex items-center gap-2 text-sm">
                        <RadioGroupItem value="leave_on" id="cpt-leave" />
                        <span>
                          Leave-on ({FRAGRANCE_ALLERGEN_THRESHOLD.leave_on})
                        </span>
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <RadioGroupItem value="rinse_off" id="cpt-rinse" />
                        <span>
                          Rinse-off ({FRAGRANCE_ALLERGEN_THRESHOLD.rinse_off})
                        </span>
                      </label>
                    </RadioGroup>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">
                      Fragrance allergens present above threshold
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {EU_FRAGRANCE_ALLERGENS.map((a) => {
                        const checked = fields.fragranceAllergens.includes(a);
                        return (
                          <button
                            key={a}
                            type="button"
                            onClick={() =>
                              set(
                                "fragranceAllergens",
                                checked
                                  ? fields.fragranceAllergens.filter((x) => x !== a)
                                  : [...fields.fragranceAllergens, a]
                              )
                            }
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                              checked
                                ? "border-primary bg-primary/10 font-medium text-primary"
                                : "border-border text-muted-foreground hover:border-foreground/30"
                            )}
                          >
                            {a}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
              {pack === "generic" &&
                withSuggest(
                  "allergens",
                  <Input
                    id="allergens"
                    placeholder="e.g. Contains latex"
                    value={fields.allergens}
                    onChange={(e) => set("allergens", e.target.value)}
                  />
                )}
              {showFood &&
                withSuggest(
                  "quidPercent",
                  <Input
                    id="quidPercent"
                    placeholder="e.g. Beef 62%"
                    value={fields.quidPercent}
                    onChange={(e) => set("quidPercent", e.target.value)}
                  />
                )}
            </div>
          </section>

          {/* Origin / quantity / dates */}
          <section className="rounded-lg border bg-card p-5">
            <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Origin, quantity &amp; dates
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {withSuggest(
                  "countryOfOrigin",
                  <Input
                    id="countryOfOrigin"
                    placeholder="e.g. United Kingdom"
                    value={fields.countryOfOrigin}
                    onChange={(e) => set("countryOfOrigin", e.target.value)}
                  />
                )}
                {withSuggest(
                  "netQuantity",
                  <Input
                    id="netQuantity"
                    placeholder={showFood ? "e.g. 400g" : "e.g. 200ml"}
                    value={fields.netQuantity}
                    onChange={(e) => set("netQuantity", e.target.value)}
                  />
                )}
              </div>
              {showFood && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Date mark type</Label>
                  <RadioGroup
                    value={fields.dateType || ""}
                    onValueChange={(v) => set("dateType", v as LabelFields["dateType"])}
                    className="flex gap-4"
                  >
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="use_by" id="dt-use" />
                      <span>Use by (safety)</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="best_before" id="dt-bb" />
                      <span>Best before (quality)</span>
                    </label>
                  </RadioGroup>
                </div>
              )}
              {pack === "cosmetic" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Shelf-life declaration</Label>
                  <RadioGroup
                    value={fields.dateType || ""}
                    onValueChange={(v) => set("dateType", v as LabelFields["dateType"])}
                    className="flex gap-4"
                  >
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="pao" id="dt-pao" />
                      <span>PAO symbol (≥30 months)</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="durability" id="dt-dur" />
                      <span>Minimum durability date (&lt;30 months)</span>
                    </label>
                  </RadioGroup>
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {withSuggest(
                  "batchNumber",
                  <Input
                    id="batchNumber"
                    placeholder="e.g. L2026-118A"
                    value={fields.batchNumber}
                    onChange={(e) => set("batchNumber", e.target.value)}
                  />
                )}
                {pack === "cosmetic" && fields.dateType === "pao"
                  ? withSuggest(
                      "paoMonths",
                      <Input
                        id="paoMonths"
                        placeholder="e.g. 12 (months after opening)"
                        value={fields.paoMonths}
                        onChange={(e) => set("paoMonths", e.target.value)}
                      />
                    )
                  : withSuggest(
                      "bestBefore",
                      <Input
                        id="bestBefore"
                        placeholder={showFood ? "DD/MM/YYYY" : "MM/YYYY"}
                        value={fields.bestBefore}
                        onChange={(e) => set("bestBefore", e.target.value)}
                      />
                    )}
              </div>
              {withSuggest(
                "storageInstructions",
                <Textarea
                  id="storageInstructions"
                  rows={2}
                  placeholder="e.g. Keep refrigerated below 5°C. Once opened, consume within 3 days."
                  value={fields.storageInstructions}
                  onChange={(e) => set("storageInstructions", e.target.value)}
                />
              )}
              {pack === "cosmetic" &&
                withSuggest(
                  "instructionsForUse",
                  <Textarea
                    id="instructionsForUse"
                    rows={2}
                    placeholder="e.g. For external use only. Avoid contact with eyes. Discontinue use if irritation occurs."
                    value={fields.instructionsForUse}
                    onChange={(e) => set("instructionsForUse", e.target.value)}
                  />
                )}
              {showBeverage &&
                withSuggest(
                  "alcoholAbv",
                  <Input
                    id="alcoholAbv"
                    placeholder="e.g. 4.5% vol"
                    value={fields.alcoholAbv}
                    onChange={(e) => set("alcoholAbv", e.target.value)}
                  />
                )}
            </div>
          </section>

          {/* Nutrition (food only) */}
          {showFood && (
            <section className="rounded-lg border bg-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Nutrition (per 100g)
                </h2>
                <span className="text-[11px] text-muted-foreground">From your lab analysis or recipe calculation</span>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {NUTRITION_ROWS.map((row) => (
                  <div key={row.key} className="space-y-1">
                    <Label className="text-[11px] font-medium text-muted-foreground">
                      {row.label}
                    </Label>
                    <Input
                      value={fields.nutrition[row.key] ?? ""}
                      onChange={(e) => setNutrition(row.key, e.target.value)}
                      placeholder={row.placeholder}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Warnings & handling */}
          {showFood && (
            <section className="rounded-lg border bg-card p-5">
              <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Warnings &amp; handling
              </h2>
              <div className="space-y-3 text-sm">
                <label className="flex items-start gap-2">
                  <Checkbox
                    checked={fields.packagedProtectiveAtmosphere}
                    onCheckedChange={(v) =>
                      set("packagedProtectiveAtmosphere", Boolean(v))
                    }
                  />
                  <span>Packaged in a protective atmosphere</span>
                </label>
                <label className="flex items-start gap-2">
                  <Checkbox
                    checked={fields.nano}
                    onCheckedChange={(v) => set("nano", Boolean(v))}
                  />
                  <span>Contains engineered nanomaterials (adds "(nano)")</span>
                </label>
                <label className="flex items-start gap-2">
                  <Checkbox
                    checked={fields.irradiated}
                    onCheckedChange={(v) => set("irradiated", Boolean(v))}
                  />
                  <span>Treated with ionising radiation</span>
                </label>
                {derivedWarnings.length > 0 && (
                  <div className="rounded-md border border-[hsl(var(--risk-medium))] bg-[hsl(var(--risk-medium-bg))] p-3 text-xs">
                    <div className="mb-1 font-semibold uppercase tracking-wider text-[hsl(var(--risk-medium))]">
                      Regulatory warnings auto-detected
                    </div>
                    <ul className="list-disc space-y-1 pl-4 text-[hsl(var(--risk-medium))]">
                      {derivedWarnings.map((w) => (
                        <li key={w.key}>{w.phrase}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Business & certifications */}
          <section className="rounded-lg border bg-card p-5">
            <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Business &amp; certifications
            </h2>
            <div className="space-y-4">
              {withSuggest(
                "responsiblePerson",
                <Input
                  id="responsiblePerson"
                  placeholder="e.g. Pura Ltd, London EC1A 1BB"
                  value={fields.responsiblePerson}
                  onChange={(e) => set("responsiblePerson", e.target.value)}
                />
              )}
              {withSuggest(
                "certifications",
                <Input
                  id="certifications"
                  placeholder={
                    showFood
                      ? "e.g. Red Tractor, Organic, RSPCA Assured"
                      : "e.g. Cruelty Free, Vegan, COSMOS Organic"
                  }
                  value={fields.certifications}
                  onChange={(e) => set("certifications", e.target.value)}
                />
              )}
            </div>
          </section>
        </div>

        {/* RIGHT: preview + compliance + actions */}
        <div className="space-y-6 xl:sticky xl:top-4 xl:self-start">
          <section>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Live digital label
            </h2>
            <LivePreview preview={preview} loading={previewLoading} hasData={hasAnyData} pack={pack} />
          </section>

          <section>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              AI Confidence · {pack.toUpperCase()}
            </h2>
            <ComplianceCheck rules={rules} />
          </section>

          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              onClick={() => requireLead(handleCopyQr)}
              disabled={saving || !hasAnyData}
              className="h-auto flex-col gap-1 py-3"
            >
              <QrCode className="h-4 w-4" />
              <span className="text-[11px] leading-tight">Copy QR link</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => requireLead(handleExport)}
              disabled={!hasAnyData}
              className="h-auto flex-col gap-1 py-3"
            >
              <Download className="h-4 w-4" />
              <span className="text-[11px] leading-tight">Export label</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => requireLead(handleShare)}
              disabled={saving || !hasAnyData}
              className="h-auto flex-col gap-1 py-3"
            >
              <Share2 className="h-4 w-4" />
              <span className="text-[11px] leading-tight">Share</span>
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            {DRAFT_LABEL_DISCLAIMER}
          </p>
        </div>
      </div>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Share this label</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            {qrDataUrl && (
              <img src={qrDataUrl} alt="QR code" className="rounded-md border" />
            )}
            <div className="flex w-full items-center gap-2">
              <Input readOnly value={shareUrl} className="text-xs" />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  toast.success("Copied");
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <LeadCaptureDialog
        open={leadOpen}
        onOpenChange={(o) => {
          setLeadOpen(o);
          if (!o) pendingActionRef.current = null;
        }}
        onSuccess={() => {
          const action = pendingActionRef.current;
          pendingActionRef.current = null;
          action?.();
        }}
        defaultCategory={fields.category || undefined}
        source="generate"
        title="Unlock your label"
        description="Tell us who you are and we'll generate and save your label."
      />
    </div>
  );
};

const FIELD_LABELS: Record<string, string> = {
  brandName: "Brand name",
  productName: "Product name",
  category: "Category",
  ingredients: "Ingredients",
  allergens: "Allergens (comma separated)",
  countryOfOrigin: "Country of origin",
  netQuantity: "Net quantity",
  batchNumber: "Batch / lot code",
  bestBefore: "Date mark",
  responsiblePerson: "Responsible person / FBO (UK)",
  certifications: "Certifications",
  storageInstructions: "Storage instructions",
  quidPercent: "QUID declaration",
  alcoholAbv: "Alcohol strength (% vol)",
  paoMonths: "Period-After-Opening (months)",
  instructionsForUse: "Instructions for use / precautions",
};

export default GenerateLabelPage;
