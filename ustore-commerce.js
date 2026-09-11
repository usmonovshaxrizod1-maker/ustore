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
  const PAYMENT_IDS = Object.freeze(['CASH', 'CARD', 'QR', 'CLICK', 'PAYME', 'UZUM']);
  const POST_PROVIDER_IDS = Object.freeze(['BTS', 'EMU', 'OTHER']);
  // 17-band: qattiq belgilangan (yopiq) QR provayderlar ro'yxati — kelajakda
  // kengaytirishga mos, lekin hozircha faqat shu to'rttasi.
  const QR_PROVIDER_IDS = Object.freeze(['CLICK', 'PAYME', 'PAYNET', 'UZUM']);
  const QR_PROVIDER_NAMES = Object.freeze({ CLICK: 'Click', PAYME: 'Payme', PAYNET: 'Paynet', UZUM: 'Uzum' });

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
        free: { enabled: true, regions: freeRegions, general: { enabled: false, comment: null, estimatedTime: null } },
        fixed: { enabled: false, regions: {}, general: { enabled: false, fee: null, comment: null, estimatedTime: null } },
        taxi: { enabled: false, general: { enabled: false, exactFee: null, minFee: null, maxFee: null, comment: null, estimatedTime: null }, regions: {} },
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
          { id: 'QR', name: 'QR orqali', enabled: false, regions: {}, providers: QR_PROVIDER_IDS.map(id => ({ id, name: QR_PROVIDER_NAMES[id], enabled: false, qrImageUrl: null, paymentUrl: null })) },
          // Click.uz avtomatik to'lov — mavjud "QR: Click" (qo'lda)dan mustaqil.
          { id: 'CLICK', name: "Click orqali (avtomatik)", enabled: false, regions: {} },
          // Payme/Uzum avtomatik to'lov — CLICK bilan bir xil naqsh.
          { id: 'PAYME', name: "Payme orqali (avtomatik)", enabled: false, regions: {} },
          { id: 'UZUM', name: "Uzum orqali (avtomatik)", enabled: false, regions: {} },
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

  // Phase 3, 7-band: taxi narxi (aniq narx VA/YOKI diapazon) endi to'liq
  // ixtiyoriy — "kiritilmagan" (null) va "0 kiritilgan" (haqiqiy nol narx)
  // aniq ajratilishi shart, shu sabab bu yerda 0'ga sukut qilinmaydi.
  function nonNegativeIntOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
  }

  function cleanDistricts(raw) {
    if (!Array.isArray(raw)) return [];
    return Array.from(new Set(raw.map(v => String(v || '').trim()).filter(Boolean))).slice(0, 100);
  }

  function districtKey(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    const tail = raw.includes(',') ? raw.split(',').pop().trim() : raw;
    return tail
      .replace(/[ʻʼ’`‘]/g, "'")
      .replace(/\s+(tumani|tuman|shahri|shahar|район|город)$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function districtAllowed(entry, district) {
    const selected = cleanDistricts(entry?.districts);
    if (!selected.length) return true; // no district selection = whole region
    const target = districtKey(district);
    if (!target) return false;
    return selected.some(item => {
      const key = districtKey(item);
      return key && (key === target || target.endsWith(key) || key.endsWith(target));
    });
  }

  function normalizeRegions(rawRegions, regionIds, kind) {
    const allowed = new Set(cleanRegionIds(regionIds));
    const result = {};
    for (const [regionId, raw] of Object.entries(rawRegions || {})) {
      if (!allowed.has(regionId) || !raw || !bool(raw.enabled)) continue;
      const entry = { enabled: true };
      const districts = cleanDistricts(raw.districts);
      if (districts.length) entry.districts = districts;
      // 2026-09: bo'sh qoldirilgan narx endi 0'ga emas, null'ga tushadi —
      // "narx kiritilmagan (umumiy qiymatga tushadi)" va "0 kiritilgan"
      // aniq ajratilishi uchun (region qatorlari bilan bir xil qoida).
      if (kind === 'FIXED') entry.fee = nonNegativeIntOrNull(raw.fee);
      if (kind === 'TAXI') {
        entry.exactFee = nonNegativeIntOrNull(raw.exactFee);
        entry.minFee = nonNegativeIntOrNull(raw.minFee);
        entry.maxFee = nonNegativeIntOrNull(raw.maxFee);
      }
      if (kind === 'POST') entry.payer = raw.payer === 'SELLER' ? 'SELLER' : 'CUSTOMER';
      // 13-band: yetkazib berish usuliga admin izohi — ixtiyoriy, faqat
      // delivery turlarida (to'lov usullarida emas), bo'sh bo'lsa saqlanmaydi.
      if (kind !== 'PAYMENT') {
        const comment = String(raw.comment || '').trim().slice(0, 200);
        if (comment) entry.comment = comment;
        // 9-band: "Yetkazib berish vaqti" — comment bilan bir xil naqsh, ixtiyoriy.
        const estimatedTime = String(raw.estimatedTime || '').trim().slice(0, 60);
        if (estimatedTime) entry.estimatedTime = estimatedTime;
      }
      result[regionId] = entry;
    }
    return result;
  }

  // Phase 3, 7-band (TAXI) + 2026-09 kengaytma (FREE/FIXED): har bir
  // yetkazib berish turi uchun "umumiy" (region'ga bog'liq bo'lmagan)
  // narx/izoh/vaqt — mavjud region hech narsa kiritmagan bo'lsa fallback.
  // Endi alohida yoqish/o'chirish tugmasi bor (`enabled`) — o'chiq bo'lsa
  // maydonlar qanchalik to'ldirilgan bo'lishidan qat'i nazar fallback
  // sifatida ISHLATILMAYDI (deliveryOptions() shu bayroqni tekshiradi).
  // Legacy migratsiya: eski TAXI konfiguratsiyalarida bu tugma umuman yo'q
  // edi (kiritilgan maydonlar doim fallback bo'lib ishlagan) — `enabled`
  // maydoni yo'q-u, lekin biror qiymat kiritilgan bo'lsa, TRUE deb
  // hisoblanadi (aks holda mavjud do'konning ishlayotgan narxi jim
  // yo'qolib qolardi). FIXED/FREE'da bu maydon ILGARI UMUMAN BO'LMAGAN —
  // ular uchun legacy-migratsiya shart emas, standart holat har doim FALSE.
  function normalizeGeneral(raw, kind) {
    const hasLegacyValue = kind === 'TAXI' && raw && typeof raw === 'object' && raw.enabled === undefined &&
      (raw.exactFee != null || raw.minFee != null || raw.maxFee != null ||
        (raw.comment && String(raw.comment).trim()) || (raw.estimatedTime && String(raw.estimatedTime).trim()));
    const entry = { enabled: raw?.enabled === true || !!hasLegacyValue };
    if (kind === 'FIXED') entry.fee = nonNegativeIntOrNull(raw?.fee);
    if (kind === 'TAXI') {
      entry.exactFee = nonNegativeIntOrNull(raw?.exactFee);
      entry.minFee = nonNegativeIntOrNull(raw?.minFee);
      entry.maxFee = nonNegativeIntOrNull(raw?.maxFee);
    }
    entry.comment = (String(raw?.comment || '').trim().slice(0, 200)) || null;
    entry.estimatedTime = (String(raw?.estimatedTime || '').trim().slice(0, 60)) || null;
    return entry;
  }

  function normalizeConfig(raw, regionIds) {
    const ids = cleanRegionIds(regionIds);
    const base = defaultConfig(ids);
    if (!raw || typeof raw !== 'object') return base;

    const delivery = raw.delivery || {};
    base.delivery.free.enabled = bool(delivery.free?.enabled);
    base.delivery.free.regions = normalizeRegions(delivery.free?.regions, ids, 'FREE');
    base.delivery.free.general = normalizeGeneral(delivery.free?.general, 'FREE');
    base.delivery.fixed.enabled = bool(delivery.fixed?.enabled);
    base.delivery.fixed.regions = normalizeRegions(delivery.fixed?.regions, ids, 'FIXED');
    base.delivery.fixed.general = normalizeGeneral(delivery.fixed?.general, 'FIXED');
    base.delivery.taxi.enabled = bool(delivery.taxi?.enabled);
    base.delivery.taxi.general = normalizeGeneral(delivery.taxi?.general, 'TAXI');
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
      if (id === 'QR') {
        method.providers = normalizeQrProviders(source.providers);
      }
      return method;
    });
    return base;
  }

  // 17-band: xavfsizlik uchun AKS holda serverda (shop-api) qat'iy tekshiriladi
  // — bu yerda faqat admin formasi uchun engil, foydalanuvchiga qulay tozalash.
  function safeLinkUrlOrNull(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
      return url.href;
    } catch (_) { return null; }
  }
  function normalizeQrProviders(rawProviders) {
    const list = Array.isArray(rawProviders) ? rawProviders : [];
    return QR_PROVIDER_IDS.map(id => {
      const source = list.find(p => p && p.id === id) || {};
      return {
        id,
        name: QR_PROVIDER_NAMES[id],
        enabled: bool(source.enabled),
        qrImageUrl: safeLinkUrlOrNull(source.qrImageUrl),
        paymentUrl: safeLinkUrlOrNull(source.paymentUrl),
      };
    });
  }

  function deliveryOptions(config, regionId, district = null) {
    const result = [];
    const delivery = config?.delivery || {};
    const free = delivery.free?.regions?.[regionId];
    if (delivery.free?.enabled && free?.enabled && districtAllowed(free, district)) {
      // "Umumiy qiymat" (2026-09): faqat general.enabled bo'lsa fallback
      // sifatida ishlatiladi — region o'z izohi/vaqtini kiritmagan bo'lsa.
      const general = delivery.free?.general?.enabled ? delivery.free.general : {};
      const comment = free.comment ?? general.comment ?? null;
      const estimatedTime = free.estimatedTime ?? general.estimatedTime ?? null;
      result.push({ id: 'FREE', kind: 'FREE', fee: 0, payableFee: 0, comment, estimatedTime });
    }
    const fixed = delivery.fixed?.regions?.[regionId];
    if (delivery.fixed?.enabled && fixed?.enabled && districtAllowed(fixed, district)) {
      const general = delivery.fixed?.general?.enabled ? delivery.fixed.general : {};
      const fee = nonNegativeInt(fixed.fee ?? general.fee ?? 0);
      const comment = fixed.comment ?? general.comment ?? null;
      const estimatedTime = fixed.estimatedTime ?? general.estimatedTime ?? null;
      result.push({ id: 'FIXED', kind: 'FIXED', fee, payableFee: fee, comment, estimatedTime });
    }
    const taxi = delivery.taxi?.regions?.[regionId];
    if (delivery.taxi?.enabled && taxi?.enabled && districtAllowed(taxi, district)) {
      // 7-band: barcha uch maydon ham ixtiyoriy — region'da yo'q bo'lsa
      // umumiy (general) qiymatga tushiladi, u ham bo'lmasa null qoladi
      // (chaqiruvchi taraf buni "narx yo'q" deb aniq talqin qiladi, 0 emas).
      // 2026-09: fallback endi FAQAT general.enabled bo'lsa ishlaydi.
      const general = delivery.taxi?.general?.enabled ? delivery.taxi.general : {};
      const exactFee = taxi.exactFee ?? general.exactFee ?? null;
      const minFee = taxi.minFee ?? general.minFee ?? null;
      const maxFee = taxi.maxFee ?? general.maxFee ?? null;
      const comment = taxi.comment ?? general.comment ?? null;
      const estimatedTime = taxi.estimatedTime ?? general.estimatedTime ?? null;
      result.push({ id: 'TAXI', kind: 'TAXI', fee: 0, payableFee: 0, exactFee, minFee, maxFee, payer: 'CUSTOMER_DIRECT', comment, estimatedTime });
    }
    if (delivery.post?.enabled) {
      for (const provider of delivery.post.providers || []) {
        const region = provider?.regions?.[regionId];
        if (!provider?.enabled || !region?.enabled || !districtAllowed(region, district)) continue;
        result.push({
          id: `POST:${provider.id}`,
          kind: 'POST',
          providerId: provider.id,
          providerName: provider.name,
          payer: region.payer === 'SELLER' ? 'SELLER' : 'CUSTOMER',
          fee: 0,
          payableFee: 0,
          comment: region.comment || null,
          estimatedTime: region.estimatedTime || null,
        });
      }
    }
    return result;
  }

  function paymentOptions(config, regionId, district = null) {
    return (config?.payments?.methods || []).filter(method => {
      const region = method?.regions?.[regionId];
      return method?.enabled && region?.enabled && districtAllowed(region, district);
    }).map(clone);
  }

  function calculateTotals(subtotal, deliveryOption) {
    const safeSubtotal = nonNegativeInt(subtotal);
    const deliveryFee = deliveryOption?.kind === 'FIXED' ? nonNegativeInt(deliveryOption.payableFee ?? deliveryOption.fee) : 0;
    return { subtotal: safeSubtotal, deliveryFee, payableTotal: safeSubtotal + deliveryFee };
  }

  function validateConfig(config, regionIds) {
    const normalized = normalizeConfig(config, regionIds);
    const issues = [];
    // 2026-09: region o'z narxini kiritmagan (fee === null) bo'lsa ham, agar
    // "Umumiy qiymat" yoqilgan va musbat narx bilan bo'lsa — bu YARAROQ
    // (fallback ishlaydi), xato emas. Faqat ikkalasi ham yo'q/0 bo'lsa xato.
    const fixedGeneralFee = normalized.delivery.fixed.general?.enabled ? normalized.delivery.fixed.general.fee : null;
    for (const [regionId, entry] of Object.entries(normalized.delivery.fixed.regions)) {
      const effectiveFee = entry.fee ?? fixedGeneralFee;
      if (entry.enabled && !(effectiveFee > 0)) issues.push({ code: 'FIXED_FEE_REQUIRED', regionId });
    }
    // 7-band: narx to'liq ixtiyoriy bo'lgani uchun endi FAQAT haqiqiy
    // nomuvofiqlik (ikkalasi ham kiritilgan-u max < min) xato hisoblanadi —
    // narxning umuman yo'qligi endi yaroqli holat (izoh yoki standart matn
    // bilan ko'rsatiladi).
    const taxiGeneral = normalized.delivery.taxi.general || {};
    if (taxiGeneral.minFee !== null && taxiGeneral.maxFee !== null && taxiGeneral.maxFee < taxiGeneral.minFee) {
      issues.push({ code: 'TAXI_RANGE_INVALID', regionId: null });
    }
    for (const [regionId, entry] of Object.entries(normalized.delivery.taxi.regions)) {
      if (entry.enabled && entry.minFee !== null && entry.maxFee !== null && entry.maxFee < entry.minFee) {
        issues.push({ code: 'TAXI_RANGE_INVALID', regionId });
      }
    }
    const card = normalized.payments.methods.find(method => method.id === 'CARD');
    if (card?.enabled && Object.keys(card.regions).length && (!/^\d[\d ]{10,30}\d$/.test(card.cardNumber) || !card.cardHolder)) {
      issues.push({ code: 'CARD_DETAILS_REQUIRED' });
    }
    const qr = normalized.payments.methods.find(method => method.id === 'QR');
    if (qr?.enabled && Object.keys(qr.regions).length && !(qr.providers || []).some(p => p.enabled && p.paymentUrl)) {
      issues.push({ code: 'QR_PROVIDER_REQUIRED' });
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
    districtAllowed,
    deliveryOptions,
    paymentOptions,
    calculateTotals,
    validateConfig,
  });
});
