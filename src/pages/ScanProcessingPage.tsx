import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ScanLine } from "lucide-react";
import { useScan, buildScanResult, generateMockResult } from "@/lib/scan-context";
import { computeScanDiff, extractProductName, normalizeProductKey } from "@/lib/scan-diff";
import { getCurrentLockedVersion, createChangeRequest } from "@/lib/version-lock";
import { supabase } from "@/integrations/supabase/client";
import { getSignupId } from "@/components/LeadCaptureDialog";
import { toast } from "sonner";
import { useSeo } from "@/hooks/use-seo";

const steps = [
  "Reading label image…",
  "Uploading to analysis engine…",
  "Extracting text (OCR)…",
  "Mapping fields…",
  "Detecting category…",
  "Checking against previous scans…",
  "Preparing review…",
];

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const displayFileName = (files: File[]): string =>
  files.length > 1 ? `${files[0].name} +${files.length - 1} more` : files[0].name;

const ScanProcessingPage = () => {
  // Transient step in the scan flow, not stable content — nothing here
  // for a cold crawl to index.
  useSeo({ title: "Analysing your label… | Labelring", description: "Labelring scan in progress.", noindex: true });

  const { files, options, setResult } = useScan();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const calledRef = useRef(false);

  useEffect(() => {
    if (files.length === 0) {
      navigate("/scan", { replace: true });
      return;
    }

    if (calledRef.current) return;
    calledRef.current = true;

    const stepTimer = setInterval(() => {
      setStepIndex((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
    }, 2500);

    const progressTimer = setInterval(() => {
      setProgress((prev) => (prev >= 95 ? 95 : prev + 1));
    }, 200);

    const analyzeLabel = async () => {
      try {
        const images = await Promise.all(
          files.map(async (f) => ({ base64: await fileToBase64(f), fileName: f.name }))
        );

        // The AI call has no server-side response guarantee we can see from
        // here — a stalled connection or a wedged upstream provider leaves
        // this awaiting forever with nothing to catch, silently defeating
        // the fallback-to-mock-result path below (its whole job is to keep
        // the flow moving when the AI call fails). An explicit timeout
        // turns "hangs forever" into a real, catchable error.
        const abort = new AbortController();
        const timeout = setTimeout(() => abort.abort(), 45_000);
        const { data, error } = await supabase.functions
          .invoke("analyze-label", {
            body: {
              images,
              isSeasonal: options.isSeasonal,
              seasonTag: options.seasonTag,
            },
            signal: abort.signal,
          })
          .finally(() => clearTimeout(timeout));

        if (error) {
          // supabase-js only gives a generic message on error.message -- the
          // real error text lives on error.context (the underlying Response).
          const ctx = (error as { context?: Response }).context;
          if (ctx && typeof ctx.json === "function") {
            try {
              const body = await ctx.clone().json();
              throw new Error(typeof body?.error === "string" ? body.error : error.message);
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message !== error.message) throw parseErr;
            }
          }
          throw error;
        }
        if (data?.error) throw new Error(data.error);

        const result = buildScanResult(displayFileName(files), data);
        result.isSeasonal = options.isSeasonal;
        result.seasonTag = options.seasonTag;

        // --- Supplier change detection: find latest prior scan with matching product key ---
        const productName = extractProductName(result.fields);
        const productKey = normalizeProductKey(productName);

        if (productKey) {
          try {
            const { data: priorScans } = await supabase
              .from("scans" as any)
              .select("id, created_at, fields")
              .eq("product_key", productKey)
              .order("created_at", { ascending: false })
              .limit(1);

            if (priorScans && priorScans.length > 0) {
              const prior = priorScans[0] as any;
              result.changes = computeScanDiff(
                { id: prior.id, created_at: prior.created_at, fields: prior.fields ?? [] },
                result.fields
              );
            } else {
              result.changes = null;
            }
          } catch (e) {
            console.warn("prior scan lookup failed", e);
          }
        }

        setProgress(100);
        setStepIndex(steps.length - 1);

        result.productKey = productKey;
        result.productName = productName;

        // Persist scan + all images, then check locked version & create change request
        try {
          const datePrefix = new Date().toISOString().slice(0, 10);
          const uploaded = await Promise.all(
            files.map(async (f) => {
              const ext = f.name.split(".").pop() ?? "bin";
              const path = `${datePrefix}/${crypto.randomUUID()}.${ext}`;
              const { error: upErr } = await supabase.storage
                .from("scans")
                .upload(path, f, { contentType: f.type, upsert: false });
              if (upErr) console.warn("scan upload failed", upErr);
              return { path: upErr ? null : path, file_name: f.name, mime_type: f.type };
            })
          );

          const primary = uploaded[0];
          const images = uploaded.some((u) => u.path) ? uploaded : null;

          const params = new URLSearchParams(window.location.search);
          const scanRow = {
            file_name: primary.file_name,
            file_path: primary.path,
            mime_type: primary.mime_type,
            images: images as any,
            category: result.category,
            found_count: result.foundCount,
            total_count: result.totalCount,
            needs_attention_count: result.needsAttentionCount,
            fields: result.fields as any,
            lead_id: params.get("lead"),
            signup_id: getSignupId(),
            user_agent: navigator.userAgent,
            referrer: document.referrer || null,
            is_seasonal: options.isSeasonal,
            season_tag: options.seasonTag,
            product_name: productName,
            product_key: productKey,
            compared_to_scan_id: result.changes?.comparedToScanId ?? null,
            changes_detected: result.changes ?? null,
            coverage_assessment: result.coverage as any,
          };
          const rulebookColumns = {
            rulebook_version: result.rulebook ? `${result.rulebook.scope} ${result.rulebook.version}` : null,
            rule_findings: result.findings.length ? (result.findings as any) : null,
          };
          let { data: inserted, error: insertErr } = await supabase
            .from("scans" as any)
            .insert({ ...scanRow, ...rulebookColumns })
            .select("id")
            .single();
          // The frontend and the database migration deploy separately; if
          // the rulebook columns don't exist yet, still save the scan.
          if (insertErr && /rulebook_version|rule_findings/.test(insertErr.message)) {
            ({ data: inserted } = await supabase.from("scans" as any).insert(scanRow).select("id").single());
          }

          const newScanId = (inserted as any)?.id ?? null;
          result.scanId = newScanId;

          // Check locked master version
          if (productKey && newScanId) {
            const locked = await getCurrentLockedVersion(productKey);
            if (locked) {
              result.lockedVersion = {
                id: locked.id,
                versionNumber: locked.version_number,
                approvedAt: locked.approved_at,
                approvedBy: locked.approved_by_name,
              };
              // diff vs locked version's scan
              const { data: lockedScan } = await supabase
                .from("scans" as any)
                .select("id, created_at, fields")
                .eq("id", locked.scan_id)
                .maybeSingle();
              if (lockedScan) {
                const diff = computeScanDiff(
                  { id: (lockedScan as any).id, created_at: (lockedScan as any).created_at, fields: (lockedScan as any).fields ?? [] },
                  result.fields
                );
                if (diff.hasAnyChange) {
                  const cr = await createChangeRequest({
                    productKey,
                    productName,
                    newScanId,
                    lockedVersionId: locked.id,
                    changes: diff,
                  });
                  result.pendingChangeRequestId = cr?.id ?? null;
                  // Surface locked-vs-new diff in results
                  result.changes = diff;
                }
              }
            }
          }
        } catch (e) {
          console.warn("scan persist failed", e);
        }

        setTimeout(() => {
          setResult(result);
          navigate("/scan/results", { replace: true });
        }, 500);
      } catch (err) {
        console.error("Analysis failed, using fallback:", err);
        toast.error("AI analysis failed — showing demo results instead");

        const fallback = generateMockResult(displayFileName(files));
        fallback.isSeasonal = options.isSeasonal;
        fallback.seasonTag = options.seasonTag;
        setProgress(100);
        setTimeout(() => {
          setResult(fallback);
          navigate("/scan/results", { replace: true });
        }, 500);
      }
    };

    analyzeLabel();

    return () => {
      clearInterval(stepTimer);
      clearInterval(progressTimer);
    };
  }, [files, options, navigate, setResult]);

  return (
    <div className="max-w-md mx-auto flex flex-col items-center justify-center min-h-[60vh] space-y-8">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
      >
        <ScanLine className="h-16 w-16 text-primary" />
      </motion.div>

      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">Analysing your label…</h2>
        <motion.p
          key={stepIndex}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm text-muted-foreground"
        >
          {steps[stepIndex]}
        </motion.p>
        {options.isSeasonal && (
          <p className="text-xs text-[hsl(var(--risk-medium))] font-medium">
            Seasonal risk mode active{options.seasonTag ? ` · ${options.seasonTag}` : ""}
          </p>
        )}
      </div>

      <div className="w-full max-w-xs">
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
          <motion.div
            className="h-full bg-primary rounded-full"
            style={{ width: `${progress}%` }}
            transition={{ ease: "linear" }}
          />
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">{Math.min(progress, 100)}%</p>
      </div>

      {files.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {files.length > 1 ? `${files.length} images: ` : "File: "}
          {files.map((f) => f.name).join(", ")}
        </p>
      )}
    </div>
  );
};

export default ScanProcessingPage;
