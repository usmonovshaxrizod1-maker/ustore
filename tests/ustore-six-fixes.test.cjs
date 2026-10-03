const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const shop = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const shopCss = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
const shopHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const platform = fs.readFileSync(path.join(root, 'platform', 'platform-app.js'), 'utf8');
const platformCss = fs.readFileSync(path.join(root, 'platform', 'platform.css'), 'utf8');
const platformHtml = fs.readFileSync(path.join(root, 'platform', 'index.html'), 'utf8');
const platformApi = fs.readFileSync(path.join(root, 'supabase', 'functions', 'platform-api', 'index.ts'), 'utf8');

function block(src, startNeedle, endNeedle, limit = 12000) {
  const start = src.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing ${startNeedle}`);
  const end = endNeedle ? src.indexOf(endNeedle, start + startNeedle.length) : -1;
  return src.slice(start, end > start ? end : start + limit);
}

test('SIX-1 provisioning verifies the bot then applies requested name, bio/description and JPG profile photo without changing username', () => {
  const sync = block(platformApi, 'async function syncRequestedBotProfile', 'async function storePlatformAsset');
  assert.match(sync, /setMyName/);
  assert.match(sync, /setMyShortDescription/);
  assert.match(sync, /setMyDescription/);
  assert.match(sync, /setMyProfilePhoto/);
  assert.match(sync, /attach:\/\/profile_photo/);
  assert.match(sync, /profile\.jpg/);
  assert.doesNotMatch(sync, /setMyUsername|changeUsername|setUsername/i);

  const provision = block(platformApi, 'case "platform_provision_shop_from_request"', 'case "platform_connect_bot"', 26000);
  assert.match(provision, /telegramApi\(botToken, "getMe", \{\}\)/);
  assert.match(provision, /syncRequestedBotProfile\(db, botToken, reqRow, shopId\)/);
  assert.match(platform, /normalizeBotProfilePhotoToJpeg/);
  assert.match(platform, /new window\.File\(\[blob\], 'bot-profile\.jpg', \{ type:'image\/jpeg'/);
  assert.match(platform, /Ulanish va sozlash/);
});

test('SIX-2 NEW_SHOP identity has local draft persistence plus server-side bot-name/bio draft persistence and restore', () => {
  assert.match(platform, /NEW_SHOP_FORM_DRAFT_TTL_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(platform, /function saveNewShopLocalDraft\(\)/);
  assert.match(platform, /function clearNewShopLocalDraft\(\)/);
  assert.match(platform, /loadNewShopLocalDraft\(\)/);
  const identity = block(platform, 'function renderNewShopRequestIdentity', 'function updateNewShopRequestIdentity');
  assert.match(identity, /plat-new-shop-bot-name[\s\S]*oninput="updateNewShopRequestIdentity\(\)"/);
  assert.match(identity, /plat-new-shop-bot-bio[\s\S]*oninput="updateNewShopRequestIdentity\(\)"/);
  const update = block(platform, 'function updateNewShopRequestIdentity', 'function detectMyTelegramId');
  assert.match(update, /newShopBotName =/);
  assert.match(update, /newShopBotBio =/);
  assert.match(update, /saveNewShopLocalDraft\(\)/);
  assert.match(update, /scheduleNewShopDraftSync\(\)/);
  const prepare = block(platform, 'async function ensureNewShopPaymentDraft', 'function scheduleNewShopDraftSync');
  assert.match(prepare, /botName: String\(newShopBotName/);
  assert.match(prepare, /botBio: String\(newShopBotBio/);
  const resume = block(platform, 'async function resumeNewShopPayment', '// 2026-08-28');
  assert.match(resume, /newShopBotName = r\.requestedBotName/);
  assert.match(resume, /newShopBotBio = r\.requestedBotBio/);
  assert.match(resume, /saveNewShopLocalDraft\(\)/);
  assert.match(platformApi, /requested_bot_name: requestedBotName/);
  assert.match(platformApi, /requested_bot_bio: requestedBotBio/);
});

test('SIX-2/3 same-view rerenders preserve non-secret form values, focus and real scroll containers in Platform and Shop App', () => {
  const platCapture = block(platform, 'function capturePlatformUiState', 'function findRenderFocusTarget');
  assert.match(platCapture, /#app input,#app textarea,#app select/);
  assert.match(platCapture, /\.plat-page-body/);
  assert.match(platCapture, /password','file','hidden/);
  assert.match(platCapture, /token\|secret\|password\|credential\|api\[-_ \]\?key/);
  const platRestore = block(platform, 'function restorePlatformUiState', 'function render(options)');
  assert.match(platRestore, /el\.value = st\.value/);
  assert.match(platRestore, /el\.scrollTop = st\.top/);
  assert.match(platRestore, /preventScroll: true/);

  const shopCapture = block(shop, 'function captureShopRenderState', 'function restoreShopRenderState');
  assert.match(shopCapture, /#app-content input/);
  assert.match(shopCapture, /#page-container/);
  assert.match(shopCapture, /#modal-container/);
  assert.match(shopCapture, /password','file','hidden/);
  assert.match(shop, /lastRenderedUiKey === uiKeyBeforeRender \? captureShopRenderState\(\) : null/);
});

test('SIX-3 command center keeps its scroll position when background data causes overlay rerender', () => {
  const center = block(shop, 'function renderAdminCommandCenterOverlay', 'async function loadAdminCommandCenterData');
  assert.match(center, /previousScrollTop = root\?\.querySelector\('\.fc-command-scroll'\)\?\.scrollTop \|\| 0/);
  assert.match(center, /scrollTop\s*=\s*previousScrollTop/);
  assert.match(center, /requestAnimationFrame/);
});

test('SIX-4 Store Settings intro is a non-actionable section heading, while real settings remain menu rows', () => {
  const settings = block(shop, 'function renderSettingsPage', 'async function saveOrderPolicies');
  assert.match(settings, /fc-settings-root-intro/);
  assert.doesNotMatch(settings, /fc-settings-root-icon/);
  assert.match(settings, /fc-settings-menu-list/);
  for (const label of ["Buyurtmalarni qabul qilish", 'Yetkazib berish parametrlari', "To'lov parametrlari", 'Qaytarish va bekor qilish', 'Huquqiy hujjatlar', 'Dizayn']) {
    assert.ok(settings.includes(label), `missing settings item: ${label}`);
  }
  assert.match(shopCss, /\.fc-settings-root-intro\{[^}]*background:transparent[^}]*border:0[^}]*box-shadow:none/);
});

test('SIX-5 custom design editor is compact, saved theme applies in admin too, and Sport is visually distinct from Minimal', () => {
  const custom = block(shop, 'function renderDesignCustomEditorPage', 'function renderSettingsPage');
  assert.match(custom, /renderDesignPreviewHtml\(activeColors, true\)/);
  assert.match(shopCss, /\.fc-design-preview-shell\.is-compact\{/);
  assert.match(shopCss, /max-width:360px/);
  const apply = block(shop, 'function applyDesignColors', 'function designDraftNormalized');
  assert.match(apply, /writeDesignColorsToRoot\(storefront\)/);
  assert.doesNotMatch(apply, /ADMIN_THEME_COLORS/);
  assert.match(shop, /sport: \{[^\n]*primary:'#16a34a'[^\n]*button:'#111827'/);
  assert.match(shop, /minimal: \{[^\n]*primary:'#2563eb'/);
});

test('SIX-6 admin and user orders use one obvious compact status selector beside the calendar instead of a row of status chips', () => {
  assert.match(shop, /function renderOrderStatusCompactFilter\(value, onchangeJs\)/);
  const helper = block(shop, 'function renderOrderStatusCompactFilter', 'function renderAdminOrders');
  assert.match(helper, /fc-orders-status-select/);
  assert.match(helper, /chevron-down/);
  assert.match(helper, /<select/);
  const orders = block(shop, 'function renderOrders(container)', 'function setAdminStatusFilter');
  assert.match(orders, /fc-orders-filter-toolbar/);
  assert.match(orders, /renderOrderStatusCompactFilter\(adminOrderFilters\.status/);
  assert.match(orders, /renderOrdersDateFilterHtml\(\)/);
  const userOrdersStart = shop.indexOf('renderOrderStatusCompactFilter(userOrderFilter');
  assert.notEqual(userOrdersStart, -1);
  assert.match(shop.slice(userOrdersStart - 1500, userOrdersStart + 1500), /fc-orders-filter-toolbar/);
  assert.match(shopCss, /\.fc-orders-status-select\{[^}]*grid-template-columns:18px minmax\(0,1fr\) 16px/);
  assert.match(shopCss, /\.fc-orders-status-select select\{[^}]*appearance:none/);
});

test('SIX release cache versions are bumped after the modified Platform and Shop App assets', () => {
  assert.match(shopHtml, /ustore\.css\?v=318/);
  assert.match(shopHtml, /ustore-shop-app\.js\?v=318/);
  assert.match(platformHtml, /platform\.css\?v=40/);
  assert.match(platformHtml, /platform-app\.js\?v=61/);
});

