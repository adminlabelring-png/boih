-- Required label warnings, and the scan's leave-on / rinse-off answer.
--
-- * required_warnings: where an ingredient's annex entry sets out wording
--   for the label ("Contains sodium fluoride", "Rinse eyes immediately if
--   product comes into contact with them"), the label must carry it. The
--   check compares the wording with the label's warnings; wording that
--   depends on the product type or concentration is listed to check.
--   Added to the current draft, unverified: an admin signs it off in
--   /admin/leads -> Rulebook.
-- * scans.exposure: the brand's leave-on / rinse-off answer, which decides
--   the annexes' "rinse-off products only" conditions.

alter table public.scans add column if not exists exposure text;
alter table public.scans
  drop constraint if exists scans_exposure_check,
  add constraint scans_exposure_check check (exposure is null or exposure in ('leave_on', 'rinse_off'));

alter table public.rules
  drop constraint if exists rules_check_type_check,
  add constraint rules_check_type_check check (check_type in (
    'present', 'present_if_applicable', 'present_with_unit', 'address_in_market', 'date_or_pao',
    'ingredient_list', 'fragrance_allergens', 'prohibited_substances', 'restricted_substances',
    'colourants', 'language', 'claims', 'warning_text', 'required_warnings', 'advisory'));

insert into public.rules
  (rulebook_version_id, rule_key, title, markets, field, check_type, params, severity, explanation, fix_hint, sources)
select v.id, x.rule_key, x.title, x.markets, x.field, x.check_type, x.params, x.severity, x.explanation, x.fix_hint, x.sources
from public.rulebook_versions v
cross join (values
  ('required_warnings', 'Warnings required by the ingredients', array['GB', 'NI', 'EU'], 'Ingredients', 'required_warnings',
   jsonb_build_object('warnings_field', 'Warnings'),
   'legal',
   'Some ingredients may only be used with specific wording on the label, set out in the annexes (e.g. "Contains sodium fluoride").',
   'Add the wording the annex entry requires to the label''s warnings, in the language of each market.',
   jsonb_build_array(
     jsonb_build_object('market', 'GB', 'title', 'Regulation (EC) No 1223/2009 as it applies in Great Britain', 'url', 'https://www.legislation.gov.uk/eur/2009/1223/article/19', 'clause', 'Art. 19(1)(d); Annexes III-VI'),
     jsonb_build_object('market', 'NI', 'title', 'Regulation (EC) No 1223/2009', 'url', 'https://eur-lex.europa.eu/eli/reg/2009/1223/oj', 'clause', 'Art. 19(1)(d); Annexes III-VI'),
     jsonb_build_object('market', 'EU', 'title', 'Regulation (EC) No 1223/2009', 'url', 'https://eur-lex.europa.eu/eli/reg/2009/1223/oj', 'clause', 'Art. 19(1)(d); Annexes III-VI')))
) as x(rule_key, title, markets, field, check_type, params, severity, explanation, fix_hint, sources)
where v.scope = 'cosmetics' and v.status = 'draft'
  and v.created_at = (select max(created_at) from public.rulebook_versions where scope = 'cosmetics' and status = 'draft')
on conflict (rulebook_version_id, rule_key) do nothing;
