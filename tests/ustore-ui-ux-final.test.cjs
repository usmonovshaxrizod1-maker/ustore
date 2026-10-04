const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('home search, filter chips and catalog chips share one sticky surface', () => {
  const start = app.indexOf('function renderHome(container)');
  const block = app.slice(start, start + 4000);
  const stickyStart = block.indexOf('fc-home-sticky-bar');
  const stickyEnd = block.indexOf('</div>\n\n          ${renderBannerCarouselHtml()', stickyStart);
  const sticky = block.slice(stickyStart, stickyEnd);
  assert.match(sticky, /id="search-input"/);
  assert.match(sticky, /openCategoryFilterModal/);
  assert.match(sticky, /renderFeaturedCategoriesRowHtml\(\)/);
  assert.match(sticky, /renderActiveFilterChipsHtml\(\)/);
});

test('sticky height and catalog offset are measured dynamically', () => {
  assert.match(app, /function updateHomeStickyMetrics\(\)/);
  assert.match(app, /--ustore-home-sticky-height/);
  assert.match(app, /\(header\?\.offsetHeight \|\| 0\) \+ \(sticky\?\.offsetHeight \|\| 0\)/);
  assert.match(css, /scroll-margin-top:calc\(var\(--ustore-header-height\) \+ var\(--ustore-home-sticky-height\)/);
});

test('text zoom is controlled by a bounded two-finger gesture without a header button', () => {
  assert.doesNotMatch(html, /id="header-zoom-btn"|id="header-text-zoom-range"/);
  assert.match(app, /touchstart/);
  assert.match(app, /touchmove/);
  assert.match(app, /touchDistance/);
  assert.match(app, /Math\.max\(-2, Math\.min\(2,/);
  assert.match(app, /localStorage\.setItem\('textZoomLevel', String\(textZoomLevel\)\)/);
  const profile = app.slice(app.indexOf('function renderProfile'), app.indexOf('function readShopContactFormValues'));
  assert.doesNotMatch(profile, /fc-textzoom-card/);
});

test('dark theme uses semantic premium surfaces and readable inputs', () => {
  assert.match(app, /dark: \{ label:[\s\S]*?pageBg:'#15253c'[\s\S]*?cardBg:'#203652'/);
  assert.match(css, /html\.ustore-dark-theme input:not\(\[type="color"\]\)[\s\S]*?color:var\(--ustore-text\)!important/);
  assert.match(css, /html\.ustore-dark-theme \.fc-sheet/);
});

test('boot failure always offers retry instead of an endless loader', () => {
  assert.match(html, /setTimeout\(showBootFailure, 15000\)/);
  assert.match(html, /Qayta urinish/);
  assert.match(app, /document\.body\.dataset\.appReady = 'true'/);
});

test('home has no separate promotions section call', () => {
  const home = app.slice(app.indexOf('function renderHome(container)'), app.indexOf('function handleSearchDebounced'));
  assert.doesNotMatch(home, /renderHomeBundlesSectionHtml\(\)/);
});

test('profile exposes reports in responsive mobile + desktop admin views and no platform-admin row', () => {
  const profile = app.slice(app.indexOf('function renderProfile(container)'), app.indexOf('function readShopContactFormValues'));
  assert.equal((profile.match(/openReportsPage\(\)/g) || []).length, 2);
  assert.match(profile, /profileMenuRowHtml\(\{ icon: 'bar-chart-3'/);
  assert.match(profile, /profileAdminTileHtml\(\{ icon:'bar-chart-3'/);
  assert.doesNotMatch(profile, /openPlatformAdminsPage|Platforma adminlari/);
});
