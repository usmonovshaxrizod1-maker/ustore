const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..', '..');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

function memoryStore() {
  let value = null;
  return { get: () => value && structuredClone(value), set: (next) => { value = structuredClone(next); }, clear: () => { value = null; } };
}

test('G3 double submit shares one in-flight order intent and one create call', async () => {
  const { createCheckoutSubmitController } = await import(moduleUrl('web/features/checkout/submit.js'));
  let creates = 0;
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  const ordersPort = { create: async ({ idempotencyKey }) => { creates++; await wait; return { ok: true, data: { id: 'o-1', status: 'PENDING', idempotencyKey } }; } };
  const paymentsPort = { start: async () => ({ ok: true, data: { status: 'PENDING', redirectUrl: 'https://pay.example/1' } }), getStatus: async () => ({ ok: true, data: { status: 'PENDING' } }) };
  const controller = createCheckoutSubmitController({ ordersPort, paymentsPort, checkoutIntent: { paymentMethod: 'CLICK' }, intentStore: memoryStore(), makeKey: (p) => `${p}:same` });
  const p1 = controller.submit();
  const p2 = controller.submit();
  release();
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(creates, 1);
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  assert.equal(controller.getState().idempotencyKey, 'order:same');
});

test('G3 unknown order result preserves idempotency key across retry and reconstructed controller', async () => {
  const { createCheckoutSubmitController } = await import(moduleUrl('web/features/checkout/submit.js'));
  const store = memoryStore();
  const keys = [];
  let attempt = 0;
  const ordersPort = { create: async ({ idempotencyKey }) => { keys.push(idempotencyKey); attempt++; return attempt === 1 ? { ok: false, error: { code: 'NETWORK_ERROR', message: 'timeout', retryable: true } } : { ok: true, data: { id: 'o-2', status: 'PENDING' } }; } };
  const paymentsPort = { start: async () => ({ ok: true, data: { status: 'PENDING' } }), getStatus: async () => ({ ok: true, data: { status: 'PENDING' } }) };
  const first = createCheckoutSubmitController({ ordersPort, paymentsPort, checkoutIntent: { paymentMethod: 'CASH' }, intentStore: store, makeKey: () => 'order:stable' });
  const failed = await first.submit();
  assert.equal(failed.ok, false);
  assert.equal(first.getState().status, 'unknown');
  const second = createCheckoutSubmitController({ ordersPort, paymentsPort, checkoutIntent: { paymentMethod: 'CASH' }, intentStore: store, makeKey: () => 'order:new-must-not-be-used' });
  const recovered = await second.retry();
  assert.equal(recovered.ok, true);
  assert.deepEqual(keys, ['order:stable', 'order:stable']);
  assert.equal(second.getState().status, 'success');
});

test('G3 payment start retry reuses separate payment idempotency key', async () => {
  const { createCheckoutSubmitController } = await import(moduleUrl('web/features/checkout/submit.js'));
  const paymentKeys = [];
  let paymentAttempt = 0; let statusChecks = 0;
  const ordersPort = { create: async () => ({ ok: true, data: { id: 'o-pay', status: 'PENDING' } }) };
  const paymentsPort = {
    start: async ({ idempotencyKey }) => { paymentKeys.push(idempotencyKey); paymentAttempt++; return paymentAttempt === 1 ? { ok: false, error: { code: 'NETWORK_ERROR', message: 'timeout', retryable: true } } : { ok: true, data: { status: 'PENDING', redirectUrl: 'https://pay.example/retry' } }; },
    getStatus: async () => { statusChecks++; return { ok: true, data: { status: 'PENDING' } }; },
  };
  const controller = createCheckoutSubmitController({ ordersPort, paymentsPort, checkoutIntent: { paymentMethod: 'PAYME' }, intentStore: memoryStore(), makeKey: (p) => `${p}:fixed` });
  assert.equal((await controller.submit()).ok, false);
  assert.equal(controller.getState().status, 'payment-unknown');
  assert.equal((await controller.retry()).ok, true);
  assert.deepEqual(paymentKeys, ['payment:fixed']);
  assert.equal(statusChecks, 1);
  assert.equal(controller.getState().status, 'payment-unknown');
});

test('G3 payment return never treats browser redirect as paid; server status is authoritative', async () => {
  const { createPaymentReturnController } = await import(moduleUrl('web/features/checkout/submit.js'));
  let status = 'PENDING';
  const paymentsPort = { getStatus: async () => ({ ok: true, data: { status } }) };
  const controller = createPaymentReturnController({ paymentsPort, orderId: 'o-3' });
  let result = await controller.load();
  assert.equal(result.ok, true);
  assert.equal(controller.getState().status, 'pending');
  status = 'PAID';
  result = await controller.refresh();
  assert.equal(result.ok, true);
  assert.equal(controller.getState().status, 'paid');
});

test('G3 source contains explicit unknown-result warning and server payment verification copy', () => {
  const src = fs.readFileSync(path.join(root, 'web/features/checkout/submit.js'), 'utf8');
  assert.match(src, /Natija aniq emas/);
  assert.match(src, /Yangi buyurtma yaratmaymiz/);
  assert.match(src, /Brauzerga qaytishning o‘zi to‘lov tasdig‘i emas/);
  assert.match(src, /idempotencyKey/);
});
