// USTORE 042 — promo-kod + bosqichli chegirma + shaxsiy(VIP) chegirmani
// birga ishlatish (Marketing sozlamalari orqali yoqiladigan, standart
// bo'yicha O'CHIQ imkoniyat) + mijozning shaxsiy chegirmani checkbox bilan
// yoqish/o'chirish huquqi.
//
// Eng muhim invariant: standart holatda (allow_discount_combining=false)
// hech bir do'konning xatti-harakati bir bitcha ham o'zgarmasligi kerak —
// bu fayl shuni HAM tekshiradi (eski testlar bilan birga).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const api = fs.readFileSync(path.join(root, 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '042_discount_combining.sql'), 'utf8');

function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `manbada "${signature}" topilmadi`);
  let depth = 0, i = source.indexOf('{', start);
  assert.notEqual(i, -1, `"${signature}" uchun tana topilmadi`);
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
  }
  throw new Error(`"${signature}" yopilmagan`);
}

// resolveBestCartDiscount'ning parametr ro'yxati o'zi TypeScript obyekt-tur
// annotatsiyalarini o'z ichiga oladi (masalan `opts: { allowCombining:
// boolean; ... }`) — bu esa oddiy "birinchi topilgan { dan boshlab qavslarni
// sanash" usulini chalg'itadi (funksiya tanasi emas, o'sha ICHKI turdagi {
// dan sanay boshlaydi). Shuning uchun bu funksiya uchun haqiqiy tana
// boshlanishi funksiyaning ICHIDAGI, chalkashmaydigan bitta qatoridan
// (bundle-gate tekshiruvi) ORQAGA qarab qidiriladi.
function extractResolveBestCartDiscount() {
  const start = api.indexOf('async function resolveBestCartDiscount(');
  assert.notEqual(start, -1);
  const anchor = 'if (hasBundleInCart && !allowStackingWithBundle) return null;';
  const anchorIdx = api.indexOf(anchor, start);
  assert.notEqual(anchorIdx, -1);
  const bodyOpenIdx = api.lastIndexOf('{', anchorIdx);
  let depth = 0, i = bodyOpenIdx;
  for (; i < api.length; i++) {
    if (api[i] === '{') depth++;
    else if (api[i] === '}') { depth--; if (depth === 0) return api.slice(start, i + 1); }
  }
  throw new Error('resolveBestCartDiscount yopilmagan');
}

// ---------------------------------------------------------------------------
// Migratsiya
// ---------------------------------------------------------------------------

test('042 migratsiyasi additive, standart qiymati O\'CHIQ (false) va foiz 0-100 oralig\'ida cheklangan', () => {
  assert.match(migration, /add column if not exists allow_discount_combining boolean not null default false/);
  assert.match(migration, /add column if not exists max_combined_discount_percent numeric\(5,2\)/);
  assert.match(migration, /max_combined_discount_percent > 0 and max_combined_discount_percent <= 100/);
  assert.match(migration, /add column if not exists vip_discount numeric\(14,2\) not null default 0/);
  assert.doesNotMatch(migration, /drop column|drop table/i);
});

test('discount_source CHECK cheklovi COMBINED qiymatini ham, eski PROMO_TIER qiymatini ham qabul qiladi (eski buyurtmalar buzilmaydi)', () => {
  assert.match(migration, /check \(discount_source is null or discount_source in \('PROMO', 'VIP', 'TIER', 'PROMO_TIER', 'COMBINED'\)\)/);
});

// ---------------------------------------------------------------------------
// capDiscountParts — HAQIQIY ishga tushiriladigan test (pul matematikasi,
// eng xato qilinadigan joy). Manbadan to'g'ridan-to'g'ri ajratib olinadi.
// ---------------------------------------------------------------------------

function loadCapDiscountParts() {
  const signature = 'function capDiscountParts(parts: Array<{ key: string; amount: number }>, cap: number): Record<string, number> {';
  const start = api.indexOf(signature);
  assert.notEqual(start, -1, 'capDiscountParts topilmadi');
  // MUHIM: umumiy extractFunction() bu yerda ishlamaydi — imzoning o'zida
  // (`Array<{ key: string...`) ichki `{` bor, brace-counting o'shandan
  // chalkashib ketadi. Imzo satrining o'zi haqiqiy ochiluvchi qavs bilan
  // TUGAYDI (signature so'zma-so'z shunday yozilgan), shuning uchun tana
  // boshlanishi aniq — signature.length - 1 pozitsiyasidan sanaladi.
  const bodyStart = start + signature.length - 1;
  let depth = 0, i = bodyStart;
  for (; i < api.length; i++) {
    if (api[i] === '{') depth++;
    else if (api[i] === '}') { depth--; if (depth === 0) break; }
  }
  // Tananing ICHIDA ham bitta joyda TS tur annotatsiyasi bor
  // (`const result: Record<string, number> = {}`) — new Function() buni
  // oddiy JS sifatida talqin qila olmaydi, shuning uchun aniq shu bitta
  // o'rinni JS'ga moslab tozalaymiz (qolgan hammasi allaqachon toza JS).
  const bodyOnly = api.slice(bodyStart, i + 1)
    .replace('const result: Record<string, number> = {};', 'const result = {};');
  return new Function(`return function capDiscountParts(parts, cap) ${bodyOnly}`)();
}

test('capDiscountParts: yig\'indi cap dan kichik bo\'lsa, hech narsa o\'zgarmaydi', () => {
  const capDiscountParts = loadCapDiscountParts();
  const r = capDiscountParts([{ key: 'PROMO', amount: 1000 }, { key: 'TIER', amount: 2000 }], 5000);
  assert.deepEqual(r, { PROMO: 1000, TIER: 2000 });
});

test('capDiscountParts: yig\'indi cap dan oshsa, PROPORTSIONAL pasayadi va yig\'indi ANIQ cap ga teng bo\'ladi', () => {
  const capDiscountParts = loadCapDiscountParts();
  const r = capDiscountParts([{ key: 'PROMO', amount: 3000 }, { key: 'VIP', amount: 3000 }, { key: 'TIER', amount: 4000 }], 5000);
  const sum = r.PROMO + r.VIP + r.TIER;
  assert.equal(sum, 5000, 'yig\'indi so\'zma-so\'z cap ga teng bo\'lishi kerak — mijoz ko\'rgan qatorlar yig\'indisi haqiqiy chegirmaga mos kelishi shart');
  // Nisbat taxminan saqlanishi kerak (3000:3000:4000 -> 1500:1500:2000 atrofida).
  assert.ok(Math.abs(r.PROMO - r.VIP) <= 1, 'teng ulushlar deyarli teng bo\'lib qolishi kerak');
  assert.ok(r.TIER > r.PROMO, 'kattaroq ulush proratsiyadan keyin ham kattaroq bo\'lib qolishi kerak');
});

test('capDiscountParts: 100 turli xil (tasodifiy) holatda ham yig\'indi HECH QACHON cap dan oshmaydi va manfiy bo\'lmaydi', () => {
  const capDiscountParts = loadCapDiscountParts();
  let seed = 42;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 100; i++) {
    const parts = [
      { key: 'PROMO', amount: Math.floor(rnd() * 100000) },
      { key: 'VIP', amount: Math.floor(rnd() * 100000) },
      { key: 'TIER', amount: Math.floor(rnd() * 100000) },
    ];
    const cap = Math.floor(rnd() * 100000);
    const r = capDiscountParts(parts, cap);
    const sum = r.PROMO + r.VIP + r.TIER;
    assert.ok(sum <= cap, `sum(${sum}) cap(${cap}) dan oshmasligi kerak`);
    for (const k of ['PROMO', 'VIP', 'TIER']) assert.ok(r[k] >= 0, `${k} manfiy bo'lmasligi kerak`);
  }
});

test('capDiscountParts: yig\'indi 0 bo\'lsa (hech qanday chegirma yo\'q), hammasi 0 qaytadi, xato bermaydi', () => {
  const capDiscountParts = loadCapDiscountParts();
  const r = capDiscountParts([{ key: 'PROMO', amount: 0 }, { key: 'TIER', amount: 0 }], 5000);
  assert.deepEqual(r, { PROMO: 0, TIER: 0 });
});

// ---------------------------------------------------------------------------
// resolveBestCartDiscount — standart (combining o'chiq) rejim ESKI xatti-
// harakat bilan SO'ZMA-SO'Z bir xil qolishi kerak.
// ---------------------------------------------------------------------------

test('combining O\'CHIQ bo\'lganda eski "faqat eng foydalisi" mantig\'i (shu jumladan promo+tier maxsus holati) so\'zma-so\'z saqlanib qolgan', () => {
  const block = extractResolveBestCartDiscount();
  assert.match(block, /if \(opts\.allowCombining\) \{/, 'combining shoxobchasi mavjud bo\'lishi kerak');
  assert.match(block, /promoCandidate\.data\.allow_stacking && tier\.tier\.allow_stacking/, 'eski PROMO_TIER maxsus holati saqlanishi kerak');
  assert.match(block, /source: "PROMO_TIER"/);
  assert.match(block, /candidates\.sort\(\(a, b\) => b\.discountAmount - a\.discountAmount\);/, 'eski "eng kattasi" saralash mantig\'i saqlanishi kerak');
  assert.match(block, /const best = candidates\[0\];/);
});

test('VIP mavjudligi (vipInfo) HAR DOIM hisoblanadi — mijoz checkbox\'ni o\'chirgan bo\'lsa ham, "sizda shaxsiy chegirma bor" belgisi ko\'rinishi uchun', () => {
  const block = extractResolveBestCartDiscount();
  assert.match(block, /const vip = await resolveVipDiscount\(db, shopId, tgId, subtotal\);/);
  assert.match(block, /const vipInfo = vip \? \{ discountType: vip\.discount\.discount_type, discountValue: Number\(vip\.discount\.discount_value\) \} : null;/);
  assert.match(block, /if \(vip && opts\.includeVip\) candidates\.push/, 'VIP faqat opts.includeVip=true bo\'lganda "eligible" hisoblanadi');
});

test('combining YOQIQ bo\'lganda maxCombinedPercent subtotal foizidan cap hisoblaydi va capDiscountParts orqali proratsiya qiladi', () => {
  const block = extractResolveBestCartDiscount();
  const combiningStart = block.indexOf('if (opts.allowCombining) {');
  const combiningBlock = block.slice(combiningStart, block.indexOf('// --- Quyidagi', combiningStart));
  assert.match(combiningBlock, /Math\.floor\(\(subtotal \* opts\.maxCombinedPercent\) \/ 100\)/);
  assert.match(combiningBlock, /capDiscountParts\(candidates\.map/);
  assert.match(combiningBlock, /nonZeroCount > 1 \? "COMBINED"/);
});

test('bundle-gate (hasBundleInCart && !allowStackingWithBundle) HAR IKKALA rejimdan ham OLDIN tekshiriladi va real null qaytaradi', () => {
  const block = extractResolveBestCartDiscount();
  const idx = block.indexOf('if (hasBundleInCart && !allowStackingWithBundle) return null;');
  const combiningIdx = block.indexOf('if (opts.allowCombining)');
  assert.ok(idx > 0 && idx < combiningIdx, 'bundle gate combining tekshiruvidan oldin bo\'lishi kerak');
});

// ---------------------------------------------------------------------------
// discount_preview / create_order — preview va yakuniy hisob BIR XIL
// manbadan (shop_settings) o'qishi shart, aks holda savatda ko'rilgan
// summa checkout'da farq qilib qolishi mumkin edi.
// ---------------------------------------------------------------------------

test('discount_preview endi shop_settings\'dan combining/cap/bundle-stacking sozlamalarini o\'qiydi (avval bundle-stacking bayrog\'i qattiq false edi — real create_order bilan mos kelmasligi mumkin edi)', () => {
  const block = extractFunction(api, 'case "discount_preview": {');
  assert.match(block, /select\("allow_discount_stacking_with_bundle,allow_discount_combining,max_combined_discount_percent"\)/);
  assert.match(block, /const includeVip = payload\.useVip !== false;/);
  assert.doesNotMatch(block, /!!payload\.hasBundle, false,/, 'bundle-stacking bayrog\'i endi haqiqiy sozlamadan o\'qilishi kerak, qattiq false emas');
});

test('discount_preview promo obyektiga discountType/discountValue qo\'shdi (frontend "Promo-kod (12%)" kabi foiz ko\'rsatishi uchun)', () => {
  const block = extractFunction(api, 'case "discount_preview": {');
  assert.match(block, /discountType: best\.promotion\.discount_type, discountValue: Number\(best\.promotion\.discount_value\),/);
  assert.match(block, /vipInfo: best\.vipInfo,/);
  assert.match(block, /allowCombining: discountOpts\.allowCombining,/);
});

test('create_order XUDDI SHU shop_settings ustunlarini o\'qiydi va mijozning useVip tanlovini uzatadi — preview bilan yakuniy hisob manbasi bir xil', () => {
  const block = extractFunction(api, 'case "create_order": {');
  assert.match(block, /select\("fulfillment_config,allow_discount_stacking_with_bundle,allow_discount_combining,max_combined_discount_percent"\)/);
  assert.match(block, /includeVip: payload\.useVip !== false,/);
});

test('create_order endi vipDiscount\'ni alohida hisoblaydi va saqlaydi — eski "VIP summasini promo_discount\'ga yashirish" xatti-harakati olib tashlangan', () => {
  const block = extractFunction(api, 'case "create_order": {');
  assert.match(block, /let vipDiscount = 0;/);
  assert.match(block, /vipDiscount = Math\.min\(Number\(best\.vipDiscount\) \|\| 0, subtotal\);/);
  assert.doesNotMatch(block, /Legacy VIP had no dedicated snapshot column/, 'eski legacy-fold izohi olib tashlangan bo\'lishi kerak');
  assert.doesNotMatch(block, /if \(best\.source === "VIP"\) promoDiscount = totalDiscount;/, 'VIP endi promo_discount ichiga yashirilmasligi kerak');
});

test('mapOrderForClient vipDiscount maydonini qaytaradi (buyurtma tarixida shaxsiy chegirma alohida ko\'rinishi uchun)', () => {
  const start = api.indexOf('function mapOrderForClient(');
  const block = api.slice(start, start + 1900);
  assert.match(block, /tierDiscount: Number\(o\.tier_discount\) \|\| 0/);
  assert.match(block, /vipDiscount: Number\(o\.vip_discount\) \|\| 0/);
});

// ---------------------------------------------------------------------------
// set_marketing_settings — ruxsat, tekshiruv, boot() orqali ko'rinishi.
// ---------------------------------------------------------------------------

test('set_marketing_settings marketing.manage bilan himoyalangan va foiz qiymatini 0-100 oralig\'ida tekshiradi', () => {
  const block = extractFunction(api, 'case "set_marketing_settings": {');
  assert.match(block, /await requirePermission\('marketing\.manage'\);/);
  assert.match(block, /if \(!Number\.isFinite\(num\) \|\| num <= 0 \|\| num > 100\) return json\(\{ error: "invalid_max_percent" \}, 400\);/);
});

test('boot() javobi allowDiscountCombining/maxCombinedDiscountPercent\'ni frontend uchun qaytaradi', () => {
  assert.match(api, /allow_discount_combining,max_combined_discount_percent"\)\.eq\("shop_id", shopId\)\.maybeSingle\(\);/);
  assert.match(api, /allowDiscountCombining: shopRow\?\.allow_discount_combining === true,/);
  assert.match(api, /maxCombinedDiscountPercent: shopRow\?\.max_combined_discount_percent != null \? Number\(shopRow\.max_combined_discount_percent\) : null,/);
});

// ---------------------------------------------------------------------------
// Frontend — Marketing sozlamalari sahifasi, checkbox, ro'yxatga ulanish.
// ---------------------------------------------------------------------------

test('Marketing sozlamalari sahifasi ro\'yxatga (router+ruxsat) to\'liq ulangan', () => {
  assert.match(app, /case 'MARKETING_SETTINGS': renderMarketingSettingsPage\(container\); break;/);
  assert.match(app, /\['MARKETING_HUB','MARKETING_SETTINGS','BANNERS'/, 'marketing\\.manage ruxsat ro\'yxatiga qo\'shilishi kerak');
  assert.match(app, /function openMarketingSettingsPage\(\)/);
});

test('Marketing sozlamalari sahifasi standart holatda O\'CHIQ tumblerni ko\'rsatadi va faqat yoqilganda foiz maydonini ochadi', () => {
  const block = extractFunction(app, 'function renderMarketingSettingsPage(container)');
  assert.match(block, /allowDiscountCombining \? 'checked' : ''/);
  assert.match(block, /\$\{allowDiscountCombining \? `/, 'foiz maydoni faqat yoqilganda ko\'rinishi kerak');
  assert.match(block, /onchange="saveMarketingSettings\(\{allowDiscountCombining:this\.checked\}\)"/);
});

test('useVipDiscount HAR SESSIYADA standart YOQILGAN holatdan boshlanadi (localStorage\'da saqlanmaydi — mijoz o\'z chegirmasidan bexabar mahrum bo\'lib qolmasligi uchun)', () => {
  assert.match(app, /let useVipDiscount = true;/);
  assert.doesNotMatch(app, /localStorage\.[gs]etItem\([^)]*useVipDiscount/);
});

test('toggleVipDiscount() kesh kalitini tozalaydi va HAM savat, HAM checkout preview\'ini qayta so\'raydi', () => {
  const block = extractFunction(app, 'function toggleVipDiscount()');
  assert.match(block, /useVipDiscount = !useVipDiscount;/);
  assert.match(block, /cartDiscountPreviewKey = '';/);
  assert.match(block, /loadCartDiscountPreview\(\)\.finally\(render\);/);
  assert.match(block, /refreshCheckoutDiscountPreview\(\);/);
});

test('useVip tanlovi currentCartDiscountKey\'ga kiritilgan — aks holda checkbox bosilganda eski keshlangan natija ko\'rsatilib qolardi', () => {
  const block = extractFunction(app, 'function currentCartDiscountKey()');
  assert.match(block, /useVip: useVipDiscount/);
});

test('barcha uchta so\'rov (savat preview, checkout preview, create_order) useVip/useVipDiscount qiymatini serverga uzatadi', () => {
  assert.match(app, /callApi\('discount_preview', \{ items, promoCode: appliedPromoState\?\.code \|\| null, hasBundle: Object\.keys\(bundleCart\)\.length > 0, useVip: useVipDiscount \}\)/);
  assert.match(app, /callApi\('discount_preview',\{items,promoCode:code\|\|null,hasBundle:Object\.keys\(bundleCart\)\.length>0,useVip:useVipDiscount\}\)/);
  const createOrderCallIdx = app.indexOf("callApi('create_order', {");
  const submitBlock = app.slice(createOrderCallIdx, createOrderCallIdx + 500);
  assert.match(submitBlock, /useVip: useVipDiscount,/);
});

test('savat va checkout\'dagi VIP qatori mavjud bo\'lsa (vipInfo) DOIM ko\'rinadi, faqat qo\'llangan (vipDiscount>0) bo\'lganda emas — bu checkbox, natija emas', () => {
  assert.match(app, /\$\{vipInfo \? `<div class="fc-cart-vip-discount-row">/, 'savat: vipInfo bo\'yicha ko\'rinishi kerak');
  assert.match(app, /vipRowEl\.classList\.toggle\('hidden', !checkoutVipInfo\)/, 'checkout: vipInfo bo\'yicha ko\'rinishi kerak, vipDiscount emas');
});

test('discountPctLabel yordamchisi promo/tier/vip qatorlarining hammasida qayta ishlatiladi (bir xil "12%" / summa formatida)', () => {
  const usages = app.match(/discountPctLabel\(/g) || [];
  assert.ok(usages.length >= 4, `kamida 4 marta ishlatilishi kutilgan edi, topildi: ${usages.length}`);
});

test('order tarixi modalida shaxsiy(VIP) chegirma alohida qator sifatida ko\'rinadi (avval umuman ko\'rinmasdi, promo_discount ichiga yashiringan edi)', () => {
  assert.match(app, /Number\(o\.vipDiscount\)>0\?`<div class="is-discount"><span>\$\{tr\('Shaxsiy chegirma','Персональная скидка'\)\}<\/span><b>-\$\{money\(o\.vipDiscount\)\}<\/b><\/div>`:''/);
});

test('formatOrderForUi vipDiscount\'ni ham normallashtiradi (Math.max(0, Number(...))) va payableTotal zaxira formulasiga qo\'shadi', () => {
  const block = extractFunction(app, 'function formatOrderForUi(o) {');
  assert.match(block, /const vipDiscount = Math\.max\(0, Number\(o\?\.vipDiscount\) \|\| 0\);/);
  assert.match(block, /subtotal \+ deliveryFee - promoDiscount - tierDiscount - vipDiscount/);
});

// ---------------------------------------------------------------------------
// CSS — checkbox qatorlari ustore.css'da haqiqatan ta'riflangan.
// ---------------------------------------------------------------------------

test('.fc-cart-vip-discount-row va .fc-checkout-vip-check CSS qoidalari mavjud (avvalgi round\'da xuddi shu sababdan .fc-settings-toggle-row butunlay ta\'riflanmagan edi)', () => {
  assert.match(css, /\.fc-cart-vip-discount-row label,\.fc-checkout-vip-check\s*\{/);
});
