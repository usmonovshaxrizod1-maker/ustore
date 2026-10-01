-- ============================================================================
-- USTORE GREENFIELD — 027: ADMIN ICHKI IZOH + DO'KON PAUZA REJIMI
-- ============================================================================
-- Online Do'kon Improvements round, items 11 va 13.
--
-- orders.internal_note — faqat admin/xodim ko'radi, mijozga hech qachon
-- qaytarilmaydi (mapOrderForClient()ga qo'shilmaydi — shu bilan "chiqib
-- ketmasligi" backend darajasida kafolatlanadi, frontendni yashirishga
-- suyanmaydi).
--
-- shop_settings.orders_paused — do'kon vaqtincha yangi buyurtma qabul
-- qilmaydi (katalog/narx ko'rishda davom etadi — faqat create_order
-- bloklanadi, server-side).
-- ============================================================================

begin;

alter table public.orders
  add column if not exists internal_note text;

alter table public.shop_settings
  add column if not exists orders_paused boolean not null default false,
  add column if not exists orders_paused_note text;

commit;
