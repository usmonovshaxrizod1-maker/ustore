// USTORE — PUBLIC frontend config for GitHub Pages.
//
// This file is committed to the repo and served as a static asset — so it
// may ONLY ever contain values that are safe to be fully public:
//   - the new Supabase project's URL
//   - the new Supabase project's PUBLISHABLE (anon) key — this key is
//     designed by Supabase to be public; real protection comes from RLS +
//     the fact that shop-api runs on the service_role key server-side and
//     is the only thing that ever touches business tables (see
//     001-005_*.sql's RLS notes and shop-api/index.ts's resolveShopContext).
//
// NEVER put here: a Supabase service_role/secret key, a Telegram bot token,
// USTORE_BOT_TOKEN_MASTER_KEY, BOSS_SHARED_SECRET, CRON_SHARED_SECRET, or
// any Azure/other API secret. Those belong ONLY in Supabase Edge Function
// secrets (`supabase secrets set ...`), never in a file that ships to a
// browser.
//
// Values below are the REAL, deployed UStorE production Supabase project.
// (Phase 1 shipped this file with placeholders; it's since been filled in
// with the actual project's URL/publishable key.) A fresh placeholder
// template — for a new clone/deployment — lives in config.public.example.js.
window.APP_CONFIG = {
  SUPABASE_URL: "https://jzdpogwxonvaagxotgyi.supabase.co",
  SUPABASE_KEY: "sb_publishable_tTKrRO3jWBa2MfRBJb73NQ_JP8EtkFZ",
  IMAGES_BUCKET: "images",
};
