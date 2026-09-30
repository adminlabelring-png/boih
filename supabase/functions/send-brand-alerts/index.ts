// Edge function: emails queued brand alerts (a newly published rulebook
// version changed something that applies to a brand's saved label).
// Admins only — called from the Brand alerts tab in /admin/leads.
//
// Sends through Resend. Settings (Edge Function secrets):
//   RESEND_API_KEY      required; without it nothing is sent
//   BRAND_ALERTS_FROM   sender, on a domain verified in Resend
//                       (default "Labelring <alerts@labelring.co.uk>")
//   BRAND_ALERTS_REPLY_TO  optional reply-to address
//   SITE_URL            links in the email (default https://www.labelring.co.uk)

import { createClient } from "npm:@supabase/supabase-js@2";
import { serviceClient } from "../_shared/quota.ts";
import { brandAlertEmail, type BrandAlert } from "../_shared/brand-alert-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MAX_PER_REQUEST = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authorization = req.headers.get("Authorization") ?? "";
    const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: userData } = await caller.auth.getUser();
    const { data: isAdmin } = await caller.rpc("is_admin");
    if (!userData?.user || isAdmin !== true) return json({ error: "Admins only" }, 403);

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      return json(
        {
          error: "Email sending isn't set up yet: add a RESEND_API_KEY Edge Function secret in Supabase.",
          notConfigured: true,
        },
        503
      );
    }

    const { ids } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((x) => typeof x === "string")) {
      return json({ error: "ids must be a non-empty array of alert ids" }, 400);
    }
    if (ids.length > MAX_PER_REQUEST) return json({ error: `At most ${MAX_PER_REQUEST} alerts at a time` }, 400);

    const db = serviceClient();
    const { data: alerts, error } = await db
      .from("brand_alerts")
      .select("id, label_id, email, contact_name, brand_name, product_name, from_version, to_version, changes")
      .in("id", ids)
      .in("status", ["pending", "failed"])
      .not("email", "is", null);
    if (error) throw error;

    const from = Deno.env.get("BRAND_ALERTS_FROM") || "Labelring <alerts@labelring.co.uk>";
    const replyTo = Deno.env.get("BRAND_ALERTS_REPLY_TO") || undefined;
    const siteUrl = Deno.env.get("SITE_URL") || "https://www.labelring.co.uk";
    const sentBy = userData.user.email ?? userData.user.id;

    const results: { id: string; status: "sent" | "failed"; error?: string }[] = [];
    for (const alert of (alerts ?? []) as BrandAlert[]) {
      const email = brandAlertEmail(alert, siteUrl);
      let failure: string | null = null;
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from,
            to: [alert.email],
            subject: email.subject,
            text: email.text,
            html: email.html,
            ...(replyTo ? { reply_to: replyTo } : {}),
          }),
        });
        if (!res.ok) failure = `Resend ${res.status}: ${(await res.text()).slice(0, 300)}`;
      } catch (e) {
        failure = e instanceof Error ? e.message : String(e);
      }

      await db
        .from("brand_alerts")
        .update(
          failure
            ? { status: "failed", last_error: failure }
            : { status: "sent", sent_at: new Date().toISOString(), sent_by: sentBy, last_error: null }
        )
        .eq("id", alert.id);
      results.push(failure ? { id: alert.id, status: "failed", error: failure } : { id: alert.id, status: "sent" });
    }

    return json({
      sent: results.filter((r) => r.status === "sent").length,
      failed: results.filter((r) => r.status === "failed").length,
      skipped: ids.length - results.length,
      results,
    });
  } catch (e) {
    console.error("send-brand-alerts error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
