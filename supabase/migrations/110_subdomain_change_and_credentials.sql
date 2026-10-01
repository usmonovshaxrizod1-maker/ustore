-- Let an owner choose another free UStorE subdomain. The row ID stays stable,
-- while routing/DNS/TLS are reset until the new hostname is activated.
begin;

create or replace function public.ustore_domain_state_guard() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.shop_id is distinct from old.shop_id or new.kind is distinct from old.kind then
    raise exception 'domain_identity_immutable';
  end if;
  if new.hostname is distinct from old.hostname and old.kind <> 'SUBDOMAIN' then
    raise exception 'domain_identity_immutable';
  end if;
  if new.status<>old.status and (old.status='REMOVING'
    or (new.status='DRAFT' and not (new.hostname is distinct from old.hostname and old.kind='SUBDOMAIN'))
    or (new.status='ACTIVE' and old.status in ('DRAFT','PENDING_DNS'))) then
    raise exception 'invalid_domain_transition';
  end if;
  if new.status<>'ACTIVE' then new.is_primary=false; end if;
  new.revision=old.revision+1; new.updated_at=now(); return new;
end $$;

create or replace function public.ustore_change_shop_subdomain(
  p_shop_id uuid,p_tg_id text,p_slug text,p_base_hostname text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.shop_domains; v_old_hostname text; v_label text; v_updated integer;
begin
  if not public.ustore_can_manage_domains(p_shop_id,p_tg_id) then raise exception 'forbidden:domains.manage'; end if;
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
    or exists(select 1 from public.shop_reserved_slugs where slug=p_slug) then raise exception 'invalid_slug'; end if;
  if p_base_hostname is null or p_base_hostname<>lower(p_base_hostname) or length(p_base_hostname)>210
    or position('.' in p_base_hostname)=0 then raise exception 'invalid_hostname'; end if;
  foreach v_label in array string_to_array(p_base_hostname,'.') loop
    if v_label !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then raise exception 'invalid_hostname'; end if;
  end loop;
  perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended(p_slug||'.'||p_base_hostname,0));
  select * into r from public.shop_domains where shop_id=p_shop_id and kind='SUBDOMAIN' for update;
  if not found then raise exception 'subdomain_not_found'; end if;
  if r.operation_kind is not null or r.status='REMOVING' then raise exception 'domain_operation_busy'; end if;
  if r.hostname=p_slug||'.'||p_base_hostname then return to_jsonb(r); end if;
  if exists(select 1 from public.shop_domains where hostname=p_slug||'.'||p_base_hostname and shop_id<>p_shop_id)
    or exists(select 1 from public.shop_slug_registry where slug=p_slug and shop_id<>p_shop_id) then
    raise exception 'subdomain_taken';
  end if;
  v_old_hostname:=r.hostname;
  begin
    update public.shop_slug_registry set slug=p_slug where shop_id=p_shop_id;
    get diagnostics v_updated = row_count;
    if v_updated=0 then insert into public.shop_slug_registry(slug,shop_id) values(p_slug,p_shop_id); end if;
  exception when unique_violation then raise exception 'subdomain_taken';
  end;
  update public.shop_domains set hostname=p_slug||'.'||p_base_hostname,status='DRAFT',
    ownership_verified=false,dns_status='UNKNOWN',tls_status='UNKNOWN',routing_ready=false,is_primary=false,
    dns_records='[]'::jsonb,provider_name=null,provider_id=null,last_checked_at=null,error_code=null
    where id=r.id returning * into r;
  insert into public.admin_audit_log(shop_id,admin_tg_id,action,entity_type,entity_id,details)
    values(p_shop_id,p_tg_id,'SUBDOMAIN_CHANGED','DOMAIN',r.id::text,
      jsonb_build_object('old_hostname',v_old_hostname,'new_hostname',r.hostname));
  return to_jsonb(r);
end $$;

revoke all on function public.ustore_change_shop_subdomain(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.ustore_change_shop_subdomain(uuid,text,text,text) to service_role;
commit;

