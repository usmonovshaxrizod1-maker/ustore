// USTORE PHASE 2 — platform-api / provisioning / security-hardening tests.
//
// Where possible these are REAL executable tests, not just source-pattern
// checks — bot-token-crypto.ts has zero Deno-specific globals (pure
// standard WebCrypto), so Node can import and actually run it directly.
// Everything else here is static analysis for the same reason as the
// Phase 1 tenant-isolation suite: no live Supabase/Telegram in this
// environment to run true integration tests against. See
// USTORE_PHASE2_PLATFORM_INTEGRATION_HISOBOT.md's acceptance-test section
// for the manual checklist to run once this is actually deployed.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const FUNCTIONS_DIR = path.join(__dirname, '..', 'supabase', 'functions');
// Windows backslash paths aren't valid ESM specifiers for dynamic import() —
// they need to be real file:// URLs.
const BOT_TOKEN_CRYPTO_URL = pathToFileURL(path.join(FUNCTIONS_DIR, '_shared', 'bot-token-crypto.ts')).href;
const shopApi = fs.readFileSync(path.join(FUNCTIONS_DIR, 'shop-api', 'index.ts'), 'utf8');
const platformApi = fs.readFileSync(path.join(FUNCTIONS_DIR, 'platform-api', 'index.ts'), 'utf8');
const provisioningSql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '009_platform_provisioning.sql'), 'utf8');

function randomBase64Key() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
}

// ---------------------------------------------------------------------------
// REAL executable crypto tests
// ---------------------------------------------------------------------------

test('encryption roundtrip: encryptBotToken -> decryptBotToken returns the exact original token', async () => {
  const { encryptBotToken, decryptBotToken } = await import(BOT_TOKEN_CRYPTO_URL);
  const masterKey = randomBase64Key();
  const token = '123456789:AAExampleBotTokenForRoundtripTestOnly1234';
  const { ciphertext, iv } = await encryptBotToken(masterKey, token);
  const decrypted = await decryptBotToken(masterKey, ciphertext, iv);
  assert.equal(decrypted, token);
});

test('no plaintext token anywhere in the produced ciphertext/iv', async () => {
  const { encryptBotToken } = await import(BOT_TOKEN_CRYPTO_URL);
  const masterKey = randomBase64Key();
  const token = '987654321:ZZDistinctivePlaintextMarkerXYZ9876543210';
  const { ciphertext, iv } = await encryptBotToken(masterKey, token);
  assert.ok(!ciphertext.includes(token), 'ciphertext must not contain the plaintext token');
  assert.ok(!ciphertext.includes('ZZDistinctivePlaintextMarker'), 'ciphertext must not contain any substring of the plaintext token');
  assert.ok(!iv.includes(token));
});

test('every encryption uses a fresh random IV — encrypting the same token twice never produces identical output', async () => {
  const { encryptBotToken } = await import(BOT_TOKEN_CRYPTO_URL);
  const masterKey = randomBase64Key();
  const token = '111222333:SameTokenEncryptedTwice0000000000000000';
  const first = await encryptBotToken(masterKey, token);
  const second = await encryptBotToken(masterKey, token);
  assert.notEqual(first.iv, second.iv, 'IV must differ between encryptions');
  assert.notEqual(first.ciphertext, second.ciphertext, 'ciphertext must differ between encryptions (proves the IV is actually used)');
});

test('decrypting with the WRONG master key fails loudly rather than returning garbage', async () => {
  const { encryptBotToken, decryptBotToken } = await import(BOT_TOKEN_CRYPTO_URL);
  const { ciphertext, iv } = await encryptBotToken(randomBase64Key(), '555666777:TokenEncryptedWithKeyA00000000000000000');
  await assert.rejects(() => decryptBotToken(randomBase64Key(), ciphertext, iv), 'AES-GCM must reject tampered/mismatched-key ciphertext (authentication tag check), not silently return wrong bytes');
});

// ---------------------------------------------------------------------------
// platform-api vs shop-api: separate bot identities, least privilege
// ---------------------------------------------------------------------------

test('platform-api authenticates against USTORE_PLATFORM_BOT_TOKEN specifically, never a shop token', () => {
  assert.match(platformApi, /Deno\.env\.get\("USTORE_PLATFORM_BOT_TOKEN"\)/);
  assert.match(platformApi, /verifyTelegramInitData\(initData, PLATFORM_BOT_TOKEN\)/);
});

// Lifecycle round (2026-09-06): platform_terminate_shop now needs the shop's
// OWN bot token (to call deleteWebhook/setChatMenuButton on Telegram — there
// is no way to sever a bot's webhook/menu button without its own token).
// This is a deliberate, narrow exception to the old "platform-api never
// decrypts a shop token" rule above — verified tightly here so it can never
// silently grow into a general-purpose capability.
test('decryptBotToken in platform-api is used ONLY inside platform_terminate_shop (never elsewhere), is gated by requirePlatformSuperAdmin(), and the decrypted token is never returned/logged — only passed to deleteWebhook/setChatMenuButton', () => {
  // Count actual CALL sites (opening paren) — excludes the one-time import
  // declaration, which legitimately names it once regardless of usage count.
  const callSites = platformApi.match(/decryptBotToken\(/g) || [];
  assert.equal(callSites.length, 1, 'decryptBotToken must be CALLED exactly once in platform-api — any second call site means the exception spread beyond terminate');
  const start = platformApi.indexOf('case "platform_terminate_shop"');
  const end = platformApi.indexOf('\n      case ', start + 10);
  const block = platformApi.slice(start, end > start ? end : start + 4000);
  assert.match(block, /requirePlatformSuperAdmin\(\)/);
  assert.match(block, /decryptBotToken\(/);
  assert.match(block, /telegramApi\(botToken, "deleteWebhook", \{\}\)/);
  assert.match(block, /telegramApi\(botToken, "setChatMenuButton", \{ menu_button: \{ type: "default" \} \}\)/);
  assert.doesNotMatch(block, /json\(\{[^}]*botToken/, 'the decrypted token must never be echoed back in any response');
  assert.match(block, /catch \(e\)/, 'Telegram teardown must be best-effort — a failure here must not stop the shop from being terminated');
});

// Billz integration (Phase 0/1): shop-api now ALSO encrypts, but only a
// shop's own Billz secret_token/access_token/refresh_token — a completely
// different credential the shop's own admin enters directly, unrelated to
// bot provisioning. The invariant that actually matters (shop-api never
// re-provisions/overwrites a shop_bots token — that stays platform-api's
// exclusive job) is checked precisely below, rather than by banning the
// shared encryptBotToken function name outright.
test('shop-api never writes a shop_bots token — it only ever decrypts one for use (least privilege, the reverse of platform-api); it may still reuse the shared encrypt function for OTHER secrets it owns (e.g. a per-shop Billz integration key)', () => {
  assert.match(shopApi, /import \{ decryptBotToken, encryptBotToken \} from "\.\.\/_shared\/bot-token-crypto\.ts"/);
  assert.doesNotMatch(shopApi, /from\("shop_bots"\)\.(update|insert|upsert)/, 'shop-api must never write to shop_bots — only platform-api provisions/re-encrypts a shop bot token');
});

// ---------------------------------------------------------------------------
// Billz (billz.ai) integration, Phase 0/1
// ---------------------------------------------------------------------------

test('Billz access is gated per-shop and can ONLY be granted by the platform super admin (platform-api), never by a shop\'s own admin (shop-api has no action that writes shops.billz_access_granted)', () => {
  const start = platformApi.indexOf('case "platform_set_billz_access"');
  const end = platformApi.indexOf('\n      case ', start + 10);
  assert.ok(start >= 0, 'platform_set_billz_access action not found');
  const block = platformApi.slice(start, end > start ? end : start + 800);
  assert.match(block, /requirePlatformSuperAdmin\(\)/, 'must be gated to the platform super admin, same as every other platform-api action');
  assert.match(block, /billz_access_granted:\s*enabled/);
  assert.doesNotMatch(shopApi, /billz_access_granted\s*:\s*(true|payload)/, 'shop-api must never be able to grant its own Billz access — only read it via ctx.billzAccessGranted');
});

test("every Billz shop-api action requires both requirePermission('integrations.manage') and requireBillzAccessGranted() — a shop without platform-granted access gets forbidden:billz_not_granted even if its own admin calls it", () => {
  for (const action of ['billz_get_status', 'billz_connect', 'billz_list_config_options', 'billz_save_sale_config', 'billz_disconnect']) {
    const start = shopApi.indexOf(`case "${action}"`);
    assert.ok(start >= 0, `${action} not found in shop-api`);
    const end = shopApi.indexOf('\n      case ', start + 10);
    const block = shopApi.slice(start, end > start ? end : start + 600);
    assert.match(block, /requirePermission\('integrations\.manage'\)/, `${action} must require the integrations.manage permission`);
    assert.match(block, /requireBillzAccessGranted\(\)/, `${action} must require platform-granted Billz access`);
  }
});

test('Billz token material (secret_token/access_token/refresh_token) never appears in any shop-api JSON response — only encrypted ciphertext is stored, plaintext never leaves the request that created it', () => {
  const start = shopApi.indexOf('case "billz_get_status"');
  const end = shopApi.indexOf('\n      case "set_fulfillment_config"');
  const block = shopApi.slice(start, end > start ? end : start + 4000);
  // Every `return json({ ... })` call in this block, scanned via a bounded
  // window from its start (avoids needing full nested-brace matching), must
  // not include a raw token field among its keys.
  const starts = [...block.matchAll(/return json\(\{/g)].map((m) => m.index);
  assert.ok(starts.length > 0, 'expected at least one return json(...) call in the Billz action block');
  for (const idx of starts) {
    const closeIdx = block.indexOf(');', idx);
    const window = block.slice(idx, closeIdx > idx ? closeIdx + 2 : idx + 300);
    assert.doesNotMatch(window, /\baccessToken\s*:/, `response must not echo accessToken near: ${window.slice(0, 60)}`);
    assert.doesNotMatch(window, /\brefreshToken\s*:/, `response must not echo refreshToken near: ${window.slice(0, 60)}`);
    assert.doesNotMatch(window, /\bsecretToken\s*:/, `response must not echo secretToken near: ${window.slice(0, 60)}`);
  }
  assert.match(block, /billzShopName|billzCashboxName|billzPaymentTypeName/, 'status responses should surface human-readable NAMES, never the underlying tokens');
});

test('Billz secret_token/access_token/refresh_token are always stored encrypted (ciphertext+iv columns), reusing the exact same encryptBotToken/decryptBotToken pair as bot tokens — no new crypto code', () => {
  const client = fs.readFileSync(path.join(FUNCTIONS_DIR, '_shared', 'billz-client.ts'), 'utf8');
  assert.match(client, /import \{ encryptBotToken, decryptBotToken \} from "\.\/bot-token-crypto\.ts"/);
  assert.doesNotMatch(client, /crypto\.subtle\.(encrypt|decrypt)/, 'billz-client.ts must not implement its own AES-GCM — it must delegate to the shared, already-audited bot-token-crypto.ts module');
  assert.match(shopApi, /secret_token_ciphertext:\s*secretEnc\.ciphertext/);
});

test('getValidBillzAccessToken auto-refreshes a stale token and falls back to a full secret_token re-login if refresh itself fails, recording billz_connections.status=ERROR + last_error only on total failure (never throws an unlabeled 500)', () => {
  const client = fs.readFileSync(path.join(FUNCTIONS_DIR, '_shared', 'billz-client.ts'), 'utf8');
  const start = client.indexOf('export async function getValidBillzAccessToken');
  const block = client.slice(start, start + 3000);
  assert.match(block, /billzRefresh\(refreshToken\)/, 'must attempt a refresh before falling back to full re-login');
  assert.match(block, /billzLogin\(secretToken\)/, 'must fall back to secret_token re-login if refresh fails');
  assert.match(block, /status:\s*"ERROR",\s*last_error:/, 'total failure must be recorded on billz_connections, not just thrown silently');
});

test('BILLZ_SETTINGS modal only renders/is reachable when billzAccessGranted is true — the settings-page entry point is conditionally gated exactly like the platform gate intends', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('function renderSettingsPage');
  const end = app.indexOf('function renderHome');
  const block = app.slice(start, end > start ? end : start + 2000);
  assert.match(block, /if \(billzAccessGranted\) rows\.push\(\{ icon:'scan-line', title:'Billz'/, 'the Billz settings row must only be pushed when billzAccessGranted is true');
  assert.match(app, /billzAccessGranted = bootData\.billzAccessGranted === true;/, 'billzAccessGranted must come from the server-verified boot() response, never a client-side default of true');
});

// ---------------------------------------------------------------------------
// Billz integration, Phase 2 (manual catalog browse/import)
// ---------------------------------------------------------------------------

test('a UStorE variant can remember its own Billz product id (each Billz size/color is its own separate product record) — cleanVariants() preserves billzProductId across every future edit, not just at import time', () => {
  const start = shopApi.indexOf('type VariantInput');
  const end = shopApi.indexOf('function variantIdentity');
  const block = shopApi.slice(start, end > start ? end : start + 800);
  assert.match(block, /billzProductId\?:\s*string \| null/, 'VariantInput type must carry an optional billzProductId');
  assert.match(block, /billzProductId:\s*v\?\.billzProductId \? String\(v\.billzProductId\) : null/, 'cleanVariants must copy it through on every save, or a Billz link would silently vanish on the next product edit');
});

test("every Billz catalog-browse/import shop-api action requires both requirePermission('integrations.manage') and requireBillzAccessGranted()", () => {
  for (const action of ['billz_get_categories', 'billz_browse_products', 'billz_import_products']) {
    const start = shopApi.indexOf(`case "${action}"`);
    assert.ok(start >= 0, `${action} not found in shop-api`);
    const end = shopApi.indexOf('\n      case ', start + 10);
    const block = shopApi.slice(start, end > start ? end : start + 1500);
    assert.match(block, /requirePermission\('integrations\.manage'\)/, `${action} must require the integrations.manage permission`);
    assert.match(block, /requireBillzAccessGranted\(\)/, `${action} must require platform-granted Billz access`);
  }
});

test('billz_browse_products excludes already-imported Billz products by checking products.billz_product_id AND every variant\'s billzProductId — not just the top-level column (a variative product\'s children must not resurface as "not yet imported")', () => {
  const start = shopApi.indexOf('case "billz_browse_products"');
  const end = shopApi.indexOf('\n      case "billz_import_products"');
  const block = shopApi.slice(start, end > start ? end : start + 3000);
  assert.match(block, /linkedBillzIds\.add\(String\(row\.billz_product_id\)\)/);
  assert.match(block, /v\?\.billzProductId[\s\S]{0,40}linkedBillzIds\.add/, 'must also scan each product\'s variants array for already-linked Billz variant ids');
  assert.match(block, /\.filter\(\(p: any\) => !linkedBillzIds\.has\(String\(p\.id\)\)\)/, 'the returned browse list must exclude anything already linked');
});

test('billzListProducts fix: category filtering now goes through the ACTUAL documented Billz endpoint (POST /v2/product-search-with-filters, category_ids in the JSON body) instead of a query-string param on GET /v2/products that Billz never supported there — and the working free-text search path is completely untouched (still GET /v2/products?search=...)', () => {
  const client = fs.readFileSync(path.join(FUNCTIONS_DIR, '_shared', 'billz-client.ts'), 'utf8');
  const fnStart = client.indexOf('export async function billzListProducts');
  const fnBlock = client.slice(fnStart, fnStart + 1600);
  assert.match(fnBlock, /if \(opts\.categoryIds\?\.length && !opts\.search\) \{/, 'category-only browsing must route to the dedicated filter endpoint; a search term must keep using the proven GET path');
  assert.match(fnBlock, /billzFetch\("\/v2\/product-search-with-filters", \{/);
  assert.match(fnBlock, /method: "POST",/);
  assert.match(fnBlock, /category_ids: opts\.categoryIds,/, 'category_ids must be a real JSON array in the POST body, not a comma-joined query string');
  assert.doesNotMatch(fnBlock.slice(0, fnBlock.indexOf('/v2/product-search-with-filters')), /params\.set\("category_ids"/, 'the old, non-functional query-string category_ids must be fully removed');
  // The plain GET path (search and/or no-filter) must still exist, unchanged in shape.
  assert.match(fnBlock, /billzFetch\(`\/v2\/products\?\$\{params\.toString\(\)\}`, \{ accessToken \}\)/);
  assert.match(fnBlock, /if \(opts\.search\) params\.set\("search", opts\.search\);/);
});

test('the Billz import view now has a one-click "hali import qilinmaganlar (hammasi)" reset button (clears category+search, shows the full not-yet-imported backlog)', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const fnStart = app.indexOf('function showAllUnimportedBillzItems');
  const fnBlock = app.slice(fnStart, fnStart + 300);
  assert.match(fnBlock, /billzBrowseSelectedCatId = '';/);
  assert.match(fnBlock, /billzBrowseSearch = '';/);
  assert.match(app, /onclick="showAllUnimportedBillzItems\(\)"[^>]*><i data-lucide="sparkles"/, 'the premium reset button must be wired into the Billz page UI');
});

test('9-band: Billz browse pagination replaced repeated "Yana yuklash" clicking with a page-size selector (10/25/50/100, defaulting to 10) that reloads (replaces, never appends) page 1, plus real numbered page buttons (1,2,3...) once "100" is selected and there are more than 100 results', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /let billzBrowsePageSize = 10;/, 'default page size must be 10, per the explicit request ("birinchi bosganda 10ta chiqsin")');

  const sizeFnStart = app.indexOf('function setBillzBrowsePageSize');
  const sizeFnEnd = app.indexOf('\n    function ', sizeFnStart + 10);
  const sizeFnBlock = app.slice(sizeFnStart, sizeFnEnd);
  assert.match(sizeFnBlock, /loadBillzBrowseItems\(1\);/, 'changing page size must restart from page 1');

  const loadFnStart = app.indexOf('async function loadBillzBrowseItems');
  const loadFnEnd = app.indexOf('\n    function setBillzBrowsePageSize', loadFnStart);
  const loadFnBlock = app.slice(loadFnStart, loadFnEnd > loadFnStart ? loadFnEnd : loadFnStart + 2500);
  assert.match(loadFnBlock, /billzBrowseItems = result\.items \|\| \[\];/, 'each page load must REPLACE the list, not append to it — the old "load more" append behavior is gone');
  assert.match(loadFnBlock, /limit: billzBrowsePageSize === 'ALL' \? 'ALL' : billzBrowsePageSize,/, 'the chosen page size must actually be sent to the backend, not hardcoded');

  assert.match(app, /const totalPages = typeof billzBrowsePageSize === 'number' \? Math\.ceil\(billzBrowseCount \/ billzBrowsePageSize\) : 1;/);
  assert.match(app, /billzBrowsePageSize === 100 && totalPages > 1 \?/, 'numbered pages must only appear once the max page size (100) is selected and there is more than one page of results');
  assert.match(app, /onclick="goToBillzBrowsePage\(\$\{n\}\)"/);

  const server = fs.readFileSync(path.join(FUNCTIONS_DIR, 'shop-api', 'index.ts'), 'utf8');
  const actionStart = server.indexOf('case "billz_browse_products"');
  const actionBlock = server.slice(actionStart, actionStart + 1200);
  assert.match(actionBlock, /const ALLOWED_LIMITS = \[10, 25, 50, 100\];/, 'the server must validate limit against the exact same allowed set the UI offers, never trust an arbitrary client-supplied number');
  assert.doesNotMatch(actionBlock, /limit: 30/, 'the old hardcoded 30-item page size must be gone');
});

test('"Barchasi" (all) page-size option sends a single request (limit: \'ALL\') and the SERVER walks every matching Billz raw page itself (in bounded batches of 100, with a hard page cap) before filtering out already-imported items and returning an accurate not-yet-imported count — fixing the earlier bug where the raw Billz count (which includes already-imported products) made the "hali import qilinmagan" total wrong and inconsistent across page sizes', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /<option value="ALL" \$\{billzBrowsePageSize === 'ALL' \? 'selected' : ''\}>\$\{tr\('Barchasi', 'Все'\)\}<\/option>/, 'the page-size dropdown must offer an explicit "Barchasi" choice alongside 10/25/50/100');

  const loadFnStart = app.indexOf('async function loadBillzBrowseItems');
  const loadFnEnd = app.indexOf('\n    function setBillzBrowsePageSize', loadFnStart);
  const loadFnBlock = app.slice(loadFnStart, loadFnEnd > loadFnStart ? loadFnEnd : loadFnStart + 2500);
  assert.match(loadFnBlock, /limit: billzBrowsePageSize === 'ALL' \? 'ALL' : billzBrowsePageSize,/, '"Barchasi" must be sent as a single request with an explicit ALL sentinel, not re-implemented as a client-side paging loop');

  const client = fs.readFileSync(path.join(FUNCTIONS_DIR, '_shared', 'billz-client.ts'), 'utf8');
  const walkStart = client.indexOf('export async function billzListAllMatching');
  const walkBlock = client.slice(walkStart, walkStart + 1200);
  assert.match(walkBlock, /const limit = 100;/, 'the server-side walk must still request Billz in bounded 100-item batches, never an arbitrary/unbounded limit');
  assert.match(walkBlock, /maxPages = 50/, 'the walk must have a hard upper bound so a wrong/stale Billz count can never cause an infinite request loop');
  assert.match(walkBlock, /all = all\.concat\(products\);/, 'batches must be concatenated into one combined list, not just keep the last page');

  const server = fs.readFileSync(path.join(FUNCTIONS_DIR, 'shop-api', 'index.ts'), 'utf8');
  const actionStart = server.indexOf('case "billz_browse_products"');
  const actionEnd = server.indexOf('case "billz_import_products"', actionStart);
  const actionBlock = server.slice(actionStart, actionEnd > actionStart ? actionEnd : actionStart + 4500);
  assert.match(actionBlock, /billzListAllMatching\(accessToken, \{ categoryIds: billzCategoryId \? \[billzCategoryId\] : undefined, search \}\)/, 'the browse action must walk+filter the full matching set itself rather than trusting a single raw Billz page\'s count');
  assert.match(actionBlock, /const notYetImported = rawAll\.products\.filter\(\(p: any\) => !linkedBillzIds\.has\(String\(p\.id\)\)\);/, 'count/pagination must be computed AFTER filtering out already-imported products, not before');
  assert.match(actionBlock, /count: notYetImported\.length/, 'the returned count must be the true not-yet-imported total, not Billz\'s raw (pre-filter) count');
});

test('8-band: a new "Import qilinganlar" (imported) Billz sub-tab lists UStorE products actually linked to Billz (top-level billz_product_id OR any variant\'s billzProductId), with a select-and-unlink flow that clears the Billz link WITHOUT deleting the product itself', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /let billzSubTab = 'IMPORT'; \/\/ 'IMPORT' \| 'IMPORTED' \| 'DELETED'/);
  assert.match(app, /onclick="setBillzSubTab\('IMPORTED'\)"/);
  assert.match(app, /if \(tab === 'IMPORTED'\) loadBillzImportedItems\(\);/);
  assert.match(app, /await callApi\('billz_list_imported_products', \{\}\);/);
  assert.match(app, /await callApi\('billz_unlink_products', \{ productIds: \[\.\.\.billzImportedSelectedIds\] \}\);/);
  assert.match(app, /appConfirm\(tr\("Tanlangan tovarlar Billz bog'lanishidan chiqariladi \(tovarning o'zi o'chirilmaydi\)\. Davom etasizmi\?"/, 'must confirm before an irreversible-feeling bulk unlink, and the copy must make clear the product itself is not deleted');

  const server = fs.readFileSync(path.join(FUNCTIONS_DIR, 'shop-api', 'index.ts'), 'utf8');
  const listStart = server.indexOf('case "billz_list_imported_products"');
  const listBlock = server.slice(listStart, listStart + 700);
  assert.match(listBlock, /requirePermission\('integrations\.manage'\);/);
  assert.match(listBlock, /requireBillzAccessGranted\(\);/);
  assert.match(listBlock, /p\.billz_product_id \|\| \(Array\.isArray\(p\.variants\) && p\.variants\.some\(\(v: any\) => v\?\.billzProductId\)\)/, 'must catch BOTH a top-level link and a per-variant link — a variative product is not linked only via its parent row');

  const unlinkStart = server.indexOf('case "billz_unlink_products"');
  const unlinkBlock = server.slice(unlinkStart, unlinkStart + 900);
  assert.match(unlinkBlock, /requirePermission\('integrations\.manage'\);/);
  assert.match(unlinkBlock, /requireBillzAccessGranted\(\);/);
  assert.doesNotMatch(unlinkBlock, /\.delete\(\)/, 'unlinking must never delete the product row — only clear the Billz link fields');
  assert.match(unlinkBlock, /billz_product_id: null, variants/, 'must clear the top-level link AND rewrite variants to strip each one\'s billzProductId');
});

test('billz_import_products computes old_price from an admin-entered percent (flat number OR a "min-max" range) — and always leaves it null when no percent is given', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const start = server.indexOf('function resolveOldPricePercents');
  const block = server.slice(start, start + 1400);
  assert.match(block, /rangeMatch = s\.match\(\/\^\(\\d\+\)\\s\*-\\s\*\(\\d\+\)\$\/\)/, 'must recognize a "min-max" range input');
  assert.match(block, /for \(let n = Math\.ceil\(min \/ 5\) \* 5; n <= max; n \+= 5\)/, 'range mode must build "nice" step-of-5 percent values, not a raw continuous random number');
  assert.match(block, /Math\.floor\(Math\.random\(\) \* pool\.length\)/, 'each product in a range-import must get an independently, randomly chosen nice value — not the same one for every item');
  // 7-band: the resolved percent's SUM (numericPrice * (1 + percent/100)) is
  // rounded to the nearest 1000 so'm via roundToNearest1000 — the percent
  // itself is never rounded/altered, only the final money amount.
  assert.match(server, /const oldPrice = percent \? roundToNearest1000\(numericPrice \* \(1 \+ percent \/ 100\)\) : null;/, 'old_price must be computed from the resolved percent then rounded to the nearest 1000, and stay null when none was given');
  assert.match(server, /function roundToNearest1000\(amount: number\): number \{\s*return Math\.round\(amount \/ 1000\) \* 1000;/, 'must be a real reusable nearest-1000 rounding helper, not inline math duplicated at the call site');
});

test('Billz Phase 2 needs only one small additive migration (012): a nullable products.billz_product_id column — no separate staging table, since "not yet imported" is derived live from products themselves', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '012_billz_import.sql'), 'utf8');
  assert.match(migration, /alter table public\.products add column if not exists billz_product_id text;/);
});

test('the "B" (Billz) button only appears in the admin catalog toolbar when billzAccessGranted is true, and opens the browse page pre-targeted at the CURRENT category (adminCatParentId) — the same page also serves as the general "Billz" menu when opened without a category', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /\$\{billzAccessGranted \? `<button onclick="openBillzBrowse\('\$\{adminCatParentId \|\| ''\}'\)"/, 'the B button must be gated behind billzAccessGranted and pass the current category as the import target');
  assert.match(app, /case 'BILLZ': renderBillzPage\(container\); break;/, 'the BILLZ page must be wired into the page router');
});

test('12-band: opening Billz browse from a specific UStorE category auto-selects the matching Billz category (by name) so the product list is actually filtered to that category instead of always showing the same unfiltered first page — the working search feature is left untouched', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('async function openBillzBrowse');
  const end = app.indexOf('async function loadBillzBrowseCategories');
  assert.ok(start >= 0 && end > start, 'openBillzBrowse not found');
  const fn = app.slice(start, end);
  assert.match(fn, /categories\.find\(c => String\(c\.id\) === String\(categoryId\)\)/, 'must look up the CURRENT UStorE category by the id passed in');
  assert.match(fn, /categoryName\(uStoreCat\)/, 'must reuse the existing categoryName() helper, not invent new name-resolution logic');
  assert.match(fn, /billzBrowseCategories\.find\(c => String\(c\.name \|\| ''\)\.trim\(\)\.toLocaleLowerCase\('uz'\) === uStoreName\)/, 'must match against the already-loaded Billz category list by name');
  assert.match(fn, /if \(match\) billzBrowseSelectedCatId = match\.id;/, 'must set the SAME state variable the manual category <select> and loadBillzBrowseItems() already use — reusing the existing working filter path');

  // The category lookup must happen BEFORE loadBillzBrowseItems() is called,
  // otherwise the first fetch would still go out unfiltered.
  const matchIdx = fn.indexOf('if (match) billzBrowseSelectedCatId = match.id;');
  const loadItemsIdx = fn.indexOf('await loadBillzBrowseItems();');
  assert.ok(matchIdx >= 0 && loadItemsIdx > matchIdx, 'the category match must be resolved before the (now filtered) initial fetch');

  // The existing search implementation must be completely untouched.
  const searchFnStart = app.indexOf('function handleBillzBrowseSearchDebounced');
  const searchFnBlock = app.slice(searchFnStart, searchFnStart + 300);
  assert.match(searchFnBlock, /billzBrowseSearch = value;/);
  assert.match(searchFnBlock, /setTimeout\(\(\) => loadBillzBrowseItems\(\), 500\)/, 'the 500ms debounce must be unchanged');
});

// ---------------------------------------------------------------------------
// Billz integration, Phase 4 (automatic sync: stock + deletion detection)
// ---------------------------------------------------------------------------

test('Billz Phase 4 migration (013) adds only products.billz_deleted_at, extends stock_movements.operation_type with BILLZ_SYNC, and defines billz_apply_sync as service_role-only', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '013_billz_sync.sql'), 'utf8');
  assert.match(migration, /alter table public\.products add column if not exists billz_deleted_at timestamptz;/);
  assert.match(migration, /check \(operation_type in \('KIRIM', 'BUYURTMA', 'MANUAL', 'BILLZ_SYNC'\)\)/, 'the existing three operation types must stay valid alongside the new one');
  assert.match(migration, /create or replace function public\.billz_apply_sync\(p_shop_id uuid, p_billz_product_id text, p_new_stock integer\)/);
  assert.match(migration, /revoke all on function public\.billz_apply_sync\(uuid, text, integer\) from public, anon, authenticated;/);
  assert.match(migration, /grant execute on function public\.billz_apply_sync\(uuid, text, integer\) to service_role;/);
});

test('billz_apply_sync treats p_new_stock IS NULL as "no longer exists in Billz" (soft-delete via billz_deleted_at), distinct from a real stock value of 0', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '013_billz_sync.sql'), 'utf8');
  assert.match(migration, /if p_new_stock is null then/);
  assert.match(migration, /status = 'DELETED', deleted_at = now\(\), billz_deleted_at = now\(\)/, 'deletion must mark billz_deleted_at, not just the generic DELETED status, so the dedicated Billz sub-menu can tell it apart from a manual trash action');
  assert.match(migration, /-- last remaining variant deleted too/, 'a variative product must fully soft-delete once its last linked variant disappears from Billz, not sit empty with zero variants');
});

test("every Billz Phase 4 shop-api action requires both requirePermission('integrations.manage') and requireBillzAccessGranted(), and stays shop-scoped", () => {
  for (const action of ['billz_list_deleted_products', 'billz_restore_product']) {
    const start = shopApi.indexOf(`case "${action}"`);
    assert.ok(start >= 0, `${action} action not found`);
    const end = shopApi.indexOf('\n      case "', start + 10);
    const block = shopApi.slice(start, end > 0 ? end : start + 1200);
    assert.match(block, /requirePermission\('integrations\.manage'\)/, `${action} must require the integrations.manage permission`);
    assert.match(block, /requireBillzAccessGranted\(\)/, `${action} must require platform-granted Billz access`);
    assert.match(block, /\.eq\("shop_id",\s*shopId\)/, `${action} must scope its query to the current shop`);
  }
});

test('billz_restore_product refuses to touch a product that was never Billz-deleted (billz_deleted_at null) and clears the same three fields billz_apply_sync sets on deletion', () => {
  const start = shopApi.indexOf('case "billz_restore_product"');
  const end = shopApi.indexOf('\n      case "', start + 10);
  const block = shopApi.slice(start, end);
  assert.match(block, /if \(!product \|\| !product\.billz_deleted_at\) return json\(\{ error: "not_billz_deleted" \}, 400\);/);
  assert.match(block, /deleted_at:\s*null,\s*billz_deleted_at:\s*null/);
});

test('billz-sync is a cron-only Edge Function: it authenticates via a shared x-cron-secret header (never Telegram initData or a client-supplied shopId), and walks every platform-granted+CONNECTED shop itself', () => {
  const fn = fs.readFileSync(path.join(FUNCTIONS_DIR, 'billz-sync', 'index.ts'), 'utf8');
  assert.match(fn, /req\.headers\.get\("x-cron-secret"\)/, 'must check a shared secret header, matching the [functions.billz-sync] verify_jwt=false rationale');
  assert.match(fn, /gotSecret !== CRON_SECRET/, 'a mismatched/missing secret must be rejected');
  assert.doesNotMatch(fn, /verifyTelegramInitData|resolveShopContext/, 'a cron tick has no Telegram user behind it — it must not attempt per-request shop resolution like shop-api does');
  assert.match(fn, /\.eq\("status", "CONNECTED"\)/, 'must only sync shops with an active Billz connection');
  assert.match(fn, /grantedShopIds\.has\(shopId\)/, 'must re-check billz_access_granted at sync time too, in case the platform revoked it after the shop connected');
  assert.match(fn, /db\.rpc\("billz_apply_sync_v2", \{[\s\S]{0,400}p_price: entry \? entry\.price : null,?\s*\}\)/, 'must apply the crawl result atomically through the current sync RPC');
  assert.match(fn, /status: "ERROR", last_error:/, 'a shop-level failure (bad/expired token, Billz API error) must be recorded, not silently swallowed');
});

test('a Billz sync crawl uses billzCrawlProductMap (paginates until Billz\'s own count is exhausted) rather than a single unpaginated page — otherwise a catalog past page 1 would silently look fully deleted', () => {
  const client = fs.readFileSync(path.join(FUNCTIONS_DIR, '_shared', 'billz-client.ts'), 'utf8').replace(/\r\n/g, '\n');
  const start = client.indexOf('export async function billzCrawlProductMap');
  assert.ok(start >= 0, 'billzCrawlProductMap not found');
  const block = client.slice(start, start + 1600);
  assert.match(block, /if \(!products\.length \|\| page \* limit >= count\) break;/, 'must keep paging until Billz\'s own reported count is exhausted');
  assert.match(block, /page\+\+/);
  const fn = fs.readFileSync(path.join(FUNCTIONS_DIR, 'billz-sync', 'index.ts'), 'utf8');
  assert.match(fn, /billzCrawlProductMap\(accessToken, conn\.billz_shop_id \|\| null\)/, 'billz-sync must actually use the crawl helper, not hand-roll its own pagination');
});

test('billzCrawlProductMap keeps shared parent text but preserves each variant\'s own Billz price and stock', () => {
  const client = fs.readFileSync(path.join(FUNCTIONS_DIR, '_shared', 'billz-client.ts'), 'utf8');
  const start = client.indexOf('export async function billzCrawlProductMap');
  const block = client.slice(start, start + 1600);
  assert.match(block, /const parentFields = \{ name: String\(p\.name \|\| ""\), description: p\.description \? String\(p\.description\) : null, price: pickPrice\(p\.shop_prices\) \};/);
  assert.match(block, /const variantPrice = pickPrice\(v\.shop_prices\) \|\| Number\(v\.retail_price\) \|\| parentFields\.price;/);
  assert.match(block, /map\.set\(String\(v\.id\), \{ \.\.\.parentFields, price: variantPrice, stock: pickStock\(v\.shop_measurement_values\) \}\);/);
});

test('Billz field-sync migration (015) redefines billz_apply_sync in place (same first 3 params, 3 new ones default to null) so old 3-arg callers keep working, and marks translation_status PENDING only when the name/description actually changed', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '015_billz_field_sync.sql'), 'utf8');
  assert.match(migration, /create or replace function public\.billz_apply_sync\(\s*p_shop_id uuid, p_billz_product_id text, p_new_stock integer,\s*p_name text default null, p_description text default null, p_price numeric default null\s*\)/);
  assert.match(migration, /name = coalesce\(p_name, name\),/);
  assert.match(migration, /price = coalesce\(p_price, price\),/);
  assert.match(migration, /translation_status = case when v_name_changed then 'PENDING' else translation_status end,/, 'a changed name/description must mark the SAME staleness signal every other name/description-editing code path already uses, not a new one-off flag');
  assert.doesNotMatch(migration, /category_id\s*=\s*coalesce/, 'category must stay out of scope — Billz\'s category tree has no stored mapping to UStorE\'s admin-defined catalogs to sync against');
});

test('config.toml disables JWT verification for billz-sync too, for the same "this caller never had a Supabase session" reason as shop-api/platform-api', () => {
  const configToml = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'config.toml'), 'utf8');
  const start = configToml.indexOf('[functions.billz-sync]');
  assert.ok(start >= 0, '[functions.billz-sync] section not found');
  assert.match(configToml.slice(start, start + 60), /verify_jwt = false/);
});

test('the Billz page has an Import / O\'chirilganlar (deleted) sub-tab toggle, and "Tiklash" (restore) calls billz_restore_product', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /onclick="setBillzSubTab\('IMPORT'\)"/);
  assert.match(app, /onclick="setBillzSubTab\('DELETED'\)"/);
  assert.match(app, /async function loadBillzDeletedItems\(\)/);
  assert.match(app, /callApi\('billz_list_deleted_products', \{\}\)/);
  assert.match(app, /async function restoreBillzProduct\(productId\)/);
  assert.match(app, /callApi\('billz_restore_product', \{ productId \}\)/);
  assert.match(app, /onclick="restoreBillzProduct\('\$\{it\.id\}'\)"/);
});

// ---------------------------------------------------------------------------
// Billz integration, Phase 5 (UStorE -> Billz sale push, no fiscal cheque)
// ---------------------------------------------------------------------------

test('Billz Phase 5 migration (014) adds only orders.billz_order_id — a traceability column, nothing else touched', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '014_billz_sale_push.sql'), 'utf8');
  assert.match(migration, /alter table public\.orders add column if not exists billz_order_id text;/);
});

test('billzCreateSale always sets skip_ofd: true on the payment call — no fiscal cheque is ever requested, per the product decision that Billz only needs to know something sold', () => {
  const client = fs.readFileSync(path.join(FUNCTIONS_DIR, '_shared', 'billz-client.ts'), 'utf8');
  const start = client.indexOf('export async function billzCreateSale');
  const block = client.slice(start, start + 3000);
  assert.match(block, /skip_ofd:\s*true/);
  assert.doesNotMatch(block, /order-epos-log/, 'no fiscal receipt means GET /v2/order-epos-log must never be called from this flow');
});

test('billzCreateSale creates the draft order, adds every item, then pays — one failed add-product call is logged and skipped (best-effort), but zero successful items aborts the whole sale rather than paying an empty order', () => {
  const client = fs.readFileSync(path.join(FUNCTIONS_DIR, '_shared', 'billz-client.ts'), 'utf8');
  const start = client.indexOf('export async function billzCreateSale');
  const block = client.slice(start, start + 3000);
  assert.match(block, /\/v2\/order\?Billz-Response-Channel=HTTP/, 'must create the draft sale first');
  assert.match(block, /\/v2\/order-product\/\$\{orderId\}\?Billz-Response-Channel=HTTP/, 'must add products to that same order id');
  assert.match(block, /\[BILLZ_SALE_FAILED:ADD_ITEM\]/, 'a single item failure must be logged, not thrown, so the rest of the sale can still go through');
  assert.match(block, /if \(itemsAdded === 0\) throw new BillzApiError\("billz_sale_no_items_added", 502\);/, 'must refuse to pay/complete a sale with zero successfully-added items');
  assert.match(block, /\/v2\/order-payment\/\$\{orderId\}\?Billz-Response-Channel=HTTP/, 'must pay the same order id last');
});

test('Billz sale is not pushed before payment; paid delivery and the cron both trigger the background-safe sync path', () => {
  const start = shopApi.indexOf('case "create_order"');
  const end = shopApi.indexOf('\n      case "', start + 10);
  const block = shopApi.slice(start, end);
  assert.doesNotMatch(block, /pushOrderToBillzInBackground/, 'unpaid checkout must never be recorded as a Billz sale');
  assert.match(shopApi, /newStatus === "DELIVERED" && orderRow\.payment_status === "PAID"/);
  assert.match(shopApi, /EdgeRuntime\.waitUntil\(pushOrderToBillzInBackground/);
  const syncFn = fs.readFileSync(path.join(FUNCTIONS_DIR, 'billz-sync', 'index.ts'), 'utf8');
  assert.match(syncFn, /async function syncPaidOrders/);
  assert.match(syncFn, /\.eq\("payment_status","PAID"\)/);
});

test('pushOrderToBillzInBackground is a complete no-op (no Billz API call) for the vast majority of shops that never connected Billz — checks billz_access_granted AND a fully-configured CONNECTED billz_connections row before doing anything', () => {
  const start = shopApi.indexOf('async function pushOrderToBillzInBackground');
  const end = shopApi.indexOf('\nasync function translateCategoryInBackground');
  const block = shopApi.slice(start, end);
  assert.match(block, /if \(!shopRow\?\.billz_access_granted\) return;/);
  assert.match(block, /conn\.status !== "CONNECTED" \|\| !conn\.billz_shop_id \|\| !conn\.billz_cashbox_id \|\| !conn\.billz_payment_type_id\) return;/);
});

test('pushOrderToBillzInBackground resolves each order item\'s Billz product id the same way Phase 2 linked it: products.billz_product_id for a non-variative product, or variants[].billzProductId matched by the ordered item\'s sku for a variative one — an order with nothing Billz-linked pushes nothing', () => {
  const start = shopApi.indexOf('async function pushOrderToBillzInBackground');
  const end = shopApi.indexOf('\nasync function translateCategoryInBackground');
  const block = shopApi.slice(start, end);
  assert.match(block, /product\.billz_product_id \? String\(product\.billz_product_id\) : null/);
  assert.match(block, /product\.variants\.find\(\(x: any\) => x\?\.sku === it\.sku\)/, 'a variative item must be matched by the specific ordered variant\'s sku, not just the parent product');
  assert.match(block, /if \(!billzItems\.length\) \{[\s\S]*billz_sync_status: "SKIPPED"[\s\S]*return;/, 'an order with zero Billz-linked items must be marked skipped and must not call Billz');
});

test('platform bot token and shop bot tokens are read from genuinely different env vars', () => {
  assert.match(platformApi, /USTORE_PLATFORM_BOT_TOKEN/);
  assert.doesNotMatch(platformApi, /Deno\.env\.get\("TELEGRAM_BOT_TOKEN"\)/, 'must not fall back to any old single-bot env var');
  assert.doesNotMatch(shopApi, /USTORE_PLATFORM_BOT_TOKEN/, 'shop-api must never read the platform bot token');
});

// ---------------------------------------------------------------------------
// Platform Super Admin gating (5-band)
// ---------------------------------------------------------------------------

test('every platform-api action requires the platform Super Admin — client-supplied identity is never trusted', () => {
  for (const action of ['platform_verify_bot', 'platform_connect_bot', 'platform_list_shops', 'platform_setup']) {
    const idx = platformApi.indexOf(`case "${action}"`);
    assert.ok(idx >= 0, `${action} case not found`);
    const block = platformApi.slice(idx, platformApi.indexOf('case "', idx + 1) === -1 ? idx + 400 : platformApi.indexOf('case "', idx + 1));
    assert.match(block, /requirePlatformSuperAdmin\(\);/, `${action} must call requirePlatformSuperAdmin()`);
  }
  // initDataUnsafe is mentioned in an explanatory comment (why it's NOT
  // used) — that's fine. What must never exist is actual CODE reading it.
  assert.doesNotMatch(platformApi, /\.initDataUnsafe\b/, 'must never use the UNVERIFIED client-side initDataUnsafe for authorization');
  assert.match(platformApi, /isPlatformSuperAdmin = SUPER_ADMIN_ID !== "" && tgId === SUPER_ADMIN_ID/);
});

// ---------------------------------------------------------------------------
// Bot token validation, duplicate detection
// ---------------------------------------------------------------------------

test('an invalid bot token format is rejected BEFORE any Telegram API call is made', () => {
  for (const action of ['platform_verify_bot', 'platform_connect_bot']) {
    const idx = platformApi.indexOf(`case "${action}"`);
    const nextCase = platformApi.indexOf('case "', idx + 1);
    const block = platformApi.slice(idx, nextCase === -1 ? platformApi.length : nextCase);
    const formatCheckIdx = block.indexOf('botTokenLooksValid(botToken)');
    const getMeIdx = block.indexOf('"getMe"');
    assert.ok(formatCheckIdx >= 0, `${action} must format-check the token`);
    assert.ok(getMeIdx >= 0, `${action} must call getMe`);
    assert.ok(formatCheckIdx < getMeIdx, `${action} must reject malformed tokens before ever contacting Telegram`);
  }
});

test('duplicate bot connection is blocked at the DB level, and mapped to a clear error by platform-api', () => {
  assert.match(provisioningSql, /raise exception 'bot_already_connected/);
  assert.match(platformApi, /m\.includes\("bot_already_connected"\)/);
  assert.match(platformApi, /return json\(\{ error: "bot_already_connected" \}, 409\)/);
});

test('a PROVISIONING (not yet activated) shop is treated as retryable, not a hard duplicate', () => {
  assert.match(provisioningSql, /if v_existing_shop_status <> 'PROVISIONING' then\s*\n\s*raise exception 'bot_already_connected/);
  assert.match(platformApi, /retryable = true/);
});

// ---------------------------------------------------------------------------
// OWNER creation / provisioning atomicity
// ---------------------------------------------------------------------------

test('provisioning creates exactly one OWNER membership, and empty (not FITCORE-default) shop_settings/design_settings', () => {
  assert.match(provisioningSql, /insert into public\.shop_memberships \(shop_id, telegram_user_id, role, status\)\s*\n\s*values \(v_shop_id, p_owner_telegram_id, 'OWNER', 'ACTIVE'\)/);
  assert.match(provisioningSql, /insert into public\.shop_settings \(shop_id\) values \(v_shop_id\)/);
  assert.match(provisioningSql, /insert into public\.design_settings \(shop_id\) values \(v_shop_id\)/);
  // No column list beyond shop_id on those two inserts means every other
  // column falls back to its schema default (null/empty) — genuinely zero
  // business data, not a copied template.
  assert.doesNotMatch(provisioningSql, /insert into public\.shop_settings \(shop_id, name/i, 'must not seed a default shop name or any other business data');
});

test('the provisioning DB write (shops+shop_bots+shop_memberships+settings) is ONE atomic RPC call — not four separate inserts from platform-api', () => {
  const idx = platformApi.indexOf('case "platform_connect_bot"');
  // Scope to just the CREATE phase — before the Telegram config try block,
  // which has its own separate, deliberate .from("shops").update() to flip
  // ACTIVE afterward (that one's tested on its own below).
  const telegramConfigIdx = platformApi.indexOf('setChatMenuButton', idx);
  const block = platformApi.slice(idx, telegramConfigIdx);
  const dbCalls = (block.match(/db\.(from|rpc)\(/g) || []);
  assert.equal(dbCalls.length, 1, 'platform_connect_bot must make exactly one DB call for the create side (the RPC) — not separate .from() inserts that could partially fail');
  assert.match(block, /db\.rpc\("ustore_create_shop_provisioning"/);
});

test('shop only flips to ACTIVE after Telegram config (menu button + webhook) succeeds — never before', () => {
  const idx = platformApi.indexOf('case "platform_connect_bot"');
  const nextCase = platformApi.indexOf('case "', idx + 1);
  const block = platformApi.slice(idx, nextCase);
  const menuIdx = block.indexOf('setChatMenuButton');
  const webhookIdx = block.indexOf('setWebhook');
  const activateIdx = block.indexOf('status: "ACTIVE"');
  assert.ok(menuIdx >= 0 && webhookIdx >= 0 && activateIdx >= 0);
  assert.ok(menuIdx < activateIdx && webhookIdx < activateIdx, 'ACTIVE flip must come after both Telegram calls, textually and by control flow (both are inside the same try block preceding it)');
});

// ---------------------------------------------------------------------------
// Shop status gating (3.3-band)
// ---------------------------------------------------------------------------

test('resolveShopContext accepts ONLY status=ACTIVE — PROVISIONING and DISABLED are both rejected', () => {
  const start = shopApi.indexOf('async function resolveShopContext');
  const end = shopApi.indexOf('\nasync function telegramApi', start) === -1 ? start + 3000 : shopApi.indexOf('\nasync function telegramApi', start);
  const block = shopApi.slice(start, end);
  assert.match(block, /shopRow\.status !== "ACTIVE"/);
  assert.doesNotMatch(block, /shopRow\.status === "DISABLED"\s*\)\s*\{[\s\S]{0,40}return.*403.*\}\s*\n\s*\}/, 'must not have reverted to only checking DISABLED (PROVISIONING must also be rejected)');
});

test('the shop bot webhook path (/start) also checks shops.status, not just shop_bots.status', () => {
  const idx = shopApi.indexOf('body?.update_id !== undefined');
  const end = shopApi.indexOf('return json({ ok: true });', idx);
  const block = shopApi.slice(idx, end);
  assert.match(block, /webhookShopRow/, 'the webhook path must look up the shops row, not just trust shop_bots.status');
  assert.match(block, /webhookShopRow\.status !== "ACTIVE"/);
});

// ---------------------------------------------------------------------------
// Super Admin notification leak fix (3.4-band)
// ---------------------------------------------------------------------------

test('the platform Super Admin is NOT auto-added to any shop\'s order/receipt/support notification recipients', () => {
  const start = shopApi.indexOf('async function adminChatIds');
  const end = shopApi.indexOf('\n}', start);
  const block = shopApi.slice(start, end);
  assert.doesNotMatch(block, /platformSuperAdminId ? \[platformSuperAdminId\]/, 'must not splice the platform super admin into shop notification recipients');
  assert.match(block, /from\("shop_memberships"\)/, 'recipients must come only from this shop\'s own membership roster');
});

// ---------------------------------------------------------------------------
// Menu button / webhook URL correctness (11/12/13-band)
// ---------------------------------------------------------------------------

test('the shop bot menu button URL includes the correct bot_id as a query param on the universal shop Mini App URL', () => {
  const idx = platformApi.indexOf('setChatMenuButton');
  const block = platformApi.slice(idx, idx + 400);
  assert.match(block, /\$\{SHOP_MINI_APP_BASE_URL\}\?bot_id=\$\{encodeURIComponent\(telegramBotId\)\}/);
});

// Phase 2 follow-up fix: the shop bot's own /start reply (a DIFFERENT code
// path than platform_connect_bot's setChatMenuButton — this one lives in
// shop-api's webhook handler) must ALSO carry a WebApp button, not just
// plain text, or a user has no way to actually open the Mini App from it.
test('the shop bot /start webhook reply includes an inline WebApp button that opens the Mini App with the correct bot_id', () => {
  const startIdx = shopApi.indexOf('if (chatId && isStartCommand)');
  assert.ok(startIdx >= 0, 'the /start handling block was not found');
  // /start image round (2026-09): the reply_markup object moved out of each
  // individual telegramApi(...) call into one shared `replyMarkup` const —
  // it's now reused across THREE send paths (photo+caption, photo-then-
  // separate-message for long text, and the no-image plain message), so it
  // is built once instead of being duplicated three times. Anchor on that
  // const (unique, appears once) rather than a specific sendMessage call.
  const replyMarkupIdx = shopApi.indexOf('const replyMarkup = {', startIdx);
  assert.ok(replyMarkupIdx >= 0, 'replyMarkup construction not found');
  const block = shopApi.slice(startIdx, replyMarkupIdx + 2500);

  assert.match(block, /const replyMarkup = \{/, 'a shared reply_markup object must be built once for this handler');
  assert.match(block, /inline_keyboard:\s*\[\[\{/, 'reply_markup must include an inline_keyboard');
  assert.match(block, /text:\s*"🛍 Do'konni ochish"/, 'button text must match exactly');
  assert.match(block, /web_app:\s*\{\s*url:/, 'button must be a web_app button, not a plain URL button');
  assert.match(block, /\$\{SHOP_MINI_APP_BASE_URL\}\?bot_id=\$\{encodeURIComponent\(rawBotId\)\}/, 'the web_app url must carry the correct bot_id (rawBotId — the ID resolved from THIS webhook request, not a client-supplied or platform-api value)');
  // Four send call sites exist in source (only one of the last two actually
  // fires at runtime, since they're mutually-exclusive if/else branches):
  // (1) short-caption sendPhoto — carries the button since it's the only
  // message sent; (2) long-caption's image-only sendPhoto — deliberately
  // has NO button (it's immediately followed by the text message, so
  // attaching it here would be redundant/confusing); (3) the long-caption
  // follow-up sendMessage; (4) the no-image sendMessage. (3) and (4) must
  // both always carry the button — each is the only/final message in its path.
  const sendCalls = block.match(/telegramApi\(botToken, "send(?:Message|Photo)",\s*\{[^}]*\}/gs) || [];
  assert.equal(sendCalls.length, 4, `expected exactly 4 /start send call sites, found ${sendCalls.length}`);
  assert.match(sendCalls[0], /reply_markup:\s*replyMarkup/, 'the short-caption sendPhoto must carry the button (it is the only message sent in that path)');
  assert.doesNotMatch(sendCalls[1], /reply_markup/, 'the long-caption image-only sendPhoto must NOT duplicate the button — it is attached to the message that follows instead');
  assert.match(sendCalls[2], /reply_markup:\s*replyMarkup/, 'the long-caption follow-up sendMessage must carry the button');
  assert.match(sendCalls[3], /reply_markup:\s*replyMarkup/, 'the no-image sendMessage must carry the button');

  // Must not have broken the existing welcome-text/status-gating logic.
  assert.match(block, /text: welcome/, 'the existing dynamic welcome text (shop_settings.start_message / DEFAULT_START_MESSAGE fallback) must still be sent');
  assert.doesNotMatch(block, /\$\{botToken\}/, 'the raw bot token must never be embedded in a URL (URLs end up in logs)');
});

// 2026-09-05 fix: set_start_message shipped gated behind requireSuperAdmin()
// (the PLATFORM bosh admin only) — a real shop owner configuring their own
// bot's /start message/image got "forbidden:not_super_admin" every time.
// This is shop-owned content (shop_settings, scoped by shopId) exactly like
// design/fulfillment/order-policy settings, which all correctly use
// requirePermission('shop.settings.manage'). The frontend row had the same
// bug (isSuperAdmin-gated visibility) even though the whole SETTINGS page
// it lives on is already routed behind shop.settings.manage.
test('set_start_message is a real shop-owner setting (shop.settings.manage), not a platform-super-admin-only action — and its frontend row is no longer hidden from every non-platform-admin', () => {
  const shopApiSrc = fs.readFileSync(path.join(FUNCTIONS_DIR, 'shop-api', 'index.ts'), 'utf8');
  const startIdx = shopApiSrc.indexOf('case "set_start_message"');
  assert.ok(startIdx >= 0);
  const block = shopApiSrc.slice(startIdx, startIdx + 700);
  assert.match(block, /await requirePermission\('shop\.settings\.manage'\);/, 'must use the same shop-owner gate as every other shop settings action');
  assert.doesNotMatch(block, /requireSuperAdmin\(\)/, 'must not require the platform-wide super-admin gate — this is per-shop content');

  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /\{ icon:'bot', title:tr\('Bot \/start xabari'[\s\S]{0,260}onclick:"activePopupModal='START_MESSAGE'; render\(\);" \}/, 'the START_MESSAGE row must be present unconditionally in the settings rows, since SETTINGS is already permission-gated');
  assert.doesNotMatch(app, /\$\{\(isSuperAdmin && isAdminMode\) \? `\s*\n\s*<button type="button" onclick="activePopupModal='START_MESSAGE'/, 'must not be wrapped in an isSuperAdmin-only conditional anymore');
});

test('the shop bot webhook is registered against shop-api with bot_id in the URL, never the bot token itself', () => {
  const idx = platformApi.indexOf('setWebhook');
  const block = platformApi.slice(idx, idx + 400);
  assert.match(block, /\/functions\/v1\/shop-api\?bot_id=\$\{encodeURIComponent\(telegramBotId\)\}/);
  assert.doesNotMatch(block, /\$\{botToken\}/, 'the raw bot token must never be embedded in a URL (URLs end up in logs)');
});

test('platform_setup registers the platform bot\'s OWN webhook against platform-api, and its menu button against the platform Mini App URL', () => {
  const idx = platformApi.indexOf('case "platform_setup"');
  const nextCase = platformApi.indexOf('default:', idx);
  const block = platformApi.slice(idx, nextCase);
  assert.match(block, /\/functions\/v1\/platform-api/);
  assert.match(block, /PLATFORM_MINI_APP_URL/);
});

// ---------------------------------------------------------------------------
// Safe response shapes — no secret material ever returned
// ---------------------------------------------------------------------------

test('platform_verify_bot and platform_connect_bot responses never echo the bot token back', () => {
  for (const action of ['platform_verify_bot', 'platform_connect_bot']) {
    const idx = platformApi.indexOf(`case "${action}"`);
    const nextCase = platformApi.indexOf('case "', idx + 1);
    const block = platformApi.slice(idx, nextCase);
    const jsonReturns = block.match(/return json\(\{[^}]*\}/g) || [];
    for (const ret of jsonReturns) {
      assert.doesNotMatch(ret, /botToken/, `${action} response must never include the raw token: ${ret}`);
    }
  }
});

test('platform_list_shops selects only safe metadata columns — never token_ciphertext/token_iv', () => {
  const idx = platformApi.indexOf('case "platform_list_shops"');
  const nextCase = platformApi.indexOf('case "', idx + 1);
  const block = platformApi.slice(idx, nextCase);
  assert.doesNotMatch(block, /token_ciphertext|token_iv/, 'token material must never be selected for this response');
  assert.match(block, /select\("shop_id,telegram_bot_id,bot_username,bot_name,status,created_at"\)/, 'status/created_at (bot-connection info for the new Bot va integratsiyalar screen, completion-pass 2.6-band) are safe, non-secret metadata columns');
});

test('no console.log/error call anywhere in platform-api interpolates a raw bot token', () => {
  const logCalls = platformApi.match(/console\.(log|error|warn|info)\([^)]*\)/g) || [];
  for (const call of logCalls) {
    assert.doesNotMatch(call, /\bbotToken\b/, `log call must not include the raw token variable: ${call}`);
  }
  assert.match(platformApi, /function safeBotError/, 'Telegram/token-adjacent errors must be funneled through a safe, fixed-message mapper before logging');
});

// ---------------------------------------------------------------------------
// shop-api vs platform-api: config.toml (3.1-band)
// ---------------------------------------------------------------------------

test('config.toml disables verify_jwt for BOTH Edge Functions (Telegram webhooks carry no Supabase JWT), while real authorization stays cryptographic', () => {
  const toml = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'config.toml'), 'utf8');
  assert.match(toml, /\[functions\.shop-api\]\s*\nverify_jwt = false/);
  assert.match(toml, /\[functions\.platform-api\]\s*\nverify_jwt = false/);
});

// 2026-09-05: new-shop vs old-shop feature-parity audit (full read of all
// 66+ migrations, cross-referenced against shop-api/platform-api/frontend)
// found exactly ONE remaining gap of the same shape as the already-fixed
// click/payme/uzum_access_granted bug: billz_access_granted was still
// `default false`, never flipped/backfilled — a brand-new shop could not
// even SEE the Billz settings card, while every shop the platform admin had
// manually granted it to could. requireBillzAccessGranted() (shop-api.ts)
// only gates the connect/config actions themselves — flipping the access
// flag does not sync anything or require any credential, exactly like the
// click/payme/uzum fix.
test('067 migration opens the Billz capability to every shop (old and new alike), matching the 066 fix for click/payme/uzum_access_granted — additive, and safe because requireBillzAccessGranted() only gates the connect/config actions, never auto-activates real sync', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '067_billz_feature_parity.sql'), 'utf8');
  assert.match(migration, /alter table public\.shops alter column billz_access_granted set default true;/);
  assert.match(migration, /update public\.shops\s*\nset billz_access_granted = true\s*\nwhere coalesce\(billz_access_granted, false\) = false;/);

  const shopApiSrc = fs.readFileSync(path.join(FUNCTIONS_DIR, 'shop-api', 'index.ts'), 'utf8');
  assert.match(shopApiSrc, /function requireBillzAccessGranted\(\) \{ if \(!ctx\.billzAccessGranted\) throw new Error\("forbidden:billz_not_granted"\); \}/, 'the connect/config actions must still require a real gate — this migration only changes the DEFAULT, not the enforcement');
});

// ---------------------------------------------------------------------------
// Lifecycle round (2026-09-06): a FROZEN/TERMINATED shop's bot/mini-app must
// actually communicate that, not silently do nothing or show a misleading
// "check your internet" error.
// ---------------------------------------------------------------------------

test('resolveShopContext() returns distinct, specific error codes for FROZEN and TERMINATED (not the old generic shop_disabled for either) — the frontend needs to tell these apart to show the right message', () => {
  const start = shopApi.indexOf('async function resolveShopContext(');
  const block = shopApi.slice(start, shopApi.indexOf('\n}', start) + 2);
  assert.match(block, /st === "FROZEN" \? "shop_frozen"/);
  assert.match(block, /st === "TERMINATED" \? "shop_terminated"/);
  assert.match(block, /: "shop_disabled"/, 'DISABLED (rare, legacy status) keeps the old generic code — nothing new needed for it');
});

test('the /start webhook now replies to a FROZEN shop\'s customers with an honest, generic "temporarily paused" message (never leaking the admin-only lifecycle_reason) instead of silently no-op\'ing — TERMINATED/DISABLED/PROVISIONING still get the old silent {ok:true} (TERMINATED\'s webhook is deleted outright by platform_terminate_shop, so this path is now defense-in-depth for it, not the primary mechanism)', () => {
  const start = shopApi.indexOf('// ---- Telegram webhook: /start');
  const end = shopApi.indexOf('const { action, payload = {}, initData, bossSecret } = body || {};');
  const block = shopApi.slice(start, end);
  assert.match(block, /webhookShopRow\.status !== "ACTIVE" && webhookShopRow\.status !== "FROZEN"\)\) return json\(\{ ok: true \}\);/, 'only ACTIVE and FROZEN may reach the message-sending logic below');
  assert.match(block, /isStartCommand && webhookShopRow\.status === "FROZEN"/);
  // The FROZEN reply is a fixed string literal (not built from any DB field),
  // which by construction can never leak lifecycle_reason to a customer.
  assert.match(block, /text: "Bu do'kon hozircha faoliyat ko'rsatmayapti\. Iltimos, keyinroq qayta urinib ko'ring\."/);
});

test('platform_terminate_shop tears down the shop\'s own bot on Telegram (deleteWebhook + reset the menu button to default) as a best-effort step BEFORE the full purge — a Telegram failure here must never block the shop\'s data from actually being deleted below; the shop_bots ROW ITSELF is no longer separately marked DISABLED here, since ustore_purge_shop_completely deletes it outright a few lines later (freeing the Telegram bot id, not just disabling it)', () => {
  const start = platformApi.indexOf('case "platform_terminate_shop"');
  const end = platformApi.indexOf('\n      case ', start + 10);
  const block = platformApi.slice(start, end > start ? end : start + 4000);
  assert.match(block, /telegramApi\(botToken, "deleteWebhook", \{\}\)/);
  assert.match(block, /telegramApi\(botToken, "setChatMenuButton", \{ menu_button: \{ type: "default" \} \}\)/);
  assert.match(block, /try \{[\s\S]*deleteWebhook[\s\S]*\} catch \(e\) \{/, 'must be wrapped so a Telegram failure cannot prevent the purge below from running');
  const teardownIdx = block.indexOf('deleteWebhook');
  const purgeIdx = block.indexOf('ustore_purge_shop_completely');
  assert.ok(purgeIdx > teardownIdx, 'the bot teardown must happen before the purge (once purged, shop_bots no longer has a row to look up a token from)');
});

test('platform_reactivate_shop still only accepts a FROZEN shop (status check unchanged) — TERMINATED remains permanently one-way, exactly as the user required ("qaytib ulay olmaydi")', () => {
  const start = platformApi.indexOf('case "platform_reactivate_shop"');
  const block = platformApi.slice(start, platformApi.indexOf('\n      case ', start + 10));
  assert.match(block, /db\.rpc\("ustore_reactivate_shop", \{ p_shop_id: shopId \}\)/);
  assert.match(block, /message\.includes\("shop_not_frozen"\)/);
  const lifecycleSql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '081_atomic_shop_lifecycle.sql'), 'utf8');
  assert.match(lifecycleSql, /if v_status<>'FROZEN' then raise exception 'shop_not_frozen';/);
});

test('platform_extend_frozen_grace only works on a FROZEN shop, pushes shop_settings.frozen_at forward by the given number of days (extending the retention-cron\'s grace deadline for just this one shop), and notifies the owner — all gated by requirePlatformSuperAdmin()', () => {
  const start = platformApi.indexOf('case "platform_extend_frozen_grace"');
  assert.ok(start >= 0, 'platform_extend_frozen_grace action must exist');
  const block = platformApi.slice(start, platformApi.indexOf('\n      case ', start + 10));
  assert.match(block, /requirePlatformSuperAdmin\(\)/);
  assert.match(block, /db\.rpc\("ustore_extend_frozen_deadline", \{ p_shop_id: shopId, p_days: days \}\)/);
  assert.match(block, /message\.includes\("shop_not_frozen"\)/);
  assert.match(block, /logPlatformAdminAction\(db, tgId, shopId, "EXTEND_FROZEN_GRACE"/);
  assert.match(block, /notifyLifecycleOwnerInBackground\(db, PLATFORM_BOT_TOKEN, shopId, "GRACE_EXTENDED"/);
  const lifecycleSql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '081_atomic_shop_lifecycle.sql'), 'utf8');
  assert.match(lifecycleSql, /update public\.shop_settings set frozen_delete_at=v_new/);
});

test('platform_extend_frozen_grace anchors from whichever is LATER — the old frozen_at or right now (Math.max) — so spec 5A\'s "resets to a fresh N-day period" promise holds even if a FREEZE_EXPIRED admin task sat unresolved long enough that old_frozen_at+days would still land in the past; a shop extended promptly (the common case) keeps the old add-on-top behavior unchanged', () => {
  const lifecycleSql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '081_atomic_shop_lifecycle.sql'), 'utf8');
  assert.match(lifecycleSql, /v_new:=greatest\(coalesce\(v_old,now\(\)\),now\(\)\)\+make_interval/);
});

test('migration 068 additively extends notification_templates.type (+GRACE_EXTENDED) and platform_admin_action_log.action (+EXTEND_FROZEN_GRACE) using the same dynamic drop/recreate-constraint pattern as migration 059 — every old value stays accepted', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '068_shop_lifecycle_grace_and_bot_teardown.sql'), 'utf8');
  assert.match(migration, /check \(type in \(\s*\n\s*'EXPIRY_7D','EXPIRY_3D','EXPIRY_1D','FROZEN','GRACE_7D','GRACE_1D',\s*\n\s*'VISITOR_1D','VISITOR_3D','VISITOR_7D','REACTIVATED','TERMINATED',\s*\n\s*'GRACE_EXTENDED'/);
  assert.match(migration, /check \(action in \('GRANT_DAYS', 'FREEZE', 'REACTIVATE', 'TERMINATE', 'EXTEND_FROZEN_GRACE'\)\)/);
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
});

test('the Dashboard "Diqqat talab qiladi" list now deep-links FROZEN_LONG/EXPIRING_SOON items straight to that shop\'s own page (loading the shop list first if it was never opened yet) instead of a generic tab switch that leaves the admin to find the shop themselves', () => {
  const platformAppJs = fs.readFileSync(path.join(__dirname, '..', 'platform', 'platform-app.js'), 'utf8');
  assert.match(platformAppJs, /it\.type === 'NEW_REQUEST' \? "switchTab\('requests'\)" : it\.type === 'SUPPORT_WAITING' \? `openAdminSupportThread\(\$\{it\.ticketId\}\)` : it\.shopId \? `openShopDetailsFromDashboard\('\$\{it\.shopId\}'\)` : "switchTab\('shops'\)"/);
  const fnStart = platformAppJs.indexOf('async function openShopDetailsFromDashboard(shopId)');
  assert.ok(fnStart >= 0, 'openShopDetailsFromDashboard must exist');
  const fnBlock = platformAppJs.slice(fnStart, platformAppJs.indexOf('\n  }', fnStart) + 4);
  assert.match(fnBlock, /if \(!adminShops\.length\) await reloadAdminShops\(\);/, 'must load the shop list first if Dashboard was opened before ever visiting the Shops tab');
  assert.match(platformAppJs, /window\.openShopDetailsFromDashboard = openShopDetailsFromDashboard;/);
});

test('Shop Details now shows an unmissable, reusable-styled (.notice.error — the same class the terminate-confirm step already uses, no new colors invented) banner ONLY when a FROZEN shop\'s grace period has actually expired, with the two required choices (terminate, or +7 days) right there — not just a passive dashboard-list row', () => {
  const platformAppJs = fs.readFileSync(path.join(__dirname, '..', 'platform', 'platform-app.js'), 'utf8');
  const isExpiredStart = platformAppJs.indexOf('function isGraceExpired(s)');
  assert.ok(isExpiredStart >= 0, 'isGraceExpired helper must exist');
  const isExpiredBlock = platformAppJs.slice(isExpiredStart, platformAppJs.indexOf('\n  }', isExpiredStart) + 4);
  assert.match(isExpiredBlock, /s\.status !== 'FROZEN' \|\| !s\.frozenAt\) return false;/);
  assert.match(isExpiredBlock, /platformLifecycleSettings\.retentionDays \|\| SHOP_FREEZE_DAYS\)/, 'must use the SAME admin-configurable setting as the backend (falling back to the shared canonical constant, not a re-hardcoded number)');

  const cardStart = platformAppJs.indexOf('function renderLifecycleControlsCard(s)');
  const cardBlock = platformAppJs.slice(cardStart, platformAppJs.indexOf('function renderExtendGraceCard', cardStart));
  assert.match(cardBlock, /isGraceExpired\(s\) \? `/);
  assert.match(cardBlock, /class="notice error"/, 'must reuse the existing notice.error class, not a new custom style');
  assert.match(cardBlock, /Muzlatish muddati tugadi/);
  assert.match(cardBlock, /onclick="startTerminateShop\(\)"/, 'terminate choice reuses the existing reason→confirm flow, not a shortcut that skips requiring a reason');
  assert.match(cardBlock, /onclick="quickExtendFrozenGrace\('\$\{s\.id\}'\)"/);

  assert.match(platformAppJs, /async function quickExtendFrozenGrace\(shopId\)/);
  assert.match(platformAppJs, /window\.quickExtendFrozenGrace = quickExtendFrozenGrace;/);

  const css = fs.readFileSync(path.join(__dirname, '..', 'platform', 'platform.css'), 'utf8');
  assert.match(css, /\.plat-admin-attention-dot\.is-danger \{ background:#b91c1c; \}/, 'reuses the exact red already established for danger semantics elsewhere in this file (.plat-request-status-pill.is-danger), not a new invented color');
  assert.match(platformAppJs, /it\.type === 'GRACE_EXPIRED' \? 'is-danger' : ''/);
});

test('no user-facing copy anywhere still hardcodes the OLD "30 kun" data-retention/deletion-consideration claim now that the canonical freeze period is SHOP_FREEZE_DAYS (60) — Terms 20.6, the Yordam FAQ list, and the Yordam-guide subscription page all interpolate the shared constant instead, and the Dashboard\'s frozen-shop age buckets derive their late-stage boundaries from it too', () => {
  const platformAppJs = fs.readFileSync(path.join(__dirname, '..', 'platform', 'platform-app.js'), 'utf8');
  assert.doesNotMatch(platformAppJs, /Ma'lumotlar 30 kun davomida saqlanadi/, 'Terms 20.6 must no longer claim 30-day retention');
  assert.doesNotMatch(platformAppJs, /30 kun ichida obuna yangilanmasa/, 'Terms 20.6 must no longer name a stale 30-day deadline');
  assert.doesNotMatch(platformAppJs, /muzlatiladi va 30 kun davomida ma'lumotlar saqlanadi/, 'FAQ_ITEMS must no longer claim 30-day retention');
  assert.doesNotMatch(platformAppJs, /Do'kon avval muzlatiladi, ma'lumotlar 30 kun saqlanadi/, 'Yordam-guide subscription page must no longer claim 30-day retention');
  assert.match(platformAppJs, /Ma'lumotlar \$\{SHOP_FREEZE_DAYS\} kun davomida saqlanadi\. \$\{SHOP_FREEZE_DAYS\} kun ichida obuna yangilanmasa/);
  assert.match(platformAppJs, /muzlatiladi va \$\{SHOP_FREEZE_DAYS\} kun davomida ma'lumotlar saqlanadi/);
  assert.match(platformAppJs, /Do'kon avval muzlatiladi, ma'lumotlar \$\{SHOP_FREEZE_DAYS\} kun saqlanadi/);

  // Subscription-BILLING-period mentions ("Standart obuna 30 kun" etc.) are a
  // DIFFERENT concept (monthly billing cycle length) and must stay untouched.
  assert.match(platformAppJs, /Standart obuna 30 kun\. Yangi do'konning birinchi obunasi/, 'billing-period copy must be untouched by this fix');

  const bucketStart = platformAppJs.indexOf('function expiredShopBucket(days)');
  assert.ok(bucketStart >= 0, 'expiredShopBucket helper must exist');
  const bucketBlock = platformAppJs.slice(bucketStart, platformAppJs.indexOf('\n  }', bucketStart) + 4);
  assert.doesNotMatch(bucketBlock, /days <= 30\)/, 'the late-stage bucket boundary must no longer be a bare hardcoded 30');
  assert.match(bucketBlock, /days <= EXPIRED_BUCKET_MID\)/);
  assert.match(bucketBlock, /days <= SHOP_FREEZE_DAYS\)/);
  assert.match(platformAppJs, /const EXPIRED_BUCKET_MID = Math\.floor\(SHOP_FREEZE_DAYS \/ 2\);/);
});

test('both status-label helpers (statusLabel, adminShopStatusLabel) have an explicit case for the new transient \'TERMINATING\' write-lock status — so if a purge ever fails mid-way and leaves a shop stuck in that state, the admin sees a clear "deleting..." indicator instead of it silently falling through to the misleading "deleted" label (statusLabel\'s generic fallback) or a raw untranslated status string (adminShopStatusLabel\'s generic fallback)', () => {
  const platformAppJs = fs.readFileSync(path.join(__dirname, '..', 'platform', 'platform-app.js'), 'utf8');
  const statusLabelStart = platformAppJs.indexOf('function statusLabel(s)');
  const statusLabelBlock = platformAppJs.slice(statusLabelStart, platformAppJs.indexOf('\n  }', statusLabelStart) + 4);
  assert.match(statusLabelBlock, /if \(s === 'TERMINATING'\) return "O'chirilmoqda\.\.\.";/);
  assert.match(platformAppJs, /if \(s === 'TERMINATING'\) return pIcon\('lock', 13\);/);

  const adminLabelStart = platformAppJs.indexOf('function adminShopStatusLabel(status)');
  const adminLabelBlock = platformAppJs.slice(adminLabelStart, platformAppJs.indexOf('\n  }', adminLabelStart) + 4);
  assert.match(adminLabelBlock, /if \(status === 'TERMINATING'\) return "O'chirilmoqda\.\.\.";/);
});
