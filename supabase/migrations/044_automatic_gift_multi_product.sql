-- ============================================================================
-- USTORE GREENFIELD — 044: AVTOMATIK SOVG'A — KO'P TRIGGER MAHSULOT QO'LLAB-
-- QUVVATLASH
-- ============================================================================
-- 4-paket, 8-topshiriq: "Muayyan mahsulot(lar) xaridiga sovg'a" turi bir
-- nechta trigger mahsulotni ("Whey Protein + Creatine sotib ol -> BCAA
-- sovg'a", "kamida bittasi" yoki "barchasi") qo'llab-quvvatlashi kerak.
-- Hozirgi `SPECIFIC_PRODUCT` condition_type FAQAT bitta `target_product_id`
-- (uuid) saqlaydi — bu band o'zgartirilmaydi (u endi "Miqdor bo'yicha
-- sovg'a" turi uchun ishlatiladi, threshold_quantity bilan birga).
--
-- Yangi, ADDITIVE ustunlar (mavjud 3 ta condition_type — ORDER_AMOUNT/
-- CATEGORY_QUANTITY/SPECIFIC_PRODUCT — va ularni ishlatuvchi
-- resolveAutomaticGift() branchlari BUTUNLAY o'zgarishsiz qoladi):
--   - target_product_ids jsonb — bir nechta trigger mahsulot id'lari;
--   - match_mode text ('ANY'|'ALL') — "kamida bittasi" / "barchasi".
-- Ikkalasi ham faqat yangi condition_type='SPECIFIC_PRODUCTS' (ko'plik)
-- qatorlarida to'ldiriladi.
-- ============================================================================

begin;

alter table public.automatic_gift_rules
  add column if not exists target_product_ids jsonb,
  add column if not exists match_mode text check (match_mode is null or match_mode in ('ANY', 'ALL'));

-- Mavjud condition_type CHECK constraint'ini dinamik topib, SPECIFIC_PRODUCTS
-- qiymatini qo'shib qayta yaratamiz (033-migratsiyadagi banner naqshi bilan
-- bir xil usul — constraint nomi avtomatik generatsiya qilingan edi).
do $$
declare con_name text;
begin
  select conname into con_name from pg_constraint
   where conrelid = 'public.automatic_gift_rules'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%condition_type%';
  if con_name is not null then
    execute format('alter table public.automatic_gift_rules drop constraint %I', con_name);
  end if;
end $$;
alter table public.automatic_gift_rules
  add constraint automatic_gift_rules_condition_type_check
  check (condition_type in ('ORDER_AMOUNT', 'CATEGORY_QUANTITY', 'SPECIFIC_PRODUCT', 'SPECIFIC_PRODUCTS'));

commit;
