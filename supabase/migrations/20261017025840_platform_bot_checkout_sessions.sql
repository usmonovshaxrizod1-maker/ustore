begin;
create table public.platform_bot_checkout_sessions (
  telegram_user_id bigint primary key,
  step text not null,
  data jsonb not null default '{}'::jsonb check (octet_length(data::text)<=262144),
  callback_token text not null,
  revision integer not null default 0,
  last_update_id bigint not null default 0,
  expires_at timestamptz not null default (now()+interval '24 hours'),
  updated_at timestamptz not null default now()
);
alter table public.platform_bot_checkout_sessions enable row level security;
revoke all on public.platform_bot_checkout_sessions from public,anon,authenticated;
grant all on public.platform_bot_checkout_sessions to service_role;
create index platform_bot_checkout_expiry_idx on public.platform_bot_checkout_sessions(expires_at);
commit;
