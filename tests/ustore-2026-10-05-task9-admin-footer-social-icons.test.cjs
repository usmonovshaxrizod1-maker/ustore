const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');

test('task 9: storefront footer is not hidden in admin mode', () => {
  const start = app.indexOf('function storefrontFooterHtml()');
  assert.ok(start >= 0, 'storefrontFooterHtml must exist');
  const slice = app.slice(start, start + 6500);
  assert.doesNotMatch(slice, /if\s*\(isAdminMode\s*&&\s*isUserAnAdmin\)\s*return\s*['\"]{2}/);
  assert.match(slice, /fc-storefront-footer/);
});

test('task 9: Instagram and Facebook use self-contained SVG icons', () => {
  const start = app.indexOf('function storefrontSocialIconHtml(icon)');
  assert.ok(start >= 0, 'social icon helper must exist');
  const slice = app.slice(start, start + 3000);
  assert.match(slice, /icon === 'instagram'/);
  assert.match(slice, /icon === 'facebook'/);
  assert.match(slice, /<svg viewBox=/);
  assert.match(slice, /fill=\\?"currentColor\\?"/);
});
