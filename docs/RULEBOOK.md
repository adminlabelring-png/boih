# Rulebook runbook

How to review, sign off, publish and change the cosmetics rulebook. Run these in the Supabase SQL editor; writes are service-role only, so they can't be made from the app.

The scanner (`analyze-label`) and the label builder (`check-label`) both check labels against the **published** version. If there isn't one, they use the **latest draft** and mark every result "Provisional: this rulebook version hasn't yet been reviewed and published by the Labelring team." Admins review and publish from **/admin/leads → Rulebook** (see below).

## Tables

| Table | What it holds |
| --- | --- |
| `rulebook_versions` | One row per version (`scope`, `version`, `status`: draft / published / retired). |
| `rules` | What each check does (`check_type`, `params`), who it applies to (`markets`), `severity` (legal / best_practice), the wording shown to users, and `sources` (the legal clause, per market). |
| `substances` | Lists the rules look up: `fragrance_allergen` and `prohibited`, with INCI name, synonyms, CAS number, markets and thresholds. |
| `rulebook_audit_log` | Append-only record of every entry created and every sign-off change. |

## Review and sign off

Admins do this in the app: **/admin/leads → Rulebook**. It lets you:

- **Sign off rules** one at a time, each linking to the clause it cites.
- **Sign off an official list** (e.g. GB Annex III), after comparing a random sample of its entries with the source. A note is required, and your account is recorded as the reviewer.
- **Look up an entry** by INCI name, chemical name or CAS number, and sign it off, reject it or reopen it.
- **Work the source-change alerts** from the weekly monitor.
- **Publish** the version once nothing is left to review.

The SQL below does the same from the Supabase SQL editor.

1. List what's waiting:

   ```sql
   select r.rule_key, r.title, r.markets, r.severity, r.explanation, r.sources
   from rules r join rulebook_versions v on v.id = r.rulebook_version_id
   where v.scope = 'cosmetics' and v.status = 'draft' and r.verification_status = 'unverified'
   order by r.rule_key;
   ```

2. Check each rule against the clause in `sources`. If it's right, sign it off (the reviewer's name is required):

   ```sql
   update rules
   set verification_status = 'verified', verified_by = 'Jane Smith (cosmetic safety assessor)',
       verified_at = now(), verification_note = 'Checked against Art. 19(1)(e), GB and EU text.'
   where rule_key = 'batch_code'
     and rulebook_version_id = (select id from rulebook_versions where scope = 'cosmetics' and version = '2026.1');
   ```

   To drop a rule instead, set `verification_status = 'rejected'` with a note. Rejected rules are never run.

   Do the same for `substances`.

3. Editing a rule's wording, parameters or sources resets its sign-off automatically, so a "verified" badge always refers to the text as it now stands.

## Publish

```sql
select publish_rulebook_version(
  (select id from rulebook_versions where scope = 'cosmetics' and version = '2026.1'),
  'Jane Smith'
);
```

This refuses to run while anything in the version is still unverified. Publishing retires the previously published version. Published and retired versions are frozen.

## Make changes after publishing

Clone the published version into a new draft, change the draft, sign off the changes, then publish it:

```sql
select clone_rulebook_version(
  (select id from rulebook_versions where scope = 'cosmetics' and version = '2026.1'),
  '2026.2'
);
```

Every scan stores the rulebook version it was checked against (`scans.rulebook_version`), so older results stay explainable.

## Official annex data (Annexes II–VI)

Since version 2026.2, the substance lists come straight from the official texts, not from hand entry:

| Jurisdiction | Source | What's loaded |
| --- | --- | --- |
| GB | legislation.gov.uk: Annexes II–VI of Regulation (EC) No 1223/2009 as it applies in Great Britain | 1,734 prohibited, 298 restricted, 25 fragrance allergens, 154 colourants, 54 preservatives, 33 UV filters |
| EU and NI | The EU Publications Office's consolidated text (currently version 02009R1223-20260518, which includes Regulation (EU) 2023/1545) | 1,737 prohibited, 291 restricted, 81 fragrance allergens, 154 colourants, 55 preservatives, 33 UV filters |

The annexes name substances chemically, while labels use INCI names. The link between the two comes from the Commission's CosIng database, which ties INCI names to annex entries (e.g. BUTYLPHENYL METHYLPROPIONAL → Annex II, entry 1666).

How matches are reported:

- **Prohibited (Annex II):** an official or CosIng name is a fail. It's a "check this" instead when the entry has an exception (e.g. petrolatum, "except if the full refining history is known…") or when the match is a derived name (e.g. "Arsenic" from "Arsenic and its compounds").
- **Restricted, preservatives, UV filters (Annexes III, V, VI):** the finding lists the product-type limits, maximum concentrations and any warnings that must be printed on the label. Concentrations aren't on labels, so these are always "check this".
- **Colourants (Annex IV):** a CI number that isn't on the permitted list is a fail. Colourants restricted by product type are "check this".
- **Fragrance allergens:** for the EU and NI, the 2023/1545 list has applied to products placed on the market from 1 August 2026. Products already on the market may be sold until 31 July 2028. GB hasn't adopted it.

### Refreshing the data

```sh
pip install beautifulsoup4
scripts/rulebook/fetch_sources.sh /tmp/rulebook-src                       # official texts + SHA-256 manifest
python3 scripts/rulebook/parse_annexes.py eu /tmp/rulebook-src/eu_consolidated.html supabase/rulebook-data/eu
python3 scripts/rulebook/parse_annexes.py gb /tmp/rulebook-src/gb supabase/rulebook-data/gb
cp /tmp/rulebook-src/sources.json supabase/rulebook-data/
python3 scripts/rulebook/fetch_cosing.py supabase/rulebook-data/cosing_links.json
python3 scripts/rulebook/build_migration.py 2026.3 2026.2 supabase/migrations/<timestamp>_rulebook_2026_3_official_annexes.sql
```

The parser stops if any entry is dropped for a reason other than "deleted in the source". Review the diff of `supabase/rulebook-data/` (it shows exactly which entries changed), then commit. The new version is a draft until an admin signs it off and publishes it.

## Label rules beyond the substance lists

| Rule | What it checks | Source |
| --- | --- | --- |
| `product_function` | The pack says what the product is for, unless that's obvious from how it's presented. | Art. 19(1)(f) |
| `eu_languages` | For each EU country chosen at intake, the pack has text in its language: German for Germany, French for France. This covers the function, precautions, date and nominal content; INCI names aren't translated. Add a country by adding it to the rule's `required` parameter and to the intake options. | Art. 19(5) |
| `claims` | Claims such as "free from", "hypoallergenic", "dermatologically tested", "natural/organic", "chemical-free", medicinal wording and "cruelty-free", each with specific advice. It's always a "check", never a fail. | Reg. (EU) No 655/2013, common criteria |
| Pack question | No nominal content needed under 5 g / 5 ml or on samples. Ingredients and precautions may go on a leaflet, tag or card when the pack shows the hand-in-book symbol. The batch number may go on the outer packaging only. | Art. 19(1)(b), 19(1)(e), 19(2) |

The scanner reports the function, claims, languages and symbols it sees on the pack. For drafts in the label builder, the languages are detected from the text the brand typed.

## Source monitoring

Every Monday, `pg_cron` checks the legal sources the rulebook cites (`source_watches`) and records any change in `source_change_alerts`, listing the rules and substances that cite that source. Nothing in the rulebook changes automatically.

- **GB (legislation.gov.uk):** a hash of the provision's own text (Articles 4 and 19, Annexes II and III), so edits elsewhere in the regulation don't trigger it.
- **EU:** EUR-Lex blocks automated requests, so the monitor asks the EU Publications Office for the latest consolidated version of Regulation (EC) 1223/2009 instead (e.g. `02009R1223-20260518`). A new consolidation means an amendment has been folded in; check what changed on EUR-Lex.

**What exactly changed:** every Monday at 07:30 UTC, the **Check official rulebook sources** GitHub workflow (`.github/workflows/rulebook-sources.yml`) downloads the GB and EU texts again, re-parses Annexes II–VI and refreshes the CosIng links. If any entry changed, it opens a draft PR that lists each added, removed or changed entry, field by field (e.g. "Annex V, entry 29, Phenoxyethanol: Maximum `1,0 %` → `0,8 %`"). The PR includes a new draft rulebook version; entries that didn't change keep their sign-off. Merge it, then review and publish in **/admin/leads → Rulebook**. Opening the PR needs *Settings → Actions → General → Allow GitHub Actions to create and approve pull requests*; without it, the workflow opens an issue pointing at the branch instead. You can also run it by hand from the Actions tab.

The first run only records a baseline. Check the queue and the last run:

```sql
select w.label, a.detected_at, a.previous_signal, a.new_signal, a.affected_rules
from source_change_alerts a join source_watches w on w.id = a.watch_id
where a.status = 'open' order by a.detected_at desc;

select label, last_checked_at, last_changed_at, last_error from source_watches order by label;
```

After reviewing a change (and, if needed, cloning the rulebook, editing the affected rules, re-verifying and publishing), close the alert:

```sql
update source_change_alerts
set status = 'reviewed', reviewed_by = 'Jane Smith', reviewed_at = now(),
    review_note = 'Annex III amendment adds entry 45; loaded into 2026.2.'
where id = '<alert id>';
```

Use `status = 'dismissed'` for changes that don't affect the rules, such as editorial corrections.

To add a source, insert a row into `source_watches` with its data URL and the `source_prefix` that rules use in `sources[].url`.

## Saved labels on an older rulebook, and brand alerts

Each saved cosmetics label records the rulebook version it was checked against (`generated_labels.rulebook_version`). To list the saved labels to re-check after publishing a new version:

```sql
select * from labels_on_superseded_rulebook order by created_at desc;
```

Publishing also queues **brand alerts** automatically (`brand_alerts`). A label gets an alert only when something that's checked changed for one of its markets: a rule or substance added, withdrawn, or with different parameters, markets, severity or thresholds. Wording-only edits don't count. A label saved without markets is treated as GB. The alert lists those changes, and the brand's email comes from the lead form (`early_access_signups`). Labels with no email on file show as "No email on file".

Nothing is emailed automatically. Admins review alerts in **/admin/leads → Brand alerts** and either:

- **Send** (one, or "Send all"), which emails through Resend via the `send-brand-alerts` edge function;
- **Write it myself**, which opens the same email in your mail app, then **Mark as sent**; or
- **Dismiss**.

If a label gets a newer alert before the older one is sent, the older one is dismissed automatically, because the newer one lists everything since the label was checked.

Sending by email needs these Edge Function secrets (Supabase → Edge Functions → Secrets):

| Secret | |
| --- | --- |
| `RESEND_API_KEY` | Required. Without it, "Send" says email isn't set up; "Write it myself" still works. |
| `BRAND_ALERTS_FROM` | Sender on a domain verified in Resend. Default `Labelring <alerts@labelring.co.uk>`. |
| `BRAND_ALERTS_REPLY_TO` | Optional reply-to address. |
| `SITE_URL` | Links in the email. Default `https://www.labelring.co.uk`. |

To see what changed between two versions, or to queue alerts again (it's safe to re-run; each label gets one alert per version):

```sql
select * from rulebook_version_changes(
  (select id from rulebook_versions where scope = 'cosmetics' and version = '2026.1'),
  (select id from rulebook_versions where scope = 'cosmetics' and version = '2026.2'));

select queue_brand_alerts((select id from rulebook_versions where scope = 'cosmetics' and version = '2026.2'));
```

## Admin access

Only accounts listed in `admin_users` can read scans, saved labels, leads data and the rulebook in the app, or edit Insights. Being signed in isn't enough. To add someone, first create their login in Supabase → Authentication → Users, then:

```sql
insert into admin_users (user_id, email, added_by)
select id, email, 'Your name' from auth.users where email = 'person@example.com';
```

To remove them: `delete from admin_users where email = 'person@example.com';`
