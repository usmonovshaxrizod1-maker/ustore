-- USTORE — temporary PDF report export retention metadata.
-- Every generated report PDF is registered here with a 24-hour expiry.
-- A server-side cleanup Edge Function removes the Storage object after expiry.
begin;

create table if not exists public.report_export_files (
  path text primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  telegram_user_id text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists report_export_files_expires_at_idx
  on public.report_export_files(expires_at);

create index if not exists report_export_files_shop_user_idx
  on public.report_export_files(shop_id, telegram_user_id);

alter table public.report_export_files enable row level security;
revoke all on table public.report_export_files from anon, authenticated;

-- Backfill PDFs that may already exist from the previous PDF-download deploy,
-- so they are not left in Storage forever just because they predate this table.
insert into public.report_export_files (
  path, shop_id, telegram_user_id, expires_at, created_at, updated_at
)
select
  o.name,
  split_part(o.name, '/', 2)::uuid,
  split_part(o.name, '/', 4),
  coalesce(o.updated_at, o.created_at, now()) + interval '24 hours',
  coalesce(o.created_at, now()),
  coalesce(o.updated_at, o.created_at, now())
from storage.objects o
where o.bucket_id = 'report-exports'
  and o.name ~* '^shops/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/users/[0-9A-Za-z_-]+/latest\.pdf$'
on conflict (path) do nothing;

commit;
