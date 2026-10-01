-- Astra 9c: LOCAL ONLY until remote migration ledger is verified.
-- Atomic credential/session versioning + idempotent authenticated guest-cart merge.
begin;

alter table public.accounts
  add column if not exists session_version integer not null default 1 check (session_version > 0);

alter table public.web_sessions
  add column if not exists session_version integer not null default 1 check (session_version > 0);

update public.web_sessions s
   set session_version = a.session_version
  from public.accounts a
 where a.id = s.account_id and s.session_version is distinct from a.session_version;

alter table public.web_telegram_auth_challenges
  add column if not exists approved_session_version integer;
alter table public.web_origin_auth_handoffs
  add column if not exists authorized_session_version integer;

create table if not exists public.web_cart_merge_receipts (
  shop_id uuid not null references public.shops(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  merge_key text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (shop_id, account_id, merge_key),
  check (length(merge_key) between 16 and 200)
);
create index if not exists web_cart_merge_receipts_created_idx
  on public.web_cart_merge_receipts(created_at);
alter table public.web_cart_merge_receipts enable row level security;
revoke all on table public.web_cart_merge_receipts from anon,authenticated;
grant all on table public.web_cart_merge_receipts to service_role;

create or replace function public.ustore_create_web_session(
  p_account_id uuid,
  p_token_hash text,
  p_created_via text,
  p_expires_at timestamptz,
  p_expected_session_version integer
) returns table(result text, session_id uuid, session_version integer)
language plpgsql security definer set search_path=public as $$
declare v_version integer; v_id uuid;
begin
  select session_version into v_version from public.accounts
   where id=p_account_id and status='ACTIVE' for share;
  if not found then return query select 'ACCOUNT_UNAVAILABLE'::text,null::uuid,null::integer; return; end if;
  if v_version <> p_expected_session_version then
    return query select 'SESSION_VERSION_CHANGED'::text,null::uuid,v_version; return;
  end if;
  insert into public.web_sessions(account_id,token_hash,created_via,expires_at,session_version)
    values(p_account_id,p_token_hash,p_created_via,p_expires_at,v_version)
    returning id into v_id;
  return query select 'OK'::text,v_id,v_version;
end $$;

create or replace function public.ustore_revoke_all_web_sessions_atomic(
  p_account_id uuid,
  p_reason text default 'USER_REVOKED_ALL'
) returns integer
language plpgsql security definer set search_path=public as $$
declare v_version integer; now_ts timestamptz := now();
begin
  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text,0));
  update public.accounts set session_version=session_version+1 where id=p_account_id returning session_version into v_version;
  if not found then raise exception 'account_not_found'; end if;
  update public.web_sessions set revoked_at=coalesce(revoked_at,now_ts), revoke_reason=case when revoked_at is null then p_reason else revoke_reason end
   where account_id=p_account_id and revoked_at is null;
  insert into public.web_auth_audit(account_id,event_type,metadata)
    values(p_account_id,'SESSIONS_REVOKED_ALL',jsonb_build_object('reason',p_reason,'session_version',v_version));
  return v_version;
end $$;

create or replace function public.ustore_replace_credentials_and_revoke(
  p_account_id uuid,
  p_login_normalized text,
  p_login_display text,
  p_password_hash text,
  p_reason text,
  p_expected_password_hash text default null,
  p_allow_create boolean default false
) returns table(result text, session_version integer)
language plpgsql security definer set search_path=public as $$
declare c public.account_credentials; v_version integer; now_ts timestamptz := now();
begin
  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text,0));
  select * into c from public.account_credentials where account_id=p_account_id for update;
  if not found then
    if not p_allow_create then return query select 'NOT_FOUND'::text,null::integer; return; end if;
    insert into public.account_credentials(account_id,login_normalized,login_display,password_hash,password_algo,password_changed_at,must_rotate,updated_at)
      values(p_account_id,p_login_normalized,p_login_display,p_password_hash,'bcrypt',now_ts,false,now_ts);
  else
    if p_expected_password_hash is not null and c.password_hash <> p_expected_password_hash then
      return query select 'CREDENTIAL_CHANGED'::text,null::integer; return;
    end if;
    update public.account_credentials set
      login_normalized=p_login_normalized, login_display=p_login_display,
      password_hash=p_password_hash, password_algo='bcrypt', password_changed_at=now_ts,
      must_rotate=false, updated_at=now_ts
      where account_id=p_account_id;
  end if;
  update public.accounts set session_version=session_version+1 where id=p_account_id returning session_version into v_version;
  if not found then raise exception 'account_not_found'; end if;
  update public.web_sessions set revoked_at=coalesce(revoked_at,now_ts), revoke_reason=case when revoked_at is null then p_reason else revoke_reason end
   where account_id=p_account_id and revoked_at is null;
  insert into public.web_auth_audit(account_id,event_type,metadata)
    values(p_account_id,p_reason,jsonb_build_object('session_version',v_version));
  return query select 'OK'::text,v_version;
end $$;

-- Bind Telegram approval to the account session generation that existed when
-- the verified Telegram user approved it. A later credential reset/revoke-all
-- invalidates the still-unconsumed challenge.
create or replace function public.ustore_approve_telegram_web_challenge(
  p_state_hash text,
  p_account_id uuid,
  p_telegram_user_id text
) returns text
language plpgsql security definer set search_path=public as $$
declare r public.web_telegram_auth_challenges; now_ts timestamptz := now(); v_version integer;
begin
  select * into r from public.web_telegram_auth_challenges where state_hash=p_state_hash for update;
  if not found then return 'NOT_FOUND'; end if;
  if r.consumed_at is not null then return 'CONSUMED'; end if;
  if r.rejected_at is not null then return 'REJECTED'; end if;
  if r.expires_at <= now_ts then return 'EXPIRED'; end if;
  if r.approved_at is not null then
    if r.account_id=p_account_id and r.telegram_user_id=p_telegram_user_id then return 'ALREADY_APPROVED'; end if;
    return 'APPROVED_OTHER';
  end if;
  select session_version into v_version from public.accounts where id=p_account_id and status='ACTIVE';
  if not found then return 'ACCOUNT_UNAVAILABLE'; end if;
  update public.web_telegram_auth_challenges
     set account_id=p_account_id, telegram_user_id=p_telegram_user_id, approved_at=now_ts, approved_session_version=v_version
   where id=r.id;
  return 'APPROVED';
end $$;

create or replace function public.ustore_exchange_telegram_web_challenge(
  p_state_hash text,
  p_browser_verifier_hash text,
  p_confirm_account_id uuid,
  p_session_token_hash text
) returns table(result text,account_id uuid,session_id uuid,session_expires_at timestamptz,return_origin text,return_path text)
language plpgsql security definer set search_path=public as $$
declare r public.web_telegram_auth_challenges; s public.web_sessions; now_ts timestamptz := now(); v_version integer;
begin
  select * into r from public.web_telegram_auth_challenges where state_hash=p_state_hash and browser_verifier_hash=p_browser_verifier_hash for update;
  if not found then return query select 'INVALID'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text; return; end if;
  if r.consumed_at is not null then return query select 'CONSUMED'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text; return; end if;
  if r.rejected_at is not null then return query select 'REJECTED'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text; return; end if;
  if r.expires_at <= now_ts then return query select 'EXPIRED'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text; return; end if;
  if r.approved_at is null or r.account_id is null then return query select 'PENDING'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text; return; end if;
  if r.account_id <> p_confirm_account_id then return query select 'ACCOUNT_MISMATCH'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text; return; end if;
  select session_version into v_version from public.accounts where id=r.account_id and status='ACTIVE';
  if not found then return query select 'ACCOUNT_UNAVAILABLE'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text; return; end if;
  if r.approved_session_version is null or r.approved_session_version <> v_version then
    return query select 'SESSION_VERSION_CHANGED'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text; return;
  end if;
  insert into public.web_sessions(account_id,token_hash,created_via,expires_at,session_version)
    values(r.account_id,p_session_token_hash,'TELEGRAM_EXCHANGE',now_ts+interval '30 days',v_version) returning * into s;
  update public.web_telegram_auth_challenges set consumed_at=now_ts where id=r.id;
  insert into public.web_auth_audit(account_id,event_type,metadata) values(r.account_id,'TELEGRAM_WEB_SIGN_IN',jsonb_build_object('challenge_id',r.id));
  return query select 'OK'::text,r.account_id,s.id,s.expires_at,r.return_origin,r.return_path;
end $$;

-- Origin handoff authorization is also bound to the current session generation.
create or replace function public.ustore_authorize_origin_handoff(
  p_state_hash text,p_account_id uuid,p_authorization_code_hash text,p_authorization_expires_at timestamptz
) returns table(result text,target_origin text,return_path text,target_shop_id uuid,target_domain_id uuid)
language plpgsql security definer set search_path=public as $$
declare r public.web_origin_auth_handoffs; now_ts timestamptz:=now(); v_version integer;
begin
  select * into r from public.web_origin_auth_handoffs where state_hash=p_state_hash for update;
  if not found then return query select 'NOT_FOUND'::text,null::text,null::text,null::uuid,null::uuid; return; end if;
  if r.consumed_at is not null then return query select 'CONSUMED'::text,null::text,null::text,null::uuid,null::uuid; return; end if;
  if r.cancelled_at is not null then return query select 'CANCELLED'::text,null::text,null::text,null::uuid,null::uuid; return; end if;
  if r.expires_at<=now_ts then return query select 'EXPIRED'::text,null::text,null::text,null::uuid,null::uuid; return; end if;
  if r.authorized_at is not null or r.authorization_code_hash is not null then return query select 'ALREADY_AUTHORIZED'::text,null::text,null::text,null::uuid,null::uuid; return; end if;
  if p_authorization_expires_at<=now_ts or p_authorization_expires_at>least(r.expires_at,now_ts+interval '90 seconds') then return query select 'INVALID_CODE_TTL'::text,null::text,null::text,null::uuid,null::uuid; return; end if;
  select session_version into v_version from public.accounts where id=p_account_id and status='ACTIVE';
  if not found then return query select 'ACCOUNT_UNAVAILABLE'::text,null::text,null::text,null::uuid,null::uuid; return; end if;
  if not exists(select 1 from public.shop_domains d join public.shops s on s.id=d.shop_id where d.id=r.target_domain_id and d.shop_id=r.target_shop_id and d.hostname=r.target_hostname and d.status='ACTIVE' and d.routing_ready and s.status='ACTIVE') then
    return query select 'DOMAIN_UNAVAILABLE'::text,null::text,null::text,null::uuid,null::uuid; return;
  end if;
  update public.web_origin_auth_handoffs set account_id=p_account_id,authorization_code_hash=p_authorization_code_hash,authorized_at=now_ts,authorization_expires_at=p_authorization_expires_at,authorized_session_version=v_version where id=r.id;
  insert into public.web_auth_audit(account_id,event_type,metadata) values(p_account_id,'ORIGIN_HANDOFF_AUTHORIZED',jsonb_build_object('handoff_id',r.id,'target_shop_id',r.target_shop_id,'target_domain_id',r.target_domain_id));
  return query select 'OK'::text,r.target_origin,r.return_path,r.target_shop_id,r.target_domain_id;
end $$;

create or replace function public.ustore_exchange_origin_handoff(
  p_state_hash text,p_authorization_code_hash text,p_code_challenge text,p_origin text,p_session_token_hash text
) returns table(result text,account_id uuid,session_id uuid,session_expires_at timestamptz,target_origin text,return_path text,target_shop_id uuid,target_domain_id uuid)
language plpgsql security definer set search_path=public as $$
declare r public.web_origin_auth_handoffs; s public.web_sessions; now_ts timestamptz:=now(); v_version integer;
begin
  select * into r from public.web_origin_auth_handoffs where state_hash=p_state_hash and authorization_code_hash=p_authorization_code_hash for update;
  if not found then return query select 'INVALID'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text,null::uuid,null::uuid; return; end if;
  if r.consumed_at is not null then return query select 'CONSUMED'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text,null::uuid,null::uuid; return; end if;
  if r.cancelled_at is not null then return query select 'CANCELLED'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text,null::uuid,null::uuid; return; end if;
  if r.expires_at<=now_ts or r.authorization_expires_at is null or r.authorization_expires_at<=now_ts then return query select 'EXPIRED'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text,null::uuid,null::uuid; return; end if;
  if r.authorized_at is null or r.account_id is null then return query select 'NOT_AUTHORIZED'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text,null::uuid,null::uuid; return; end if;
  if r.code_challenge<>p_code_challenge then return query select 'PKCE_MISMATCH'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text,null::uuid,null::uuid; return; end if;
  if r.target_origin<>p_origin then return query select 'ORIGIN_MISMATCH'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text,null::uuid,null::uuid; return; end if;
  select session_version into v_version from public.accounts where id=r.account_id and status='ACTIVE';
  if not found then return query select 'ACCOUNT_UNAVAILABLE'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text,null::uuid,null::uuid; return; end if;
  if r.authorized_session_version is null or r.authorized_session_version<>v_version then return query select 'SESSION_VERSION_CHANGED'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text,null::uuid,null::uuid; return; end if;
  if not exists(select 1 from public.shop_domains d join public.shops sh on sh.id=d.shop_id where d.id=r.target_domain_id and d.shop_id=r.target_shop_id and d.hostname=r.target_hostname and d.status='ACTIVE' and d.routing_ready and sh.status='ACTIVE') then return query select 'DOMAIN_UNAVAILABLE'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text,null::uuid,null::uuid; return; end if;
  insert into public.web_sessions(account_id,token_hash,created_via,expires_at,session_version)
    values(r.account_id,p_session_token_hash,'ORIGIN_HANDOFF',now_ts+interval '30 days',v_version) returning * into s;
  update public.web_origin_auth_handoffs set consumed_at=now_ts where id=r.id;
  insert into public.web_auth_audit(account_id,event_type,metadata) values(r.account_id,'ORIGIN_HANDOFF_EXCHANGED',jsonb_build_object('handoff_id',r.id,'target_shop_id',r.target_shop_id,'target_domain_id',r.target_domain_id));
  return query select 'OK'::text,r.account_id,s.id,s.expires_at,r.target_origin,r.return_path,r.target_shop_id,r.target_domain_id;
end $$;

create or replace function public.ustore_merge_web_cart(
  p_shop_id uuid,
  p_account_id uuid,
  p_tg_id text,
  p_merge_key text,
  p_incoming_items jsonb
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare existing jsonb; merged jsonb := '[]'::jsonb; item jsonb; old_item jsonb; key text; qty integer; now_ts timestamptz:=now(); prior jsonb; response jsonb;
begin
  if p_merge_key is null or length(p_merge_key)<16 or length(p_merge_key)>200 then raise exception 'invalid_merge_key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text||':'||p_account_id::text,0));
  select r.response into prior from public.web_cart_merge_receipts r where r.shop_id=p_shop_id and r.account_id=p_account_id and r.merge_key=p_merge_key;
  if found then return prior || jsonb_build_object('replayed',true); end if;
  select coalesce(items,'[]'::jsonb) into existing from public.cart_logs where shop_id=p_shop_id and tg_id=p_tg_id for update;
  if existing is null then existing:='[]'::jsonb; end if;
  merged:=existing;
  for item in select value from jsonb_array_elements(coalesce(p_incoming_items,'[]'::jsonb)) loop
    key := case when item->>'type'='BUNDLE' then 'B:'||coalesce(item->>'bundleId','') else 'P:'||coalesce(item->>'productId','')||'|'||coalesce(item->>'variantId','')||'|'||coalesce(item->>'size','')||'|'||coalesce(item->>'color','') end;
    qty := greatest(0,least(99,coalesce((item->>'qty')::integer,0)));
    if qty<=0 then continue; end if;
    old_item := null;
    select value into old_item from jsonb_array_elements(merged) value where
      (case when value->>'type'='BUNDLE' then 'B:'||coalesce(value->>'bundleId','') else 'P:'||coalesce(value->>'productId','')||'|'||coalesce(value->>'variantId','')||'|'||coalesce(value->>'size','')||'|'||coalesce(value->>'color','') end)=key limit 1;
    if old_item is not null then
      merged := (select coalesce(jsonb_agg(case when (case when value->>'type'='BUNDLE' then 'B:'||coalesce(value->>'bundleId','') else 'P:'||coalesce(value->>'productId','')||'|'||coalesce(value->>'variantId','')||'|'||coalesce(value->>'size','')||'|'||coalesce(value->>'color','') end)=key then jsonb_set(value,'{qty}',to_jsonb(least(99,coalesce((value->>'qty')::integer,0)+qty))) else value end),'[]'::jsonb) from jsonb_array_elements(merged) value);
    else merged := merged || jsonb_build_array(item); end if;
  end loop;
  insert into public.cart_logs(shop_id,tg_id,account_id,items,item_count,updated_at,customer_notified_at,admin_reminded_at,reminder_count)
    values(p_shop_id,p_tg_id,p_account_id,merged,(select coalesce(sum(coalesce((value->>'qty')::integer,0)),0) from jsonb_array_elements(merged) value),now_ts,null,null,0)
    on conflict(shop_id,tg_id) do update set account_id=excluded.account_id,items=excluded.items,item_count=excluded.item_count,updated_at=excluded.updated_at,customer_notified_at=null,admin_reminded_at=null,reminder_count=0;
  response:=jsonb_build_object('items',merged,'updatedAt',now_ts,'replayed',false);
  insert into public.web_cart_merge_receipts(shop_id,account_id,merge_key,response) values(p_shop_id,p_account_id,p_merge_key,response);
  return response;
end $$;

revoke all on function public.ustore_create_web_session(uuid,text,text,timestamptz,integer) from public,anon,authenticated;
revoke all on function public.ustore_revoke_all_web_sessions_atomic(uuid,text) from public,anon,authenticated;
revoke all on function public.ustore_replace_credentials_and_revoke(uuid,text,text,text,text,text,boolean) from public,anon,authenticated;
revoke all on function public.ustore_merge_web_cart(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.ustore_create_web_session(uuid,text,text,timestamptz,integer) to service_role;
grant execute on function public.ustore_revoke_all_web_sessions_atomic(uuid,text) to service_role;
grant execute on function public.ustore_replace_credentials_and_revoke(uuid,text,text,text,text,text,boolean) to service_role;
grant execute on function public.ustore_merge_web_cart(uuid,uuid,text,text,jsonb) to service_role;

commit;
