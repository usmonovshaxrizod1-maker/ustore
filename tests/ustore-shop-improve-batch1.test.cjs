// Shop takomillashtirish round — batch 1: home catalog picker, banner
// caps/reorder/carousel, staff spinner/polling, permission revoke guard,
// warehouse default perms, text zoom. Lean per economical-usage rule.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shopApi = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
const perms = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'permissions.ts'), 'utf8');

test('item 12 regression guard: role_update DELETEs all existing role_permissions rows before inserting the new set — a revoked permission must never survive', () => {
  const start = shopApi.indexOf('case "role_update"');
  const block = shopApi.slice(start, start + 1700);
  assert.match(block, /await db\.from\("role_permissions"\)\.delete\(\)\.eq\("shop_id", shopId\)\.eq\("role_id", roleId\)/);
  assert.match(block, /if \(delErr\) throw delErr/);
});

test('item 13: WAREHOUSE default role has stock.view/stock.manage but NOT products.manage — a warehouse worker can adjust stock but not edit name/price/image/description', () => {
  const start = perms.indexOf('WAREHOUSE: {');
  const block = perms.slice(start, start + 900);
  assert.match(block, /permissions: \["stock\.view", "stock\.manage"\]/);
});

test('item 7: banner_create rejects a new banner once the shop already has 10 saved (regardless of active/inactive), and activeBannersForClient caps home-visible banners at 5', () => {
  const start = shopApi.indexOf('case "banner_create"');
  const block = shopApi.slice(start, start + 900);
  assert.match(block, /if \(\(existingCount \|\| 0\) >= 10\) return json\(\{ error: "banner_limit_reached" \}, 400\);/);
});

test('item 8: banner_reorder delegates validation and sort_order-only writes to the atomic reorder RPC', () => {
  const start = shopApi.indexOf('case "banner_reorder"');
  const block = shopApi.slice(start, start + 1200);
  assert.match(block, /db\.rpc\("ustore_reorder_entities", \{/);
  assert.match(block, /p_entity: "banners"/);
  assert.match(block, /order\.map\(\(id: string, index: number\) => \(\{ id, sortOrder: index \}\)\)/);
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '079_atomic_trash_and_reorder.sql'), 'utf8');
  assert.match(sql, /else\s*\n\s*update public\.banners set sort_order=v_sort where shop_id=p_shop_id and id=v_id;/);
});

test('item 6-fix (banner_update partial-update bug): toggling isActive alone no longer requires re-sending an image — banner_update fetches the existing row and only overwrites fields actually present in payload', () => {
  const start = shopApi.indexOf('case "banner_create"');
  const block = shopApi.slice(start, start + 2000);
  assert.match(block, /db\.from\("banners"\)\.select\("\*"\)\.eq\("id", id\)\.eq\("shop_id", shopId\)\.maybeSingle\(\);/);
  assert.match(block, /existing\?\.image_url/);
});

test('item 2: the featured-categories picker allows selecting a category at any depth (no !c.parentId root-only filter), and set_featured_categories validates both category AND product ids belong to this shop', () => {
  assert.doesNotMatch(app.slice(app.indexOf('function flattenCategoriesForPicker')), /filter\(c => !c\.parentId\)/);
  const start = shopApi.indexOf('case "set_featured_categories"');
  const block = shopApi.slice(start, start + 1800);
  assert.match(block, /db\.from\("products"\)\.select\("id"\)\.eq\("shop_id", shopId\)\.in\("id", allProductIds\)/);
});

test('item 5: the home admin action-center no longer has a low/out-of-stock quick-link card', () => {
  const start = app.indexOf('function renderAdminActionCenterHtml()');
  const block = app.slice(start, start + 700);
  assert.doesNotMatch(block, /lowStock/);
});

test('item 9: submitStaffInvite() guards against double-submit and disables the button while the request is in flight', () => {
  const start = app.indexOf('async function submitStaffInvite()');
  const block = app.slice(start, start + 1200);
  assert.match(block, /if \(staffInviteSubmitting\) return;/);
  assert.match(block, /btn\.disabled = true;/);
});

// PERFORMANCE ROUND 1 (2026-09-03): this used to assert a SECOND,
// redundant get_my_permissions poll living inside the 90s
// startBackgroundPolling() loop — it duplicated refreshMyStaffAccess()'s
// own 12s poll byte-for-byte (same call, same diff-and-update logic),
// firing an extra network request every 90s for nothing. That copy is
// now removed; the 12s poll (startStaffAccessSync/refreshMyStaffAccess)
// already covers everything it did, plus re-entrancy guarding and a
// Staff-page refresh the 90s copy never had.
test('item 11: a new get_my_permissions action exists, requires no specific permission (any authenticated member can check their own current role/permissions), and the frontend polls it via the dedicated 12s staff-access sync loop — not a second, redundant copy inside the 90s background poll', () => {
  const start = shopApi.indexOf('case "get_my_permissions"');
  assert.ok(start >= 0);
  const refreshStart = app.indexOf('async function refreshMyStaffAccess()');
  const refreshBlock = app.slice(refreshStart, app.indexOf('\n    }', refreshStart) + 6);
  assert.match(refreshBlock, /const data = await callApi\('get_my_permissions', \{\}\);/);
  assert.match(app, /staffAccessTimer = setInterval\(refreshMyStaffAccess, 12000\);/);
  const pollStart = app.indexOf('function startBackgroundPolling');
  const pollEnd = app.indexOf('\n    }', app.indexOf('}, 90000)', pollStart));
  const pollBlock = app.slice(pollStart, pollEnd);
  assert.doesNotMatch(pollBlock, /callApi\('get_my_permissions', \{\}\)/, 'the 90s background loop must not duplicate the dedicated 12s permission poll');
});

test('text zoom: setTextZoom clamps to [-2,2] and only overrides Tailwind\'s --text-* scale variables (never --spacing-*), so only font sizes change, not layout spacing', () => {
  const start = app.indexOf('function applyTextZoom(level)');
  const block = app.slice(start, start + 400);
  assert.match(block, /Math\.max\(-2, Math\.min\(2, Number\.parseInt\(level, 10\) \|\| 0\)\)/);
  const css = fs.readFileSync(path.join(__dirname, '..', 'ustore.css'), 'utf8');
  const cssBlock = css.slice(css.indexOf('--fc-zoom: 1'), css.indexOf('--fc-zoom: 1') + 700);
  assert.match(cssBlock, /--text-xs: calc\(0\.75rem \* var\(--fc-zoom\)\);/);
  assert.doesNotMatch(cssBlock, /--spacing/);
});
