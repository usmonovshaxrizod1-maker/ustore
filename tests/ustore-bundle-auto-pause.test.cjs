const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '037_bundle_auto_pause.sql'), 'utf8');

test('bundle stores accepted component prices and has durable pause metadata', () => {
  assert.match(migration, /add column if not exists pause_reason jsonb/);
  assert.match(migration, /add column if not exists paused_at timestamptz/);
  const start = api.indexOf('case "bundle_create"');
  const end = api.indexOf('case "bundle_delete"', start);
  const block = api.slice(start, end);
  assert.match(block, /unitPrice: Number/);
  assert.match(block, /bundle_product_unavailable/);
  assert.match(block, /pause_reason: null, paused_at: null/);
});

test('active bundles pause once for price or stock changes and notify only marketing admins', () => {
  const start = api.indexOf('async function validateAndPauseBundles');
  const end = api.indexOf('async function shopDisplayNameForMessages', start);
  const block = api.slice(start, end);
  assert.match(block, /PRICE_CHANGED/);
  assert.match(block, /OUT_OF_STOCK/);
  assert.match(block, /eq\("is_active", true\)\.select\("id"\)/);
  assert.match(block, /marketingAdminChatIds/);
  assert.match(api, /eq\("permission", "marketing\.manage"\)/);
  assert.match(block, /AKSIYA AVTOMATIK TO'XTATILDI/);
});

test('bundle validation runs after product/order changes and during storefront boot', () => {
  assert.match(api, /priceChangeToLog \|\| stockFieldTouched[\s\S]*validateAndPauseBundles/);
  assert.match(api, /BUNDLE_POST_ORDER_PAUSE_FAILED/);
  assert.match(api, /BUNDLE_BOOT_VALIDATION_FAILED/);
  assert.match(api, /if \(bundleReqs\.length\) await validateAndPauseBundles/);
});

test('admin sees the exact pause cause and can edit or explicitly continue', () => {
  assert.match(app, /function bundlePauseReasonText/);
  assert.match(app, /function resumeBundleAfterPause/);
  assert.match(app, /Yangi narx va qoldiqni qabul qilib davom etasizmi/);
  assert.match(app, /b\.pauseReason\s*\?\s*`<button[^`]*resumeBundleAfterPause/);
  assert.match(css, /\.fc-bundle-paused-note/);
  assert.match(css, /\.fc-bundle-resume-btn/);
});
