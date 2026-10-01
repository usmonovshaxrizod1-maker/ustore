-- UStorE platform subscription periods + safe extension semantics.
-- Existing rows remain MONTHLY/30-day. New requests can be MONTHLY or ANNUAL.

alter table public.subscription_requests
  add column if not exists billing_period text,
  add column if not exists duration_days integer,
  add column if not exists upgrade_action text,
  add column if not exists applied_shop_id uuid references public.shops(id) on delete set null,
  add column if not exists applied_at timestamptz;

update public.subscription_requests
set billing_period = coalesce(billing_period, 'MONTHLY'),
    duration_days = coalesce(duration_days, 30)
where billing_period is null or duration_days is null;

alter table public.subscription_requests
  alter column billing_period set default 'MONTHLY',
  alter column billing_period set not null,
  alter column duration_days set default 30,
  alter column duration_days set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'subscription_requests_billing_period_check') then
    alter table public.subscription_requests
      add constraint subscription_requests_billing_period_check
      check (billing_period in ('MONTHLY', 'ANNUAL'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'subscription_requests_duration_days_check') then
    alter table public.subscription_requests
      add constraint subscription_requests_duration_days_check
      check (duration_days between 1 and 400);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'subscription_requests_upgrade_action_check') then
    alter table public.subscription_requests
      add constraint subscription_requests_upgrade_action_check
      check (upgrade_action is null or upgrade_action in ('EXTEND', 'CHANGE'));
  end if;
end $$;

create index if not exists subscription_requests_applied_shop_idx
  on public.subscription_requests(applied_shop_id);
