-- USTORE WEB 093 — browser-bound, one-time Telegram web sign-in challenge.
-- Additive only. Raw state/browser verifier are NEVER persisted.
begin;

create table if not exists public.web_telegram_auth_challenges (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  browser_verifier_hash text not null,
  return_origin text not null,
  return_path text not null,
  account_id uuid references public.accounts(id) on delete cascade,
  telegram_user_id text,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  approved_at timestamptz,
  consumed_at timestamptz,
  rejected_at timestamptz,
  rejection_reason text,
  check (return_path like '/%' and return_path not like '//%'),
  check (expires_at > requested_at)
);
create index if not exists web_telegram_auth_challenges_expiry_idx
  on public.web_telegram_auth_challenges(expires_at)
  where consumed_at is null;

-- A verified CENTRAL UStorE bot sender approves a pending challenge. The same
-- state can never be silently rebound to a second Telegram account.
create or replace function public.ustore_approve_telegram_web_challenge(
  p_state_hash text,
  p_account_id uuid,
  p_telegram_user_id text
) returns text
language plpgsql security definer set search_path=public as $$
declare r public.web_telegram_auth_challenges; now_ts timestamptz := now();
begin
  select * into r from public.web_telegram_auth_challenges
    where state_hash=p_state_hash for update;
  if not found then return 'NOT_FOUND'; end if;
  if r.consumed_at is not null then return 'CONSUMED'; end if;
  if r.rejected_at is not null then return 'REJECTED'; end if;
  if r.expires_at <= now_ts then return 'EXPIRED'; end if;
  if r.approved_at is not null then
    if r.account_id=p_account_id and r.telegram_user_id=p_telegram_user_id then return 'ALREADY_APPROVED'; end if;
    return 'APPROVED_OTHER';
  end if;
  update public.web_telegram_auth_challenges
     set account_id=p_account_id, telegram_user_id=p_telegram_user_id, approved_at=now_ts
   where id=r.id;
  return 'APPROVED';
end $$;

-- Atomic exchange: verifier + explicit approved account confirmation are
-- checked under row lock; one opaque web session is inserted in the SAME
-- transaction that consumes the challenge. A replay cannot create session #2.
create or replace function public.ustore_exchange_telegram_web_challenge(
  p_state_hash text,
  p_browser_verifier_hash text,
  p_confirm_account_id uuid,
  p_session_token_hash text
) returns table(
  result text,
  account_id uuid,
  session_id uuid,
  session_expires_at timestamptz,
  return_origin text,
  return_path text
)
language plpgsql security definer set search_path=public as $$
declare
  r public.web_telegram_auth_challenges;
  s public.web_sessions;
  now_ts timestamptz := now();
begin
  select * into r from public.web_telegram_auth_challenges
   where state_hash=p_state_hash and browser_verifier_hash=p_browser_verifier_hash
   for update;
  if not found then
    return query select 'INVALID'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text; return;
  end if;
  if r.consumed_at is not null then
    return query select 'CONSUMED'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text; return;
  end if;
  if r.rejected_at is not null then
    return query select 'REJECTED'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text; return;
  end if;
  if r.expires_at <= now_ts then
    return query select 'EXPIRED'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text; return;
  end if;
  if r.approved_at is null or r.account_id is null then
    return query select 'PENDING'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text; return;
  end if;
  if r.account_id <> p_confirm_account_id then
    return query select 'ACCOUNT_MISMATCH'::text,null::uuid,null::uuid,null::timestamptz,null::text,null::text; return;
  end if;

  insert into public.web_sessions(account_id,token_hash,created_via,expires_at)
    values(r.account_id,p_session_token_hash,'TELEGRAM_EXCHANGE',now_ts + interval '30 days')
    returning * into s;
  update public.web_telegram_auth_challenges set consumed_at=now_ts where id=r.id;
  insert into public.web_auth_audit(account_id,event_type,metadata)
    values(r.account_id,'TELEGRAM_WEB_SIGN_IN',jsonb_build_object('challenge_id',r.id));

  return query select 'OK'::text,r.account_id,s.id,s.expires_at,r.return_origin,r.return_path;
end $$;

revoke all on function public.ustore_approve_telegram_web_challenge(text,uuid,text) from public,anon,authenticated;
revoke all on function public.ustore_exchange_telegram_web_challenge(text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.ustore_approve_telegram_web_challenge(text,uuid,text) to service_role;
grant execute on function public.ustore_exchange_telegram_web_challenge(text,text,uuid,text) to service_role;

alter table public.web_telegram_auth_challenges enable row level security;
revoke all on table public.web_telegram_auth_challenges from anon,authenticated;

commit;
