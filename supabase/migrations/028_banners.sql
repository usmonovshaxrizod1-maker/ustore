-- ============================================================================
-- USTORE GREENFIELD — 028: BANNER TIZIMI
-- ============================================================================
-- Online Do'kon Improvements round, item 17. Ikki rejim:
-- - TEMPLATE: admin sarlavha/qisqa matn/rasm/CTA to'ldiradi, ilova o'zi bitta
--   zamonaviy shablon (fon rasm + gradient overlay + matn) bilan chizadi —
--   statik rasm generatsiya qilinmaydi, faqat CSS bilan jonli render qilinadi.
-- - IMAGE: admin to'liq tayyor (allaqachon dizayn qilingan) banner rasmini
--   yuklaydi, tizim faqat ko'rsatadi + tugmani (target) bog'laydi.
--
-- Storefrontni to'ldirmaslik uchun ("1-3 active banner yetarli") cheklov
-- backendda emas — QANCHA banner yaratilishi mumkin (admin xohlagancha), lekin
-- bir vaqtning o'zida ko'rinadigan (active + jadval ichida) bannerlardan
-- FAQAT birinchi 3 tasi (sort_order bo'yicha) mijozga qaytariladi.
-- ============================================================================

begin;

create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  mode text not null check (mode in ('TEMPLATE', 'IMAGE')),
  title text,
  subtitle text,
  cta_text text,
  image_url text not null,
  target_type text not null default 'NONE' check (target_type in ('PRODUCT', 'CATEGORY', 'URL', 'NONE')),
  target_product_id uuid,
  target_category_id uuid,
  target_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (shop_id, target_product_id) references public.products(shop_id, id) on delete set null,
  foreign key (shop_id, target_category_id) references public.categories(shop_id, id) on delete set null
);

create index if not exists banners_shop_active_idx on public.banners(shop_id, is_active, sort_order);

alter table public.banners enable row level security;

commit;
