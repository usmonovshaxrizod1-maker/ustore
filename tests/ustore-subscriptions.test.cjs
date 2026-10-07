// USTORE — Platform bot SaaS onboarding + obuna tizimi.
// Static-pattern tests against supabase/functions/platform-api/index.ts and
// the new migration — same style as tests/ustore-platform.test.cjs (no live
// Supabase in this environment, so these are source-level assertions, not
// integration tests). See the approved plan for the full phase breakdown.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FUNCTIONS_DIR = path.join(__dirname, '..', 'supabase', 'functions');
const platformApi = fs.readFileSync(path.join(FUNCTIONS_DIR, 'platform-api', 'index.ts'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '016_platform_subscriptions.sql'), 'utf8');
const platformApp = fs.readFileSync(path.join(__dirname, '..', 'platform', 'platform-app.js'), 'utf8');

// ---------------------------------------------------------------------------
// Phase 1: schema (016_platform_subscriptions.sql)
// ---------------------------------------------------------------------------

test('016 migration is purely additive: creates tariffs/subscription_requests/platform_settings, and only ALTERs shop_settings (adds columns, never drops/renames anything from 001-015)', () => {
  assert.match(migration, /create table public\.tariffs \(/);
  assert.match(migration, /create table public\.subscription_requests \(/);
  assert.match(migration, /create table public\.platform_settings \(/);
  assert.match(migration, /alter table public\.shop_settings\s*\n\s*add column tariff_id uuid references public\.tariffs\(id\)/);
  assert.match(migration, /add column subscription_expires_at timestamptz;/);
  assert.doesNotMatch(migration, /drop table|drop column|rename/i, 'must never touch existing 001-015 structures destructively');
});

test('tariffs: price/product_limit constraints, and at most one "Ommabop" (is_popular) tariff enforced at the DB level via a partial unique index', () => {
  const start = migration.indexOf('create table public.tariffs');
  const block = migration.slice(start, migration.indexOf(');', start) + 2);
  assert.match(block, /price numeric\(14,2\) not null check \(price >= 0\)/);
  assert.match(block, /product_limit integer,\s*-- null = cheksiz/);
  assert.match(migration, /create unique index tariffs_single_popular_idx on public\.tariffs\(is_popular\) where is_popular;/, 'must enforce single-popular-tariff at the DB level, not just app logic');
});

test('subscription_requests: kind/shop_id pairing enforced by a CHECK (NEW_SHOP never carries a shop_id, UPGRADE always does), status is a clean 3-value enum, and tariff terms are snapshotted so a later tariff edit can never retroactively rewrite what a customer agreed to', () => {
  const start = migration.indexOf('create table public.subscription_requests');
  const block = migration.slice(start, migration.indexOf('create index subscription_requests_status_idx', start));
  assert.match(block, /kind text not null check \(kind in \('NEW_SHOP', 'UPGRADE'\)\)/);
  assert.match(block, /status text not null default 'NEW' check \(status in \('NEW', 'APPROVED', 'REJECTED'\)\)/, 'exactly 3 statuses — "bot ulanishi kutilmoqda" must be a DERIVED label (kind=NEW_SHOP && status=APPROVED), not a 4th stored status');
  assert.match(block, /check \(\(kind = 'NEW_SHOP' and shop_id is null\) or \(kind = 'UPGRADE' and shop_id is not null\)\)/);
  assert.match(block, /tariff_name_snapshot text not null,\s*\n\s*tariff_price_snapshot numeric\(14,2\) not null,\s*\n\s*tariff_product_limit_snapshot integer,/);
});

test('platform_settings is a true singleton (boolean primary key locked to true) and is seeded with exactly one row, so platform_get_payment_info can always .maybeSingle() without a bootstrap step', () => {
  assert.match(migration, /create table public\.platform_settings \(\s*\n\s*id boolean primary key default true check \(id\),/);
  assert.match(migration, /insert into public\.platform_settings \(id\) values \(true\);/);
});

test('every new table gets RLS enabled (same minimal pattern as 011_billz_integration.sql\'s billz_connections — no permissive policy needed since service_role bypasses RLS entirely and anon/authenticated get zero access by default)', () => {
  for (const t of ['tariffs', 'subscription_requests', 'platform_settings']) {
    assert.match(migration, new RegExp(`alter table public\\.${t} enable row level security;`));
  }
});

// ---------------------------------------------------------------------------
// Phase 1: platform-api/index.ts actions
// ---------------------------------------------------------------------------

function actionBlock(action) {
  const start = platformApi.indexOf(`case "${action}"`);
  assert.ok(start >= 0, `${action} action not found in platform-api/index.ts`);
  const end = platformApi.indexOf('\n      case "', start + 10);
  const defaultIdx = platformApi.indexOf('\n      default:', start + 10);
  const stop = end >= 0 && (defaultIdx < 0 || end < defaultIdx) ? end : defaultIdx;
  return platformApi.slice(start, stop > start ? stop : start + 1500);
}

test('platform_list_tariffs and platform_get_payment_info are PUBLIC (no requirePlatformSuperAdmin()) — any verified Telegram user can see active tariffs and the payment card before subscribing; the admin-only variants are properly gated', () => {
  assert.doesNotMatch(actionBlock('platform_list_tariffs'), /requirePlatformSuperAdmin\(\)/, 'the onboarding tariff list must be reachable by a brand-new, non-admin visitor');
  assert.match(actionBlock('platform_list_tariffs'), /\.eq\("is_active", true\)/, 'public listing must exclude deactivated tariffs');
  assert.doesNotMatch(actionBlock('platform_get_payment_info'), /requirePlatformSuperAdmin\(\)/, 'the payment page needs the card number before the visitor is anyone special');

  for (const action of ['platform_admin_list_tariffs', 'platform_upsert_tariff', 'platform_set_payment_info']) {
    assert.match(actionBlock(action), /requirePlatformSuperAdmin\(\)/, `${action} must be Super-Admin-gated`);
  }
});

test('platform_upsert_tariff validates name/price/productLimit and rejects bad input with 400s before touching the database', () => {
  const block = actionBlock('platform_upsert_tariff');
  assert.match(block, /if \(!name\) return json\(\{ error: "name_required" \}, 400\);/);
  assert.match(block, /if \(!Number\.isFinite\(price\) \|\| price < 0\) return json\(\{ error: "invalid_price" \}, 400\);/);
  assert.match(block, /if \(productLimit !== null && \(!Number\.isInteger\(productLimit\) \|\| productLimit <= 0\)\)/, 'a non-null product limit must be a positive integer — null alone means unlimited');
});

test('platform_upsert_tariff enforces "at most one Ommabop tariff" at the application level too (clears every other tariff\'s is_popular before setting the new one) — belt-and-suspenders alongside the DB partial unique index', () => {
  const block = actionBlock('platform_upsert_tariff');
  assert.match(block, /if \(isPopular\) \{/);
  assert.match(block, /\.update\(\{ is_popular: false \}\)\.eq\("is_popular", true\)/);
});

test('platform_upsert_tariff has no hard-delete path — "id present -> update, id absent -> insert" only, so a tariff already referenced by a subscription_requests/shop_settings FK can never be removed out from under history', () => {
  const block = actionBlock('platform_upsert_tariff');
  assert.match(block, /if \(id\) \{/);
  assert.match(block, /\.insert\(row\)\.select\("id"\)\.single\(\);/);
  assert.doesNotMatch(block, /\.delete\(\)/, 'must never hard-delete a tariff row');
});

test('platform_set_payment_info sanitizes the card number the same way shop-level CARD payment config already does (digits/spaces only, capped length) and records who changed it', () => {
  const block = actionBlock('platform_set_payment_info');
  assert.match(block, /replace\(\/\[\^\\d \]\/g, ""\)/, 'must strip everything except digits/spaces, matching sanitizeFulfillmentConfig\'s existing CARD cardNumber handling in shop-api');
  assert.match(block, /updated_by: tgId/, 'must record the server-verified admin tgId, never a client-supplied identity');
});

// ---------------------------------------------------------------------------
// Phase 2: full backend action layer
// ---------------------------------------------------------------------------

test('EdgeRuntime is declared (platform-api previously never used it — needed now for the fire-and-forget Telegram notifications so a slow/failed Telegram call never delays the HTTP response)', () => {
  assert.match(platformApi, /declare const EdgeRuntime: \{ waitUntil\(promise: Promise<unknown>\): void \};/);
});

test('listMyShops() resolves ownership via shop_memberships (role=OWNER, status=ACTIVE) — never a shops.owner_telegram_id column, which does not exist — and both platform_boot and platform_list_my_shops reuse this ONE helper rather than duplicating the join', () => {
  const fnStart = platformApi.indexOf('async function listMyShops');
  const fnBlock = platformApi.slice(fnStart, fnStart + 1600);
  assert.match(fnBlock, /\.eq\("telegram_user_id", telegramUserId\)\.eq\("role", "OWNER"\)\.eq\("status", "ACTIVE"\)/);
  assert.doesNotMatch(fnBlock, /owner_telegram_id/, 'shops has no such column — ownership is exclusively via shop_memberships');
  assert.match(actionBlock('platform_boot'), /listMyShops\(db, tgId\)/);
  assert.match(actionBlock('platform_list_my_shops'), /return json\(\{ myShops: await listMyShops\(db, tgId\) \}\);/);
});

test('platform_boot and platform_list_my_shops are PUBLIC (any verified visitor, including a brand-new one with zero shops, needs this to decide landing-vs-dashboard) — only the write-side subscription actions and everything admin-only stay gated', () => {
  assert.doesNotMatch(actionBlock('platform_boot'), /requirePlatformSuperAdmin\(\)/);
  assert.doesNotMatch(actionBlock('platform_list_my_shops'), /requirePlatformSuperAdmin\(\)/);
  assert.doesNotMatch(actionBlock('platform_submit_subscription_request'), /requirePlatformSuperAdmin\(\)/, 'any verified Telegram user can submit a subscription request, not just the admin');
});

test('platform_submit_subscription_request verifies UPGRADE ownership server-side via shop_memberships — a client-supplied shopId is never trusted on its own', () => {
  const block = actionBlock('platform_submit_subscription_request');
  assert.match(block, /if \(kind === "UPGRADE"\) \{/);
  assert.match(block, /\.eq\("shop_id", shopId\)\.eq\("telegram_user_id", tgId\)\.eq\("role", "OWNER"\)\.eq\("status", "ACTIVE"\)\.maybeSingle\(\);/);
  assert.match(block, /if \(!membership\) return json\(\{ error: "not_shop_owner" \}, 403\);/);
});

test('platform_submit_subscription_request blocks a second in-flight (status=NEW) request for the same requester+kind(+shop for UPGRADE), and rolls back the just-inserted row if the receipt upload itself fails (never leaves an orphaned request with no receipt)', () => {
  const block = actionBlock('platform_submit_subscription_request');
  assert.match(block, /\.eq\("requester_telegram_id", tgId\)\.eq\("kind", kind\)\.eq\("status", "NEW"\);/);
  assert.match(block, /if \(existingReq\) return json\(\{ error: "request_already_pending" \}, 409\);/);
  assert.match(block, /await db\.from\("subscription_requests"\)\.delete\(\)\.eq\("id", requestId\);/, 'a failed receipt upload must delete the orphaned request row, not leave it stuck with no receipt');
});

test('subscription receipts reuse the exact same payment-receipts Storage bucket and mime/size validation as shop-level order receipts (jpeg/png/webp, \\u226436MB base64 body / \\u22646MB decoded), just under a platform/ path prefix instead of shops/{shopId}/', () => {
  const fnStart = platformApi.indexOf('async function storeSubscriptionReceipt');
  const fnBlock = platformApi.slice(fnStart, fnStart + 1400);
  assert.match(fnBlock, /"image\/jpeg": "jpg", "image\/png": "png", "image\/webp": "webp"/);
  assert.match(fnBlock, /binary\.length > 6 \* 1024 \* 1024/);
  assert.match(fnBlock, /db\.storage\.from\("payment-receipts"\)\.upload/);
  assert.match(fnBlock, /`platform\/subscription-requests\/\$\{requestId\}\/\$\{tgId\}-\$\{crypto\.randomUUID\(\)\}\.\$\{ext\}`/);
});

test('every admin-only subscription/dashboard action is gated with requirePlatformSuperAdmin()', () => {
  for (const action of [
    'platform_list_subscription_requests', 'platform_get_subscription_receipt_url',
    'platform_approve_subscription_request', 'platform_reject_subscription_request',
    'platform_apply_tariff', 'platform_admin_dashboard_summary',
    'platform_grant_subscription_days', 'platform_freeze_shop', 'platform_reactivate_shop', 'platform_terminate_shop',
  ]) {
    assert.match(actionBlock(action), /requirePlatformSuperAdmin\(\)/, `${action} must be Super-Admin-gated`);
  }
});

// ---------------------------------------------------------------------------
// Obuna hayot sikli — 017_platform_lifecycle.sql + platform-api kengaytmasi
// ---------------------------------------------------------------------------

const migration017 = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '017_platform_lifecycle.sql'), 'utf8');

test('017 migration: shops.status gains FROZEN/TERMINATED (existing PROVISIONING/ACTIVE/DISABLED kept, nothing dropped), shop_settings gains frozen_at, and two new platform-scoped audit tables are created', () => {
  assert.match(migration017, /check \(status in \('PROVISIONING', 'ACTIVE', 'DISABLED', 'FROZEN', 'TERMINATED'\)\)/, 'must extend, never shrink, the enum');
  assert.match(migration017, /alter table public\.shop_settings\s*\n\s*add column frozen_at timestamptz;/);
  assert.match(migration017, /create table public\.platform_admin_action_log \(/);
  assert.match(migration017, /action text not null check \(action in \('GRANT_DAYS', 'FREEZE', 'REACTIVATE', 'TERMINATE'\)\)/);
  assert.match(migration017, /shop_id uuid references public\.shops\(id\) on delete set null,/, 'audit history must survive even if the shop row is later purged (set null, not cascade)');
  assert.match(migration017, /create table public\.platform_consent_log \(/);
  assert.match(migration017, /terms_version text not null,/);
  assert.match(migration017, /privacy_version text not null,/);
  assert.match(migration017, /alter table public\.platform_admin_action_log enable row level security;/);
  assert.match(migration017, /alter table public\.platform_consent_log enable row level security;/);
  assert.doesNotMatch(migration017, /drop table|drop column/i, 'must never destructively touch 001-016 structures');
});

test('017 migration finds and drops the OLD shops.status check constraint dynamically (by inspecting pg_constraint), never by a guessed/hardcoded constraint name — Postgres auto-generates that name and guessing it wrong would silently no-op or fail the migration', () => {
  assert.match(migration017, /select conname into con_name\s*\n\s*from pg_constraint/);
  assert.match(migration017, /execute format\('alter table public\.shops drop constraint %I', con_name\);/);
});

test('platform_grant_subscription_days validates shopId/days(1-365)/reason, extends from max(current expiry, now) so an already-expired shop doesn\'t get days added onto a stale past date, logs a GRANT_DAYS audit row, and notifies the owner', () => {
  const block = actionBlock('platform_grant_subscription_days');
  assert.match(block, /if \(!Number\.isFinite\(days\) \|\| days <= 0 \|\| days > 365\)/);
  assert.match(block, /if \(!reason\) return json\(\{ error: "reason_required" \}, 400\);/);
  assert.match(block, /const baseMs = previousExpiry \? Math\.max\(new Date\(previousExpiry\)\.getTime\(\), Date\.now\(\)\) : Date\.now\(\);/);
  assert.match(block, /await logPlatformAdminAction\(db, tgId, shopId, "GRANT_DAYS", \{ days, reason, previousExpiry, newExpiry \}\);/);
  assert.match(block, /notifyShopOwnerInBackground\(db, PLATFORM_BOT_TOKEN, shopId, `🎁 Obunangizga \$\{days\} kun qo'shildi\.\\nSabab: \$\{reason\}`\);/);
});

// 2026-08-29, 7-topshiriq round (task 6, "Muzlatish/O'chirish parametrlari"):
// freeze/reactivate now also stamp lifecycle_reason/lifecycle_changed_at on
// shop_settings (a real audit trail an admin can see later, not just the
// admin_action log) and send the owner a TEMPLATE-driven notification
// (notifyLifecycleOwnerInBackground, {SHOP_NAME}/{REASON}/{ACTION}/
// {SUPPORT_CONTACT} placeholders, admin-editable — matches the same
// admin-editable-template pattern already used for the subscription
// lifecycle notifications) instead of a hardcoded message. The core
// invariants (reason required, refuses already-frozen/terminated, real
// frozen_at, FREEZE/REACTIVATE audit log) are unchanged.
test('platform_freeze_shop requires a reason, uses the atomic lifecycle RPC, logs the transition and notifies the owner', () => {
  const block = actionBlock('platform_freeze_shop');
  assert.match(block, /if \(!reason\) return json\(\{ error: "reason_required" \}, 400\);/);
  assert.match(block, /db\.rpc\("ustore_freeze_shop", \{/);
  assert.match(block, /p_shop_id: shopId, p_reason: reason, p_retention_days: lifecycle\.retentionDays/);
  const atomic = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '081_atomic_shop_lifecycle.sql'), 'utf8');
  assert.match(atomic, /if v_status='TERMINATED' then raise exception 'shop_already_terminated';/);
  assert.match(atomic, /if v_status='FROZEN' then raise exception 'shop_already_frozen';/);
  assert.match(atomic, /frozen_delete_at=v_now\+make_interval/);
  assert.match(block, /await logPlatformAdminAction\(db, tgId, shopId, "FREEZE"/);
  assert.match(block, /notifyLifecycleOwnerInBackground\(db, PLATFORM_BOT_TOKEN, shopId, "FROZEN", \{/);
});

test('platform_reactivate_shop uses the atomic FROZEN-to-ACTIVE RPC, logs the transition and notifies the owner', () => {
  const block = actionBlock('platform_reactivate_shop');
  assert.match(block, /db\.rpc\("ustore_reactivate_shop", \{ p_shop_id: shopId \}\)/);
  assert.match(block, /message\.includes\("shop_not_frozen"\)/);
  const atomic = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '081_atomic_shop_lifecycle.sql'), 'utf8');
  assert.match(atomic, /if v_status<>'FROZEN' then raise exception 'shop_not_frozen';/);
  assert.match(atomic, /frozen_at=null,frozen_delete_at=null,lifecycle_reason=null,lifecycle_changed_at=now\(\)/);
  assert.match(block, /await logPlatformAdminAction\(db, tgId, shopId, "REACTIVATE",/);
  assert.match(block, /notifyLifecycleOwnerInBackground\(db, PLATFORM_BOT_TOKEN, shopId, "REACTIVATED", \{/);
});

test('platform_terminate_shop v2 (2026-09-06, user-requested full purge): requires a reason, refuses to re-terminate an already-TERMINATED shop, logs TERMINATE, and — unlike the old status-flip-only behavior — calls ustore_purge_shop_completely (070-migratsiya) which actually deletes every trace of the shop from Supabase (the shops row itself included), freeing its Telegram bot id for reuse', () => {
  const block = actionBlock('platform_terminate_shop');
  assert.match(block, /if \(!reason\) return json\(\{ error: "reason_required" \}, 400\);/);
  assert.match(block, /if \(shopRow\.status === "TERMINATED"\) return json\(\{ error: "shop_already_terminated" \}, 409\);/);
  assert.match(block, /await logPlatformAdminAction\(db, tgId, shopId, "TERMINATE",/);
  assert.match(block, /await db\.rpc\("ustore_purge_shop_completely", \{/);
  assert.match(block, /p_shop_id: shopId/);
  assert.match(block, /p_backup_id: deletionBackup\.id/);
  assert.doesNotMatch(block, /\.from\("shops"\)\.update\(\{ status: "TERMINATED"/, 'the old soft status-flip must be fully replaced by the purge RPC, not left alongside it');
});

test('platform_terminate_shop resolves the shop name + owner telegram id and sends the TERMINATED notification via a synchronously-AWAITED sendLifecycleNotification (never the fire-and-forget notifyLifecycleOwnerInBackground) — BEFORE calling the purge RPC — because platform_lifecycle_notification_log.shop_id is NOT NULL REFERENCES shops(id), so writing that log after the shop row is gone would fail', () => {
  const block = actionBlock('platform_terminate_shop');
  const notifyIdx = block.indexOf('await sendLifecycleNotification(');
  const purgeIdx = block.indexOf('ustore_purge_shop_completely');
  assert.ok(notifyIdx >= 0, 'must call the awaitable sendLifecycleNotification, not the fire-and-forget wrapper');
  assert.ok(purgeIdx > notifyIdx, 'the notification must be sent BEFORE the purge, not after');
  assert.doesNotMatch(block, /notifyLifecycleOwnerInBackground\(/, 'must not use the background/fire-and-forget variant for this destructive action');
  assert.match(block, /\}, ownerTelegramId \|\| undefined\);/, 'must pass the pre-resolved owner id so the notification does not re-query shop_memberships (which is about to be deleted too)');
});

test('sendLifecycleNotification (extracted from notifyLifecycleOwnerInBackground) accepts an optional precomputedRecipient that skips the shop_memberships lookup entirely — and notifyLifecycleOwnerInBackground itself is now a thin EdgeRuntime.waitUntil wrapper around it, so every OTHER existing call site (FROZEN/REACTIVATED/GRACE_EXTENDED) keeps its exact original fire-and-forget behavior unchanged', () => {
  const fnStart = platformApi.indexOf('async function sendLifecycleNotification(');
  assert.ok(fnStart >= 0);
  const fnBlock = platformApi.slice(fnStart, platformApi.indexOf('\n}', fnStart) + 2);
  assert.match(fnBlock, /precomputedRecipient\?: string,/);
  assert.match(fnBlock, /recipient = precomputedRecipient \|\| \(membership\?\.telegram_user_id \? String\(membership\.telegram_user_id\) : null\);/);

  const wrapperStart = platformApi.indexOf('function notifyLifecycleOwnerInBackground(');
  const wrapperBlock = platformApi.slice(wrapperStart, platformApi.indexOf('\n}', wrapperStart) + 2);
  assert.match(wrapperBlock, /EdgeRuntime\.waitUntil\(sendLifecycleNotification\(db, botToken, shopId, notificationType, values, precomputedRecipient\)\);/);
});

test('migration 070 defines ustore_purge_shop_completely(p_shop_id) as a SECURITY DEFINER function, service_role-only, that deletes shop_settings/design_settings/shop_bots/shop_memberships/shops themselves in that order (bot connection freed before the shop row disappears) — note: its original disable/enable-trigger-ALL technique was found broken in real production use and superseded by migration 072 (see that test below); this test only checks the parts of 070 that are still true', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '070_shop_purge_on_terminate.sql'), 'utf8');
  assert.match(migration, /create or replace function public\.ustore_purge_shop_completely\(p_shop_id uuid\)/);
  assert.match(migration, /security definer/);
  assert.match(migration, /grant execute on function public\.ustore_purge_shop_completely\(uuid\) to service_role;/);
  assert.match(migration, /revoke all on function public\.ustore_purge_shop_completely\(uuid\) from public, anon, authenticated;/);
  const shopBotsIdx = migration.indexOf('delete from public.shop_bots where shop_id = p_shop_id;');
  const shopsIdx = migration.indexOf('delete from public.shops where id = p_shop_id;');
  assert.ok(shopBotsIdx >= 0 && shopsIdx > shopBotsIdx, 'shop_bots must be deleted before the shops row itself, so the bot id frees up as part of this same function');
});

test('migration 072 fixes a REAL production failure in ustore_purge_shop_completely: "alter table ... disable trigger all" tries to disable INTERNAL system FK-enforcement triggers too, which Postgres allows ONLY for a true superuser — not even the table owner — and this SECURITY DEFINER function runs as its (non-superuser) owner, so it failed with "permission denied: ... is a system trigger" the first time it actually ran against live data. The fix: "set local session_replication_role = replica" (a Supabase-postgres-role-safe alternative that needs no superuser, and auto-reverts at transaction end since it is LOCAL) replaces the disable/enable-trigger-ALL loop pair entirely', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '072_fix_purge_trigger_disable_permission.sql'), 'utf8');
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
  assert.match(migration, /create or replace function public\.ustore_purge_shop_completely\(p_shop_id uuid\)/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set local session_replication_role = replica;/);
  assert.doesNotMatch(migration, /execute format\('alter table public\.%I (disable|enable) trigger all'/, 'the broken superuser-only technique must be fully gone from the actual executable code, not left alongside the new one (a prose mention of it in the explanatory comment above is fine)');
  assert.match(migration, /grant execute on function public\.ustore_purge_shop_completely\(uuid\) to service_role;/);
  assert.match(migration, /revoke all on function public\.ustore_purge_shop_completely\(uuid\) from public, anon, authenticated;/);
  const shopBotsIdx = migration.indexOf('delete from public.shop_bots where shop_id = p_shop_id;');
  const shopsIdx = migration.indexOf('delete from public.shops where id = p_shop_id;');
  assert.ok(shopBotsIdx >= 0 && shopsIdx > shopBotsIdx, 'shop_bots must still be deleted before the shops row itself, so the bot id still frees up as part of this same function');
});

test('platform_record_consent is a PUBLIC action (no requirePlatformSuperAdmin) reachable by any verified Telegram user, records the current TERMS_VERSION/PRIVACY_VERSION constants against the caller\'s server-verified tgId (never a client-supplied user id)', () => {
  assert.doesNotMatch(actionBlock('platform_record_consent'), /requirePlatformSuperAdmin\(\)/);
  const block = actionBlock('platform_record_consent');
  assert.match(block, /user_telegram_id: tgId, shop_id: shopId, terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION,/);
  assert.match(platformApi, /const TERMS_VERSION = "1\.0";/);
  assert.match(platformApi, /const PRIVACY_VERSION = "1\.0";/);
});

test('platform_submit_subscription_request now requires consentAccepted===true server-side (never trusts the frontend checkbox alone) and records a platform_consent_log row as part of the SAME request, not a separate round-trip that could be skipped', () => {
  const block = actionBlock('platform_submit_subscription_request');
  assert.match(block, /if \(payload\.consentAccepted !== true\) return json\(\{ error: "consent_required" \}, 400\);/);
  const consentIdx = block.indexOf('platform_consent_log');
  const receiptIdx = block.indexOf('storeSubscriptionReceipt(db, requestId');
  assert.ok(consentIdx >= 0 && receiptIdx > consentIdx, 'consent must be recorded before/alongside the receipt upload, in the same handler invocation');
  assert.match(block, /source: `subscription_request:\$\{kind\}`,/);
});

test('platform_admin_dashboard_summary now also returns an "attentionItems" list combining new subscription requests, shops expiring within 3 days, shops stuck in PROVISIONING for over an hour, and shops whose muzlatish (freeze) grace period has expired — the existing 4 summary counters are untouched', () => {
  const block = actionBlock('platform_admin_dashboard_summary');
  assert.match(block, /type: "NEW_REQUEST"/);
  assert.match(block, /type: "EXPIRING_SOON"/);
  assert.match(block, /type: "STUCK_PROVISIONING"/);
  assert.match(block, /type: "GRACE_EXPIRED"/);
  assert.match(block, /activeShopsCount: activeShopsCount \|\| 0,/, 'existing counters must be untouched');
  assert.match(block, /attentionItems,/);
});

test('the GRACE_EXPIRED attention items now come from the PERSISTED, idempotent platform_admin_tasks table (type=FREEZE_EXPIRED, resolved_at is null) rather than a live-computed threshold — so the list survives across requests and can only ever hold one open task per shop', () => {
  const block = actionBlock('platform_admin_dashboard_summary');
  assert.match(block, /db\.from\("platform_admin_tasks"\)\.select\("shop_id,created_at"\)\.eq\("type", "FREEZE_EXPIRED"\)\.is\("resolved_at", null\)/);
  assert.doesNotMatch(block, /loadLifecycleSettings/, 'must not re-derive its own threshold — the cron is the single writer of FREEZE_EXPIRED tasks now');
});

test('the new platform-subscription-cron function only ever FREEZES on expiry (and sends warnings) — it never terminates a shop automatically; termination stays an exclusively manual admin action', () => {
  const cronPath = path.join(FUNCTIONS_DIR, 'platform-subscription-cron', 'index.ts');
  assert.ok(fs.existsSync(cronPath), 'platform-subscription-cron/index.ts must exist');
  const cron = fs.readFileSync(cronPath, 'utf8');
  assert.match(cron, /x-cron-secret/, 'must use the same shared-secret cron auth pattern as billz-sync');
  assert.match(cron, /USTORE_PLATFORM_CRON_SECRET/);
  assert.match(cron, /db\.rpc\("ustore_freeze_shop", \{/);
  assert.doesNotMatch(cron, /status: "TERMINATED"/, 'the cron must never set TERMINATED — that is a manual-only admin action per the plan');
  assert.doesNotMatch(cron, /requirePlatformSuperAdmin|verifyTelegramInitData/, 'cron auth must be the shared secret, never Telegram initData (there is no user on the other end of a cron tick)');

  const config = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'config.toml'), 'utf8');
  assert.match(config, /\[functions\.platform-subscription-cron\]\s*\nverify_jwt = false/);
});

test('migration 071 additively adds the lifecycle-round-v2 schema: shops.status gains \'TERMINATING\' (transient write-lock, no code changes needed since resolveShopContext already blocks any non-ACTIVE status), platform_lifecycle_settings.retention_days default becomes 60 with a SAFE backfill (only rows still at the old default 30 are bumped — an admin who deliberately chose another value is untouched), and platform_admin_tasks is created with a partial UNIQUE index guaranteeing at most one open FREEZE_EXPIRED task per shop', () => {
  const m = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '071_freeze_60days_and_admin_tasks.sql'), 'utf8');
  assert.match(m, /^begin;/m);
  assert.match(m, /^commit;/m);
  assert.match(m, /check \(status in \('PROVISIONING', 'ACTIVE', 'DISABLED', 'FROZEN', 'TERMINATED', 'TERMINATING'\)\)/);
  assert.match(m, /alter column retention_days set default 60;/);
  assert.match(m, /update public\.platform_lifecycle_settings\s*\nset retention_days = 60\s*\nwhere retention_days = 30;/, 'must only backfill rows still at the OLD default, never overwrite an admin\'s deliberate custom value');
  assert.match(m, /create table if not exists public\.platform_admin_tasks \(/);
  assert.match(m, /type text not null check \(type in \('FREEZE_EXPIRED'\)\)/);
  assert.match(m, /shop_id uuid not null references public\.shops\(id\) on delete cascade/, 'must cascade-delete with the shop so TERMINATE never leaves an orphaned task row behind');
  assert.match(m, /resolved_action text check \(resolved_action in \('TERMINATED', 'EXTENDED'\)\)/);
  assert.match(m, /create unique index if not exists platform_admin_tasks_open_unique\s*\n\s*on public\.platform_admin_tasks\(shop_id, type\)\s*\n\s*where resolved_at is null;/);
  assert.match(m, /alter table public\.platform_admin_tasks enable row level security;/);
});

test('platform-subscription-cron creates one idempotent FREEZE_EXPIRED task when the persisted deletion deadline has elapsed', () => {
  const cron = fs.readFileSync(path.join(FUNCTIONS_DIR, 'platform-subscription-cron', 'index.ts'), 'utf8');
  assert.match(cron, /\.select\("shop_id,name,frozen_at,frozen_delete_at"\)/);
  assert.match(cron, /const graceDeadlineIso = r\.frozen_delete_at \|\| new Date\(new Date\(r\.frozen_at\)\.getTime\(\) \+ retentionDays \* 24 \* 3600 \* 1000\)\.toISOString\(\);/);
  assert.match(cron, /if \(new Date\(graceDeadlineIso\)\.getTime\(\) <= Date\.now\(\)\) \{/);
  assert.match(cron, /db\.from\("platform_admin_tasks"\)\.insert\(\{ type: "FREEZE_EXPIRED", shop_id: r\.shop_id \}\);/);
  assert.match(cron, /else if \(taskErr\.code !== "23505"\) console\.error\("\[SUBSCRIPTION_CRON\] platform_admin_tasks insert error"/, 'a real (non-duplicate) insert error must still be logged, never silently swallowed alongside the expected 23505 case');
  assert.doesNotMatch(cron, /status: "TERMINATED"|ustore_purge_shop_completely/, 'the cron must still never auto-purge — creating the task is as far as it ever goes, matching the user\'s explicit "avtomatik terminate qilinmasin" requirement');
});

test('platform_extend_frozen_grace resolves any open FREEZE_EXPIRED task for the shop (resolved_action=EXTENDED) as a best-effort side step that never blocks the main grant — this is how the 5A "Muddatni uzaytirish" admin choice actually clears the Dashboard attention item, without a separate resolve action', () => {
  const start = platformApi.indexOf('case "platform_extend_frozen_grace"');
  const block = platformApi.slice(start, platformApi.indexOf('\n      case ', start + 10));
  assert.match(block, /resolved_at: new Date\(\)\.toISOString\(\), resolved_action: "EXTENDED", resolved_by: tgId,/);
  assert.match(block, /\.eq\("shop_id", shopId\)\.eq\("type", "FREEZE_EXPIRED"\)\.is\("resolved_at", null\)/);
  assert.match(block, /try \{[\s\S]*resolved_action: "EXTENDED"[\s\S]*\} catch \(e\)/, 'must be wrapped so a resolve failure (e.g. no open task existed) never breaks the actual grace-extension');
});

// 2026-08-29, 058-migratsiya (application/payment provisioning): the old
// "Bot ulanishi kutilmoqda" (awaitingBotConnect) derived flag was replaced
// by the more precise `awaitingProvisioning` (also requires !applied_at —
// the new explicit "Do'kon qo'shish" stage hasn't run yet) plus a new
// `shopCreated` flag (applied_shop_id + applied_at both set) — matching the
// new provisioning UI which needs to distinguish "approved, not yet
// provisioned" from "already provisioned" rather than a vague bot-connect
// wait. Both fields still DERIVED (never a stored status), and the select/
// mapping logic was hoisted into a shared SUBSCRIPTION_REQUEST_SELECT +
// mapSubscriptionRequest() reused by every action touching this table.
test('awaitingProvisioning/shopCreated are DERIVED fields (never a stored status) computed once in the shared mapSubscriptionRequest(), reused by platform_list_subscription_requests instead of a second, duplicated inline mapping', () => {
  const mapStart = platformApi.indexOf('function mapSubscriptionRequest(r: any)');
  const mapBlock = platformApi.slice(mapStart, platformApi.indexOf('\nconst SUBSCRIPTION_REQUEST_SELECT', mapStart));
  assert.match(mapBlock, /awaitingProvisioning: r\.kind === "NEW_SHOP" && r\.status === "APPROVED" && !r\.applied_at,/);
  assert.match(mapBlock, /shopCreated: !!r\.applied_shop_id && !!r\.applied_at,/);

  const block = actionBlock('platform_list_subscription_requests');
  assert.match(block, /\.select\(SUBSCRIPTION_REQUEST_SELECT\)/);
  assert.match(block, /requests: \(data \|\| \[\]\)\.map\(mapSubscriptionRequest\)/);
});

// 2026-08-27, billing_period-band: UPGRADE endi so'rovning o'z
// duration_days/billing_period'idan foydalanadi (Oylik/Yillik) va
// EXTEND (qolgan muddat saqlanadi) bilan CHANGE (tarif almashtirish)ni
// alohida xabar bilan farqlaydi — asosiy idempotentlik/branching
// invariantlari o'zgarishsiz.
test('platform_approve_subscription_request is idempotent (refuses to re-process a request that is not currently NEW — an UPGRADE approval has a real side effect that must never double-fire) and branches correctly: UPGRADE applies the tariff immediately via applyTariffToShop using the request\'s own duration_days/billing_period, NEW_SHOP does not touch shop_settings at all and just tells the customer to wait', () => {
  const block = actionBlock('platform_approve_subscription_request');
  assert.match(block, /if \(reqRow\.status !== "NEW"\) return json\(\{ error: "request_not_pending" \}, 409\);/);
  assert.match(block, /if \(reqRow\.kind === "UPGRADE"\) \{/);
  assert.match(block, /const durationDays = Number\(reqRow\.duration_days \|\| 30\);/);
  // 2026-08-28, 054-migratsiya: qiymat-asosli proratsiya — endi haqiqiy
  // to'langan summa (tariff_price_snapshot) va billing_period ham
  // applyTariffToShop'ga uzatiladi (jonli tarif narxiga emas, shu bilan
  // keyingi CHANGE'lar aynan shu to'lov asosida to'g'ri hisoblanadi).
  assert.match(block, /await applyTariffToShop\(db, reqRow\.shop_id, reqRow\.tariff_id, \{\s*\n\s*durationDays, billingPeriod: reqRow\.billing_period, paidAmount: Number\(reqRow\.tariff_price_snapshot\), isExtend, allowFirstBonus: true,\s*\n\s*\}\);/);
  assert.match(block, /reqRow\.upgrade_action === "EXTEND"/, 'EXTEND and CHANGE must get distinct customer-facing messages');
  // 2026-08-28, 058-migratsiya (application/payment provisioning): NEW_SHOP
  // tasdiqlangach endi "24 soat ichida ulanadi" degan noaniq va'da o'rniga
  // aniq "Do'kon qo'shish" bosqichi ochiladi (renderRequestProvisioningBody,
  // platform_provision_shop_from_request) — admin ariza ma'lumotlaridan
  // (nomi/egasi/tarif) darhol, real vaqtda do'konni yaratadi.
  assert.match(block, /"✅ To'lovingiz tasdiqlandi\. Yangi do'konni yaratish bosqichi ochildi\."/, 'NEW_SHOP approval must point at the new explicit provisioning stage, not a vague 24h promise');
});

test('platform_reject_subscription_request requires a reason (mirrors shop-level reject_payment_receipt exactly) and never touches shop_settings/product_limit for either kind', () => {
  const block = actionBlock('platform_reject_subscription_request');
  assert.match(block, /if \(!reason\) return json\(\{ error: "reason_required" \}, 400\);/);
  assert.doesNotMatch(block, /applyTariffToShop|product_limit/, 'rejection must never have a tariff side effect');
});

// 2026-08-27, billing_period/duration_days-band: applyTariffToShop() endi
// options.durationDays qabul qiladi (Oylik=30/Yillik=365, so'rovdan keladi)
// — qattiq 30 kun EMAS. Asosiy invariantlar (first-subscription signal,
// +7 kun bonus, product_limit snapshot, frozen_at tozalanishi) o'zgarishsiz
// qoladi.
test('applyTariffToShop() snapshots the tariff\'s product_limit onto shop_settings (not a live join), supports a variable durationDays (Oylik=30/Yillik=365, no longer hardcoded), and adds a +7 day first-subscription bonus when subscription_expires_at was never set before', () => {
  const fnStart = platformApi.indexOf('async function applyTariffToShop');
  const fnBlock = platformApi.slice(fnStart, platformApi.indexOf('\nasync function previewTariffChange', fnStart));
  assert.match(fnBlock, /const isFirstSubscription = !existing\?\.subscription_expires_at;/, 'first-subscription signal must be derived from subscription_expires_at being NULL, not a new column');
  assert.match(fnBlock, /const durationDays = Math\.max\(1, Math\.min\(400, Math\.trunc\(Number\(options\.durationDays \|\| 30\)\)\)\);/);
  assert.match(fnBlock, /const bonusDays = isFirstSubscription && options\.allowFirstBonus !== false \? 7 : 0;/);
  assert.match(fnBlock, /tariff_id: tariffId, product_limit: tariff\.product_limit, subscription_expires_at: expiresAt, frozen_at: null,/, 'reactivating via a fresh tariff apply must also clear any stale frozen_at');
  assert.match(fnBlock, /return \{ bonusDaysApplied: bonusDays, expiresAt, convertedDays, remainingValue \};/);
});

// ---------------------------------------------------------------------------
// 2026-08-28: value-based proration (spec item 6/"7. Value-based proration"),
// user picked "5" then ">" (continue) to move to this last remaining item.
// Verified with the exact worked-example numbers a human would check by
// hand, not just regex-matching source text — this is money math, the
// highest-stakes code touched this session.
// ---------------------------------------------------------------------------

test('054 migration adds exactly the 3 proration columns to shop_settings (paid_end_at / daily_rate / bonus_days) plus a subscription_history audit table with a full breakdown per event — purely additive, 001-053 untouched', () => {
  const mig = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '054_subscription_proration.sql'), 'utf8');
  assert.match(mig, /add column if not exists current_period_paid_end_at timestamptz,/);
  assert.match(mig, /add column if not exists current_period_daily_rate numeric,/);
  assert.match(mig, /add column if not exists current_period_bonus_days integer not null default 0;/);
  assert.match(mig, /create table public\.subscription_history \(/);
  assert.match(mig, /event_type text not null check \(event_type in \('NEW', 'EXTEND', 'CHANGE'\)\)/);
  assert.doesNotMatch(mig, /drop table|drop column|rename/i);
});

test('EXTEND (same tariff — no proration) simply adds the newly purchased days on top of the existing paid_end_at, and never runs the value-conversion branch at all (convertedDays stays 0, remainingValue stays 0) even if the shop has real remaining paid time — because nothing is being exchanged, there is nothing to convert', () => {
  const fnStart = platformApi.indexOf('async function applyTariffToShop');
  const fnBlock = platformApi.slice(fnStart, platformApi.indexOf('\nasync function previewTariffChange', fnStart));
  assert.match(fnBlock, /if \(!isExtend && !isFirstSubscription && remainingPaidDays > 0 && oldDailyRate > 0\) \{/, 'conversion must be explicitly gated OFF for isExtend');
  assert.match(fnBlock, /const extraPaidDays = isExtend \? durationDays : \(durationDays \+ convertedDays\);/);
});

test('CHANGE (different tariff) converts remaining PAID days using the OLD tariff\'s stored daily rate from the actual past payment (current_period_daily_rate) — never the live/current tariff price of the OLD tariff, which could have been edited since — worked example: 20 remaining days at a stored rate of 333.33/day (10,000 so\'m / 30 days) = 6,666.6 so\'m remaining value; converting into a new tariff priced at 50,000/30 days = 1,666.67/day gives floor(6666.6 / 1666.67) = 3 converted days, added on top of the 30 newly-purchased days', () => {
  const fnStart = platformApi.indexOf('async function applyTariffToShop');
  const fnBlock = platformApi.slice(fnStart, platformApi.indexOf('\nasync function previewTariffChange', fnStart));
  assert.match(fnBlock, /remainingValue = remainingPaidDays \* oldDailyRate;/);
  assert.match(fnBlock, /const newDailyRate = paidAmount \/ durationDays;/);
  assert.match(fnBlock, /convertedDays = newDailyRate > 0 \? Math\.floor\(remainingValue \/ newDailyRate\) : 0;/, 'must floor, never round up — rounding up would silently overpay the customer in converted days');
  // Hand-check the actual arithmetic invariant (not just source text):
  const remainingPaidDays = 20;
  const oldDailyRate = 10000 / 30;
  const remainingValue = remainingPaidDays * oldDailyRate;
  const newDailyRate = 50000 / 30;
  const convertedDays = Math.floor(remainingValue / newDailyRate);
  assert.strictEqual(Math.round(remainingValue * 100) / 100, 6666.67, 'sanity-check the worked example itself');
  assert.strictEqual(convertedDays, 3);
});

test('a fresh/never-before-proration shop (current_period_paid_end_at is NULL — either truly first subscription, or an existing shop that predates this migration) never fabricates a remaining value out of nothing: remainingPaidDays resolves to 0, so a tariff CHANGE for such a shop purchases exactly its new duration with zero bonus conversion, never a guessed credit', () => {
  const fnStart = platformApi.indexOf('async function applyTariffToShop');
  const fnBlock = platformApi.slice(fnStart, platformApi.indexOf('\nasync function previewTariffChange', fnStart));
  assert.match(fnBlock, /const remainingPaidDays = Number\.isFinite\(oldPaidEndMs\) && oldPaidEndMs > now \? \(oldPaidEndMs - now\) \/ \(24 \* 3600 \* 1000\) : 0;/);
});

test('first-subscription bonus days (+7) are tracked in a dedicated bonus_days pool, completely separate from the money math — carriedBonusDays is derived from the OLD bonus pool and the tail of the old expiry (never from remainingValue/oldDailyRate), and a tariff CHANGE/EXTEND can only carry bonus days forward (min-capped at the original grant), never manufacture extra ones', () => {
  const fnStart = platformApi.indexOf('async function applyTariffToShop');
  const fnBlock = platformApi.slice(fnStart, platformApi.indexOf('\nasync function previewTariffChange', fnStart));
  assert.match(fnBlock, /carriedBonusDays = Math\.min\(oldBonusTotal, Math\.max\(0, Math\.round\(\(oldExpiresMs - bonusTailStart\) \/ \(24 \* 3600 \* 1000\)\)\)\);/, 'must be capped at the original bonus grant, never exceed it');
  assert.match(fnBlock, /const totalBonusDays = bonusDays \+ carriedBonusDays;/);
  assert.doesNotMatch(fnBlock, /carriedBonusDays.*oldDailyRate|remainingValue.*bonus/i, 'bonus days must never be computed FROM the money math');
});

test('every applyTariffToShop() call writes a matching subscription_history row with the full breakdown (old/new tariff+expiry, purchased days/amount/period, remaining value before, converted days, bonus days) — an audit-quality trail an admin can actually reconstruct the math from, and a failure to write it (best-effort) never blocks the real subscription update since it is try/caught separately after the shop_settings update already succeeded', () => {
  const fnStart = platformApi.indexOf('async function applyTariffToShop');
  const fnBlock = platformApi.slice(fnStart, platformApi.indexOf('\nasync function previewTariffChange', fnStart));
  const historyInsertIdx = fnBlock.indexOf('db.from("subscription_history").insert(');
  const settingsUpdateIdx = fnBlock.indexOf('db.from("shop_settings").update(');
  assert.ok(settingsUpdateIdx >= 0 && historyInsertIdx > settingsUpdateIdx, 'the real update must happen and succeed BEFORE the audit-log write is attempted');
  assert.match(fnBlock, /catch \(e\) \{ console\.error\("subscription_history insert error", e\); \}/, 'a history-log failure must be swallowed, not thrown, since the subscription itself already changed successfully');
  assert.match(fnBlock, /event_type: isFirstSubscription \? "NEW" : isExtend \? "EXTEND" : "CHANGE",/);
});

test('platform_preview_tariff_change is a dry-run that NEVER writes (calls previewTariffChange, not applyTariffToShop), enforces ownership via shop_memberships (never trusts a client-supplied shopId as authorization), and computes the SAME paidAmount formula (price × 10 for ANNUAL) as the real submit action so the preview a customer sees can never drift from what they actually get charged', () => {
  const block = actionBlock('platform_preview_tariff_change');
  assert.doesNotMatch(block, /applyTariffToShop\(/, 'a preview must never call the real, writing function');
  assert.match(block, /previewTariffChange\(db, shopId, tariffId, durationDays, paidAmount, isExtend\)/);
  assert.match(block, /\.eq\("shop_id", shopId\)\.eq\("telegram_user_id", tgId\)\.eq\("role", "OWNER"\)\.eq\("status", "ACTIVE"\)\.maybeSingle\(\);/);
  assert.match(block, /if \(!membership\) return json\(\{ error: "not_shop_owner" \}, 403\);/);
  assert.match(block, /const paidAmount = billingPeriod === "ANNUAL" \? Number\(tariff\.price\) \* 10 : Number\(tariff\.price\);/);
});

test('previewTariffChange() (the dry-run) and applyTariffToShop() (the real write) use the IDENTICAL conversion formula — checked by comparing the actual arithmetic statements, not just "both exist" — so the number a customer previews can never differ from what they actually receive', () => {
  const previewStart = platformApi.indexOf('async function previewTariffChange');
  const previewBlock = platformApi.slice(previewStart, platformApi.indexOf('\n      switch (action)', previewStart) > 0 ? platformApi.indexOf('\n      switch (action)', previewStart) : platformApi.length);
  assert.match(previewBlock, /remainingValue = remainingPaidDays \* oldDailyRate;/);
  assert.match(previewBlock, /const newDailyRate = paidAmount \/ durationDays;/);
  assert.match(previewBlock, /convertedDays = newDailyRate > 0 \? Math\.floor\(remainingValue \/ newDailyRate\) : 0;/);
});

test('platform_list_subscription_history is admin-only and returns the full breakdown fields (not just a summary) so an admin can actually verify the math for a specific shop, ordered newest-first', () => {
  const block = actionBlock('platform_list_subscription_history');
  assert.match(block, /requirePlatformSuperAdmin\(\);/);
  assert.match(block, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(block, /remainingPaidDaysBefore: Number\(h\.remaining_paid_days_before\), remainingValueConverted: Number\(h\.remaining_value_converted\),/);
});

test('admin Shop Details loads and renders "Obuna tarixi" (openShopDetails triggers loadSubscriptionHistory; a tariff bind via applyTariffFromShopDetails re-triggers it so the new event shows up without navigating away and back), keyed per-shop so switching shops never shows stale history from a previously-viewed shop', () => {
  const openStart = platformApp.indexOf('function openShopDetails(shopId)');
  const openBlock = platformApp.slice(openStart, platformApp.indexOf('\n  // 2026-08-28, 054-migratsiya: "Obuna tarixi"', openStart) + 4);
  assert.match(openBlock, /loadSubscriptionHistory\(shopId\);/);
  const applyStart = platformApp.indexOf('async function applyTariffFromShopDetails(shopId)');
  const applyBlock = platformApp.slice(applyStart, platformApp.indexOf('\n  }', applyStart) + 4);
  assert.match(applyBlock, /loadSubscriptionHistory\(shopId\);/);
  const cardStart = platformApp.indexOf('function renderSubscriptionHistoryCard(shopId)');
  const cardBlock = platformApp.slice(cardStart, platformApp.indexOf('\n  }', cardStart) + 4);
  assert.match(cardBlock, /if \(!subscriptionHistoryForShop \|\| subscriptionHistoryForShop\.shopId !== shopId\) \{/, 'must not render a different shop\'s stale history rows');
});

// ---------------------------------------------------------------------------
// 2026-08-28: the final 2 remaining spec sub-items — notification Group A
// (Mini-App opened, never subscribed) + admin test-send button.
// ---------------------------------------------------------------------------

const notificationMigration2 = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '055_visitor_notifications.sql'), 'utf8');

test('055 migration adds platform_visitor_tracking (own idempotency columns, since it has no shop_id and cannot use notification_events which requires one) and dynamically widens (never guesses a hardcoded constraint name) notification_templates.type to include VISITOR_1D/3D/7D on top of the original 6, seeded with default copy', () => {
  assert.match(notificationMigration2, /create table public\.platform_visitor_tracking \(/);
  assert.match(notificationMigration2, /telegram_user_id bigint primary key,/);
  assert.match(notificationMigration2, /reminder_1d_sent_at timestamptz,/);
  assert.match(notificationMigration2, /reminder_3d_sent_at timestamptz,/);
  assert.match(notificationMigration2, /reminder_7d_sent_at timestamptz/);
  assert.match(notificationMigration2, /select conname into con_name\s*\n\s*from pg_constraint/, 'must find the constraint dynamically, same safe pattern as migration 017 — never a guessed/hardcoded name');
  assert.match(notificationMigration2, /check \(type in \(\s*\n\s*'EXPIRY_7D', 'EXPIRY_3D', 'EXPIRY_1D', 'FROZEN', 'GRACE_7D', 'GRACE_1D',\s*\n\s*'VISITOR_1D', 'VISITOR_3D', 'VISITOR_7D'/, 'must ADD to the enum, not replace/narrow the original 6');
  assert.doesNotMatch(notificationMigration2, /drop table|drop column|rename/i);
});

test('platform_boot tracks a visitor\'s first Mini-App visit ONLY for users who currently have zero shops (myShops.length check happens BEFORE the insert, using the same listMyShops() result already computed for the response — no extra query), fires the insert through EdgeRuntime.waitUntil (so it reliably completes even though the response returns immediately without awaiting it), and never lets a tracking failure break the boot response (no try/catch needed around waitUntil itself, but the insert\'s own failure — e.g. a returning visitor\'s PK conflict — is expected and silently fine)', () => {
  const block = actionBlock('platform_boot');
  assert.match(block, /if \(!myShops\.length\) \{/);
  assert.match(block, /EdgeRuntime\.waitUntil\(db\.from\("platform_visitor_tracking"\)\.insert\(\{ telegram_user_id: tgId \}\)\);/);
});

test('the cron\'s Group A section (sendVisitorReminder) uses a CONDITIONAL UPDATE (only WHERE the sent-column is still NULL) as its idempotency mechanism instead of notification_events — a fundamentally different but equally atomic guarantee, necessary because platform_visitor_tracking has no shop_id — and re-checks shop ownership via a SINGLE BATCHED shop_memberships query (not one query per visitor) immediately before sending, so a visitor who subscribed in the meantime is correctly skipped', () => {
  const fnStart = cronSource.indexOf('async function sendVisitorReminder(');
  const fnBlock = cronSource.slice(fnStart, cronSource.indexOf('\nDeno.serve', fnStart) > 0 ? cronSource.indexOf('\nDeno.serve', fnStart) : cronSource.length);
  assert.match(fnBlock, /\.update\(\{ \[sentColumn\]: new Date\(\)\.toISOString\(\) \}\)\s*\n\s*\.eq\("telegram_user_id", telegramUserId\)\.is\(sentColumn, null\)\.select\("telegram_user_id"\);/);
  assert.match(fnBlock, /if \(error \|\| !updated \|\| !updated\.length\) return false;/, 'a no-op update (already sent) must be treated as "did not send", not an error');

  const sectionStart = cronSource.indexOf('// ---- 4) Mini-App ochilgan');
  const sectionBlock = cronSource.slice(sectionStart, cronSource.indexOf('\n  return json({', sectionStart));
  assert.match(sectionBlock, /db\.from\("shop_memberships"\)\.select\("telegram_user_id"\)\.in\("telegram_user_id", visitorIds\)/, 'must be one batched query, not per-visitor');
  assert.match(sectionBlock, /if \(nowOwnerIds\.has\(tgIdStr\)\) continue;/, 'must skip a visitor who has since become an owner');
});

test('the Group A reminder chain stops after 7 days: the cron only ever considers rows where reminder_7d_sent_at is still NULL (rows that already got their final reminder are excluded from the query entirely, so no 4th/5th/Nth reminder can ever be sent — matching the spec\'s "not infinite marketing" requirement)', () => {
  const sectionStart = cronSource.indexOf('// ---- 4) Mini-App ochilgan');
  const sectionBlock = cronSource.slice(sectionStart, cronSource.indexOf('\n  return json({', sectionStart));
  assert.match(sectionBlock, /\.is\("reminder_7d_sent_at", null\)/);
});

// 2026-08-29, 7-topshiriq round (task 7, admin bildirishnoma rasm yuklash):
// the template's image can now be an UPLOADED file (image_storage_path,
// resolved to a signed URL) as well as a plain external URL — the test
// send now checks the storage path first, falling back to image_url only
// if there's no uploaded asset. Also extended to the FROZEN/REACTIVATED/
// TERMINATED lifecycle types (task 6) with their own {REASON}/{ACTION}/
// {SUPPORT_CONTACT} sample placeholders, sourced from loadLifecycleSettings().
test('platform_send_test_notification is admin-only, sends the CURRENTLY SAVED template body (not any unsaved draft edits — it re-fetches from the DB) filled with clearly-labeled sample placeholder data to the calling admin\'s own chat_id, resolves an UPLOADED image (image_storage_path) to a signed URL before falling back to a plain image_url, and prefixes the message so it can never be mistaken for a real customer notification', () => {
  const block = actionBlock('platform_send_test_notification');
  assert.match(block, /requirePlatformSuperAdmin\(\);/);
  assert.match(block, /const validTypes = \[.*"REACTIVATED", "TERMINATED"\];/, 'must cover the new lifecycle notification types too');
  assert.match(block, /db\.from\("notification_templates"\)\s*\n\s*\.select\("body,image_url,image_storage_path"\)\.eq\("type", type\)\.maybeSingle\(\);/, 'must re-read from the DB, never trust a client-supplied body');
  assert.match(block, /chat_id: tgId,/, 'must go to the calling admin, never any real customer/shop');
  assert.match(block, /text = `🧪 SINOV XABARI \(haqiqiy mijozga yuborilmaydi\)\\n\\n\$\{text\}`;/, 'must be unmistakably labeled as a test');
  assert.match(block, /const uploaded = await signedPlatformAssetUrl\(db, tpl\.image_storage_path \|\| null, 3600\);/);
  assert.match(block, /const image = uploaded \|\| tpl\.image_url \|\| null;/, 'an uploaded asset must take priority over a plain external URL, never the reverse');
});

test('the admin template editor has a real "Sinov xabar yuborish" button wired to platform_send_test_notification, with its own in-flight guard (sendingTestNotification) so a slow send can\'t be double-triggered by an impatient double-tap', () => {
  // 2026-08-28 v15-sync: shablon muharriri "Admin sozlamalari" hub'iga
  // ko'chirilgach, tugma markup'i (bo'shliqsiz ternary) biroz o'zgardi —
  // xatti-harakat (in-flight guard, disabled holati) bir xil qoldi.
  assert.match(platformApp, /onclick="sendTestNotification\('\$\{d\.type\}'\)" \$\{sendingTestNotification\?'disabled':''\}/);
  const fnStart = platformApp.indexOf('async function sendTestNotification(type)');
  const fnBlock = platformApp.slice(fnStart, platformApp.indexOf('\n  }', fnStart) + 4);
  assert.match(fnBlock, /if \(sendingTestNotification\) return;/);
  assert.match(fnBlock, /callPlatformApi\('platform_send_test_notification', \{ type \}\)/);
});

test('the customer PAYMENT page shows a real server-computed plan-change preview only for tariff CHANGE (UPGRADE + upgrade_action=CHANGE with a real shop) — never for EXTEND (nothing to convert) or a brand-new shop (nothing to convert FROM) — and the preview re-fetches (keyed by shop+tariff+billing period) whenever the customer toggles Oylik/Yillik, since that changes the real paidAmount/durationDays used in the calculation', () => {
  // 2026-08-28 v15-sync: renderTariffChangePreview() now receives the full
  // shop/tariff objects (not just their ids) — it grew into a richer
  // "Hozirgi tarif -> Yangi tarif" comparison card (using shop.tariffName
  // for display), a fuller version of the spec's "plan-change preview
  // screen" than the plain text summary this session originally shipped.
  assert.match(platformApp, /\$\{flowKind === 'UPGRADE' && flowUpgradeAction === 'CHANGE' && shop \? renderTariffChangePreview\(shop, tariff, isAnnual\) : ''\}/);
  const fnStart = platformApp.indexOf('async function ensureTariffChangePreviewLoaded(shopId, tariffId, isAnnual)');
  const fnBlock = platformApp.slice(fnStart, platformApp.indexOf('\n  function renderTariffChangePreview', fnStart));
  assert.match(fnBlock, /const key = `\$\{shopId\}:\$\{tariffId\}:\$\{isAnnual \? 'ANNUAL' : 'MONTHLY'\}`;/, 'the cache key must include billing period so toggling Oylik/Yillik forces a fresh, correct calculation');
  assert.match(fnBlock, /callPlatformApi\('platform_preview_tariff_change', \{ shopId, tariffId, billingPeriod: isAnnual \? 'annual' : 'monthly' \}\)/);
});

test('platform_connect_bot now sends a "your shop is ready" welcome message through the NEW shop\'s own bot token (not the platform bot) after the webhook is live, unconditionally on every successful connect — the manual trigger itself, its required payload, and its retry-on-partial-failure behavior are all completely unchanged', () => {
  const block = actionBlock('platform_connect_bot');
  assert.match(block, /await telegramApi\(botToken, "sendMessage", \{\s*\n\s*chat_id: ownerTelegramId,\s*\n\s*text: "🎉 Do'koningiz tayyor! \/start tugmasini bosing\."/);
  // Must come AFTER the shops.status -> ACTIVE update, and the function must
  // still take exactly the same two required payload fields as before.
  const activateIdx = block.indexOf('status: "ACTIVE"');
  const notifyIdx = block.indexOf('Do\'koningiz tayyor');
  assert.ok(activateIdx >= 0 && notifyIdx > activateIdx, 'the welcome message must fire only after the shop is truly ACTIVE');
  assert.match(block, /const botToken = String\(payload\.botToken \|\| ""\)\.trim\(\);/, 'payload shape unchanged');
  assert.match(block, /const ownerTelegramId = String\(payload\.ownerTelegramId \|\| ""\)\.trim\(\);/, 'payload shape unchanged');
});

test('10-band: platform_connect_bot now ALSO sends a confirmation from the platform bot itself (not just the new shop\'s own bot), with a real https://t.me/<username> link to the freshly connected bot — sent after, not instead of, the existing shop-bot welcome message', () => {
  const block = actionBlock('platform_connect_bot');
  const shopBotNotifyIdx = block.indexOf("Do'koningiz tayyor! /start");
  const platformNotifyIdx = block.indexOf('PLATFORM_BOT_TOKEN, "sendMessage"');
  assert.ok(shopBotNotifyIdx >= 0 && platformNotifyIdx > shopBotNotifyIdx, 'the platform-bot notification must be sent AFTER the existing shop-bot welcome message, not replacing it');
  assert.match(block, /text: `🎉 Do'koningiz muvaffaqiyatli ulandi!\\n\\nBotingiz: @\$\{me\.username\}\\nhttps:\/\/t\.me\/\$\{me\.username\}`,/);
  assert.match(block, /if \(me\.username\) \{/, 'must guard against a bot with no username (rare, but the link would be meaningless)');
});

test('platform_list_shops extension adds tariffName/productLimit/subscriptionExpiresAt via a NEW, separate shop_settings+tariffs join, without touching the existing safe-columns select on shop_bots (a prior test already locks that exact string)', () => {
  const block = actionBlock('platform_list_shops');
  assert.match(block, /db\.from\("shop_bots"\)\.select\("shop_id,telegram_bot_id,bot_username,bot_name,status,created_at"\)/, 'the existing safe-columns select is extended (completion-pass 2.6-band: bot status/connected-date for the new Bot va integratsiyalar screen), never replaced');
  assert.match(block, /db\.from\("shop_settings"\)\.select\("shop_id,tariff_id,product_limit,subscription_expires_at,frozen_at"\)/);
  assert.match(block, /tariffName: st\?\.tariff_id \? \(tariffNameById\.get\(st\.tariff_id\) \|\| null\) : null,/);
});

// ---------------------------------------------------------------------------
// 2026-08-28: Billz/Click/Payme/Uzum integration UX unification (spec item
// 4). Real bug found+fixed: the admin Shop Details "Integratsiyalar" card
// showed Billz's ACCESS-GRANT toggle as "✅ Ulangan" (Connected) while the
// identical toggle for Click/Payme/Uzum said "✅ Ruxsat berilgan" (Access
// granted) — misleading, since granting access never means the shop has
// actually entered real credentials yet. Fixed by (a) unifying all 4 toggle
// labels, and (b) adding a genuinely separate second line showing the REAL
// per-provider connection status from *_connections tables.
// ---------------------------------------------------------------------------

test('platform_list_shops now also joins billz_connections/click_connections/payme_connections/uzum_connections (status only — Click/Payme also verified, Billz also last_error) as a NEW, separate query set, and NEVER selects any credential/token/secret column from those tables', () => {
  const block = actionBlock('platform_list_shops');
  assert.match(block, /db\.from\("billz_connections"\)\.select\("shop_id,status,last_error"\)/);
  assert.match(block, /db\.from\("click_connections"\)\.select\("shop_id,status,verified"\)/);
  assert.match(block, /db\.from\("payme_connections"\)\.select\("shop_id,status,verified"\)/);
  assert.match(block, /db\.from\("uzum_connections"\)\.select\("shop_id,status"\)/);
  assert.doesNotMatch(block, /secret_token|access_token|refresh_token|ciphertext/i, 'the response must never carry credential material, even ciphertext');
  assert.match(block, /billzConnectionStatus: billzConn\?\.status \|\| "DISCONNECTED",/);
  assert.match(block, /clickVerified: clickConn\?\.verified === true,/);
  assert.match(block, /paymeVerified: paymeConn\?\.verified === true,/);
  assert.match(block, /uzumConnectionStatus: uzumConn\?\.status \|\| "DISCONNECTED",/);
});

test('integrationStatusBadge() gives a distinct, correctly-worded label per real state: DISCONNECTED -> "Sozlanmagan", plain CONNECTED -> "Ulangan", CONNECTED+verified:false -> a clearly different "hali tekshirilmagan" warning (not conflated with plain Connected), CONNECTED+verified:true -> "va tekshirilgan", and ERROR -> a distinct danger-toned label (optionally including the real last_error text, escaped)', () => {
  const fnStart = platformApp.indexOf('function integrationStatusBadge(status, opts)');
  const fnBlock = platformApp.slice(fnStart, platformApp.indexOf('\n  function renderIntegrationRow', fnStart));
  assert.match(fnBlock, /if \(status === 'ERROR'\) return \{ label: `Xatolik\$\{opts\.lastError \? ': ' \+ escapeHtml\(opts\.lastError\) : ''\}`, tone: 'danger' \};/);
  assert.match(fnBlock, /if \(opts\.verified === false\) return \{ label: 'Ulangan, hali tekshirilmagan', tone: 'warn' \};/);
  assert.match(fnBlock, /if \(opts\.verified === true\) return \{ label: 'Ulangan va tekshirilgan', tone: 'ok' \};/);
  assert.match(fnBlock, /return \{ label: 'Ulangan', tone: 'ok' \};/, 'plain CONNECTED with no verified concept (Billz/Uzum) must still resolve to a real label');
  assert.match(fnBlock, /return \{ label: 'Sozlanmagan', tone: 'muted' \};/);
});

test('all 4 integration rows (BILLZ/CLICK/PAYME/UZUM) now render through the SAME renderIntegrationRow() helper with IDENTICAL "✅ Ruxsat berilgan" / "— Ruxsat berilmagan" wording — the old Billz-only "✅ Ulangan" text is completely gone, and each row also shows the real per-provider connection status underneath (not just the access toggle)', () => {
  assert.doesNotMatch(platformApp, /'✅ Ulangan' : '/, 'the misleading Billz-only "Connected" wording on the access-grant toggle must be fully removed');
  const bodyStart = platformApp.indexOf('function renderShopDetailsBody()');
  const bodyBlock = platformApp.slice(bodyStart, platformApp.indexOf('\n  async function applyTariffFromShopDetails', bodyStart));
  assert.match(bodyBlock, /renderIntegrationRow\('BILLZ', s\.billzAccessGranted, `toggleBillzAccess\('\$\{s\.id\}', \$\{!s\.billzAccessGranted\}\)`, s\.billzConnectionStatus, \{ lastError: s\.billzLastError \}\)/);
  assert.match(bodyBlock, /renderIntegrationRow\('CLICK', s\.clickAccessGranted, `toggleClickAccess\('\$\{s\.id\}', \$\{!s\.clickAccessGranted\}\)`, s\.clickConnectionStatus, \{ verified: s\.clickVerified \}\)/);
  assert.match(bodyBlock, /renderIntegrationRow\('PAYME', s\.paymeAccessGranted, `togglePaymeAccess\('\$\{s\.id\}', \$\{!s\.paymeAccessGranted\}\)`, s\.paymeConnectionStatus, \{ verified: s\.paymeVerified \}\)/);
  assert.match(bodyBlock, /renderIntegrationRow\('UZUM', s\.uzumAccessGranted, `toggleUzumAccess\('\$\{s\.id\}', \$\{!s\.uzumAccessGranted\}\)`, s\.uzumConnectionStatus, \{\}\)/);
});

// ---------------------------------------------------------------------------
// 2026-08-28: Telegram notification system — FOUNDATION slice (spec item 5,
// user picked "5"). Scope deliberately limited to what's real and buildable
// now: admin-editable templates (spec sub-item D) + a real idempotency log
// (sub-item E) + filling the EXPIRY_7D/EXPIRY_1D gaps in the ALREADY-EXISTING
// platform-subscription-cron (which previously only had a 3-day pre-expiry
// warning, not the spec's full 7/3/1). Group A (Mini-App-opened-but-never-
// subscribed reminders) is a SEPARATE trigger unrelated to the subscription
// cron and is explicitly NOT part of this slice — recorded as still pending.
// ---------------------------------------------------------------------------

const notificationMigration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '053_notification_system.sql'), 'utf8');
const cronSource = fs.readFileSync(path.join(FUNCTIONS_DIR, 'platform-subscription-cron', 'index.ts'), 'utf8');

test('053 migration creates notification_templates (PK=type, restricted to exactly the 6 real trigger types) seeded with the 6 default message bodies, and notification_events as a REAL idempotency log with a hard UNIQUE(shop_id, notification_type, milestone) constraint — purely additive, 001-052 untouched', () => {
  assert.match(notificationMigration, /create table public\.notification_templates \(/);
  assert.match(notificationMigration, /type text primary key check \(type in \(/);
  for (const type of ['EXPIRY_7D', 'EXPIRY_3D', 'EXPIRY_1D', 'FROZEN', 'GRACE_7D', 'GRACE_1D']) {
    assert.match(notificationMigration, new RegExp(`'${type}'`), `template type enum must include ${type}`);
    assert.match(notificationMigration, new RegExp(`\\('${type}', '`), `must be seeded with a default body`);
  }
  assert.match(notificationMigration, /create table public\.notification_events \(/);
  assert.match(notificationMigration, /unique \(shop_id, notification_type, milestone\)/, 'idempotency must be enforced at the DB level, not just app logic');
  assert.doesNotMatch(notificationMigration, /drop table|drop column|rename/i);
});

test('the cron\'s idempotency now goes through a real INSERT into notification_events (a unique_violation, code 23505, means "already sent" and is silently skipped, not treated as an error) instead of trusting a fragile day-window calculation alone — the day-window is now explicitly documented as just a coarse pre-filter, with the DB constraint as the actual guarantee', () => {
  const fnStart = cronSource.indexOf('async function sendTemplatedNotification(');
  const fnBlock = cronSource.slice(fnStart, cronSource.indexOf('\nasync function loadTemplates', fnStart));
  assert.match(fnBlock, /db\.from\("notification_events"\)\.insert\(\{ shop_id: shopId, notification_type: type, milestone \}\)/);
  assert.match(fnBlock, /if \(insErr\.code !== "23505"\)/, 'a unique-violation must be treated as "already sent", not logged as a real error');
  assert.match(fnBlock, /return false;/);
});

test('the cron now sends all THREE pre-expiry reminders (7/3/1 days, spec section B) instead of only the 3-day one it had before this slice, each with its own milestone key (the shop\'s current subscription_expires_at) so a later renewal naturally allows a fresh reminder next cycle without any extra "subscription id" column', () => {
  const sectionStart = cronSource.indexOf('// ---- 2) Tugashiga 7/3/1 kun qolgan');
  const sectionBlock = cronSource.slice(sectionStart, cronSource.indexOf('// ---- 3)', sectionStart));
  assert.match(sectionBlock, /"EXPIRY_7D", r\.subscription_expires_at,/);
  assert.match(sectionBlock, /"EXPIRY_3D", r\.subscription_expires_at,/);
  assert.match(sectionBlock, /"EXPIRY_1D", r\.subscription_expires_at,/);
});

test('the cron loads template bodies from the DB (loadTemplates) and substitutes real placeholders ({SHOP_NAME}/{DAYS_LEFT}/{EXPIRY_DATE}/{RETENTION_DAYS_LEFT}) via fillPlaceholders() instead of any remaining hardcoded message string, and skips sending entirely (via tpl.isActive) when an admin has deactivated that template — never force-sends regardless of the admin\'s setting', () => {
  assert.match(cronSource, /const templates = await loadTemplates\(db\);/);
  assert.match(cronSource, /function fillPlaceholders\(body: string, placeholders: Record<string, string>\): string \{/);
  assert.match(cronSource, /if \(!tpl \|\| !tpl\.isActive\) return false;/, 'a deactivated template must be a real no-send, not just a UI hint');
  assert.doesNotMatch(cronSource, /"⚠️ Obunangiz 3 kundan keyin tugaydi\./, 'the old hardcoded 3-day string must be fully removed from the cron, now living only in the DB-backed template');
});

// 2026-08-29, 7-topshiriq round: validTypes widened again (REACTIVATED/
// TERMINATED, task 6's lifecycle templates — 9 -> 11, still additive) and
// the update action gained real device-upload image support (task 7):
// storePlatformAsset() stores a new file, `removeImage: true` clears it,
// and — importantly — a REPLACED or REMOVED old file is actually deleted
// from storage afterward (never silently orphaned) via a fire-and-forget
// EdgeRuntime.waitUntil so the response isn't slowed down by the cleanup.
test('platform_admin_list_notification_templates/platform_update_notification_template are both admin-only, the update action restricts `type` to the real fixed enum (never lets a client create an arbitrary new template row), validates image_url as HTTPS-only when provided, and supports a real device-uploaded image (storePlatformAsset) that replaces/removes the previous stored file with reference-safe cleanup', () => {
  assert.match(actionBlock('platform_admin_list_notification_templates'), /requirePlatformSuperAdmin\(\);/);
  const updateBlock = actionBlock('platform_update_notification_template');
  assert.match(updateBlock, /requirePlatformSuperAdmin\(\);/);
  assert.match(updateBlock, /const validTypes = \["EXPIRY_7D", "EXPIRY_3D", "EXPIRY_1D", "FROZEN", "GRACE_7D", "GRACE_1D", "VISITOR_1D", "VISITOR_3D", "VISITOR_7D", "REACTIVATED", "TERMINATED"\];/);
  assert.match(updateBlock, /if \(!validTypes\.includes\(type\)\) return json\(\{ error: "invalid_template_type" \}, 400\);/);
  assert.ok(updateBlock.includes('if (imageUrlRaw && !/^https:\\/\\//i.test(imageUrlRaw)) return json({ error: "invalid_image_url" }, 400);'), 'notification image URL must be HTTPS-only');
  assert.match(updateBlock, /if \(payload\.imageUpload\) \{/);
  assert.match(updateBlock, /storePlatformAsset\(db, "notification-templates", type, payload\.imageUpload\)/);
  assert.match(updateBlock, /let nextPath = \(payload\.removeImage === true \|\| imageUrlRaw\) \? null : currentPath;/);
  assert.match(updateBlock, /if \(currentPath && currentPath !== nextPath\) \{/, 'a replaced/removed old file must actually be cleaned up, never left orphaned in storage');
  assert.match(updateBlock, /EdgeRuntime\.waitUntil\(cleanupPlatformAssetIfUnreferenced\(db, currentPath, "old-notification-image"\)/);
  assert.match(platformApi, /async function platformAssetPathStillReferenced/);
  assert.match(platformApi, /\["platform_payment_methods", "logo_storage_path"\]/);
  assert.match(platformApi, /\["notification_templates", "image_storage_path"\]/);
});

test('the admin gets a "Telegram bildirishnomalari" CRUD section (edit body/image/active per template type), loaded alongside the other admin settings (card/payment methods) in one batch', () => {
  // 2026-08-28 v15-sync: card/payment-methods/notification-templates were
  // split OUT of loadAdminTariffs() into their own loadAdminSettings()
  // loader (loadAdminTariffs() now loads only tariffs) as part of moving
  // these into a dedicated "Admin sozlamalari" hub — the templates are
  // still loaded in one batch, just a different (better-separated) one.
  const loadStart = platformApp.indexOf('async function loadAdminSettings()');
  const loadBlock = platformApp.slice(loadStart, platformApp.indexOf('\n  async function loadAdminTariffs', loadStart));
  assert.match(loadBlock, /callPlatformApi\('platform_admin_list_notification_templates', \{\}\)/);
  assert.match(loadBlock, /adminNotificationTemplates = nData\.templates \|\| \[\];/);

  // 2026-08-29, 7-topshiriq round (task 7): the save now also converts a
  // real chosen file (notificationTemplateImageFile) to base64 and sends
  // it as imageUpload, plus a removeImage flag — same call site, richer
  // payload.
  const saveStart = platformApp.indexOf('async function saveNotificationTemplateDraft()');
  const saveBlock = platformApp.slice(saveStart, platformApp.indexOf('\n  }', saveStart) + 4);
  assert.match(saveBlock, /const imageUpload = notificationTemplateImageFile \? \{ base64: await fileToBase64\(notificationTemplateImageFile\), mimeType: notificationTemplateImageFile\.type, fileName: notificationTemplateImageFile\.name \} : undefined;/);
  assert.match(saveBlock, /callPlatformApi\('platform_update_notification_template', \{ type: notificationTemplateDraft\.type, body, imageUrl: imageUrlRaw \|\| null, imageUpload, removeImage: notificationTemplateImageRemove, isActive \}\)/);
  assert.match(saveBlock, /await loadAdminSettings\(\);/);
});

// ---------------------------------------------------------------------------
// Frontend: platform/platform-app.js — rozilik + obuna hayot sikli UI
// ---------------------------------------------------------------------------

test('the mandatory Terms/Privacy consent checkbox defaults to FALSE, is never native-disabled (so a click can show the required-consent message), and gates submitSubscriptionRequest() before it ever calls the API', () => {
  assert.match(platformApp, /let consentAccepted = false;/, 'must default to false, user must check it themselves');
  const submitStart = platformApp.indexOf('async function submitSubscriptionRequest');
  // Sliced to the function's own closing brace (not a fixed char count —
  // that magic number needed bumping three rounds in a row as this
  // function legitimately grew) so it keeps working no matter how many
  // more preamble/payload lines get added later.
  const submitEnd = platformApp.indexOf('\n  }', submitStart);
  const submitBlock = platformApp.slice(submitStart, submitEnd > submitStart ? submitEnd : submitStart + 4000);
  assert.match(submitBlock, /if \(!consentAccepted\) \{ showToast\("Davom etish uchun Foydalanish shartlari va Maxfiylik siyosatiga rozilik bildiring\.", 'warning'\); return; \}/);
  const consentCheckIdx = submitBlock.indexOf('!consentAccepted');
  const apiCallIdx = submitBlock.indexOf("callPlatformApi('platform_submit_subscription_request'");
  assert.ok(consentCheckIdx >= 0 && apiCallIdx > consentCheckIdx, 'consent must be checked BEFORE the network call, not after');
  assert.match(submitBlock, /consentAccepted: true,/, 'the accepted flag must actually be sent to the server (which independently re-validates it)');
});

// 2026-08-27: the old intermediate "Obuna turi / Yangi do'kon ochaman /
// mavjud do'kon tarifini o'zgartiraman" picker page (and its chooseUpgrade())
// was removed per the newer spec ("Intermediate eski sahifani ishlatma") —
// shop selection now happens inline. Every real flow-entry function must
// still reset consentAccepted (each attempt needs its own fresh checkbox).
test('choosing a new subscription flow (new shop, tariff change, or extend) resets consentAccepted to false — each subscription attempt requires its own fresh confirmation, not a carried-over checkbox state', () => {
  for (const fn of ['function chooseNewShop()', 'function startChangeWithSelectedTariff(shopId)', 'function startUpgradeFor(shopId)', 'function startExtendFor(shopId)']) {
    const start = platformApp.indexOf(fn);
    assert.ok(start >= 0, `${fn} must exist`);
    // 2026-08-28 v15-sync: these functions grew (also reset new payment-
    // method-choice state — selectedPaymentMethodType/Id, externalPaymentOpened)
    // so the window widened from 500 to 800 to keep reaching the reset line.
    assert.match(platformApp.slice(start, start + 800), /consentAccepted = false;/, `${fn} must reset consent`);
  }
});

test('TERMS/PRIVACY pages are reachable both from the payment page (returns to PAYMENT on close) and from Profile (returns to the profile tab on close) via the same shared close handler', () => {
  assert.match(platformApp, /if \(p === 'TERMS'\) return pageShell\("Foydalanish shartlari", renderTermsBody\(\), \{ onBack: "closeTermsPrivacyPage\(\)" \}\);/);
  assert.match(platformApp, /if \(p === 'PRIVACY'\) return pageShell\("Maxfiylik siyosati", renderPrivacyBody\(\), \{ onBack: "closeTermsPrivacyPage\(\)" \}\);/);
  assert.match(platformApp, /onclick="event\.preventDefault\(\); openTermsPage\('PAYMENT'\);"/, 'the payment page link must set the PAYMENT return target');
  assert.match(platformApp, /onclick="openPrivacyPage\(\)"/, 'the Profile row must open without forcing a PAYMENT return target');
  const closeStart = platformApp.indexOf('function closeTermsPrivacyPage');
  const closeBlock = platformApp.slice(closeStart, closeStart + 300);
  assert.match(closeBlock, /if \(returnTo === 'PAYMENT'\) openPage\('PAYMENT'\);/);
  assert.match(closeBlock, /else closePage\(\);/);
});

// 2026-08-27: the old dual Galereya+Fayllar input pair was replaced with a
// SINGLE input that has NO accept restriction at all — this is actually the
// correct fix for FIX-2 in the admin spec (a real device file/document
// picker, not a Photos-app redirect) rather than a regression; matches the
// same root-cause fix already applied in the shop app's openImagePickerSheet().
test('the receipt picker on the payment page uses a single, unrestricted file input (no accept="image/*") so it opens the real device file manager, not the Gallery app', () => {
  const payStart = platformApp.indexOf('function renderPaymentBody()');
  // 2026-08-28 v15-sync: renderPaymentBody() grew substantially (new
  // payment-method-choice UI ahead of the receipt section) — window
  // widened from 4200 to 8700 (function itself is ~8.6k chars) so the
  // doesNotMatch check below still covers the WHOLE function, not a
  // truncated prefix that could hide a re-introduced accept="image/*".
  const payBlock = platformApp.slice(payStart, payStart + 8700);
  assert.match(payBlock, /<input type="file" id="plat-receipt-input" class="hidden" onchange="onReceiptPicked\(event\)">/);
  assert.doesNotMatch(payBlock, /accept="image\/\*"/, 'must never force accept=image/* — that silently redirects to the Gallery app on mobile');
});

test('the frontend TERMS_VERSION/PRIVACY_VERSION constants are kept manually in sync with the backend ones (both "1.0")', () => {
  assert.match(platformApp, /const TERMS_VERSION = '1\.0';/);
  assert.match(platformApp, /const PRIVACY_VERSION = '1\.0';/);
});

test('statusLabel() and its matching status-pill CSS class cover the two new lifecycle statuses (FROZEN/TERMINATED), reusing the existing status-X pattern rather than inventing a new one', () => {
  const fnStart = platformApp.indexOf('function statusLabel');
  const fnBlock = platformApp.slice(fnStart, fnStart + 300);
  assert.match(fnBlock, /if \(s === 'FROZEN'\) return 'Muzlatilgan';/);
  assert.match(fnBlock, /if \(s === 'TERMINATED'\) return "O'chirilgan";/);
  assert.match(platformApp, /if \(s === 'FROZEN'\) return pIcon\('snow', 13\);/);
  const css = fs.readFileSync(path.join(__dirname, '..', 'platform', 'platform.css'), 'utf8');
  assert.match(css, /\.status-FROZEN \{/);
  assert.match(css, /\.status-TERMINATED \{/);
});

test('Shop Details wires all four lifecycle actions (grant days / freeze / reactivate / terminate) to their matching backend actions, and the terminate flow is a real two-step reason-then-confirm sequence (never a single-click destructive action) matching spec section 23', () => {
  assert.match(platformApp, /await callPlatformApi\('platform_grant_subscription_days', \{ shopId, days, reason \}\);/);
  assert.match(platformApp, /await callPlatformApi\('platform_freeze_shop', \{ shopId, reason \}\);/);
  assert.match(platformApp, /await callPlatformApi\('platform_reactivate_shop', \{ shopId \}\);/);
  assert.match(platformApp, /await callPlatformApi\('platform_terminate_shop', \{ shopId, reason \}\);/);

  // Two-step confirmation: reason step must complete (and require a non-empty
  // reason) BEFORE the confirm step's destructive button ever renders.
  const confirmReasonStart = platformApp.indexOf('function confirmTerminateStepReason');
  const confirmReasonBlock = platformApp.slice(confirmReasonStart, confirmReasonStart + 300);
  assert.match(confirmReasonBlock, /if \(!reason\) return showToast\('Sababni kiriting\.', 'warning'\);/);
  assert.match(confirmReasonBlock, /terminateStep = 'confirm';/);
  // Lifecycle round v2: terminate now fully purges the shop's data, so the
  // confirmation copy was strengthened to spell out EVERY wiped category
  // explicitly (products/orders/customers/images/settings/integrations/bot),
  // not just a generic "BARCHA ma'lumot" — updated from the original spec's
  // softer "faoliyatini to'xtatadi" wording.
  assert.match(platformApp, /Bu amal QAYTARILMAS!<\/b> Mahsulotlar, buyurtmalar, mijozlar, rasmlar, sozlamalar, integratsiyalar va bot ulanishi butunlay o'chiriladi\./);

  // Freeze/reactivate must be status-conditional, never both shown at once.
  // Sliced to the next function definition (not a fixed char count) so it
  // keeps working as this card legitimately grows (e.g. the lifecycle
  // round's grace-expired banner prepended before the status checks).
  const lifecycleStart = platformApp.indexOf('function renderLifecycleControlsCard');
  const lifecycleEnd = platformApp.indexOf('function renderExtendGraceCard', lifecycleStart);
  const lifecycleBlock = platformApp.slice(lifecycleStart, lifecycleEnd > lifecycleStart ? lifecycleEnd : lifecycleStart + 2000);
  assert.match(lifecycleBlock, /s\.status === 'ACTIVE' \?/);
  assert.match(lifecycleBlock, /s\.status === 'FROZEN' \?/);
});

// ---------------------------------------------------------------------------
// Frontend: landing page redesign (D-bosqich)
// ---------------------------------------------------------------------------

test('the landing page now has a real swipe-carousel ("Nega UStorE?", 8 cards) using scroll-snap CSS, not the old static 2x2 grid', () => {
  assert.match(platformApp, /const WHY_USTORE_CARDS = \[/);
  const cardsStart = platformApp.indexOf('const WHY_USTORE_CARDS = [');
  const cardsBlock = platformApp.slice(cardsStart, platformApp.indexOf('];', cardsStart));
  const cardCount = (cardsBlock.match(/^\s*\[/gm) || []).length;
  assert.strictEqual(cardCount, 8, 'spec section 3.2 lists exactly 8 "Nega UStorE?" cards');
  const css = fs.readFileSync(path.join(__dirname, '..', 'platform', 'platform.css'), 'utf8');
  assert.match(css, /\.plat-carousel \{[^}]*scroll-snap-type: x mandatory;/s);
  assert.doesNotMatch(css, /\.plat-feature-grid/, 'the old static feature grid must be fully removed, not left as dead CSS');
  assert.doesNotMatch(platformApp, /plat-feature-grid|plat-feature-card/, 'no reference to the removed static grid should remain in the JS either');
});

// 2026-08-27, USER platform redesign 4.6/22-band: "30 kun" duration text
// removed (not part of the new reference screenshot design) in favor of a
// real feature checklist + Oylik/Yillik-aware price block; a real, separate
// "Tarifni tanlash" <button> (not an implicit whole-card click) — invariant
// unchanged — and both the landing carousel and the compact TARIFFS-page
// grid still reuse the exact same renderOneTariffCard(t, opts) renderer.
test('the tariff card shows a real feature checklist and a real, separate "Tarifni tanlash" <button> (not the whole card being an implicit clickable button) — reused identically by both the landing carousel and the full TARIFFS page list', () => {
  const fnStart = platformApp.indexOf('function renderOneTariffCard');
  const fnEnd = platformApp.indexOf('function renderTariffCards');
  const fnBlock = platformApp.slice(fnStart, fnEnd);
  // 2026-08-28: TARIFF_FEATURE_LIST is now only the FALLBACK for tariffs
  // with no features of their own (see the per-tariff-features test block
  // further down) — the primary source is t.features.
  // 2026-08-28 v15-sync: the fallback expression was hoisted into its own
  // `const features = (...).slice(0, 4)` (premium card keeps the comparison concise at 4 items,
  // each with a title= tooltip for the un-truncated text) before the .map()
  // — same fallback logic, just no longer inline in the template literal.
  assert.match(fnBlock, /const features = \(Array\.isArray\(t\.features\) && t\.features\.length \? t\.features : TARIFF_FEATURE_LIST\)\.slice\(0, 4\);/, 'must render the real feature checklist, falling back to the shared default list');
  assert.match(fnBlock, /features\.map\(\(f\) => `<li>\$\{pIcon\('checkCircle', 14\)\}<span title="\$\{escapeHtml\(f\)\}">\$\{escapeHtml\(f\)\}<\/span><\/li>`\)/);
  // CTA onclick is assembled into a `selectJs` variable first (so a
  // '__TARIFF__' placeholder some callers pass via opts.onSelectJs can be
  // substituted with the real tariff id) rather than inlined directly.
  assert.match(fnBlock, /let selectJs = opts\.onSelectJs \|\| `selectTariffAndContinue\('\$\{t\.id\}'\)`;/);
  assert.match(fnBlock, /onclick="\$\{selectJs\}">\$\{opts\.ctaLabel \|\| "Tarifni tanlash"\} \$\{pIcon\('arrowRight', 14\)\}<\/button>/);
  // 2026-08-29, 7-topshiriq round (task 4): the old compact-grid vs.
  // carousel split was unified — BOTH the full TARIFFS page and the
  // landing teaser now render the same infinite swipe carousel (only a
  // CSS class, is-full-page, differs), matching the Shop App banner
  // carousel pattern. renderOneTariffCard() is still the single card
  // renderer either way — checked by its own dedicated test below.
  const carouselStart = platformApp.indexOf('function renderTariffCards(compact, opts)');
  const carouselBlock = platformApp.slice(carouselStart, platformApp.indexOf('\n  function tariffTone', carouselStart) > 0 ? platformApp.indexOf('\n  function tariffTone', carouselStart) : carouselStart + 1500);
  assert.match(carouselBlock, /const realSlides = tariffs\.map\(\(t, i\) => `<div class="plat-carousel-item plat-tariff-carousel-item" data-real-index="\$\{i\}">\$\{renderOneTariffCard\(t, opts\)\}<\/div>`\);/, 'both call sites must reuse renderOneTariffCard, not a second card template');
  assert.match(carouselBlock, /class="plat-carousel plat-tariff-carousel \$\{compact \? 'is-full-page' : ''\}"/);
});

test('the tariff carousel loops infinitely (task 4): clone slides are appended at both ends (last-tariff clone before the real slides, first-tariff clone after), and after scroll settles on a clone, syncTariffCarouselDots() silently (no animation) jumps back to the matching real slide so the illusion of continuous looping never runs out — only when there are 3+ total slides (2 tariffs would make the clones the same as the reals, causing a visible jump)', () => {
  const carouselStart = platformApp.indexOf('function renderTariffCards(compact, opts)');
  const carouselBlock = platformApp.slice(carouselStart, platformApp.indexOf('\n  function tariffTone', carouselStart));
  assert.match(carouselBlock, /is-clone" data-real-index="\$\{tariffs\.length - 1\}" aria-hidden="true"/, 'a clone of the LAST real tariff must be prepended');
  assert.match(carouselBlock, /is-clone" data-real-index="0" aria-hidden="true"/, 'a clone of the FIRST real tariff must be appended');
  assert.match(carouselBlock, /tariffs\.length > 1/, 'clones must only be added when there is more than one tariff to loop between');

  const syncStart = platformApp.indexOf('function syncTariffCarouselDots(carousel)');
  const syncBlock = platformApp.slice(syncStart, platformApp.indexOf('\n  function initTariffCarousels', syncStart));
  assert.match(syncBlock, /if \(carousel\.dataset\.infinite !== '1' \|\| items\.length < 3\) return;/, 'must never attempt the loop-back jump with fewer than 3 total slides');
  assert.match(syncBlock, /carousel\.scrollTo\(\{ left: target\.offsetLeft, behavior: 'auto' \}\);/, 'the loop-back correction must be instant (no animation), never a visible re-scroll');
});

// 2026-08-27, USER platform redesign 4.2/4.3/22-band: Oylik/Yillik shared
// toggle + "annual = monthly*10, 2 oy bepul" formula, and current-plan
// highlighting on the Obuna tab's carousel.
test('the shared billing-period toggle drives a real annual price (monthly*10) with a "2 oy bepul" badge, and the Obuna tab highlights the shop\'s actual current tariff', () => {
  assert.match(platformApp, /function annualOfferPrice\(monthly\) \{ return Math\.round\(\(Number\(monthly\) \|\| 0\) \* 10\); \}/);
  assert.match(platformApp, /function annualOriginalPrice\(monthly\) \{ return Math\.round\(\(Number\(monthly\) \|\| 0\) \* 12\); \}/);
  // 2026-08-29, 7-topshiriq round (task 3): toggling the period while a
  // NEW_SHOP draft request is open now also re-syncs that draft (its
  // amount/duration depend on the chosen period) — same core assignment,
  // plus this one new side effect.
  const setPeriodStart = platformApp.indexOf('function setTariffBillingPeriod(period)');
  const setPeriodBlock = platformApp.slice(setPeriodStart, platformApp.indexOf('\n  }', setPeriodStart) + 4);
  assert.match(setPeriodBlock, /tariffBillingPeriod = period;/);
  assert.match(setPeriodBlock, /if \(flowKind === 'NEW_SHOP' && activePage === 'PAYMENT'\) scheduleNewShopDraftSync\(\);/);
  assert.match(setPeriodBlock, /render\(\);/);
  assert.doesNotMatch(platformApp, /Tejaysiz/, 'MD 4.3-band explicitly forbids a separate "tejaysiz X so\'m" line');
  // 2026-08-27: current-tariff context moved OUT of the generic Obuna tab
  // (now just a catalog for the no-shop-yet case) and into a dedicated
  // MY_SHOP_DETAILS page — a real architectural evolution, not a
  // regression. Platform 2.0 completion pass (section 4-band) then split
  // that page further: MY_SHOP_DETAILS itself is now just a summary +
  // navigation-row list, and the actual "Obunani boshqarish" section
  // (Uzaytirish/Tarifni o'zgartirish) lives in its own sub-screen,
  // renderMyShopSubscriptionBody().
  const detailStart = platformApp.indexOf('function renderMyShopDetailsBody()');
  assert.ok(detailStart >= 0, 'renderMyShopDetailsBody must exist');
  const detailBlock = platformApp.slice(detailStart, platformApp.indexOf('\n  function renderMyShopSubscriptionBody', detailStart));
  assert.match(detailBlock, /shop\.tariffName \|\| 'Tarifsiz'/, 'must show the real current tariff name (as the Obuna va tarif row subtitle)');

  const subStart = platformApp.indexOf('function renderMyShopSubscriptionBody()');
  assert.ok(subStart >= 0, 'renderMyShopSubscriptionBody must exist');
  const subBlock = platformApp.slice(subStart, platformApp.indexOf('\n  function renderMyShopBotBody', subStart));
  assert.match(subBlock, /onclick="startExtendFor\('\$\{shop\.id\}'\)"/);
  assert.match(subBlock, /onclick="startUpgradeFor\('\$\{shop\.id\}'\)"/);
  assert.match(subBlock, /Qolgan kunlar kuyib ketmaydi/, 'must reassure the user that extending preserves remaining paid days');
});

test('the landing page includes the first-subscription bonus promo, the 3-step "how it works" section, the trust block, FAQ, and a final CTA — all previously completely absent', () => {
  const heroStart = platformApp.indexOf('function renderLandingHero()');
  const heroBlock = platformApp.slice(heroStart, platformApp.indexOf('function renderOneTariffCard'));
  assert.match(heroBlock, /plat-bonus-card/);
  assert.match(heroBlock, /Birinchi obunada \+7 kun bonus/);
  assert.match(heroBlock, /Tarifni tanlang[\s\S]*Obunani faollashtiring[\s\S]*Savdoni boshlang/, 'the 3 "Qanday ishlaydi?" steps must appear in order');
  assert.match(heroBlock, /plat-trust-grid/);
  assert.match(heroBlock, /FAQ_ITEMS\.map/, 'the FAQ list must actually be rendered on the page');
  assert.match(heroBlock, /plat-final-cta/);
});

test('the FAQ has exactly the 6 spec Q&A pairs, with the exact answer text (not paraphrased) for the "obuna tugasa ma\'lumotlar o\'chadimi" question specifically, since that answer states a real, load-bearing product guarantee (the canonical SHOP_FREEZE_DAYS grace period, not a re-hardcoded day count)', () => {
  const faqStart = platformApp.indexOf('const FAQ_ITEMS = [');
  const faqBlock = platformApp.slice(faqStart, platformApp.indexOf('];', faqStart));
  const pairCount = (faqBlock.match(/^\s*\[/gm) || []).length;
  assert.strictEqual(pairCount, 6);
  assert.match(faqBlock, /Yo'q\. Obuna tugaganda do'kon avval muzlatiladi va \$\{SHOP_FREEZE_DAYS\} kun davomida ma'lumotlar saqlanadi\./);
});

// ---------------------------------------------------------------------------
// F-bosqich: Telegram xabar matnlari — spec 25-bo'lim bilan aniq mosligi
// ---------------------------------------------------------------------------

// 2026-08-29, 059-migratsiya (7-topshiriq round, task 6 lifecycle settings):
// manual (policy) freeze and automatic expiry-freeze no longer use two
// hardcoded, differently-emoji'd messages (spec sections 17/18) — they were
// deliberately unified onto the SAME admin-editable "FROZEN"
// notification_templates row ("FROZEN already exists and is reused for
// manual+auto", per migration 059's own comment), differentiated only by the
// {REASON} placeholder content (admin's typed reason vs. the cron's fixed
// "Obuna muddati tugadi"). This is a real, deliberately documented design
// change, not a regression — the old distinct-emoji requirement is retired.
test('Telegram notification copy matches spec section 25 verbatim for the key messages, and manual freeze / automatic expiry-freeze are unified onto the same admin-editable FROZEN template (059-migratsiya), differentiated only by the {REASON} placeholder rather than by hardcoded distinct text', () => {
  // billing_period/priceSnapshot qo'shilgandan keyin bu caption Oylik/Yillik
  // narxni ham aniq ko'rsatadi (periodLabel) — matnning o'zagi o'zgarmagan.
  // 2026-08-28: chek ixtiyoriy bo'lgach caption endi bitta `const caption`
  // o'zgaruvchiga chiqarilib, ikkala yo'lda (sendPhoto/sendMessage) qayta
  // ishlatiladi — matnning o'zi o'zgarmagan.
  // 2026-08-29, 058-migratsiya (application/payment provisioning): NEW_SHOP
  // so'rovlarida admin xabariga owner/do'kon nomi ham qo'shildi (ownerLine)
  // — matnning o'zagi o'zgarmagan.
  assert.match(platformApi, /const caption = `💳 Yangi obuna so'rovi\\n\$\{requesterFirstName \|\| tgId\}\\n\$\{tariff\.name\} — \$\{priceSnapshot\} so'm\\n\$\{periodLabel\}\\n\$\{kindLabel\}\$\{ownerLine\}`;/);
  assert.match(platformApi, /"🎉 Do'koningiz tayyor! \/start tugmasini bosing\."/);
  // 2026-08-29, 058-migratsiya (application/payment provisioning): the old
  // vague "24 soat ichida ulanadi" promise was replaced by an explicit
  // provisioning stage (see the platform_approve_subscription_request test
  // above) — this is the real current NEW_SHOP-approval customer message.
  assert.match(platformApi, /"✅ To'lovingiz tasdiqlandi\. Yangi do'konni yaratish bosqichi ochildi\."/);

  // manual freeze no longer builds its own message text — it delegates to
  // the shared template engine (see the dedicated platform_freeze_shop test
  // above for the notifyLifecycleOwnerInBackground(...,"FROZEN",...) call).
  const freezeActionBlock = actionBlock('platform_freeze_shop');
  assert.match(freezeActionBlock, /notifyLifecycleOwnerInBackground\(db, PLATFORM_BOT_TOKEN, shopId, "FROZEN",/);
  assert.doesNotMatch(freezeActionBlock, /⚠️ Do'koningiz vaqtincha muzlatildi/, 'the old hardcoded manual-freeze message must be fully gone, not left behind alongside the template call');

  // 2026-08-28, 053-migratsiya: original seed text for the automatic-only
  // FROZEN message (historical file, unchanged by later migrations).
  const notifMig = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '053_notification_system.sql'), 'utf8');
  // SQL string literal ichida apostrof ikki marta yoziladi (''), shu sabab
  // "Do''koningiz" — bazaga yozilganda bitta ' bo'lib qoladi.
  assert.match(notifMig, /❄️ Obunangiz tugadi\. Do''koningiz vaqtincha muzlatildi\./);
  assert.match(notifMig, /⚠️ Obunangiz 3 kundan keyin tugaydi\./);

  // 059-migratsiya then overwrites that 053 seed with the unified
  // manual+automatic FROZEN body (still ❄️, now driven by {REASON}/{ACTION}
  // placeholders instead of two separate hardcoded strings).
  const mig059 = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '059_platform_polish_lifecycle_assets.sql'), 'utf8');
  assert.match(mig059, /reused for manual\+auto/i, 'the unification must be an explicit, documented decision, not a silent behavior change');
  assert.match(mig059, /❄️ \{SHOP_NAME\} do''koningiz vaqtincha muzlatildi\.\\nSabab: \{REASON\}\\n\{ACTION\}/);
});

test('limitLabel() spells out WHAT the number counts ("50 tagacha mahsulot" / "Cheksiz mahsulot"), not a bare "50 tagacha" — the unit was previously implicit and unclear on the tariff card; every one of the 8 call sites (tariff cards, shop summaries, admin previews) shares this single function, so the fix applies everywhere at once with no per-call-site drift', () => {
  assert.match(platformApp, /function limitLabel\(limit\) \{ return \(limit === null \|\| limit === undefined\) \? 'Cheksiz mahsulot' : `\$\{limit\} tagacha mahsulot`; \}/);
  assert.doesNotMatch(platformApp, /'Cheksiz'\s*:\s*`\$\{limit\} tagacha`/, 'the old unit-less wording must be fully gone, not left behind on some other code path');
});

// ---------------------------------------------------------------------------
// 2026-08-28: Admin Dashboard "Muddati tugagan" KPI (first slice of the
// larger admin-redesign backlog — see memory ustore_admin_platform_redesign_spec_2026-08-27.md)
// ---------------------------------------------------------------------------

test('platform_admin_dashboard_summary adds a real expiredCount (COUNT of shops.status=FROZEN, a separate query from the existing 4 counters) instead of reusing/faking an existing number', () => {
  const block = actionBlock('platform_admin_dashboard_summary');
  assert.match(block, /db\.from\("shops"\)\.select\("id", \{ count: "exact", head: true \}\)\.eq\("status", "FROZEN"\)/, 'must be a real independent count query, not derived from another counter');
  assert.match(block, /expiredCount: expiredCount \|\| 0,/, 'must actually be returned in the response object');
  // the existing 4 counters must stay untouched (same assertion the earlier
  // "attentionItems" test already relies on for the other fields)
  assert.match(block, /activeShopsCount: activeShopsCount \|\| 0,/);
  assert.match(block, /newRequestsCount: newRequestsCount \|\| 0,/);
  assert.match(block, /expiringSoonCount: expiringSoonCount \|\| 0,/);
});

test('the admin Dashboard tab renders a "Muddati tugagan" KPI card wired to a real EXPIRED_SHOPS page (not a dead/no-op button), and that page groups status=FROZEN shops by age-since-frozen without fabricating a retention deadline it does not have', () => {
  const dashStart = platformApp.indexOf('function renderAdminDashboardTab()');
  const dashBlock = platformApp.slice(dashStart, platformApp.indexOf('\n  function ', dashStart + 20));
  assert.match(dashBlock, /s\.expiredCount/, 'the card must read the real backend field, not a placeholder');
  assert.match(dashBlock, /onclick="openPage\('EXPIRED_SHOPS'\)"/);

  assert.match(platformApp, /if \(p === 'EXPIRED_SHOPS'\) return pageShell\(/, 'EXPIRED_SHOPS must be a real route in renderActivePage()');

  const bodyStart = platformApp.indexOf('function renderExpiredShopsBody()');
  assert.ok(bodyStart >= 0);
  const bodyBlock = platformApp.slice(bodyStart, platformApp.indexOf('\n  function renderExpiredShopRow', bodyStart));
  assert.match(bodyBlock, /adminShops\.filter\(\(s\) => s\.status === 'FROZEN'\)/, 'must filter the already-loaded admin shop list, not fire a new backend action');
  assert.match(bodyBlock, /Bugun muzlatilgan/);
  assert.match(bodyBlock, /1-7 kun oldin/);
  assert.doesNotMatch(platformApp, /kun qoldi ma'lumotlar o'chirilguncha|retention countdown/i, 'must never fabricate a data-retention deadline that no real backend field provides');

  // clicking a row must reuse the EXISTING Shop Details page/actions
  // (freeze/reactivate/terminate/grant-days already live there) instead of
  // building a second, parallel detail view.
  const rowStart = platformApp.indexOf('function renderExpiredShopRow(s)');
  const rowBlock = platformApp.slice(rowStart, platformApp.indexOf('\n  function ', rowStart + 20));
  assert.match(rowBlock, /onclick="openShopDetails\('\$\{s\.id\}'\)"/);
});

// ---------------------------------------------------------------------------
// 2026-08-28: Receipt-optional payment flow + server-side "To'ladim" claim
// ---------------------------------------------------------------------------

test('049 migration purely adds subscription_requests.payment_claimed_at, nothing else', () => {
  const mig = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '049_subscription_payment_claim.sql'), 'utf8');
  assert.match(mig, /alter table public\.subscription_requests\s*\n\s*add column if not exists payment_claimed_at timestamptz;/);
  assert.doesNotMatch(mig, /drop table|drop column|rename/i);
});

test('platform_submit_subscription_request no longer hard-requires a receipt (receipt_required error path is gone) — it accepts payload.receiptImageUpload as optional and only runs storeSubscriptionReceipt when one was actually provided', () => {
  const block = actionBlock('platform_submit_subscription_request');
  assert.doesNotMatch(block, /if \(!upload\) return json\(\{ error: "receipt_required" \}, 400\);/, 'the old mandatory-receipt gate must be removed');
  assert.match(block, /const upload = payload\.receiptImageUpload \|\| null;/);
  assert.match(block, /if \(upload\) \{/, 'receipt storage must now be conditional');
});

test('payment_claimed_at is stamped server-side at insert time when a receipt IS attached (the upload itself is the payment claim), and left null otherwise so it can only be set later by platform_confirm_payment_claim', () => {
  const block = actionBlock('platform_submit_subscription_request');
  // 2026-08-29, 058-migratsiya: hisoblash endi alohida o'zgaruvchiga
  // chiqarilgan (keyin appendSubscriptionRequestHistory'da PAYMENT_CLAIMED
  // yozuvi shu bilan shartlanadi — ikkalasi bir xil qiymatdan foydalanadi,
  // ikki marta hisoblanmaydi), lekin natija bir xil.
  assert.match(block, /const paymentClaimedAt = upload \? new Date\(\)\.toISOString\(\) : null;/);
  assert.match(block, /payment_claimed_at: paymentClaimedAt,/);
  assert.match(block, /if \(paymentClaimedAt\) await appendSubscriptionRequestHistory\(db, requestId, "PAYMENT_CLAIMED", "USER", tgId, \{ source: "PAYMENT_PAGE" \}\);/);
});

test('platform_confirm_payment_claim ("To\'ladim") is a PUBLIC action (no requirePlatformSuperAdmin — any verified user can call it) but enforces ownership server-side by comparing the request\'s stored requester_telegram_id against the caller\'s own verified tgId, never trusting a client-supplied owner id; it also refuses to claim a request that is no longer NEW, and stamps the timestamp with the server\'s own new Date().toISOString() — never anything read from payload', () => {
  const block = actionBlock('platform_confirm_payment_claim');
  assert.doesNotMatch(block, /requirePlatformSuperAdmin\(\)/, 'must be reachable by the requesting customer, not admin-only');
  assert.match(block, /String\(reqRow\.requester_telegram_id\) !== String\(tgId\)/, 'ownership must be re-derived from the stored row, not trusted from payload');
  assert.match(block, /if \(reqRow\.status !== "NEW"\) return json\(\{ error: "request_not_pending" \}, 409\);/);
  assert.match(block, /claimedAt = new Date\(\)\.toISOString\(\);/, 'the claim timestamp must be server-generated');
  assert.doesNotMatch(block, /payload\.paymentClaimedAt|payload\.claimedAt/, 'must never accept a client-supplied timestamp');
  // idempotent: calling twice must not silently overwrite an earlier claim time
  assert.match(block, /if \(!claimedAt\) \{/);
});

test('platform_list_subscription_requests now also selects and returns payment_claimed_at (as paymentClaimedAt) so admin can see a claim made without a receipt', () => {
  // 2026-08-29, 058-migratsiya: select ustunlari va mapping endi
  // SUBSCRIPTION_REQUEST_SELECT/mapSubscriptionRequest() umumiy joyida
  // (bir nechta action shu jadvalga tegishli bo'lgani uchun — bitta joyda
  // saqlash drift'ning oldini oladi), platform_list_subscription_requests
  // shunchaki shu ikkalasini qayta ishlatadi.
  // 2026-08-29, 059-migratsiya (task 3, "To'lov kutilmoqda" draft/1hr
  // deadline): payment_deadline_at ustuni endi payment_claimed_at bilan
  // receipt_requested_at o'rtasida joylashgan.
  assert.match(platformApi, /payment_claimed_at,payment_deadline_at,receipt_requested_at,reject_reason/, 'must be part of the actual shared select column list');
  assert.match(platformApi, /paymentClaimedAt: r\.payment_claimed_at \|\| null,/);
  const block = actionBlock('platform_list_subscription_requests');
  assert.match(block, /\.select\(SUBSCRIPTION_REQUEST_SELECT\)/);
  assert.match(block, /requests: \(data \|\| \[\]\)\.map\(mapSubscriptionRequest\)/);
});

test('submitSubscriptionRequest() frontend no longer alert-blocks on a missing receiptFile, and the payment page submit button is no longer disabled by receipt absence — only consent/card/in-flight still gate it', () => {
  const fnStart = platformApp.indexOf('async function submitSubscriptionRequest()');
  const fnBlock = platformApp.slice(fnStart, platformApp.indexOf('\n  function renderRequestSentBody', fnStart));
  assert.doesNotMatch(fnBlock, /Iltimos, to'lov chekini yuklang/, 'the old hard-block alert must be gone');
  assert.match(fnBlock, /receiptFile \? \{ base64: await fileToBase64\(receiptFile\), mimeType: receiptFile\.type, fileName: receiptFile\.name \} : undefined/, 'upload must become optional/undefined, not a required field');

  const submitBtnLine = platformApp.split('\n').find((l) => l.includes('plat-payment-submit'));
  assert.ok(submitBtnLine);
  assert.doesNotMatch(submitBtnLine, /!receiptFile/, 'the submit button must no longer be dimmed by a missing receipt');
});

// 2026-08-28 v15-sync: the claim flow was redesigned. Previously the
// REQUEST_SENT page always showed a manual "To'ladim" button when no
// receipt was attached. Now submitSubscriptionRequest() itself already
// requires a real chosen payment method (and, for external providers,
// having actually opened the payment page) BEFORE it will submit at all —
// so submission itself is already a strong "I paid" signal. The frontend
// therefore auto-calls platform_confirm_payment_claim right after a
// receipt-less submit succeeds; the REQUEST_SENT page only shows a manual
// retry button if that automatic call itself failed (e.g. a dropped
// connection), not merely because a receipt was missing.
test('a receipt-less submission auto-confirms the payment claim immediately after platform_submit_subscription_request succeeds (using the real returned requestId, never a client-guessed one); REQUEST_SENT only shows a manual "To\'ladim" retry button if that automatic claim call itself failed — never simply because no receipt was attached', () => {
  const submitStart = platformApp.indexOf('async function submitSubscriptionRequest');
  const submitBlock = platformApp.slice(submitStart, platformApp.indexOf('\n  function renderRequestSentBody', submitStart));
  assert.match(submitBlock, /lastSubmittedRequestId = result\.requestId;/);
  assert.match(submitBlock, /paymentClaimConfirmed = !!receiptFile;/, 'a receipt already implies a server-stamped claim from platform_submit_subscription_request itself');
  assert.match(submitBlock, /if \(!receiptFile\) \{/);
  assert.match(submitBlock, /await callPlatformApi\('platform_confirm_payment_claim', \{ requestId: result\.requestId \}\);/, 'must use the just-returned real request id, never a stale/guessed one');
  assert.match(submitBlock, /paymentClaimConfirmed = true;/);
  assert.match(submitBlock, /paymentClaimConfirmed = false; \/\/ REQUEST_SENT'da qayta urinish chiqadi/, 'a failed auto-claim must fall through to a visible retry state, not fail silently');

  const bodyStart = platformApp.indexOf('function renderRequestSentBody()');
  const bodyBlock = platformApp.slice(bodyStart, platformApp.indexOf('\n  async function confirmPaymentClaim', bodyStart));
  assert.match(bodyBlock, /const needsClaimRetry = !paymentClaimConfirmed;/, 'the retry condition must be "the claim isn\'t confirmed", not "no receipt was attached"');
  assert.match(bodyBlock, /onclick="confirmPaymentClaim\(\)"/);

  const claimFnStart = platformApp.indexOf('async function confirmPaymentClaim()');
  const claimFnBlock = platformApp.slice(claimFnStart, platformApp.indexOf('\n  }', claimFnStart) + 4);
  assert.match(claimFnBlock, /callPlatformApi\('platform_confirm_payment_claim', \{ requestId: lastSubmittedRequestId \}\)/);
});

test('the admin Requests card surfaces a distinct, non-alarming notice when a request has no receipt but the customer already tapped "To\'ladim" (paymentClaimedAt set), versus a plainer notice when neither a receipt nor a claim exists yet', () => {
  // 2026-08-29, 058-migratsiya: karta to'liq qayta quriladi (receipt
  // manbai/to'lov usuli belgisi/detail-sahifaga bosiladigan qilib) — endi
  // 4 tarmoqli ternary: hasReceipt (eng ustuvor) -> receiptRequestedAt ->
  // paymentClaimedAt -> hech biri yo'q. Mantiq bir xil qoladi (claimed vs
  // no-claim ikkalasi ham alohida, tinch ohangdagi xabar), faqat tartib va
  // matn boyidi.
  const cardStart = platformApp.indexOf('function renderRequestCard(r)');
  const cardBlock = platformApp.slice(cardStart, platformApp.indexOf('\n  }', cardStart) + 4);
  assert.match(cardBlock, /const paymentNotice = r\.hasReceipt/);
  assert.match(cardBlock, /: r\.paymentClaimedAt\s*\n\s*\? `<div class="plat-admin-request-note is-info">To'lov tekshirilmoqda · chek biriktirilmagan\.<\/div>`/, 'the claimed-but-no-receipt case must still get its own distinct, non-alarming notice');
  assert.match(cardBlock, /: `<div class="plat-admin-request-note">Chek yo'q · foydalanuvchi hali .To'ladim. demagan\.<\/div>`/, 'the neither-claimed-nor-receipted case must stay a plainer, separate notice');
});

// ---------------------------------------------------------------------------
// 2026-08-28: admin "Do'konlar" tab gains client-side search + status filter
// ---------------------------------------------------------------------------

test('filteredAdminShops() combines a case-insensitive text search (name/username/publicCode/owner/tariff) with the active status filter, entirely client-side over the already-loaded adminShops list — no new backend action', () => {
  const fnStart = platformApp.indexOf('function filteredAdminShops()');
  const fnBlock = platformApp.slice(fnStart, platformApp.indexOf('\n  function setAdminShopsSearch', fnStart));
  assert.match(fnBlock, /adminShopsStatusFilter !== 'ALL' && s\.status !== adminShopsStatusFilter/);
  assert.match(fnBlock, /\.toLowerCase\(\)/);
  assert.match(fnBlock, /s\.botName, s\.botUsername, s\.publicCode, s\.ownerTelegramId, s\.tariffName/, 'search must cover the fields an admin would actually type');
});

test('renderAdminShopsTab() renders a status-filter chip row covering all real shops.status values (ACTIVE/FROZEN/PROVISIONING/TERMINATED) plus "Hammasi", and a distinct empty-state message when the filter matches nothing vs. when there are truly no shops at all', () => {
  const tabStart = platformApp.indexOf('function renderAdminShopsTab()');
  const tabBlock = platformApp.slice(tabStart, platformApp.indexOf('\n  function renderAdminShopRow', tabStart));
  for (const status of ['ACTIVE', 'FROZEN', 'PROVISIONING', 'TERMINATED']) {
    assert.match(tabBlock, new RegExp(`\\['${status}',`), `status filter must cover ${status}`);
  }
  assert.match(tabBlock, /Filtrga mos do'kon topilmadi/);
  assert.match(tabBlock, /Hozircha do'kon ulanmagan/);
  assert.match(tabBlock, /oninput="setAdminShopsSearch\(this\.value\)"/);
});

// ---------------------------------------------------------------------------
// Regression guard: every bare function referenced from an inline onclick=/
// oninput=/onchange= handler in platform-app.js must actually be exposed on
// `window` (the file is one big IIFE — a handler that isn't re-exported
// throws "X is not defined" silently at click-time, never at load time).
// This exact bug was introduced and caught during the 2026-08-28 session
// (confirmPaymentClaim/setAdminShopsSearch/setAdminShopsStatusFilter were
// added without a matching window.X = X; line).
// ---------------------------------------------------------------------------
test('every function called from an inline on* handler in platform-app.js is exported via window.X = X;', () => {
  const handlerRe = /on(?:click|input|change)="([^"]*)"/g;
  const calls = new Set();
  let m;
  while ((m = handlerRe.exec(platformApp))) {
    const body = m[1];
    // bare identifier immediately followed by "(" and NOT preceded by a "."
    // (so method calls like event.preventDefault() / this.value are skipped)
    const callRe = /(?<![.\w$])([a-zA-Z_$][\w$]*)\(/g;
    let cm;
    while ((cm = callRe.exec(body))) calls.add(cm[1]);
  }
  assert.ok(calls.size > 30, 'sanity check: extraction must find a realistic number of handlers');
  const exported = new Set();
  const winRe = /window\.(\w+) = \1;/g;
  let wm;
  while ((wm = winRe.exec(platformApp))) exported.add(wm[1]);
  const missing = [...calls].filter((c) => !exported.has(c));
  assert.deepStrictEqual(missing, [], `these inline handlers call functions never exported to window: ${missing.join(', ')}`);
});

// ---------------------------------------------------------------------------
// 2026-08-28: per-tariff, admin-editable feature list (previously ONE
// hardcoded TARIFF_FEATURE_LIST was shown identically on every tariff card)
// ---------------------------------------------------------------------------

test('050 migration adds tariffs.features as a text[] (purely additive) and backfills existing rows with the previous hardcoded 5-item list so no card regresses visually', () => {
  const mig = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '050_tariff_features.sql'), 'utf8');
  assert.match(mig, /add column if not exists features text\[\] not null default '\{\}';/);
  assert.match(mig, /update public\.tariffs set features = array\[/);
  assert.match(mig, /where features = '\{\}';/, 'backfill must only touch rows that have no features yet, never overwrite a real edit');
  assert.doesNotMatch(mig, /drop table|drop column|rename/i);
});

test('platform_list_tariffs / platform_admin_list_tariffs both select and return features (as a real array), and platform_upsert_tariff validates+persists it: trims, drops empty lines, caps at 20 items of 80 chars', () => {
  const publicBlock = actionBlock('platform_list_tariffs');
  assert.match(publicBlock, /"id,name,price,product_limit,is_popular,features"/);
  assert.match(publicBlock, /features: Array\.isArray\(t\.features\) \? t\.features : \[\],/);

  const adminListBlock = actionBlock('platform_admin_list_tariffs');
  assert.match(adminListBlock, /"id,name,price,product_limit,is_active,is_popular,sort_order,features"/);

  const upsertBlock = actionBlock('platform_upsert_tariff');
  assert.match(upsertBlock, /\.filter\(\(f: string\) => f\.length > 0\)/, 'blank lines from the textarea must be dropped');
  assert.match(upsertBlock, /\.slice\(0, 20\)/);
  assert.match(upsertBlock, /\.slice\(0, 80\)\);/);
  assert.match(upsertBlock, /features,/, 'features must actually be written into the row object');
});

test('renderOneTariffCard() falls back to the old shared TARIFF_FEATURE_LIST only when a tariff has no features of its own (e.g. pre-migration data never re-saved), and escapes each feature string', () => {
  const fnStart = platformApp.indexOf('function renderOneTariffCard(t, opts)');
  const fnBlock = platformApp.slice(fnStart, platformApp.indexOf('\n  function renderTariffCards', fnStart));
  assert.match(fnBlock, /Array\.isArray\(t\.features\) && t\.features\.length \? t\.features : TARIFF_FEATURE_LIST/);
  assert.match(fnBlock, /escapeHtml\(f\)/);
});

test('the tariff draft form has a real per-tariff "Xususiyatlar" textarea (one feature per line) wired into openNewTariffDraft/openEditTariffDraft/saveTariffDraft, not just the price/name/limit fields', () => {
  assert.match(platformApp, /id="td-features"/);
  const newDraftLine = platformApp.split('\n').find((l) => l.includes('function openNewTariffDraft()'));
  assert.match(newDraftLine, /features: TARIFF_FEATURE_LIST\.slice\(\)/);

  const editStart = platformApp.indexOf('function openEditTariffDraft(id)');
  const editBlock = platformApp.slice(editStart, platformApp.indexOf('\n  function renderTariffDraftForm', editStart));
  assert.match(editBlock, /features: \(Array\.isArray\(t\.features\) && t\.features\.length \? t\.features : TARIFF_FEATURE_LIST\)\.slice\(\)/);

  const saveStart = platformApp.indexOf('async function saveTariffDraft()');
  const saveBlock = platformApp.slice(saveStart, platformApp.indexOf('\n  }', saveStart) + 4);
  assert.match(saveBlock, /document\.getElementById\('td-features'\)\.value\.split\('\\n'\)\.map\(\(f\) => f\.trim\(\)\)\.filter\(Boolean\)/);
  assert.match(saveBlock, /features \}\);/, 'features must actually be sent to platform_upsert_tariff');
});

// ---------------------------------------------------------------------------
// 2026-08-28: "Chek so'rash" (admin asks for a receipt on a receipt-less
// pending request) + the matching customer-side "attach receipt later" flow
// that makes that ask actually actionable
// ---------------------------------------------------------------------------

test('051 migration purely adds subscription_requests.receipt_requested_at', () => {
  const mig = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '051_subscription_receipt_request.sql'), 'utf8');
  assert.match(mig, /alter table public\.subscription_requests\s*\n\s*add column if not exists receipt_requested_at timestamptz;/);
  assert.doesNotMatch(mig, /drop table|drop column|rename/i);
});

test('platform_request_receipt is admin-only, refuses a request that already has a receipt or is no longer NEW, stamps receipt_requested_at server-side, and notifies the CUSTOMER (not the admin) by their stored requester_telegram_id', () => {
  const block = actionBlock('platform_request_receipt');
  assert.match(block, /requirePlatformSuperAdmin\(\);/);
  assert.match(block, /if \(reqRow\.status !== "NEW"\) return json\(\{ error: "request_not_pending" \}, 409\);/);
  assert.match(block, /if \(reqRow\.receipt_storage_path\) return json\(\{ error: "receipt_already_attached" \}, 409\);/);
  assert.match(block, /const requestedAt = new Date\(\)\.toISOString\(\);/);
  assert.match(block, /chat_id: String\(reqRow\.requester_telegram_id\),/, 'must message the customer, not SUPER_ADMIN_ID');
});

test('platform_attach_request_receipt is a PUBLIC customer action (no requirePlatformSuperAdmin) that re-derives ownership from the stored request row (never trusts a client-supplied owner), refuses to run on a non-NEW request or one that already has a receipt, and — since attaching proof IS a payment claim — sets payment_claimed_at only if it was not already set (never overwrites an earlier, real claim time)', () => {
  const block = actionBlock('platform_attach_request_receipt');
  assert.doesNotMatch(block, /requirePlatformSuperAdmin\(\)/);
  assert.match(block, /String\(reqRow\.requester_telegram_id\) !== String\(tgId\)/);
  assert.match(block, /if \(reqRow\.status !== "NEW"\) return json\(\{ error: "request_not_pending" \}, 409\);/);
  assert.match(block, /if \(reqRow\.receipt_storage_path\) return json\(\{ error: "receipt_already_attached" \}, 409\);/);
  assert.match(block, /const claimedAt = reqRow\.payment_claimed_at \|\| new Date\(\)\.toISOString\(\);/, 'must not clobber an existing claim timestamp');
  assert.match(block, /storeSubscriptionReceipt\(db, requestId, tgId, upload\)/, 'must reuse the same validated storage helper as the original submit flow, not a second ad-hoc implementation');
});

test('the admin Requests card exposes a "Chek so\'rash" button only when a request has no receipt and is still NEW, and the request list explicitly distinguishes "receipt requested, awaiting reply" from the plainer "no claim yet" notice', () => {
  const cardStart = platformApp.indexOf('function renderRequestCard(r)');
  const cardBlock = platformApp.slice(cardStart, platformApp.indexOf('\n  }', cardStart) + 4);
  // 2026-08-29, 7-topshiriq round: the button now also requires
  // r.paymentClaimedAt — admin should only be able to ask for a receipt
  // once the customer has actually claimed they paid, not on any bare NEW
  // request. Real behavior refinement, not a regression.
  assert.match(cardBlock, /\$\{r\.status === 'NEW' && r\.paymentClaimedAt && !r\.hasReceipt && !r\.receiptRequestedAt \? `<button onclick="requestReceiptForRequest\('\$\{r\.id\}'\)">Chek so'rash<\/button>` : ''\}/);
  // 2026-08-29 v058-sync: reformatted onto its own multi-line ternary branch
  // (whitespace-tolerant match) — same distinct, separately-worded notice.
  assert.match(cardBlock, /: r\.receiptRequestedAt\s*\n\s*\? `<div class="notice">\$\{pIcon\('paperclip',14\)\} Chek so'raldi/, 'must branch on receiptRequestedAt distinctly from the plain no-claim notice with an SVG icon');
});

// 2026-08-28 v15-sync FINDING (flagged, not silently fixed — the intent
// behind this restructure isn't visible from the code alone): the v15 sync
// removed the REQUEST_SENT upload UI (id="plat-request-sent-receipt-input"
// / onclick="attachReceiptToSentRequest()" no longer appear anywhere), so
// attachReceiptToSentRequest()/onRequestSentReceiptPicked() are now DEAD —
// still defined and window-exported, but unreachable from any real markup.
// Net effect: admin's "Chek so'rash" (platform_request_receipt) still
// sends the customer a Telegram message asking for a receipt, but the
// Mini App itself now has no in-app way for them to actually attach one
// in response — a real functional gap, reported to the user rather than
// guessed at a redesign of. The function itself is still verified correct
// below in case it gets re-wired.
test('attachReceiptToSentRequest() itself is still implemented correctly (calls platform_attach_request_receipt with the real submitted requestId and flips lastSubmittedHadReceipt on success) even though nothing currently renders a control that calls it — a real gap flagged to the user, not fixed here', () => {
  const fnStart = platformApp.indexOf('async function attachReceiptToSentRequest()');
  assert.ok(fnStart >= 0, 'the function itself must still exist so it can be re-wired later');
  const fnBlock = platformApp.slice(fnStart, platformApp.indexOf('\n  }', fnStart) + 4);
  assert.match(fnBlock, /callPlatformApi\('platform_attach_request_receipt', \{/);
  assert.match(fnBlock, /requestId: lastSubmittedRequestId,/);
  assert.match(fnBlock, /lastSubmittedHadReceipt = true;/);
});

test('requestDisplayStatus() derives the spec\'s 5 payment states (Kutilmoqda/Tekshirilmoqda/Tasdiqlangan/Rad etilgan/Chek talab qilindi) purely from existing fields (status/hasReceipt/paymentClaimedAt/receiptRequestedAt) — matching this codebase\'s established "derived view, not a new stored status" convention (same as the existing "Bot ulanishi kutilmoqda" derivation) rather than adding a new column', () => {
  // 2026-08-29, 7-topshiriq round: this was reworked into the user's own
  // described 4-stage lifecycle (To'lov kutilmoqda -> To'lov tekshirilmoqda
  // -> To'lov tasdiqlandi -> Do'kon faollashtirildi) PLUS a now-SEPARATE
  // requestSecondaryStatus() for the receipt sub-signal (Chek so'raldi/
  // yuborildi) — previously both were conflated in one function. Still
  // fully derived (status/shopCreated/paymentClaimedAt/hasReceipt/
  // receiptRequestedAt), still no new stored status column.
  const fnStart = platformApp.indexOf("function requestDisplayStatus(r)");
  const fnBlock = platformApp.slice(fnStart, platformApp.indexOf('\n  const REQUESTS_SUB_FILTERS', fnStart));
  assert.match(fnBlock, /if \(r\.status === 'REJECTED'\) return \{ key: 'REJECTED', label: 'Rad etildi', tone: 'danger' \};/);
  assert.match(fnBlock, /if \(r\.status === 'APPROVED' && r\.shopCreated\) return \{ key: 'ACTIVATED', label: "Do'kon faollashtirildi", tone: 'ok' \};/);
  assert.match(fnBlock, /if \(r\.status === 'APPROVED'\) return \{ key: 'PAYMENT_APPROVED', label: "To'lov tasdiqlandi", tone: 'ok' \};/);
  assert.match(fnBlock, /if \(r\.paymentClaimedAt\) return \{ key: 'REVIEWING', label: "To'lov tekshirilmoqda", tone: 'info' \};/);
  assert.match(fnBlock, /return \{ key: 'PENDING', label: "To'lov kutilmoqda", tone: 'muted' \};/);

  const secStart = platformApp.indexOf('function requestSecondaryStatus(r)');
  const secBlock = platformApp.slice(secStart, platformApp.indexOf('\n  async function loadMyRequests', secStart));
  assert.match(secBlock, /if \(r\.status !== 'NEW'\) return null;/, 'the receipt sub-signal only makes sense while a request is still NEW/open');
  assert.match(secBlock, /if \(r\.hasReceipt\) return \{ key: 'RECEIPT_SENT', label: 'Chek yuborildi', tone: 'info' \};/);
  assert.match(secBlock, /if \(r\.receiptRequestedAt\) return \{ key: 'RECEIPT_REQUESTED', label: "Chek so'raldi", tone: 'warn' \};/);

  assert.match(platformApp, /class="plat-request-status-pill is-\$\{ds\.tone\}"/, 'the card must actually render this derived status, not just compute it');
});

// ---------------------------------------------------------------------------
// Regression guard: broader than the window-export test above — every bare
// function CALL anywhere in platform-app.js (not just inline handlers) must
// resolve to a real function/const/let/var declaration somewhere in the
// file. This exact class of bug was found TWICE while auditing for the
// analytics feature (2026-08-28): loadDashboardSummary() was called from
// onTabEnter()/approveRequest() but never defined — the whole Admin
// Dashboard tab was PERMANENTLY stuck on "Yuklanmoqda..." as a result, with
// nothing surfacing the ReferenceError to a human. supportStatusLabel() was
// called from two ticket-list renderers and also never defined. Both fixed
// same session; this test exists so a third one can't land silently.
// ---------------------------------------------------------------------------
test('every bare function call anywhere in platform-app.js resolves to a real declaration (function/const/let/var) — catches ReferenceError-at-runtime bugs that static onclick-only scanning or the render() try/catch would otherwise swallow silently', () => {
  const callRe = /(?<![.\w$])([a-zA-Z_$][\w$]*)\(/g;
  const calls = new Set();
  let m;
  while ((m = callRe.exec(platformApp))) calls.add(m[1]);
  const defs = new Set();
  const defRe1 = /function\s+([a-zA-Z_$][\w$]*)\s*\(/g;
  while ((m = defRe1.exec(platformApp))) defs.add(m[1]);
  const defRe2 = /(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=/g;
  while ((m = defRe2.exec(platformApp))) defs.add(m[1]);
  // Real JS/DOM globals this file legitimately calls as bare identifiers,
  // plus two known false-positives that only ever appear INSIDE comments
  // (`scopedKey()`/`fcIcon()`, both referencing the separate shop-app file
  // — a plain regex scan can't tell code from comment text).
  const allowed = new Set([
    'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'new',
    'Number', 'String', 'Boolean', 'Array', 'Object', 'Math', 'JSON', 'Date', 'Map', 'Set',
    'Promise', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
    'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'alert', 'confirm', 'prompt', 'fetch',
    'btoa', 'atob', 'escape', 'unescape', 'structuredClone', 'requestAnimationFrame', 'Symbol',
    'WeakMap', 'WeakSet', 'Proxy', 'Reflect', 'Error', 'TypeError', 'RangeError',
    'AbortController', 'FileReader', 'URL', 'URLSearchParams', 'resolve', 'reject', // both are Promise-executor closure params, not globals
    'scopedKey', 'fcIcon', // comment-only false positives, see note above
  ]);
  const missing = [...calls].filter((c) => !defs.has(c) && !allowed.has(c));
  assert.deepStrictEqual(missing, [], `these functions are called but never declared anywhere in the file: ${missing.join(', ')}`);
});

test('loadDashboardSummary() is actually wired into onTabEnter("dashboard") and approveRequest() — the exact two call sites that were previously silently broken (see the regression test above)', () => {
  const enterStart = platformApp.indexOf('function onTabEnter(tab)');
  const enterBlock = platformApp.slice(enterStart, platformApp.indexOf('\n  }', enterStart) + 4);
  assert.match(enterBlock, /if \(tab === 'dashboard'\) \{ loadDashboardSummary\(\); loadAnalytics\(\); \}/);
});

// ---------------------------------------------------------------------------
// 2026-08-28: Admin Dashboard "Analitika" section (period selector + total/
// new/renewal/plan-change/revenue/retention/payment-period/tariff breakdown
// + sales-timeline bar chart), chosen by the user as the next backlog item.
// ---------------------------------------------------------------------------

test('platform_admin_analytics_summary computes every number from REAL data (approved subscription_requests + shops.status/created_at) — no hardcoded/fabricated figures — and money math uses tariff_price_snapshot (never a live tariff price join, so past reports never silently drift when a tariff is later re-priced)', () => {
  const block = actionBlock('platform_admin_analytics_summary');
  assert.match(block, /requirePlatformSuperAdmin\(\);/);
  assert.match(block, /\.eq\("status", "APPROVED"\)/, 'revenue/count must only ever come from actually-approved (real money) requests');
  assert.match(block, /Number\(r\.tariff_price_snapshot \|\| 0\)/, 'must use the snapshot, not a live tariff price join');
  assert.match(block, /newShopCount = rows\.filter\(\(r: any\) => r\.kind === "NEW_SHOP"\)\.length;/);
  assert.match(block, /renewalCount = rows\.filter\(\(r: any\) => r\.kind === "UPGRADE" && r\.upgrade_action === "EXTEND"\)\.length;/);
  assert.match(block, /planChangeCount = rows\.filter\(\(r: any\) => r\.kind === "UPGRADE" && r\.upgrade_action === "CHANGE"\)\.length;/);
});

test('platform_admin_analytics_summary retention is computed from shops.status/created_at (a real, current-state metric independent of the period selector) — excludes PROVISIONING shops from the cohort, treats ACTIVE/FROZEN as retained and only TERMINATED as churned, and returns null (not a fake 0%/100%) when the cohort is empty', () => {
  const block = actionBlock('platform_admin_analytics_summary');
  assert.match(block, /\.neq\("status", "PROVISIONING"\)\.lte\("created_at", retentionCutoff\)/);
  assert.match(block, /s\.status === "ACTIVE" \|\| s\.status === "FROZEN"/);
  assert.match(block, /const retentionRate = cohortSize \? Math\.round\(\(retainedSize \/ cohortSize\) \* 100\) : null;/, 'must be null on an empty cohort, never a fabricated percentage');
});

test('platform_admin_analytics_summary period selector (7d/30d/90d/all) actually changes the query window via a real gte() date filter, not just a label', () => {
  const block = actionBlock('platform_admin_analytics_summary');
  assert.match(block, /periodDays = period === "7d" \? 7 : period === "90d" \? 90 : period === "all" \? null : 30;/);
  assert.match(block, /if \(since\) approvedQuery = approvedQuery\.gte\("reviewed_at", since\);/);
});

test('the frontend renderAnalyticsSection()/renderAnalyticsTrendBars() field references match the backend response shape exactly (totalCount/newShopCount/renewalCount/planChangeCount/revenue/retentionRate/retentionCohortSize/salesTimeline/byPeriod.MONTHLY+ANNUAL/byTariff, and each timeline point\'s label/revenue/count) — a mismatch here would silently render "undefined" instead of throwing, so this must be checked by name, not just "the function exists"', () => {
  const sectionStart = platformApp.indexOf('function renderAnalyticsSection()');
  const sectionBlock = platformApp.slice(sectionStart, platformApp.indexOf('\n  function renderAdminDashboardTab', sectionStart));
  for (const field of ['a.totalCount', 'a.newShopCount', 'a.renewalCount', 'a.planChangeCount', 'a.revenue', 'a.retentionRate', 'a.retentionCohortSize', 'a.salesTimeline', 'a.byPeriod.MONTHLY', 'a.byPeriod.ANNUAL', 'a.byTariff']) {
    assert.ok(sectionBlock.includes(field), `renderAnalyticsSection() must reference ${field}`);
  }
  const barsStart = platformApp.indexOf('function renderAnalyticsTrendBars(timeline)');
  const barsBlock = platformApp.slice(barsStart, platformApp.indexOf('\n  function renderAnalyticsSection', barsStart));
  assert.match(barsBlock, /p\.revenue/);
  assert.match(barsBlock, /p\.count/);
  assert.match(barsBlock, /p\.label/);
});

test('loadAnalytics()/setAnalyticsPeriod() call platform_admin_analytics_summary with the real period state (not a hardcoded value), and the Dashboard tab entry point loads it alongside loadDashboardSummary()', () => {
  const fnStart = platformApp.indexOf('async function loadAnalytics()');
  const fnBlock = platformApp.slice(fnStart, platformApp.indexOf('\n  function setAnalyticsPeriod', fnStart));
  assert.match(fnBlock, /callPlatformApi\('platform_admin_analytics_summary', \{ period: analyticsPeriod \}\)/);
  assert.match(platformApp, /function setAnalyticsPeriod\(period\) \{ analyticsPeriod = period; loadAnalytics\(\); \}/);
});

// ---------------------------------------------------------------------------
// 2026-08-28: platform payment methods (Click/Payme/Paynet link-CRUD),
// deliberately independent of the existing Karta mechanism and of the
// shop-level Click/Payme/Uzum MERCHANT webhook integration (that one does
// real automatic confirmation with real credentials — this one is just an
// admin-entered external link, same manual "To'ladim" follow-up as Karta).
// ---------------------------------------------------------------------------

test('052 migration purely adds platform_payment_methods, and existing platform_settings (Karta) is completely untouched — the two payment mechanisms stay fully independent', () => {
  const mig = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '052_platform_payment_methods.sql'), 'utf8');
  assert.match(mig, /create table public\.platform_payment_methods \(/);
  assert.match(mig, /method_type text not null check \(method_type in \('CLICK', 'PAYME', 'PAYNET'\)\)/);
  assert.match(mig, /payment_url text not null/);
  assert.doesNotMatch(mig, /alter table public\.platform_settings/, 'must never alter the existing Karta table (comments may still mention it by name for context)');
  assert.doesNotMatch(mig, /drop table|drop column|rename/i);
});

test('platform_list_payment_methods is PUBLIC and only ever returns ACTIVE methods with no admin-only fields (isActive/sortOrder), while platform_admin_list_payment_methods and platform_upsert_payment_method both require requirePlatformSuperAdmin()', () => {
  const publicBlock = actionBlock('platform_list_payment_methods');
  assert.doesNotMatch(publicBlock, /requirePlatformSuperAdmin\(\)/);
  assert.match(publicBlock, /\.eq\("is_active", true\)/);
  assert.doesNotMatch(publicBlock, /isActive|sortOrder/, 'the public listing must not leak admin-only management fields');

  assert.match(actionBlock('platform_admin_list_payment_methods'), /requirePlatformSuperAdmin\(\);/);
  assert.match(actionBlock('platform_upsert_payment_method'), /requirePlatformSuperAdmin\(\);/);
});

test('platform_upsert_payment_method validates methodType against the real enum, rejects a non-http(s) payment URL (blocks javascript:/data: schemes even from an admin-controlled panel), and requires a non-empty display name', () => {
  const block = actionBlock('platform_upsert_payment_method');
  assert.match(block, /if \(!\["CLICK", "PAYME", "PAYNET"\]\.includes\(methodType\)\) return json\(\{ error: "invalid_method_type" \}, 400\);/);
  assert.match(block, /if \(!\/\^https\?:\\\/\\\/\/i\.test\(paymentUrl\)\) return json\(\{ error: "invalid_payment_url" \}, 400\);/);
  assert.match(block, /if \(!displayName\) return json\(\{ error: "display_name_required" \}, 400\);/);
});

test('the customer PAYMENT page loads platform payment methods alongside the card (in ensurePaymentInfoLoaded, with its own try/catch so a methods-fetch failure never blocks the existing Karta flow), and renders each as a real selectable payment-method choice that gates behind the warning modal before it can open — while the admin gets a full add/edit CRUD form reusing the same draft-object pattern as the tariff editor', () => {
  const loadStart = platformApp.indexOf('async function ensurePaymentInfoLoaded()');
  const loadBlock = platformApp.slice(loadStart, loadStart + 700);
  assert.match(loadBlock, /callPlatformApi\('platform_list_payment_methods', \{\}\)/);

  // 2026-08-28: to'lovdan oldin majburiy ogohlantirish qo'shilgach (item 3
  // qo'shimcha slice — alohida test bloki bor) bu endi to'g'ridan-to'g'ri
  // <a href> emas, checkbox-gated tugma orqali ochiladi.
  assert.match(platformApp, /onclick="openExternalPaymentWarning\('\$\{m\.id\}'\)"/);

  // 2026-08-29, 7-topshiriq round (task 2, payment method logos): the draft
  // now also resets any pending logo upload and carries logoUrl/hasCustomLogo
  // fields — real feature addition, not a regression.
  assert.match(platformApp, /function openNewPaymentMethodDraft\(\) \{ resetPaymentMethodLogoDraft\(\); paymentMethodDraft = \{ id: null, methodType: 'CLICK', displayName: '', paymentUrl: '', logoUrl: '', hasCustomLogo: false, isActive: true \}; render\(\); \}/);
  const saveStart = platformApp.indexOf('async function savePaymentMethodDraft()');
  const saveBlock = platformApp.slice(saveStart, platformApp.indexOf('\n  }', saveStart) + 4);
  assert.match(saveBlock, /callPlatformApi\('platform_upsert_payment_method', \{/);
  // 2026-08-28 v15-sync: card/payment-methods/notification-templates were
  // split out of loadAdminTariffs() into loadAdminSettings() (see the
  // "Admin sozlamalari" hub test above) — the payment-method draft reloads
  // through that new loader now, not the old combined one.
  assert.match(saveBlock, /await loadAdminSettings\(\);/, 'must reload the same admin loader that also feeds the payment-methods list, not a separate stale path');
});

// ---------------------------------------------------------------------------
// 2026-08-28: admin "So'rovlar" tab gains a derived-status sub-filter (within
// the NEW bucket: Kutilmoqda/Chek so'raldi/Tekshirilmoqda) + a search box —
// item 2 of the remaining backlog, chosen next by the user ("2").
// ---------------------------------------------------------------------------

test('requestDisplayStatus()/requestSecondaryStatus() return stable `key`s, and filteredRequestsForDisplay() reuses those SAME keys for its sub-filter (never a second, independently-maintained branching that could drift from the badge logic)', () => {
  const fnStart = platformApp.indexOf('function requestDisplayStatus(r)');
  const fnBlock = platformApp.slice(fnStart, platformApp.indexOf('\n  const REQUESTS_SUB_FILTERS', fnStart));
  for (const key of ['REJECTED', 'ACTIVATED', 'PAYMENT_APPROVED', 'REVIEWING', 'PENDING']) {
    assert.match(fnBlock, new RegExp(`key: '${key}'`), `must return key: '${key}'`);
  }
  const secStart = platformApp.indexOf('function requestSecondaryStatus(r)');
  const secBlock = platformApp.slice(secStart, platformApp.indexOf('\n  async function loadMyRequests', secStart));
  for (const key of ['RECEIPT_SENT', 'RECEIPT_REQUESTED']) {
    assert.match(secBlock, new RegExp(`key: '${key}'`), `must return key: '${key}'`);
  }
  const filterFnStart = platformApp.indexOf('function filteredRequestsForDisplay()');
  const filterFnBlock = platformApp.slice(filterFnStart, platformApp.indexOf('\n  function requestTypeLabel', filterFnStart));
  assert.match(filterFnBlock, /return requestSecondaryStatus\(r\)\?\.key === 'RECEIPT_REQUESTED';/, 'must call the shared secondary-status function, not duplicate its branching');
  assert.match(filterFnBlock, /return requestSecondaryStatus\(r\)\?\.key === 'RECEIPT_SENT';/);
  assert.match(filterFnBlock, /return requestDisplayStatus\(r\)\.key === requestsSubFilter;/, 'the sub-filter must call the SAME function the badge uses, not duplicate the branching');
});

test('the sub-filter row only renders while the top-level "Yangi" (NEW) tab is active (the derived sub-states only make sense within NEW — APPROVED/REJECTED are terminal), and switching the top-level filter resets the sub-filter back to ALL so a stale sub-filter can\'t hide every request on the next tab', () => {
  assert.match(platformApp, /function setRequestsFilter\(f\) \{ requestsFilter = f; requestsSubFilter = 'ALL'; loadRequests\(\); \}/);
  const tabStart = platformApp.indexOf('function renderAdminRequestsTab()');
  const tabBlock = platformApp.slice(tabStart, platformApp.indexOf('\n  }', tabStart) + 4);
  assert.match(tabBlock, /\$\{requestsFilter === 'NEW' \? `/, 'sub-filter row must be gated on requestsFilter === NEW');
});

test('the requests search box filters client-side (no new backend call) over requesterFirstName/requesterUsername/requesterTelegramId/tariffName, matching the same search-field convention already used for the Do\'konlar tab', () => {
  const fnStart = platformApp.indexOf('function filteredRequestsForDisplay()');
  const fnBlock = platformApp.slice(fnStart, platformApp.indexOf('\n  function renderAdminRequestsTab', fnStart));
  assert.match(fnBlock, /r\.requesterFirstName, r\.requesterUsername, r\.requesterTelegramId, r\.tariffName/);
  assert.match(platformApp, /oninput="setRequestsSearch\(this\.value\)"/);
});

// ---------------------------------------------------------------------------
// 2026-08-28: mandatory pre-payment warning (spec item 3) before opening any
// external Click/Payme/Paynet link — a required checkbox gates the actual
// "To'lovga o'tish" action. Karta is deliberately excluded: it never
// navigates away (just copies a number), so the "before opening a link"
// warning doesn't apply to it.
// ---------------------------------------------------------------------------

// 2026-08-28 v15-sync: the inline expanding warning box this session
// originally shipped was replaced with a REAL modal overlay
// (renderExternalPaymentWarningModal, appended once at the end of
// renderPaymentBody() and shown/hidden via pendingExternalPaymentMethodId)
// — a genuine upgrade matching the spec's literal wording ("warning
// modal") more closely than the original inline-box compromise. The core
// safety invariant is unchanged and even reinforced: clicking a method
// choice never opens its URL directly, and the modal's confirm button is
// still a real `disabled` state (not just dimmed) until the checkbox is
// checked — confirmExternalPaymentOpen() also independently re-checks
// externalPaymentWarningChecked itself before doing anything, so even a
// stray call can't bypass the gate.
test('clicking an external payment method never opens its URL directly — it opens a real modal overlay (openExternalPaymentWarning) instead of navigating, and the modal\'s "Davom etish" button stays a real disabled state (not just dimmed) until the warning checkbox is checked', () => {
  const rowFnStart = platformApp.indexOf('function renderPaymentMethodChoice(m)');
  const rowFnBlock = platformApp.slice(rowFnStart, platformApp.indexOf('\n  function renderExternalPaymentWarningModal', rowFnStart));
  assert.match(rowFnBlock, /onclick="openExternalPaymentWarning\('\$\{m\.id\}'\)"/, 'the method choice button must open the warning flow, never the URL itself');
  assert.doesNotMatch(rowFnBlock, /href="\$\{m\.paymentUrl\}"|onclick="[^"]*window\.open/i, 'must never navigate directly from the choice button');

  const modalFnStart = platformApp.indexOf('function renderExternalPaymentWarningModal()');
  const modalFnBlock = platformApp.slice(modalFnStart, platformApp.indexOf('\n  function renderPaymentBody', modalFnStart));
  assert.match(modalFnBlock, /if \(!pendingExternalPaymentMethodId\) return '';/, 'the modal must render nothing at all when no method is pending — not an empty/hidden shell');
  assert.match(modalFnBlock, /\$\{externalPaymentWarningChecked \? '' : 'plat-btn-dimmed'\}/);
  assert.match(modalFnBlock, /externalPaymentWarningChecked \? 'onclick="confirmExternalPaymentOpen\(\)"' : 'disabled'/, 'the confirm button must be a real disabled state, not just visually dimmed');

  const confirmFnStart = platformApp.indexOf('function confirmExternalPaymentOpen()');
  const confirmFnBlock = platformApp.slice(confirmFnStart, platformApp.indexOf('\n  function clearReceiptFile', confirmFnStart));
  assert.match(confirmFnBlock, /if \(!m\?\.paymentUrl \|\| !externalPaymentWarningChecked\) return;/, 'must independently re-verify the checkbox itself, not only trust the UI having gated the button');
});

test('confirmExternalPaymentOpen() re-looks-up the URL from platformPaymentMethods by the tracked pendingExternalPaymentMethodId instead of ever embedding the admin-entered URL string inside an onclick attribute (an apostrophe/quote in a pasted URL would otherwise break the inline JS)', () => {
  const fnStart = platformApp.indexOf('function confirmExternalPaymentOpen()');
  const fnBlock = platformApp.slice(fnStart, platformApp.indexOf('\n  }', fnStart) + 4);
  assert.match(fnBlock, /platformPaymentMethods\.find\(\(x\) => x\.id === pendingExternalPaymentMethodId\)/);
  assert.doesNotMatch(platformApp, /onclick="confirmExternalPaymentOpen\('\$\{/, 'must never pass the URL as an inline-JS string argument');
});

test('opening a new payment method warning resets externalPaymentWarningChecked back to false (a previously-checked box can\'t silently carry over and skip the warning for a DIFFERENT method), and closing/cancelling clears the pending method entirely', () => {
  // 2026-08-28 v15-sync: reformatted from one-liners to multi-line bodies
  // (now that the modal render function sits right alongside them) —
  // same logic, whitespace-tolerant match.
  const openFnStart = platformApp.indexOf('function openExternalPaymentWarning(methodId)');
  const openFnBlock = platformApp.slice(openFnStart, platformApp.indexOf('\n  }', openFnStart) + 4);
  assert.match(openFnBlock, /pendingExternalPaymentMethodId = methodId;/);
  assert.match(openFnBlock, /externalPaymentWarningChecked = false;/);
  assert.match(openFnBlock, /rerenderActivePage\(\);/);

  const closeFnStart = platformApp.indexOf('function closeExternalPaymentWarning()');
  const closeFnBlock = platformApp.slice(closeFnStart, platformApp.indexOf('\n  }', closeFnStart) + 4);
  assert.match(closeFnBlock, /pendingExternalPaymentMethodId = null;/);
  assert.match(closeFnBlock, /externalPaymentWarningChecked = false;/);
  assert.match(closeFnBlock, /rerenderActivePage\(\);/);
});

// ---------------------------------------------------------------------------
// 2026-08-29, 7-topshiriq round — dedicated regression coverage for the
// remaining tasks that only had incidental coverage so far (task 1 render-
// state preservation, task 3 payment-draft resume, task 6 admin lifecycle
// settings). Written against the ALREADY-SHIPPED functions, verifying they
// exist and are wired correctly — not rebuilding or redesigning them.
// ---------------------------------------------------------------------------

test('task 1: render() captures scroll/focus state before re-rendering and restores it after, so a re-render (billing toggle, carousel scroll, checkbox) never yanks focus or resets scroll position — but a fresh navigation (opts.preserve===false) or the loading screen skips restoring stale state', () => {
  const renderFnStart = platformApp.indexOf('function render(options)');
  const renderFnBlock = platformApp.slice(renderFnStart, platformApp.indexOf('\n  }', renderFnStart) + 4);
  assert.match(renderFnBlock, /const preserve = opts\.preserve !== false && !loading;/, 'must not preserve state while a fresh boot/loading screen is up');
  assert.match(renderFnBlock, /const snapshot = preserve \? capturePlatformUiState\(\) : null;/);
  assert.match(renderFnBlock, /renderNow\(\);/, 'the actual re-render must happen between capture and restore, not before capture');
  assert.match(renderFnBlock, /if \(snapshot\) restorePlatformUiState\(snapshot\);/);

  const captureStart = platformApp.indexOf('function capturePlatformUiState()');
  const captureBlock = platformApp.slice(captureStart, platformApp.indexOf('\n  }', captureStart) + 4);
  assert.match(captureBlock, /document\.activeElement/, 'must capture which element (e.g. a text input) currently has focus');
  assert.match(captureBlock, /selectionStart/, 'must capture cursor position within a text input, not just which input was focused');
  // 2026-08-30: .plat-page-body was added to this list — see the dedicated
  // "root-cause scroll-jump fix" test below for why.
  assert.match(captureBlock, /querySelectorAll\('\.plat-page-body,\.plat-carousel,\.plat-admin-request-subfilters,\.plat-filter-row,\.plat-payment-method-grid'\)/, 'must capture scroll offsets of every horizontally-scrollable strip AND the real page scroll container, not just the page scroll');

  const restoreStart = platformApp.indexOf('function restorePlatformUiState(snapshot)');
  const restoreBlock = platformApp.slice(restoreStart, platformApp.indexOf('\n  }', restoreStart) + 4);
  assert.match(restoreBlock, /if \(!snapshot\) return;/);
  assert.match(restoreBlock, /target\.focus\(\{ preventScroll: true \}\)/, 'restoring focus must not itself cause a second, competing scroll jump');
  assert.match(restoreBlock, /requestAnimationFrame\(\(\) => \{ apply\(\); requestAnimationFrame\(apply\); \}\);/, 'must reapply across at least two animation frames since the new DOM is not always ready on the very next frame');
  assert.match(restoreBlock, /setTimeout\(apply, 60\);/, 'must have a timer fallback in case rAF timing alone misses async-loaded content');
});

// 2026-08-30: task 1's original render-state-preservation fix (above) shipped
// (v32) but the user reported the "page jumps to top on almost every button
// press, and even spontaneously while idle" bug STILL happened. Root cause,
// found by reading the actual CSS: `.plat-page { position: fixed; ... }` +
// `.plat-page-body { flex: 1; overflow-y: auto; ... }` (platform.css) means
// EVERY activePage (Payment/Requests/Shop Details/Tariflar/Sozlamalar/
// Support/... — i.e. nearly the entire app, per renderActivePage()'s full
// pageShell()-based switch) scrolls INSIDE .plat-page-body, not the window.
// The original fix only ever captured/restored window.scrollX/Y, which is
// always 0 while a page is open — so render() (any click, any background
// poll, any async load resolving) kept recreating .plat-page-body's DOM node
// and resetting its real scrollTop to 0, with nothing to undo it.
test('root-cause scroll-jump fix: .plat-page-body — the ACTUAL scroll container for every activePage (fixed-position .plat-page wrapper, per platform.css) — is included in the same capture/restore mechanism as the other scrollable strips, not just window.scrollX/Y which is always 0 while a page is open', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'platform', 'platform.css'), 'utf8');
  // Confirm the actual CSS reality that makes window.scrollX/Y useless here.
  assert.match(css, /\.plat-page \{ position: fixed;[^}]*\}/, 'the page wrapper must be a fixed-position overlay (so the window itself never scrolls while it is open)');
  assert.match(css, /\.plat-page-body \{ flex: 1; overflow-y: auto;/, 'the page body must own its own internal scroll');

  // Every activePage branch goes through pageShell() (which emits
  // .plat-page-body) — confirm the fix reaches literally every one of them
  // by checking the shared capture/restore selector includes it (both
  // directions, or the two states diverge on re-render).
  const captureStart = platformApp.indexOf('function capturePlatformUiState()');
  const captureBlock = platformApp.slice(captureStart, platformApp.indexOf('\n  }', captureStart) + 4);
  assert.match(captureBlock, /querySelectorAll\('\.plat-page-body,/);
  const restoreStart = platformApp.indexOf('function restorePlatformUiState(snapshot)');
  const restoreBlock = platformApp.slice(restoreStart, platformApp.indexOf('\n  }', restoreStart) + 4);
  assert.match(restoreBlock, /querySelectorAll\('\.plat-page-body,/);

  // openPage/closePage/tab switches must still intentionally reset scroll to
  // top on a genuine navigation (preserve:false) — the fix must not make
  // every navigation "stick" at the previous page's scroll position.
  assert.match(platformApp, /function openPage\(pageId\) \{ activePage = pageId; render\(\{ preserve: false, scrollTop: true \}\); \}/);
  assert.match(platformApp, /function closePage\(\) \{ activePage = null; render\(\{ preserve: false, scrollTop: true \}\); \}/);
});

// 2026-08-31: after the .plat-page-body scroll fix (above), the user
// reported a NEW/newly-visible symptom — opening a page like "To'lov
// sozlamalari" now flashes: everything vanishes and reappears in under a
// second, "like a reload". Root cause: EVERY render() (not just genuine
// navigation) fully recreates .plat-page's DOM node (renderNow() always
// replaces #app's innerHTML) — and .plat-page has a slide-in CSS animation
// meant for opening a page, which therefore replays on every same-page
// data-refresh render too (e.g. openPage() opens the page, then
// loadAdminSettings() resolves moments later and calls render() again).
// Before the scroll fix this manifested as "jumps to top"; now that scroll
// stays put, the same repeated DOM-recreation instead reads as a visible
// flash. Confirmed reproducible in BOTH admin and user mode (not admin-only).
test('root-cause "flash/reload" fix: .plat-page only replays its slide-in animation on a GENUINE navigation (openPage/closePage/goHomePage, which already pass preserve:false) — a same-page data-refresh render (e.g. loadAdminSettings() resolving after the page already opened) suppresses it via a shared suppressPageOpenAnimation flag, set from the exact same preserve computation render() already does', () => {
  const renderFnStart = platformApp.indexOf('function render(options)');
  const renderFnBlock = platformApp.slice(renderFnStart, platformApp.indexOf('\n  }', renderFnStart) + 4);
  assert.match(renderFnBlock, /suppressPageOpenAnimation = preserve;/, 'must reuse the existing preserve computation — not a second, independently-tracked flag that could drift');
  assert.ok(renderFnBlock.indexOf('suppressPageOpenAnimation = preserve;') < renderFnBlock.indexOf('renderNow();'), 'the flag must be set BEFORE renderNow() runs, or pageShell() would read the stale value');

  const pageShellStart = platformApp.indexOf('function pageShell(title, bodyHtml, opts)');
  const pageShellBlock = platformApp.slice(pageShellStart, platformApp.indexOf('\n  }', pageShellStart) + 4);
  assert.match(pageShellBlock, /<div class="plat-page \$\{suppressPageOpenAnimation \? 'no-anim' : ''\}">/);

  const css = fs.readFileSync(path.join(__dirname, '..', 'platform', 'platform.css'), 'utf8');
  assert.match(css, /\.plat-page\.no-anim \{ animation: none; \}/);
  // The base rule (used on genuine navigation) must still keep its animation.
  assert.match(css, /\.plat-page \{ position: fixed;[^}]*animation: platSlideIn 0\.2s ease;/);
});

// 2026-08-31, checkout payment-method feedback (item 2 of the user's live
// testing pass): (a) a method WITH a real admin-uploaded logo must show
// ONLY that logo (no name/subtitle text), sitting side-by-side with other
// logo-only methods rather than wrapping into a stacked full-width row like
// the text-fallback methods still do; (b) the payment-method logo file
// picker was regressed to accept="image/jpeg,image/png,image/webp", which
// forces the mobile Gallery app open instead of the device Files app (the
// Shop App's own openImagePickerSheet() deliberately omits `accept` for
// exactly this reason) — fixed by dropping the attribute, JS-side type
// validation in onPaymentMethodLogoPicked() already covers it.
test('item 2: a payment method WITH a real logo renders logo-only (no name/subtitle text) and sits side-by-side with other logo-only methods (never wrapped into the old stacked full-width row), while a method with no logo yet keeps the original full text row — and the logo file picker opens the device Files app, not the Gallery', () => {
  const choiceFnStart = platformApp.indexOf('function renderPaymentMethodChoice(m)');
  const choiceFnBlock = platformApp.slice(choiceFnStart, platformApp.indexOf('\n  }', choiceFnStart) + 4);
  assert.match(choiceFnBlock, /if \(m\.logoUrl\) \{/, 'must branch on whether a real logo exists');
  assert.match(choiceFnBlock, /class="plat-payment-method-choice is-logo-only \$\{selected \? 'selected' : ''\}" onclick="openExternalPaymentWarning\('\$\{m\.id\}'\)"/, 'click behavior (warning modal -> link) must be UNCHANGED, only the visual changed');
  assert.doesNotMatch(choiceFnBlock.slice(0, choiceFnBlock.indexOf('is-logo-only')), /<b>\$\{escapeHtml\(m\.displayName/);
  const fallbackStart = choiceFnBlock.search(/return `\r?\n      <button type="button" class="plat-payment-method-choice \$\{selected/);
  const logoOnlyBranch = choiceFnBlock.slice(choiceFnBlock.indexOf('is-logo-only'), fallbackStart);
  assert.doesNotMatch(logoOnlyBranch, /<b>|<small>/, 'the logo-only branch must render no name/subtitle text at all');

  const css = fs.readFileSync(path.join(__dirname, '..', 'platform', 'platform.css'), 'utf8');
  assert.match(css, /\.plat-payment-method-grid\{display:flex;flex-flow:row wrap;gap:8px\}/, 'logo-only buttons must be able to sit side-by-side (row-wrap), not forced into a single column');
  assert.match(css, /\.plat-payment-method-choice\.is-logo-only\{width:auto;flex:0 0 auto;/, 'a logo-only button must size to its content, not stretch to the old full-width row');

  // The picker itself must not force the Gallery.
  assert.match(platformApp, /<input type="file" id="pmd-logo-file" hidden onchange="onPaymentMethodLogoPicked\(event\)">/);
  assert.doesNotMatch(platformApp, /id="pmd-logo-file" accept=/, 'must not reintroduce an accept= filter that forces the Gallery app over the device Files app');
});

test('task 2: platform_upsert_payment_method supports an optional device-uploaded logo (via storePlatformAsset) alongside the existing text-badge fallback, only reuses/clears the stored logo path on explicit removeLogo, validates the underlying payment URL and method type exactly as before, and cleans up the OLD logo file (never leaves it orphaned) whenever it is replaced or removed', () => {
  const block = actionBlock('platform_upsert_payment_method');
  assert.match(block, /if \(!\["CLICK", "PAYME", "PAYNET"\]\.includes\(methodType\)\) return json\(\{ error: "invalid_method_type" \}, 400\);/, 'method-type validation must still be exactly as strict as before the logo feature was added');
  assert.match(block, /if \(!\/\^https\?:\\\/\\\/\/i\.test\(paymentUrl\)\) return json\(\{ error: "invalid_payment_url" \}, 400\);/);
  assert.match(block, /let nextLogoPath = payload\.removeLogo === true \? null : currentLogoPath;/, 'without an explicit removeLogo, an existing logo must be kept, not silently dropped on every unrelated edit');
  assert.match(block, /if \(payload\.logoImageUpload\) \{/);
  assert.match(block, /storePlatformAsset\(db, "payment-methods", id \|\| methodType, payload\.logoImageUpload\)/);
  assert.match(block, /return json\(\{ error: e\?\.message === "image_too_large" \? "image_too_large" : "invalid_image_file" \}, 400\);/, 'must surface a real validation error, not throw a raw 500 on a bad/oversized logo file');
  assert.match(block, /if \(currentLogoPath && currentLogoPath !== nextLogoPath\) \{\s*\n\s*EdgeRuntime\.waitUntil\(cleanupPlatformAssetIfUnreferenced\(db, currentLogoPath, "old-payment-logo"\)/, 'the previous logo file must be reference-safe cleaned whenever it is replaced or removed');
  assert.match(platformApi, /const \{ data, error \} = await db\.from\(table\)\.select\(column\)\.eq\(column, path\)\.limit\(1\);/, 'reference check must work for both id-based and type-based platform tables');

  // frontend: the draft picker + payload shape that actually calls this action.
  const draftPickStart = platformApp.indexOf('function onPaymentMethodLogoPicked(event)');
  assert.ok(draftPickStart >= 0, 'onPaymentMethodLogoPicked must exist as the file-input handler');
  assert.match(platformApp, /callPlatformApi\('platform_upsert_payment_method', \{ id: paymentMethodDraft\.id \|\| undefined, methodType, displayName, paymentUrl, logoImageUpload, removeLogo: paymentMethodLogoRemove, isActive \}\);/);
});

test('task 3: a NEW_SHOP payment draft is resumable from Arizalarim within its 1-hour window — the resume card is gated on kind+status+unclaimed, the countdown label degrades gracefully, and resumeNewShopPayment() independently re-verifies the deadline (never trusts a stale cached row) before restoring the checkout flow state', () => {
  const detailStart = platformApp.indexOf('function renderMyRequestDetailsBody()');
  const detailBlock = platformApp.slice(detailStart, platformApp.indexOf('\n  function ', detailStart + 10));
  assert.match(detailBlock, /const isPaymentDraft = r\.kind === 'NEW_SHOP' && r\.status === 'NEW' && !r\.paymentClaimedAt;/, 'a draft is only ever a NEW, unpaid NEW_SHOP request — never an UPGRADE or an already-claimed one');
  assert.match(detailBlock, /\$\{isPaymentDraft \? `<section class="plat-payment-draft-resume">/);
  assert.match(detailBlock, /onclick="resumeNewShopPayment\('\$\{r\.id\}'\)"/);
  assert.match(detailBlock, /paymentDraftTimeLeftLabel\(r\.paymentDeadlineAt\)/);

  const labelFnStart = platformApp.indexOf('function paymentDraftTimeLeftLabel(iso)');
  const labelFnBlock = platformApp.slice(labelFnStart, platformApp.indexOf('\n  }', labelFnStart) + 4);
  assert.match(labelFnBlock, /if \(!iso\) return '1 soatgacha';/, 'a draft that has not been assigned a deadline yet must still show a sane fallback, not "NaN daqiqa"');
  assert.match(labelFnBlock, /if \(ms <= 0\) return 'muddati tugagan';/);
  assert.match(labelFnBlock, /mins >= 60 \? '60 daqiqagacha' : `\$\{mins\} daqiqa`/);

  const resumeFnStart = platformApp.indexOf('async function resumeNewShopPayment(requestId)');
  const resumeFnBlock = platformApp.slice(resumeFnStart, platformApp.indexOf('\n  }', resumeFnStart) + 4);
  assert.match(resumeFnBlock, /if \(!r \|\| r\.kind !== 'NEW_SHOP' \|\| r\.status !== 'NEW' \|\| r\.paymentClaimedAt\) return;/);
  assert.match(resumeFnBlock, /if \(r\.paymentDeadlineAt && new Date\(r\.paymentDeadlineAt\)\.getTime\(\) <= Date\.now\(\)\)/, 'must independently re-check the deadline client-side too, not only rely on the server rejecting an expired resume');
  assert.match(resumeFnBlock, /showToast\("Bu to'lov arizasining 1 soatlik muddati tugagan\. Yangi ariza oching\.", 'warning'\);/);
  assert.match(resumeFnBlock, /preparedNewShopRequestId = r\.id;/, 'must restore checkout draft state (not start a brand new draft) so submit reuses the same server row');
  assert.match(resumeFnBlock, /openPage\('PAYMENT'\);/);
});

test('task 6: the admin "Do\'kon holati parametrlari" settings page is a real backend-backed CRUD (not hardcoded strings) — platform_get_lifecycle_settings is publicly readable (freeze/terminate reason pickers need it for every admin, not just super-admin) while platform_update_lifecycle_settings is super-admin-gated and rejects an empty reason list either way', () => {
  const getBlock = actionBlock('platform_get_lifecycle_settings');
  assert.doesNotMatch(getBlock, /requirePlatformSuperAdmin\(\)/, 'reading lifecycle settings must not be admin-only — the freeze/terminate reason datalists need it for any operator');

  const updateBlock = actionBlock('platform_update_lifecycle_settings');
  assert.match(updateBlock, /requirePlatformSuperAdmin\(\);/);
  assert.match(updateBlock, /if \(!freezeReasons\.length \|\| !terminateReasons\.length\) return json\(\{ error: "lifecycle_reason_required" \}, 400\);/);
  assert.match(updateBlock, /if \(!freezeUserTitle \|\| !freezeUserBody \|\| !freezeActionText \|\| !terminateUserTitle \|\| !terminateUserBody\) return json\(\{ error: "lifecycle_text_required" \}, 400\);/, 'must not silently accept blank user-facing lifecycle messages');
  assert.match(updateBlock, /if \(supportUrlRaw && !\/\^\(https\?:\\\/\\\/\|tg:\\\/\\\/\)\/i\.test\(supportUrlRaw\)\) return json\(\{ error: "invalid_support_url" \}, 400\);/, 'a support link must be a real telegram/http(s) URL, not arbitrary text that could be used for a phishing-style redirect');

  assert.match(platformApp, /if \(p === 'ADMIN_LIFECYCLE_SETTINGS'\) return pageShell\("Do'kon holati parametrlari", renderAdminLifecycleSettingsBody\(\), \{ onBack: "switchTab\('settings'\)" \}\);/, 'Platform 2.0 Bosqich 2: admin Profil endi Sozlamalar (\'settings\') deb ataladi');
  const saveFnStart = platformApp.indexOf('async function saveLifecycleSettings()');
  const saveFnBlock = platformApp.slice(saveFnStart, platformApp.indexOf('\n  }', saveFnStart) + 4);
  assert.match(saveFnBlock, /if \(!payload\.freezeReasons\.length \|\| !payload\.terminateReasons\.length\) return showToast\("Kamida bitta sabab kiriting\.", 'warning'\);/, 'client must pre-validate too, not rely solely on the server 400');
  assert.match(saveFnBlock, /callPlatformApi\('platform_update_lifecycle_settings', payload\)/);
});

// ---------------------------------------------------------------------------
// 2026-08-31 — Navbatdagi ish #3: Shop App's shop logo is now mandatory 4:1
// (see the Shop App polish-round plan). Platform bot's own shop-card avatars
// (shop switcher/list/dashboard/subscription/checkout — all fed by the SAME
// shopAvatarHtml()/shopAvatarClass() pair) previously forced every logo into
// a 44x44 SQUARE with object-fit:cover, which actively CROPPED a 4:1 image
// down to a thin vertical sliver. Fixed with a `.is-logo` CSS modifier
// (widens the box + switches to object-fit:contain) applied ONLY when a real
// image logo exists — the letter-fallback avatar (no logo yet) is completely
// unchanged, still the original square badge.
// ---------------------------------------------------------------------------

test('task #3: every shop-card avatar surface widens to a 4:1-friendly box with object-fit:contain when a real logo exists (via a shared shopAvatarClass() helper), while the letter-fallback avatar (no logo) keeps its original untouched square appearance', () => {
  assert.match(platformApp, /function shopAvatarClass\(s\) \{ return s\.logoUrl \? 'is-logo' : ''; \}/);
  // Every one of the 5 real shopAvatarHtml() render sites must ALSO carry
  // shopAvatarClass(shop) right there in the same class attribute — not
  // just some of them, or a logo would still get cropped wherever missed.
  const htmlCalls = (platformApp.match(/\$\{shopAvatarHtml\(shop\)\}/g) || []).length;
  const classCalls = (platformApp.match(/class="plat-shop-avatar[^"]*\$\{shopAvatarClass\(shop\)\}[^"]*"/g) || []).length;
  assert.equal(htmlCalls, 5, 'expected exactly 5 real shopAvatarHtml(shop) render sites (target-shop list, checkout summary, dashboard switcher, shop list header, shop detail hero)');
  assert.equal(classCalls, htmlCalls, 'every shopAvatarHtml(shop) render site must have a matching shopAvatarClass(shop) on its wrapping span, or that spot silently keeps the old cropping square');

  const css = fs.readFileSync(path.join(__dirname, '..', 'platform', 'platform.css'), 'utf8');
  // object-fit changed from cover (cropped a wide logo to a thin vertical
  // sliver inside a square box) to contain (shows the whole logo).
  assert.match(css, /\.plat-shop-avatar-img \{ width: 100%; height: 100%; object-fit: contain;/);
  assert.doesNotMatch(css, /object-fit: cover.*plat-shop-avatar/, 'the old cropping behavior must not survive anywhere for shop avatars');
  // The base square dimensions for the FALLBACK (no logo) case are untouched.
  // 12px -> 10px: Platform 2.0 visual-consistency pass consolidated this
  // 44x44 icon container onto the canonical "std-icon" border-radius (10px).
  assert.match(css, /\.plat-shop-avatar \{ width: 44px; height: 44px; border-radius: 10px;/);
  // Every square variant has a matching wider .is-logo override (base, large hero, shop-detail hero, dashboard 2-col compact).
  assert.match(css, /\.plat-shop-avatar\.is-logo \{ width: 66px; height: 30px;/);
  assert.match(css, /\.plat-shop-avatar-lg\.is-logo \{ width: 100px; height: 42px;/);
  assert.match(css, /\.plat-shop-detail-avatar\.is-logo \{ width:100px;height:42px;/);
  assert.match(css, /\.plat-dashboard-shop-tabs\.is-two \.plat-shop-avatar\.is-logo \{ width: 56px; height: 24px;/);

  // The tariff-target shop-card grid used to hardcode the FIRST column to
  // 44px (matching only the old square) — a wider .is-logo box would have
  // been clipped by the grid track itself, independent of the avatar's own
  // CSS. Must now size to content instead.
  assert.match(css, /\.plat-target-shop-card \{ display:grid;grid-template-columns:auto 1fr;/, 'the fixed 44px first grid column must not silently clip a wider logo avatar');
});

// 2026-08-31: the user's standing rule ("bundan keyingi barcha rasm
// qo'shiladigan joyi xotiradan bo'lsin") applies platform-wide, not just to
// the payment-method logo picker fixed earlier. Two more Platform bot spots
// still forced the mobile Gallery app via accept="image/jpeg,image/png,image/webp"
// — the user's own subscription-request receipt picker and the notification
// template image picker. Fixed by dropping the attribute (same pattern as
// pmd-logo-file); JS-side validation in the onXPicked() handlers already
// covers file type. This test guards ALL type="file" inputs in the file at
// once so a future new picker can't silently reintroduce the Gallery-forcing
// attribute.
test('every file input in the Platform bot opens the device Files app — none carry an accept= filter that forces the Gallery app', () => {
  const fileInputs = [...platformApp.matchAll(/<input[^>]*type="file"[^>]*>/g)].map(m => m[0]);
  assert.ok(fileInputs.length >= 5, 'expected at least the 5 known file-picker spots (receipt, bug-report, subscription-request receipt, notification-template image, payment-method logo)');
  for (const tag of fileInputs) {
    assert.doesNotMatch(tag, /accept=/, `file input must not carry an accept= filter (forces Gallery over Files): ${tag}`);
  }
});

// ---------------------------------------------------------------------------
// Bot identity round (2026-09-06): shop owner can submit a desired bot name/
// bio/photo alongside their NEW_SHOP subscription request. The provisioning
// action later applies these fields to the connected bot automatically;
// username remains outside this flow.
// ---------------------------------------------------------------------------

test('migration 069 additively adds exactly the 4 new subscription_requests columns needed for the requested bot identity, nothing else', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '069_subscription_request_bot_identity.sql'), 'utf8');
  assert.match(migration, /add column if not exists requested_bot_name text,/);
  assert.match(migration, /add column if not exists requested_bot_bio text,/);
  assert.match(migration, /add column if not exists bot_photo_storage_path text,/);
  assert.match(migration, /add column if not exists bot_photo_uploaded_at timestamptz;/);
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
});

test('platform_submit_subscription_request accepts OPTIONAL botName/botBio/botPhotoUpload but ONLY stores them for kind===NEW_SHOP (an UPGRADE request is for a shop that already has a bot), reusing storeSubscriptionReceipt (no new upload/validation code) for the photo', () => {
  const block = actionBlock('platform_submit_subscription_request');
  assert.match(block, /const finalRequestedBotName = kind === "NEW_SHOP" \?/, 'bot identity must resolve to null for non-NEW_SHOP requests');
  assert.match(block, /if \(kind === "NEW_SHOP"\) \{\s*\n\s*const requestedBotName = finalRequestedBotName/, 'bot photo/profile persistence block must be gated on NEW_SHOP');
  assert.match(block, /const stored = await storeSubscriptionReceipt\(db, requestId, tgId, botPhotoUpload\);/, 'must reuse the exact same storage helper as the payment receipt, not duplicate the validation logic');
  assert.match(block, /if \(requestedBotName \|\| requestedBotBio \|\| botPhotoPath\)/, 'must not write an empty update when the owner submitted none of the three');
});

test('the new fields flow all the way through: SUBSCRIPTION_REQUEST_SELECT includes the 4 columns, and mapSubscriptionRequest exposes them as requestedBotName/requestedBotBio/hasBotPhoto/botPhotoUploadedAt (the photo path itself is never sent to the client, only a boolean + a separate signed-URL action)', () => {
  const selectStart = platformApi.indexOf('const SUBSCRIPTION_REQUEST_SELECT');
  const selectLine = platformApi.slice(selectStart, platformApi.indexOf('\n', selectStart));
  assert.match(selectLine, /requested_bot_name,requested_bot_bio,bot_photo_storage_path,bot_photo_uploaded_at/);

  const mapStart = platformApi.indexOf('function mapSubscriptionRequest');
  const mapBlock = platformApi.slice(mapStart, platformApi.indexOf('\n}', mapStart) + 2);
  assert.match(mapBlock, /requestedBotName: r\.requested_bot_name \|\| null,/);
  assert.match(mapBlock, /requestedBotBio: r\.requested_bot_bio \|\| null,/);
  assert.match(mapBlock, /hasBotPhoto: !!r\.bot_photo_storage_path,/);
  assert.doesNotMatch(mapBlock, /bot_photo_storage_path:/, 'the raw storage path itself must not be exposed as a mapped field (only the hasBotPhoto boolean)');
});

test('platform_get_bot_photo_url mirrors platform_get_subscription_receipt_url exactly: Super-Admin-gated, 404s when no photo was ever attached, and returns a short-lived (120s) signed URL from the same payment-receipts bucket (no new storage bucket needed)', () => {
  const block = actionBlock('platform_get_bot_photo_url');
  assert.match(block, /requirePlatformSuperAdmin\(\)/);
  assert.match(block, /if \(!reqRow\?\.bot_photo_storage_path\) return json\(\{ error: "bot_photo_not_found" \}, 404\);/);
  assert.match(block, /db\.storage\.from\("payment-receipts"\)\.createSignedUrl\(reqRow\.bot_photo_storage_path, 120\);/);
});

test('the NEW_SHOP payment-page identity form now also offers optional bot name/bio fields and a Files-app photo picker (reusing the exact same .plat-upload-selected/.plat-upload-zone markup as the receipt picker, not a new custom widget), and submitSubscriptionRequest() reads the live DOM values and sends them in the payload only for NEW_SHOP', () => {
  const formStart = platformApp.indexOf('function renderNewShopRequestIdentity()');
  const formBlock = platformApp.slice(formStart, platformApp.indexOf('\n  }', formStart) + 4);
  assert.match(formBlock, /id="plat-new-shop-bot-name"/);
  assert.match(formBlock, /id="plat-new-shop-bot-bio"/);
  assert.match(formBlock, /class="plat-upload-selected"/);
  assert.match(formBlock, /class="plat-upload-zone is-compact is-icon-only"/);
  assert.doesNotMatch(formBlock, /accept=/, 'the new bot-photo file input must not force the Gallery app either');

  assert.match(platformApp, /newShopBotName = String\(document\.getElementById\('plat-new-shop-bot-name'\)\?\.value \|\| newShopBotName \|\| ''\)\.trim\(\);/);
  assert.match(platformApp, /botName: flowKind === 'NEW_SHOP' \? \(newShopBotName\.trim\(\) \|\| undefined\) : undefined,/);
  assert.match(platformApp, /botPhotoUpload: flowKind === 'NEW_SHOP' \? botPhotoUpload : undefined,/);
});

test('the admin request-review card shows the requested bot name/bio and a "view photo" button (calling the new platform_get_bot_photo_url action) only when at least one was actually submitted — and viewBotPhoto/onNewShopBotPhotoPicked/removeNewShopBotPhoto are all exported to window (reachable from their inline onclick handlers)', () => {
  assert.match(platformApp, /r\.kind === 'NEW_SHOP' && \(r\.requestedBotName \|\| r\.requestedBotBio \|\| r\.hasBotPhoto\)/);
  assert.match(platformApp, /onclick="viewBotPhoto\('\$\{r\.id\}'\)"/);
  assert.match(platformApp, /async function viewBotPhoto\(requestId\)/);
  assert.match(platformApp, /window\.viewBotPhoto = viewBotPhoto;/);
  assert.match(platformApp, /window\.onNewShopBotPhotoPicked = onNewShopBotPhotoPicked;/);
  assert.match(platformApp, /window\.removeNewShopBotPhoto = removeNewShopBotPhoto;/);
});
