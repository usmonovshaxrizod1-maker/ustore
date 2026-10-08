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
    : raw === 'not_found' || status === 404 ? 'NOT_FOUND'
    : raw === 'shop_frozen' || raw === 'shop_disabled' || raw === 'shop_terminated' ? 'SHOP_UNAVAILABLE'
      : ERROR_SET.has(raw) ? raw : 'NETWORK_ERROR';
  return fail(mapped, body?.error?.message || (mapped === 'SHOP_UNAVAILABLE' ? 'Do‘kon hozir mavjud emas.' : 'Shop API so‘rovi bajarilmadi.'), { retryable: mapped === 'NETWORK_ERROR' });
}

export function createLiveShopPublicAdapters({ endpoint, botId, fetchImpl = globalThis.fetch, tokenStore = null } = {}) {
  const url = safeEndpoint(endpoint);
  const locator = String(botId || '').trim();
  if (!/^\d+$/.test(locator)) throw new TypeError('botId raqam bo‘lishi kerak');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch kerak');
  let guestBootCache = null;

  async function request(action, payload = {}) {
    const headers = { 'content-type': 'application/json' };
    const token = tokenStore?.get?.();
    if (token) headers.authorization = `UStoreSession ${token}`;
    let response;
    try {
      response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify({ action, payload, clientMode: 'web', botId: locator }), credentials: 'omit' });
    } catch (_) {
      return fail('NETWORK_ERROR', 'Shop serveriga ulanib bo‘lmadi.', { retryable: true });
    }
    let body = null;
    try { body = await response.json(); } catch (_) {}
    if (!response.ok || body?.error) return normalizedError(body, response.status);
    if (body?.webSession?.replacementToken && tokenStore?.set) tokenStore.set(body.webSession.replacementToken);
    return ok(body || {});
  }

  let catalogInflight = null;
  async function fetchCatalogData() {
    const result = await request('get_catalog');
    if (!result.ok) return result;
    return ok({ products: Array.isArray(result.data.products) ? result.data.products : [], categories: Array.isArray(result.data.categories) ? result.data.categories : [] });
  }
  function catalogData() {
    if (catalogInflight) return catalogInflight;
    const pending = fetchCatalogData();
    catalogInflight = pending;
    const clear = () => { if (catalogInflight === pending) catalogInflight = null; };
    void pending.then(clear, clear);
    return pending;
  }

  async function bundleData() {
    const result = await request('get_web_bundles');
    if (!result.ok) return result;
    return ok({ bundles: Array.isArray(result.data.bundles) ? result.data.bundles : [] });
  }

  return Object.freeze({
    takeGuestBoot() {
      if (tokenStore?.get?.()) return null;
      const cached = guestBootCache;
      guestBootCache = null;
      return cached && Date.now() - cached.at < 30000 ? cached.data : null;
    },
    context: {
      async resolve() {
        const result = await request('boot');
        if (!result.ok) return result;
        const body = result.data;
        const { webSession, ...frameBoot } = body;
        // The public web boot has no legacy Mini App admin fields. Only guests
        // may reuse it; signed-in frames must request their authorized boot.
        guestBootCache = !tokenStore?.get?.() && webSession?.authenticated !== true
          ? { at: Date.now(), data: frameBoot } : null;
        const context = {
          mode: 'web',
          shop: {
            id: String(body.shop?.id || ''), slug: String(body.shop?.slug || ''), name: String(body.shopContact?.name || 'UStorE'),
            logoUrl: body.logoUrl || null, lifecycle: body.shop?.lifecycle || 'ACTIVE', currency: body.shop?.currency || 'UZS', canonicalWebUrl: body.shop?.canonicalWebUrl || null,
          },
          actor: body.webSession?.actor || null,
          marketing: {
            activeBanners: Array.isArray(body.activeBanners) ? body.activeBanners : [],
            featuredCategories: Array.isArray(body.featuredCategories) ? body.featuredCategories : [],
          },
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
        const items = result.data.categories.filter((row) => input.all === true || (row.parent_id ?? null) === parentId);
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
      async listBundles() {
        const result = await bundleData(); if (!result.ok) return result;
        return ok(toPage(result.data.bundles, null, result.data.bundles.length));
      },
      async getBundle(input = {}) {
        if (!input.bundleId) return fail('VALIDATION_ERROR', 'Bundle ID kerak.');
        const result = await bundleData(); if (!result.ok) return result;
        const bundle = result.data.bundles.find((row) => String(row.id) === String(input.bundleId));
        return bundle ? ok(bundle) : fail('NOT_FOUND', 'Aksiya topilmadi.');
      },
      async getPromotion(input = {}) {
        if (!input.promotionId) return fail('VALIDATION_ERROR', 'Aksiya ID kerak.');
        const result = await request('get_web_promotion', { promotionId: input.promotionId });
        return result.ok ? ok(result.data.promotion) : result;
      },
      async listPromotions() {
        const result = await request('get_web_promotions');
        if (!result.ok) return result;
        const items = Array.isArray(result.data.promotions) ? result.data.promotions : [];
        return ok(toPage(items, null, items.length));
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
