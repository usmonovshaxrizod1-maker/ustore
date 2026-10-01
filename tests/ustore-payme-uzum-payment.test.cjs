// USTORE — Payme va Uzum Checkout avtomatik to'lov integratsiyasi testlari.
// Click.uz test faylining uslubi bilan: haqiqiy ishga tushiriladigan
// kripto/logika testlari (Deno-ga xos global ishlatmaydigan funksiyalar
// uchun) + qolgan hamma narsa uchun statik-tahlil (bu pul bilan ishlaydi).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const FUNCTIONS_DIR = path.join(__dirname, '..', 'supabase', 'functions');
const PAYME_CLIENT_URL = pathToFileURL(path.join(FUNCTIONS_DIR, '_shared', 'payme-client.ts')).href;
const shopApi = fs.readFileSync(path.join(FUNCTIONS_DIR, 'shop-api', 'index.ts'), 'utf8');
const platformApi = fs.readFileSync(path.join(FUNCTIONS_DIR, 'platform-api', 'index.ts'), 'utf8');
const paymeWebhook = fs.readFileSync(path.join(FUNCTIONS_DIR, 'payme-webhook', 'index.ts'), 'utf8');
const commerceHardening = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '074_commerce_hardening.sql'), 'utf8');
const uzumWebhook = fs.readFileSync(path.join(FUNCTIONS_DIR, 'uzum-webhook', 'index.ts'), 'utf8');
const uzumClient = fs.readFileSync(path.join(FUNCTIONS_DIR, '_shared', 'uzum-client.ts'), 'utf8');
const migration039 = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '039_payme_uzum_payment.sql'), 'utf8');
const configToml = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'config.toml'), 'utf8');
const shopAppJs = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
const platformAppJs = fs.readFileSync(path.join(__dirname, '..', 'platform', 'platform-app.js'), 'utf8');
const commerceJs = fs.readFileSync(path.join(__dirname, '..', 'ustore-commerce.js'), 'utf8');

// ---------------------------------------------------------------------------
// REAL executable tests — payme-client.ts's Basic Auth check and checkout
// URL builder are pure functions with no Deno-specific globals (atob/btoa
// exist in Node too), so these run the actual implementation, not just
// grep the source — security-critical (a wrong auth check = fake payments
// accepted as real).
// ---------------------------------------------------------------------------

test('verifyPaymeBasicAuth accepts the exact login:password pair, base64-decoded from a real "Basic ..." header, and rejects everything else', async () => {
  const { verifyPaymeBasicAuth } = await import(PAYME_CLIENT_URL);
  const header = `Basic ${Buffer.from('myLogin:myPass123').toString('base64')}`;
  assert.equal(verifyPaymeBasicAuth(header, 'myLogin', 'myPass123'), true);
  assert.equal(verifyPaymeBasicAuth(header, 'myLogin', 'wrongPass'), false, 'wrong password must fail');
  assert.equal(verifyPaymeBasicAuth(header, 'otherLogin', 'myPass123'), false, 'wrong login must fail');
  assert.equal(verifyPaymeBasicAuth(null, 'myLogin', 'myPass123'), false, 'missing header must fail');
  assert.equal(verifyPaymeBasicAuth('Bearer abc123', 'myLogin', 'myPass123'), false, 'non-Basic scheme must fail');
  assert.equal(verifyPaymeBasicAuth('Basic not-valid-base64!!!', 'myLogin', 'myPass123'), false, 'malformed base64 must not throw, must fail');
});

test('buildPaymeCheckoutUrl produces the exact documented format: https://checkout.paycom.uz/base64("m=...;ac.<field>=...;a=...")', async () => {
  const { buildPaymeCheckoutUrl } = await import(PAYME_CLIENT_URL);
  const url = buildPaymeCheckoutUrl({ merchantId: '587f72c72cac0d162c722ae2', orderAccountField: 'order_id', orderId: 197, amountTiyin: 500000 });
  assert.match(url, /^https:\/\/checkout\.paycom\.uz\//);
  const encoded = url.replace('https://checkout.paycom.uz/', '');
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  assert.equal(decoded, 'm=587f72c72cac0d162c722ae2;ac.order_id=197;a=500000');
});

// ---------------------------------------------------------------------------
// Migration 039 — additive-only, same shape as 018_click_payment.sql.
// ---------------------------------------------------------------------------

test('039 migration is purely additive: creates payme_connections/payme_transactions/uzum_connections/uzum_transactions and only adds new columns to shops', () => {
  assert.match(migration039, /alter table public\.shops\s*\n\s*add column if not exists payme_access_granted/);
  assert.match(migration039, /alter table public\.shops\s*\n\s*add column if not exists uzum_access_granted/);
  assert.match(migration039, /create table if not exists public\.payme_connections/);
  assert.match(migration039, /create table if not exists public\.payme_transactions/);
  assert.match(migration039, /create table if not exists public\.uzum_connections/);
  assert.match(migration039, /create table if not exists public\.uzum_transactions/);
  assert.doesNotMatch(migration039, /drop table|drop column/i);
});

test('every new 039 table enables RLS (service_role bypasses, anon/authenticated get zero access by default)', () => {
  for (const table of ['payme_connections', 'payme_transactions', 'uzum_connections', 'uzum_transactions']) {
    assert.match(migration039, new RegExp(`alter table public\\.${table} enable row level security;`));
  }
});

test('payme_transactions.state is a closed 4-value enum (1/2/-1/-2 per Payme docs) and payme_transaction_id is unique per shop — CreateTransaction retries can never create a duplicate row', () => {
  assert.match(migration039, /state smallint not null default 1\s*\n\s*check \(state in \(1, 2, -1, -2\)\)/);
  assert.match(migration039, /unique \(shop_id, payme_transaction_id\)/);
});

test('uzum_transactions.uzum_order_id is unique per shop and state is a closed enum matching Uzum Checkout\'s documented status model', () => {
  assert.match(migration039, /check \(state in \('REGISTERED', 'COMPLETED', 'DECLINED', 'REFUNDED'\)\)/);
  assert.match(migration039, /unique \(shop_id, uzum_order_id\)/);
});

// ---------------------------------------------------------------------------
// config.toml — public webhooks, verify_jwt disabled (matches click-webhook).
// ---------------------------------------------------------------------------

test('payme-webhook and uzum-webhook are both registered with verify_jwt = false (public endpoints, auth is handled inside each handler)', () => {
  assert.match(configToml, /\[functions\.payme-webhook\]\s*\nverify_jwt = false/);
  assert.match(configToml, /\[functions\.uzum-webhook\]\s*\nverify_jwt = false/);
});

// ---------------------------------------------------------------------------
// payme-webhook/index.ts — JSON-RPC method handling, static analysis.
// ---------------------------------------------------------------------------

test('payme-webhook identifies the shop by scanning CONNECTED payme_connections and verifying Basic Auth per row (Payme sends no shop identifier in the request itself, unlike Click\'s service_id)', () => {
  assert.match(paymeWebhook, /db\.from\("payme_connections"\)\s*\n\s*\.select\("shop_id,login,password_ciphertext,password_iv"\)\.eq\("status", "CONNECTED"\)/);
  assert.match(paymeWebhook, /verifyPaymeBasicAuth\(authHeader, conn\.login \|\| "", password\)/);
});

test('payme-webhook CheckPerformTransaction and CreateTransaction both re-verify the order exists, is NEW, and the amount (in tiyin) exactly matches payable_total*100 — never trusts Payme\'s amount blindly', () => {
  const checkBlock = paymeWebhook.slice(paymeWebhook.indexOf('method === "CheckPerformTransaction"'), paymeWebhook.indexOf('method === "CreateTransaction"'));
  assert.match(checkBlock, /Math\.round\(Number\(order\.payable_total\) \* 100\)/);
  assert.match(checkBlock, /amountTiyin !== expectedTiyin/);
  const createBlock = paymeWebhook.slice(paymeWebhook.indexOf('method === "CreateTransaction"'), paymeWebhook.indexOf('method === "PerformTransaction"'));
  assert.match(createBlock, /order\.status !== "NEW"/);
  assert.match(createBlock, /amountTiyin !== expectedTiyin/);
});

test('payme-webhook CreateTransaction is idempotent per payme_transaction_id (a retried request with a lost response returns the SAME stored state instead of creating a duplicate row)', () => {
  const block = paymeWebhook.slice(paymeWebhook.indexOf('method === "CreateTransaction"'), paymeWebhook.indexOf('method === "PerformTransaction"'));
  assert.match(block, /if \(existing\) \{/);
});

test('payme-webhook performs payment through the atomic DB trigger, and CancelTransaction refuses (-31007) after fulfilment', () => {
  const performBlock = paymeWebhook.slice(paymeWebhook.indexOf('method === "PerformTransaction"'), paymeWebhook.indexOf('method === "CancelTransaction"'));
  assert.match(performBlock, /update\(\{ state: 2, perform_time: performTime \}\)/);
  assert.doesNotMatch(performBlock, /p_requester_tg_id|p_is_admin/);
  assert.match(commerceHardening, /create or replace function public\.ustore_apply_payme_payment\(\)/);
  const cancelBlock = paymeWebhook.slice(paymeWebhook.indexOf('method === "CancelTransaction"'), paymeWebhook.indexOf('method === "CheckTransaction"'));
  assert.match(cancelBlock, /PAYME_ERROR\.ORDER_ALREADY_DONE/);
});

// ---------------------------------------------------------------------------
// uzum-webhook/index.ts — callback handling, static analysis.
// ---------------------------------------------------------------------------

test('uzum-webhook looks up the transaction by the orderId Uzum itself returned at registration (an unguessable UUID we generated the row for), and cross-checks the callback\'s orderNumber against our stored order_id before trusting it — the documented callback contract carries no signature, so this is the defensive substitute', () => {
  assert.match(uzumWebhook, /db\.from\("uzum_transactions"\)\.select\("\*"\)\.eq\("uzum_order_id", orderId\)\.maybeSingle\(\);/);
  assert.match(uzumWebhook, /if \(String\(txn\.order_id\) !== orderNumber\)/);
});

test('uzum-webhook is idempotent: a retried callback for an already-final transaction (state !== REGISTERED) is acknowledged with errorCode 0 without re-applying status changes (Uzum retries up to 5 times per docs)', () => {
  assert.match(uzumWebhook, /if \(txn\.state !== "REGISTERED"\) return json\(\{ errorCode: 0, message: "already processed" \}\);/);
});

test('uzum-webhook only transitions to PROCESSING on operationState === "SUCCESS"; any other state marks the transaction DECLINED and cancels the order — never assumes success by default', () => {
  assert.match(uzumWebhook, /if \(operationState === "SUCCESS"\) \{/);
  assert.match(uzumWebhook, /state: "DECLINED"/);
});

test('uzumRegisterPayment omits the optional cart object (matches Click\'s skip_ofd / Payme\'s no-detail-object approach — auto-fiscalization stays opt-in, configured separately with Uzum) and validates the response shape defensively instead of assuming exact field names', () => {
  assert.doesNotMatch(uzumClient, /cart:/);
  assert.match(uzumClient, /uzum_register_unexpected_response_shape/);
});

// ---------------------------------------------------------------------------
// shop-api wiring — access gates, payment methods, create_order branches.
// ---------------------------------------------------------------------------

test('requirePaymeAccessGranted/requireUzumAccessGranted exist and gate on ctx.paymeAccessGranted/ctx.uzumAccessGranted — same pattern as requireClickAccessGranted', () => {
  assert.match(shopApi, /function requirePaymeAccessGranted\(\) \{ if \(!ctx\.paymeAccessGranted\) throw new Error\("forbidden:payme_not_granted"\); \}/);
  assert.match(shopApi, /function requireUzumAccessGranted\(\) \{ if \(!ctx\.uzumAccessGranted\) throw new Error\("forbidden:uzum_not_granted"\); \}/);
});

test('resolveShopContext selects payme_access_granted/uzum_access_granted from shops and threads them into ctx, and boot() exposes both flags to the frontend', () => {
  assert.match(shopApi, /select\("id,status,billz_access_granted,click_access_granted,payme_access_granted,uzum_access_granted"\)/);
  assert.match(shopApi, /paymeAccessGranted: shopRow\.payme_access_granted === true,/);
  assert.match(shopApi, /uzumAccessGranted: shopRow\.uzum_access_granted === true,/);
  assert.match(shopApi, /paymeAccessGranted: ctx\.paymeAccessGranted,/);
  assert.match(shopApi, /uzumAccessGranted: ctx\.uzumAccessGranted,/);
});

test('payme_connect/uzum_connect require integrations.manage + the platform access gate, never log the password/API key back, and uzum_connect actually verifies the credentials with a live call before saving (payme_connect cannot — Payme has no "test request" mechanism, matching Click\'s same documented limitation)', () => {
  const paymeConnectBlock = shopApi.slice(shopApi.indexOf('case "payme_connect"'), shopApi.indexOf('case "payme_disconnect"'));
  assert.match(paymeConnectBlock, /requirePermission\('integrations\.manage'\)/);
  assert.match(paymeConnectBlock, /requirePaymeAccessGranted\(\)/);
  assert.doesNotMatch(paymeConnectBlock, /return json\(\{[^}]*password/, 'password must never be echoed back in the response');
  const uzumConnectBlock = shopApi.slice(shopApi.indexOf('case "uzum_connect"'), shopApi.indexOf('case "uzum_disconnect"'));
  assert.match(uzumConnectBlock, /uzumVerifyCredentials\(\{ terminalId, apiKey \}\)/);
  assert.match(uzumConnectBlock, /if \(!verified\) return json\(\{ error: "uzum_credentials_invalid" \}, 400\);/);
});

test('create_order resolves PAYME/UZUM credentials and re-checks the platform access gate BEFORE any stock is decremented (payMethod checks happen before rpcItems is built) — same ordering Click uses to avoid an unpayable order silently reserving inventory', () => {
  const start = shopApi.indexOf('const payMethod = paymentSnapshot.methodId;');
  const rpcItemsIdx = shopApi.indexOf('const rpcItems = items.map(', start);
  const block = shopApi.slice(start, rpcItemsIdx);
  assert.match(block, /if \(payMethod === "PAYME"\)/);
  assert.match(block, /if \(!ctx\.paymeAccessGranted\) return json\(\{ error: "payme_not_available" \}, 400\);/);
  assert.match(block, /if \(payMethod === "UZUM"\)/);
  assert.match(block, /if \(!ctx\.uzumAccessGranted\) return json\(\{ error: "uzum_not_available" \}, 400\);/);
});

test('create_order: PAYME builds a checkout URL with NO outbound network call (pure computation, cannot fail), while UZUM calls uzumRegisterPayment and rolls the order back to CANCELLED on failure — same money-safety pattern as Click\'s invoice call', () => {
  const paymeBlock = shopApi.slice(shopApi.indexOf('if (paymeCreds) {'), shopApi.indexOf('if (uzumCreds) {'));
  assert.match(paymeBlock, /buildPaymeCheckoutUrl\(/);
  assert.doesNotMatch(paymeBlock, /await fetch|catch/, 'Payme checkout URL construction must not make a network call or need error handling');
  const uzumBlock = shopApi.slice(shopApi.indexOf('if (uzumCreds) {'), shopApi.indexOf('const shipment = {'));
  assert.match(uzumBlock, /await uzumRegisterPayment\(uzumCreds/);
  assert.match(uzumBlock, /p_new_status: "CANCELLED".*Uzum to'lov so'rovi yaratilmadi/s);
  assert.match(uzumBlock, /return json\(\{ error: "uzum_register_failed" \}, 400\);/);
});

test('resolvePaymentSnapshot assigns PAYME/UZUM their own distinct receiptStatus (AWAITING_PAYME_PAYMENT/AWAITING_UZUM_PAYMENT) so no receipt upload is ever requested for these auto-confirmed methods', () => {
  const block = shopApi.slice(shopApi.indexOf('function resolvePaymentSnapshot'), shopApi.indexOf('function resolvePaymentSnapshot') + 2500);
  assert.match(block, /method\.id === "PAYME" \? "AWAITING_PAYME_PAYMENT"/);
  assert.match(block, /method\.id === "UZUM" \? "AWAITING_UZUM_PAYMENT"/);
});

test('the fulfillment config save path (updateFulfillmentConfig-style action) re-checks both PAYME and UZUM access gates before persisting an enabled method — an admin cannot flip the toggle on without the platform grant, mirroring CLICK', () => {
  const block = shopApi.slice(shopApi.indexOf('const clickMethod = clean.payments.methods'), shopApi.indexOf('const clickMethod = clean.payments.methods') + 600);
  assert.match(block, /const paymeMethod = clean\.payments\.methods\.find\(\(m: any\) => m\.id === "PAYME"\);/);
  assert.match(block, /if \(paymeMethod\?\.enabled\) requirePaymeAccessGranted\(\);/);
  assert.match(block, /const uzumMethod = clean\.payments\.methods\.find\(\(m: any\) => m\.id === "UZUM"\);/);
  assert.match(block, /if \(uzumMethod\?\.enabled\) requireUzumAccessGranted\(\);/);
});

// ---------------------------------------------------------------------------
// platform-api — access grant actions, same shape as platform_set_click_access.
// ---------------------------------------------------------------------------

test('platform_set_payme_access and platform_set_uzum_access both require requirePlatformSuperAdmin() and platform_list_shops exposes both new flags', () => {
  const paymeBlock = platformApi.slice(platformApi.indexOf('case "platform_set_payme_access"'), platformApi.indexOf('case "platform_set_uzum_access"'));
  assert.match(paymeBlock, /requirePlatformSuperAdmin\(\);/);
  const uzumBlock = platformApi.slice(platformApi.indexOf('case "platform_set_uzum_access"'), platformApi.indexOf('case "platform_set_uzum_access"') + 500);
  assert.match(uzumBlock, /requirePlatformSuperAdmin\(\);/);
  assert.match(platformApi, /paymeAccessGranted: s\.payme_access_granted === true,/);
  assert.match(platformApi, /uzumAccessGranted: s\.uzum_access_granted === true,/);
});

// ---------------------------------------------------------------------------
// Frontend — settings modals, payment method gating, checkout redirect flow.
// ---------------------------------------------------------------------------

test('PAYME provider row is hidden from the "Ekvayring orqali" menu unless the platform has granted access, same gating pattern as CLICK; UZUM never appears there at all (admin-UI exclusion, per explicit user decision)', () => {
  const fnStart = shopAppJs.indexOf('function renderAcquiringMenuHtml()');
  const fnBlock = shopAppJs.slice(fnStart, shopAppJs.indexOf('\n    }', fnStart) + 6);
  assert.match(fnBlock, /paymeAccessGranted \? \{ id: 'PAYME', label: 'Payme' \} : null/);
  assert.doesNotMatch(fnBlock, /id: 'UZUM'/, 'Ekvayring orqali menu must only ever offer Click/Payme, never Uzum');
});

test('Payme credentials only open via a paymentsPageView page (never logging password back), and the untouched UZUM_SETTINGS modal (still admin-unreachable, see task 3 lock-in test) also never logs its API key back', () => {
  assert.match(shopAppJs, /paymentsPageView = 'ACQUIRING_PAYME'/);
  assert.doesNotMatch(shopAppJs, /activePopupModal === 'PAYME_SETTINGS'/, 'the old standalone modal must be fully retired, not left as dead/duplicate code');
  assert.match(shopAppJs, /activePopupModal === 'UZUM_SETTINGS'/);
  assert.doesNotMatch(shopAppJs, /paymeConnectionStatus\.password/);
  assert.doesNotMatch(shopAppJs, /uzumConnectionStatus\.apiKey/);
});

test('after create_order succeeds with PAYME or UZUM, the frontend redirects the customer via openSafeExternalUrl to the checkout/payment URL returned in the order\'s payment snapshot — unlike CLICK, which only waits for a push notification with no redirect needed', () => {
  const block = shopAppJs.slice(shopAppJs.indexOf('function openOrderSuccessCelebration'), shopAppJs.indexOf('function openOrderSuccessCelebration') + 2000);
  assert.match(block, /openSafeExternalUrl\('\$\{escapeHtml\(payUrl\)\}'\)/);
  assert.match(shopAppJs, /newOrder\.payment\?\.paymeCheckoutUrl/);
  assert.match(shopAppJs, /newOrder\.payment\?\.uzumPaymentUrl/);
});

test('ustore-commerce.js (frontend default-config mirror) and shop-api\'s sanitizeFulfillmentConfig both know about the PAYME/UZUM payment method ids — client/server defaults cannot silently drift apart, same invariant as CLICK\'s existing test', () => {
  assert.match(commerceJs, /PAYMENT_IDS = Object\.freeze\(\['CASH', 'CARD', 'QR', 'CLICK', 'PAYME', 'UZUM'\]\)/);
  assert.match(shopApi, /\["CASH", "CARD", "QR", "CLICK", "PAYME", "UZUM"\]\.map/);
});

test('platform-app.js Shop Details has PAYME/UZUM ruxsat toggles wired to platform_set_payme_access/platform_set_uzum_access, mirroring the existing Click toggle (same billz-toggle-btn CSS class, no new styling needed)', () => {
  // 2026-08-28: integratsiya UX birlashtirish (4-band, Billz/Click/Payme/Uzum
  // qatorlari renderIntegrationRow() umumiy helper'iga ko'chirildi) — onclick
  // endi to'g'ridan-to'g'ri attribut ichida emas, helper'ga uzatiladigan
  // backtick-satr sifatida yozilgan, lekin xulq-atvor (togglePaymeAccess/
  // toggleUzumAccess, s.id + teskari flag bilan) bir xil qolgan.
  assert.match(platformAppJs, /togglePaymeAccess\('\$\{s\.id\}', \$\{!s\.paymeAccessGranted\}\)/);
  assert.match(platformAppJs, /toggleUzumAccess\('\$\{s\.id\}', \$\{!s\.uzumAccessGranted\}\)/);
  assert.match(platformAppJs, /window\.togglePaymeAccess = togglePaymeAccess;/);
  assert.match(platformAppJs, /window\.toggleUzumAccess = toggleUzumAccess;/);
  assert.match(platformAppJs, /class="billz-toggle-btn status-pill \$\{accessGranted \? 'status-ACTIVE' : ''\}"/, 'the unified renderIntegrationRow() helper must still reuse the same billz-toggle-btn CSS class, no new styling needed');
});
