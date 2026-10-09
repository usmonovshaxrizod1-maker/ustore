-- Platform owner notifications (Web and Mini App share the same inbox).
-- Notifications survive full shop deletion: there is deliberately NO shop FK.
begin;
create table if not exists public.platform_owner_notifications (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  recipient_telegram_id text not null,
  shop_id uuid,
  shop_name text not null,
  kind text not null check (kind in ('FROZEN','TERMINATED','REACTIVATED')),
  reason text,
  happened_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists platform_owner_notifications_recipient_idx
  on public.platform_owner_notifications (recipient_telegram_id, happened_at desc);
alter table public.platform_owner_notifications enable row level security;
-- Service-role Edge API is the only allowed reader/writer. No client policies.

-- Restore previously recorded permanent deletions, if the audit contains
-- a trustworthy captured owner at the time of deletion.
insert into public.platform_owner_notifications
  (event_key, recipient_telegram_id, shop_id, shop_name, kind, reason, happened_at)
select 'audit-terminate-' || log.id::text,
       log.details ->> 'ownerTelegramId', log.shop_id,
       coalesce(nullif(log.details ->> 'shopName',''),'Do‘kon'),
       'TERMINATED', log.details ->> 'reason', log.created_at
from public.platform_admin_action_log log
where log.action = 'TERMINATE'
  and nullif(log.details ->> 'ownerTelegramId','') is not null
on conflict (event_key) do nothing;

-- Older still-connected shops may already be frozen or soft-terminated.
-- Surface their existing warning once, without changing shop status.
insert into public.platform_owner_notifications
  (event_key,recipient_telegram_id,shop_id,shop_name,kind,reason,happened_at)
select 'existing-' || sh.id::text || '-' || sh.status || '-' ||
       coalesce(extract(epoch from st.lifecycle_changed_at)::bigint::text,'0'),
       mem.telegram_user_id::text, sh.id,
       coalesce(nullif(st.name,''),'Do‘kon'), sh.status,
       st.lifecycle_reason, coalesce(st.lifecycle_changed_at,now())
from public.shops sh
join public.shop_memberships mem on mem.shop_id=sh.id
  and mem.role='OWNER' and mem.status='ACTIVE'
left join public.shop_settings st on st.shop_id=sh.id
where sh.status in ('FROZEN','TERMINATED')
on conflict (event_key) do nothing;

commit;
