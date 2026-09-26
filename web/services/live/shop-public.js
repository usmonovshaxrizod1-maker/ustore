import { fail, ok, STABLE_ERROR_CODES } from '../ports/result.js';
import { validateContext } from '../ports/context.js';
import { toPage } from '../ports/catalog.js';

const ERROR_SET = new Set(STABLE_ERROR_CODES);
function safeEndpoint(value) {
  const url = new URL(String(value || ''));
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) throw new Error('shop-api endpoint HTTPS bo‘lishi kerak.');
  return url.href;
}
function normalizedText(value) { return String(value || '').toLocaleLowerCase('uz-UZ').trim(); }
function normalizedError(body, status) {
  const raw = typeof body?.error === 'string' ? body.error : body?.error?.code;
  const mapped = raw === 'session_expired' || status === 401 ? 'SESSION_EXPIRED'
    : raw === 'shop_frozen' || raw === 'shop_disabled' || raw === 'shop_terminated' ? 'SHOP_UNAVAILABLE'
      : ERROR_SET.has(raw) ? raw : 'NETWORK_ERROR';
  return fail(mapped, body?.error?.message || (mapped === 'SHOP_UNAVAILABLE' ? 'Do‘kon hozir mavjud emas.' : 'Shop API so‘rovi bajarilmadi.'), { retryable: mapped === 'NETWORK_ERROR' });
}

export function createLiveShopPublicAdapters({ endpoint, botId, fetchImpl = globalThis.fetch, tokenStore = null } = {}) {
  const url = safeEndpoint(endpoint);
  const locator = String(botId || '').trim();
  if (!/^\d+$/.test(locator)) throw new TypeError('botId raqam bo‘lishi kerak');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch kerak');

  async function request(action) {
    const headers = { 'content-type': 'application/json' };
    const token = tokenStore?.get?.();
    if (token) headers.authorization = `UStoreSession ${token}`;
    let response;
    try {
      response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify({ action, clientMode: 'web', botId: locator }), credentials: 'omit' });
    } catch (_) {
      return fail('NETWORK_ERROR', 'Shop serveriga ulanib bo‘lmadi.', { retryable: true });
    }
    let body = null;
    try { body = await response.json(); } catch (_) {}
    if (!response.ok || body?.error) return normalizedError(body, response.status);
    if (body?.webSession?.replacementToken && tokenStore?.set) tokenStore.set(body.webSession.replacementToken);
    return ok(body || {});
  }

  async function catalogData() {
    const result = await request('get_catalog');
    if (!result.ok) return result;
    return ok({ products: Array.isArray(result.data.products) ? result.data.products : [], categories: Array.isArray(result.data.categories) ? result.data.categories : [] });
  }

  return Object.freeze({
    context: {
      async resolve() {
        const result = await request('boot');
        if (!result.ok) return result;
        const body = result.data;
        const context = {
          mode: 'web',
          shop: {
            id: String(body.shop?.id || ''), slug: String(body.shop?.slug || ''), name: String(body.shopContact?.name || 'UStorE'),
            logoUrl: body.logoUrl || null, lifecycle: body.shop?.lifecycle || 'ACTIVE', currency: body.shop?.currency || 'UZS', canonicalWebUrl: body.shop?.canonicalWebUrl || null,
          },
          actor: body.webSession?.actor || null,
          capabilities: { publicCatalog: true, authenticatedSession: body.webSession?.authenticated === true },
        };
        const invalid = validateContext(context);
        return invalid || ok(context);
      },
    },
    catalog: {
      async listCategories(input = {}) {
        const result = await catalogData(); if (!result.ok) return result;
        const parentId = input.parentId ?? null;
        const items = result.data.categories.filter((row) => (row.parent_id ?? null) === parentId);
        return ok(toPage(items, null, items.length));
      },
      async listProducts(input = {}) {
        const result = await catalogData(); if (!result.ok) return result;
        let items = result.data.products;
        if (input.categoryId) items = items.filter((row) => row.category_id === input.categoryId);
        return ok(toPage(items, null, items.length));
      },
      async getProduct(input = {}) {
        if (!input.productId) return fail('VALIDATION_ERROR', 'Product ID kerak.');
        const result = await catalogData(); if (!result.ok) return result;
        const product = result.data.products.find((row) => row.id === input.productId);
        return product ? ok(product) : fail('NOT_FOUND', 'Mahsulot topilmadi.');
      },
      async search(input = {}) {
        const query = normalizedText(input.query);
        if (!query) return fail('VALIDATION_ERROR', 'Qidiruv matnini kiriting.');
        const result = await catalogData(); if (!result.ok) return result;
        const items = result.data.products.filter((row) => [row.name,row.name_ru,row.sku,row.description,row.description_ru].some((value) => normalizedText(value).includes(query)));
        return ok(toPage(items, null, items.length));
      },
    },
  });
}
