-- Brand alerts: when a new rulebook version is published, every saved
-- label that was checked against an earlier version, and is affected by
-- what changed, gets a queued alert to its brand.
--
-- Queued automatically on publish; sent by an admin from /admin/leads
-- (Brand alerts tab), through the send-brand-alerts edge function. An
-- alert only lists rule changes that apply to the label's markets.

create table public.brand_alerts (
  id uuid primary key default gen_random_uuid(),
  label_id uuid not null references public.generated_labels (id) on delete cascade,
  email text,
  contact_name text,
  brand_name text,
  product_name text,
  from_version text not null,
  to_version text not null,
  -- [{key, title, change: added|changed|removed, markets}]
  changes jsonb not null check (jsonb_typeof(changes) = 'array' and jsonb_array_length(changes) > 0),
  status text not null default 'pending'
    check (status in ('pending', 'no_contact', 'sent', 'failed', 'dismissed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_by text,
  last_error text,
  unique (label_id, to_version)
);

create index brand_alerts_open on public.brand_alerts (created_at desc)
  where status in ('pending', 'failed', 'no_contact');

alter table public.brand_alerts enable row level security;
create policy "Admins can view brand alerts"
  on public.brand_alerts for select to authenticated using ((select public.is_admin()));
create policy "Admins can update brand alerts"
  on public.brand_alerts for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- What changed between two rulebook versions, rule by rule and substance
-- by substance. Rejected entries count as absent. Wording-only edits
-- (title, explanation, fix hint, sources) aren't changes to what's checked.
create or replace function public.rulebook_version_changes(p_old uuid, p_new uuid)
returns table (key text, title text, change text, markets text[])
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
            from unnest(coalesce(n.markets, '{}') || coalesce(o.markets, '{}')) m)
  from o full join n on n.rule_key = o.rule_key
  where o.id is null or n.id is null
     or (n.check_type, n.field, n.params, n.severity, n.markets)
        is distinct from (o.check_type, o.field, o.params, o.severity, o.markets)
  union all
  select 'substance:' || coalesce(ns.list_type, os.list_type) || ':' || coalesce(ns.inci_name, os.inci_name),
         coalesce(ns.inci_name, os.inci_name)
           || case coalesce(ns.list_type, os.list_type)
                when 'fragrance_allergen' then ' (fragrance allergen)' else ' (prohibited substance)' end,
         case when os.id is null then 'added' when ns.id is null then 'removed' else 'changed' end,
         (select array_agg(distinct m order by m)
            from unnest(coalesce(ns.markets, '{}') || coalesce(os.markets, '{}')) m)
  from os full join ns on ns.list_type = os.list_type and ns.inci_name = os.inci_name
  where os.id is null or ns.id is null
     or (ns.synonyms, ns.cas_number, ns.markets, ns.leave_on_threshold_pct, ns.rinse_off_threshold_pct, ns.applies_from)
        is distinct from (os.synonyms, os.cas_number, os.markets, os.leave_on_threshold_pct, os.rinse_off_threshold_pct, os.applies_from);
$$;

-- Queues an alert for each saved label checked against an earlier
-- version of the same scope that one of the changes applies to (by
-- market; a label saved without markets is treated as GB). Returns how
-- many were queued. Safe to re-run: one alert per label per version.
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
  ) c
  where c.changes is not null
  on conflict (label_id, to_version) do nothing;

  get diagnostics v_count = row_count;

  -- The new alert lists everything since the label was checked, so an
  -- unsent alert for an earlier version is no longer needed.
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
revoke execute on function public.rulebook_version_changes(uuid, uuid) from public, anon, authenticated;

create or replace function public.rulebook_versions_queue_brand_alerts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.queue_brand_alerts(new.id);
  return null;
end;
$$;

revoke execute on function public.rulebook_versions_queue_brand_alerts() from public, anon, authenticated;

create trigger rulebook_versions_queue_brand_alerts
  after update of status on public.rulebook_versions
  for each row
  when (new.status = 'published' and old.status is distinct from 'published')
  execute function public.rulebook_versions_queue_brand_alerts();
