const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..', '..');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

test('H2 profile validation requires name and Uzbekistan phone', async () => {
  const { validateProfilePatch } = await import(moduleUrl('web/features/profile/profile.js'));
  assert.equal(validateProfilePatch({ firstName: '', phone: '90' }).valid, false);
  const good = validateProfilePatch({ firstName: 'Ali', lastName: 'Valiyev', phone: '+998 90 123 45 67' });
  assert.equal(good.valid, true);
  assert.equal(good.patch.phone, '+998901234567');
});

test('H2 controller loads profile/favorites and clears private state when account changes', async () => {
  const { createProfileController } = await import(moduleUrl('web/features/profile/profile.js'));
  let accountId = 'acct-a';
  const profilePort = {
    get: async () => ({ ok: true, data: { account: { id: accountId, displayName: 'Demo' }, shopProfile: { phone: '+998901234567', name: 'Demo' } } }),
    update: async ({ patch }) => ({ ok: true, data: { account: { id: accountId }, shopProfile: patch } }),
    listFavorites: async () => ({ ok: true, data: { items: [{ productId: 'p1' }] } }),
    setFavorite: async ({ favorite }) => ({ ok: true, data: { favorite } }),
  };
  const controller = createProfileController({ profilePort, initialAccountId: 'acct-a' });
  assert.equal((await controller.load()).ok, true);
  assert.equal(controller.getState().favorites.length, 1);
  accountId = 'acct-b';
  await controller.load({ accountId: 'acct-b' });
  assert.equal(controller.getState().accountId, 'acct-b');
  controller.resetPrivateState('acct-c');
  assert.equal(controller.getState().profile, null);
  assert.deepEqual(controller.getState().favorites, []);
});

test('H2 sessions controller does not revoke current session through revoke action', async () => {
  const { createSessionsController } = await import(moduleUrl('web/features/profile/profile.js'));
  let signedOut = false;
  const authPort = {
    listSessions: async () => ({ ok: true, data: { items: [{ id: 'cur', current: true }, { id: 'other', current: false }] } }),
    revokeSession: async () => ({ ok: true, data: { revoked: true } }),
    revokeAllSessions: async () => ({ ok: true, data: {} }),
    signOut: async () => ({ ok: true, data: { signedOut: true } }),
  };
  const controller = createSessionsController({ authPort, onSignedOut: () => { signedOut = true; } });
  await controller.load();
  const blocked = await controller.revoke('cur');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error.code, 'CONFLICT');
  assert.equal((await controller.revoke('other')).ok, true);
  assert.equal(controller.getState().items.length, 1);
  assert.equal((await controller.signOut()).ok, true);
  assert.equal(signedOut, true);
  assert.equal(controller.getState().items.length, 0);
});

test('H2 routes and source expose favorites, sessions and useful profile destinations', () => {
  const routes = fs.readFileSync(path.join(root, 'web/navigation/routes.js'), 'utf8');
  const src = fs.readFileSync(path.join(root, 'web/features/profile/profile.js'), 'utf8');
  assert.match(routes, /\/profile\/sessions/);
  assert.match(routes, /\/favorites/);
  assert.match(src, /Buyurtmalarim/);
  assert.match(src, /Domen va manzil/);
  assert.doesNotMatch(src, /DB kontraktida/);
  assert.match(src, /Boshqa barcha sessiyalarni bekor qilish/);
});
