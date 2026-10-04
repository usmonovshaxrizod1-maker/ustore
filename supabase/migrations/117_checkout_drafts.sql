-- Persistent checkout resume state. This is NOT an order and reserves neither
-- stock nor price. Final create_order remains the authoritative validation point.
begin;
create table if not exists public.checkout_drafts (
  shop_id uuid not null references public.shops(id) on delete cascade,
  tg_id text not null,
  step smallint not null default 1 check(step between 1 and 3),
  payload jsonb not null default '{}'::jsonb,
  cart_signature text,
  updated_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '30 days'),
  primary key (shop_id, tg_id)
);
create index if not exists checkout_drafts_expiry_idx on public.checkout_drafts(expires_at);
alter table public.checkout_drafts enable row level security;
revoke all on public.checkout_drafts from public, anon, authenticated;
grant all on public.checkout_drafts to service_role;
commit;
