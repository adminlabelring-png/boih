-- Follow-up to 20261021100000: "Royle" (the botanist in Myroxylon's
-- citation) was in match_terms, not synonyms.

update public.substances
set match_terms = array(
  select t from unnest(match_terms) as t
  where lower(trim(t)) not in ('royle', 'leaf', 'leaf powder', 'leaf extract', 'extract')
)
where exists (
  select 1 from unnest(match_terms) as t
  where lower(trim(t)) in ('royle', 'leaf', 'leaf powder', 'leaf extract', 'extract')
);
