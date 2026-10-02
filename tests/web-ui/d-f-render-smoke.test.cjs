const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..', '..');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;
class FakeStyle { setProperty(name, value) { this[name] = String(value); } }
class FakeNode {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.dataset = {}; this.style = new FakeStyle(); this.className = ''; this.textContent = ''; this.value = ''; this.hidden = false; this.listeners = {}; }
  append(...items) { this.children.push(...items); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  removeAttribute(name) { delete this.attributes[name]; }
}
class FakeDocument { createElement(tag) { return new FakeNode(tag); } }

test('D-F view factories render with a minimal DOM contract without throwing', async () => {
  const doc = new FakeDocument();
  const { createAuthPort } = await import(moduleUrl('web/services/ports/auth.js'));
  const { createCatalogPort } = await import(moduleUrl('web/services/ports/catalog.js'));
  const { createMockAuthAdapter } = await import(moduleUrl('web/services/mock/auth.js'));
  const { createMockCatalogAdapter } = await import(moduleUrl('web/services/mock/catalog.js'));
  const { createLoginController, createLoginView, createCredentialFlowController, createCredentialFlowView } = await import(moduleUrl('web/features/auth/index.js'));
  const { buildHomeModel, createHomeView } = await import(moduleUrl('web/features/home/home.js'));
  const { createCatalogView } = await import(moduleUrl('web/features/catalog/catalog.js'));
  const { createProductDetailController, createProductDetailView } = await import(moduleUrl('web/features/product/detail.js'));

  const auth = createAuthPort(createMockAuthAdapter());
  const login = createLoginController({ authPort: auth });
  assert.equal(createLoginView({ controller: login }, doc).element.dataset.feature, 'login');
  const cred = createCredentialFlowController({ authPort: auth, returnTo: '/' });
  assert.equal(createCredentialFlowView({ controller: cred }, doc).element.dataset.feature, 'credential-flow');

  const home = buildHomeModel({ categories: [{ id: 'a', name: 'A' }], products: [{ id: 'p', name: 'P', category_id: 'a', price: 1, is_visible: true, status: 'ACTIVE' }], featuredCategories: [{ categoryId: 'a', productIds: ['p'] }] });
  assert.equal(createHomeView({ model: home }, doc).element.dataset.feature, 'home');
  assert.equal(createCatalogView({ products: [{ id: 'p', name: 'P', price: 1, stock: 1, is_visible: true, status: 'ACTIVE' }], categories: [{ id: 'a', name: 'A' }], query: {} }, doc).element.dataset.feature, 'catalog');

  const productController = createProductDetailController({ catalogPort: createCatalogPort(createMockCatalogAdapter({ scenario: 'variant' })), productId: 'prod-hoodie' });
  const loaded = await productController.load();
  const detail = createProductDetailView({ product: loaded.data.product, selection: loaded.data.selection, gallery: loaded.data.gallery }, doc);
  assert.equal(detail.element.dataset.feature, 'product-detail');
});
