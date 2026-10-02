-- ============================================================================
-- USTORE GREENFIELD — 029: BOSH SAHIFA — TANLANGAN KATALOGLAR QATORI
-- ============================================================================
-- Foydalanuvchi so'rovi: qidiruv ostida, banner ustida — admin tanlagan
-- (eng ko'pi 8 ta) kataloglar qatori. Bosilganda o'sha katalogning
-- tovarlari ko'rsatiladi (mavjud Kataloglar sahifasi qayta ishlatiladi,
-- yangi ro'yxat/filtr logikasi yozilmaydi).
-- ============================================================================

begin;

alter table public.shop_settings
  add column if not exists featured_category_ids jsonb not null default '[]'::jsonb;

commit;
