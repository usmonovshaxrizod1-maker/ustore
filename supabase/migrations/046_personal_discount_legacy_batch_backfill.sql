-- ==========================================================================
-- USTORE GREENFIELD — 046: SHAXSIY CHEGIRMALAR — LEGACY BATCH BACKFILL
-- ==========================================================================
-- 045 dan OLDIN bitta bulk create ichida bir nechta mijozga berilgan bir xil
-- customer_discounts qatorlarida batch_id NULL bo'lishi mumkin. Admin
-- Marketing -> Shaxsiy chegirmalar ro'yxatida bunday qatorlar alohida
-- kartalar bo'lib ko'rinmasligi kerak.
--
-- Xavfsizlik: faqat BIR XIL DB statement/transactionda yaratilganini juda
-- kuchli ko'rsatuvchi aniq `created_at` + bir xil barcha chegirma parametrli
-- NULL batch_id qatorlar guruhlanadi. Bitta mijozlik legacy qatorga tegilmaydi.
-- Checkout hisob-kitobi o'zgarmaydi: har mijozning individual qatori saqlanadi;
-- batch_id faqat admin list/detail guruhlash uchun.
-- ==========================================================================

begin;

with legacy_groups as (
  select
    array_agg(id order by id) as ids,
    gen_random_uuid() as new_batch_id
  from public.customer_discounts
  where batch_id is null
  group by
    shop_id,
    created_by,
    created_at,
    discount_type,
    discount_value,
    starts_at,
    ends_at,
    name,
    min_order_amount,
    max_order_amount,
    usage_limit
  having count(*) > 1
),
pairs as (
  select unnest(ids) as id, new_batch_id
  from legacy_groups
)
update public.customer_discounts d
   set batch_id = p.new_batch_id
  from pairs p
 where d.id = p.id
   and d.batch_id is null;

commit;
