-- ============================================================================
-- USTORE — Billz Phase 4: cron setup (RUN THIS YOURSELF, Supabase SQL Editor)
-- ============================================================================
-- Bu fayl migratsiya EMAS — avtomatik ishga tushirilmaydi. Quyidagi qadamlarni
-- QO'LDA, tartib bilan bajaring:
--
-- 1) Avval 013_billz_sync.sql migratsiyasini deploy qiling (u ham sizning
--    o'zingiz qo'lda run qiladigan migratsiya, bu faylning oldidan kerak).
--
-- 2) "billz-sync" Edge Function'ni deploy qiling:
--      supabase functions deploy billz-sync
--
-- 3) Yangi function secret o'rnating — ixtiyoriy uzun tasodifiy satr
--    (masalan bir necha o'nlab belgidan iborat parol generatordan olingan):
--      supabase secrets set USTORE_BILLZ_CRON_SECRET=<CRON_SECRET>
--
-- 4) Quyidagi ikkita joyni o'zingizniki bilan almashtiring, keyin butun
--    faylni Supabase Dashboard > SQL Editor'da RUN qiling:
--      <PROJECT_REF>     — loyihangiz ref'i (Supabase URL'dagi subdomen)
--      <CRON_SECRET>     — 3-qadamda o'rnatgan XUDDI O'SHA qiymat
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'billz-stock-sync',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/billz-sync',
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
--   select cron.unschedule('billz-stock-sync');
