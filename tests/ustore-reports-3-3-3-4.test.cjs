// USTORE — Hisobotlar/Analytics round, 3.3/3.4-bosqich: Mijozlar hisoboti
// (get_customer_report), Mahsulot hisoboti (get_product_report). Ixcham
// statik tahlil, mavjud uslubda.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shopApi = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');

function reportBlock(action, nextAction) {
  const start = shopApi.indexOf(`case "${action}"`);
  assert.ok(start >= 0, `${action} must exist`);
  const end = nextAction ? shopApi.indexOf(`case "${nextAction}"`, start) : shopApi.indexOf('case "get_warehouse_summary"', start);
  return shopApi.slice(start, end > start ? end : start + 8000);
}

for (const action of ['get_customer_report', 'get_product_report']) {
  test(`${action} requires the reports.view permission and scopes every query to the current shop`, () => {
    const block = reportBlock(action, action === 'get_customer_report' ? 'get_product_report' : undefined);
    assert.match(block, /await requirePermission\('reports\.view'\);/);
    assert.match(block, /\.eq\("shop_id", shopId\)/);
  });
}

test('get_customer_report computes each customer row (totalOrders/totalSpent/firstOrderAt/lastOrderAt) from the customer\'s ENTIRE order history, not just the selected date range — the orders query has no .gte("created_at",...) date filter, only the KPI/segment logic below it reasons about the selected window', () => {
  const block = reportBlock('get_customer_report', 'get_product_report');
  const ordersQueryLine = block.match(/db\.from\("orders"\)\.select\("tg_id,payable_total,total_price,status,payment_status,receipt_review_status,created_at"\)\.eq\("shop_id", shopId\)[^,\n]*/)?.[0] || '';
  assert.ok(ordersQueryLine, 'could not find the orders query for get_customer_report');
  assert.doesNotMatch(ordersQueryLine, /\.gte\(|\.lt\(/, 'the orders fetch that feeds per-customer lifetime stats must not be date-windowed');
});

test('get_customer_report\'s NEW segment filters on firstOrderAt falling inside the selected [fromIso,toIso) window (lifetime-first-order-in-this-window), matching the same "new customer" definition used by get_report_overview', () => {
  const block = reportBlock('get_customer_report', 'get_product_report');
  assert.match(block, /case "NEW": list = list\.filter\(\(c: any\) => c\.firstOrderAt && c\.firstOrderAt >= fromIso && c\.firstOrderAt < toIso\)/);
});

test('get_customer_report\'s HIGH_CANCEL segment requires at least 3 total orders before flagging a high cancellation rate — a customer with exactly 1 cancelled order out of 1 would otherwise show a meaningless 100% rate', () => {
  const block = reportBlock('get_customer_report', 'get_product_report');
  assert.match(block, /case "HIGH_CANCEL": list = list\.filter\(\(c: any\) => c\.totalOrders >= 3 && c\.cancellationRate >= 30\)/);
});

test('get_customer_report search matches across name, username, phone, AND raw Telegram id — a seller might search by any of these, not just a name', () => {
  const block = reportBlock('get_customer_report', 'get_product_report');
  assert.match(block, /String\(c\.name \|\| ""\)\.toLowerCase\(\)\.includes\(search\)/);
  assert.match(block, /String\(c\.username \|\| ""\)\.toLowerCase\(\)\.includes\(search\)/);
  assert.match(block, /String\(c\.phone \|\| ""\)\.toLowerCase\(\)\.includes\(search\)/);
  assert.match(block, /String\(c\.tgId\)\.includes\(search\)/);
});

test('get_customer_report paginates its result list server-side (page/pageSize, clamped, totalPages) rather than ever returning every customer in one payload — large customer lists must not blow up the client DOM', () => {
  const block = reportBlock('get_customer_report', 'get_product_report');
  assert.match(block, /const totalPages = Math\.max\(1, Math\.ceil\(totalCount \/ pageSize\)\);/);
  assert.match(block, /const clampedPage = Math\.min\(page, totalPages\);/);
  assert.match(block, /const pageItems = list\.slice\(\(clampedPage - 1\) \* pageSize, clampedPage \* pageSize\);/);
});

test('get_product_report derives unitsSold/revenue from orders.items (a per-order SNAPSHOT of name/price/product_id at sale time), never from a live join on the current products table — so a product later moved to Trash or hidden keeps its historical sales figures exactly as they were', () => {
  const block = reportBlock('get_product_report');
  assert.match(block, /const items = Array\.isArray\(o\.items\) \? o\.items : \[\];/);
  assert.match(block, /const pid = String\(it\.product_id \|\| it\.name \|\| "\?"\);/);
});

test('get_product_report handles a deleted/missing product gracefully in rowFor() — falls back to the order-item snapshot\'s name/sku and returns currentStock: null / isDeleted: true, instead of throwing on a missing product row', () => {
  const block = reportBlock('get_product_report');
  assert.match(block, /name: p\?\.name \|\| agg\?\.name \|\| pid/);
  assert.match(block, /isDeleted: !p \|\| p\.status === "DELETED",/);
  assert.match(block, /currentStock: p && p\.status !== "DELETED" \? [\s\S]{0,200}? : null,/);
});

test('get_product_report\'s NEVER_SOLD view excludes DELETED products (nothing useful to restock) and only includes products with zero entries in the current-period sales aggregation', () => {
  const block = reportBlock('get_product_report');
  assert.match(block, /if \(view === "NEVER_SOLD"\) \{/);
  assert.match(block, /\.filter\(\(p: any\) => p\.status !== "DELETED" && !currentAgg\.has\(String\(p\.id\)\)\)/);
});

test('get_product_report\'s LOW_STOCK/OUT_OF_STOCK views reuse the SAME computeStockState()/resolveLowStockThreshold() helpers the Warehouse page and admin action-center already use, instead of a third, potentially-divergent low-stock definition', () => {
  const block = reportBlock('get_product_report');
  assert.match(block, /computeStockState\(p, lowStockThreshold\) === wantState/);
  assert.match(block, /resolveLowStockThreshold\(settingsR\.data\?\.low_stock_threshold\)/);
});

test('get_product_report only fetches the previous-period comparison orders when the view actually needs a trend (TRENDING_UP/TRENDING_DOWN) — every other view skips that extra query entirely', () => {
  const block = reportBlock('get_product_report');
  assert.match(block, /const needsPrev = view === "TRENDING_UP" \|\| view === "TRENDING_DOWN";/);
  assert.match(block, /needsPrev && prevFromIso && prevToIso\s*\n\s*\? db\.from\("orders"\)/);
});
