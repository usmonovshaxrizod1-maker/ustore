-- UStorE Platform — 7-task polish batch:
-- payment logos, resumable payment drafts, lifecycle settings/messages,
-- uploaded notification images. Additive / backward-compatible.

begin;

-- 2-band: custom payment provider logo (private storage path; API returns a
-- short-lived signed URL). Existing text badge remains the fallback.
alter table public.platform_payment_methods
  add column if not exists logo_storage_path text;

-- 7-band: notification images can be uploaded from device instead of URL-only.
alter table public.notification_templates
  add column if not exists image_storage_path text;

-- 3-band: NEW_SHOP payment screen creates a one-hour resumable draft.
alter table public.subscription_requests
  add column if not exists payment_deadline_at timestamptz;
create index if not exists subscription_requests_payment_draft_expiry_idx
  on public.subscription_requests(payment_deadline_at)
  where status='NEW' and payment_claimed_at is null;

-- Existing truly-unpaid NEW rows get a one-hour deadline from creation. Old
-- rows whose hour already passed are intentionally eligible for cleanup.
update public.subscription_requests
set payment_deadline_at = created_at + interval '1 hour'
where status='NEW' and payment_claimed_at is null and payment_deadline_at is null;

-- 6-band: platform-wide freeze/delete behaviour and user-facing guidance.
create table if not exists public.platform_lifecycle_settings (
  id boolean primary key default true check (id),
  auto_freeze_on_expiry boolean not null default true,
  retention_days integer not null default 30 check (retention_days between 1 and 365),
  support_label text not null default 'Admin bilan bog''lanish',
  support_url text,
  freeze_user_title text not null default 'Do''koningiz vaqtincha muzlatildi',
  freeze_user_body text not null default 'Sabab: {REASON}\nQayta faollashtirish uchun: {ACTION}',
  freeze_action_text text not null default 'Muammoni bartaraf eting yoki UStorE administratori bilan bog''laning.',
  terminate_user_title text not null default 'Do''koningiz o''chirildi',
  terminate_user_body text not null default 'Sabab: {REASON}\nQo''shimcha ma''lumot uchun administrator bilan bog''laning.',
  freeze_reasons jsonb not null default '["Obuna muddati tugadi","To''lov bo''yicha muammo","Qoidabuzarlik","Texnik tekshiruv"]'::jsonb,
  terminate_reasons jsonb not null default '["Foydalanuvchi so''rovi","Uzoq muddat faol emas","Qoidabuzarlik","Boshqa"]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.platform_lifecycle_settings(id) values (true)
on conflict (id) do nothing;
alter table public.platform_lifecycle_settings enable row level security;

-- Per-shop reason/time lets the owner see WHY a frozen/terminated shop is in
-- that state when Platform is reopened.
alter table public.shop_settings
  add column if not exists lifecycle_reason text,
  add column if not exists lifecycle_changed_at timestamptz;

-- Lifecycle Telegram templates are editable in the same template engine used
-- by automatic messages. FROZEN already exists and is reused for manual+auto.
do $$
declare con_name text;
begin
  select c.conname into con_name
  from pg_constraint c
  where c.conrelid='public.notification_templates'::regclass
    and c.contype='c'
    and pg_get_constraintdef(c.oid) ilike '%type%';
  if con_name is not null then
    execute format('alter table public.notification_templates drop constraint %I', con_name);
  end if;
end $$;

alter table public.notification_templates
  add constraint notification_templates_type_check
  check (type in (
    'EXPIRY_7D','EXPIRY_3D','EXPIRY_1D','FROZEN','GRACE_7D','GRACE_1D',
    'VISITOR_1D','VISITOR_3D','VISITOR_7D','REACTIVATED','TERMINATED'
  ));

insert into public.notification_templates(type, body) values
  ('REACTIVATED', '✅ {SHOP_NAME} do''koningiz qayta faollashtirildi.'),
  ('TERMINATED', '🔴 {SHOP_NAME} do''koningiz o''chirildi.\nSabab: {REASON}\n{ACTION}')
on conflict (type) do nothing;

-- Make FROZEN useful for both automatic expiry and manual freezes.
update public.notification_templates
set body = '❄️ {SHOP_NAME} do''koningiz vaqtincha muzlatildi.\nSabab: {REASON}\n{ACTION}'
where type='FROZEN' and body like '❄️ Obunangiz tugadi%';

-- Delivery audit for lifecycle notifications (manual/automatic).
create table if not exists public.platform_lifecycle_notification_log (
  id bigserial primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  notification_type text not null,
  recipient_telegram_id bigint,
  status text not null check (status in ('SENT','FAILED','SKIPPED')),
  error_text text,
  created_at timestamptz not null default now()
);
create index if not exists platform_lifecycle_notification_log_shop_idx
  on public.platform_lifecycle_notification_log(shop_id, created_at desc);
alter table public.platform_lifecycle_notification_log enable row level security;

-- Server-side cleanup helper used by API and hourly lifecycle cron.
create or replace function public.ustore_purge_expired_payment_drafts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  delete from public.subscription_requests
  where status='NEW'
    and payment_claimed_at is null
    and payment_deadline_at is not null
    and payment_deadline_at <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.ustore_purge_expired_payment_drafts() from public, anon, authenticated;
grant execute on function public.ustore_purge_expired_payment_drafts() to service_role;

commit;
