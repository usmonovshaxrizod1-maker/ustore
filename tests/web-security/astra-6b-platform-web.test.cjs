const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const load = p => import(pathToFileURL(path.join(root, p)).href);

test('Astra-6b platform web principal resolves central session then one verified Telegram identity', () => {
  const api = read('supabase/functions/platform-api/index.ts');
  const start = api.indexOf('async function resolvePlatformWebPrincipal');
  const end = api.indexOf('// 18-band:', start);
  assert.ok(start > 0 && end > start);
  const segment = api.slice(start, end);
  assert.match(segment, /resolveSession\(db, token, false\)/);
  assert.match(segment, /from\("account_identities"\)/);
  assert.match(segment, /eq\("account_id", session\.accountId\)/);
  assert.match(segment, /eq\("provider", "TELEGRAM"\)/);
  assert.match(segment, /identities\.length !== 1/);
  assert.match(segment, /tgId === superAdminTelegramId/);
  assert.doesNotMatch(segment, /from\("shop_memberships"\)|\.eq\("role"/);
});

test('Astra-6b Telegram platform path also establishes central account mapping without trusting initDataUnsafe', () => {
  const api = read('supabase/functions/platform-api/index.ts');
  const start = api.indexOf('if (requestedClientMode === "web")');
  const end = api.indexOf('function requirePlatformSuperAdmin()', start);
  assert.ok(start > 0 && end > start);
  const segment = api.slice(start, end);
  assert.match(segment, /verifyTelegramInitData\(initData, PLATFORM_BOT_TOKEN\)/);
  assert.match(segment, /accountId = await ensureTelegramAccount\(db, tgId, verifiedDisplayName\)/);
  assert.match(segment, /isPlatformSuperAdmin = SUPER_ADMIN_ID !== "" && tgId === SUPER_ADMIN_ID/);
  assert.doesNotMatch(segment, /payload\?\.role|body\?\.role|payload\?\.isSuperAdmin|body\?\.isSuperAdmin/);
});

test('Astra-6b password web session cannot replace protected Telegram re-auth for credential management', () => {
  const api = read('supabase/functions/platform-api/index.ts');
  const start = api.indexOf('const TELEGRAM_REAUTH_ACTIONS');
  const end = api.indexOf('// ASTRA-4c:', start);
  assert.ok(start > 0 && end > start);
  const segment = api.slice(start, end);
  for (const action of ['platform_web_credentials_status','platform_issue_web_credentials','platform_reset_web_credentials','platform_change_web_login']) {
    assert.match(segment, new RegExp(action));
  }
  assert.match(segment, /authMode === "web"/);
  assert.match(segment, /forbidden:telegram_reauthentication_required/);
});

test('Astra-6b platform_boot returns server-derived platform actor and keeps shop ownership separate', () => {
  const api = read('supabase/functions/platform-api/index.ts');
  const start = api.indexOf('case "platform_boot"');
  const end = api.indexOf('case "platform_list_my_shops"', start);
  assert.ok(start > 0 && end > start);
  const segment = api.slice(start, end);
  assert.match(segment, /platformActor:/);
  assert.match(segment, /accountId,/);
  assert.match(segment, /platformRole: isPlatformSuperAdmin \? "SUPER_ADMIN" : "USER"/);
  assert.match(segment, /listMyShops\(db, tgId\)/);
  const listStart = api.indexOf('async function listMyShops');
  const listEnd = api.indexOf('// Tarifni bitta', listStart);
  const listSegment = api.slice(listStart, listEnd);
  assert.match(listSegment, /eq\("role", "OWNER"\)/);
});

test('Astra-6b live platform adapter sends only opaque session + web mode and no Telegram/shop role claims', async () => {
  const { createLivePlatformAdapter } = await load('web/services/live/platform.js');
  const calls = [];
  const adapter = createLivePlatformAdapter({
    endpoint: 'https://api.example/platform-api', tokenStore: { get: () => 'opaque-platform-session-token' },
    fetchImpl: async (_url, init) => { calls.push(init); return { ok: true, status: 200, json: async () => ({ isSuperAdmin: false, myShops: [] }) }; },
  });
  const result = await adapter.invoke('platform_boot', {}, { requestId: 'p-1' });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0].body);
  assert.deepEqual(body, { action: 'platform_boot', payload: {}, clientMode: 'web' });
  assert.equal(calls[0].headers.authorization, 'UStoreSession opaque-platform-session-token');
  assert.equal(calls[0].headers['x-request-id'], 'p-1');
  assert.equal(body.initData, undefined);
  assert.equal(body.shopId, undefined);
  assert.equal(body.role, undefined);
  assert.equal(body.isSuperAdmin, undefined);
});

test('Astra-6b live platform adapter has no fake auth success and maps server role denial', async () => {
  const { createLivePlatformAdapter } = await load('web/services/live/platform.js');
  const noToken = createLivePlatformAdapter({ endpoint: 'https://api.example/platform-api', tokenStore: { get: () => '' }, fetchImpl: async () => assert.fail('network must not run') });
  assert.equal((await noToken.invoke('platform_boot')).error.code, 'AUTH_REQUIRED');
  assert.equal((await noToken.invoke('not_platform_action')).error.code, 'VALIDATION_ERROR');

  const denied = createLivePlatformAdapter({
    endpoint: 'https://api.example/platform-api', tokenStore: { get: () => 'opaque' },
    fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ error: 'forbidden:not_platform_super_admin' }) }),
  });
  assert.equal((await denied.invoke('platform_list_shops')).error.code, 'FORBIDDEN');
});
