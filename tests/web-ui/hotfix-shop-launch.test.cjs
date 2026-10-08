const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const load = (file) => import(pathToFileURL(path.join(root, file)).href);

test('guest boot is handed to the Mini App once without web session data', async () => {
  const { createLiveShopPublicAdapters } = await load('web/services/live/shop-public.js');
  const adapters = createLiveShopPublicAdapters({
    endpoint: 'https://api.example/shop-api', botId: '123',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({
      shop: { id: 'shop-1', slug: 'fitcore', lifecycle: 'ACTIVE', currency: 'UZS' },
      shopContact: { name: 'Fitcore' },
      activeBanners: [{ id: 'banner-1', imageUrl: 'https://cdn.example/banner.jpg' }],
      webSession: { authenticated: false, replacementToken: 'must-not-cross-frame' },
    }) }),
  });
  const context = await adapters.context.resolve();
  assert.equal(context.ok, true);
  const boot = adapters.takeGuestBoot();
  assert.deepEqual(boot.activeBanners.map((banner) => banner.id), ['banner-1']);
  assert.equal(boot.webSession, undefined);
  assert.equal(JSON.stringify(boot).includes('must-not-cross-frame'), false);
  assert.equal(adapters.takeGuestBoot(), null);
});

test('signed-in boot is reused once only for the same session and never carries a token', async () => {
  const { createLiveShopPublicAdapters } = await load('web/services/live/shop-public.js');
  let token = 'session-one';
  let requests = 0;
  const adapters = createLiveShopPublicAdapters({
    endpoint: 'https://api.example/shop-api', botId: '123', tokenStore: { get: () => token },
    fetchImpl: async () => { requests++; return { ok: true, status: 200, json: async () => ({
      shop: { id: 'shop-1', slug: 'fitcore', lifecycle: 'ACTIVE', currency: 'UZS' },
      shopContact: { name: 'Fitcore' },
      webSession: { authenticated: true, actor: { accountId: 'user-1', displayName: 'Mijoz', shopRole: 'CUSTOMER', roleCodes: [], permissions: [] }, replacementToken: 'must-not-cross-frame' },
    }) }; },
  });
  assert.equal((await adapters.context.resolve()).ok, true);
  assert.equal(requests, 1);
  const boot = adapters.takeBoot();
  assert.equal(boot.shopContact.name, 'Fitcore');
  assert.equal(boot.webSession, undefined);
  assert.equal(adapters.takeBoot(), null);
  assert.equal((await adapters.context.resolve()).ok, true);
  token = 'another-session';
  assert.equal(adapters.takeBoot(), null);
});

test('nested production handoff route uses root assets while GitHub preview stays relative', async () => {
  const { productionWebEntry } = await load('scripts/web-entry-paths.mjs');
  const source = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8');
  const production = productionWebEntry(source);
  for (const asset of ['styles/index.css', 'config.public.js', 'app.js', 'launch-boot.js']) {
    assert.ok(source.includes(`./${asset}`));
    assert.ok(production.includes(`/${asset}`));
    assert.equal(production.includes(`./${asset}`), false);
  }
  assert.equal(fs.readFileSync(path.join(root, 'dist/web/index.html'), 'utf8'), production);
});

test('desktop shell widens without changing mobile bottom navigation', () => {
  const shop = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
  const platform = fs.readFileSync(path.join(root, 'platform/platform.css'), 'utf8');
  for (const css of [shop, platform]) {
    assert.match(css, /@media\s*\(min-width:1024px\)/);
    assert.match(css, /max-width:1680px!important/);
    assert.match(css, /min-height:calc\(100dvh/);
  }
  assert.match(shop, /body\.ustore-browser-mode \.ustore-bottom-nav\{display:none!important\}/);
  assert.match(platform, /body\.ustore-browser-mode \.plat-bottom-nav\{display:none!important\}/);
});
