import { supabase } from "@/integrations/supabase/client";
import type { LabelFields, Pack } from "./label-rules";
import { getSignupId } from "@/components/LeadCaptureDialog";
import type { Market, PackFormat, RuleFinding, RulebookStamp } from "./scan-context";

class GenerateLabelError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

// supabase-js only gives a generic "Edge Function returned a non-2xx status
// code" message on FunctionsHttpError; the real error text and status live
// on error.context (the underlying Response). Pull both out so callers can
// show what actually went wrong instead of a fallback string.
async function toGenerateLabelError(error: unknown): Promise<GenerateLabelError> {
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await ctx.clone().json();
      const message = typeof body?.error === "string" ? body.error : (error as Error).message;
      return new GenerateLabelError(message, ctx.status);
    } catch {
      // response body wasn't JSON; fall through to the generic message
    }
  }
  return new GenerateLabelError(error instanceof Error ? error.message : "Unknown error");
}

export async function suggestField(
  field: keyof LabelFields | "nutrition",
  fields: LabelFields,
  pack: Pack
): Promise<string> {
  const { data, error } = await supabase.functions.invoke("generate-label", {
    body: { mode: "field", field, fields, pack, signupId: getSignupId() },
  });
  if (error) throw await toGenerateLabelError(error);
  const value = (data as { value?: string })?.value;
  if (!value) throw new GenerateLabelError("No suggestion returned");
  return value;
}

export interface DraftCheck {
  findings: RuleFinding[];
  rulebook: RulebookStamp | null;
}

// Runs the label draft through the same versioned rulebook as scans.
export async function checkDraft(
  fields: LabelFields,
  markets: Market[],
  packFormat: PackFormat | null = null
): Promise<DraftCheck> {
  const { data, error } = await supabase.functions.invoke("check-label", {
    body: {
      category: fields.category,
      markets,
      pack: packFormat,
      draft: {
        productName: fields.productName,
        ingredients: fields.ingredients,
        responsiblePerson: fields.responsiblePerson,
        euResponsiblePerson: fields.euResponsiblePerson,
        countryOfOrigin: fields.countryOfOrigin,
        netQuantity: fields.netQuantity,
        batchNumber: fields.batchNumber,
        bestBefore: fields.bestBefore,
        dateType: fields.dateType,
        paoMonths: fields.paoMonths,
        instructionsForUse: fields.instructionsForUse,
        storageInstructions: fields.storageInstructions,
      },
    },
  });
  if (error) throw await toGenerateLabelError(error);
  const d = data as Partial<DraftCheck> | null;
  return { findings: Array.isArray(d?.findings) ? d.findings : [], rulebook: d?.rulebook ?? null };
}

export async function generatePreview(
  fields: LabelFields,
  pack: Pack
): Promise<string> {
  const { data, error } = await supabase.functions.invoke("generate-label", {
    body: { mode: "preview", fields, pack, signupId: getSignupId() },
  });
  if (error) throw await toGenerateLabelError(error);
  return (data as { preview?: string })?.preview ?? "";
}
