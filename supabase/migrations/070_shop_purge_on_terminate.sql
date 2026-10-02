-- UStorE: do'kon TERMINATE qilinganda endi Supabase'da HECH QANDAY izi
-- qolmasin (mahsulot/buyurtma/mijoz/banner/sozlama/bot ulanishi/egalik —
-- BARCHASI o'chadi), va bot Telegram ID'si darhol BO'SHAB, o'sha (yoki
-- boshqa) admin uni yangi do'kon sifatida qayta ulay olishi kerak.
--
-- Sxemada bir nechta jadval bir-birini "composite FK" orqali bog'laydi
-- (masalan banners HAM promotions'ga, HAM bundles'ga ishora qiladi) —
-- shuning uchun oddiy "DELETE FROM shops CASCADE" ISHONCHLI EMAS (qaysi
-- tartibda cascade ishlashi Postgres ichida kafolatlanmagan, RESET_TEST_
-- SHOPS_EXCEPT_FITCORE.sql skriptida aynan shu sabab real xato chiqargan
-- edi). Shuning uchun bu funksiya o'sha yerda tasdiqlangan yechimni
-- qayta ishlatadi: mazmun-jadvallarining trigger/FK tekshiruvlarini
-- vaqtincha o'chirib, tozalab, qayta yoqadi — keyin bot/egalik/do'konning
-- o'zini oddiy, muammosiz tartibda o'chiradi.
begin;

create or replace function public.ustore_purge_shop_completely(p_shop_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  tbl record;
begin
  if not exists (select 1 from public.shops where id = p_shop_id) then
    raise exception 'shop_not_found: %', p_shop_id;
  end if;

  -- 1) Mazmun-jadvallarining (shop_settings/design_settings/shops/
  --    shop_bots/shop_memberships'dan BOSHQA, shop_id ustuniga ega HAR
  --    BIR jadval) trigger/FK tekshiruvlarini vaqtincha o'chiramiz.
  for tbl in
    select table_name from information_schema.columns
    where table_schema = 'public'
      and column_name = 'shop_id'
      and table_name not in ('shop_settings', 'design_settings', 'shops', 'shop_bots', 'shop_memberships')
  loop
    execute format('alter table public.%I disable trigger all', tbl.table_name);
  end loop;

  -- 2) Shu do'konga tegishli BARCHA mazmun qatorlari o'chiriladi.
  for tbl in
    select table_name from information_schema.columns
    where table_schema = 'public'
      and column_name = 'shop_id'
      and table_name not in ('shop_settings', 'design_settings', 'shops', 'shop_bots', 'shop_memberships')
  loop
    execute format('delete from public.%I where shop_id = $1', tbl.table_name) using p_shop_id;
  end loop;

  -- 3) Trigger/FK tekshiruvlarini qayta yoqamiz.
  for tbl in
    select table_name from information_schema.columns
    where table_schema = 'public'
      and column_name = 'shop_id'
      and table_name not in ('shop_settings', 'design_settings', 'shops', 'shop_bots', 'shop_memberships')
  loop
    execute format('alter table public.%I enable trigger all', tbl.table_name);
  end loop;

  -- 4) shop_settings/design_settings — endi bemalol o'chirsa bo'ladi
  --    (ular boshqa hech qanday jadval tomonidan composite-FK bilan
  --    ushlab turilmaydi).
  delete from public.shop_settings where shop_id = p_shop_id;
  delete from public.design_settings where shop_id = p_shop_id;

  -- 5) Bot ulanishi — bu yerda o'chirilishi ANIQ Telegram bot ID'sini
  --    darhol BO'SHATADI (shu bot boshqa/o'sha admin tomonidan darhol
  --    qayta ulanishi mumkin bo'ladi — unique cheklov endi to'sqinlik
  --    qilmaydi).
  delete from public.shop_bots where shop_id = p_shop_id;

  -- 6) Egalik yozuvi.
  delete from public.shop_memberships where shop_id = p_shop_id;

  -- 7) Do'konning o'zi. Platforma darajasidagi audit jadvallari
  --    (platform_admin_action_log/platform_consent_log/subscription_requests)
  --    shop_id'ni "on delete set null" bilan saqlab qoladi — bu ATAYLAB
  --    shunday (audit tarixi do'kon o'chgandan keyin ham yo'qolmasligi
  --    kerak), foydalanuvchining "hech qayerda ma'lumot qolmasin" talabi
  --    esa DO'KONNING O'ZIGA tegishli (mahsulot/buyurtma/sozlama/bot/
  --    egalik) — bularning barchasi yuqorida allaqachon o'chirilgan.
  delete from public.shops where id = p_shop_id;
end;
$$;

revoke all on function public.ustore_purge_shop_completely(uuid) from public, anon, authenticated;
grant execute on function public.ustore_purge_shop_completely(uuid) to service_role;

commit;
