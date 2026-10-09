const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function actionBlock(action, nextAction) {
  const start = api.indexOf(`case "${action}"`);
  assert.ok(start >= 0, `${action} action must exist`);
  const end = nextAction ? api.indexOf(`case "${nextAction}"`, start) : api.indexOf('case "get_warehouse_summary"', start);
  return api.slice(start, end > start ? end : start + 14000);
}

test('default report period stays the last 30 days and overview adds week / 3 month / year presets', () => {
  assert.match(api, /const period = typeof payload\?\.period === "string" \? payload\.period : "30d"/);
  assert.match(api, /period === "90d"/);
  assert.match(api, /period === "year"/);
  assert.match(app, /\['week', '30d', '90d', 'year'\]/);
});

test('custom report range uses Tashkent day boundaries and one exclusive end day', () => {
  assert.match(api, /`\$\{rawFrom\}T00:00:00\+05:00`/);
  assert.match(api, /`\$\{rawTo\}T00:00:00\+05:00`/);
  assert.match(api, /24 \* 3600 \* 1000/);
  assert.match(app, /else if \(key < reportCalendarDraftFrom\)/, 'visual calendar must normalize a reverse-picked range');
});

test('current-vs-previous comparison uses an equal-length preceding period and guards previous zero', () => {
  assert.match(api, /const spanMs = to\.getTime\(\) - from\.getTime\(\)/);
  assert.match(api, /new Date\(from\.getTime\(\) - spanMs\)/);
  assert.match(api, /prev > 0 \? \(\(curr - prev\) \/ prev\) \* 100 : null/);
});

test('overview backend returns server-side timeline, payment, region, product and order-status aggregations', () => {
  const block = actionBlock('get_report_overview', 'get_sales_report');
  assert.match(block, /buildReportSalesTimeline\(orders, fromIso, toIso\)/);
  assert.match(block, /paymentBreakdown/);
  assert.match(block, /regionBreakdown/);
  assert.match(block, /topProducts/);
  assert.match(block, /orderStatuses/);
});

test('sales backend reports total, order count, AOV, timeline and all breakdowns from the same filtered order set', () => {
  const block = actionBlock('get_sales_report', 'get_customer_report');
  assert.match(block, /avgOrderValue: soldOrderCount > 0 \? grandTotal \/ soldOrderCount : 0/);
  assert.match(block, /salesTimeline: buildReportSalesTimeline\(orders, fromIso, toIso\)/);
  assert.match(block, /byRegion, byProduct, byPaymentMethod, byStatus/);
});

test('unpaid, cancelled and rejected orders never enter sales totals or historical product revenue', () => {
  assert.match(api, /o\.payment_status === "PAID" && o\.receipt_review_status !== "REJECTED" && o\.status !== "CANCELLED"/);
  const products = actionBlock('get_product_report');
  assert.match(products, /if \(o\.payment_status !== "PAID" \|\| o\.status === "CANCELLED" \|\| o\.receipt_review_status === "REJECTED"\) continue/);
  assert.match(products, /const items = Array\.isArray\(o\.items\) \? o\.items : \[\]/);
});

test('customer PII is removed from API rows unless the caller also has customers.view', () => {
  const block = actionBlock('get_customer_report', 'get_product_report');
  assert.match(block, /canViewCustomerPii/);
  assert.match(block, /has\("customers\.view"\)/);
  assert.match(block, /phone: canViewCustomerPii \? \(u\.phone \|\| null\) : null/);
  assert.match(block, /piiVisible: canViewCustomerPii/);
});

test('all report queries remain scoped to server-resolved shopId', () => {
  for (const action of ['get_report_overview', 'get_sales_report', 'get_customer_report', 'get_product_report']) {
    const block = actionBlock(action, action === 'get_report_overview' ? 'get_sales_report' : action === 'get_sales_report' ? 'get_customer_report' : action === 'get_customer_report' ? 'get_product_report' : undefined);
    assert.match(block, /await requirePermission\('reports\.view'\)/);
    assert.match(block, /\.eq\("shop_id", shopId\)/);
    assert.doesNotMatch(block, /payload\.shopId|payload\.shop_id/);
  }
});

test('overview UI contains the four primary KPI cards and all dashboard sections', () => {
  assert.match(app, /tr\('Jami savdo'/);
  assert.match(app, /tr\('Buyurtmalar'/);
  assert.match(app, /tr\('O‘rtacha chek'/);
  assert.match(app, /tr\('Mijozlar'/);
  for (const marker of ['Savdo dinamikasi', 'To‘lov turlari', 'Hududlar bo‘yicha savdo', 'Eng ko‘p sotilgan mahsulotlar', 'Buyurtma holatlari']) assert.ok(app.includes(marker), marker);
});

test('line chart has touch/focus tooltips and a clean empty state instead of a fake chart', () => {
  assert.match(app, /function reportTrendChartHtml/);
  assert.match(app, /onclick="showReportChartTooltip/);
  assert.match(app, /onfocus="showReportChartTooltip/);
  assert.match(app, /Tanlangan davrda savdo mavjud emas/);
});

test('loading is a KPI/chart skeleton and API failure offers retry', () => {
  assert.match(app, /function reportSkeletonHtml/);
  assert.match(css, /\.fc-report-skeleton/);
  assert.match(app, /Hisobotlarni yuklab bo‘lmadi/);
  assert.match(app, /Qayta urinish/);
});

test('sales payment filters are generated from configured providers instead of a frozen Click/Payme list', () => {
  assert.match(app, /function reportPaymentFilterOptions/);
  assert.match(app, /fulfillmentConfig\?\.payments\?\.methods/);
  assert.match(app, /`QR:\$\{provider\.id\}`/);
  assert.match(app, /reportPaymentFilterOptions\(\)\.map/);
});

test('mobile and desktop layouts, 320px handling, and theme tokens are explicit', () => {
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(min-width:640px\)/);
  assert.match(css, /@media\(max-width:359px\)/);
  assert.match(css, /var\(--ustore-card-bg/);
  assert.match(css, /var\(--ustore-primary/);
});

test('PDF stays device-side, uses vector charts, same loaded report data and a sanitized filename', () => {
  assert.match(app, /window\.jspdf && window\.jspdf\.jsPDF/);
  assert.match(app, /function drawPdfLineChart/);
  assert.match(app, /reportOverviewData/);
  assert.match(app, /replace\(\/\[\\\\\/:\*\?"<>\|\]\+\/g, '_'\)/);
  assert.doesNotMatch(actionBlock('get_report_overview', 'get_sales_report'), /storage|upload/i);
});

test('cache versions are bumped together for the report frontend release', () => {
  // POLISH ROUND (7-topshiriq, 2026-08-30): v99->v100 for this round's changes.
  assert.match(html, /ustore\.css\?v=331/);
  assert.match(html, /ustore-shop-app\.js\?v=333/);
});

