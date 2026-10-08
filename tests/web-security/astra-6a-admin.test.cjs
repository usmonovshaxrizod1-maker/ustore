const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const load = p => import(pathToFileURL(path.join(root, p)).href);

test('Astra-6a server exposes only the reviewed premium-web admin allowlist', () => {
  const api = read('supabase/functions/shop-api/index.ts');
  const start = api.indexOf('const WEB_ADMIN_ACTION_PERMISSIONS');
  const end = api.indexOf('Deno.serve', start);
  assert.ok(start > 0 && end > start);
  const segment = api.slice(start, end);
  for (const action of [
    'get_excel_template_url', 'start_import_batch', 'bulk_import_products',
    'billz_get_status', 'billz_connect', 'billz_import_products',
    'get_upload_url', 'finalize_image_upload',
    'get_payment_receipt_url', 'approve_payment_receipt', 'reject_payment_receipt',
    'get_report_overview', 'upload_report_pdf',
  ]) assert.match(segment, new RegExp(`${action}:`));
  assert.doesNotMatch(segment, /set_product_limit:/);
  assert.doesNotMatch(segment, /transfer_ownership:/);
});

test('Astra-6a web admin auth uses central session + fresh shop principal and ignores browser role claims', () => {
  const api = read('supabase/functions/shop-api/index.ts');
  const start = api.indexOf('const clientMode = String(body?.clientMode');
  const end = api.indexOf('const shopId = ctx.shopId;', start);
  assert.ok(start > 0 && end > start);
  const segment = api.slice(start, end);
  assert.match(segment, /WEB_ADMIN_ACTIONS\.has/);
  assert.match(segment, /resolveShopTenant\(db, req, body\)/);
  assert.match(segment, /resolveOptionalWebSession\(db, req, false\)/);
  assert.match(segment, /resolveWebShopPrincipal\(db, tenantResult\.tenant\.shopId, sessionResult\.session\.accountId, PLATFORM_SUPER_ADMIN_ID\)/);
  assert.match(segment, /principal\.actor\.shopRole !== "OWNER" && principal\.actor\.shopRole !== "STAFF"/);
  assert.doesNotMatch(segment, /payload\?\.permissions|body\?\.role|payload\?\.role/);
});

test('web shop super-admin uses the verified central session Telegram identity, never a browser claim', () => {
  const api = read('supabase/functions/shop-api/index.ts');
  const principal = api.slice(api.indexOf('async function resolveWebShopPrincipal'), api.indexOf('function webOwnedFilter'));
  assert.match(principal, /account_identities/);
  assert.match(principal, /provider_subject/);
  assert.match(principal, /superAdminTelegramId !== "" && tgId === superAdminTelegramId/);
  assert.doesNotMatch(principal, /payload\?\.tgId|body\?\.tgId/);
});

test('Astra-6a live admin adapter blocks non-whitelisted actions before network and sends only locator + session', async () => {
  const { createLiveAdminAdapter } = await load('web/services/live/admin.js');
  const calls = [];
  const adapter = createLiveAdminAdapter({
    endpoint: 'https://api.example/shop-api', botId: '12345', tokenStore: { get: () => 'opaque-session-token' },
    fetchImpl: async (_url, init) => {
      calls.push(init);
      return { ok: true, status: 200, json: async () => ({ status: 'CONNECTED' }) };
    },
  });
  const denied = await adapter.invoke('transfer_ownership', { target: 'x' });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'CAPABILITY_UNAVAILABLE');
  assert.equal(calls.length, 0);

  const result = await adapter.invoke('billz_get_status', {}, { requestId: 'req-1' });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0].body);
  assert.equal(body.action, 'billz_get_status');
  assert.equal(body.clientMode, 'web');
  assert.equal(body.botId, '12345');
  assert.equal(body.shopId, undefined);
  assert.equal(body.role, undefined);
  assert.equal(calls[0].headers.authorization, 'UStoreSession opaque-session-token');
  assert.equal(calls[0].headers['x-request-id'], 'req-1');
});

test('Astra-6a live admin adapter maps missing/expired auth without fake success', async () => {
  const { createLiveAdminAdapter } = await load('web/services/live/admin.js');
  const noToken = createLiveAdminAdapter({ endpoint: 'https://api.example/shop-api', botId: '12345', tokenStore: { get: () => '' }, fetchImpl: async () => assert.fail('network must not run') });
  assert.equal((await noToken.invoke('get_report_overview')).error.code, 'AUTH_REQUIRED');

  const expired = createLiveAdminAdapter({ endpoint: 'https://api.example/shop-api', botId: '12345', tokenStore: { get: () => 'old' },
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: 'session_expired' }) }) });
  assert.equal((await expired.invoke('get_report_overview')).error.code, 'SESSION_EXPIRED');
});

test('Astra-6a admin web requests disable silent session rotation because legacy responses have no refresh envelope', () => {
  const shared = read('supabase/functions/_shared/shop-context.ts');
  assert.match(shared, /resolveOptionalWebSession\(db: any, req: Request, rotate = false\)/);
  assert.match(shared, /resolveSession\(db, token, rotate\)/);
  const api = read('supabase/functions/shop-api/index.ts');
  assert.match(api, /resolveOptionalWebSession\(db, req, false\)/);
});
