-- Versioned cosmetics rulebook.
--
-- Replaces "the model decides what's compliant" with rules held as data:
-- every rule and restricted substance belongs to a rulebook version, links
-- to the legal clause it comes from, and carries its own human sign-off.
-- The analyze-label edge function loads the current version and runs the
-- deterministic checks in supabase/functions/_shared/rule-engine.ts against
-- the fields the vision model read off the pack.
--
-- Guarantees enforced here rather than by convention:
--   * A version can only be published once every rule and substance in it
--     is verified (or explicitly rejected) — publish_rulebook_version().
--   * Published and retired versions are immutable; changes go into a new
--     draft made with clone_rulebook_version().
--   * Editing a rule's content resets its sign-off, so a verified badge
--     always refers to the text as it now stands.
--   * Every sign-off change is appended to rulebook_audit_log.
--
-- Writes are service-role only (SQL editor / migrations / edge functions);
-- signed-in admins can read.

create table public.rulebook_versions (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('cosmetics')),
  version text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  notes text,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  published_by text,
  unique (scope, version),
  check (status = 'draft' or (published_at is not null and published_by is not null))
);

-- At most one live version per scope.
create unique index rulebook_versions_one_published
  on public.rulebook_versions (scope) where status = 'published';

-- sources: [{ "market": "GB"|"NI"|"EU", "title": text, "url": text, "clause": text }]
create table public.rules (
  id uuid primary key default gen_random_uuid(),
  rulebook_version_id uuid not null references public.rulebook_versions (id) on delete cascade,
  rule_key text not null,
  title text not null,
  product_scope text not null default 'cosmetic' check (product_scope in ('cosmetic')),
  markets text[] not null check (cardinality(markets) > 0 and markets <@ array['GB', 'NI', 'EU']),
  field text,
  check_type text not null check (check_type in (
    'present',
    'present_if_applicable',
    'present_with_unit',
    'address_in_market',
    'date_or_pao',
    'ingredient_list',
    'fragrance_allergens',
    'prohibited_substances',
    'advisory'
  )),
  params jsonb not null default '{}'::jsonb,
  severity text not null check (severity in ('legal', 'best_practice')),
  explanation text not null,
  fix_hint text,
  sources jsonb not null check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) > 0),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'verified', 'rejected')),
  verified_by text,
  verified_at timestamptz,
  verification_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rulebook_version_id, rule_key),
  check (verification_status <> 'verified' or (verified_by is not null and verified_at is not null))
);

create table public.substances (
  id uuid primary key default gen_random_uuid(),
  rulebook_version_id uuid not null references public.rulebook_versions (id) on delete cascade,
  list_type text not null check (list_type in ('fragrance_allergen', 'prohibited')),
  inci_name text not null,
  synonyms text[] not null default '{}',
  cas_number text,
  markets text[] not null check (cardinality(markets) > 0 and markets <@ array['GB', 'NI', 'EU']),
  leave_on_threshold_pct numeric,
  rinse_off_threshold_pct numeric,
  applies_from date,
  sources jsonb not null check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) > 0),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'verified', 'rejected')),
  verified_by text,
  verified_at timestamptz,
  verification_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rulebook_version_id, list_type, inci_name),
  check (verification_status <> 'verified' or (verified_by is not null and verified_at is not null))
);

create index rules_rulebook_version_id on public.rules (rulebook_version_id);
create index substances_rulebook_version_id on public.substances (rulebook_version_id);

create table public.rulebook_audit_log (
  id bigserial primary key,
  table_name text not null,
  record_id uuid,
  rulebook_version_id uuid,
  action text not null,
  old_status text,
  new_status text,
  actor text,
  note text,
  created_at timestamptz not null default now()
);

create index rulebook_audit_log_version on public.rulebook_audit_log (rulebook_version_id, created_at);

-- ------------------------------------------------------------------
-- Triggers
-- ------------------------------------------------------------------

-- Published/retired versions are frozen.
create or replace function public.rulebook_guard_frozen_version()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.rulebook_versions
  where id = coalesce(new.rulebook_version_id, old.rulebook_version_id);

  if v_status in ('published', 'retired') then
    raise exception 'Rulebook version is %; clone it into a new draft to make changes', v_status;
  end if;

  return coalesce(new, old);
end;
$$;

-- Any change to what a rule says or checks voids its sign-off.
create or replace function public.rules_reset_verification_on_edit()
returns trigger
language plpgsql
as $$
begin
  if (new.rule_key, new.title, new.product_scope, new.markets, new.field, new.check_type,
      new.params, new.severity, new.explanation, new.fix_hint, new.sources)
     is distinct from
     (old.rule_key, old.title, old.product_scope, old.markets, old.field, old.check_type,
      old.params, old.severity, old.explanation, old.fix_hint, old.sources)
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

create or replace function public.substances_reset_verification_on_edit()
returns trigger
language plpgsql
as $$
begin
  if (new.list_type, new.inci_name, new.synonyms, new.cas_number, new.markets,
      new.leave_on_threshold_pct, new.rinse_off_threshold_pct, new.applies_from, new.sources)
     is distinct from
     (old.list_type, old.inci_name, old.synonyms, old.cas_number, old.markets,
      old.leave_on_threshold_pct, old.rinse_off_threshold_pct, old.applies_from, old.sources)
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

create or replace function public.rulebook_log_verification()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.verification_status is distinct from old.verification_status then
    insert into public.rulebook_audit_log
      (table_name, record_id, rulebook_version_id, action, old_status, new_status, actor, note)
    values (
      tg_table_name,
      new.id,
      new.rulebook_version_id,
      case when tg_op = 'INSERT' then 'created' else 'verification_changed' end,
      case when tg_op = 'INSERT' then null else old.verification_status end,
      new.verification_status,
      new.verified_by,
      new.verification_note
    );
  end if;
  return new;
end;
$$;

create trigger rules_guard_frozen
  before insert or update or delete on public.rules
  for each row execute function public.rulebook_guard_frozen_version();
create trigger rules_reset_verification
  before update on public.rules
  for each row execute function public.rules_reset_verification_on_edit();
create trigger rules_log_verification
  after insert or update on public.rules
  for each row execute function public.rulebook_log_verification();

create trigger substances_guard_frozen
  before insert or update or delete on public.substances
  for each row execute function public.rulebook_guard_frozen_version();
create trigger substances_reset_verification
  before update on public.substances
  for each row execute function public.substances_reset_verification_on_edit();
create trigger substances_log_verification
  after insert or update on public.substances
  for each row execute function public.rulebook_log_verification();

-- ------------------------------------------------------------------
-- Lifecycle functions (service role only)
-- ------------------------------------------------------------------

create or replace function public.publish_rulebook_version(p_version_id uuid, p_published_by text)
returns void
language plpgsql
as $$
declare
  v_scope text;
  v_status text;
  v_unverified int;
begin
  if coalesce(trim(p_published_by), '') = '' then
    raise exception 'published_by is required';
  end if;

  select scope, status into v_scope, v_status
  from public.rulebook_versions where id = p_version_id for update;
  if v_scope is null then
    raise exception 'Rulebook version % not found', p_version_id;
  end if;
  if v_status <> 'draft' then
    raise exception 'Only draft versions can be published (this one is %)', v_status;
  end if;

  select
    (select count(*) from public.rules
      where rulebook_version_id = p_version_id and verification_status = 'unverified')
    + (select count(*) from public.substances
      where rulebook_version_id = p_version_id and verification_status = 'unverified')
  into v_unverified;
  if v_unverified > 0 then
    raise exception '% rule(s)/substance(s) in this version are still unverified', v_unverified;
  end if;

  update public.rulebook_versions
    set status = 'retired'
  where scope = v_scope and status = 'published';

  update public.rulebook_versions
    set status = 'published', published_at = now(), published_by = p_published_by
  where id = p_version_id;

  insert into public.rulebook_audit_log (table_name, record_id, rulebook_version_id, action, new_status, actor)
  values ('rulebook_versions', p_version_id, p_version_id, 'published', 'published', p_published_by);
end;
$$;

-- Copies a version (rules + substances, sign-offs included — the content
-- is identical) into a new draft for the next round of changes.
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
    verification_status, verified_by, verified_at, verification_note)
  select v_new_id, list_type, inci_name, synonyms, cas_number, markets,
    leave_on_threshold_pct, rinse_off_threshold_pct, applies_from, sources,
    verification_status, verified_by, verified_at, verification_note
  from public.substances where rulebook_version_id = p_source_id;

  return v_new_id;
end;
$$;

revoke execute on function public.publish_rulebook_version(uuid, text) from public, anon, authenticated;
revoke execute on function public.clone_rulebook_version(uuid, text) from public, anon, authenticated;

-- ------------------------------------------------------------------
-- RLS: admins (signed in) can read; nobody writes through the API.
-- ------------------------------------------------------------------

alter table public.rulebook_versions enable row level security;
alter table public.rules enable row level security;
alter table public.substances enable row level security;
alter table public.rulebook_audit_log enable row level security;

create policy "Authenticated users can view rulebook versions"
  on public.rulebook_versions for select to authenticated using (true);
create policy "Authenticated users can view rules"
  on public.rules for select to authenticated using (true);
create policy "Authenticated users can view substances"
  on public.substances for select to authenticated using (true);
create policy "Authenticated users can view rulebook audit log"
  on public.rulebook_audit_log for select to authenticated using (true);

-- ------------------------------------------------------------------
-- Stamp each scan with the rulebook version it was checked against.
-- ------------------------------------------------------------------

alter table public.scans
  add column if not exists rulebook_version text,
  add column if not exists rule_findings jsonb;

comment on column public.scans.rulebook_version is
  'Rulebook version (e.g. "cosmetics 2026.1") the rule_findings were produced with; null when no rulebook applied.';
comment on column public.scans.rule_findings is
  'Deterministic rule results for this scan: [{ruleKey, title, severity, status, reason, fix, markets, sources, verified}].';

-- ------------------------------------------------------------------
-- Seed: cosmetics 2026.1 (draft)
--
-- Every row starts unverified. Nothing here has been reviewed by a
-- qualified person yet; the app labels results from a draft rulebook as
-- provisional until publish_rulebook_version() succeeds.
-- ------------------------------------------------------------------

do $$
declare
  v uuid;
  gb_19 constant text := 'https://www.legislation.gov.uk/eur/2009/1223/article/19';
  gb_4 constant text := 'https://www.legislation.gov.uk/eur/2009/1223/article/4';
  gb_annex_ii constant text := 'https://www.legislation.gov.uk/eur/2009/1223/annex/II';
  gb_annex_iii constant text := 'https://www.legislation.gov.uk/eur/2009/1223/annex/III';
  eu_reg constant text := 'https://eur-lex.europa.eu/eli/reg/2009/1223/oj';
  gb_title constant text := 'Regulation (EC) No 1223/2009 as it applies in Great Britain';
  eu_title constant text := 'Regulation (EC) No 1223/2009 on cosmetic products';
begin
  insert into public.rulebook_versions (scope, version, notes)
  values (
    'cosmetics',
    '2026.1',
    'Initial cosmetics rulebook, seeded from the checks previously hard-coded in the app. '
    || 'All entries unverified pending sign-off by a qualified reviewer.'
  )
  returning id into v;

  insert into public.rules
    (rulebook_version_id, rule_key, title, markets, field, check_type, params, severity,
     explanation, fix_hint, sources)
  values
  (v, 'rp_address_gb', 'UK Responsible Person name and address', array['GB'],
   'Manufacturer / Responsible Person', 'address_in_market', '{"market": "GB"}', 'legal',
   'Cosmetics sold in Great Britain must show the name and address of a Responsible Person established in the UK.',
   'Add the UK Responsible Person''s name and full UK address, including postcode.',
   jsonb_build_array(
     jsonb_build_object('market', 'GB', 'title', gb_title, 'url', gb_19, 'clause', 'Art. 19(1)(a)'),
     jsonb_build_object('market', 'GB', 'title', gb_title, 'url', gb_4, 'clause', 'Art. 4'))),

  (v, 'rp_address_eu', 'EU Responsible Person name and address', array['EU'],
   'Manufacturer / Responsible Person', 'address_in_market', '{"market": "EU"}', 'legal',
   'Cosmetics sold in the EU must show the name and address of a Responsible Person established in the EU.',
   'Add the EU Responsible Person''s name and full address in an EU member state.',
   jsonb_build_array(
     jsonb_build_object('market', 'EU', 'title', eu_title, 'url', eu_reg, 'clause', 'Art. 4 and Art. 19(1)(a)'))),

  (v, 'rp_address_ni', 'Responsible Person for Northern Ireland', array['NI'],
   'Manufacturer / Responsible Person', 'address_in_market', '{"market": "NI"}', 'legal',
   'Northern Ireland follows the EU Cosmetics Regulation under the Windsor Framework: the Responsible Person must be established in Northern Ireland or the EU.',
   'Add a Responsible Person address in Northern Ireland or an EU member state.',
   jsonb_build_array(
     jsonb_build_object('market', 'NI', 'title', eu_title || ' (applies in Northern Ireland under the Windsor Framework)', 'url', eu_reg, 'clause', 'Art. 4 and Art. 19(1)(a)'))),

  (v, 'country_of_origin', 'Country of origin (imported products)', array['GB', 'NI', 'EU'],
   'Country of Origin', 'present', '{"required_when": "imported"}', 'legal',
   'Imported cosmetic products must state their country of origin.',
   'Add the country of origin, e.g. "Made in France".',
   jsonb_build_array(
     jsonb_build_object('market', 'GB', 'title', gb_title, 'url', gb_19, 'clause', 'Art. 19(1)(a)'),
     jsonb_build_object('market', 'EU', 'title', eu_title, 'url', eu_reg, 'clause', 'Art. 19(1)(a)'))),

  (v, 'nominal_content', 'Nominal content (weight or volume)', array['GB', 'NI', 'EU'],
   'Net Quantity', 'present_with_unit', '{}', 'legal',
   'The nominal content must be given by weight or volume, except for packs under 5 g / 5 ml, free samples and single-application packs.',
   'Add the nominal content in g or ml, e.g. "50 ml".',
   jsonb_build_array(
     jsonb_build_object('market', 'GB', 'title', gb_title, 'url', gb_19, 'clause', 'Art. 19(1)(b)'),
     jsonb_build_object('market', 'EU', 'title', eu_title, 'url', eu_reg, 'clause', 'Art. 19(1)(b)'))),

  (v, 'date_marking', 'Date of minimum durability or PAO', array['GB', 'NI', 'EU'],
   'Expiry / Best Before', 'date_or_pao', '{}', 'legal',
   'Products with a minimum durability of 30 months or less need a "best used before" date (or the hourglass symbol). Longer-lasting products need a period-after-opening (PAO) symbol, e.g. 12M.',
   'Add a best-before date, or a PAO symbol such as "12M" if shelf life exceeds 30 months.',
   jsonb_build_array(
     jsonb_build_object('market', 'GB', 'title', gb_title, 'url', gb_19, 'clause', 'Art. 19(1)(c)'),
     jsonb_build_object('market', 'EU', 'title', eu_title, 'url', eu_reg, 'clause', 'Art. 19(1)(c)'))),

  (v, 'precautions', 'Precautions and warnings', array['GB', 'NI', 'EU'],
   'Warnings', 'present_if_applicable', '{}', 'legal',
   'Particular precautions required by the Annex III–VI conditions for the ingredients used, and any special precautions for professional products, must appear on the label.',
   'Check your safety assessment for required warnings (e.g. "Avoid contact with eyes") and add them.',
   jsonb_build_array(
     jsonb_build_object('market', 'GB', 'title', gb_title, 'url', gb_19, 'clause', 'Art. 19(1)(d)'),
     jsonb_build_object('market', 'EU', 'title', eu_title, 'url', eu_reg, 'clause', 'Art. 19(1)(d)'))),

  (v, 'batch_code', 'Batch number or reference', array['GB', 'NI', 'EU'],
   'Batch / Lot Number', 'present', '{}', 'legal',
   'Every cosmetic product must carry a batch number or reference that identifies it.',
   'Print a batch or lot code on the pack.',
   jsonb_build_array(
     jsonb_build_object('market', 'GB', 'title', gb_title, 'url', gb_19, 'clause', 'Art. 19(1)(e)'),
     jsonb_build_object('market', 'EU', 'title', eu_title, 'url', eu_reg, 'clause', 'Art. 19(1)(e)'))),

  (v, 'ingredient_list', 'Ingredient list (INCI)', array['GB', 'NI', 'EU'],
   'Ingredients', 'ingredient_list', '{}', 'legal',
   'Ingredients must be listed, headed "Ingredients", using their common (INCI) names in descending order of weight at the time they are added.',
   'Add a full INCI ingredient list headed "Ingredients:".',
   jsonb_build_array(
     jsonb_build_object('market', 'GB', 'title', gb_title, 'url', gb_19, 'clause', 'Art. 19(1)(g)'),
     jsonb_build_object('market', 'EU', 'title', eu_title, 'url', eu_reg, 'clause', 'Art. 19(1)(g)'))),

  (v, 'fragrance_allergens', 'Fragrance allergens declared', array['GB', 'NI', 'EU'],
   'Ingredients', 'fragrance_allergens',
   jsonb_build_object(
     'fragrance_markers', jsonb_build_array('parfum', 'fragrance', 'aroma'),
     -- Essential oils that commonly carry listed allergens as natural
     -- constituents. An aid to review, not a composition analysis.
     'natural_sources', jsonb_build_object(
       'citrus aurantium', jsonb_build_array('Linalool', 'Limonene', 'Citral'),
       'citrus limon', jsonb_build_array('Limonene', 'Citral'),
       'citrus bergamia', jsonb_build_array('Limonene', 'Linalool', 'Citral'),
       'citrus nobilis', jsonb_build_array('Limonene'),
       'citrus reticulata', jsonb_build_array('Limonene'),
       'citrus aurantifolia', jsonb_build_array('Limonene', 'Citral'),
       'citrus grandis', jsonb_build_array('Limonene', 'Citral'),
       'citrus sinensis', jsonb_build_array('Limonene', 'Citral'),
       'linalyl acetate', jsonb_build_array('Linalool'),
       'lavandula', jsonb_build_array('Linalool', 'Limonene', 'Geraniol', 'Coumarin'),
       'mentha piperita', jsonb_build_array('Limonene'),
       'mentha spicata', jsonb_build_array('Limonene'),
       'pelargonium graveolens', jsonb_build_array('Citronellol', 'Geraniol', 'Linalool'),
       'rosa damascena', jsonb_build_array('Citronellol', 'Geraniol', 'Farnesol', 'Eugenol'),
       'rosa centifolia', jsonb_build_array('Citronellol', 'Geraniol', 'Farnesol', 'Eugenol'),
       'cananga odorata', jsonb_build_array('Benzyl Benzoate', 'Benzyl Salicylate', 'Linalool', 'Farnesol', 'Geraniol'),
       'jasminum', jsonb_build_array('Benzyl Benzoate', 'Linalool', 'Farnesol'),
       'cinnamomum zeylanicum', jsonb_build_array('Cinnamal', 'Cinnamyl Alcohol', 'Eugenol'),
       'cinnamomum cassia', jsonb_build_array('Cinnamal', 'Cinnamyl Alcohol', 'Eugenol'),
       'eugenia caryophyllus', jsonb_build_array('Eugenol'),
       'illicium verum', jsonb_build_array('Limonene'),
       'anthemis nobilis', jsonb_build_array('Limonene'),
       'chamomilla recutita', jsonb_build_array('Limonene'),
       'salvia officinalis', jsonb_build_array('Linalool'),
       'salvia sclarea', jsonb_build_array('Linalool'),
       'origanum majorana', jsonb_build_array('Linalool'),
       'coriandrum sativum', jsonb_build_array('Linalool'),
       'myroxylon pereirae', jsonb_build_array('Benzyl Benzoate', 'Benzyl Cinnamate', 'Cinnamal', 'Cinnamyl Alcohol', 'Eugenol'),
       'styrax', jsonb_build_array('Benzyl Benzoate', 'Benzyl Cinnamate', 'Cinnamal', 'Cinnamyl Alcohol'),
       'pogostemon cablin', jsonb_build_array('Limonene'))),
   'legal',
   'Listed fragrance allergens must be named in the ingredient list when present above 0.001% in leave-on or 0.01% in rinse-off products — including when they come from essential oils.',
   'Ask your fragrance or essential-oil supplier for an allergen statement and add any allergen above the threshold to the ingredient list.',
   jsonb_build_array(
     jsonb_build_object('market', 'GB', 'title', gb_title, 'url', gb_annex_iii, 'clause', 'Art. 19(1)(g) and Annex III'),
     jsonb_build_object('market', 'EU', 'title', eu_title, 'url', eu_reg, 'clause', 'Art. 19(1)(g) and Annex III'))),

  (v, 'prohibited_substances', 'No prohibited substances', array['GB', 'NI', 'EU'],
   'Ingredients', 'prohibited_substances', '{}', 'legal',
   'Cosmetic products must not contain substances listed in Annex II. This rulebook holds only a short list so far; a pass is not a full Annex II screen.',
   'Remove the prohibited substance and reformulate; the product cannot be sold with it.',
   jsonb_build_array(
     jsonb_build_object('market', 'GB', 'title', gb_title, 'url', gb_annex_ii, 'clause', 'Art. 14(1)(a) and Annex II'),
     jsonb_build_object('market', 'EU', 'title', eu_title, 'url', eu_reg, 'clause', 'Art. 14(1)(a) and Annex II'))),

  (v, 'eu_allergens_2026', 'Expanded EU fragrance allergen list', array['EU', 'NI'],
   'Ingredients', 'advisory',
   jsonb_build_object('only_if_any', jsonb_build_array(
     'parfum', 'fragrance', 'aroma', 'essential oil', 'peel oil', 'leaf oil', 'flower oil',
     'herb oil', 'bark oil', 'bud oil', 'root oil', 'wood oil')),
   'legal',
   'Regulation (EU) 2023/1545 extends the fragrance allergens that must be labelled to more than 80. Products newly placed on the EU market from 31 July 2026 must comply; products already on the market have until 31 July 2028. This rulebook does not yet hold the expanded list, so this is not checked automatically.',
   'Check your fragrance supplier''s allergen statement against the Regulation (EU) 2023/1545 list before EU launch.',
   jsonb_build_array(
     jsonb_build_object('market', 'EU', 'title', 'Commission Regulation (EU) 2023/1545', 'url', 'https://eur-lex.europa.eu/eli/reg/2023/1545/oj', 'clause', 'Art. 1, Art. 2 and Annex'))),

  (v, 'storage_instructions', 'Storage instructions', array['GB', 'NI', 'EU'],
   'Storage Instructions', 'present_if_applicable', '{}', 'best_practice',
   'Not a legal requirement for cosmetics, but recommended where heat, light or air affect the product''s stability.',
   'Consider adding storage guidance, e.g. "Store below 25°C, away from direct sunlight".',
   jsonb_build_array(
     jsonb_build_object('market', 'GB', 'title', gb_title, 'url', gb_19, 'clause', 'Art. 19 (not required; best practice)')));

  -- Annex III fragrance allergens (the long-standing list).
  insert into public.substances
    (rulebook_version_id, list_type, inci_name, synonyms, markets,
     leave_on_threshold_pct, rinse_off_threshold_pct, sources)
  select v, 'fragrance_allergen', a.inci, a.syn, array['GB', 'NI', 'EU'], 0.001, 0.01,
    jsonb_build_array(
      jsonb_build_object('market', 'GB', 'title', gb_title, 'url', gb_annex_iii, 'clause', 'Annex III'),
      jsonb_build_object('market', 'EU', 'title', eu_title, 'url', eu_reg, 'clause', 'Annex III'))
  from (values
    ('Amyl Cinnamal', array[]::text[]),
    ('Amylcinnamyl Alcohol', array[]::text[]),
    ('Anise Alcohol', array['Anisyl Alcohol']),
    ('Benzyl Alcohol', array[]::text[]),
    ('Benzyl Benzoate', array[]::text[]),
    ('Benzyl Cinnamate', array[]::text[]),
    ('Benzyl Salicylate', array[]::text[]),
    ('Cinnamal', array[]::text[]),
    ('Cinnamyl Alcohol', array[]::text[]),
    ('Citral', array[]::text[]),
    ('Citronellol', array[]::text[]),
    ('Coumarin', array[]::text[]),
    ('Eugenol', array[]::text[]),
    ('Farnesol', array[]::text[]),
    ('Geraniol', array[]::text[]),
    ('Hexyl Cinnamal', array[]::text[]),
    ('Hydroxycitronellal', array[]::text[]),
    ('Isoeugenol', array[]::text[]),
    ('Limonene', array[]::text[]),
    ('Linalool', array[]::text[]),
    ('Methyl 2-Octynoate', array['Methyl Heptin Carbonate']),
    ('Alpha-Isomethyl Ionone', array[]::text[]),
    ('Evernia Prunastri Extract', array['Oakmoss']),
    ('Evernia Furfuracea Extract', array['Treemoss'])
  ) as a(inci, syn);

  -- Former Annex III allergens since moved to Annex II (prohibited).
  insert into public.substances
    (rulebook_version_id, list_type, inci_name, synonyms, cas_number, markets, sources, verification_note)
  values
  (v, 'prohibited', 'Hydroxyisohexyl 3-Cyclohexene Carboxaldehyde', array['HICC', 'Lyral'], '31906-04-4',
   array['GB', 'NI', 'EU'],
   jsonb_build_array(
     jsonb_build_object('market', 'EU', 'title', 'Commission Regulation (EU) 2017/1410', 'url', 'https://eur-lex.europa.eu/eli/reg/2017/1410/oj', 'clause', 'Annex II entry'),
     jsonb_build_object('market', 'GB', 'title', gb_title, 'url', gb_annex_ii, 'clause', 'Annex II')),
   'Reviewer: confirm the GB Annex II entry and dates.'),
  (v, 'prohibited', 'Butylphenyl Methylpropional', array['BMHCA', 'Lilial'], '80-54-6',
   array['GB', 'NI', 'EU'],
   jsonb_build_array(
     jsonb_build_object('market', 'EU', 'title', 'Commission Regulation (EU) 2021/1902', 'url', 'https://eur-lex.europa.eu/eli/reg/2021/1902/oj', 'clause', 'Annex II entry'),
     jsonb_build_object('market', 'GB', 'title', gb_title, 'url', gb_annex_ii, 'clause', 'Annex II')),
   'Reviewer: confirm the GB Annex II entry and dates.');
end;
$$;
