-- ============================================================================
-- USTORE GREENFIELD — 001: PLATFORM CORE (shops / shop_bots / shop_memberships)
-- ============================================================================
-- Bu FRESH migration chain'ning birinchi fayli — bo'sh Supabase project'da
-- 001 dan boshlab ishga tushiriladi. Eski FITCORE migratsiyalariga (012-030)
-- HECH QANDAY bog'liqligi yo'q va ular ustiga qo'yilmaydi.
--
-- Bu fayl multi-shop platformaning ASOSINI yaratadi: har bir do'kon (shop),
-- unga ulangan Telegram bot (shop_bots), va do'kon egalari/hodimlari
-- (shop_memberships). Barcha keyingi migratsiyalardagi business table'lar
-- shu yerdagi shops(id)ga shop_id orqali bog'lanadi.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- A) SHOPS — har bir do'kon uchun bitta qator
-- ----------------------------------------------------------------------------
create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique,
  status text not null default 'PROVISIONING'
    check (status in ('PROVISIONING', 'ACTIVE', 'DISABLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shops_status_idx on public.shops(status);

-- ----------------------------------------------------------------------------
-- B) SHOP_BOTS — har bir do'konga ulangan Telegram bot(lar)
-- ----------------------------------------------------------------------------
-- token_ciphertext/token_iv: bot tokeni HECH QACHON plaintext saqlanmaydi —
-- Edge Function tomonida AES-GCM bilan shifrlanadi (007_tenant_rpcs.sql emas,
-- bu sof SQL migratsiya, shifrlash mantiqi shop-api Edge Function kodida;
-- bu yerda faqat shifrlangan natijani saqlaydigan ustunlar bor). Har shifrlash
-- operatsiyasi o'zining tasodifiy IV (initialization vector)'iga ega bo'lishi
-- kerak — shuning uchun token_iv alohida ustun, master key bilan birga
-- saqlanmaydi (u faqat USTORE_BOT_TOKEN_MASTER_KEY Edge Function secretida).
create table if not exists public.shop_bots (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  telegram_bot_id bigint not null unique,
  bot_username text,
  bot_name text,
  token_ciphertext text not null,
  token_iv text not null,
  token_last4 text,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'DISABLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_bots_shop_id_idx on public.shop_bots(shop_id);
-- 6-band: har request botId bo'yicha kelganda shu jadvaldan bitta qator
-- topilishi ENG ko'p ishlatiladigan so'rov bo'ladi — telegram_bot_id allaqachon
-- UNIQUE (va shu bilan indekslangan), qo'shimcha indeks shart emas.

-- ----------------------------------------------------------------------------
-- C) SHOP_MEMBERSHIPS — kim qaysi do'konni boshqarishi mumkin
-- ----------------------------------------------------------------------------
-- Hozircha faqat OWNER roli yetarli (spec talabi). Kelajakda ADMIN/STAFF
-- kabi rollar shu jadvalning `role` ustuniga yangi CHECK qiymati sifatida
-- qo'shiladi — jadval strukturasi buni o'zgarishsiz qabul qiladi.
create table if not exists public.shop_memberships (
  shop_id uuid not null references public.shops(id) on delete cascade,
  telegram_user_id bigint not null,
  role text not null default 'OWNER' check (role in ('OWNER')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'DISABLED')),
  created_at timestamptz not null default now(),
  primary key (shop_id, telegram_user_id)
);

create index if not exists shop_memberships_user_idx on public.shop_memberships(telegram_user_id);

-- ----------------------------------------------------------------------------
-- D) updated_at avtomatik yangilanishi — shops/shop_bots uchun
-- ----------------------------------------------------------------------------
create or replace function public.ustore_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_shops_updated_at on public.shops;
create trigger trg_shops_updated_at
  before update on public.shops
  for each row execute function public.ustore_set_updated_at();

drop trigger if exists trg_shop_bots_updated_at on public.shop_bots;
create trigger trg_shop_bots_updated_at
  before update on public.shop_bots
  for each row execute function public.ustore_set_updated_at();

-- ----------------------------------------------------------------------------
-- E) RLS — yoqilgan, lekin permissive public policy YO'Q. Edge Function
--    service_role kalit bilan ishlaydi (RLS'ni chetlab o'tadi) — bu ASOSIY
--    himoya emas, ctx.shopId bilan explicit filtering asosiy himoya
--    (007/008-fayllarda). RLS shu yerda faqat anon/authenticated'ning
--    to'g'ridan-to'g'ri (frontend orqali emas) DB'ga kirishini yopish uchun.
-- ----------------------------------------------------------------------------
alter table public.shops enable row level security;
alter table public.shop_bots enable row level security;
alter table public.shop_memberships enable row level security;

commit;
