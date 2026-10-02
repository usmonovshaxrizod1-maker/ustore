-- Official Telegram Login (OIDC): browser-bound, one-time authorization code.
begin;

create table public.web_telegram_oidc_challenges (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  browser_verifier_hash text not null,
  code_challenge text not null,
  nonce_hash text not null,
  return_origin text not null,
  return_path text not null,
  redirect_uri text not null,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  check (return_path like '/%' and return_path not like '//%'),
  check (expires_at > requested_at)
);
create index web_telegram_oidc_expiry_idx on public.web_telegram_oidc_challenges(expires_at)
  where consumed_at is null;
alter table public.web_telegram_oidc_challenges enable row level security;
revoke all on table public.web_telegram_oidc_challenges from anon, authenticated;
grant all on table public.web_telegram_oidc_challenges to service_role;

-- The Edge handler validates the Telegram authorization code and RS256 ID
-- token before invoking this function. A row lock guarantees a single web
-- session even if the callback is submitted twice. The identity check binds
-- the verified Telegram ID to the Mini App's existing account.
create function public.ustore_finish_telegram_oidc(
  p_state_hash text, p_browser_verifier_hash text, p_code_challenge text,
  p_nonce_hash text, p_origin text, p_account_id uuid,
  p_telegram_user_id text, p_session_token_hash text
) returns table(result text, account_id uuid, session_id uuid, session_expires_at timestamptz, return_path text)
language plpgsql security definer set search_path=public as $$
declare r public.web_telegram_oidc_challenges; v_version integer; s_id uuid; now_ts timestamptz := now();
begin
  select * into r from public.web_telegram_oidc_challenges
    where state_hash=p_state_hash and browser_verifier_hash=p_browser_verifier_hash for update;
  if not found then return query select 'INVALID'::text,null::uuid,null::uuid,null::timestamptz,null::text; return; end if;
  if r.consumed_at is not null then return query select 'CONSUMED'::text,null::uuid,null::uuid,null::timestamptz,null::text; return; end if;
  if r.expires_at <= now_ts then return query select 'EXPIRED'::text,null::uuid,null::uuid,null::timestamptz,null::text; return; end if;
  if r.return_origin <> p_origin or r.code_challenge <> p_code_challenge or r.nonce_hash <> p_nonce_hash then
    return query select 'MISMATCH'::text,null::uuid,null::uuid,null::timestamptz,null::text; return;
  end if;
  if not exists(select 1 from public.account_identities ai where ai.account_id=p_account_id
    and ai.provider='TELEGRAM' and ai.provider_subject=p_telegram_user_id) then
    return query select 'IDENTITY_MISMATCH'::text,null::uuid,null::uuid,null::timestamptz,null::text; return;
  end if;
  select a.session_version into v_version from public.accounts a where a.id=p_account_id and a.status='ACTIVE' for share;
  if not found then return query select 'ACCOUNT_UNAVAILABLE'::text,null::uuid,null::uuid,null::timestamptz,null::text; return; end if;
  insert into public.web_sessions(account_id,token_hash,created_via,expires_at,session_version)
    values(p_account_id,p_session_token_hash,'TELEGRAM_EXCHANGE',now_ts + interval '30 days',v_version) returning id into s_id;
  update public.web_telegram_oidc_challenges set consumed_at=now_ts where id=r.id;
  insert into public.web_auth_audit(account_id,event_type,metadata)
    values(p_account_id,'TELEGRAM_OFFICIAL_SIGN_IN',jsonb_build_object('challenge_id',r.id));
  return query select 'OK'::text,p_account_id,s_id,now_ts + interval '30 days',r.return_path;
end $$;

revoke all on function public.ustore_finish_telegram_oidc(text,text,text,text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.ustore_finish_telegram_oidc(text,text,text,text,text,uuid,text,text) to service_role;
commit;
