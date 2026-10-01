-- ============================================================================
-- USTORE GREENFIELD — 030: BEKOR QILISH TAKOMILLASHTIRUVI + QAYTARISH MUROJAATI
-- ============================================================================
-- Online Do'kon Improvements round, items 14 va 15.
--
-- customer_cancel_cutoff — seller qaysi bosqichgacha mijoz o'zi bekor qila
-- olishini belgilaydi. Order status enumi (NEW/PROCESSING/DELIVERED/
-- CANCELLED) o'zi bosqichni yetarlicha aniqlamaydi (masalan "yo'lda" —
-- shipment.status ichida, alohida order-status emas), shuning uchun
-- tekshiruv shop-api'da (JS, shipment JSON'ga to'g'ridan-to'g'ri kirish
-- bilan) amalga oshiriladi, RPC'ga yana bir marta tegilmaydi.
--
-- return_requests_enabled — "Qaytarish/muammo" tugmasini seller butunlay
-- o'chirib qo'yishi mumkin (oddiy Yordam/Support esa har doim ishlaydi).
-- ============================================================================

begin;

alter table public.shop_settings
  add column if not exists customer_cancel_cutoff text not null default 'BEFORE_SHIPPED'
    check (customer_cancel_cutoff in ('NEW_ONLY', 'BEFORE_SHIPPED', 'ANY_NON_TERMINAL')),
  add column if not exists return_requests_enabled boolean not null default true;

alter table public.support_tickets
  add column if not exists ticket_type text not null default 'SUPPORT' check (ticket_type in ('SUPPORT', 'RETURN'));

commit;
