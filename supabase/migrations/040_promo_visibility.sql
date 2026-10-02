-- ============================================================================
-- UStorE 040 — Promo-kod ko'rinuvchanligi: ochiq (e'lon qilingan) va
-- yashirin (faqat kodni bilgan odam ishlatadigan) kodlar
-- ============================================================================
-- Maqsad (foydalanuvchi so'rovi): do'kon egasi blogger/reklama beruvchiga
-- shaxsiy promo-kod berib, uni do'kondagi ommaviy "Aksiyalar va chegirmalar"
-- ro'yxatida KO'RSATMASLIGI kerak. Kodning o'zi ishlashda davom etadi —
-- reklamani ko'rgan mijoz kodni checkout'da yozsa, chegirma tushadi. Shu
-- tarzda do'kon egasi o'sha reklamadan qancha xarid kelganini aniq biladi
-- (har bir kod bo'yicha ishlatilish soni promo_list'da allaqachon
-- ko'rsatiladi — promotion_redemptions jadvalidan hisoblanadi).
--
-- Additive va xavfsiz: mavjud jadvalga faqat bitta yangi ustun qo'shiladi.
-- DEFAULT true — ya'ni bugungi barcha promo-kodlar avvalgidek ochiq qoladi,
-- hech qanday mavjud xatti-harakat o'zgarmaydi.
--
-- MUHIM (chalkashmaslik uchun): bu ustun `transferable` (038-migratsiya) va
-- `issued_to_tg_id` (033-migratsiya) bilan BOSHQA narsani anglatadi:
--   - is_public       -> kod ommaviy RO'YXATDA ko'rinadimi (reklama uchun);
--   - issued_to_tg_id -> kod shaxsan kimga biriktirilgan (reward kodlari);
--   - transferable    -> biriktirilgan kodni boshqa odam ishlata oladimi.
-- Yashirin kod odatda hech kimga biriktirilmaydi (issued_to_tg_id = null),
-- shuning uchun uni kodni bilgan HAR KIM ishlata oladi — reklama uchun aynan
-- shu kerak.

begin;

alter table public.promotions
  add column if not exists is_public boolean not null default true;

-- Ommaviy ro'yxat so'rovi (get_marketing_campaigns) aynan shu uch ustun
-- bo'yicha filtrlaydi, shuning uchun indeks ham shularni qamrab oladi.
create index if not exists promotions_shop_public_idx
  on public.promotions(shop_id, is_active, is_public);

commit;
