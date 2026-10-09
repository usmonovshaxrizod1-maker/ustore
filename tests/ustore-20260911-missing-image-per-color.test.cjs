const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');

function block(startNeedle, endNeedle, limit = 3000) {
  const start = app.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing ${startNeedle}`);
  const end = endNeedle ? app.indexOf(endNeedle, start + startNeedle.length) : -1;
  return app.slice(start, end > start ? end : start + limit);
}

// Real bug, reported live 2026-09-11: "excelldan yuklangan tovarlarning
// hammasiga pin bilan qoshilarkan..." was a DIFFERENT report handled
// earlier; THIS report is: "rasmsiz funksiyamiz bor... barcha rasmsiz
// tovarlar ko'rinadi. shunda variativ tovar oddiy bo'lib ko'rinyabdi shuni
// to'g'irlash kerak. nomi va rangi bilan ko'rinsin har biri" — the "Rasmsiz
// tovarlar" (missing-image) queue treated a variative (color-variant)
// product exactly like a simple product: one queue entry, product name
// only, saving to the product-level `img` field. But a variative product's
// images are COLOR-owned (variantColorImage/colorGroupsForProduct), not
// product-level, so this both showed a misleading single entry (hiding
// which colors actually lack a photo) and saved to the wrong field
// (product img instead of that color's colorImg on its variants).
test('getMissingImageQueueItems expands a variative product into one queue entry PER missing-image color (not one generic per-product entry)', () => {
  const fn = block('function getMissingImageQueueItems() {', 'function categoryPathForProduct');
  assert.match(fn, /colorGroupsForProduct\(p\)/, 'must reuse the existing color-grouping helper, not invent a new one');
  assert.match(fn, /items\.push\(\{ product: p, color: c\.name \}\)/);
  assert.match(fn, /items\.push\(\{ product: p, color: null \}\)/, 'simple (non-variative) products keep the old product-level behavior with color:null');
});

test('the MISSING_IMAGE_QUEUE modal shows the color name (not just the product name) for a variative entry, and SKU for a simple entry', () => {
  const modalStart = app.indexOf("if (activePopupModal === 'MISSING_IMAGE_QUEUE')");
  const modal = app.slice(modalStart, modalStart + 4000);
  assert.match(modal, /const item = queue\[missingImageQueueIndex\] \|\| null;/);
  assert.match(modal, /const p = item\?\.product \|\| null;/);
  assert.match(modal, /const itemColor = item\?\.color \|\| null;/);
  assert.match(modal, /itemColor \? `<p class="mt-1 text-\[10px\] font-bold text-blue-700">\$\{tr\('Rangi','Цвет'\)\}/, 'variative entries must show the color, not a misleading generic SKU line');
  assert.match(modal, /saveMissingImageQueueItem\('\$\{p\.id\}', \$\{itemColor \? JSON\.stringify\(itemColor\) : 'null'\}\)/);
});

test('saveMissingImageQueueItem saves a color entry to that color\'s variants (colorImg via field:"variants"), and a simple entry to the product img (field:"img") as before', () => {
  const fn = block('async function saveMissingImageQueueItem(prodId, color) {', 'function openAddProductModal', 4000);
  assert.match(fn, /colorGroupsForProduct\(product\)\.find\(c => c\.name === color && !c\.img\)/, 'must re-verify the color is still actually missing before saving (race-safety)');
  assert.match(fn, /productVariants\(product\)\.map\(v => v\.color === color \? \{ \.\.\.v, colorImg: imagePayload\.img \} : v\)/, 'only variants of the targeted color get colorImg updated — every other variant field/variant is preserved verbatim');
  assert.match(fn, /field: 'variants', value: newVariants/);
  assert.match(fn, /field: 'img',/, 'non-color (simple product) path still uses the original field:"img" save');
});

test('cache version bumped for this fix', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /ustore-shop-app\.js\?v=333/);
});

