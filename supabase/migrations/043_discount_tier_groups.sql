-- ============================================================================
-- USTORE GREENFIELD — 043: BOSQICHLI CHEGIRMA GURUHLARI (TIER GROUPS)
-- ============================================================================
-- 3-paket, 7-topshiriq: hozir har bir threshold (2mln->2%, 5mln->5%, ...)
-- `discount_tiers`da ALOHIDA qator — admin UI'da bittadan uchta alohida
-- aksiya bo'lib ko'rinadi. Yangi talab: "bitta bosqichli chegirma qoidasi
-- ichida ko'p bosqich" (bitta nom/muddat/status/qamrov, ko'p threshold/foiz
-- qatori).
--
-- Eng kichik xavfsiz yechim (checkout hisob-kitobini BUTUNLAY tegilmasdan):
--   - Yangi `discount_tier_groups` jadvali — UMUMIY maydonlar (nom, muddat,
--     status, qamrov) shu yerda saqlanadi, admin/user UI shu orqali BITTA
--     qator/kartani chizadi.
--   - `discount_tiers`ga nullable `group_id` ustuni qo'shiladi (FK, on
--     delete cascade — guruh o'chsa, uning barcha bosqichlari ham o'chadi).
--   - Har bir `discount_tiers` qatori o'zining starts_at/ends_at/is_active/
--     category_ids/product_ids/allow_stacking ustunlarini SAQLAYDI (guruh
--     saqlanganda shu qiymatlar guruhdan har bir qatorga nusxalanadi) —
--     shu sabab `resolveTierDiscount`/`resolveNextTierOpportunity`
--     (shop-api) va cart tier-progress ladder (1-paket) BIR QATOR ham
--     o'zgarishsiz, checkout'dagi real pul hisob-kitobiga hech qanday xavf
--     yo'q. Guruh — faqat admin/user KO'RINISHI (list/detail/forma) uchun.
--   - Mavjud qatorlar avtomatik BACKFILL qilinadi: har bir eski qator o'ziga
--     xos BITTA-bosqichli guruhga aylantiriladi (hech narsa yo'qolmaydi,
--     hech narsa qayta guruhlanmaydi — admin xohlasa keyin tahrirlab
--     birlashtira oladi).
-- ============================================================================

begin;

create table if not exists public.discount_tier_groups (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text,
  category_ids jsonb,
  product_ids jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  allow_stacking boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists discount_tier_groups_shop_active_idx on public.discount_tier_groups(shop_id, is_active);
alter table public.discount_tier_groups enable row level security;

alter table public.discount_tiers
  add column if not exists group_id uuid references public.discount_tier_groups(id) on delete cascade;
create index if not exists discount_tiers_group_idx on public.discount_tiers(group_id);

-- Backfill: har bir mavjud tier o'ziga xos bitta-bosqichli guruhga ega
-- bo'ladi, o'zining joriy nomi/muddat/status/qamrovi bilan.
do $$
declare t record;
declare new_group_id uuid;
begin
  for t in select * from public.discount_tiers where group_id is null loop
    insert into public.discount_tier_groups
      (shop_id, name, category_ids, product_ids, starts_at, ends_at, allow_stacking, is_active)
    values
      (t.shop_id, t.name, t.category_ids, t.product_ids, t.starts_at, t.ends_at, coalesce(t.allow_stacking, false), t.is_active)
    returning id into new_group_id;
    update public.discount_tiers set group_id = new_group_id where id = t.id;
  end loop;
end $$;

commit;
