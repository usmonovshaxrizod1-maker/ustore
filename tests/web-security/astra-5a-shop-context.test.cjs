const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..', '..');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

test('Astra-5a separates tenant lookup from Telegram authentication', () => {
  const shared = fs.readFileSync(path.join(root, 'supabase/functions/_shared/shop-context.ts'), 'utf8');
  const api = fs.readFileSync(path.join(root, 'supabase/functions/shop-api/index.ts'), 'utf8');
  assert.match(shared, /export async function resolveShopTenant/);
  assert.match(shared, /export async function authenticateTelegramShopTenant/);
  assert.match(shared, /verifyTelegramInitData/);
  assert.match(shared, /resolveOptionalWebSession/);
  assert.match(api, /const tenantResult = await resolveShopTenant/);
  assert.match(api, /const authResult = await authenticateTelegramShopTenant/);
});

test('Astra-5a public web boot/catalog branch happens before Telegram resolve and uses explicit web client mode', () => {
  const api = fs.readFileSync(path.join(root, 'supabase/functions/shop-api/index.ts'), 'utf8');
  const publicBranch = api.indexOf('String(body?.clientMode || "").toLowerCase() === "web"');
  const branchEnd = api.indexOf('// ---- Boss-app service-to-service call', publicBranch);
  const telegramResolve = api.indexOf('const resolved = await resolveShopContext(db, req, body, BOT_TOKEN_MASTER_KEY)');
  assert.ok(publicBranch > 0 && branchEnd > publicBranch && telegramResolve > branchEnd);
  const segment = api.slice(publicBranch, branchEnd);
  assert.match(segment, /publicWebCatalog/);
  assert.match(segment, /publicWebBoot/);
  assert.match(segment, /resolveOptionalWebSession/);
  assert.doesNotMatch(segment, /decryptBotToken/);
  assert.doesNotMatch(segment, /verifyTelegramInitData/);
});

test('Astra-5a public catalog projection omits admin/import metadata and hidden products', () => {
  const api = fs.readFileSync(path.join(root, 'supabase/functions/shop-api/index.ts'), 'utf8');
  const start = api.indexOf('async function publicWebCatalog');
  const end = api.indexOf('async function publicWebBundles', start);
  const segment = api.slice(start, end);
  assert.match(segment, /row\.is_visible !== false/);
  assert.match(segment, /const \{ status: _status, is_visible: _visible, \.\.\.publicRow \} = row/);
  assert.doesNotMatch(segment, /import_batch_id/);
  assert.match(segment, /created_at,sold_count/);
});

test('Astra-5a live public adapter sends botId only as tenant locator and verifies supplied web session server-side', async () => {
  const { createLiveShopPublicAdapters } = await import(moduleUrl('web/services/live/shop-public.js'));
  const calls = [];
  const tokenStore = { get: () => 'session-token-abcdefghijklmnopqrstuvwxyz-1234567890', set() {} };
  const fetchImpl = async (_url, init) => {
    calls.push(init);
    const body = JSON.parse(init.body);
    if (body.action === 'boot') return { ok: true, status: 200, json: async () => ({ public: true, shop: { id: 's1', slug: 'fitcore', lifecycle: 'ACTIVE', currency: 'UZS', canonicalWebUrl: null }, shopContact: { name: 'Fitcore' }, logoUrl: null, webSession: { authenticated: true, accountId: 'a1' } }) };
    return { ok: true, status: 200, json: async () => ({ products: [], categories: [], webSession: { authenticated: true, accountId: 'a1' } }) };
  };
  const adapters = createLiveShopPublicAdapters({ endpoint: 'https://api.example/shop-api', botId: '12345', fetchImpl, tokenStore });
  const context = await adapters.context.resolve();
  assert.equal(context.ok, true);
  assert.equal(context.data.actor, null);
  assert.equal(context.data.capabilities.authenticatedSession, true);
  await adapters.catalog.listProducts();
  const firstBody = JSON.parse(calls[0].body);
  assert.equal(firstBody.clientMode, 'web');
  assert.equal(firstBody.botId, '12345');
  assert.match(calls[0].headers.authorization, /^UStoreSession /);
  assert.equal(firstBody.shopId, undefined);
});

test('Astra-5a public branch stays public-only even after 5b adds a separate private-web branch', () => {
  const api = fs.readFileSync(path.join(root, 'supabase/functions/shop-api/index.ts'), 'utf8');
  const start = api.indexOf('if (String(body?.clientMode || "").toLowerCase() === "web" && !(body?.uiMode === "shared" && action === "boot") && (action === "boot" || action === "get_catalog" || action === "get_web_bundles" || action === "get_web_promotion" || action === "get_web_promotions"))');
  const end = api.indexOf('// Astra-5b — authenticated premium-web customer actions', start);
  assert.ok(start > 0 && end > start);
  const branch = api.slice(start, end);
  assert.doesNotMatch(branch, /web_order_cancel|web_profile_update|web_support_send|web_cart_replace/);
  assert.match(api, /resolveShopContext\(db, req, body, BOT_TOKEN_MASTER_KEY\)/);
});

test('public web promotion requires same-shop, published, unassigned and active code', () => {
  const api = fs.readFileSync(path.join(root, 'supabase/functions/shop-api/index.ts'), 'utf8');
  const start = api.indexOf('async function publicWebPromotion(');
  const end = api.indexOf('function mapAutomaticGiftRuleForClient(', start);
  assert.ok(start > 0 && end > start);
  const block = api.slice(start, end);
  assert.match(block, /\.eq\("shop_id", shopId\)/);
  assert.match(block, /\.eq\("is_active", true\)/);
  assert.match(block, /\.eq\("is_public", true\)\.is\("issued_to_tg_id", null\)/);
  assert.match(block, /data\.starts_at/);
  assert.match(block, /data\.ends_at/);
});

test('public promotion listing excludes private and future offers', () => {
  const api = fs.readFileSync(path.join(root, 'supabase/functions/shop-api/index.ts'), 'utf8');
  const start = api.indexOf('async function publicWebPromotions(');
  const end = api.indexOf('function mapAutomaticGiftRuleForClient(', start);
  assert.ok(start > 0 && end > start);
  const block = api.slice(start, end);
  assert.match(block, /\.eq\("shop_id", shopId\)/);
  assert.match(block, /\.eq\("is_public", true\)\.is\("issued_to_tg_id", null\)/);
  assert.match(block, /starts_at\.is\.null/);
  assert.match(block, /ends_at\.is\.null/);
});
