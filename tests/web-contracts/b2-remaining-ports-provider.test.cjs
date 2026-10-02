const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..', '..');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

async function imports() {
  return {
    ports: await import(moduleUrl('web/services/ports/index.js')),
    mocks: await import(moduleUrl('web/services/mock/index.js')),
    provider: await import(moduleUrl('web/services/provider.js')),
  };
}

test('B2 remaining ports construct and expose required methods', async () => {
  const { ports, mocks } = await imports();
  const pairs = [
    [ports.createCartPort, mocks.createMockCartAdapter(), ['load','mergeGuest','addLine','updateLine','clear','quote']],
    [ports.createOrdersPort, mocks.createMockOrdersAdapter(), ['create','listMine','getMine','cancelMine','confirmReceived']],
    [ports.createPaymentsPort, mocks.createMockPaymentsAdapter(), ['start','getStatus']],
    [ports.createProfilePort, mocks.createMockProfileAdapter(), ['get','update','listFavorites','setFavorite']],
    [ports.createSupportPort, mocks.createMockSupportAdapter(), ['listThreads','getMessages','sendMessage','uploadAttachment']],
    [ports.createAdminPort, mocks.createMockAdminAdapter(), ['invoke']],
    [ports.createDomainsPort, mocks.createMockDomainsAdapter(), ['list','add','verify','setPrimary','remove']],
    [ports.createPlatformPort, mocks.createMockPlatformAdapter(), ['invoke']],
  ];
  for (const [factory, adapter, methods] of pairs) {
    const port = factory(adapter);
    for (const method of methods) assert.equal(typeof port[method], 'function', method);
  }
});

test('cart quote is server-authoritative in fixture and conflict uses stable Result error', async () => {
  const { ports, mocks } = await imports();
  const cart = ports.createCartPort(mocks.createMockCartAdapter());
  const loaded = await cart.load();
  const quoted = await cart.quote({ cart: loaded.data });
  assert.equal(quoted.ok, true);
  assert.equal(quoted.data.serverAuthoritative, true);
  const conflict = await cart.quote({ cart: loaded.data, promoCode: 'PRICE_CHANGED' });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.error.code, 'CONFLICT');
});

test('orders and payments dedupe retries by idempotency key', async () => {
  const { ports, mocks } = await imports();
  const orders = ports.createOrdersPort(mocks.createMockOrdersAdapter());
  const first = await orders.create({ checkout: { total: 1 }, idempotencyKey: 'idem-order-1' });
  const second = await orders.create({ checkout: { total: 999 }, idempotencyKey: 'idem-order-1' });
  assert.deepEqual(second, first);
  const payments = ports.createPaymentsPort(mocks.createMockPaymentsAdapter());
  const p1 = await payments.start({ orderId: 'ord-demo-002', method: 'DEMO', idempotencyKey: 'idem-pay-1' });
  const p2 = await payments.start({ orderId: 'ord-demo-other', method: 'OTHER', idempotencyKey: 'idem-pay-1' });
  assert.deepEqual(p2, p1);
  assert.equal((await payments.getStatus({ orderId: 'ord-demo-002' })).data.status, 'PENDING');
});

test('support retry with same clientMessageId returns same message instead of duplicate', async () => {
  const { ports, mocks } = await imports();
  const support = ports.createSupportPort(mocks.createMockSupportAdapter());
  const a = await support.sendMessage({ threadId: 'thread-demo-001', text: 'Salom', clientMessageId: 'client-1' });
  const b = await support.sendMessage({ threadId: 'thread-demo-001', text: 'Boshqa text', clientMessageId: 'client-1' });
  assert.equal(a.ok, true);
  assert.deepEqual(b, a);
});

test('domain mock only accepts .example and inactive domain cannot become primary', async () => {
  const { ports, mocks } = await imports();
  const domains = ports.createDomainsPort(mocks.createMockDomainsAdapter());
  const bad = await domains.add({ hostname: 'real-shop.uz' });
  assert.equal(bad.ok, false);
  assert.equal(bad.error.code, 'VALIDATION_ERROR');
  const added = await domains.add({ hostname: 'merchant.example' });
  assert.equal(added.ok, true);
  assert.equal(added.data.status, 'PENDING_DNS');
  const blocked = await domains.setPrimary({ domainId: added.data.id });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error.code, 'DOMAIN_NOT_VERIFIED');
  assert.equal(JSON.stringify(added).includes('.uz'), false);
});

test('shop owner does not gain platform super-admin via platform mock', async () => {
  const { ports, mocks } = await imports();
  const platform = ports.createPlatformPort(mocks.createMockPlatformAdapter({ role: 'owner' }));
  const result = await platform.invoke('admin_list_shops');
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'FORBIDDEN');
});

test('production runtime refuses mock provider even when caller explicitly asks for it', async () => {
  const { provider } = await imports();
  assert.throws(() => provider.createServiceProvider({ runtime: 'production', mode: 'mock' }), /taqiqlangan/);
  const local = provider.createLocalDemoProvider({ contextScenario: 'manager' });
  assert.equal(local.mode, 'mock');
  assert.equal(local.runtime, 'local-demo');
  const context = await local.context.resolve();
  assert.equal(context.ok, true);
  assert.deepEqual(context.data.actor.roleCodes, ['MANAGER']);
});

test('production/live provider requires actual live adapters and never silently falls back to mock', async () => {
  const { provider } = await imports();
  assert.throws(() => provider.createServiceProvider({ runtime: 'production', mode: 'live' }), /Live adapterlar hali ulanmagan/);
});
