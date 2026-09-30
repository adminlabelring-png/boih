// Daily free-usage limits for the AI-backed edge functions (Deno only).
//
// A request is counted against every identity we can derive for it — an
// HMAC of the caller's IP and, when the lead-capture form was filled in, a
// hash of their email — and refused once any of them reaches the limit.
// Emails listed in QUOTA_EXEMPT_EMAILS (comma-separated) are never limited
// when signed in, so the team can test freely.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export type QuotaAction = "scan" | "generate";

export interface QuotaDecision {
  allowed: boolean;
  limit: number;
  keys: string[];
}

const encoder = new TextEncoder();

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(value))).slice(0, 32);
}

// Supabase sits behind Cloudflare, which sets cf-connecting-ip and
// overwrites any value the client sends. x-forwarded-for is not used: its
// first entry is whatever the client chose, so it would let anyone reset
// their limit with a made-up header.
const clientIp = (req: Request): string | null =>
  req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || null;

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function isExempt(db: SupabaseClient, req: Request): Promise<boolean> {
  const exempt = (Deno.env.get("QUOTA_EXEMPT_EMAILS") ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (exempt.length === 0) return false;

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token === Deno.env.get("SUPABASE_ANON_KEY")) return false;
  const { data } = await db.auth.getUser(token);
  const email = data.user?.email?.toLowerCase();
  return Boolean(email && exempt.includes(email));
}

// Counts one use of `action` for this caller. Fails open (allows the
// request) if the quota store itself errors, so an outage there never
// blocks the product; the error is logged.
export async function consumeQuota(
  req: Request,
  action: QuotaAction,
  limit: number,
  signupId: unknown
): Promise<QuotaDecision> {
  if (limit <= 0) return { allowed: true, limit, keys: [] };
  try {
    const db = serviceClient();
    if (await isExempt(db, req)) return { allowed: true, limit, keys: [] };

    const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const keys: string[] = [];
    const ip = clientIp(req);
    if (ip) keys.push(`ip:${await hmac(secret, ip)}`);

    if (typeof signupId === "string" && /^[0-9a-f-]{36}$/i.test(signupId)) {
      const { data } = await db.from("early_access_signups").select("email").eq("id", signupId).maybeSingle();
      const email = (data as { email?: string } | null)?.email?.trim().toLowerCase();
      if (email) keys.push(`email:${await hmac(secret, email)}`);
    }
    if (keys.length === 0) return { allowed: true, limit, keys };

    const { data, error } = await db.rpc("consume_quota", { p_action: action, p_keys: keys, p_limit: limit });
    if (error) throw error;
    return { allowed: data === true, limit, keys };
  } catch (e) {
    console.error("quota check failed (allowing request):", e);
    return { allowed: true, limit, keys: [] };
  }
}

export async function releaseQuota(action: QuotaAction, decision: QuotaDecision): Promise<void> {
  if (decision.keys.length === 0) return;
  try {
    await serviceClient().rpc("release_quota", { p_action: action, p_keys: decision.keys });
  } catch (e) {
    console.error("quota release failed:", e);
  }
}

export const dailyLimit = (envName: string, fallback: number): number => {
  const n = Number.parseInt(Deno.env.get(envName) ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
