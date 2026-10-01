-- ============================================================================
-- USTORE GREENFIELD — 004: SUPPORT & ADMIN AUDIT LOG (tenant-owned)
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- A) SUPPORT TICKETS (thread metadata) + MESSAGES (the actual thread)
-- ----------------------------------------------------------------------------
create table if not exists public.support_tickets (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  tg_id text not null,
  order_id bigint,
  status text not null default 'OPEN' check (status in ('OPEN', 'ANSWERED', 'CLOSED')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  answered_by text,
  closed_at timestamptz,
  closed_by text,
  unique (shop_id, id),
  foreign key (shop_id, tg_id) references public.app_users(shop_id, tg_id) on delete restrict,
  foreign key (shop_id, order_id) references public.orders(shop_id, id) on delete set null
);

create index if not exists support_tickets_shop_tg_idx on public.support_tickets(shop_id, tg_id);
create index if not exists support_tickets_shop_status_idx on public.support_tickets(shop_id, status);

create table if not exists public.support_ticket_messages (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  ticket_id bigint not null,
  sender text not null check (sender in ('USER', 'ADMIN')),
  sender_tg_id text not null,
  body text not null,
  reply_to_message_id bigint,
  created_at timestamptz not null default now(),
  unique (shop_id, id),
  foreign key (shop_id, ticket_id) references public.support_tickets(shop_id, id) on delete cascade,
  foreign key (shop_id, reply_to_message_id) references public.support_ticket_messages(shop_id, id) on delete set null
);

create index if not exists support_ticket_messages_shop_ticket_idx on public.support_ticket_messages(shop_id, ticket_id);

-- ----------------------------------------------------------------------------
-- B) ADMIN AUDIT LOG
-- ----------------------------------------------------------------------------
-- entity_id is intentionally untyped text, not a FK: it points at whichever
-- table `entity_type` names (product/category/order/admin/...), so a single
-- typed FK target isn't possible — same polymorphic-log design as the old
-- schema.
create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  admin_tg_id text not null,
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_shop_created_idx on public.admin_audit_log(shop_id, created_at);

-- ----------------------------------------------------------------------------
-- C) RLS
-- ----------------------------------------------------------------------------
alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.admin_audit_log enable row level security;

commit;
