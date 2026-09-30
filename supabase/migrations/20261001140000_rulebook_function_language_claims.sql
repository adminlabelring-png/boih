-- More of Article 19/20 in the draft rulebook:
--   * product function (Art. 19(1)(f)),
--   * the language each EU country requires (Art. 19(5)): German for
--     Germany, French for France,
--   * marketing claims against the common criteria of Regulation (EU)
--     No 655/2013 (as retained in GB),
-- and the EU countries a product is sold in, saved with scans and labels.
-- The rules are added to the current draft, unverified; an admin signs
-- them off in /admin/leads -> Rulebook.

alter table public.scans add column if not exists eu_countries text[];
alter table public.generated_labels add column if not exists eu_countries text[];

alter table public.rules
  drop constraint if exists rules_check_type_check,
  add constraint rules_check_type_check check (check_type in (
    'present', 'present_if_applicable', 'present_with_unit', 'address_in_market', 'date_or_pao',
    'ingredient_list', 'fragrance_allergens', 'prohibited_substances', 'restricted_substances',
    'colourants', 'language', 'claims', 'advisory'));

insert into public.rules
  (rulebook_version_id, rule_key, title, markets, field, check_type, params, severity, explanation, fix_hint, sources)
select v.id, x.rule_key, x.title, x.markets, x.field, x.check_type, x.params, x.severity, x.explanation, x.fix_hint, x.sources
from public.rulebook_versions v
cross join (values
  ('product_function', 'Product function', array['GB', 'NI', 'EU'], 'Product Function', 'present_if_applicable',
   '{}'::jsonb, 'legal',
   'State what the product is for (e.g. "moisturising face cream"), unless that''s clear from how it''s presented.',
   'Add the product''s function to the pack, in the language of each country where it''s sold.',
   jsonb_build_array(
     jsonb_build_object('market', 'GB', 'title', 'Regulation (EC) No 1223/2009 as it applies in Great Britain', 'url', 'https://www.legislation.gov.uk/eur/2009/1223/article/19', 'clause', 'Art. 19(1)(f)'),
     jsonb_build_object('market', 'EU', 'title', 'Regulation (EC) No 1223/2009', 'url', 'https://eur-lex.europa.eu/eli/reg/2009/1223/oj', 'clause', 'Art. 19(1)(f)'),
     jsonb_build_object('market', 'NI', 'title', 'Regulation (EC) No 1223/2009', 'url', 'https://eur-lex.europa.eu/eli/reg/2009/1223/oj', 'clause', 'Art. 19(1)(f)'))),
  ('eu_languages', 'Language for each EU country', array['EU'], 'Label Languages', 'language',
   jsonb_build_object('required', jsonb_build_object(
     'DE', jsonb_build_object('language', 'de', 'name', 'German', 'country', 'Germany'),
     'FR', jsonb_build_object('language', 'fr', 'name', 'French', 'country', 'France'))),
   'legal',
   'Each EU country decides the language of the nominal content, date, precautions and function on the label: German in Germany, French in France. INCI names aren''t translated.',
   'Add the function, precautions, date wording and nominal content in each country''s language (a multilingual label is fine).',
   jsonb_build_array(
     jsonb_build_object('market', 'EU', 'title', 'Regulation (EC) No 1223/2009', 'url', 'https://eur-lex.europa.eu/eli/reg/2009/1223/oj', 'clause', 'Art. 19(5)'))),
  ('claims', 'Claims', array['GB', 'NI', 'EU'], 'Claims', 'claims',
   jsonb_build_object(
     'absent_ok', true,
     'absent_note', 'No claims found.',
     'patterns', jsonb_build_array(
       jsonb_build_object('match', '\b(?!cruelty\b|cruelty[- ])[a-z]+[- ]free\b|\bfree[- ]from\b[^;.,]*',
         'advice', '"Free from" claims must be accurate, mustn''t run down ingredients that are legally allowed, and aren''t allowed for ingredients that are banned anyway (e.g. "free from lead").'),
       jsonb_build_object('match', '\bhypo-?allergenic\b',
         'advice', 'Only if the product is designed to keep its allergenic potential to a minimum, with evidence to back it (e.g. no known allergens).'),
       jsonb_build_object('match', '\b(?:dermatologically|clinically|ophthalmologically)\s+(?:tested|proven|approved)\b|\bdermatologist[- ](?:tested|approved|recommended)\b',
         'advice', 'Keep the test evidence in the product information file; the claim must say no more than the test showed.'),
       jsonb_build_object('match', '\b(?:100\s?%\s*)?(?:natural|organic)\b',
         'advice', 'There''s no legal definition of natural or organic; make sure it''s accurate and supported (e.g. an ISO 16128 calculation or a certification).'),
       jsonb_build_object('match', '\b(?:chemical[- ]free|non[- ]?toxic|toxin[- ]free)\b',
         'advice', 'Misleading: every ingredient is a chemical and every cosmetic must be safe. Remove it.'),
       jsonb_build_object('match', '\b(?:cures?|treats?|heals?|eczema|psoriasis|dermatitis|antibacterial|antiseptic)\b',
         'advice', 'Treating or preventing a disease is a medicinal claim, which a cosmetic can''t make. Reword (e.g. "soothes dry skin").'),
       jsonb_build_object('match', '\b(?:cruelty[- ]free|not tested on animals)\b',
         'advice', 'Allowed if true for the product and its ingredients, but it mustn''t suggest others test on animals: testing cosmetics on animals is banned in GB and the EU.'))),
   'legal',
   'Claims must be truthful, supported by evidence, honest, fair and allow an informed decision (the common criteria).',
   'Reword or remove the claim, or keep the evidence for it in the product information file.',
   jsonb_build_array(
     jsonb_build_object('market', 'GB', 'title', 'Commission Regulation (EU) No 655/2013 as it applies in Great Britain', 'url', 'https://www.legislation.gov.uk/eur/2013/655/annex', 'clause', 'Annex (common criteria)'),
     jsonb_build_object('market', 'EU', 'title', 'Commission Regulation (EU) No 655/2013', 'url', 'https://eur-lex.europa.eu/eli/reg/2013/655/oj', 'clause', 'Annex (common criteria)'),
     jsonb_build_object('market', 'NI', 'title', 'Commission Regulation (EU) No 655/2013', 'url', 'https://eur-lex.europa.eu/eli/reg/2013/655/oj', 'clause', 'Annex (common criteria)')))
) as x(rule_key, title, markets, field, check_type, params, severity, explanation, fix_hint, sources)
where v.scope = 'cosmetics' and v.status = 'draft'
  and v.created_at = (select max(created_at) from public.rulebook_versions where scope = 'cosmetics' and status = 'draft')
on conflict (rulebook_version_id, rule_key) do nothing;
