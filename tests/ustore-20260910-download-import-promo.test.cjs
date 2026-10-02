const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const excel = fs.readFileSync(path.join(root, 'excel-import.js'), 'utf8');
const shopApi = fs.readFileSync(path.join(root, 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function block(src, startNeedle, endNeedle, limit = 6000) {
  const start = src.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing ${startNeedle}`);
  const end = endNeedle ? src.indexOf(endNeedle, start + startNeedle.length) : -1;
  return src.slice(start, end > start ? end : start + limit);
}

// ---- Item 2: import_batch_start_failed (Number(uuid) -> NaN) ----------------
test('Excel import keeps the batch id as the server UUID string (never Number(...)) so start_import_batch stops failing', () => {
  const doImport = block(excel, 'async function doImport()', 'function workbookMeta');
  assert.doesNotMatch(doImport, /Number\(started\.batchId\)/, 'Number() on a UUID batch id yields NaN and always threw import_batch_start_failed');
  assert.match(doImport, /batchId=started\.batchId \? String\(started\.batchId\) : null/);
  assert.match(doImport, /throw new Error\(started\.error\|\|'import_batch_start_failed'\)/);
});

// ---- Item 3: structured variant editor -------------------------------------
test('the Fix-row editor edits variative products as separate Color/Size/Price/Old/Qty inputs, not a raw pipe string', () => {
  assert.doesNotMatch(excel, /id="xe-variants"/, 'the raw "Rang|O‘lcham|..." single input must be gone');
  assert.match(excel, /id="xe-variants-list"/);
  assert.match(excel, /class="xe-vrow/);
  for (const cls of ['xe-v-color', 'xe-v-size', 'xe-v-price', 'xe-v-old', 'xe-v-qty']) {
    assert.match(excel, new RegExp(cls));
  }
  assert.match(excel, /function addVariantRow\(\)/);
  assert.match(excel, /function removeVariantRow\(btn\)/);
  assert.match(excel, /function readVariantEditorText\(\)/);
  assert.match(excel, /addVariantRow,removeVariantRow/, 'add/remove must be exported for the inline onclick handlers');
  // save path serializes the rows back to the exact format parseModernVariants expects
  const save = block(excel, 'async function saveRowEditor()', 'function workbookMeta', 3000);
  assert.match(save, /readVariantEditorText\(\)/);
  assert.match(save, /source\.variantText=structuredVariants/);
});

test('parseVariantTextToRows / serializeVariantRows round-trip the "Color|Size|Price|Old|Qty / ..." format', () => {
  // Load the IIFE module in a minimal window sandbox and read its __test hooks.
  const vm = require('node:vm');
  const sandbox = { window: {}, document: { getElementById: () => null, createElement: () => ({}) }, console };
  sandbox.window.escapeHtml = (s) => String(s ?? '');
  vm.createContext(sandbox);
  vm.runInContext(excel, sandbox);
  const T = sandbox.window.UstoreExcel.__test;
  assert.equal(typeof T.parseVariantTextToRows, 'function');
  const rows = T.parseVariantTextToRows("Oq|48|45000||10 / Qora|50|40000|48000|3");
  // cross-realm objects -> compare via JSON, not deepStrictEqual (prototype mismatch)
  assert.equal(JSON.stringify(rows), JSON.stringify([
    { color: 'Oq', size: '48', price: '45000', oldPrice: '', qty: '10' },
    { color: 'Qora', size: '50', price: '40000', oldPrice: '48000', qty: '3' },
  ]));
  assert.equal(T.serializeVariantRows(rows), 'Oq|48|45000||10 / Qora|50|40000|48000|3');
  // fully blank rows are dropped
  assert.equal(T.serializeVariantRows([{ color: '', size: '', price: '', oldPrice: '', qty: '' }]), '');
});

// ---- Item 4: promo code input only appears once the shop has promo codes ----
test('boot exposes hasActivePromoCodes and the cart hides the promo section until then', () => {
  const boot = block(shopApi, 'case "boot":', 'case "get_catalog"', 12000);
  assert.match(boot, /from\("promotions"\)/);
  assert.match(boot, /hasActivePromoCodes: \(promoCodeR\.count \|\| 0\) > 0/);

  assert.match(app, /hasActivePromoCodes = bootData\.hasActivePromoCodes === true/);
  const gate = block(app, 'function promoInputVisible()', 'function renderPromoWrapHtml', 1200);
  assert.match(gate, /appliedPromoState \|\| hasActivePromoCodes \|\| \(Array\.isArray\(myPromoCodes\) && myPromoCodes\.length/);
  assert.match(gate, /if \(!promoInputVisible\(\)\) return '';/);
  assert.match(app, /\$\{renderPromoSectionHtml\(\)\}/);
});

// ---- cache versions -------------------------------------------------------
test('cache versions bumped for this batch (excel-import v12, shop-app v112, ustore.css v103)', () => {
  assert.match(app, /excel-import\.js\?v=16/);
  assert.match(indexHtml, /ustore-shop-app\.js\?v=317/);
  assert.match(indexHtml, /ustore\.css\?v=317/);
});

