// Shop takomillashtirish qo'shimchasi: Bundle/Tier/Reward admin sahifalari +
// Marketing hub + public "Aksiyalar va chegirmalar" + banner BUNDLE/PROMOTION
// deep-link kengaytmasi frontend. Lean statik-tahlil, economical-usage qoidasiga mos.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
const shopApi = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');

test('renderActivePage routes all 6 new marketing pages (BUNDLES/DISCOUNT_TIERS/REWARD_RULES/MARKETING_HUB/CAMPAIGNS/CAMPAIGN_DETAIL)', () => {
  const start = app.indexOf('function renderActivePage(container)');
  const end = app.indexOf('function openPage(', start);
  const block = app.slice(start, end);
  for (const [id, fn] of [
    ["'BUNDLES'", 'renderBundlesPage'], ["'DISCOUNT_TIERS'", 'renderDiscountTiersPage'],
    ["'REWARD_RULES'", 'renderRewardRulesPage'], ["'MARKETING_HUB'", 'renderMarketingHubPage'],
    ["'CAMPAIGNS'", 'renderCampaignsPage'], ["'CAMPAIGN_DETAIL'", 'renderCampaignDetailPage'],
  ]) {
    assert.ok(block.includes(`case ${id}: ${fn}(container); break;`), `missing route for ${id}`);
  }
});

test('Profile admin menu no longer has separate Bannerlar/Promo-kodlar rows — consolidated into a single Marketing hub row (anti-clutter, spec item 31)', () => {
  const start = app.indexOf('const adminMenu = (isAdminMode && isUserAnAdmin)');
  const end = app.indexOf('const userQuick', start);
  const block = app.slice(start, end);
  assert.doesNotMatch(block, /onclick: 'openBannersPage\(\)'/, 'Bannerlar row must be removed from the flat admin menu');
  assert.doesNotMatch(block, /onclick: 'openPromoPage\(\)'/, 'Promo-kodlar row must be removed from the flat admin menu');
  assert.match(block, /onclick: 'openMarketingHubPage\(\)'/, 'a single Marketing hub row must replace them');
});

test('renderMarketingHubPage links to the five marketing tools plus restored home catalog settings', () => {
  const start = app.indexOf('function renderMarketingHubPage(container)');
  const block = app.slice(start, start + 1600);
  for (const fn of ['openBannersPage()', 'openBundlesPage()', 'openDiscountTiersPage()', 'openPromoPage()', 'openRewardRulesPage()']) {
    assert.ok(block.includes(fn), `Marketing hub must link to ${fn}`);
  }
  assert.match(block, /openFeaturedCategoriesPage\(\)/);
});

test('Bundle/Tier/Reward-rule admin pages are all gated behind isUserAnAdmin && isAdminMode (never openable by an ordinary customer)', () => {
  for (const openFn of ['openBundlesPage', 'openDiscountTiersPage', 'openRewardRulesPage', 'openMarketingHubPage']) {
    const start = app.indexOf(`function ${openFn}(`);
    assert.ok(start >= 0, `${openFn} must exist`);
    const block = app.slice(start, start + 200);
    assert.match(block, /if \(!\(isUserAnAdmin && isAdminMode(?: && hasPermission\('marketing\.manage'\))?\)\) return;/, `${openFn} must gate on admin mode`);
  }
});

test('saveBundleForm rejects fewer than 2 selected products client-side (mirrors the server-side bundle_needs_at_least_2_products guard) before ever calling the API', () => {
  const start = app.indexOf('async function saveBundleForm()');
  const block = app.slice(start, start + 1200);
  assert.match(block, /if \(d\.items\.length < 2\) return showAppNotice/);
});

test('the public "Aksiyalar va chegirmalar" campaigns list merges bundles+promotions from get_marketing_campaigns into one unified {kind,id,name,discountLabel} array (backend returns them as two separate arrays, not a flat "campaigns" list) — shared by both the CAMPAIGNS page and the home-page bundle strip via one loader', () => {
  const start = app.indexOf('async function ensureMarketingCampaignsLoaded(');
  const block = app.slice(start, start + 900);
  assert.match(block, /data\.bundles \|\| \[\]/);
  assert.match(block, /data\.promotions \|\| \[\]/);
  assert.match(block, /kind: 'BUNDLE'/);
  assert.match(block, /kind: 'PROMOTION'/);
});

test('openCampaignDetail normalizes the two different backend response shapes (data.bundle for kind=BUNDLE, data.promotion for kind=PROMOTION) into one common campaignDetail shape, and falls back to the campaign list (never a broken page) when get_campaign_detail returns no matching kind', () => {
  const start = app.indexOf('async function openCampaignDetail(kind, id)');
  const end = app.indexOf('function renderCampaignDetailPage', start);
  const block = app.slice(start, end > start ? end : start + 1800);
  assert.match(block, /data\.kind === 'BUNDLE' && data\.bundle/);
  assert.match(block, /data\.kind === 'PROMOTION' && data\.promotion/);
  assert.match(block, /openCampaignsPage\(\)/, 'must fall back to the campaign list on a not-found/unrecognized response');
});

test('openBannerTarget routes BUNDLE/PROMOTION banner targets to openCampaignDetail (the same safe-fallback detail page used by the public campaigns list) instead of a dead/broken link', () => {
  const start = app.indexOf('function openBannerTarget(bannerId)');
  const block = app.slice(start, start + 900);
  assert.match(block, /b\.targetType === 'BUNDLE' && b\.targetBundleId\) openCampaignDetail\('BUNDLE', b\.targetBundleId\)/);
  assert.match(block, /b\.targetType === 'PROMOTION' && b\.targetPromotionId\) openCampaignDetail\('PROMOTION', b\.targetPromotionId\)/);
});

test('the banner target-type tabs in renderBannerFormSheet include BUNDLE/PROMOTION options, and saveBannerForm requires a selection before submitting (mirrors the existing URL-target validation)', () => {
  const tabsStart = app.indexOf("['NONE','PRODUCT','CATEGORY','URL','BUNDLE','PROMOTION']");
  assert.ok(tabsStart >= 0, 'banner target tabs must include BUNDLE and PROMOTION');
  const saveStart = app.indexOf('async function saveBannerForm()');
  const saveBlock = app.slice(saveStart, saveStart + 1800);
  assert.match(saveBlock, /if \(targetType === 'BUNDLE' && !targetBundleId\) return showAppNotice/);
  assert.match(saveBlock, /if \(targetType === 'PROMOTION' && !targetPromotionId\) return showAppNotice/);
});

test('bundle add-to-cart: name/price/image are read from the already-open campaignDetail object, never round-tripped through an inline onclick string — a bundle name containing an apostrophe (common in Uzbek text) would otherwise break the onclick attribute', () => {
  const start = app.indexOf('function addBundleToCart(bundleId)');
  const block = app.slice(start, start + 500);
  assert.match(block, /campaignDetail\.name/);
  assert.doesNotMatch(app.slice(app.indexOf('function renderBundleAddToCartHtml'), app.indexOf('function renderBundleAddToCartHtml') + 600), /JSON\.stringify\(c\.name\)/, 'must not inline the bundle name into an onclick attribute');
});

test('bundle cart is a separate localStorage-backed state (bundleCart) from the product cart — checkout gate (openCheckoutForm), badge count (updateCartBadge) and total (checkoutSubtotal) all account for it, and submitOrder sends bundleItems alongside items and clears both carts on success', () => {
  assert.match(app, /let bundleCart = readStoredObject\(scopedKey\('bundleCart'\), \{\}\);/);
  const badgeStart = app.indexOf('function updateCartBadge()');
  assert.match(app.slice(badgeStart, badgeStart + 300), /Object\.values\(bundleCart\)\.reduce/);
  const gateStart = app.indexOf('function openCheckoutForm()');
  assert.match(app.slice(gateStart, gateStart + 200), /Object\.keys\(cart\)\.length === 0 && Object\.keys\(bundleCart\)\.length === 0/);
  const subStart = app.indexOf('function checkoutSubtotal()');
  assert.match(app.slice(subStart, subStart + 500), /bundlesTotal/);
  const submitStart = app.indexOf('async function submitOrder()');
  const submitEnd = app.indexOf('\n    async function ', submitStart + 10);
  const submitBlock = app.slice(submitStart, submitEnd > submitStart ? submitEnd : submitStart + 9000);
  assert.match(submitBlock, /bundleItems: bundleItemsPayload/);
  assert.match(submitBlock, /bundleCart = \{\};/);
  assert.match(submitBlock, /bundle_unavailable/);
});

test('banner form no longer offers a "Shablon asosida" (TEMPLATE) mode — every banner is now image-only (user feedback: the template picker was confusing/unnecessary), and a new draft always starts as mode:IMAGE even when editing an old TEMPLATE-mode banner', () => {
  assert.doesNotMatch(app, /Shablon asosida/, 'the TEMPLATE tab label must be removed from the banner form');
  assert.doesNotMatch(app, /function setBannerDraftMode/, 'the now-unused mode-switch function must be removed, not left dead');
  const openStart = app.indexOf('function openBannerForm(id)');
  const openBlock = app.slice(openStart, openStart + 700);
  assert.match(openBlock, /mode: 'IMAGE'/);
});

test('home page has no separate campaigns strip, while the banner carousel still renders for customer and admin modes', () => {
  assert.doesNotMatch(app, /function renderHomeBundlesSectionHtml\(\)/);
  const homeStart = app.indexOf('function renderHome(container)');
  const homeBlock = app.slice(homeStart, homeStart + 2000);
  assert.match(homeBlock, /renderBannerCarouselHtml\(\)/);
  assert.doesNotMatch(homeBlock, /renderHomeBundlesSectionHtml\(\)/);
  assert.doesNotMatch(homeBlock, /\(isAdminMode && isUserAnAdmin\) \? renderAdminActionCenterHtml\(\) : renderBannerCarouselHtml\(\)/, 'banner carousel must render unconditionally, not only in the non-admin branch');
});

test('backend banner_create/banner_update: BUNDLE/PROMOTION target ids are validated as belonging to the current shop before being saved (never trusts a client-supplied bundle/promotion id blindly, same pattern as bundle_create\'s product ownership check)', () => {
  const start = shopApi.indexOf('case "banner_create"');
  const end = shopApi.indexOf('case "banner_delete"', start);
  const block = shopApi.slice(start, end > start ? end : start + 6000);
  assert.match(block, /\["PRODUCT", "CATEGORY", "URL", "BUNDLE", "PROMOTION"\]\.includes\(payload\.targetType\)/);
  assert.match(block, /db\.from\("bundles"\)\.select\("id"\)\.eq\("shop_id", shopId\)\.eq\("id", targetBundleId\)\.maybeSingle\(\);/);
  assert.match(block, /db\.from\("promotions"\)\.select\("id"\)\.eq\("shop_id", shopId\)\.eq\("id", targetPromotionId\)\.maybeSingle\(\);/);
  assert.match(block, /target_bundle_id: targetBundleId, target_promotion_id: targetPromotionId,/);
});
