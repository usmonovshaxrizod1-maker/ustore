-- Service-role-only platform support for a shop's domain. The platform actor
-- is recorded explicitly; no shop owner identity is borrowed for the action.
begin;
create or replace function public.ustore_platform_change_shop_subdomain(
  p_shop_id uuid, p_actor_tg_id text, p_slug text, p_base_hostname text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.shop_domains; v_old text; v_label text; v_updated integer;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
    or exists(select 1 from public.shop_reserved_slugs where slug=p_slug) then raise exception 'invalid_slug'; end if;
  if p_base_hostname is null or p_base_hostname<>lower(p_base_hostname) or length(p_base_hostname)>210
    or position('.' in p_base_hostname)=0 then raise exception 'invalid_hostname'; end if;
  foreach v_label in array string_to_array(p_base_hostname,'.') loop
    if v_label !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then raise exception 'invalid_hostname'; end if;
  end loop;
  if not exists(select 1 from public.shops where id=p_shop_id and status<>'TERMINATED') then raise exception 'shop_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended(p_slug||'.'||p_base_hostname,0));
  select * into r from public.shop_domains where shop_id=p_shop_id and kind='SUBDOMAIN' for update;
  if not found then raise exception 'subdomain_not_found'; end if;
  if r.operation_kind is not null or r.status='REMOVING' then raise exception 'domain_operation_busy'; end if;
  if r.hostname=p_slug||'.'||p_base_hostname then return to_jsonb(r); end if;
  if exists(select 1 from public.shop_domains where hostname=p_slug||'.'||p_base_hostname and shop_id<>p_shop_id)
    or exists(select 1 from public.shop_slug_registry where slug=p_slug and shop_id<>p_shop_id) then raise exception 'subdomain_taken'; end if;
  v_old:=r.hostname;
  begin
    update public.shop_slug_registry set slug=p_slug where shop_id=p_shop_id;
    get diagnostics v_updated = row_count;
    if v_updated=0 then insert into public.shop_slug_registry(slug,shop_id) values(p_slug,p_shop_id); end if;
  exception when unique_violation then raise exception 'subdomain_taken'; end;
  update public.shop_domains set hostname=p_slug||'.'||p_base_hostname,status='DRAFT',
    ownership_verified=false,dns_status='UNKNOWN',tls_status='UNKNOWN',routing_ready=false,is_primary=false,
    dns_records='[]'::jsonb,provider_name=null,provider_id=null,last_checked_at=null,error_code=null
    where id=r.id returning * into r;
  update public.shop_settings set telegram_mini_app_domain_id=null,telegram_mini_app_updated_at=now()
    where shop_id=p_shop_id and telegram_mini_app_domain_id=r.id;
  insert into public.admin_audit_log(shop_id,admin_tg_id,action,entity_type,entity_id,details)
    values(p_shop_id,p_actor_tg_id,'PLATFORM_SUBDOMAIN_CHANGED','DOMAIN',r.id::text,
      jsonb_build_object('old_hostname',v_old,'new_hostname',r.hostname));
  return to_jsonb(r);
end $$;

create or replace function public.ustore_platform_set_primary_domain(
  p_shop_id uuid, p_actor_tg_id text, p_domain_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.shop_domains; v_old text;
begin
  perform pg_advisory_xact_lock(hashtextextended('domain-primary:'||p_shop_id::text,0));
  select * into r from public.shop_domains where id=p_domain_id and shop_id=p_shop_id for update;
  if not found then raise exception 'domain_not_found'; end if;
  if r.status<>'ACTIVE' or not r.routing_ready then raise exception 'domain_not_active'; end if;
  if r.operation_kind is not null then raise exception 'domain_operation_busy'; end if;
  select hostname into v_old from public.shop_domains where shop_id=p_shop_id and is_primary;
  update public.shop_domains set is_primary=false where shop_id=p_shop_id and is_primary and id<>p_domain_id;
  update public.shop_domains set is_primary=true where id=p_domain_id returning * into r;
  insert into public.admin_audit_log(shop_id,admin_tg_id,action,entity_type,entity_id,details)
    values(p_shop_id,p_actor_tg_id,'PLATFORM_DOMAIN_PRIMARY_CHANGED','DOMAIN',p_domain_id::text,
      jsonb_build_object('old_hostname',v_old,'new_hostname',r.hostname));
  return to_jsonb(r);
end $$;
revoke all on function public.ustore_platform_change_shop_subdomain(uuid,text,text,text),
  public.ustore_platform_set_primary_domain(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.ustore_platform_change_shop_subdomain(uuid,text,text,text),
  public.ustore_platform_set_primary_domain(uuid,text,uuid) to service_role;
commit;
