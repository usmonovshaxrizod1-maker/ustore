// USTORE — 4.3 (yetkazish kuzatuvi/"Qabul qildim"), 4.4 (qidiruv/saralash/
// badge), 4.5 (admin ichki izoh + do'kon pauza rejimi). Statik tahlil,
// loyihaning qolgan qismidagi uslubda — ixcham, faqat muhim kafolatlar.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shopApi = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
const rpcSql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '025_customer_delivery_confirm.sql'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');

// ---------------- 4.3 ----------------

test('a customer can only self-confirm DELIVERED from PROCESSING (never from NEW, never admin-only statuses) — enforced inside the RPC itself, not just by which button the frontend shows', () => {
  const start = rpcSql.indexOf('if not p_is_admin then');
  const block = rpcSql.slice(start, start + 500);
  assert.match(block, /if p_new_status = 'DELIVERED' then\s*\n\s*if v_order\.status <> 'PROCESSING' then\s*\n\s*raise exception 'forbidden:customer_status';/);
});

test('confirm_order_received reuses the same update_order_status RPC path (not a separate ad-hoc UPDATE) and is audited distinctly from an admin-driven status change', () => {
  const start = shopApi.indexOf('case "cancel_order"');
  const end = shopApi.indexOf('\n      case "approve_payment_receipt"', start);
  const block = shopApi.slice(start, end > start ? end : start + 3000);
  assert.match(block, /case "confirm_order_received"/);
  assert.match(block, /action === "confirm_order_received" \? "DELIVERED"/);
  assert.match(block, /action === "confirm_order_received" \? "ORDER_CONFIRMED_BY_CUSTOMER" : "ORDER_STATUS_CHANGED"/);
});

test('shipment.shippedAt is set once on first HANDED_TO_CARRIER and preserved (not overwritten) on later edits to the same shipment', () => {
  const start = shopApi.indexOf('case "update_shipment"');
  const end = shopApi.indexOf('\n      case "get_my_orders"', start);
  const block = shopApi.slice(start, end > start ? end : start + 2500);
  assert.match(block, /const shippedAt = status === "HANDED_TO_CARRIER" \? \(oldShipment\.shippedAt \|\| new Date\(\)\.toISOString\(\)\) : null;/);
});

test('the customer order detail only shows "Qabul qildim" while status is PROCESSING, and calls confirmOrderReceived (not a raw status-set call)', () => {
  assert.match(appJs, /o\.status === 'PROCESSING'\) \? `<button onclick="confirmOrderReceived\(\$\{o\.id\}\)"/);
});

// ---------------- 4.4 ----------------

test('search matches on the product\'s OWN category name too (not just name/sku/desc/variants), ranked below a direct name match', () => {
  const start = appJs.indexOf('function searchProducts(query)');
  const end = appJs.indexOf('\n    // NAVIGATION', start);
  const block = appJs.slice(start, end);
  assert.match(block, /const categoryMatch = !!\(catNorm && \(catNorm\.latin\.includes\(latin\) \|\| catNorm\.cyrillic\.includes\(cyrillic\)\)\);/);
  assert.match(block, /nameMatch \|\| skuMatch \|\| descMatch \|\| descRuMatch \|\| variantSkuMatch \|\| variantTextMatch \|\| categoryMatch/);
});

test('the "Chegirmali" filter only shows products with a real active discount (oldPrice > price), and is a real independent toggle alongside inStockOnly — not folded into a sort mode', () => {
  const start = appJs.indexOf('function applyCategoryFilter(list)');
  const block = appJs.slice(start, start + 1100);
  assert.match(block, /if \(categoryFilter\.discountOnly\) result = result\.filter\(productHasDiscount\);/);
  assert.match(appJs, /function productHasDiscount\(p\)/);
  assert.match(appJs, /function toggleDiscountOnlyFilter\(\)/);
});

test('a product can carry at most ONE badge (server whitelists exactly 4 values or null) — never an accumulating array, matching the "don\'t clutter the card" requirement', () => {
  const start = shopApi.indexOf('else if (f === "badge")');
  const block = shopApi.slice(start, start + 250);
  assert.match(block, /const allowedBadges = \["NEW", "TOP", "RECOMMENDED", "PROMO"\];/);
  assert.match(block, /dbUpdate\.badge = v && allowedBadges\.includes\(String\(v\)\) \? String\(v\) : null;/);
  assert.doesNotMatch(shopApi, /badges:\s*\[/, 'must never model this as a badges array');
});

test('the badge chip only renders when the product actually has a recognized badge, reusing the same PRODUCT_BADGE_LABELS map the admin picker uses (single source of truth for the 4 labels)', () => {
  const start = appJs.indexOf('function productBadgeChipHtml(p)');
  const block = appJs.slice(start, start + 250);
  assert.match(block, /if \(!p\.badge \|\| !PRODUCT_BADGE_LABELS\[p\.badge\]\) return '';/);
});

// ---------------- 4.5 ----------------

test('internal_note is only ever included in the client-facing order object when the CURRENT caller is admin (includeInternalNote passed per-request, not a static default) — get_my_orders never opts in', () => {
  const fnStart = shopApi.indexOf('function mapOrderForClient(');
  const fnBlock = shopApi.slice(fnStart, fnStart + 1300);
  assert.match(fnBlock, /\.\.\.\(opts\.includeInternalNote \? \{ internalNote: o\.internal_note \|\| null \} : \{\}\)/);

  const myOrdersStart = shopApi.indexOf('case "get_my_orders"');
  const myOrdersBlock = shopApi.slice(myOrdersStart, myOrdersStart + 800);
  assert.match(myOrdersBlock, /mapOrdersWithReturns\(db, shopId, data \|\| \[\], false\)/, 'a customer fetching their own orders must explicitly exclude internal notes');

  const allOrdersStart = shopApi.indexOf('case "get_all_orders"');
  const allOrdersBlock = shopApi.slice(allOrdersStart, allOrdersStart + 800);
  assert.match(allOrdersBlock, /mapOrdersWithReturns\(db, shopId, data \|\| \[\], true\)/);
});

test("set_order_internal_note requires requirePermission('orders.manage'), and set_orders_paused (2.6-bosqich) now requires requirePermission('shop.settings.manage') — both fully in the granular permission system", () => {
  const noteStart = shopApi.indexOf('case "set_order_internal_note"');
  assert.ok(noteStart >= 0);
  assert.match(shopApi.slice(noteStart, noteStart + 300), /await requirePermission\('orders\.manage'\);/);

  const pausedStart = shopApi.indexOf('case "set_orders_paused"');
  assert.ok(pausedStart >= 0);
  assert.match(shopApi.slice(pausedStart, pausedStart + 300), /await requirePermission\('shop\.settings\.manage'\);/);
});

test('create_order rejects new orders while paused with a clear, catalog-still-visible-only block — checked right after the existing blocked-user check, before any cart/stock work happens', () => {
  const start = shopApi.indexOf('case "create_order"');
  const block = shopApi.slice(start, start + 900);
  assert.match(block, /if \(pauseRow\?\.orders_paused\) return json\(\{ error: `orders_paused:\$\{pauseRow\.orders_paused_note \|\| ""\}` \}, 400\);/);
  const blockedIdx = block.indexOf('is_blocked');
  const pauseIdx = block.indexOf('orders_paused');
  assert.ok(blockedIdx >= 0 && pauseIdx > blockedIdx, 'the pause check must come after the blocked-user check, both before any order-building work');
});

test('the frontend blocks submitOrder() client-side when paused (before even reading form fields) as a UX nicety, on top of (not instead of) the server-side guard', () => {
  const start = appJs.indexOf('async function submitOrder()');
  const block = appJs.slice(start, start + 400);
  assert.match(block, /if \(ordersPaused\) \{/);
});
