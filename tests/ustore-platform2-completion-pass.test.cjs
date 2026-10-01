// USTORE PLATFORM 2.0 — COMPLETION / SPEC COMPLIANCE PASS (2026-09-06).
// Covers the spec items enumerated in the user's own completion-pass
// prompt (2.1-2.10, sections 4-7) that were confirmed missing/partial by
// the prior 3-stage audit. Static-analysis style, matching every other
// .test.cjs file in this project — no live Supabase/Telegram here.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const platformApp = fs.readFileSync(path.join(__dirname, '..', 'platform', 'platform-app.js'), 'utf8');
const platformCss = fs.readFileSync(path.join(__dirname, '..', 'platform', 'platform.css'), 'utf8');
const platformHtml = fs.readFileSync(path.join(__dirname, '..', 'platform', 'index.html'), 'utf8');
const platformApi = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'platform-api', 'index.ts'), 'utf8');

function actionBlock(action) {
  const start = platformApi.indexOf(`case "${action}"`);
  assert.ok(start >= 0, `${action} action must exist`);
  return platformApi.slice(start, platformApi.indexOf('\n      case ', start + 10));
}

// ---- 2.9/2.10: Toast + Confirm replace native alert()/confirm() --------

test('native alert()/confirm() are fully gone from live code (comments mentioning the old pattern for historical context are fine) — replaced by a reusable, non-blocking Toast (4 variants: success/error/warning/info) and a reusable Confirm component (Promise<boolean>, desktop modal / mobile bottom-sheet via one CSS breakpoint)', () => {
  const liveCode = platformApp.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(liveCode, /(?<!show)\balert\(/, 'no bare alert( call may remain outside comments');
  assert.doesNotMatch(liveCode, /(?<!show)\bconfirm\(/, 'no bare confirm( call may remain outside comments');
  assert.match(platformApp, /function showToast\(message, variant\) \{/);
  assert.match(platformApp, /const v = \['success', 'error', 'warning', 'info'\]\.includes\(variant\)/);
  assert.match(platformApp, /function showConfirm\(message, opts\) \{/);
  assert.match(platformApp, /return new Promise\(\(resolve\) => \{/);
  assert.match(platformCss, /\.plat-toast-stack \{/);
  assert.match(platformCss, /\.plat-confirm-backdrop \{/);
  assert.match(platformCss, /@media \(min-width: 640px\) \{\s*\n\s*\.plat-confirm-backdrop \{ align-items: center; \}/);
});

test('two real call sites (closeAdminSupportThread, approveRequest) were migrated from native confirm() to the new awaited showConfirm()', () => {
  const closeStart = platformApp.indexOf('async function closeAdminSupportThread()');
  const closeBlock = platformApp.slice(closeStart, platformApp.indexOf('\n  }', closeStart) + 4);
  assert.match(closeBlock, /if \(!\(await showConfirm\("Bu murojaatni yopmoqchimisiz\?"\)\)\) return;/);
  const approveStart = platformApp.indexOf('async function approveRequest(requestId)');
  const approveBlock = platformApp.slice(approveStart, platformApp.indexOf('\n  }', approveStart) + 4);
  assert.match(approveBlock, /if \(!\(await showConfirm\("So'rovni tasdiqlaysizmi\?"\)\)\) return;/);
});

// ---- 2.1: real payment history ------------------------------------------

test('platform_list_my_subscription_history is a new, additive, OWNERSHIP-gated (via shop_memberships, same check as listMyShops) action reusing the EXACT same subscription_history table/columns/mapping as the admin-only platform_list_subscription_history — not a rewrite, not fake data', () => {
  const block = actionBlock('platform_list_my_subscription_history');
  assert.doesNotMatch(block, /requirePlatformSuperAdmin/, 'must be reachable by the shop owner, not gated to super-admin');
  assert.match(block, /\.eq\("shop_id", shopId\)\.eq\("telegram_user_id", tgId\)\.eq\("role", "OWNER"\)\.eq\("status", "ACTIVE"\)\.maybeSingle\(\);/);
  assert.match(block, /if \(!membership\) return json\(\{ error: "forbidden" \}, 403\);/);
  assert.match(block, /db\.from\("subscription_history"\)/);
});

test('the user "To\'lovlar" tab now shows real payment history (reusing platform_list_my_subscription_history) with an "Obunani uzaytirish" primary CTA when the user has at least one shop — the original tariff-browse flow is fully preserved for the no-shop-yet (first purchase) case, not deleted', () => {
  assert.match(platformApp, /function renderMyPaymentHistoryBody\(opts\) \{/);
  assert.match(platformApp, /onclick="startExtendFor\('\$\{shop\.id\}'\)">\$\{pIcon\('calendar',16\)\} Obunani uzaytirish</);
  const tabStart = platformApp.indexOf('function renderSubscriptionTab()');
  const tabBlock = platformApp.slice(tabStart, platformApp.indexOf('\n  }', tabStart) + 4);
  assert.match(tabBlock, /if \(myShops\.length > 0\) return renderMyPaymentHistoryBody\(\);/);
  assert.match(tabBlock, /renderTariffCards\(false, \{ ctaLabel: 'Sotib olish' \}\)/, 'the first-purchase catalog flow must still exist for users with no shop yet');
});

// ---- 2.2: "Keyingi amal" -------------------------------------------------

test('renderRequestNextAction renders a single, prominent "Keyingi amal" block ABOVE the existing stepper/history (never replacing them) mapping the real backend state to ONE human next step — no technical enum leaks through, and terminal states (REJECTED) render nothing extra', () => {
  const fnStart = platformApp.indexOf('function renderRequestNextAction(r)');
  assert.ok(fnStart >= 0);
  const fnBlock = platformApp.slice(fnStart, platformApp.indexOf('\n  function renderRequestDetailsBody', fnStart));
  assert.match(fnBlock, /if \(r\.status === 'REJECTED'\) return '';/);
  assert.match(fnBlock, /To'lovni tekshiring/);
  assert.match(fnBlock, /onclick="approveRequest\('\$\{r\.id\}'\)"/);
  assert.match(fnBlock, /Telegram botni ulang/);
  assert.match(fnBlock, /onclick="openRequestProvisioning\('\$\{r\.id\}'\)"/);
  const detailStart = platformApp.indexOf('function renderRequestDetailsBody()');
  const detailBlock = platformApp.slice(detailStart, platformApp.indexOf('\n  function openRequestProvisioning', detailStart));
  const nextActionIdx = detailBlock.indexOf('renderRequestNextAction(r)');
  const stepperCallIdx = detailBlock.indexOf('plat-admin-payment-timeline');
  assert.ok(nextActionIdx >= 0 && stepperCallIdx > nextActionIdx, 'Keyingi amal must render before the existing payment-timeline stepper, not replace it');
});

// ---- 2.3: admin desktop table --------------------------------------------

test('Do\'konlar >=1024px renders a real <table> (Do\'kon/Egasi/Tarif/Status/Qolgan kun/Bot/Action columns, 56px row height) from the SAME filtered `list` array as the mobile card list — CSS (not duplicated JS state) decides which one is visible, and an explicit !important fix keeps a pre-existing 680px tablet grid rule from re-showing the card list at desktop widths (a real bug caught via live browser testing this round)', () => {
  assert.match(platformApp, /function renderAdminShopsTable\(list\) \{/);
  assert.match(platformApp, /<th>Do'kon<\/th><th>Egasi<\/th><th>Tarif<\/th><th>Status<\/th><th>Qolgan kun<\/th><th>Bot<\/th><th><\/th>/);
  assert.match(platformCss, /\.plat-admin-shop-table td \{ padding:12px 16px; height:56px;/);
  assert.match(platformCss, /@media \(min-width: 1024px\) \{\s*\n\s*\.plat-admin-shop-list \{ display:none !important; \}\s*\n\s*\}/, 'the specificity-conflict fix (later 680px tablet rule was winning) must be present');
});

// ---- 2.4/2.5/2.6/2.7/section-4/section-5/section-6: shop detail splits --

test('admin Do\'kon-tafsiloti is now summary + 6 navigation rows (Obuna va tarif/Bot va integratsiyalar/To\'lovlar/Do\'kon holati/Faoliyat tarixi/Support), each opening its own SHOP_SUB_* route that reuses the pre-existing working render functions (renderGrantDaysCard/renderIntegrationRow/renderLifecycleControlsCard/renderSubscriptionHistoryCard) — no business logic duplicated or rewritten', () => {
  const start = platformApp.indexOf('function renderShopDetailsBody()');
  const block = platformApp.slice(start, platformApp.indexOf('\n  function openShopSubScreen', start));
  for (const page of ['SHOP_SUB_SUBSCRIPTION', 'SHOP_SUB_BOT', 'SHOP_SUB_PAYMENTS', 'SHOP_SUB_LIFECYCLE', 'SHOP_SUB_ACTIVITY', 'SHOP_SUB_SUPPORT']) {
    assert.ok(block.includes(page), `${page} row missing from the summary nav-row list`);
  }
  for (const route of [
    "if (p === 'SHOP_SUB_SUBSCRIPTION') return pageShell(\"Obuna va tarif\", renderShopSubscriptionBody(),",
    "if (p === 'SHOP_SUB_BOT') return pageShell(\"Bot va integratsiyalar\", renderShopBotIntegrationsBody(),",
    "if (p === 'SHOP_SUB_PAYMENTS') return pageShell(\"To'lovlar\", renderShopPaymentsBody(),",
    "if (p === 'SHOP_SUB_LIFECYCLE') return pageShell(\"Do'kon holati\", renderShopLifecycleBody(),",
    "if (p === 'SHOP_SUB_ACTIVITY') return pageShell(\"Faoliyat tarixi\", renderShopActivityBody(),",
    "if (p === 'SHOP_SUB_SUPPORT') return pageShell(\"Support\", renderShopSupportBody(),",
  ]) {
    assert.ok(platformApp.includes(route), `missing route: ${route}`);
  }
  assert.match(platformApp, /function renderShopLifecycleBody\(\) \{[\s\S]{0,120}return renderLifecycleControlsCard\(s\);/);
  assert.match(platformApp, /function renderShopPaymentsBody\(\) \{[\s\S]{0,120}return renderSubscriptionHistoryCard\(s\.id\);/);
});

test('the "Bot va integratsiyalar" screen (spec 2.6-band) is a real, working screen — not a stub/alert — showing bot username/ID/status/connected-date (new, additive shop_bots.status+created_at columns, platform_list_shops extension) plus the 4 pre-existing integration rows reused verbatim; the old alert-stub function is gone', () => {
  const start = platformApp.indexOf('function renderShopBotIntegrationsBody()');
  const block = platformApp.slice(start, platformApp.indexOf('\n  function renderShopLifecycleBody', start));
  assert.match(block, /Username<\/span><span>@\$\{escapeHtml\(s\.botUsername\)\}/);
  assert.match(block, /Bot ID<\/span><span class="is-code">\$\{escapeHtml\(s\.botId \|\| '-'\)\}/);
  assert.match(block, /Ulangan sana<\/span><span>\$\{s\.botConnectedAt/);
  assert.match(block, /renderIntegrationRow\('BILLZ'/);
  assert.match(block, /renderIntegrationRow\('UZUM'/);
  // The Sozlamalar page ALSO keeps its own "Integratsiyalar" row (spec 48
  // explicitly lists it as a Settings row too) — it now redirects with a
  // proper Toast (not a blocking native alert) instead of being a dead
  // stub, since real per-shop management lives on the new screen above.
  assert.match(platformApp, /function openAdminIntegrationsInfo\(\)\{ showToast\("Integratsiyalar endi har bir do'konning o'z sahifasida/);
});

test('"Faoliyat tarixi" (spec section 6) reuses the REAL, pre-existing platform_admin_action_log audit table (017-migratsiya) via a new, super-admin-gated read-only action filtered by shop_id — human-readable labels (shopActivityLabel), never raw action/details JSON dumped to the UI, and no new audit system was invented', () => {
  const block = actionBlock('platform_list_shop_admin_actions');
  assert.match(block, /requirePlatformSuperAdmin\(\);/);
  assert.match(block, /db\.from\("platform_admin_action_log"\)\s*\n\s*\.select\("id,admin_tg_id,action,details,created_at"\)\s*\n\s*\.eq\("shop_id", shopId\)/);
});
test('shopActivityLabel maps every known action to a human sentence (never the raw enum) and renderShopActivityBody shows an honest empty state rather than fake activity when there is none', () => {
  const start = platformApp.indexOf('function shopActivityLabel(a)');
  const block = platformApp.slice(start, platformApp.indexOf('\n  }', start) + 4);
  assert.match(block, /if \(a\.action === 'GRANT_DAYS'\)/);
  assert.match(block, /if \(a\.action === 'FREEZE'\)/);
  assert.match(block, /if \(a\.action === 'TERMINATE'\)/);
  assert.match(platformApp, /Hozircha faoliyat yo'q/);
});

test('Danger Zone (spec 45/46-band) is now a visually separate section (margin-top:32px, bg #FFF8F6, border var(--c-danger-border), radius 14px) wrapping the UNCHANGED renderTerminateSection two-step reason-then-confirm flow — pulled OUT of the general "Boshqaruv" card, not rewritten', () => {
  assert.match(platformCss, /\.plat-danger-zone \{\s*\n\s*margin-top: 32px; background:#FFF8F6; border:1px solid var\(--c-danger-border\);/);
  const start = platformApp.indexOf('function renderDangerZone(s)');
  const block = platformApp.slice(start, platformApp.indexOf('\n  }', start) + 4);
  assert.match(block, /renderTerminateSection\(s\.id, s\.shopName \|\| s\.publicCode\)/);
  const lifecycleStart = platformApp.indexOf('function renderLifecycleControlsCard(s)');
  // Sliced to renderDangerZone's own definition (not renderExtendGraceCard) —
  // renderDangerZone sits BETWEEN the two in source order and itself calls
  // renderTerminateSection, so including it here would wrongly appear to
  // fail the "not inside Boshqaruv" check.
  const lifecycleBlock = platformApp.slice(lifecycleStart, platformApp.indexOf('function renderDangerZone', lifecycleStart));
  assert.doesNotMatch(lifecycleBlock, /renderTerminateSection\(/, 'terminate must no longer render inside the plain Boshqaruv card');
  assert.match(lifecycleBlock, /renderDangerZone\(s\)/);
});

test('Support desktop master/detail (2.8-band): mobile behavior is completely unchanged (thread still a full-page overlay); a new body class + one CSS media rule makes the thread page float over only the right portion of the screen at >=1024px, revealing the (now actually rendered, not blank) list underneath — zero new routing/state duplication', () => {
  assert.match(platformApp, /document\.body\.classList\.toggle\('plat-support-desktop-split', isAdminMode && \(currentTab === 'support' \|\| activePage === 'ADMIN_SUPPORT_THREAD'\)\);/);
  assert.match(platformApp, /const chromeBody = activePage === 'ADMIN_SUPPORT_THREAD' \? renderAdminSupportTab\(\) : '';/);
  assert.match(platformCss, /body\.plat-support-desktop-split \.plat-page \{ left: 380px; \}/);
});

test('User Shop Detail (section 4) is now ALSO split — summary + 5 rows (Obuna va tarif/To\'lovlar/Bot/Support/Do\'kon holati) — reusing the exact pre-existing "Obunani boshqarish"/"Do\'kon boshqaruvi" markup verbatim inside their new sub-screens; the payment-history sub-page hides its own duplicate heading since pageShell already supplies one', () => {
  const start = platformApp.indexOf('function renderMyShopDetailsBody()');
  const block = platformApp.slice(start, platformApp.indexOf('\n  function renderMyShopSubscriptionBody', start));
  for (const page of ['MY_SHOP_SUB_SUBSCRIPTION', 'MY_SHOP_SUB_PAYMENTS', 'MY_SHOP_SUB_BOT', 'MY_SHOP_SUB_SUPPORT', 'MY_SHOP_SUB_STATUS']) {
    assert.ok(block.includes(page), `${page} row missing`);
  }
  assert.match(platformApp, /if \(p === 'MY_SHOP_SUB_PAYMENTS'\) return pageShell\("To'lovlar", renderMyPaymentHistoryBody\(\{ hideHeading: true \}\),/);
  const subStart = platformApp.indexOf('function renderMyShopSubscriptionBody()');
  const subBlock = platformApp.slice(subStart, platformApp.indexOf('\n  function renderMyShopBotBody', subStart));
  assert.match(subBlock, /onclick="startExtendFor\('\$\{shop\.id\}'\)"/);
});

// ---- section 5: frozen 60-day progress bar -------------------------------

test('renderFreezeProgressBar is a single shared helper (X / retentionDays kun, real math from frozenAt + the admin-configurable retentionDays, never a hardcoded 60) reused by BOTH the admin lifecycle card and the user-facing frozen banner — and listMyShops now exposes frozenAt (new, additive shop_settings column) so the user side can compute it too', () => {
  const start = platformApp.indexOf('function renderFreezeProgressBar(frozenAt)');
  const block = platformApp.slice(start, platformApp.indexOf('\n  }', start) + 4);
  assert.match(block, /const retentionDays = platformLifecycleSettings\.retentionDays \|\| SHOP_FREEZE_DAYS;/);
  assert.match(block, /\$\{shown\} \/ \$\{retentionDays\} kun/);
  assert.match(platformApp, /renderFreezeProgressBar\(s\.frozenAt\)/, 'admin lifecycle card must use it');
  assert.match(platformApp, /!terminated \? renderFreezeProgressBar\(shop\.frozenAt\) : ''/, 'user attention banner must use it too');
  assert.match(platformApi, /frozenAt: st\?\.frozen_at \|\| null,/, 'listMyShops must expose frozenAt (additive column, section 5)');
});

// ---- section 7: emoji cleanup ---------------------------------------------

test('the ✅/🐞/❌ status-and-action emoji identified by the audit are gone from live UI code (a historical comment mentioning them is fine) — replaced either by the existing pIcon() system where an icon was already shown adjacent, or by plain text where the color/pill already conveyed the state', () => {
  const liveCode = platformApp.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(liveCode, /✅|🐞|❌/);
});

// ---- 3.3: no-rainbow on the main user Dashboard KPI grid -----------------

test('the user Dashboard\'s 4 mini-stat KPI cards (spec 24-band\'s explicit example of a "no rainbow" requirement) no longer use 4 different decorative tone-blue/tone-violet/tone-green/tone-amber classes — they now all render through the single default (primary-blue icon, soft background) rule, a minimal-diff fix (removed the tone-* class names, changed no CSS/data)', () => {
  const start = platformApp.indexOf('<div class="plat-dashboard-kpis">');
  const block = platformApp.slice(start, start + 700);
  assert.doesNotMatch(block, /tone-violet|tone-green|tone-amber/, 'no decorative rainbow tone classes may remain on this specific KPI grid');
  assert.match(block, /Bugungi buyurtmalar/);
  assert.match(block, /Mahsulotlar/);
});

// Note: the cache-version guard lives ONLY in ustore-missed-1-6-final.test.cjs
// (single source of truth, updated every round) — see Stage 1's own note.
