// USTORE — PUBLIC frontend config EXAMPLE (placeholder values).
//
// This file is what ships to a fresh clone of the repo / a new deployment.
// `config.public.js` (no ".example") is the file GitHub Pages actually
// serves — it already contains this project's REAL Supabase project URL
// and publishable key, both safe to be public (see the header comment in
// config.public.js itself for why: the publishable key is designed by
// Supabase to be public, real protection is RLS + shop-api/platform-api
// running on the service_role key server-side).
//
// NEVER put here (or in config.public.js): a Supabase service_role/secret
// key, any Telegram bot token, USTORE_BOT_TOKEN_MASTER_KEY,
// USTORE_PLATFORM_BOT_TOKEN, BOSS_SHARED_SECRET, CRON_SHARED_SECRET, or any
// Azure/other API secret. Those live ONLY in Supabase Edge Function secrets.
window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR_USTORE_PROJECT_REF.supabase.co",
  SUPABASE_KEY: "YOUR_USTORE_SUPABASE_PUBLISHABLE_OR_ANON_KEY",
  IMAGES_BUCKET: "images",
};
