const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
const api = fs.readFileSync(path.join(root, 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');

function fnBlock(signature) {
  const start = app.indexOf(signature);
  assert.ok(start >= 0, `${signature} must exist`);
  const next = app.indexOf('\n    function ', start + signature.length);
  return app.slice(start, next > start ? next : start + 7000);
}

test('follow-up 1: variative qty=0 shows Savatga qo‘shish; after add it switches to per-combination stepper and minus-to-zero removes the line', () => {
  assert.match(app, /cartEntry \? `[\s\S]*fc-variant-cart-inline[\s\S]*fc-customer-variant-stepper[\s\S]*` : `[\s\S]*fc-variant-add-cart/);
  assert.match(app, /onclick="addVariantToCart\('\$\{p\.id\}'\)" class="fc-variant-add-cart"/);
  const qty = fnBlock('function changeActiveVariantCartQty(delta, event)');
  assert.match(qty, /if \(next <= 0\) delete cart\[key\];/);
  assert.match(qty, /if \(next > Number\(v\.qty \|\| 0\)\) return showAppNotice/);
  const selectColorBlock = fnBlock('function selectColor(name)');
  const selectSizeBlock = fnBlock('function selectSize(name)');
  assert.doesNotMatch(selectColorBlock, /addVariantItemsToCart|changeActiveVariantCartQty/);
  assert.doesNotMatch(selectSizeBlock, /addVariantItemsToCart|changeActiveVariantCartQty/);
});

test('follow-up 2: stepper and Savatga o‘tish share one responsive horizontal row', () => {
  assert.match(app, /<div class="fc-variant-cart-inline">[\s\S]*fc-customer-variant-stepper[\s\S]*fc-variant-go-cart/);
  assert.match(css, /\.fc-variant-cart-inline\{[^}]*display:grid[^}]*grid-template-columns:[^}]*align-items:center/s);
  assert.match(css, /\.fc-variant-go-cart,\.fc-variant-add-cart\{[^}]*min-height:/s);
});

test('follow-up 3: Savatga o‘tish closes the product detail before navigating to cart', () => {
  const block = fnBlock('function goToCartFromProductDetail()');
  const close = block.indexOf('selectedProductModal = null;');
  const nav = block.indexOf("switchTab('cart');");
  assert.ok(close >= 0 && nav > close, 'modal must close before cart navigation');
  assert.match(block, /activePopupModal = null;/);
});

test('follow-up 4: Savatchani tozalash clears normal + bundle cart, persisted state, badge and rerenders after confirmation', () => {
  const block = fnBlock('function clearCartWithConfirm()');
  assert.match(block, /appConfirm\(tr\("Savatchadagi barcha mahsulotlarni o'chirmoqchimisiz\?"/);
  assert.match(block, /cart = \{\};/);
  assert.match(block, /bundleCart = \{\};/);
  assert.match(block, /localStorage\.setItem\(scopedKey\('cart'\), JSON\.stringify\(cart\)\);/);
  assert.match(block, /saveBundleCart\(\);/);
  assert.match(block, /updateCartBadge\(\);/);
  assert.match(block, /render\(\);/);
  assert.match(app, /onclick="clearCartWithConfirm\(\)"[^>]*>[^<]*Savatchani tozalash|onclick="clearCartWithConfirm\(\)"/);
});

test('follow-up 5: variative images are color-owned only — no product-level uploader in variative builder and no per-size image input', () => {
  const addStart = app.indexOf("if (activePopupModal === 'ADD_PROD') {");
  const addEnd = app.indexOf("if (activePopupModal === 'ADD_CAT') {", addStart);
  const addBlock = app.slice(addStart, addEnd);
  const variativeStart = addBlock.indexOf('if (isVariativeProductDraft)');
  const simpleStart = addBlock.indexOf('// Oddiy tovar');
  const variative = addBlock.slice(variativeStart, simpleStart);
  assert.doesNotMatch(variative, /m-prod-image-button|Tovar rasmi/);
  const editor = fnBlock('function renderActiveColorEditorHtml()');
  assert.match(editor, /pickColorImage\(/);
  assert.doesNotMatch(editor, /pickSizeRowImage|onSizeRowImagePicked|O'lcham rasmi|Размер фото/);
  const finalize = fnBlock('function finalizeVariantBuilderRows()');
  assert.match(finalize, /img: colorDraft\?\.img \|\| null|img: c\?\.img|colorImg:/);
});

test('follow-up 6: first color + first available size is the canonical default for card/detail; color changes image and size changes price/stock while keeping the color image', () => {
  const def = fnBlock('function defaultVariantSelection(p)');
  assert.match(def, /const firstColor = vars\.find\(\(v\) => v\.color\)\?\.color \|\| null;/);
  assert.match(def, /sameColor\.find\(\(v\) => Number\(v\.qty\) > 0\) \|\| sameColor\[0\]/);
  const open = fnBlock('function openProductDetailModal(id)');
  assert.match(open, /const initial = defaultVariantSelection\(selectedProductModal\);/);
  assert.match(open, /activeColorName = initial\.color;/);
  assert.match(open, /activeSizeName = initial\.size;/);
  const color = fnBlock('function selectColor(name)');
  assert.match(color, /activeColorName = name;/);
  assert.match(color, /activeSizeName = firstAvailable\?\.size \|\| null;/);
  const size = fnBlock('function selectSize(name)');
  assert.match(size, /activeSizeName = name;/);
  assert.doesNotMatch(size, /activeColorName\s*=\s*name/);
  const image = fnBlock('function variantDisplayImage(p, size, color)');
  assert.match(image, /const colorImg = variantColorImage\(p, color\);/);
  assert.doesNotMatch(image, /find\(.*size.*img|v\?\.img/);
  const cardStart = app.indexOf('function renderProductCardHTML');
  const card = app.slice(cardStart, cardStart + 4200);
  assert.match(card, /defaultVariantSelection\(p\)/);
  assert.match(card, /cardPrice = fallbackVariant \? variantPrice/);
});

test('follow-up 7: wordmark supports presets + custom text/background colors, live preview, reset and contrast protection; backend persists colors in logo_wordmark', () => {
  assert.match(app, /const WORDMARK_COLOR_PRESETS = \[/);
  assert.ok((app.match(/id: '(navy-white|white-blue|white-green|navy-soft|white-purple)'/g) || []).length >= 5);
  assert.match(app, /id="wm-text-color" type="color"/);
  assert.match(app, /id="wm-bg-color" type="color"/);
  assert.match(app, /onclick="resetWordmarkColors\(\)"/);
  assert.match(app, /function wordmarkContrastRatio\(/);
  assert.match(app, /wordmarkContrastRatio\(wordmarkDraftTextColor, wordmarkDraftBgColor\)/);
  assert.match(app, /wordmarkDraftTextColor/);
  assert.match(app, /wordmarkDraftBgColor/);
  assert.match(api, /textColor/);
  assert.match(api, /backgroundColor/);
  assert.match(api, /logo_wordmark: logoType === \"WORDMARK\" \? wordmark : null/);
});
