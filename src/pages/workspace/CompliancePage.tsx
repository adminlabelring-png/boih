import { useEffect, useState } from "react";
import { AlertTriangle, Clock, Bell, Info } from "lucide-react";
import { useBrand } from "@/lib/brand-context";
import { daysAgo, fetchProducts, fetchSuppliers } from "@/lib/workspace-queries";

interface Item { severity: "danger" | "warn" | "info"; title: string; sub: string; time: string; }

const severityStyles: Record<Item["severity"], string> = {
  danger: "bg-[hsl(var(--risk-high-bg))] text-[hsl(var(--risk-high))]",
  warn: "bg-[hsl(var(--risk-medium-bg))] text-[hsl(var(--risk-medium))]",
  info: "bg-accent text-accent-foreground",
};
const Icon = ({ s }: { s: Item["severity"] }) => {
  const I = s === "danger" ? AlertTriangle : s === "warn" ? Clock : Info;
  return <I className="h-3.5 w-3.5" />;
};

const CompliancePage = () => {
  const { brand } = useBrand();
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    if (!brand) return;
    Promise.all([fetchProducts(brand.id), fetchSuppliers(brand.id)]).then(([products, suppliers]) => {
      const list: Item[] = [];
      suppliers.filter(s => s.verification_status === "flagged").forEach(s => {
        list.push({ severity: "danger", title: `Supplier ${s.name} flagged`,
          sub: s.notes ?? "Verification score below threshold.", time: daysAgo(s.last_activity_at) });
      });
      products.filter(p => p.label_status === "flagged").forEach(p => {
        list.push({ severity: "danger", title: `${p.name} label flagged`,
          sub: `SKU ${p.sku} — the label needs correcting.`, time: daysAgo(p.updated_at) });
      });
      products.filter(p => p.is_seasonal && p.label_status !== "approved").forEach(p => {
        list.push({ severity: "warn", title: "Seasonal SKU label expiry",
          sub: `${p.name} — ${p.season_tag ?? "seasonal"} label not yet approved.`, time: daysAgo(p.updated_at) });
      });
      products.filter(p => p.label_status === "in_review").forEach(p => {
        list.push({ severity: "info", title: `${p.name} awaiting review`, sub: `Version ${p.label_version} pending sign-off.`, time: daysAgo(p.updated_at) });
      });
      setItems(list);
    });
  }, [brand]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Compliance</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{brand?.name} — {items.length} active alerts</p>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b flex items-center gap-1.5">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">All alerts</h2>
        </div>
        <div className="divide-y">
          {items.map((a, i) => (
            <div key={i} className="flex gap-3 p-4">
              <div className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 ${severityStyles[a.severity]}`}>
                <Icon s={a.severity} />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-medium">{a.title}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{a.sub}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{a.time}</p>
              </div>
            </div>
          ))}
          {items.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">All clear.</p>}
        </div>
      </div>
    </div>
  );
};

export default CompliancePage;
