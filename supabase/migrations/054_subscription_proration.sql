-- ============================================================================
-- USTORE — 054: qiymat-asosli proratsiya (tarif almashtirish moliyaviy hisobi)
-- ============================================================================
-- Spec (session xotirasi, "7. Value-based proration"): tarif o'rtasida
-- almashtirishda (CHANGE, EXTEND emas) qolgan kunlar shunchaki 1:1 ko'chib
-- o'tmasligi kerak — turli narxdagi tariflar orasida bu MOLIYAVIY XATO
-- (arzon tarifdan qimmatiga o'tishda mijoz zarar ko'radi, aksincha bo'lsa
-- UStorE zarar ko'radi). Buning o'rniga: qolgan kunlar PUL QIYMATIGA
-- aylantiriladi (haqiqatan TO'LANGAN summa asosida — hozirgi jonli tarif
-- narxi EMAS, chunki keyin tarif narxi o'zgarsa ham eski to'lovlar
-- o'zgarmasligi kerak), keyin YANGI tarifning kunlik narxida qayta kunlarga
-- aylantiriladi.
--
-- Model (3 ustun, oddiy va aniq — spec'dagi "period_start/period_end"
-- o'rniga bitta evolyutsion "paid_end_at" ustuni ishlatiladi, chunki
-- ko'p marta EXTEND qilingan holatlarda ham aniqlikni yo'qotmaydi):
--   current_period_paid_end_at — TO'LANGAN (bonussiz) qismning tugash sanasi.
--   current_period_daily_rate  — oxirgi haqiqiy to'lovdan hisoblangan
--                                 kunlik narx (paid_amount / paid_days) —
--                                 keyingi CHANGE'da "qolgan qiymat"ni shu
--                                 orqali hisoblaydi, jonli tarif narxidan
--                                 EMAS (retroaktiv o'zgarishning oldini oladi).
--   current_period_bonus_days  — birinchi obunadagi +7 kun bonus, PROratsiya
--                                 hisobiga HECH QACHON aralashmaydi (promo
--                                 imtiyoz, pul qiymati emas), har doim
--                                 o'zgarishsiz ko'chib o'tadi.
--
-- subscription_history — "Obuna tarixi" (admin Shop Detail, spec so'ragan)
-- — har bir to'lov/almashtirish hodisasini to'liq breakdown bilan yozadi.
--
-- 001-053'ga tegilmaydi, faqat qo'shimcha.
-- ============================================================================

begin;

alter table public.shop_settings
  add column if not exists current_period_paid_end_at timestamptz,
  add column if not exists current_period_daily_rate numeric,
  add column if not exists current_period_bonus_days integer not null default 0;

create table public.subscription_history (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  event_type text not null check (event_type in ('NEW', 'EXTEND', 'CHANGE')),
  old_tariff_id uuid references public.tariffs(id) on delete set null,
  old_tariff_name text,
  old_expires_at timestamptz,
  new_tariff_id uuid references public.tariffs(id) on delete set null,
  new_tariff_name text,
  new_expires_at timestamptz not null,
  purchased_days integer not null,
  purchased_amount numeric not null,
  billing_period text not null check (billing_period in ('MONTHLY', 'ANNUAL')),
  remaining_paid_days_before numeric not null default 0,
  remaining_value_converted numeric not null default 0,
  converted_days integer not null default 0,
  bonus_days integer not null default 0,
  created_at timestamptz not null default now()
);
create index subscription_history_shop_idx on public.subscription_history(shop_id, created_at desc);

alter table public.subscription_history enable row level security;

commit;
