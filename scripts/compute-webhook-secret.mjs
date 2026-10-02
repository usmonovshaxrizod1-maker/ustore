// USTORE — one-off local helper for the FIRST-TIME platform bot webhook
// setup (Phase 2 report, section 28 / STEP 9). Computes the exact same
// secret_token value telegramWebhookSecret() produces in
// supabase/functions/_shared/telegram.ts, so you can pass it to Telegram's
// setWebhook call by hand before platform_setup exists to do it for you.
//
// This file is NOT deployed anywhere and contains no secrets of its own —
// you pass your bot token as a command-line argument, it never touches disk.
//
// Usage:
//   node scripts/compute-webhook-secret.mjs "123456789:AA...yourPlatformBotToken"
//
// Then use the printed value as `secret_token` in your setWebhook call, and
// the SAME bot token (with https://api.telegram.org/bot<TOKEN>/setWebhook)
// as the URL you POST to.

const token = process.argv[2];
if (!token) {
  console.error('Usage: node compute-webhook-secret.mjs "<bot token>"');
  process.exit(1);
}

const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ustore:${token}`));
const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 48);
console.log(hex);
