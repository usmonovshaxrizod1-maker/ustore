const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = p => fs.readFileSync(p, 'utf8');

test('Six-character password policy is shared by authentication, Telegram reset, and Web updates', () => {
  const helper = read('supabase/functions/_shared/web-auth.ts');
  assert.match(helper, /export function validatePassword\(password: string\): boolean \{[\s\S]*?Array\.from\(password\)\.length >= 6 && bytes <= 72/);
  assert.match(helper, /if \(!validatePassword\(input\.password\)\)/);
  assert.match(helper, /if \(!validateLogin\(login\) \|\| !validatePassword\(password\)\)/);
  assert.match(helper, /if \(!validatePassword\(nextPassword\)\)/);
  const [body] = helper.match(/export function validatePassword\(password: string\): boolean \{[\s\S]*?\n\}/) || [];
  assert.ok(body);
  const valid = pass => Array.from(pass).length >= 6 && new TextEncoder().encode(pass).byteLength <= 72;
  assert.equal(valid('123456'), true);
  assert.equal(valid('abcdef'), true);
  assert.equal(valid('12345'), false);
  assert.equal(valid('x'.repeat(73)), false);
  assert.match(read('ustore-shop-app.js'), /minlength="6"/);
  assert.match(read('platform/platform-app.js'), /minlength="6"/);
});

test('Browser credential status returns only public login after verifying bearer session', () => {
  const api = read('supabase/functions/web-auth/index.ts');
  const begin = api.indexOf('const token = bearer(req);');
  const status = api.indexOf('case "get_credentials_status"');
  assert.ok(begin > -1 && status > begin);
  const source = api.slice(status, api.indexOf('case "sign_out"', status));
  assert.match(source, /select\("login_display"\)/);
  assert.match(source, /session\.accountId/);
  assert.doesNotMatch(source, /password_hash|password:\s*credentials/);
  assert.match(api, /"get_credentials_status", "change_login", "change_password"/);
});

test('Both Platform and Shop Web show credential manager without redirecting to Telegram', () => {
  const shop = read('ustore-shop-app.js');
  const platform = read('platform/platform-app.js');
  assert.match(shop, /if \(browserBridge\) \{[\s\S]{0,550}?webCredentialState = \{/);
  assert.match(shop, /browserBridge\.request\('web_credentials_status'/);
  assert.match(platform, /browserBridge\.request\('web_credentials_status'/);
  for (const text of [shop, platform]) {
    assert.match(text, /browserBridge\.request\('web_credentials_change_login'/);
    assert.match(text, /browserBridge\.request\('web_credentials_change_password', \{ currentPassword, newPassword: password \}/);
    assert.match(text, /web_credentials_finish_password_change/);
    assert.match(text, /issuedPassword:\s*password/);
  }
});

test('Frame bridge controls authentication changes and cannot restore stored password', () => {
  const host = read('web/shared/frame-host.js');
  const adapter = read('web/services/live/auth.js');
  assert.match(host, /if \(!token\) throw new Error\('auth_required'\)/);
  assert.match(host, /runtime\.auth\.getCredentialsStatus\(\)/);
  assert.match(host, /runtime\.auth\.changePassword\(\{ currentPassword:/);
  assert.match(host, /web_credentials_finish_password_change/);
  assert.match(adapter, /getCredentialsStatus\(\) \{ return request\('get_credentials_status', \{\}, \{ auth: true \}\); \}/);
  assert.match(adapter, /if \(result\.ok\) tokenStore\.clear\(\)/);
  for (const ui of [read('ustore-shop-app.js'), read('platform/platform-app.js')]) {
    assert.doesNotMatch(ui, /(?:localStorage|sessionStorage)\.setItem\([^\n]*(?:issuedPassword|currentPassword)/);
  }
});

test('Browser auth adapter retrieves login with session and revokes local token after password update', async () => {
  const { createLiveAuthAdapter, createMemoryTokenStore } = await import('../web/services/live/auth.js');
  const tokenStore = createMemoryTokenStore('us1_existing');
  const actions = [];
  const fetchImpl = async (_url, config) => {
    assert.equal(config.headers.authorization, 'UStoreSession us1_existing');
    const request = JSON.parse(config.body);
    actions.push(request);
    return new Response(JSON.stringify(request.action === 'get_credentials_status'
      ? { ok: true, credentialExists: true, login: 'tester' }
      : { ok: true, sessionsRevoked: true }), { status: 200 });
  };
  const auth = createLiveAuthAdapter({ endpoint: 'https://example.com/functions/v1/web-auth', tokenStore, fetchImpl });
  const status = await auth.getCredentialsStatus();
  assert.equal(status.ok, true);
  assert.equal(status.data.login, 'tester');
  assert.equal(tokenStore.get(), 'us1_existing');
  const changed = await auth.changePassword({ currentPassword: 'oldpassword', newPassword: '123456' });
  assert.equal(changed.ok, true);
  assert.equal(tokenStore.get(), '');
  assert.deepEqual(actions.map(x => x.action), ['get_credentials_status', 'change_password']);
  assert.deepEqual(actions[1].payload, { currentPassword: 'oldpassword', newPassword: '123456' });
});
