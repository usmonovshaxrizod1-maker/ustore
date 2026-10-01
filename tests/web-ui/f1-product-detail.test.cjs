const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..', '..');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

test('F1 product detail controller loads public product and gallery deduplicates color images', async () => {
  const { createCatalogPort } = await import(moduleUrl('web/services/ports/catalog.js'));
  const { createMockCatalogAdapter } = await import(moduleUrl('web/services/mock/catalog.js'));
  const { createProductDetailController } = await import(moduleUrl('web/features/product/detail.js'));
  const controller = createProductDetailController({ catalogPort: createCatalogPort(createMockCatalogAdapter({ scenario: 'variant' })), productId: 'prod-hoodie' });
  const result = await controller.load();
  assert.equal(result.ok, true);
  assert.equal(result.data.product.id, 'prod-hoodie');
  assert.deepEqual(result.data.gallery.map((x) => x.src), ['https://images.example/hoodie-black.webp', 'https://images.example/hoodie-white.webp']);
});
