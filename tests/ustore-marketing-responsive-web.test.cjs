const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const responsive = css.slice(css.indexOf('2026-10-09 — SHOP APP / browser / tablet+desktop / admin MARKETING only.'));
test('marketing responsive overrides activate only in browser admin at tablet+ sizes', () => {
  assert.match(responsive, /@media \(min-width:768px\)/);
  assert.match(responsive, /body\.ustore-browser-mode\.fc-admin-mode/);
  assert.doesNotMatch(responsive, /body\.fc-admin-mode(?!\.ustore-browser-mode)/);
  assert.match(responsive, /\.fc-mkt-pro-hub \.fc-marketing-hub-grid\s*\{[\s\S]*?repeat\(3,minmax\(0,1fr\)\)!important/);
});
test('every admin marketing list and major modal belongs to browser adaptive rules', () => {
  for (const name of ['banners','bundles','promos','tiers','gifts','personal']) {
    assert.ok(responsive.includes('.fc-mkt-pro-' + name + ' >'), `list ${name}`);
  }
  for (const id of ['fc-banner-form-root','fc-bundle-form-root','fc-promo-form-root','fc-tier-form-root',
    'fc-reward-rule-form-root','fc-personal-discount-form-root','fc-marketing-picker-root',
    'fc-banner-slot-picker-root','fc-gift-type-root','fc-personal-discount-picker-root']) {
    assert.ok(responsive.includes('#' + id), `dialog ${id}`);
  }
  assert.match(responsive, /max-height:calc\(100dvh - 48px\)!important/);
  assert.match(responsive, /overflow-y:auto!important/);
  assert.match(responsive, /\.fc-mkt-pro-form \.fc-sheet-body\s*\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
});
test('marketing feature selectors do not modify app business logic or mobile', () => {
  assert.match(app, /fc-marketing-featured-page/);
  assert.match(app, /fc-marketing-settings-page/);
  for (const fn of ['renderMarketingHubPage','renderBannersPage','renderBundlesPage','renderDiscountTiersPage','renderRewardRulesPage','renderPersonalDiscountsPage','renderPromoPage']) {
    assert.match(app, new RegExp('function ' + fn + '\\('));
  }
  assert.match(html, /ustore\.css\?v=331/);
  assert.match(html, /ustore-shop-app\.js\?v=334/);
});
