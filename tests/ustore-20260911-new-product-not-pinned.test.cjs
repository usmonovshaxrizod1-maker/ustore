const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const shopApi = fs.readFileSync(path.join(root, 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');

function block(src, startNeedle, endNeedle, limit = 4000) {
  const start = src.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing ${startNeedle}`);
  const end = endNeedle ? src.indexOf(endNeedle, start + startNeedle.length) : -1;
  return src.slice(start, end > start ? end : start + limit);
}

// Real bug, reported live 2026-09-11: "excelldan yuklangan tovarlarning
// hammasiga pin bilan qoshilarkan... yangi bittalik tovar qoshilsa ham" —
// every product created via Excel bulk import, AND every single manually
// added product, was silently getting is_featured:true (shown as "pinned"
// to Home via the pin icon on the product card / filtered into the Home
// feed) instead of starting unpinned like every other creation path
// (duplicateProduct, Billz import both already used is_featured:false).
// Pinning should only ever happen via the explicit pin toggle
// (toggle_featured / toggleProductFeatured).
test('add_product (single manual add) creates new products unpinned (is_featured:false), not auto-featured', () => {
  const b = block(shopApi, 'case "add_product": {', 'case "get_excel_template_url":');
  assert.match(b, /is_featured: false, sort_order: nextSortOrder,/);
  assert.doesNotMatch(b, /is_featured: true/);
});

test('start_import_batch (Excel bulk import commit) creates all imported products unpinned (is_featured:false), not auto-featured', () => {
  const b = block(shopApi, 'case "start_import_batch": {', 'case "get_last_import_batch"', 6000);
  assert.match(b, /is_featured: false, sort_order: nextSort\+\+, variants: withSku,/);
  assert.doesNotMatch(b, /is_featured: true/);
});

test('every product-creation path (add_product, Excel import, Billz import, duplicateProduct) consistently defaults to is_featured:false — only toggle_featured ever sets it true', () => {
  const trueOccurrences = (shopApi.match(/is_featured:\s*true/g) || []).length;
  assert.equal(trueOccurrences, 0, 'no code path should hardcode is_featured:true; pinning is only ever an explicit merchant action via toggle_featured');
  const toggle = block(shopApi, 'case "toggle_featured": {', 'case ', 800);
  assert.match(toggle, /is_featured:\s*!!payload\.value/);
});
