-- ============================================================================
-- USTORE GREENFIELD — 032: EGALIKNI TOPSHIRISH (atomik RPC)
-- ============================================================================
-- Admin Roles & Permissions round, 2.3-bosqich. Owner-only, boshqa hech
-- qanday rol/permission orqali berilmaydigan yagona amal — shu sabab alohida
-- RPC, shop-api darajasida requirePermission() emas, qo'lda "faqat OWNER"
-- tekshiruvi bilan chaqiriladi (keyingi bosqich).
--
-- Atomiklik: yangi egani OWNER qilish VA eski egani tushirish/o'chirish
-- BIR plpgsql funksiya ichida — Postgres buni avtomatik BITTA tranzaksiya
-- sifatida bajaradi, shuning uchun yarim bajarilgan holat (masalan ikkala
-- taraf ham OWNER, yoki hech kim OWNER emas) hech qachon saqlanib qolmaydi.
-- ============================================================================

begin;

create or replace function public.transfer_shop_ownership(
  p_shop_id uuid,
  p_from_tg_id bigint,
  p_to_tg_id bigint,
  p_old_owner_new_role text -- 'STAFF' yoki 'REMOVE'
) returns void
language plpgsql
as $$
begin
  if p_old_owner_new_role not in ('STAFF', 'REMOVE') then
    raise exception 'invalid_old_owner_new_role:%', p_old_owner_new_role;
  end if;
  if p_from_tg_id = p_to_tg_id then
    raise exception 'same_user';
  end if;

  if not exists (
    select 1 from public.shop_memberships
    where shop_id = p_shop_id and telegram_user_id = p_from_tg_id and role = 'OWNER' and status = 'ACTIVE'
  ) then
    raise exception 'forbidden:not_owner';
  end if;

  -- Maqsad — ALLAQACHON shu do'konning faol a'zosi bo'lishi kerak (notanish
  -- kishiga to'g'ridan-to'g'ri egalik berilmaydi — avval taklif/rol orqali
  -- xodim bo'lishi kerak).
  if not exists (
    select 1 from public.shop_memberships
    where shop_id = p_shop_id and telegram_user_id = p_to_tg_id and status = 'ACTIVE'
  ) then
    raise exception 'target_not_active_member';
  end if;

  update public.shop_memberships set role = 'OWNER'
   where shop_id = p_shop_id and telegram_user_id = p_to_tg_id;

  -- Yangi Owner endi rollar/permissions tizimidan mustasno (Owner rol
  -- emas) — eski xodimlik rollari (agar bo'lsa) endi ma'nosiz, tozalanadi.
  delete from public.membership_roles where shop_id = p_shop_id and telegram_user_id = p_to_tg_id;

  if p_old_owner_new_role = 'REMOVE' then
    delete from public.shop_memberships where shop_id = p_shop_id and telegram_user_id = p_from_tg_id;
  else
    update public.shop_memberships set role = 'STAFF'
     where shop_id = p_shop_id and telegram_user_id = p_from_tg_id;
  end if;
end;
$$;

revoke all on function public.transfer_shop_ownership(uuid, bigint, bigint, text) from public, anon, authenticated;
grant execute on function public.transfer_shop_ownership(uuid, bigint, bigint, text) to service_role;

commit;
