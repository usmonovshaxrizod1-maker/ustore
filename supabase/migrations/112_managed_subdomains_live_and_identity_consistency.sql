-- USTORE 112 — production wildcard routing is live on ustr.uz.
-- 1) Never allocate opaque random subdomains again; collisions use readable numbers.
-- 2) Repair legacy auto-generated hash subdomains for existing shops where it is safe.
-- 3) Mark every managed *.ustr.uz subdomain routable/ACTIVE through valid state transitions.
-- 4) Re-run Telegram account_id backfill for historic rows so web + Mini App share one profile.
begin;

create or replace function public.ustore_ensure_shop_subdomain(
  p_shop_id uuid, p_name text, p_base_hostname text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_row public.shop_domains;
  v_base text;
  v_candidate text;
  v_label text;
  v_attempt integer := 0;
begin
  if p_base_hostname is null or p_base_hostname <> lower(p_base_hostname)
    or length(p_base_hostname)>210 or position('.' in p_base_hostname)=0 then
    raise exception 'invalid_hostname';
  end if;
  foreach v_label in array string_to_array(p_base_hostname,'.') loop
    if v_label !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then raise exception 'invalid_hostname'; end if;
  end loop;
  if split_part(p_base_hostname,'.',array_length(string_to_array(p_base_hostname,'.'),1)) !~ '^[a-z][a-z0-9-]*$' then
    raise exception 'invalid_hostname';
  end if;
  perform 1 from public.shops where id=p_shop_id
    and status in ('PROVISIONING','ACTIVE','DISABLED','FROZEN') for update;
  if not found then raise exception 'shop_unavailable'; end if;
  select * into v_row from public.shop_domains where shop_id=p_shop_id and kind='SUBDOMAIN';
  if found then return to_jsonb(v_row); end if;
  v_base := trim(both '-' from left(regexp_replace(lower(coalesce(p_name,'')), '[^a-z0-9]+', '-', 'g'),28));
  if length(v_base)<3 then v_base := 'shop'; end if;
  loop
    v_candidate := case when v_attempt=0 then v_base
      else left(v_base, greatest(3, 38-length((v_attempt+1)::text))) || (v_attempt+1)::text end;
    if not exists(select 1 from public.shop_reserved_slugs where slug=v_candidate) then
      begin
        insert into public.shop_slug_registry(slug,shop_id) values(v_candidate,p_shop_id);
        insert into public.shop_domains(shop_id,hostname,kind)
          values(p_shop_id,v_candidate||'.'||p_base_hostname,'SUBDOMAIN') returning * into v_row;
        return to_jsonb(v_row);
      exception when unique_violation then
        null;
      end;
    end if;
    v_attempt := v_attempt+1;
    if v_attempt>=999 then raise exception 'subdomain_allocation_failed'; end if;
  end loop;
end;
$$;
revoke all on function public.ustore_ensure_shop_subdomain(uuid,text,text) from public,anon,authenticated;
grant execute on function public.ustore_ensure_shop_subdomain(uuid,text,text) to service_role;

-- Activate one managed wildcard subdomain when infrastructure has been proven live.
create or replace function public.ustore_activate_shop_subdomain(
  p_shop_id uuid, p_base_hostname text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.shop_domains;
begin
  select * into r from public.shop_domains
   where shop_id=p_shop_id and kind='SUBDOMAIN'
     and hostname like '%.'||p_base_hostname
   for update;
  if not found then raise exception 'subdomain_not_found'; end if;
  if r.status='REMOVING' then raise exception 'domain_operation_busy'; end if;
  if r.status in ('DRAFT','PENDING_DNS') then
    update public.shop_domains set status='VERIFYING',error_code=null,last_checked_at=now()
      where id=r.id returning * into r;
  end if;
  update public.shop_domains set ownership_verified=true,dns_status='VERIFIED',tls_status='ACTIVE',
    routing_ready=true,status='ACTIVE',error_code=null,last_checked_at=now()
    where id=r.id returning * into r;
  return to_jsonb(r);
end $$;
revoke all on function public.ustore_activate_shop_subdomain(uuid,text) from public,anon,authenticated;
grant execute on function public.ustore_activate_shop_subdomain(uuid,text) to service_role;

-- Rename only allocator-generated legacy hashes. User-chosen subdomains are untouched.
do $$
declare
  r record;
  v_base text;
  v_slug text;
  v_candidate text;
  v_attempt integer;
  v_current text;
begin
  for r in
    select s.id,
      coalesce(nullif(trim(ss.name),''),nullif(trim(b.bot_name),''),nullif(trim(b.bot_username),''),s.public_code,'shop') source_name,
      d.id domain_id,d.hostname
    from public.shops s
    join public.shop_domains d on d.shop_id=s.id and d.kind='SUBDOMAIN'
    left join public.shop_settings ss on ss.shop_id=s.id
    left join lateral (
      select sb.bot_name,sb.bot_username from public.shop_bots sb where sb.shop_id=s.id
      order by (sb.status='ACTIVE') desc,sb.created_at asc limit 1
    ) b on true
    where d.hostname like '%.ustr.uz'
    order by s.created_at,s.id
  loop
    v_current := split_part(r.hostname,'.',1);
    v_base := trim(both '-' from left(regexp_replace(lower(coalesce(r.source_name,'')), '[^a-z0-9]+', '-', 'g'),28));
    if length(v_base)<3 then v_base := 'shop'; end if;
    -- Old 109/111 allocations ended in exactly 10 hex chars. Do not rewrite a
    -- subdomain that the owner/manager has explicitly changed through migration 110.
    if v_current !~ '^[a-z0-9][a-z0-9-]*-[0-9a-f]{10}$' then
      continue;
    end if;
    if exists(
      select 1 from public.admin_audit_log a
      where a.shop_id=r.id and a.action='SUBDOMAIN_CHANGED'
        and a.entity_type='DOMAIN' and a.entity_id=r.domain_id::text
    ) then
      continue;
    end if;
    v_attempt := 0;
    loop
      v_candidate := case when v_attempt=0 then v_base
        else left(v_base, greatest(3,38-length((v_attempt+1)::text)))||(v_attempt+1)::text end;
      if not exists(select 1 from public.shop_reserved_slugs where slug=v_candidate)
        and not exists(select 1 from public.shop_slug_registry where slug=v_candidate and shop_id<>r.id)
        and not exists(select 1 from public.shop_domains where hostname=v_candidate||'.ustr.uz' and shop_id<>r.id) then
        exit;
      end if;
      v_attempt := v_attempt+1;
      if v_attempt>=999 then raise exception 'subdomain_allocation_failed'; end if;
    end loop;
    update public.shop_slug_registry set slug=v_candidate where shop_id=r.id;
    if not found then insert into public.shop_slug_registry(slug,shop_id) values(v_candidate,r.id); end if;
    update public.shop_domains set hostname=v_candidate||'.ustr.uz' where id=r.domain_id;
  end loop;
end $$;

-- Wildcard DNS + HTTPS + Worker routing have been configured for *.ustr.uz.
-- Apply to both old and new existing managed subdomains, through a valid transition.
update public.shop_domains d set status='VERIFYING',error_code=null,last_checked_at=now()
 from public.shops s
 where d.shop_id=s.id and d.kind='SUBDOMAIN' and d.hostname like '%.ustr.uz'
   and s.status in ('PROVISIONING','ACTIVE','DISABLED','FROZEN')
   and d.status in ('DRAFT','PENDING_DNS');
update public.shop_domains d set ownership_verified=true,dns_status='VERIFIED',tls_status='ACTIVE',
  routing_ready=true,status='ACTIVE',error_code=null,last_checked_at=now()
 from public.shops s
 where d.shop_id=s.id and d.kind='SUBDOMAIN' and d.hostname like '%.ustr.uz'
   and s.status in ('PROVISIONING','ACTIVE','DISABLED','FROZEN') and d.status<>'REMOVING';

-- Reconcile historic Telegram-linked rows. This is idempotent and applies to old shops too.
update public.app_users u set account_id=i.account_id
 from public.account_identities i
 where i.provider='TELEGRAM' and i.provider_subject=u.tg_id::text
   and (u.account_id is null or u.account_id=i.account_id);

update public.shop_memberships m set account_id=i.account_id
 from public.account_identities i
 where i.provider='TELEGRAM' and i.provider_subject=m.telegram_user_id::text
   and (m.account_id is null or m.account_id=i.account_id);

update public.orders x set account_id=u.account_id from public.app_users u
 where x.shop_id=u.shop_id and x.tg_id=u.tg_id and x.account_id is null and u.account_id is not null;
update public.user_favorites x set account_id=u.account_id from public.app_users u
 where x.shop_id=u.shop_id and x.tg_id=u.tg_id and x.account_id is null and u.account_id is not null;
update public.user_recent_views x set account_id=u.account_id from public.app_users u
 where x.shop_id=u.shop_id and x.tg_id=u.tg_id and x.account_id is null and u.account_id is not null;
update public.support_tickets x set account_id=u.account_id from public.app_users u
 where x.shop_id=u.shop_id and x.tg_id=u.tg_id and x.account_id is null and u.account_id is not null;
update public.cart_logs x set account_id=u.account_id from public.app_users u
 where x.shop_id=u.shop_id and x.tg_id=u.tg_id and x.account_id is null and u.account_id is not null;
update public.stock_notifications x set account_id=u.account_id from public.app_users u
 where x.shop_id=u.shop_id and x.tg_id=u.tg_id and x.account_id is null and u.account_id is not null;
update public.promotion_redemptions x set account_id=u.account_id from public.app_users u
 where x.shop_id=u.shop_id and x.tg_id=u.tg_id and x.account_id is null and u.account_id is not null;
update public.reward_issuances x set account_id=u.account_id from public.app_users u
 where x.shop_id=u.shop_id and x.tg_id=u.tg_id and x.account_id is null and u.account_id is not null;
update public.customer_discounts x set account_id=u.account_id from public.app_users u
 where x.shop_id=u.shop_id and x.tg_id=u.tg_id and x.account_id is null and u.account_id is not null;
update public.shop_legal_consents x set account_id=u.account_id from public.app_users u
 where x.shop_id=u.shop_id and x.tg_id=u.tg_id and x.account_id is null and u.account_id is not null;
update public.order_returns x set account_id=u.account_id from public.app_users u
 where x.shop_id=u.shop_id and x.requester_tg_id=u.tg_id and x.account_id is null and u.account_id is not null;

commit;
