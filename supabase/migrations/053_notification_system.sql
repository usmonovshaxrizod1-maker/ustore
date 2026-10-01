-- ============================================================================
-- USTORE — 053: Telegram bildirishnoma tizimi — poydevor (shablon + audit log)
-- ============================================================================
-- Spec (session xotirasi, "6. Telegram lifecycle notifications"): har bir
-- bildirishnoma turi ANIQ trigger + foydalanuvchi/milestone bo'yicha FAQAT
-- bir marta jo'natiladi (idempotent). Bu migratsiya shu poydevorni quradi —
-- Group B (obuna tugashiga yaqinlashish) va C (muzlatilgan, retention-
-- deadline) turlari uchun, mavjud platform-subscription-cron'ni QAYTA
-- QURADI (hardcode matn + kunlik-oyna dedup o'rniga shablon jadvali +
-- haqiqiy idempotency log). Group A (Mini-App ochilgan-lekin-obuna-
-- bo'lmagan) BU MIGRATSIYADA YO'Q — alohida trigger turi, keyingi bosqichda.
--
-- 001-052'ga tegilmaydi, faqat qo'shimcha.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- A) notification_templates — admin tahrirlaydigan matnlar (spec bo'lim D).
-- Har bir turning DEFAULT matni shu yerga SEEDланади (pastda insert) — admin
-- tahrirlamagan bo'lsa ham cron ishlashda davom etadi (default matn bilan).
-- ----------------------------------------------------------------------------
create table public.notification_templates (
  type text primary key check (type in (
    'EXPIRY_7D', 'EXPIRY_3D', 'EXPIRY_1D',   -- B: ACTIVE, tugashiga N kun qolganda
    'FROZEN',                                 -- muddati o'tib muzlatilganda
    'GRACE_7D', 'GRACE_1D'                    -- C: muzlatilgan, ma'lumot o'chirilishigacha N kun
  )),
  body text not null,
  image_url text,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.notification_templates (type, body) values
  ('EXPIRY_7D', '⚠️ Obunangiz 7 kundan keyin tugaydi. Do''koningiz uzluksiz ishlashi uchun obunani yangilang.'),
  ('EXPIRY_3D', '⚠️ Obunangiz 3 kundan keyin tugaydi. Do''koningiz uzluksiz ishlashi uchun obunani yangilang.'),
  ('EXPIRY_1D', '⚠️ Obunangiz ertaga tugaydi. Do''koningiz to''xtab qolmasligi uchun hoziroq obunani yangilang.'),
  ('FROZEN', '❄️ Obunangiz tugadi. Do''koningiz vaqtincha muzlatildi.\nMa''lumotlaringiz 30 kun davomida saqlanadi. Shu muddat ichida obunani yangilasangiz, do''koningiz qayta faollashadi.'),
  ('GRACE_7D', '⚠️ Do''koningiz muzlatilgan holatda — ma''lumotlaringiz saqlanadigan muddatning tugashiga 7 kun qoldi. Obunani yangilang.'),
  ('GRACE_1D', '⚠️ Do''koningiz muzlatilgan holatda — ma''lumotlaringiz saqlanadigan muddatning tugashiga 1 kun qoldi. Obunani yangilang, aks holda do''koningiz o''chirilishi mumkin.');

-- ----------------------------------------------------------------------------
-- B) notification_events — HAQIQIY idempotency log (spec bo'lim E).
-- `milestone` — shu bildirishnoma tegishli bo'lgan obuna SIKLINI aniqlaydi
-- (masalan aynan qaysi subscription_expires_at'ga tegishli edi) — shop_id
-- alohida qo'shimcha "subscription_id" ustuni SHART EMAS, chunki
-- expires_at/frozen_at'ning o'zi tabiiy ravishda har yangi sikl uchun
-- boshqacha qiymat bo'ladi (obuna yangilansa eski milestone endi mos
-- kelmaydi, yangi bildirishnoma tabiiy ravishda yuborilishi mumkin bo'ladi).
-- ----------------------------------------------------------------------------
create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  notification_type text not null,
  milestone text not null,
  sent_at timestamptz not null default now(),
  unique (shop_id, notification_type, milestone)
);
create index notification_events_shop_idx on public.notification_events(shop_id);

alter table public.notification_templates enable row level security;
alter table public.notification_events enable row level security;

commit;
