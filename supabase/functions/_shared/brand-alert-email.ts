// Email a brand gets when a newly published rulebook version changes
// something that applies to one of their saved labels. Pure: shared by
// the send-brand-alerts edge function and vitest.

export interface BrandAlertChange {
  key: string;
  title: string;
  change: "added" | "changed" | "removed";
  markets: string[];
}

export interface BrandAlert {
  id: string;
  label_id: string;
  email: string | null;
  contact_name: string | null;
  brand_name: string | null;
  product_name: string | null;
  from_version: string;
  to_version: string;
  changes: BrandAlertChange[];
}

export interface BrandAlertEmail {
  subject: string;
  text: string;
  html: string;
}

const CHANGE_WORDS: Record<BrandAlertChange["change"], string> = {
  added: "New check",
  changed: "Updated check",
  removed: "Check withdrawn",
};

const MARKET_NAMES: Record<string, string> = {
  GB: "Great Britain",
  NI: "Northern Ireland",
  EU: "EU",
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const versionName = (v: string) => v.replace(/^cosmetics /, "");

const markets = (m: string[]) => m.map((x) => MARKET_NAMES[x] ?? x).join(", ");

export function brandAlertEmail(alert: BrandAlert, siteUrl: string): BrandAlertEmail {
  const site = siteUrl.replace(/\/+$/, "");
  const product = alert.product_name?.trim() || "your product";
  const greeting = alert.contact_name?.trim() ? `Hi ${alert.contact_name.trim().split(/\s+/)[0]},` : "Hi,";
  const labelUrl = `${site}/label/${alert.label_id}`;
  const checkUrl = `${site}/generate`;
  const from = versionName(alert.from_version);
  const to = versionName(alert.to_version);

  const lines = alert.changes.map((c) => `${CHANGE_WORDS[c.change]}: ${c.title} (${markets(c.markets)})`);

  const subject = `Labelling rule update affecting ${product}`;

  const text = [
    greeting,
    "",
    `The labelling rules Labelring checks cosmetics against have been updated (version ${from} to ${to}). ` +
      `Your saved label for ${product} was checked against version ${from}, and these changes apply to the markets it's for:`,
    "",
    ...lines.map((l) => `- ${l}`),
    "",
    `Your saved label: ${labelUrl}`,
    `Re-check it against the current rules: ${checkUrl}`,
    "",
    "This is an automated check, not legal advice. Your Responsible Person remains accountable for the label.",
    "",
    "You're getting this because you saved a label on Labelring. Reply to this email to stop these updates.",
    "",
    "Labelring",
  ].join("\n");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111">
<p>${escapeHtml(greeting)}</p>
<p>The labelling rules Labelring checks cosmetics against have been updated (version ${escapeHtml(from)} to ${escapeHtml(to)}).
Your saved label for <strong>${escapeHtml(product)}</strong> was checked against version ${escapeHtml(from)}, and these changes apply to the markets it's for:</p>
<ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>
<p><a href="${escapeHtml(labelUrl)}">View your saved label</a> &middot; <a href="${escapeHtml(checkUrl)}">Re-check it against the current rules</a></p>
<p style="font-size:13px;color:#555">This is an automated check, not legal advice. Your Responsible Person remains accountable for the label.</p>
<p style="font-size:13px;color:#555">You're getting this because you saved a label on Labelring. Reply to this email to stop these updates.</p>
</div>`;

  return { subject, text, html };
}
