import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ExternalLink, RefreshCw, Search } from "lucide-react";

// Rulebook review for admins: sign off rules and the official substance
// lists, publish a version, and close source-change alerts. Writes go
// through admin-only database functions that record the signed-in admin
// as the reviewer.

type Status = "unverified" | "verified" | "rejected";

interface Version {
  id: string;
  version: string;
  status: "draft" | "published" | "retired";
  created_at: string;
  published_at: string | null;
  published_by: string | null;
  notes: string | null;
}

interface SummaryRow {
  kind: "rule" | "substance";
  jurisdiction: string | null;
  list_type: string | null;
  annex: string | null;
  verification_status: Status;
  entries: number;
}

interface RuleRow {
  id: string;
  rule_key: string;
  title: string;
  markets: string[];
  check_type: string;
  severity: string;
  explanation: string;
  sources: { market: string; title: string; url: string; clause: string }[];
  verification_status: Status;
  verified_by: string | null;
  verification_note: string | null;
}

interface SubstanceRow {
  id: string;
  list_type: string;
  jurisdiction: string | null;
  annex_ref: string | null;
  inci_name: string;
  chemical_name: string | null;
  cas_number: string | null;
  product_type: string | null;
  max_concentration: string | null;
  other_conditions: string | null;
  label_warnings: string | null;
  sources: { url: string; clause: string }[];
  verification_status: Status;
  verified_by: string | null;
}

interface SourceAlert {
  id: string;
  detected_at: string;
  previous_signal: string | null;
  new_signal: string;
  affected_rules: string[];
  source_watches: { label: string; fetch_url: string } | null;
}

const LIST_NAMES: Record<string, string> = {
  prohibited: "Prohibited",
  restricted: "Restricted",
  fragrance_allergen: "Fragrance allergens",
  colourant: "Colourants",
  preservative: "Preservatives",
  uv_filter: "UV filters",
};

const statusBadge = (s: Status) => (
  <Badge variant={s === "verified" ? "secondary" : s === "rejected" ? "destructive" : "outline"} className="text-[10px]">
    {s === "verified" ? "Signed off" : s === "rejected" ? "Rejected" : "To review"}
  </Badge>
);

const sourceFor = (jurisdiction: string | null, annex: string | null) =>
  jurisdiction === "GB"
    ? `https://www.legislation.gov.uk/eur/2009/1223/annex/${annex}`
    : "https://eur-lex.europa.eu/eli/reg/2009/1223/oj";

const rpc = (fn: string, args: Record<string, unknown>) =>
  supabase.rpc(fn as never, args as never) as unknown as Promise<{ data: unknown; error: { message: string } | null }>;

interface Group {
  jurisdiction: string | null;
  list_type: string;
  annex: string | null;
  counts: Record<Status, number>;
}

const RulebookPanel = () => {
  const [versions, setVersions] = useState<Version[]>([]);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [alerts, setAlerts] = useState<SourceAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [groupReview, setGroupReview] = useState<Group | null>(null);
  const [sample, setSample] = useState<SubstanceRow[]>([]);
  const [groupChecked, setGroupChecked] = useState(false);
  const [groupNote, setGroupNote] = useState("");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SubstanceRow[]>([]);

  const [publishOpen, setPublishOpen] = useState(false);

  const version = versions.find((v) => v.id === versionId) ?? null;
  const editable = version?.status === "draft";

  const loadVersions = async () => {
    const { data, error } = await supabase
      .from("rulebook_versions" as never)
      .select("id, version, status, created_at, published_at, published_by, notes")
      .eq("scope", "cosmetics")
      .order("created_at", { ascending: false });
    if (error) return toast.error(error.message);
    const list = (data ?? []) as unknown as Version[];
    setVersions(list);
    // The version checks currently use: the published one, else the latest draft.
    setVersionId((cur) => cur ?? (list.find((v) => v.status === "published") ?? list.find((v) => v.status === "draft"))?.id ?? null);
  };

  const loadVersion = async (id: string) => {
    setLoading(true);
    const [s, r, a] = await Promise.all([
      supabase.from("rulebook_review_summary" as never).select("*").eq("rulebook_version_id", id),
      supabase
        .from("rules" as never)
        .select("id, rule_key, title, markets, check_type, severity, explanation, sources, verification_status, verified_by, verification_note")
        .eq("rulebook_version_id", id)
        .order("rule_key"),
      supabase
        .from("source_change_alerts" as never)
        .select("id, detected_at, previous_signal, new_signal, affected_rules, source_watches(label, fetch_url)")
        .eq("status", "open")
        .order("detected_at", { ascending: false }),
    ]);
    for (const res of [s, r, a]) if (res.error) toast.error(res.error.message);
    setSummary((s.data ?? []) as unknown as SummaryRow[]);
    setRules((r.data ?? []) as unknown as RuleRow[]);
    setAlerts((a.data ?? []) as unknown as SourceAlert[]);
    setLoading(false);
  };

  useEffect(() => {
    loadVersions();
  }, []);
  useEffect(() => {
    if (versionId) loadVersion(versionId);
    setResults([]);
  }, [versionId]);

  const refresh = async () => {
    await loadVersions();
    if (versionId) await loadVersion(versionId);
  };

  const totals = useMemo(() => {
    const t = { rule: { unverified: 0, verified: 0, rejected: 0 }, substance: { unverified: 0, verified: 0, rejected: 0 } };
    for (const row of summary) t[row.kind][row.verification_status] += row.entries;
    return t;
  }, [summary]);

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const row of summary.filter((x) => x.kind === "substance")) {
      const key = `${row.jurisdiction}|${row.list_type}|${row.annex}`;
      const g = map.get(key) ?? {
        jurisdiction: row.jurisdiction,
        list_type: row.list_type ?? "",
        annex: row.annex || null,
        counts: { unverified: 0, verified: 0, rejected: 0 },
      };
      g.counts[row.verification_status] += row.entries;
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) =>
      `${a.jurisdiction ?? "~"}${a.annex}${a.list_type}`.localeCompare(`${b.jurisdiction ?? "~"}${b.annex}${b.list_type}`)
    );
  }, [summary]);

  const unverified = totals.rule.unverified + totals.substance.unverified;

  const reviewRules = async (ids: string[], status: Status, note?: string) => {
    setBusy(true);
    const { error } = await rpc("admin_review_rules", { p_ids: ids, p_status: status, p_note: note ?? null });
    setBusy(false);
    if (error) return toast.error(error.message);
    refresh();
  };

  const reviewSubstances = async (ids: string[], status: Status) => {
    if (!versionId) return;
    setBusy(true);
    const { error } = await rpc("admin_review_substances", {
      p_version_id: versionId,
      p_status: status,
      p_note: null,
      p_ids: ids,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setResults((rs) => rs.map((r) => (ids.includes(r.id) ? { ...r, verification_status: status } : r)));
    refresh();
  };

  const openGroup = async (g: Group) => {
    setGroupReview(g);
    setGroupChecked(false);
    setGroupNote(`Spot-checked against ${g.jurisdiction === "GB" ? "legislation.gov.uk" : "the EU consolidated text"}, Annex ${g.annex}.`);
    setSample([]);
    let q = supabase
      .from("substances" as never)
      .select("id, list_type, jurisdiction, annex_ref, inci_name, chemical_name, cas_number, product_type, max_concentration, other_conditions, label_warnings, sources, verification_status, verified_by")
      .eq("rulebook_version_id", versionId!)
      .eq("list_type", g.list_type)
      .eq("verification_status", "unverified")
      .limit(1000);
    q = g.jurisdiction ? q.eq("jurisdiction", g.jurisdiction) : q.is("jurisdiction", null);
    const { data, error } = await q;
    if (error) return toast.error(error.message);
    const rows = (data ?? []) as unknown as SubstanceRow[];
    // A random sample to compare with the official text.
    setSample([...rows].sort(() => Math.random() - 0.5).slice(0, 10));
  };

  const signOffGroup = async () => {
    if (!groupReview || !versionId) return;
    setBusy(true);
    const { data, error } = await rpc("admin_review_substances", {
      p_version_id: versionId,
      p_status: "verified",
      p_note: groupNote,
      p_jurisdiction: groupReview.jurisdiction ?? "manual",
      p_list_type: groupReview.list_type,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${data} entries signed off`);
    setGroupReview(null);
    refresh();
  };

  const search = async () => {
    if (!versionId || query.trim().length < 2) return;
    const term = query.trim().replace(/[%,()]/g, " ");
    const { data, error } = await supabase
      .from("substances" as never)
      .select("id, list_type, jurisdiction, annex_ref, inci_name, chemical_name, cas_number, product_type, max_concentration, other_conditions, label_warnings, sources, verification_status, verified_by")
      .eq("rulebook_version_id", versionId)
      .or(`inci_name.ilike.%${term}%,chemical_name.ilike.%${term}%,cas_number.ilike.%${term}%`)
      .order("inci_name")
      .limit(50);
    if (error) return toast.error(error.message);
    setResults((data ?? []) as unknown as SubstanceRow[]);
  };

  const publish = async () => {
    if (!versionId) return;
    setBusy(true);
    const { error } = await rpc("admin_publish_rulebook", { p_version_id: versionId });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Published v${version?.version}. Brand alerts for affected saved labels are in the Brand alerts tab.`);
    setPublishOpen(false);
    refresh();
  };

  const closeAlert = async (id: string, status: "reviewed" | "dismissed") => {
    const note = window.prompt(status === "reviewed" ? "What did you do about this change?" : "Why doesn't it affect the rules?");
    if (note === null) return;
    const { error } = await rpc("admin_review_source_alert", { p_id: id, p_status: status, p_note: note });
    if (error) return toast.error(error.message);
    refresh();
  };

  const substanceDetail = (s: SubstanceRow) =>
    [
      s.chemical_name && s.chemical_name !== s.inci_name && `Listed as: ${s.chemical_name}`,
      s.cas_number && `CAS ${s.cas_number}`,
      s.product_type && `Product types: ${s.product_type}`,
      s.max_concentration && `Maximum: ${s.max_concentration}`,
      s.other_conditions && `Conditions: ${s.other_conditions}`,
      s.label_warnings && `Label warnings: ${s.label_warnings}`,
    ].filter(Boolean) as string[];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {versions.map((v) => (
            <Button key={v.id} size="sm" variant={v.id === versionId ? "default" : "outline"} onClick={() => setVersionId(v.id)}>
              v{v.version} <span className="ml-1.5 text-[10px] opacity-70">{v.status}</span>
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {editable && (
            <Button size="sm" onClick={() => setPublishOpen(true)} disabled={busy || unverified > 0}>
              {unverified > 0 ? `${unverified.toLocaleString()} left to review` : `Publish v${version?.version}`}
            </Button>
          )}
        </div>
      </div>

      {version && (
        <Card className="p-4 text-sm space-y-1">
          <div>
            <strong>v{version.version}</strong> — {version.status}
            {version.published_at && ` since ${new Date(version.published_at).toLocaleDateString()} by ${version.published_by}`}
          </div>
          {version.notes && <div className="text-muted-foreground">{version.notes}</div>}
          <div className="text-muted-foreground">
            Rules: {totals.rule.verified} signed off, {totals.rule.unverified} to review, {totals.rule.rejected} rejected ·
            Substances: {totals.substance.verified.toLocaleString()} signed off, {totals.substance.unverified.toLocaleString()} to review,{" "}
            {totals.substance.rejected.toLocaleString()} rejected
          </div>
          {!editable && <div className="text-muted-foreground">Published and retired versions can't change. Clone to a new draft to edit.</div>}
        </Card>
      )}

      {alerts.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Source changes to review ({alerts.length})</h3>
          {alerts.map((a) => (
            <Card key={a.id} className="p-4 text-sm space-y-1">
              <div className="font-medium">{a.source_watches?.label ?? "Source"}</div>
              <div className="text-xs text-muted-foreground">
                Detected {new Date(a.detected_at).toLocaleDateString()} · {a.previous_signal} → {a.new_signal}
              </div>
              {a.affected_rules.length > 0 && (
                <div className="text-xs">Cited by: {a.affected_rules.slice(0, 12).join(", ")}{a.affected_rules.length > 12 ? "…" : ""}</div>
              )}
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => closeAlert(a.id, "reviewed")}>Mark reviewed</Button>
                <Button size="sm" variant="ghost" onClick={() => closeAlert(a.id, "dismissed")}>Dismiss</Button>
              </div>
            </Card>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Rules ({rules.length})</h3>
          {editable && totals.rule.unverified > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                const note = window.prompt("Note for the sign-off (e.g. what you checked each rule against):");
                if (note) reviewRules(rules.filter((r) => r.verification_status === "unverified").map((r) => r.id), "verified", note);
              }}
            >
              Sign off all {totals.rule.unverified} to review
            </Button>
          )}
        </div>
        {rules.map((r) => (
          <Card key={r.id} className="p-4 text-sm space-y-1.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-medium">{r.title}</div>
                <div className="text-xs text-muted-foreground">
                  {r.rule_key} · {r.check_type} · {r.severity === "legal" ? "legal requirement" : "best practice"} · {r.markets.join(", ")}
                </div>
              </div>
              {statusBadge(r.verification_status)}
            </div>
            <p className="text-muted-foreground">{r.explanation}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {r.sources.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                  {s.market}: {s.clause} <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
            {r.verified_by && (
              <div className="text-xs text-muted-foreground">
                {r.verification_status === "verified" ? "Signed off" : "Reviewed"} by {r.verified_by}
                {r.verification_note ? ` — ${r.verification_note}` : ""}
              </div>
            )}
            {editable && (
              <div className="flex gap-2 pt-1">
                {r.verification_status !== "verified" && (
                  <Button size="sm" disabled={busy} onClick={() => reviewRules([r.id], "verified")}>Sign off</Button>
                )}
                {r.verification_status !== "rejected" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      const note = window.prompt("Why reject this rule?");
                      if (note) reviewRules([r.id], "rejected", note);
                    }}
                  >
                    Reject
                  </Button>
                )}
                {r.verification_status !== "unverified" && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => reviewRules([r.id], "unverified")}>Reopen</Button>
                )}
              </div>
            )}
          </Card>
        ))}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Substance lists</h3>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">List</th>
                  <th className="text-left px-3 py-2 font-medium">Source</th>
                  <th className="text-right px-3 py-2 font-medium">Signed off</th>
                  <th className="text-right px-3 py-2 font-medium">To review</th>
                  <th className="text-right px-3 py-2 font-medium">Rejected</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={`${g.jurisdiction}${g.list_type}${g.annex}`} className="border-t">
                    <td className="px-3 py-2">{LIST_NAMES[g.list_type] ?? g.list_type}</td>
                    <td className="px-3 py-2 text-xs">
                      {g.jurisdiction ? (
                        <a href={sourceFor(g.jurisdiction, g.annex)} target="_blank" rel="noreferrer" className="underline">
                          {g.jurisdiction === "GB" ? "GB" : "EU/NI"} Annex {g.annex}
                        </a>
                      ) : (
                        "Hand-entered"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{g.counts.verified.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{g.counts.unverified.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{g.counts.rejected.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      {editable && g.counts.unverified > 0 && (
                        <Button size="sm" variant="outline" onClick={() => openGroup(g)}>Review</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Look up an entry</h3>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <Input placeholder="INCI name, chemical name or CAS number" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Button type="submit" variant="outline"><Search className="h-4 w-4" /></Button>
        </form>
        {results.map((s) => (
          <Card key={s.id} className="p-3 text-sm space-y-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <span className="font-medium">{s.inci_name}</span>{" "}
                <span className="text-xs text-muted-foreground">
                  {LIST_NAMES[s.list_type]} · {s.jurisdiction === "GB" ? "GB" : s.jurisdiction ? "EU/NI" : "hand-entered"}
                  {s.annex_ref && ` · Annex ${s.annex_ref.replace("/", ", entry ")}`}
                </span>
              </div>
              {statusBadge(s.verification_status)}
            </div>
            {substanceDetail(s).map((line) => (
              <div key={line} className="text-xs text-muted-foreground">{line}</div>
            ))}
            {editable && (
              <div className="flex gap-2 pt-1">
                {s.verification_status !== "verified" && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => reviewSubstances([s.id], "verified")}>Sign off</Button>
                )}
                {s.verification_status !== "rejected" && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => reviewSubstances([s.id], "rejected")}>Reject</Button>
                )}
                {s.verification_status !== "unverified" && (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => reviewSubstances([s.id], "unverified")}>Reopen</Button>
                )}
              </div>
            )}
          </Card>
        ))}
      </section>

      <Dialog open={!!groupReview} onOpenChange={(o) => !o && setGroupReview(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Review {groupReview && (LIST_NAMES[groupReview.list_type] ?? groupReview.list_type).toLowerCase()}:{" "}
              {groupReview?.jurisdiction === "GB" ? "GB" : "EU/NI"} Annex {groupReview?.annex}
            </DialogTitle>
          </DialogHeader>
          {groupReview && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                These {groupReview.counts.unverified.toLocaleString()} entries were read automatically from the official text. Compare this random sample with{" "}
                <a href={sourceFor(groupReview.jurisdiction, groupReview.annex)} target="_blank" rel="noreferrer" className="underline">
                  the source
                </a>{" "}
                (reference numbers match the annex) before signing them off.
              </p>
              <div className="space-y-2">
                {sample.map((s) => (
                  <div key={s.id} className="rounded border p-2">
                    <div className="font-medium">
                      {s.annex_ref && <span className="text-muted-foreground">Entry {s.annex_ref.split("/")[1]}: </span>}
                      {s.inci_name}
                    </div>
                    {substanceDetail(s).map((line) => (
                      <div key={line} className="text-xs text-muted-foreground">{line}</div>
                    ))}
                  </div>
                ))}
                {sample.length === 0 && <div className="text-muted-foreground">Loading sample…</div>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="group-note">Note</Label>
                <Textarea id="group-note" value={groupNote} onChange={(e) => setGroupNote(e.target.value)} />
              </div>
              <label className="flex items-start gap-2">
                <Checkbox checked={groupChecked} onCheckedChange={(v) => setGroupChecked(v === true)} />
                <span>I've compared these entries with the official text and they match.</span>
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGroupReview(null)}>Cancel</Button>
            <Button onClick={signOffGroup} disabled={busy || !groupChecked || !groupNote.trim()}>
              Sign off {groupReview?.counts.unverified.toLocaleString()} entries
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish v{version?.version}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Every scan and label check will use this version, and results will no longer be marked provisional. The version
            currently published is retired. Saved labels checked against an older version that this changes get brand
            alerts, which you send from the Brand alerts tab.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPublishOpen(false)}>Cancel</Button>
            <Button onClick={publish} disabled={busy}>Publish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RulebookPanel;
