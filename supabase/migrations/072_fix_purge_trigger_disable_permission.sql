-- UStorE: 070-migratsiyadagi ustore_purge_shop_completely() jonli ishlatilganda
-- xato berdi:
--
--   ERROR: 42501: permission denied: "RI_ConstraintTrigger_a_18587" is a
--   system trigger
--
-- Sabab: "alter table ... disable trigger all" ICHKI (system) FK-enforcement
-- trigger'larini ham o'chirishga urinadi, buni esa Postgres FAQAT haqiqiy
-- superuser'ga ruxsat beradi — jadval egasiga ham emas. RESET_TEST_SHOPS_
-- EXCEPT_FITCORE.sql'da bu ISHLAGAN edi, chunki u Supabase SQL Editor'da
-- TO'G'RIDAN-TO'G'RI (maxsus imtiyozli dashboard ulanishi bilan) ishga
-- tushirilgan edi. Lekin bu funksiya SECURITY DEFINER sifatida O'ZINING
-- egasi (oddiy "postgres" migratsiya roli, superuser EMAS) nomidan ishlaydi
-- — shuning uchun xuddi shu buyruq funksiya ICHIDA endi ishlamaydi.
--
-- Yechim: "session_replication_role = replica" — bu Supabase'ning "postgres"
-- roli uchun ATAYLAB ruxsat etilgan, superuser talab qilmaydigan MUQOBIL
-- mexanizm (barcha trigger'larni, jumladan tizim FK-trigger'larini ham,
-- joriy sessiya uchun butunlay o'chirib turadi). "SET LOCAL" qilingani
-- uchun funksiya/tranzaksiya tugashi bilan (muvaffaqiyatli tugasa ham, xato
-- chiqib bekor bo'lsa ham) AVTOMATIK asl holatiga qaytadi — alohida "qayta
-- yoqish" qadami endi shart emas (bu eskisidan HAM XAVFSIZROQ: eski usulda
-- agar ENABLE TRIGGER ALL qadamigacha yetib bormay xato chiqsa ham baribir
-- tranzaksiya bekor bo'lgani uchun xavfsiz edi, lekin endi bu haqda
-- o'ylashning O'ZI kerak emas).
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

  -- Composite FK'lar orqali bog'langan jadvallarni ISHONCHLI, tartibsiz
  -- o'chirish uchun — shu TRANZAKSIYA doirasidagina.
  set local session_replication_role = replica;

  -- Shu do'konga tegishli BARCHA mazmun qatorlari (shop_settings/
  -- design_settings/shops/shop_bots/shop_memberships'dan BOSHQA, shop_id
  -- ustuniga ega HAR BIR jadval) o'chiriladi.
  for tbl in
    select table_name from information_schema.columns
    where table_schema = 'public'
      and column_name = 'shop_id'
      and table_name not in ('shop_settings', 'design_settings', 'shops', 'shop_bots', 'shop_memberships')
  loop
    execute format('delete from public.%I where shop_id = $1', tbl.table_name) using p_shop_id;
  end loop;

  delete from public.shop_settings where shop_id = p_shop_id;
  delete from public.design_settings where shop_id = p_shop_id;

  -- Bot ulanishi — bu yerda o'chirilishi ANIQ Telegram bot ID'sini
  -- darhol BO'SHATADI.
  delete from public.shop_bots where shop_id = p_shop_id;

  -- Egalik yozuvi.
  delete from public.shop_memberships where shop_id = p_shop_id;

  -- Do'konning o'zi. Platforma darajasidagi audit jadvallari
  -- (platform_admin_action_log/platform_consent_log/subscription_requests)
  -- shop_id'ni "on delete set null" bilan saqlab qoladi — bu ATAYLAB
  -- shunday (audit tarixi yo'qolmasin).
  delete from public.shops where id = p_shop_id;
end;
$$;

revoke all on function public.ustore_purge_shop_completely(uuid) from public, anon, authenticated;
grant execute on function public.ustore_purge_shop_completely(uuid) to service_role;

commit;
