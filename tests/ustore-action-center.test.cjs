// USTORE — 18-band: bosh sahifadagi admin "e'tibor talab qiladi" markazi.
// Ixcham statik tahlil.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shopApi = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');

test('get_admin_action_center requires reports.view permission and uses count-only/head queries (never fetches full order or product rows) — it must stay cheap enough to call on every home-tab visit, unlike get_dashboard_lite', () => {
  const start = shopApi.indexOf('case "get_admin_action_center"');
  const end = shopApi.indexOf('\n      case "get_dashboard_lite"', start);
  const block = shopApi.slice(start, end);
  assert.match(block, /await requirePermission\('reports\.view'\);/);
  assert.match(block, /\{ count: "exact", head: true \}\)\.eq\("shop_id", shopId\)\.eq\("status", "NEW"\)/, 'new-orders count must be a head-only count query');
  assert.match(block, /\.not\("payment_receipt_path", "is", null\)\.eq\("receipt_review_status", "PENDING"\)/);
  assert.doesNotMatch(block, /\.select\("\*"\)/, 'must never select("*") — this runs on every home visit, must stay lightweight');
});

test('the low-stock count reuses the SAME computeStockState()/resolveLowStockThreshold() helpers the Warehouse page already uses, instead of a second, potentially-divergent low-stock definition', () => {
  const start = shopApi.indexOf('case "get_admin_action_center"');
  const block = shopApi.slice(start, start + 1600);
  assert.match(block, /computeStockState\(p, lowStockThreshold\) !== "OK"/);
  assert.match(block, /resolveLowStockThreshold\(settingsR\.data\?\.low_stock_threshold\)/);
});

test('the home action-center only fetches once per session (loadOrdersLazy-style guard), never re-fetching on every render() while the admin is browsing the home tab', () => {
  const start = appJs.indexOf('async function loadAdminActionCenterLazy(');
  const block = appJs.slice(start, start + 500);
  assert.match(block, /if \(adminActionCenterLoading \|\| \(adminActionCenterLoaded && !force\)\) return;/);
});

test('each action-center card is only shown when its count is actually > 0 — a shop with nothing pending shows NOTHING (an empty placeholder div), not a permanent "all clear" card cluttering the home screen', () => {
  const start = appJs.indexOf('function renderAdminActionCenterHtml()');
  const block = appJs.slice(start, start + 2200);
  assert.match(block, /\.filter\(card => Number\(c\[card\.key\]\) > 0\)/);
  assert.match(block, /if \(!cards\.length\) \{\s*return `<div id="admin-action-center"><\/div>`;/);
});

// REGRESSION (real, LIVE-DEPLOYED bug found 2026-08-24): renderHome() calls
// renderAdminActionCenterHtml() synchronously INSIDE its own template
// literal, BEFORE loadAdminActionCenterLazy() has ever been kicked off — so
// on every admin's very first home-tab render, adminActionCenter is still
// null AND adminActionCenterLoading is still false. The old code's guard
// (`if (!c && adminActionCenterLoading)`) only caught the null case while
// ALSO loading, so this exact null+not-yet-loading combination fell through
// to `c[card.key]` on a null c — a TypeError thrown mid-template-literal,
// which aborts renderHome()'s `container.innerHTML = ...` assignment
// entirely, leaving the page frozen on the static "Yuklanmoqda..." spinner
// FOREVER for every single admin (this is a static-analysis suite; only a
// real executed call catches a null-dereference like this, so this test
// actually invokes the extracted function instead of just regex-matching).
test('renderAdminActionCenterHtml() does not throw when called with adminActionCenter still null and adminActionCenterLoading still false (the exact state on an admin\'s very first home-tab render) — must render a spinner placeholder instead of crashing', () => {
  const fnStart = appJs.indexOf('function renderAdminActionCenterHtml()');
  const fnEnd = appJs.indexOf('\n    function openBannerTarget', fnStart);
  assert.ok(fnStart >= 0 && fnEnd > fnStart, 'could not isolate renderAdminActionCenterHtml() source');
  const fnSrc = appJs.slice(fnStart, fnEnd);

  let adminActionCenter = null;
  const adminActionCenterLoading = false; // the real pre-first-fetch state
  function tr(uz) { return uz; }
  // eslint-disable-next-line no-eval
  eval(fnSrc.replace('function renderAdminActionCenterHtml', 'var renderAdminActionCenterHtml = function'));
  let html;
  assert.doesNotThrow(() => { html = renderAdminActionCenterHtml(); }, 'must not throw when adminActionCenter is null and not (yet) loading');
  assert.match(html, /fc-spinner/, 'must render the loading placeholder, not attempt to read counts off a null object');
});

test('action-center cards reuse EXISTING navigation helpers (dashboardGoToOrders/openAdminSupportOrUserSupport); the low/out-of-stock card was deliberately removed from the home page (shop-improvement round item 5) — stock info still lives on the dedicated Warehouse page, just not as a home quick-link', () => {
  const start = appJs.indexOf('function renderAdminActionCenterHtml()');
  const block = appJs.slice(start, start + 1600);
  assert.match(block, /onclick: "dashboardGoToOrders\('NEW'\)"/);
  assert.match(block, /onclick: "openAdminSupportOrUserSupport\(\)"/);
  assert.doesNotMatch(block, /dashboardGoToWarehouseFilter/, 'the low/out-of-stock quick-link card must stay removed from the home action center');
});
