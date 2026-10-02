const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
const api = fs.readFileSync(path.join(root, 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');

test('next tier prompt is server-authoritative, scoped and only returned near its threshold', () => {
  const start = api.indexOf('async function resolveNextTierOpportunity');
  const end = api.indexOf('// VIP mijoz', start);
  assert.ok(start > 0 && end > start);
  const block = api.slice(start, end);
  assert.match(block, /eq\("is_active", true\)/);
  assert.match(block, /tier\.starts_at/);
  assert.match(block, /tier\.ends_at/);
  assert.match(block, /scopeMatches/);
  assert.match(block, /Math\.min\(100000, thresholdAmount \* 0\.10\)/);
  assert.match(block, /remainingAmount > nearLimit/);
});

test('discount preview separates promo, tier and personal discounts and includes next tier', () => {
  const start = api.indexOf('case "discount_preview"');
  const end = api.indexOf('case "create_order"', start);
  const block = api.slice(start, end);
  assert.match(block, /resolveNextTierOpportunity/);
  // 042: vipDiscount is now computed INSIDE resolveBestCartDiscount (shared
  // by both the single-best and the new combining path) rather than
  // re-derived here from best.source — this case just forwards the field.
  assert.match(block, /vipDiscount: Number\(best\.vipDiscount\) \|\| 0/);
  assert.match(block, /promoDiscount: Number\(best\.promoDiscount\) \|\| 0/);
  assert.match(block, /nextTier/);
});

test('cart shows every applied discount and final payable total', () => {
  assert.match(app, /function loadCartDiscountPreview/);
  assert.match(app, /promoDiscount.*tierDiscount.*vipDiscount/s);
  assert.match(app, /const payableTotal = Math\.max\(0, total - totalDiscount\)/);
  assert.match(app, /fc-cart-tier-progress/);
  assert.match(css, /\.fc-cart-tier-progress/);
  assert.match(css, /\.fc-cart-price-summary/);
});

// Savatchadagi chegirma bosqichlari — bir nechta nuqtali gorizontal
// progress (barcha faol bosqichlar bittada ko'rinadi, faqat "juda yaqin"
// holatda emas). Ish paketi: "1-paket, 3-topshiriq".
test('tier progress reuses the EXISTING marketing-campaigns tier list (get_marketing_campaigns), not a new backend calculation', () => {
  assert.match(app, /const allTiers = marketingCampaigns\.filter\(c => c\.kind === 'TIER'\)/);
  assert.match(app, /ensureMarketingCampaignsLoaded\(\(\) => \{ if \(currentTab === 'cart'\) render\(\); \}\);/);
});

test('achieved tier index comes from the server-authoritative cartDiscountState.tier, not re-derived client-side', () => {
  assert.match(app, /const achievedTierIndex = appliedTier \? allTiers\.findIndex\(t => t\.id === appliedTier\.id\) : -1;/);
  assert.match(app, /const nextTierFull = allTiers\[achievedTierIndex \+ 1\] \|\| null;/);
});

test('ladder shows ALL active tiers as dots (not capped to 3), positioned proportionally by threshold — no hardcoded percents/amounts', () => {
  const start = app.indexOf('${allTiers.length ? `<div class="fc-cart-tier-progress">');
  assert.notEqual(start, -1);
  const block = app.slice(start, start + 900);
  assert.match(block, /allTiers\.map\(\(t, i\) =>/, 'dots must be generated from the dynamic tier list, not a fixed count');
  assert.doesNotMatch(block, /left:2%|left:3%|left:5%|>2%<|>3%<|>5%</, 'no hardcoded example percentages from the spec should leak into real code');
  assert.match(block, /discountPctLabel\(t\)/, 'each dot must show its OWN tier\'s real percent/sum, not a hardcoded label');
});

test('the "add more" message uses the exact required wording ("tovar qo\'shing", never "xarid qiling") and a dynamically computed remaining amount', () => {
  const start = app.indexOf('function renderCart(container)');
  const block = app.slice(start, start + 13200);
  assert.match(block, /tovar qo'shing — chegirma \$\{discountPctLabel\(nextTierFull\)\} bo'ladi/);
  assert.doesNotMatch(block, /xarid qiling/i);
  assert.match(block, /Math\.max\(0, nextTierFull\.thresholdAmount - total\)/, 'remaining amount must be computed dynamically from the real threshold, not hardcoded');
});

test('reaching the highest tier shows a "you\'re at the max" message instead of the "add more" nudge (no next tier to offer)', () => {
  const start = app.indexOf('function renderCart(container)');
  // 2026-08-31: renderCart() grew a few lines (per-variant price resolution
  // for cart line items) — window widened to keep reaching this further down.
  const block = app.slice(start, start + 12600);
  assert.match(block, /achievedTierIndex === allTiers\.length - 1 \? `<p>\$\{tr\("Eng yuqori chegirma bosqichidasiz\./);
});

test('the whole ladder is skipped (not rendered) when the shop has zero active tiers — matches the old nextTier-gated behavior of showing nothing', () => {
  const start = app.indexOf('function renderCart(container)');
  const block = app.slice(start, start + 12200);
  assert.match(block, /\$\{allTiers\.length \? `<div class="fc-cart-tier-progress">/);
});

test('tier progress CSS is real: track, fill and dot rules all exist, dot positions are clamped in JS (not CSS) to avoid edge clipping', () => {
  assert.match(css, /\.fc-cart-tier-progress-track\{/);
  assert.match(css, /\.fc-cart-tier-progress-fill\{/);
  assert.match(css, /\.fc-cart-tier-progress-dot\{/);
  assert.match(css, /\.fc-cart-tier-progress-dot\.is-reached/);
  assert.match(css, /\.fc-cart-tier-progress-dot\.is-next/);
  assert.match(app, /Math\.max\(4, Math\.min\(96,/, 'dot left% must be clamped so edge labels do not clip off the card');
});

test('checkout also displays personal discount instead of mislabelling it as promo', () => {
  assert.match(app, /id="checkout-vip-row"/);
  // 042: the VIP row is now visible whenever a personal discount EXISTS
  // (so the customer can see and toggle its checkbox), not only when it is
  // currently applied (amount > 0) — that's what the checkbox is for.
  assert.match(app, /vipRowEl\.classList\.toggle\('hidden', !checkoutVipInfo\)/);
});
