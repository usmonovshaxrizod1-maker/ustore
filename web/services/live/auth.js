import { fail, ok, STABLE_ERROR_CODES } from '../ports/result.js';

const ERROR_SET = new Set(STABLE_ERROR_CODES);
const CHALLENGE_KEY = 'ustore:web:telegram-challenge:v1';
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

export function createLiveAuthAdapter({ endpoint, fetchImpl = globalThis.fetch, tokenStore = createMemoryTokenStore(), challengeStore = null } = {}) {
  const url = safeEndpoint(endpoint);
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch kerak');
  const challenges = challengeStore || { get: () => null, set: () => {}, clear: () => {} };

  let signInGeneration = 0;
  let sessionRequest = null;
  async function request(action, payload = {}, { auth = false } = {}) {
    const tokenAtStart = tokenStore.get();
    const producesSession = ['sign_in_password','exchange_telegram_sign_in','exchange_origin_handoff'].includes(action);
    const generation = producesSession ? ++signInGeneration : signInGeneration;
    if (['sign_out','revoke_all_sessions','change_password'].includes(action)) ++signInGeneration;
    const headers = { 'content-type': 'application/json' };
    if (auth) {
      const token = tokenStore.get();
      if (!token) return fail('AUTH_REQUIRED', 'Kirish talab qilinadi.');
      headers.authorization = `UStoreSession ${token}`;
    }
    let response;
    try {
      response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify({ action, payload }), credentials: 'omit' });
    } catch (_) {
      return fail('NETWORK_ERROR', 'Auth serveriga ulanib bo‘lmadi.', { retryable: true });
    }
    let body = null;
    try { body = await response.json(); } catch (_) {}
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
      return ok({ actor: result.data.actor || null, accountId: result.data.accountId, session: result.data.session });
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
