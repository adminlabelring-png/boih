import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

// What AI calls cost, as reported by OpenRouter per call (ai_usage): cost
// per scan, how often scans needed the stronger fallback model, and daily
// totals for scans and label suggestions.

interface DayRow {
  day: string;
  function_name: "analyze-label" | "generate-label";
  requests: number;
  fallbacks: number;
  failed: number;
  cost_usd: number;
  avg_cost_usd: number | null;
  p95_cost_usd: number | null;
}

interface FallbackRow {
  created_at: string;
  model: string;
  fallback_reason: string | null;
  cost_usd: number | null;
  ok: boolean;
  error: string | null;
  latency_ms: number | null;
}

const usd = (n: number | null | undefined, digits = 4) =>
  n === null || n === undefined ? "—" : `$${Number(n).toFixed(digits)}`;

const DAYS = 30;

const CostsPanel = () => {
  const [days, setDays] = useState<DayRow[]>([]);
  const [fallbacks, setFallbacks] = useState<FallbackRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - DAYS * 86400000).toISOString().slice(0, 10);
    const [d, f] = await Promise.all([
      supabase.from("ai_cost_daily" as never).select("*").gte("day", since).order("day", { ascending: false }),
      supabase
        .from("ai_usage" as never)
        .select("created_at, model, fallback_reason, cost_usd, ok, error, latency_ms")
        .eq("attempt", "fallback")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (d.error) toast.error(d.error.message);
    if (f.error) toast.error(f.error.message);
    setDays((d.data ?? []) as unknown as DayRow[]);
    setFallbacks((f.data ?? []) as unknown as FallbackRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const totals = useMemo(() => {
    const t = (fn: DayRow["function_name"]) => {
      const rows = days.filter((r) => r.function_name === fn);
      const requests = rows.reduce((a, r) => a + r.requests, 0);
      const cost = rows.reduce((a, r) => a + Number(r.cost_usd), 0);
      const fallbacks = rows.reduce((a, r) => a + r.fallbacks, 0);
      const failed = rows.reduce((a, r) => a + r.failed, 0);
      return { requests, cost, fallbacks, failed, avg: requests ? cost / requests : null };
    };
    return { scans: t("analyze-label"), suggestions: t("generate-label") };
  }, [days]);

  const byDay = useMemo(() => {
    const map = new Map<string, { scans?: DayRow; suggestions?: DayRow }>();
    for (const r of days) {
      const e = map.get(r.day) ?? {};
      if (r.function_name === "analyze-label") e.scans = r;
      else e.suggestions = r;
      map.set(r.day, e);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [days]);

  const fallbackRate = totals.scans.requests ? Math.round((totals.scans.fallbacks / totals.scans.requests) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Costs as reported by OpenRouter for each AI call over the last {DAYS} days. A scan that needed the stronger
          model counts both reads.
        </p>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Average cost per scan</div>
          <div className="text-2xl font-semibold">{usd(totals.scans.avg)}</div>
          <div className="text-xs text-muted-foreground">{totals.scans.requests} scans</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Scans re-read by the stronger model</div>
          <div className="text-2xl font-semibold">{fallbackRate}%</div>
          <div className="text-xs text-muted-foreground">{totals.scans.fallbacks} of {totals.scans.requests}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Label suggestions</div>
          <div className="text-2xl font-semibold">{usd(totals.suggestions.cost, 2)}</div>
          <div className="text-xs text-muted-foreground">
            {totals.suggestions.requests} calls · {usd(totals.suggestions.avg)} each
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total AI spend</div>
          <div className="text-2xl font-semibold">{usd(totals.scans.cost + totals.suggestions.cost, 2)}</div>
          <div className="text-xs text-muted-foreground">
            {totals.scans.failed + totals.suggestions.failed} failed calls
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Day</th>
                <th className="text-right px-3 py-2 font-medium">Scans</th>
                <th className="text-right px-3 py-2 font-medium">Re-read</th>
                <th className="text-right px-3 py-2 font-medium">Avg per scan</th>
                <th className="text-right px-3 py-2 font-medium">Most expensive 5%</th>
                <th className="text-right px-3 py-2 font-medium">Scan cost</th>
                <th className="text-right px-3 py-2 font-medium">Suggestions</th>
                <th className="text-right px-3 py-2 font-medium">Suggestion cost</th>
              </tr>
            </thead>
            <tbody>
              {byDay.map(([day, r]) => (
                <tr key={day} className="border-t">
                  <td className="px-3 py-2">{day}</td>
                  <td className="px-3 py-2 text-right">{r.scans?.requests ?? 0}</td>
                  <td className="px-3 py-2 text-right">{r.scans?.fallbacks ?? 0}</td>
                  <td className="px-3 py-2 text-right">{usd(r.scans?.avg_cost_usd)}</td>
                  <td className="px-3 py-2 text-right">{usd(r.scans?.p95_cost_usd)}</td>
                  <td className="px-3 py-2 text-right">{usd(r.scans?.cost_usd, 2)}</td>
                  <td className="px-3 py-2 text-right">{r.suggestions?.requests ?? 0}</td>
                  <td className="px-3 py-2 text-right">{usd(r.suggestions?.cost_usd, 2)}</td>
                </tr>
              ))}
              {byDay.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                    No AI calls recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Recent re-reads by the stronger model</h3>
        {fallbacks.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">None yet.</Card>
        ) : (
          fallbacks.map((f) => (
            <Card key={f.created_at} className="p-3 text-sm flex flex-wrap justify-between gap-2">
              <div>
                <div>{f.fallback_reason ?? "Re-read"}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(f.created_at).toLocaleString()} · {f.model}
                  {f.latency_ms ? ` · ${(f.latency_ms / 1000).toFixed(1)} s` : ""}
                </div>
                {!f.ok && f.error && <div className="text-xs text-destructive">Failed: {f.error}</div>}
              </div>
              <div className="font-medium">{usd(f.cost_usd)}</div>
            </Card>
          ))
        )}
      </section>
    </div>
  );
};

export default CostsPanel;
