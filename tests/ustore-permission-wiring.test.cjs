// USTORE — Admin Roles & Permissions, 2.2-bosqich: requireAdmin() dan
// requirePermission('x.y') ga o'tkazilgan ~51 ta action'ning to'g'ri
// permission'ga bog'langanini tekshiradi. Owner/platforma bosh admin
// xatti-harakati o'zgarmaganini (requirePermission ularni har doim
// o'tkazadi) alohida tasdiqlaydi.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shopApi = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');

function permOf(action) {
  const idx = shopApi.indexOf(`case "${action}"`);
  assert.ok(idx >= 0, `${action} action must exist`);
  const block = shopApi.slice(idx, idx + 300);
  const m = block.match(/await requirePermission\('([a-z._]+)'\)/);
  assert.ok(m, `${action} must call requirePermission(...)`);
  return m[1];
}

test('a representative action from each permission group maps to the correct permission key', () => {
  const expected = {
    add_category: 'catalog.manage',
    delete_category: 'catalog.manage',
    add_product: 'products.manage',
    edit_product_field: 'products.manage',
    toggle_product_visibility: 'products.manage',
    bulk_import_products: 'products.import_export',
    get_warehouse_summary: 'stock.view',
    record_stock_in: 'stock.manage',
    get_all_orders: 'orders.view',
    update_shipment: 'orders.manage',
    set_order_internal_note: 'orders.manage',
    get_users_summary: 'customers.view',
    block_user: 'customers.manage',
    get_support_tickets: 'support.manage',
    get_dashboard_lite: 'reports.view',
    get_admin_action_center: 'reports.view',
    promo_create: 'marketing.manage',
    banner_delete: 'marketing.manage',
    set_featured_categories: 'marketing.manage',
  };
  for (const [action, expectedPerm] of Object.entries(expected)) {
    assert.equal(permOf(action), expectedPerm, `${action} should require '${expectedPerm}'`);
  }
});

test('every permission string used anywhere in a requirePermission() call is one of the 15 keys defined in the shared PERMISSIONS catalog — no typo\'d permission that would silently be unassignable to any role', () => {
  const permissionsTs = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'permissions.ts'), 'utf8');
  const catalogStart = permissionsTs.indexOf('export const PERMISSIONS');
  const catalogEnd = permissionsTs.indexOf('] as const;');
  const validPerms = new Set(
    permissionsTs.slice(catalogStart, catalogEnd).split('\n')
      .map((l) => l.match(/"([a-z._]+)"/)?.[1]).filter(Boolean)
  );
  const used = [...shopApi.matchAll(/requirePermission\('([a-z._]+)'\)/g)].map((m) => m[1]);
  assert.ok(used.length >= 40, 'sanity: a substantial number of call sites must have been converted');
  for (const p of new Set(used)) {
    assert.ok(validPerms.has(p), `"${p}" used in a requirePermission() call is not in the PERMISSIONS catalog`);
  }
});

test('the shared status block permission-gates admin actions while customer cancel/confirm retain their separate guards', () => {
  const idx = shopApi.indexOf('if (action === "update_order_status" || (isAdmin && ["cancel_order", "confirm_order_received"].includes(action)))');
  assert.ok(idx >= 0);
  assert.match(shopApi.slice(idx, idx + 180), /await requirePermission\('orders\.manage'\);/);
});

test('add_admin/remove_admin (platform-level OWNER provisioning, not the shop-level staff.manage system) stay on requireSuperAdmin() — they are a different, higher-privilege operation than anything requirePermission() gates', () => {
  for (const action of ['add_admin', 'remove_admin']) {
    const idx = shopApi.indexOf(`case "${action}"`);
    assert.ok(idx >= 0);
    const block = shopApi.slice(idx, idx + 200);
    assert.match(block, /requireSuperAdmin\(\);/, `${action} must require the platform super admin`);
    assert.doesNotMatch(block, /requirePermission\(/, `${action} must not be reachable via the granular shop-level permission system`);
  }
});

test('2.6-bosqich: EVERY remaining requireAdmin() call site in shop-api has been converted to requirePermission() — the only two actions still gated by requireSuperAdmin() are add_admin/remove_admin (platform provisioning, intentionally a separate, higher tier), and send_support_message/close_support_ticket use their own dual-identity (admin-or-ticket-owner) check instead of either guard', () => {
  assert.doesNotMatch(shopApi, /\n\s*requireAdmin\(\);/, 'no bare requireAdmin() call should remain anywhere in shop-api — every shop-admin action must be gated by a specific permission');
  assert.match(shopApi, /case "get_admins_list": \{\s*\n\s*await requirePermission\('staff\.manage'\);/, 'get_admins_list (lists this shop\'s own members) is now consistently gated the same way as the newer staff_list action');
});

test('the newly-converted actions (shop settings, Billz/Click integrations, trash, abandoned carts) each map to the permission that actually matches what they do — not an arbitrary catch-all', () => {
  const expected = {
    set_shop_contact: 'shop.settings.manage',
    set_design_settings: 'shop.settings.manage',
    set_legal_documents: 'shop.settings.manage',
    set_shop_logo: 'shop.settings.manage',
    set_fulfillment_config: 'shop.settings.manage',
    set_orders_paused: 'shop.settings.manage',
    set_order_policies: 'shop.settings.manage',
    set_low_stock_threshold: 'shop.settings.manage',
    retry_bad_translations: 'shop.settings.manage',
    billz_connect: 'integrations.manage',
    click_connect: 'integrations.manage',
    billz_import_products: 'integrations.manage',
    get_trash: 'products.manage',
    purge_trash_batch_now: 'products.manage',
    list_abandoned_carts: 'marketing.manage',
  };
  for (const [action, expectedPerm] of Object.entries(expected)) {
    assert.equal(permOf(action), expectedPerm, `${action} should require '${expectedPerm}'`);
  }
});
