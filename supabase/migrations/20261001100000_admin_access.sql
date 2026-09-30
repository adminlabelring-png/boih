-- Admin-only access to internal data.
--
-- Until now any signed-in user could read every scan, saved label, lead
-- click, uploaded scan image and the rulebook, and edit the Insights blog —
-- and anyone could create an account from /admin/leads or /insights. Being
-- signed in is no longer enough: the account must also be listed in
-- admin_users.
--
-- Add an admin (SQL editor, after they've created a login in
-- Authentication → Users):
--   insert into admin_users (user_id, email, added_by)
--   select id, email, 'Your name' from auth.users where email = 'person@example.com';

create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  added_by text,
  added_at timestamptz not null default now()
);

-- Managed from the SQL editor only: RLS on, no policies.
alter table public.admin_users enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- The accounts that exist today are the team's own.
insert into public.admin_users (user_id, email, added_by)
select id, email, 'admin_access migration' from auth.users where email is not null
on conflict (user_id) do nothing;

-- ------------------------------------------------------------------
-- Reads that were open to any signed-in user
-- ------------------------------------------------------------------

drop policy if exists "Authenticated users can view scans" on public.scans;
create policy "Admins can view scans"
  on public.scans for select to authenticated using ((select public.is_admin()));

drop policy if exists "Authenticated can view generated labels" on public.generated_labels;
create policy "Admins can view generated labels"
  on public.generated_labels for select to authenticated using ((select public.is_admin()));

drop policy if exists "Authenticated users can view clicks" on public.lead_clicks;
create policy "Admins can view clicks"
  on public.lead_clicks for select to authenticated using ((select public.is_admin()));

drop policy if exists "Authenticated users can view rulebook versions" on public.rulebook_versions;
create policy "Admins can view rulebook versions"
  on public.rulebook_versions for select to authenticated using ((select public.is_admin()));

drop policy if exists "Authenticated users can view rules" on public.rules;
create policy "Admins can view rules"
  on public.rules for select to authenticated using ((select public.is_admin()));

drop policy if exists "Authenticated users can view substances" on public.substances;
create policy "Admins can view substances"
  on public.substances for select to authenticated using ((select public.is_admin()));

drop policy if exists "Authenticated users can view rulebook audit log" on public.rulebook_audit_log;
create policy "Admins can view rulebook audit log"
  on public.rulebook_audit_log for select to authenticated using ((select public.is_admin()));

drop policy if exists "Authenticated users can view source watches" on public.source_watches;
create policy "Admins can view source watches"
  on public.source_watches for select to authenticated using ((select public.is_admin()));

drop policy if exists "Authenticated users can view source change alerts" on public.source_change_alerts;
create policy "Admins can view source change alerts"
  on public.source_change_alerts for select to authenticated using ((select public.is_admin()));

drop policy if exists "Authenticated users can view scan files" on storage.objects;
create policy "Admins can view scan files"
  on storage.objects for select to authenticated
  using (bucket_id = 'scans' and (select public.is_admin()));

-- Locked versions and change requests hold scanned label text; they were
-- readable by anyone, including signed-out visitors.
drop policy if exists "Anyone can read versions" on public.product_versions;
create policy "Admins can view versions"
  on public.product_versions for select to authenticated using ((select public.is_admin()));

drop policy if exists "Anyone can read change requests" on public.change_requests;
create policy "Admins can view change requests"
  on public.change_requests for select to authenticated using ((select public.is_admin()));

-- ------------------------------------------------------------------
-- Writes that were open to any signed-in user
-- ------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['brands', 'change_requests', 'product_versions', 'products', 'suppliers'] loop
    execute format('drop policy if exists "Authenticated can insert %1$s" on public.%1$I', t);
    execute format('drop policy if exists "Authenticated can update %1$s" on public.%1$I', t);
    execute format('create policy "Admins can insert %1$s" on public.%1$I for insert to authenticated with check ((select public.is_admin()))', t);
    execute format('create policy "Admins can update %1$s" on public.%1$I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
  end loop;
end
$$;
-- Older names for the same policies.
drop policy if exists "Authenticated can insert change requests" on public.change_requests;
drop policy if exists "Authenticated can update change requests" on public.change_requests;
drop policy if exists "Authenticated can insert versions" on public.product_versions;
drop policy if exists "Authenticated can update versions" on public.product_versions;

drop policy if exists "Signed-in users can view all posts" on public.insights;
drop policy if exists "Signed-in users can create posts" on public.insights;
drop policy if exists "Signed-in users can update posts" on public.insights;
drop policy if exists "Signed-in users can delete posts" on public.insights;
create policy "Admins can view all posts"
  on public.insights for select to authenticated using ((select public.is_admin()));
create policy "Admins can create posts"
  on public.insights for insert to authenticated with check ((select public.is_admin()));
create policy "Admins can update posts"
  on public.insights for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins can delete posts"
  on public.insights for delete to authenticated using ((select public.is_admin()));

drop policy if exists "Signed-in users can upload insight images" on storage.objects;
drop policy if exists "Signed-in users can update insight images" on storage.objects;
drop policy if exists "Signed-in users can delete insight images" on storage.objects;
create policy "Admins can upload insight images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'insight-images' and (select public.is_admin()));
create policy "Admins can update insight images"
  on storage.objects for update to authenticated
  using (bucket_id = 'insight-images' and (select public.is_admin()))
  with check (bucket_id = 'insight-images' and (select public.is_admin()));
create policy "Admins can delete insight images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'insight-images' and (select public.is_admin()));

-- ------------------------------------------------------------------
-- Shared label links (/label/<id>)
-- ------------------------------------------------------------------

-- A saved label is shared by its link; the id is a random UUID. This
-- returns that one label without the lead/contact columns, so visitors
-- never need read access to the table itself.
create or replace function public.get_public_label(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(g) - 'lead_id' - 'signup_id'
  from public.generated_labels g
  where g.id = p_id;
$$;

revoke execute on function public.get_public_label(uuid) from public;
grant execute on function public.get_public_label(uuid) to anon, authenticated;
