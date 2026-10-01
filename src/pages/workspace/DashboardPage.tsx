import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Tag, CheckCircle2, AlertTriangle, Clock, Bell, Factory, QrCode, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBrand } from "@/lib/brand-context";
import { daysAgo, fetchProducts, fetchSuppliers, ProductRow, SupplierRow } from "@/lib/workspace-queries";
import StatusPill from "@/components/workspace/StatusPill";

interface Alert {
  severity: "danger" | "warn" | "info";
  title: string;
  sub: string;
  time: string;
}

const buildAlerts = (products: ProductRow[], suppliers: SupplierRow[]): Alert[] => {
  const alerts: Alert[] = [];
  const flaggedSupplier = suppliers.find(s => s.verification_status === "flagged");
  if (flaggedSupplier) {
    alerts.push({ severity: "danger", title: "Supplier verification flagged",
      sub: `${flaggedSupplier.name} — ${flaggedSupplier.notes ?? "verification dropped below threshold"}.`,
      time: daysAgo(flaggedSupplier.last_activity_at) });
  }
  const seasonal = products.find(p => p.is_seasonal && p.label_status !== "approved");
  if (seasonal) {
    const days = seasonal.launch_date ? Math.max(0, Math.round((+new Date(seasonal.launch_date) - Date.now()) / 86400000)) : null;
    alerts.push({ severity: "warn", title: "Seasonal SKU label expiry",
      sub: `${seasonal.name} — ${seasonal.season_tag ?? "seasonal"} label not yet approved${days != null ? `. Launch in ${days} days` : ""}.`,
      time: daysAgo(seasonal.updated_at) });
  }
  const inReview = products.filter(p => p.label_status === "in_review");
  if (inReview.length > 0) alerts.push({ severity: "info", title: "Labels awaiting review",
    sub: `${inReview.length} label${inReview.length > 1 ? "s" : ""} pending compliance sign-off.`,
    time: daysAgo(inReview[0].updated_at) });
  return alerts;
};

const alertStyles: Record<Alert["severity"], string> = {
  danger: "bg-[hsl(var(--risk-high-bg))] text-[hsl(var(--risk-high))]",
  warn: "bg-[hsl(var(--risk-medium-bg))] text-[hsl(var(--risk-medium))]",
  info: "bg-accent text-accent-foreground",
};
const alertIcon = (s: Alert["severity"]) => s === "danger" ? AlertTriangle : s === "warn" ? Clock : Bell;

const supplierBarColor = (status: string) =>
  status === "verified" ? "hsl(var(--risk-low))" :
  status === "spec_change" ? "hsl(var(--risk-medium))" :
  "hsl(var(--risk-high))";

const supplierBadgeLabel = (s: string) => s === "verified" ? "Verified" : s === "spec_change" ? "Spec change" : "Flagged";

const DashboardPage = () => {
  const { brand, loading } = useBrand();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);

  useEffect(() => {
    if (!brand) return;
    fetchProducts(brand.id).then(setProducts);
    fetchSuppliers(brand.id).then(setSuppliers);
  }, [brand]);

  if (loading || !brand) return <div className="text-sm text-muted-foreground">Loading workspace…</div>;

  const monthAgo = Date.now() - 30 * 86400000;
  const updatedThisMonth = products.filter(p => +new Date(p.updated_at) >= monthAgo).length;
  const lastUpdated = products[0]?.updated_at;
  const missingMaterialData = products.filter(p => Object.keys(p.material_data ?? {}).length === 0).length;

  const total = products.length;
  const approved = products.filter(p => p.label_status === "approved").length;
  const flagged = products.filter(p => p.label_status === "flagged").length;
  const inReview = products.filter(p => p.label_status === "in_review").length;
  const alerts = buildAlerts(products, suppliers);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {brand.name} — {total} active SKUs{lastUpdated ? ` · Last updated ${daysAgo(lastUpdated).toLowerCase()}` : ""}
          </p>
        </div>
        <Button asChild size="sm" className="gap-1.5"><Link to="/generate"><Plus className="h-4 w-4" /> New label</Link></Button>
      </div>

      {/* DPP banner — jewelry only */}
      {brand.vertical === "jewelry" && missingMaterialData > 0 && (
        <div className="rounded-lg border bg-accent/40 p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0">
            <QrCode className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Digital Product Passport readiness</p>
            <p className="text-xs text-muted-foreground mt-0.5">{missingMaterialData} SKU{missingMaterialData === 1 ? "" : "s"} need material data completing</p>
          </div>
          <Button asChild size="sm" variant="default"><Link to="/workspace/dpp">Review readiness</Link></Button>
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total labels", icon: Tag,            value: total,    sub: `${updatedThisMonth} updated this month`, tone: "ok" },
          { label: "Approved",     icon: CheckCircle2,   value: approved, sub: total ? `${Math.round((approved/total)*100)}% of labels` : "—", tone: "ok" },
          { label: "Flagged",      icon: AlertTriangle,  value: flagged,  sub: "Needs action",     tone: flagged ? "danger" : "ok" },
          { label: "In review",    icon: Clock,          value: inReview, sub: "Awaiting approval", tone: "warn" },
        ].map(m => (
          <div key={m.label} className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><m.icon className="h-3.5 w-3.5" /> {m.label}</div>
            <div className="text-2xl font-semibold mt-1">{m.value}</div>
            <div className={`text-[11px] mt-0.5 ${m.tone === "danger" ? "text-[hsl(var(--risk-high))]" : m.tone === "warn" ? "text-[hsl(var(--risk-medium))]" : "text-[hsl(var(--risk-low))]"}`}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Label library preview */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-sm font-semibold flex items-center gap-1.5"><Tag className="h-4 w-4 text-muted-foreground" /> Label library</h2>
          <Button asChild variant="ghost" size="sm" className="gap-1 text-xs"><Link to="/workspace/labels">View all <ArrowRight className="h-3 w-3" /></Link></Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/50">
                <th className="text-left font-medium px-4 py-2.5">SKU / Product</th>
                <th className="text-left font-medium px-4 py-2.5">Type</th>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
                <th className="text-left font-medium px-4 py-2.5">Version</th>
                <th className="text-left font-medium px-4 py-2.5">Updated</th>
              </tr>
            </thead>
            <tbody>
              {products.slice(0, 5).map(p => (
                <tr key={p.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <Link to={`/admin/products/${p.product_key}`} className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-md bg-muted border flex items-center justify-center text-sm">{p.thumbnail ?? "📦"}</div>
                      <div>
                        <div className="text-[13px] font-medium">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground">{p.sku}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 space-x-1">
                    {p.label_types.map(t => (
                      <span key={t} className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent text-accent-foreground">{t}</span>
                    ))}
                  </td>
                  <td className="px-4 py-2.5"><StatusPill status={p.label_status} /></td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{p.label_version}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{new Date(p.updated_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No products yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Alerts + suppliers row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-sm font-semibold flex items-center gap-1.5"><Bell className="h-4 w-4 text-muted-foreground" /> Compliance alerts</h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[hsl(var(--risk-high-bg))] text-[hsl(var(--risk-high))] font-medium">{alerts.length} active</span>
          </div>
          <div className="divide-y">
            {alerts.map((a, i) => {
              const Icon = alertIcon(a.severity);
              return (
                <div key={i} className="flex gap-3 p-4">
                  <div className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 ${alertStyles[a.severity]}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">{a.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{a.sub}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{a.time}</p>
                  </div>
                </div>
              );
            })}
            {alerts.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">All clear.</p>}
          </div>
        </div>

        <div className="rounded-lg border bg-card">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-sm font-semibold flex items-center gap-1.5"><Factory className="h-4 w-4 text-muted-foreground" /> Supplier monitoring</h2>
            <Button asChild variant="ghost" size="sm" className="gap-1 text-xs"><Link to="/workspace/suppliers">View all <ArrowRight className="h-3 w-3" /></Link></Button>
          </div>
          <div className="divide-y">
            {suppliers.slice(0, 5).map(s => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-32 text-xs font-medium truncate">{s.name}</div>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${s.verification_score}%`, background: supplierBarColor(s.verification_status) }} />
                </div>
                <StatusPill status={s.verification_status === "spec_change" ? "in_review" : s.verification_status === "verified" ? "approved" : "flagged"} />
              </div>
            ))}
            {suppliers.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No suppliers yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
