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
// Values below are PLACEHOLDERS — this round's spec explicitly did not
// provide a real new Supabase project yet. Fill these in once you've
// created the fresh UStorE Supabase project (see the final report's
// deploy-order section for exactly which value comes from where in the
// Supabase dashboard).
window.APP_CONFIG = {
  SUPABASE_URL: "https://jzdpogwxonvaagxotgyi.supabase.co",
  SUPABASE_KEY: "sb_publishable_tTKrRO3jWBa2MfRBJb73NQ_JP8EtkFZ",
  IMAGES_BUCKET: "images",
};
