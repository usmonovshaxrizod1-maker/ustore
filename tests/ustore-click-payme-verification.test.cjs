// 048-band: Click/Payme avtomatik to'lov — do'kon admin ulagandan keyin,
// xaridorlarga (shop-app userlariga) ko'rinishidan OLDIN 3 marta REAL
// tasdiqlangan sinov to'lovi talab qilinadi. Bu fayl shu xavfsizlik
// invariantlarini statik tahlil bilan tekshiradi: (1) sinov to'lovlari
// HAQIQIY buyurtma/click_transactions/payme_transactions'ga UMUMAN
// tegmaydi, (2) xaridorga ko'rinadigan fulfillmentConfig faqat verified
// bo'lganda CLICK/PAYME'ni yoqiq qoldiradi, (3) create_order serverda
// mustaqil ravishda verified'ni qayta tekshiradi (frontend filtri yolg'iz
// ishonch manbai emas).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const api = fs.readFileSync(path.join(root, 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
const clickWebhook = fs.readFileSync(path.join(root, 'supabase', 'functions', 'click-webhook', 'index.ts'), 'utf8');
const paymeWebhook = fs.readFileSync(path.join(root, 'supabase', 'functions', 'payme-webhook', 'index.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '048_payment_verification_test_runs.sql'), 'utf8');

test('048 migration is additive: new payment_test_runs table + verified columns, no destructive changes', () => {
  assert.match(migration, /create table if not exists public\.payment_test_runs/);
  assert.match(migration, /alter table public\.click_connections add column if not exists verified boolean not null default false/);
  assert.match(migration, /alter table public\.payme_connections add column if not exists verified boolean not null default false/);
  assert.doesNotMatch(migration, /drop table|drop column|delete from/i);
});

test('click-webhook: TEST- prefixed merchant_trans_id is handled in a completely separate branch in BOTH Prepare and Complete, before the real-order lookup, and never touches click_transactions or orders', () => {
  const prepareStart = clickWebhook.indexOf('if (action === "0")');
  const prepareEnd = clickWebhook.indexOf('// ---- Complete');
  const prepareBlock = clickWebhook.slice(prepareStart, prepareEnd);
  const testBranchIdx = prepareBlock.indexOf('merchantTransId.startsWith("TEST-")');
  const realOrderIdx = prepareBlock.indexOf('const orderId = Number(merchantTransId);');
  assert.ok(testBranchIdx >= 0 && realOrderIdx > testBranchIdx, 'the TEST- branch must come BEFORE the real-order path so it never falls through');
  const testPrepareBlock = prepareBlock.slice(testBranchIdx, realOrderIdx);
  assert.doesNotMatch(testPrepareBlock, /click_transactions|\.from\("orders"\)/, 'test Prepare must never touch click_transactions or orders');
  assert.match(testPrepareBlock, /payment_test_runs/);

  const completeBlock = clickWebhook.slice(prepareEnd);
  const completeTestIdx = completeBlock.indexOf('merchantTransId.startsWith("TEST-")');
  const completeRealIdx = completeBlock.indexOf('const { data: txn } = await db.from("click_transactions")');
  assert.ok(completeTestIdx >= 0 && completeRealIdx > completeTestIdx, 'Complete TEST- branch must also come before the real-order path');
  const testCompleteBlock = completeBlock.slice(completeTestIdx, completeRealIdx);
  assert.doesNotMatch(testCompleteBlock, /click_transactions|update_order_status|\.from\("orders"\)/, 'test Complete must never touch click_transactions, orders, or trigger order-status changes');
  assert.match(testCompleteBlock, /status: "CONFIRMED"/);
  assert.match(testCompleteBlock, /confirmedCount \|\| 0\) >= 3\) await db\.from\("click_connections"\)\.update\(\{ verified: true \}\)/, 'the 3rd confirmed test run must flip verified=true');
});

test('payme-webhook: TEST- account.order_id is recognized in all 5 JSON-RPC methods via a separate payment_test_runs lookup, never via payme_transactions (whose order_id is a real FK to orders)', () => {
  for (const method of ['CheckPerformTransaction', 'CreateTransaction', 'PerformTransaction', 'CancelTransaction', 'CheckTransaction']) {
    assert.match(paymeWebhook, new RegExp(`if \\(method === "${method}"\\) \\{`), `${method} must exist`);
  }
  const isTestIdx = paymeWebhook.indexOf('const isTestAccount = typeof orderIdRaw === "string" && orderIdRaw.startsWith("TEST-");');
  assert.ok(isTestIdx >= 0, 'must detect TEST- prefixed account.order_id once, shared by all methods');
  // Perform/Cancel/Check only receive Payme's OWN transaction id (params.id),
  // never account.order_id again — so they must correlate via external_ref.
  for (const method of ['PerformTransaction', 'CancelTransaction', 'CheckTransaction']) {
    const methodStart = paymeWebhook.indexOf(`if (method === "${method}") {`);
    const methodBlock = paymeWebhook.slice(methodStart, methodStart + 1300);
    assert.match(methodBlock, /payment_test_runs.*eq\("external_ref", paymeTransactionId\)/s, `${method} must look up test runs by external_ref (Payme's own transaction id)`);
  }
  assert.match(paymeWebhook, /if \(\(confirmedCount \|\| 0\) >= 3\) await db\.from\("payme_connections"\)\.update\(\{ verified: true \}\)/);
});

test('resolvePaymentSnapshot-adjacent: boot() forces CLICK/PAYME off in the CUSTOMER-facing fulfillmentConfig unless the connection is both CONNECTED and verified — admin still sees their own raw toggle state', () => {
  const bootStart = api.indexOf('case "boot": {');
  const bootEnd = api.indexOf('case "platform_boot"', bootStart) > 0 ? Infinity : api.indexOf('\n      case ', bootStart + 20);
  const bootBlock = api.slice(bootStart, bootStart + 9500);
  assert.match(bootBlock, /const clickPaymeStatusPromise = db\.from\("click_connections"\)\.select\("status,verified"\)\.eq\("shop_id", shopId\)\.maybeSingle\(\);/);
  assert.match(bootBlock, /const paymeStatusPromise = db\.from\("payme_connections"\)\.select\("status,verified"\)\.eq\("shop_id", shopId\)\.maybeSingle\(\);/);
  assert.match(bootBlock, /if \(!isAdmin\) \{/, 'the override must be scoped to non-admin (customer) responses only');
  assert.match(bootBlock, /const clickReady = clickConnR\.data\?\.status === "CONNECTED" && clickConnR\.data\?\.verified === true;/);
  assert.match(bootBlock, /const paymeReady = paymeConnR\.data\?\.status === "CONNECTED" && paymeConnR\.data\?\.verified === true;/);
  assert.match(bootBlock, /fulfillmentConfig: clientFulfillmentConfig,/, 'the response must actually use the overridden config, not the raw admin one');
});

test('create_order independently re-verifies CLICK/PAYME are verified server-side (never trusts the frontend to have hidden an unverified method) with a distinct, honest error code', () => {
  const clickStart = api.indexOf('if (payMethod === "CLICK") {');
  const clickBlock = api.slice(clickStart, clickStart + 1100);
  assert.match(clickBlock, /if \(clickConn\.verified !== true\) return json\(\{ error: "click_not_verified" \}, 400\);/);

  const paymeStart = api.indexOf('if (payMethod === "PAYME") {');
  const paymeBlock = api.slice(paymeStart, paymeStart + 1100);
  assert.match(paymeBlock, /if \(paymeConn\.verified !== true\) return json\(\{ error: "payme_not_verified" \}, 400\);/);
});

test('disconnecting CLICK/PAYME resets verified back to false, so a re-connect with different credentials cannot silently inherit a prior verification', () => {
  const clickDiscStart = api.indexOf('case "click_disconnect": {');
  const clickDiscBlock = api.slice(clickDiscStart, clickDiscStart + 600);
  assert.match(clickDiscBlock, /status: "DISCONNECTED", verified: false,/);

  const paymeDiscStart = api.indexOf('case "payme_disconnect": {');
  const paymeDiscBlock = api.slice(paymeDiscStart, paymeDiscStart + 600);
  assert.match(paymeDiscBlock, /status: "DISCONNECTED", verified: false,/);
});

test('click_start_test_payment/payme_start_test_payment refuse to run once already verified or when 3 confirmed runs already exist, and cap the admin-editable test amount to a sane 500-50000 so\'m range', () => {
  for (const action of ['click_start_test_payment', 'payme_start_test_payment']) {
    const start = api.indexOf(`case "${action}": {`);
    assert.ok(start >= 0, `${action} must exist`);
    const block = api.slice(start, start + 2200);
    assert.match(block, /if \(conn\.verified === true\) return json\(\{ error: "already_verified" \}, 400\);/);
    assert.match(block, /if \(\(confirmedCount \|\| 0\) >= 3\) return json\(\{ error: "already_verified" \}, 400\);/);
    assert.match(block, /if \(\(pendingCount \|\| 0\) > 0\) return json\(\{ error: "test_already_in_progress" \}, 400\);/, 'must not allow starting a second concurrent test run');
    assert.match(block, /Math\.max\(500, Math\.min\(50000, Math\.round\(Number\(payload\.amount\) \|\| 1000\)\)\);/, 'default 1000, admin-editable within a bounded range');
  }
});

test('frontend: the "Sinash" warning copy is the exact user-approved text, and the verify block only ever renders while status is CONNECTED but not yet verified — never replacing the "already verified" success state', () => {
  assert.match(app, /Bu — avtomatik tizim, texnik sabablarga ko'ra ba'zan noto'g'ri ishlashi mumkin\. Shuning uchun xaridorlaringizga ko'rsatishdan oldin, pastdagi \\"Sinash\\" tugmasi orqali 3 marta sinov to'lovini albatta amalga oshiring\./);
  assert.match(app, /function clickPaymentVerifyBlockHtml\(provider, progress\)/);
  // "To'lov usullari" restructure (2026-09-05): Click/Payme now share one
  // merged page function (renderAcquiringProviderPageHtml) instead of two
  // separate modal ternary chains — the verify block still only appears in
  // the "connected but not verified" branch, never once verified=true.
  const fnStart = app.indexOf('function renderAcquiringProviderPageHtml(providerId)');
  const fnBlock = app.slice(fnStart, app.indexOf('\n    }', fnStart) + 6);
  assert.match(fnBlock, /if \(!conn\.verified\) \{[\s\S]{0,200}clickPaymentVerifyBlockHtml\(isClick \? 'click' : 'payme', progress\)/);
  assert.match(fnBlock, /Ulangan va tekshirildi/, 'a distinct, more confident success state once verified=true');
  // the verified-success text must come AFTER the not-yet-verified branch's
  // closing brace, i.e. it is a separate, later branch — not the same block.
  const notVerifiedIdx = fnBlock.indexOf('if (!conn.verified)');
  const verifiedCopyIdx = fnBlock.indexOf('Ulangan va tekshirildi');
  assert.ok(notVerifiedIdx >= 0 && verifiedCopyIdx > notVerifiedIdx, 'verified=true copy must be a distinct branch after the not-yet-verified one');
});
