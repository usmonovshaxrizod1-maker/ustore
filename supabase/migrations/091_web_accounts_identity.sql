-- USTORE WEB 091 — additive central account + Telegram identity compatibility
begin;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','DISABLED')),
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.account_identities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text not null check (provider in ('TELEGRAM')),
  provider_subject text not null,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(provider, provider_subject)
);
create index if not exists account_identities_account_idx on public.account_identities(account_id);

alter table if exists public.app_users add column if not exists account_id uuid references public.accounts(id) on delete set null;
alter table if exists public.shop_memberships add column if not exists account_id uuid references public.accounts(id) on delete set null;

-- Backfill exactly one central account for each Telegram ID already known anywhere.
do $$
declare v_subject text; v_account uuid;
begin
  for v_subject in
    select distinct subject from (
      select tg_id::text as subject from public.app_users
      union all
      select telegram_user_id::text as subject from public.shop_memberships
    ) s where subject is not null and btrim(subject) <> ''
  loop
    select account_id into v_account from public.account_identities
      where provider='TELEGRAM' and provider_subject=v_subject;
    if v_account is null then
      insert into public.accounts default values returning id into v_account;
      insert into public.account_identities(account_id,provider,provider_subject)
        values(v_account,'TELEGRAM',v_subject)
        on conflict(provider,provider_subject) do nothing;
      select account_id into v_account from public.account_identities
        where provider='TELEGRAM' and provider_subject=v_subject;
    end if;
    update public.app_users set account_id=v_account
      where tg_id=v_subject and account_id is distinct from v_account;
    update public.shop_memberships set account_id=v_account
      where telegram_user_id::text=v_subject and account_id is distinct from v_account;
  end loop;
end $$;

create unique index if not exists app_users_shop_account_unique
  on public.app_users(shop_id, account_id) where account_id is not null;
create unique index if not exists shop_memberships_shop_account_unique
  on public.shop_memberships(shop_id, account_id) where account_id is not null;
create index if not exists app_users_account_idx on public.app_users(account_id) where account_id is not null;
create index if not exists shop_memberships_account_idx on public.shop_memberships(account_id) where account_id is not null;

-- Additive compatibility pointers; old tg_id ownership remains authoritative for Mini App until Astra-5 mapper flips reads.
alter table if exists public.orders add column if not exists account_id uuid references public.accounts(id) on delete set null;
alter table if exists public.user_favorites add column if not exists account_id uuid references public.accounts(id) on delete set null;
alter table if exists public.user_recent_views add column if not exists account_id uuid references public.accounts(id) on delete set null;
alter table if exists public.support_tickets add column if not exists account_id uuid references public.accounts(id) on delete set null;
alter table if exists public.cart_logs add column if not exists account_id uuid references public.accounts(id) on delete set null;
alter table if exists public.stock_notifications add column if not exists account_id uuid references public.accounts(id) on delete set null;
alter table if exists public.promotion_redemptions add column if not exists account_id uuid references public.accounts(id) on delete set null;
alter table if exists public.reward_issuances add column if not exists account_id uuid references public.accounts(id) on delete set null;
alter table if exists public.customer_discounts add column if not exists account_id uuid references public.accounts(id) on delete set null;
alter table if exists public.shop_legal_consents add column if not exists account_id uuid references public.accounts(id) on delete set null;
alter table if exists public.order_returns add column if not exists account_id uuid references public.accounts(id) on delete set null;

-- Existing rows inherit account_id from the shop-scoped app_user mapping. No tg_id is replaced or fabricated.
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

create or replace function public.ustore_account_for_telegram(p_tg_id text)
returns uuid language sql stable security definer set search_path=public as $$
  select account_id from public.account_identities
  where provider='TELEGRAM' and provider_subject=p_tg_id limit 1
$$;
revoke all on function public.ustore_account_for_telegram(text) from public, anon, authenticated;
grant execute on function public.ustore_account_for_telegram(text) to service_role;

alter table public.accounts enable row level security;
alter table public.account_identities enable row level security;
revoke all on table public.accounts, public.account_identities from anon, authenticated;

commit;
