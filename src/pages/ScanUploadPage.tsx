import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileImage, FileText, X, Camera, ImageIcon, Sparkles, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useScan } from "@/lib/scan-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSeo } from "@/hooks/use-seo";
import LeadCaptureDialog, { hasSubmittedLead } from "@/components/LeadCaptureDialog";
import ScanIntake from "@/components/ScanIntake";

const ACCEPTED = ".jpg,.jpeg,.png,.pdf";
const SEASON_TAGS = ["Christmas", "Diwali", "Easter", "Summer", "Promo Pack", "Limited Edition"];
const MAX_IMAGES = 6;

interface StagedFile {
  file: File;
  preview: string | null;
}

const ScanUploadPage = () => {
  useSeo({
    title: "Free AI Label Checker — Scan Your Product Label | Labelring",
    description:
      "Upload a photo of your product label and get an instant AI-powered compliance check against UK food and cosmetic labelling regulations.",
    path: "/scan",
  });

  const { setFiles: setContextFiles, options, setOptions } = useScan();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const [dragOver, setDragOver] = useState(false);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [leadOpen, setLeadOpen] = useState(false);

  useEffect(() => {
    return () => {
      staged.forEach((s) => s.preview && URL.revokeObjectURL(s.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback((newFiles: File[]) => {
    if (newFiles.length === 0) return;
    setStaged((prev) => {
      const room = MAX_IMAGES - prev.length;
      const toAdd = newFiles.slice(0, Math.max(room, 0));
      const additions: StagedFile[] = toAdd.map((file) => ({
        file,
        preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      }));
      return [...prev, ...additions];
    });
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  const onSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  }, [addFiles]);

  const proceedToScan = () => {
    if (staged.length === 0) return;
    setContextFiles(staged.map((s) => s.file));
    navigate("/scan/processing");
  };

  const startScan = () => {
    if (staged.length === 0) return;
    if (hasSubmittedLead()) {
      proceedToScan();
    } else {
      setLeadOpen(true);
    }
  };

  const removeAt = (index: number) => {
    setStaged((prev) => {
      const target = prev[index];
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const clear = () => {
    staged.forEach((s) => s.preview && URL.revokeObjectURL(s.preview));
    setStaged([]);
    if (inputRef.current) inputRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  };

  const seasonalPanel = (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 }}
      className={`rounded-xl border p-4 transition-colors ${
        options.isSeasonal
          ? "border-[hsl(var(--risk-medium)/0.5)] bg-[hsl(var(--risk-medium-bg))]"
          : "bg-card"
      }`}
    >
      <div className="flex items-start gap-3">
        <Sparkles className={`h-5 w-5 mt-0.5 shrink-0 ${options.isSeasonal ? "text-[hsl(var(--risk-medium))]" : "text-muted-foreground"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Seasonal / Promo SKU</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Apply stricter checks for limited editions, promo packs, and seasonal launches.
              </p>
            </div>
            <Switch
              checked={options.isSeasonal}
              onCheckedChange={(v) => setOptions({ ...options, isSeasonal: v, seasonTag: v ? options.seasonTag : null })}
            />
          </div>
          <AnimatePresence>
            {options.isSeasonal && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-[hsl(var(--risk-medium)/0.3)]">
                  {SEASON_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setOptions({ ...options, seasonTag: options.seasonTag === tag ? null : tag })}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                        options.seasonTag === tag
                          ? "bg-[hsl(var(--risk-medium))] text-white"
                          : "bg-background border hover:bg-accent"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );

  const leadDialog = (
    <LeadCaptureDialog
      open={leadOpen}
      onOpenChange={setLeadOpen}
      onSuccess={proceedToScan}
      source="scan"
      title="Unlock your scan"
      description="Tell us who you are and we'll analyse your label."
    />
  );

  // Mobile layout: big action buttons first, no scrolling needed
  if (isMobile) {
    return (
      <div className="flex flex-col min-h-[80vh] px-2">
        <input ref={inputRef} type="file" accept={ACCEPTED} multiple onChange={onSelect} className="hidden" />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onSelect} className="hidden" />

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center pt-4 pb-6">
          <h1 className="text-xl font-semibold tracking-tight">Scan your label</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {staged.length > 0
              ? "Add every side that has label text — front, ingredients panel, back"
              : "Take a photo or upload an image to get started"}
          </p>
        </motion.div>

        {staged.length > 0 ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex-1 flex flex-col gap-4 justify-center">
            <div className="grid grid-cols-3 gap-2">
              {staged.map((s, i) => (
                <div key={i} className="relative aspect-square rounded-lg border overflow-hidden bg-muted">
                  {s.preview ? (
                    <img src={s.preview} alt={`Label side ${i + 1}`} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <FileText className="h-8 w-8 text-primary" />
                    </div>
                  )}
                  <button
                    onClick={() => removeAt(i)}
                    className="absolute top-1 right-1 rounded-full bg-background/90 p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {staged.length < MAX_IMAGES && (
                <button
                  onClick={() => inputRef.current?.click()}
                  className="aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                >
                  <Plus className="h-5 w-5" />
                  <span className="text-[10px]">Add side</span>
                </button>
              )}
            </div>
            <div className="w-full max-w-xs mx-auto space-y-3">
              <ScanIntake options={options} setOptions={setOptions} />
              {seasonalPanel}
            </div>
            <Button onClick={startScan} size="lg" className="w-full max-w-xs mx-auto gap-2 h-14 text-base">
              <FileImage className="h-5 w-5" />
              Scan Label{staged.length > 1 ? ` (${staged.length} images)` : ""}
            </Button>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex-1 flex flex-col gap-4 justify-center">
            <Button
              onClick={() => cameraRef.current?.click()}
              size="lg"
              className="w-full gap-3 h-16 text-base rounded-xl"
            >
              <Camera className="h-6 w-6" />
              Take Photo
            </Button>
            <Button
              onClick={() => inputRef.current?.click()}
              variant="outline"
              size="lg"
              className="w-full gap-3 h-16 text-base rounded-xl"
            >
              <ImageIcon className="h-6 w-6" />
              Upload Image
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Supports JPG, PNG, PDF · has label on more than one side? You can add more photos next
            </p>
          </motion.div>
        )}
        {leadDialog}
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-semibold tracking-tight">Upload your label</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {staged.length > 0
            ? "Add every side that has label text — front, ingredients panel, back-of-pack"
            : "Drop an image or PDF of your product label to get started"}
        </p>
      </motion.div>

      {staged.length > 0 ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="space-y-3">
          <div className="grid grid-cols-4 gap-3">
            {staged.map((s, i) => (
              <div key={i} className="relative aspect-square rounded-lg border overflow-hidden bg-muted">
                {s.preview ? (
                  <img src={s.preview} alt={`Label side ${i + 1}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <FileText className="h-8 w-8 text-primary" />
                  </div>
                )}
                <div className="absolute bottom-0 inset-x-0 bg-background/80 px-1.5 py-0.5 text-[10px] truncate">
                  {s.file.name}
                </div>
                <button
                  onClick={() => removeAt(i)}
                  className="absolute top-1 right-1 rounded-full bg-background/90 p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {staged.length < MAX_IMAGES && (
              <button
                onClick={() => inputRef.current?.click()}
                className="aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
              >
                <Plus className="h-6 w-6" />
                <span className="text-xs">Add side</span>
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {staged.length} of {MAX_IMAGES} images added
          </p>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`relative rounded-xl border-2 border-dashed p-12 text-center cursor-pointer transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          }`}
        >
          <div className="space-y-3">
            <Upload className="h-12 w-12 text-muted-foreground mx-auto" />
            <div>
              <p className="text-sm font-medium">Drop your label here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">Supports JPG, PNG, PDF · select multiple to add every side at once</p>
            </div>
          </div>
        </motion.div>
      )}

      <input ref={inputRef} type="file" accept={ACCEPTED} multiple onChange={onSelect} className="hidden" />

      <ScanIntake options={options} setOptions={setOptions} />
      {seasonalPanel}

      {/* Action buttons */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex flex-col sm:flex-row gap-3"
      >
        <Button onClick={startScan} disabled={staged.length === 0} size="lg" className="flex-1 gap-2">
          <FileImage className="h-4 w-4" />
          Scan Label{staged.length > 1 ? ` (${staged.length} images)` : ""}
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="gap-2"
          onClick={() => inputRef.current?.click()}
        >
          <Camera className="h-4 w-4" />
          {staged.length > 0 ? "Add More" : "Take Photo"}
        </Button>
        {staged.length > 0 && (
          <Button variant="ghost" size="lg" onClick={clear}>
            Clear all
          </Button>
        )}
      </motion.div>
      {leadDialog}
    </div>
  );
};

export default ScanUploadPage;
