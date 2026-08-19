// USTORE commerce configuration helpers.
// Browserda window.UstoreCommerce, Node regression testlarida module.exports sifatida ishlaydi.
(function attachUstoreCommerce(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.UstoreCommerce = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function buildUstoreCommerce() {
  'use strict';

  const VERSION = 1;
  const DELIVERY_KINDS = Object.freeze(['FREE', 'FIXED', 'TAXI', 'POST']);
  const PAYMENT_IDS = Object.freeze(['CASH', 'CARD']);
  const POST_PROVIDER_IDS = Object.freeze(['BTS', 'EMU', 'OTHER']);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function cleanRegionIds(regionIds) {
    return Array.from(new Set((regionIds || []).map(String).map(x => x.trim()).filter(Boolean)));
  }

  function defaultConfig(regionIds) {
    const ids = cleanRegionIds(regionIds);
    const freeRegions = {};
    const cashRegions = {};
    if (ids.includes('tashkent_city')) {
      freeRegions.tashkent_city = { enabled: true };
      cashRegions.tashkent_city = { enabled: true };
    }
    return {
      version: VERSION,
      delivery: {
        free: { enabled: true, regions: freeRegions },
        fixed: { enabled: false, regions: {} },
        taxi: { enabled: false, regions: {} },
        post: {
          enabled: false,
          providers: [
            { id: 'BTS', name: 'BTS', enabled: false, regions: {} },
            { id: 'EMU', name: 'EMU', enabled: false, regions: {} },
            { id: 'OTHER', name: 'Boshqa pochta', enabled: false, regions: {} },
          ],
        },
      },
      payments: {
        methods: [
          { id: 'CASH', name: 'Naqd', enabled: true, regions: cashRegions },
          { id: 'CARD', name: 'Karta orqali', enabled: false, regions: {}, cardNumber: '', cardHolder: '', receiptRequired: false },
        ],
      },
    };
  }

  function bool(value) {
    return value === true;
  }

  function nonNegativeInt(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.round(number) : fallback;
  }

  function normalizeRegions(rawRegions, regionIds, kind) {
    const allowed = new Set(cleanRegionIds(regionIds));
    const result = {};
    for (const [regionId, raw] of Object.entries(rawRegions || {})) {
      if (!allowed.has(regionId) || !raw || !bool(raw.enabled)) continue;
      const entry = { enabled: true };
      if (kind === 'FIXED') entry.fee = nonNegativeInt(raw.fee);
      if (kind === 'TAXI') {
        entry.minFee = nonNegativeInt(raw.minFee);
        entry.maxFee = Math.max(entry.minFee, nonNegativeInt(raw.maxFee, entry.minFee));
      }
      if (kind === 'POST') entry.payer = raw.payer === 'SELLER' ? 'SELLER' : 'CUSTOMER';
      // 13-band: yetkazib berish usuliga admin izohi — ixtiyoriy, faqat
      // delivery turlarida (to'lov usullarida emas), bo'sh bo'lsa saqlanmaydi.
      if (kind !== 'PAYMENT') {
        const comment = String(raw.comment || '').trim().slice(0, 200);
        if (comment) entry.comment = comment;
      }
      result[regionId] = entry;
    }
    return result;
  }

  function normalizeConfig(raw, regionIds) {
    const ids = cleanRegionIds(regionIds);
    const base = defaultConfig(ids);
    if (!raw || typeof raw !== 'object') return base;

    const delivery = raw.delivery || {};
    base.delivery.free.enabled = bool(delivery.free?.enabled);
    base.delivery.free.regions = normalizeRegions(delivery.free?.regions, ids, 'FREE');
    base.delivery.fixed.enabled = bool(delivery.fixed?.enabled);
    base.delivery.fixed.regions = normalizeRegions(delivery.fixed?.regions, ids, 'FIXED');
    base.delivery.taxi.enabled = bool(delivery.taxi?.enabled);
    base.delivery.taxi.regions = normalizeRegions(delivery.taxi?.regions, ids, 'TAXI');
    base.delivery.post.enabled = bool(delivery.post?.enabled);

    const sourceProviders = Array.isArray(delivery.post?.providers) ? delivery.post.providers : [];
    base.delivery.post.providers = POST_PROVIDER_IDS.map(id => {
      const source = sourceProviders.find(p => p && p.id === id) || {};
      const fallback = base.delivery.post.providers.find(p => p.id === id);
      return {
        id,
        name: String(source.name || fallback.name).trim().slice(0, 80),
        enabled: bool(source.enabled),
        regions: normalizeRegions(source.regions, ids, 'POST'),
      };
    });

    const sourceMethods = Array.isArray(raw.payments?.methods) ? raw.payments.methods : [];
    base.payments.methods = PAYMENT_IDS.map(id => {
      const source = sourceMethods.find(m => m && m.id === id) || {};
      const fallback = base.payments.methods.find(m => m.id === id);
      const method = {
        id,
        name: String(source.name || fallback.name).trim().slice(0, 80),
        enabled: bool(source.enabled),
        regions: normalizeRegions(source.regions, ids, 'PAYMENT'),
      };
      if (id === 'CARD') {
        method.cardNumber = String(source.cardNumber || '').replace(/[^\d ]/g, '').trim().slice(0, 32);
        method.cardHolder = String(source.cardHolder || '').trim().slice(0, 120);
        method.receiptRequired = bool(source.receiptRequired);
      }
      return method;
    });
    return base;
  }

  function deliveryOptions(config, regionId) {
    const result = [];
    const delivery = config?.delivery || {};
    const free = delivery.free?.regions?.[regionId];
    if (delivery.free?.enabled && free?.enabled) {
      result.push({ id: 'FREE', kind: 'FREE', fee: 0, payableFee: 0, comment: free.comment || null });
    }
    const fixed = delivery.fixed?.regions?.[regionId];
    if (delivery.fixed?.enabled && fixed?.enabled) {
      const fee = nonNegativeInt(fixed.fee);
      result.push({ id: 'FIXED', kind: 'FIXED', fee, payableFee: fee, comment: fixed.comment || null });
    }
    const taxi = delivery.taxi?.regions?.[regionId];
    if (delivery.taxi?.enabled && taxi?.enabled) {
      const minFee = nonNegativeInt(taxi.minFee);
      const maxFee = Math.max(minFee, nonNegativeInt(taxi.maxFee, minFee));
      result.push({ id: 'TAXI', kind: 'TAXI', fee: 0, payableFee: 0, minFee, maxFee, payer: 'CUSTOMER_DIRECT', comment: taxi.comment || null });
    }
    if (delivery.post?.enabled) {
      for (const provider of delivery.post.providers || []) {
        const region = provider?.regions?.[regionId];
        if (!provider?.enabled || !region?.enabled) continue;
        result.push({
          id: `POST:${provider.id}`,
          kind: 'POST',
          providerId: provider.id,
          providerName: provider.name,
          payer: region.payer === 'SELLER' ? 'SELLER' : 'CUSTOMER',
          fee: 0,
          payableFee: 0,
          comment: region.comment || null,
        });
      }
    }
    return result;
  }

  function paymentOptions(config, regionId) {
    return (config?.payments?.methods || []).filter(method => method?.enabled && method.regions?.[regionId]?.enabled).map(clone);
  }

  function calculateTotals(subtotal, deliveryOption) {
    const safeSubtotal = nonNegativeInt(subtotal);
    const deliveryFee = deliveryOption?.kind === 'FIXED' ? nonNegativeInt(deliveryOption.payableFee ?? deliveryOption.fee) : 0;
    return { subtotal: safeSubtotal, deliveryFee, payableTotal: safeSubtotal + deliveryFee };
  }

  function validateConfig(config, regionIds) {
    const normalized = normalizeConfig(config, regionIds);
    const issues = [];
    for (const [regionId, entry] of Object.entries(normalized.delivery.fixed.regions)) {
      if (entry.enabled && entry.fee <= 0) issues.push({ code: 'FIXED_FEE_REQUIRED', regionId });
    }
    for (const [regionId, entry] of Object.entries(normalized.delivery.taxi.regions)) {
      if (entry.enabled && (entry.minFee <= 0 || entry.maxFee < entry.minFee)) issues.push({ code: 'TAXI_RANGE_INVALID', regionId });
    }
    const card = normalized.payments.methods.find(method => method.id === 'CARD');
    if (card?.enabled && Object.keys(card.regions).length && (!/^\d[\d ]{10,30}\d$/.test(card.cardNumber) || !card.cardHolder)) {
      issues.push({ code: 'CARD_DETAILS_REQUIRED' });
    }
    return { config: normalized, issues };
  }

  return Object.freeze({
    VERSION,
    DELIVERY_KINDS,
    PAYMENT_IDS,
    POST_PROVIDER_IDS,
    defaultConfig,
    normalizeConfig,
    deliveryOptions,
    paymentOptions,
    calculateTotals,
    validateConfig,
  });
});
