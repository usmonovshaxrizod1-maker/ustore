// "UStorE — 15 ta aniqlangan kamchilikni tuzatish" — kichik, maqsadli
// statik-tahlil testlari. Har bir test bittadan bandga mos.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const api = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '038_promo_range_and_transferability.sql'), 'utf8');

test('1/2-band: the header identifies the shop by its own logo (from shopLogoUrl, never a hardcoded brand), the logo is shown WHOLE rather than cropped to a square, and the shop-name text was removed from the header so the logo and the ADMIN/STORE tag both fit on one row', () => {
  assert.match(html, /id="header-shop-logo"/);
  // Do'kon nomi header'dan ataylab olib tashlangan (foydalanuvchi so'rovi).
  assert.doesNotMatch(html, /id="header-shop-name"/);
  // Logotip QIRQILMASLIGI kerak: object-cover kvadratga kesib tashlaydi,
  // object-contain esa butun logotipni ko'rsatadi.
  const logoTag = html.match(/<img id="header-shop-logo"[^>]*>/)[0];
  assert.doesNotMatch(logoTag, /object-cover/, 'object-cover logotipni kvadratga qirqib tashlaydi');
  // MUHIM: bu loyihada HAQIQIY Tailwind yo'q — ustore.css qo'lda yozilgan va
  // ixtiyoriy-qiymatli klasslar (max-w-[9rem] kabi) unda umuman mavjud emas,
  // ya'ni ular jimgina ishlamaydi. Shu sabab logotip o'lchami utility
  // klasslarga emas, ustore.css'dagi ANIQ qoidaga tayanishi shart.
  assert.match(logoTag, /class="[^"]*\bustore-header-logo\b/, 'logotip o\'z CSS klassidan foydalanishi kerak');
  assert.doesNotMatch(logoTag, /max-w-\[/, 'ixtiyoriy-qiymatli Tailwind klassi bu build\'da ishlamaydi');
  const css = fs.readFileSync(path.join(__dirname, '..', 'ustore.css'), 'utf8');
  const rule = css.match(/\.ustore-header-logo\s*\{[^}]*\}/);
  assert.ok(rule, '.ustore-header-logo qoidasi ustore.css\'da haqiqatan mavjud bo\'lishi kerak');
  assert.match(rule[0], /object-fit:\s*contain/, 'logotip chekkalari kesilmasligi kerak');
  assert.match(rule[0], /width:\s*auto/, 'eni logotipning o\'z nisbatiga qarab bo\'lishi kerak');
  assert.match(rule[0], /max-width:\s*\d+px/, 'keng logotip ADMIN/STORE belgisini surib yubormasligi kerak');
  assert.match(rule[0], /height:\s*\d+px/, 'balandlik qatorga moslangan bo\'lishi kerak');
  const start = app.indexOf('function updateHeaderChrome()');
  const block = app.slice(start, start + 2000);
  assert.match(block, /shopLogoUrl/);
  // shopDisplayName() header'da endi ishlatilmaydi, lekin ilovaning boshqa
  // joylarida (buyurtma tasdig'i, xabarlar) hali ham kerak — o'chib ketmasin.
  assert.ok(app.includes('function shopDisplayName('), 'shopDisplayName() boshqa joylarda ishlatiladi, o\'chirilmasligi kerak');
  assert.doesNotMatch(app, /cachedBrand\?\.name \|\| 'UStorE'/);
});

test('2-band: logo upload/replace lives inside the "Do\'kon haqida" (SHOP_INFO) edit sheet, with a preview — not a separate standalone header button', () => {
  const start = app.indexOf("if (activePopupModal === 'SHOP_INFO') {");
  const block = app.slice(start, start + 3200);
  assert.match(block, /shop-info-logo-preview/);
  assert.match(block, /saveShopLogoFromPicker/);
});

test('3-band: the header role-switch button (togglePersonMenu) is visible whenever the user HAS admin rights, in BOTH admin and user mode — not only while in admin mode (the exact regression that hid "Adminga qaytish")', () => {
  const start = app.indexOf('function updateHeaderChrome()');
  const block = app.slice(start, start + 1200);
  assert.match(block, /personBtn\.classList\.toggle\('hidden', !isUserAnAdmin\)/);
  assert.match(block, /personBtn\.onclick = isUserAnAdmin \? togglePersonMenu : null;/);
});

test('4-band: the header cart icon is hidden while in admin mode (unchanged/confirmed behavior)', () => {
  const start = app.indexOf('function updateHeaderChrome()');
  const block = app.slice(start, start + 600);
  assert.match(block, /cartBtn\.classList\.toggle\('hidden', isAdminMode && isUserAnAdmin\)/);
});

test('6-band: banner carousel loops from first slot and tracks the active card', () => {
  const start = app.indexOf('function initBannerCarousel()');
  const end = app.indexOf('\n    }\n\n', start);
  const block = app.slice(start, end > start ? end : start + 3500);
  assert.match(block, /const initialIndex = 0;/);
  assert.match(block, /centerCard\(originalCards\[initialIndex\], 'auto'\)/);
  assert.match(block, /strip\.addEventListener\('scroll', updateActiveCard, \{ passive: true \}\);/);
  assert.match(block, /cloneNode\(true\)/);
  assert.match(block, /realIndex/);
});

test('7-band: the cart\'s tier-discount row shows the generic "Chegirma" label (not the technical "Bosqichli chegirma") plus a short why-explanation built from the applied tier\'s percent/threshold', () => {
  const start = app.indexOf('const discountRows = `');
  const block = app.slice(start, start + 700);
  // 042: the row now also shows the percent/sum in parens ("Chegirma (5%)")
  // between the generic label and the why-explanation — still generic,
  // still followed by tierWhy, just with the added discountPctLabel segment.
  assert.ok(block.includes("tr('Chegirma', 'Скидка')}${appliedTier ? ` (${discountPctLabel(appliedTier)})` : ''}${tierWhy"),
    'tier-discount row must lead with the generic "Chegirma" label, then its percent, then the why-explanation');
  assert.doesNotMatch(block, /Bosqichli chegirma/);
  const whyStart = app.indexOf('const tierWhy = appliedTier');
  assert.ok(whyStart > 0, 'tierWhy must be computed from cartDiscountState.tier');
});

test('8-band: resolveNextTierOpportunity only returns a next-tier offer for thresholds STRICTLY ABOVE the current subtotal, so a customer already at/above the highest tier gets no more "add more to unlock" messaging', () => {
  const start = api.indexOf('async function resolveNextTierOpportunity');
  const block = api.slice(start, start + 400);
  assert.match(block, /\.gt\("threshold_amount", subtotal\)/);
});

test('9-band: promo-code entry (input/apply/remove) now lives in the Cart (#cart-promo-wrap), not in the checkout form — and openCheckoutForm no longer resets appliedPromoState, so a code applied in the cart carries through to checkout untouched', () => {
  assert.doesNotMatch(app, /chk-promo-wrap/);
  assert.match(app, /id="cart-promo-wrap"/);
  assert.match(app, /id="cart-promo-code"/);
  const start = app.indexOf('function openCheckoutForm()');
  const block = app.slice(start, start + 700);
  assert.doesNotMatch(block, /appliedPromoState = null/);
});

test('11-band: discount_preview resolves the same automatic-gift rule create_order uses, and the order RPC receives the gift as a zero-price typed line', () => {
  const start = api.indexOf('case "discount_preview"');
  const end = api.indexOf('case "create_order"', start);
  const block = api.slice(start, end > start ? end : start + 2500);
  assert.match(block, /resolveAutomaticGift\(db, shopId, subtotal, cartLines\)/);
  assert.match(block, /gift,?\s*\}\);/);
  assert.match(api, /source_type: "GIFT"/);
  assert.match(api, /price_override: 0/);
  assert.match(app, /cartDiscountState\?\.gift/);
});

test('13-band: promotions support an optional max_order_amount (server validates min<=subtotal<=max, and rejects max<min at save time) alongside the existing min_order_amount', () => {
  assert.match(migration, /add column if not exists max_order_amount numeric\(14,2\)/);
  const start = api.indexOf('async function resolvePromoDiscount(');
  const block = api.slice(start, start + 1600);
  assert.match(block, /subtotal > Number\(promo\.max_order_amount\)/);
  assert.match(api, /if \(minOrderAmount !== null && maxOrderAmount !== null && maxOrderAmount < minOrderAmount\) return json\(\{ error: "invalid_amount_range" \}, 400\);/);
  assert.match(app, /id="promo-f-max"/);
});

test('14-band: a promo issued to a specific customer (issued_to_tg_id set) can only be redeemed by that same customer UNLESS the issuing reward_rule was marked transferable — enforced in resolvePromoDiscount (server-side), and the reward-rule form exposes the "who can use it" choice', () => {
  const start = api.indexOf('async function resolvePromoDiscount(');
  const block = api.slice(start, start + 1600);
  assert.match(block, /promo\.issued_to_tg_id && !promo\.transferable && String\(promo\.issued_to_tg_id\) !== String\(tgId\)/);
  assert.match(migration, /alter table public\.reward_rules[\s\S]*?add column if not exists transferable boolean not null default false;/);
  assert.match(app, /id="coupon-transferable"/);
  assert.match(api, /transferable: !!rule\.transferable/, 'checkAndIssueRewards must copy the rule\'s transferable flag onto each issued promo');
});

test('14-band: get_marketing_campaigns scopes personal promo codes to tgId, computes their usability, returns only ACTIVE codes, and the frontend hides empty marketing sections', () => {
  const start = api.indexOf('case "get_marketing_campaigns"');
  const end = api.indexOf('case "get_campaign_detail"', start);
  const block = api.slice(start, end > start ? end : start + 8000);
  assert.match(block, /eq\("issued_to_tg_id", tgId\)/);
  assert.match(block, /const status = !p\.is_active \? "INACTIVE" : used \? "USED" : expired \? "EXPIRED" : notStarted \? "INACTIVE" : "ACTIVE";/);
  assert.match(block, /\.filter\(\(p: any\) => p\.status === "ACTIVE"\)/);
  assert.match(app, /myPromoCodes = data\.myPromoCodes \|\| \[\];/);
  assert.match(app, /const visibleItems = items\.filter\(it => Number\(it\.count\) > 0\);/);
  assert.match(app, /tr\('Promo-kodlarim', 'Мои промокоды'\)/);
});

test('15-band: the banner admin page renders a fixed 5-slot grid (bannerSlotList caps at 5 active banners ordered by sortOrder) with a picker that reuses the EXISTING banner_update (isActive) and banner_reorder actions — no new banner CRUD was introduced', () => {
  assert.match(app, /function bannerSlotList\(\)/);
  assert.match(app, /\.slice\(0, 5\);/);
  const start = app.indexOf('async function assignBannerToSlot');
  const block = app.slice(start, start + 1200);
  assert.match(block, /callApi\('banner_update', \{ id: outgoing\.id, isActive: false \}\)/);
  assert.match(block, /callApi\('banner_update', \{ id: bannerId, isActive: true \}\)/);
  assert.match(block, /callApi\('banner_reorder', \{ order: newOrder \}\)/);
});
