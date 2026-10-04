const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('platform and shop hosts use branded premium launch states instead of technical loading copy', () => {
  const app = fs.readFileSync('web/app.js','utf8');
  const css = fs.readFileSync('web/styles/components.css','utf8');
  assert.match(app,/function launchView/);
  assert.doesNotMatch(app,/Do‘kon tayyorlanmoqda/);
  assert.match(app,/Biznesingiz uchun platforma tayyorlanmoqda/);
  assert.match(app,/tenantBrand\.shopName/);
  assert.match(app,/shopLaunchShown/);
  assert.match(css,/\.uw-launch/);
  assert.doesNotMatch(app,/DoвЂ/);
});

test('Telegram auth keeps one primary CTA and compact inline errors', () => {
  const login = fs.readFileSync('web/features/auth/login.js','utf8');
  assert.match(login,/Telegram’da davom etish/);
  assert.match(login,/uw-auth-inline-error/);
  assert.doesNotMatch(login,/title: 'Hozircha mavjud emas'/);
});

test('first paint on managed subdomain is shop-branded before the module graph resolves', () => {
  const html = fs.readFileSync('web/index.html','utf8');
  const boot = fs.readFileSync('web/launch-boot.js','utf8');
  assert.match(html,/launch-boot\.js\?v=[0-9a-z]+/);
  assert.ok(html.indexOf('launch-boot.js?v=') < html.indexOf('id="ustore-web-app"'));
  assert.ok(html.indexOf('launch-boot.js?v=') < html.indexOf('type="module" src="./app.js'));
  assert.match(html,/uw-shop-first-paint uw-initial-shop-skeleton/);
  assert.doesNotMatch(boot,/USTORE SHOP/);
  assert.doesNotMatch(boot,/Do‘kon tayyorlanmoqda/);
  assert.doesNotMatch(boot,/xush kelibsiz/);
  assert.match(boot,/dataset\.ustoreHost = isShop \? 'shop' : 'platform'/);
  assert.match(boot,/USTORE_BASE_HOSTNAME/);
});
