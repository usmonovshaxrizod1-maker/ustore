-- ============================================================================
-- USTORE GREENFIELD — 003: SHOP-SCOPED USERS, ORDERS, PAYMENTS
-- ============================================================================
-- 11-band: app_users is no longer global-by-tg_id. The same Telegram person
-- can have a different profile/block/warn state in every shop, so identity
-- here is the COMPOSITE (shop_id, tg_id) — never tg_id alone.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- A) APP_USERS — shop-scoped customer/user state
-- ----------------------------------------------------------------------------
create table if not exists public.app_users (
  shop_id uuid not null references public.shops(id) on delete cascade,
  tg_id text not null,
  first_name text,
  last_name text,
  username text,
  is_blocked boolean not null default false,
  block_reason text,
  blocked_at timestamptz,
  warned boolean not null default false,
  warn_reason text,
  warned_at timestamptz,
  profile_first_name text,
  profile_last_name text,
  phone text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (shop_id, tg_id)
);

create index if not exists app_users_shop_idx on public.app_users(shop_id);

-- ----------------------------------------------------------------------------
-- B) ORDERS
-- ----------------------------------------------------------------------------
-- id stays a simple globally-incrementing bigint (not per-shop-sequential and
-- not UUID) on purpose: admins and Telegram messages reference orders by a
-- short human number ("Buyurtma #123"), and access is already gated by
-- shop_id filtering everywhere, so a shared counter across shops leaks
-- nothing about another shop's data — at most it reveals that *some* other
-- order exists, never its content. A true per-shop-restarting counter would
-- need a much more complex sharded-sequence setup for no functional benefit.
create table if not exists public.orders (
  id bigint generated always as identity,
  shop_id uuid not null references public.shops(id) on delete cascade,
  tg_id text not null,
  user_name text,
  phone text,
  region text,
  district text,
  address text,
  pay_method text,
  items jsonb not null default '[]'::jsonb,
  total_price numeric(14,2) not null default 0,
  status text not null default 'NEW' check (status in ('NEW', 'PROCESSING', 'DELIVERED', 'CANCELLED')),
  cancel_reason text,
  cancelled_by text,
  subtotal numeric(14,2),
  delivery_fee numeric(14,2) not null default 0,
  payable_total numeric(14,2),
  delivery_snapshot jsonb,
  payment_snapshot jsonb,
  shipment jsonb,
  payment_receipt_path text,
  payment_receipt_uploaded_at timestamptz,
  payment_receipt_telegram_sent_at timestamptz,
  receipt_review_status text not null default 'PENDING' check (receipt_review_status in ('PENDING', 'APPROVED', 'REJECTED')),
  receipt_reject_reason text,
  receipt_reviewed_at timestamptz,
  receipt_reviewed_by text,
  created_at timestamptz not null default now(),
  primary key (id),
  unique (shop_id, id),
  -- 12-band: buyurtma faqat shu shopda ALLAQACHON mavjud bo'lgan (boot()
  -- orqali upsert qilingan) foydalanuvchi uchun yaratilishi mumkin.
  foreign key (shop_id, tg_id) references public.app_users(shop_id, tg_id) on delete restrict
);

create index if not exists orders_shop_id_idx on public.orders(shop_id);
create index if not exists orders_shop_tg_idx on public.orders(shop_id, tg_id);
create index if not exists orders_shop_status_idx on public.orders(shop_id, status);
create index if not exists orders_shop_created_idx on public.orders(shop_id, created_at);

-- ----------------------------------------------------------------------------
-- C) PAYMENT RECEIPT HISTORY (archived rejected/replaced receipts)
-- ----------------------------------------------------------------------------
create table if not exists public.payment_receipt_history (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  order_id bigint not null,
  storage_path text not null,
  uploaded_at timestamptz,
  review_status text,
  reject_reason text,
  reviewed_at timestamptz,
  reviewed_by text,
  archived_at timestamptz not null default now(),
  foreign key (shop_id, order_id) references public.orders(shop_id, id) on delete cascade
);

create index if not exists payment_receipt_history_shop_order_idx on public.payment_receipt_history(shop_id, order_id);

-- ----------------------------------------------------------------------------
-- D) STOCK MOVEMENTS (append-only inventory ledger)
-- ----------------------------------------------------------------------------
-- product_id is intentionally NOT foreign-keyed to products: this is a
-- historical audit ledger and must keep showing what happened even after the
-- product itself is later purged from Trash — matching the old schema's
-- design (products.id there also had no FK from stock_movements).
create table if not exists public.stock_movements (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid not null,
  variant_sku text,
  prior_stock integer not null,
  delta integer not null,
  new_stock integer not null,
  operation_type text not null check (operation_type in ('KIRIM', 'BUYURTMA', 'MANUAL')),
  admin_tg_id text,
  order_id bigint,
  created_at timestamptz not null default now(),
  foreign key (shop_id, order_id) references public.orders(shop_id, id) on delete set null
);

create index if not exists stock_movements_shop_product_idx on public.stock_movements(shop_id, product_id);
create index if not exists stock_movements_shop_created_idx on public.stock_movements(shop_id, created_at);

-- ----------------------------------------------------------------------------
-- E) FAVORITES / RECENTLY VIEWED (shop-scoped user behavior)
-- ----------------------------------------------------------------------------
create table if not exists public.user_favorites (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  tg_id text not null,
  product_id uuid not null,
  created_at timestamptz not null default now(),
  unique (shop_id, tg_id, product_id),
  foreign key (shop_id, tg_id) references public.app_users(shop_id, tg_id) on delete cascade,
  foreign key (shop_id, product_id) references public.products(shop_id, id) on delete cascade
);

create table if not exists public.user_recent_views (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  tg_id text not null,
  product_id uuid not null,
  viewed_at timestamptz not null default now(),
  unique (shop_id, tg_id, product_id),
  foreign key (shop_id, tg_id) references public.app_users(shop_id, tg_id) on delete cascade,
  foreign key (shop_id, product_id) references public.products(shop_id, id) on delete cascade
);

create index if not exists user_favorites_shop_tg_idx on public.user_favorites(shop_id, tg_id);
create index if not exists user_recent_views_shop_tg_idx on public.user_recent_views(shop_id, tg_id);

-- ----------------------------------------------------------------------------
-- F) RLS
-- ----------------------------------------------------------------------------
alter table public.app_users enable row level security;
alter table public.orders enable row level security;
alter table public.payment_receipt_history enable row level security;
alter table public.stock_movements enable row level security;
alter table public.user_favorites enable row level security;
alter table public.user_recent_views enable row level security;

commit;
