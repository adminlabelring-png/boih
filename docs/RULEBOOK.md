# Rulebook runbook

How to review, sign off, publish and change the cosmetics rulebook. Run these in the Supabase SQL editor; writes are service-role only, so they can't be made from the app.

The scanner (`analyze-label`) and the label builder (`check-label`) both check labels against the **published** version. If there isn't one, they use the **latest draft** and mark every result "Provisional: these rules have not yet been signed off by a qualified reviewer."

## Tables

| Table | What it holds |
| --- | --- |
| `rulebook_versions` | One row per version (`scope`, `version`, `status`: draft / published / retired). |
| `rules` | What each check does (`check_type`, `params`), who it applies to (`markets`), `severity` (legal / best_practice), the wording shown to users, and `sources` (the legal clause, per market). |
| `substances` | Lists the rules look up: `fragrance_allergen` and `prohibited`, with INCI name, synonyms, CAS number, markets and thresholds. |
| `rulebook_audit_log` | Append-only record of every entry created and every sign-off change. |

## Review and sign off

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

## Loading the expanded EU fragrance allergen list (Regulation (EU) 2023/1545)

The seeded rulebook holds only the long-standing Annex III list, plus an advisory rule (`eu_allergens_2026`) telling EU exporters the expanded list isn't checked automatically yet. The expanded list must be transcribed from the official text on EUR-Lex (https://eur-lex.europa.eu/eli/reg/2023/1545/oj), not typed from memory. Load it into a **draft** version, one row per entry:

```sql
insert into substances
  (rulebook_version_id, list_type, inci_name, synonyms, cas_number, markets,
   leave_on_threshold_pct, rinse_off_threshold_pct, applies_from, sources)
values
  ((select id from rulebook_versions where scope = 'cosmetics' and version = '2026.2'),
   'fragrance_allergen',
   '<INCI name as printed in the Annex>',
   array['<other names on labels>'],
   '<CAS number>',
   array['EU', 'NI'],
   0.001, 0.01,
   '2026-07-31',
   jsonb_build_array(jsonb_build_object(
     'market', 'EU',
     'title', 'Commission Regulation (EU) 2023/1545',
     'url', 'https://eur-lex.europa.eu/eli/reg/2023/1545/oj',
     'clause', 'Annex, entry <n>')));
```

Once all entries are loaded and signed off, reject `eu_allergens_2026` in that draft (the `fragrance_allergens` check then covers the new names) and publish. Great Britain hasn't adopted the expanded list, so keep `markets` to `EU` and `NI` unless that changes.
