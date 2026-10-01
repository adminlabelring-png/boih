import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVE_BRAND_KEY } from "@/lib/brand-context";
import { saveBrandLabel, type LabelData } from "@/lib/brand-labels";

// "Save to brand" in the label builder: a new label (version 1), or the
// next version of the label being edited, with an optional note.

export interface EditingLabel {
  labelId: string;
  brandId: string;
  version: number;
  productName: string;
}

interface Props {
  session: Session | null;
  editing: EditingLabel | null;
  templateOf: { labelId: string; brandId: string } | null;
  disabled: boolean;
  getData: () => LabelData;
  score: number | null;
  rulebookVersion: string | null;
  onSaved: (saved: EditingLabel) => void;
}

const SaveToBrand = ({ session, editing, templateOf, disabled, getData, score, rulebookVersion, onSaved }: Props) => {
  const [brands, setBrands] = useState<{ id: string; name: string }[] | null>(null);
  const [brandId, setBrandId] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) {
      setBrands(null);
      return;
    }
    supabase
      .from("brand_members" as never)
      .select("brands(id, name)")
      .eq("user_id", userId)
      .then(({ data }) => {
        const list = ((data ?? []) as unknown as { brands: { id: string; name: string } | null }[])
          .map((r) => r.brands)
          .filter((b): b is { id: string; name: string } => !!b);
        setBrands(list);
        let stored: string | null = null;
        try {
          stored = localStorage.getItem(ACTIVE_BRAND_KEY);
        } catch {
          // ignore
        }
        setBrandId(list.find((b) => b.id === stored)?.id ?? list[0]?.id ?? "");
      });
  }, [userId]);

  if (!session) {
    return (
      <p className="text-[11px] text-muted-foreground">
        <Link to="/account" className="underline">
          Sign in
        </Link>{" "}
        to save this label to your brand and keep every version.
      </p>
    );
  }
  if (brands && brands.length === 0 && !editing) {
    return (
      <p className="text-[11px] text-muted-foreground">
        <Link to="/account" className="underline">
          Create your brand
        </Link>{" "}
        to save this label and keep every version.
      </p>
    );
  }

  // A template's new label belongs to the template's brand.
  const targetBrand = editing?.brandId ?? templateOf?.brandId ?? brandId;

  const save = async () => {
    if (!targetBrand) return;
    setSaving(true);
    try {
      const data = getData();
      const saved = await saveBrandLabel({
        brandId: targetBrand,
        labelId: editing?.labelId ?? null,
        data,
        score,
        rulebookVersion,
        note: note.trim() || null,
        templateOf: editing ? null : templateOf?.labelId ?? null,
      });
      toast.success(saved.version === 1 ? "Saved to your brand as version 1." : `Saved as version ${saved.version}.`);
      setOpen(false);
      setNote("");
      onSaved({
        labelId: saved.labelId,
        brandId: targetBrand,
        version: saved.version,
        productName: data.fields.productName,
      });
    } catch (e) {
      toast.error((e as Error).message ?? "Couldn't save the label.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button variant="secondary" className="w-full gap-2" disabled={disabled || !brands} onClick={() => setOpen(true)}>
        <Save className="h-4 w-4" />
        {editing ? `Save as version ${editing.version + 1}` : "Save to brand"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? `Save version ${editing.version + 1}` : "Save to your brand"}</DialogTitle>
            <DialogDescription>
              {editing
                ? `Version ${editing.version} stays in the label's history, with what changed.`
                : "Saved labels can be edited later; each save becomes a new version."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {!editing && !templateOf && brands && brands.length > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="save-brand">Brand</Label>
                <Select value={brandId} onValueChange={setBrandId}>
                  <SelectTrigger id="save-brand">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="save-note">Note (optional)</Label>
              <Textarea
                id="save-note"
                maxLength={1000}
                rows={3}
                placeholder={editing ? "What changed and why, e.g. new supplier for the rose oil" : "e.g. first print run"}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <Button className="w-full" onClick={save} disabled={saving || !targetBrand}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SaveToBrand;
