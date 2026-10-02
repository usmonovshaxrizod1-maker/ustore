-- UStorE — NEW_SHOP unpaid payment drafts: cleanup every 5 minutes.
-- Run ONCE in Supabase SQL Editor after migration 059.
-- This keeps the user-visible lifetime at ~1 hour even if nobody opens the app.

create extension if not exists pg_cron;

-- Safe re-run: remove the old job with the same name if it exists.
do $$
declare job_id bigint;
begin
  select jobid into job_id from cron.job where jobname = 'platform-payment-draft-cleanup' limit 1;
  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;
end $$;

select cron.schedule(
  'platform-payment-draft-cleanup',
  '*/5 * * * *',
  $$select public.ustore_purge_expired_payment_drafts();$$
);
