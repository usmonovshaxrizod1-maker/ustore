const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');

function block(source, startText, endText) {
  const start = source.indexOf(startText);
  assert.ok(start >= 0, `missing ${startText}`);
  const end = source.indexOf(endText, start + startText.length);
  return source.slice(start, end >= 0 ? end : undefined);
}

test('task 10: desktop/tablet order status chooser uses UStorE custom popover while preserving native mobile select', () => {
  const helper = block(app, 'function renderOrderStatusCompactFilter', 'function paymentStatusLabel');
  assert.match(helper, /fc-orders-status-popover/);
  assert.match(helper, /fc-orders-status-menu/);
  assert.match(helper, /fc-orders-status-option/);
  assert.match(helper, /role="listbox"/);
  assert.match(helper, /aria-selected=/);
  assert.match(helper, /fc-orders-status-native/);
  assert.match(helper, /<select/);
  assert.match(helper, /replace\(\/this\\\.value\/g/);
});

test('task 10: custom status menu follows current visual system and is desktop/tablet only', () => {
  assert.match(css, /\.fc-orders-status-menu\{[^}]*border-radius:16px[^}]*var\(--ustore-card-bg/);
  assert.match(css, /\.fc-orders-status-option\.is-selected\{[^}]*var\(--ustore-primary\)/);
  assert.match(css, /@media\(max-width:767px\)\{\.fc-orders-status-popover\{display:none\}\.fc-orders-status-native\{display:grid!important\}/);
});
