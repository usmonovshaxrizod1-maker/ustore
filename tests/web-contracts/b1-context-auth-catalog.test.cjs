const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..', '..');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

async function imports() {
  const ports = await import(moduleUrl('web/services/ports/index.js'));
  const mocks = await import(moduleUrl('web/services/mock/index.js'));
  return { ports, mocks };
}

test('B1 context fixtures cover guest/customer/owner/manager/limited staff/frozen shop and satisfy contract', async () => {
  const { ports, mocks } = await imports();
  const scenarios = ['guest', 'customer', 'owner', 'manager', 'staffLimited', 'frozen'];
  for (const scenario of scenarios) {
    const port = ports.createContextPort(mocks.createMockContextAdapter({ scenario }));
    const result = await port.resolve();
    assert.equal(result.ok, true, scenario);
    assert.equal(ports.validateContext(result.data), null, scenario);
  }
});

test('manager and limited staff permissions remain distinct and OWNER uses wildcard without pretending MANAGER is OWNER', async () => {
  const { ports, mocks } = await imports();
  const manager = await ports.createContextPort(mocks.createMockContextAdapter({ scenario: 'manager' })).resolve();
  const staff = await ports.createContextPort(mocks.createMockContextAdapter({ scenario: 'staffLimited' })).resolve();
  const owner = await ports.createContextPort(mocks.createMockContextAdapter({ scenario: 'owner' })).resolve();
  assert.deepEqual(manager.data.actor.roleCodes, ['MANAGER']);
  assert.equal(manager.data.actor.shopRole, 'STAFF');
  assert.equal(manager.data.actor.permissions.includes('marketing.manage'), true);
  assert.deepEqual(staff.data.actor.permissions, ['stock.view', 'stock.manage']);
  assert.deepEqual(owner.data.actor.permissions, ['*']);
});

test('frozen shop keeps context readable but checkout/domain capabilities disabled in fixture', async () => {
  const { ports, mocks } = await imports();
  const result = await ports.createContextPort(mocks.createMockContextAdapter({ scenario: 'frozen' })).resolve();
  assert.equal(result.data.shop.lifecycle, 'FROZEN');
  assert.equal(result.data.capabilities.checkout, false);
  assert.equal(result.data.capabilities.domains, false);
});

test('auth mock rejects unknown credentials, supports deterministic demo login and never returns plaintext password', async () => {
  const { ports, mocks } = await imports();
  const auth = ports.createAuthPort(mocks.createMockAuthAdapter());
  const bad = await auth.signInPassword({ login: 'demo.customer', password: 'wrong' });
  assert.equal(bad.ok, false);
  assert.equal(bad.error.code, 'INVALID_CREDENTIALS');
  const good = await auth.signInPassword({ login: 'demo.customer', password: 'DemoOnly-123!' });
  assert.equal(good.ok, true);
  assert.equal(good.data.actor.accountId, 'acct-customer-001');
  assert.equal(JSON.stringify(good).includes('DemoOnly-123!'), false);
  const session = await auth.getSession();
  assert.equal(session.ok, true);
  assert.equal(session.data.actor.accountId, 'acct-customer-001');
});

test('auth mock rejects absolute/external return URLs in local Telegram/credential flow', async () => {
  const { ports, mocks } = await imports();
  const auth = ports.createAuthPort(mocks.createMockAuthAdapter());
  for (const result of [
    await auth.beginTelegramSignIn({ returnTo: 'https://evil.example/x' }),
    await auth.beginCredentialIssue({ returnTo: '//evil.example/x', mode: 'RESET' }),
  ]) {
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'VALIDATION_ERROR');
  }
  const safe = await auth.beginTelegramSignIn({ returnTo: '/catalog/prod-protein' });
  assert.equal(safe.ok, true);
  assert.match(safe.data.redirectUrl, /^https:\/\/auth\.example\//);
});

test('catalog fixture uses existing get_catalog public field names and returns hidden-filtered public products only', async () => {
  const { ports, mocks } = await imports();
  const catalog = ports.createCatalogPort(mocks.createMockCatalogAdapter({ scenario: 'hiddenFiltered' }));
  const result = await catalog.listProducts();
  assert.equal(result.ok, true);
  assert.equal(result.data.items.length, 1);
  const product = result.data.items[0];
  for (const key of ['id','sku','name','name_ru','price','old_price','stock','category_id','status','img','thumb_img','description','description_ru','is_featured','is_visible','sort_order','sizes','variants','sold_count','created_at','import_batch_id','badge']) {
    assert.equal(Object.prototype.hasOwnProperty.call(product, key), true, key);
  }
  assert.equal(product.is_visible, true);
});

test('catalog search/getProduct are deterministic and NOT_FOUND does not reveal hidden products', async () => {
  const { ports, mocks } = await imports();
  const catalog = ports.createCatalogPort(mocks.createMockCatalogAdapter());
  const search = await catalog.search({ query: 'protein' });
  assert.equal(search.ok, true);
  assert.deepEqual(search.data.items.map((p) => p.id), ['prod-protein']);
  const product = await catalog.getProduct({ productId: 'prod-protein' });
  assert.equal(product.ok, true);
  const missing = await catalog.getProduct({ productId: 'does-not-exist' });
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, 'NOT_FOUND');
  const bundles = await catalog.listBundles();
  assert.equal(bundles.ok, true);
  assert.equal(bundles.data.items[0].id, 'bundle-starter');
  const bundle = await catalog.getBundle({ bundleId: 'bundle-starter' });
  assert.equal(bundle.ok, true);
  assert.equal(bundle.data.savings, 29000);
});

test('Result helpers expose only stable UI error codes', async () => {
  const { ports } = await imports();
  const unknown = ports.fail('SQL_STACK_TRACE', 'safe fallback');
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error.code, 'CONTRACT_MISMATCH');
  assert.equal(ports.isResult(unknown), true);
  assert.equal(ports.isResult(ports.ok({ x: 1 })), true);
});
