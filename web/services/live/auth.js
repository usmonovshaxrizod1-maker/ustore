import { fail, ok, STABLE_ERROR_CODES } from '../ports/result.js';
import { fetchJsonWithTimeout } from '../../shared/fetch-json.js';

const ERROR_SET = new Set(STABLE_ERROR_CODES);
const CHALLENGE_KEY = 'ustore:web:telegram-challenge:v1';
const OFFICIAL_TELEGRAM_KEY = 'ustore:web:official-telegram:v1';
const ORIGIN_HANDOFF_KEY = 'ustore:web:origin-handoff:v1';
const SESSION_TOKEN_KEY = 'ustore:web:session-token:v1';

function safeEndpoint(value) {
  const url = new URL(String(value || ''));
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) throw new Error('web-auth endpoint HTTPS bo‘lishi kerak.');
  return url.href;
}

function normalizeError(error, status) {
  const code = ERROR_SET.has(error?.code) ? error.code : status === 401 ? 'SESSION_EXPIRED' : status === 403 ? 'FORBIDDEN' : 'NETWORK_ERROR';
  return fail(code, error?.message || 'Auth so‘rovi bajarilmadi.', { retryable: error?.retryable === true, requestId: error?.requestId });
}

export function createMemoryTokenStore(initial = '') {
  let token = String(initial || '');
  return Object.freeze({
    get: () => token,
    set: (value) => { token = String(value || ''); },
    clear: () => { token = ''; },
  });
}

export function createSessionStorageTokenStore(storage = globalThis.sessionStorage) {
  if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) throw new TypeError('sessionStorage-compatible storage kerak');
  return Object.freeze({
    get() { try { return String(storage.getItem(SESSION_TOKEN_KEY) || ''); } catch (_) { return ''; } },
    set(value) {
      const token = String(value || '');
      if (!token) { try { storage.removeItem(SESSION_TOKEN_KEY); } catch (_) {} return; }
      storage.setItem(SESSION_TOKEN_KEY, token);
    },
    clear() { try { storage.removeItem(SESSION_TOKEN_KEY); } catch (_) {} },
  });
}

// Keep only the opaque session token across browser restarts. Telegram OAuth
// verifiers and one-time handoff state remain in sessionStorage.
export function createPersistentTokenStore(storage = globalThis.localStorage, legacyStorage = globalThis.sessionStorage) {
  if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) return createSessionStorageTokenStore(legacyStorage);
  return Object.freeze({
    get() {
      try {
        const saved = String(storage.getItem(SESSION_TOKEN_KEY) || '');
        if (saved) return saved;
        const legacy = String(legacyStorage?.getItem?.(SESSION_TOKEN_KEY) || '');
        if (legacy) {
          storage.setItem(SESSION_TOKEN_KEY, legacy);
          legacyStorage?.removeItem?.(SESSION_TOKEN_KEY);
        }
        return legacy;
      } catch (_) { return ''; }
    },
    set(value) {
      const token = String(value || '');
      if (!token) { this.clear(); return; }
      storage.setItem(SESSION_TOKEN_KEY, token);
      try { legacyStorage?.removeItem?.(SESSION_TOKEN_KEY); } catch (_) {}
    },
    clear() {
      try { storage.removeItem(SESSION_TOKEN_KEY); } catch (_) {}
      try { legacyStorage?.removeItem?.(SESSION_TOKEN_KEY); } catch (_) {}
    },
  });
}

export function createSessionStorageChallengeStore(storage = globalThis.sessionStorage) {
  if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) throw new TypeError('sessionStorage-compatible storage kerak');
  return Object.freeze({
    get() {
      try { return JSON.parse(storage.getItem(CHALLENGE_KEY) || 'null'); } catch (_) { return null; }
    },
    set(value) { storage.setItem(CHALLENGE_KEY, JSON.stringify(value)); },
    clear() { storage.removeItem(CHALLENGE_KEY); },
  });
}

export function createSessionStorageOfficialTelegramStore(storage = globalThis.sessionStorage) {
  if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) throw new TypeError('sessionStorage-compatible storage kerak');
  return Object.freeze({
    get() { try { return JSON.parse(storage.getItem(OFFICIAL_TELEGRAM_KEY) || 'null'); } catch (_) { return null; } },
    set(value) { storage.setItem(OFFICIAL_TELEGRAM_KEY, JSON.stringify(value)); },
    clear() { storage.removeItem(OFFICIAL_TELEGRAM_KEY); },
  });
}

function randomBase64Url() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function codeChallenge(verifier) {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function createSessionStorageOriginHandoffStore(storage = globalThis.sessionStorage) {
  if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) throw new TypeError('sessionStorage-compatible storage kerak');
  return Object.freeze({
    get() {
      try { return JSON.parse(storage.getItem(ORIGIN_HANDOFF_KEY) || 'null'); } catch (_) { return null; }
    },
    set(value) { storage.setItem(ORIGIN_HANDOFF_KEY, JSON.stringify(value)); },
    clear() { storage.removeItem(ORIGIN_HANDOFF_KEY); },
  });
}

export function createLiveAuthAdapter({ endpoint, fetchImpl = globalThis.fetch, tokenStore = createMemoryTokenStore(), challengeStore = null, officialTelegramStore = null } = {}) {
  const url = safeEndpoint(endpoint);
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch kerak');
  const challenges = challengeStore || { get: () => null, set: () => {}, clear: () => {} };
  const official = officialTelegramStore || { get: () => null, set: () => {}, clear: () => {} };

  let signInGeneration = 0;
  let sessionRequest = null;
  async function request(action, payload = {}, { auth = false } = {}) {
    const tokenAtStart = tokenStore.get();
    const producesSession = ['sign_in_password','exchange_telegram_sign_in','exchange_telegram_oidc','exchange_origin_handoff'].includes(action);
    const generation = producesSession ? ++signInGeneration : signInGeneration;
    if (['sign_out','revoke_all_sessions','change_password'].includes(action)) ++signInGeneration;
    const headers = { 'content-type': 'application/json' };
    if (auth) {
      const token = tokenStore.get();
      if (!token) return fail('AUTH_REQUIRED', 'Kirish talab qilinadi.');
      headers.authorization = `UStoreSession ${token}`;
    }
    let response, body;
    try {
      const options = { method: 'POST', headers, body: JSON.stringify({ action, payload }), credentials: 'omit' };
      if (['get_session', 'begin_origin_handoff', 'get_origin_handoff', 'authorize_origin_handoff', 'exchange_origin_handoff', 'begin_telegram_oidc', 'exchange_telegram_oidc'].includes(action)) {
        ({ response, data: body } = await fetchJsonWithTimeout(fetchImpl, url, options, 30000));
      } else {
        response = await fetchImpl(url, options);
        body = await response.json().catch(() => null);
      }
    } catch (_) {
      return fail('NETWORK_ERROR', 'Auth serveriga ulanib bo‘lmadi.', { retryable: true });
    }
    if ((auth && tokenStore.get() !== tokenAtStart) || ((producesSession || action === 'get_session') && generation !== signInGeneration)) return fail('CONFLICT', 'Kirish holati o‘zgardi. Qayta urinib ko‘ring.');
    if (!response.ok || body?.error) {
      if (auth && response.status === 401 && body?.error?.code !== 'INVALID_CREDENTIALS' && tokenStore.get() === tokenAtStart) tokenStore.clear();
      return normalizeError(body?.error, response.status);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('CONTRACT_MISMATCH', 'Auth javobi noto‘liq.');
    if (producesSession && (typeof body.accountId !== 'string' || !body.accountId || typeof body.session?.token !== 'string' || !body.session.token)) return fail('CONTRACT_MISMATCH', 'Sessiya javobi noto‘liq.');
    return ok(body);
  }

  const adapter = {
    async getSession() {
      const result = await request('get_session', {}, { auth: true });
      if (!result.ok) return result;
      if (result.data.replacementToken) tokenStore.set(result.data.replacementToken);
      return ok({ actor: result.data.actor || null, accountId: result.data.accountId || null, session: result.data.session || null });
    },
    async signInPassword(input) {
      const result = await request('sign_in_password', { login: input?.login || '', password: input?.password || '' });
      if (!result.ok) return result;
      tokenStore.set(result.data.session?.token || '');
      challenges.clear();
      official.clear();
      return ok({ actor: result.data.actor || null, accountId: result.data.accountId, session: result.data.session });
    },
    async beginOfficialTelegramSignIn(input) {
      const verifier = randomBase64Url();
      const result = await request('begin_telegram_oidc', {
        returnTo: input?.returnTo || '/platform/app', codeChallenge: await codeChallenge(verifier),
      });
      if (!result.ok) return result;
      const challenge = result.data.challenge || {};
      if (!/^[A-Za-z0-9_-]{43}$/.test(challenge.state || '') ||
          !/^[A-Za-z0-9_-]{43}$/.test(challenge.browserVerifier || '') ||
          !challenge.expiresAt || new Date(challenge.expiresAt).getTime() <= Date.now())
        return fail('CONTRACT_MISMATCH', 'Telegram Login javobi noto‘liq.');
      let url;
      try { url = new URL(challenge.redirectUrl); } catch (_) { return fail('CONTRACT_MISMATCH', 'Telegram Login manzili noto‘g‘ri.'); }
      const expectedRedirect = globalThis.location?.origin
        ? `${globalThis.location.origin}${globalThis.location.hostname === 'usmonovshaxrizod1-maker.github.io' ? '/ustore/web/' : '/auth/telegram/callback'}` : null;
      if (url.origin !== 'https://oauth.telegram.org' || url.pathname !== '/auth' ||
          url.searchParams.get('state') !== challenge.state || !url.searchParams.get('redirect_uri') ||
          (expectedRedirect && url.searchParams.get('redirect_uri') !== expectedRedirect))
        return fail('CONTRACT_MISMATCH', 'Telegram Login manzili noto‘g‘ri.');
      official.set({ state: challenge.state, browserVerifier: challenge.browserVerifier,
        codeVerifier: verifier, expiresAt: challenge.expiresAt });
      return ok({ redirectUrl: url.href });
    },
    async completeOfficialTelegramSignIn({ code, state }) {
      const pending = official.get();
      if (!pending || pending.state !== state || new Date(pending.expiresAt).getTime() <= Date.now()) {
        official.clear();
        return fail('SESSION_EXPIRED', 'Telegram orqali kirish muddati tugadi. Qayta urinib ko‘ring.');
      }
      official.clear(); // Authorization code is one-time, including on failed exchanges.
      const result = await request('exchange_telegram_oidc', { code, state,
        browserVerifier: pending.browserVerifier, codeVerifier: pending.codeVerifier });
      if (!result.ok) return result;
      tokenStore.set(result.data.session.token);
      return ok({ accountId: result.data.accountId, session: result.data.session, returnTo: result.data.returnTo });
    },
    hasPendingTelegramSignIn() {
      const challenge = challenges.get();
      return !!(challenge?.state && challenge?.browserVerifier);
    },
    async beginTelegramSignIn(input) {
      const result = await request('begin_telegram_sign_in', { returnTo: input?.returnTo || '/' });
      if (!result.ok) return result;
      const challenge = result.data.challenge || {};
      if (!challenge.state || !challenge.browserVerifier || !challenge.redirectUrl) return fail('CONTRACT_MISMATCH', 'Telegram challenge javobi noto‘liq.');
      challenges.set({ state: challenge.state, browserVerifier: challenge.browserVerifier, expiresAt: challenge.expiresAt });
      return ok({ redirectUrl: challenge.redirectUrl, expiresAt: challenge.expiresAt, pollAfterMs: challenge.pollAfterMs || 1200 });
    },
    async beginCredentialIssue(input) {
      const returnTo = String(input?.returnTo || '/');
      if (!returnTo.startsWith('/') || returnTo.startsWith('//') || returnTo.includes('\\')) return fail('VALIDATION_ERROR', 'Qaytish manzili noto‘g‘ri.');
      const result = await request('begin_credential_issue', { mode: input?.mode || 'ISSUE', returnTo });
      if (!result.ok) return result;
      if (!result.data.redirectUrl) return fail('CONTRACT_MISMATCH', 'Credential oqimi manzili kelmadi.');
      return ok({ redirectUrl: result.data.redirectUrl, returnTo: result.data.returnTo || returnTo });
    },
    async signOut() {
      const result = await request('sign_out', {}, { auth: true });
      if (result.ok) tokenStore.clear();
      return result.ok ? ok({ signedOut: true }) : result;
    },
    async listSessions() {
      const result = await request('list_sessions', {}, { auth: true });
      if (!result.ok) return result;
      if (!Array.isArray(result.data.sessions)) return fail('CONTRACT_MISMATCH', 'Sessiyalar javobi noto‘liq.');
      const items = result.data.sessions.map((row) => ({ ...row, current: row.id === result.data.currentSessionId }));
      return ok({ items, nextCursor: null, total: items.length });
    },
    async revokeSession(input) {
      const result = await request('revoke_session', { sessionId: input?.sessionId || '' }, { auth: true });
      return result.ok ? ok({ revoked: true }) : result;
    },
    async revokeAllSessions() {
      const result = await request('revoke_all_sessions', {}, { auth: true });
      if (result.ok) tokenStore.clear();
      return result.ok ? ok({ revokedCount: null }) : result;
    },
    async getTelegramSignInStatus() {
      const challenge = challenges.get();
      if (!challenge?.state || !challenge?.browserVerifier) return fail('VALIDATION_ERROR', 'Telegram challenge topilmadi.');
      const result = await request('get_telegram_sign_in_status', challenge);
      if (!result.ok) return result;
      if (['INVALID', 'EXPIRED', 'REJECTED', 'CONSUMED'].includes(result.data.challenge?.status)) challenges.clear();
      return ok(result.data.challenge);
    },
    async completeTelegramSignIn({ approvedAccountId, confirmed }) {
      const challenge = challenges.get();
      if (!challenge?.state || !challenge?.browserVerifier) return fail('VALIDATION_ERROR', 'Telegram challenge topilmadi.');
      if (confirmed !== true) return fail('VALIDATION_ERROR', 'Telegram profilini tasdiqlash kerak.');
      const result = await request('exchange_telegram_sign_in', { ...challenge, approvedAccountId, confirmed: true });
      if (!result.ok) return result;
      tokenStore.set(result.data.session?.token || '');
      challenges.clear();
      return ok({ accountId: result.data.accountId, session: result.data.session, returnTo: result.data.returnTo });
    },
    async beginOriginHandoff(input) {
      const result = await request('begin_origin_handoff', { returnTo: input?.returnTo || '/', codeChallenge: input?.codeChallenge || '' });
      if (!result.ok) return result;
      const handoff = result.data.handoff || {};
      if (!handoff.state || !handoff.authorizeUrl || !handoff.expiresAt) return fail('CONTRACT_MISMATCH', 'Origin handoff javobi noto‘liq.');
      return ok(handoff);
    },
    async getOriginHandoff(input) {
      const result = await request('get_origin_handoff', { state: input?.state || '' });
      return result.ok ? ok(result.data.handoff || {}) : result;
    },
    async authorizeOriginHandoff(input) {
      const result = await request('authorize_origin_handoff', { state: input?.state || '' }, { auth: true });
      if (!result.ok) return result;
      if (!result.data.redirectUrl) return fail('CONTRACT_MISMATCH', 'Origin handoff redirect manzili kelmadi.');
      return ok({ redirectUrl: result.data.redirectUrl, expiresAt: result.data.expiresAt, targetOrigin: result.data.targetOrigin });
    },
    async exchangeOriginHandoff(input) {
      const result = await request('exchange_origin_handoff', {
        state: input?.state || '', code: input?.code || '', codeVerifier: input?.codeVerifier || '',
      });
      if (!result.ok) return result;
      const token = result.data.session?.token || '';
      if (!token) return fail('CONTRACT_MISMATCH', 'Origin handoff session tokeni kelmadi.');
      tokenStore.set(token);
      return ok({ accountId: result.data.accountId, session: result.data.session, returnTo: result.data.returnTo, shopId: result.data.shopId });
    },
    async getCredentialsStatus() { return request('get_credentials_status', {}, { auth: true }); },
    async changeLogin(input) { return request('change_login', { login: input?.login || '' }, { auth: true }); },
    async changePassword(input) {
      const result = await request('change_password', input || {}, { auth: true });
      if (result.ok) tokenStore.clear();
      return result;
    },
  };
  // Runtime consumes this adapter directly too; storage failures must remain
  // Result errors so controller busy states can settle without exposing secrets.
  const guarded = Object.fromEntries(Object.entries(adapter).map(([name, fn]) => [name, async (...args) => {
    const invoke = async () => {
      try { return await fn(...args); }
      catch (_) { return fail('CAPABILITY_UNAVAILABLE', 'Kirish ma’lumotlarini saqlab bo‘lmadi. Qayta urinib ko‘ring.'); }
    };
    if (name !== 'getSession') return invoke();
    if (!sessionRequest) sessionRequest = invoke().finally(() => { sessionRequest = null; });
    return sessionRequest;
  }]));
  return Object.freeze(guarded);
}
