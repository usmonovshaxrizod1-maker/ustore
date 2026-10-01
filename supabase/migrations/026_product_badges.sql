-- ============================================================================
-- USTORE GREENFIELD — 026: PRODUCT BADGES (Yangi/Top/Tavsiya/Aksiya)
-- ============================================================================
-- Online Do'kon Improvements round, item 9. Bitta mahsulotga faqat BITTA
-- badge (yoki hech biri) — spec o'zi "5-10 badge bir mahsulotga yig'ilib
-- qolmasin, limit qo'y" deb aytgan, shu bilan limit tabiiy ravishda 1 ga
-- qo'yiladi. Mavjud chegirma-badge (-X%) bilan mustaqil — ikkalasi bir
-- vaqtda ko'rinishi mumkin, konflikt yo'q.
-- ============================================================================

begin;

alter table public.products
  add column if not exists badge text check (badge is null or badge in ('NEW', 'TOP', 'RECOMMENDED', 'PROMO'));

commit;
