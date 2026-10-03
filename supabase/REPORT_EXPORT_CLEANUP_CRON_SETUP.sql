-- USTORE — Report PDF 24-hour cleanup cron setup.
-- 1) Deploy report-export-cleanup-cron Edge Function.
-- 2) Set USTORE_REPORT_EXPORT_CRON_SECRET in Supabase Edge Function secrets.
-- 3) Replace <CRON_SECRET> below with THE SAME secret, then RUN this file once
--    in Supabase Dashboard > SQL Editor.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'ustore-report-export-cleanup-hourly') then
    perform cron.unschedule('ustore-report-export-cleanup-hourly');
  end if;
end $$;

select cron.schedule(
  'ustore-report-export-cleanup-hourly',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://jzdpogwxonvaagxotgyi.supabase.co/functions/v1/report-export-cleanup-cron',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret','<CRON_SECRET>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

-- Verify:
-- select jobid, jobname, schedule, active from cron.job
-- where jobname = 'ustore-report-export-cleanup-hourly';
--
-- Recent executions:
-- select * from cron.job_run_details order by start_time desc limit 10;
