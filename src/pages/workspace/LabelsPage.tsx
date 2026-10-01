import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Copy, Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useBrand } from "@/lib/brand-context";
import {
  CHANGE_FIELD_NAMES,
  fetchBrandLabels,
  fetchLabelVersions,
  formatChangeValue,
  setLabelArchived,
  type BrandLabel,
  type BrandLabelVersion,
} from "@/lib/brand-labels";

// The brand's saved labels. Edit saves a new version; "Use as template"
// starts a new product's label from this one; History lists every version
// and what changed.

const TABS = ["active", "archived"] as const;

const scoreClass = (s: number | null) =>
  s === null
    ? "text-muted-foreground"
    : s >= 80
    ? "text-[hsl(var(--risk-low))]"
    : s >= 50
    ? "text-[hsl(var(--risk-medium))]"
    : "text-[hsl(var(--risk-high))]";

const VersionHistory = ({ labelId }: { labelId: string }) => {
  const [versions, setVersions] = useState<BrandLabelVersion[] | null>(null);
  useEffect(() => {
    fetchLabelVersions(labelId)
      .then(setVersions)
      .catch((e) => {
        toast.error(e.message ?? "Couldn't load versions.");
        setVersions([]);
      });
  }, [labelId]);

  if (!versions) return <p className="text-xs text-muted-foreground">Loading versions…</p>;
  return (
    <ol className="space-y-3">
      {versions.map((v) => (
        <li key={v.id} className="rounded-md border bg-background p-3 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-mono font-semibold">v{v.version}</span>
            <span className="text-muted-foreground">{new Date(v.created_at).toLocaleString()}</span>
            {v.created_by_email && <span className="text-muted-foreground">{v.created_by_email}</span>}
            {v.compliance_score !== null && (
              <span className={scoreClass(v.compliance_score)}>{v.compliance_score}% checks passed</span>
            )}
            {v.rulebook_version && <span className="text-muted-foreground">Rulebook {v.rulebook_version}</span>}
          </div>
          {v.note && <p className="text-xs">{v.note}</p>}
          {v.version === 1 ? (
            <p className="text-xs text-muted-foreground">First version.</p>
          ) : (
            <ul className="text-xs space-y-1">
              {v.changes.map((c) => (
                <li key={c.field} className="grid sm:grid-cols-[160px,1fr] gap-x-3">
                  <span className="font-medium">{CHANGE_FIELD_NAMES[c.field] ?? c.field}</span>
                  <span className="min-w-0 break-words">
                    <span className="text-muted-foreground line-through">{formatChangeValue(c.from)}</span>
                    {" → "}
                    <span>{formatChangeValue(c.to)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
};

const LabelsPage = () => {
  const { brand } = useBrand();
  const [rows, setRows] = useState<BrandLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<(typeof TABS)[number]>("active");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!brand) return;
    setLoading(true);
    fetchBrandLabels(brand.id)
      .then(setRows)
      .catch((e) => toast.error(e.message ?? "Couldn't load labels."))
      .finally(() => setLoading(false));
  }, [brand]);

  useEffect(load, [load]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if ((tab === "archived") !== Boolean(r.archived_at)) return false;
        if (q && !`${r.product_name} ${r.category ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [rows, tab, q]
  );

  const toggleArchive = async (r: BrandLabel) => {
    try {
      await setLabelArchived(r.id, !r.archived_at);
      toast.success(r.archived_at ? "Label restored." : "Label archived.");
      load();
    } catch (e) {
      toast.error((e as Error).message ?? "Couldn't update the label.");
    }
  };

  const activeCount = rows.filter((r) => !r.archived_at).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold">Label library</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {brand?.name} — {activeCount} label{activeCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product" className="pl-8 h-8 w-56 text-sm" />
          </div>
          <Button asChild size="sm" className="gap-1.5">
            <Link to="/generate">
              <Plus className="h-4 w-4" /> New label
            </Link>
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="flex items-center gap-1 p-3 border-b">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                tab === t ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/50">
                <th className="text-left font-medium px-4 py-2.5">Product</th>
                <th className="text-left font-medium px-4 py-2.5">Category</th>
                <th className="text-left font-medium px-4 py-2.5">Version</th>
                <th className="text-left font-medium px-4 py-2.5">Checks passed</th>
                <th className="text-left font-medium px-4 py-2.5">Updated</th>
                <th className="text-right font-medium px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <Fragment key={r.id}>
                  <tr className="border-t hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => setOpen(open === r.id ? null : r.id)}
                        className="flex items-center gap-1.5 text-left text-[13px] font-medium"
                        aria-expanded={open === r.id}
                      >
                        {open === r.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        {r.product_name || "Untitled label"}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.category ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">v{r.current_version}</td>
                    <td className={`px-4 py-2.5 text-xs ${scoreClass(r.compliance_score)}`}>
                      {r.compliance_score === null ? "—" : `${r.compliance_score}%`}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{new Date(r.updated_at).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {!r.archived_at && (
                          <>
                            <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1">
                              <Link to={`/generate?label=${r.id}`}>
                                <Pencil className="h-3.5 w-3.5" /> Edit
                              </Link>
                            </Button>
                            <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1">
                              <Link to={`/generate?template=${r.id}`}>
                                <Copy className="h-3.5 w-3.5" /> Use as template
                              </Link>
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => toggleArchive(r)}
                        >
                          {r.archived_at ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                          {r.archived_at ? "Restore" : "Archive"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {open === r.id && (
                    <tr className="border-t bg-muted/20">
                      <td colSpan={6} className="px-4 py-3">
                        <VersionHistory labelId={r.id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {rows.length === 0 ? (
                      <>
                        No saved labels yet.{" "}
                        <Link to="/generate" className="underline">
                          Create one
                        </Link>{" "}
                        and save it to {brand?.name ?? "your brand"}.
                      </>
                    ) : (
                      "No labels match."
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LabelsPage;
