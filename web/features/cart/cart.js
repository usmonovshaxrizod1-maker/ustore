import { createButton, createStatePanel, createTextField } from '../../components/ui.js';
import { findVariant, variantDisplayImage, variantPrice } from '../product/variant-model.js';

const MAX_QUANTITY = 99;

function makeGuestMergeKey() {
  const id = globalThis.crypto?.randomUUID?.();
  if (id) return `guest:${id}`;
  const bytes = new Uint8Array(24);
  if (!globalThis.crypto?.getRandomValues) throw new Error('Secure guest merge key generator unavailable');
  globalThis.crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  if (!token) throw new Error('Secure guest merge key generator unavailable');
  return `guest:${token}`;
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

export function guestCartStorageKey(shopId) {
  const id = String(shopId || '').trim();
  if (!id) throw new Error('shopId kerak');
  return `ustore:web:guest-cart:v1:${encodeURIComponent(id)}`;
}

export function createGuestCartStore(storage = globalThis.localStorage) {
  if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) throw new TypeError('storage kerak');
  return Object.freeze({
    load(shopId) {
      try {
        const value = JSON.parse(storage.getItem(guestCartStorageKey(shopId)) || 'null');
        return value && value.shopId === shopId && Array.isArray(value.lines) ? value : null;
      } catch (_) { return null; }
    },
    save(shopId, cart) {
      if (!cart || cart.shopId !== shopId || !Array.isArray(cart.lines)) throw new Error('Guest savat shop scope bilan mos emas.');
      const previous = this.load(shopId);
      const stored = { ...cart, mergeKey: String(cart.mergeKey || previous?.mergeKey || makeGuestMergeKey()) };
      storage.setItem(guestCartStorageKey(shopId), JSON.stringify(stored));
      return stored;
    },
    clear(shopId) { storage.removeItem(guestCartStorageKey(shopId)); },
  });
}

export function cartLineKind(line) {
  if (line?.bundleId) return 'BUNDLE';
  if (line?.variantId || line?.size || line?.color) return 'VARIANT';
  return 'PRODUCT';
}

export function cartLineKey(line = {}) {
  if (line.bundleId) return `bundle:${String(line.bundleId)}`;
  const productId = String(line.productId || '').trim();
  if (!productId) return '';
  return `product:${productId}|${line.size || ''}|${line.color || ''}`;
}

export function normalizeCartLine(line) {
  const quantity = Math.max(0, Math.min(MAX_QUANTITY, Math.trunc(safeNumber(line?.quantity, 0))));
  return {
    ...line,
    lineKey: String(line?.lineKey || cartLineKey(line)),
    quantity,
    unitPrice: safeNumber(line?.unitPrice),
    kind: cartLineKind(line),
    name: String(line?.name || line?.productName || line?.bundleName || line?.productId || line?.bundleId || 'Mahsulot'),
    optionLabel: String(line?.optionLabel || [line?.colorName, line?.sizeName].filter(Boolean).join(' · ') || ''),
  };
}

export function normalizeCart(cart, expectedShopId = null) {
  const shopId = String(cart?.shopId || '');
  if (!shopId || (expectedShopId && shopId !== expectedShopId)) throw new Error('Cart shop scope mismatch');
  const lines = (Array.isArray(cart?.lines) ? cart.lines : []).map(normalizeCartLine).filter((line) => line.lineKey && line.quantity > 0);
  return { ...cart, shopId, currency: String(cart?.currency || 'UZS'), lines };
}

export function localCartSubtotal(cart) {
  return (cart?.lines || []).reduce((sum, line) => sum + safeNumber(line.unitPrice) * safeNumber(line.quantity), 0);
}

export function normalizeTierProgress(value, subtotal = 0) {
  const raw = value && typeof value === 'object' ? value : {};
  const steps = (Array.isArray(raw.steps) ? raw.steps : [])
    .map((step) => ({ threshold: safeNumber(step.threshold), percent: safeNumber(step.percent) }))
    .filter((step) => step.threshold > 0)
    .sort((a, b) => a.threshold - b.threshold);
  if (!steps.length) return null;
  const currentSubtotal = safeNumber(raw.currentSubtotal, subtotal);
  const next = steps.find((step) => currentSubtotal < step.threshold) || null;
  const previous = [...steps].reverse().find((step) => currentSubtotal >= step.threshold) || null;
  const floor = previous?.threshold || 0;
  const ceiling = next?.threshold || steps.at(-1).threshold;
  const progress = next ? Math.max(0, Math.min(100, ((currentSubtotal - floor) / Math.max(1, ceiling - floor)) * 100)) : 100;
  return {
    steps,
    currentSubtotal,
    currentPercent: previous?.percent || 0,
    next,
    remaining: next ? Math.max(0, next.threshold - currentSubtotal) : 0,
    progress,
  };
}

function money(value) {
  return `${new Intl.NumberFormat('uz-UZ').format(Math.round(safeNumber(value)))} so‘m`;
}

export function createCartController({ cartPort, catalogPort = null, shopId, guestStore = null, authenticated = false } = {}) {
  if (!cartPort) throw new TypeError('cartPort kerak');
  if (!shopId) throw new TypeError('shopId kerak');
  let state = { cart: null, quote: null, loading: false, busy: false, error: null, promoCode: '' };
  let quoteGeneration = 0;
  const productCache = new Map();
  const bundleCache = new Map();
  const listeners = new Set();
  const snapshot = () => ({ ...state, cart: state.cart ? structuredClone(state.cart) : null, quote: state.quote ? structuredClone(state.quote) : null });
  const emit = () => listeners.forEach((listener) => listener(snapshot()));
  const set = (patch) => { state = { ...state, ...patch }; emit(); return snapshot(); };
  const persistGuest = () => {
    if (!authenticated && guestStore && state.cart) {
      if (state.cart.lines.length) guestStore.save(shopId, state.cart);
      else guestStore.clear(shopId);
    }
  };
  const localResult = (cart) => ({ ok: true, data: cart });
  async function hydrateCart(cart) {
    if (!catalogPort?.getProduct && !catalogPort?.getBundle) return cart;
    const ids = [...new Set(cart.lines.map((line) => String(line.productId || '')).filter(Boolean))];
    const bundleIds = [...new Set(cart.lines.map((line) => String(line.bundleId || '')).filter(Boolean))];
    await Promise.all(ids.filter((id) => catalogPort?.getProduct && !productCache.has(id)).map(async (id) => {
      const result = await catalogPort.getProduct({ productId:id });
      productCache.set(id, result?.ok ? result.data : null);
    }).concat(bundleIds.filter((id) => catalogPort?.getBundle && !bundleCache.has(id)).map(async (id) => {
      const result = await catalogPort.getBundle({ bundleId:id });
      bundleCache.set(id, result?.ok ? result.data : null);
    })));
    return {
      ...cart,
      lines:cart.lines.map((line) => {
        if (line.bundleId) {
          const bundle = bundleCache.get(String(line.bundleId));
          if (!bundle) return line;
          const items = Array.isArray(bundle.resolvedItems) ? bundle.resolvedItems : [];
          return normalizeCartLine({
            ...line,
            name:bundle.name || line.name,
            unitPrice:safeNumber(bundle.bundlePrice, line.unitPrice),
            regularTotal:safeNumber(bundle.regularTotal),
            savings:safeNumber(bundle.savings),
            imageUrl:bundle.coverImageUrl || items.find((item) => item?.img)?.img || line.imageUrl || '',
            optionLabel:items.map((item) => `${item.name || item.productId}${Number(item.qty) > 1 ? ` × ${Number(item.qty)}` : ''}`).join(' + '),
          });
        }
        if (!line.productId) return line;
        const product = productCache.get(String(line.productId));
        if (!product) return line;
        const variant = findVariant(product, line.size, line.color);
        return normalizeCartLine({
          ...line,
          name:product.name || line.name,
          unitPrice:variantPrice(product, line.size, line.color),
          imageUrl:variantDisplayImage(product, line.size, line.color, line.imageUrl || ''),
          optionLabel:[line.color, line.size].filter(Boolean).join(' · '),
          variantId:line.variantId || variant?.id || null,
          maxQuantity:Math.min(MAX_QUANTITY,Math.max(0,Number(variant?.qty ?? product.stock ?? MAX_QUANTITY))),
        });
      }),
    };
  }
  async function quoteCurrent(promoCode = state.promoCode) {
    if (!state.cart) return null;
    const generation = ++quoteGeneration;
    const cartSnapshot = structuredClone(state.cart);
    const result = await cartPort.quote({ cart: cartSnapshot, promoCode: String(promoCode || '').trim() || null });
    if (generation !== quoteGeneration) return result;
    if (!result.ok) { set({ error: result.error, quote: null }); return result; }
    set({ quote: result.data, error: null, promoCode: String(promoCode || '').trim() });
    return result;
  }
  return {
    getState: snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async load() {
      if (state.loading || state.busy) return null;
      set({ loading: true, error: null });
      let stored = guestStore ? guestStore.load(shopId) : null;
      if (stored && !stored.mergeKey) stored = guestStore.save(shopId, stored);
      const result = stored ? (authenticated
        ? await cartPort.mergeGuest({ guestCart: stored, idempotencyKey: stored.mergeKey })
        : localResult(stored)) : (authenticated
          ? await cartPort.load({ shopId })
          : localResult({ shopId, currency: 'UZS', lines: [] }));
      if (!result.ok) { set({ loading: false, error: result.error }); return result; }
      let cart;
      try { cart = await hydrateCart(normalizeCart(result.data, shopId)); }
      catch (_) { const error = { code: 'CONTRACT_MISMATCH', message: 'Savatcha do‘kon kontekstiga mos emas.', retryable: false }; set({ loading: false, error }); return { ok: false, error }; }
      if (authenticated && stored) {
        const current = guestStore.load(shopId);
        if (current?.mergeKey === stored.mergeKey && JSON.stringify(current?.lines) === JSON.stringify(stored.lines)) guestStore.clear(shopId);
      }
      set({ loading: false, cart, error: null });
      persistGuest();
      if (authenticated && cart.lines.length) await quoteCurrent();
      return { ok: true, data: cart };
    },
    async addLine(input = {}) {
      if (state.busy || state.loading) return null;
      if (!state.cart) {
        const loaded = await this.load();
        if (!loaded?.ok) return loaded;
      }
      const productId = String(input.productId || '').trim();
      const bundleId = String(input.bundleId || '').trim();
      const quantity = Math.trunc(Number(input.quantity ?? input.qty ?? 1));
      if ((!productId && !bundleId) || (productId && bundleId) || quantity <= 0 || quantity > 99) {
        const error = { code:'VALIDATION_ERROR', message:'Savatga qo‘shiladigan mahsulot noto‘g‘ri.', retryable:false };
        set({ error }); return { ok:false, error };
      }
      const identity = bundleId ? { bundleId } : { productId };
      const line = normalizeCartLine({ ...input, ...identity, quantity, lineKey:cartLineKey({ ...input, ...identity }) });
      const current = state.cart.lines.find((row) => cartLineKey(row) === line.lineKey);
      if (current && current.quantity + quantity > (current.maxQuantity ?? MAX_QUANTITY)) {
        const error = { code:'VALIDATION_ERROR', message:'Tanlangan miqdor qoldiq yoki 99 dona chegarasidan oshdi.', retryable:false };
        set({ error }); return { ok:false, error };
      }
      ++quoteGeneration;
      set({ busy:true, error:null, quote:null });
      const result = authenticated
        ? await cartPort.addLine(line)
        : localResult({ ...state.cart, lines: current
          ? state.cart.lines.map((row) => cartLineKey(row) === line.lineKey ? { ...row, quantity:row.quantity + quantity } : row)
          : [...state.cart.lines, line] });
      if (!result.ok) { set({ busy:false, error:result.error }); return result; }
      let cart;
      try { cart = await hydrateCart(normalizeCart(result.data, shopId)); }
      catch (_) { const error = {code:'CONTRACT_MISMATCH',message:'Savatcha do‘kon kontekstiga mos emas.',retryable:false}; set({busy:false,error,quote:null}); return {ok:false,error}; }
      set({ busy:false, cart, error:null });
      persistGuest();
      if (authenticated) await quoteCurrent();
      return { ok:true, data:cart };
    },
    async setQuantity(lineKey, quantity) {
      if (state.busy || state.loading || !state.cart) return null;
      const next = Math.max(0, Math.min(state.cart.lines.find(line=>line.lineKey===lineKey)?.maxQuantity ?? MAX_QUANTITY, Math.trunc(Number(quantity) || 0)));
      ++quoteGeneration;
      set({ busy: true, error: null, quote: null });
      const result = authenticated
        ? await cartPort.updateLine({ lineKey, quantity: next })
        : localResult({ ...state.cart, lines: state.cart.lines.map((row) => row.lineKey === lineKey ? { ...row, quantity:next } : row).filter((row) => row.quantity > 0) });
      if (!result.ok) { set({ busy: false, error: result.error }); return result; }
      let cart;
      try { cart = await hydrateCart(normalizeCart(result.data, shopId)); }
      catch (_) { const error = {code:'CONTRACT_MISMATCH',message:'Savatcha do‘kon kontekstiga mos emas.',retryable:false}; set({busy:false,error,quote:null}); return {ok:false,error}; }
      if (next === 0) cart = { ...cart, lines: cart.lines.filter((line) => line.lineKey !== lineKey) };
      set({ busy: false, cart, error: null });
      persistGuest();
      if (authenticated && cart.lines.length) await quoteCurrent();
      return { ok: true, data: cart };
    },
    removeLine(lineKey) { return this.setQuantity(lineKey, 0); },
    async clear() {
      if (state.busy || state.loading) return null;
      ++quoteGeneration;
      set({ busy: true, error: null, quote: null });
      const result = authenticated ? await cartPort.clear({ shopId }) : localResult({ cleared:true });
      if (!result.ok) { set({ busy: false, error: result.error }); return result; }
      const cart = { ...(state.cart || { shopId, currency: 'UZS' }), shopId, lines: [] };
      set({ busy: false, cart, quote: null, error: null, promoCode: '' });
      persistGuest();
      return { ok: true, data: cart };
    },
    async applyPromo(code) {
      if (state.busy || state.loading || !state.cart) return null;
      set({ busy: true, error: null });
      const result = await quoteCurrent(code);
      set({ busy: false });
      return result;
    },
    refreshQuote: () => quoteCurrent(),
  };
}

function getDocument(documentRef) {
  const doc = documentRef ?? globalThis.document;
  if (!doc?.createElement) throw new Error('Cart UI uchun DOM kerak');
  return doc;
}

function cartLineView(doc, line, controller, busy) {
  const row = doc.createElement('article');
  row.className = 'uw-cart-line';
  row.dataset.lineKind = line.kind;
  row.dataset.lineKey = line.lineKey;
  const info = doc.createElement('div'); info.className = 'uw-cart-line__info';
  const badge = doc.createElement('span'); badge.className = 'uw-cart-line__badge'; badge.textContent = line.kind === 'BUNDLE' ? 'Aksiya' : line.kind === 'VARIANT' ? 'Variant' : 'Mahsulot';
  const name = doc.createElement('h3'); name.textContent = line.name;
  info.append(badge, name);
  if (line.optionLabel) { const option = doc.createElement('p'); option.textContent = line.optionLabel; info.append(option); }
  if (line.kind === 'BUNDLE' && safeNumber(line.savings) > 0) {
    const saving = doc.createElement('p'); saving.className = 'uw-cart-line__saving'; saving.textContent = `Tejash: ${money(safeNumber(line.savings) * line.quantity)}`; info.append(saving);
  }
  const price = doc.createElement('strong'); price.className = 'uw-cart-line__price'; price.textContent = money(line.unitPrice * line.quantity);
  const controls = doc.createElement('div'); controls.className = 'uw-cart-line__controls';
  controls.append(
    createButton({ label: '−', variant: 'secondary', size: 'sm', disabled: busy || line.quantity <= 1, ariaLabel: `${line.name} miqdorini kamaytirish`, onClick: () => controller.setQuantity(line.lineKey, line.quantity - 1) }, doc),
  );
  const qty = doc.createElement('span'); qty.className = 'uw-cart-line__quantity'; qty.textContent = String(line.quantity); qty.setAttribute('aria-label', `Miqdor ${line.quantity}`); controls.append(qty);
  controls.append(
    createButton({ label: '+', variant: 'secondary', size: 'sm', disabled: busy || line.quantity >= (line.maxQuantity ?? MAX_QUANTITY), ariaLabel: `${line.name} miqdorini oshirish`, onClick: () => controller.setQuantity(line.lineKey, line.quantity + 1) }, doc),
    createButton({ label: 'Olib tashlash', variant: 'ghost', size: 'sm', disabled: busy, onClick: () => controller.removeLine(line.lineKey) }, doc),
  );
  row.append(info, price, controls);
  return row;
}

export function createCartView({ controller, state = controller?.getState?.() || {} } = {}, documentRef) {
  if (!controller) throw new TypeError('controller kerak');
  const doc = getDocument(documentRef);
  const root = doc.createElement('section'); root.className = 'uw-cart'; root.dataset.feature = 'cart';
  const header = doc.createElement('header'); header.className = 'uw-cart__header';
  const title = doc.createElement('h1'); title.textContent = 'Savatcha';
  const clear = createButton({ label: 'Savatchani tozalash', variant: 'ghost', size: 'sm', disabled: state.busy || !state.cart?.lines?.length, onClick: () => controller.clear() }, doc);
  header.append(title, clear); root.append(header);
  if (state.loading) { root.append(createStatePanel({ kind: 'loading', title: 'Savatcha yuklanmoqda', message: 'Mahsulotlar tekshirilmoqda.' }, doc)); return { element: root }; }
  if (state.error && !state.cart) { root.append(createStatePanel({ kind: 'error', title: 'Savatchani ochib bo‘lmadi', message: state.error.message || 'Qayta urinib ko‘ring.' }, doc)); return { element: root }; }
  const cart = state.cart || { lines: [] };
  if (!cart.lines.length) { root.append(createStatePanel({ kind: 'empty', title: 'Savatcha bo‘sh', message: 'Katalogdan mahsulot tanlang.' }, doc)); return { element: root }; }

  const layout = doc.createElement('div'); layout.className = 'uw-cart-layout';
  const lines = doc.createElement('div'); lines.className = 'uw-cart-lines';
  cart.lines.forEach((line) => lines.append(cartLineView(doc, normalizeCartLine(line), controller, state.busy)));

  const summary = doc.createElement('aside'); summary.className = 'uw-cart-summary';
  const promo = createTextField({ label: 'Promo-kod', name: 'promo', value: state.promoCode || '', placeholder: 'Kod kiriting', autocomplete: 'off', disabled: state.busy }, doc);
  const promoButton = createButton({ label: state.busy ? 'Tekshirilmoqda…' : 'Qo‘llash', busy: state.busy, onClick: () => controller.applyPromo(promo.input.value) }, doc);
  const promoRow = doc.createElement('div'); promoRow.className = 'uw-cart-promo'; promoRow.append(promo.element, promoButton); summary.append(promoRow);
  if (state.error) { const error = doc.createElement('p'); error.className = 'uw-cart-error'; error.textContent = state.error.message || 'Amal bajarilmadi.'; summary.append(error); }

  const subtotal = state.quote?.subtotal ?? localCartSubtotal(cart);
  const tier = normalizeTierProgress(state.quote?.tierProgress, subtotal);
  if (tier) {
    const box = doc.createElement('section'); box.className = 'uw-cart-tier'; box.setAttribute('aria-label', 'Bosqichli chegirma');
    const copy = doc.createElement('p');
    copy.textContent = tier.next ? `Yana ${money(tier.remaining)} qo‘shing — ${tier.next.percent}% chegirma bo‘ladi.` : `Eng yuqori ${tier.currentPercent}% bosqichga yetdingiz.`;
    const progress = doc.createElement('progress'); progress.max = 100; progress.value = tier.progress; progress.setAttribute('aria-label', 'Chegirma bosqichi progressi');
    const steps = doc.createElement('div'); steps.className = 'uw-cart-tier__steps';
    tier.steps.forEach((step) => { const node = doc.createElement('span'); node.textContent = `${money(step.threshold)} · ${step.percent}%`; steps.append(node); });
    box.append(copy, progress, steps); summary.append(box);
  }
  if (state.quote?.gift?.eligible) {
    const gift = doc.createElement('section'); gift.className = 'uw-cart-gift'; gift.setAttribute('role', 'status');
    gift.textContent = `🎁 Sovg‘a: ${state.quote.gift.productName || state.quote.gift.label || 'sovg‘a mahsulot'}`;
    summary.append(gift);
  }
  const totals = doc.createElement('dl'); totals.className = 'uw-cart-totals';
  const rows = [
    ['Tovarlar', state.quote?.subtotal ?? localCartSubtotal(cart)],
    ['Chegirma', -(state.quote?.discounts || 0)],
    ['Jami', state.quote?.total ?? localCartSubtotal(cart)],
  ];
  rows.forEach(([label, value]) => { const dt = doc.createElement('dt'); dt.textContent = label; const dd = doc.createElement('dd'); dd.textContent = value < 0 ? `−${money(Math.abs(value))}` : money(value); totals.append(dt, dd); });
  summary.append(totals);
  const note = doc.createElement('p'); note.className = 'uw-cart-summary__note'; note.textContent = state.quote?.serverAuthoritative ? 'Hisob server tomonidan tekshirildi.' : 'Yakuniy narx checkoutda server tomonidan tekshiriladi.'; summary.append(note);
  layout.append(lines, summary); root.append(layout);
  return { element: root, promoInput: promo.input };
}
