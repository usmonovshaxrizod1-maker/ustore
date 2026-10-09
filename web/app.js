import { createRouter, createRouteMatcher, splitTarget } from './navigation/router.js';
import { createNotFoundView } from './navigation/not-found.js';
import { createCustomerShell, createAdminShell } from './shells/index.js';
import { createButton, createStatePanel } from './components/ui.js';
import { createTranslator, normalizeLocale } from './i18n/index.js';
import { localizeCustomerDom } from './i18n/customer-copy.js';
import { buildCanonicalUrl, createDocumentMetadataManager, sharePage } from './metadata/index.js';
import { createMiniAppFrameHost } from './shared/frame-host.js?v=20261009t8';
import { secureUuidV4 } from './shared/browser-id.js';
import { shopAuthReturnTo } from './features/auth/return-target.js';

const root = document.getElementById('ustore-web-app');
if (!root) throw new Error('UStorE web root topilmadi.');

let router = null;
let shopRuntime = null;
let platformRuntime = null;
let platformPortalController = null;
let platformAdminController = null;
let productionRuntimeModulePromise = null;
let authFeatureModulePromise = null;
let loginFeatureModulePromise = null;
let context = null;
let renderEpoch = 0;
let centralSignInJustCompleted = false;
let activeCleanup = [];
let activeRouteReason = 'start';
let sharedFrame = null;
let frameSignInPending = false;
let shopLaunchShown = globalThis.__USTORE_SHOP_LAUNCH_SKIP__ === true;
const WEB_LOCALE_KEY = 'ustore.web.locale';
const metadataManager = createDocumentMetadataManager({ documentRef: document });
const matchWebRoute = createRouteMatcher();

function readStoredLocale() {
  try { return globalThis.localStorage?.getItem?.(WEB_LOCALE_KEY) || ''; } catch (_) { return ''; }
}
function queryLocale() {
  try { return new URLSearchParams(globalThis.location?.search || '').get('lang') || ''; } catch (_) { return ''; }
}
let uiLocale = normalizeLocale(queryLocale() || readStoredLocale() || 'uz');
function applyDocumentLocale(locale = uiLocale) {
  uiLocale = normalizeLocale(locale);
  const tr = createTranslator(uiLocale);
  if (document?.documentElement) document.documentElement.lang = uiLocale;
  const skip = document?.querySelector?.('.uw-skip-link');
  if (skip) skip.textContent = tr.t('a11y.skipToMain', 'Asosiy qismga o‘tish');
  return uiLocale;
}
function setUiLocale(locale, { persist = true, rerender = true } = {}) {
  const next = applyDocumentLocale(locale);
  if (persist) { try { globalThis.localStorage?.setItem?.(WEB_LOCALE_KEY, next); } catch (_) {} }
  globalThis.USTORE_SHOP_WELCOME?.update?.(root.querySelector('.ustore-welcome'), { locale:next });
  if (rerender && router) renderRoute(router.getCurrent(), 'locale');
  return next;
}
applyDocumentLocale(uiLocale);

function cleanupActive() {
  for (const fn of activeCleanup.splice(0)) { try { fn?.(); } catch (_) {} }
}
function remember(fn) { if (typeof fn === 'function') activeCleanup.push(fn); return fn; }
function elementOf(value) { return value?.element || value; }
function routeMainTarget(node) {
  if (!node) return null;
  let main = node.id === 'uw-main-content' ? node : node.querySelector?.('#uw-main-content');
  if (!main) {
    main = node;
    if (!main.id) main.id = 'uw-main-content';
    if (String(main.tagName || '').toLowerCase() !== 'main' && !main.getAttribute?.('role')) main.setAttribute?.('role', 'main');
  }
  if (main.tabIndex == null || main.tabIndex >= 0) main.tabIndex = -1;
  return main;
}
function settleRouteFocus(main) {
  if (!main || !['navigate','replace','popstate','locale'].includes(activeRouteReason)) return;
  queueMicrotask(() => {
    if (!main.isConnected) return;
    if (activeRouteReason === 'navigate' || activeRouteReason === 'replace') {
      try { globalThis.scrollTo?.({ top:0, left:0, behavior:'auto' }); } catch (_) { try { globalThis.scrollTo?.(0,0); } catch (_) {} }
    }
    try { main.focus({ preventScroll:true }); } catch (_) { main.focus?.(); }
  });
}
function mount(value) {
  cleanupActive();
  const node = elementOf(value) || createStatePanel({ kind:'error', title:'Sahifa ochilmadi', message:'UI elementi yaratilmagan.' });
  if (sharedFrame && node !== sharedFrame.view.element) {
    sharedFrame.view.destroy();
    sharedFrame = null;
  }
  root.replaceChildren(node);
  settleRouteFocus(routeMainTarget(node));
  if (typeof value?.destroy === 'function') remember(value.destroy);
}
function mountSharedFrame({ kind, routeState, runtime, tenant = null, viewerAccountId = '' }) {
  const next = routeState.target || '/';
  if (sharedFrame && sharedFrame.kind === kind && sharedFrame.botId === String(tenant?.botId || '') && sharedFrame.sessionToken === (runtime.tokenStore.get() || '') && root.contains(sharedFrame.view.element)) {
    sharedFrame.view.route(next);
    return;
  }
  const accountId = kind === 'shop' ? String(context?.actor?.accountId || '') : String(viewerAccountId || '');
  const viewerStorageKey = `ustore:web:viewer:v1:${kind}:${location.hostname}:${accountId || 'guest'}`;
  let viewerKey = '';
  try {
    viewerKey = sessionStorage.getItem(viewerStorageKey) || '';
    if (!/^[0-9a-f-]{36}$/i.test(viewerKey)) {
      viewerKey = secureUuidV4();
      sessionStorage.setItem(viewerStorageKey, viewerKey);
    }
  } catch (_) { viewerKey = secureUuidV4(); }
  let guestViewerKey = '';
  if (kind === 'shop' && accountId) {
    try { guestViewerKey = sessionStorage.getItem(`ustore:web:viewer:v1:shop:${location.hostname}:guest`) || ''; } catch (_) {}
  }
  const view = createMiniAppFrameHost({
    kind, route: next, tenant, viewerKey, guestViewerKey, runtime,
    onNavigate(target) {
      if (target === `${location.pathname}${location.search}`) return;
      let nextRoute;
      try { nextRoute = matchWebRoute(target); } catch (_) { return; }
      if (!nextRoute.found) return;
      if (kind === 'shop' && nextRoute.route?.id === 'signin') {
        const method = new URLSearchParams(nextRoute.search || '').get('method');
        if (method === 'telegram' || method === 'password') void beginFrameSignIn(nextRoute, runtime);
        else go(target);
        return;
      }
      if (kind === 'shop') {
        // Every frame navigation must invalidate older async route renders,
        // including /profile?next=/orders. Updating history alone leaves the
        // previous Orders request free to send a stale ROUTE back to the frame.
        go(target);
        return;
      }
      const pathname = target.split('?')[0];
      if (kind === 'shop' && pathname.startsWith('/platform')) return;
      if (kind === 'platform' && !pathname.startsWith('/platform')) return;
      const base = previewBase();
      history.pushState({}, '', base ? `${base}${location.search}#${target}` : target);
      if (kind === 'shop') void applySharedShopMetadata(nextRoute, renderEpoch).catch(() => applyPrivateMetadata());
    },
    onAuthRequired(target) {
      if (kind === 'platform') go(`${platformLoginTarget()}?${new URLSearchParams({ next: target }).toString()}`);
      else go(`/profile?${new URLSearchParams({ next: target || '/' }).toString()}`);
    },
    onSignedOut() {
      if (kind === 'platform') {
        platformRuntime = null;
        if (sharedFrame) { try { sharedFrame.view.destroy(); } catch (_) {} sharedFrame = null; }
        go('/platform/login', true);
        return;
      }
      shopRuntime = null;
      context = null;
      if (sharedFrame) { try { sharedFrame.view.destroy(); } catch (_) {} sharedFrame = null; }
      go('/profile', true);
    },
  });
  // Route changes reuse the live frame. Registering its destroy with mount()
  // would tear down the message bridge at the start of every renderRoute().
  mount(view.element);
  sharedFrame = { kind, botId: String(tenant?.botId || ''), sessionToken: runtime.tokenStore.get() || '', view };
}
function stateView(kind, title, message, actionLabel = '', onAction) {
  return createStatePanel({ kind, title, message, actionLabel, onAction });
}
function shopNameHintFromHostname(hostname = globalThis.location?.hostname) {
  const host = normalizeHost(hostname);
  const base = configuredPlatformHostname();
  if (!host || !base || host === base || host === `www.${base}` || !host.endsWith(`.${base}`)) return 'UStorE';
  const slug = host.slice(0, -(base.length + 1)).split('.').at(-1) || '';
  return slug.split('-').filter(Boolean).map((part) => part ? part[0].toUpperCase() + part.slice(1) : '').join(' ') || 'Do‘kon';
}
function shopOpeningView({ name = '', logoUrl = null } = {}) {
  return globalThis.USTORE_SHOP_WELCOME.create({name:name || shopNameHintFromHostname(),logoUrl,locale:uiLocale});
}
function launchView({ mode = 'platform', name = '', logoUrl = null, message = '' } = {}) {
  const shop = mode === 'shop';
  if (shop) return shopOpeningView({ name: String(name || '').trim() || shopNameHintFromHostname(), logoUrl });
  const subtitle = message || 'Biznesingiz uchun platforma tayyorlanmoqda…';
  const section = document.createElement('section');
  section.className = 'uw-launch uw-launch--platform';
  section.setAttribute('role','status'); section.setAttribute('aria-live','polite'); section.setAttribute('aria-busy','true');
  const inner = document.createElement('div'); inner.className = 'uw-launch__inner';
  const brand = document.createElement('div'); brand.className = 'uw-launch__brand';
  if (logoUrl) {
    const img = document.createElement('img'); img.className = 'uw-launch__logo'; img.src = String(logoUrl); img.alt = '';
    img.addEventListener('error', () => { img.remove(); const fallback=document.createElement('span'); fallback.className='uw-launch__monogram'; fallback.textContent='U'; brand.prepend(fallback); }, { once:true });
    brand.append(img);
  } else {
    const mark = document.createElement('span'); mark.className = 'uw-launch__monogram'; mark.textContent = 'U'; brand.append(mark);
  }
  const brandText=document.createElement('div'); brandText.className='uw-launch__brand-copy';
  const eyebrow=document.createElement('span'); eyebrow.className='uw-launch__eyebrow'; eyebrow.textContent='USTORE';
  const heading=document.createElement('h1'); heading.textContent='UStorE';
  brandText.append(eyebrow);
  brandText.append(heading); brand.append(brandText);
  const loader=document.createElement('div'); loader.className='uw-launch__loader'; loader.setAttribute('aria-hidden','true'); loader.innerHTML='<span></span><span></span><span></span>';
  const text=document.createElement('p'); text.className='uw-launch__message'; text.textContent=subtitle;
  const foot=document.createElement('small'); foot.className='uw-launch__foot'; foot.textContent='Xavfsiz ulanish va kerakli modullar yuklanmoqda';
  inner.append(brand,loader,text,foot); section.append(inner); return section;
}
function currentTarget() { return `${location.pathname}${location.search}${location.hash}`; }
function go(target, replace = false) {
  if (!router) { location.assign(target); return; }
  replace ? router.replace(target) : router.navigate(target);
}
function navHandler(item) { if (item?.href) go(item.href); else if (item?.id === 'search') go('/search'); }
function shellFor(routeState, content, pageTitle = '') {
  if (routeState.route?.admin) {
    return createAdminShell({
      context, activeNav: routeState.route.navId, pageTitle: pageTitle || 'Boshqaruv', content, locale: uiLocale,
      onNavigate: navHandler, onOpenAccount: () => go('/profile'),
      onOpenShop: () => go('/'),
    });
  }
  return createCustomerShell({
    context, activeNav: routeState.route?.navId || 'home', content, locale: uiLocale,
    onNavigate: navHandler, onOpenCart: () => go('/cart'), onOpenAccount: () => go('/profile'),
    onOpenAdmin: actorIsAdmin(context.actor) ? () => go('/admin') : null,
    hideAccountAction: routeState.route?.id === 'signin',
    onLocaleChange: (next) => setUiLocale(next),
  });
}
function mountShell(routeState, content, title = '') { const shell = shellFor(routeState, content, title); localizeCustomerDom(shell.element, uiLocale); mount(shell); }
function reactive(controller, factory) {
  const host = document.createElement('div');
  let childDestroy = null;
  const render = () => {
    try { childDestroy?.(); } catch (_) {}
    const view = factory(controller.getState());
    childDestroy = typeof view?.destroy === 'function' ? view.destroy : null;
    const element = elementOf(view);
    localizeCustomerDom(element, uiLocale);
    host.replaceChildren(element);
  };
  render();
  const unsub = controller.subscribe?.(render);
  return { element: host, destroy(){ try{unsub?.();}catch(_){} try{childDestroy?.();}catch(_){} } };
}
function actorIsAdmin(actor) {
  return !!actor && (actor.shopRole === 'OWNER' || actor.shopRole === 'STAFF' || (actor.roleCodes || []).includes('MANAGER'));
}
function actorCan(actor, permission) {
  return actorIsAdmin(actor) && (actor.permissions || []).some((item) => item === '*' || item === permission);
}
async function storefrontFavorites() {
  if (!context?.actor) return new Set();
  const result = await shopRuntime.services.profile.listFavorites();
  return new Set(result.ok ? (result.data.items || []).map((item) => String(item.productId)) : []);
}
function storefrontCardOptions(cartController, notice) {
  const manage = actorCan(context.actor, 'products.manage');
  const announce = (result, success) => notice?.replaceChildren(stateView(result?.ok ? 'success' : 'error', result?.ok ? success : 'Amal bajarilmadi', result?.ok ? '' : (result?.error?.message || 'Qayta urinib ko‘ring.')));
  return {
    canManage: manage,
    onAddProduct: async (product) => {
      const result = await cartController.addLine({ productId: product.id, quantity: 1, name: product.name, unitPrice: product.price, imageUrl: product.img || product.thumb_img || null });
      announce(result, 'Mahsulot savatga qo‘shildi'); return result;
    },
    onFavorite: async (product, favorite) => {
      if (!context.actor) { go('/profile'); return { ok: false }; }
      const result = await shopRuntime.services.profile.setFavorite({ productId: product.id, favorite });
      if (!result.ok) announce(result, ''); return result;
    },
    onPin: manage ? async (product, value) => { const result = await shopRuntime.services.admin.invoke('toggle_featured', { productId: product.id, value }); announce(result, value ? 'Mahsulot pin qilindi' : 'Pin olib tashlandi'); return result; } : null,
    onVisibility: manage ? async (product, value) => { const result = await shopRuntime.services.admin.invoke('toggle_product_visibility', { productId: product.id, value }); announce(result, 'Mahsulot yashirildi'); return result; } : null,
    onEdit: manage ? (product) => go(`/admin/products/${encodeURIComponent(product.id)}/edit`) : null,
    onDuplicate: manage ? async (product) => { const result = await shopRuntime.services.admin.invoke('duplicate_product', { productId: product.id }); announce(result, 'Mahsulot nusxalandi'); return result; } : null,
    onTrash: manage ? async (product) => {
      if (globalThis.confirm?.(`${product.name} chiqindiga o‘tkazilsinmi?`) !== true) return { ok:false };
      const result = await shopRuntime.services.admin.invoke('bulk_trash_products', { productIds:[product.id] });
      announce(result, 'Mahsulot chiqindiga o‘tkazildi'); return result;
    } : null,
  };
}
function openStorefrontBanner(banner) {
  if (banner.targetType === 'PRODUCT' && banner.targetProductId) go(`/product/${encodeURIComponent(banner.targetProductId)}`);
  else if (banner.targetType === 'CATEGORY' && banner.targetCategoryId) go(`/catalog?category=${encodeURIComponent(banner.targetCategoryId)}`);
  else if (banner.targetType === 'BUNDLE' && banner.targetBundleId) go(`/bundle/${encodeURIComponent(banner.targetBundleId)}`);
  else if (banner.targetType === 'PROMOTION' && banner.targetPromotionId) go(`/promotion/${encodeURIComponent(banner.targetPromotionId)}`);
  else if (banner.targetType === 'URL' && banner.targetUrl) {
    try { const target = new URL(banner.targetUrl); if (target.protocol === 'https:') globalThis.open(target.href, '_blank', 'noopener,noreferrer'); } catch (_) {}
  }
}
function normalizeHost(value) {
  return String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/:\d+$/, '').replace(/\.$/, '');
}
function isLocalPlatformHost(locationRef = globalThis.location) {
  return ['localhost','127.0.0.1','[::1]'].includes(normalizeHost(locationRef?.hostname));
}
function previewBase(locationRef = globalThis.location, config = globalThis.APP_CONFIG || {}) {
  const base = String(config.USTORE_WEB_PREVIEW_PATH || '');
  return normalizeHost(locationRef?.hostname) === 'usmonovshaxrizod1-maker.github.io'
    && base === '/ustore/web/' && locationRef?.pathname === base ? base : '';
}
function configuredPlatformHostname(config = globalThis.APP_CONFIG || {}) {
  return normalizeHost(config.USTORE_BASE_HOSTNAME || '');
}
function isConfiguredPlatformOrigin(locationRef = globalThis.location, config = globalThis.APP_CONFIG || {}) {
  const current = normalizeHost(locationRef?.hostname);
  const configured = configuredPlatformHostname(config);
  return !!configured && (current === configured || current === `www.${configured}`);
}
function isExplicitPlatformRoute(routeState) { return routeState?.route?.platform === true; }
function platformHomeTarget() { return isConfiguredPlatformOrigin() ? '/' : '/platform'; }
function platformLoginTarget() { return '/platform/login'; }
function allowExplicitPlatformRoute() { return isConfiguredPlatformOrigin() || isLocalPlatformHost() || !!previewBase(); }
function platformCanonical(pathname = '/') {
  const host = configuredPlatformHostname();
  return host ? buildCanonicalUrl(`https://${host}`, pathname) : null;
}
function shopCanonical(pathname = '/') {
  const base = context?.shop?.canonicalWebUrl || globalThis.location?.origin || '';
  return buildCanonicalUrl(base, pathname);
}
function applyPrivateMetadata(title = 'UStorE', description = 'Bu sahifa qidiruv tizimlari uchun indekslanmaydi.', canonicalUrl = null) {
  return metadataManager.privatePage({ title, description, canonicalUrl, locale: uiLocale });
}
function applyPlatformHomeMetadata(routeState) {
  const canonical = platformCanonical('/');
  const canonicalRoot = isConfiguredPlatformOrigin() && routeState?.pathname === '/';
  const spec = {
    title: 'UStorE — Telegram uchun e-do‘kon platformasi',
    description: 'Mahsulot, buyurtma, ombor, marketing, to‘lov va yetkazib berishni bitta UStorE tizimida boshqaring.',
    canonicalUrl: canonical,
    locale: uiLocale,
    indexable: Boolean(canonicalRoot && canonical),
  };
  return canonicalRoot ? metadataManager.publicPage(spec) : metadataManager.privatePage(spec);
}
function applyShopPublicMetadata({ title, description, pathname = '/', imageUrl = null, type = 'website' } = {}) {
  const canonicalUrl = shopCanonical(pathname);
  return metadataManager.publicPage({ title, description, canonicalUrl, imageUrl, type, locale: uiLocale, siteName: context?.shop?.name || 'UStorE' });
}
async function applySharedShopMetadata(routeState, epoch) {
  const shopName = context.shop.name || 'Do‘kon';
  const id = routeState.route.id;
  const common = { imageUrl: context.shop.logoUrl || null };
  if (id === 'home') applyShopPublicMetadata({ ...common, title: `${shopName} — UStorE`, description: `${shopName} onlayn do‘koni. Mahsulotlar va katalogni ko‘ring.`, pathname:'/' });
  else if (id === 'catalog' || id === 'search') applyShopPublicMetadata({ ...common, title: `Katalog — ${shopName}`, description: `${shopName} do‘konidagi mahsulotlar va toifalar.`, pathname:'/catalog' });
  else if (id === 'promotions') applyShopPublicMetadata({ ...common, title:`Aksiyalar — ${shopName}`, description:`${shopName} do‘konidagi faol aksiyalar.`, pathname:'/promotions' });
  else if (id === 'product') {
    const result = await shopRuntime.services.catalog.getProduct({ productId:routeState.params.productId });
    if (epoch !== renderEpoch) return false;
    if (!result.ok || result.data?.is_visible === false) {
      applyPrivateMetadata('Mahsulot topilmadi — UStorE', 'Bu mahsulot ommaga ochiq emas.');
      mount(stateView('error', 'Mahsulot topilmadi', 'Mahsulot mavjud emas yoki yashirilgan.', 'Katalog', () => go('/catalog')));
      return false;
    }
    const product = result.data;
    applyShopPublicMetadata({ title:`${product.name} — ${shopName}`, description:product.description || `${product.name} — ${shopName} onlayn do‘koni.`, pathname:routeState.pathname, imageUrl:product.img || product.thumb_img || null, type:'product' });
  } else if (id === 'bundle' || id === 'promotion') {
    const result = id === 'bundle'
      ? await shopRuntime.services.catalog.getBundle({ bundleId:routeState.params.bundleId })
      : await shopRuntime.services.catalog.getPromotion({ promotionId:routeState.params.promotionId });
    if (epoch !== renderEpoch) return false;
    if (!result.ok) {
      applyPrivateMetadata('Aksiya topilmadi — UStorE', 'Mavjud bo‘lmagan aksiya sahifasi indekslanmaydi.');
      mount(stateView('error', 'Aksiya topilmadi', 'Aksiya mavjud emas yoki muddati tugagan.', 'Bosh sahifa', () => go('/')));
      return false;
    }
    const item = result.data;
    applyShopPublicMetadata({ title:`${item.name} — ${shopName}`, description:item.description || `${item.name} aksiyasi.`, pathname:routeState.pathname, imageUrl:item.coverImageUrl || item.cover_image_url || context.shop.logoUrl || null, type:id === 'bundle' ? 'product' : 'website' });
  } else applyPrivateMetadata(`${shopName} — UStorE`, 'Shaxsiy ma’lumotlar va boshqaruv sahifasi indekslanmaydi.');
  return true;
}
function loadProductionRuntimeModule() {
  if (!productionRuntimeModulePromise) productionRuntimeModulePromise = import('./runtime/production.js?v=20261009t7');
  return productionRuntimeModulePromise;
}
function loadAuthFeatureModule() {
  if (!authFeatureModulePromise) authFeatureModulePromise = import('./features/auth/origin-handoff.js?v=20261008admin1');
  return authFeatureModulePromise;
}
async function beginFrameSignIn(routeState, runtime) {
  if (frameSignInPending) return;
  frameSignInPending = true;
  const epoch = ++renderEpoch;
  const waiting = document.createElement('section');
  waiting.className = 'uw-auth-transition uw-auth-transition--inline uw-auth-transition--overlay';
  waiting.setAttribute('role', 'status');
  waiting.setAttribute('aria-busy', 'true');
  waiting.textContent = 'Kirish sahifasiga o‘tilmoqda…';
  // Keep the live shop underneath so cancelling Telegram / browser Back can
  // restore it instantly instead of rebuilding the iframe and session.
  root.append(waiting);
  remember(() => waiting.remove());
  try {
    const params = new URLSearchParams(routeState.search || '');
    const returnTo = shopAuthReturnTo(routeState);
    const { beginCustomDomainLogin } = await loadAuthFeatureModule();
    const result = await beginCustomDomainLogin({
      authPort: runtime.services.auth, returnTo, method: params.get('method'),
      botUsername: runtime.tenant?.botUsername || '', locale: uiLocale,
      onRedirect: (url) => { if (epoch === renderEpoch) location.assign(url); },
    });
    if (epoch === renderEpoch && !result?.ok) mount(stateView('error', 'Kirish boshlanmadi', result?.error?.message || 'Qayta urinib ko‘ring.', 'Qayta urinish', () => beginFrameSignIn(routeState, runtime)));
  } catch (_) {
    if (epoch === renderEpoch) mount(stateView('error', 'Kirish boshlanmadi', 'Internetni tekshirib qayta urinib ko‘ring.', 'Qayta urinish', () => beginFrameSignIn(routeState, runtime)));
  } finally {
    frameSignInPending = false;
  }
}
function loadLoginFeatureModule() {
  // A cached older login module must not be paired with a newer app.js after
  // a manual GitHub Pages upload. Refresh this auth module as a release unit.
  if (!loginFeatureModulePromise) {
    loginFeatureModulePromise = import('./features/auth/login.js?v=20261009t7')
      .catch(() => import(`./features/auth/login.js?v=20261009t7&retry=${Date.now()}`))
      .catch((error) => { loginFeatureModulePromise = null; throw error; });
  }
  return loginFeatureModulePromise;
}
function armSlowRouteState(epoch, { delay = 320, title = 'Sahifa yuklanmoqda', message = 'Tarmoq sekin bo‘lsa, ma’lumotlar kelguncha shu holat ko‘rinadi.', auth = false } = {}) {
  const timer = globalThis.setTimeout?.(() => {
    if (epoch !== renderEpoch) return;
    if (auth) {
      const status = document.createElement('section');
      status.className = 'uw-auth-transition uw-auth-transition--inline';
      status.setAttribute('role', 'status');
      status.textContent = 'Kirish sahifasi ochilmoqda…';
      mount(status);
    } else mount(launchView({ mode:'platform', message }));
  }, delay);
  if (timer != null) remember(() => globalThis.clearTimeout?.(timer));
}
async function ensurePlatformRuntime() {
  if (!platformRuntime) {
    const runtimeModule = await loadProductionRuntimeModule();
    platformRuntime = runtimeModule.createProductionPlatformRuntime();
  }
  return platformRuntime;
}
async function refreshContext(epoch) {
  const result = await shopRuntime.services.context.resolve();
  if (!result.ok) return result;
  if (epoch === renderEpoch) context = result.data;
  return result;
}
async function ensureShopRuntime() {
  if (shopRuntime) return { ok:true, data:shopRuntime };
  const runtimeModule = await loadProductionRuntimeModule();
  const result = await runtimeModule.createProductionShopRuntime();
  if (!result.ok) return result;
  shopRuntime = result.data;
  return result;
}
async function renderShopSignIn(routeState, epoch) {
  const { createCustomDomainSignInController, createCustomDomainSignInView } = await loadAuthFeatureModule();
  if (epoch !== renderEpoch) return;
  const returnTo = shopAuthReturnTo(routeState);
  const controller = createCustomDomainSignInController({
    authPort: shopRuntime.services.auth, returnTo, botUsername: shopRuntime.tenant?.botUsername || '', locale:uiLocale,
    onRedirect: (url) => location.assign(url),
  });
  const requestedMethod = new URLSearchParams(routeState.search || '').get('method');
  if (requestedMethod === 'telegram' || requestedMethod === 'password') {
    const started = await controller.begin(requestedMethod);
    if (epoch !== renderEpoch || started?.ok) return;
  }
  const view = reactive(controller, (state) => createCustomDomainSignInView({ controller, state, botUsername: shopRuntime.tenant?.botUsername, shopName: shopRuntime.tenant?.shopName, logoUrl: shopRuntime.tenant?.logoUrl, locale: uiLocale }));
  mountShell(routeState, view.element, 'Kirish');
  remember(view.destroy);
}

async function renderCentralHandoff(routeState, epoch) {
  const [runtimeModule, authFeature, loginFeature] = await Promise.all([loadProductionRuntimeModule(), loadAuthFeatureModule(), loadLoginFeatureModule()]);
  if (epoch !== renderEpoch) return;
  const authRuntime = runtimeModule.createProductionAuthRuntime();
  const handoffParams = new URLSearchParams(routeState.search);
  const state = handoffParams.get('state') || '';
  const passwordMethod = handoffParams.get('method') === 'password';
  const hadCentralSessionToken = Boolean(authRuntime.tokenStore?.get?.());
  if (hadCentralSessionToken && centralSignInJustCompleted) {
    centralSignInJustCompleted = false;
    // authorizeOriginHandoff already validates the session, state and target
    // on the server. Avoid a second getSession/getOriginHandoff round trip on
    // the immediate return from Telegram. Older sessions still go through
    // getSession below so their normal token renewal is preserved.
    const controller = authFeature.createCentralOriginHandoffController({ authPort: authRuntime.auth, state, onRedirect:(url)=>location.assign(url) });
    const authorized = await controller.authorize();
    if (epoch !== renderEpoch || authorized?.ok) return;
    if (!['AUTH_REQUIRED', 'SESSION_EXPIRED'].includes(authorized?.error?.code)) {
      const view = reactive(controller, snapshot => authFeature.createCentralOriginHandoffView({ controller, state:snapshot }));
      mount(view); remember(view.destroy);
      return;
    }
  }
  if (passwordMethod && !hadCentralSessionToken) {
    // The password form is usable while the handoff metadata is fetched.
    // Its server-side handoff authorization is still checked after sign-in.
    const controller = loginFeature.createLoginController({
      authPort: authRuntime.auth, returnTo: routeState.target, initialTab: 'password',
      onSignedIn: () => renderRoute(routeState), onRedirect: (url) => location.assign(url),
    });
    const view = reactive(controller, (snapshot) => loginFeature.createLoginView({ controller, state:snapshot, locale:handoffParams.get('lang') === 'ru' ? 'ru' : 'uz', singleMethod: true }));
    mount(view); remember(view.destroy);
  }
  const [session, handoffInfo] = await Promise.all([authRuntime.auth.getSession(), authRuntime.auth.getOriginHandoff({ state })]);
  if (epoch !== renderEpoch) return;
  if (!session.ok) {
    if (passwordMethod && !hadCentralSessionToken) return;
    const controller = loginFeature.createLoginController({
      authPort: authRuntime.auth,
      returnTo: routeState.target,
      initialTab: handoffParams.get('method') === 'password' ? 'password' : 'telegram',
      onSignedIn: () => renderRoute(routeState),
      onRedirect: (url) => location.assign(url),
    });
    if (handoffParams.get('method') === 'telegram' && handoffInfo.ok &&
        String(handoffInfo.data?.status || '').toUpperCase() === 'PENDING') {
      const started = await controller.signInTelegram();
      if (epoch !== renderEpoch || started?.ok) return;
    }
    // The automatic Telegram path only needs a form if it actually fails.
    const view = reactive(controller, (snapshot) => loginFeature.createLoginView({ controller, state:snapshot, shopBotUsername: handoffInfo.ok ? handoffInfo.data?.botUsername || '' : '', locale:handoffParams.get('lang') === 'ru' ? 'ru' : 'uz', singleMethod: passwordMethod }));
    mount(view); remember(view.destroy);
    return;
  }
  const controller = authFeature.createCentralOriginHandoffController({ authPort: authRuntime.auth, state, onRedirect:(url)=>location.assign(url) });
  if (handoffInfo.ok && String(handoffInfo.data?.status || '').toUpperCase() === 'PENDING') {
    const authorized = await controller.authorize();
    if (epoch !== renderEpoch || authorized?.ok) return;
  }
  // A valid central session authorizes automatically. Only show the manual
  // handoff page when something needs the customer's attention.
  const view = reactive(controller, (snapshot) => authFeature.createCentralOriginHandoffView({ controller, state:snapshot }));
  mount(view); remember(view.destroy);
  if (!handoffInfo.ok || String(handoffInfo.data?.status || '').toUpperCase() !== 'PENDING') await controller.load();
}
async function renderOriginCallback(routeState, epoch) {
  const [runtimeModule, authFeature] = await Promise.all([loadProductionRuntimeModule(), loadAuthFeatureModule()]);
  if (epoch !== renderEpoch) return;
  const authRuntime = runtimeModule.createProductionAuthRuntime();
  const result = await authFeature.completeCustomDomainLogin({ authPort: authRuntime.auth, url: location.href });
  if (epoch !== renderEpoch) return;
  if (result?.ok) { go(result.data?.returnTo || '/', true); return; }
  mount(authFeature.createOriginCallbackView({ result, onNavigate:(target)=>go(target, true) }));
}

async function renderPlatformHome(routeState, epoch) {
  applyPlatformHomeMetadata(routeState);
  const runtime = await ensurePlatformRuntime();
  if (epoch !== renderEpoch) return;
  const session = await runtime.auth.getSession();
  if (epoch !== renderEpoch) return;
  if (session.ok) {
    mountSharedFrame({ kind:'platform', routeState, runtime, viewerAccountId:session.data?.accountId });
    return;
  }
  const mod = await import('./features/platform-home/index.js?v=20261009landing2');
  if (epoch !== renderEpoch) return;
  const controller = mod.createPlatformHomeController({ platformPort: runtime.platform });
  const view = reactive(controller, (snapshot) => mod.createPlatformHomeView({
    controller,
    state: snapshot,
    onLogin: (meta = {}) => {
      const next = meta?.intent === 'new-shop' ? '/platform/subscriptions?new=1' : '/platform/app';
      go(`${platformLoginTarget()}?${new URLSearchParams({ next }).toString()}`);
    },
    onChoosePlan: (tariff, billingPeriod = 'monthly') => {
      const next = `/platform/subscriptions?${new URLSearchParams({ new: '1', plan: String(tariff?.id || ''), period: billingPeriod === 'annual' ? 'annual' : 'monthly' })}`;
      go(`${platformLoginTarget()}?${new URLSearchParams({ next }).toString()}`);
    },
  }));
  mount(view);
  remember(view.destroy);
  const result = await controller.load();
  if (epoch !== renderEpoch) return;
  return result;
}

async function renderPlatformLogin(routeState, epoch) {
  applyPrivateMetadata('UStorE’ga kirish', 'UStorE akkauntiga kirish sahifasi indekslanmaydi.', platformCanonical('/'));
  const [runtime, loginFeature] = await Promise.all([ensurePlatformRuntime(), loadLoginFeatureModule()]);
  if (epoch !== renderEpoch) return;
  const params = new URLSearchParams(routeState.search || '');
  const home = platformHomeTarget();
  let returnTo = '/platform/app';
  const requestedNext = params.get('next') || '';
  if (requestedNext) {
    try {
      const parsed = splitTarget(requestedNext);
      if (parsed.pathname.startsWith('/platform/') && parsed.pathname !== '/platform/login') returnTo = parsed.target;
    } catch (_) {}
  } else {
    const intent = params.get('intent') || '';
    const plan = params.get('plan') || '';
    if (intent === 'new-shop' || plan) {
      const q = new URLSearchParams({ new: '1' });
      if (plan) q.set('plan', plan);
      returnTo = `/platform/subscriptions?${q}`;
    }
  }
  // Validate existing session before showing a guest prompt. No new auth backend.
  const existing = await runtime.auth.getSession();
  if (epoch !== renderEpoch) return;
  if (existing.ok) { go(returnTo, true); return; }
  const controller = loginFeature.createLoginController({
    authPort: runtime.auth,
    returnTo,
    initialTab: 'chooser',
    onSignedIn: () => go(returnTo, true),
    onRedirect: (url) => location.assign(url),
  });
  if (epoch !== renderEpoch) return;
  const shell = document.createElement('div');
  shell.className = 'uw-platform-auth-shell uw-root';
  const top = document.createElement('div'); top.className = 'uw-platform-auth-shell__top';
  const back = createButton({ label: '← Bosh sahifa', variant: 'ghost', onClick: () => go(home) });
  top.append(back);
  const view = reactive(controller, (snapshot) => loginFeature.createLoginView({ controller, state: snapshot, locale:uiLocale, platformStyle: true }));
  shell.append(top, view.element);
  mount(shell); remember(view.destroy);
  // Official Telegram OAuth redirects back with code/state; no polling or
  // second approval in this tab is needed.
}


async function renderPlatformAdmin(routeState, epoch) {
  const runtime = await ensurePlatformRuntime();
  if (epoch !== renderEpoch) return;
  const session = await runtime.auth.getSession();
  if (epoch !== renderEpoch) return;
  if (!session.ok) {
    const next = routeState.target || '/platform/admin';
    go(`${platformLoginTarget()}?${new URLSearchParams({ next }).toString()}`, true);
    return;
  }
  const boot = await runtime.platform.invoke('platform_boot', {});
  if (epoch !== renderEpoch) return;
  if (!boot.ok) {
    mount(stateView('error', 'Boshqaruv ochilmadi', boot.error?.message || 'Ma’lumotni yuklab bo‘lmadi.', 'Qayta urinish', () => renderRoute(routeState)));
    return;
  }
  if (boot.data?.isSuperAdmin !== true) {
    mount(stateView('permission', 'Ruxsat yo‘q', 'Bu bo‘lim uchun platforma boshqaruvchisi huquqi kerak.'));
    return;
  }
  mountSharedFrame({ kind: 'platform', routeState, runtime, viewerAccountId:session.data?.accountId });
}

async function renderPlatformPortal(routeState, epoch) {
  const runtime = await ensurePlatformRuntime();
  if (epoch !== renderEpoch) return;
  const session = await runtime.auth.getSession();
  if (epoch !== renderEpoch) return;
  if (!session.ok) {
    const next = routeState.target || '/platform/app';
    go(`${platformLoginTarget()}?${new URLSearchParams({ next }).toString()}`, true);
    return;
  }
  mountSharedFrame({ kind: 'platform', routeState, runtime, viewerAccountId:session.data?.accountId });
}
async function renderHome(routeState, epoch) {
  const [mod, bundleMod, cartMod] = await Promise.all([import('./features/home/index.js'), import('./features/bundle/index.js'), import('./features/cart/index.js')]);
  const [result, favoriteIds] = await Promise.all([
    mod.loadHomeModel({ catalogPort: shopRuntime.services.catalog, bootMarketing: context.marketing }),
    storefrontFavorites(),
  ]);
  if (epoch !== renderEpoch) return;
  if (result.ok) applyShopPublicMetadata({
    title: `${context.shop.name} — UStorE`,
    description: `${context.shop.name} onlayn do‘koni. Mahsulotlar va katalogni ko‘ring.`,
    pathname: '/',
    imageUrl: context.shop.logoUrl || null,
  });
  if (!result.ok) {
    const view = mod.createHomeView({ model:null, state: result.error?.code === 'SHOP_UNAVAILABLE' ? 'unavailable' : 'error', onRetry:()=>renderRoute(routeState), locale:uiLocale });
    mountShell(routeState, view.element, context.shop.name); return;
  }
  const cartController = cartMod.createCartController({
    cartPort:shopRuntime.services.cart, catalogPort:shopRuntime.services.catalog, shopId:context.shop.id,
    authenticated:Boolean(context.actor), guestStore:cartMod.createGuestCartStore(),
  });
  const wrap = document.createElement('div'); const notice = document.createElement('div');
  let addingBundleId = null; let addResult = null;
  const rerender = () => {
    const view = mod.createHomeView({
      model:result.data, addingBundleId, favoriteIds, locale:uiLocale,
      ...storefrontCardOptions(cartController, notice),
      onOpenProduct:(p)=>go(`/product/${encodeURIComponent(p.id)}`),
      onOpenCategory:(c)=>go(`/catalog?category=${encodeURIComponent(c.id)}`),
      onOpenBanner:openStorefrontBanner,
      onAdmin:actorIsAdmin(context.actor) ? ()=>go('/admin') : null,
      onOpenBundle:(bundle)=>go(`/bundle/${encodeURIComponent(bundle.id)}`),
      onAddBundle:async(bundle)=>{
        if (addingBundleId) return;
        addingBundleId=String(bundle.id); addResult=null; rerender();
        const line=bundleMod.bundleCartLine(bundle);
        addResult=line ? await cartController.addLine(line) : {ok:false,error:{message:'Aksiya ma’lumoti to‘liq emas.'}};
        addingBundleId=null; rerender();
      },
    });
    if (addResult?.ok) notice.replaceChildren(stateView('success','Aksiya savatga qo‘shildi',context.actor ? 'To‘plam savatingizga bitta aksiya sifatida saqlandi.' : 'To‘plam saqlandi. Savatni ochganda tizimga kirib davom etasiz.','Savatga o‘tish',()=>go('/cart')));
    else if (addResult?.error) notice.replaceChildren(stateView('error','Aksiya qo‘shilmadi',addResult.error.message || 'Qayta urinib ko‘ring.'));
    else notice.replaceChildren();
    wrap.replaceChildren(view.element, notice);
  };
  rerender(); mountShell(routeState, wrap, context.shop.name);
}
async function renderCatalog(routeState, epoch) {
  const [mod, cartMod] = await Promise.all([import('./features/catalog/index.js'), import('./features/cart/index.js')]);
  const [cats, products, favoriteIds] = await Promise.all([
    shopRuntime.services.catalog.listCategories({ all:true }),
    shopRuntime.services.catalog.listProducts({}),
    storefrontFavorites(),
  ]);
  if (epoch !== renderEpoch) return;
  if (!cats.ok || !products.ok) { mountShell(routeState, stateView('error','Katalog yuklanmadi',(cats.error||products.error)?.message||'Server xatosi.','Qayta urinish',()=>renderRoute(routeState)), 'Katalog'); return; }
  const query = mod.parseCatalogQuery(routeState.search || '');
  if (routeState.route.id === 'catalog') {
    applyShopPublicMetadata({ title: `${context.shop.name} katalogi — UStorE`, description: `${context.shop.name} mahsulotlari va kategoriyalari.`, pathname: '/catalog', imageUrl: context.shop.logoUrl || null });
  } else {
    applyPrivateMetadata(`Qidiruv — ${context.shop.name}`, 'Ichki qidiruv natijalari indekslanmaydi.', shopCanonical('/catalog'));
  }
  const cartController = cartMod.createCartController({ cartPort:shopRuntime.services.cart, catalogPort:shopRuntime.services.catalog, shopId:context.shop.id, authenticated:Boolean(context.actor), guestStore:cartMod.createGuestCartStore() });
  const wrap = document.createElement('div'); const notice = document.createElement('div');
  const view = mod.createCatalogView({
    products:products.data.items, categories:cats.data.items, query, locale:uiLocale,
    favoriteIds, ...storefrontCardOptions(cartController, notice),
    onOpenProduct:(p)=>go(`/product/${encodeURIComponent(p.id)}`),
    onQueryChange:(next)=>go(`${routeState.route.id === 'search' ? '/search' : '/catalog'}${mod.serializeCatalogQuery(next)}`, true),
  });
  wrap.append(view.element, notice); mountShell(routeState, wrap, routeState.route.id === 'search' ? 'Qidiruv' : 'Katalog');
}
async function renderProduct(routeState, epoch) {
  const [mod, cartMod] = await Promise.all([import('./features/product/index.js'), import('./features/cart/index.js')]);
  const cartController = cartMod.createCartController({
    cartPort:shopRuntime.services.cart, catalogPort:shopRuntime.services.catalog, shopId:context.shop.id,
    authenticated:Boolean(context.actor), guestStore:cartMod.createGuestCartStore(),
  });
  const controller = mod.createProductDetailController({
    catalogPort:shopRuntime.services.catalog, productId:routeState.params.productId,
    onAddToCart:(line)=>cartController.addLine(line),
  });
  const result = await controller.load();
  if (epoch !== renderEpoch) return;
  if (!result.ok) { applyPrivateMetadata('Mahsulot topilmadi — UStorE', 'Mavjud bo‘lmagan mahsulot sahifasi indekslanmaydi.'); mountShell(routeState,stateView('error','Mahsulot topilmadi',result.error?.message||'Mahsulotni yuklab bo‘lmadi.','Katalogga qaytish',()=>go('/catalog')),'Mahsulot'); return; }
  const product = controller.getProduct();
  const productPath = `/product/${encodeURIComponent(product.id)}`;
  const productDescription = product.description || product.description_uz || `${product.name} — ${context.shop.name} onlayn do‘koni.`;
  const productMeta = applyShopPublicMetadata({ title: `${product.name} — ${context.shop.name}`, description: productDescription, pathname: productPath, imageUrl: product.img || null, type: 'product' });
  const wrap = document.createElement('div');
  const notice = document.createElement('div');
  let adding = false;
  let addResult = null;
  const rerender = () => {
    const view = mod.createProductDetailView({
      product, selection:controller.getSelection(), locale:uiLocale,
      onSelectColor:(v)=>{controller.selectColor(v);rerender();}, onSelectSize:(v)=>{controller.selectSize(v);rerender();},
      adding,
      onAddToCart:async()=>{
        if (adding) return;
        adding=true; addResult=null; rerender();
        const result=await controller.addToCart();
        adding=false; addResult=result; rerender();
      },
      onShare:()=>sharePage({ title: productMeta.title, text: productMeta.description, url: productMeta.canonicalUrl }),
      onEdit:actorCan(context.actor, 'products.manage') ? ()=>go(`/admin/products/${encodeURIComponent(product.id)}/edit`) : null,
    });
    if (addResult?.ok) notice.replaceChildren(stateView('success','Savatga qo‘shildi',context.actor ? 'Tanlangan mahsulot savatingizga saqlandi.' : 'Tanlov saqlandi. Savatni ochganda tizimga kirib davom etasiz.','Savatga o‘tish',()=>go('/cart')));
    else if (addResult?.error) notice.replaceChildren(stateView('error','Savatga qo‘shilmadi',addResult.error.message || 'Qayta urinib ko‘ring.'));
    else notice.replaceChildren();
    wrap.replaceChildren(view.element, notice);
  };
  rerender(); mountShell(routeState, wrap, product?.name || 'Mahsulot');
}
async function renderBundle(routeState, epoch) {
  const [mod, cartMod] = await Promise.all([import('./features/bundle/index.js'), import('./features/cart/index.js')]);
  const cartController = cartMod.createCartController({
    cartPort:shopRuntime.services.cart, catalogPort:shopRuntime.services.catalog, shopId:context.shop.id,
    authenticated:Boolean(context.actor), guestStore:cartMod.createGuestCartStore(),
  });
  const controller = mod.createBundleDetailController({
    catalogPort:shopRuntime.services.catalog, bundleId:routeState.params.bundleId,
    onAddToCart:(line)=>cartController.addLine(line),
  });
  const result = await controller.load();
  if (epoch !== renderEpoch) return;
  if (!result.ok) {
    applyPrivateMetadata('Aksiya topilmadi — UStorE', 'Mavjud bo‘lmagan aksiya sahifasi indekslanmaydi.');
    mountShell(routeState,stateView('error','Aksiya topilmadi',result.error?.message || 'Aksiyani yuklab bo‘lmadi.','Bosh sahifaga qaytish',()=>go('/')),'Aksiya'); return;
  }
  const bundle = controller.getBundle();
  const bundlePath = `/bundle/${encodeURIComponent(bundle.id)}`;
  applyShopPublicMetadata({ title:`${bundle.name} — ${context.shop.name}`, description:bundle.description || `${bundle.name} aksiya to‘plami.`, pathname:bundlePath, imageUrl:bundle.coverImageUrl || bundle.resolvedItems?.find((item)=>item.img)?.img || null, type:'product' });
  const wrap = document.createElement('div'); const notice = document.createElement('div');
  let adding=false; let addResult=null;
  const rerender=()=>{
    const view=mod.createBundleDetailView({ bundle, adding, onAddToCart:async()=>{
      if(adding)return; adding=true;addResult=null;rerender();
      addResult=await controller.addToCart(); adding=false;rerender();
    }});
    if(addResult?.ok)notice.replaceChildren(stateView('success','Aksiya savatga qo‘shildi','To‘plam savatda bitta aksiya sifatida saqlandi.','Savatga o‘tish',()=>go('/cart')));
    else if(addResult?.error)notice.replaceChildren(stateView('error','Aksiya qo‘shilmadi',addResult.error.message||'Qayta urinib ko‘ring.'));
    else notice.replaceChildren();
    wrap.replaceChildren(view.element,notice);
  };
  rerender(); mountShell(routeState,wrap,bundle.name || 'Aksiya');
}
async function renderPromotion(routeState, epoch) {
  const [mod, cartMod] = await Promise.all([import('./features/promotion/promotion.js'), import('./features/cart/index.js')]);
  const [promotionResult, productsResult, favoriteIds] = await Promise.all([
    shopRuntime.services.catalog.getPromotion({ promotionId: routeState.params.promotionId }),
    shopRuntime.services.catalog.listProducts({}),
    storefrontFavorites(),
  ]);
  if (epoch !== renderEpoch) return;
  if (!promotionResult.ok) {
    applyPrivateMetadata('Aksiya topilmadi — UStorE', 'Mavjud bo‘lmagan aksiya sahifasi indekslanmaydi.');
    mountShell(routeState, stateView('error', 'Aksiya topilmadi', promotionResult.error?.code === 'NOT_FOUND' ? 'Aksiya mavjud emas yoki muddati tugagan.' : promotionResult.error?.message || 'Qayta urinib ko‘ring.', 'Bosh sahifaga qaytish', () => go('/')), 'Aksiya');
    return;
  }
  if (!productsResult.ok) {
    mountShell(routeState, stateView('error', 'Mahsulotlar yuklanmadi', productsResult.error?.message || 'Qayta urinib ko‘ring.', 'Qayta urinish', () => renderRoute(routeState)), 'Aksiya');
    return;
  }
  const promotion = promotionResult.data;
  applyShopPublicMetadata({ title: `${promotion.name} — ${context.shop.name}`, description: `${promotion.name} promo taklifi. Shartlar va mahsulotlarni ko‘ring.`, pathname: `/promotion/${encodeURIComponent(promotion.id)}`, imageUrl: context.shop.logoUrl || null });
  const cartController = cartMod.createCartController({ cartPort:shopRuntime.services.cart, catalogPort:shopRuntime.services.catalog, shopId:context.shop.id, authenticated:Boolean(context.actor), guestStore:cartMod.createGuestCartStore() });
  const wrap = document.createElement('div'); const notice = document.createElement('div');
  const view = mod.createPromotionView({
    promotion, products: productsResult.data.items, favoriteIds,
    ...storefrontCardOptions(cartController, notice),
    onCopy: async (code) => {
      try { await globalThis.navigator.clipboard.writeText(code); notice.replaceChildren(stateView('success', 'Promo-kod nusxalandi', 'Uni savatda qo‘llashingiz mumkin.')); }
      catch (_) { notice.replaceChildren(stateView('error', 'Nusxalab bo‘lmadi', 'Promo-kodni belgilab qo‘lda nusxalang.')); }
    },
    onOpenCatalog: () => go('/catalog'),
    onOpenProduct: (product) => go(`/product/${encodeURIComponent(product.id)}`),
  });
  wrap.append(view.element, notice); mountShell(routeState, wrap, promotion.name || 'Aksiya');
}
async function renderPromotions(routeState, epoch) {
  const mod = await import('./features/promotion/promotion.js');
  const [bundles, promotions] = await Promise.all([
    shopRuntime.services.catalog.listBundles({}),
    shopRuntime.services.catalog.listPromotions({}),
  ]);
  if (epoch !== renderEpoch) return;
  if (!bundles.ok || !promotions.ok) {
    mountShell(routeState, stateView('error', 'Aksiyalar yuklanmadi', (bundles.error || promotions.error)?.message || 'Qayta urinib ko‘ring.', 'Qayta urinish', () => renderRoute(routeState)), 'Aksiyalar');
    return;
  }
  applyShopPublicMetadata({ title: `Aksiyalar — ${context.shop.name}`, description: `${context.shop.name} do‘konidagi faol aksiyalar va promo-kodlar.`, pathname:'/promotions', imageUrl:context.shop.logoUrl || null });
  const view = mod.createPromotionsView({
    bundles: bundles.data.items, promotions: promotions.data.items,
    onOpenBundle: (bundle) => go(`/bundle/${encodeURIComponent(bundle.id)}`),
    onOpenPromotion: (promotion) => go(`/promotion/${encodeURIComponent(promotion.id)}`),
  });
  mountShell(routeState, view.element, 'Aksiyalar');
}
async function renderCart(routeState, epoch) {
  const mod = await import('./features/cart/index.js');
  if (epoch !== renderEpoch) return;
  const controller = mod.createCartController({ cartPort:shopRuntime.services.cart, catalogPort:shopRuntime.services.catalog, shopId:context.shop.id, authenticated:true, guestStore:mod.createGuestCartStore() });
  const view = reactive(controller, (state) => {
    const box = document.createElement('div'); box.append(mod.createCartView({controller,state}).element);
    if (state.cart?.lines?.length) box.append(createButton({ label:'Checkoutga o‘tish', onClick:()=>go('/checkout') }));
    return box;
  });
  mountShell(routeState, view.element, 'Savatcha'); remember(view.destroy); await controller.load();
  if (epoch !== renderEpoch) return;
}
async function renderCheckout(routeState, epoch) {
  const cartMod = await import('./features/cart/index.js');
  const checkMod = await import('./features/checkout/index.js');
  const cartController = cartMod.createCartController({ cartPort:shopRuntime.services.cart, catalogPort:shopRuntime.services.catalog, shopId:context.shop.id, authenticated:true, guestStore:cartMod.createGuestCartStore() });
  const cartResult = await cartController.load();
  if (epoch !== renderEpoch) return;
  const cart = cartController.getState().cart;
  if (!cartResult?.ok) { mountShell(routeState,stateView('error','Savatchani yuklab bo‘lmadi',cartResult?.error?.message || 'Qayta urinib ko‘ring.','Qayta urinish',()=>renderRoute(routeState)),'Checkout'); return; }
  if (!cart?.lines?.length) { mountShell(routeState,stateView('empty','Savatcha bo‘sh','Checkout uchun avval mahsulot qo‘shing.','Katalogga o‘tish',()=>go('/catalog')),'Checkout'); return; }
  const controller = checkMod.createCheckoutController({ cartPort:shopRuntime.services.cart, cart });
  const host = document.createElement('div'); const submitHost = document.createElement('div');
  const view = reactive(controller, (state) => { const box=document.createElement('div'); box.append(checkMod.createCheckoutView({controller,state}).element); box.append(createButton({label:'Buyurtmani yuborishga o‘tish',variant:'secondary',onClick:()=>{
      const intent=controller.buildCheckoutIntent();
      if(!intent.ok){ return; }
      const intentStore=checkMod.createCheckoutIntentStore(globalThis.sessionStorage, `ustore:web:checkout-submit:v2:${context.shop.id}:${context.actor.accountId}`);
      const submitController=checkMod.createCheckoutSubmitController({ordersPort:shopRuntime.services.orders,paymentsPort:shopRuntime.services.payments,checkoutIntent:intent.data,intentStore});
      const submitView=reactive(submitController,(snapshot)=>checkMod.createCheckoutSubmitView({controller:submitController,state:snapshot,onRedirect:(url)=>location.assign(url)}));
      submitHost.replaceChildren(submitView.element); remember(submitView.destroy);
    }})); return box; });
  host.append(view.element,submitHost); mountShell(routeState,host,'Checkout'); remember(view.destroy); await controller.load();
}
async function renderOrders(routeState, epoch) {
  const mod=await import('./features/orders/index.js'); const controller=mod.createOrdersController({ordersPort:shopRuntime.services.orders});
  if (epoch !== renderEpoch) return;
  const view=reactive(controller,(state)=>mod.createOrdersView({controller,state})); mountShell(routeState,view.element,'Buyurtmalar');remember(view.destroy);
  const result=await controller.load(); if(epoch!==renderEpoch||!result?.ok)return; if(routeState.params.orderId) await controller.open(routeState.params.orderId);
}
async function renderProfile(routeState, epoch) {
  const mod=await import('./features/profile/index.js'); const controller=mod.createProfileController({profilePort:shopRuntime.services.profile,initialAccountId:context.actor?.accountId});
  if (epoch !== renderEpoch) return;
  const view=reactive(controller,(state)=>mod.createProfileView({
    controller,state,onOpenProduct:(id)=>go(`/product/${encodeURIComponent(id)}`),onOpenSessions:()=>go('/profile/sessions'),
    onOpenOrders:()=>go('/orders'), onOpenSupport:()=>go('/support'), onOpenPromotions:()=>go('/promotions'),
    onOpenAdmin:actorIsAdmin(context.actor) ? ()=>go('/admin') : null,
    onOpenDomains:actorCan(context.actor,'domains.manage') ? ()=>go('/admin/domains') : null,
  }));mountShell(routeState,view.element,'Profil');remember(view.destroy);await controller.load();
}
async function renderSessions(routeState, epoch) {
  const mod=await import('./features/profile/index.js'); const controller=mod.createSessionsController({authPort:shopRuntime.services.auth,onSignedOut:()=>{shopRuntime=null;context=null;go('/',true);}});
  if (epoch !== renderEpoch) return;
  const view=reactive(controller,(state)=>mod.createSessionsView({controller,state}));mountShell(routeState,view.element,'Sessiyalar');remember(view.destroy);await controller.load();
}
async function renderSupport(routeState, epoch) {
  const mod=await import('./features/support/index.js'); const controller=mod.createSupportController({supportPort:shopRuntime.services.support});
  if (epoch !== renderEpoch) return;
  const view=reactive(controller,(state)=>mod.createSupportView({controller,state}));mountShell(routeState,view.element,'Yordam');remember(view.destroy);await controller.loadThreads?.();
}
async function renderAdmin(routeState, epoch) {
  const actor=context.actor; const id=routeState.route.id; let view=null, controller=null, title='Boshqaruv';
  if(id==='admin-overview') { mountShell(routeState,stateView('empty','Boshqaruv paneli','Asosiy admin modullar chap menyuda. Serverda mavjud bo‘lmagan KPI yasalmaydi.'),'Boshqaruv'); return; }
  if(id==='admin-product-edit'||id==='admin-product-new') {
    const assets=await import('./runtime/admin-assets.js');await assets.loadImageIO();
    const m=await import('./features/admin-products/editor-page.js');
    let categories=[];
    if(id==='admin-product-new'){
      const result=await shopRuntime.services.catalog.listCategories({all:true});
      if(!result.ok)throw new Error(result.error?.message||'Katalog yuklanmadi');categories=result.data.items;
    }
    if(epoch!==renderEpoch)return;
    view=m.createAdminProductEditorPage({adminPort:shopRuntime.services.admin,actor,productId:routeState.params.productId,categories,onBack:()=>go('/admin/products')});
    controller=view;title='Mahsulotni tahrirlash';
  }
  else if(id==='admin-categories') {
    if(!(actor.permissions||[]).some(p=>p==='*'||p==='catalog.manage')){mountShell(routeState,stateView('permission','Ruxsat yo‘q'));return;}
    const cats=await shopRuntime.services.catalog.listCategories({all:true});if(!cats.ok)throw new Error(cats.error?.message||'Katalog yuklanmadi');
    const box=document.createElement('div');box.append(createButton({label:'Yangi katalog',onClick:()=>go('/admin/categories/new')}));
    for(const c of cats.data.items)box.append(createButton({label:c.name,variant:'secondary',onClick:()=>go(`/admin/categories/${encodeURIComponent(c.id)}/edit`)}));
    view={element:box};title='Kataloglar';
  }
  else if(id==='admin-category-new'||id==='admin-category-edit') {
    const assets=await import('./runtime/admin-assets.js');await assets.loadImageIO();
    const m=await import('./features/admin-products/index.js');
    const cats=await shopRuntime.services.catalog.listCategories({all:true});
    if(!cats.ok)throw new Error(cats.error?.message||'Katalog yuklanmadi');
    controller=m.createAdminCategoryEditorController({adminPort:shopRuntime.services.admin,actor});
    const category=cats.data.items.find(c=>String(c.id)===String(routeState.params.categoryId));
    if(id==='admin-category-edit'&&!category){mountShell(routeState,stateView('error','Katalog topilmadi'));return;}
    const opened=id==='admin-category-edit'?controller.openEdit(category,cats.data.items):controller.openCreate({categories:cats.data.items});
    if(!opened.ok){mountShell(routeState,stateView('permission','Ruxsat yo‘q',opened.error.message));return;}
    const host=document.createElement('div');let key=null;
    const unsub=controller.subscribe(s=>{const next=JSON.stringify([s.busy,s.error,s.success,s.mode,s.draft.id,s.draft.imageFile?.name]);if(key===next)return;key=next;host.replaceChildren(createButton({label:'Mahsulotlarga qaytish',onClick:()=>go('/admin/products')}),m.createAdminCategoryEditorView({controller}).element);});
    view={element:host,destroy:unsub};title=id==='admin-category-edit'?'Katalogni tahrirlash':'Yangi katalog';
  }
  else if(id==='admin-imports') {
    const m=await import('./features/admin-imports/page.js');
    view=await m.createAdminImportsPage({adminPort:shopRuntime.services.admin,catalogPort:shopRuntime.services.catalog,actor,onBack:()=>go('/admin/products')});controller=view;title='Import';
  }
  else if(id==='admin-products') { const m=await import('./features/admin-products/index.js');controller=m.createAdminProductsController({adminPort:shopRuntime.services.admin,actor});view=reactive(controller,s=>{
    const box=document.createElement('div');const permissions=actor.permissions||[];const can=p=>permissions.includes('*')||permissions.includes(p);
    if(can('products.manage'))box.append(createButton({label:'Yangi mahsulot',onClick:()=>go('/admin/products/new')}));
    if(can('catalog.manage')){box.append(createButton({label:'Kataloglar',onClick:()=>go('/admin/categories')}));box.append(createButton({label:'Yangi katalog',onClick:()=>go('/admin/categories/new')}));for(const c of s.categories||[])box.append(createButton({label:`Katalog: ${c.name}`,variant:'ghost',onClick:()=>go(`/admin/categories/${encodeURIComponent(c.id)}/edit`)}));}
    if(can('products.import_export')||can('integrations.manage'))box.append(createButton({label:'Import va BILLZ',onClick:()=>go('/admin/imports')}));
    box.append(m.createAdminProductsView({controller,state:s,onEditProduct:(product)=>go(`/admin/products/${encodeURIComponent(product.id)}/edit`)}));return box;
  });title='Mahsulotlar'; }
  else if(id==='admin-orders'||id==='admin-order') { const m=await import('./features/admin-orders/index.js');controller=m.createAdminOrdersController({adminPort:shopRuntime.services.admin,actor});view=reactive(controller,s=>m.createAdminOrdersView({controller,state:s}));title='Buyurtmalar'; }
  else if(id==='admin-inventory') { const m=await import('./features/admin-inventory/index.js');controller=m.createAdminInventoryController({adminPort:shopRuntime.services.admin,actor});view=reactive(controller,s=>m.createAdminInventoryView({controller,state:s}));title='Ombor'; }
  else if(id==='admin-marketing') { const m=await import('./features/admin-marketing/index.js');controller=m.createAdminMarketingController({adminPort:shopRuntime.services.admin,actor});view=m.createAdminMarketingView({controller});title='Marketing'; }
  else if(id==='admin-reports') { const assets=await import('./runtime/admin-assets.js');await assets.loadReportPdf();const m=await import('./features/admin-reports/index.js');controller=m.createAdminReportsController({adminPort:shopRuntime.services.admin,actor,telegramWebApp:globalThis.Telegram?.WebApp});view=m.renderAdminReports({controller});title='Hisobotlar'; }
  else if(id==='admin-team') { const m=await import('./features/admin-team/index.js');controller=m.createAdminTeamController({adminPort:shopRuntime.services.admin,actor});view=m.renderAdminTeam({controller});title='Jamoa'; }
  else if(id==='admin-support') { const m=await import('./features/support/index.js');controller=m.createAdminSupportController({adminPort:shopRuntime.services.admin});view=reactive(controller,s=>m.createAdminSupportView({controller,state:s}));title='Yordam'; }
  else if(id==='admin-settings') { const m=await import('./features/admin-settings/index.js');controller=m.createAdminSettingsController({adminPort:shopRuntime.services.admin,actor,locale:uiLocale,onLocaleChange:(next)=>setUiLocale(next)});view=reactive(controller,s=>m.createAdminSettingsView({controller,state:s}));title='Sozlamalar'; }
  else if(id==='admin-domains') { const m=await import('./features/domains/index.js');view=m.createAdminDomainsPage({services:shopRuntime.services,context,language:uiLocale});controller=view;title='Domenlar'; }
  else { mountShell(routeState,createNotFoundView({locale:uiLocale,onHome:()=>go('/admin')}),'404'); return; }
  if (epoch !== renderEpoch) { view?.destroy?.(); return; }
  mountShell(routeState,elementOf(view),title); if(typeof view?.destroy==='function')remember(view.destroy);
  if(controller?.load) await controller.load(routeState.params.orderId ? {orderId:routeState.params.orderId}:undefined);
}

async function renderRoute(routeState, reason = 'refresh') {
  activeRouteReason = reason;
  const epoch=++renderEpoch; cleanupActive();
  applyPrivateMetadata('UStorE', 'Bu sahifa indekslash uchun public metadata tasdiqlanmaguncha noindex holatida turadi.');
  try {
    if(routeState.route?.id==='auth-origin-handoff') {
      if (!allowExplicitPlatformRoute()) { mount(createNotFoundView({onHome:()=>go('/')})); return; }
      await renderCentralHandoff(routeState,epoch); return;
    }
    if(routeState.route?.id==='auth-origin-callback') { await renderOriginCallback(routeState,epoch); return; }
    if(routeState.route?.id==='auth-telegram-callback') { return; }
    if(!routeState.found) { mount(createNotFoundView({locale:uiLocale,onHome:()=>go('/')})); return; }
    const centralOrigin = isConfiguredPlatformOrigin() || (!!previewBase() && routeState.route?.id === 'home' && !new URLSearchParams(location.search).has('bot_id'));
    if (centralOrigin && routeState.route?.id === 'home') {
      mount(launchView({ mode:'platform' }));
      await renderPlatformHome(routeState, epoch); return;
    }
    if (isExplicitPlatformRoute(routeState)) {
      armSlowRouteState(epoch, { message:'Kerakli sahifa xavfsiz tarzda yuklanmoqda…', auth: routeState.route.id === 'platform-login' });
    }
    if (isExplicitPlatformRoute(routeState)) {
      if (!allowExplicitPlatformRoute()) { mount(createNotFoundView({locale:uiLocale,onHome:()=>go('/')})); return; }
      if (routeState.route.id === 'platform-home') { await renderPlatformHome(routeState, epoch); return; }
      if (routeState.route.id === 'platform-login') { await renderPlatformLogin(routeState, epoch); return; }
      if (routeState.route.platformSuperAdmin) { await renderPlatformAdmin(routeState, epoch); return; }
      if (routeState.route.platformAuth) { await renderPlatformPortal(routeState, epoch); return; }
    }
    if (centralOrigin) { mount(createNotFoundView({locale:uiLocale,onHome:()=>go('/')})); return; }
    // Public tabs inside a live shop do not need another boot/auth round trip.
    // Protected routes still pass through the server-backed checks below.
    if (sharedFrame?.kind === 'shop' && context && sharedFrame.sessionToken === (shopRuntime?.tokenStore.get() || '') && root.contains(sharedFrame.view.element) &&
        !routeState.route.auth && !routeState.route.admin && routeState.route.id !== 'checkout') {
      if (!await applySharedShopMetadata(routeState, epoch) || epoch !== renderEpoch) return;
      sharedFrame.view.route(routeState.target);
      return;
    }
    const shopHint = shopNameHintFromHostname();
    if (!shopLaunchShown) {
      if (!root.querySelector('.uw-shop-opening')) mount(launchView({ mode:'shop', name:shopHint }));
      shopLaunchShown = true;
    }
    const runtimeResult=await ensureShopRuntime(); if(epoch!==renderEpoch)return;
    if(!runtimeResult.ok){mount(stateView('error','Do‘kon ochilmadi',runtimeResult.error?.message||'Do‘kon manzili aniqlanmadi.','Qayta urinish',()=>{shopRuntime=null;renderRoute(routeState);}));return;}
    const tenantBrand = runtimeResult.data?.tenant || {};
    const waitingLaunch = root.querySelector('.ustore-welcome');
    if (waitingLaunch) globalThis.USTORE_SHOP_WELCOME.update(waitingLaunch, {
      name:tenantBrand.shopName || shopHint, logoUrl:tenantBrand.logoUrl || null, locale:uiLocale,
    });
    try {
      if (tenantBrand.shopName || tenantBrand.logoUrl) globalThis.localStorage?.setItem?.(`ustore:shop:brand:${location.hostname.toLowerCase()}`, JSON.stringify({ name:tenantBrand.shopName || shopHint, logoUrl:tenantBrand.logoUrl || null }));
    } catch (_) {}
    const contextResult=await refreshContext(epoch); if(epoch!==renderEpoch)return;
    if(!contextResult.ok){mount(stateView('error','Do‘kon ochilmadi',contextResult.error?.message||'Kontekst yuklanmadi.','Qayta urinish',()=>renderRoute(routeState)));return;}
    const welcome = root.querySelector('.ustore-welcome');
    if (welcome) globalThis.USTORE_SHOP_WELCOME.update(welcome, {name:context.shop.name,logoUrl:context.shop.logoUrl,theme:context.shop.designSettings,locale:uiLocale});
    try { globalThis.sessionStorage?.setItem?.(`ustore:shop:entered:${location.hostname.toLowerCase()}`, '1'); } catch (_) {}
    try { globalThis.localStorage?.setItem?.(`ustore:shop:brand:${location.hostname.toLowerCase()}`, JSON.stringify({name:context.shop.name,logoUrl:context.shop.logoUrl,theme:context.shop.designSettings || null})); } catch (_) {}
    const protectedRoute=routeState.route.auth||routeState.route.admin||routeState.route.id==='checkout';
    if(protectedRoute&&!context.actor){await renderShopSignIn(routeState,epoch);return;}
    if(routeState.route.admin&&!actorIsAdmin(context.actor)){mountShell(routeState,stateView('permission','Ruxsat yo‘q','Bu admin sahifasi uchun do‘kon vakolati kerak.'),'Ruxsat yo‘q');return;}
    if (!await applySharedShopMetadata(routeState, epoch) || epoch !== renderEpoch) return;
    mountSharedFrame({ kind:'shop', routeState, runtime:shopRuntime, tenant:{...shopRuntime.tenant,shopName:context.shop.name,logoUrl:context.shop.logoUrl,designSettings:context.shop.designSettings} });
    return;
    switch(routeState.route.id){
      case 'home': return renderHome(routeState,epoch);
      case 'catalog': case 'search': return renderCatalog(routeState,epoch);
      case 'product': return renderProduct(routeState,epoch);
      case 'bundle': return renderBundle(routeState,epoch);
      case 'promotion': return renderPromotion(routeState,epoch);
      case 'promotions': return renderPromotions(routeState,epoch);
      case 'cart': return renderCart(routeState,epoch);
      case 'checkout': return renderCheckout(routeState,epoch);
      case 'orders': case 'order': return renderOrders(routeState,epoch);
      case 'profile': case 'favorites': return renderProfile(routeState,epoch);
      case 'sessions': return renderSessions(routeState,epoch);
      case 'support': return renderSupport(routeState,epoch);
      default: if(routeState.route.admin)return renderAdmin(routeState,epoch); mount(createNotFoundView({locale:uiLocale,onHome:()=>go('/')}));
    }
  } catch(error) {
    if(epoch!==renderEpoch)return;
    mount(stateView('error','Sahifa ochilmadi',error?.message||'Kutilmagan xato.','Qayta urinish',()=>renderRoute(routeState)));
  }
}

router=createRouter({previewBase:previewBase(),onChange:(state,reason)=>renderRoute(state,reason)});
async function startWebApp() {
  const params = new URLSearchParams(location.search);
  if ((params.has('code') || params.has('state') || params.has('error')) && allowExplicitPlatformRoute() &&
      (location.pathname === '/auth/telegram/callback' || location.pathname === '/' || !!previewBase())) {
    try {
      const [runtime, callback, authStore] = await Promise.all([
        loadProductionRuntimeModule(), import('./features/auth/official-telegram-callback.js?v=20261009t7'), import('./services/live/auth.js?v=20261009t7'),
      ]);
      const result = await callback.completeOfficialTelegramCallback({
        locationRef: location, historyRef: history,
        authPort: runtime.createProductionAuthRuntime().auth,
        pendingStore: authStore.createSessionStorageOfficialTelegramStore(sessionStorage),
      });
      if (result?.ok && typeof result.data?.returnTo === 'string' &&
          (result.data.returnTo.startsWith('/platform/') || result.data.returnTo.startsWith('/auth/handoff?'))) {
        const path = result.data.returnTo;
        centralSignInJustCompleted = path.startsWith('/auth/handoff?');
        history.replaceState(history.state, '', previewBase() ? `${previewBase()}#${path}` : path);
        router.start();
        return;
      }
      mount(stateView('error', 'Telegram orqali kirish amalga oshmadi',
        result?.error?.message || 'Kirishni qaytadan boshlang.', 'Kirish sahifasi', () => { router.start(); router.replace('/platform/login'); }));
      return;
    } catch (_) {
      const clean = new URL(location.href);
      for (const key of ['code', 'state', 'error', 'error_description']) clean.searchParams.delete(key);
      history.replaceState(history.state, '', `${clean.pathname}${clean.search}${clean.hash}`);
      mount(stateView('error', 'Telegram orqali kirish amalga oshmadi',
        'Qayta urinib ko‘ring.', 'Kirish sahifasi', () => { router.start(); router.replace('/platform/login'); }));
      return;
    }
  }
  router.start();
}
window.addEventListener('pageshow', (event) => {
  // When the browser restores this page from BFCache after an auth cancel/back,
  // keep the already-live storefront/frame intact. Re-starting the router here
  // destroys the restored iframe and turns an instant Back action into a cold boot.
  if (event.persisted) {
    root.querySelector('.uw-auth-transition--overlay')?.remove();
    frameSignInPending = false;
    applyDocumentLocale(uiLocale);
  }
});
void startWebApp();
