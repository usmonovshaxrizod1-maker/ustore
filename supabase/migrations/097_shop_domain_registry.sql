-- 7a. Proposed local number: confirm remote migration ledger before applying.
begin;
create table public.shop_reserved_slugs (slug text primary key);
insert into public.shop_reserved_slugs(slug) select unnest(array[
  'www','admin','api','app','auth','login','account','accounts','platform','support','help','mail','email','smtp','ftp','cdn','assets','static','status','billing','docs','dev','test','staging','localhost','ustore']);
create table public.shop_slug_registry (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  shop_id uuid not null unique references public.shops(id) on delete restrict,
  created_at timestamptz not null default now()
);
create table public.shop_domains (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  hostname text not null unique check (hostname=lower(hostname) and length(hostname)<=253 and hostname ~ '^[a-z0-9.-]+$'),
  kind text not null check (kind in ('SUBDOMAIN','CUSTOM')),
  status text not null default 'DRAFT' check (status in ('DRAFT','PENDING_DNS','VERIFYING','PENDING_TLS','ACTIVE','ERROR','REMOVING')),
  ownership_verified boolean not null default false,
  dns_status text not null default 'UNKNOWN' check (dns_status in ('UNKNOWN','PENDING','VERIFIED','ERROR')),
  tls_status text not null default 'UNKNOWN' check (tls_status in ('UNKNOWN','PENDING','ACTIVE','ERROR')),
  routing_ready boolean not null default false,
  is_primary boolean not null default false,
  dns_records jsonb not null default '[]'::jsonb check (jsonb_typeof(dns_records)='array'),
  provider_name text, provider_id text,
  revision bigint not null default 0,
  last_checked_at timestamptz, error_code text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (status <> 'ACTIVE' or (ownership_verified and dns_status='VERIFIED' and tls_status='ACTIVE' and routing_ready)),
  check (not is_primary or status='ACTIVE')
);
create unique index shop_domains_one_primary on public.shop_domains(shop_id) where is_primary;
create unique index shop_domains_one_subdomain on public.shop_domains(shop_id) where kind='SUBDOMAIN';
create unique index shop_domains_provider_unique on public.shop_domains(provider_name,provider_id) where provider_id is not null;
create index shop_domains_shop_idx on public.shop_domains(shop_id);

-- MANAGER is a system role assigned to a STAFF membership, not membership.role.
insert into public.role_permissions(shop_id,role_id,permission)
  select shop_id,id,'domains.manage' from public.roles where key='MANAGER' and is_system
  on conflict do nothing;
create function public.ustore_can_manage_domains(p_shop_id uuid,p_tg_id text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.shop_memberships m join public.shops s on s.id=m.shop_id
    where m.shop_id=p_shop_id and m.telegram_user_id::text=p_tg_id and m.status='ACTIVE' and s.status='ACTIVE'
      and (m.role='OWNER' or (m.role='STAFF' and exists (
        select 1 from public.membership_roles mr join public.roles r on r.shop_id=mr.shop_id and r.id=mr.role_id
        join public.role_permissions rp on rp.shop_id=r.shop_id and rp.role_id=r.id and rp.permission='domains.manage'
        where mr.shop_id=m.shop_id and mr.telegram_user_id=m.telegram_user_id and r.key='MANAGER' and r.is_system
      )))
  );
$$;
create function public.ustore_reserve_shop_domain(p_shop_id uuid,p_tg_id text,p_hostname text,p_slug text,p_base_hostname text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_row public.shop_domains; v_label text;
begin
  if not public.ustore_can_manage_domains(p_shop_id,p_tg_id) then raise exception 'forbidden:domains.manage'; end if;
  if p_hostname is null or p_hostname<>lower(p_hostname) or length(p_hostname)>253 or position('.' in p_hostname)=0
    or p_hostname !~ '^[a-z0-9.-]+$' or split_part(p_hostname,'.',array_length(string_to_array(p_hostname,'.'),1)) !~ '^[a-z][a-z0-9-]*$'
    then raise exception 'invalid_hostname'; end if;
  foreach v_label in array string_to_array(p_hostname,'.') loop
    if v_label !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then raise exception 'invalid_hostname'; end if;
  end loop;
  if p_slug is not null then
    if p_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' or exists(select 1 from public.shop_reserved_slugs where slug=p_slug)
      or p_hostname is distinct from p_slug || '.' || p_base_hostname then raise exception 'invalid_slug'; end if;
  elsif p_hostname=p_base_hostname or right(p_hostname,length(p_base_hostname)+1)='.'||p_base_hostname then
    raise exception 'invalid_hostname';
  end if;
  -- Serialize same-host retries without handing another tenant's row back.
  perform pg_advisory_xact_lock(hashtextextended(p_hostname,0));
  select * into v_row from public.shop_domains where hostname=p_hostname;
  if found then
    if v_row.shop_id<>p_shop_id then raise exception 'domain_conflict'; end if;
    return to_jsonb(v_row);
  end if;
  if p_slug is not null then
    insert into public.shop_slug_registry(slug,shop_id) values(p_slug,p_shop_id);
  end if;
  insert into public.shop_domains(shop_id,hostname,kind)
    values(p_shop_id,p_hostname,case when p_slug is null then 'CUSTOM' else 'SUBDOMAIN' end) returning * into v_row;
  insert into public.admin_audit_log(shop_id,admin_tg_id,action,entity_type,entity_id,details)
    values(p_shop_id,p_tg_id,'DOMAIN_RESERVED','DOMAIN',v_row.id::text,jsonb_build_object('hostname',p_hostname));
  return to_jsonb(v_row);
end;
$$;
create function public.ustore_domain_state_guard() returns trigger language plpgsql set search_path=public as $$
begin
  if new.hostname is distinct from old.hostname or new.shop_id is distinct from old.shop_id or new.kind is distinct from old.kind then
    raise exception 'domain_identity_immutable';
  end if;
  if new.status<>old.status and not (
    (old.status='DRAFT' and new.status in ('PENDING_DNS','ERROR','REMOVING')) or
    (old.status='PENDING_DNS' and new.status in ('VERIFYING','ERROR','REMOVING')) or
    (old.status='VERIFYING' and new.status in ('PENDING_DNS','PENDING_TLS','ERROR','REMOVING')) or
    (old.status='PENDING_TLS' and new.status in ('ACTIVE','VERIFYING','ERROR','REMOVING')) or
    (old.status='ACTIVE' and new.status in ('VERIFYING','ERROR','REMOVING')) or
    (old.status='ERROR' and new.status in ('PENDING_DNS','VERIFYING','REMOVING'))
  ) then raise exception 'invalid_domain_transition'; end if;
  if new.status<>'ACTIVE' then new.is_primary=false; end if;
  new.revision=old.revision+1; new.updated_at=now(); return new;
end;
$$;
create trigger shop_domains_state_guard before update on public.shop_domains for each row execute function public.ustore_domain_state_guard();
alter table public.shop_reserved_slugs enable row level security;
alter table public.shop_slug_registry enable row level security;
alter table public.shop_domains enable row level security;
revoke all on public.shop_reserved_slugs,public.shop_slug_registry,public.shop_domains from anon,authenticated;
grant all on public.shop_reserved_slugs,public.shop_slug_registry,public.shop_domains to service_role;
revoke all on function public.ustore_can_manage_domains(uuid,text) from public,anon,authenticated;
revoke all on function public.ustore_reserve_shop_domain(uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.ustore_domain_state_guard() from public,anon,authenticated;
grant execute on function public.ustore_can_manage_domains(uuid,text) to service_role;
grant execute on function public.ustore_reserve_shop_domain(uuid,text,text,text,text) to service_role;
commit;
