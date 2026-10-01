-- ============================================================================
-- UStorE 034 — Marketing mukammal: real automatic gifts + discount snapshots
-- ============================================================================
-- Additive migration. Existing banners, bundles, promotions, tiers and legacy
-- reward promo-codes remain intact; this adds only the missing professional
-- marketing data required by the new UI and authoritative checkout flow.

begin;

alter table public.promotions
  add column if not exists new_customer_only boolean not null default false,
  add column if not exists allow_stacking boolean not null default false;

alter table public.discount_tiers
  add column if not exists allow_stacking boolean not null default false;

create table if not exists public.automatic_gift_rules (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  condition_type text not null check (condition_type in ('ORDER_AMOUNT', 'CATEGORY_QUANTITY', 'SPECIFIC_PRODUCT')),
  threshold_amount numeric(14,2) check (threshold_amount is null or threshold_amount > 0),
  threshold_quantity integer check (threshold_quantity is null or threshold_quantity > 0),
  target_product_id uuid,
  target_category_id uuid,
  gift_product_id uuid not null,
  gift_quantity integer not null default 1 check (gift_quantity > 0),
  stock_zero_policy text not null default 'AUTO_PAUSE' check (stock_zero_policy in ('AUTO_PAUSE', 'CONTINUE_WITHOUT_GIFT')),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, id),
  foreign key (shop_id, target_product_id) references public.products(shop_id, id) on delete set null,
  foreign key (shop_id, target_category_id) references public.categories(shop_id, id) on delete set null,
  foreign key (shop_id, gift_product_id) references public.products(shop_id, id) on delete restrict
);

create index if not exists automatic_gift_rules_shop_active_idx
  on public.automatic_gift_rules(shop_id, is_active, starts_at, ends_at);
alter table public.automatic_gift_rules enable row level security;

create table if not exists public.automatic_gift_usages (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  rule_id uuid not null,
  order_id bigint not null,
  tg_id text not null,
  gift_product_id uuid not null,
  gift_quantity integer not null check (gift_quantity > 0),
  created_at timestamptz not null default now(),
  foreign key (shop_id, rule_id) references public.automatic_gift_rules(shop_id, id) on delete restrict,
  foreign key (shop_id, order_id) references public.orders(shop_id, id) on delete cascade,
  foreign key (shop_id, gift_product_id) references public.products(shop_id, id) on delete restrict,
  unique (shop_id, rule_id, order_id)
);
create index if not exists automatic_gift_usages_rule_idx
  on public.automatic_gift_usages(shop_id, rule_id, created_at);
alter table public.automatic_gift_usages enable row level security;

alter table public.orders
  add column if not exists tier_discount numeric(14,2) not null default 0,
  add column if not exists tier_id uuid,
  add column if not exists tier_snapshot jsonb,
  add column if not exists gift_snapshot jsonb;

-- Replace the old discount_source check so a deliberately stackable
-- promo+tier result can be snapshotted without losing historical meaning.
do $$
declare con_name text;
begin
  select conname into con_name from pg_constraint
   where conrelid = 'public.orders'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%discount_source%';
  if con_name is not null then
    execute format('alter table public.orders drop constraint %I', con_name);
  end if;
end $$;
alter table public.orders
  add constraint orders_discount_source_check
  check (discount_source is null or discount_source in ('PROMO', 'VIP', 'TIER', 'PROMO_TIER'));

commit;
