-- ============================================================================
-- USTORE — Platform obuna hayot sikli: cron setup (RUN THIS YOURSELF, Supabase SQL Editor)
-- ============================================================================
-- Bu fayl migratsiya EMAS — avtomatik ishga tushirilmaydi. Quyidagi qadamlarni
-- QO'LDA, tartib bilan bajaring:
--
-- 1) Avval 017_platform_lifecycle.sql migratsiyasini deploy qiling.
--
-- 2) "platform-subscription-cron" Edge Function'ni deploy qiling:
--      supabase functions deploy platform-subscription-cron
--
-- 3) Yangi function secret o'rnating — ixtiyoriy uzun tasodifiy satr
--    (masalan bir necha o'nlab belgidan iborat parol generatordan olingan):
--      supabase secrets set USTORE_PLATFORM_CRON_SECRET=<O'ZINGIZ_GENERATSIYA_QILGAN_UZUN_TASODIFIY_SATR>
--
-- 4) Quyidagi ikkita joyni o'zingizniki bilan almashtiring, keyin butun
--    faylni Supabase Dashboard > SQL Editor'da RUN qiling:
--      <PROJECT_REF>     — loyihangiz ref'i (Supabase URL'dagi subdomen)
--      <CRON_SECRET>     — 3-qadamda o'rnatgan XUDDI O'SHA qiymat
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'platform-subscription-lifecycle',
  '0 3 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/platform-subscription-cron',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

-- Tekshirish uchun:
--   select * from cron.job;                          -- jadval ro'yxatda ekanini ko'rish
--   select * from cron.job_run_details order by start_time desc limit 5;  -- oxirgi ishga tushishlar
--
-- O'chirish kerak bo'lsa:
--   select cron.unschedule('platform-subscription-lifecycle');
