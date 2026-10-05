const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('task17: packaged category SVG library is replaced with final 1045 unique icons', () => {
  const manifest = JSON.parse(read('web/assets/category-icons/category-icons.json'));
  assert.equal(manifest.icons.length, 1045);
  assert.equal(new Set(manifest.icons.map((x) => x.id)).size, 1045);
  const sprite = read('web/assets/category-icons/category-icons.svg');
  assert.equal((sprite.match(/<symbol\b/g) || []).length, 1045);
  assert.equal(fs.readdirSync(path.join(ROOT, 'web/assets/category-icons/icons')).filter((x)=>x.endsWith('.svg')).length, 1045);
});

test('task17: shop picker accepts packaged 1045 and runtime platform icons', () => {
  const app = read('ustore-shop-app.js');
  assert.match(app, /manifest\.icons\.length !== 1045/);
  assert.match(app, /customCategoryIconMap = new Map/);
  assert.match(app, /categoryIconPickerItems\(\)/);
  assert.match(app, /bootData\.customCategoryIcons/);
  assert.match(app, /custom\?\.svg/);
});

test('task17: dynamic registry is service-role backed and validates category writes', () => {
  const migration = read('supabase/migrations/118_category_icon_library.sql');
  const shopApi = read('supabase/functions/shop-api/index.ts');
  assert.match(migration, /create table if not exists public\.category_icon_library/);
  assert.match(migration, /enable row level security/);
  assert.match(shopApi, /categoryIconIsAllowed/);
  assert.match(shopApi, /customCategoryIcons:/);
  assert.match(shopApi, /category_icon_library/);
});

test('task17: platform super admin can batch add and activate custom SVG icons', () => {
  const api = read('supabase/functions/platform-api/index.ts');
  const ui = read('platform/platform-app.js');
  assert.match(api, /case "platform_list_category_icons"/);
  assert.match(api, /case "platform_upsert_category_icons"/);
  assert.match(api, /case "platform_set_category_icon_active"/);
  assert.match(api, /sanitizeCategorySvg/);
  assert.match(api, /requirePlatformSuperAdmin\(\)/);
  assert.match(ui, /Kategoriya SVG ikonlari/);
  assert.match(ui, /type="file" multiple onchange="onCategoryIconFilesPicked/);
  assert.match(ui, /platform_upsert_category_icons/);
});
