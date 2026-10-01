-- ============================================================================
-- USTORE GREENFIELD — 023: PROMO-CODE / DISCOUNT-CODE SYSTEM
-- ============================================================================
-- Online Do'kon Improvements round, item 1. A seller creates promo codes
-- (percent or fixed-amount discount, optional min-order/date-range/usage
-- limits, optional category/product scoping); a customer types a code at
-- checkout; the discount is ALWAYS recomputed and validated server-side in
-- shop-api's create_order (never trusted from the client) — this migration
-- only adds the storage, not the validation logic.
--
-- code uniqueness is case-insensitive by convention (shop-api always
-- upper-cases the code before writing/reading it), so a plain
-- unique(shop_id, code) is enough — no citext extension needed.
--
-- promo_code/promo_discount are snapshotted onto the order row itself (not
-- just derivable from promotion_redemptions) so an order's history stays
-- correct even if the promotion is later edited or deleted.
-- ============================================================================

begin;

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  code text not null,
  name text not null,
  discount_type text not null check (discount_type in ('PERCENT', 'FIXED')),
  discount_value numeric(14,2) not null check (discount_value > 0),
  min_order_amount numeric(14,2),
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  per_customer_limit integer check (per_customer_limit is null or per_customer_limit > 0),
  -- Simplified scoping (per product decision — no per-item proration): when
  -- set, the code is only valid if the cart contains at least one matching
  -- product/category, but the discount still applies to the WHOLE order
  -- subtotal, not just the matching items. Null/empty array = no scoping.
  category_ids jsonb,
  product_ids jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, code),
  unique (shop_id, id)
);

create index if not exists promotions_shop_active_idx on public.promotions(shop_id, is_active);

create table if not exists public.promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  promotion_id uuid not null,
  order_id bigint not null,
  tg_id text not null,
  discount_amount numeric(14,2) not null,
  created_at timestamptz not null default now(),
  foreign key (shop_id, promotion_id) references public.promotions(shop_id, id) on delete cascade,
  foreign key (shop_id, order_id) references public.orders(shop_id, id) on delete cascade
);

create index if not exists promotion_redemptions_promo_idx on public.promotion_redemptions(shop_id, promotion_id);
create index if not exists promotion_redemptions_customer_idx on public.promotion_redemptions(shop_id, promotion_id, tg_id);

alter table public.orders
  add column if not exists promo_code text,
  add column if not exists promo_discount numeric(14,2) not null default 0;

alter table public.promotions enable row level security;
alter table public.promotion_redemptions enable row level security;

commit;
