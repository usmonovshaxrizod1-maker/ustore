-- USTORE — tashlab ketilgan savatlar navbatini har daqiqada ishlatish.
-- Bu migratsiya emas. Supabase Dashboard > SQL Editor'da bir marta qo'lda RUN qiling.
-- Oldin:
--   1) 087_abandoned_cart_campaigns.sql migratsiyasi qo'llangan bo'lsin.
--   2) shop-api deploy qilingan bo'lsin.
--   3) shop-api uchun CRON_SHARED_SECRET secret o'rnatilgan bo'lsin:
--      npx supabase secrets set CRON_SHARED_SECRET=<UZUN_TASODIFIY_MAXFIY_SATR> --linked
-- Quyida <PROJECT_REF> va <CRON_SECRET> ni o'zingizniki bilan almashtiring.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'ustore-abandoned-cart-worker',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/shop-api',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'action', 'notify_abandoned_carts',
      'bossSecret', '<CRON_SECRET>'
    ),
    timeout_milliseconds := 50000
  );
  $$
);

-- Tekshirish:
-- select * from cron.job where jobname = 'ustore-abandoned-cart-worker';
-- select * from cron.job_run_details order by start_time desc limit 20;
--
-- O'chirish:
-- select cron.unschedule('ustore-abandoned-cart-worker');
