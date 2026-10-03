import { fail, ok } from '../ports/result.js';
import { loadJsonFixture } from './fixture-loader.js';

export function createMockCartAdapter({ scenario = 'basic' } = {}) {
  let cartFile = scenario === 'variant' ? 'cart/variant.json' : scenario === 'bundle' ? 'cart/bundle.json' : 'cart/basic.json';
  let currentCart = null;
  const loadCurrent = async () => structuredClone(currentCart || (currentCart = await loadJsonFixture(cartFile)));
  const keyOf = (line = {}) => line.bundleId ? `bundle:${line.bundleId}` : `product:${line.productId}|${line.size || ''}|${line.color || ''}`;
  return {
    async load() { return ok(await loadCurrent()); },
    async mergeGuest(input) {
      if (!input || !input.guestCart || typeof input.guestCart !== 'object') return fail('VALIDATION_ERROR', 'Guest savatchasi noto‘g‘ri.');
      currentCart = structuredClone(input.guestCart);
      return ok(structuredClone(currentCart));
    },
    async addLine(input) {
      const productId = String(input?.productId || '').trim();
      const bundleId = String(input?.bundleId || '').trim();
      const quantity = Math.trunc(Number(input?.quantity ?? input?.qty ?? 1));
      if ((!productId && !bundleId) || (productId && bundleId) || quantity <= 0 || quantity > 99) return fail('VALIDATION_ERROR', 'Savatga qo‘shiladigan qator noto‘g‘ri.');
      const cart = await loadCurrent();
      const next = { ...input, productId: productId || undefined, bundleId: bundleId || undefined, quantity };
      next.lineKey = keyOf(next);
      const existing = cart.lines.find((row) => keyOf(row) === next.lineKey);
      if (existing) existing.quantity += quantity;
      else cart.lines.push(next);
      currentCart = structuredClone(cart);
      return ok(structuredClone(currentCart));
    },
    async updateLine(input) {
      if (!input?.lineKey || !Number.isInteger(input.quantity) || input.quantity < 0) return fail('VALIDATION_ERROR', 'Savat qatori noto‘g‘ri.');
      const cart = await loadCurrent();
      const line = cart.lines.find((row) => row.lineKey === input.lineKey);
      if (!line) return fail('NOT_FOUND', 'Savat qatori topilmadi.');
      line.quantity = input.quantity;
      currentCart = structuredClone(cart);
      return ok(structuredClone(currentCart));
    },
    async clear() { const cart = await loadCurrent(); currentCart = { ...cart, lines: [] }; return ok({ cleared: true }); },
    async quote(input) {
      if (!input || !input.cart || typeof input.cart !== 'object') return fail('VALIDATION_ERROR', 'Savatcha kerak.');
      if (input.promoCode === 'PRICE_CHANGED') return loadJsonFixture('cart/quote-conflict.json');
      const lines = Array.isArray(input.cart.lines) ? input.cart.lines : [];
      const subtotal = lines.reduce((sum, line) => sum + Number(line.unitPrice || 0) * Number(line.quantity || 0), 0);
      const promoCode = String(input.promoCode || '').trim().toUpperCase();
      const discounts = promoCode === 'DEMO10' ? Math.min(Math.round(subtotal * 0.10), 100000) : 0;
      const checkoutOptions = await loadJsonFixture('checkout/options.json');
      const deliveryId = String(input.deliverySelection?.id || '');
      const selectedDelivery = checkoutOptions.deliveryOptions.find((row) => row.id === deliveryId && row.available !== false) || null;
      if (deliveryId && !selectedDelivery) return fail('VALIDATION_ERROR', 'Yetkazib berish usuli yaroqsiz.');
      const delivery = Number(selectedDelivery?.price || 0);
      const tierSteps = [
        { threshold: 500000, percent: 2 },
        { threshold: 1000000, percent: 3 },
        { threshold: 2000000, percent: 5 },
      ];
      return ok({
        currency: 'UZS', subtotal, discounts, delivery, total: Math.max(0, subtotal - discounts + delivery), serverAuthoritative: true,
        deliveryOptions: checkoutOptions.deliveryOptions, paymentMethods: checkoutOptions.paymentMethods,
        promo: promoCode ? { code: promoCode, applied: promoCode === 'DEMO10' } : null,
        tierProgress: { currentSubtotal: subtotal, steps: tierSteps },
        gift: { eligible: subtotal >= 500000, productName: 'Demo shaker' },
      });
    },
  };
}
