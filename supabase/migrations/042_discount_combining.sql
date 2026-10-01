-- ============================================================================
-- UStorE 042 — Chegirmalarni birga ishlatish (promo-kod + bosqichli chegirma +
-- shaxsiy/VIP chegirma) + mijozning shaxsiy chegirmani yoqish/o'chirish huquqi
-- ============================================================================
-- Hozirgacha uchta chegirma turi (promo-kod, bosqichli chegirma, shaxsiy/VIP
-- chegirma) hech qachon QO'SHILMASDI — faqat ENG FOYDALI bittasi ishlardi.
-- Foydalanuvchi so'roviga ko'ra: do'kon egasi Marketing sozlamalaridan
-- "hammasi birga ishlasinmi" deb yoqishi mumkin bo'lishi kerak, ixtiyoriy
-- ravishda umumiy chegirma qancha foizdan oshmasligini ham belgilab.
--
-- STANDART QIYMAT — O'CHIQ (false). Ya'ni bu migratsiya ishga tushgandan
-- keyin ham HECH BIR do'konning xatti-harakati o'zgarmaydi — eski "eng
-- foydalisi ishlaydi" mantig'i (shu jumladan promo+tier'ning o'zaro
-- allow_stacking bayroqlariga asoslangan eski maxsus holat) AYNAN saqlanib
-- qoladi. Yangi imkoniyat faqat do'kon egasi ANIQ yoqqandagina ishga tushadi.

begin;

alter table public.shop_settings
  add column if not exists allow_discount_combining boolean not null default false,
  add column if not exists max_combined_discount_percent numeric(5,2)
    check (max_combined_discount_percent is null or (max_combined_discount_percent > 0 and max_combined_discount_percent <= 100));

-- VIP chegirma o'z ustuniga ega bo'ladi. Avval uning summasi (legacy sabab
-- bilan) promo_discount ustuniga "yashirin" holda yozilardi — combining
-- rejimida uchala son bir vaqtda ko'rinishi kerak bo'lgani uchun bu endi
-- ishlamaydi, shuning uchun to'g'ri, alohida ustun qo'shiladi.
alter table public.orders
  add column if not exists vip_discount numeric(14,2) not null default 0;

-- discount_source endi 'COMBINED' qiymatini ham qabul qiladi (ikki yoki undan
-- ortiq turi bir vaqtda qo'llanganda). Eski qiymatlar ('PROMO','VIP','TIER',
-- 'PROMO_TIER') ham saqlanib qoladi — combining o'chiq bo'lgan do'konlarda
-- va oldin yaratilgan buyurtmalarda ular hali ham to'g'ri.
do $$
declare con_name text;
begin
  select conname into con_name from pg_constraint
   where conrelid = 'public.orders'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%discount_source%';
  if con_name is not null then
    execute format('alter table public.orders drop constraint %I', con_name);
  end if;
end $$;
alter table public.orders
  add constraint orders_discount_source_check
  check (discount_source is null or discount_source in ('PROMO', 'VIP', 'TIER', 'PROMO_TIER', 'COMBINED'));

commit;
