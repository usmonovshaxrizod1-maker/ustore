const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..', '..');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;
const json = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

test('F2 preserves Mini App default rule: first color + first available size, then color updates image/price/stock/SKU together', async () => {
  const { createVariantSelection } = await import(moduleUrl('web/features/product/variant-model.js'));
  const product = json('web/fixtures/catalog/product-variant.json').products[0];
  const selection = createVariantSelection(product);
  const initial = selection.getState();
  assert.equal(initial.color, 'Qora');
  assert.equal(initial.size, 'L');
  assert.equal(initial.price, 339000);
  assert.equal(initial.stock, 4);
  assert.equal(initial.sku, 'HD-BLK-L');
  assert.equal(initial.image, 'https://images.example/hoodie-black.webp');
  const white = selection.selectColor('Oq');
  assert.equal(white.color, 'Oq');
  assert.equal(white.size, 'L');
  assert.equal(white.price, 349000);
  assert.equal(white.stock, 2);
  assert.equal(white.sku, 'HD-WHT-L');
  assert.equal(white.image, 'https://images.example/hoodie-white.webp');
});

test('F2 refuses out-of-stock exact combination and addToCart uses selected line identity', async () => {
  const { createCatalogPort } = await import(moduleUrl('web/services/ports/catalog.js'));
  const { createMockCatalogAdapter } = await import(moduleUrl('web/services/mock/catalog.js'));
  const { createProductDetailController } = await import(moduleUrl('web/features/product/detail.js'));
  let line = null;
  const controller = createProductDetailController({ catalogPort: createCatalogPort(createMockCatalogAdapter({ scenario: 'variant' })), productId: 'prod-hoodie', onAddToCart: (value) => { line = value; } });
  await controller.load();
  controller.selectSize('M');
  assert.equal(controller.getSelection().canAdd, false);
  assert.equal(controller.addToCart().ok, false);
  controller.selectSize('L');
  const added = await controller.addToCart();
  assert.equal(added.ok, true);
  assert.deepEqual(line, {
    productId: 'prod-hoodie', size: 'L', color: 'Qora', quantity: 1, sku: 'HD-BLK-L',
    name: 'Premium Hoodie Demo', unitPrice: 339000, imageUrl: 'https://images.example/hoodie-black.webp', optionLabel: 'Qora · L',
  });
});
