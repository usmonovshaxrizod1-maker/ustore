-- UStorE: do'konni butunlay o'chirganda platforma auditi va obuna tarixi
-- yo'qolmasin. Savdo ma'lumotlari o'chiriladi, tarixdagi shop_id esa
-- archived_shop_id ga ko'chirilib, faol shops jadvaliga bog'lanish uziladi.
begin;

create table if not exists public.shop_deletion_archive (
  id uuid primary key default gen_random_uuid(),
  original_shop_id uuid not null,
  shop_name text,
  public_code text,
  owner_telegram_id text,
  reason text not null,
  deleted_by text not null,
  previous_status text,
  storage_cleanup jsonb not null default '{}'::jsonb,
  backup_id uuid,
  deleted_at timestamptz not null default now()
);
create index if not exists shop_deletion_archive_original_idx
  on public.shop_deletion_archive(original_shop_id, deleted_at desc);
alter table public.shop_deletion_archive enable row level security;

alter table public.platform_admin_action_log
  add column if not exists archived_shop_id uuid;
alter table public.platform_consent_log
  add column if not exists archived_shop_id uuid;
alter table public.subscription_requests
  add column if not exists archived_shop_id uuid;
alter table public.subscription_history
  add column if not exists archived_shop_id uuid,
  alter column shop_id drop not null;
alter table public.platform_lifecycle_notification_log
  add column if not exists archived_shop_id uuid,
  alter column shop_id drop not null;

-- UPGRADE so'rovi o'chirilgan do'kon tarixiga bog'langan bo'lsa ham
-- tarixiy qator sifatida yaroqli bo'lib qoladi.
do $$
declare con_name text;
begin
  select c.conname into con_name
  from pg_constraint c
  where c.conrelid = 'public.subscription_requests'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%kind%shop_id%';
  if con_name is not null then
    execute format('alter table public.subscription_requests drop constraint %I', con_name);
  end if;
end $$;
alter table public.subscription_requests
  add constraint subscription_requests_shop_kind_check
  check (
    (kind = 'NEW_SHOP' and shop_id is null)
    or (kind = 'UPGRADE' and (shop_id is not null or archived_shop_id is not null))
  );

create or replace function public.ustore_purge_shop_completely(
  p_shop_id uuid,
  p_reason text,
  p_admin_tg_id text,
  p_shop_name text,
  p_public_code text,
  p_owner_tg_id text,
  p_previous_status text,
  p_storage_cleanup jsonb default '{}'::jsonb,
  p_backup_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  tbl record;
  archive_id uuid;
begin
  if not exists (select 1 from public.shops where id = p_shop_id) then
    raise exception 'shop_not_found: %', p_shop_id;
  end if;
  if coalesce(trim(p_reason), '') = '' or coalesce(trim(p_admin_tg_id), '') = '' then
    raise exception 'deletion_audit_required';
  end if;

  insert into public.shop_deletion_archive(
    original_shop_id, shop_name, public_code, owner_telegram_id, reason,
    deleted_by, previous_status, storage_cleanup, backup_id
  ) values (
    p_shop_id, p_shop_name, p_public_code, p_owner_tg_id, trim(p_reason),
    p_admin_tg_id, p_previous_status, coalesce(p_storage_cleanup, '{}'::jsonb), p_backup_id
  ) returning id into archive_id;

  -- Tarixiy qatorlarda asl ID alohida saqlanadi; faol do'konga FK uziladi.
  update public.platform_admin_action_log
    set archived_shop_id = coalesce(archived_shop_id, shop_id), shop_id = null
    where shop_id = p_shop_id;
  update public.platform_consent_log
    set archived_shop_id = coalesce(archived_shop_id, shop_id), shop_id = null
    where shop_id = p_shop_id;
  update public.subscription_requests
    set archived_shop_id = coalesce(archived_shop_id, shop_id), shop_id = null
    where shop_id = p_shop_id;
  update public.subscription_history
    set archived_shop_id = coalesce(archived_shop_id, shop_id), shop_id = null
    where shop_id = p_shop_id;
  update public.platform_lifecycle_notification_log
    set archived_shop_id = coalesce(archived_shop_id, shop_id), shop_id = null
    where shop_id = p_shop_id;

  -- Composite FK'lar sabab tartibga bog'liq bo'lmaslik uchun faqat shu
  -- tranzaksiya doirasida triggerlar o'chiriladi.
  set local session_replication_role = replica;

  for tbl in
    select table_name from information_schema.columns
    where table_schema = 'public'
      and column_name = 'shop_id'
      and table_name not in (
        'shop_settings', 'design_settings', 'shops', 'shop_bots', 'shop_memberships',
        'platform_admin_action_log', 'platform_consent_log', 'subscription_requests',
        'subscription_history', 'platform_lifecycle_notification_log'
      )
  loop
    execute format('delete from public.%I where shop_id = $1', tbl.table_name) using p_shop_id;
  end loop;

  delete from public.shop_settings where shop_id = p_shop_id;
  delete from public.design_settings where shop_id = p_shop_id;
  delete from public.shop_bots where shop_id = p_shop_id;
  delete from public.shop_memberships where shop_id = p_shop_id;
  delete from public.shops where id = p_shop_id;

  return archive_id;
end;
$$;

revoke all on function public.ustore_purge_shop_completely(uuid,text,text,text,text,text,text,jsonb,uuid)
  from public, anon, authenticated;
grant execute on function public.ustore_purge_shop_completely(uuid,text,text,text,text,text,text,jsonb,uuid)
  to service_role;

-- Eski chaqiruvlar xavfli tarzda auditsiz o'chirmasin.
create or replace function public.ustore_purge_shop_completely(p_shop_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'deletion_audit_required: use audited purge function for %', p_shop_id;
end;
$$;
revoke all on function public.ustore_purge_shop_completely(uuid) from public, anon, authenticated;
grant execute on function public.ustore_purge_shop_completely(uuid) to service_role;

commit;
