// Records every AI call (Deno only): model, tokens, and the cost the
// provider reports, so the cost of a scan or a suggestion is measured
// rather than estimated. Recording never fails the request it describes.

import { serviceClient } from "./quota.ts";

export interface AIUsage {
  provider: "openrouter" | "gemini";
  // The model that actually answered (an alias like ~google/gemini-flash-
  // latest resolves to a dated model).
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  // USD, as reported by OpenRouter; null when the provider doesn't say.
  costUsd: number | null;
}

export interface AIResult {
  content: string;
  usage: AIUsage;
}

export interface UsageRecord {
  functionName: "analyze-label" | "generate-label";
  requestId: string;
  attempt: "primary" | "fallback";
  usage: AIUsage | null;
  // For a failed call: what was asked for, and why it failed.
  model?: string;
  provider?: string;
  fallbackReason?: string | null;
  error?: string | null;
  latencyMs: number;
}

export async function recordUsage(r: UsageRecord): Promise<void> {
  try {
    const { error } = await serviceClient().from("ai_usage").insert({
      function_name: r.functionName,
      request_id: r.requestId,
      attempt: r.attempt,
      provider: r.usage?.provider ?? r.provider ?? "unknown",
      model: r.usage?.model ?? r.model ?? "unknown",
      fallback_reason: r.fallbackReason ?? null,
      prompt_tokens: r.usage?.promptTokens ?? null,
      completion_tokens: r.usage?.completionTokens ?? null,
      cost_usd: r.usage?.costUsd ?? null,
      ok: !r.error,
      error: r.error ? r.error.slice(0, 500) : null,
      latency_ms: Math.round(r.latencyMs),
    });
    if (error) console.error("ai_usage insert failed:", error.message);
  } catch (e) {
    console.error("ai_usage insert failed:", e);
  }
}

// OpenRouter's chat completion response -> usage. With `usage: {include:
// true}` in the request, OpenRouter reports the cost of the call.
export function openRouterUsage(json: Record<string, unknown>, requestedModel: string): AIUsage {
  const usage = (json.usage ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    provider: "openrouter",
    model: typeof json.model === "string" && json.model ? json.model : requestedModel,
    promptTokens: num(usage.prompt_tokens),
    completionTokens: num(usage.completion_tokens),
    costUsd: num(usage.cost),
  };
}

export function geminiUsage(json: Record<string, unknown>, model: string): AIUsage {
  const meta = (json.usageMetadata ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    provider: "gemini",
    model,
    promptTokens: num(meta.promptTokenCount),
    completionTokens: num(meta.candidatesTokenCount),
    costUsd: null,
  };
}
