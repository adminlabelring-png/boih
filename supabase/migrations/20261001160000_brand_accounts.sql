-- Brand accounts and versioned labels.
--
-- Anyone can create an account (email + password), create a brand and
-- save labels to it. Each save of a label is a new version that records
-- what changed since the previous one; earlier versions stay readable. A
-- saved label can also start a new product's label (a template).
--
-- Members see only their own brands; admins see every brand. Writes go
-- through the functions below, which check membership.

-- ------------------------------------------------------------------
-- Brands and members
-- ------------------------------------------------------------------

alter table public.brands add column if not exists created_by uuid references auth.users (id) on delete set null;

create table public.brand_members (
  brand_id uuid not null references public.brands (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (brand_id, user_id)
);
create index brand_members_user_id on public.brand_members (user_id);
alter table public.brand_members enable row level security;

create or replace function public.is_brand_member(p_brand uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.brand_members where brand_id = p_brand and user_id = auth.uid());
$$;

create or replace function public.is_brand_owner(p_brand uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.brand_members where brand_id = p_brand and user_id = auth.uid() and role = 'owner'
  );
$$;

revoke execute on function public.is_brand_member(uuid) from public, anon;
revoke execute on function public.is_brand_owner(uuid) from public, anon;
grant execute on function public.is_brand_member(uuid) to authenticated;
grant execute on function public.is_brand_owner(uuid) to authenticated;

create policy "Members can see their brand's members"
  on public.brand_members for select to authenticated
  using (public.is_brand_member(brand_id) or (select public.is_admin()));

-- Brands, products and suppliers were readable by anyone. Now: the brand's
-- members and admins.
drop policy if exists "Anyone can read brands" on public.brands;
create policy "Members and admins can read brands"
  on public.brands for select to authenticated
  using (public.is_brand_member(id) or (select public.is_admin()));
create policy "Owners can update their brand"
  on public.brands for update to authenticated
  using (public.is_brand_owner(id)) with check (public.is_brand_owner(id));
-- From the app, only these columns change; anon writes nothing.
revoke insert, update on public.brands from anon;
revoke update on public.brands from authenticated;
grant update (name, default_market, logo_url) on public.brands to authenticated;

drop policy if exists "Anyone can read products" on public.products;
create policy "Members and admins can read products"
  on public.products for select to authenticated
  using (public.is_brand_member(brand_id) or (select public.is_admin()));

drop policy if exists "Anyone can read suppliers" on public.suppliers;
create policy "Members and admins can read suppliers"
  on public.suppliers for select to authenticated
  using (public.is_brand_member(brand_id) or (select public.is_admin()));

-- A signed-in person creates a brand and becomes its owner.
create or replace function public.create_brand(p_name text, p_default_market text default 'UK')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_slug text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to create a brand' using errcode = '28000';
  end if;
  if length(v_name) < 1 or length(v_name) > 120 then
    raise exception 'Brand name must be 1 to 120 characters' using errcode = '22023';
  end if;
  if coalesce(p_default_market, 'UK') not in ('UK', 'EU', 'UK+EU') then
    raise exception 'Unknown market' using errcode = '22023';
  end if;
  if (select count(*) from public.brand_members where user_id = v_uid and role = 'owner') >= 5 then
    raise exception 'You can own up to 5 brands' using errcode = '54000';
  end if;

  v_slug := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
  v_slug := coalesce(nullif(left(v_slug, 60), ''), 'brand') || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6);

  insert into public.brands (name, slug, vertical, default_market, created_by)
  values (v_name, v_slug, 'skincare', coalesce(p_default_market, 'UK'), v_uid)
  returning id into v_id;
  insert into public.brand_members (brand_id, user_id, role) values (v_id, v_uid, 'owner');
  return v_id;
end;
$$;

revoke execute on function public.create_brand(text, text) from public, anon;
grant execute on function public.create_brand(text, text) to authenticated;

-- Members of a brand with their sign-in email (auth.users isn't readable
-- from the app).
create or replace function public.brand_member_list(p_brand uuid)
returns table (user_id uuid, email text, role text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, u.email::text, m.role, m.created_at
  from public.brand_members m
  join auth.users u on u.id = m.user_id
  where m.brand_id = p_brand
    and (public.is_brand_member(p_brand) or public.is_admin())
  order by m.created_at;
$$;

revoke execute on function public.brand_member_list(uuid) from public, anon;
grant execute on function public.brand_member_list(uuid) to authenticated;

-- ------------------------------------------------------------------
-- Versioned labels
-- ------------------------------------------------------------------

create table public.brand_labels (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  product_name text not null default '',
  category text,
  current_version integer not null default 0,
  -- Checks passed (%) in the current version.
  compliance_score integer,
  -- The saved label this one was started from, if any.
  template_of uuid references public.brand_labels (id) on delete set null,
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index brand_labels_brand_id on public.brand_labels (brand_id, updated_at desc);

create table public.brand_label_versions (
  id uuid primary key default gen_random_uuid(),
  label_id uuid not null references public.brand_labels (id) on delete cascade,
  version integer not null,
  -- The label builder's state: { fields, markets, pack, countries }.
  data jsonb not null,
  compliance_score integer check (compliance_score between 0 and 100),
  rulebook_version text,
  -- What changed since the previous version: [{ field, from, to }].
  changes jsonb not null default '[]'::jsonb,
  note text check (note is null or length(note) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  unique (label_id, version)
);

alter table public.brand_labels enable row level security;
alter table public.brand_label_versions enable row level security;

create policy "Members and admins can read labels"
  on public.brand_labels for select to authenticated
  using (public.is_brand_member(brand_id) or (select public.is_admin()));

create policy "Members and admins can read label versions"
  on public.brand_label_versions for select to authenticated
  using (exists (
    select 1 from public.brand_labels l
    where l.id = label_id and (public.is_brand_member(l.brand_id) or (select public.is_admin()))
  ));

-- Save a label: a new label (version 1) when p_label is null, otherwise the
-- next version of p_label. Refuses a save that changes nothing.
create or replace function public.save_brand_label(
  p_brand uuid,
  p_label uuid,
  p_data jsonb,
  p_score integer default null,
  p_rulebook_version text default null,
  p_note text default null,
  p_template uuid default null
)
returns table (label_id uuid, version integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_brand uuid;
  v_label uuid := p_label;
  v_version integer;
  v_prev jsonb;
  v_changes jsonb := '[]'::jsonb;
  v_name text;
begin
  if v_uid is null then
    raise exception 'Sign in to save labels' using errcode = '28000';
  end if;
  if jsonb_typeof(p_data) is distinct from 'object' or jsonb_typeof(p_data -> 'fields') is distinct from 'object' then
    raise exception 'Label data must include fields' using errcode = '22023';
  end if;
  if octet_length(p_data::text) > 200000 then
    raise exception 'Label is too large to save' using errcode = '54000';
  end if;
  if p_note is not null and length(p_note) > 1000 then
    raise exception 'Note must be at most 1000 characters' using errcode = '22023';
  end if;

  v_name := left(coalesce(p_data -> 'fields' ->> 'productName', ''), 512);

  if v_label is null then
    v_brand := p_brand;
    if v_brand is null or not public.is_brand_member(v_brand) then
      raise exception 'Not a member of this brand' using errcode = '42501';
    end if;
    if p_template is not null and not exists (
      select 1 from public.brand_labels where id = p_template and brand_id = v_brand
    ) then
      raise exception 'Template is not one of this brand''s labels' using errcode = '22023';
    end if;
    insert into public.brand_labels (brand_id, product_name, category, template_of, created_by)
    values (v_brand, v_name, nullif(p_data -> 'fields' ->> 'category', ''), p_template, v_uid)
    returning id into v_label;
    v_version := 1;
  else
    select l.brand_id, l.current_version into v_brand, v_version
    from public.brand_labels l where l.id = v_label
    for update;
    if v_brand is null or not public.is_brand_member(v_brand) then
      raise exception 'Not a member of this brand' using errcode = '42501';
    end if;

    select v.data into v_prev from public.brand_label_versions v
    where v.label_id = v_label and v.version = v_version;

    select coalesce(
             jsonb_agg(jsonb_build_object('field', k.key, 'from', v_prev #> k.path, 'to', p_data #> k.path)
                       order by k.grp, k.key),
             '[]'::jsonb)
    into v_changes
    from (
      select distinct s.grp, s.key,
             case when s.grp = 'fields' then array['fields', s.key] else array[s.key] end as path
      from (
        select 'fields' as grp, jsonb_object_keys(coalesce(v_prev -> 'fields', '{}'::jsonb)) as key
        union all select 'fields', jsonb_object_keys(p_data -> 'fields')
        union all select 'label', jsonb_object_keys(coalesce(v_prev, '{}'::jsonb) - 'fields')
        union all select 'label', jsonb_object_keys(p_data - 'fields')
      ) s
    ) k
    where (v_prev #> k.path) is distinct from (p_data #> k.path);

    if v_prev is not null and v_changes = '[]'::jsonb then
      raise exception 'Nothing changed since version %', v_version using errcode = '22023';
    end if;
    v_version := v_version + 1;
  end if;

  insert into public.brand_label_versions
    (label_id, version, data, compliance_score, rulebook_version, changes, note, created_by, created_by_email)
  values
    (v_label, v_version, p_data, p_score, left(p_rulebook_version, 64), v_changes,
     nullif(btrim(coalesce(p_note, '')), ''), v_uid, auth.jwt() ->> 'email');

  update public.brand_labels
  set current_version = v_version,
      compliance_score = p_score,
      product_name = v_name,
      category = nullif(p_data -> 'fields' ->> 'category', ''),
      updated_at = now()
  where id = v_label;

  return query select v_label, v_version;
end;
$$;

revoke execute on function public.save_brand_label(uuid, uuid, jsonb, integer, text, text, uuid) from public, anon;
grant execute on function public.save_brand_label(uuid, uuid, jsonb, integer, text, text, uuid) to authenticated;

create or replace function public.set_brand_label_archived(p_label uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand uuid;
begin
  select brand_id into v_brand from public.brand_labels where id = p_label;
  if v_brand is null or not public.is_brand_member(v_brand) then
    raise exception 'Not a member of this brand' using errcode = '42501';
  end if;
  update public.brand_labels
  set archived_at = case when p_archived then now() else null end
  where id = p_label;
end;
$$;

revoke execute on function public.set_brand_label_archived(uuid, boolean) from public, anon;
grant execute on function public.set_brand_label_archived(uuid, boolean) to authenticated;

-- Read-only from the app; every write goes through the functions above.
revoke all on public.brand_members, public.brand_labels, public.brand_label_versions from anon, authenticated;
grant select on public.brand_members, public.brand_labels, public.brand_label_versions to authenticated;
