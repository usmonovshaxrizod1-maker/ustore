import { fail, ok, STABLE_ERROR_CODES } from '../ports/result.js';

const ERROR_SET = new Set(STABLE_ERROR_CODES);

function safeEndpoint(value) {
  const url = new URL(String(value || ''));
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) throw new Error('platform-api endpoint HTTPS bo‘lishi kerak.');
  return url.href;
}

function normalizeError(body, status) {
  const raw = String(typeof body?.error === 'string' ? body.error : body?.error?.code || '').toLowerCase();
  const code = status === 401 || raw === 'session_expired' || raw.startsWith('auth_failed:')
    ? 'SESSION_EXPIRED'
    : status === 403 || raw.startsWith('forbidden:')
      ? 'FORBIDDEN'
      : status === 404 || raw.endsWith('_not_found')
        ? 'NOT_FOUND'
        : status === 409 || raw.includes('conflict') || raw.includes('already_') || raw.includes('not_pending')
          ? 'CONFLICT'
          : status === 429 || raw.includes('rate_limit')
            ? 'RATE_LIMITED'
            : status === 400 || raw.startsWith('invalid_') || raw.endsWith('_required')
              ? 'VALIDATION_ERROR'
              : ERROR_SET.has(String(body?.error)) ? String(body.error) : 'NETWORK_ERROR';
  return fail(code, code === 'FORBIDDEN' ? 'Bu platforma amali uchun ruxsat yo‘q.' : code === 'SESSION_EXPIRED' ? 'Sessiya tugagan. Qayta kiring.' : 'Platforma so‘rovi bajarilmadi.', { retryable: code === 'NETWORK_ERROR' });
}

const PUBLIC_PLATFORM_ACTIONS = new Set(['platform_public_catalog']);

export function createLivePlatformAdapter({ endpoint, tokenStore, fetchImpl = globalThis.fetch } = {}) {
  const url = safeEndpoint(endpoint);
  if (!tokenStore?.get) throw new TypeError('tokenStore kerak');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch kerak');

  return Object.freeze({
    async invoke(action, payload = {}, options = {}) {
      const actionName = String(action || '');
      if (!actionName.startsWith('platform_')) return fail('VALIDATION_ERROR', 'Platform action noto‘g‘ri.');
      const isPublic = PUBLIC_PLATFORM_ACTIONS.has(actionName);
      const token = String(tokenStore.get() || '');
      if (!isPublic && !token) return fail('AUTH_REQUIRED', 'Kirish talab qilinadi.');
      const headers = { 'content-type': 'application/json' };
      if (!isPublic) headers.authorization = `UStoreSession ${token}`;
      if (options?.requestId) headers['x-request-id'] = String(options.requestId).slice(0, 120);
      let response;
      try {
        response = await fetchImpl(url, {
          method: 'POST', headers, credentials: 'omit',
          body: JSON.stringify({ action: actionName, payload, clientMode: isPublic ? 'public' : 'web' }),
        });
      } catch (_) {
        return fail('NETWORK_ERROR', 'Platform serveriga ulanib bo‘lmadi.', { retryable: true });
      }
      let body = null;
      try { body = await response.json(); } catch (_) {}
      if (!isPublic && String(tokenStore.get() || '') !== token) return fail('SESSION_EXPIRED', 'Kirish holati o‘zgardi.');
      if (!response.ok || body?.error) return normalizeError(body, response.status);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('CONTRACT_MISMATCH', 'Server javobi noto‘g‘ri.');
      return ok(body || {});
    },
  });
}
