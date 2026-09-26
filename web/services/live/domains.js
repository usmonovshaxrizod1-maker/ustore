import { ok, fail, STABLE_ERROR_CODES } from '../ports/result.js';

export function createLiveDomainsAdapter({ endpoint, botId, tokenStore, fetchImpl = globalThis.fetch } = {}) {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) throw new TypeError('HTTPS endpoint kerak');
  if (!/^\d+$/.test(String(botId || '')) || !tokenStore?.get || typeof fetchImpl !== 'function') throw new TypeError('Domain adapter konfiguratsiyasi noto‘liq');
  async function request(action, payload = {}) {
    const token = tokenStore.get();
    if (!token) return fail('AUTH_REQUIRED', 'Kirish talab qilinadi.');
    try {
      const response = await fetchImpl(url.href, { method: 'POST', credentials: 'omit',
        headers: { 'content-type': 'application/json', authorization: `UStoreSession ${token}` },
        body: JSON.stringify({ action, payload, botId: String(botId), clientMode: 'web' }) });
      const data = await response.json();
      if (tokenStore.get() !== token) return fail('SESSION_EXPIRED', 'Kirish holati o‘zgardi.');
      if (!response.ok || data?.error) {
        const code = STABLE_ERROR_CODES.includes(data?.error) ? data.error : response.status === 401 ? 'SESSION_EXPIRED' : response.status === 403 ? 'FORBIDDEN' : 'NETWORK_ERROR';
        return fail(code, 'Domen amali bajarilmadi.', { retryable: code === 'NETWORK_ERROR' });
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) return fail('CONTRACT_MISMATCH', 'Domen javobi noto‘liq.');
      const valid = action === 'domains_list' ? Array.isArray(data.items)
        : action === 'domains_remove' ? data.removed === true
        : action.includes('mini_app_target') ? data.target && typeof data.target === 'object' && !Array.isArray(data.target)
        : data.domain && typeof data.domain === 'object' && !Array.isArray(data.domain) && typeof data.domain.id === 'string';
      if (!valid) return fail('CONTRACT_MISMATCH', 'Domen javobi noto‘liq.');
      return ok(data);
    } catch (_) { return fail('NETWORK_ERROR', 'Serverga ulanib bo‘lmadi.', { retryable: true }); }
  }
  async function domain(action, input) {
    const result = await request(action, input);
    return result.ok ? ok(result.data.domain) : result;
  }
  return Object.freeze({
    async list() { const r = await request('domains_list'); return r.ok ? ok(r.data.items) : r; },
    add: input => domain('domains_add', { hostname: input?.hostname }),
    reserveSlug: input => domain('domains_reserve_slug', { slug: input?.slug }),
    verify: input => domain('domains_verify', { domainId: input?.domainId }),
    setPrimary: input => domain('domains_set_primary', { domainId: input?.domainId }),
    async remove(input) { return request('domains_remove', { domainId: input?.domainId }); },
    async getMiniAppTarget() { const r = await request('domains_get_mini_app_target'); return r.ok ? ok(r.data.target) : r; },
    async setMiniAppTarget(input = {}) { const r = await request('domains_set_mini_app_target', { domainId: input?.domainId || null, confirm: input?.confirm === true }); return r.ok ? ok(r.data.target) : r; },
  });
}
