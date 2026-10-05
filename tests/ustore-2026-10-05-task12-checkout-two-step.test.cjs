const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');

test('task12: checkout progress is two-step on every viewport', () => {
  assert.match(app, /\$\{\[1,2\]\.map\(\(step,index\)=>/);
  assert.doesNotMatch(app, /\$\{\[1,2,3\]\.map\(\(step,index\)=>/);
  assert.match(css, /\.fc-checkout-progress\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test('task12: personal and delivery sections both belong to step 1', () => {
  const checkoutStart = app.indexOf('// CHECKOUT FORM MODAL');
  const checkoutEnd = app.indexOf('// KATALOG FILTR/SARALASH PANELI', checkoutStart);
  const block = app.slice(checkoutStart, checkoutEnd);
  assert.equal((block.match(/data-checkout-step="1"/g) || []).length, 2);
  assert.match(block, /data-checkout-delivery-section/);
  assert.match(block, /Mijoz ma'lumotlari/);
  assert.match(block, /Yetkazib berish/);
});

test('task12: payment, receipt and order summary are only on step 2', () => {
  const checkoutStart = app.indexOf('// CHECKOUT FORM MODAL');
  const checkoutEnd = app.indexOf('// KATALOG FILTR/SARALASH PANELI', checkoutStart);
  const block = app.slice(checkoutStart, checkoutEnd);
  assert.doesNotMatch(block, /data-checkout-step="3"/);
  assert.match(block, /checkoutStep===2[^\n]*data-checkout-step="2"/);
  assert.match(block, /checkout-gift-wrap[^\n]*checkoutStep===2/);
  assert.match(block, /fc-checkout-summary \$\{checkoutStep===2/);
  assert.match(block, /checkoutStep<2\?/);
});

test('task12: legacy 3-step drafts migrate safely into the new flow', () => {
  assert.match(app, /const CHECKOUT_FLOW_VERSION = 2/);
  assert.match(app, /if \(Number\(flowVersion\) < CHECKOUT_FLOW_VERSION\) return raw >= 3 \? 2 : 1/);
  assert.match(app, /flowVersion: CHECKOUT_FLOW_VERSION/);
});

test('task12: region and district use branded custom selectors rather than visible native selects', () => {
  assert.match(app, /renderCheckoutSelectControl\('chk-region-key','map'/);
  assert.match(app, /renderCheckoutSelectControl\('chk-district','navigation'/);
  assert.match(app, /function chooseCheckoutSelectOption\(/);
  assert.match(css, /\.fc-checkout-custom-select\{/);
  assert.match(css, /\.fc-checkout-native-select\{/);
});

test('task12: payment screenshot picker has explicit upload wording and image icon', () => {
  assert.match(app, /Skrinshot yuklash/);
  assert.match(app, /data-lucide="image-plus"/);
  assert.match(css, /\.fc-checkout-upload-action\{/);
});
