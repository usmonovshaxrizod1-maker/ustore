import { fail, ok } from '../ports/result.js';

function safeEndpoint(value) {
  const url = new URL(String(value || ''));
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) throw new Error('shop-api endpoint HTTPS bo‘lishi kerak.');
  return url.href;
}

function cleanBotId(value) {
  const text = String(value || '').trim();
  return /^\d+$/.test(text) ? text : null;
}

export function botIdFromLocation(locationRef = globalThis.location) {
  try {
    const url = new URL(locationRef?.href || String(locationRef || ''));
    return cleanBotId(url.searchParams.get('bot_id'));
  } catch (_) { return null; }
}

export function createLiveTenantResolver({ endpoint, fetchImpl = globalThis.fetch, botIdHosts = [] } = {}) {
  const url = safeEndpoint(endpoint);
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch kerak');

  return Object.freeze({
    async resolve({ locationRef = globalThis.location, botId = null } = {}) {
      const explicit = cleanBotId(botId) || botIdFromLocation(locationRef);
      const hostname = String(locationRef?.hostname || '').trim().toLowerCase().replace(/\.$/, '');
      // Only explicit shared hosting roots may route by query. A custom domain
      // always resolves its registered shop, even when a foreign bot_id is added.
      const sharedHost = ['localhost','127.0.0.1','[::1]',...botIdHosts].includes(hostname);
      if (explicit && sharedHost) return ok({ botId: explicit, source: 'BOT_ID' });
      if (!hostname) return fail('VALIDATION_ERROR', 'Do‘kon manzili aniqlanmadi.');
      let response;
      try {
        response = await fetchImpl(url, {
          method: 'POST', credentials: 'omit',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'resolve_web_tenant', clientMode: 'web', payload: { hostname } }),
        });
      } catch (_) {
        return fail('NETWORK_ERROR', 'Do‘kon manzilini tekshirib bo‘lmadi.', { retryable: true });
      }
      let body = null;
      try { body = await response.json(); } catch (_) {}
      if (!response.ok || body?.error) {
        const code = response.status === 404 ? 'SHOP_UNAVAILABLE'
          : response.status === 400 ? 'VALIDATION_ERROR'
            : response.status === 403 ? 'FORBIDDEN' : 'NETWORK_ERROR';
        return fail(code, code === 'SHOP_UNAVAILABLE' ? 'Bu domen faol do‘konga ulanmagan.' : 'Do‘kon manzilini aniqlab bo‘lmadi.', { retryable: code === 'NETWORK_ERROR' });
      }
      const tenant = body?.tenant;
      const resolvedBotId = cleanBotId(tenant?.botId);
      if (!resolvedBotId || !tenant?.shopId || String(tenant?.hostname || '').toLowerCase() !== hostname) {
        return fail('CONTRACT_MISMATCH', 'Tenant resolver javobi noto‘liq.');
      }
      if (explicit && explicit !== resolvedBotId) return fail('FORBIDDEN', 'Bu havola boshqa do‘konga tegishli.');
      return ok({ ...tenant, botId: resolvedBotId, source: 'HOSTNAME' });
    },
  });
}
