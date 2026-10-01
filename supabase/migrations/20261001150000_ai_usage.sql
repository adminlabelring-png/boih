-- What each AI call cost: one row per call to the model provider, from
-- the scanner (analyze-label, including re-reads with the stronger
-- fallback model) and label suggestions (generate-label). Cost is what
-- OpenRouter reports for the call, in USD.

create table public.ai_usage (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  function_name text not null check (function_name in ('analyze-label', 'generate-label')),
  -- One scan or suggestion; a scan re-read by the fallback model has two
  -- rows with the same request_id.
  request_id uuid not null,
  attempt text not null check (attempt in ('primary', 'fallback')),
  provider text not null,
  model text not null,
  fallback_reason text,
  prompt_tokens integer,
  completion_tokens integer,
  cost_usd numeric(12, 6),
  ok boolean not null default true,
  error text,
  latency_ms integer
);

create index ai_usage_created_at on public.ai_usage (created_at desc);
create index ai_usage_request_id on public.ai_usage (request_id);

alter table public.ai_usage enable row level security;
create policy "Admins can view AI usage"
  on public.ai_usage for select to authenticated using ((select public.is_admin()));

-- The scan a request belongs to (the frontend saves it with the scan).
alter table public.scans add column if not exists ai_request_id uuid;

-- Per day and function: requests, how many needed the fallback, cost.
create or replace view public.ai_cost_daily
with (security_invoker = true) as
with requests as (
  select (min(created_at) at time zone 'utc')::date as day,
         function_name,
         request_id,
         bool_or(attempt = 'fallback') as used_fallback,
         bool_and(cost_usd is not null) as fully_costed,
         sum(cost_usd) as cost_usd,
         bool_or(ok) as ok
  from public.ai_usage
  group by function_name, request_id
)
select day,
       function_name,
       count(*)::int as requests,
       count(*) filter (where used_fallback)::int as fallbacks,
       count(*) filter (where not ok)::int as failed,
       coalesce(sum(cost_usd), 0)::numeric(12, 6) as cost_usd,
       (sum(cost_usd) / nullif(count(*) filter (where fully_costed), 0))::numeric(12, 6) as avg_cost_usd,
       (percentile_cont(0.95) within group (order by cost_usd))::numeric(12, 6) as p95_cost_usd
from requests
group by day, function_name;
