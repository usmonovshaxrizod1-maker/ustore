-- 2026-08-28: chek endi ixtiyoriy (049-migratsiya) — shu sabab admin uchun
-- aksincha yo'nalish ham kerak: chek biriktirilmagan so'rovni ko'rib,
-- kerak deb topsa mijozdan aniq so'rashi (bitta tugma bosib, Telegram orqali
-- xabar yuboradi). Bu vaqt HAM server tomonda qayd etiladi — admin qachon
-- so'raganini keyin ko'rish uchun.
--
-- Sof qo'shimcha — 001-050'ga tegilmaydi.
alter table public.subscription_requests
  add column if not exists receipt_requested_at timestamptz;
