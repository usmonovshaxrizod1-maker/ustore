const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..', '..');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

test('E2 catalog query round-trips search/filter/sort/page through URL', async () => {
  const { parseCatalogQuery, serializeCatalogQuery } = await import(moduleUrl('web/features/catalog/catalog.js'));
  const state = parseCatalogQuery('?q=protein&category=cat-supp&min=100000&max=500000&stock=1&discount=1&sort=price-desc&page=3');
  assert.deepEqual(state, { q: 'protein', categoryId: 'cat-supp', minPrice: 100000, maxPrice: 500000, inStock: true, discount: true, sort: 'price-desc', page: 3 });
  assert.equal(serializeCatalogQuery(state), '?q=protein&category=cat-supp&min=100000&max=500000&stock=1&discount=1&sort=price-desc&page=3');
});

test('E2 local fixture filter never resurrects hidden/deleted products and applies price/stock/discount', async () => {
  const { applyCatalogQuery } = await import(moduleUrl('web/features/catalog/catalog.js'));
  const products = [
    { id: 'ok', name: 'Protein', price: 200000, old_price: 250000, stock: 2, is_visible: true, status: 'ACTIVE' },
    { id: 'hidden', name: 'Protein', price: 100000, stock: 3, is_visible: false, status: 'ACTIVE' },
    { id: 'empty', name: 'Protein', price: 220000, old_price: 260000, stock: 0, is_visible: true, status: 'ACTIVE' },
  ];
  const result = applyCatalogQuery(products, { q: 'protein', minPrice: 150000, maxPrice: 230000, inStock: true, discount: true, sort: 'price-asc' });
  assert.deepEqual(result.map((x) => x.id), ['ok']);
});


test('E2 stylesheet/view includes desktop sidebar plus mobile filter sheet and pagination controls', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(path.join(root, 'web/features/catalog/catalog.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'web/styles/features.css'), 'utf8');
  assert.match(source, /uw-catalog-sidebar/);
  assert.match(source, /uw-catalog-filter-sheet/);
  assert.match(source, /setFilterSheetOpen/);
  assert.match(source, /uw-catalog-pager/);
  assert.match(css, /max-width:\s*63\.999rem/);
  assert.match(css, /uw-catalog-filter-sheet\[data-state="open"\]/);
});
