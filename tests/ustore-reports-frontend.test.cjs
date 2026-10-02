// USTORE — Hisobotlar/Analytics round, 3.5/3.6-bosqich (frontend): Hisobotlar
// sahifasi (4 tab: Umumiy/Savdo/Mijozlar/Mahsulotlar) + PDF eksport. REAL
// executable smoke tests for the 4 render functions AND the 4 PDF exporters
// (cold/loading/error/no-data/populated state — the exact class of
// null-dereference crash that shipped once already this session on the home
// page's admin-action-center widget), plus lean static checks for permission
// gating and router/menu wiring.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appPath = path.join(__dirname, '..', 'ustore-shop-app.js');
const app = fs.readFileSync(appPath, 'utf8');

function extract(name, endMarker) {
  const start = Math.max(app.indexOf(`function ${name}(`), app.indexOf(`async function ${name}(`));
  assert.ok(start >= 0, `${name} must exist`);
  const end = app.indexOf(endMarker, start);
  assert.ok(end > start, `end marker not found for ${name}`);
  return app.slice(start, end);
}

test('openReportsPage()/the profile menu row are gated by hasPermission(\'reports.view\') — a staff member without that permission cannot reach the Hisobotlar page', () => {
  const start = app.indexOf('function openReportsPage(');
  const block = app.slice(start, start + 250);
  assert.match(block, /if \(!\(isAdminMode && isUserAnAdmin && hasPermission\('reports\.view'\)\)\) return;/);
  assert.match(app, /\$\{hasPermission\('reports\.view'\) \? profileMenuRowHtml\(\{ icon: 'bar-chart-3'/);
});

test('renderActivePage routes REPORTS to renderReportsPage, and the old openDashboardLite()/DASHBOARD entry point is left completely untouched (both entry points coexist)', () => {
  assert.match(app, /case 'REPORTS': renderReportsPage\(container\); break;/);
  assert.match(app, /onclick: "openDashboardLite\(\)"/, 'the pre-existing simple dashboard menu row must still be present, unchanged');
});

test('reports use the same compact visual calendar pattern as orders', () => {
  const start = app.indexOf('function openReportPeriodSheet(');
  const end = app.indexOf('function reportKpiCardHtml', start);
  const block = app.slice(app.indexOf('function renderReportCalendarHtml'), end);
  assert.match(block, /renderReportCalendarHtml/);
  assert.match(block, /fc-orders-calendar-grid/);
  assert.doesNotMatch(block, /report-date-from|report-date-to|allowPresets/);
});

test('all 4 report render functions execute without throwing across cold (no data yet, not loading, no error), loading, and error states — this is the exact null-dereference crash class (adminActionCenter bug, fixed earlier this session) that only a REAL executed call catches, not a regex match', () => {
  function tr(uz) { return uz; }
  function escapeHtml(s) { return String(s == null ? '' : s); }
  function formatNumber(v) { return String(Math.round(Number(v || 0))); }
  function money(v) { return formatNumber(v) + ' sum'; }
  function paginate(list, page, pageSize = 10) {
    const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
    const clampedPage = Math.min(Math.max(1, page || 1), totalPages);
    const start = (clampedPage - 1) * pageSize;
    return { items: list.slice(start, start + pageSize), totalPages, page: clampedPage };
  }
  function renderPagerHTML(page, totalPages) { return totalPages > 1 ? `<div>${page}/${totalPages}</div>` : ''; }
  const REGION_DEFS = [{ code: 'tashkent_city', nameUz: 'Toshkent shahri', nameRu: 'Город Ташкент' }];
  const REPORT_CHART_COLORS = ['#3b82f6', '#22c55e'];
  const REPORT_PRODUCT_VIEWS = [['TOP_REVENUE', () => "Ko'p tushum"], ['NEVER_SOLD', () => 'Sotilmagan']];

  const fns = [
    ['reportKpiCardHtml', extract('reportKpiCardHtml', '\n    function reportRankingBarsHtml')],
    ['reportRankingBarsHtml', extract('reportRankingBarsHtml', '\n    function reportDonutHtml')],
    ['reportDonutHtml', extract('reportDonutHtml', '\n    function renderReportsPage')],
    ['renderReportOverviewTab', extract('renderReportOverviewTab', '\n    function renderReportSalesTab')],
    ['renderReportSalesTab', extract('renderReportSalesTab', '\n    function renderReportCustomerTab')],
    ['renderReportCustomerTab', extract('renderReportCustomerTab', '\n    const REPORT_PRODUCT_VIEWS')],
    ['renderReportProductTab', extract('renderReportProductTab', "\n    // ---- Qo")],
  ];
  let body = '';
  for (const [name, code] of fns) body += code.replace(`async function ${name}(`, `var ${name} = async function(`).replace(`function ${name}(`, `var ${name} = function(`) + ';\n';

  let reportOverviewData = null, reportOverviewLoading = false, reportOverviewError = null;
  let reportSalesData = null, reportSalesLoading = false, reportSalesError = null;
  const reportSalesFilters = { regionCode: '', payMethod: '', status: '' };
  let reportSalesProductPage = 1;
  let reportCustomerData = null, reportCustomerLoading = false, reportCustomerError = null;
  const reportCustomerSearch = '', reportCustomerSegment = 'ALL', reportCustomerPage = 1;
  let reportProductData = null, reportProductLoading = false, reportProductError = null;
  const reportProductView = 'TOP_REVENUE', reportProductPage = 1;

  // eslint-disable-next-line no-eval
  eval(body);

  const scenarios = [
    ['cold', {}],
    ['loading', { loading: true }],
    ['error', { error: 'network error' }],
  ];
  for (const [label, opts] of scenarios) {
    reportOverviewLoading = reportSalesLoading = reportCustomerLoading = reportProductLoading = !!opts.loading;
    reportOverviewError = reportSalesError = reportCustomerError = reportProductError = opts.error || null;
    for (const [fnLabel, fn] of [
      ['overview', renderReportOverviewTab], ['sales', renderReportSalesTab],
      ['customer', renderReportCustomerTab], ['product', renderReportProductTab],
    ]) {
      let html;
      assert.doesNotThrow(() => { html = fn(); }, `renderReport${fnLabel[0].toUpperCase()}${fnLabel.slice(1)}Tab() must not throw in the "${label}" state`);
      assert.equal(typeof html, 'string', `renderReport${fnLabel}Tab() must return a string in the "${label}" state`);
    }
  }
});

test('PDF download uploads to a private short-lived signed URL and opens it in the external browser inside Telegram, keeping a browser/share fallback', () => {
  // 2026-09-10: Telegram native downloadFile() was dropped for report PDFs
  // too — same real-device failure as the Excel template. openLink to the
  // external browser + Content-Disposition: attachment is the reliable path.
  const helperStart = app.indexOf('async function saveReportPdf(');
  const helper = app.slice(helperStart, helperStart + 3800);
  assert.match(helper, /doc\.output\('blob'\)/);
  assert.match(helper, /window\.Telegram\?\.WebApp\?\.openLink/);
  assert.match(helper, /callApi\('upload_report_pdf'/);
  assert.match(helper, /window\.Telegram\.WebApp\.openLink\(String\(uploaded\.url\)/);
  assert.match(helper, /browserSaveReportBlob/);
  assert.doesNotMatch(helper, /Telegram\.WebApp\.downloadFile\(/, 'the unreliable native downloadFile() call must be gone from the report PDF flow');
});

test('Umumiy PDF loads sales, all customer pages and product detail groups, then creates explicit 2nd/3rd detail sections', () => {
  const start = app.indexOf('async function loadOverviewPdfDetails()');
  const end = app.indexOf('async function exportSalesPdf()', start);
  assert.ok(start >= 0 && end > start);
  const block = app.slice(start, end);
  assert.match(block, /callApi\('get_sales_report'/);
  assert.match(block, /get_customer_report/);
  assert.match(block, /get_product_report/);
  assert.match(block, /TOP_REVENUE/);
  assert.match(block, /LOW_STOCK/);
  assert.match(block, /OUT_OF_STOCK/);
  assert.match(block, /NEVER_SOLD/);
  assert.match(block, /2\. Savdo tafsilotlari/);
  assert.match(block, /3\. Mijozlar va mahsulotlar/);
  assert.match(block, /fetchAllPagedReportForPdf/);
  assert.match(block, /pdfAddPageNumbers/);
});

test('all 4 PDF exporters execute against a mock jsPDF without throwing, both when no report data is loaded yet and with realistic populated data', async () => {
  function extract(name, endMarker) {
    const asyncStart = app.indexOf(`async function ${name}(`);
    const start = asyncStart >= 0 ? asyncStart : app.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `${name} must exist`);
    const end = app.indexOf(endMarker, start);
    assert.ok(end > start, `end marker not found for ${name}`);
    return app.slice(start, end);
  }
  function tr(uz) { return uz; }
  function escapeHtml(s) { return String(s == null ? '' : s); }
  function formatNumber(v) { return String(Math.round(Number(v || 0))); }
  function money(v) { return formatNumber(v) + ' sum'; }
  function shopDisplayName() { return "Test Do'kon"; }
  const uiLang = 'uz';
  const REPORT_PRODUCT_VIEWS = [['TOP_REVENUE', () => 'Kop tushum']];
  function showActionToast() {}

  function makeFakeDoc() {
    const doc = {
      setFontSize() { return doc; }, setTextColor() { return doc; }, setFillColor() { return doc; }, setDrawColor() { return doc; },
      text(t) { if (typeof t !== 'string' && !Array.isArray(t)) throw new Error('text() got non-string: ' + t); return doc; },
      rect() { return doc; }, line() { return doc; }, circle() { return doc; }, addPage() { doc._pages = (doc._pages || 1) + 1; return doc; },
      getNumberOfPages() { return doc._pages || 1; }, setPage() { return doc; },
      internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
      autoTable(opts) {
        if (!opts || !Array.isArray(opts.head) || !Array.isArray(opts.body)) throw new Error('autoTable() called with a bad opts shape');
        for (const row of opts.body) for (const cell of row) if (cell === undefined) throw new Error('autoTable() body cell is undefined');
        doc.lastAutoTable = { finalY: (opts.startY || 0) + 20 };
        return doc;
      },
      save(filename) { if (!filename || typeof filename !== 'string') throw new Error('save() got a bad filename'); return doc; },
    };
    return doc;
  }
  global.window = { jspdf: { jsPDF: function () { return makeFakeDoc(); } } };

  const fns = [
    ['sanitizePdfFilename', extract('sanitizePdfFilename', '\n    function pdfFilenameFor')],
    ['pdfFilenameFor', extract('pdfFilenameFor', '\n    function reportPdfAvailable')],
    ['reportPdfAvailable', extract('reportPdfAvailable', '\n    let reportPdfLibPromise')],
    ['drawPdfRankingBars', extract('drawPdfRankingBars', '\n    function newReportPdfDoc')],
    ['newReportPdfDoc', extract('newReportPdfDoc', '\n    function pdfKpiGrid')],
    ['pdfKpiGrid', extract('pdfKpiGrid', '\n    function pdfSectionTitle')],
    ['pdfSectionTitle', extract('pdfSectionTitle', '\n    function pdfEnsureSpace')],
    ['pdfEnsureSpace', extract('pdfEnsureSpace', '\n    function pdfNoDataYetToast')],
    ['pdfNoDataYetToast', extract('pdfNoDataYetToast', '\n    function pdfLibMissingAlert')],
    ['pdfLibMissingAlert', extract('pdfLibMissingAlert', '\n    async function exportActiveReportPdf')],
    ['pdfPageHeader', extract('pdfPageHeader', '\n    function pdfAddPageNumbers')],
    ['pdfAddPageNumbers', extract('pdfAddPageNumbers', '\n    async function fetchAllPagedReportForPdf')],
    ['fetchAllPagedReportForPdf', extract('fetchAllPagedReportForPdf', '\n    async function loadOverviewPdfDetails')],
    ['loadOverviewPdfDetails', extract('loadOverviewPdfDetails', '\n    async function exportOverviewPdf')],
    ['exportOverviewPdf', extract('exportOverviewPdf', '\n    async function exportSalesPdf')],
    ['exportSalesPdf', extract('exportSalesPdf', '\n    async function exportCustomerPdf')],
    ['exportCustomerPdf', extract('exportCustomerPdf', '\n    async function exportProductPdf')],
    ['exportProductPdf', extract('exportProductPdf', '\n    // ---- Qo')],
  ];
  let body = '';
  for (const [name, code] of fns) body += code.replace(`async function ${name}(`, `var ${name} = async function(`).replace(`function ${name}(`, `var ${name} = function(`) + ';\n';

  let reportOverviewData = null, reportSalesData = null, reportCustomerData = null, reportProductData = null;
  function reportsPeriodLabel() { return 'Oxirgi 30 kun'; }
  function reportsPeriodParams() { return { period: '30d' }; }
  function reportStatusLabel(status) { return String(status || '-'); }
  async function callApi(action, payload = {}) {
    if (action === 'get_sales_report') return { totalSales: 0, totalOrders: 0, soldOrderCount: 0, avgOrderValue: 0, byStatus: [], byPaymentMethod: [], byRegion: [], byProduct: [] };
    if (action === 'get_customer_report') return { page: payload.page || 1, pageSize: payload.pageSize || 100, totalPages: 1, piiVisible: true, kpi: { totalCustomers: 0, newCustomers: 0, repeatCustomers: 0, oneTimeCustomers: 0, avgCustomerSpend: 0, topSpender: null }, customers: [] };
    if (action === 'get_product_report') return { page: payload.page || 1, pageSize: payload.pageSize || 100, totalPages: 1, products: [] };
    throw new Error('unexpected action: ' + action);
  }
  async function saveReportPdf(doc, filename) { doc.save(filename); }
  // eslint-disable-next-line no-eval
  eval(body);

  await assert.doesNotReject(exportOverviewPdf(), 'must not throw with no data loaded (no-data guard)');
  await assert.doesNotReject(exportSalesPdf(), 'must not throw with no data loaded (no-data guard)');
  await assert.doesNotReject(exportCustomerPdf(), 'must not throw with no data loaded (no-data guard)');
  await assert.doesNotReject(exportProductPdf(), 'must not throw with no data loaded (no-data guard)');

  reportOverviewData = { totalSales: 12500000, orderCount: 42, completedOrders: 30, cancelledOrders: 7, cancellationRate: 16.7, avgOrderValue: 297619, totalUnitsSold: 88, totalCustomers: 25, newCustomers: 6, topProduct: { name: 'M1', revenue: 3000000 }, topRegion: { label: 'Toshkent', revenue: 5000000 }, topPaymentMethod: { label: 'Naqd', revenue: 6000000 }, dateFrom: '2026-07-25', dateTo: '2026-08-24' };
  await assert.doesNotReject(exportOverviewPdf(), 'must not throw with populated overview data');

  reportSalesData = { totalSales: 12000000, totalOrders: 40, dateFrom: '2026-07-25', dateTo: '2026-08-24', byRegion: [{ regionLabel: 'Toshkent', salesAmount: 5000000 }], byProduct: [{ name: 'M1', unitsSold: 12, orderCount: 8, revenue: 3000000 }], byPaymentMethod: [{ label: 'Naqd', salesAmount: 6000000, orderCount: 20, sharePercent: 50 }] };
  await assert.doesNotReject(exportSalesPdf(), 'must not throw with populated sales data');

  reportCustomerData = { kpi: { totalCustomers: 25, newCustomers: 6, repeatCustomers: 9, avgCustomerSpend: 500000 }, page: 1, totalPages: 2, dateFrom: '2026-07-25', dateTo: '2026-08-24', customers: [{ name: 'Aziz', phone: null, successfulOrders: 1, totalSpent: 100000, lastOrderAt: null }] };
  await assert.doesNotReject(exportCustomerPdf(), 'must not throw with populated customer data, including a customer with no phone/lastOrderAt');

  reportProductData = { view: 'TOP_REVENUE', dateFrom: '2026-07-25', dateTo: '2026-08-24', products: [{ name: 'M1', unitsSold: 12, orderCount: 8, revenue: 3000000, currentStock: null }] };
  await assert.doesNotReject(exportProductPdf(), 'must not throw with populated product data, including a product with a null currentStock (deleted product)');
});
