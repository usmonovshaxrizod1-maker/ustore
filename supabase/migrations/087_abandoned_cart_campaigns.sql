begin;

create table if not exists public.abandoned_cart_campaigns (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  created_by text not null,
  scope text not null default 'ELIGIBLE' check (scope in ('ELIGIBLE','SELECTED')),
  filters jsonb not null default '{}'::jsonb,
  status text not null default 'QUEUED' check (status in ('QUEUED','RUNNING','COMPLETED','CANCELLED')),
  total_count integer not null default 0,
  sent_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.abandoned_cart_reminder_queue (
  id bigint generated always as identity primary key,
  campaign_id uuid references public.abandoned_cart_campaigns(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  tg_id text not null,
  cart_updated_at timestamptz not null,
  status text not null default 'QUEUED' check (status in ('QUEUED','PROCESSING','SENT','SKIPPED','FAILED')),
  attempts integer not null default 0,
  scheduled_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, tg_id)
);

create index if not exists abandoned_cart_campaigns_shop_created_idx
  on public.abandoned_cart_campaigns(shop_id, created_at desc);
create index if not exists abandoned_cart_queue_pending_idx
  on public.abandoned_cart_reminder_queue(status, scheduled_at, id)
  where status in ('QUEUED','FAILED');
create index if not exists abandoned_cart_queue_shop_tg_idx
  on public.abandoned_cart_reminder_queue(shop_id, tg_id, created_at desc);

alter table public.abandoned_cart_campaigns enable row level security;
alter table public.abandoned_cart_reminder_queue enable row level security;

commit;
