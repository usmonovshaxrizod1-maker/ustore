-- Run once in Supabase SQL Editor after migrations.
create extension if not exists pg_cron with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname = 'ustore-expire-unpaid-orders';
select cron.schedule(
  'ustore-expire-unpaid-orders',
  '*/5 * * * *',
  $$select public.ustore_expire_unpaid_orders(200);$$
);
