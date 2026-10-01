-- USTORE WEB 092 — username/password credentials, opaque sessions, rate limiting, Telegram credential entry state
begin;

create table if not exists public.account_credentials (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  login_normalized text not null unique,
  login_display text not null,
  password_hash text not null,
  password_algo text not null default 'bcrypt' check (password_algo in ('bcrypt')),
  password_changed_at timestamptz not null default now(),
  must_rotate boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.web_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  token_hash text not null unique,
  created_via text not null default 'PASSWORD' check (created_via in ('PASSWORD','TELEGRAM_EXCHANGE')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text
);
create index if not exists web_sessions_account_active_idx on public.web_sessions(account_id, expires_at) where revoked_at is null;

create table if not exists public.web_auth_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.telegram_credential_entry (
  telegram_user_id text primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  state_nonce_hash text,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create table if not exists public.web_auth_audit (
  id bigint generated always as identity primary key,
  account_id uuid references public.accounts(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists web_auth_audit_account_created_idx on public.web_auth_audit(account_id,created_at desc);

create or replace function public.ustore_auth_rate_limit_consume(
  p_key_hash text, p_limit integer default 8, p_window_seconds integer default 900, p_block_seconds integer default 900
) returns table(allowed boolean, retry_after_seconds integer)
language plpgsql security definer set search_path=public as $$
declare r public.web_auth_rate_limits; now_ts timestamptz := now();
begin
  insert into public.web_auth_rate_limits(key_hash,window_started_at,attempts)
    values(p_key_hash,now_ts,0) on conflict(key_hash) do nothing;
  select * into r from public.web_auth_rate_limits where key_hash=p_key_hash for update;
  if r.blocked_until is not null and r.blocked_until > now_ts then
    return query select false, greatest(1,ceil(extract(epoch from (r.blocked_until-now_ts)))::int); return;
  end if;
  if r.window_started_at <= now_ts - make_interval(secs => p_window_seconds) then
    update public.web_auth_rate_limits set window_started_at=now_ts,attempts=1,blocked_until=null,updated_at=now_ts where key_hash=p_key_hash;
    return query select true,0; return;
  end if;
  if r.attempts + 1 > p_limit then
    update public.web_auth_rate_limits set attempts=r.attempts+1,blocked_until=now_ts+make_interval(secs => p_block_seconds),updated_at=now_ts where key_hash=p_key_hash;
    return query select false,p_block_seconds; return;
  end if;
  update public.web_auth_rate_limits set attempts=r.attempts+1,updated_at=now_ts where key_hash=p_key_hash;
  return query select true,0;
end $$;

create or replace function public.ustore_auth_rate_limit_clear(p_key_hash text)
returns void language sql security definer set search_path=public as $$ delete from public.web_auth_rate_limits where key_hash=p_key_hash $$;

revoke all on function public.ustore_auth_rate_limit_consume(text,integer,integer,integer) from public,anon,authenticated;
revoke all on function public.ustore_auth_rate_limit_clear(text) from public,anon,authenticated;
grant execute on function public.ustore_auth_rate_limit_consume(text,integer,integer,integer) to service_role;
grant execute on function public.ustore_auth_rate_limit_clear(text) to service_role;

alter table public.account_credentials enable row level security;
alter table public.web_sessions enable row level security;
alter table public.web_auth_rate_limits enable row level security;
alter table public.telegram_credential_entry enable row level security;
alter table public.web_auth_audit enable row level security;
revoke all on table public.account_credentials, public.web_sessions, public.web_auth_rate_limits, public.telegram_credential_entry, public.web_auth_audit from anon,authenticated;

commit;
