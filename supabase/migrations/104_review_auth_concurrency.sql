-- REVIEW-9ABC: apply after 103; LOCAL ONLY until staging ledger/apply tests.
begin;
drop function public.ustore_create_web_session(uuid,text,text,timestamptz,integer);
create function public.ustore_create_web_session(
  p_account_id uuid,p_token_hash text,p_created_via text,p_expires_at timestamptz,
  p_expected_session_version integer,p_expected_password_hash text
) returns table(result text,session_id uuid,session_version integer)
language plpgsql security definer set search_path=public as $$
declare v_version integer; v_hash text; v_id uuid;
begin
  -- Lock order is account -> credential -> session, shared with reset.
  select a.session_version into v_version from public.accounts a
    where a.id=p_account_id and a.status='ACTIVE' for share;
  if not found then return query select 'ACCOUNT_UNAVAILABLE'::text,null::uuid,null::integer; return; end if;
  if p_expected_session_version is distinct from v_version then
    return query select 'SESSION_VERSION_CHANGED'::text,null::uuid,v_version; return;
  end if;
  if p_created_via is distinct from 'PASSWORD' then
    return query select 'INVALID'::text,null::uuid,v_version; return;
  end if;
  select c.password_hash into v_hash from public.account_credentials c
    where c.account_id=p_account_id for share;
  if not found or p_expected_password_hash is null or v_hash is distinct from p_expected_password_hash then
    return query select 'CREDENTIAL_CHANGED'::text,null::uuid,v_version; return;
  end if;
  if p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '31 days' then
    return query select 'INVALID'::text,null::uuid,v_version; return;
  end if;
  insert into public.web_sessions(account_id,token_hash,created_via,expires_at,session_version)
    values(p_account_id,p_token_hash,p_created_via,p_expires_at,v_version) returning id into v_id;
  return query select 'OK'::text,v_id,v_version;
end $$;
revoke all on function public.ustore_create_web_session(uuid,text,text,timestamptz,integer,text) from public,anon,authenticated;
grant execute on function public.ustore_create_web_session(uuid,text,text,timestamptz,integer,text) to service_role;

create or replace function public.ustore_replace_credentials_and_revoke(
  p_account_id uuid,p_login_normalized text,p_login_display text,p_password_hash text,p_reason text,
  p_expected_password_hash text default null,p_allow_create boolean default false
) returns table(result text,session_version integer)
language plpgsql security definer set search_path=public as $$
declare c public.account_credentials; v_version integer; now_ts timestamptz:=now();
begin
  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text,0));
  select a.session_version into v_version from public.accounts a
    where a.id=p_account_id and a.status='ACTIVE' for update;
  if not found then return query select 'ACCOUNT_UNAVAILABLE'::text,null::integer; return; end if;
  select ac.* into c from public.account_credentials ac where ac.account_id=p_account_id for update;
  if not found then
    if not p_allow_create then return query select 'NOT_FOUND'::text,null::integer; return; end if;
    insert into public.account_credentials(account_id,login_normalized,login_display,password_hash,password_algo,password_changed_at,must_rotate,updated_at)
      values(p_account_id,p_login_normalized,p_login_display,p_password_hash,'bcrypt',now_ts,false,now_ts);
  else
    if (p_expected_password_hash is not null and c.password_hash is distinct from p_expected_password_hash)
      or c.login_normalized is distinct from p_login_normalized or c.login_display is distinct from p_login_display then
      return query select 'CREDENTIAL_CHANGED'::text,null::integer; return;
    end if;
    -- Keep the locked, current login; a concurrent login edit must not be undone
    -- by a password request whose JS snapshot predates that edit.
    update public.account_credentials set password_hash=p_password_hash,password_algo='bcrypt',
      password_changed_at=now_ts,must_rotate=false,updated_at=now_ts where account_id=p_account_id;
  end if;
  update public.accounts a set session_version=a.session_version+1 where a.id=p_account_id returning a.session_version into v_version;
  update public.web_sessions s set revoked_at=now_ts,revoke_reason=p_reason where s.account_id=p_account_id and s.revoked_at is null;
  insert into public.web_auth_audit(account_id,event_type,metadata)
    values(p_account_id,p_reason,jsonb_build_object('session_version',v_version));
  return query select 'OK'::text,v_version;
end $$;

-- Reject a central session revoked between Edge resolution and authorization.
drop function public.ustore_authorize_origin_handoff(text,uuid,text,timestamptz);
create function public.ustore_authorize_origin_handoff(
  p_state_hash text,p_account_id uuid,p_authorization_code_hash text,
  p_authorization_expires_at timestamptz,p_session_id uuid
) returns table(result text,target_origin text,return_path text,target_shop_id uuid,target_domain_id uuid)
language plpgsql security definer set search_path=public as $$
declare r public.web_origin_auth_handoffs; now_ts timestamptz:=now(); v_version integer;
begin
  select * into r from public.web_origin_auth_handoffs where state_hash=p_state_hash for update;
  if not found then return query select 'NOT_FOUND'::text,null::text,null::text,null::uuid,null::uuid; return; end if;
  if r.consumed_at is not null then return query select 'CONSUMED'::text,null::text,null::text,null::uuid,null::uuid; return; end if;
  if r.cancelled_at is not null then return query select 'CANCELLED'::text,null::text,null::text,null::uuid,null::uuid; return; end if;
  if r.expires_at<=now_ts then return query select 'EXPIRED'::text,null::text,null::text,null::uuid,null::uuid; return; end if;
  if r.authorized_at is not null then return query select 'ALREADY_AUTHORIZED'::text,null::text,null::text,null::uuid,null::uuid; return; end if;
  if p_authorization_expires_at is null or p_authorization_expires_at<=now_ts or p_authorization_expires_at>least(r.expires_at,now_ts+interval '90 seconds') then
    return query select 'INVALID_CODE_TTL'::text,null::text,null::text,null::uuid,null::uuid; return;
  end if;
  select a.session_version into v_version from public.accounts a where a.id=p_account_id and a.status='ACTIVE' for share;
  if not found then return query select 'ACCOUNT_UNAVAILABLE'::text,null::text,null::text,null::uuid,null::uuid; return; end if;
  perform 1 from public.web_sessions ws where ws.id=p_session_id and ws.account_id=p_account_id
    and ws.session_version=v_version and ws.revoked_at is null and ws.expires_at>now_ts for share;
  if not found then return query select 'SESSION_VERSION_CHANGED'::text,null::text,null::text,null::uuid,null::uuid; return; end if;
  if not exists(select 1 from public.shop_domains d join public.shops sh on sh.id=d.shop_id where d.id=r.target_domain_id and d.shop_id=r.target_shop_id and d.hostname=r.target_hostname and d.status='ACTIVE' and d.routing_ready and sh.status='ACTIVE') then
    return query select 'DOMAIN_UNAVAILABLE'::text,null::text,null::text,null::uuid,null::uuid; return;
  end if;
  update public.web_origin_auth_handoffs set account_id=p_account_id,authorization_code_hash=p_authorization_code_hash,
    authorized_at=now_ts,authorization_expires_at=p_authorization_expires_at,authorized_session_version=v_version where id=r.id;
  insert into public.web_auth_audit(account_id,event_type,metadata) values(p_account_id,'ORIGIN_HANDOFF_AUTHORIZED',jsonb_build_object('handoff_id',r.id,'target_shop_id',r.target_shop_id,'target_domain_id',r.target_domain_id));
  return query select 'OK'::text,r.target_origin,r.return_path,r.target_shop_id,r.target_domain_id;
end $$;
revoke all on function public.ustore_authorize_origin_handoff(text,uuid,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.ustore_authorize_origin_handoff(text,uuid,text,timestamptz,uuid) to service_role;

-- Serialize session minting with reset/revoke account generation changes.
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
  select a.session_version into v_version from public.accounts a where a.id=r.account_id and a.status='ACTIVE' for share;
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
  select a.session_version into v_version from public.accounts a where a.id=r.account_id and a.status='ACTIVE' for share;
  if not found then return query select 'ACCOUNT_UNAVAILABLE'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text,null::uuid,null::uuid; return; end if;
  if r.authorized_session_version is null or r.authorized_session_version<>v_version then return query select 'SESSION_VERSION_CHANGED'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text,null::uuid,null::uuid; return; end if;
  if not exists(select 1 from public.shop_domains d join public.shops sh on sh.id=d.shop_id where d.id=r.target_domain_id and d.shop_id=r.target_shop_id and d.hostname=r.target_hostname and d.status='ACTIVE' and d.routing_ready and sh.status='ACTIVE') then return query select 'DOMAIN_UNAVAILABLE'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text,null::uuid,null::uuid; return; end if;
  insert into public.web_sessions(account_id,token_hash,created_via,expires_at,session_version)
    values(r.account_id,p_session_token_hash,'ORIGIN_HANDOFF',now_ts+interval '30 days',v_version) returning * into s;
  update public.web_origin_auth_handoffs set consumed_at=now_ts where id=r.id;
  insert into public.web_auth_audit(account_id,event_type,metadata) values(r.account_id,'ORIGIN_HANDOFF_EXCHANGED',jsonb_build_object('handoff_id',r.id,'target_shop_id',r.target_shop_id,'target_domain_id',r.target_domain_id));
  return query select 'OK'::text,r.account_id,s.id,s.expires_at,r.target_origin,r.return_path,r.target_shop_id,r.target_domain_id;
end $$;

commit;
