-- ============================================================================
-- USTORE GREENFIELD — 033: BUNDLE (AKSIYA) / BOSQICHLI CHEGIRMA / AVTOMATIK
-- REWARD PROMO-KOD / VIP MIJOZ CHEGIRMASI
-- ============================================================================
-- Shop takomillashtirish round, qo'shimcha talablar. Mavjud `promotions`
-- (023) va `banners` (028) arxitekturasi KENGAYTIRILADI, duplicate tizim
-- yaratilmaydi:
--   - Reward promo-kodlar shunchaki `promotions`ning YANGI qatorlari
--     (source='REWARD_*') — checkout'dagi mavjud promo-kod validatsiyasi
--     (resolvePromoDiscount) o'zgarishsiz ishlaydi.
--   - `banners.target_type` kengaytiriladi: endi BUNDLE/PROMOTION ham bo'lishi
--     mumkin (mavjud PRODUCT/CATEGORY/URL/NONE'ga qo'shimcha).
--   - Barcha yangi jadval hammasi additive — mavjud jadvallarga faqat
--     xavfsiz ALTER (yangi ustun, default bilan) qo'llaniladi.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- A) BUNDLE (Aksiya — bir nechta mahsulotni bitta to'plam narxida sotish)
-- ---------------------------------------------------------------------------
create table if not exists public.bundles (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  description text,
  -- [{productId, qty}] — har mahsulotning shu paytdagi narxi bundle_price bilan
  -- taqqoslash uchun checkout paytida LIVE hisoblanadi (bu yerda saqlanmaydi).
  items jsonb not null default '[]'::jsonb,
  bundle_price numeric(14,2) not null check (bundle_price > 0),
  cover_image_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, id)
);
create index if not exists bundles_shop_active_idx on public.bundles(shop_id, is_active);
alter table public.bundles enable row level security;

-- ---------------------------------------------------------------------------
-- B) BOSQICHLI (THRESHOLD/TIER) CHEGIRMA
-- ---------------------------------------------------------------------------
-- Har qator — bitta tier. Bir nechta tier bir xil scope'da bo'lishi mumkin
-- (masalan 1mln/2mln/3mln) — checkout'da faqat ENG YUQORI mos keladigan
-- tier ishlaydi (backend hisoblaydi, 23-band talabi).
create table if not exists public.discount_tiers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text,
  threshold_amount numeric(14,2) not null check (threshold_amount > 0),
  discount_type text not null check (discount_type in ('PERCENT', 'FIXED')),
  discount_value numeric(14,2) not null check (discount_value > 0),
  -- promotions'dagi bilan bir xil scoping konvensiyasi (null/bo'sh = butun savat).
  category_ids jsonb,
  product_ids jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists discount_tiers_shop_active_idx on public.discount_tiers(shop_id, is_active);
alter table public.discount_tiers enable row level security;

-- ---------------------------------------------------------------------------
-- C) AVTOMATIK REWARD PROMO-KOD — QOIDALAR + BERILGANLIK KUZATUVI
-- ---------------------------------------------------------------------------
create table if not exists public.reward_rules (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  trigger_type text not null check (trigger_type in ('ORDER_TOTAL', 'LIFETIME_TOTAL')),
  threshold_amount numeric(14,2) not null check (threshold_amount > 0),
  reward_type text not null check (reward_type in ('PERCENT', 'FIXED')),
  reward_value numeric(14,2) not null check (reward_value > 0),
  code_expiry_days integer check (code_expiry_days is null or code_expiry_days > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, id)
);
create index if not exists reward_rules_shop_active_idx on public.reward_rules(shop_id, is_active);
alter table public.reward_rules enable row level security;

-- Har (qoida, mijoz) yoki (qoida, buyurtma) juftligi uchun KO'PI BILAN bitta
-- yozuv — shu orqali "bir xil lifetime milestone qayta-qayta berilmasin"
-- VA "bir xil buyurtma ikki marta reward bermasin" ikkalasi ham DB darajasida
-- (faqat app-level tekshiruv emas) kafolatlanadi.
create table if not exists public.reward_issuances (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  rule_id uuid not null,
  tg_id text not null,
  order_id bigint,
  promotion_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (shop_id, rule_id) references public.reward_rules(shop_id, id) on delete cascade,
  foreign key (shop_id, order_id) references public.orders(shop_id, id) on delete set null,
  foreign key (shop_id, promotion_id) references public.promotions(shop_id, id) on delete cascade
);
-- LIFETIME_TOTAL turi uchun: order_id har doim null — (rule,tg_id) juftligi bir marta.
create unique index if not exists reward_issuances_lifetime_once_idx
  on public.reward_issuances(shop_id, rule_id, tg_id) where order_id is null;
-- ORDER_TOTAL turi uchun: bitta buyurtma bir qoida bo'yicha ikki marta reward bermasin.
create unique index if not exists reward_issuances_per_order_once_idx
  on public.reward_issuances(shop_id, rule_id, order_id) where order_id is not null;
alter table public.reward_issuances enable row level security;

-- promotions'ga reward-kod manbasini bildiruvchi ustunlar (mavjud jadvalga
-- xavfsiz qo'shimcha — default MANUAL, eski qatorlarga ta'sir qilmaydi).
alter table public.promotions
  add column if not exists source text not null default 'MANUAL' check (source in ('MANUAL', 'REWARD_ORDER_THRESHOLD', 'REWARD_LIFETIME_THRESHOLD')),
  add column if not exists issued_to_tg_id text;

-- ---------------------------------------------------------------------------
-- D) VIP MIJOZ — SHAXSIY VAQTINCHALIK CHEGIRMA (promo-kodsiz, checkout'da
--    avtomatik, faqat shu tg_id uchun)
-- ---------------------------------------------------------------------------
create table if not exists public.customer_discounts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  tg_id text not null,
  discount_type text not null check (discount_type in ('PERCENT', 'FIXED')),
  discount_value numeric(14,2) not null check (discount_value > 0),
  starts_at timestamptz,
  ends_at timestamptz not null,
  is_active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  foreign key (shop_id, tg_id) references public.app_users(shop_id, tg_id) on delete cascade
);
create index if not exists customer_discounts_shop_tg_idx on public.customer_discounts(shop_id, tg_id, is_active);
alter table public.customer_discounts enable row level security;

-- ---------------------------------------------------------------------------
-- E) BANNER — target_type kengaytmasi (BUNDLE/PROMOTION) + stacking sozlamasi
-- ---------------------------------------------------------------------------
-- Mavjud CHECK constraint'ni dinamik topib almashtirish (nomi avtomatik
-- generatsiya qilingan edi, migratsiya 017'dagi bilan bir xil pattern).
do $$
declare con_name text;
begin
  select conname into con_name from pg_constraint
   where conrelid = 'public.banners'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%target_type%';
  if con_name is not null then
    execute format('alter table public.banners drop constraint %I', con_name);
  end if;
end $$;
alter table public.banners
  add constraint banners_target_type_check check (target_type in ('PRODUCT', 'CATEGORY', 'URL', 'NONE', 'BUNDLE', 'PROMOTION')),
  add column if not exists target_bundle_id uuid,
  add column if not exists target_promotion_id uuid,
  add foreign key (shop_id, target_bundle_id) references public.bundles(shop_id, id) on delete set null,
  add foreign key (shop_id, target_promotion_id) references public.promotions(shop_id, id) on delete set null;

-- Bundle ustiga boshqa chegirma (promo/tier/VIP/reward) default AVTOMATIK
-- tushmasin (spec talabi) — seller xohlasa shu bayroqni yoqadi.
alter table public.shop_settings
  add column if not exists allow_discount_stacking_with_bundle boolean not null default false;

-- Buyurtma tarixida "qaysi turdagi chegirma g'olib chiqdi" aniq ko'rinishi
-- uchun — orders.promo_code/promo_discount (023) o'zgarishsiz qoladi (endi
-- promo_code = promo-kod matni FAQAT source='PROMO' bo'lganda, boshqa
-- holatlarda null, discount_source qaysi turi ekanini bildiradi).
alter table public.orders
  add column if not exists discount_source text check (discount_source is null or discount_source in ('PROMO', 'VIP', 'TIER'));

commit;
