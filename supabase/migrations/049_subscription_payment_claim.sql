-- 2026-08-28: obuna to'lovi cheki endi IXTIYORIY (avval majburiy edi).
-- Mijoz chekni hozir biriktira olmasa ham so'rov yuborishi mumkin — keyin
-- to'lovni amalga oshirgach frontend'dagi "To'ladim" tugmasi orqali
-- (platform_confirm_payment_claim action) shu ustunga server vaqti bilan
-- qayd etadi. Chek biriktirilgan holatda esa uning o'zi allaqachon
-- "to'ladim" da'vosi hisoblanadi va so'rov yaratilganda darhol qo'yiladi.
--
-- Muhim: bu ustun HAR DOIM server tomonda (CURRENT_TIMESTAMP orqali,
-- Deno'dagi `new Date().toISOString()`) yoziladi — mijoz brauzeridan
-- vaqt hech qachon qabul qilinmaydi/ishonilmaydi.
--
-- Sof qo'shimcha — 001-048'ga tegilmaydi.
alter table public.subscription_requests
  add column if not exists payment_claimed_at timestamptz;
