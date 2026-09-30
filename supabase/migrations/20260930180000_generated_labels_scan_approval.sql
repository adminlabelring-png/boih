-- "Fix these" → review → approve: a label built from a scan records which
-- scan it replaces, the approved old-vs-new changes (each with its
-- reason), and when it was approved.
alter table public.generated_labels
  add column if not exists source_scan_id uuid references public.scans (id) on delete set null,
  add column if not exists changes_from_scan jsonb,
  add column if not exists approved_at timestamptz;

comment on column public.generated_labels.changes_from_scan is
  'Approved changes from the scanned label: [{key, label, before, after, reason}].';
