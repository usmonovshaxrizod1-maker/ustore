const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadBrowserUmd } = require('./helpers/load-browser-umd.cjs');

const root = path.join(__dirname, '..');
const commerce = loadBrowserUmd(path.join(root, 'ustore-commerce.js'), 'UstoreCommerce');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');

const REGIONS = [
  'tashkent_city', 'tashkent_region',
  'andijan', 'bukhara', 'fergana', 'jizzakh',
  'khorezm', 'namangan', 'navoi', 'qashqadaryo',
  'karakalpakstan', 'samarkand', 'sirdaryo', 'surxondaryo',
];

function block(src, startNeedle, endNeedle, limit = 6000) {
  const start = src.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing ${startNeedle}`);
  const end = endNeedle ? src.indexOf(endNeedle, start + startNeedle.length) : -1;
  return src.slice(start, end > start ? end : start + limit);
}

// ---- 1. Schema/defaults ----
test('defaultConfig gives FREE/FIXED/TAXI each their own "Umumiy qiymat" block, all OFF by default; FIXED gets a fee field, FREE does not', () => {
  const cfg = commerce.defaultConfig(REGIONS);
  assert.deepEqual(cfg.delivery.free.general, { enabled: false, comment: null, estimatedTime: null });
  assert.deepEqual(cfg.delivery.fixed.general, { enabled: false, fee: null, comment: null, estimatedTime: null });
  assert.deepEqual(cfg.delivery.taxi.general, { enabled: false, exactFee: null, minFee: null, maxFee: null, comment: null, estimatedTime: null });
  assert.equal(cfg.delivery.post.general, undefined, 'POST was explicitly excluded from this feature');
});

// ---- 2. Toggle gating ----
test('"Umumiy qiymat" only acts as a fallback when its own enabled flag is true — for all three kinds', () => {
  const raw = commerce.defaultConfig(REGIONS);
  raw.delivery.free.enabled = true;
  raw.delivery.free.regions.tashkent_city = { enabled: true }; // no own comment
  raw.delivery.free.general = { enabled: false, comment: 'Umumiy bepul izoh', estimatedTime: null };
  raw.delivery.fixed.enabled = true;
  raw.delivery.fixed.regions.andijan = { enabled: true }; // no own fee -> would be invalid without a fallback
  raw.delivery.fixed.general = { enabled: false, fee: 25000, comment: null, estimatedTime: null };
  const off = commerce.normalizeConfig(raw, REGIONS);
  assert.equal(off.delivery.free.general.enabled, false);
  assert.equal(commerce.deliveryOptions(off, 'tashkent_city').find(o => o.kind === 'FREE').comment, null, 'disabled general must NOT apply as a fallback');
  // Same pre-existing gap as before this feature: deliveryOptions() itself
  // doesn't re-validate (it trusts an already-validated config); the real
  // guarantee is that validateConfig() refuses to let this state be saved.
  const offValidation = commerce.validateConfig(off, REGIONS);
  assert.equal(offValidation.issues.filter(i => i.code === 'FIXED_FEE_REQUIRED' && i.regionId === 'andijan').length, 1, 'a FIXED region with no fee and general OFF must fail validation at save time');

  raw.delivery.free.general.enabled = true;
  raw.delivery.fixed.general.enabled = true;
  const on = commerce.normalizeConfig(raw, REGIONS);
  assert.equal(commerce.deliveryOptions(on, 'tashkent_city').find(o => o.kind === 'FREE').comment, 'Umumiy bepul izoh');
  const fixedOnOption = commerce.deliveryOptions(on, 'andijan').find(o => o.kind === 'FIXED');
  assert.equal(fixedOnOption.fee, 25000);
  assert.equal(fixedOnOption.payableFee, 25000);
});

test('a region\'s own value always wins over "Umumiy qiymat" even when the general fallback is enabled', () => {
  const raw = commerce.defaultConfig(REGIONS);
  raw.delivery.fixed.enabled = true;
  raw.delivery.fixed.general = { enabled: true, fee: 25000, comment: 'Umumiy', estimatedTime: null };
  raw.delivery.fixed.regions.andijan = { enabled: true, fee: 40000, comment: 'Andijon uchun maxsus' };
  const config = commerce.normalizeConfig(raw, REGIONS);
  const option = commerce.deliveryOptions(config, 'andijan').find(o => o.kind === 'FIXED');
  assert.equal(option.fee, 40000);
  assert.equal(option.comment, 'Andijon uchun maxsus');
});

// ---- 3. Legacy migration (TAXI only) ----
test('legacy TAXI general data (no explicit "enabled", but real values present) migrates to enabled:true so existing shops keep working; FREE/FIXED never had this shape before so they default to false with no migration', () => {
  const raw = commerce.defaultConfig(REGIONS);
  raw.delivery.taxi.general = { exactFee: 35000, minFee: null, maxFee: null, comment: null };
  const config = commerce.normalizeConfig(raw, REGIONS);
  assert.equal(config.delivery.taxi.general.enabled, true);

  const rawEmpty = commerce.defaultConfig(REGIONS);
  rawEmpty.delivery.taxi.general = { exactFee: null, minFee: null, maxFee: null, comment: null };
  const configEmpty = commerce.normalizeConfig(rawEmpty, REGIONS);
  assert.equal(configEmpty.delivery.taxi.general.enabled, false, 'no real legacy value present -> stays off');
});

// ---- 4. validateConfig ----
test('validateConfig no longer requires a FIXED region to have its own fee when "Umumiy qiymat" covers it, but still requires SOME source of a positive fee', () => {
  const withGeneral = commerce.defaultConfig(REGIONS);
  withGeneral.delivery.fixed.enabled = true;
  withGeneral.delivery.fixed.general = { enabled: true, fee: 30000, comment: null, estimatedTime: null };
  withGeneral.delivery.fixed.regions.jizzakh = { enabled: true }; // no own fee
  const okResult = commerce.validateConfig(withGeneral, REGIONS);
  assert.equal(okResult.issues.filter(i => i.code === 'FIXED_FEE_REQUIRED').length, 0);

  const withoutGeneral = commerce.defaultConfig(REGIONS);
  withoutGeneral.delivery.fixed.enabled = true;
  withoutGeneral.delivery.fixed.regions.jizzakh = { enabled: true }; // no own fee, no general either
  const badResult = commerce.validateConfig(withoutGeneral, REGIONS);
  assert.equal(badResult.issues.filter(i => i.code === 'FIXED_FEE_REQUIRED' && i.regionId === 'jizzakh').length, 1);
});

// ---- 5. Client UI: toggle-gated, fields hidden until enabled, reused per-region field set ----
test('renderDeliveryGeneralCard shows the enable toggle unconditionally but the value fields ONLY when enabled — for FREE, FIXED and TAXI alike', () => {
  const card = block(app, 'function renderDeliveryGeneralCard(kind, general) {', 'function renderFulfillmentDeliveryBody', 3000);
  assert.match(card, /onchange="setGeneralEnabled\('\$\{kind\}',this\.checked\)"/, 'the toggle itself is always rendered');
  assert.match(card, /\$\{g\.enabled \? valueFields\.join\(''\) : ''\}/, 'value fields render only when enabled');
  assert.match(card, /kind === 'FIXED'[\s\S]*?setGeneralNumber\('FIXED','fee'/, 'FIXED gets the same fee field its region rows use');
  assert.match(card, /kind === 'TAXI'[\s\S]*?setGeneralNumber\('TAXI','exactFee'/, 'TAXI keeps its existing exact/min/max fields');
  // FREE gets neither a fee input nor TAXI's price fields — only comment/estimatedTime.
  const freeOnlyCheck = card.slice(0, card.indexOf("valueFields.push(`<label"));
  assert.doesNotMatch(freeOnlyCheck.replace(/if \(kind === 'FIXED'\)[\s\S]*?\n      \}/, '').replace(/if \(kind === 'TAXI'\)[\s\S]*?\n      \}/, ''), /setGeneralNumber\('FREE'/);
});

test('renderFulfillmentDeliveryBody wires the same general card into FREE, FIXED and TAXI (not just TAXI as before)', () => {
  const body = block(app, 'function renderFulfillmentDeliveryBody() {', 'function renderDeliveryGeneralCard', 3000);
  assert.match(body, /const generalHtml = renderDeliveryGeneralCard\(kind, method\.general\);/);
  assert.doesNotMatch(body, /kind === 'TAXI' \?/, 'the old TAXI-only branch must be gone — generalHtml now applies uniformly');
});

test('generic setGeneral* setters are keyed by DELIVERY_CONFIG_KEYS (FREE/FIXED/TAXI), replacing the old TAXI-only functions', () => {
  assert.match(app, /function setGeneralEnabled\(kind, enabled\) \{/);
  assert.match(app, /function setGeneralNumber\(kind, field, value\) \{/);
  assert.match(app, /function setGeneralComment\(kind, value\) \{/);
  assert.match(app, /function setGeneralEstimatedTime\(kind, value\) \{/);
  const enabledFn = block(app, 'function setGeneralEnabled(kind, enabled) {', 'function setGeneralNumber');
  assert.match(enabledFn, /rerenderFulfillmentBody\(\);/, 'toggling re-renders so fields appear/disappear immediately');
  assert.doesNotMatch(app, /function setTaxiGeneralNumber|function setTaxiGeneralComment|function setTaxiGeneralEstimatedTime/, 'old TAXI-only setters must be gone, not left dangling alongside the new generic ones');
});

// ---- 6. Server mirrors the client exactly ----
test('sanitizeGeneral (server) mirrors normalizeGeneral (client): same legacy-migration rule, same per-kind fields', () => {
  const fn = block(api, 'function sanitizeGeneral(raw: any, kind:', 'function cleanConfigRegions', 1200);
  assert.match(fn, /hasLegacyValue = kind === "TAXI"/);
  assert.match(fn, /kind === "FIXED"\) entry\.fee = nonNegativeIntegerOrNull/);
  assert.match(fn, /kind === "TAXI"\) \{/);
  assert.doesNotMatch(api, /function sanitizeTaxiGeneral/, 'old TAXI-only sanitizer must be gone');
});

test('server-side resolveDeliverySnapshot (the authoritative, money-affecting checkout path) applies the same general-value fallback as the client for FREE and FIXED, gated by .enabled', () => {
  const snap = block(api, 'function resolveDeliverySnapshot(', 'if (selectedMethodId.startsWith("POST:")', 3000);
  assert.match(snap, /const general = config\.delivery\.free\?\.general\?\.enabled \? config\.delivery\.free\.general : \{\};/);
  assert.match(snap, /const general = config\.delivery\.fixed\?\.general\?\.enabled \? config\.delivery\.fixed\.general : \{\};/);
  assert.match(snap, /const general = config\.delivery\.taxi\?\.general\?\.enabled \? config\.delivery\.taxi\.general : \{\};/);
  assert.match(snap, /const fee = r\.fee != null \? nonNegativeInteger\(r\.fee\) : \(general\.fee != null \? nonNegativeInteger\(general\.fee\) : 0\);/);
  assert.match(snap, /if \(fee <= 0\) throw new Error\("delivery_method_not_available"\);/, 'still rejects checkout if neither the region nor the general fallback has a usable FIXED fee');
});

test('server-side strict fee-required validation (set_fulfillment_config save path) allows the "Umumiy qiymat" fallback the same way client validateConfig does', () => {
  const sanitizer = block(api, 'function sanitizeFulfillmentConfig(raw: any, strict = false) {', 'base.delivery.taxi.enabled', 2000);
  assert.match(sanitizer, /const fixedGeneralFee = base\.delivery\.fixed\.general\.enabled \? base\.delivery\.fixed\.general\.fee : null;/);
  assert.match(sanitizer, /const effectiveFee = \(entry as any\)\.fee \?\? fixedGeneralFee;/);
  assert.match(sanitizer, /if \(!\(effectiveFee > 0\)\) throw new Error\(`fixed_fee_required:\$\{regionId\}`\);/);
  // the per-region hard-required throw must be gone from cleanConfigRegions itself (moved to the post-pass above).
  const cleanRegions = block(api, 'function cleanConfigRegions(raw: any,', 'function sanitizeFulfillmentConfig', 2000);
  assert.doesNotMatch(cleanRegions, /fixed_fee_required/, 'the old unconditional per-region throw must be removed — general fallback needs to be considered first');
});

// ---- 7. Scope: POST was explicitly excluded per follow-up feedback ----
test('POST delivery was deliberately NOT given a general-value card, per explicit follow-up ("pochtaga qilmayapman")', () => {
  assert.doesNotMatch(app, /renderDeliveryGeneralCard\('POST'|renderDeliveryGeneralCard\(kind, method\.general\);[\s\S]{0,50}post/i);
  const postBody = block(app, "if (kind === 'POST') {", "const key = DELIVERY_CONFIG_KEYS[kind]", 1500);
  assert.doesNotMatch(postBody, /renderDeliveryGeneralCard/, 'POST branch renders providers directly, no general card involved');
});
