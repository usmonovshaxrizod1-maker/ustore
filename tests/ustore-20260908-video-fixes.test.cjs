const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
const excel = fs.readFileSync(path.join(root, 'excel-import.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const shopApi = fs.readFileSync(path.join(root, 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');

function block(src, startNeedle, endNeedle, limit = 18000) {
  const start = src.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing ${startNeedle}`);
  const end = endNeedle ? src.indexOf(endNeedle, start + startNeedle.length) : -1;
  return src.slice(start, end > start ? end : start + limit);
}

test('VIDEO-1 staged Store Settings actions are dirty-only and menu pages have no meaningless save/cancel pair', () => {
  const helpers = block(app, 'function fulfillmentDraftDirty()', 'function renderOrderPolicySettingsPage');
  assert.match(helpers, /id="fulfillment-dirty-actions"/);
  assert.match(helpers, /fulfillmentDraftDirty\(\) \? '' : 'hidden'/);
  assert.match(helpers, /cancelFulfillmentDraftChanges/);
  assert.match(helpers, /if \(view === 'MENU'\)[\s\S]*renderDeliverySettingsMenuHtml\(\)[\s\S]*return;/);

  const payment = block(app, 'function renderPaymentSettingsPage', 'function renderPaymentsMenuHtml');
  assert.match(payment, /paymentViewUsesFulfillmentDraftActions\(\) \? fulfillmentDraftActionHtml/);
  const viewRouter = block(app, 'function paymentViewUsesFulfillmentDraftActions', 'function syncFulfillmentActionVisibility');
  assert.match(viewRouter, /\['CASH','CARD','QR'\]/);
  assert.match(viewRouter, /return false/);
});

test('VIDEO-1 action pair is compact floating 42x42 with 18px icons and no card wrapper', () => {
  assert.match(css, /2026-09-08 VIDEO FIX BATCH/);
  assert.match(css, /\.fc-icon-action-bar\{[\s\S]*padding:0!important;[\s\S]*background:transparent!important;[\s\S]*border:0!important;[\s\S]*box-shadow:none!important;/);
  assert.match(css, /\.fc-action-icon-btn\{[\s\S]*width:42px!important;[\s\S]*height:42px!important;[\s\S]*border-radius:12px!important;/);
  assert.match(css, /\.fc-action-icon-btn>svg,\.fc-action-icon-btn>i\{[\s\S]*width:18px!important;[\s\S]*height:18px!important;/);
  assert.match(css, /\.fc-icon-action-bar\.hidden\{display:none!important\}/);
});

test('VIDEO-2 global switch geometry is stable and settings labels keep their width', () => {
  assert.match(css, /\.fc-toggle\{width:44px!important;height:26px!important;min-width:44px!important;flex:0 0 44px!important\}/);
  assert.match(css, /\.fc-toggle-track::after\{[\s\S]*width:22px!important;[\s\S]*height:22px!important;/);
  assert.match(css, /translateX\(18px\)!important/);
  assert.match(css, /\.fc-settings-toggle-row\{[\s\S]*grid-template-columns:minmax\(0,1fr\) 44px!important;/);
  assert.match(css, /\.fc-settings-toggle-row:has\(> \.fc-settings-menu-icon\)[\s\S]*40px minmax\(0,1fr\) 44px/);
});

test('VIDEO-2 return-policy switch/day updates are optimistic, queued and rollback-safe', () => {
  const save = block(app, 'async function saveOrderPolicies(patch)', 'function renderSettingsPage');
  assert.match(save, /applyOrderPolicyPatch\(normalized\)/);
  assert.match(save, /rerenderOrderPolicyPanel\(\)/);
  assert.match(save, /const task = orderPoliciesSaveChain\.catch/);
  assert.match(save, /orderPoliciesSaveChain = task\.catch/);
  assert.match(save, /applyOrderPolicyPatch\(rollback\)/);
  const toast = block(app, 'function orderPolicyToastFor', 'async function saveOrderPolicies');
  assert.match(toast, /Qaytarish muddati/);
  const panel = block(app, 'function renderOrderPolicySettingsPanel', 'function rerenderOrderPolicyPanel');
  assert.doesNotMatch(panel, /returnRequestsEnabled[^\n]{0,300}disabled/);
});

test('VIDEO-3 Excel template download opens the signed URL in the external browser inside Telegram (openLink) and uses <a download> only in a plain browser', () => {
  // 2026-09-10: Telegram native downloadFile() was dropped — on real
  // Android/iOS it showed the "… 12 KB / Yuklash" dialog but never actually
  // saved the file. openLink -> external browser + Content-Disposition:
  // attachment is the reliable path on every platform.
  assert.match(excel, /function fallbackTemplateDownload/);
  assert.doesNotMatch(excel, /Telegram\.WebApp\.downloadFile/, 'the unreliable native downloadFile path must be gone');
  assert.match(excel, /if\(telegramOpenLink\(url\)\)return 'telegram-link';/);
  assert.match(excel, /fallbackTemplateDownload\(url,fileName,pendingWindow\)/);
  assert.match(excel, /webApp\.openLink/);
  assert.match(excel, /a\.download=fileName/);
  assert.match(app, /ensureScript\('\.\/excel-import\.js\?v=16'\)/);
  const server = block(shopApi, 'case "get_excel_template_url":', 'case "start_import_batch":');
  assert.match(server, /shopDisplayNameForMessages\(db, shopId\)/);
  assert.match(server, /_mahsulot_shabloni\.xlsx/);
});

test('VIDEO-4 command center background refresh does not replay its open animation and keeps scroll', () => {
  const center = block(app, 'function renderAdminCommandCenterOverlay()', 'async function loadAdminCommandCenterData');
  assert.match(center, /const wasAlreadyOpen = !!root/);
  assert.match(center, /data-refreshing/);
  assert.match(center, /previousScrollTop/);
  assert.match(center, /const currentPanel = root\.querySelector\('\.fc-command-panel'\)/);
  assert.match(center, /currentScroller\.innerHTML = nextScroller\.innerHTML/);
  assert.match(center, /scrollTop ?= ?previousScrollTop/);
  const load = block(app, 'async function loadAdminCommandCenterData', 'function adminCommandCenterTodayKey');
  assert.doesNotMatch(load, /adminCommandCenterLoading = true;[^\n]*renderAdminCommandCenterOverlay/);
  assert.match(css, /#fc-admin-command-center-root\[data-refreshing\] \.fc-command-panel\{animation:none!important\}/);
});

test('VIDEO-5 one-tap variant color choice is protected from programmatic gallery-scroll feedback', () => {
  assert.match(app, /let productGalleryProgrammaticTarget = null/);
  const scroll = block(app, 'function scrollProductGalleryTo', 'function syncActiveVariantFromGalleryIndex');
  assert.match(scroll, /productGalleryProgrammaticTarget/);
  const onScroll = block(app, 'function onProductGalleryScroll', 'function selectColor');
  assert.match(onScroll, /const programmatic = productGalleryProgrammaticTarget/);
  assert.match(onScroll, /syncActiveVariantFromGalleryIndex/);
  const select = block(app, 'function selectColor', 'function selectSize');
  assert.match(select, /activeColorName = name/);
  assert.match(select, /previousSize/);
  assert.match(select, /scrollProductGalleryToColor/);
});

test('VIDEO-6 Marketing text zoom survives important CSS and dynamic nested sheet rerenders', () => {
  const scale = block(app, 'function applyVisibleTextScale', 'function setTextZoom');
  assert.match(scale, /setProperty\('font-size',[\s\S]*'important'\)/);
  assert.match(scale, /subtree: true/);
  const preserve = block(app, 'function rerenderSheetPreserveUiState', 'function syncBannerDraftFromDom');
  assert.match(preserve, /applyVisibleTextScale\(nextRoot\)/);
});

test('VIDEO-7 local Marketing form changes preserve sheet scroll/focus and personal discount usage uses it', () => {
  const preserve = block(app, 'function rerenderSheetPreserveUiState', 'function syncBannerDraftFromDom');
  assert.match(preserve, /scrollTop/);
  assert.match(preserve, /focus\(\{ preventScroll: true \}\)/);
  assert.match(preserve, /setSelectionRange/);
  const personal = block(app, 'function setPersonalDiscountDraftUsageMode', 'function setPersonalDiscountDraftType');
  assert.match(personal, /rerenderSheetPreserveUiState\('fc-personal-discount-form-root'/);
  const picker = block(app, 'function togglePersonalDiscountPickerItem', '// Joriy sahifada');
  assert.match(picker, /rerenderSheetPreserveUiState\('fc-personal-discount-picker-root'/);
  const bundle = block(app, 'function toggleBundleDraftProduct', 'function setBundleDraftProductQty');
  assert.match(bundle, /rerenderSheetPreserveUiState\('fc-bundle-form-root'/);
  const pickerLoad = block(app, 'async function loadPersonalDiscountPickerResults', 'function togglePersonalDiscountPickerItem');
  assert.match(pickerLoad, /rerenderSheetPreserveUiState\('fc-personal-discount-picker-root'/);
});

test('VIDEO-8 banner PRODUCT target is null-safe, preserves draft and opens product picker', () => {
  assert.match(app, /function productName\(p\)[\s\S]{0,160}if \(!p\) return ''/);
  const target = block(app, 'function setBannerDraftTarget', 'function renderBannerFormSheet');
  assert.match(target, /syncBannerDraftFromDom\(\)/);
  assert.match(target, /rerenderSheetPreserveUiState/);
  const form = block(app, 'function renderBannerFormSheet', 'async function saveBannerForm');
  assert.match(form, /openMarketingCatalogPicker\('BANNER_PRODUCT'\)/);
  const picker = block(app, 'function openMarketingCatalogPicker', 'function closeMarketingCatalogPicker');
  assert.match(picker, /context\.startsWith\('BANNER_'\)/);
  assert.match(picker, /syncBannerDraftFromDom\(\)/);
});

test('VIDEO-9 user home no longer mounts Recently viewed but Profile recent-view flow remains', () => {
  const home = block(app, 'function renderHome(container)', 'function handleSearchDebounced');
  assert.doesNotMatch(home, /home-recent-root|renderRecentHomeHtml/);
  assert.match(app, /function renderRecentPage\(container\)/);
  assert.match(app, /get_recent_views/);
});

test('VIDEO-10 missing-image queue is product-only and does not render category breadcrumbs', () => {
  const filter = block(app, 'function getMissingImageQueueItems()', 'function categoryPathForProduct');
  assert.match(filter, /p\.id === null/);
  assert.match(filter, /p\.status === 'DELETED'/);
  assert.match(filter, /!hasProductImage\(p\)/);
  const modalStart = app.indexOf("if (activePopupModal === 'MISSING_IMAGE_QUEUE')");
  assert.notEqual(modalStart, -1);
  const modal = app.slice(modalStart, modalStart + 9000);
  assert.doesNotMatch(modal, /categoryPathForProduct\(/);
  assert.match(modal, /missingImageQueueIndex \+ 1} \/ \$\{queue\.length/);
});

test('VIDEO-11 legal settings switch updates only its own card instead of full-page render', () => {
  const fn = block(app, 'function setLegalDocumentEnabled', 'function setLegalDocumentContent');
  assert.doesNotMatch(fn.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /\brender\(\)/);
  assert.match(fn, /data-legal-doc-type/);
  assert.match(fn, /classList\.toggle\('is-enabled'/);
  assert.match(app, /data-legal-doc-type="\$\{escapeHtml\(doc\.type\)\}"/);
  assert.match(app, /function legalDraftIsDirty\(\)/);
  assert.match(app, /id="legal-dirty-actions"[\s\S]{0,500}cancelLegalDraftChanges\(\)/);
});

test('VIDEO release cache versions include this fix batch', () => {
  assert.match(html, /ustore\.css\?v=323/);
  assert.match(html, /ustore-shop-app\.js\?v=322/);
});

