const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..', '..');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => map.has(k) ? map.get(k) : null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), dump: () => new Map(map) };
}

test('G1 guest cart is strictly shop-scoped and private cart data is not encoded into URL', async () => {
  const { guestCartStorageKey, createGuestCartStore } = await import(moduleUrl('web/features/cart/cart.js'));
  const storage = memoryStorage();
  const store = createGuestCartStore(storage);
  const a = { shopId: 'shop-a', lines: [{ lineKey: 'a', quantity: 1, unitPrice: 1 }], currency: 'UZS' };
  const b = { shopId: 'shop-b', lines: [{ lineKey: 'b', quantity: 1, unitPrice: 2 }], currency: 'UZS' };
  store.save('shop-a', a); store.save('shop-b', b);
  assert.notEqual(guestCartStorageKey('shop-a'), guestCartStorageKey('shop-b'));
  const loadedA = store.load('shop-a'); const loadedB = store.load('shop-b');
  assert.deepEqual({ ...loadedA, mergeKey: undefined }, { ...a, mergeKey: undefined });
  assert.deepEqual({ ...loadedB, mergeKey: undefined }, { ...b, mergeKey: undefined });
  assert.ok(loadedA.mergeKey?.length >= 16); assert.ok(loadedB.mergeKey?.length >= 16); assert.notEqual(loadedA.mergeKey, loadedB.mergeKey);
  for (const key of storage.dump().keys()) assert.equal(key.includes('?'), false);
});

test('G1 distinguishes normal, variant and bundle line keys without merging them', async () => {
  const { normalizeCart, cartLineKind } = await import(moduleUrl('web/features/cart/cart.js'));
  const cart = normalizeCart({ shopId: 's1', currency: 'UZS', lines: [
    { lineKey: 'product:p1', productId: 'p1', quantity: 1, unitPrice: 100 },
    { lineKey: 'product:p1|variant:green-l', productId: 'p1', variantId: 'green-l', quantity: 1, unitPrice: 120 },
    { lineKey: 'bundle:b1', bundleId: 'b1', quantity: 1, unitPrice: 200 },
  ] }, 's1');
  assert.deepEqual(cart.lines.map(cartLineKind), ['PRODUCT', 'VARIANT', 'BUNDLE']);
  assert.equal(new Set(cart.lines.map((row) => row.lineKey)).size, 3);
});

test('G1 controller updates quantity, removes, clears and applies promo through cart port', async () => {
  const { createCartPort } = await import(moduleUrl('web/services/ports/cart.js'));
  const { createMockCartAdapter } = await import(moduleUrl('web/services/mock/cart.js'));
  const { createCartController, createGuestCartStore } = await import(moduleUrl('web/features/cart/cart.js'));
  const controller = createCartController({
    cartPort: createCartPort(createMockCartAdapter({ scenario: 'basic' })),
    shopId: 'shop-fitcore-demo', guestStore: createGuestCartStore(memoryStorage()), authenticated: true,
  });
  const loaded = await controller.load();
  assert.equal(loaded.ok, true);
  assert.equal(controller.getState().cart.lines[0].quantity, 1);
  await controller.setQuantity('product:prod-protein', 2);
  assert.equal(controller.getState().cart.lines[0].quantity, 2);
  assert.equal(controller.getState().quote.gift.eligible, true);
  const promo = await controller.applyPromo('DEMO10');
  assert.equal(promo.ok, true);
  assert.ok(controller.getState().quote.discounts > 0);
  await controller.removeLine('product:prod-protein');
  assert.equal(controller.getState().cart.lines.length, 0);
  await controller.clear();
  assert.equal(controller.getState().cart.lines.length, 0);
});

test('product add-line keeps simple and selected variants separate in guest storage without private server calls', async () => {
  const { createCartController, createGuestCartStore } = await import(moduleUrl('web/features/cart/cart.js'));
  const storage = memoryStorage();
  const unexpected = async () => { throw new Error('guest flow must not call private cart server'); };
  const controller = createCartController({
    cartPort: { load:unexpected, mergeGuest:unexpected, addLine:unexpected, updateLine:unexpected, clear:unexpected, quote:unexpected },
    shopId:'shop-a', guestStore:createGuestCartStore(storage), authenticated:false,
  });
  assert.equal((await controller.addLine({ productId:'p1', quantity:1, name:'Oddiy' })).ok, true);
  assert.equal((await controller.addLine({ productId:'p1', size:'L', color:'Qora', quantity:1, name:'Variant' })).ok, true);
  assert.equal((await controller.addLine({ productId:'p1', size:'L', color:'Qora', quantity:1, name:'Variant' })).ok, true);
  const lines = controller.getState().cart.lines;
  assert.equal(lines.length, 2);
  assert.equal(lines.find((line) => line.size === 'L').quantity, 2);
  assert.deepEqual(createGuestCartStore(storage).load('shop-a').lines, lines);
});

test('authenticated cart hydrates server identifiers with live selected-variant presentation', async () => {
  const { createCartController } = await import(moduleUrl('web/features/cart/cart.js'));
  const product = JSON.parse(fs.readFileSync(path.join(root, 'web/fixtures/catalog/product-variant.json'), 'utf8')).products[0];
  const rawCart = { shopId:'shop-a', currency:'UZS', lines:[{ productId:product.id, size:'L', color:'Qora', quantity:1 }] };
  const controller = createCartController({
    cartPort:{ load:async()=>({ok:true,data:rawCart}), mergeGuest:async()=>({ok:true,data:rawCart}), addLine:async()=>({ok:true,data:rawCart}), updateLine:async()=>({ok:true,data:rawCart}), clear:async()=>({ok:true,data:{cleared:true}}), quote:async()=>({ok:true,data:{subtotal:339000,total:339000}}) },
    catalogPort:{ getProduct:async({productId})=>({ok:productId===product.id,data:product}) },
    shopId:'shop-a', authenticated:true,
  });
  assert.equal((await controller.load()).ok, true);
  const line = controller.getState().cart.lines[0];
  assert.equal(line.kind, 'VARIANT');
  assert.equal(line.name, 'Premium Hoodie Demo');
  assert.equal(line.optionLabel, 'Qora · L');
  assert.equal(line.unitPrice, 339000);
  assert.equal(line.imageUrl, 'https://images.example/hoodie-black.webp');
});

test('G1 tier progress uses server quote shape and computes only presentation progress', async () => {
  const { normalizeTierProgress } = await import(moduleUrl('web/features/cart/cart.js'));
  const tier = normalizeTierProgress({ currentSubtotal: 750000, steps: [
    { threshold: 500000, percent: 2 }, { threshold: 1000000, percent: 3 }, { threshold: 2000000, percent: 5 },
  ] });
  assert.equal(tier.currentPercent, 2);
  assert.equal(tier.next.percent, 3);
  assert.equal(tier.remaining, 250000);
  assert.equal(tier.progress, 50);
});

test('G1 UI source includes promo, gift, tier progress, remove and clear states', () => {
  const source = fs.readFileSync(path.join(root, 'web/features/cart/cart.js'), 'utf8');
  assert.match(source, /Promo-kod/);
  assert.match(source, /Sovg‘a:/);
  assert.match(source, /Bosqichli chegirma/);
  assert.match(source, /<progress>|createElement\('progress'\)/);
  assert.match(source, /Olib tashlash/);
  assert.match(source, /Savatchani tozalash/);
});
