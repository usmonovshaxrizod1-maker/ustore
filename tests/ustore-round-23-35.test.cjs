const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
const api = fs.readFileSync(path.join(root, 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');

test('staff UI is gated by exact permissions instead of broad admin mode', () => {
  assert.match(app, /function canManageProducts\(\).*hasPermission\('products\.manage'\)/);
  assert.match(app, /function canManageCatalog\(\).*hasPermission\('catalog\.manage'\)/);
  assert.match(app, /function canManageOrders\(\).*hasPermission\('orders\.manage'\)/);
  assert.match(app, /hasPermission\('support\.manage'\)/);
  assert.match(app, /Qo'llab-quvvatlash/);
  assert.match(app, /hasPermission\('marketing\.manage'\)/);
  assert.match(app, /openMarketingHubPage\(\)/);
  assert.match(app, /hasPermission\('shop\.settings\.manage'\) \? profileMenuRowHtml/);
});

test('staff invite/permission state refreshes quickly and closes revoked pages', () => {
  assert.match(app, /setInterval\(refreshMyStaffAccess, 12000\)/);
  assert.match(app, /pagePermissionAllowed\(activePage\)/);
  assert.match(app, /loadStaffListLazy\(true\)/);
  assert.match(app, /window\.addEventListener\('focus', refreshMyStaffAccess\)/);
});

// 2-paket, 4-topshiriq: tartiblash pastki ro'yxatdan yuqoridagi 5 slotga
// ko'chirildi (pastki ro'yxatda endi UMUMAN drag yo'q) — shu bilan
// `beginAdminBannerDrag`/`.fc-banner-admin-drag` eskirdi, o'rniga
// `beginBannerSlotDrag` (bannerSlotList ustida ishlaydi).
test('banner ordering is a mobile pointer drag on the top 5 slots, not the admin list', () => {
  assert.match(app, /data-banner-admin-id=/);
  assert.match(app, /beginBannerSlotDrag/);
  assert.doesNotMatch(app, /beginAdminBannerDrag/);
  assert.match(app, /banner_reorder.*bannerList\.map/);
  assert.match(css, /\.fc-banner-slot-drag/);
  assert.doesNotMatch(app.slice(app.indexOf('function renderBannerCarouselHtml'), app.indexOf('function initBannerCarousel')), /fc-banner-home-drag/);
});

test('header is clean and carries the single shop logo; settings remain in profile content', () => {
  assert.doesNotMatch(html, /header-settings-btn|header-logo-edit-btn/);
  assert.match(html, /id="header-shop-logo"/);
  assert.doesNotMatch(app, /fc-shop-public-logo/);
  assert.match(app, /title: tr\("Do'kon parametrlari"/);
  assert.doesNotMatch(app, /id="sc-address-ru"/);
  assert.match(api, /hasOwnProperty\.call\(payload, "addressRu"\)/);
});

test('generic mutation progress is disabled so actions use contextual non-blocking feedback instead', () => {
  assert.match(app, /function apiActionNeedsProgress/);
  const progress = app.slice(app.indexOf('function apiActionNeedsProgress'), app.indexOf('async function callApi'));
  assert.match(progress, /return false/);
  assert.doesNotMatch(progress, /Amal bajarilmoqda/);
  const callApiBlock = app.slice(app.indexOf('async function callApi'), app.indexOf('function scopedKey'));
  assert.doesNotMatch(callApiBlock, /beginVisibleMutation\(\)/);
  assert.doesNotMatch(callApiBlock, /endVisibleMutation\(\)/);
  assert.match(app, /Qaytarish muddati/);
  assert.match(app, /Saqlab bo‘lmadi\. Qayta urinib ko‘ring\./);
});

test('featured home catalogs are restored in marketing and rendered as a real tree', () => {
  assert.match(app, /folder-heart.*Bosh sahifa kataloglari/);
  assert.match(app, /function renderFeaturedTreeNodes/);
  assert.match(css, /\.fc-featured-tree-children/);
  assert.match(app, /scrollToFeaturedCategoryBlock/);
  assert.match(css, /\.fc-cat-nav-row\{[^}]*overflow-x:auto/);
});

test('tenant behavior remains bot-scoped and has no Fitcore-only runtime branch', () => {
  assert.match(app, /function scopedKey\(name\) \{ return browserBridge \? `ustore:\$\{BOT_ID\}:web:\$\{browserViewerKey\}:\$\{name\}` : `ustore:\$\{BOT_ID\}:\$\{name\}`; \}/);
  assert.match(app, /body: JSON\.stringify\(\{ action, payload: payload \|\| \{\}, initData, botId: BOT_ID \}\)/);
  assert.doesNotMatch(app, /BOT_ID\s*===\s*['"][^'"]+['"]/);
});
