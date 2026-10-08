const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('shop opening is selected before body render without placeholder cards', () => {
  const boot = read('web/launch-boot.js');
  const html = read('web/index.html');
  assert.match(boot, /document\.documentElement\.dataset\.ustoreHost = isShop \? 'shop' : 'platform'/);
  assert.match(html, /<script src="\.\/launch-boot\.js\?v=20261008admin1"><\/script>[\s\S]*<script type="module" src="\.\/app\.js\?v=20261008admin1"><\/script>/);
  assert.match(html, /uw-shop-opening uw-initial-shop-opening/);
  assert.doesNotMatch(html, /uw-shop-first-paint|uw-initial-shop-skeleton/);
  assert.match(read('web/styles/index.css'), /html\[data-ustore-host="shop"\] \.uw-launch--platform\{display:none!important\}/);
});

test('category icon fallback never depends on a legacy image URL', () => {
  const source = read('ustore-shop-app.js');
  const start = source.indexOf('function categoryIconMarkup(category) {');
  const end = source.indexOf('function normalizedIconSearch', start);
  assert.ok(start >= 0 && end > start);
  const markup = vm.runInNewContext(`${source.slice(start, end)}\ncategoryIconMarkup`, {
    CATEGORY_ICON_COLORS: ['brand', 'green'],
    CATEGORY_ICON_SPRITE: '/category-icons.svg',
    escapeHtml: (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
  });
  assert.match(markup({ img: 'https://example.test/old.jpg' }), /#stationery_folder/);
  assert.doesNotMatch(markup({ img: 'https://example.test/old.jpg' }), /<img|old\.jpg/);
  assert.match(markup({ iconId: 'sports_ball', iconColor: 'green' }), /is-green.*#sports_ball/);
  assert.match(markup({ iconId: '<unsafe>', img: 'https://example.test/old.jpg' }), /#stationery_folder/);
});

test('product delivery and payment hints follow enabled shop configuration', () => {
  const source = read('ustore-shop-app.js');
  const start = source.indexOf('function storefrontDeliverySignalsHtml() {');
  const end = source.indexOf('function storefrontFooterHtml()', start);
  assert.ok(start >= 0 && end > start);
  const config = {
    delivery: { fixed: { enabled: true, regions: { tashkent_city: { enabled: true } } } },
    payments: { methods: [
      { id: 'CASH', enabled: true, regions: { tashkent_city: { enabled: true } } },
      { id: 'PAYME', enabled: false, regions: { tashkent_city: { enabled: true } } },
    ] },
  };
  const signals = vm.runInNewContext(`${source.slice(start, end)}\nstorefrontDeliverySignalsHtml`, {
    isAdminMode: false,
    fulfillmentConfig: config,
    tr: (uz) => uz,
    escapeHtml: (value) => String(value),
  });
  assert.match(signals(), /Yetkazib berish mavjud/);
  assert.match(signals(), /To‘lov: Naqd/);
  assert.doesNotMatch(signals(), /Payme/);
  config.delivery.fixed.enabled = false;
  config.payments.methods[0].regions.tashkent_city.enabled = false;
  assert.equal(signals(), '');
});

test('shop and deep-link HTML load one coherent web release', () => {
  for (const entry of ['web/index.html', 'web/404.html']) {
    const html = read(entry);
    for (const asset of ['styles/index.css', 'app.js', 'launch-boot.js']) {
      assert.match(html, new RegExp(`${asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\?v=20261008admin1`));
    }
  }
});
