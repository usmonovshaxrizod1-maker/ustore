import { fail, ok } from '../ports/result.js';
import { toPage } from '../ports/catalog.js';
import { loadJsonFixture } from './fixture-loader.js';

function normalizedText(value) {
  return String(value || '').toLocaleLowerCase('uz-UZ').trim();
}

export function createMockCatalogAdapter({ scenario = 'home' } = {}) {
  const sourceFixture = scenario === 'empty' ? 'catalog/empty.json'
    : scenario === 'hiddenFiltered' ? 'catalog/hidden-filtered.json'
      : scenario === 'variant' ? 'catalog/product-variant.json'
        : 'catalog/home.json';

  async function loadCatalog() {
    return loadJsonFixture(sourceFixture);
  }

  return {
    async listCategories(input = {}) {
      const data = await loadCatalog();
      const parentId = input.parentId ?? null;
      const items = data.categories.filter((category) => input.all === true || (category.parent_id ?? null) === parentId);
      return ok(toPage(items, null, items.length));
    },
    async listProducts(input = {}) {
      const data = await loadCatalog();
      let items = data.products.filter((product) => product.is_visible !== false && product.status !== 'DELETED');
      if (input.categoryId) items = items.filter((product) => product.category_id === input.categoryId);
      return ok(toPage(items, null, items.length));
    },
    async getProduct(input) {
      if (!input?.productId) return fail('VALIDATION_ERROR', 'Product ID kerak.');
      const data = await loadCatalog();
      const product = data.products.find((row) => row.id === input.productId && row.is_visible !== false && row.status !== 'DELETED');
      return product ? ok(product) : fail('NOT_FOUND', 'Mahsulot topilmadi.');
    },
    async listBundles() {
      const data = await loadCatalog();
      const items = Array.isArray(data.bundles) ? data.bundles : [];
      return ok(toPage(items, null, items.length));
    },
    async getBundle(input) {
      if (!input?.bundleId) return fail('VALIDATION_ERROR', 'Bundle ID kerak.');
      const data = await loadCatalog();
      const bundle = (Array.isArray(data.bundles) ? data.bundles : []).find((row) => String(row.id) === String(input.bundleId));
      return bundle ? ok(bundle) : fail('NOT_FOUND', 'Aksiya topilmadi.');
    },
    async getPromotion() {
      return fail('NOT_FOUND', 'Aksiya topilmadi.');
    },
    async listPromotions() {
      return ok(toPage([], null, 0));
    },
    async search(input) {
      const query = normalizedText(input?.query);
      if (!query) return fail('VALIDATION_ERROR', 'Qidiruv matnini kiriting.', { fieldErrors: { query: 'Qidiruv bo‘sh bo‘lmasin.' } });
      const data = await loadCatalog();
      const items = data.products.filter((product) => product.is_visible !== false && product.status !== 'DELETED')
        .filter((product) => [product.name, product.name_ru, product.sku, product.description, product.description_ru]
          .some((field) => normalizedText(field).includes(query)));
      return ok(toPage(items, null, items.length));
    },
  };
}
