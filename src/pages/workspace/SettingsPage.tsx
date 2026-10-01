import { useBrand, verticalLabel } from "@/lib/brand-context";

const SettingsPage = () => {
  const { brand } = useBrand();
  if (!brand) return null;
  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Brand profile and defaults</p>
      </div>

      <div className="rounded-lg border bg-card divide-y">
        {[
          { k: "Brand name", v: brand.name },
          { k: "Slug",        v: brand.slug },
          { k: "Vertical",    v: verticalLabel(brand.vertical) },
          { k: "Default market", v: brand.default_market ?? "—" },
        ].map(r => (
          <div key={r.k} className="flex items-center justify-between p-4">
            <span className="text-sm text-muted-foreground">{r.k}</span>
            <span className="text-sm font-medium">{r.v}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">Brand settings become editable with brand accounts.</p>
    </div>
  );
};

export default SettingsPage;
