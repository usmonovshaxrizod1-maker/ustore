const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Web PLATFORM iframe ships on ustr.uz itself; Shop Mini App still uses GitHub', () => {
  const host = read('web/shared/frame-host.js');
  const build = read('scripts/build-production.mjs');
  assert.match(host, /kind === 'platform' \? location\.origin : MINI_APP_ORIGIN/);
  assert.match(host, /'\/platform-ui\/'/);
  assert.match(host, /new URL\('\/ustore\/', MINI_APP_ORIGIN\)/);
  assert.match(build, /copyTree\(path\.join\(root,'platform'\), path\.join\(webDist,'platform-ui'\)\)/);
  assert.match(read('web/_headers'), /\/platform-ui\/\*\s+! X-Frame-Options\s+! Content-Security-Policy\s+X-Frame-Options: SAMEORIGIN/);
  assert.match(read('web/index.html'), /frame-src 'self'/);
});

test('owner notifications are kept after full shop purge with authenticated reads and marks', () => {
  const sql = read('supabase/migrations/120_platform_owner_notifications.sql');
  const api = read('supabase/functions/platform-api/index.ts');
  const cron = read('supabase/functions/platform-subscription-cron/index.ts');
  assert.match(sql, /create table if not exists public\.platform_owner_notifications/);
  assert.match(sql, /recipient_telegram_id text not null/);
  assert.doesNotMatch(sql, /references public\.shops/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /existing-.*sh\.id/);
  assert.match(api, /case "platform_list_owner_notifications"/);
  assert.match(api, /case "platform_mark_owner_notification_read"/);
  assert.match(api, /\.eq\("recipient_telegram_id", tgId\)/);
  assert.match(api, /ownerNotifications: await listOwnerNotifications\(db, tgId\)/);
  assert.match(api, /ownerNotification\(db, ownerTelegramId, shopId/);
  assert.match(cron, /platform_owner_notifications/);
});

test('only Platform owner dashboard loses lifecycle banner; both environments get bell and inbox', () => {
  const js = read('platform/platform-app.js');
  assert.doesNotMatch(js, /`\$\{renderUserLifecycleAttention\(\)\}\$\{renderUserRequestsHomeTop\(\)\}/);
  assert.match(js, /plat-header-notice-btn/);
  assert.match(js, /p === 'OWNER_NOTIFICATIONS'/);
  assert.match(js, /openOwnerNotifications\(\)/);
  assert.match(js, /platform_mark_owner_notification_read/);
  assert.match(js, /section === 'notifications'/);
  assert.match(read('web/navigation/routes.js'), /path: '\/platform\/notifications'/);
  assert.match(js, /escapeHtml\(n\.reason\)/);
  assert.match(js, /logoutPlatformWeb/);
});

test('logout runs in Web host only and uses existing authenticated sign out', () => {
  const host = read('web/shared/frame-host.js');
  const app = read('web/app.js');
  assert.match(host, /action === 'web_sign_out'/);
  assert.match(host, /runtime\.auth\.signOut\(\)/);
  assert.match(app, /if \(kind === 'platform'\) \{/);
  assert.match(app, /go\('\/platform\/login', true\)/);
});

test('Platform login starts as Shop-style two-row chooser and preserves credentials', () => {
  const ui = read('web/features/auth/login.js');
  const app = read('web/app.js');
  assert.match(ui, /panelOpen: initialTab !== 'chooser'/);
  assert.match(ui, /platformStyle/);
  assert.match(ui, /state\.panelOpen\) root\.append\(body\)/);
  assert.match(app, /initialTab: 'chooser'/);
  assert.match(app, /platformStyle: true/);
  assert.match(app, /const existing = await runtime\.auth\.getSession\(\)/);
  assert.match(app, /onSignedIn: \(\) => go\(returnTo, true\)/);
});
