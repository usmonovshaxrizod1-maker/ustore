const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..', '..');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

test('D1 password login maps invalid/rate-limit state and deterministic success without storing password', async () => {
  const { createAuthPort } = await import(moduleUrl('web/services/ports/auth.js'));
  const { createMockAuthAdapter } = await import(moduleUrl('web/services/mock/auth.js'));
  const { createLoginController } = await import(moduleUrl('web/features/auth/login.js'));
  let signedIn = null;
  const controller = createLoginController({ authPort: createAuthPort(createMockAuthAdapter()), onSignedIn: (data) => { signedIn = data; } });
  controller.setTab('password');
  const bad = await controller.signInPassword({ login: 'demo.customer', password: 'wrong' });
  assert.equal(bad.ok, false);
  assert.equal(controller.getState().error.code, 'INVALID_CREDENTIALS');
  const limited = await controller.signInPassword({ login: 'rate-limited', password: 'x' });
  assert.equal(limited.ok, false);
  assert.equal(controller.getState().error.code, 'RATE_LIMITED');
  const good = await controller.signInPassword({ login: 'demo.customer', password: 'DemoOnly-123!' });
  assert.equal(good.ok, true);
  assert.equal(signedIn.actor.accountId, 'acct-customer-001');
  assert.equal(JSON.stringify(controller.getState()).includes('DemoOnly-123!'), false);
});


test('D1 session-expired state is mapped from auth.getSession()', async () => {
  const { createAuthPort } = await import(moduleUrl('web/services/ports/auth.js'));
  const { createMockAuthAdapter } = await import(moduleUrl('web/services/mock/auth.js'));
  const { createLoginController } = await import(moduleUrl('web/features/auth/login.js'));
  const controller = createLoginController({ authPort: createAuthPort(createMockAuthAdapter({ session: 'expired' })) });
  const result = await controller.loadSession();
  assert.equal(result.ok, false);
  assert.equal(controller.getState().error.code, 'SESSION_EXPIRED');
});

test('Telegram button uses the official sign-in method through the auth port', async () => {
  const { createAuthPort } = await import(moduleUrl('web/services/ports/auth.js'));
  const { createMockAuthAdapter } = await import(moduleUrl('web/services/mock/auth.js'));
  const { createLoginController } = await import(moduleUrl('web/features/auth/login.js'));
  let redirect = '';
  const controller = createLoginController({
    authPort: createAuthPort(createMockAuthAdapter()),
    returnTo: '/platform/app',
    onRedirect: (url) => { redirect = url; },
  });
  assert.equal((await controller.signInTelegram()).ok, true);
  assert.match(redirect, /^https:\/\/auth\.example\/oidc\?/);
  assert.equal(controller.getState().telegramPhase, 'redirecting');
});

test('D1 login UI declares autocomplete, show/hide and separate Telegram/password tabs', () => {
  const source = fs.readFileSync(path.join(root, 'web/features/auth/login.js'), 'utf8');
  assert.match(source, /autocomplete:\s*'username'/);
  assert.match(source, /autocomplete:\s*'current-password'/);
  assert.match(source, /passwordVisible \? 'text' : 'password'/);
  assert.match(source, /\['telegram', tr\('Telegram orqali', 'Через Telegram'\)\]/);
  assert.match(source, /\['password', tr\('Login va parol', 'Логин и пароль'\)\]/);
});
