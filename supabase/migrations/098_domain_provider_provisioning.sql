-- Astra 7b: provider provisioning/polling metadata. Verify remote allocator before apply.
begin;
alter table public.shop_domains add column if not exists provider_last_attempt_at timestamptz;
alter table public.shop_domains add column if not exists next_check_at timestamptz;
alter table public.shop_domains add column if not exists provision_attempts integer not null default 0;
create index if not exists shop_domains_poll_idx on public.shop_domains(status,next_check_at) where status in ('PENDING_DNS','VERIFYING','PENDING_TLS','ERROR');
commit;
