const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('091 is additive and preserves Telegram identity while adding central account mapping', () => {
  const sql = read('supabase/migrations/091_web_accounts_identity.sql');
  assert.match(sql, /create table if not exists public\.accounts/);
  assert.match(sql, /unique\(provider, provider_subject\)/);
  assert.match(sql, /alter table if exists public\.app_users add column if not exists account_id/);
  assert.match(sql, /alter table if exists public\.shop_memberships add column if not exists account_id/);
  assert.match(sql, /orders add column if not exists account_id/);
  assert.match(sql, /user_favorites add column if not exists account_id/);
  assert.match(sql, /support_tickets add column if not exists account_id/);
  assert.match(sql, /cart_logs add column if not exists account_id/);
  assert.doesNotMatch(sql, /drop\s+(column|table).*tg_id/i);
  assert.doesNotMatch(sql, /update\s+public\.app_users\s+set\s+tg_id/i);
});

test('092 stores password hashes and opaque session hashes, not plaintext secrets', () => {
  const sql = read('supabase/migrations/092_web_auth_sessions.sql');
  assert.match(sql, /password_hash text not null/);
  assert.match(sql, /token_hash text not null unique/);
  assert.match(sql, /ustore_auth_rate_limit_consume/);
  assert.match(sql, /web_auth_audit/);
  assert.doesNotMatch(sql, /password_plain|plaintext_password|session_token text/i);
});

test('web auth implementation uses vetted bcrypt work factor, cryptographic random session and generic credentials failure', () => {
  const src = read('supabase/functions/_shared/web-auth.ts');
  assert.match(src, /BCRYPT_COST = 12/);
  assert.match(src, /crypto\.getRandomValues/);
  assert.match(src, /randomBytes\(32\)/);
  assert.match(src, /byteLength[\s\S]*<= 72/);
  assert.match(src, /INVALID_CREDENTIALS/);
  assert.match(src, /PASSWORD_CHANGED/);
  assert.match(src, /CREDENTIAL_RESET_TELEGRAM/);
  assert.match(src, /ustore_replace_credentials_and_revoke/);
  assert.doesNotMatch(src, /console\.(log|error).*password/i);
  assert.doesNotMatch(src, /localStorage|sessionStorage/);
});

test('web-auth endpoint is opaque-session based and never mints custom JWT', () => {
  const src = read('supabase/functions/web-auth/index.ts');
  assert.match(src, /UStoreSession/);
  assert.match(src, /sign_in_password/);
  assert.match(src, /get_session/);
  assert.match(src, /revoke_all_sessions/);
  assert.doesNotMatch(src, /signJwt|jwt\.sign|createToken|fake.*email/i);
  const config = read('supabase/config.toml');
  assert.match(config, /\[functions\.web-auth\][\s\S]*verify_jwt = false/);
});

test('4a central bot credential entry preserves existing webhook surface and does not send credentials in chat', () => {
  const src = read('supabase/functions/platform-api/index.ts');
  assert.match(src, /isLoginCommand/);
  assert.match(src, /startPayload === "credentials"/);
  assert.match(src, /ensureTelegramAccount/);
  assert.match(src, /telegram_credential_entry/);
  assert.match(src, /screen", "web-credentials"/);
  assert.match(src, /Parol bot chatiga yuborilmaydi/);
  assert.match(src, /attachTelegramReceiptToRequest/); // existing receipt webhook retained
  assert.match(src, /isStartCommand/); // existing /start retained
  const credentialChatStart = src.indexOf('if (chatId && (isLoginCommand');
  const regularActionStart = src.indexOf('const { action, payload = {}, initData }');
  const credentialChatSlice = src.slice(credentialChatStart, regularActionStart);
  assert.doesNotMatch(credentialChatSlice, /issueInitialCredentials|resetCredentialsForTelegram/); // bot chat itself never reveals/resets credentials
});

test('migration allocator includes 091-093 and 4c uses existing 092 schema', () => {
  const allocator = read('docs/web/MIGRATION_ALLOCATOR.md');
  assert.match(allocator, /091_web_accounts_identity\.sql/);
  assert.match(allocator, /092_web_auth_sessions\.sql/);
  assert.match(allocator, /093_web_telegram_auth_challenges\.sql/);
  const tasks = read('docs/web/ASTRA_TASKS.md');
  assert.match(tasks, /\| 4b \| CONTRACT_TESTED_LOCAL \/ LIVE_PENDING/);
  assert.match(tasks, /\| 4c \| CONTRACT_TESTED_LOCAL \/ LIVE_PENDING/);
});
