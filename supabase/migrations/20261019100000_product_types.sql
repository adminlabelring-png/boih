-- Cosmetic product types (liquid/cream, solid/bar, eye area, lip/oral,
-- fragrance). The scan intake and the label builder ask for it (the
-- scanner reads it off the pack when it isn't given), and the rule engine
-- uses it to apply the annexes' own product-type conditions (e.g. "Not to
-- be used in eye products") and type-specific rules.
--
-- Saved with scans and labels; two type-specific rules are added to the
-- current draft, unverified: an admin signs them off in
-- /admin/leads -> Rulebook.

alter table public.scans add column if not exists product_type text;
alter table public.generated_labels add column if not exists product_type text;

alter table public.scans
  drop constraint if exists scans_product_type_check,
  add constraint scans_product_type_check check (
    product_type is null or product_type in ('liquid_cream', 'solid_bar', 'eye_area', 'lip_oral', 'fragrance'));
alter table public.generated_labels
  drop constraint if exists generated_labels_product_type_check,
  add constraint generated_labels_product_type_check check (
    product_type is null or product_type in ('liquid_cream', 'solid_bar', 'eye_area', 'lip_oral', 'fragrance'));

alter table public.rules
  drop constraint if exists rules_check_type_check,
  add constraint rules_check_type_check check (check_type in (
    'present', 'present_if_applicable', 'present_with_unit', 'address_in_market', 'date_or_pao',
    'ingredient_list', 'fragrance_allergens', 'prohibited_substances', 'restricted_substances',
    'colourants', 'language', 'claims', 'warning_text', 'advisory'));

insert into public.rules
  (rulebook_version_id, rule_key, title, markets, field, check_type, params, severity, explanation, fix_hint, sources)
select v.id, x.rule_key, x.title, x.markets, x.field, x.check_type, x.params, x.severity, x.explanation, x.fix_hint, x.sources
from public.rulebook_versions v
cross join (values
  ('solid_bar_not_food', 'Solid bar not mistaken for food', array['GB', 'NI', 'EU'], 'Warnings', 'warning_text',
   jsonb_build_object(
     'product_types', jsonb_build_array('solid_bar'),
     'patterns', jsonb_build_array('do not eat', 'not edible', 'inedible', 'not for (human )?consumption', 'do not swallow', 'not food')),
   'best_practice',
   'A soap or shampoo bar that could be mistaken for food (its shape, colour, smell or packaging look like a sweet, cake or fruit) mustn''t be sold. No "Not edible" wording found: if the bar could be mistaken for food, change its look; a warning helps but doesn''t make a food look-alike allowed.',
   'Make sure the bar can''t be mistaken for food, and consider adding "Not edible" to the pack.',
   jsonb_build_array(
     jsonb_build_object('market', 'GB', 'title', 'Food Imitations (Safety) Regulations 1989', 'url', 'https://www.legislation.gov.uk/uksi/1989/1291/contents', 'clause', 'Reg. 2'),
     jsonb_build_object('market', 'NI', 'title', 'Council Directive 87/357/EEC (products which appear to be other than they are)', 'url', 'https://eur-lex.europa.eu/eli/dir/1987/357/oj', 'clause', 'Art. 1'),
     jsonb_build_object('market', 'EU', 'title', 'Council Directive 87/357/EEC (products which appear to be other than they are)', 'url', 'https://eur-lex.europa.eu/eli/dir/1987/357/oj', 'clause', 'Art. 1'))),
  ('eye_area_precautions', 'Eye product precautions', array['GB', 'NI', 'EU'], 'Warnings', 'warning_text',
   jsonb_build_object(
     'product_types', jsonb_build_array('eye_area'),
     'patterns', jsonb_build_array('irritat', 'discontinue', 'stop us', 'do not share', 'contact lens')),
   'best_practice',
   'Eye products usually carry precautions such as "Discontinue use if irritation occurs" and "Do not share". None found. Your safety assessor decides which precautions your formula needs.',
   'Add the precautions your safety assessment calls for, e.g. "Discontinue use if irritation occurs. Do not share."',
   jsonb_build_array(
     jsonb_build_object('market', 'GB', 'title', 'Regulation (EC) No 1223/2009 as it applies in Great Britain', 'url', 'https://www.legislation.gov.uk/eur/2009/1223/article/19', 'clause', 'Art. 19(1)(d)'),
     jsonb_build_object('market', 'NI', 'title', 'Regulation (EC) No 1223/2009', 'url', 'https://eur-lex.europa.eu/eli/reg/2009/1223/oj', 'clause', 'Art. 19(1)(d)'),
     jsonb_build_object('market', 'EU', 'title', 'Regulation (EC) No 1223/2009', 'url', 'https://eur-lex.europa.eu/eli/reg/2009/1223/oj', 'clause', 'Art. 19(1)(d)')))
) as x(rule_key, title, markets, field, check_type, params, severity, explanation, fix_hint, sources)
where v.scope = 'cosmetics' and v.status = 'draft'
  and v.created_at = (select max(created_at) from public.rulebook_versions where scope = 'cosmetics' and status = 'draft')
on conflict (rulebook_version_id, rule_key) do nothing;
