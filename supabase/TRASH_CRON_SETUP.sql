-- USTORE ROUND14 — 24 soatlik Trash avtomatik tozalash cron'i.
-- 1) trash-purge-cron Edge Function'ni deploy qiling.
-- 2) USTORE_PLATFORM_CRON_SECRET mavjud bo'lishi kerak (platform cron bilan bir xil secret).
-- 3) Quyida <PROJECT_REF> va <CRON_SECRET> ni o'zingizniki bilan almashtirib RUN qiling.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Qayta RUN qilinsa dublikat schedule qolmasligi uchun eski jobni olib tashlaymiz.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'ustore-trash-purge-hourly') then
    perform cron.unschedule('ustore-trash-purge-hourly');
  end if;
end $$;

select cron.schedule(
  'ustore-trash-purge-hourly',
  '7 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/trash-purge-cron',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

-- Tekshirish:
-- select * from cron.job where jobname = 'ustore-trash-purge-hourly';
-- select * from cron.job_run_details order by start_time desc limit 10;
