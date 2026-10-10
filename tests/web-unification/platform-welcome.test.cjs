const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
test('platform entry and frame use the shared full-screen welcome until APP_READY', () => {
  assert.match(read('web/app.js'), /mode: 'platform', name: 'UStorE'/);
  assert.match(read('web/shared/frame-host.js'), /mode:kind/);
  assert.match(read('shop-welcome.js'), /ustore-welcome--platform/);
  assert.match(read('shop-welcome.css'), /position:fixed;inset:0/);
  assert.match(read('web/shared/frame-host.js'), /USTORE_SHOP_WELCOME.dismiss\(placeholder\)/);
});
test('standalone Platform uses the same welcome; browser child does not draw another loader', () => {
  assert.match(read('platform/index.html'), /\.\.\/shop-welcome\.js/);
  assert.match(read('platform/platform-app.js'), /if \(!browserBridge && !platformWelcome\)/);
  assert.doesNotMatch(read('platform/platform-app.js'), /UStorE yuklanmoqda/);
  assert.match(read('platform/platform-app.js'), /dismiss\(platformWelcome\)/);
});
