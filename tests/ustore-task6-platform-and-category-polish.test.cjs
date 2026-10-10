const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const platform = fs.readFileSync(path.join(root, 'platform/platform-app.js'), 'utf8');
const platformCss = fs.readFileSync(path.join(root, 'platform/platform.css'), 'utf8');
const shop = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const shopCss = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
function section(src, start, end) {
  const a = src.indexOf(start), b = src.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Missing section ${start} -> ${end}`);
  return src.slice(a,b);
}

test('user shops show coherent, separate status and plan/expiry with status-first ordering', () => {
  const body = section(platform, 'function renderMyShopsTab()', 'function openMyShopManage(');
  assert.match(body, /\[\.\.\.myShops\]\.sort\(/);
  assert.match(body, /ACTIVE:\s*0[\s\S]*?FROZEN:\s*2[\s\S]*?TERMINATED:\s*4/);
  for (const name of ['plat-shop-list-top','plat-shop-list-status','plat-shop-list-facts','plat-shop-list-open']) assert.ok(body.includes(name));
  assert.match(body, /openMyShopManage\('\$\{shop\.id\}'\)/);
  assert.match(platformCss, /min-width:700px[\s\S]*?plat-shop-list-simple\{grid-template-columns:repeat\(2/);
  assert.match(platformCss, /min-width:1180px[\s\S]*?plat-shop-list-simple\{grid-template-columns:repeat\(3/);
});

test('help cards distinguish create, problem report, and existing ticket history', () => {
  const help = section(platform, 'function renderHelpTab()', 'function filterHelpItems(');
  assert.match(help, /openSupportPage\('new'\)/);
  assert.match(help, /openSupportPage\('history'\)/);
  assert.match(help, /openPage\('BUG_REPORT'\)/);
  const body = section(platform, 'function renderSupportBody()', 'async function submitNewSupportMessage(');
  assert.match(body, /supportUserView === 'history'/);
  assert.match(body, /!viewHistory\s*\?/);
  assert.match(body, /ticketsHtml/);
  assert.match(platform, /window\.switchSupportUserView = switchSupportUserView;/);
  assert.match(platformCss, /max-width:599px[\s\S]*plat-help-primary-actions\{grid-template-columns:minmax\(0,1fr\)/);
});

test('support creates only via existing API and navigates to newly created ticket', () => {
  const src = section(platform, 'async function submitNewSupportMessage()', 'function supportThreadTitle()');
  assert.match(src, /platform_create_support_ticket/);
  assert.match(src, /type: 'SUPPORT', message/);
  assert.match(src, /supportUserView = 'history'/);
  assert.match(src, /openSupportThread\(result\.ticketId\)/);
});

test('renewal bypasses tariff shopping carousel and uses the same payment/period flow', () => {
  const entry = section(platform, 'function startExtendFor(shopId)', 'function startUpgradeFor(');
  assert.match(entry, /flowTariffId = shop\.tariffId/);
  assert.match(entry, /flowUpgradeAction = 'EXTEND'/);
  assert.match(entry, /openPage\('PAYMENT'\)/);
  const payment = section(platform, 'function renderPaymentBody()', 'function selectCardPayment()');
  assert.match(payment, /flowUpgradeAction === 'EXTEND' && shop/);
  assert.match(payment, /plat-renew-summary/);
  assert.match(payment, /renderBillingToggle\(\)/);
  assert.match(payment, /plat-payment-method-grid/);
  assert.match(payment, /Qolgan kunlar saqlanadi/);
});

test('renewal back respects payment history or shop details route', () => {
  const back = section(platform, 'function paymentBackAction()', 'function tariffsBackAction()');
  for (const v of ['MY_SHOP_DETAILS','MY_SHOP_SUB_PAYMENTS','PAYMENT_HISTORY']) assert.ok(back.includes(v));
});

test('native emoji and transparent category uploads get explicit backgroundless wrappers on mobile and featured categories', () => {
  assert.match(shop, /function categoryVisualShellClass\(category\)/);
  assert.match(shop, /fc-category-icon-frame\$\{categoryVisualShellClass\(sub\)\}/);
  assert.match(shop, /fc-cat-nav-icon\$\{categoryVisualShellClass\(c\)\}/);
  assert.match(shop, /fc-featured-cat-icon\$\{categoryVisualShellClass\(c\)\}/);
  assert.match(shopCss, /fc-category-icon-frame\.fc-category-visual-shell[\s\S]*background:transparent!important/);
  assert.match(shopCss, /\.fc-featured-cat-icon\.fc-category-visual-shell img[\s\S]*object-fit:contain!important/);
});

test('both entrypoints include fresh asset versions', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'),'utf8');
  const platformEntry = fs.readFileSync(path.join(root, 'platform/index.html'),'utf8');
  assert.match(html, /ustore\.css\?v=332/);
  assert.match(html, /ustore-shop-app\.js\?v=335/);
  assert.match(platformEntry, /platform\.css\?v=43/);
  assert.match(platformEntry, /platform-app\.js\?v=67/);
});
