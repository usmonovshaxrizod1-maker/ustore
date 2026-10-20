const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const load = () => import(pathToFileURL(path.join(root, 'web/services/live/shop-public.js')).href);
const response = data => ({ ok: true, status: 200, json: async () => data });
const boot = {
  shop: { id: 'shop-1', slug: 'shop-1', lifecycle: 'ACTIVE', currency: 'UZS' },
  shopContact: { name: 'Shop one' }, webSession: null,
};
const gate = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('first guest catalogue starts alongside boot and is handed off once, without a second request', async () => {
  const { createLiveShopPublicAdapters } = await load();
  const catalogGate = gate(), bootGate = gate(), calls = [];
  const adapters = createLiveShopPublicAdapters({
    endpoint: 'https://api.example/shop-api', botId: '123',
    fetchImpl: async (_, options) => {
      const body = JSON.parse(options.body); calls.push(body.action);
      return response(await (body.action === 'boot' ? bootGate.promise : catalogGate.promise));
    },
  });
  adapters.preloadCatalog();
  adapters.preloadCatalog();
  const context = adapters.context.resolve();
  assert.deepEqual(calls, ['get_catalog', 'boot'], 'both reads start before either resolves');
  bootGate.resolve(boot);
  assert.equal((await context).ok, true);
  const handoff = adapters.takeStartupCatalog();
  catalogGate.resolve({ products: [{ id: 'p1' }], categories: [], webSession: { replacementToken: 'private' } });
  assert.deepEqual(await handoff, { products: [{ id: 'p1' }], categories: [] });
  assert.equal(await adapters.takeStartupCatalog(), null);
  assert.deepEqual(calls, ['get_catalog', 'boot']);
});

test('admin startup is not replaced by a guest catalogue or parallel token rotation', async () => {
  const { createLiveShopPublicAdapters } = await load();
  let calls = 0;
  const adapters = createLiveShopPublicAdapters({
    endpoint: 'https://api.example/shop-api', botId: '123',
    tokenStore: { get: () => 'owner-session' },
    fetchImpl: async () => { calls++; return response({ products: [] }); },
  });
  adapters.preloadCatalog();
  assert.equal(await adapters.takeStartupCatalog(), null);
  assert.equal(calls, 0);
});

test('guest prefetch cannot cross a login that occurs while its response is pending', async () => {
  const { createLiveShopPublicAdapters } = await load();
  const pending = gate();
  let token = '';
  const adapters = createLiveShopPublicAdapters({
    endpoint: 'https://api.example/shop-api', botId: '123',
    tokenStore: { get: () => token, set: value => { token = value; } },
    fetchImpl: async () => response(await pending.promise),
  });
  adapters.preloadCatalog();
  const handoff = adapters.takeStartupCatalog();
  token = 'signed-in';
  pending.resolve({ products: [{ id: 'stale' }], webSession: { replacementToken: 'wrong-session' } });
  assert.equal(await handoff, null);
  assert.equal(token, 'signed-in');
});

test('a failed warm-up does not poison the ordinary catalogue retry', async () => {
  const { createLiveShopPublicAdapters } = await load();
  let calls = 0;
  const adapters = createLiveShopPublicAdapters({
    endpoint: 'https://api.example/shop-api', botId: '123',
    fetchImpl: async () => {
      if (++calls === 1) throw new Error('offline');
      return response({ products: [{ id: 'fresh' }], categories: [] });
    },
  });
  adapters.preloadCatalog();
  assert.equal(await adapters.takeStartupCatalog(), null);
  const result = await adapters.catalog.listProducts();
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
});

test('prefetched data is isolated by shop and expires instead of persisting stale stock', async () => {
  const { createLiveShopPublicAdapters } = await load();
  const create = botId => createLiveShopPublicAdapters({
    endpoint: 'https://api.example/shop-api', botId,
    fetchImpl: async (_, options) => response({ products: [{ id: JSON.parse(options.body).botId }], categories: [] }),
  });
  const first = create('111'), second = create('222');
  first.preloadCatalog(); second.preloadCatalog();
  assert.equal((await first.takeStartupCatalog()).products[0].id, '111');
  assert.equal((await second.takeStartupCatalog()).products[0].id, '222');
  const now = Date.now;
  try {
    Date.now = () => 1000;
    first.preloadCatalog();
    Date.now = () => 31000;
    assert.equal(await first.takeStartupCatalog(), null);
  } finally { Date.now = now; }
});

test('Telegram SDK cannot block a web frame, but remains ordered for real Telegram launches', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(match => match[1].includes('telegram-web-app.js'))?.[1];
  assert.ok(script, 'conditional SDK loader is present');
  function run(search, hash, framed) {
    const writes = [], window = {};
    window.parent = framed ? {} : window;
    vm.runInNewContext(script, { URLSearchParams, window, location: { search, hash }, document: { write: text => writes.push(text) } });
    return writes;
  }
  assert.deepEqual(run('?web_frame=1&bot_id=123', '', true), []);
  for (const writes of [run('?bot_id=123', '#tgWebAppData=signed', false), run('?web_frame=1', '#tgWebAppData=signed', true), run('', '', false)]) {
    assert.equal(writes.length, 1);
    assert.match(writes[0], /^<script defer src="https:\/\/telegram\.org\/js\/telegram-web-app\.js"><\/script>$/);
  }
  assert.ok(html.indexOf('telegram-web-app.js') < html.indexOf('ustore-shop-app.js'));
});
