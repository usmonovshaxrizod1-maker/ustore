const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('returning shop paints branding and product placeholders before the app loads', () => {
  const host = 'fitcore.ustr.uz';
  const app = { children: [], replaceChildren(...children) { this.children = children; } };
  const title = { textContent: '' };
  const logo = { children: [], append(child) { this.children.push(child); } };
  const document = {
    querySelector(selector) { return selector === '#ustore-web-app' ? app : null; },
    createElement(tag) {
      if (tag === 'img') return { src: '', alt: '' };
      return {
        className: '', innerHTML: '', attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        querySelector(selector) { return selector === 'strong' ? title : selector === '.uw-shop-first-paint__logo' ? logo : null; },
      };
    },
  };
  const context = {
    location: { hostname: host, pathname: '/' },
    APP_CONFIG: { USTORE_BASE_HOSTNAME: 'ustr.uz' },
    sessionStorage: { getItem: () => '1' },
    localStorage: { getItem: () => JSON.stringify({ name: 'Fitcore', logoUrl: 'https://example.test/logo.svg' }) },
    document,
  };
  vm.runInNewContext(read('web/launch-boot.js'), context);
  assert.equal(context.__USTORE_SHOP_LAUNCH_SKIP__, true);
  assert.equal(app.children.length, 1);
  assert.equal(title.textContent, 'Fitcore');
  assert.match(app.children[0].innerHTML, /uw-shop-first-paint__hero/);
  assert.match(app.children[0].innerHTML, /uw-shop-first-paint__cards/);
  assert.equal(logo.children[0].src, 'https://example.test/logo.svg');
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
      assert.match(html, new RegExp(`${asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\?v=20261002premium1`));
    }
  }
});
