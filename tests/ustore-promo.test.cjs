// USTORE — Promo-kod / discount-code tizimi testlari (Online Do'kon
// yaxshilashlari, 1-band). Bu yerda ham loyihaning qolgan qismidagi kabi
// HAQIQIY Supabase yo'q — statik tahlil orqali arxitektura kafolatlarini
// tekshiramiz: chegirma faqat backendda hisoblanadi, tenant izolyatsiyasi
// buzilmagan, va create_order/checkout to'g'ri joyga ulangan.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FUNCTIONS_DIR = path.join(__dirname, '..', 'supabase', 'functions');
const shopApi = fs.readFileSync(path.join(FUNCTIONS_DIR, 'shop-api', 'index.ts'), 'utf8');
const migration023 = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '023_promo_codes.sql'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

test('023 migration: promotions + promotion_redemptions carry shop_id and are RLS-enabled', () => {
  assert.match(migration023, /create table if not exists public\.promotions \(/);
  assert.match(migration023, /shop_id uuid not null references public\.shops\(id\) on delete cascade/);
  assert.match(migration023, /unique \(shop_id, code\)/);
  assert.match(migration023, /create table if not exists public\.promotion_redemptions \(/);
  assert.match(migration023, /alter table public\.promotions enable row level security;/);
  assert.match(migration023, /alter table public\.promotion_redemptions enable row level security;/);
});

test('023 migration: promotion_redemptions uses composite (shop_id, ...) foreign keys into promotions and orders, not bare ids — DB-level tenant isolation', () => {
  assert.match(migration023, /foreign key \(shop_id, promotion_id\) references public\.promotions\(shop_id, id\) on delete cascade/);
  assert.match(migration023, /foreign key \(shop_id, order_id\) references public\.orders\(shop_id, id\) on delete cascade/);
});

test('023 migration: orders gets promo_code/promo_discount as an ADDITIVE column (existing orders unaffected, default 0 discount)', () => {
  assert.match(migration023, /alter table public\.orders\s*\n\s*add column if not exists promo_code text,\s*\n\s*add column if not exists promo_discount numeric\(14,2\) not null default 0;/);
});

// ---------------------------------------------------------------------------
// Backend — access control
// ---------------------------------------------------------------------------

// Admin Roles & Permissions round, 2.2-bosqich: bu 4 ta action endi
// requireAdmin() o'rniga requirePermission('marketing.manage') orqali
// himoyalangan — OWNER/platforma bosh admin avvalgidek to'liq huquqli
// qoladi (requirePermission ularni rol tekshiruvisiz o'tkazadi), lekin
// endi 'marketing.manage' huquqiga ega STAFF ham foydalana oladi.
for (const action of ['promo_list', 'promo_create', 'promo_update', 'promo_delete']) {
  test(`${action} requires requirePermission('marketing.manage') — only an owner or a staff member with marketing permission manages promotions`, () => {
    const idx = shopApi.indexOf(`case "${action}"`);
    assert.ok(idx >= 0, `${action} action must exist`);
    const block = shopApi.slice(idx, idx + 400);
    assert.match(block, /await requirePermission\('marketing\.manage'\);/, `${action} must call requirePermission('marketing.manage')`);
  });
}

test('promo_preview does NOT require any permission — any authenticated customer must be able to try a code at checkout', () => {
  const idx = shopApi.indexOf('case "promo_preview"');
  assert.ok(idx >= 0);
  const end = shopApi.indexOf('\n      case "create_order"', idx);
  const block = shopApi.slice(idx, end > idx ? end : idx + 1500);
  assert.doesNotMatch(block, /requireAdmin\(\)|requirePermission\(/);
});

// ---------------------------------------------------------------------------
// Backend — single source of truth for the discount calculation
// ---------------------------------------------------------------------------

test('resolvePromoDiscount is the ONLY place that computes a promo-CODE discount amount (manual or reward code — both are just promotions rows), and both promo_preview and create_order (via resolveBestCartDiscount) call it — no duplicated/divergent discount math for codes', () => {
  assert.match(shopApi, /async function resolvePromoDiscount\(/);
  const previewStart = shopApi.indexOf('case "promo_preview"');
  const previewEnd = shopApi.indexOf('\n      case "create_order"', previewStart);
  const previewBlock = shopApi.slice(previewStart, previewEnd);
  assert.match(previewBlock, /resolvePromoDiscount\(db, shopId, String\(payload\.code \|\| ""\), tgId, subtotal, productIds\)/);

  // create_order no longer calls resolvePromoDiscount directly — it goes
  // through resolveBestCartDiscount (shop-improvement round: promo/VIP/tier
  // now compete for "best single discount", so create_order must pick ONE
  // shared resolver, not call resolvePromoDiscount ad hoc).
  const orderStart = shopApi.indexOf('case "create_order"');
  const orderEnd = shopApi.indexOf('\n      case "cancel_order"', orderStart);
  const orderBlock = shopApi.slice(orderStart, orderEnd);
  assert.match(orderBlock, /resolveBestCartDiscount\(/);
  assert.doesNotMatch(orderBlock, /resolvePromoDiscount\(/, 'create_order must go through resolveBestCartDiscount, not call resolvePromoDiscount directly');

  // resolveBestCartDiscount itself must call resolvePromoDiscount for the
  // PROMO candidate — not reimplement code-discount math inline.
  const bestStart = shopApi.indexOf('async function resolveBestCartDiscount(');
  const bestEnd = shopApi.indexOf('\nasync function checkAndIssueRewards', bestStart);
  const bestBlock = shopApi.slice(bestStart, bestEnd > bestStart ? bestEnd : bestStart + 2500);
  assert.match(bestBlock, /await resolvePromoDiscount\(db, shopId, promoCodeInput, tgId, subtotal, cartProductIds\)/);

  // Both computations happen server-side from a server-derived subtotal —
  // neither ever takes a discount NUMBER from the client.
  assert.doesNotMatch(shopApi, /discountAmount:\s*payload\./, 'discountAmount must never be read directly from client payload');
});

test('resolvePromoDiscount checks active/date-range/min-order/scoping/usage-limit/per-customer-limit BEFORE computing a discount, and clamps the result to never exceed the subtotal', () => {
  const start = shopApi.indexOf('async function resolvePromoDiscount(');
  const end = shopApi.indexOf('\ncase ', start); // never matches inside a function; fall back to a generous slice
  const block = shopApi.slice(start, start + 3600);
  assert.match(block, /if \(!promo \|\| !promo\.is_active\) return \{ ok: false, error: "promo_not_found" \};/);
  assert.match(block, /promo\.starts_at.*getTime\(\) > now.*promo_not_started/s);
  assert.match(block, /promo\.ends_at.*getTime\(\) < now.*promo_expired/s);
  assert.match(block, /subtotal < Number\(promo\.min_order_amount\)/);
  // 15-band spec, 13/14-band: yuqori chegara + faqat berilgan mijozga cheklov.
  assert.match(block, /subtotal > Number\(promo\.max_order_amount\)/);
  assert.match(block, /!promo\.transferable.*promo_not_yours/s);
  assert.match(block, /promo_usage_limit_reached/);
  assert.match(block, /promo_customer_limit_reached/);
  assert.match(block, /Math\.max\(0, Math\.min\(Math\.round\(rawDiscount\), subtotal\)\)/, 'discount must be clamped into [0, subtotal] — never negative, never more than the order itself');
});

// ---------------------------------------------------------------------------
// Backend — create_order wiring (ordering matters: Click must invoice the
// DISCOUNTED amount, not the pre-discount one)
// ---------------------------------------------------------------------------

test('create_order resolves the best cart discount AFTER subtotal is known but BEFORE the Click invoice amount is computed, so Click never charges the pre-discount total', () => {
  const orderStart = shopApi.indexOf('case "create_order"');
  const subtotalIdx = shopApi.indexOf('let subtotal = Number(created?.subtotal', orderStart);
  const promoIdx = shopApi.indexOf('resolveBestCartDiscount(', orderStart);
  const payableIdx = shopApi.indexOf('const payableTotal = Math.max(0, subtotal + deliveryFee - totalDiscount);', orderStart);
  const clickIdx = shopApi.indexOf('clickCreateInvoice(clickCreds', orderStart);
  assert.ok(subtotalIdx > 0 && promoIdx > subtotalIdx, 'discount must be resolved after subtotal is known');
  assert.ok(payableIdx > promoIdx, 'payableTotal must be computed after the discount is resolved');
  assert.ok(clickIdx > payableIdx, 'Click invoice must be created using the ALREADY-discounted payableTotal');
});

test('an order row snapshots promo/tier/vip parts and discount_source; promo_code/redemption are written whenever the promo was ACTUALLY applied (promoDiscount > 0), not by matching an exact source string', () => {
  const orderStart = shopApi.indexOf('case "create_order"');
  const updateIdx = shopApi.indexOf('subtotal, delivery_fee: deliveryFee, payable_total: payableTotal', orderStart);
  const block = shopApi.slice(updateIdx, updateIdx + 1300);
  // 042: exact-source matching ("PROMO" || "PROMO_TIER") used to silently
  // drop the promo_code/redemption row whenever combining produced
  // discountSource "COMBINED" — a promo code could then be reused past its
  // per-customer/usage limit. Fixed to key off promoDiscount > 0 instead,
  // which is true under every source (PROMO/PROMO_TIER/COMBINED) whenever
  // a promo genuinely contributed to the discount.
  assert.doesNotMatch(block, /discountSource === "PROMO" \|\| discountSource === "PROMO_TIER"/,
    'must not gate on an exact source string — COMBINED mode would silently skip promo_code/redemption tracking');
  assert.match(block, /promo_code: \(appliedPromo && promoDiscount > 0\) \? appliedPromo\.code : null,/);
  assert.match(block, /promo_discount: promoDiscount, tier_discount: tierDiscount, vip_discount: vipDiscount,/);
  assert.match(block, /tier_snapshot: appliedTier \?/);
  assert.match(block, /discount_source: discountSource,/);
  const redemptionIdx = shopApi.indexOf('promotion_redemptions").insert', updateIdx);
  const redemptionBlock = shopApi.slice(redemptionIdx - 200, redemptionIdx);
  assert.match(redemptionBlock, /if \(appliedPromo\?\.id && promoDiscount > 0\) \{/,
    'promo redemption logging (usage-limit enforcement) must also key off promoDiscount > 0, not an exact source string');
});

test('a successful redemption is recorded in promotion_redemptions (for usage-limit/per-customer-limit enforcement on future orders), scoped to this shop', () => {
  const orderStart = shopApi.indexOf('case "create_order"');
  const orderEnd = shopApi.indexOf('\n      case "cancel_order"', orderStart);
  const block = shopApi.slice(orderStart, orderEnd > orderStart ? orderEnd : orderStart + 9000);
  assert.match(block, /db\.from\("promotion_redemptions"\)\.insert\(\{[\s\S]*shop_id: shopId, promotion_id: appliedPromo\.id, order_id: orderId, tg_id: tgId, discount_amount: promoDiscount,[\s\S]*\}\)/);
});

test('an invalid/expired/limit-reached promo at order time does NOT block the order — it silently applies zero discount instead (stock is already reserved by then, so failing here would strand an order)', () => {
  const orderStart = shopApi.indexOf('case "create_order"');
  const block = shopApi.slice(orderStart, orderStart + 3000);
  const promoBlockStart = block.indexOf('let appliedPromo');
  const promoBlockEnd = block.indexOf('const promoDiscount = appliedPromo');
  const promoBlock = block.slice(promoBlockStart, promoBlockEnd);
  assert.doesNotMatch(promoBlock, /return json\(\{ error:/, 'a promo resolution failure inside create_order must never return an error response');
});

// ---------------------------------------------------------------------------
// mapOrderForClient / mapPromoForClient
// ---------------------------------------------------------------------------

test('mapOrderForClient exposes promoCode/promoDiscount to the client (needed to show the applied code + savings on the order card/detail)', () => {
  const start = shopApi.indexOf('function mapOrderForClient(');
  const end = shopApi.indexOf('\nfunction mapPromoForClient', start);
  const block = shopApi.slice(start, end > start ? end : start + 800);
  assert.match(block, /promoCode: o\.promo_code \|\| null, promoDiscount: Number\(o\.promo_discount\) \|\| 0,/);
});

test('mapPromoForClient never leaks a raw DB row shape (snake_case) to the frontend — full camelCase mapping', () => {
  const start = shopApi.indexOf('function mapPromoForClient(');
  const end = shopApi.indexOf('\nasync function resolvePromoDiscount', start);
  const block = shopApi.slice(start, end);
  for (const key of ['discountType', 'discountValue', 'minOrderAmount', 'startsAt', 'endsAt', 'usageLimit', 'perCustomerLimit', 'categoryIds', 'productIds', 'isActive']) {
    assert.match(block, new RegExp(`${key}:`), `mapPromoForClient must expose ${key}`);
  }
});

// ---------------------------------------------------------------------------
// Frontend — checkout wiring
// ---------------------------------------------------------------------------

test('checkout sends promoCode to create_order, and formatOrderForUi preserves server payableTotal with promo+tier fallback', () => {
  const submitStart = appJs.indexOf('async function submitOrder()');
  const submitEnd = appJs.indexOf('\n    function openOrderSuccessCelebration', submitStart);
  const submitBlock = appJs.slice(submitStart, submitEnd > submitStart ? submitEnd : submitStart + 9000);
  assert.match(submitBlock, /promoCode: appliedPromoState\?\.code \|\| undefined,/);

  const fmtStart = appJs.indexOf('function formatOrderForUi(o)');
  const fmtBlock = appJs.slice(fmtStart, fmtStart + 700);
  assert.match(fmtBlock, /const promoDiscount = Math\.max\(0, Number\(o\?\.promoDiscount\) \|\| 0\);/);
  assert.match(fmtBlock, /const tierDiscount = Math\.max\(0, Number\(o\?\.tierDiscount\) \|\| 0\);/);
  // 042: vipDiscount joined the same fallback formula once VIP got its own
  // order column (it used to be folded into promoDiscount as a legacy hack).
  assert.match(fmtBlock, /const vipDiscount = Math\.max\(0, Number\(o\?\.vipDiscount\) \|\| 0\);/);
  assert.match(fmtBlock, /o\?\.payableTotal \?\? \(subtotal \+ deliveryFee - promoDiscount - tierDiscount - vipDiscount\)/);
});

test('applyPromoCode() sends the CURRENT cart (productId+qty) to promo_preview and never sends a client-computed discount amount anywhere', () => {
  const start = appJs.indexOf('async function applyPromoCode()');
  const end = appJs.indexOf('\n    function removeAppliedPromo', start);
  const block = appJs.slice(start, end > start ? end : start + 1500);
  assert.match(block, /callApi\('promo_preview', \{ code, items \}\)/);
  assert.doesNotMatch(block, /discountAmount:\s*\d/);
});

test('the Promo-kodlar admin page is gated behind isUserAnAdmin && isAdminMode, matching every other admin-only page', () => {
  const start = appJs.indexOf('function openPromoPage()');
  const block = appJs.slice(start, start + 200);
  assert.match(block, /if \(!\(isUserAnAdmin && isAdminMode\)\) return;/);
});

// ---------------------------------------------------------------------------
// Regression: existing checkout summary structure isn't broken
// ---------------------------------------------------------------------------

test('the promo discount row in the checkout summary is a real DOM element toggled with .hidden — not conditionally rebuilt HTML that could desync from the surrounding static template', () => {
  assert.match(appJs, /<div id="checkout-promo-row" class="fc-checkout-summary-discount hidden">/);
  assert.match(appJs, /promoRowEl\.classList\.toggle\('hidden', promoDiscount <= 0\)/);
  assert.match(appJs, /tierRowEl\.classList\.toggle\('hidden', tierDiscount <= 0\)/);
});
