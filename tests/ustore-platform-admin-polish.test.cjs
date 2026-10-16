const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const platformApp = fs.readFileSync(path.join(__dirname, '..', 'platform', 'platform-app.js'), 'utf8');
const platformCss = fs.readFileSync(path.join(__dirname, '..', 'platform', 'platform.css'), 'utf8');
const platformHtml = fs.readFileSync(path.join(__dirname, '..', 'platform', 'index.html'), 'utf8');

function functionBlock(name, nextName) {
  const start = platformApp.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} must exist`);
  const end = nextName ? platformApp.indexOf(`function ${nextName}`, start + 1) : -1;
  return platformApp.slice(start, end >= 0 ? end : start + 5000);
}

test('dashboard KPI cards route active shops and owners to their dedicated destinations', () => {
  const dashboard = functionBlock('renderAdminDashboardTab', 'reloadAdminShops');
  assert.match(dashboard, /Faol do'konlar[\s\S]*onclick="openActiveShopsFromDashboard\(\)"|onclick="openActiveShopsFromDashboard\(\)"[\s\S]*Faol do'konlar/);
  assert.match(dashboard, /Foydalanuvchilar[\s\S]*onclick="openAdminOwnersFromDashboard\(\)"|onclick="openAdminOwnersFromDashboard\(\)"[\s\S]*Foydalanuvchilar/);
  assert.doesNotMatch(dashboard, /Foydalanuvchilar[\s\S]{0,300}switchTab\('settings'\)/);

  const active = functionBlock('openActiveShopsFromDashboard', 'openAdminOwnersFromDashboard');
  assert.match(active, /setAdminShopsStatusFilter\('ACTIVE'\)/);
  assert.ok(active.indexOf("setAdminShopsStatusFilter('ACTIVE')") < active.indexOf("switchTab('shops')"), 'ACTIVE filter must be set before opening shops');

  const owners = functionBlock('openAdminOwnersFromDashboard', 'renderAdminOwnersBody');
  assert.match(owners, /reloadAdminShops\(\)/);
  assert.match(owners, /openPage\('ADMIN_OWNERS'\)/);
  assert.match(platformApp, /p === 'ADMIN_OWNERS'[\s\S]{0,180}renderAdminOwnersBody\(\)/);
});

test('owner page deterministically aggregates shops by owner Telegram ID', () => {
  const ownersBody = functionBlock('renderAdminOwnersBody', 'openAdminOwnerShops');
  assert.match(ownersBody, /new Map\(\)/);
  assert.match(ownersBody, /ownerTelegramId/);
  assert.match(ownersBody, /shopCount/);
  assert.match(ownersBody, /activeCount/);
  assert.match(ownersBody, /localeCompare/);
  assert.match(ownersBody, /openAdminOwnerShops/);

  const openOwnerShops = functionBlock('openAdminOwnerShops', 'renderAdminShopsTab');
  assert.match(openOwnerShops, /adminShopsSearchQuery = String\(ownerId/);
  assert.match(openOwnerShops, /adminShopsStatusFilter = 'ALL'/);
  assert.match(openOwnerShops, /switchTab\('shops'\)/);
});

test('expired shops have a structured empty state and cards reuse the admin surface system', () => {
  const expired = functionBlock('renderExpiredShopsBody', 'renderExpiredShopRow');
  assert.match(expired, /plat-admin-empty/);
  assert.match(expired, /pIcon\('calendar'/);
  assert.match(expired, /Obunasi tugagan do'kon yo'q/);
  assert.match(expired, /plat-expired-list/);
  assert.match(platformCss, /\.plat-expired-list\s*\{/);
});

test('admin cards use three, two and one responsive columns with clear surfaces and focus', () => {
  assert.match(platformCss, /\.plat-admin-operational-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,minmax\(0,1fr\)\)/s);
  assert.match(platformCss, /@media\s*\(max-width:\s*1023px\)[\s\S]*\.plat-admin-operational-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(platformCss, /@media\s*\(max-width:\s*639px\)[\s\S]*\.plat-admin-operational-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,1fr\)/);
  assert.match(platformCss, /\.plat-admin-mode\s+\.plat-content\s*\{[^}]*background:\s*var\(--c-page-bg\)/s);
  assert.match(platformCss, /\.plat-admin-surface\s*\{[^}]*background:\s*var\(--c-surface\)/s);
  assert.match(platformCss, /\.plat-admin-kpi-card:focus-visible/);
  assert.match(platformCss, /\.plat-admin-operational-grid\s*>\s*\*\s*\{[^}]*min-width:\s*0/s);
});

test('platform asset versions are bumped together for the admin polish release', () => {
  assert.match(platformHtml, /platform\.css\?v=45/);
  assert.match(platformHtml, /platform-app\.js\?v=70/);
});
