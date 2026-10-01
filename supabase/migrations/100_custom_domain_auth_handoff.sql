-- Astra 8b: custom-domain login handoff. PROPOSED_LOCAL: verify remote migration ledger before apply.
-- One-time authorization code + PKCE binding creates an origin-local web session without sharing cookies.
begin;

create table if not exists public.web_origin_auth_handoffs (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  target_origin text not null,
  target_hostname text not null,
  target_shop_id uuid not null references public.shops(id) on delete restrict,
  target_domain_id uuid not null references public.shop_domains(id) on delete restrict,
  return_path text not null,
  code_challenge text not null,
  account_id uuid references public.accounts(id) on delete cascade,
  authorization_code_hash text unique,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  authorized_at timestamptz,
  authorization_expires_at timestamptz,
  consumed_at timestamptz,
  cancelled_at timestamptz,
  check (target_origin = 'https://' || target_hostname),
  check (return_path like '/%' and return_path not like '//%'),
  check (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  check (expires_at > requested_at)
);
create index if not exists web_origin_auth_handoffs_expiry_idx
  on public.web_origin_auth_handoffs(expires_at) where consumed_at is null and cancelled_at is null;
create index if not exists web_origin_auth_handoffs_domain_idx
  on public.web_origin_auth_handoffs(target_domain_id, expires_at desc);

-- Sessions created after a cross-origin handoff are ordinary opaque sessions,
-- but the creation reason remains auditable.
alter table public.web_sessions drop constraint if exists web_sessions_created_via_check;
alter table public.web_sessions add constraint web_sessions_created_via_check
  check (created_via in ('PASSWORD','TELEGRAM_EXCHANGE','ORIGIN_HANDOFF'));

create or replace function public.ustore_authorize_origin_handoff(
  p_state_hash text,
  p_account_id uuid,
  p_authorization_code_hash text,
  p_authorization_expires_at timestamptz
) returns table(result text,target_origin text,return_path text,target_shop_id uuid,target_domain_id uuid)
language plpgsql security definer set search_path=public as $$
declare r public.web_origin_auth_handoffs; now_ts timestamptz := now();
begin
  select * into r from public.web_origin_auth_handoffs where state_hash=p_state_hash for update;
  if not found then return query select 'NOT_FOUND'::text,null::text,null::text,null::uuid,null::uuid; return; end if;
  if r.consumed_at is not null then return query select 'CONSUMED'::text,null::text,null::text,null::uuid,null::uuid; return; end if;
  if r.cancelled_at is not null then return query select 'CANCELLED'::text,null::text,null::text,null::uuid,null::uuid; return; end if;
  if r.expires_at <= now_ts then return query select 'EXPIRED'::text,null::text,null::text,null::uuid,null::uuid; return; end if;
  if r.authorized_at is not null or r.authorization_code_hash is not null then
    return query select 'ALREADY_AUTHORIZED'::text,null::text,null::text,null::uuid,null::uuid; return;
  end if;
  if p_authorization_expires_at <= now_ts or p_authorization_expires_at > least(r.expires_at, now_ts + interval '90 seconds') then
    return query select 'INVALID_CODE_TTL'::text,null::text,null::text,null::uuid,null::uuid; return;
  end if;
  if not exists(select 1 from public.accounts a where a.id=p_account_id and a.status='ACTIVE') then
    return query select 'ACCOUNT_UNAVAILABLE'::text,null::text,null::text,null::uuid,null::uuid; return;
  end if;
  if not exists(
    select 1 from public.shop_domains d join public.shops s on s.id=d.shop_id
    where d.id=r.target_domain_id and d.shop_id=r.target_shop_id and d.hostname=r.target_hostname
      and d.status='ACTIVE' and d.routing_ready and s.status='ACTIVE'
  ) then return query select 'DOMAIN_UNAVAILABLE'::text,null::text,null::text,null::uuid,null::uuid; return; end if;

  update public.web_origin_auth_handoffs
     set account_id=p_account_id,authorization_code_hash=p_authorization_code_hash,
         authorized_at=now_ts,authorization_expires_at=p_authorization_expires_at
   where id=r.id;
  insert into public.web_auth_audit(account_id,event_type,metadata)
    values(p_account_id,'ORIGIN_HANDOFF_AUTHORIZED',jsonb_build_object('handoff_id',r.id,'target_shop_id',r.target_shop_id,'target_domain_id',r.target_domain_id));
  return query select 'OK'::text,r.target_origin,r.return_path,r.target_shop_id,r.target_domain_id;
end $$;

create or replace function public.ustore_exchange_origin_handoff(
  p_state_hash text,
  p_authorization_code_hash text,
  p_code_challenge text,
  p_origin text,
  p_session_token_hash text
) returns table(
  result text,account_id uuid,session_id uuid,session_expires_at timestamptz,
  target_origin text,return_path text,target_shop_id uuid,target_domain_id uuid
)
language plpgsql security definer set search_path=public as $$
declare r public.web_origin_auth_handoffs; s public.web_sessions; now_ts timestamptz := now();
begin
  select * into r from public.web_origin_auth_handoffs
   where state_hash=p_state_hash and authorization_code_hash=p_authorization_code_hash for update;
  if not found then return query select 'INVALID'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text,null::uuid,null::uuid; return; end if;
  if r.consumed_at is not null then return query select 'CONSUMED'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text,null::uuid,null::uuid; return; end if;
  if r.cancelled_at is not null then return query select 'CANCELLED'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text,null::uuid,null::uuid; return; end if;
  if r.expires_at <= now_ts or r.authorization_expires_at is null or r.authorization_expires_at <= now_ts then
    return query select 'EXPIRED'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text,null::uuid,null::uuid; return;
  end if;
  if r.authorized_at is null or r.account_id is null then return query select 'NOT_AUTHORIZED'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text,null::uuid,null::uuid; return; end if;
  if r.code_challenge<>p_code_challenge then return query select 'PKCE_MISMATCH'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text,null::uuid,null::uuid; return; end if;
  if r.target_origin<>p_origin then return query select 'ORIGIN_MISMATCH'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text,null::uuid,null::uuid; return; end if;
  if not exists(select 1 from public.accounts a where a.id=r.account_id and a.status='ACTIVE') then
    return query select 'ACCOUNT_UNAVAILABLE'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text,null::uuid,null::uuid; return; end if;
  if not exists(
    select 1 from public.shop_domains d join public.shops sh on sh.id=d.shop_id
    where d.id=r.target_domain_id and d.shop_id=r.target_shop_id and d.hostname=r.target_hostname
      and d.status='ACTIVE' and d.routing_ready and sh.status='ACTIVE'
  ) then return query select 'DOMAIN_UNAVAILABLE'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text,null::uuid,null::uuid; return; end if;

  insert into public.web_sessions(account_id,token_hash,created_via,expires_at)
    values(r.account_id,p_session_token_hash,'ORIGIN_HANDOFF',now_ts + interval '30 days') returning * into s;
  update public.web_origin_auth_handoffs set consumed_at=now_ts where id=r.id;
  insert into public.web_auth_audit(account_id,event_type,metadata)
    values(r.account_id,'ORIGIN_HANDOFF_EXCHANGED',jsonb_build_object('handoff_id',r.id,'target_shop_id',r.target_shop_id,'target_domain_id',r.target_domain_id));
  return query select 'OK'::text,r.account_id,s.id,s.expires_at,r.target_origin,r.return_path,r.target_shop_id,r.target_domain_id;
end $$;

revoke all on function public.ustore_authorize_origin_handoff(text,uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.ustore_exchange_origin_handoff(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.ustore_authorize_origin_handoff(text,uuid,text,timestamptz) to service_role;
grant execute on function public.ustore_exchange_origin_handoff(text,text,text,text,text) to service_role;

alter table public.web_origin_auth_handoffs enable row level security;
revoke all on table public.web_origin_auth_handoffs from anon,authenticated;
grant all on table public.web_origin_auth_handoffs to service_role;

commit;
