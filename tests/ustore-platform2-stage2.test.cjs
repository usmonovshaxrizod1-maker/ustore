// USTORE PLATFORM 2.0 — Bosqich 2 (Platform Admin to'liq qayta dizayni).
// Master-refactor spec (2026-09-06): admin navigatsiyasi/Dashboard/Sozlamalar
// qayta tashkil qilindi, mavjud biznes-logika (lifecycle/subscription/
// payment/bot) 100% saqlanadi. Statik-tahlil testlari, loyihaning boshqa
// .test.cjs fayllari bilan bir xil uslub.

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

test('admin navigation (spec section 2/A-band) is now Dashboard/Arizalar/Do\'konlar/Support/Sozlamalar — Tariflar is no longer a root tab (moved into Sozlamalar) and Profil is renamed Sozlamalar (Support moved OUT of it, into its own root tab)', () => {
  const start = platformApp.indexOf('function renderBottomNav()');
  const block = platformApp.slice(start, platformApp.indexOf('function renderTabBody', start));
  const adminTabsMatch = block.match(/const adminTabs = \[([\s\S]*?)\];/);
  assert.ok(adminTabsMatch);
  assert.match(adminTabsMatch[1], /\['dashboard', 'dashboard', 'Dashboard'\]/);
  assert.match(adminTabsMatch[1], /\['requests', 'inbox', 'Arizalar'\]/);
  assert.match(adminTabsMatch[1], /\['shops', 'shop', "Do'konlar"\]/);
  assert.match(adminTabsMatch[1], /\['support', 'headset', 'Support'\]/);
  assert.match(adminTabsMatch[1], /\['settings', 'gear', 'Sozlamalar'\]/);
  assert.doesNotMatch(adminTabsMatch[1], /'tariffs'|'profile'/, 'tariffs and profile must no longer be admin root tabs');
});

test('renderTabBody() dispatches all 5 admin tabs correctly, including the two new ones (support/settings) reusing existing render functions (renderAdminSupportTab/renderProfileTab) — no dead \'tariffs\' branch left behind', () => {
  const start = platformApp.indexOf('function renderTabBody()');
  const block = platformApp.slice(start, platformApp.indexOf('\n  function renderActivePage', start));
  const adminBranch = block.slice(0, block.indexOf('if (currentTab ===', block.indexOf('return \'\';') ));
  assert.match(block, /if \(currentTab === 'dashboard'\) return renderAdminDashboardTab\(\);/);
  assert.match(block, /if \(currentTab === 'requests'\) return renderAdminRequestsTab\(\);/);
  assert.match(block, /if \(currentTab === 'shops'\) return renderAdminShopsTab\(\);/);
  assert.match(block, /if \(currentTab === 'support'\) return renderAdminSupportTab\(\);/);
  assert.match(block, /if \(currentTab === 'settings'\) return renderProfileTab\(\);/);
  assert.doesNotMatch(block, /currentTab === 'tariffs'/);
});

test('Dashboard\'s new "Action Required" block (spec 34-band) is the FIRST section rendered — before the KPI grid ("Umumiy holat") and before analytics — built from 4 real counts only (newRequestsCount/awaitingBotConnectCount/freezeExpiredCount/supportOpenCount), no fabricated numbers', () => {
  const fnStart = platformApp.indexOf('function renderAdminActionRequiredCards(s)');
  assert.ok(fnStart >= 0);
  const fnBlock = platformApp.slice(fnStart, platformApp.indexOf('\n  }', fnStart) + 4);
  assert.match(fnBlock, /count: s\.newRequestsCount \|\| 0/);
  assert.match(fnBlock, /count: s\.awaitingBotConnectCount \|\| 0/);
  assert.match(fnBlock, /count: s\.freezeExpiredCount \|\| 0/);
  assert.match(fnBlock, /count: s\.supportOpenCount \|\| 0/);

  const dashStart = platformApp.indexOf('function renderAdminDashboardTab()');
  const dashBlock = platformApp.slice(dashStart, platformApp.indexOf('\n  }', dashStart) + 4);
  const actionIdx = dashBlock.indexOf('renderAdminActionRequiredCards(s)');
  const kpiHeadingIdx = dashBlock.indexOf('plat-admin-kpi-heading');
  const analyticsIdx = dashBlock.indexOf('renderAnalyticsSection()');
  assert.ok(actionIdx >= 0 && actionIdx < kpiHeadingIdx && kpiHeadingIdx < analyticsIdx, 'Action Required must render before the KPI heading, which must render before analytics');
});

test('platform_admin_dashboard_summary now additionally computes supportOpenCount (platform_support_tickets where status=OPEN), awaitingBotConnectCount (APPROVED NEW_SHOP requests still missing applied_at — same real signal as awaitingProvisioning), and freezeExpiredCount, plus pushes SUPPORT_WAITING attention items for each open ticket — all purely additive, the 4 pre-existing counters are untouched', () => {
  const block = actionBlock('platform_admin_dashboard_summary');
  assert.match(block, /db\.from\("platform_support_tickets"\)\.select\("id", \{ count: "exact", head: true \}\)\.eq\("status", "OPEN"\)/);
  assert.match(block, /db\.from\("subscription_requests"\)\.select\("id", \{ count: "exact", head: true \}\)\.eq\("kind", "NEW_SHOP"\)\.eq\("status", "APPROVED"\)\.is\("applied_at", null\)/);
  assert.match(block, /type: "SUPPORT_WAITING", ticketId: t\.id,/);
  assert.match(block, /supportOpenCount: supportOpenCount \|\| 0,/);
  assert.match(block, /awaitingBotConnectCount: awaitingBotConnectCount \|\| 0,/);
  assert.match(block, /freezeExpiredCount: \(freezeExpiredTaskRows \|\| \[\]\)\.length,/);
  assert.match(block, /activeShopsCount: activeShopsCount \|\| 0,/, 'the 4 pre-existing counters must be untouched');
});

test('Sozlamalar (ex-Profil admin settings) no longer lists Support as a row (it is a root tab now) but DOES gain a Tariflar row (since Tariflar is no longer a root tab) — every other existing settings row (to\'lov/xabarlar/lifecycle/integratsiya/legal/mode-toggle) is 100% preserved, only re-homed', () => {
  const start = platformApp.indexOf('function renderAdminProfileTab()');
  const block = platformApp.slice(start, platformApp.indexOf('\n  }', start) + 4);
  assert.match(block, /<h1>Sozlamalar<\/h1>/);
  assert.doesNotMatch(block, /Support<\/b><small>Foydalanuvchi murojaatlari/, 'the old Support row must be gone from Sozlamalar');
  // is-violet -> is-blue: Platform 2.0 visual-consistency pass (3.1/3.2/3.4
  // pass, section 19) unified this 5-row settings list off its old
  // violet/blue/violet/amber/green "rainbow" icon coloring onto one
  // consistent accent, matching the same fix already applied to the
  // Dashboard KPI cards.
  assert.match(block, /onclick="openAdminTariffsPage\(\)"><span class="is-blue">.*<b>Tariflar<\/b>/);
  assert.match(block, /onclick="openAdminPaymentSettings\(\)"/, 'payment settings row preserved');
  assert.match(block, /onclick="openAdminNotificationSettings\(\)"/, 'notification settings row preserved');
  assert.match(block, /onclick="openAdminLifecycleSettings\(\)"/, 'lifecycle settings row preserved (F-band: nothing about freeze/terminate config changed)');
  assert.match(block, /onclick="toggleAdminRole\(\)"/, 'the user-mode switch row preserved');
});

test('Support is fully reachable as a self-contained root tab (renderAdminSupportTab wraps the 100%-reused renderAdminSupportBody with its own heading) — the old standalone ADMIN_SUPPORT page route and its opener function are both gone, and both the thread\'s back-navigation and close-then-return both go to the tab (switchTab(\'support\')), not a deleted page route', () => {
  assert.match(platformApp, /function renderAdminSupportTab\(\) \{\s*\n\s*return `<div class="plat-tab-head">.*<h1>Support<\/h1>/);
  assert.doesNotMatch(platformApp, /openAdminSupportPage/, 'the old page-opener function must be fully removed, not left as dead code');
  assert.doesNotMatch(platformApp, /'ADMIN_SUPPORT'\)/, 'no code may still reference the deleted ADMIN_SUPPORT page id');
  assert.match(platformApp, /if \(p === 'ADMIN_SUPPORT_THREAD'\) return pageShell\(supportThreadTitle\(\), renderAdminSupportThreadBody\(\), \{ onBack: "switchTab\('support'\)" \}\);/);
  const closeStart = platformApp.indexOf('async function closeAdminSupportThread()');
  const closeBlock = platformApp.slice(closeStart, platformApp.indexOf('\n  }', closeStart) + 4);
  assert.match(closeBlock, /switchTab\('support'\);/);
});

test('loadAdminSupportTickets/loadAdminTariffs/loadAdminSettings re-render conditions were updated to match the new tab-based routing (currentTab checks instead of the now-gone activePage/\'profile\'/\'tariffs\' checks) — a stale re-render guard here would silently freeze the UI after a filter change', () => {
  const supportStart = platformApp.indexOf('async function loadAdminSupportTickets()');
  const supportBlock = platformApp.slice(supportStart, platformApp.indexOf('\n  }', supportStart) + 4);
  assert.match(supportBlock, /if \(currentTab === 'support' && isAdminMode\) render\(\);/);

  const tariffsStart = platformApp.indexOf('async function loadAdminTariffs()');
  const tariffsBlock = platformApp.slice(tariffsStart, platformApp.indexOf('\n  }', tariffsStart) + 4);
  assert.match(tariffsBlock, /if \(activePage === 'ADMIN_TARIFFS'\) render\(\);/);

  const settingsStart = platformApp.indexOf('async function loadAdminSettings()');
  const settingsBlock = platformApp.slice(settingsStart, platformApp.indexOf('\n  }', settingsStart) + 4);
  assert.match(settingsBlock, /currentTab === 'settings'/);
});

test('ADMIN_TARIFFS is now a page (opened from Sozlamalar via openAdminTariffsPage, wrapped in pageShell with onBack to switchTab(\'settings\')) reusing the exact same renderAdminTariffsTab() content that used to be a root tab — its own duplicate inline heading was removed since pageShell now supplies the title, so it does not show "Tariflar" twice', () => {
  assert.match(platformApp, /if \(p === 'ADMIN_TARIFFS'\) return pageShell\('Tariflar', renderAdminTariffsTab\(\), \{ onBack: "switchTab\('settings'\)" \}\);/);
  assert.match(platformApp, /function openAdminTariffsPage\(\) \{ openPage\('ADMIN_TARIFFS'\); loadAdminTariffs\(\); \}/);
  const start = platformApp.indexOf('function renderAdminTariffsTab()');
  const block = platformApp.slice(start, platformApp.indexOf('\n  }', start) + 4);
  assert.doesNotMatch(block, /<h1>Tariflar<\/h1>/, 'must not duplicate the title pageShell already renders');
});

test('the Arizalar tab\'s own page heading now reads "Arizalar" (not the old "So\'rovlar") — matching its bottom-nav label exactly, avoiding the same nav/title mismatch confusion that Stage 1 already fixed for the user "To\'lovlar" tab', () => {
  const start = platformApp.indexOf('function renderAdminRequestsTab()');
  const block = platformApp.slice(start, platformApp.indexOf('\n  }', start) + 4);
  assert.match(block, /<h1>Arizalar<\/h1>/);
  assert.doesNotMatch(block, /<h1>So'rovlar<\/h1>/);
});

test('the new Action Required card grid has its own CSS (neutral white cards by default per spec 34 — "No rainbow card background" — accent only on the icon badge when count > 0)', () => {
  assert.match(platformCss, /\.plat-admin-action-card \{/);
  assert.match(platformCss, /background: var\(--c-surface\); border: 1px solid var\(--c-border\);/);
  assert.match(platformCss, /\.plat-admin-action-card\.is-info \.plat-admin-action-icon \{ background: var\(--c-info-bg\); color: var\(--c-info-text\); \}/);
});

// Note: the cache-version guard lives ONLY in ustore-missed-1-6-final.test.cjs
// (single source of truth, updated every round) — see Stage 1's own note.
