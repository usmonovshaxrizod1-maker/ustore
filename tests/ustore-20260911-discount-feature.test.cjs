const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const shopApi = fs.readFileSync(path.join(root, 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');

function block(src, startNeedle, endNeedle, limit = 4000) {
  const start = src.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing ${startNeedle}`);
  const end = endNeedle ? src.indexOf(endNeedle, start + startNeedle.length) : -1;
  return src.slice(start, end > start ? end : start + limit);
}

// New feature (2026-09-11): "billzni yonidan chegirma degan funksiya
// qoshishimiz kerak... % shunaqa belgicha qoyasan" — a % entry point next
// to the Billz button opens the list of currently-discounted products, with
// select-some-or-all + cancel-discount (two modes). Follow-up: "birdaniga
// qaysidir katalogga yoki tovarlarga birdan nechadir foiz chegirma qollash
// ham bolsin" — bulk-apply a percent discount to a whole category or to
// selected products, reusing the EXISTING long-press bulk-select toolbars.

test('a "%" toolbar button sits next to the Billz button and opens the discount list', () => {
  const billzIdx = app.indexOf('openBillzBrowse(\'${adminCatParentId');
  assert.ok(billzIdx > 0, 'Billz button must exist');
  const after = app.slice(billzIdx, billzIdx + 900);
  assert.match(after, /onclick="openDiscountList\(\)"/);
  assert.match(after, /ICON_PERCENT/);
});

test('getDiscountedProducts reuses the existing discountPercent() formula (oldPrice>price), excludes deleted products', () => {
  const fn = block(app, 'function getDiscountedProducts() {', '\n    }', 300);
  assert.match(fn, /discountPercent\(p\) !== null/);
  assert.match(fn, /p\.status !== 'DELETED'/);
});

test('DISCOUNT_LIST modal shows price/old-price/discount% per product with a select-dot, plus select-all and two distinct cancel actions', () => {
  const modal = block(app, "if (activePopupModal === 'DISCOUNT_LIST') {", "if (activePopupModal === 'APPLY_DISCOUNT') {", 6000);
  assert.match(modal, /getDiscountedProducts\(\)/);
  assert.match(modal, /fc-select-dot/);
  assert.match(modal, /selectAllDiscountList\(\)/);
  assert.match(modal, /clearDiscountListSelection\(\)/);
  assert.match(modal, /fc-product-current-price/);
  assert.match(modal, /fc-product-old-price/);
  assert.match(modal, /discountPercent\(p\)/);
  assert.match(modal, /onclick="cancelSelectedDiscounts\(false\)"/, 'must offer "just remove old price" (price unchanged)');
  assert.match(modal, /onclick="cancelSelectedDiscounts\(true\)"/, 'must offer "restore price to old price" — both explicitly requested by the user');
});

test('cancelSelectedDiscounts calls bulk_clear_discount with the chosen restorePrice and refreshes local products via upsertLocalProduct', () => {
  const fn = block(app, 'async function cancelSelectedDiscounts(restorePrice) {', '\n    }\n    function regionLabel', 2000);
  assert.match(fn, /callApi\('bulk_clear_discount', \{ productIds: ids, restorePrice: !!restorePrice \}\)/);
  assert.match(fn, /upsertLocalProduct\(row\)/);
});

test('the existing product AND category bulk-select toolbars both gained a "%" apply-discount action, disabled with nothing selected', () => {
  const catToolbar = block(app, 'bulkCategorySelectMode ? `<div class="fc-selection-toolbar">', '` : \'\'}', 1200);
  assert.match(catToolbar, /openApplyDiscountSheet\('CATEGORIES'\)/);
  assert.match(catToolbar, /bulkSelectedCategoryIds\.size\?'':'disabled'/);
  const prodToolbar = block(app, 'bulkProductSelectMode ? `<div class="fc-selection-toolbar">', '` : \'\'}', 1200);
  assert.match(prodToolbar, /openApplyDiscountSheet\('PRODUCTS'\)/);
  assert.match(prodToolbar, /bulkSelectedProductIds\.size\?'':'disabled'/);
});

test('APPLY_DISCOUNT sheet offers both price-calculation modes (reduce price vs raise old price) exactly as the user chose ("ikalasini ham qilamiz")', () => {
  const modal = block(app, "if (activePopupModal === 'APPLY_DISCOUNT') {", "if (activePopupModal === 'EXCEL_IMPORT') {", 4000);
  assert.match(modal, /discountApplyMode='REDUCE_PRICE'/);
  assert.match(modal, /discountApplyMode='RAISE_OLD_PRICE'/);
  assert.match(modal, /id="adp-percent"/);
  assert.match(modal, /onclick="applyBulkDiscount\(\)"/);
});

test('applyBulkDiscount validates percent range, routes categoryIds vs productIds by scope, clears both bulk-select modes on success', () => {
  const fn = block(app, 'async function applyBulkDiscount() {', '\n    async function purgeTrashBatchNow', 2200);
  assert.match(fn, /percent <= 0 \|\| percent >= 100/);
  assert.match(fn, /payload\.categoryIds = \[\.\.\.bulkSelectedCategoryIds\]/);
  assert.match(fn, /payload\.productIds = \[\.\.\.bulkSelectedProductIds\]/);
  assert.match(fn, /callApi\('bulk_apply_discount', payload\)/);
  assert.match(fn, /bulkProductSelectMode = false; bulkSelectedProductIds\.clear\(\);/);
  assert.match(fn, /bulkCategorySelectMode = false; bulkSelectedCategoryIds\.clear\(\);/);
});

// ---- server (shop-api) ----

test('bulk_apply_discount resolves category scope recursively (collectCategorySubtreeIds, same helper category-delete preview uses) and computes exact prices per the two modes', () => {
  const fn = block(shopApi, 'case "bulk_apply_discount": {', 'case "bulk_clear_discount": {', 3500);
  assert.match(fn, /requirePermission\('products\.manage'\)/);
  assert.match(fn, /percent <= 0 \|\| percent >= 100/);
  assert.match(fn, /collectCategorySubtreeIds\(allCats, String\(cid\)\)/);
  assert.match(fn, /mode === "REDUCE_PRICE" \? Math\.max\(1, Math\.round\(currentPrice \* \(1 - percent \/ 100\)\)\) : currentPrice/, 'REDUCE_PRICE: new (lower) price computed, old price = current price');
  assert.match(fn, /mode === "REDUCE_PRICE" \? currentPrice : Math\.round\(currentPrice \/ \(1 - percent \/ 100\)\)/, 'RAISE_OLD_PRICE: price stays, old price computed as the EXACT inverse of discountPercent()\'s formula');
  assert.match(fn, /targetIds\.length > 500/, 'capped like every other bulk action in this file');
});

test('bulk_clear_discount clears genuine product or variant discounts, supports restorePrice, and is permission-gated', () => {
  const fn = block(shopApi, 'case "bulk_clear_discount": {', '\n      }\n\n      case "purge_trash_batch_now"', 2000);
  assert.match(fn, /requirePermission\('products\.manage'\)/);
  assert.match(fn, /const hasProductDiscount = !!oldPrice && oldPrice > Number\(row\.price\);/);
  assert.match(fn, /hasVariantDiscount = true;/);
  assert.match(fn, /if \(!hasProductDiscount && !hasVariantDiscount\) continue;/);
  assert.match(fn, /if \(restorePrice\) patch\.price = oldPrice;/);
  assert.match(fn, /patch\.old_price = null/);
});
