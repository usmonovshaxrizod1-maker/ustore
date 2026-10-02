-- ============================================================================
-- USTORE — 017: PLATFORM BOT obuna hayot sikli + rozilik auditi
-- ============================================================================
-- 001-016'ga tegilmaydi, faqat qo'shimcha. Yakuniy UX spetsifikatsiyasi
-- (UStorE_platform_final_ux_obuna_maxfiylik_shartlar) talab qiladigan:
--   A) shops.status'ga FROZEN/TERMINATED qiymatlari (mavjud PROVISIONING/
--      ACTIVE/DISABLED saqlanadi — hech kim ishlatmasa ham, kamaytirish emas
--      faqat kengaytirish);
--   B) shop_settings.frozen_at — muzlatilgan sanani (grace-period boshlanishi)
--      kuzatish uchun;
--   C) platform_admin_action_log — bosh adminning kun-qo'shish/muzlatish/
--      qayta-faollashtirish/o'chirish amallari uchun audit (004_support_
--      engagement.sql'dagi shop-scoped admin_audit_log bilan bir xil naqsh,
--      lekin PLATFORMA darajasida — shop_id endi NOT NULL emas, chunki
--      keyinchalik platforma-keng amallar ham shu jadvalga yozilishi mumkin,
--      va "on delete cascade" o'rniga "on delete set null" — shop keyinchalik
--      haqiqatan o'chirilsa ham, audit tarixi yo'qolmasin uchun);
--   D) platform_consent_log — Foydalanish shartlari/Maxfiylik siyosatiga
--      rozilik auditi (butunlay boshqa auditoriya/maydonlar, alohida jadval).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- A) SHOPS.STATUS — FROZEN/TERMINATED qo'shiladi
-- ----------------------------------------------------------------------------
-- Constraint nomi 001'da avtomatik generatsiya qilingan (unnamed check), shu
-- sabab nomini taxmin qilish o'rniga dinamik topib o'chiramiz — xavfsizroq.
do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'public.shops'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%';
  if con_name is not null then
    execute format('alter table public.shops drop constraint %I', con_name);
  end if;
end $$;

alter table public.shops
  add constraint shops_status_check
  check (status in ('PROVISIONING', 'ACTIVE', 'DISABLED', 'FROZEN', 'TERMINATED'));

-- ----------------------------------------------------------------------------
-- B) SHOP_SETTINGS — muzlatilgan sana
-- ----------------------------------------------------------------------------
alter table public.shop_settings
  add column frozen_at timestamptz;

-- ----------------------------------------------------------------------------
-- C) PLATFORM_ADMIN_ACTION_LOG — kun qo'shish/muzlatish/qayta faollashtirish/
--    o'chirish auditi
-- ----------------------------------------------------------------------------
create table public.platform_admin_action_log (
  id bigint generated always as identity primary key,
  admin_tg_id text not null,
  shop_id uuid references public.shops(id) on delete set null,
  action text not null check (action in ('GRANT_DAYS', 'FREEZE', 'REACTIVATE', 'TERMINATE')),
  details jsonb,
  created_at timestamptz not null default now()
);
create index platform_admin_action_log_shop_created_idx on public.platform_admin_action_log(shop_id, created_at);

-- ----------------------------------------------------------------------------
-- D) PLATFORM_CONSENT_LOG — Foydalanish shartlari + Maxfiylik siyosati roziligi
-- ----------------------------------------------------------------------------
create table public.platform_consent_log (
  id bigint generated always as identity primary key,
  user_telegram_id bigint not null,
  shop_id uuid references public.shops(id) on delete set null,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now(),
  source text,
  telegram_platform_info text
);
create index platform_consent_log_user_idx on public.platform_consent_log(user_telegram_id);

alter table public.platform_admin_action_log enable row level security;
alter table public.platform_consent_log enable row level security;

commit;
