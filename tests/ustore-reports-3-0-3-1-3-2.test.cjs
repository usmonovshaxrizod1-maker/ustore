// USTORE — Hisobotlar/Analytics round, 3.0/3.1/3.2-bosqich: umumiy
// sana-oralig'i yechuvchisi, Umumiy hisobot (get_report_overview), Savdo
// hisoboti (get_sales_report). Ixcham statik tahlil, mavjud uslubda.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shopApi = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');

test('resolveReportDateRange() defaults to a rolling 30-day window when no period/custom dates are given, and completely leaves get_dashboard_lite\'s own independent date logic untouched', () => {
  const start = shopApi.indexOf('function resolveReportDateRange(');
  const end = shopApi.indexOf('\nconst REPORT_PAYMENT_LABELS', start);
  const block = shopApi.slice(start, end);
  assert.match(block, /const period = typeof payload\?\.period === "string" \? payload\.period : "30d";/);
  assert.match(block, /from = new Date\(dayStart\.getTime\(\) - 29 \* 24 \* 3600 \* 1000\); to = nextDay;/, 'the default ("30d") branch must be a rolling 29-days-back-plus-today window');
  // get_dashboard_lite must still have its OWN separate, untouched period logic.
  const dashStart = shopApi.indexOf('case "get_dashboard_lite"');
  const dashBlock = shopApi.slice(dashStart, dashStart + 500);
  assert.match(dashBlock, /const now = new Date\(\);/, 'get_dashboard_lite must keep computing its own "now" independently, not delegate to the new helper');
});

test('resolveReportDateRange() honors an explicit dateFrom/dateTo custom range (end-of-day inclusive, +1 day exclusive upper bound) regardless of whatever period string was also sent', () => {
  const start = shopApi.indexOf('function resolveReportDateRange(');
  const block = shopApi.slice(start, start + 1600);
  assert.match(block, /if \(rawFrom && rawTo\) \{/);
  assert.match(block, /to = new Date\(new Date\(`\$\{rawTo\}T00:00:00\+05:00`\)\.getTime\(\) \+ 24 \* 3600 \* 1000\);/, 'dateTo must be treated as inclusive of its whole day, via a +1-day exclusive upper bound');
});

test('resolveReportDateRange() only returns a previous-period comparison window when the period is not "all" and the range does not start at epoch — avoiding a meaningless comparison against a non-existent "previous all-time"', () => {
  const start = shopApi.indexOf('function resolveReportDateRange(');
  const block = shopApi.slice(start, start + 1900);
  assert.match(block, /if \(period !== "all" && from\.getTime\(\) > 0\) \{/);
});

for (const action of ['get_report_overview', 'get_sales_report']) {
  test(`${action} requires the reports.view permission and scopes its main orders query to the current shop (.eq("shop_id", shopId)) — never trusting a client-supplied shop id`, () => {
    const start = shopApi.indexOf(`case "${action}"`);
    assert.ok(start >= 0, `${action} action must exist`);
    const block = shopApi.slice(start, start + 700);
    assert.match(block, /await requirePermission\('reports\.view'\);/);
    assert.match(block, /\.eq\("shop_id", shopId\)/);
  });
}

test('get_report_overview treats a CANCELLED status and a REJECTED receipt review as mutually-exclusive buckets (REJECTED takes priority over the status field), matching the exact convention get_dashboard_lite already established — a report must not silently double-count or diverge from the existing dashboard\'s definition of "cancelled"', () => {
  const start = shopApi.indexOf('case "get_report_overview"');
  const end = shopApi.indexOf('case "get_sales_report"', start);
  const block = shopApi.slice(start, end);
  assert.match(block, /if \(o\.receipt_review_status === "REJECTED"\) buckets\.REJECTED\+\+;\s*\n\s*else if \(buckets\[o\.status\] !== undefined\) buckets\[o\.status\]\+\+;/);
});

test('get_report_overview never divides by zero for avgOrderValue (guards soldOrders.length) or cancellationRate (guards orderCount), and the previous-period percent-change is null (not Infinity/NaN) whenever the previous value was zero — the spec explicitly requires omitting a comparison rather than showing a wrong one', () => {
  const start = shopApi.indexOf('case "get_report_overview"');
  const end = shopApi.indexOf('case "get_sales_report"', start);
  const block = shopApi.slice(start, end);
  assert.match(block, /const avgOrderValue = soldOrders\.length \? totalSales \/ soldOrders\.length : 0;/);
  assert.match(block, /const cancellationRate = orderCount \? \(cancelledOrders \/ orderCount\) \* 100 : 0;/);
  assert.match(block, /const pctChange = \(curr: number, prev: number\) => \(prev > 0 \? \(\(curr - prev\) \/ prev\) \* 100 : null\);/);
});

test('get_report_overview computes new/repeat customers from a query bounded to the specific tg_ids seen in the selected range (.in("tg_id", tgIdsInRange)) — never a full unscoped scan of every order the shop has ever had, keeping the report cheap as order volume grows', () => {
  const start = shopApi.indexOf('case "get_report_overview"');
  const end = shopApi.indexOf('case "get_sales_report"', start);
  const block = shopApi.slice(start, end);
  assert.match(block, /\.in\("tg_id", tgIdsInRange\)/);
  assert.doesNotMatch(block, /\.from\("orders"\)\.select\([^)]*\)\.eq\("shop_id", shopId\)\s*;\s*$/m, 'must never select ALL of a shop\'s orders with no additional scoping in this action');
});

test('get_sales_report groups "sales by region" using delivery_snapshot.regionKey (the true 14-region granular code), NOT the coarse orders.region column — orders.region only ever stores "TASHKENT"/"PROVINCE" (a 2-way split set by create_order), which would make a true per-region breakdown impossible', () => {
  const start = shopApi.indexOf('case "get_sales_report"');
  const end = shopApi.indexOf('case "get_warehouse_summary"', start);
  const block = shopApi.slice(start, end > start ? end : start + 6000);
  assert.match(block, /delivery_snapshot\?\.regionKey \|\| "UNKNOWN"/);
  assert.doesNotMatch(block, /const regionKey = \(o as any\)\.region\b/, 'must not fall back to the coarse orders.region column for the granular per-region report');
});

test('get_sales_report groups "sales by product" using the item\'s product_id (grouping all size/color variants of the same product together), not sku/name alone the way get_dashboard_lite\'s revenueByProduct does — a variative product must not be split into several smaller, under-reported rows', () => {
  const start = shopApi.indexOf('case "get_sales_report"');
  const end = shopApi.indexOf('case "get_warehouse_summary"', start);
  const block = shopApi.slice(start, end > start ? end : start + 6000);
  assert.match(block, /const pid = String\(it\.product_id \|\| it\.name \|\| "\?"\);/);
});

test('get_sales_report accepts optional region/payMethod/status/productId filters — payMethod and status are pushed down to the DB query (.eq), while region and productId are applied in JS after fetch (because regionKey lives inside the delivery_snapshot jsonb column and productId requires scanning the items array)', () => {
  const start = shopApi.indexOf('case "get_sales_report"');
  const block = shopApi.slice(start, start + 1200);
  assert.match(block, /if \(filterPayMethod\) q = q\.eq\("pay_method", filterPayMethod\);/);
  assert.match(block, /if \(filterStatus\) q = q\.eq\("status", filterStatus\);/);
  assert.match(block, /if \(filterRegion\) orders = orders\.filter/);
  assert.match(block, /if \(filterProductId\) orders = orders\.filter/);
});

test('get_sales_report caps the "by product" breakdown at the top 100 by revenue — an unbounded per-product list on a shop with thousands of SKUs would be a large, unpaginated payload, which the spec\'s performance section explicitly warns against', () => {
  const start = shopApi.indexOf('case "get_sales_report"');
  const end = shopApi.indexOf('case "get_warehouse_summary"', start);
  const block = shopApi.slice(start, end > start ? end : start + 6000);
  assert.match(block, /\.sort\(\(a, b\) => b\.revenue - a\.revenue\)\.slice\(0, 100\);/);
});
