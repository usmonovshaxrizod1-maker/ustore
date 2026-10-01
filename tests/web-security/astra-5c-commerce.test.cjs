const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..', '..');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

test('Astra-5c migration makes web order creation one atomic stock+snapshot+promo transaction', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations/095_web_commerce_idempotency.sql'), 'utf8');
  assert.match(sql, /create or replace function public\.ustore_create_web_order/);
  assert.match(sql, /v_created := public\.place_order/);
  assert.match(sql, /v_created->>'replayed'/);
  assert.match(sql, /Do not run redemption\/finalization side effects a second time/);
  assert.match(sql, /abs\(v_actual_subtotal - p_expected_subtotal\) > 0\.01/);
  assert.match(sql, /insert into public\.promotion_redemptions/);
  assert.match(sql, /web_checkout_finalized_at = now\(\)/);
  assert.match(sql, /order_source = 'WEB'/);
});

test('Astra-5c payment attempts prevent duplicate live provider starts for same order+method', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations/095_web_commerce_idempotency.sql'), 'utf8');
  assert.match(sql, /unique \(shop_id, account_id, idempotency_key\)/);
  assert.match(sql, /web_payment_attempts_live_order_method_unique/);
  assert.match(sql, /where status in \('PROCESSING','PENDING','PAID'\)/);
});

test('Astra-5c fixes personal-discount account mapping before web usage writes', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations/095_web_commerce_idempotency.sql'), 'utf8');
  assert.match(sql, /alter table if exists public\.customer_discount_usages[\s\S]*add column if not exists account_id/);
  assert.match(sql, /update public\.customer_discount_usages x set account_id=u\.account_id/);
});

test('Astra-5c shop API exposes quote/create/payment only through authenticated private-web branch', () => {
  const api = fs.readFileSync(path.join(root, 'supabase/functions/shop-api/index.ts'), 'utf8');
  const branch = api.slice(api.indexOf('// Astra-5b — authenticated premium-web customer actions'), api.indexOf('// ---- Boss-app service-to-service call'));
  for (const action of ['web_checkout_quote','web_order_create','web_payment_start','web_payment_status']) assert.match(branch, new RegExp(`"${action}"`));
  assert.match(branch, /if \(!sessionResult\.session\) return json\(\{ error: "auth_required" \}, 401\)/);
  assert.match(api, /db\.rpc\("ustore_create_web_order"/);
});

test('Astra-5c authoritative cart ignores browser money and re-reads product/bundle prices and stock', () => {
  const api = fs.readFileSync(path.join(root, 'supabase/functions/shop-api/index.ts'), 'utf8');
  const start = api.indexOf('async function buildWebAuthoritativeCart');
  const end = api.indexOf('function webDiscountSnapshot', start);
  const segment = api.slice(start, end);
  assert.match(segment, /from\("products"\)/);
  assert.match(segment, /from\("bundles"\)/);
  assert.match(segment, /productLinePrice\(product, line\)/);
  assert.match(segment, /insufficient_stock/);
  assert.doesNotMatch(segment, /unitPrice|clientPrice|quoteSnapshot/);
});

test('Astra-5c order create compares prior quote and server total before atomic RPC', () => {
  const api = fs.readFileSync(path.join(root, 'supabase/functions/shop-api/index.ts'), 'utf8');
  const start = api.indexOf('if (action === "web_order_create")');
  const end = api.indexOf('if (action === "web_payment_status")', start);
  const segment = api.slice(start, end);
  assert.match(segment, /Math\.abs\(quotedTotal - payableTotal\) > 0\.01/);
  assert.match(segment, /p_expected_subtotal: build\.subtotal/);
  assert.match(segment, /p_checkout_key: idempotencyKey/);
  assert.match(segment, /p_promotion_id:/);
});

test('Astra-5c browser payment return reads server order payment_status and never marks paid from redirect', () => {
  const api = fs.readFileSync(path.join(root, 'supabase/functions/shop-api/index.ts'), 'utf8');
  const start = api.indexOf('if (action === "web_payment_status")');
  const end = api.indexOf('if (action === "web_payment_start")', start);
  const segment = api.slice(start, end);
  assert.match(segment, /payment_status/);
  assert.match(segment, /normalizePaymentStatusForWeb\(order\)/);
  assert.doesNotMatch(segment, /redirect.*PAID|PAID.*redirect/i);
});

test('Astra-5c live adapter wires quote, order create and payment status/start with original idempotency keys', async () => {
  const { createLiveShopPrivateAdapters } = await import(moduleUrl('web/services/live/shop-private.js'));
  const calls = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body); calls.push(body);
    if (body.action === 'web_checkout_quote') return { ok: true, status: 200, json: async () => ({ serverAuthoritative: true, subtotal: 100, discounts: 0, delivery: 0, total: 100, deliveryOptions: [], paymentMethods: [] }) };
    if (body.action === 'web_order_create') return { ok: true, status: 200, json: async () => ({ order: { id: 77, status: 'NEW' } }) };
    if (body.action === 'web_payment_start') return { ok: true, status: 200, json: async () => ({ payment: { orderId: 77, status: 'PENDING', redirectUrl: 'https://pay.example/77' } }) };
    if (body.action === 'web_payment_status') return { ok: true, status: 200, json: async () => ({ payment: { orderId: 77, status: 'PAID' } }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const adapters = createLiveShopPrivateAdapters({ endpoint: 'https://api.example/shop-api', botId: '12345', fetchImpl, tokenStore: { get: () => 'session', set() {} } });
  assert.equal((await adapters.cart.quote({ cart: { shopId: 's1', lines: [{ productId: 'p1', quantity: 1, unitPrice: 999 }] } })).ok, true);
  assert.equal((await adapters.orders.create({ checkout: { contactName: 'Ali' }, idempotencyKey: 'order:key-1' })).data.id, 77);
  assert.equal((await adapters.payments.start({ orderId: 77, method: 'PAYME', idempotencyKey: 'payment:key-1' })).ok, true);
  assert.equal((await adapters.payments.getStatus({ orderId: 77 })).data.status, 'PAID');
  assert.equal(calls.find((x) => x.action === 'web_order_create').payload.idempotencyKey, 'order:key-1');
  assert.equal(calls.find((x) => x.action === 'web_payment_start').payload.idempotencyKey, 'payment:key-1');
});

test('Astra-5c server derives order source and rejects receipt-required manual methods from web quote', () => {
  const api = fs.readFileSync(path.join(root, 'supabase/functions/shop-api/index.ts'), 'utf8');
  assert.match(api, /source: o\.order_source \|\| "TELEGRAM"/);
  const start = api.indexOf('function listWebPaymentMethods');
  const end = api.indexOf('async function webIdempotencyUuid', start);
  const segment = api.slice(start, end);
  assert.match(segment, /if \(id === "QR"\) continue/);
  assert.match(segment, /id === "CARD" && method\.receiptRequired === true/);
});
