-- Astra 7c: primary routing and takeover-safe cleanup RPCs. Verify remote allocator before apply.
begin;
create or replace function public.ustore_set_primary_domain(p_shop_id uuid,p_tg_id text,p_domain_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_row public.shop_domains;
begin
  if not public.ustore_can_manage_domains(p_shop_id,p_tg_id) then raise exception 'forbidden:domains.manage'; end if;
  select * into v_row from public.shop_domains where id=p_domain_id and shop_id=p_shop_id for update;
  if not found then raise exception 'domain_not_found'; end if;
  if v_row.status<>'ACTIVE' or not v_row.routing_ready then raise exception 'domain_not_active'; end if;
  update public.shop_domains set is_primary=false,updated_at=now() where shop_id=p_shop_id and is_primary and id<>p_domain_id;
  update public.shop_domains set is_primary=true,updated_at=now(),revision=revision+1 where id=p_domain_id returning * into v_row;
  insert into public.admin_audit_log(shop_id,admin_tg_id,action,entity_type,entity_id,details) values(p_shop_id,p_tg_id,'DOMAIN_PRIMARY_CHANGED','DOMAIN',p_domain_id::text,jsonb_build_object('hostname',v_row.hostname));
  return to_jsonb(v_row);
end $$;
create or replace function public.ustore_mark_domain_removing(p_shop_id uuid,p_tg_id text,p_domain_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_row public.shop_domains;
begin
  if not public.ustore_can_manage_domains(p_shop_id,p_tg_id) then raise exception 'forbidden:domains.manage'; end if;
  select * into v_row from public.shop_domains where id=p_domain_id and shop_id=p_shop_id for update;
  if not found then raise exception 'domain_not_found'; end if;
  if v_row.kind<>'CUSTOM' then raise exception 'cannot_remove_default_subdomain'; end if;
  update public.shop_domains set status='REMOVING',routing_ready=false,is_primary=false,updated_at=now(),revision=revision+1 where id=p_domain_id returning * into v_row;
  insert into public.admin_audit_log(shop_id,admin_tg_id,action,entity_type,entity_id,details) values(p_shop_id,p_tg_id,'DOMAIN_REMOVE_REQUESTED','DOMAIN',p_domain_id::text,jsonb_build_object('hostname',v_row.hostname));
  return to_jsonb(v_row);
end $$;
create or replace function public.ustore_finalize_domain_removal(p_shop_id uuid,p_tg_id text,p_domain_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_row public.shop_domains;
begin
  if not public.ustore_can_manage_domains(p_shop_id,p_tg_id) then raise exception 'forbidden:domains.manage'; end if;
  select * into v_row from public.shop_domains where id=p_domain_id and shop_id=p_shop_id and status='REMOVING' for update;
  if not found then raise exception 'domain_not_removing'; end if;
  delete from public.shop_domains where id=p_domain_id;
  insert into public.admin_audit_log(shop_id,admin_tg_id,action,entity_type,entity_id,details) values(p_shop_id,p_tg_id,'DOMAIN_REMOVED','DOMAIN',p_domain_id::text,jsonb_build_object('hostname',v_row.hostname));
  return to_jsonb(v_row);
end $$;
revoke all on function public.ustore_set_primary_domain(uuid,text,uuid), public.ustore_mark_domain_removing(uuid,text,uuid), public.ustore_finalize_domain_removal(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.ustore_set_primary_domain(uuid,text,uuid), public.ustore_mark_domain_removing(uuid,text,uuid), public.ustore_finalize_domain_removal(uuid,text,uuid) to service_role;
commit;
