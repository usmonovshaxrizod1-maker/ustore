const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const load = p => import(pathToFileURL(path.join(root, p)).href);
function extract(file, start, end, name, dependencies) {
  const text = read(file);
  const from = text.indexOf(start);
  const to = text.indexOf(end, from);
  assert.ok(from >= 0 && to > from);
  const js = stripTypeScriptTypes(text.slice(from, to).replace(/^export /, ''));
  return new Function(...Object.keys(dependencies), `${js}\nreturn ${name};`)(...Object.values(dependencies));
}
const handler = dependencies => extract('supabase/functions/shop-api/index.ts',
  'async function handleWebPrivateShopAction(', '\nasync function ', 'handleWebPrivateShopAction', {
    webOwnedFilter: () => 'owned', webIdempotencyUuid: async x => x,
    mapOrderForClient: x => x, ...dependencies,
  });
function query(result) {
  const q = { then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
  for (const key of ['select','eq','is','or','order','limit','maybeSingle','single','in']) q[key] = () => q;
  return q;
}
test('password throttle is shared across changed IP hints', async () => {
  const keys = [];
  const fn = extract('supabase/functions/_shared/web-auth.ts', 'export async function authenticatePassword(',
    '\nexport async function createSession', 'authenticatePassword', {
      normalizeLogin: x => x.trim().toLowerCase(), sha256Hex: async x => x,
    });
  const db = { rpc: async (_, p) => { keys.push(p.p_key_hash); return { data: { allowed: false } }; } };
  assert.equal((await fn(db, ' Ali ', 'invalid', '1.1.1.1')).code, 'RATE_LIMITED');
  await fn(db, 'ali', 'invalid', '2.2.2.2');
  assert.equal(keys[0], keys[1]);
});
test('committed order replay does not depend on deleted cart or depleted stock', async () => {
  const prior = { id: 7, account_id: 'a', tg_id: '12345', order_source: 'WEB', web_checkout_finalized_at: 'now' };
  const db = { from(table) { assert.equal(table, 'orders'); return query({ data: prior }); } };
  const result = await handler({})(db, 's', { accountId: 'a', tgId: '12345' }, 'web_order_create', { idempotencyKey: 'key' });
  assert.equal(result.replayed, true);
  assert.equal(result.order.id, 7);
});
test('order replay rejects another account without disclosing its order', async () => {
  const db = { from: () => query({ data: { id: 7, account_id: 'other', tg_id: '12345', order_source: 'WEB', web_checkout_finalized_at: 'now' } }) };
  const result = await handler({})(db, 's', { accountId: 'a', tgId: '12345' }, 'web_order_create', { idempotencyKey: 'key' });
  assert.equal(result.__status, 409);
  assert.equal(result.order, undefined);
});
test('provider timeout retains payment lock rather than enabling another invoice', async () => {
  const updates = [];
  const db = { from(table) {
    if (table === 'orders') return query({ data: { id: 7, pay_method: 'CLICK', status: 'NEW', total_price: 100 } });
    if (table === 'click_connections') return query({ data: { status: 'CONNECTED', verified: true, secret_key_ciphertext: 'cipher' } });
    assert.equal(table, 'web_payment_attempts');
    return { ...query({ data: null }), insert: () => query({ error: null }), update: value => { updates.push(value); return query({ error: null }); } };
  } };
  const fn = handler({ normalizePaymentStatusForWeb: () => 'PENDING', decryptBotToken: async () => 'secret',
    clickCreateInvoice: async () => { throw new Error('provider may have accepted'); } });
  const result = await fn(db, 's', { accountId: 'a', tgId: '12345' }, 'web_payment_start',
    { orderId: 7, method: 'CLICK', idempotencyKey: 'p1' }, { clickAccessGranted: true }, 'key');
  assert.equal(result.payment?.status, 'PROCESSING');
  assert.equal(result.payment?.recoveryRequired, true);
  assert.equal(result.__status, undefined);
  assert.equal(updates.at(-1).status, 'PROCESSING');
  assert.equal(updates.at(-1).error_code, 'payment_reconciliation_required');
});
test('support sends through the atomic RPC without creating a ticket in the HTTP handler', async () => {
  const fn = handler({ nullableText: x => x || null, mapSupportTicketForClient: x => x, mapSupportMessageForClient: x => x });
  const db = { from() { assert.fail('ticket writes must be in transaction'); }, async rpc(name, args) {
    assert.equal(name, 'ustore_send_web_support_message');
    assert.equal(args.p_thread_id, null);
    return { data: { thread: { id: 2 }, message: { id: 3 }, replayed: true } };
  } };
  const result = await fn(db, 's', { accountId: 'a', tgId: '12345' }, 'web_support_send', { text: 'Hello', clientMessageId: 'm1' });
  assert.equal(result.replayed, true);
});
test('support reset ignores an older in-flight private thread response', async () => {
  const { createSupportController } = await load('web/features/support/support.js');
  let finish;
  const controller = createSupportController({ supportPort: {
    listThreads: () => new Promise(resolve => { finish = resolve; }), getMessages() {}, sendMessage() {}, uploadAttachment() {},
  } });
  const pending = controller.loadThreads();
  controller.resetPrivateState();
  finish({ ok: true, data: { items: [{ id: 'private-old-user' }] } });
  await pending;
  assert.deepEqual(controller.getState().threads, []);
  assert.equal(controller.getState().status, 'idle');
});
test('support upload completing after logout never sends the old user message', async () => {
  const { createSupportController } = await load('web/features/support/support.js');
  let finish; let sends = 0;
  const controller = createSupportController({ createObjectUrl: () => null, supportPort: {
    listThreads() {}, getMessages() {}, sendMessage() { sends++; },
    uploadAttachment: () => new Promise(resolve => { finish = resolve; }),
  } });
  const pending = controller.send({ file: { type: 'image/png', size: 10 } });
  controller.resetPrivateState();
  finish({ ok: true, data: { attachment: { path: 'old-user/image.png' } } });
  await pending;
  assert.equal(sends, 0);
  assert.deepEqual(controller.getState().messages, []);
});
test('successful password change discards the revoked local bearer token', async () => {
  const { createLiveAuthAdapter, createMemoryTokenStore } = await load('web/services/live/auth.js');
  const tokenStore = createMemoryTokenStore('old');
  const auth = createLiveAuthAdapter({ endpoint: 'https://example.test/auth', tokenStore,
    fetchImpl: async () => ({ ok: true, json: async () => ({ sessionsRevoked: true }) }) });
  assert.equal((await auth.changePassword({})).ok, true);
  assert.equal(tokenStore.get(), '');
});
test('short Telegram names produce a login accepted by password validation', () => {
  const slug = extract('supabase/functions/_shared/web-auth.ts', 'function slugBase(',
    '\nasync function uniqueGeneratedLogin', 'slugBase', {});
  for (const name of ['Al', 'A', '']) assert.match(slug(name), /^[\p{L}\p{N}][\p{L}\p{N}._-]{3,39}$/u);
});
test('session rotation cannot create a new session after concurrent revoke wins', async () => {
  const fn = extract('supabase/functions/_shared/web-auth.ts', 'export async function resolveSession(',
    '\nexport async function revokeSession', 'resolveSession', {
      sha256Hex: async x => x, generateSessionToken: () => 'new-token',
      SESSION_ROTATE_BEFORE_SECONDS: 604800, SESSION_TTL_SECONDS: 2592000,
    });
  let updates = 0;
  const db = { from(table) {
    if (table === 'accounts') return query({ data: { status: 'ACTIVE' } });
    const result = query({ data: { id: 'session', account_id: 'a', expires_at: new Date(Date.now()+60000).toISOString() } });
    result.update = () => { updates++; return { ...query({ data: null }), is() { return this; } }; };
    result.insert = () => assert.fail('rotation must never insert a new session');
    return result;
  } };
  assert.equal(await fn(db, 'x'.repeat(45)), null);
  assert.equal(updates, 2);
});
test('wrong origin cannot consume an otherwise valid Telegram challenge', async () => {
  const { exchangeTelegramWebChallenge } = await load('supabase/functions/_shared/web-telegram-auth.ts');
  let exchanges = 0;
  const result = await exchangeTelegramWebChallenge({
    from: () => query({ data: { return_origin: 'https://shop-a.test' } }),
    rpc() { exchanges++; assert.fail('must reject before consuming'); },
  }, { origin: 'https://shop-b.test', state: 'a'.repeat(43), browserVerifier: 'b'.repeat(43),
    approvedAccountId: '00000000-0000-0000-0000-000000000001', confirmed: true });
  assert.equal(result.result, 'ORIGIN_MISMATCH');
  assert.equal(exchanges, 0);
});
