-- Weekly monitor for the legal sources the rulebook cites.
--
-- Nothing changes automatically: when a source changes, a row lands in
-- source_change_alerts listing the rules that cite it, for a person to
-- review (and, if needed, clone the rulebook, edit, re-verify, publish).
--
-- Runs entirely in Postgres: pg_cron fires source_watch_request() weekly,
-- which queues an HTTP GET per source via pg_net; source_watch_collect()
-- runs 15 minutes later, reads the responses and compares a change signal:
--   * legislation.gov.uk — an md5 of the provision's own text (inside
--     <EURetained>, tags stripped), so edits elsewhere in the regulation
--     don't trigger it.
--   * EU (EUR-Lex blocks automated requests) — the latest consolidated
--     version of the regulation, from the EU Publications Office SPARQL
--     endpoint (e.g. 02009R1223-20260518).
-- The first successful check only records a baseline.

create table public.source_watches (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  market text not null check (market in ('GB', 'NI', 'EU')),
  kind text not null check (kind in ('legislation_gov_uk', 'eu_consolidated_version')),
  fetch_url text not null unique,
  -- Rules/substances whose sources[].url starts with this are affected.
  source_prefix text not null,
  last_signal text,
  last_checked_at timestamptz,
  last_changed_at timestamptz,
  last_error text,
  pending_request_id bigint,
  created_at timestamptz not null default now()
);

create table public.source_change_alerts (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid not null references public.source_watches (id) on delete cascade,
  detected_at timestamptz not null default now(),
  previous_signal text,
  new_signal text not null,
  affected_rules jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  check (status = 'open' or (reviewed_by is not null and reviewed_at is not null))
);

create index source_change_alerts_open on public.source_change_alerts (detected_at desc) where status = 'open';

alter table public.source_watches enable row level security;
alter table public.source_change_alerts enable row level security;
create policy "Authenticated users can view source watches"
  on public.source_watches for select to authenticated using (true);
create policy "Authenticated users can view source change alerts"
  on public.source_change_alerts for select to authenticated using (true);

-- The change signal for one fetched response; null if it can't be read.
create or replace function public.source_watch_signal(p_kind text, p_content text)
returns text
language plpgsql
immutable
as $$
declare
  v_body text;
begin
  if p_content is null or p_content = '' then
    return null;
  end if;

  if p_kind = 'legislation_gov_uk' then
    v_body := substring(p_content from '<EURetained[^>]*>(.*)</EURetained>');
    if v_body is null then
      return null;
    end if;
    v_body := regexp_replace(v_body, '<[^>]+>', ' ', 'g');
    v_body := btrim(regexp_replace(v_body, '\s+', ' ', 'g'));
    return 'text-md5:' || md5(v_body);
  end if;

  if p_kind = 'eu_consolidated_version' then
    begin
      return p_content::jsonb #>> '{results,bindings,0,celex,value}';
    exception when others then
      return null;
    end;
  end if;

  return null;
end;
$$;

create or replace function public.source_watch_request()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  w record;
begin
  for w in select * from public.source_watches loop
    update public.source_watches
      set pending_request_id = net.http_get(
            url := w.fetch_url,
            headers := jsonb_build_object(
              'Accept', case when w.kind = 'eu_consolidated_version'
                             then 'application/sparql-results+json' else 'application/xml' end,
              'User-Agent', 'Labelring rulebook monitor (+https://www.labelring.co.uk)'),
            timeout_milliseconds := 30000)
    where id = w.id;
  end loop;
end;
$$;

create or replace function public.source_watch_collect()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  w record;
  resp record;
  v_signal text;
  v_affected jsonb;
begin
  for w in select * from public.source_watches where pending_request_id is not null loop
    select status_code, content, timed_out, error_msg into resp
    from net._http_response where id = w.pending_request_id;

    if not found then
      continue; -- not back yet; the next run picks it up
    end if;

    if resp.status_code is distinct from 200 then
      update public.source_watches
        set pending_request_id = null, last_checked_at = now(),
            last_error = coalesce(resp.error_msg, case when resp.timed_out then 'timed out' end, 'HTTP ' || resp.status_code)
      where id = w.id;
      continue;
    end if;

    v_signal := public.source_watch_signal(w.kind, resp.content);
    if v_signal is null then
      update public.source_watches
        set pending_request_id = null, last_checked_at = now(), last_error = 'Response could not be read'
      where id = w.id;
      continue;
    end if;

    if w.last_signal is not null and w.last_signal <> v_signal then
      select coalesce(jsonb_agg(distinct x.rule_key), '[]'::jsonb) into v_affected
      from (
        select r.rule_key
        from public.rules r
        join public.rulebook_versions v on v.id = r.rulebook_version_id
        where v.status in ('draft', 'published')
          and exists (select 1 from jsonb_array_elements(r.sources) s where s->>'url' like w.source_prefix || '%')
        union
        select 'substance:' || s.inci_name
        from public.substances s
        join public.rulebook_versions v on v.id = s.rulebook_version_id
        where v.status in ('draft', 'published')
          and exists (select 1 from jsonb_array_elements(s.sources) src where src->>'url' like w.source_prefix || '%')
      ) x;

      insert into public.source_change_alerts (watch_id, previous_signal, new_signal, affected_rules)
      values (w.id, w.last_signal, v_signal, v_affected);
    end if;

    update public.source_watches
      set pending_request_id = null, last_checked_at = now(), last_error = null,
          last_changed_at = case when last_signal is distinct from v_signal and last_signal is not null
                                 then now() else last_changed_at end,
          last_signal = v_signal
    where id = w.id;
  end loop;
end;
$$;

revoke execute on function public.source_watch_request() from public, anon, authenticated;
revoke execute on function public.source_watch_collect() from public, anon, authenticated;

insert into public.source_watches (label, market, kind, fetch_url, source_prefix) values
  ('GB: Reg. 1223/2009 Article 19 (labelling)', 'GB', 'legislation_gov_uk',
   'https://www.legislation.gov.uk/eur/2009/1223/article/19/data.xml',
   'https://www.legislation.gov.uk/eur/2009/1223/article/19'),
  ('GB: Reg. 1223/2009 Article 4 (Responsible Person)', 'GB', 'legislation_gov_uk',
   'https://www.legislation.gov.uk/eur/2009/1223/article/4/data.xml',
   'https://www.legislation.gov.uk/eur/2009/1223/article/4'),
  ('GB: Reg. 1223/2009 Annex II (prohibited substances)', 'GB', 'legislation_gov_uk',
   'https://www.legislation.gov.uk/eur/2009/1223/annex/II/data.xml',
   'https://www.legislation.gov.uk/eur/2009/1223/annex/II'),
  ('GB: Reg. 1223/2009 Annex III (restricted substances, fragrance allergens)', 'GB', 'legislation_gov_uk',
   'https://www.legislation.gov.uk/eur/2009/1223/annex/III/data.xml',
   'https://www.legislation.gov.uk/eur/2009/1223/annex/III'),
  ('EU: Reg. (EC) 1223/2009 consolidated version', 'EU', 'eu_consolidated_version',
   'https://publications.europa.eu/webapi/rdf/sparql?query='
     || 'PREFIX%20cdm%3A%20%3Chttp%3A%2F%2Fpublications.europa.eu%2Fontology%2Fcdm%23%3E%20'
     || 'SELECT%20%3Fcelex%20WHERE%20%7B%20%3Fw%20cdm%3Aresource_legal_id_celex%20%3Fcelex%20.%20'
     || 'FILTER(STRSTARTS(STR(%3Fcelex)%2C%20%2202009R1223-%22))%20%7D%20'
     || 'ORDER%20BY%20DESC(%3Fcelex)%20LIMIT%201',
   'https://eur-lex.europa.eu/eli/reg/2009/1223');

-- Mondays: fetch at 06:05 UTC, compare at 06:20 UTC.
select cron.schedule('rulebook-source-request', '5 6 * * 1', 'select public.source_watch_request();');
select cron.schedule('rulebook-source-collect', '20 6 * * 1', 'select public.source_watch_collect();');

-- ------------------------------------------------------------------
-- Saved labels remember the rulebook version they were checked against,
-- so a newly published version shows which saved labels to re-check.
-- ------------------------------------------------------------------

alter table public.generated_labels
  add column if not exists rulebook_version text;

create or replace view public.labels_on_superseded_rulebook
with (security_invoker = true) as
select g.id, g.product_name, g.brand_name, g.created_at, g.rulebook_version,
       v.scope || ' ' || v.version as current_rulebook
from public.generated_labels g
join public.rulebook_versions v on v.status = 'published' and v.scope = 'cosmetics'
where g.rulebook_version is not null
  and g.rulebook_version <> v.scope || ' ' || v.version;

comment on view public.labels_on_superseded_rulebook is
  'Saved labels last checked against a rulebook version that has since been replaced by a newly published one.';
