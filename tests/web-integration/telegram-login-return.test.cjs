const test = require('node:test');
const assert = require('node:assert/strict');
const { createLiveAuthAdapter, createSessionStorageOfficialTelegramStore, createMemoryTokenStore } = require('../../web/services/live/auth.js');
const { createLoginController, createLoginView } = require('../../web/features/auth/login.js');
const { completeOfficialTelegramCallback } = require('../../web/features/auth/official-telegram-callback.js');

function storage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
}
class FakeNode {
  constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.textContent = ''; this.listeners = {}; this.classList = { add: () => {} }; }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(key, listener) { this.listeners[key] = listener; }
}
const doc = { createElement: (tag) => new FakeNode(tag) };
function allText(node) { return [node?.textContent || '', ...(node?.children || []).map(allText)].join(' '); }

test('official Telegram redirect completes automatically in the same browser tab and keeps password login', async () => {
  const official = createSessionStorageOfficialTelegramStore(storage());
  const tokenStore = createMemoryTokenStore();
  const calls = [];
  const fetchImpl = async (_url, options) => {
    const { action, payload } = JSON.parse(options.body);
    calls.push({ action, payload });
    const body = action === 'begin_telegram_oidc' ? {
      challenge: {
        state: 'a'.repeat(43), browserVerifier: 'b'.repeat(43),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        redirectUrl: `https://oauth.telegram.org/auth?state=${'a'.repeat(43)}&redirect_uri=https%3A%2F%2Fustr.uz%2F`,
      },
    } : action === 'exchange_telegram_oidc' ? {
      accountId: 'account-123', returnTo: '/platform/app',
      session: { id: 'session-123', token: 'us1_oidc_token', expiresAt: '2026-10-26T00:00:00Z' },
    } : action === 'sign_in_password' ? {
      accountId: 'account-123', session: { id: 'password-session', token: 'password-token', expiresAt: '2026-10-26T00:00:00Z' },
    } : null;
    return { ok: true, status: 200, json: async () => body };
  };
  const adapter = () => createLiveAuthAdapter({ endpoint: 'https://example.supabase.co/functions/v1/web-auth', fetchImpl, tokenStore, officialTelegramStore: official });
  let redirect = '';
  const controller = createLoginController({ authPort: adapter(), returnTo: '/platform/app', onRedirect: (url) => { redirect = url; } });
  assert.match(allText(createLoginView({ controller }, doc).element), /Telegram’da davom etish/);
  assert.doesNotMatch(allText(createLoginView({ controller }, doc).element), /Botda tasdiqlaganingizdan/);
  await controller.signInTelegram();
  assert.match(redirect, /^https:\/\/oauth\.telegram\.org\/auth/);
  assert.equal(tokenStore.get(), '');
  const state = official.get().state;
  assert.equal(redirect.includes(official.get().browserVerifier), false);
  let browserUrl = `https://ustr.uz/?code=one-time-code&state=${state}`;
  const result = await completeOfficialTelegramCallback({
    locationRef: { href: browserUrl },
    historyRef: { state: null, replaceState: (_state, _title, path) => { browserUrl = path; } },
    authPort: adapter(), pendingStore: official,
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.returnTo, '/platform/app');
  assert.equal(browserUrl, '/');
  assert.equal(tokenStore.get(), 'us1_oidc_token');
  assert.equal(official.get(), null);
  assert.deepEqual(calls.map((c) => c.action), ['begin_telegram_oidc', 'exchange_telegram_oidc']);
  assert.equal(calls[1].payload.state, state);
  assert.equal(calls[1].payload.codeVerifier.length, 43);
  controller.setTab('password');
  assert.match(allText(createLoginView({ controller }, doc).element), /Login va parol/);
  assert.equal((await adapter().signInPassword({ login: 'owner', password: 'pass' })).ok, true);
});

test('forged callback state cannot request an exchange or create a web session', async () => {
  const official = createSessionStorageOfficialTelegramStore(storage());
  official.set({ state: 'a'.repeat(43), browserVerifier: 'b'.repeat(43), codeVerifier: 'c'.repeat(43), expiresAt: new Date(Date.now() + 60000).toISOString() });
  const tokenStore = createMemoryTokenStore();
  let requests = 0;
  const authPort = createLiveAuthAdapter({ endpoint: 'https://example.supabase.co/functions/v1/web-auth',
    tokenStore, officialTelegramStore: official, fetchImpl: () => { requests++; throw new Error('must not call server'); } });
  let cleanUrl = '';
  const result = await completeOfficialTelegramCallback({
    locationRef: { href: `https://ustr.uz/?code=forged&state=${'z'.repeat(43)}` },
    historyRef: { replaceState: (_s, _t, url) => { cleanUrl = url; } }, authPort, pendingStore: official,
  });
  assert.equal(result.ok, false);
  assert.equal(requests, 0);
  assert.equal(tokenStore.get(), '');
  assert.equal(cleanUrl, '/');
});
