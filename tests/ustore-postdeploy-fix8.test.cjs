const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const shopApi = fs.readFileSync(path.join(root, 'supabase/functions/shop-api/index.ts'), 'utf8');

function fnBlock(name, next = '\n    function ') {
  const start = app.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} not found`);
  const end = app.indexOf(next, start + 12);
  return app.slice(start, end > start ? end : start + 8000);
}

test('FIX8-1 dashboard auto-opens at most once per Tashkent day and user↔admin switching does not reset that daily guard', () => {
  assert.match(app, /timeZone:'Asia\/Tashkent'/);
  assert.match(app, /admin-command-center-auto-day-v1/);
  assert.match(app, /function adminCommandCenterWasAutoShownToday\(\)/);
  assert.match(app, /if \(auto && adminCommandCenterWasAutoShownToday\(\)\) return;/);
  assert.match(app, /if \(auto\) markAdminCommandCenterAutoShownToday\(\);/);
  const toggle = fnBlock('toggleAdminRole');
  assert.doesNotMatch(toggle, /adminCommandCenterAutoShown\s*=\s*false/);
  assert.match(toggle, /openAdminCommandCenter\(true\)/);
});

test('FIX8-1 command center has explicit Admin/User exits and a real tappable backdrop escape area', () => {
  assert.match(app, /function adminCommandCenterOpenAdminPanel\(\) \{ closeAdminCommandCenter\(\); \}/);
  assert.match(app, /function adminCommandCenterOpenStorefront\(\) \{ closeAdminCommandCenter\(\); if \(isAdminMode\) toggleAdminRole\(\); \}/);
  assert.match(app, /Admin sifatida/);
  assert.match(app, /User sifatida/);
  assert.match(css, /\.fc-command-backdrop\{padding:44px 8px 8px!important\}/);
});

test('FIX8-2 pause-order note lives on a dedicated settings page with compact textarea + icon-only save on one row', () => {
  assert.match(app, /case 'ORDER_PAUSE_SETTINGS': renderOrderPauseSettingsPage\(container\); break;/);
  const block = fnBlock('orderPauseDetailCardHtml');
  assert.match(block, /fc-pause-note-row/);
  assert.match(block, /fc-action-icon-btn is-save/);
  assert.match(block, /data-lucide="check"/);
  assert.doesNotMatch(block, />\s*Izohni saqlash\s*</);
  assert.match(fnBlock('renderOrderPauseSettingsPage'), /orderPauseDetailCardHtml\(\)/);
  assert.match(css, /\.fc-pause-note-row\{[^}]*grid-template-columns:minmax\(0,1fr\) 48px/s);
  assert.match(css, /\.fc-pause-note-row textarea\{[^}]*font-size:14px/s);
});

test('FIX8-3/4 shared admin action system uses soft green save, neutral cancel and soft red danger with modern icons', () => {
  assert.match(css, /\.fc-action-icon-btn\.is-save\{background:rgba\(236,253,243,.92\);border-color:#c6f1d5;color:#16803c\}/);
  assert.match(css, /\.fc-action-icon-btn\.is-cancel\{background:rgba\(248,250,252,.96\);border-color:#e4e7ec;color:#667085\}/);
  assert.match(css, /\.fc-action-icon-btn\.is-danger\{background:#fff1ee;border-color:#ffd5cc;color:#c4320a\}/);
  assert.match(app, /fc-legal-savebar fc-icon-action-bar/);
  assert.match(app, /fulfillmentDraftActionHtml\('fc-settings-sticky-actions'\)/);
  assert.match(app, /fulfillmentDraftActionHtml\('fc-delivery-footer'\)/);
  assert.match(app, /fc-design-footer-v2 fc-icon-action-bar/);
});

test('FIX8-3 action toasts strip legacy status emoji because toast state itself owns the modern status treatment', () => {
  const block = fnBlock('showActionToast');
  assert.match(block, /cleanText/);
  assert.match(block, /replace\(\/\^\(\?:✅\|❌\|⚠️\?\|⏳\|✓\|✕\|☁️\)/);
  assert.match(block, /escapeHtml\(cleanText\)/);
});

test('FIX8-4 Click/Payme credential forms use one spaced integration form system instead of touching inputs', () => {
  assert.match(css, /\.fc-integration-form\{display:flex;flex-direction:column;gap:12px\}/);
  assert.match(css, /\.fc-integration-input\{[^}]*height:46px[^}]*border-radius:12px/s);
  assert.match(app, /class="fc-integration-form"/);
  assert.match(app, /class="fc-integration-input(?:\s[^"]*)?"/);
  assert.match(app, /fc-integration-primary-action/);
});

test('FIX8-5 delivery root is a payment-style nested menu and each of four delivery methods opens its own detail view', () => {
  assert.match(app, /const DELIVERY_PAGE_META = \{/);
  for (const kind of ['FREE','FIXED','TAXI','POST']) assert.match(app, new RegExp(`${kind}: \\{`));
  assert.match(app, /function renderDeliverySettingsMenuHtml\(\)/);
  assert.match(app, /onclick="setDeliveryPageView\('\$\{kind\}'\)"/);
  const block = fnBlock('renderDeliverySettingsPage');
  assert.match(block, /if \(view === 'MENU'\)/);
  assert.match(block, /renderDeliverySettingsMenuHtml\(\)/);
  assert.match(block, /renderFulfillmentDeliveryBody\(\)/);
  assert.match(block, /closeDeliveryMethodDetail\(\)/);
  assert.match(app, /function cancelFulfillmentDraftChanges\(\)/);
  assert.match(app, /onclick="cancelFulfillmentDraftChanges\(\)"/);
});

test('FIX8-5 delivery UI refactor preserves the existing fulfillment draft/config save path instead of introducing a parallel backend model', () => {
  const block = fnBlock('renderDeliverySettingsPage');
  assert.match(block, /fulfillmentDraftActionHtml\('fc-delivery-footer'\)/);
  assert.match(fnBlock('fulfillmentDraftActionHtml'), /saveFulfillmentSettings\(\)/);
  assert.match(app, /fulfillmentDraft = commerce\.normalizeConfig\(cloneData\(fulfillmentConfig\), TOP_LEVEL_REGION_IDS\)/);
  assert.doesNotMatch(block, /callApi\(['"]set_delivery_/);
});

test('FIX8-6 admin selected chips/toggles stay soft, premium primary controls remain deep blue, and semantic saves remain green', () => {
  assert.match(css, /body\.fc-admin-mode \.fc-toggle input:checked \+ \.fc-toggle-track\{background:#72aef7!important/);
  assert.match(css, /fc-policy-segments button\.is-active[\s\S]*background:#eaf3ff!important[\s\S]*border-color:#bfd7ff!important[\s\S]*color:#175cd3!important/);
  assert.match(css, /body\.fc-admin-mode button\.bg-blue-600:not\(\.fc-action-icon-btn\)[\s\S]*background:linear-gradient\(180deg, #3b82f6 0%, #2563eb 100%\)!important/);
  assert.match(css, /body\.fc-admin-mode \.fc-btn-success\{background:#ecfdf3!important/);
});

test('FIX8-7 Design main page contains only presets + custom entry; manual color controls live in a dedicated DESIGN_CUSTOM route', () => {
  assert.match(app, /case 'DESIGN_CUSTOM': renderDesignCustomEditorPage\(container\); break;/);
  const mainStart = app.indexOf('function renderDesignSettingsPage');
  const customStart = app.indexOf('function renderDesignCustomEditorPage', mainStart);
  const main = app.slice(mainStart, customStart);
  assert.match(main, /presetOrder = \['minimal','bright','sport','elegant','dark'\]/);
  assert.match(main, /startCustomDesign\(\)/);
  assert.doesNotMatch(main, /renderDesignColorRows\(/);
  const custom = fnBlock('renderDesignCustomEditorPage');
  assert.match(custom, /renderDesignPreviewHtml\(activeColors, true\)/);
  assert.match(custom, /renderDesignColorRows\(/);
  assert.match(css, /\.fc-design-custom-preview-sticky\{position:sticky/);
});

test('FIX8-7 saving a theme persists through set_design_settings, normalizes returned data and reapplies it; backend upserts shop-owned design_settings', () => {
  const block = fnBlock('saveDesignSettings');
  assert.match(block, /callApi\('set_design_settings'/);
  assert.match(block, /designSettings = \{ themeId:/);
  assert.match(block, /applyDesignColors\(designSettings\.colors, designSettings\.themeId\)/);
  assert.match(shopApi, /case "set_design_settings"[\s\S]{0,900}db\.from\("design_settings"\)\.upsert/);
  assert.match(shopApi, /onConflict: "shop_id"/);
});

test('FIX8-7 saved storefront theme now applies consistently in admin mode too', () => {
  const block = fnBlock('applyDesignColors');
  assert.match(block, /writeDesignColorsToRoot\(storefront\)/);
  assert.doesNotMatch(block, /ADMIN_THEME_COLORS/);
  const toggle = fnBlock('toggleAdminRole');
  assert.match(toggle, /applyDesignColors\(designSettings\.colors, designSettings\.themeId\)/);
});

test('FIX8-8 Store Settings root is a compact premium menu hierarchy; pause textarea is not embedded on the root', () => {
  const start = app.indexOf('function renderSettingsPage');
  const end = app.indexOf('async function saveOrderPolicies', start);
  const block = app.slice(start, end);
  assert.match(block, /fc-settings-root/);
  for (const label of ['Yetkazib berish parametrlari', "To'lov parametrlari", 'Qaytarish va bekor qilish', 'Huquqiy hujjatlar', 'Dizayn']) assert.ok(block.includes(label), `missing settings row: ${label}`);
  assert.match(block, /openOrderPauseSettingsPage\(\)/);
  assert.doesNotMatch(block, /<textarea/);
  assert.match(css, /\.fc-settings-menu-row\{[^}]*min-height:72px[^}]*border-radius:14px/s);
});

test('FIX8 cache versions are bumped for the modified Shop App assets', () => {
  assert.match(html, /ustore\.css\?v=332/);
  assert.match(html, /ustore-shop-app\.js\?v=335/);
});

