const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..', '..');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

test('Astra-4c repeated initial issue never returns an existing plaintext password', () => {
  const src = fs.readFileSync(path.join(root, 'supabase/functions/_shared/web-auth.ts'), 'utf8');
  assert.match(src, /if \(existing\) return \{ login: String\(existing\.login_display\), password: "", created: false \}/);
  assert.doesNotMatch(src, /existing[^\n]{0,120}password_hash[^\n]{0,120}return/);
});

test('Astra-4c central platform API protects credential actions with verified central initData and one-time entry claim', () => {
  const src = fs.readFileSync(path.join(root, 'supabase/functions/platform-api/index.ts'), 'utf8');
  assert.match(src, /verifyTelegramInitData\(initData, PLATFORM_BOT_TOKEN\)/);
  assert.match(src, /platform_web_credentials_status/);
  assert.match(src, /platform_issue_web_credentials/);
  assert.match(src, /platform_reset_web_credentials/);
  assert.match(src, /platform_change_web_login/);
  assert.match(src, /\.is\("consumed_at", null\)\.gt\("expires_at", nowIso\)/);
  assert.match(src, /password: issued\.created \? issued\.password : null/);
  assert.match(src, /resetCredentialsForTelegram/);
  assert.match(src, /claimCredentialEntry/);
});

test('Astra-4c reset helper revokes old sessions and initial issue path does not disclose prior password', () => {
  const src = fs.readFileSync(path.join(root, 'supabase/functions/_shared/web-auth.ts'), 'utf8');
  assert.match(src, /if \(existing\) return \{ login: String\(existing\.login_display\), password: "", created: false \}/);
  assert.match(src, /ustore_replace_credentials_and_revoke/);
  assert.doesNotMatch(src, /revokeAllSessions\(db, input\.accountId/);
  assert.match(src, /CREDENTIAL_RESET_TELEGRAM/);
});

test('Astra-4c web-auth credential entry URL is server-provided and validates origin/return path', () => {
  const src = fs.readFileSync(path.join(root, 'supabase/functions/web-auth/index.ts'), 'utf8');
  assert.match(src, /action === "begin_credential_issue"/);
  assert.match(src, /const origin = challengeOrigin\(req\)/);
  assert.match(src, /isSafeReturnPath\(returnTo\)/);
  assert.match(src, /USTORE_PLATFORM_BOT_USERNAME/);
  assert.match(src, /\?start=credentials/);
});

test('Astra-4c live auth adapter no longer fakes unavailable credential flow', () => {
  const src = fs.readFileSync(path.join(root, 'web/services/live/auth.js'), 'utf8');
  assert.match(src, /request\('begin_credential_issue'/);
  assert.doesNotMatch(src, /Credential issue\/reset Astra-4c da ulanadi/);
});

test('Astra-4c platform Mini App keeps issued password in memory only and exposes explicit copy/reset/close actions', () => {
  const src = fs.readFileSync(path.join(root, 'platform/platform-app.js'), 'utf8');
  assert.match(src, /WEB_CREDENTIALS/);
  assert.match(src, /issuedPassword: null/);
  assert.match(src, /Yangi parol yaratish/);
  assert.match(src, /Eski parol qayta ko‘rsatilmaydi/);
  assert.match(src, /navigator\.clipboard\.writeText/);
  assert.match(src, /tg\?\.close/);
  assert.doesNotMatch(src, /localStorage\.setItem\([^\n]*issuedPassword|sessionStorage\.setItem\([^\n]*issuedPassword/);
});
