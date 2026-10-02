const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..', '..');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

test('D2 credential issue/reset controller preserves safe return path and supports waiting/cancel/retry state', async () => {
  const { createAuthPort } = await import(moduleUrl('web/services/ports/auth.js'));
  const { createMockAuthAdapter } = await import(moduleUrl('web/services/mock/auth.js'));
  const { createCredentialFlowController } = await import(moduleUrl('web/features/auth/credentials.js'));
  let redirect = null;
  const controller = createCredentialFlowController({ authPort: createAuthPort(createMockAuthAdapter()), mode: 'RESET', returnTo: '/product/prod-hoodie?from=auth', onRedirect: (url) => { redirect = url; } });
  const started = await controller.start();
  assert.equal(started.ok, true);
  assert.equal(controller.getState().phase, 'waiting');
  assert.match(redirect, /^https:\/\/auth\.example\/credentials/);
  controller.cancel();
  assert.equal(controller.getState().phase, 'cancelled');
  assert.throws(() => createCredentialFlowController({ authPort: createAuthPort(createMockAuthAdapter()), returnTo: '//evil.example' }), /same-origin/);
});


test('D2 login change has no fake success and copy feedback depends on injected clipboard action', async () => {
  const { createCredentialManagementController } = await import(moduleUrl('web/features/auth/credentials.js'));
  const unavailable = createCredentialManagementController();
  const noLive = await unavailable.submitLogin('new-login');
  assert.equal(noLive.ok, false);
  assert.equal(noLive.error.code, 'CAPABILITY_UNAVAILABLE');
  let copied = null;
  const controller = createCredentialManagementController({ copyText: async (value) => { copied = value; } });
  assert.equal(await controller.copyIssuedPassword('ServerOnly-1!'), true);
  assert.equal(copied, 'ServerOnly-1!');
  assert.equal(controller.getState().copyStatus, 'copied');
});

test('D2 browser never generates a password and server-issued password is explicitly marked', () => {
  const source = fs.readFileSync(path.join(root, 'web/features/auth/credentials.js'), 'utf8');
  assert.doesNotMatch(source, /randomUUID\(|getRandomValues\(|Math\.random\(/);
  assert.match(source, /dataset\.serverIssued = 'true'/);
  assert.match(source, /brauzerda generatsiya qilinmagan/);
});
