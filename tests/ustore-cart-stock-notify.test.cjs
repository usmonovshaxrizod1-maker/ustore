// USTORE — Savatni tashlab ketganlar + "Kelganda xabar bering" (Online
// Do'kon yaxshilashlari, 2/3-band). Statik tahlil, loyihaning qolgan
// qismidagi uslubda.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shopApi = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
const migration024 = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '024_cart_and_stock_notifications.sql'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');

test('024 migration: cart_logs and stock_notifications are shop-scoped, RLS-enabled, and use composite (shop_id, ...) FKs into app_users/products', () => {
  assert.match(migration024, /foreign key \(shop_id, tg_id\) references public\.app_users\(shop_id, tg_id\) on delete cascade\s*\n\);\s*\n\s*\ncreate index if not exists cart_logs_shop_updated_idx/);
  assert.match(migration024, /foreign key \(shop_id, product_id\) references public\.products\(shop_id, id\) on delete cascade/);
  assert.match(migration024, /alter table public\.cart_logs enable row level security;/);
  assert.match(migration024, /alter table public\.stock_notifications enable row level security;/);
});

test('024 migration: a customer can only have ONE active (not-yet-notified) stock subscription per product — enforced by a partial unique index, not app-level checking alone', () => {
  assert.match(migration024, /create unique index if not exists stock_notifications_unique_active\s*\n\s*on public\.stock_notifications\(shop_id, tg_id, product_id\) where notified_at is null;/);
});

test("list_abandoned_carts requires requirePermission('marketing.manage') and only shows carts idle for 30+ minutes, computing cart value from LIVE product data (never a stale stored price)", () => {
  const start = shopApi.indexOf('case "list_abandoned_carts"');
  const end = shopApi.indexOf('\n      // ==================== BACK-IN-STOCK', start);
  const block = shopApi.slice(start, end > start ? end : start + 2500);
  assert.match(block, /await requirePermission\('marketing\.manage'\);/);
  assert.match(block, /Date\.now\(\) - 30 \* 60 \* 1000/);
  assert.match(block, /db\.from\("products"\)\.select\("id,name,price,img,status,is_visible,variants"\)/, 'cart value must be computed from live products and exact variant prices');
  assert.match(block, /p\.status === "DELETED" \|\| p\.is_visible === false\) return null/, 'deleted/hidden products must be excluded from the abandoned-cart total, not silently priced in');
});

test('save_cart_snapshot deletes the row when the cart is empty (so an emptied/converted cart never shows up as "abandoned"), and create_order deletes it again on successful checkout as a second safety net', () => {
  const snapStart = shopApi.indexOf('case "save_cart_snapshot"');
  const snapBlock = shopApi.slice(snapStart, snapStart + 500);
  assert.match(snapBlock, /if \(!items\.length && !bundleItems\.length\) \{\s*\n\s*await db\.from\("cart_logs"\)\.delete\(\)/);

  const orderStart = shopApi.indexOf('case "create_order"');
  const orderEnd = shopApi.indexOf('\n      case "cancel_order"', orderStart);
  const orderBlock = shopApi.slice(orderStart, orderEnd);
  assert.match(orderBlock, /await db\.from\("cart_logs"\)\.delete\(\)\.eq\("shop_id", shopId\)\.eq\("tg_id", tgId\);/);
});

test('subscribe_stock_notification only allows an actually out-of-stock target: exact SKU when variantSku is supplied, otherwise the whole product', () => {
  const start = shopApi.indexOf('case "subscribe_stock_notification"');
  const block = shopApi.slice(start, start + 1200);
  assert.match(block, /const qty = variantQtyBySku\(product, variantSku\);/);
  assert.match(block, /if \(qty === null\) return json\(\{ error: "variant_not_found" \}, 404\);/);
  assert.match(block, /if \(qty > 0\) return json\(\{ error: "already_in_stock" \}, 400\);/);
  assert.match(block, /else if \(\(Number\(product\.stock\) \|\| 0\) > 0\) return json\(\{ error: "already_in_stock" \}, 400\);/);
});

test('restock notification helper fires only on 0-or-below -> positive transitions (product and exact SKU), is reused by Kirim/bulk updates, and marks pending subscriptions notified', () => {
  const start = shopApi.indexOf('async function notifyBackInStockSubscribers(');
  const helperBlock = shopApi.slice(start, start + 1900);
  assert.match(helperBlock, /\.is\("notified_at", null\)/);
  assert.match(helperBlock, /notified_at: new Date\(\)\.toISOString\(\)/);
  assert.match(helperBlock, /variantSku \? q\.eq\("variant_sku", variantSku\) : q\.is\("variant_sku", null\)/);

  const transitionStart = shopApi.indexOf('async function triggerRestockTransitions(');
  const transitionBlock = shopApi.slice(transitionStart, transitionStart + 1800);
  assert.match(transitionBlock, /Number\(before\.stock\).*<= 0 && \(Number\(after\.stock\).* > 0/);
  assert.match(transitionBlock, /prev <= 0 && next > 0/);
  assert.match(transitionBlock, /notifyBackInStockSubscribers\(db, shopId, productId, botToken, sku\)/);

  const kirimStart = shopApi.indexOf('case "record_stock_in"');
  const kirimBlock = shopApi.slice(kirimStart, kirimStart + 2600);
  assert.match(kirimBlock, /await triggerRestockTransitions\(db, shopId, current, updated, BOT_TOKEN\);/);
  assert.match(shopApi, /if \(before\) await triggerRestockTransitions\(db, shopId, before, data, BOT_TOKEN\);/);
});

test('boot() returns both product-level and exact-variant restock subscription state without per-product round trips', () => {
  const start = shopApi.indexOf('case "boot"');
  const end = shopApi.indexOf('\n      case ', start + 10);
  const block = shopApi.slice(start, end > start ? end : start + 7000);
  assert.match(block, /const subsPromise = db\.from\("stock_notifications"\)\.select\("product_id,variant_sku"\).*\.is\("notified_at", null\);/);
  assert.match(block, /mySubscribedProductIds: \(subsR\.data \|\| \[\]\)\.filter\(\(r: any\) => !r\.variant_sku\)\.map\(\(r: any\) => r\.product_id\),/);
  assert.match(block, /stockSubscriptions: \(subsR\.data \|\| \[\]\)\.map\(\(r: any\) => \(\{ productId: r\.product_id, variantSku: r\.variant_sku \|\| null \}\)\),/);
});

test('the frontend cart-snapshot save is debounced (not one request per +/- click) and hooks into updateCartBadge() — the single choke point every cart mutation already calls — instead of being duplicated across each add/remove/qty-change call site', () => {
  const start = appJs.indexOf('function updateCartBadge()');
  const end = appJs.indexOf('function readBlobAsArrayBuffer', start);
  const block = appJs.slice(start, end > start ? end : start + 1400);
  assert.match(block, /scheduleCartSnapshotSave\(\);/);
  assert.match(block, /setTimeout\(\(\) => \{[\s\S]*?callApi\('save_cart_snapshot', \{ items, bundleItems \}\)\.catch\(\(\) => \{\}\);\s*\n\s*\}, 1500\);/);
});

test('the back-in-stock subscribe button only appears when the product is genuinely out of stock (p.stock > 0 branch never renders it), and toggling calls the matching subscribe/unsubscribe action', () => {
  assert.match(appJs, /renderStockSubscribeButtonHtml\(p\)/);
  const start = appJs.indexOf('async function toggleStockSubscription(');
  const block = appJs.slice(start, start + 700);
  assert.match(block, /callApi\(subscribe \? 'subscribe_stock_notification' : 'unsubscribe_stock_notification'/);
});
