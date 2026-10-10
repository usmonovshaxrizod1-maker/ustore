const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function block(startNeedle, endNeedle, fallback = 7000) {
  const start = app.indexOf(startNeedle);
  assert.ok(start >= 0, `${startNeedle} must exist`);
  const end = endNeedle ? app.indexOf(endNeedle, start + startNeedle.length) : -1;
  return app.slice(start, end > start ? end : start + fallback);
}

test('Shop App 2.0 theme builder exposes five premium presets plus O\'zim yarataman and keeps backend-compatible custom theme state', () => {
  const b = block('function renderDesignSettingsPage', 'function renderOrderPolicySettingsPanel');
  for (const id of ['minimal','bright','sport','elegant','dark']) assert.match(b, new RegExp(`['"]${id}['"]`));
  assert.match(b, /O'zim yarataman/);
  assert.match(app, /function startCustomDesign\(\)/);
  assert.match(app, /themeId:'custom'/);
});

test('Shop App 2.0 theme builder has isolated live Home/Product/Cart preview and does not apply draft globally until save', () => {
  assert.match(app, /let designPreviewMode = 'HOME'/);
  assert.match(app, /\['HOME','PRODUCT','CART'\]/);
  assert.match(app, /function renderDesignPreviewHtml/);
  const pick = block('function pickDesignTheme', 'function startCustomDesign');
  assert.doesNotMatch(pick, /applyDesignColors\(/);
  const save = block('async function saveDesignSettings', 'function openOrderInfoSettings');
  assert.match(save, /callApi\('set_design_settings'/);
  assert.match(save, /applyDesignColors\(designSettings\.colors, designSettings\.themeId\)/);
});

test('Theme builder supports human-readable color roles, highlight, WCAG contrast validation, auto-fix, edit rollback and reset', () => {
  assert.match(app, /const DESIGN_COLOR_HELP/);
  assert.match(app, /function highlightDesignToken/);
  assert.match(app, /const WCAG_AA_RATIO = 4\.5/);
  assert.match(app, /function autoFixDesignContrast\(\)/);
  assert.match(app, /function resetDesignDraftToSaved\(\)/);
  assert.match(app, /async function resetDesignDraftToDefault\(\)/);
  assert.match(app, /async function closeDesignSettings/);
  assert.match(app, /O'zgarishlar saqlanmadi/);
});

test('Saved merchant theme is applied consistently to storefront and admin surfaces', () => {
  const b = block('function applyDesignColors', 'function designDraftNormalized');
  assert.match(b, /writeDesignColorsToRoot\(storefront\)/);
  assert.doesNotMatch(b, /ADMIN_THEME_COLORS/);
  assert.doesNotMatch(b, /isAdminMode && isUserAnAdmin/);
});

test('Admin command center is a backdrop-dismissed overlay with no X requirement and reuses real operations data', () => {
  const b = block('function renderAdminCommandCenterOverlay', 'async function loadAdminCommandCenterData');
  assert.match(b, /fc-admin-command-center-root/);
  assert.match(b, /event\.target===this\) closeAdminCommandCenter\(\)/);
  assert.match(b, /Boshqaruv markazi/);
  assert.match(app, /get_admin_action_center/);
  assert.match(app, /get_dashboard_lite/);
  assert.match(app, /function adminSevenDaySalesSeries/);
  assert.match(app, /function adminAttentionRows/);
});

test('Admin command center includes real onboarding checklist and quick-create routes that reuse existing flows', () => {
  assert.match(app, /function adminOnboardingSteps\(\)/);
  assert.match(app, /Do'koningizni ishga tayyorlang/);
  assert.match(app, /function adminOnboardingAction/);
  assert.match(app, /function adminQuickCreate/);
  for (const kind of ['PRODUCT','CATEGORY','BANNER','PROMO']) assert.match(app, new RegExp(`['"]${kind}['"]`));
});

test('Admin orders have readable mobile cards, desktop table, Keyingi amal, progress and sticky primary action', () => {
  assert.match(app, /function renderAdminOrderCardHtml/);
  const table = block('function renderAdminOrdersTableHtml', 'function renderOrders');
  for (const label of ['Buyurtma','Mijoz','Yetkazish','Status','Jami','Vaqt']) assert.match(table, new RegExp(label));
  assert.match(app, /function adminOrderNextAction/);
  assert.match(app, /Keyingi amal/);
  assert.match(app, /function renderAdminOrderProgressHtml/);
  assert.match(app, /fc-order-sticky-action/);
  assert.match(css, /@media\(min-width:1024px\)[\s\S]*fc-admin-orders-table/);
});

test('Admin profile menu is visually grouped into management, store, sales/marketing, team and support areas', () => {
  for (const label of ['Boshqaruv',"Do\'kon boshqaruvi",'Savdo va marketing','Jamoa','Yordam']) assert.match(app, new RegExp(label));
  assert.match(css, /fc-profile-admin-group/);
});

test('Native alert and confirm dialogs are fully removed from live Shop App code', () => {
  assert.doesNotMatch(app, /\balert\s*\(/);
  assert.doesNotMatch(app, /\bconfirm\s*\(/);
  assert.match(app, /function showAppNotice/);
  assert.match(app, /async function appConfirm/);
  assert.match(app, /function fcConfirm/);
});

test('User Home reuses real recently-viewed data and product detail shows only configured delivery signals', () => {
  assert.match(app, /function renderRecentHomeHtml/);
  assert.match(app, /home-recent-root/);
  assert.match(app, /function storefrontDeliverySignalsHtml/);
  assert.match(app, /fulfillmentConfig/);
  assert.doesNotMatch(block('function storefrontDeliverySignalsHtml', 'function renderHome'), /2 soat|2 часа/i);
});

test('Admin visual polish uses neutral UStorE design and no-rainbow overrides for Marketing/Ombor plus wider desktop content', () => {
  assert.match(css, /body\.fc-admin-mode/);
  assert.match(css, /fc-mkt-pro-hub/);
  assert.match(css, /fc-warehouse/);
  assert.match(css, /max-width:1100px!important/);
  assert.match(css, /#f6f8fb/i);
  assert.match(css, /#2684ff/i);
});

test('Final Shop App assets are cache-busted for the Shop App 2.0 release', () => {
  assert.match(html, /ustore\.css\?v=331/);
  assert.match(html, /ustore-shop-app\.js\?v=334/);
  assert.match(html, /ustore-commerce\.js\?v=8/);
});

