begin;

alter table public.cart_logs
  add column if not exists customer_notified_at timestamptz,
  add column if not exists admin_reminded_at timestamptz,
  add column if not exists reminder_count integer not null default 0;

create index if not exists cart_logs_pending_reminder_idx
  on public.cart_logs(updated_at)
  where customer_notified_at is null and item_count > 0;

commit;
