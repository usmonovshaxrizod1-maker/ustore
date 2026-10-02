-- UStorE Platform — Ariza + payment verification + shop provisioning.
-- Additive only: existing subscription flow remains compatible.

begin;

alter table public.subscription_requests
  add column if not exists requested_by_user_id bigint,
  add column if not exists owner_telegram_id bigint,
  add column if not exists requested_shop_name text,
  add column if not exists receipt_source text;

update public.subscription_requests
set requested_by_user_id = requester_telegram_id
where requested_by_user_id is null;

update public.subscription_requests
set owner_telegram_id = requester_telegram_id
where kind = 'NEW_SHOP' and owner_telegram_id is null;

alter table public.subscription_requests
  alter column requested_by_user_id set not null;

alter table public.subscription_requests
  drop constraint if exists subscription_requests_receipt_source_check;
alter table public.subscription_requests
  add constraint subscription_requests_receipt_source_check
  check (receipt_source is null or receipt_source in ('PAYMENT_PAGE','MY_REQUESTS','TELEGRAM_BOT'));

create index if not exists subscription_requests_requested_by_idx
  on public.subscription_requests(requested_by_user_id, created_at desc);
create index if not exists subscription_requests_owner_tg_idx
  on public.subscription_requests(owner_telegram_id)
  where owner_telegram_id is not null;

create table if not exists public.subscription_request_history (
  id bigserial primary key,
  request_id uuid not null references public.subscription_requests(id) on delete cascade,
  event_type text not null,
  actor_type text not null default 'SYSTEM' check (actor_type in ('USER','ADMIN','SYSTEM','BOT')),
  actor_telegram_id bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists subscription_request_history_request_idx
  on public.subscription_request_history(request_id, created_at, id);
alter table public.subscription_request_history enable row level security;

-- Telegram bot orqali kelgan chek bir nechta ochiq arizadan biriga tanlanishi
-- kerak bo'lsa, faqat Telegram file_id vaqtincha saqlanadi. Faylning o'zi
-- tanlov tasdiqlangandan keyingina private payment-receipts bucket'iga o'tadi.
create table if not exists public.platform_receipt_bot_sessions (
  telegram_user_id bigint primary key,
  telegram_file_id text not null,
  telegram_message_id bigint,
  created_at timestamptz not null default now()
);
alter table public.platform_receipt_bot_sessions enable row level security;

-- Existing rows get a truthful baseline timeline from their server timestamps.
insert into public.subscription_request_history(request_id,event_type,actor_type,actor_telegram_id,metadata,created_at)
select r.id,'REQUEST_SUBMITTED','USER',r.requested_by_user_id,
       jsonb_strip_nulls(jsonb_build_object('kind',r.kind,'shopName',r.requested_shop_name,'ownerTelegramId',r.owner_telegram_id)),
       r.created_at
from public.subscription_requests r
where not exists (
  select 1 from public.subscription_request_history h where h.request_id=r.id and h.event_type='REQUEST_SUBMITTED'
);

insert into public.subscription_request_history(request_id,event_type,actor_type,actor_telegram_id,metadata,created_at)
select r.id,'PAYMENT_CLAIMED','USER',r.requested_by_user_id,'{}'::jsonb,r.payment_claimed_at
from public.subscription_requests r
where r.payment_claimed_at is not null
  and not exists (select 1 from public.subscription_request_history h where h.request_id=r.id and h.event_type='PAYMENT_CLAIMED');

insert into public.subscription_request_history(request_id,event_type,actor_type,metadata,created_at)
select r.id,'RECEIPT_REQUESTED','ADMIN','{}'::jsonb,r.receipt_requested_at
from public.subscription_requests r
where r.receipt_requested_at is not null
  and not exists (select 1 from public.subscription_request_history h where h.request_id=r.id and h.event_type='RECEIPT_REQUESTED');

insert into public.subscription_request_history(request_id,event_type,actor_type,actor_telegram_id,metadata,created_at)
select r.id,'RECEIPT_UPLOADED','USER',r.requested_by_user_id,
       jsonb_strip_nulls(jsonb_build_object('source',r.receipt_source)),r.receipt_uploaded_at
from public.subscription_requests r
where r.receipt_uploaded_at is not null
  and not exists (select 1 from public.subscription_request_history h where h.request_id=r.id and h.event_type='RECEIPT_UPLOADED');

insert into public.subscription_request_history(request_id,event_type,actor_type,metadata,created_at)
select r.id,case when r.status='APPROVED' then 'PAYMENT_APPROVED' else 'REQUEST_REJECTED' end,
       'ADMIN',jsonb_strip_nulls(jsonb_build_object('reason',r.reject_reason)),r.reviewed_at
from public.subscription_requests r
where r.status in ('APPROVED','REJECTED') and r.reviewed_at is not null
  and not exists (
    select 1 from public.subscription_request_history h
    where h.request_id=r.id and h.event_type = case when r.status='APPROVED' then 'PAYMENT_APPROVED' else 'REQUEST_REJECTED' end
  );

insert into public.subscription_request_history(request_id,event_type,actor_type,metadata,created_at)
select r.id,'SHOP_CREATED','ADMIN',jsonb_build_object('shopId',r.applied_shop_id),r.applied_at
from public.subscription_requests r
where r.applied_shop_id is not null and r.applied_at is not null
  and not exists (select 1 from public.subscription_request_history h where h.request_id=r.id and h.event_type='SHOP_CREATED');

commit;
