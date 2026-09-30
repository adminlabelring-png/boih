-- 1. The pack question at intake (what the product is packed in), saved
--    with scans and labels and used by the Article 19 exemptions.
-- 2. Rulebook review for admins: sign off or reject rules and substances
--    (singly or a whole annex at a time), publish a version, and close
--    source-change alerts, from the app instead of the SQL editor. The
--    reviewer recorded is the signed-in admin.

alter table public.scans
  add column if not exists pack_format text
    check (pack_format in ('carton', 'container_only', 'small', 'sample', 'leaflet'));
alter table public.generated_labels
  add column if not exists pack_format text
    check (pack_format in ('carton', 'container_only', 'small', 'sample', 'leaflet'));

-- Article 19 exemptions, on the current draft (published versions are
-- frozen; the next clone carries these forward).
update public.rules r
  set params = r.params || jsonb_build_object(
        'not_required_for_pack', jsonb_build_array('small', 'sample'),
        'not_required_note', 'Not required on packs under 5 g or 5 ml, free samples or single-use packs (Art. 19(1)(b)).')
from public.rulebook_versions v
where v.id = r.rulebook_version_id and v.scope = 'cosmetics' and v.status = 'draft' and r.rule_key = 'nominal_content';

update public.rules r
  set params = r.params || jsonb_build_object(
        'leaflet_allowed_for_pack', jsonb_build_array('leaflet', 'small', 'sample'),
        'leaflet_note', 'Not on the pack. If it can''t fit, it may go on an enclosed leaflet, label, tape, tag or card, with the hand-in-book symbol on the pack (Art. 19(2)).')
from public.rulebook_versions v
where v.id = r.rulebook_version_id and v.scope = 'cosmetics' and v.status = 'draft'
  and r.rule_key in ('ingredient_list', 'precautions');

update public.rules r
  set params = r.params || jsonb_build_object(
        'leaflet_allowed_for_pack', jsonb_build_array('small', 'sample', 'leaflet'),
        'leaflet_note', 'Not on the container. When the container is too small, it may appear on the outer packaging only (Art. 19(1)(e)).')
from public.rulebook_versions v
where v.id = r.rulebook_version_id and v.scope = 'cosmetics' and v.status = 'draft' and r.rule_key = 'batch_code';

-- ------------------------------------------------------------------
-- Review
-- ------------------------------------------------------------------

-- Counts per version, list and sign-off status, for the review screen.
create or replace view public.rulebook_review_summary
with (security_invoker = true) as
select v.id as rulebook_version_id, v.scope, v.version, v.status as version_status,
       'rule' as kind, null::text as jurisdiction, null::text as list_type, null::text as annex,
       r.verification_status, count(*)::int as entries
from public.rulebook_versions v
join public.rules r on r.rulebook_version_id = v.id
group by v.id, r.verification_status
union all
select v.id, v.scope, v.version, v.status,
       'substance', s.jurisdiction, s.list_type, split_part(s.annex_ref, '/', 1),
       s.verification_status, count(*)::int
from public.rulebook_versions v
join public.substances s on s.rulebook_version_id = v.id
group by v.id, s.jurisdiction, s.list_type, split_part(s.annex_ref, '/', 1), s.verification_status;

create or replace function public.admin_reviewer()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  select email into v_email from public.admin_users where user_id = auth.uid();
  return v_email;
end;
$$;

revoke execute on function public.admin_reviewer() from public, anon, authenticated;

-- Sign off, reject or reopen rules. Only draft versions can change.
create or replace function public.admin_review_rules(p_ids uuid[], p_status text, p_note text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviewer text := public.admin_reviewer();
  v_count integer;
begin
  if p_status not in ('verified', 'rejected', 'unverified') then
    raise exception 'Unknown status %', p_status;
  end if;
  update public.rules r
    set verification_status = p_status,
        verified_by = case when p_status = 'unverified' then null else v_reviewer end,
        verified_at = case when p_status = 'unverified' then null else now() end,
        verification_note = nullif(trim(p_note), '')
  from public.rulebook_versions v
  where v.id = r.rulebook_version_id and v.status = 'draft'
    and r.id = any (p_ids) and r.verification_status is distinct from p_status;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Sign off, reject or reopen substances: the listed ids, or every entry
-- of one version matching jurisdiction / annex / list that currently has
-- p_from_status (e.g. all unverified GB Annex III entries).
create or replace function public.admin_review_substances(
  p_version_id uuid,
  p_status text,
  p_note text,
  p_ids uuid[] default null,
  p_jurisdiction text default null,
  p_annex text default null,
  p_list_type text default null,
  p_from_status text default 'unverified'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviewer text := public.admin_reviewer();
  v_count integer;
begin
  if p_status not in ('verified', 'rejected', 'unverified') then
    raise exception 'Unknown status %', p_status;
  end if;
  if p_ids is null and nullif(trim(p_note), '') is null then
    raise exception 'A note is required when reviewing entries in bulk';
  end if;
  update public.substances s
    set verification_status = p_status,
        verified_by = case when p_status = 'unverified' then null else v_reviewer end,
        verified_at = case when p_status = 'unverified' then null else now() end,
        verification_note = nullif(trim(p_note), '')
  from public.rulebook_versions v
  where v.id = s.rulebook_version_id and v.status = 'draft' and s.rulebook_version_id = p_version_id
    and s.verification_status is distinct from p_status
    and (p_ids is null or s.id = any (p_ids))
    and (p_ids is not null or s.verification_status = p_from_status)
    and (p_jurisdiction is null or s.jurisdiction is not distinct from nullif(p_jurisdiction, 'manual'))
    and (p_annex is null or split_part(s.annex_ref, '/', 1) = p_annex)
    and (p_list_type is null or s.list_type = p_list_type);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.admin_publish_rulebook(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.publish_rulebook_version(p_version_id, public.admin_reviewer());
end;
$$;

create or replace function public.admin_review_source_alert(p_id uuid, p_status text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviewer text := public.admin_reviewer();
begin
  if p_status not in ('reviewed', 'dismissed') then
    raise exception 'Unknown status %', p_status;
  end if;
  update public.source_change_alerts
    set status = p_status, reviewed_by = v_reviewer, reviewed_at = now(), review_note = nullif(trim(p_note), '')
  where id = p_id;
end;
$$;

revoke execute on function public.admin_review_rules(uuid[], text, text) from public, anon;
revoke execute on function public.admin_review_substances(uuid, text, text, uuid[], text, text, text, text) from public, anon;
revoke execute on function public.admin_publish_rulebook(uuid) from public, anon;
revoke execute on function public.admin_review_source_alert(uuid, text, text) from public, anon;
grant execute on function public.admin_review_rules(uuid[], text, text) to authenticated;
grant execute on function public.admin_review_substances(uuid, text, text, uuid[], text, text, text, text) to authenticated;
grant execute on function public.admin_publish_rulebook(uuid) to authenticated;
grant execute on function public.admin_review_source_alert(uuid, text, text) to authenticated;
