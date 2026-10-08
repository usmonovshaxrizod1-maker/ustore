const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const html = read('index.html');
const app = read('ustore-shop-app.js');
const css = read('ustore.css');
const webApp = read('web/app.js');
const webCss = read('web/styles/index.css');
const host = read('web/shared/frame-host.js');
const bridge = read('web/shared/miniapp-frame-bridge.js');

test('desktop follow-up: logo/home navigation and search-before-home-before-categories are wired', () => {
  assert.match(html, /id="header-home-logo-btn"[^>]*onclick="switchTab\('home'\)"/);
  assert.match(html, /id="desktop-nav-home-btn"[^>]*onclick="switchTab\('home'\)"/);
  const search = html.indexOf('ustore-desktop-search');
  const home = html.indexOf('id="desktop-nav-home-btn"');
  const cats = html.indexOf('data-desktop-tab="categories"');
  assert.ok(search > -1 && home > search && cats > home);
  assert.match(app, /desktopHome\.hidden = !browserBridge \|\| currentWebRoute === '\/'/);
  assert.match(css, /\.ustore-header-home-logo\{[^}]*pointer-events:none/);
  assert.match(css, /body\.ustore-browser-mode \.ustore-header-home-logo\{[^}]*pointer-events:auto/);
});

test('desktop follow-up: desktop language uses SVG flags, not UZ/RU text', () => {
  assert.match(app, /function desktopFlagSvg\(lang\)/);
  assert.match(app, /desktopLangBtn\.innerHTML = desktopFlagSvg\(uiLang\)/);
  assert.match(app, /<svg class="fc-lang-flag-svg" viewBox="0 0 30 20"/);
  assert.doesNotMatch(html, /id="desktop-lang-btn"[^>]*>\s*(?:UZ|RU|🇺🇿|🇷🇺)/);
});

test('desktop follow-up: guest profile is compact, centered and auth choices stack', () => {
  assert.match(app, /fc-guest-profile-shell/);
  assert.match(css, /body\.ustore-browser-mode \.fc-guest-profile-shell\{width:min\(100%,560px\);margin:clamp/);
  assert.match(css, /body\.ustore-browser-mode \.fc-guest-auth-actions\{[^}]*display:grid;grid-template-columns:1fr/);
});

test('desktop follow-up: admin profile has desktop grid while legacy mobile menu remains', () => {
  assert.match(app, /fc-admin-desktop-grid/);
  assert.match(css, /body\.ustore-browser-mode\.fc-admin-mode \.fc-profile-admin-sections\{display:none\}/);
  assert.match(css, /body\.ustore-browser-mode\.fc-admin-mode \.fc-admin-desktop-hub\{display:block\}/);
  assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(app, /Domen va manzil/);
  assert.match(app, /Web login va parol/);
});

test('desktop follow-up: admin header removes cart/redundant management and keeps admin panel reachable', () => {
  assert.doesNotMatch(html, /id="desktop-nav-admin-btn"/);
  assert.match(html, /id="desktop-admin-panel-btn"/);
  assert.match(app, /desktopCart\.hidden = adminMode/);
  assert.match(app, /desktopAdminPanel\.hidden = !adminMode/);
  assert.match(html, /id="desktop-role-switch-btn"/);
});

test('desktop follow-up: category icons lose pasted-on white tile only in browser desktop mode', () => {
  assert.match(css, /body\.ustore-browser-mode \.fc-category-responsive-grid \.fc-category-icon-frame\{background:transparent!important;border:0!important;box-shadow:none!important/);
});

test('desktop follow-up: shop host keeps one branded opening until child APP_READY without skeleton cards', () => {
  assert.match(webApp, /function shopOpeningView/);
  assert.doesNotMatch(webApp.match(/function shopOpeningView[\s\S]*?\n\}/)?.[0] || '', /USTORE|__hero|__cards/);
  assert.match(host, /placeholder\.className = 'uw-shop-opening'/);
  assert.match(read('web/index.html'), /uw-shop-opening uw-initial-shop-opening/);
  assert.match(read('web/styles/index.css'), /html\[data-ustore-host="shop"\] \.uw-launch--platform\{display:none!important\}/);
  assert.match(host, /message\.type === 'APP_READY'/);
  assert.match(bridge, /type: 'APP_READY'/);
  assert.match(webCss, /\.uw-miniapp-host\.is-loading \.uw-miniapp-frame\{opacity:0/);
  assert.match(webCss, /\.uw-miniapp-host\.is-ready \.uw-miniapp-frame\{opacity:1/);
});

test('desktop follow-up: product detail replaces legacy system emojis with desktop SVG equivalents', () => {
  assert.match(app, /fc-product-detail-add/);
  assert.match(app, /data-lucide="shopping-cart"/);
  assert.match(app, /fc-product-desktop-svg[^>]*><i data-lucide="file-text"/);
  assert.match(css, /body\.ustore-browser-mode \.fc-product-desktop-svg\{display:inline-flex/);
  assert.match(css, /body\.ustore-browser-mode \.fc-product-mobile-emoji\{display:none/);
});

test('desktop follow-up: responsive header keeps actions reachable through 125% zoom-like widths', () => {
  assert.match(css, /@media \(min-width:768px\) and \(max-width:1099px\)/);
  assert.match(css, /@media \(min-width:1100px\) and \(max-width:1399px\)/);
  assert.match(css, /\.ustore-desktop-nav>button:not\(\[hidden\]\)\{display:inline-flex!important/);
  assert.match(css, /\.ustore-desktop-search\{min-width:150px;flex:1 1 260px\}/);
});

test('desktop follow-up: web profile logout signs out host session and returns to stable profile route', () => {
  assert.match(app, /performWebProfileSignOut/);
  assert.match(app, /browserBridge\.request\('web_sign_out'/);
  assert.match(host, /action === 'web_sign_out'/);
  assert.match(host, /runtime\.services\?\.auth\?\.signOut\?\.\(\)/);
  assert.match(webApp, /onSignedOut\(\)[\s\S]*?go\('\/profile', true\)/);
});

test('task 4: desktop/tablet header/profile/settings are unified without changing favorites/recent', () => {
  assert.match(html, /data-desktop-tab="orders"/);
  assert.match(html, /data-desktop-tab="profile" id="desktop-admin-panel-btn"/);
  assert.match(html, /class="ustore-desktop-profile" data-desktop-tab="profile" id="desktop-profile-btn"/);
  assert.match(app, /desktopProfile\.hidden = adminMode/);
  assert.match(css, /\.ustore-desktop-action\[aria-current="page"\]/);
  assert.match(app, /fc-user-profile-lower-actions/);
  assert.match(css, /\.fc-user-profile-lower-actions\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(app, /openPage\('FAVORITES','nav-profile'\)/);
  assert.match(app, /openPage\('RECENT','nav-profile'\)/);
  assert.match(css, /\.fc-settings-menu-list\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /body\.ustore-browser-mode \.fc-command-panel\{[\s\S]*?display:flex;[\s\S]*?max-height:calc\(100dvh - 32px\)!important/);
  assert.match(css, /body\.ustore-browser-mode \.fc-command-scroll\{[\s\S]*?min-height:0;[\s\S]*?max-height:none!important/);
});
