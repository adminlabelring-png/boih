# Missing Evidence and Questions (working notes, not for submission)

These notes support `technical-architecture-and-individual-contribution.md`. Please answer each item. Anything left unanswered must stay marked **[requires confirmation]** in the evidence document, or be removed.

## A. Discrepancies to resolve first

1. ~~**Product domain.**~~ **Resolved (11 Oct 2026):** you confirmed the product is Labelring, a cosmetics label-compliance tool, not a logistics/inventory product. Describe the company in the same terms throughout the rest of your application (personal statement, CV and recommendation letters), so it matches this document.
2. **"Developed from scratch."** The history begins with a Lovable template (`732c726`). Lovable's bot then wrote 151 commits (Mar–Jul 2026), including the initial MVP and the April 2026 pivot to the Label Scanner. I suggest wording such as "conceived, directed and built using AI-assisted development tools".
3. ~~**Who is `sub4568`?**~~ **Resolved (12 Oct 2026):** it is your former personal GitHub account, so PRs #1–#7 (March 2026) are your work, generated with OpenAI Codex. Assessors can't see the link between the two accounts, so include a screenshot of the `sub4568` profile or settings showing it is yours, or a one-line signed statement.

## B. Facts the repository cannot establish

4. Company legal name, incorporation date, your title and shareholding, and the co-founder's name and role.
5. What the co-founder and the "advisor" contributed (PR #53 refers to a "combined advisor and cofounder plan"). Who wrote that plan? Please supply it.
6. Users, scans performed, brands created, pilots, letters of intent, revenue, pricing plans. None of these is in the code. I did not query production user data. If you want usage figures, export aggregate counts yourself and keep personal data out.
7. Whether any qualified person (for example a cosmetic safety assessor) will sign off the rulebook, and when. Production currently shows 0 of 18 rules and 0 of 4,675 substances verified, and both versions are in draft.
8. Whether any brand alert has ever been sent. None can be queued until a version is published.
9. Any measured scan accuracy, for example on a test set of real packs, comparing the primary model with the fallback re-read. None is recorded in the repository.
10. AI cost per scan. The `ai_cost_daily` view exists. A screenshot of **/admin/leads → Costs** would be real evidence, if the data is genuine use.
11. Competitor or alternative products, and what they cannot do, to support Section 1's "alternatives" and Section 5's comparison.
12. Which frontend host currently serves production: Cloudflare Pages, Vercel or GitHub Pages. The README describes a migration that is still in progress.

## C. Evidence of your personal contribution (the most important gap)

GitHub contains **no human review comments**, and most PRs were merged within 1–2 minutes of opening. Your direction is visible only where PR descriptions quote your input (#34, #36, #51, #53, #66). To substantiate your architectural ownership, please collect:

13. **AI session transcripts or exports** (Claude Code sessions linked in the commit trailers, Lovable chat history, Codex tasks). Highlight prompts where you set the design, for example "the model must only read; rules decide", "use the official annexes", "require human sign-off", and where you rejected or corrected an AI proposal.
14. Your own notes, specifications, sketches or messages written *before* key PRs (#34, #53, #59, #62, #69).
15. Examples of debugging you did yourself: the hairspray test (PR #34), the Mentos multi-face test (PR #36), the stalled scan on a real device (PR #51), the Odoo credential issue (PR #33), and the failed first run of the rulebook workflow (PR #66).
16. Any code you wrote or edited by hand, if there is any. At present no commit shows hand-written code by you.
17. Confirmation that you personally set up and administer Supabase, OpenRouter, Resend, Odoo, Cloudflare/IONOS DNS and Vercel. Account-ownership screenshots, with any keys hidden, would support this.

## D. Artefacts to capture (screenshots and demos)

18. A scan of a single-side photo showing "More images needed" and "couldn't check" rather than "missing", then the same product with all sides showing a full result.
19. Rule findings with source-clause links and the "checked against rulebook vX (provisional)" stamp.
20. **/admin/leads → Rulebook** (review queue, sign-off, look-up) and **→ Brand alerts**.
21. The label builder: "Fix these" handoff, old-vs-new change review, market versions, and the print PDF with crop marks (open it in Acrobat to show the TrimBox and PDF/X-1a).
22. A terminal screenshot of `npm test` (14 files, 101 tests, passing) and the Supabase dashboard showing the five active edge functions.
23. A run of the weekly "Check official rulebook sources" GitHub Action (Actions tab).
24. A 2–3 minute screen-recorded demo of the end-to-end flow.

## E. What was verified during this analysis (11 Oct 2026)

- `npm ci && npm test`: 14 files, 101 tests, all passed. `npm run build`: passed, with 16 routes prerendered. ESLint gave no errors.
- Supabase production (read-only): `analyze-label` v67, `generate-label` v59, `check-label` v20, `send-brand-alerts` v14 and `sync-odoo-lead` v34 are all ACTIVE. The migration history matches the 37 repository migrations. The rulebook-status query returned counts only.
- Annex JSON counts in `supabase/rulebook-data/` match the figures in PR #62 and `docs/RULEBOOK.md`.
- No secrets are reproduced in either document. The repository's `.env` contains only the public Supabase URL, project ID and publishable key.
