-- ============================================================================
-- USTORE — 016: PLATFORM BOT SaaS ONBOARDING + OBUNA TIZIMI, Phase 1 (sxema)
-- ============================================================================
-- 001-015'ga tegilmaydi, faqat qo'shimcha. "Asosiy bot"ni (hozir faqat bosh
-- admin uchun do'kon-ulash vositasi) to'liq mijozlar bilan ishlaydigan SaaS
-- onboarding+obuna markaziga aylantirish rejasining birinchi bosqichi.
--
-- Bitta umumiy Supabase loyihasi (eski, endi tashlab qo'yilgan "boss-app"
-- rejasidan farqli — u alohida loyiha/cross-project HTTP push talab qilardi)
-- — shu sabab tarif oshirish shunchaki shop_settings.product_limit'ni
-- yangilash, boshqa murakkab sinxronizatsiya kerak emas.
--
-- Yangi to'rtta jadval/ustun guruhi, hech biri boshqa hech narsaga bog'liq
-- emas (011 (billz_connections) bilan bir xil pattern — yangi jadval uchun
-- faqat `enable row level security`, 008'dagi eski jadvallar uchungina
-- qo'shilgan alohida revoke bloki YO'Q, chunki RLS'ning o'zi (siyosatsiz)
-- allaqachon anon/authenticated'ni bloklaydi).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- A) TARIFFS — bazadan boshqariladigan tarif ro'yxati (kodga qattiq yozilmaydi)
-- ----------------------------------------------------------------------------
create table public.tariffs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(14,2) not null check (price >= 0),
  product_limit integer,                       -- null = cheksiz
  is_active boolean not null default true,
  is_popular boolean not null default false,    -- "Ommabop" belgisi
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Bir vaqtning o'zida faqat BITTA tarif "Ommabop" bo'lishi mumkin — bu baza
-- darajasida kafolatlanadi (admin CRUD action'i buni ikki bosqichda: avval
-- boshqalarini false, keyin tanlanganini true qiladi — pastga qarang).
create unique index tariffs_single_popular_idx on public.tariffs(is_popular) where is_popular;

-- ----------------------------------------------------------------------------
-- B) SUBSCRIPTION_REQUESTS — obuna so'rovlari (yangi do'kon YOKI mavjud
--    do'kon tarif oshirishi), chek bilan, bosh admin tomonidan tasdiqlanadi.
-- ----------------------------------------------------------------------------
create table public.subscription_requests (
  id uuid primary key default gen_random_uuid(),
  requester_telegram_id bigint not null,
  requester_username text,
  requester_first_name text,
  kind text not null check (kind in ('NEW_SHOP', 'UPGRADE')),
  shop_id uuid references public.shops(id) on delete set null,
  tariff_id uuid not null references public.tariffs(id),
  -- Keyin tarif tahrirlansa ham, o'sha paytdagi haqiqiy kelishuv (narx/limit)
  -- o'zgarmasin uchun — narx tarixi (product_price_history) bilan bir xil
  -- himoya naqshi.
  tariff_name_snapshot text not null,
  tariff_price_snapshot numeric(14,2) not null,
  tariff_product_limit_snapshot integer,
  status text not null default 'NEW' check (status in ('NEW', 'APPROVED', 'REJECTED')),
  receipt_storage_path text,
  receipt_uploaded_at timestamptz,
  reject_reason text,
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'NEW_SHOP' and shop_id is null) or (kind = 'UPGRADE' and shop_id is not null))
);
create index subscription_requests_status_idx on public.subscription_requests(status);
create index subscription_requests_requester_idx on public.subscription_requests(requester_telegram_id);
create index subscription_requests_shop_idx on public.subscription_requests(shop_id);

-- ----------------------------------------------------------------------------
-- C) SHOP_SETTINGS kengaytmasi — do'kon qaysi tarifda, obuna qachon tugaydi.
--    product_limit ustuni ALLAQACHON mavjud (005) — tarif tanlanganda shu
--    yerga "nusxa" sifatida yoziladi (tarif keyin tahrirlansa ham,
--    allaqachon obuna bo'lgan do'konga orqaga ta'sir qilmasin uchun).
-- ----------------------------------------------------------------------------
alter table public.shop_settings
  add column tariff_id uuid references public.tariffs(id) on delete set null,
  add column subscription_expires_at timestamptz;

-- ----------------------------------------------------------------------------
-- D) PLATFORM_SETTINGS — bitta qatorli singleton: to'lov karta ma'lumoti.
--    Admin panelidan tahrirlanadi (kodga qattiq yozib, qayta deploy qilish
--    shart bo'lmasin uchun) — 005'dagi eski FITCORE singleton naqshi bilan
--    bir xil shakl (bu holatda o'rinli, chunki bu haqiqatan platforma-keng
--    ma'lumot, shop_settings'dan farqli).
-- ----------------------------------------------------------------------------
create table public.platform_settings (
  id boolean primary key default true check (id),
  payment_card_number text,
  payment_card_holder text,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.platform_settings (id) values (true);

alter table public.tariffs enable row level security;
alter table public.subscription_requests enable row level security;
alter table public.platform_settings enable row level security;

commit;
