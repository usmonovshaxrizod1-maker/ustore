const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..', '..');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

test('Astra-5b migration adds account lookup indexes and support clientMessageId idempotency', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations/094_web_private_customer_indexes.sql'), 'utf8');
  assert.match(sql, /orders\(shop_id, account_id, id desc\)/);
  assert.match(sql, /support_tickets\(shop_id, account_id, id desc\)/);
  assert.match(sql, /add column if not exists client_message_id text/);
  assert.match(sql, /support_ticket_messages_user_client_id_unique/);
  assert.match(sql, /where sender='USER' and client_message_id is not null/);
});

test('Astra-5b private web branch requires a verified central session and freshly resolves shop principal', () => {
  const api = fs.readFileSync(path.join(root, 'supabase/functions/shop-api/index.ts'), 'utf8');
  const start = api.indexOf('// Astra-5b — authenticated premium-web customer actions');
  const end = api.indexOf('// ---- Boss-app service-to-service call', start);
  assert.ok(start > 0 && end > start);
  const segment = api.slice(start, end);
  assert.match(segment, /WEB_PRIVATE_ACTIONS/);
  assert.match(segment, /resolveShopTenant\(db, req, body\)/);
  assert.match(segment, /resolveOptionalWebSession\(db, req\)/);
  assert.match(segment, /if \(!sessionResult\.session\) return json\(\{ error: "auth_required" \}, 401\)/);
  assert.match(segment, /resolveWebShopPrincipal\(db, tenantResult\.tenant\.shopId, sessionResult\.session\.accountId\)/);
  assert.doesNotMatch(segment, /body\?\.shopId|payload\?\.shopId/);
});

test('Astra-5b principal maps central account to Telegram compatibility identity and re-reads membership/permissions', () => {
  const api = fs.readFileSync(path.join(root, 'supabase/functions/shop-api/index.ts'), 'utf8');
  const start = api.indexOf('async function resolveWebShopPrincipal');
  const end = api.indexOf('function webOwnedFilter', start);
  const segment = api.slice(start, end);
  assert.match(segment, /from\("accounts"\)/);
  assert.match(segment, /from\("account_identities"\)/);
  assert.match(segment, /eq\("provider", "TELEGRAM"\)/);
  assert.match(segment, /from\("shop_memberships"\)/);
  assert.match(segment, /eq\("account_id", accountId\)/);
  assert.match(segment, /from\("membership_roles"\)/);
  assert.match(segment, /from\("role_permissions"\)/);
  assert.match(segment, /shopRole:/);
});

test('Astra-5b private handlers scope personal data by shop + verified account/Telegram mapping', () => {
  const api = fs.readFileSync(path.join(root, 'supabase/functions/shop-api/index.ts'), 'utf8');
  const start = api.indexOf('async function handleWebPrivateShopAction');
  const end = api.indexOf('// adminChatIds:', start);
  const segment = api.slice(start, end);
  for (const table of ['web_carts', 'user_favorites', 'orders', 'support_tickets']) assert.match(segment, new RegExp(`from\\(\\"${table}\\"\\)`));
  assert.match(segment, /\.eq\("shop_id", shopId\)\.or\(owned\)/);
  assert.match(segment, /account_id: accountId/);
  assert.match(segment, /client_message_id: clientMessageId/);
  assert.doesNotMatch(segment, /includeInternalNote:\s*true/);
});

test('Astra-5b live private adapter sends botId only as locator and uses central session header', async () => {
  const { createLiveShopPrivateAdapters } = await import(moduleUrl('web/services/live/shop-private.js'));
  const calls = [];
  const tokenStore = { get: () => 'session-opaque-token', set() {} };
  const fetchImpl = async (_url, init) => {
    calls.push(JSON.parse(init.body));
    if (JSON.parse(init.body).action === 'web_orders_list') return { ok: true, status: 200, json: async () => ({ items: [{ id: 1, status: 'NEW' }], total: 1 }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const adapters = createLiveShopPrivateAdapters({ endpoint: 'https://api.example/shop-api', botId: '12345', fetchImpl, tokenStore });
  const list = await adapters.orders.listMine();
  assert.equal(list.ok, true);
  assert.equal(list.data.items.length, 1);
  assert.equal(calls[0].clientMode, 'web');
  assert.equal(calls[0].botId, '12345');
  assert.equal(calls[0].shopId, undefined);
  assert.equal((await adapters.orders.create({})).error.code, 'VALIDATION_ERROR');
});

test('Astra-5b support retry keeps clientMessageId in the live request contract', async () => {
  const { createLiveShopPrivateAdapters } = await import(moduleUrl('web/services/live/shop-private.js'));
  const bodies = [];
  const adapters = createLiveShopPrivateAdapters({
    endpoint: 'https://api.example/shop-api', botId: '12345', tokenStore: { get: () => 'token', set() {} },
    fetchImpl: async (_url, init) => { bodies.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ message: { id: 'm1' } }) }; },
  });
  const result = await adapters.support.sendMessage({ threadId: '7', text: 'Salom', clientMessageId: 'client-001' });
  assert.equal(result.ok, true);
  assert.equal(bodies[0].action, 'web_support_send');
  assert.equal(bodies[0].payload.clientMessageId, 'client-001');
});


test('Astra-5b web confirm-received preserves paid-order reward and BILLZ background side effects', () => {
  const api = fs.readFileSync(path.join(root, 'supabase/functions/shop-api/index.ts'), 'utf8');
  const start = api.indexOf('async function handleWebPrivateShopAction');
  const end = api.indexOf('// adminChatIds:', start);
  const segment = api.slice(start, end);
  assert.match(segment, /action === "web_order_confirm_received" && orderRow\?\.payment_status === "PAID"/);
  assert.match(segment, /checkAndIssueRewards\(db, shopId/);
  assert.match(segment, /pushOrderToBillzInBackground\(db, shopId/);
  assert.match(segment, /decryptBotToken\(masterKey, tenant\.tokenCiphertext, tenant\.tokenIv\)/);
});
