const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const app = read('ustore-shop-app.js');
const css = read('ustore.css');

test('batch task 1: storefront info has dedicated pages and seller settings persistence', () => {
  assert.match(app, /openStorefrontInfoPage\('delivery'\)/);
  assert.match(app, /openStorefrontInfoPage\('returns'\)/);
  assert.match(app, /openStorefrontInfoPage\('terms'\)/);
  assert.match(app, /openStorefrontInfoPage\('privacy'\)/);
  assert.match(app, /openStorefrontInfoPage\('seller'\)/);
  assert.match(app, /sellerLegalName/);
  assert.match(read('supabase/migrations/116_storefront_seller_details.sql'), /seller_legal_name/);
  assert.match(css, /@media\(min-width:1024px\)[^{]*\{[^}]*\.fc-storefront-footer-grid\{grid-template-columns:repeat\(3/);
});

test('batch task 2: Telegram uses one central callback and guest profile is explicit', () => {
  const oidc = read('supabase/functions/_shared/telegram-oidc.ts');
  assert.match(oidc, /\/auth\/telegram\/callback/);
  assert.match(read('web/navigation/routes.js'), /path: '\/auth\/telegram\/callback'/);
  assert.match(app, /fc-guest-profile-card/);
  assert.match(app, /method=telegram/);
  assert.match(app, /method=password/);
});

test('batch task 3: startup uses readiness skeletons instead of welcome pages', () => {
  assert.match(app, /fc-boot-skeleton/);
  assert.doesNotMatch(app, /do'koniga xush kelibsiz!/);
  assert.match(read('web/index.html'), /uw-shop-first-paint uw-initial-shop-skeleton/);
  assert.match(read('web/launch-boot.js'), /dataset\.ustoreHost = isShop \? 'shop' : 'platform'/);
  assert.doesNotMatch(read('web/launch-boot.js'), /xush kelibsiz/);
});

test('batch task 4: admin/user switch stays backend-authoritative and visible to admins', () => {
  assert.match(app, /isUserAnAdmin\s*=\s*!!?bootData\.isAdmin|isUserAnAdmin\s*=\s*bootData\.isAdmin/);
  assert.match(app, /isAdminMode\s*=\s*isUserAnAdmin/);
  assert.match(app, /togglePersonMenu/);
});

test('batch task 5: checkout is 3-step and server draft works in Mini App plus web', () => {
  assert.match(app, /fc-checkout-progress/);
  assert.match(app, /checkoutStep/);
  assert.match(app, /checkoutServerDraftAvailable/);
  assert.match(app, /tg\?\.initDataUnsafe\?\.user\?\.id/);
  assert.match(app, /save_checkout_draft/);
  assert.match(app, /get_checkout_draft/);
  assert.match(app, /To‘lovni davom ettirish/);
  assert.match(read('supabase/migrations/117_checkout_drafts.sql'), /create table if not exists public\.checkout_drafts/i);
});

test('batch task 6: desktop banner keeps 5:2 and has manual arrows', () => {
  assert.match(css, /body\.ustore-browser-mode \.fc-banner-card\{max-height:none!important;aspect-ratio:5\/2\}/);
  assert.match(app, /fc-banner-arrow is-prev/);
  assert.match(app, /fc-banner-arrow is-next/);
  assert.match(app, /scrollHomeBannerBy\(-1,event\)/);
  assert.match(app, /scrollHomeBannerBy\(1,event\)/);
});

test('desktop-only polish: flags, wider search, aligned cards, no header favorites', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /desktop-nav-favorites/);
  assert.match(html, /id="desktop-lang-btn"[^>]*><span class="ustore-desktop-flag-placeholder"/);
  assert.match(app, /function desktopFlagSvg\(lang\)/);
  assert.match(css, /@media \(min-width:768px\)/);
  assert.match(css, /body\.ustore-browser-mode \.ustore-desktop-search\{flex:1 1 auto;max-width:none\}/);
  assert.match(css, /body\.ustore-browser-mode \[data-product-card-title\]/);
  assert.match(css, /body\.ustore-browser-mode \.fc-product-card-meta\{min-height:/);
});

test('desktop-only filter becomes a multi-column dialog without changing mobile base', () => {
  assert.match(css, /body\.ustore-browser-mode \.fc-cat-filter-body\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /body\.ustore-browser-mode \.fc-cat-filter-sheet\{width:min\(860px/);
  assert.match(app, /fc-cat-filter-close/);
});

test('auth polish: premium shared login and BFCache back keeps the live storefront', () => {
  const webApp = read('web/app.js');
  const features = read('web/styles/features.css');
  assert.match(features, /\.uw-auth\[data-feature="login"\][\s\S]*box-shadow:\s*var\(--uw-shadow-md\)/);
  assert.match(features, /\.uw-auth\[data-feature="login"\] \.uw-auth-tabs \.uw-button/);
  assert.match(webApp, /if \(event\.persisted\) applyDocumentLocale\(uiLocale\)/);
  assert.doesNotMatch(webApp, /if \(event\.persisted && router\) router\.start\(\)/);
});
