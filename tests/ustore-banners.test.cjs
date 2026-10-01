// USTORE — Banner tizimi (17-band) + bosh sahifa tanlangan kataloglar
// qatori (foydalanuvchi qo'shimcha so'ragan). Statik tahlil, ixcham.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shopApi = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
const migration028 = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '028_banners.sql'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');

test('028 migration: banners is shop-scoped, RLS-enabled, and its product/category targets use composite (shop_id, ...) FKs (tenant-safe even for a cross-shop id typo)', () => {
  assert.match(migration028, /foreign key \(shop_id, target_product_id\) references public\.products\(shop_id, id\) on delete set null/);
  assert.match(migration028, /foreign key \(shop_id, target_category_id\) references public\.categories\(shop_id, id\) on delete set null/);
  assert.match(migration028, /alter table public\.banners enable row level security;/);
});

test("banner_create/update/delete/list all require requirePermission('marketing.manage') — a customer can never write a banner, and a staff member needs the marketing permission specifically", () => {
  for (const action of ['banner_list', 'banner_create', 'banner_delete']) {
    const start = shopApi.indexOf(`case "${action}"`);
    assert.ok(start >= 0, `${action} must exist`);
    const block = shopApi.slice(start, start + 300);
    assert.match(block, /await requirePermission\('marketing\.manage'\);/, `${action} must call requirePermission('marketing.manage')`);
  }
});

test('a banner always ends up with a real image (either a freshly uploaded one via storeProductImage, or an existing https URL) — banner_create/update reject a save with neither', () => {
  const start = shopApi.indexOf('case "banner_create"');
  const end = shopApi.indexOf('\n      case "banner_delete"', start);
  const block = shopApi.slice(start, end);
  assert.match(block, /if \(payload\.imageUpload\) \{\s*\n\s*uploadedBannerImage = await storeProductImage\(db, shopId, payload\.imageUpload\);\s*\n\s*imageUrl = uploadedBannerImage\.url;/);
  assert.match(block, /if \(!imageUrl\) \{[\s\S]*return json\(\{ error: "image_required" \}, 400\);[\s\S]*\}/);
});

test('a URL-target banner only accepts real http/https links (never javascript:/data: etc.) — validated server-side with new URL(), not a regex that could be bypassed', () => {
  const start = shopApi.indexOf('case "banner_create"');
  const end = shopApi.indexOf('case "banner_delete"', start);
  const block = shopApi.slice(start, end > start ? end : start + 3000);
  assert.match(block, /if \(u\.protocol !== "http:" && u\.protocol !== "https:"\) throw new Error\("bad_protocol"\);/);
});

test('activeBannersForClient() is the ONLY source the customer-facing boot() response uses, and it caps at 5 currently-in-schedule active banners server-side (shop-improvement round item 7 raised this from 3) — the storefront can never be flooded regardless of how many banners the admin has created', () => {
  const start = shopApi.indexOf('async function activeBannersForClient(');
  const block = shopApi.slice(start, shopApi.indexOf('\nfunction mapPromoForClient(', start));
  assert.match(block, /\.eq\("is_active", true\)/);
  assert.match(block, /\.filter\(\(banner: any\) =>/);
  assert.match(block, /\.slice\(0, 5\)\.map\(mapBannerForClient\)/);
  assert.match(shopApi, /activeBanners,\s*\n\s*featuredCategories:/, 'boot() must expose activeBanners (the capped, schedule-filtered list), not the raw banner table');
});

test('the home banner carousel only renders the text/CTA overlay for TEMPLATE-mode banners — an IMAGE-mode (fully ready-made) banner is shown as-is, with no template text stamped on top of it', () => {
  const start = appJs.indexOf('function renderBannerCarouselHtml()');
  const block = appJs.slice(start, start + 900);
  assert.match(block, /b\.mode === 'TEMPLATE' \? `<div class="fc-banner-overlay">/);
});

test('tapping a CATEGORY-target banner or a featured-category chip both reuse the SAME existing category-browsing navigation (currentTab/adminCatParentId) rather than each inventing its own product list', () => {
  const bannerStart = appJs.indexOf('function openBannerTarget(bannerId)');
  const bannerBlock = appJs.slice(bannerStart, bannerStart + 500);
  assert.match(bannerBlock, /currentTab = 'categories'; adminCatParentId = b\.targetCategoryId; categoryPage = 1; render\(\);/);

  const chipStart = appJs.indexOf('function openFeaturedCategoryAll(catId)');
  const chipBlock = appJs.slice(chipStart, chipStart + 200);
  assert.match(chipBlock, /currentTab = 'categories'; adminCatParentId = catId; categoryPage = 1; render\(\);/);
});

test('set_featured_categories requires marketing.manage permission, caps at 8 categories / 6 products each, and rejects any category or product id that doesn\'t actually belong to this shop (never trusts client-supplied ids blindly)', () => {
  const start = shopApi.indexOf('case "set_featured_categories"');
  const block = shopApi.slice(start, start + 2200);
  assert.match(block, /await requirePermission\('marketing\.manage'\);/);
  assert.match(block, /\.slice\(0, 8\)/);
  assert.match(block, /\.slice\(0, 6\)/);
  assert.match(block, /db\.from\("categories"\)\.select\("id"\)\.eq\("shop_id", shopId\)\.in\("id", catIds\)/);
  assert.match(block, /if \(catIds\.some\(\(id: string\) => !validCatSet\.has\(id\)\)\) return json\(\{ error: "invalid_category", invalidCategoryIds:[^\n]+\}, 400\);/);
  assert.match(block, /db\.from\("products"\)\.select\("id"\)\.eq\("shop_id", shopId\)\.in\("id", allProductIds\)/);
  assert.match(block, /if \(allProductIds\.some\(\(id: string\) => !validProdSet\.has\(id\)\)\) return json\(\{ error: "invalid_product", invalidProductIds:[^\n]+\}, 400\);/);
});

test('the admin featured-categories picker blocks adding a 9th category client-side (server also caps at 8 independently), and blocks a 7th product within one category (server caps at 6)', () => {
  const start = appJs.indexOf('function toggleFeaturedCategory(catId)');
  const block = appJs.slice(start, start + 500);
  assert.match(block, /if \(featuredCategories\.length >= 8\) return showActionToast/);

  const prodStart = appJs.indexOf('function toggleFeaturedCategoryProduct(catId, productId)');
  const prodBlock = appJs.slice(prodStart, prodStart + 500);
  assert.match(prodBlock, /if \(entry\.productIds\.length >= 6\) return showActionToast/);
});
