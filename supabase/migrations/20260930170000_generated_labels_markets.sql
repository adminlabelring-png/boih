-- A master cosmetics label can be checked against several markets and can
-- carry both a UK and an EU/Northern Ireland Responsible Person.
alter table public.generated_labels
  add column if not exists eu_responsible_person text,
  add column if not exists markets text[]
    check (markets is null or markets <@ array['GB', 'NI', 'EU']);

comment on column public.generated_labels.eu_responsible_person is
  'Responsible Person established in the EU or Northern Ireland, for labels sold there.';
comment on column public.generated_labels.markets is
  'Markets the label was checked against (GB, NI, EU); null for non-cosmetic packs.';
