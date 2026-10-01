import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand-context";

const MARKETS = [
  { value: "UK", label: "UK" },
  { value: "EU", label: "EU" },
  { value: "UK+EU", label: "UK and EU" },
];

const SettingsPage = () => {
  const { brand, refresh } = useBrand();
  const [isOwner, setIsOwner] = useState(false);
  const [name, setName] = useState("");
  const [market, setMarket] = useState("UK");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!brand) return;
    setName(brand.name);
    setMarket(brand.default_market ?? "UK");
    supabase
      .rpc("is_brand_owner" as never, { p_brand: brand.id } as never)
      .then(({ data }) => setIsOwner(data === true));
  }, [brand]);

  if (!brand) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 120) return toast.error("Brand name must be 1 to 120 characters.");
    setSaving(true);
    const { error } = await supabase
      .from("brands")
      .update({ name: trimmed, default_market: market })
      .eq("id", brand.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Brand settings saved.");
    refresh();
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Brand profile and defaults</p>
      </div>

      <form onSubmit={save} className="rounded-lg border bg-card p-4 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="brand-name">Brand name</Label>
          <Input id="brand-name" value={name} maxLength={120} disabled={!isOwner} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="brand-market">Where you sell</Label>
          <Select value={market} onValueChange={setMarket} disabled={!isOwner}>
            <SelectTrigger id="brand-market">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MARKETS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isOwner ? (
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Only the brand's owner can change these.</p>
        )}
      </form>
    </div>
  );
};

export default SettingsPage;
