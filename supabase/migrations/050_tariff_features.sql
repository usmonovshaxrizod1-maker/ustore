-- 2026-08-28: tarif xususiyatlar ro'yxati endi BAZADAN boshqariladi, admin
-- Tariflar sahifasidan tahrirlaydi — avval frontend'da hardcode qilingan
-- bitta umumiy ro'yxat (TARIFF_FEATURE_LIST) BARCHA tariflarda bir xil
-- ko'rsatilardi (Start ham, Premium ham aynan bir xil 5 ta xususiyat).
--
-- Mavjud tariflar shu hardcode qilingan matn bilan backfill qilinadi —
-- migratsiyadan keyin hech bir tarif kartasi bo'sh/o'zgargan ko'rinmasin
-- (admin keyin xohlasa har birini alohida tahrirlaydi).
alter table public.tariffs
  add column if not exists features text[] not null default '{}';

update public.tariffs set features = array[
  'Telegram e-do''kon',
  'Katalog va mahsulotlar',
  'Buyurtmalarni boshqarish',
  'Ombor nazorati',
  'Marketing va hisobotlar'
] where features = '{}';
