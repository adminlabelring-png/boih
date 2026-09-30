import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Mail, RefreshCw } from "lucide-react";
import {
  brandAlertEmail,
  type BrandAlert,
} from "../../../supabase/functions/_shared/brand-alert-email";

type Status = "pending" | "no_contact" | "sent" | "failed" | "dismissed";

interface BrandAlertRow extends BrandAlert {
  status: Status;
  created_at: string;
  sent_at: string | null;
  sent_by: string | null;
  last_error: string | null;
}

const OPEN: Status[] = ["pending", "failed", "no_contact"];

const STATUS_LABEL: Record<Status, string> = {
  pending: "To send",
  failed: "Send failed",
  no_contact: "No email on file",
  sent: "Sent",
  dismissed: "Dismissed",
};

const CHANGE_LABEL = { added: "New", changed: "Updated", removed: "Withdrawn" } as const;

// Reads the error text out of a non-2xx edge function response.
const invokeError = async (error: unknown): Promise<string> => {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await ctx.json();
      if (body?.error) return body.error;
    } catch {
      /* fall through */
    }
  }
  return error instanceof Error ? error.message : "Request failed";
};

interface Props {
  adminEmail: string;
  onOpenCountChange?: (n: number) => void;
}

const BrandAlertsPanel = ({ adminEmail, onOpenCountChange }: Props) => {
  const [alerts, setAlerts] = useState<BrandAlertRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("brand_alerts" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    else setAlerts((data as unknown as BrandAlertRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const open = alerts.filter((a) => OPEN.includes(a.status));
  const closed = alerts.filter((a) => !OPEN.includes(a.status));
  const sendable = open.filter((a) => a.email && a.status !== "no_contact");

  useEffect(() => {
    onOpenCountChange?.(open.length);
  }, [open.length]);

  const send = async (ids: string[]) => {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-brand-alerts", { body: { ids } });
      if (error) throw new Error(await invokeError(error));
      const { sent = 0, failed = 0 } = (data ?? {}) as { sent?: number; failed?: number };
      if (failed) toast.error(`${sent} sent, ${failed} failed — see the alert for the reason.`);
      else toast.success(`${sent} alert${sent === 1 ? "" : "s"} sent`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send");
    } finally {
      setBusy(false);
      load();
    }
  };

  const setStatus = async (id: string, status: "sent" | "dismissed") => {
    const patch =
      status === "sent"
        ? { status, sent_at: new Date().toISOString(), sent_by: `${adminEmail} (sent by hand)`, last_error: null }
        : { status };
    const { error } = await supabase.from("brand_alerts" as any).update(patch as never).eq("id", id);
    if (error) toast.error(error.message);
    load();
  };

  const mailto = (a: BrandAlertRow) => {
    const email = brandAlertEmail(a, window.location.origin);
    return `mailto:${encodeURIComponent(a.email ?? "")}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.text)}`;
  };

  const renderAlert = (a: BrandAlertRow) => (
    <Card key={a.id} className="p-4 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium">
            {a.product_name || "Untitled label"}
            {a.brand_name && <span className="text-muted-foreground font-normal"> · {a.brand_name}</span>}
          </div>
          <div className="text-xs text-muted-foreground">
            {a.email ?? "No email on file"} · checked against {a.from_version}, now {a.to_version} ·{" "}
            {new Date(a.created_at).toLocaleDateString()}
          </div>
        </div>
        <Badge variant={a.status === "failed" ? "destructive" : a.status === "sent" ? "secondary" : "outline"}>
          {STATUS_LABEL[a.status]}
        </Badge>
      </div>
      <ul className="text-sm space-y-0.5">
        {a.changes.map((c) => (
          <li key={c.key}>
            <span className="text-muted-foreground">{CHANGE_LABEL[c.change]}:</span> {c.title}{" "}
            <span className="text-xs text-muted-foreground">({c.markets.join(", ")})</span>
          </li>
        ))}
      </ul>
      {a.last_error && <p className="text-xs text-muted-foreground">{a.last_error}</p>}
      {a.status === "sent" && a.sent_at && (
        <p className="text-xs text-muted-foreground">
          Sent {new Date(a.sent_at).toLocaleString()} by {a.sent_by}
        </p>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <a href={`/label/${a.label_id}`} target="_blank" rel="noreferrer">
          <Button size="sm" variant="ghost">View label</Button>
        </a>
        {OPEN.includes(a.status) && (
          <>
            {a.email && (
              <>
                <Button size="sm" onClick={() => send([a.id])} disabled={busy}>
                  <Mail className="h-3.5 w-3.5 mr-1.5" /> Send
                </Button>
                <a href={mailto(a)}>
                  <Button size="sm" variant="outline">Write it myself</Button>
                </a>
                <Button size="sm" variant="outline" onClick={() => setStatus(a.id, "sent")}>
                  Mark as sent
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => setStatus(a.id, "dismissed")}>
              Dismiss
            </Button>
          </>
        )}
      </div>
    </Card>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground max-w-2xl">
          When a new rulebook version is published, each saved label checked against an earlier version gets an alert
          here if a change applies to its markets. Nothing is emailed until you send it.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => send(sendable.slice(0, 50).map((a) => a.id))} disabled={busy || sendable.length === 0}>
            <Mail className="h-4 w-4 mr-1.5" /> Send all ({Math.min(sendable.length, 50)})
          </Button>
        </div>
      </div>

      {open.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No alerts waiting.</Card>
      ) : (
        open.map(renderAlert)
      )}

      {closed.length > 0 && (
        <div className="space-y-3">
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setShowClosed((v) => !v)}>
            {showClosed ? "Hide" : "Show"} sent and dismissed ({closed.length})
          </button>
          {showClosed && closed.map(renderAlert)}
        </div>
      )}
    </div>
  );
};

export default BrandAlertsPanel;
