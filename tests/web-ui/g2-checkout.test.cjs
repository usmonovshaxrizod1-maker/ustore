const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..', '..');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

test('G2 validates contact/address/delivery/payment/consent and pickup does not require address', async () => {
  const { validateCheckoutDraft } = await import(moduleUrl('web/features/checkout/checkout.js'));
  const bad = validateCheckoutDraft({ contactName: '', phone: '12', deliveryId: '', paymentMethod: '', consent: false });
  assert.equal(bad.valid, false);
  assert.ok(bad.fieldErrors.contactName && bad.fieldErrors.phone && bad.fieldErrors.deliveryId && bad.fieldErrors.paymentMethod && bad.fieldErrors.consent);
  const pickup = validateCheckoutDraft({ contactName: 'Ali', phone: '+998 90 123 45 67', deliveryId: 'PICKUP', address: '', paymentMethod: 'CASH', consent: true });
  assert.equal(pickup.valid, true);
});

test('G2 delivery selection requotes and total comes from server-authoritative quote', async () => {
  const { createCheckoutController } = await import(moduleUrl('web/features/checkout/checkout.js'));
  const { createCartPort } = await import(moduleUrl('web/services/ports/cart.js'));
  const { createMockCartAdapter } = await import(moduleUrl('web/services/mock/cart.js'));
  const cart = { shopId: 'shop-fitcore-demo', currency: 'UZS', lines: [{ lineKey: 'product:p1', productId: 'p1', quantity: 1, unitPrice: 100000 }] };
  const controller = createCheckoutController({ cartPort: createCartPort(createMockCartAdapter()), cart });
  let result = await controller.load();
  assert.equal(result.ok, true);
  assert.equal(controller.getState().quote.total, 100000);
  result = await controller.setField('deliveryId', 'TASHKENT');
  assert.equal(result.ok, true);
  assert.equal(controller.getState().quote.delivery, 25000);
  assert.equal(controller.getState().quote.total, 125000);
  assert.equal(controller.getState().quote.serverAuthoritative, true);
});

test('G2 rejects quote that is not explicitly server authoritative', async () => {
  const { createCheckoutController } = await import(moduleUrl('web/features/checkout/checkout.js'));
  const cart = { shopId: 's1', lines: [] };
  const cartPort = { quote: async () => ({ ok: true, data: { total: 1, serverAuthoritative: false } }) };
  const controller = createCheckoutController({ cartPort, cart });
  const result = await controller.load();
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'CONTRACT_MISMATCH');
});

test('G2 checkout intent cannot be built without valid fields and an authoritative quote', async () => {
  const { createCheckoutController } = await import(moduleUrl('web/features/checkout/checkout.js'));
  const cart = { shopId: 's1', lines: [{ lineKey: 'x', quantity: 1, unitPrice: 5 }] };
  const cartPort = { quote: async () => ({ ok: true, data: { currency: 'UZS', subtotal: 5, discounts: 0, delivery: 0, total: 5, serverAuthoritative: true, deliveryOptions: [{ id: 'PICKUP', label: 'Pickup', price: 0 }], paymentMethods: [{ id: 'CASH', label: 'Cash' }] } }) };
  const controller = createCheckoutController({ cartPort, cart });
  await controller.load();
  assert.equal(controller.buildCheckoutIntent().ok, false);
  await controller.setField('contactName', 'Ali');
  await controller.setField('phone', '+998901234567');
  await controller.setField('deliveryId', 'PICKUP');
  await controller.setField('paymentMethod', 'CASH');
  await controller.setField('consent', true);
  const intent = controller.buildCheckoutIntent();
  assert.equal(intent.ok, true);
  assert.equal(intent.data.quoteSnapshot.total, 5);
});

test('G2 UI source explicitly labels server quote and price/stock conflict handling', () => {
  const src = fs.readFileSync(path.join(root, 'web/features/checkout/checkout.js'), 'utf8');
  assert.match(src, /Server hisobi/);
  assert.match(src, /Narx yoki qoldiq o‘zgardi/);
  assert.match(src, /server quote’dan olinadi/);
  assert.doesNotMatch(src, /localCartSubtotal/);
});
