-- Daily free-usage limits (e.g. 3 scans per email or IP per day).
--
-- The edge functions call consume_quota() before spending on an AI call
-- and release_quota() if that call then fails on the provider's side.
-- Keys are opaque strings built by the edge function (an HMAC of the IP,
-- a hash of the lead's email) — no raw IPs or emails are stored here.
--
-- Service role only: the table has RLS on with no policies, and the
-- functions are not executable by anon/authenticated.

create table public.usage_quota (
  action text not null,
  key text not null,
  day date not null default (now() at time zone 'utc')::date,
  count integer not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (action, key, day)
);

alter table public.usage_quota enable row level security;

-- Counts one use against every key, all-or-nothing: returns false (and
-- counts nothing) if any key has already reached p_limit today. Keys are
-- locked in a fixed order so concurrent requests can't both slip under
-- the limit.
create or replace function public.consume_quota(p_action text, p_keys text[], p_limit integer)
returns boolean
language plpgsql
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_key text;
  v_used integer;
begin
  if p_limit <= 0 or coalesce(cardinality(p_keys), 0) = 0 then
    return true;
  end if;

  for v_key in select distinct k from unnest(p_keys) as k where k is not null order by k loop
    perform pg_advisory_xact_lock(hashtextextended(p_action || ':' || v_key, 0));
  end loop;

  select coalesce(max(count), 0) into v_used
  from public.usage_quota
  where action = p_action and day = v_day and key = any (p_keys);

  if v_used >= p_limit then
    return false;
  end if;

  insert into public.usage_quota (action, key, day, count)
  select p_action, k, v_day, 1
  from (select distinct k from unnest(p_keys) as k where k is not null) keys
  on conflict (action, key, day)
  do update set count = public.usage_quota.count + 1, updated_at = now();

  return true;
end;
$$;

-- Gives back one use (e.g. the AI provider failed, so the person got
-- nothing for it).
create or replace function public.release_quota(p_action text, p_keys text[])
returns void
language sql
as $$
  update public.usage_quota
    set count = greatest(count - 1, 0), updated_at = now()
  where action = p_action
    and day = (now() at time zone 'utc')::date
    and key = any (p_keys);
$$;

revoke execute on function public.consume_quota(text, text[], integer) from public, anon, authenticated;
revoke execute on function public.release_quota(text, text[]) from public, anon, authenticated;

-- For usage stats and pruning old days.
create index usage_quota_day on public.usage_quota (day);
