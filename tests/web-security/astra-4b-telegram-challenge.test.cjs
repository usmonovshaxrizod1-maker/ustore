const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..', '..');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

test('Astra-4b only accepts same-origin relative return paths and exact HTTPS origins', async () => {
  const mod = await import(moduleUrl('supabase/functions/_shared/web-telegram-auth.ts'));
  assert.equal(mod.isSafeReturnPath('/products/p1?x=1#buy'), true);
  for (const bad of ['//evil.example/x', 'https://evil.example/x', '/\\evil', 'javascript:alert(1)', '']) {
    assert.equal(mod.isSafeReturnPath(bad), false, bad);
  }
  assert.equal(mod.canonicalHttpOrigin('https://fitcore.ustore.uz'), 'https://fitcore.ustore.uz');
  assert.equal(mod.canonicalHttpOrigin('https://user:pass@fitcore.ustore.uz'), null);
  assert.equal(mod.canonicalHttpOrigin('https://fitcore.ustore.uz/path'), null);
  assert.equal(mod.canonicalHttpOrigin('http://evil.example'), null);
  assert.equal(mod.canonicalHttpOrigin('http://localhost:3000'), 'http://localhost:3000');
  const allowed = mod.parseAllowedOrigins(['https://ustore.uz, https://fitcore.ustore.uz/path', 'http://localhost:3000']);
  assert.equal(mod.isAllowedOrigin('https://ustore.uz', allowed), true);
  assert.equal(mod.isAllowedOrigin('https://attacker.ustore.uz', allowed), false);
});

test('Astra-4b begin challenge stores only hashes; verifier is browser-bound and never appears in Telegram link', async () => {
  const mod = await import(moduleUrl('supabase/functions/_shared/web-telegram-auth.ts'));
  let inserted = null;
  const db = { from(name) { assert.equal(name, 'web_telegram_auth_challenges'); return { async insert(row) { inserted = row; return { error: null }; } }; } };
  const result = await mod.beginTelegramWebChallenge(db, {
    origin: 'https://ustore.uz', returnTo: '/shop/cart?from=login', botUsername: 'ustore_demo_bot',
  });
  assert.match(result.state, /^[A-Za-z0-9_-]{40,60}$/);
  assert.match(result.browserVerifier, /^[A-Za-z0-9_-]{40,60}$/);
  assert.match(result.redirectUrl, /^https:\/\/t\.me\/ustore_demo_bot\?start=webauth_/);
  assert.equal(result.redirectUrl.includes(result.state), true);
  assert.equal(result.redirectUrl.includes(result.browserVerifier), false);
  assert.equal(inserted.return_origin, 'https://ustore.uz');
  assert.equal(inserted.return_path, '/shop/cart?from=login');
  assert.notEqual(inserted.state_hash, result.state);
  assert.notEqual(inserted.browser_verifier_hash, result.browserVerifier);
  assert.equal(Object.values(inserted).includes(result.state), false);
  assert.equal(Object.values(inserted).includes(result.browserVerifier), false);
});

test('Astra-4b SQL exchange is atomic one-time and requires verifier plus confirmed account', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations/093_web_telegram_auth_challenges.sql'), 'utf8');
  assert.match(sql, /state_hash text not null unique/i);
  assert.match(sql, /browser_verifier_hash text not null/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /r\.consumed_at is not null/i);
  assert.match(sql, /r\.account_id <> p_confirm_account_id/i);
  assert.match(sql, /insert into public\.web_sessions/i);
  assert.match(sql, /update public\.web_telegram_auth_challenges set consumed_at=now_ts/i);
  assert.doesNotMatch(sql, /\bstate_token\b|\bbrowser_verifier text\b/i);
});

test('Astra-4b central bot preserves case-sensitive state and cannot rebind approved challenge', () => {
  const source = fs.readFileSync(path.join(root, 'supabase/functions/platform-api/index.ts'), 'utf8');
  assert.match(source, /startPayloadRaw = String\(tokens\[1\]/);
  assert.match(source, /startPayloadRaw\.startsWith\("webauth_"\)/);
  assert.match(source, /approveTelegramWebChallenge/);
  assert.match(source, /APPROVED_OTHER/);
  const webhookSecretPos = source.indexOf('telegramWebhookSecret(PLATFORM_BOT_TOKEN)');
  const approvalPos = source.indexOf('approveTelegramWebChallenge');
  assert.ok(webhookSecretPos > 0 && approvalPos > 0);
});

test('Astra-4b web-auth requires allowlisted Origin, explicit account confirmation and does not use wildcard CORS', () => {
  const source = fs.readFileSync(path.join(root, 'supabase/functions/web-auth/index.ts'), 'utf8');
  assert.match(source, /WEB_AUTH_ALLOWED_ORIGINS/);
  assert.match(source, /begin_telegram_sign_in/);
  assert.match(source, /get_telegram_sign_in_status/);
  assert.match(source, /exchange_telegram_sign_in/);
  assert.match(source, /confirmed: payload\.confirmed === true/);
  assert.doesNotMatch(source, /Access-Control-Allow-Origin"\s*:\s*"\*"/);
  assert.match(source, /Origin not allowed/);
});
