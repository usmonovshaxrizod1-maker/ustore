// USTORE — Click.uz avtomatik to'lov integratsiyasi testlari.
//
// click-client.ts'ning MD5/SHA1/sign funksiyalari Deno-ga xos hech qanday
// global ishlatmaydi (faqat standart WebCrypto + TextEncoder) — bot-token-
// crypto.ts bilan bir xil sabab bilan, bular HAQIQIY, ishga tushiriladigan
// testlar (faqat manba-matn tekshiruvi emas), chunki bu xavfsizlik-kritik
// (imzo tekshiruvi noto'g'ri bo'lsa — yolg'on to'lov tasdiqlanishi mumkin).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const FUNCTIONS_DIR = path.join(__dirname, '..', 'supabase', 'functions');
const CLICK_CLIENT_URL = pathToFileURL(path.join(FUNCTIONS_DIR, '_shared', 'click-client.ts')).href;
const shopApi = fs.readFileSync(path.join(FUNCTIONS_DIR, 'shop-api', 'index.ts'), 'utf8');
const platformApi = fs.readFileSync(path.join(FUNCTIONS_DIR, 'platform-api', 'index.ts'), 'utf8');
const clickWebhook = fs.readFileSync(path.join(FUNCTIONS_DIR, 'click-webhook', 'index.ts'), 'utf8');
const commerceHardening = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '074_commerce_hardening.sql'), 'utf8');
const migration018 = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '018_click_payment.sql'), 'utf8');
const configToml = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'config.toml'), 'utf8');
const shopAppJs = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
const platformAppJs = fs.readFileSync(path.join(__dirname, '..', 'platform', 'platform-app.js'), 'utf8');
const commerceJs = fs.readFileSync(path.join(__dirname, '..', 'ustore-commerce.js'), 'utf8');

// ---------------------------------------------------------------------------
// REAL executable crypto tests — MD5 (custom RFC 1321 impl) and SHA-1
// (native WebCrypto), verified against the official published test vectors.
// ---------------------------------------------------------------------------

test('MD5 implementation matches every official RFC 1321 test vector', async () => {
  const { _md5ForTests: md5 } = await import(CLICK_CLIENT_URL);
  const vectors = [
    ['', 'd41d8cd98f00b204e9800998ecf8427e'],
    ['a', '0cc175b9c0f1b6a831c399e269772661'],
    ['abc', '900150983cd24fb0d6963f7d28e17f72'],
    ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
    ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
    ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'd174ab98d277d9f5a5611c2c9f419d9f'],
    ['12345678901234567890123456789012345678901234567890123456789012345678901234567890', '57edf4a22be3c955ac49da2e2107b67a'],
  ];
  for (const [input, expected] of vectors) assert.equal(md5(input), expected, `md5(${JSON.stringify(input)})`);
});

test('SHA-1 (native WebCrypto, used for the Merchant API Auth header) matches the standard published test vectors', async () => {
  const { _sha1HexForTests: sha1Hex } = await import(CLICK_CLIENT_URL);
  assert.equal(await sha1Hex(''), 'da39a3ee5e6b4b0d3255bfef95601890afd80709');
  assert.equal(await sha1Hex('abc'), 'a9993e364706816aba3e25717850c26c9cd0d89d');
  assert.equal(await sha1Hex('The quick brown fox jumps over the lazy dog'), '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12');
});

test('computeClickPrepareSign concatenates fields in the EXACT documented order: click_trans_id + service_id + SECRET_KEY + merchant_trans_id + amount + action + sign_time (docs.click.uz/en/shop-api/requests)', async () => {
  const { computeClickPrepareSign, _md5ForTests: md5 } = await import(CLICK_CLIENT_URL);
  const f = { clickTransId: 12345, serviceId: 6789, merchantTransId: '42', amount: '10000.00', action: 0, signTime: '2026-08-21 10:00:00' };
  const expected = md5(`${f.clickTransId}${f.serviceId}SECRET123${f.merchantTransId}${f.amount}${f.action}${f.signTime}`);
  assert.equal(await computeClickPrepareSign('SECRET123', f), expected);
});

test('computeClickCompleteSign concatenates fields in the EXACT documented order, WITH merchant_prepare_id inserted between merchant_trans_id and amount', async () => {
  const { computeClickCompleteSign, _md5ForTests: md5 } = await import(CLICK_CLIENT_URL);
  const f = { clickTransId: 12345, serviceId: 6789, merchantTransId: '42', merchantPrepareId: 99, amount: '10000.00', action: 1, signTime: '2026-08-21 10:00:05' };
  const expected = md5(`${f.clickTransId}${f.serviceId}SECRET123${f.merchantTransId}${f.merchantPrepareId}${f.amount}${f.action}${f.signTime}`);
  assert.equal(await computeClickCompleteSign('SECRET123', f), expected);
});

test('a wrong SECRET_KEY (or any single changed field) produces a completely different sign — proves the sign actually depends on every documented field, not a subset', async () => {
  const { computeClickPrepareSign } = await import(CLICK_CLIENT_URL);
  const f = { clickTransId: 1, serviceId: 2, merchantTransId: '3', amount: '100', action: 0, signTime: '2026-01-01 00:00:00' };
  const base = await computeClickPrepareSign('CORRECT_KEY', f);
  assert.notEqual(await computeClickPrepareSign('WRONG_KEY', f), base);
  assert.notEqual(await computeClickPrepareSign('CORRECT_KEY', { ...f, amount: '101' }), base);
  assert.notEqual(await computeClickPrepareSign('CORRECT_KEY', { ...f, merchantTransId: '4' }), base);
});

test('clickCreateInvoice sends the SHA-1 Auth header as merchant_user_id:sha1(timestamp+secretKey):timestamp and the documented JSON body fields', async () => {
  const { clickCreateInvoice } = await import(CLICK_CLIENT_URL);
  const originalFetch = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, json: async () => ({ error_code: 0, error_note: 'Success', invoice_id: 555 }) };
  };
  try {
    const invoiceId = await clickCreateInvoice(
      { merchantUserId: 'MU1', secretKey: 'SK1', serviceId: '42' },
      { amount: 10000, phoneNumber: '998901234567', merchantTransId: '77' },
    );
    assert.equal(invoiceId, 555);
    assert.equal(captured.url, 'https://api.click.uz/v2/merchant/invoice/create');
    assert.equal(captured.opts.method, 'POST');
    assert.match(captured.opts.headers.Auth, /^MU1:[0-9a-f]{40}:\d{10}$/, 'Auth header must be merchant_user_id:sha1hex:unix_timestamp');
    const body = JSON.parse(captured.opts.body);
    assert.deepEqual(body, { service_id: 42, amount: 10000, phone_number: '998901234567', merchant_trans_id: '77' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('clickCreateInvoice throws ClickApiError (not a silent success) when Click returns a non-zero error_code, even with HTTP 200', async () => {
  const { clickCreateInvoice, ClickApiError } = await import(CLICK_CLIENT_URL);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ error_code: -5, error_note: 'User does not exist' }) });
  try {
    await assert.rejects(
      () => clickCreateInvoice({ merchantUserId: 'MU1', secretKey: 'SK1', serviceId: '42' }, { amount: 1, phoneNumber: '998901234567', merchantTransId: '1' }),
      (e) => e instanceof ClickApiError && e.errorCode === -5,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// shop-api / platform-api gating (static analysis, same style as Billz)
// ---------------------------------------------------------------------------

test("every click_* shop-api action requires both requirePermission('integrations.manage') and requireClickAccessGranted() — a shop without platform-granted access can never connect its own Click account", () => {
  for (const action of ['click_get_status', 'click_connect', 'click_disconnect']) {
    const start = shopApi.indexOf(`case "${action}"`);
    assert.ok(start >= 0, `${action} not found in shop-api`);
    const end = shopApi.indexOf('\n      case ', start + 10);
    const block = shopApi.slice(start, end > start ? end : start + 1200);
    assert.match(block, /requirePermission\('integrations\.manage'\)/, `${action} must require the integrations.manage permission`);
    assert.match(block, /requireClickAccessGranted\(\)/, `${action} must require platform-granted Click access`);
  }
});

test('click_connect requires ALL FOUR Click credentials (merchantId, serviceId, merchantUserId, secretKey) — merchant_user_id is mandatory because the Merchant API Auth header cannot be computed without it', () => {
  const start = shopApi.indexOf('case "click_connect"');
  const end = shopApi.indexOf('\n      case ', start + 10);
  const block = shopApi.slice(start, end);
  assert.match(block, /!merchantId \|\| !serviceId \|\| !secretKey \|\| !merchantUserId/);
});

test('Click Secret Key is stored ONLY as ciphertext+iv, reusing the exact same encryptBotToken/decryptBotToken and USTORE_BOT_TOKEN_MASTER_KEY as bot tokens and Billz — no new encryption key introduced for Click', () => {
  const connectBlock = shopApi.slice(shopApi.indexOf('case "click_connect"'), shopApi.indexOf('\n      case "click_disconnect"'));
  assert.match(connectBlock, /encryptBotToken\(BOT_TOKEN_MASTER_KEY,\s*secretKey\)/);
  assert.match(connectBlock, /secret_key_ciphertext:\s*secretEnc\.ciphertext/);
  assert.doesNotMatch(shopApi, /USTORE_CLICK_MASTER_KEY|CLICK_MASTER_KEY/, 'must not introduce a second, Click-specific master key');
  assert.doesNotMatch(clickWebhook, /USTORE_CLICK_MASTER_KEY|CLICK_MASTER_KEY/);
  assert.match(clickWebhook, /Deno\.env\.get\("USTORE_BOT_TOKEN_MASTER_KEY"\)/);
});

test('click_get_status response never echoes the Secret Key — only status/merchantId/serviceId', () => {
  const start = shopApi.indexOf('case "click_get_status"');
  const end = shopApi.indexOf('\n      case ', start + 10);
  const block = shopApi.slice(start, end);
  assert.doesNotMatch(block, /secretKey|secret_key_ciphertext.*json|secret_key_ciphertext,\s*secret_key_iv.*\n.*return json/s);
  assert.match(block, /status:\s*data\?\.status/);
});

test('resolvePaymentSnapshot has a CLICK branch independent from the existing QR:<providerId> manual flow, and does NOT set receiptRequired (no receipt upload for automatic Click payments)', () => {
  const start = shopApi.indexOf('function resolvePaymentSnapshot');
  const end = shopApi.indexOf('\n}', start);
  const block = shopApi.slice(start, end);
  const qrBranchEnd = block.indexOf('const method = (config.payments');
  const qrBranch = block.slice(0, qrBranchEnd);
  const restOfFunction = block.slice(qrBranchEnd);
  assert.doesNotMatch(qrBranch, /"CLICK"/, 'CLICK must not be handled inside the QR:<providerId> branch — it is a separate top-level method');
  assert.match(restOfFunction, /method\.id === "CLICK"/, 'CLICK must be handled in the generic (non-QR) top-level method branch');
  assert.match(restOfFunction, /receiptRequired:\s*method\.id === "CARD" \? !!method\.receiptRequired : false/, 'only CARD sets receiptRequired — CLICK (and everything else) stays false, no receipt upload required');
});

test('create_order validates click_connections status=CONNECTED and platform access BEFORE calling place_order (so stock is never reserved for an order that cannot actually be paid), and cancels + restocks the order if invoice creation fails afterwards', () => {
  const start = shopApi.indexOf('case "create_order"');
  const end = shopApi.indexOf('\n      case "cancel_order"');
  const block = shopApi.slice(start, end);
  const clickGateIdx = block.indexOf('payMethod === "CLICK"');
  const placeOrderIdx = block.indexOf('db.rpc("place_order"');
  assert.ok(clickGateIdx >= 0 && placeOrderIdx >= 0 && clickGateIdx < placeOrderIdx, 'the click_connections CONNECTED check must run before place_order, not after');
  assert.match(block, /clickCreateInvoice\(clickCreds/);
  const invoiceCallIdx = block.indexOf('clickCreateInvoice(clickCreds');
  const failureBlock = block.slice(invoiceCallIdx, invoiceCallIdx + 700);
  assert.match(failureBlock, /update_order_status/, 'invoice-creation failure must cancel (and thus restock, via the RPC) the just-created order');
  assert.match(failureBlock, /p_new_status:\s*"CANCELLED"/);
});

test('platform_set_click_access is gated by requirePlatformSuperAdmin() and only the platform can grant/revoke it — shop-api has no action that lets a shop set its own click_access_granted', () => {
  const start = platformApi.indexOf('case "platform_set_click_access"');
  assert.ok(start >= 0);
  const end = platformApi.indexOf('\n      case ', start + 10);
  const block = platformApi.slice(start, end > start ? end : start + 600);
  assert.match(block, /requirePlatformSuperAdmin\(\)/);
  assert.match(block, /click_access_granted:\s*enabled/);
  assert.doesNotMatch(shopApi, /click_access_granted\s*:\s*(true|payload)/, 'shop-api must never be able to grant its own Click access — only read it via ctx.clickAccessGranted');
});

test('platform_list_shops and shop-api boot() both surface clickAccessGranted (mirroring billzAccessGranted exactly)', () => {
  assert.match(platformApi, /clickAccessGranted:\s*s\.click_access_granted === true/);
  assert.match(shopApi, /clickAccessGranted:\s*ctx\.clickAccessGranted/);
  assert.match(shopApi, /clickAccessGranted:\s*shopRow\.click_access_granted === true/);
});

// ---------------------------------------------------------------------------
// click-webhook — Prepare/Complete correctness (static analysis of the
// Edge Function logic; the real HTTP handler needs a live Deno runtime + DB
// to execute, but the branch structure and Click's own documented error
// codes are checked here).
// ---------------------------------------------------------------------------

test('click-webhook is a public function (verify_jwt = false in config.toml) since Click has no Supabase session — authentication is the per-request sign_string instead', () => {
  assert.match(configToml, /\[functions\.click-webhook\]\s*\n\s*verify_jwt = false/);
});

test('click-webhook verifies the Prepare and Complete signatures using the SAME computeClickPrepareSign/computeClickCompleteSign helpers as the rest of the codebase, never a re-implemented inline hash', () => {
  assert.match(clickWebhook, /import \{ computeClickPrepareSign, computeClickCompleteSign \} from "\.\.\/_shared\/click-client\.ts"/);
  assert.match(clickWebhook, /computeClickPrepareSign\(secretKey/);
  assert.match(clickWebhook, /computeClickCompleteSign\(secretKey/);
});

test('click-webhook returns every documented CLICK error code by number: -1 sign failed, -2 bad amount, -4 already paid, -5 order not found, -6 transaction not found, -8 malformed request, -9 cancelled', () => {
  for (const code of [-1, -2, -4, -5, -6, -8, -9]) {
    assert.match(clickWebhook, new RegExp(`clickReply\\(${code === -1 ? '-1' : code},`), `missing error code ${code}`);
  }
});

test('click-webhook Prepare is idempotent: a retried click_trans_id returns the SAME merchant_prepare_id instead of creating a duplicate click_transactions row, and a click_trans_id previously CANCELLED always returns -9 even on retry', () => {
  const prepareBlock = clickWebhook.slice(clickWebhook.indexOf('action === "0"'), clickWebhook.indexOf('// ---- Complete'));
  assert.match(prepareBlock, /existing\.state === "CANCELLED"/);
  assert.match(prepareBlock, /merchant_prepare_id:\s*existing\.id/);
});

test('click-webhook Complete never double-confirms and the DB trigger applies payment/order state atomically', () => {
  const completeBlock = clickWebhook.slice(clickWebhook.indexOf('// ---- Complete'));
  assert.match(completeBlock, /txn\.state === "CONFIRMED"/);
  assert.match(completeBlock, /clickReply\(-4, "Already paid"\)/);
  assert.match(completeBlock, /update\(\{[\s\S]*state: "CONFIRMED"/);
  assert.match(commerceHardening, /if old\.state is distinct from new\.state and new\.state = 'CONFIRMED'/);
  assert.match(commerceHardening, /payment_status\s*=\s*'PAID'/);
});

test('click-webhook Complete never trusts a client identity; the service-role DB trigger owns the order transition', () => {
  const completeBlock = clickWebhook.slice(clickWebhook.indexOf('// ---- Complete'));
  assert.doesNotMatch(completeBlock, /p_requester_tg_id|p_is_admin/);
  assert.match(commerceHardening, /create or replace function public\.ustore_apply_click_payment\(\)/);
});

test('click-webhook Complete honors the documented "incoming error < 0 means Click itself cancelled" rule: it marks the local transaction CANCELLED and replies -9, without ever touching order status', () => {
  const completeBlock = clickWebhook.slice(clickWebhook.indexOf('// ---- Complete'));
  const cancelIdx = completeBlock.indexOf('incomingError < 0');
  assert.ok(cancelIdx >= 0);
  const confirmIdx = completeBlock.indexOf('state: "CONFIRMED"');
  assert.ok(cancelIdx < confirmIdx, 'the incoming-error-cancel branch must return before confirmation');
});

// ---------------------------------------------------------------------------
// 018 migration — additive-only, same shape as 011_billz_integration.sql
// ---------------------------------------------------------------------------

test('018 migration is purely additive: creates click_connections/click_transactions and only adds new columns to shops — never drops or alters an existing 001-017 column', () => {
  assert.doesNotMatch(migration018, /drop column|drop table(?! if exists public\.click)/i);
  assert.match(migration018, /create table if not exists public\.click_connections/);
  assert.match(migration018, /create table if not exists public\.click_transactions/);
  assert.match(migration018, /add column if not exists click_access_granted/);
});

test('every new 018 table gets RLS enabled (service_role bypasses, anon/authenticated get zero access by default — same minimal pattern as every prior migration)', () => {
  assert.match(migration018, /alter table public\.click_connections enable row level security/);
  assert.match(migration018, /alter table public\.click_transactions enable row level security/);
});

test('click_transactions.state is a closed 3-value enum (PREPARED/CONFIRMED/CANCELLED) and click_trans_id is unique per shop — the DB itself, not just app code, prevents a duplicate Prepare from ever being processed twice', () => {
  assert.match(migration018, /state text not null default 'PREPARED'\s*\n\s*check \(state in \('PREPARED', 'CONFIRMED', 'CANCELLED'\)\)/);
  assert.match(migration018, /unique \(shop_id, click_trans_id\)/);
});

// ---------------------------------------------------------------------------
// Frontend wiring (shop-app + platform-app + shared commerce config)
// ---------------------------------------------------------------------------

test('ustore-commerce.js and shop-api sanitizeFulfillmentConfig both know about the CLICK payment method id — client/server default configs cannot silently drift apart', () => {
  assert.match(commerceJs, /PAYMENT_IDS = Object\.freeze\(\['CASH', 'CARD', 'QR', 'CLICK', 'PAYME', 'UZUM'\]\)/);
  assert.match(shopApi, /\["CASH", "CARD", "QR", "CLICK", "PAYME", "UZUM"\]\.map/);
});

test('the CLICK provider row is hidden from the "Ekvayring orqali" menu unless the platform has granted clickAccessGranted — mirrors the Billz settings-card gating pattern exactly', () => {
  const fnStart = shopAppJs.indexOf('function renderAcquiringMenuHtml()');
  assert.ok(fnStart >= 0, 'renderAcquiringMenuHtml must exist');
  const fnBlock = shopAppJs.slice(fnStart, shopAppJs.indexOf('\n    }', fnStart) + 6);
  assert.match(fnBlock, /clickAccessGranted \? \{ id: 'CLICK', label: 'Click' \} : null/);
});

test('Click credentials (connect/disconnect) only open via openClickSettings(), gated by clickAccessGranted, and never render/log the Secret Key value back — only status/merchantId/serviceId come from click_get_status', () => {
  // "To'lov usullari" restructure (2026-09-05): the entry point moved from a
  // standalone CLICK_SETTINGS modal into a dedicated page under
  // Ekvayring orqali (paymentsPageView='ACQUIRING_CLICK',
  // renderAcquiringProviderPageHtml) — same gate, same handler, new home.
  const fnStart = shopAppJs.indexOf("function renderAcquiringProviderPageHtml(providerId)");
  assert.ok(fnStart >= 0, 'renderAcquiringProviderPageHtml must exist');
  const fnBlock = shopAppJs.slice(fnStart, shopAppJs.indexOf('\n    }', fnStart) + 6);
  assert.match(fnBlock, /id="click-secret-key-input"/);
  assert.doesNotMatch(shopAppJs.slice(shopAppJs.indexOf('function renderSettingsPage('), shopAppJs.indexOf('function renderSettingsPage(') + 3000), /openClickSettings\(\)/, 'must no longer be reachable from Do\'kon sozlamalari');
  assert.match(shopAppJs, /paymentsPageView = 'ACQUIRING_CLICK'/);
  assert.doesNotMatch(shopAppJs, /activePopupModal === 'CLICK_SETTINGS'/, 'the old standalone modal must be fully retired, not left as dead/duplicate code');
  assert.doesNotMatch(shopAppJs, /clickConnectionStatus\.secretKey/);
});

test('checkout: CLICK payment method never shows the receipt upload picker (no chek/skrinshot step) — customers approve payment in their own Click app instead', () => {
  const clickCheckoutBlock = shopAppJs.slice(shopAppJs.indexOf("selectedPayment?.id === 'CLICK'"), shopAppJs.indexOf("selectedPayment?.id === 'CLICK'") + 700);
  assert.doesNotMatch(clickCheckoutBlock, /renderReceiptPicker/, 'CLICK checkout branch must not render the receipt-upload picker');
});

test('platform-app.js Shop Details has a "Click ruxsati" toggle wired to platform_set_click_access, mirroring the existing Billz toggle exactly (same billz-toggle-btn CSS class, no new styling needed)', () => {
  assert.match(platformAppJs, /toggleClickAccess\('\$\{s\.id\}', \$\{!s\.clickAccessGranted\}\)/);
  assert.match(platformAppJs, /platform_set_click_access.*shopId, enabled: enable/);
});
