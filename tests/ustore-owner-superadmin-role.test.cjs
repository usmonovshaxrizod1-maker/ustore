const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const shopApi = fs.readFileSync(path.join(root, 'supabase/functions/shop-api/index.ts'), 'utf8');

test('platform super-admin still loads an actual shop OWNER membership', () => {
  const start = shopApi.indexOf('const isPlatformSuperAdmin =');
  const end = shopApi.indexOf('function requireAdmin()', start);
  assert.ok(start >= 0 && end > start, 'shop authority block must exist');
  const block = shopApi.slice(start, end);

  assert.match(block, /const membershipResult = await db\.from\("shop_memberships"\)/);
  assert.match(block, /const membershipRow: any = membershipResult\.data;/);
  assert.doesNotMatch(block, /if \(!isPlatformSuperAdmin\)/);
});

test('Mini App Domains remains tied to the real OWNER role', () => {
  const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('function canManageDomainsPage()');
  const end = app.indexOf('function openDomainsSettingsPage()', start);
  assert.ok(start >= 0 && end > start, 'domains permission helper must exist');
  const block = app.slice(start, end);

  assert.match(block, /staffRole === 'OWNER'/);
  assert.doesNotMatch(block, /isSuperAdmin/);
});

test('Shop App profile exposes Domain and address directly to an eligible owner', () => {
  const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('function renderProfile(container)');
  const end = app.indexOf('function readShopContactFormValues()', start);
  assert.ok(start >= 0 && end > start, 'profile renderer must exist');
  const block = app.slice(start, end);
  const adminMenuEnd = block.indexOf('const userQuick =');
  const directRow = block.indexOf("title: tr('Domen va manzil'");

  assert.ok(directRow > adminMenuEnd, 'domain row must live in the common profile area, outside the admin-mode-only menu');
  assert.match(block.slice(directRow - 120, directRow + 400), /canManageDomainsPage\(\).*openDomainsSettingsPage\(\)/s);
  assert.equal((block.match(/title: tr\('Domen va manzil'/g) || []).length, 1, 'profile must not duplicate the domain row');
});
