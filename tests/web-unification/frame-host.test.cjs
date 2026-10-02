const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const miniOrigin = 'https://usmonovshaxrizod1-maker.github.io';

function fakeBrowser() {
  const listeners = new Map();
  const sent = [];
  const frameWindow = { postMessage(message, origin) { sent.push({ message, origin }); } };
  const create = (tag) => ({
    tagName: tag, children: [], attributes: {}, className: '', src: '', contentWindow: tag === 'iframe' ? frameWindow : null,
    append(child) { this.children.push(child); }, setAttribute(name, value) { this.attributes[name] = value; },
  });
  return {
    sent, frameWindow,
    window: { addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name) { listeners.delete(name); } },
    document: { createElement: create },
    message(origin, data, source = frameWindow) { return listeners.get('message')?.({ origin, data, source }); },
  };
}

test('Shop browser frame uses the actual Mini App source and keeps auth in the host origin', async () => {
  const browser = fakeBrowser();
  const oldWindow = global.window;
  const oldDocument = global.document;
  global.window = browser.window;
  global.document = browser.document;
  try {
    const { createMiniAppFrameHost } = await import(pathToFileURL(path.join(root, 'web/shared/frame-host.js')).href);
    const requests = [];
    const tokenStore = { get: () => 'session-secret', set() {} };
    const host = createMiniAppFrameHost({
      kind: 'shop', route: '/catalog', tenant: { botId: '123456', shopName: 'Fitcore' }, viewerKey: '123e4567-e89b-42d3-a456-426614174000',
      runtime: { endpoints: { shop: 'https://db.example/functions/v1/shop-api' }, tokenStore },
      fetchImpl: async (url, request) => {
        requests.push({ url, request });
        return { ok: true, json: async () => ({ products: [], webSession: { replacementToken: null, accountId: 'private' } }) };
      },
    });
    const frame = host.element.children[0];
    assert.equal(new URL(frame.src).pathname, '/ustore/');
    assert.equal(new URL(frame.src).searchParams.get('bot_id'), '123456');
    assert.equal(new URL(frame.src).searchParams.get('viewer'), '123e4567-e89b-42d3-a456-426614174000');
    assert.equal(frame.attributes.sandbox.includes('allow-scripts'), true);
    await browser.message('https://evil.example', { bridge: 'ustore-miniapp-v1', kind: 'shop', type: 'HELLO' });
    assert.equal(browser.sent.length, 0);
    await browser.message(miniOrigin, { bridge: 'ustore-miniapp-v1', kind: 'shop', type: 'HELLO' });
    const init = browser.sent[0].message;
    assert.equal(init.route, '/catalog');
    assert.equal(init.botId, '123456');
    assert.equal(JSON.stringify(init).includes('session-secret'), false);
    await browser.message(miniOrigin, { bridge: 'ustore-miniapp-v1', kind: 'shop', type: 'REQUEST', nonce: 'bad', id: 'wrong', action: 'boot' });
    assert.equal(requests.length, 0);
    await browser.message(miniOrigin, { bridge: 'ustore-miniapp-v1', kind: 'shop', type: 'REQUEST', nonce: init.nonce, id: 'valid', action: 'get_catalog', payload: { botId: '999999' } });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].request.headers.authorization, 'UStoreSession session-secret');
    const body = JSON.parse(requests[0].request.body);
    assert.equal(body.botId, '123456');
    assert.equal(body.payload.botId, '999999');
    const result = browser.sent.at(-1).message;
    assert.equal(result.ok, true);
    assert.equal(result.data.webSession, undefined);
    assert.equal(JSON.stringify(result).includes('session-secret'), false);
    host.destroy();
  } finally {
    global.window = oldWindow;
    global.document = oldDocument;
  }
});

test('both browser entries load the real Mini App scripts through one frame bridge', () => {
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(read('index.html'), /web\/shared\/miniapp-frame-bridge\.js/);
  assert.match(read('index.html'), /ustore-shop-app\.js/);
  assert.match(read('platform/index.html'), /web\/shared\/miniapp-frame-bridge\.js/);
  assert.match(read('platform/index.html'), /platform-app\.js/);
  assert.match(read('web/app.js'), /createMiniAppFrameHost/);
  assert.match(read('web/_headers'), /frame-src https:\/\/usmonovshaxrizod1-maker\.github\.io/);
  assert.match(read('web/_headers'), /script-src 'self'/);
  const host = read('web/app.js');
  assert.match(host, /mount\(view\.element\);\s*sharedFrame =/);
  assert.match(host, /if \(sharedFrame && node !== sharedFrame\.view\.element\) \{\s*sharedFrame\.view\.destroy\(\)/);
});

test('guest campaign browsing uses public projections without a session', async () => {
  const browser = fakeBrowser();
  const oldWindow = global.window;
  const oldDocument = global.document;
  global.window = browser.window;
  global.document = browser.document;
  try {
    const { createMiniAppFrameHost } = await import(pathToFileURL(path.join(root, 'web/shared/frame-host.js')).href);
    const calls = [];
    const host = createMiniAppFrameHost({
      kind: 'shop', tenant: { botId: '123456' }, viewerKey: '123e4567-e89b-42d3-a456-426614174000',
      runtime: { endpoints: { shop: 'https://db.example/functions/v1/shop-api' }, tokenStore: { get: () => '' } },
      fetchImpl: async (_url, request) => {
        const action = JSON.parse(request.body).action;
        calls.push(action);
        return { ok: true, json: async () => action === 'get_web_bundles'
          ? { bundles: [{ id: 'bundle-1', name: 'Bundle' }] }
          : { promotions: [{ id: 'promo-1', name: 'Promo' }] } };
      },
    });
    await browser.message(miniOrigin, { bridge: 'ustore-miniapp-v1', kind: 'shop', type: 'HELLO' });
    const { nonce } = browser.sent[0].message;
    await browser.message(miniOrigin, { bridge: 'ustore-miniapp-v1', kind: 'shop', type: 'REQUEST', nonce, id: 'campaigns', action: 'get_marketing_campaigns' });
    assert.deepEqual(calls.sort(), ['get_web_bundles', 'get_web_promotions']);
    assert.deepEqual(browser.sent.at(-1).message.data.bundles.map((item) => item.id), ['bundle-1']);
    assert.deepEqual(browser.sent.at(-1).message.data.promotions.map((item) => item.id), ['promo-1']);
    host.destroy();
  } finally {
    global.window = oldWindow;
    global.document = oldDocument;
  }
});
