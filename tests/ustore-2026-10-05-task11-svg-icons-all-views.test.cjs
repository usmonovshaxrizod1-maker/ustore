const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
const platform = fs.readFileSync(path.join(root, 'platform', 'platform-app.js'), 'utf8');
const excel = fs.readFileSync(path.join(root, 'excel-import.js'), 'utf8');
const webExcel = fs.readFileSync(path.join(root, 'web', 'excel-import.js'), 'utf8');
const customerShell = fs.readFileSync(path.join(root, 'web', 'shells', 'customer.js'), 'utf8');
const shellCss = fs.readFileSync(path.join(root, 'web', 'styles', 'shells.css'), 'utf8');

test('task 11: shared Shop App icons are deterministic SVGs across all viewports', () => {
  assert.match(app, /function fcIcon\(/);
  for (const name of ['ICON_CHECK', 'ICON_ALERT', 'ICON_PACKAGE', 'ICON_GIFT', 'ICON_PHONE', 'ICON_CART', 'ICON_ID']) {
    assert.match(app, new RegExp(`const ${name} = fcIcon\\(`), `${name} should be an inline SVG icon`);
  }
  assert.doesNotMatch(app, /fc-product-mobile-emoji">(?:🛒|📝)/u);
  assert.doesNotMatch(app, /<p>🆔/u);
});

test('task 11: mobile and browser language flags use SVG instead of flag emoji', () => {
  assert.match(html, /id="lang-flag-btn"[\s\S]*?<svg class="fc-lang-flag-svg"/);
  assert.doesNotMatch(html, /🇺🇿|🇷🇺/u);
  assert.match(app, /flagBtn\.innerHTML = desktopFlagSvg\(targetLang\)/);
  assert.doesNotMatch(customerShell, /🇺🇿|🇷🇺/u);
  assert.match(customerShell, /function languageFlagSvg\(/);
  assert.match(customerShell, /uw-language-flag-svg/);
  assert.match(css, /\.fc-lang-flag-svg\{display:block/);
  assert.match(shellCss, /\.uw-customer-language__choice \.uw-language-flag-svg/);
});

test('task 11: platform and Excel surfaces use SVG icon helpers, not visible emoji markup', () => {
  assert.match(platform, /function pIcon\(/);
  assert.match(platform, /statusIcon\(/);
  assert.match(excel, /function xIcon\(/);
  assert.match(webExcel, /function xIcon\(/);
  assert.doesNotMatch(platform, />\s*(?:✅|❌|⚠️|📎|❄️|👤)/u);
  assert.doesNotMatch(excel, />\s*(?:✅|❌|⚠️|✨|💡|🛡️|📎)/u);
  assert.doesNotMatch(webExcel, />\s*(?:✅|❌|⚠️|✨|💡|🛡️|📎)/u);
});

test('task 11: checkbox checkmark is SVG-backed instead of a system glyph', () => {
  assert.match(css, /\.fc-billz-check:checked::after\{[^}]*data:image\/svg\+xml/);
  assert.doesNotMatch(css, /\.fc-billz-check:checked::after\{[^}]*content:\s*['"]✓['"]/u);
});
