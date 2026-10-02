-- UStorE — support tickets: 48-hour auto-close after the admin's last reply.
-- Run ONCE in Supabase SQL Editor after migration 061.
-- Hourly is enough granularity for a 48h deadline.

create extension if not exists pg_cron;

-- Safe re-run: remove the old job with the same name if it exists.
do $$
declare job_id bigint;
begin
  select jobid into job_id from cron.job where jobname = 'support-ticket-auto-close' limit 1;
  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;
end $$;

select cron.schedule(
  'support-ticket-auto-close',
  '0 * * * *',
  $$select public.ustore_auto_close_stale_support_tickets();$$
);
