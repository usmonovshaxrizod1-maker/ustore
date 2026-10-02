const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
const api = fs.readFileSync(path.join(root, 'supabase/functions/shop-api/index.ts'), 'utf8');
const migration = (name) => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');

test('1-2: filter uses the premium component and the rejected welcome modal is removed', () => {
  assert.match(app, /fc-cat-filter-sheet/);
  assert.match(app, /updateCategoryFilterLive/);
  assert.match(css, /\.fc-cat-filter-footer/);
  assert.doesNotMatch(app, /ADMIN_WELCOME|showAdminWelcomeModal|fc-welcome-card/);
  assert.doesNotMatch(css, /\.fc-welcome-(overlay|card|primary|secondary)/);
});

test('3: featured home selections persist through the correct existing API action', () => {
  const start = app.indexOf('async function saveFeaturedCategories');
  const block = app.slice(start, start + 1800);
  assert.match(block, /callApi\('set_featured_categories'/);
  assert.doesNotMatch(block, /callApi\('set_marketing_settings'/);
  assert.match(block, /slice\(0,\s*8\)/);
  assert.match(block, /productIds[^\n]*slice\(0,\s*6\)/);
});

test('4-5: icon actions are consistent and above-fold images are coordinated', () => {
  assert.match(css, /\.fc-action-icon-btn\.is-save/);
  assert.match(css, /\.fc-action-icon-btn\.is-cancel/);
  assert.match(app, /function revealCoordinatedImage/);
  assert.match(app, /loading="\$\{idx < 6 \? 'eager' : 'lazy'\}"/);
  assert.match(app, /fetchpriority="\$\{idx < 6 \? 'high' : 'auto'\}"/);
  assert.doesNotMatch(css, /\.fc-image-sync-card\.is-loading/);
});

test('6: abandoned carts are paged, queued, retried and protected from duplicate workers', () => {
  const sql = migration('087_abandoned_cart_campaigns.sql');
  assert.match(sql, /create table if not exists public\.abandoned_cart_campaigns/);
  assert.match(sql, /create table if not exists public\.abandoned_cart_reminder_queue/);
  assert.match(api, /case "create_abandoned_cart_campaign"/);
  assert.match(api, /const processJob = async/);
  assert.match(api, /select\("id"\)\.maybeSingle\(\)/);
  assert.match(api, /attempts >= 3/);
  assert.match(api, /age > 7 \* 86400000/);
});

test('7: audit journal is tenant scoped, manager gated and secret masked', () => {
  const sql = migration('088_audit_log_indexes.sql');
  assert.match(sql, /admin_audit_log_shop_admin_created_idx/);
  assert.match(api, /async function canViewAuditLog/);
  assert.match(api, /role\.key === "MANAGER"/);
  assert.match(api, /case "list_admin_audit_log"/);
  assert.match(api, /\.eq\("shop_id", shopId\)/);
  assert.match(api, /details: maskAuditDetails\(details \?\? null\)/);
});

test('8: support images stay private and use signed upload/view URLs', () => {
  const sql = migration('089_support_attachments.sql');
  assert.match(sql, /'support-attachments', 'support-attachments', false/);
  assert.match(sql, /5242880/);
  assert.match(api, /case "get_support_attachment_upload_url"/);
  assert.match(api, /createSignedUploadUrl\(path\)/);
  assert.match(api, /createSignedUrl\(message\.attachment_path, 300\)/);
  assert.match(app, /accept="image\/\*"/);
  assert.match(app, /function openSupportImageViewer/);
});

test('9: Billz change is presentation-only and keeps existing actions', () => {
  assert.match(app, /fc-billz-filter-row/);
  assert.match(app, /fc-billz-check/);
  assert.match(app, /case 'BILLZ': renderBillzPage/);
  assert.match(api, /case "billz_browse_products"/);
  assert.match(api, /case "billz_import_products"/);
  assert.doesNotMatch(migration('087_abandoned_cart_campaigns.sql') + migration('088_audit_log_indexes.sql') + migration('089_support_attachments.sql'), /billz_/i);
});
