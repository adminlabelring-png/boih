import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, AlertTriangle, HelpCircle, XCircle, ChevronDown, ImagePlus, Download, Calendar, ScanLine, RotateCcw, Sparkles, GitCompare, Plus, Minus, Building2, Globe, Lock, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScan, DetectedField, getOverallAssessment, getAssessmentSummary } from "@/lib/scan-context";
import { generateComplianceReport } from "@/lib/generate-report";
import RuleFindings from "@/components/RuleFindings";
import { CHECK_DISCLAIMER } from "@/lib/disclaimer";
import { cn } from "@/lib/utils";
import { useSeo } from "@/hooks/use-seo";

const statusIcon = (status: DetectedField["status"]) => {
  switch (status) {
    case "verified": return <CheckCircle className="h-4 w-4 text-[hsl(var(--risk-low))]" />;
    case "low_confidence": return <AlertTriangle className="h-4 w-4 text-[hsl(var(--risk-medium))]" />;
    case "not_verified": return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
    case "missing": return <XCircle className="h-4 w-4 text-[hsl(var(--risk-high))]" />;
  }
};

const statusLabel = (status: DetectedField["status"]) => {
  switch (status) {
    case "verified": return "Verified";
    case "low_confidence": return "Low Confidence";
    case "not_verified": return "Not Verified";
    case "missing": return "Missing";
  }
};

const statusBadgeClass = (status: DetectedField["status"]) => {
  switch (status) {
    case "verified": return "compliance-badge-high";
    case "low_confidence": return "compliance-badge-medium";
    case "not_verified": return "bg-muted text-muted-foreground";
    case "missing": return "compliance-badge-low";
  }
};

const ScanResultsPage = () => {
  // Session-specific scan output, not stable content — nothing here for
  // a cold crawl to index.
  useSeo({ title: "Your scan results | Labelring", description: "Labelring scan results.", noindex: true });

  const { result, reset } = useScan();
  const navigate = useNavigate();
  const [category, setCategory] = useState(result?.category ?? "Cosmetic");
  const [showCategorySelect, setShowCategorySelect] = useState(false);

  if (!result) {
    navigate("/scan", { replace: true });
    return null;
  }

  const verifiedFields = result.fields.filter(f => f.status === "verified");
  const issueFields = result.fields.filter(f => f.status !== "verified");
  const assessment = getOverallAssessment(result);
  const summaryText = getAssessmentSummary(result);

  const handleNewScan = () => {
    reset();
    navigate("/scan");
  };

  const categories = ["Cosmetic", "Food", "Beverage", "Supplement", "Household", "Other"];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-semibold tracking-tight">Label Review</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Results for: {result.fileName}
        </p>
      </motion.div>

      {/* Report Summary */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.02 }}
        className="rounded-lg border bg-card p-4"
      >
        <h2 className="text-sm font-semibold">Assessment Summary</h2>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{summaryText}</p>
      </motion.div>

      {/* Image Coverage Assessment */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.03 }}
        className={cn(
          "rounded-lg border p-4 flex gap-3",
          result.coverage.isComplete
            ? "bg-card"
            : "border-[hsl(var(--risk-medium)/0.4)] bg-[hsl(var(--risk-medium-bg))]"
        )}
      >
        <ImagePlus
          className={cn(
            "h-5 w-5 shrink-0 mt-0.5",
            result.coverage.isComplete ? "text-muted-foreground" : "text-[hsl(var(--risk-medium))]"
          )}
        />
        <div className="flex-1">
          <p className="text-sm font-semibold">Image Assessment</p>
          <p className="text-sm text-muted-foreground mt-1">{result.coverage.note}</p>
          {result.coverage.missingAreas.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              Not visible: {result.coverage.missingAreas.join(", ")}. Because of this, some required
              information could not be verified.
            </p>
          )}
        </div>
      </motion.div>

      {/* Version lock / approval banner */}
      {result.pendingChangeRequestId && result.lockedVersion && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border-2 border-[hsl(var(--risk-medium)/0.5)] bg-[hsl(var(--risk-medium-bg))] p-4 flex gap-3">
          <ShieldAlert className="h-5 w-5 text-[hsl(var(--risk-medium))] shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-[hsl(var(--risk-medium))]">
              Pending approval — differs from locked v{result.lockedVersion.versionNumber}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              This scan does not match the approved master artwork. A change request has been opened. An admin must approve or reject it in the Approvals dashboard before this version can be used in production.
            </p>
          </div>
        </motion.div>
      )}

      {result.lockedVersion && !result.pendingChangeRequestId && result.productKey && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border-2 border-[hsl(var(--risk-low)/0.4)] bg-[hsl(var(--risk-low-bg))] p-4 flex gap-3">
          <ShieldCheck className="h-5 w-5 text-[hsl(var(--risk-low))] shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-[hsl(var(--risk-low))]">
              Matches approved master artwork (v{result.lockedVersion.versionNumber})
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              No differences detected against the locked version approved {new Date(result.lockedVersion.approvedAt).toLocaleDateString()}{result.lockedVersion.approvedBy ? ` by ${result.lockedVersion.approvedBy}` : ""}.
            </p>
          </div>
        </motion.div>
      )}

      {!result.lockedVersion && result.productKey && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border bg-card p-3 flex gap-3 items-start">
          <Lock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">No approved master yet.</strong> Lock this scan as the master in the admin dashboard to enable change tracking and approval workflow.
          </p>
        </motion.div>
      )}


      {result.isSeasonal && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border-2 border-[hsl(var(--risk-medium)/0.5)] bg-[hsl(var(--risk-medium-bg))] p-4 flex gap-3"
        >
          <Sparkles className="h-5 w-5 text-[hsl(var(--risk-medium))] shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-[hsl(var(--risk-medium))]">
              Seasonal Risk Mode applied{result.seasonTag ? ` · ${result.seasonTag}` : ""}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Stricter checks were applied for promo claims, batch/lot codes, date markings, allergen carry-over, and net-quantity changes — common failure points for limited-run SKUs.
            </p>
          </div>
        </motion.div>
      )}

      {/* Supplier & Spec Change Detection */}
      {result.changes && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 }}
          className={`rounded-lg border-2 p-4 space-y-3 ${
            result.changes.hasAnyChange
              ? "border-[hsl(var(--risk-high)/0.4)] bg-[hsl(var(--risk-high-bg))]"
              : "border-[hsl(var(--risk-low)/0.4)] bg-[hsl(var(--risk-low-bg))]"
          }`}
        >
          <div className="flex items-start gap-3">
            <GitCompare className={`h-5 w-5 shrink-0 mt-0.5 ${result.changes.hasAnyChange ? "text-[hsl(var(--risk-high))]" : "text-[hsl(var(--risk-low))]"}`} />
            <div className="flex-1">
              <p className="text-sm font-semibold">
                {result.changes.hasAnyChange ? "Supplier / spec changes detected" : "No changes vs previous scan"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Compared against scan from {new Date(result.changes.comparedToDate).toLocaleDateString()}
              </p>
            </div>
          </div>

          {result.changes.hasAnyChange && (
            <div className="space-y-2 pl-8">
              {result.changes.ingredientsAdded.length > 0 && (
                <div className="text-xs">
                  <span className="inline-flex items-center gap-1 font-medium text-[hsl(var(--risk-high))]">
                    <Plus className="h-3 w-3" /> Ingredients added:
                  </span>{" "}
                  <span className="text-muted-foreground">{result.changes.ingredientsAdded.join(", ")}</span>
                </div>
              )}
              {result.changes.ingredientsRemoved.length > 0 && (
                <div className="text-xs">
                  <span className="inline-flex items-center gap-1 font-medium text-[hsl(var(--risk-medium))]">
                    <Minus className="h-3 w-3" /> Ingredients removed:
                  </span>{" "}
                  <span className="text-muted-foreground">{result.changes.ingredientsRemoved.join(", ")}</span>
                </div>
              )}
              {(result.changes.allergensAdded.length > 0 || result.changes.allergensRemoved.length > 0) && (
                <div className="text-xs">
                  <span className="font-medium text-[hsl(var(--risk-high))]">⚠ Allergen change:</span>{" "}
                  {result.changes.allergensAdded.length > 0 && (
                    <span className="text-muted-foreground">added {result.changes.allergensAdded.join(", ")} </span>
                  )}
                  {result.changes.allergensRemoved.length > 0 && (
                    <span className="text-muted-foreground">removed {result.changes.allergensRemoved.join(", ")}</span>
                  )}
                </div>
              )}
              {result.changes.manufacturerChanged && (
                <div className="text-xs">
                  <span className="inline-flex items-center gap-1 font-medium text-[hsl(var(--risk-high))]">
                    <Building2 className="h-3 w-3" /> Manufacturer / RP changed:
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {result.changes.manufacturerChanged.from ?? "—"} → {result.changes.manufacturerChanged.to ?? "—"}
                  </span>
                </div>
              )}
              {result.changes.originChanged && (
                <div className="text-xs">
                  <span className="inline-flex items-center gap-1 font-medium text-[hsl(var(--risk-medium))]">
                    <Globe className="h-3 w-3" /> Country of origin changed:
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {result.changes.originChanged.from ?? "—"} → {result.changes.originChanged.to ?? "—"}
                  </span>
                </div>
              )}
              <p className="text-xs text-muted-foreground italic pt-1">
                Supplier or spec changes often don't make it onto the label — please verify before printing.
              </p>
            </div>
          )}
        </motion.div>
      )}

      {result.changes === null && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 }}
          className="rounded-lg border bg-card p-3 flex gap-3 items-start"
        >
          <GitCompare className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">Baseline saved.</strong> Future scans of this product will be automatically compared to detect supplier or ingredient changes.
          </p>
        </motion.div>
      )}

      {/* Category detection */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-lg border bg-card p-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ScanLine className="h-5 w-5 text-primary" />
            <span className="text-sm">
              We think this is: <strong>{category}</strong>
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCategorySelect(!showCategorySelect)}
            className="gap-1"
          >
            Change <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
        <AnimatePresence>
          {showCategorySelect && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => { setCategory(cat); setShowCategorySelect(false); }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      cat === category
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-accent"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Scoring banner — non-numeric headline while coverage is partial, so
          it structurally can't be misread as a pass/fail score. */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className={cn(
          "rounded-lg border-2 p-6 text-center",
          assessment.tone === "needs-images" && "border-[hsl(var(--risk-medium)/0.4)] bg-[hsl(var(--risk-medium-bg))]",
          assessment.tone === "good" && "border-[hsl(var(--risk-low)/0.4)] bg-[hsl(var(--risk-low-bg))]",
          assessment.tone === "attention" && "border-[hsl(var(--risk-high)/0.4)] bg-[hsl(var(--risk-high-bg))]"
        )}
      >
        <p
          className={cn(
            "text-2xl font-bold",
            assessment.tone === "needs-images" && "text-[hsl(var(--risk-medium))]",
            assessment.tone === "good" && "text-[hsl(var(--risk-low))]",
            assessment.tone === "attention" && "text-[hsl(var(--risk-high))]"
          )}
        >
          {assessment.banner}
        </p>
        <p className="text-sm text-muted-foreground mt-2">{assessment.detail}</p>
      </motion.div>

      {/* Deterministic checks against the versioned rulebook */}
      {result.rulebook && result.findings.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <RuleFindings findings={result.findings} rulebook={result.rulebook} />
        </motion.div>
      )}

      {/* Detected Information */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-lg border bg-card"
      >
        <div className="p-4 border-b">
          <h2 className="text-base font-semibold">Detected Information</h2>
        </div>
        <div className="divide-y">
          {verifiedFields.map((field) => (
            <div key={field.label} className="flex items-start gap-3 p-4">
              {statusIcon(field.status)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{field.label}</p>
                <p className="text-sm text-muted-foreground mt-0.5 break-words whitespace-pre-line">{field.value}</p>
              </div>
              <span className={`${statusBadgeClass(field.status)} rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0`}>
                {statusLabel(field.status)}
              </span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Needs Attention */}
      {issueFields.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-lg border border-[hsl(var(--risk-high)/0.3)] bg-card"
        >
          <div className="p-4 border-b">
            <h2 className="text-base font-semibold">Needs Attention</h2>
          </div>
          <div className="divide-y">
            {issueFields.map((field) => (
              <div key={field.label} className="flex items-start gap-3 p-4">
                {statusIcon(field.status)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{field.label}</p>
                  {field.value ? (
                    <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-line">{field.value}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-0.5 italic">
                      {field.status === "missing"
                        ? "Confirmed absent from this label."
                        : "Not visible in the submitted image."}
                    </p>
                  )}
                  {field.suggestedFix && (
                    <p className="text-xs text-primary mt-1.5">{field.suggestedFix}</p>
                  )}
                </div>
                <span className={`${statusBadgeClass(field.status)} rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0`}>
                  {statusLabel(field.status)}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="rounded-lg border bg-card p-4 space-y-3"
      >
        <h2 className="text-base font-semibold">Actions</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button variant="outline" className="flex-1 gap-2" onClick={() => generateComplianceReport(result)}>
              <Download className="h-4 w-4" /> Download report
          </Button>
          <Button variant="outline" className="gap-2">
            <Calendar className="h-4 w-4" /> Book a review call
          </Button>
        </div>
      </motion.div>

      {/* Scan again */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-center"
      >
        <Button variant="ghost" onClick={handleNewScan} className="gap-2">
          <RotateCcw className="h-4 w-4" /> Scan another label
        </Button>
      </motion.div>

      {/* Disclaimer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
        className="rounded-lg bg-muted p-4"
      >
        <p className="text-xs text-muted-foreground text-center">
          {result.coverage.isComplete
            ? CHECK_DISCLAIMER
            : `This assessment is based only on the visible areas of the submitted packaging. Information identified as "Not Verified" may exist elsewhere on the product and should not be interpreted as missing without additional images. ${CHECK_DISCLAIMER}`}
        </p>
      </motion.div>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="rounded-xl border-2 border-primary/20 bg-primary/5 p-8 text-center space-y-4"
      >
        <Calendar className="h-8 w-8 text-primary mx-auto" />
        <h2 className="text-xl font-bold">Want a free label review?</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Our experts will review your labels and help you get retail-ready — no obligation.
        </p>
        <Button size="lg" className="gap-2">
          <Calendar className="h-4 w-4" /> Book a Call
        </Button>
      </motion.div>
    </div>
  );
};

export default ScanResultsPage;
