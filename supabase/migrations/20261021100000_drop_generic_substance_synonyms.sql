-- Annex import left plain words among some entries' other names, so any
-- label with "Leaf" or "Extract" in an ingredient (e.g. "Melaleuca
-- Alternifolia Leaf Oil") was matched to Indigofera tinctoria, a hair-dye
-- substance, and "Royle" (the botanist in the citation) to Myroxylon
-- balsamum. Drop those names; the entries' real names stay.

update public.substances
set synonyms = array(
  select s from unnest(synonyms) as s
  where lower(trim(s)) not in ('leaf', 'leaf powder', 'leaf extract', 'extract')
)
where inci_name = 'Indigofera tinctoria';

update public.substances
set synonyms = array(
  select s from unnest(synonyms) as s
  where lower(trim(s)) <> 'royle'
)
where inci_name ilike 'myroxylon balsamum%';
