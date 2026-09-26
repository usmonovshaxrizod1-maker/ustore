import { fail, ok, STABLE_ERROR_CODES } from '../ports/result.js';

const ERROR_SET = new Set(STABLE_ERROR_CODES);
function safeEndpoint(value) {
  const url = new URL(String(value || ''));
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) throw new Error('shop-api endpoint HTTPS bo‘lishi kerak.');
  return url.href;
}
function mapServerError(body, status) {
  const raw = String(typeof body?.error === 'string' ? body.error : body?.error?.code || '').toLowerCase();
  const code = status === 401 || raw === 'auth_required' || raw === 'session_expired' ? (raw === 'auth_required' ? 'AUTH_REQUIRED' : 'SESSION_EXPIRED')
    : status === 403 || raw === 'forbidden' || raw === 'account_disabled' ? 'FORBIDDEN'
      : status === 404 || raw.endsWith('_not_found') ? 'NOT_FOUND'
        : status === 409 || raw.includes('conflict') || raw.includes('not_allowed') || raw.includes('invalid_status_transition') || raw === 'ticket_closed' ? 'CONFLICT'
          : status === 400 || raw.startsWith('invalid_') || raw === 'legal_consent_required' ? 'VALIDATION_ERROR'
            : ERROR_SET.has(String(body?.error)) ? String(body.error) : 'NETWORK_ERROR';
  const defaults = {
    AUTH_REQUIRED: 'Kirish talab qilinadi.', SESSION_EXPIRED: 'Sessiya tugagan. Qayta kiring.', FORBIDDEN: 'Bu amal uchun ruxsat yo‘q.',
    NOT_FOUND: 'Ma’lumot topilmadi.', CONFLICT: 'Amal joriy holat bilan mos kelmadi.', VALIDATION_ERROR: 'Kiritilgan ma’lumotni tekshiring.', NETWORK_ERROR: 'Shop API so‘rovi bajarilmadi.',
  };
  return fail(code, body?.message || defaults[code] || defaults.NETWORK_ERROR, { retryable: code === 'NETWORK_ERROR' });
}
function lineKey(line = {}) {
  if (line.bundleId) return `bundle:${line.bundleId}`;
  return `product:${line.productId}|${line.size || ''}|${line.color || ''}`;
}
function normalizeCart(cart, shopId) {
  const lines = Array.isArray(cart?.lines) ? cart.lines.map((row) => ({ ...row, lineKey: row.lineKey || lineKey(row), quantity: Math.max(0, Number(row.quantity ?? row.qty) || 0) })).filter((row) => row.quantity > 0) : [];
  return { shopId: String(cart?.shopId || shopId || ''), currency: cart?.currency || 'UZS', lines, updatedAt: cart?.updatedAt || null };
}

export function createLiveShopPrivateAdapters({ endpoint, botId, fetchImpl = globalThis.fetch, tokenStore, storageClient = null } = {}) {
  const url = safeEndpoint(endpoint);
  const locator = String(botId || '').trim();
  if (!/^\d+$/.test(locator)) throw new TypeError('botId raqam bo‘lishi kerak');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch kerak');
  if (!tokenStore?.get) throw new TypeError('tokenStore kerak');

  async function request(action, payload = {}) {
    const token = tokenStore.get();
    if (!token) return fail('AUTH_REQUIRED', 'Kirish talab qilinadi.');
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST', credentials: 'omit',
        headers: { 'content-type': 'application/json', authorization: `UStoreSession ${token}` },
        body: JSON.stringify({ action, payload, clientMode: 'web', botId: locator }),
      });
    } catch (_) { return fail('NETWORK_ERROR', 'Shop serveriga ulanib bo‘lmadi.', { retryable: true }); }
    let body = null;
    try { body = await response.json(); } catch (_) {}
    if (tokenStore.get() !== token) return fail('SESSION_EXPIRED', 'Kirish holati o‘zgardi. Sahifani qayta oching.');
    if (!response.ok || body?.error) return mapServerError(body, response.status);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('CONTRACT_MISMATCH', 'Shop API javobi noto‘liq.');
    const required = action.startsWith('web_cart_') && action !== 'web_cart_clear' ? 'cart'
      : ['web_order_create','web_order_get','web_order_cancel','web_order_confirm_received'].includes(action) ? 'order'
      : action.startsWith('web_payment_') ? 'payment' : action === 'web_support_send' ? 'message' : null;
    if (required && (!body[required] || typeof body[required] !== 'object' || Array.isArray(body[required]))) return fail('CONTRACT_MISMATCH', 'Shop API javobi noto‘liq.');
    if (['order','message'].includes(required) && !body[required].id) return fail('CONTRACT_MISMATCH', 'Server identifikatorni qaytarmadi.');
    if (required === 'cart' && !Array.isArray(body.cart.lines)) return fail('CONTRACT_MISMATCH', 'Savatcha qatorlari kelmadi.');
    if (required === 'payment' && typeof body.payment.status !== 'string') return fail('CONTRACT_MISMATCH', 'To‘lov holati kelmadi.');
    if (body?.webSession?.replacementToken && tokenStore?.set) tokenStore.set(body.webSession.replacementToken);
    return ok(body || {});
  }

  const uncertain=new Map();
  async function mutateCart(operation,line={}) {
    const signature=JSON.stringify({operation,line});
    const mutationId=uncertain.get(signature)||globalThis.crypto.randomUUID();
    uncertain.set(signature,mutationId);
    const result=await request('web_cart_mutate',{operation,line,mutationId});
    if(result.ok||result.error?.code!=='NETWORK_ERROR')uncertain.delete(signature);
    return result.ok?ok(normalizeCart(result.data.cart,result.data.cart?.shopId)):result;
  }

  return Object.freeze({
    cart: {
      async load() {
        const result = await request('web_cart_load');
        return result.ok ? ok(normalizeCart(result.data.cart, result.data.cart?.shopId)) : result;
      },
      async mergeGuest(input) {
        if (!input?.guestCart || typeof input.guestCart !== 'object') return fail('VALIDATION_ERROR', 'Guest savatchasi noto‘g‘ri.');
        const idempotencyKey = String(input.idempotencyKey || input.guestCart.mergeKey || '').trim();
        if (idempotencyKey.length < 16 || idempotencyKey.length > 200) return fail('VALIDATION_ERROR', 'Guest savat merge kaliti noto‘g‘ri.');
        const result = await request('web_cart_merge_guest', { cart: normalizeCart(input.guestCart, input.guestCart.shopId), idempotencyKey });
        return result.ok ? ok(normalizeCart(result.data.cart, result.data.cart?.shopId)) : result;
      },
      async updateLine(input) {
        if (!input?.lineKey || !Number.isInteger(input.quantity) || input.quantity < 0 || input.quantity > 99) return fail('VALIDATION_ERROR', 'Savat qatori noto‘g‘ri.');
        return mutateCart('set',{lineKey:input.lineKey,quantity:input.quantity});
      },
      async addLine(input) {
        const productId = String(input?.productId || '').trim();
        const bundleId = String(input?.bundleId || '').trim();
        const quantity = Math.trunc(Number(input?.quantity ?? input?.qty ?? 1));
        if ((!productId && !bundleId) || (productId && bundleId) || !Number.isInteger(quantity) || quantity <= 0 || quantity > 99) {
          return fail('VALIDATION_ERROR', 'Savatga qo‘shiladigan qator noto‘g‘ri.');
        }
        const nextLine = {
          ...(bundleId ? { bundleId } : { productId }),
          quantity,
          size: input?.size == null ? null : String(input.size),
          color: input?.color == null ? null : String(input.color),
          variantId: input?.variantId == null ? null : String(input.variantId),
        };
        nextLine.lineKey = lineKey(nextLine);
        return mutateCart('add',nextLine);
      },
      async clear() {
        const result = await mutateCart('clear');
        return result.ok ? ok({ cleared: true }) : result;
      },
      async quote(input = {}) {
        const cart = normalizeCart(input.cart || {}, input.cart?.shopId || locator);
        const payload = { cart };
        if (Object.prototype.hasOwnProperty.call(input, 'promoCode')) payload.promoCode = input.promoCode == null ? null : String(input.promoCode).trim();
        if (input.deliverySelection?.id) payload.deliverySelection = { id: String(input.deliverySelection.id) };
        const result = await request('web_checkout_quote', payload);
        if (!result.ok) return result;
        const quote = { ...result.data }; delete quote.webSession;
        return ok(quote);
      },
    },
    orders: {
      async create(input = {}) {
        if (!input.checkout || !input.idempotencyKey) return fail('VALIDATION_ERROR', 'Checkout va idempotency key kerak.');
        const result = await request('web_order_create', { checkout: input.checkout, idempotencyKey: String(input.idempotencyKey) });
        return result.ok ? ok(result.data.order) : result;
      },
      async listMine(input = {}) {
        const result = await request('web_orders_list', { cursor: input.cursor || null });
        return result.ok ? ok({ items: result.data.items || [], nextCursor: result.data.nextCursor ?? null, total: result.data.total ?? (result.data.items || []).length }) : result;
      },
      async getMine(input) {
        if (!input?.orderId) return fail('VALIDATION_ERROR', 'Order ID kerak.');
        const result = await request('web_order_get', { orderId: input.orderId });
        return result.ok ? ok(result.data.order) : result;
      },
      async cancelMine(input) {
        if (!input?.orderId) return fail('VALIDATION_ERROR', 'Order ID kerak.');
        const result = await request('web_order_cancel', { orderId: input.orderId, reason: input.reason || null });
        return result.ok ? ok(result.data.order) : result;
      },
      async confirmReceived(input) {
        if (!input?.orderId) return fail('VALIDATION_ERROR', 'Order ID kerak.');
        const result = await request('web_order_confirm_received', { orderId: input.orderId });
        return result.ok ? ok(result.data.order) : result;
      },
    },
    payments: {
      async start(input = {}) {
        if (!input.orderId || !input.method || !input.idempotencyKey) return fail('VALIDATION_ERROR', 'Payment request noto‘liq.');
        const result = await request('web_payment_start', { orderId: input.orderId, method: input.method, idempotencyKey: String(input.idempotencyKey) });
        return result.ok ? ok(result.data.payment) : result;
      },
      async getStatus(input = {}) {
        if (!input.orderId) return fail('VALIDATION_ERROR', 'Order ID kerak.');
        const result = await request('web_payment_status', { orderId: input.orderId });
        return result.ok ? ok(result.data.payment) : result;
      },
    },
    profile: {
      async get() {
        const result = await request('web_profile_get');
        return result.ok ? ok({ account: result.data.account, shopProfile: result.data.shopProfile, actor: result.data.actor }) : result;
      },
      async update(input) {
        if (!input?.patch || typeof input.patch !== 'object' || Array.isArray(input.patch)) return fail('VALIDATION_ERROR', 'Profil patch noto‘g‘ri.');
        const result = await request('web_profile_update', { patch: input.patch });
        return result.ok ? ok({ account: result.data.account, shopProfile: result.data.shopProfile }) : result;
      },
      async listFavorites() {
        const result = await request('web_favorites_list');
        return result.ok ? ok({ items: result.data.items || [], nextCursor: null, total: result.data.total ?? (result.data.items || []).length }) : result;
      },
      async setFavorite(input) {
        if (!input?.productId || typeof input.favorite !== 'boolean') return fail('VALIDATION_ERROR', 'Favorite ma’lumoti noto‘g‘ri.');
        const result = await request('web_favorite_set', input);
        return result.ok ? ok({ favorite: result.data.favorite === true }) : result;
      },
    },
    support: {
      async listThreads() {
        const result = await request('web_support_list');
        return result.ok ? ok({ items: result.data.items || [], nextCursor: null, total: result.data.total ?? (result.data.items || []).length }) : result;
      },
      async getMessages(input) {
        if (!input?.threadId) return fail('VALIDATION_ERROR', 'Thread ID kerak.');
        const result = await request('web_support_messages', { threadId: input.threadId, cursor: input.cursor || null });
        return result.ok ? ok({ items: result.data.items || [], nextCursor: null, total: result.data.total ?? (result.data.items || []).length }) : result;
      },
      async sendMessage(input) {
        if (!input?.clientMessageId || (!input.text && !input.attachment)) return fail('VALIDATION_ERROR', 'Xabar yoki attachment va clientMessageId kerak.');
        const result = await request('web_support_send', { threadId: input.threadId || null, text: input.text || null, attachment: input.attachment || null, clientMessageId: input.clientMessageId });
        return result.ok ? ok(result.data.message) : result;
      },
      async uploadAttachment(input) {
        const file = input?.file;
        if (!file) return fail('VALIDATION_ERROR', 'Fayl kerak.');
        if (!storageClient?.uploadToSignedUrl) return fail('CAPABILITY_UNAVAILABLE', 'Private storage upload adapter ulanmagan.');
        const prepare = await request('web_support_upload_prepare', { mimeType: file.type, size: file.size, name: file.name });
        if (!prepare.ok) return prepare;
        try {
          const upload = await storageClient.uploadToSignedUrl(prepare.data.bucket, prepare.data.path, prepare.data.token, file);
          if (upload?.error) return fail('NETWORK_ERROR', 'Faylni yuklab bo‘lmadi.', { retryable: true });
        } catch (_) { return fail('NETWORK_ERROR', 'Faylni yuklab bo‘lmadi.', { retryable: true }); }
        return ok({ attachment: { path: prepare.data.path, mimeType: file.type, name: file.name, size: file.size, visibility: 'PRIVATE' } });
      },
    },
  });
}
