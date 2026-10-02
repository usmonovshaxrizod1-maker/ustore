const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('Astra-6c keeps server-derived order source: Telegram default and WEB override', () => {
  const sql = read('supabase/migrations/095_web_commerce_idempotency.sql');
  const api = read('supabase/functions/shop-api/index.ts');
  assert.match(sql, /add column if not exists order_source text not null default 'TELEGRAM'/);
  assert.match(sql, /order_source = 'WEB'/);
  assert.match(api, /source: o\.order_source \|\| "TELEGRAM"/);
});

test('Astra-6c new-order admin Telegram message includes the server mapped source', () => {
  const api = read('supabase/functions/shop-api/index.ts');
  const start = api.indexOf('async function backgroundNotifyOrder');
  const end = api.indexOf('function formatAmount', start);
  assert.ok(start > 0 && end > start);
  const segment = api.slice(start, end);
  assert.match(segment, /order\?\.source/);
  assert.match(segment, /source === "WEB" \? "🌐 Web" : "✈️ Telegram Mini App"/);
  assert.match(segment, /Manba:/);
  assert.doesNotMatch(segment, /payload\?\.source|body\?\.source/);
});

test('Astra-6c WEB order notifies admins/customer only after a non-replayed committed order', () => {
  const api = read('supabase/functions/shop-api/index.ts');
  const start = api.indexOf('if (action === "web_order_create")');
  const end = api.indexOf('if (action === "web_payment_status")', start);
  assert.ok(start > 0 && end > start);
  const segment = api.slice(start, end);
  assert.match(segment, /const replayed = rpcData\.replayed === true/);
  assert.match(segment, /if \(!replayed\)/);
  assert.match(segment, /decryptBotToken\(masterKey, tenant\.tokenCiphertext, tenant\.tokenIv\)/);
  assert.match(segment, /backgroundNotifyOrder\(/);
  assert.match(segment, /notifyOrderCreatedCustomer\(/);
  assert.match(segment, /Promise\.allSettled/);
  assert.match(segment, /WEB_ORDER_NOTIFICATION_BACKGROUND_FAILED/);
  assert.match(segment, /return \{ order: mappedOrder, replayed \}/);
});

test('Astra-6c blocked/unstarted shop bot cannot roll back a WEB order notification path', () => {
  const api = read('supabase/functions/shop-api/index.ts');
  const start = api.indexOf('async function notifyOrderCreatedCustomer');
  const end = api.indexOf('async function notifyOrderStatusCustomer', start);
  assert.ok(start > 0 && end > start);
  const segment = api.slice(start, end);
  assert.match(segment, /try \{/);
  assert.match(segment, /await telegramApi\(botToken, "sendMessage"/);
  assert.match(segment, /catch \(e\)/);
  assert.match(segment, /ORDER_CREATED_CUSTOMER_NOTIFY_FAILED/);
  assert.match(segment, /Web yoki Telegram Mini App/);
});

test('Astra-6c admin order status notification is best-effort with web status/support fallback', () => {
  const api = read('supabase/functions/shop-api/index.ts');
  const helperStart = api.indexOf('async function notifyOrderStatusCustomer');
  const helperEnd = api.indexOf('// Faqat record_stock_in', helperStart);
  const helper = api.slice(helperStart, helperEnd);
  assert.match(helper, /ORDER_STATUS_CUSTOMER_NOTIFY_FAILED/);
  assert.match(helper, /Buyurtmalar/);
  assert.match(helper, /Support/);
  const caseStart = api.indexOf('case "cancel_order"');
  const caseEnd = api.indexOf('case "approve_payment_receipt"', caseStart);
  const statusCase = api.slice(caseStart, caseEnd);
  assert.match(statusCase, /if \(isAdmin\) EdgeRuntime\.waitUntil\(notifyOrderStatusCustomer\(BOT_TOKEN, orderRow \|\| data\)\)/);
});

test('Astra-6c WEB support retry notifies admins once and notification failure does not replace DB success', () => {
  const api = read('supabase/functions/shop-api/index.ts');
  const start = api.indexOf('if (action === "web_support_send")');
  const end = api.indexOf('return { __error: "web_action_unavailable"', start);
  const segment = api.slice(start, end);
  assert.match(segment, /const replayed = sent\.replayed === true/);
  assert.match(segment, /if \(!replayed\)/);
  assert.match(segment, /notifySupportAdmins\(/);
  assert.match(segment, /WEB_SUPPORT_ADMIN_NOTIFY_FAILED/);
  assert.match(segment, /return \{ thread: mapSupportTicketForClient\(sent\.thread\), message: mapSupportMessageForClient\(sent\.message\), replayed \}/);
});

test('Astra-6c support reply Telegram delivery explicitly points to persistent web fallback', () => {
  const api = read('supabase/functions/shop-api/index.ts');
  const start = api.indexOf('async function notifySupportReply');
  const end = api.indexOf('async function cleanupPrivateReceipt', start);
  const segment = api.slice(start, end);
  assert.match(segment, /Web yoki Telegram Mini App/);
  assert.match(segment, /Support/);
  assert.match(segment, /catch \(e\)/);
  assert.match(segment, /support reply notification error/);
});
