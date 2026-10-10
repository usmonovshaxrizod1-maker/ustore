const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
const platformApp = fs.readFileSync(path.join(root, 'platform', 'platform-app.js'), 'utf8');
const platformCss = fs.readFileSync(path.join(root, 'platform', 'platform.css'), 'utf8');
const api = fs.readFileSync(path.join(root, 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const platformHtml = fs.readFileSync(path.join(root, 'platform', 'index.html'), 'utf8');

function actionBlock(action) {
  const start = api.indexOf(`case "${action}"`);
  assert.ok(start >= 0, `${action} action missing`);
  const end = api.indexOf('\n      case ', start + 10);
  return api.slice(start, end > start ? end : start + 8000);
}

test('1 — shop logo has one active source and no switch-back/URL flow; two compact actions stay in one row', () => {
  assert.doesNotMatch(app, /switchLogoBackToImage|Yuklangan rasmga qaytish|SHOP_LOGO_URL|saveShopLogoFromUrl|shop-logo-url-input/);
  assert.match(app, /class="fc-shop-logo-actions"[\s\S]*Rasm qo‘shish[\s\S]*Nomdan logo yaratish/);
  assert.match(css, /\.fc-shop-logo-actions\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)!important/s);
  const block = actionBlock('set_shop_logo');
  assert.match(block, /const newLogoUrl = logoType === "IMAGE" \? \(payload\.logoUrl \|\| null\) : null;/);
  assert.match(block, /logo_wordmark: logoType === "WORDMARK" \? wordmark : null/);
  assert.match(block, /if \(newLogoUrl && !productStoragePathFromUrl\(newLogoUrl, SUPABASE_URL, shopId, "images"\)\)/, 'logo IMAGE source must be managed upload only, never arbitrary URL');
  assert.match(block, /if \(oldLogoUrl && oldLogoUrl !== newLogoUrl\)/);
});

test('2 — wordmark style chooser is Word-like, scrollable, and offers many deliberately different visual directions', () => {
  const presetStart = app.indexOf('const WORDMARK_PRESETS = [');
  const presetEnd = app.indexOf('];', presetStart);
  const presets = app.slice(presetStart, presetEnd);
  assert.equal((presets.match(/\{ id:/g) || []).length, 50, 'exactly 50 real font choices required');
  assert.equal(new Set([...presets.matchAll(/font: '([^']+)'/g)].map(x=>x[1])).size,50,'each preset uses a unique genuine family');
  assert.match(app, /fc-wordmark-style-select/);
  assert.match(app, /fc-wordmark-style-menu/);
  assert.match(app, /fc-wordmark-style-option-preview/);
  assert.match(app, /function toggleWordmarkStyleMenu\(\)/);
  assert.match(app, /wordmarkStyleMenuOpen = false;[\s\S]{0,160}renderModalContainer\(\);/);
  assert.match(css, /\.fc-wordmark-style-menu\{[^}]*max-height:min\(15rem,42dvh\);[^}]*overflow-y:auto/s);
});

test('3 — product badge sits on the right and avoids user heart/admin controls', () => {
  assert.match(css, /\.fc-product-badge-chip\{[^}]*right:\.48rem;left:auto;[^}]*border-radius:9999px/s);
  assert.match(app, /const adminClass = \(isAdminMode && isUserAnAdmin\) \? ' is-admin' : '';/);
  assert.match(css, /\.fc-product-badge-chip\.is-admin\{top:2\.75rem;right:\.48rem/);
  assert.match(app, /absolute top-1 left-1[^\n]*favoriteHeartHtml/, 'customer favorite heart remains on the opposite side');
});

test('4 — orders calendar uses an internal scroll area and sticky visible cancel/confirm footer inside viewport-sized popover', () => {
  assert.match(app, /class="fc-orders-calendar-scroll"/);
  assert.match(app, /class="fc-orders-calendar-actions"[\s\S]*cancelOrdersCalendarSelection\(\)[\s\S]*applyOrdersCalendarSelection\(\)/);
  assert.match(css, /\.fc-orders-calendar-scroll\{[^}]*overflow-y:auto/s);
  assert.match(css, /\.fc-orders-popover \.fc-orders-calendar-actions\{[^}]*position:sticky;bottom:0/s);
  assert.match(app, /const below = Math\.max\(0, vh - a\.bottom - 12\);/);
  assert.match(app, /const above = Math\.max\(0, a\.top - 12\);/);
});

test('5 — products with color variants do not show general image edit; each color owns its one image and sizes have no image UI', () => {
  assert.match(app, /field === 'img' && !productVariants\(p\)\.some\(v => !!v\.color\)/);
  assert.match(app, /field === 'img' && productVariants\(p\)\.some\(v => !!v\.color\)/);
  assert.match(app, /onclick="pickColorImage\(\$\{ci\}\)"/);
  assert.match(app, /id="vc-\$\{ci\}-image-input"/);
  assert.match(app, /colorImg: color\?\.img \|\| null/);
  const activeColorEditorStart = app.indexOf('function renderActiveColorEditorHtml()');
  const activeColorEditorEnd = app.indexOf('function renderVariantBuilderHtml()', activeColorEditorStart);
  const editor = app.slice(activeColorEditorStart, activeColorEditorEnd);
  assert.doesNotMatch(editor, /vr-\$\{row\.idx\}-image-input|pickSizeRowImage\(/, 'no per-size image editor may render');
});

test('6 — general visual content has file + HTTPS URL; logo, receipts/proofs and QR/payment logos remain file-only', () => {
  for (const id of ['m-prod-image-url', 'miq-image-url', 'ef-image-url', 'banner-image-url', 'bundle-image-url']) {
    assert.match(app, new RegExp(`id="${id}"[^>]*type="url"|type="url"[^>]*id="${id}"`), `${id} should be visible URL input`);
  }
  assert.doesNotMatch(app, /id="(?:m-cat-image-url|ec-image-url)"/);
  assert.match(app, /id="vc-\$\{ci\}-image-url"[^>]*type="url"|type="url"[^>]*id="vc-\$\{ci\}-image-url"/);
  assert.match(app, /function validateExternalImageUrl\(/);
  assert.doesNotMatch(app, /shop-logo-url-input|SHOP_LOGO_URL/);
  assert.doesNotMatch(app.slice(app.indexOf('function renderReceiptPicker'), app.indexOf('function ', app.indexOf('function renderReceiptPicker') + 10)), /type="url"|onImageUrlInput/);
  assert.doesNotMatch(app.match(/id="qr-img-input-[\s\S]{0,900}/)?.[0] || '', /type="url"/);
  assert.match(platformApp, /id="ntd-image"[^>]*type="url"|type="url"[^>]*id="ntd-image"/);
  assert.match(platformApp, /function onNotificationTemplateImageUrlInput\(value\)/);
  assert.match(platformApp, /window\.onNotificationTemplateImageUrlInput = onNotificationTemplateImageUrlInput;/);
  assert.match(platformCss, /\.plat-image-url-field/);
  assert.doesNotMatch(platformApp.match(/id="pmd-logo-file"[\s\S]{0,900}/)?.[0] || '', /type="url"/);
});

test('7–8 + 24h report cleanup from previous fixes are still present', () => {
  assert.match(actionBlock('set_shop_logo'), /cleanupManagedImageIfUnreferenced\(db, shopId, oldLogoUrl, SUPABASE_URL, "old-shop-logo"\)/);
  assert.match(api, /case "upload_report_pdf":/);
  assert.ok(fs.existsSync(path.join(root, 'supabase', 'migrations', '063_report_exports.sql')));
  assert.ok(fs.existsSync(path.join(root, 'supabase', 'migrations', '064_report_exports_cleanup.sql')));
  assert.ok(fs.existsSync(path.join(root, 'supabase', 'functions', 'report-export-cleanup-cron', 'index.ts')));
  assert.ok(fs.existsSync(path.join(root, 'supabase', 'REPORT_EXPORT_CLEANUP_CRON_SETUP.sql')));
});

test('cache versions are bumped for the changed Shop App and Platform assets', () => {
  assert.match(indexHtml, /ustore\.css\?v=332/);
  assert.match(indexHtml, /ustore-shop-app\.js\?v=335/);
  assert.match(platformHtml, /platform\.css\?v=43/);
  assert.match(platformHtml, /platform-app\.js\?v=67/);
});

