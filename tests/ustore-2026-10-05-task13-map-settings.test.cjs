const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');

test('task13: storefront map action opens branded chooser on web tablet/desktop', () => {
  assert.match(app, /function storefrontMapChooserEnabled\(\)/);
  assert.match(app, /Boolean\(browserBridge\).*min-width: 768px/s);
  assert.match(app, /function openStorefrontMap\(\)/);
  assert.match(app, /if \(storefrontMapChooserEnabled\(\)\) return openShopLocationChooser\(\)/);
  assert.match(app, /onclick="openStorefrontMap\(\)"/);
});

test('task13: map chooser offers Google Maps and Yandex Maps', () => {
  const start = app.indexOf('function openShopLocationChooser()');
  assert.ok(start >= 0, 'map chooser must exist');
  const block = app.slice(start, start + 3500);
  assert.match(block, /Google Maps/);
  assert.match(block, /Yandex Maps/);
  assert.match(block, /urls\.google/);
  assert.match(block, /urls\.yandex/);
  assert.match(css, /\.fc-map-choice-row/);
});

test('task13: mobile and Mini App retain previous direct Google map behavior', () => {
  const start = app.indexOf('function openStorefrontMap()');
  assert.ok(start >= 0, 'openStorefrontMap must exist');
  const block = app.slice(start, start + 700);
  assert.match(block, /openSafeExternalUrl\(urls\.google\)/);
});

test('task13: shop parameters expose shop info/address/map editor', () => {
  const start = app.indexOf('function renderSettingsPage(container)');
  assert.ok(start >= 0, 'settings page must exist');
  const block = app.slice(start, start + 3500);
  assert.match(block, /Do'kon ma'lumotlari/);
  assert.match(block, /openShopInfoModal\(\)/);

  const modalStart = app.indexOf("if (activePopupModal === 'SHOP_INFO') {");
  assert.ok(modalStart >= 0, 'shop info modal must exist');
  const modal = app.slice(modalStart, modalStart + 10000);
  assert.match(modal, /id="sc-address"/);
  assert.match(modal, /id="sc-coordinates"/);
  assert.match(modal, /openOsmCoordinatePicker\(\)/);
});
