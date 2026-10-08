const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..', '..');
const importFile = (relative) => import(pathToFileURL(path.join(root, relative)).href);

test('storefront IDs stay valid and unpredictable without crypto.randomUUID', async () => {
  const { secureUuidV4, secureFrameNonce } = await importFile('web/shared/browser-id.js');
  const cryptoRef = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) };
  const ids = new Set(Array.from({ length: 128 }, () => secureUuidV4(cryptoRef)));
  assert.equal(ids.size, 128);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(secureFrameNonce(cryptoRef), /^[0-9a-f]{64}$/);
  assert.throws(() => secureUuidV4({}), /Secure random generator/);
  assert.throws(() => secureFrameNonce({}), /Secure random generator/);
});

test('Mini App frame request works when randomUUID is absent', async () => {
  const messages = [];
  const listeners = {};
  const parent = { postMessage(message) { messages.push(message); } };
  const location = { pathname: '/ustore/', search: '?web_frame=1&bot_id=123' };
  const window = { parent, location, addEventListener(type, handler) { listeners[type] = handler; } };
  const context = {
    window, location, URL, URLSearchParams, Uint8Array, setTimeout, clearTimeout,
    document: { body: { classList: { add() {} } } },
    crypto: { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) },
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'web/shared/miniapp-frame-bridge.js'), 'utf8'), context);
  assert.equal(messages[0]?.type, 'HELLO');
  listeners.message({ source: parent, origin: 'https://shop.example', data: {
    bridge: 'ustore-miniapp-v1', kind: 'shop', type: 'INIT', nonce: 'a'.repeat(32), botId: '123', route: '/',
  } });
  const pending = window.USTORE_FRAME_BRIDGE.request('boot', {});
  await Promise.resolve();
  const request = messages.find((message) => message.type === 'REQUEST');
  assert.match(request.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  listeners.message({ source: parent, origin: 'https://shop.example', data: {
    bridge: 'ustore-miniapp-v1', kind: 'shop', type: 'RESULT', nonce: 'a'.repeat(32), id: request.id, ok: true, data: { ready: true },
  } });
  assert.equal((await pending).ready, true);
});

test('protected shop routes keep the exact return route, unsafe next values do not', async () => {
  const { shopAuthReturnTo } = await importFile('web/features/auth/return-target.js');
  assert.equal(shopAuthReturnTo({ pathname: '/orders', target: '/orders' }), '/orders');
  assert.equal(shopAuthReturnTo({ pathname: '/signin', target: '/signin', search: '?next=%2Forders%2F42&method=password' }), '/orders/42');
  assert.equal(shopAuthReturnTo({ pathname: '/signin', target: '/signin', search: '?next=https%3A%2F%2Fevil.example' }), '/profile');
  assert.equal(shopAuthReturnTo({ pathname: '/signin', target: '/signin', search: '?next=%2Fauth%2Fhandoff' }), '/profile');
});

test('guest orders route stays in the shop shell while order data remains session-gated', async () => {
  const { CUSTOMER_ROUTES } = await importFile('web/navigation/routes.js');
  assert.equal(CUSTOMER_ROUTES.find((route) => route.id === 'orders')?.auth, undefined);
  assert.equal(CUSTOMER_ROUTES.find((route) => route.id === 'order')?.auth, undefined);
});

test('all protected routes use the same profile-style sign-in actions', async () => {
  const { createCustomDomainSignInView } = await importFile('web/features/auth/origin-handoff.js');
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.listeners = {}; this.dataset = {}; this.className = ''; this.textContent = ''; }
    append(...children) { this.children.push(...children); }
    addEventListener(type, callback) { this.listeners[type] = callback; }
  }
  const doc = { createElement: (tag) => new Node(tag) };
  const calls = [];
  const controller = { begin: (method) => calls.push(method) };
  const view = createCustomDomainSignInView({ controller, state: {} }, doc);
  const nodes = (node) => [node, ...node.children.flatMap(nodes)];
  const all = nodes(view.element);
  assert.ok(all.some((node) => node.textContent === 'Profilga kirish'));
  assert.ok(!all.some((node) => node.textContent === 'Do‘konga kirish'));
  const buttons = all.filter((node) => node.tagName === 'BUTTON');
  assert.equal(buttons.length, 2);
  buttons.forEach((button) => button.listeners.click());
  assert.deepEqual(calls, ['telegram', 'password']);
});
