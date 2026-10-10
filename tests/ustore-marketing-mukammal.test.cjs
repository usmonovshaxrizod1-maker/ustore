const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '034_marketing_mukammal.sql'), 'utf8');
const commerceHardening = fs.readFileSync(path.join(root, 'supabase', 'migrations', '074_commerce_hardening.sql'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function apiBlock(startNeedle, endNeedle) {
  const start = api.indexOf(startNeedle);
  assert.ok(start >= 0, `missing ${startNeedle}`);
  const end = api.indexOf(endNeedle, start + startNeedle.length);
  return api.slice(start, end > start ? end : start + 12000);
}

test('034 is additive and adds real gift rules/usages with tenant keys and RLS', () => {
  assert.match(migration, /create table if not exists public\.automatic_gift_rules/);
  assert.match(migration, /create table if not exists public\.automatic_gift_usages/);
  assert.match(migration, /foreign key \(shop_id, gift_product_id\) references public\.products\(shop_id, id\)/);
  assert.match(migration, /unique \(shop_id, rule_id, order_id\)/);
  assert.match(migration, /alter table public\.automatic_gift_rules enable row level security/);
  assert.match(migration, /alter table public\.automatic_gift_usages enable row level security/);
});

test('034 adds promo/tier stacking flags and historical tier/gift order snapshots', () => {
  for (const needle of ['new_customer_only boolean', 'allow_stacking boolean', 'tier_discount numeric', 'tier_snapshot jsonb', 'gift_snapshot jsonb']) assert.ok(migration.includes(needle));
  assert.match(migration, /'PROMO_TIER'/);
});

// 3-paket, 7-topshiriq: bosqichli chegirma sanog'i endi `discount_tiers`
// (har bosqich) o'rniga `discount_tier_groups` (har qoida) jadvalidan —
// aks holda 1 ta 4-bosqichli qoida "4 ta jami" bo'lib ko'rinib, yangi
// guruhlangan UX'ga zid bo'lardi.
test('marketing summary is permission-gated, schedule-aware and counts exactly five tools', () => {
  const block = apiBlock('case "marketing_summary"', 'case "promo_generate_code"');
  assert.match(block, /requirePermission\('marketing\.manage'\)/);
  for (const table of ['banners', 'bundles', 'promotions', 'discount_tier_groups', 'automatic_gift_rules']) assert.ok(block.includes(`activeCount("${table}")`));
  assert.match(block, /starts_at\.is\.null,starts_at\.lte/);
  assert.match(block, /ends_at\.is\.null,ends_at\.gte/);
});

test('marketing hub has a compact summary and restores the home catalog card', () => {
  const start = app.indexOf('function renderMarketingHubPage');
  const block = app.slice(start, start + 2500);
  for (const key of ['banners', 'bundles', 'promos', 'tiers', 'gifts']) assert.ok(block.includes(`key: '${key}'`));
  assert.match(block, /openFeaturedCategoriesPage/);
  assert.match(block, /fc-marketing-summary/);
});

test('every marketing subpage back action returns to Marketing', () => {
  for (const fn of ['renderBannersPage', 'renderBundlesPage', 'renderDiscountTiersPage', 'renderRewardRulesPage', 'renderPromoPage']) {
    const start = app.indexOf(`function ${fn}`);
    const block = app.slice(start, start + 7000);
    assert.match(block, /onBack: "openMarketingHubPage\(\)"/, `${fn} must return to Marketing`);
  }
});

test('banner save captures every DOM field before saving render and refreshes storefront state without reload', () => {
  const block = app.slice(app.indexOf('async function saveBannerForm'), app.indexOf('async function toggleBannerActive'));
  assert.ok(block.indexOf("const title = document.getElementById('banner-f-title')") < block.indexOf('bannerSaving = true'));
  assert.ok(block.indexOf("const startsAt = document.getElementById('banner-f-starts')") < block.indexOf('bannerSaving = true'));
  assert.match(app, /function syncActiveBannersFromList/);
  assert.match(app, /bannerList = data\.banners \|\| \[\];\s*syncActiveBannersFromList\(\)/);
});

// 2-paket, 4-topshiriq: tartiblash endi vitrinadagi yuqori 5 slotda
// (`beginBannerSlotDrag`/`endBannerSlotDrag`, `bannerSlotList()` ustida) —
// pastki "Barcha bannerlar" ro'yxatida UMUMAN drag yo'q (talab bo'yicha).
test('banner reorder lives on the top 5 slots and persists server order', () => {
  assert.match(app, /fc-banner-slot-drag/);
  const block = app.slice(app.indexOf('async function endBannerSlotDrag'), app.indexOf('function bannerTargetLabel'));
  assert.match(block, /callApi\('banner_reorder'/);
  assert.match(block, /syncActiveBannersFromList\(\)/);
});

// 2-paket, 5-topshiriq: aksiya detail — mahsulotlar ro'yxati DOIM ko'rinadi
// (eski accordion/overlap-thumb naqshi olib tashlandi), 3 ta mini-statistika
// kartasi mavjud (existing bundlePriceFacts()'dan).
test('bundle detail has price facts and an always-visible product list (no collapsed accordion)', () => {
  const block = app.slice(app.indexOf('function openBundlePreview'), app.indexOf('function openBundleForm'));
  for (const cls of ['fc-campaign-stat-cards', 'fc-price-breakdown', 'fc-bundle-detail-products', 'fc-bundle-detail-product-row']) assert.ok(block.includes(cls));
  assert.match(block, /bundlePriceFacts\(b\)/);
  assert.doesNotMatch(block, /fc-bundle-products-collapse|fc-overlap-thumbs/);
});

test('bundle form payload is collected before saving render (form state regression)', () => {
  const block = app.slice(app.indexOf('async function saveBundleForm'), app.indexOf('async function deleteBundleAt'));
  assert.ok(block.indexOf('const description =') < block.indexOf('bundleSaving = true'));
  assert.ok(block.indexOf('const startsAt =') < block.indexOf('bundleSaving = true'));
  assert.ok(block.indexOf('const itemSnapshot =') < block.indexOf('bundleSaving = true'));
});

test('promo generator is server-side collision-safe within the current shop', () => {
  const block = apiBlock('case "promo_generate_code"', 'case "promo_list"');
  assert.match(block, /crypto\.randomUUID/);
  assert.match(block, /eq\("shop_id", shopId\)\.eq\("code", code\)/);
  assert.match(block, /for \(let attempt = 0; attempt < 8; attempt\+\+\)/);
});

test('promo new-customer, scope and stacking rules are enforced server-side', () => {
  const resolver = apiBlock('async function resolvePromoDiscount', 'async function resolveTierDiscount');
  assert.match(resolver, /promo\.new_customer_only/);
  assert.match(resolver, /eq\("shop_id", shopId\)\.eq\("tg_id", tgId\)/);
  assert.match(resolver, /promo_new_customers_only/);
  assert.match(resolver, /categoryIds\.length \|\| productIds\.length/);
  assert.match(api, /new_customer_only: !!payload\.newCustomerOnly, allow_stacking: !!payload\.allowStacking/);
});

test('promo detail is navigable/copyable and contains usage, scope, dates and stacking', () => {
  const block = app.slice(app.indexOf('function openPromoPreview'), app.indexOf('function openPromoForm'));
  for (const needle of ['copyTextToClipboard', 'usedCount', 'promoScopeLabel', 'allowStacking', 'startsAt', 'endsAt']) assert.ok(block.includes(needle));
});

test('promo form payload is fully captured before the saving rerender', () => {
  const block = app.slice(app.indexOf('async function savePromoForm'), app.indexOf('async function togglePromoActive'));
  assert.ok(block.indexOf('const payload =') < block.indexOf('promoSaving = true'));
  for (const field of ['categoryIds', 'productIds', 'newCustomerOnly', 'allowStacking']) assert.ok(block.includes(field));
});

test('tier list is ordered by threshold and backend validates dates/percentage', () => {
  const block = apiBlock('case "discount_tier_list"', 'case "discount_tier_delete"');
  assert.match(block, /order\("threshold_amount", \{ ascending: true \}\)/);
  assert.match(block, /invalid_date_range/);
  assert.match(block, /discountType === "PERCENT" && discountValue > 100/);
});

// 3-paket, 7-topshiriq: bosqichli chegirma endi "bitta qoida -> ko'p
// bosqich" guruh sifatida ko'rinadi (eski openTierPreview/openTierForm
// bitta-tier oqimi butunlay guruh-darajasidagi oqimga almashtirildi) —
// detail sahifasi diagramma + bosqichlar ro'yxatini chizadi, Tahrirlash
// BARCHA bosqichlarni bitta formda ochadi.
test('tier group detail renders a step diagram + step list and exposes an edit action for ALL steps at once', () => {
  const block = app.slice(app.indexOf('function renderTierGroupDetailPage'), app.indexOf('function renderTierFormSheet'));
  assert.match(block, /tierStepsDiagramSvg\(steps/);
  assert.match(block, /fc-tier-step-row/);
  assert.match(block, /sort\(\(a, b\) => a\.thresholdAmount - b\.thresholdAmount\)/);
  assert.match(block, /openTierGroupForm\('\$\{g\.id\}'\)/);
});

test('promo+tier stacking requires both flags and creates a combined authoritative source', () => {
  const block = apiBlock('async function resolveBestCartDiscount', 'async function resolveAutomaticGift');
  assert.match(block, /promoCandidate\.data\.allow_stacking && tier\.tier\.allow_stacking/);
  assert.match(block, /source: "PROMO_TIER"/);
  assert.match(block, /promoDiscount \+ tierDiscount/);
});

test('checkout preview and final order use the same best-discount resolver', () => {
  const preview = apiBlock('case "discount_preview"', 'case "create_order"');
  assert.match(preview, /resolveBestCartDiscount/);
  const order = apiBlock('case "create_order"', 'case "cancel_order"');
  assert.match(order, /resolveBestCartDiscount/);
  assert.match(order, /payableTotal = Math\.max\(0, subtotal \+ deliveryFee - totalDiscount\)/);
});

test('checkout visibly separates promo and tier discount rows', () => {
  assert.match(app, /id="checkout-tier-row"/);
  assert.match(app, /tierRowEl\.classList\.toggle\('hidden', tierDiscount <= 0\)/);
  assert.match(app, /totals\.payableTotal - totalDiscount/);
});

test('automatic gift CRUD is permission-gated and every query is shop-scoped', () => {
  for (const action of ['automatic_gift_list', 'automatic_gift_create', 'automatic_gift_delete']) {
    const block = apiBlock(`case "${action}"`, action === 'automatic_gift_list' ? 'case "automatic_gift_create"' : action === 'automatic_gift_create' ? 'case "automatic_gift_delete"' : '// ==================== VIP');
    assert.match(block, /requirePermission\('marketing\.manage'\)/);
    assert.match(block, /shopId/);
  }
});

test('automatic gift supports order amount, category quantity and specific product conditions', () => {
  const block = apiBlock('async function resolveAutomaticGift', '// Reward qoidalarini');
  for (const type of ['ORDER_AMOUNT', 'CATEGORY_QUANTITY', 'SPECIFIC_PRODUCT']) assert.ok(block.includes(`"${type}"`));
  assert.match(block, /threshold_quantity/);
  assert.match(block, /categoryByProduct/);
});

test('gift product is appended to the same atomic place_order call and snapshotted at zero price', () => {
  const block = apiBlock('case "create_order"', 'case "cancel_order"');
  const append = block.indexOf('product_id: String(automaticGift.giftProduct.id)');
  const place = block.indexOf('db.rpc("place_order"');
  assert.ok(append > 0 && place > append);
  assert.match(block, /source_type: "GIFT"/);
  assert.match(block, /price_override: 0/);
  assert.match(commerceHardening, /gift_snapshot = coalesce\(v_gift_snapshot, gift_snapshot\)/);
  assert.match(block, /automatic_gift_usages/);
});

test('gift stock race rolls back, auto-pauses, and retries once without double decrement', () => {
  const block = apiBlock('case "create_order"', 'case "cancel_order"');
  assert.match(block, /insufficient_stock:\$\{automaticGift\.giftProduct\.id\}/);
  assert.match(block, /automatic_gift_rules"\)\.update\(\{ is_active: false/);
  assert.match(block, /rpcItems\.pop\(\)/);
  assert.ok((block.match(/db\.rpc\("place_order"/g) || []).length >= 2);
});

test('used gift campaigns deactivate instead of destructive history deletion', () => {
  const block = apiBlock('case "automatic_gift_delete"', '// ==================== VIP');
  assert.match(block, /automatic_gift_usages/);
  assert.match(block, /deactivatedInsteadOfDeleted/);
});

test('deleting bundle/promo clears linked banner targets inside the same shop', () => {
  assert.match(api, /target_type: "NONE", target_promotion_id: null/);
  assert.match(api, /eq\("shop_id", shopId\)\.eq\("target_promotion_id", id\)/);
  assert.match(api, /target_type: "NONE", target_bundle_id: null/);
  assert.match(api, /eq\("shop_id", shopId\)\.eq\("target_bundle_id", id\)/);
});

test('marketing UI has dark-theme tokens and a 360px overflow fallback', () => {
  assert.match(css, /html\.ustore-dark-theme/);
  assert.match(css, /@media\(max-width:360px\)/);
  assert.match(css, /fc-marketing-hub-grid\{grid-template-columns:1fr\}/);
});

test('marketing frontend cache version is bumped together', () => {
  // POLISH ROUND (7-topshiriq, 2026-08-30): v99->v100 for this round's changes.
  assert.match(html, /ustore\.css\?v=332/);
  assert.match(html, /ustore-shop-app\.js\?v=335/);
});

