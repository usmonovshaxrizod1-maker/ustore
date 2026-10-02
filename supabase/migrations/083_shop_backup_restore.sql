-- UStorE: shopni ZIP ko'rinishida to'liq biznes-backup qilish va o'sha ZIPni
-- qayta tiklash. Provider/BILLZ/bot maxfiy ma'lumotlari ataylab chiqarilmaydi.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-backups', 'shop-backups', false, 524288000, array['application/zip'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.shop_backups (
  id uuid primary key default gen_random_uuid(),
  original_shop_id uuid not null,
  shop_name text,
  storage_path text not null unique,
  size_bytes bigint not null default 0,
  row_count integer not null default 0,
  file_count integer not null default 0,
  status text not null default 'READY' check (status in ('CREATING','READY','RESTORED','FAILED')),
  created_by text not null,
  created_at timestamptz not null default now(),
  restored_at timestamptz,
  restored_by text
);
create index if not exists shop_backups_shop_created_idx
  on public.shop_backups(original_shop_id, created_at desc);
alter table public.shop_backups enable row level security;

do $$
declare con_name text;
begin
  select c.conname into con_name from pg_constraint c
  where c.conrelid='public.platform_admin_action_log'::regclass and c.contype='c'
    and pg_get_constraintdef(c.oid) ilike '%action%';
  if con_name is not null then execute format('alter table public.platform_admin_action_log drop constraint %I',con_name); end if;
end $$;
alter table public.platform_admin_action_log
  add constraint platform_admin_action_log_action_check
  check (action in ('GRANT_DAYS','FREEZE','REACTIVATE','TERMINATE','EXTEND_FROZEN_GRACE','RESTORE_BACKUP'));

create or replace function public.ustore_build_shop_backup_data(p_shop_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  tbl record;
  rows_json jsonb;
  result jsonb := '{}'::jsonb;
  shop_json jsonb;
begin
  select to_jsonb(s) into shop_json from public.shops s where s.id=p_shop_id;
  if shop_json is null then raise exception 'shop_not_found'; end if;
  result := jsonb_set(result, '{shops}', jsonb_build_array(shop_json));

  for tbl in
    select distinct c.table_name
    from information_schema.columns c
    where c.table_schema='public' and c.column_name='shop_id'
      and c.table_name not in (
        'shops','shop_bots','billz_connections','click_connections','payme_connections','uzum_connections',
        'platform_admin_action_log','platform_consent_log','platform_lifecycle_notification_log',
        'platform_admin_tasks','subscription_requests','subscription_history','shop_deletion_archive'
      )
    order by c.table_name
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), ''[]''::jsonb) from public.%I t where shop_id=$1', tbl.table_name)
      into rows_json using p_shop_id;
    result := jsonb_set(result, array[tbl.table_name], coalesce(rows_json,'[]'::jsonb));
  end loop;
  return result;
end;
$$;
revoke all on function public.ustore_build_shop_backup_data(uuid) from public,anon,authenticated;
grant execute on function public.ustore_build_shop_backup_data(uuid) to service_role;

create or replace function public.ustore_restore_shop_backup_data(p_manifest jsonb, p_data jsonb, p_restored_by text)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_shop_id uuid;
  v_shop_row jsonb;
  entry record;
  row_json jsonb;
  seq_name text;
  max_id bigint;
begin
  if coalesce((p_manifest->>'formatVersion')::int,0) <> 1 then raise exception 'unsupported_backup_format'; end if;
  if coalesce(trim(p_restored_by),'')='' then raise exception 'restore_audit_required'; end if;
  v_shop_id := nullif(p_manifest->>'shopId','')::uuid;
  if v_shop_id is null then raise exception 'backup_shop_id_missing'; end if;
  if exists(select 1 from public.shops where id=v_shop_id) then raise exception 'shop_already_exists'; end if;

  v_shop_row := p_data->'shops'->0;
  if v_shop_row is null or nullif(v_shop_row->>'id','')::uuid <> v_shop_id then raise exception 'backup_shop_mismatch'; end if;
  -- Tokenlar backupda yo'q: do'kon tiklangach bot va integratsiyalar qayta
  -- ulanishi uchun xavfsiz PROVISIONING holatiga qaytadi.
  v_shop_row := v_shop_row || jsonb_build_object(
    'status','PROVISIONING','billz_access_granted',false,'click_access_granted',false,
    'payme_access_granted',false,'uzum_access_granted',false
  );

  set local session_replication_role=replica;
  insert into public.shops overriding system value
    select (jsonb_populate_record(null::public.shops,v_shop_row)).*;

  for entry in select key,value from jsonb_each(p_data) where key <> 'shops' order by key loop
    if entry.key in (
      'shop_bots','billz_connections','click_connections','payme_connections','uzum_connections',
      'platform_admin_action_log','platform_consent_log','platform_lifecycle_notification_log',
      'platform_admin_tasks','subscription_requests','subscription_history','shop_deletion_archive','shop_backups'
    ) then continue; end if;
    if to_regclass(format('public.%I',entry.key)) is null then continue; end if;
    if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=entry.key and column_name='shop_id') then continue; end if;
    for row_json in select value from jsonb_array_elements(entry.value) loop
      if nullif(row_json->>'shop_id','')::uuid is distinct from v_shop_id then raise exception 'backup_cross_shop_row:%', entry.key; end if;
      execute format('insert into public.%I overriding system value select (jsonb_populate_record(null::public.%I,$1)).*',entry.key,entry.key)
        using row_json;
    end loop;

    select pg_get_serial_sequence(format('public.%I',entry.key),'id') into seq_name;
    if seq_name is not null then
      execute format('select max(id)::bigint from public.%I',entry.key) into max_id;
      if max_id is not null then perform setval(seq_name,max_id,true); end if;
    end if;
  end loop;
  insert into public.platform_admin_action_log(admin_tg_id,shop_id,action,details)
  values(p_restored_by,v_shop_id,'RESTORE_BACKUP',jsonb_build_object('formatVersion',1,'restoredFromZip',true));
  return v_shop_id;
end;
$$;
revoke all on function public.ustore_restore_shop_backup_data(jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.ustore_restore_shop_backup_data(jsonb,jsonb,text) to service_role;

commit;
