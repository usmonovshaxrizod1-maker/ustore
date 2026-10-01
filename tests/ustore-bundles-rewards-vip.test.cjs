// Shop takomillashtirish (qo'shimcha talablar): bundle/tier/reward/VIP
// discount backend. Lean per economical-usage rule — focused on
// correctness-critical points (atomicity, idempotency, stacking, security).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shopApi = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '033_bundles_rewards_vip_discounts.sql'), 'utf8');

test('reward_issuances has TWO partial unique indexes enforcing idempotency at the DB level: one order can never get the same ORDER_TOTAL reward twice, and one customer can never get the same LIFETIME_TOTAL reward twice', () => {
  assert.match(migration, /create unique index if not exists reward_issuances_lifetime_once_idx\s*\n\s*on public\.reward_issuances\(shop_id, rule_id, tg_id\) where order_id is null;/);
  assert.match(migration, /create unique index if not exists reward_issuances_per_order_once_idx\s*\n\s*on public\.reward_issuances\(shop_id, rule_id, order_id\) where order_id is not null;/);
});

test('checkAndIssueRewards deletes the just-created reward promo on a 23505 (unique-violation) insert failure into reward_issuances — never leaves an orphaned, unaccounted-for promo code if the idempotency check loses a race', () => {
  const start = shopApi.indexOf('async function checkAndIssueRewards(');
  const end = shopApi.indexOf('\nasync function ', start + 10);
  const block = shopApi.slice(start, end > start ? end : start + 3500);
  assert.match(block, /await db\.from\("promotions"\)\.delete\(\)\.eq\("id", promo\.id\)\.eq\("shop_id", shopId\);/);
});

test('checkAndIssueRewards only fetches the customer\'s lifetime order total ONCE even if multiple LIFETIME_TOTAL rules exist (cached in lifetimeTotal, not re-queried per rule)', () => {
  const start = shopApi.indexOf('async function checkAndIssueRewards(');
  const end = shopApi.indexOf('\nasync function ', start + 10);
  const block = shopApi.slice(start, end > start ? end : start + 3500);
  assert.match(block, /if \(lifetimeTotal === null\) \{/);
});

test('resolveTierDiscount only ever returns the FIRST matching tier after sorting by threshold_amount DESCENDING — the highest qualifying tier wins, tiers never stack', () => {
  const start = shopApi.indexOf('async function resolveTierDiscount(');
  const block = shopApi.slice(start, start + 800);
  assert.match(block, /\.order\("threshold_amount", \{ ascending: false \}\);/);
});

test('resolveVipDiscount treats a null starts_at as "already started" (uses an .or() null-or-past filter, matching the same pattern activeBannersForClient already uses for schedule filtering) — a VIP discount without an explicit start date must not be silently excluded', () => {
  const start = shopApi.indexOf('async function resolveVipDiscount(');
  const block = shopApi.slice(start, start + 600);
  assert.match(block, /\.or\(`starts_at\.is\.null,starts_at\.lte\.\$\{nowIso\}`\)/);
});

test('resolveBestCartDiscount returns null immediately (no discount at all) when the cart has a bundle and stacking is not explicitly allowed — bundle price is never silently discounted further', () => {
  const start = shopApi.indexOf('async function resolveBestCartDiscount(');
  // 042: the function's own return-type annotation grew (COMBINED source,
  // vipInfo, opts param) so the gate check now sits a bit further from the
  // function's opening line — window widened accordingly.
  const block = shopApi.slice(start, start + 900);
  assert.match(block, /if \(hasBundleInCart && !allowStackingWithBundle\) return null;/);
});

test('resolveBestCartDiscount picks the single highest discountAmount among promo/VIP/tier candidates (sorts descending, takes [0]) — never sums or stacks them', () => {
  const start = shopApi.indexOf('async function resolveBestCartDiscount(');
  const end = shopApi.indexOf('\nasync function generateRewardCode', start);
  const block = shopApi.slice(start, end > start ? end : start + 2000);
  assert.match(block, /candidates\.sort\(\(a, b\) => b\.discountAmount - a\.discountAmount\);/);
  assert.match(block, /const best = candidates\[0\];/);
});

test('create_order expands bundle components into the SAME rpcItems array passed to the unchanged place_order RPC — atomicity (all-or-nothing stock decrement) comes for free from the RPC\'s existing single-transaction behavior, no new RPC or duplicated stock logic was written', () => {
  const start = shopApi.indexOf('case "create_order"');
  const end = shopApi.indexOf('case "cancel_order"', start);
  const block = shopApi.slice(start, end > start ? end : start + 12000);
  assert.match(block, /rpcItems\.push\(\{/);
  assert.match(block, /product_id: pid, qty: \(Math\.max\(1, Math\.round\(Number\(c\.qty\) \|\| 1\)\)\) \* req\.qty/);
  assert.match(block, /source_type: "BUNDLE"/);
  assert.match(block, /db\.rpc\("place_order", \{[\s\S]*p_items: rpcItems/);
  assert.doesNotMatch(block, /create or replace function/i, 'must not define a new/modified SQL function inline — place_order stays untouched');
});

test('a bundle_create/bundle_update rejects any component product id that does not belong to the current shop (never trusts client-supplied product ids blindly), and requires at least 2 products (a single-product "bundle" is just a discount, not a bundle)', () => {
  const start = shopApi.indexOf('case "bundle_create"');
  const end = shopApi.indexOf('case "bundle_delete"', start);
  const block = shopApi.slice(start, end > start ? end : start + 2000);
  assert.match(block, /if \(items\.length < 2\) return json\(\{ error: "bundle_needs_at_least_2_products" \}, 400\);/);
  assert.match(block, /db\.from\("products"\)\.select\("id"\)\.eq\("shop_id", shopId\)\.in\("id", productIds\);/);
});

test('customer_discount_create validates every target tg_id is an ACTUAL existing customer of this shop (app_users), requires an end date (VIP discounts are always temporary per spec), and fires Telegram notifications via EdgeRuntime.waitUntil AFTER the DB insert already succeeded — a notification failure can never roll back the discount', () => {
  const start = shopApi.indexOf('case "customer_discount_create"');
  const end = shopApi.indexOf('case "customer_discount_cancel"', start);
  const block = shopApi.slice(start, end > start ? end : start + 4500);
  assert.match(block, /if \(!endsAt\) return json\(\{ error: "end_date_required" \}, 400\);/);
  assert.match(block, /db\.from\("app_users"\)\.select\("tg_id"\)\.eq\("shop_id", shopId\)\.in\("tg_id", tgIds\);/);
  const insertIdx = block.indexOf('.from("customer_discounts").insert(rows)');
  const waitUntilIdx = block.indexOf('EdgeRuntime.waitUntil(');
  assert.ok(insertIdx >= 0 && waitUntilIdx > insertIdx, 'the DB insert must complete before any notification is fired');
});

test('all new marketing/discount actions (bundle/discount_tier/reward_rule/customer_discount CRUD) require an explicit permission — bundle+tier+reward via marketing.manage, customer_discount via customers.manage', () => {
  for (const action of ['bundle_create', 'discount_tier_create', 'reward_rule_create']) {
    const start = shopApi.indexOf(`case "${action}"`);
    assert.ok(start >= 0, `${action} must exist`);
    assert.match(shopApi.slice(start, start + 200), /await requirePermission\('marketing\.manage'\);/, `${action} must require marketing.manage`);
  }
  const start = shopApi.indexOf('case "customer_discount_create"');
  assert.match(shopApi.slice(start, start + 200), /await requirePermission\('customers\.manage'\);/);
});

test('get_campaign_detail returns a plain not_found error (never throws/500s) for a bundle or promotion that is missing, inactive, or outside its schedule window — banner deep-links to a since-deleted/expired campaign must be able to fall back safely instead of showing a broken page', () => {
  const start = shopApi.indexOf('case "get_campaign_detail"');
  const end = shopApi.indexOf('case "promo_preview"', start);
  const block = shopApi.slice(start, end > start ? end : start + 2500);
  const notFoundCount = (block.match(/return json\(\{ error: "not_found" \}, 404\);/g) || []).length;
  assert.ok(notFoundCount >= 4, `expected at least 4 not_found guards (missing/inactive x2 kinds + schedule x2 kinds), found ${notFoundCount}`);
});

test('get_marketing_campaigns only ever returns bundles and MANUAL-source promotions — reward/VIP discounts are personal and must never appear in the public browsable campaign list', () => {
  const start = shopApi.indexOf('case "get_marketing_campaigns"');
  const block = shopApi.slice(start, start + 900);
  assert.match(block, /\.eq\("source", "MANUAL"\)/);
});

test('the VIP-discount and reward-code Telegram notifications are bilingual (UZ+RU in one message) because app_users has no per-customer language column to look up — this was a real bug caught and fixed before shipping (an invented ui_lang column that does not exist)', () => {
  assert.doesNotMatch(shopApi, /app_users"\)\.select\("ui_lang"\)/, 'must not query a non-existent ui_lang column');
  const vipStart = shopApi.indexOf('case "customer_discount_create"');
  const vipEnd = shopApi.indexOf('case "customer_discount_cancel"', vipStart);
  const vipBlock = shopApi.slice(vipStart, vipEnd > vipStart ? vipEnd : vipStart + 4000);
  assert.match(vipBlock, /text: `\$\{textUz\}\\n\\n\$\{textRu\}`/);
});
