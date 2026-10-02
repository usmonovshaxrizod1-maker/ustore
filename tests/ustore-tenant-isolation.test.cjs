// USTORE GREENFIELD — tenant isolation checks.
//
// IMPORTANT HONESTY NOTE: this environment has no live Supabase/Postgres —
// there is no database to actually create "Shop A" and "Shop B" in and
// prove a cross-tenant query returns 0 rows. What follows is STATIC
// ANALYSIS instead: it verifies the structural guarantees that make cross-
// tenant leakage impossible by construction (every business table carries
// shop_id, every query against those tables is filtered by it, no action
// ever trusts a client-supplied shop_id). This is a real and valuable
// safety net — it will fail loudly if a future change adds a new business
// table without shop_id, or a new query that forgets to scope it — but it
// is NOT a substitute for the live, end-to-end test described in
// USTORE_GREENFIELD_PHASE1_HISOBOT.md's "Test natijalari" section, which
// you should run once against the real deployed project (create two real
// shops, two real bots, and confirm neither can see the other's data).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const SERVER_PATH = path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts');

function readMigration(name) {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
}

const ALL_MIGRATIONS_SQL = fs.readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map(readMigration)
  .join('\n');

// Qator oxirlari (CRLF/LF) NORMALLASHTIRILADI. Buning sababi bor: quyidagi
// testlarning ba'zilari kod bo'laklarini `'return {\n    ok: true,'` kabi
// aniq matn bo'yicha kesib oladi. Fayl aralash qator oxirlariga ega bo'lsa
// (Windows'da tahrirlanganda oson yuz beradi), bunday qidiruv jimgina -1
// qaytaradi va kesilgan bo'lak BO'SH bo'lib qoladi — natijada test
// xavfsizlik qoidasini tekshirmasdan "o'tib" ketishi yoki aksincha
// sababsiz yiqilishi mumkin. Xavfsizlik testi hech qachon fayl qanday
// saqlanganiga bog'liq bo'lmasligi kerak.
const server = fs.readFileSync(SERVER_PATH, 'utf8').replace(/\r\n/g, '\n');

// Every table that genuinely belongs to one shop — i.e. everything except
// the platform-core identity tables (shops itself, shop_bots, shop_memberships
// are keyed by shop_id as a FK, not "owned data" in the same sense) and the
// one deliberately-global reference table.
const SHOP_OWNED_TABLES = [
  'categories', 'products', 'sku_counters', 'sku_free_pool',
  'product_price_history', 'import_batches', 'category_aliases',
  'trash_batches', 'trash_batch_items',
  'app_users', 'orders', 'payment_receipt_history', 'stock_movements',
  'user_favorites', 'user_recent_views',
  'support_tickets', 'support_ticket_messages', 'admin_audit_log',
  'shop_settings', 'design_settings',
];

test('every shop-owned table has a shop_id column referencing shops(id) somewhere in its CREATE TABLE', () => {
  for (const table of SHOP_OWNED_TABLES) {
    const createIdx = ALL_MIGRATIONS_SQL.indexOf(`create table if not exists public.${table} (`);
    assert.ok(createIdx >= 0, `CREATE TABLE for ${table} not found`);
    const closeIdx = ALL_MIGRATIONS_SQL.indexOf('\n);', createIdx);
    const body = ALL_MIGRATIONS_SQL.slice(createIdx, closeIdx);
    assert.match(body, /shop_id uuid( not null| primary key)? references public\.shops\(id\)/, `${table} must declare shop_id referencing shops(id)`);
  }
});

test('delivery_branches (the one deliberately-global table) has NO shop_id column', () => {
  const sql = readMigration('006_delivery_reference.sql');
  const createIdx = sql.indexOf('create table if not exists public.delivery_branches (');
  const closeIdx = sql.indexOf('\n);', createIdx);
  const body = sql.slice(createIdx, closeIdx);
  assert.doesNotMatch(body, /shop_id/i, 'delivery_branches must stay platform-global — a shop_id column here would be a real regression');
});

test('shop_id is never read from the client payload/body as an authorization input — only ever assigned from ctx.shopId (server-resolved)', () => {
  // "shop_id: shopId" (the ctx-derived local variable) is the ONLY
  // acceptable RHS pattern for a shop_id assignment in an insert/update
  // payload; "shop_id: payload." or "shop_id: body." would mean a client
  // could claim to belong to any shop.
  assert.doesNotMatch(server, /shop_id:\s*payload\./, 'must never assign shop_id from client payload');
  assert.doesNotMatch(server, /shop_id:\s*body\./, 'must never assign shop_id from client body');
  // p_shop_id (the RPC parameter name) must likewise only ever be passed
  // ctx.shopId / shopId (the local resolved from it), never payload/body.
  assert.doesNotMatch(server, /p_shop_id:\s*payload\./, 'must never pass a client-supplied shop id into an RPC call');
  assert.doesNotMatch(server, /p_shop_id:\s*body\./, 'must never pass a client-supplied shop id into an RPC call');
});

test('resolveShopContext resolves shopId from the shop_bots lookup, never trusts a client-supplied shopId directly', () => {
  const start = server.indexOf('async function resolveShopContext');
  const end = server.indexOf('\n}', server.indexOf('return {\n    ok: true,', start));
  const fn = server.slice(start, end);
  assert.match(fn, /botRow\.shop_id/, 'shopId in ctx must come from the shop_bots row found via botId, not from the request');
  assert.doesNotMatch(fn, /body\?\.shopId|body\.shopId|payload\?\.shopId|payload\.shopId/, 'must never read a shopId directly off the request body/payload');
});

test('every business-table query in the main switch is shop-scoped: no bare .from("<table>") without a nearby .eq("shop_id", ...) on the same statement', () => {
  // Heuristic, not a full parser: for each shop-owned table, find every
  // `.from("table")` call and check the ENCLOSING `case "action": { ... }`
  // block for shop_id scoping evidence — not just a small forward window,
  // because some inserts pass a variable (e.g. `dbRow`) that was built with
  // `shop_id: shopId` several lines EARLIER in the same block, and some
  // updates have a large object literal before their `.eq("shop_id", ...)`.
  // This intentionally over-flags rather than under-flags — a false
  // positive here means a human should go look, not that isolation broke.
  //
  // Two known, deliberate exceptions: the two pg_cron actions
  // (cleanup_expired_receipts / purge_expired_trash) scan ACROSS all shops
  // by design (see their own dedicated test below) and legitimately select
  // shop_id as a column rather than filtering by it.
  const CRON_EXEMPT_CASE_STARTS = ['action === "cleanup_expired_receipts"', 'action === "purge_expired_trash"'];

  function enclosingBlock(idx) {
    const caseStarts = [...server.matchAll(/case "[a-z_]+":|action === "[a-z_]+"/g)]
      .map((m) => m.index)
      .filter((i) => i <= idx);
    const blockStart = caseStarts.length ? caseStarts[caseStarts.length - 1] : 0;
    const nextCase = server.indexOf('case "', idx + 1);
    const nextAction = server.indexOf('action === "', idx + 1);
    const candidates = [nextCase, nextAction].filter((i) => i !== -1);
    const blockEnd = candidates.length ? Math.min(...candidates) : server.length;
    return { blockStart, blockEnd, text: server.slice(blockStart, blockEnd) };
  }

  const offenders = [];
  for (const table of SHOP_OWNED_TABLES) {
    const needle = `.from("${table}")`;
    let idx = server.indexOf(needle);
    while (idx !== -1) {
      const { blockStart, text: block } = enclosingBlock(idx);
      const isCronExempt = CRON_EXEMPT_CASE_STARTS.some((s) => server.slice(Math.max(0, blockStart - 5), blockStart + s.length + 5).includes(s));
      const isScoped = isCronExempt || /\.eq\("shop_id"/.test(block) || /shop_id:\s*shopId/.test(block);
      if (!isScoped) {
        const lineNo = server.slice(0, idx).split('\n').length;
        offenders.push(`${table} @ line ${lineNo}: ${server.slice(idx, idx + 80).replace(/\s+/g, ' ')}...`);
      }
      idx = server.indexOf(needle, idx + needle.length);
    }
  }
  assert.deepEqual(offenders, [], `found unscoped table reads/writes with no shop_id scoping evidence anywhere in their enclosing action block:\n` + offenders.join('\n'));
});

test('every RPC call that touches shop-owned data passes p_shop_id explicitly', () => {
  const shopScopedRpcs = [
    'allocate_global_skus', 'place_order', 'update_order_status', 'set_stock_by_sku',
    'get_users_summary_fast', 'ustore_bulk_trash_products', 'ustore_purge_trash_batch',
    'ustore_restore_trash_items', 'ustore_purge_trash_items',
  ];
  for (const rpc of shopScopedRpcs) {
    const needle = `db.rpc("${rpc}"`;
    let idx = server.indexOf(needle);
    let found = 0;
    while (idx !== -1) {
      found++;
      const callEnd = server.indexOf(');', idx);
      const call = server.slice(idx, callEnd);
      assert.match(call, /p_shop_id/, `db.rpc("${rpc}") call at char ${idx} must pass p_shop_id`);
      idx = server.indexOf(needle, idx + needle.length);
    }
    assert.ok(found > 0, `expected at least one db.rpc("${rpc}") call site`);
  }
});

test('composite same-shop foreign keys exist for every parent/child pair between two shop-owned tables (DB-level tenant isolation, not just app-level)', () => {
  // app_users' primary key is the composite (shop_id, tg_id) — it has no
  // plain "id" column — so every FK pointing at it targets (shop_id, tg_id)
  // instead of the (shop_id, id) shape every other table uses.
  const compositeFkPairs = [
    ['categories', 'categories', 'id'],          // self (parent_id)
    ['products', 'categories', 'id'],            // category_id
    ['product_price_history', 'products', 'id'],
    ['products', 'import_batches', 'id'],
    ['category_aliases', 'categories', 'id'],
    ['trash_batches', 'categories', 'id'],       // root_category_id
    ['trash_batch_items', 'trash_batches', 'id'],
    ['orders', 'app_users', 'tg_id'],
    ['payment_receipt_history', 'orders', 'id'],
    ['stock_movements', 'orders', 'id'],
    ['user_favorites', 'app_users', 'tg_id'],
    ['user_favorites', 'products', 'id'],
    ['user_recent_views', 'app_users', 'tg_id'],
    ['user_recent_views', 'products', 'id'],
    ['support_tickets', 'app_users', 'tg_id'],
    ['support_tickets', 'orders', 'id'],
    ['support_ticket_messages', 'support_tickets', 'id'],
  ];
  for (const [child, parent, parentCol] of compositeFkPairs) {
    const re = new RegExp(`foreign key \\(shop_id, \\w+\\) references public\\.${parent}\\(shop_id, ${parentCol}\\)`);
    assert.match(ALL_MIGRATIONS_SQL, re, `expected a composite (shop_id, ...) FK from ${child} to ${parent}(shop_id, ${parentCol})`);
  }
});

test('shop_id is part of the SKU uniqueness constraint, not a bare global UNIQUE(sku)', () => {
  const sql = readMigration('002_shop_catalog_inventory.sql');
  assert.match(sql, /unique \(shop_id, sku\)/);
  assert.doesNotMatch(sql, /unique \(sku\)(?!,)/, 'sku must never be globally unique on its own — that would leak cross-shop SKU collisions/enumeration');
});

test('localStorage/sessionStorage keys touched by cart/profile/checkout/catalog-cache/RU-repair are all wrapped in scopedKey(), never a bare literal', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  for (const bareKey of ["'cart'", "'registeredUser'", "'checkoutDraft'"]) {
    assert.doesNotMatch(app, new RegExp(`localStorage\\.(get|set|remove)Item\\(${bareKey.replace(/'/g, "\\'")}[,)]`), `${bareKey} must not be used as a bare (unscoped) localStorage key`);
  }
  assert.match(app, /function scopedKey\(name\) \{ return browserBridge \? `ustore:\$\{BOT_ID\}:web:\$\{browserViewerKey\}:\$\{name\}` : `ustore:\$\{BOT_ID\}:\$\{name\}`; \}/);
  // The cart is read through the readStoredObject/readStoredJson pair (added
  // so a corrupted localStorage value can no longer kill the whole app at
  // load), so the scoping guarantee now has two halves that must BOTH hold:
  // the call site passes a scopedKey, and the helper reads localStorage by
  // exactly the key it was handed — never a literal of its own.
  assert.match(app, /let cart = readStoredObject\(scopedKey\('cart'\), \{\}\)/);
  assert.match(app, /function readStoredJson\(key, fallback\) \{[\s\S]{0,400}?localStorage\.getItem\(key\)/);
  assert.match(app, /CATALOG_CACHE_KEY = scopedKey\('catalog_cache_v1'\)/);
});

// Phase 2 (3.2-band): there is no Supabase Realtime channel anywhere in this
// codebase anymore — a public broadcast channel named after a UUID a client
// can see in its own boot response is a cross-shop spoofing surface (any
// client could SEND on `shop-events:<any-shop-uuid>` with just the
// publishable key, no server-side membership check). Replaced with polling,
// which has no channel to spoof at all — see the regression suite's
// "support updates ride the shared background poll" test for the client-side
// half of this.
test('no Supabase Realtime broadcast channel exists anywhere (removed in favor of tenant-safe polling — zero cross-shop spoof surface)', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.doesNotMatch(app, /sb\.channel\(/, 'no realtime channel subscription should exist in the client');
  assert.doesNotMatch(app, /currentShopId/, 'the client should not even receive/track a raw shop UUID anymore — it never needs one');

  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  assert.doesNotMatch(server, /db\.channel\(/, 'no realtime channel send should exist server-side');
  assert.doesNotMatch(server, /function broadcastShopEvent|EdgeRuntime\.waitUntil\(broadcastShopEvent/, 'the removed broadcast helper must not exist as real code (a historical mention in a comment is fine)');
});

test('no direct anon-key table reads remain in the frontend — the catalog comes from get_catalog, not sb.from(...)', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.doesNotMatch(app, /sb\.from\(/, 'frontend must never query a business table directly with the publishable key');
  assert.match(app, /callApi\('get_catalog', \{\}\)/);
});

test('cron actions (cross-shop by nature) still thread shop_id per row into Storage cleanup, never assume a single shop', () => {
  const cleanupStart = server.indexOf('action === "cleanup_expired_receipts"');
  const cleanupEnd = server.indexOf('\n  }\n', cleanupStart);
  const cleanupBlock = server.slice(cleanupStart, cleanupEnd);
  assert.match(cleanupBlock, /select\("id,shop_id,payment_receipt_path"\)/, 'cron must select shop_id per row, not assume one shop');
  assert.match(cleanupBlock, /cleanupPrivateReceipt\(db, row\.shop_id, row\.id/);

  const purgeStart = server.indexOf('action === "purge_expired_trash"');
  const purgeEnd = server.indexOf('\n  }\n', purgeStart);
  const purgeBlock = server.slice(purgeStart, purgeEnd);
  assert.match(purgeBlock, /select\("id,shop_id"\)/);
  assert.match(purgeBlock, /p_shop_id: batch\.shop_id/);
});
