-- Room in the rulebook for the full official annexes of the Cosmetics
-- Regulation, for both GB (legislation.gov.uk) and the EU/NI (the EU
-- consolidated text): Annex II (prohibited), III (restricted, including
-- fragrance allergens), IV (colourants), V (preservatives) and VI (UV
-- filters). The data itself is loaded by the next migration.

alter table public.substances
  drop constraint if exists substances_list_type_check,
  add constraint substances_list_type_check check (list_type in (
    'fragrance_allergen', 'prohibited', 'restricted', 'colourant', 'preservative', 'uv_filter')),
  -- Which official text the entry comes from; null for hand-entered rows.
  add column jurisdiction text check (jurisdiction in ('GB', 'EU')),
  -- e.g. 'III/70'
  add column annex_ref text,
  add column chemical_name text,
  -- Column wording as published, kept verbatim for the reviewer and the
  -- finding text.
  add column product_type text,
  add column max_concentration text,
  add column other_conditions text,
  add column label_warnings text,
  add column colour_index text[] not null default '{}',
  -- Names derived from the official ones (e.g. "X" from "X and its salts"),
  -- which only ever raise a "check this", never a fail.
  add column match_terms text[] not null default '{}',
  -- End of a transition period: products placed on the market before
  -- applies_from may still be sold until this date.
  add column sell_through_until date;

alter table public.substances
  drop constraint if exists substances_rulebook_version_id_list_type_inci_name_key;
create unique index substances_version_entry_key on public.substances
  (rulebook_version_id, list_type, coalesce(jurisdiction, ''), coalesce(annex_ref, ''), inci_name);

alter table public.rules
  drop constraint if exists rules_check_type_check,
  add constraint rules_check_type_check check (check_type in (
    'present', 'present_if_applicable', 'present_with_unit', 'address_in_market', 'date_or_pao',
    'ingredient_list', 'fragrance_allergens', 'prohibited_substances', 'restricted_substances',
    'colourants', 'advisory'));

-- Editing any of the new columns also voids a sign-off.
create or replace function public.substances_reset_verification_on_edit()
returns trigger
language plpgsql
as $$
begin
  if (new.list_type, new.inci_name, new.synonyms, new.cas_number, new.markets,
      new.leave_on_threshold_pct, new.rinse_off_threshold_pct, new.applies_from, new.sources,
      new.jurisdiction, new.annex_ref, new.chemical_name, new.product_type, new.max_concentration,
      new.other_conditions, new.label_warnings, new.colour_index, new.match_terms, new.sell_through_until)
     is distinct from
     (old.list_type, old.inci_name, old.synonyms, old.cas_number, old.markets,
      old.leave_on_threshold_pct, old.rinse_off_threshold_pct, old.applies_from, old.sources,
      old.jurisdiction, old.annex_ref, old.chemical_name, old.product_type, old.max_concentration,
      old.other_conditions, old.label_warnings, old.colour_index, old.match_terms, old.sell_through_until)
     and new.verification_status is not distinct from old.verification_status
  then
    new.verification_status := 'unverified';
    new.verified_by := null;
    new.verified_at := null;
    new.verification_note := 'Content edited after sign-off; needs re-verification.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.clone_rulebook_version(p_source_id uuid, p_new_version text)
returns uuid
language plpgsql
as $$
declare
  v_new_id uuid;
begin
  insert into public.rulebook_versions (scope, version, notes)
  select scope, p_new_version, 'Cloned from ' || version
  from public.rulebook_versions where id = p_source_id
  returning id into v_new_id;

  if v_new_id is null then
    raise exception 'Rulebook version % not found', p_source_id;
  end if;

  insert into public.rules (
    rulebook_version_id, rule_key, title, product_scope, markets, field, check_type, params,
    severity, explanation, fix_hint, sources, verification_status, verified_by, verified_at,
    verification_note)
  select v_new_id, rule_key, title, product_scope, markets, field, check_type, params,
    severity, explanation, fix_hint, sources, verification_status, verified_by, verified_at,
    verification_note
  from public.rules where rulebook_version_id = p_source_id;

  insert into public.substances (
    rulebook_version_id, list_type, inci_name, synonyms, cas_number, markets,
    leave_on_threshold_pct, rinse_off_threshold_pct, applies_from, sources,
    jurisdiction, annex_ref, chemical_name, product_type, max_concentration, other_conditions,
    label_warnings, colour_index, match_terms, sell_through_until,
    verification_status, verified_by, verified_at, verification_note)
  select v_new_id, list_type, inci_name, synonyms, cas_number, markets,
    leave_on_threshold_pct, rinse_off_threshold_pct, applies_from, sources,
    jurisdiction, annex_ref, chemical_name, product_type, max_concentration, other_conditions,
    label_warnings, colour_index, match_terms, sell_through_until,
    verification_status, verified_by, verified_at, verification_note
  from public.substances where rulebook_version_id = p_source_id;

  return v_new_id;
end;
$$;

revoke execute on function public.clone_rulebook_version(uuid, text) from public, anon, authenticated;

-- Brand alerts: a substance change only affects a saved label whose
-- ingredient list names that substance; rule changes affect every label
-- in the rule's markets. rulebook_version_changes now also returns the
-- names to look for.
drop function if exists public.rulebook_version_changes(uuid, uuid);

create function public.rulebook_version_changes(p_old uuid, p_new uuid)
returns table (key text, title text, change text, markets text[], terms text[])
language sql
stable
set search_path = public
as $$
  with o as (
    select * from public.rules where rulebook_version_id = p_old and verification_status <> 'rejected'
  ), n as (
    select * from public.rules where rulebook_version_id = p_new and verification_status <> 'rejected'
  ), os as (
    select * from public.substances where rulebook_version_id = p_old and verification_status <> 'rejected'
  ), ns as (
    select * from public.substances where rulebook_version_id = p_new and verification_status <> 'rejected'
  )
  select coalesce(n.rule_key, o.rule_key),
         coalesce(n.title, o.title),
         case when o.id is null then 'added' when n.id is null then 'removed' else 'changed' end,
         (select array_agg(distinct m order by m)
            from unnest(coalesce(n.markets, '{}') || coalesce(o.markets, '{}')) m),
         null::text[]
  from o full join n on n.rule_key = o.rule_key
  where o.id is null or n.id is null
     or (n.check_type, n.field, n.params, n.severity, n.markets)
        is distinct from (o.check_type, o.field, o.params, o.severity, o.markets)
  union all
  select 'substance:' || coalesce(ns.list_type, os.list_type) || ':'
           || coalesce(ns.jurisdiction, os.jurisdiction, '') || ':' || coalesce(ns.annex_ref, os.annex_ref, '')
           || ':' || coalesce(ns.inci_name, os.inci_name),
         coalesce(ns.inci_name, os.inci_name)
           || case coalesce(ns.list_type, os.list_type)
                when 'fragrance_allergen' then ' (fragrance allergen)'
                when 'prohibited' then ' (prohibited substance)'
                when 'restricted' then ' (restricted substance)'
                when 'colourant' then ' (colourant)'
                when 'preservative' then ' (preservative)'
                else ' (UV filter)' end,
         case when os.id is null then 'added' when ns.id is null then 'removed' else 'changed' end,
         (select array_agg(distinct m order by m)
            from unnest(coalesce(ns.markets, '{}') || coalesce(os.markets, '{}')) m),
         (select array_agg(distinct t) from unnest(
            array[coalesce(ns.inci_name, os.inci_name)]
            || coalesce(ns.synonyms, os.synonyms, '{}')
            || coalesce(ns.colour_index, os.colour_index, '{}')) t
          where length(t) >= 3)
  from os full join ns
    on ns.list_type = os.list_type and ns.inci_name = os.inci_name
   and ns.jurisdiction is not distinct from os.jurisdiction
   and ns.annex_ref is not distinct from os.annex_ref
  where os.id is null or ns.id is null
     or (ns.synonyms, ns.cas_number, ns.markets, ns.leave_on_threshold_pct, ns.rinse_off_threshold_pct,
         ns.applies_from, ns.product_type, ns.max_concentration, ns.other_conditions, ns.label_warnings,
         ns.colour_index, ns.match_terms, ns.sell_through_until)
        is distinct from
        (os.synonyms, os.cas_number, os.markets, os.leave_on_threshold_pct, os.rinse_off_threshold_pct,
         os.applies_from, os.product_type, os.max_concentration, os.other_conditions, os.label_warnings,
         os.colour_index, os.match_terms, os.sell_through_until);
$$;

revoke execute on function public.rulebook_version_changes(uuid, uuid) from public, anon, authenticated;

-- Whole-term, case-insensitive: "Citral" doesn't match "Citronellol",
-- and "Benzophenone" doesn't match "Benzophenone-3".
create or replace function public.ingredients_mention(p_ingredients text, p_terms text[])
returns boolean
language sql
immutable
as $$
  select exists (
    select 1 from unnest(p_terms) t
    where t is not null and length(t) >= 3
      and lower(coalesce(p_ingredients, '')) ~ (
        '(^|[^a-z0-9-])'
        || regexp_replace(lower(t), '([.*+?^${}()|\[\]\\])', '\\\1', 'g')
        || '($|[^a-z0-9-]|-(?![a-z0-9]))'));
$$;

create or replace function public.queue_brand_alerts(p_version_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new public.rulebook_versions;
  v_count integer;
begin
  select * into v_new from public.rulebook_versions where id = p_version_id;
  if not found or v_new.status <> 'published' then
    return 0;
  end if;

  insert into public.brand_alerts
    (label_id, email, contact_name, brand_name, product_name, from_version, to_version, changes, status)
  select g.id, e.email, e.name, g.brand_name, g.product_name,
         g.rulebook_version, v_new.scope || ' ' || v_new.version, c.changes,
         case when e.email is null then 'no_contact' else 'pending' end
  from public.generated_labels g
  join public.rulebook_versions old
    on old.scope = v_new.scope
   and old.scope || ' ' || old.version = g.rulebook_version
   and old.id <> v_new.id
  left join public.early_access_signups e on e.id = g.signup_id
  cross join lateral (
    select jsonb_agg(jsonb_build_object('key', x.key, 'title', x.title, 'change', x.change, 'markets', x.markets)
                     order by x.change, x.title) as changes
    from public.rulebook_version_changes(old.id, v_new.id) x
    where x.markets && coalesce(g.markets, array['GB'])
      and (x.terms is null or public.ingredients_mention(g.ingredients, x.terms))
  ) c
  where c.changes is not null
  on conflict (label_id, to_version) do nothing;

  get diagnostics v_count = row_count;

  update public.brand_alerts a
    set status = 'dismissed', last_error = 'Replaced by the alert for ' || v_new.scope || ' ' || v_new.version
  where a.status in ('pending', 'no_contact', 'failed')
    and a.to_version <> v_new.scope || ' ' || v_new.version
    and exists (select 1 from public.brand_alerts b
                where b.label_id = a.label_id and b.to_version = v_new.scope || ' ' || v_new.version);

  return v_count;
end;
$$;

revoke execute on function public.queue_brand_alerts(uuid) from public, anon, authenticated;

-- Watch the GB annexes the new data comes from (Annexes II and III are
-- already watched).
insert into public.source_watches (label, market, kind, fetch_url, source_prefix) values
  ('GB: Reg. 1223/2009 Annex IV (colourants)', 'GB', 'legislation_gov_uk',
   'https://www.legislation.gov.uk/eur/2009/1223/annex/IV/data.xml',
   'https://www.legislation.gov.uk/eur/2009/1223/annex/IV'),
  ('GB: Reg. 1223/2009 Annex V (preservatives)', 'GB', 'legislation_gov_uk',
   'https://www.legislation.gov.uk/eur/2009/1223/annex/V/data.xml',
   'https://www.legislation.gov.uk/eur/2009/1223/annex/V'),
  ('GB: Reg. 1223/2009 Annex VI (UV filters)', 'GB', 'legislation_gov_uk',
   'https://www.legislation.gov.uk/eur/2009/1223/annex/VI/data.xml',
   'https://www.legislation.gov.uk/eur/2009/1223/annex/VI')
on conflict (fetch_url) do nothing;
