const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../../web/shared/miniapp-frame-bridge.js'), 'utf8');

function openFrame(pathname) {
  const messages = [];
  const listeners = new Map();
  const parent = { postMessage: (message) => messages.push(message) };
  const window = {
    parent,
    addEventListener: (type, listener) => listeners.set(type, listener),
  };
  const document = { body: { classList: { add() {} }, dataset: {} } };
  vm.runInNewContext(source, {
    window, document, location: { pathname, search: '?web_frame=1' },
    URL, URLSearchParams, Promise, Map, setTimeout, clearTimeout,
  });
  return { window, parent, messages, listeners };
}

test('same-origin platform UI announces platform kind and accepts parent INIT', async () => {
  const frame = openFrame('/platform-ui/');
  assert.equal(frame.window.USTORE_FRAME_BRIDGE?.kind, 'platform');
  assert.equal(frame.messages[0]?.type, 'HELLO');
  assert.equal(frame.messages[0]?.kind, 'platform');
  frame.listeners.get('message')({
    source: frame.parent,
    origin: 'https://ustr.uz',
    data: { bridge: 'ustore-miniapp-v1', type: 'INIT', kind: 'platform', nonce: 'a'.repeat(24), route: '/platform/app', authenticated: true },
  });
  await frame.window.USTORE_FRAME_BRIDGE.ready;
  assert.equal(frame.window.USTORE_FRAME_BRIDGE.initialRoute, '/platform/app');
});

test('Telegram platform and shop Mini App keep their distinct frame kinds', () => {
  assert.equal(openFrame('/ustore/platform/').window.USTORE_FRAME_BRIDGE?.kind, 'platform');
  assert.equal(openFrame('/ustore/').window.USTORE_FRAME_BRIDGE?.kind, 'shop');
});
