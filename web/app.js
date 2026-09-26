import { createRouter, splitTarget } from './navigation/router.js';
import { createNotFoundView } from './navigation/not-found.js';
import { createCustomerShell, createAdminShell } from './shells/index.js';
import { createButton, createStatePanel } from './components/ui.js';
import { createTranslator, normalizeLocale } from './i18n/index.js';
import { buildCanonicalUrl, createDocumentMetadataManager, sharePage } from './metadata/index.js';

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
let activeCleanup = [];
let activeRouteReason = 'start';
const WEB_LOCALE_KEY = 'ustore.web.locale';
const metadataManager = createDocumentMetadataManager({ documentRef: document });

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
  root.replaceChildren(node);
  settleRouteFocus(routeMainTarget(node));
  if (typeof value?.destroy === 'function') remember(value.destroy);
}
function stateView(kind, title, message, actionLabel = '', onAction) {
  return createStatePanel({ kind, title, message, actionLabel, onAction });
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
    });
  }
  return createCustomerShell({
    context, activeNav: routeState.route?.navId || 'home', content, locale: uiLocale,
    onNavigate: navHandler, onOpenCart: () => go('/cart'), onOpenAccount: () => go('/profile'),
    onSearch: (query) => go(`/search?q=${encodeURIComponent(String(query || '').trim())}`),
  });
}
function mountShell(routeState, content, title = '') { mount(shellFor(routeState, content, title)); }
function reactive(controller, factory) {
  const host = document.createElement('div');
  let childDestroy = null;
  const render = () => {
    try { childDestroy?.(); } catch (_) {}
    const view = factory(controller.getState());
    childDestroy = typeof view?.destroy === 'function' ? view.destroy : null;
    host.replaceChildren(elementOf(view));
  };
  render();
  const unsub = controller.subscribe?.(render);
  return { element: host, destroy(){ try{unsub?.();}catch(_){} try{childDestroy?.();}catch(_){} } };
}
function actorIsAdmin(actor) {
  return !!actor && (actor.shopRole === 'OWNER' || actor.shopRole === 'STAFF' || (actor.roleCodes || []).includes('MANAGER'));
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
function loadProductionRuntimeModule() {
  if (!productionRuntimeModulePromise) productionRuntimeModulePromise = import('./runtime/production.js');
  return productionRuntimeModulePromise;
}
function loadAuthFeatureModule() {
  if (!authFeatureModulePromise) authFeatureModulePromise = import('./features/auth/origin-handoff.js');
  return authFeatureModulePromise;
}
function loadLoginFeatureModule() {
  // A cached older login module must not be paired with a newer app.js after
  // a manual GitHub Pages upload. Refresh this auth module as a release unit.
  if (!loginFeatureModulePromise) loginFeatureModulePromise = import('./features/auth/login.js?v=20260926b');
  return loginFeatureModulePromise;
}
function watchTelegramLogin(controller) {
  const resume = () => {
    if (document.visibilityState !== 'hidden' && controller.hasPendingTelegramSignIn?.()) {
      void controller.resumeTelegramSignIn?.();
    }
  };
  globalThis.addEventListener?.('pageshow', resume);
  globalThis.addEventListener?.('focus', resume);
  document.addEventListener?.('visibilitychange', resume);
  const poll = globalThis.setInterval?.(() => {
    if (document.visibilityState !== 'hidden' && controller.getState().telegramPhase === 'waiting') resume();
  }, 2500);
  remember(() => {
    globalThis.removeEventListener?.('pageshow', resume);
    globalThis.removeEventListener?.('focus', resume);
    document.removeEventListener?.('visibilitychange', resume);
    if (poll != null) globalThis.clearInterval?.(poll);
  });
  resume();
}
function armSlowRouteState(epoch, { delay = 320, title = 'Sahifa yuklanmoqda', message = 'Tarmoq sekin bo‘lsa, ma’lumotlar kelguncha shu holat ko‘rinadi.' } = {}) {
  const timer = globalThis.setTimeout?.(() => {
    if (epoch !== renderEpoch) return;
    mount(stateView('loading', title, message));
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
  const returnTo = routeState.target || currentTarget();
  const controller = createCustomDomainSignInController({
    authPort: shopRuntime.services.auth, returnTo,
    onRedirect: (url) => location.assign(url),
  });
  const view = reactive(controller, (state) => createCustomDomainSignInView({ controller, state }));
  mountShell(routeState, view.element, 'Kirish');
  remember(view.destroy);
}

async function renderCentralHandoff(routeState, epoch) {
  const [runtimeModule, authFeature, loginFeature] = await Promise.all([loadProductionRuntimeModule(), loadAuthFeatureModule(), loadLoginFeatureModule()]);
  if (epoch !== renderEpoch) return;
  const authRuntime = runtimeModule.createProductionAuthRuntime();
  const state = new URLSearchParams(routeState.search).get('state') || '';
  const session = await authRuntime.auth.getSession();
  if (epoch !== renderEpoch) return;
  if (!session.ok) {
    const controller = loginFeature.createLoginController({
      authPort: authRuntime.auth,
      returnTo: routeState.target,
      onSignedIn: () => renderRoute(routeState),
      onRedirect: (url) => location.assign(url),
    });
    const view = reactive(controller, (snapshot) => loginFeature.createLoginView({ controller, state:snapshot }));
    mount(view); watchTelegramLogin(controller); return;
  }
  const controller = authFeature.createCentralOriginHandoffController({ authPort: authRuntime.auth, state, onRedirect:(url)=>location.assign(url) });
  const view = reactive(controller, (snapshot) => authFeature.createCentralOriginHandoffView({ controller, state:snapshot }));
  mount(view); remember(view.destroy); await controller.load();
}
async function renderOriginCallback(routeState, epoch) {
  const [runtimeModule, authFeature] = await Promise.all([loadProductionRuntimeModule(), loadAuthFeatureModule()]);
  if (epoch !== renderEpoch) return;
  const authRuntime = runtimeModule.createProductionAuthRuntime();
  const result = await authFeature.completeCustomDomainLogin({ authPort: authRuntime.auth, url: location.href });
  if (epoch !== renderEpoch) return;
  mount(authFeature.createOriginCallbackView({ result, onNavigate:(target)=>go(target, true) }));
}

async function renderPlatformHome(routeState, epoch) {
  applyPlatformHomeMetadata(routeState);
  const runtime = await ensurePlatformRuntime();
  if (epoch !== renderEpoch) return;
  const mod = await import('./features/platform-home/index.js');
  if (epoch !== renderEpoch) return;
  const controller = mod.createPlatformHomeController({ platformPort: runtime.platform });
  const view = reactive(controller, (snapshot) => mod.createPlatformHomeView({
    controller,
    state: snapshot,
    onLogin: (meta = {}) => {
      const next = meta?.intent === 'new-shop' ? '/platform/subscriptions?new=1' : '/platform/app';
      go(`${platformLoginTarget()}?${new URLSearchParams({ next }).toString()}`);
    },
    onChoosePlan: (tariff) => {
      const next = `/platform/subscriptions?new=1&plan=${encodeURIComponent(String(tariff?.id || ''))}`;
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
  const controller = loginFeature.createLoginController({
    authPort: runtime.auth,
    returnTo,
    onSignedIn: () => go(returnTo, true),
    onRedirect: (url) => location.assign(url),
  });
  if (epoch !== renderEpoch) return;
  const shell = document.createElement('div');
  shell.className = 'uw-platform-auth-shell uw-root';
  const top = document.createElement('div'); top.className = 'uw-platform-auth-shell__top';
  const back = createButton({ label: '← Bosh sahifa', variant: 'ghost', onClick: () => go(home) });
  top.append(back);
  const view = reactive(controller, (snapshot) => loginFeature.createLoginView({ controller, state: snapshot }));
  shell.append(top, view.element);
  mount(shell); remember(view.destroy);
  watchTelegramLogin(controller);
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
  const mod = await import('./features/platform-admin/index.js');
  if (!platformAdminController) platformAdminController = mod.createPlatformAdminController({ platformPort: runtime.platform, authPort: runtime.auth });
  const sectionByRoute = {
    'platform-admin':'overview', 'platform-admin-shops':'shops', 'platform-admin-shop':'shops',
    'platform-admin-requests':'requests', 'platform-admin-request':'requests',
    'platform-admin-support':'support', 'platform-admin-support-ticket':'support',
    'platform-admin-tariffs':'tariffs', 'platform-admin-analytics':'analytics', 'platform-admin-settings':'settings',
  };
  const section = sectionByRoute[routeState.route.id] || 'overview';
  const view = reactive(platformAdminController, (snapshot) => mod.createPlatformAdminView({
    controller: platformAdminController,
    state: snapshot,
    section,
    params: routeState.params,
    onNavigate: (target) => go(target),
    onSignedOut: () => { platformAdminController = null; platformPortalController = null; go(platformHomeTarget(), true); },
  }));
  mount(view); remember(view.destroy);
  let snapshot = platformAdminController.getState();
  if (snapshot.status === 'idle' || snapshot.status === 'error') await platformAdminController.load();
  if (epoch !== renderEpoch) return;
  snapshot = platformAdminController.getState();
  if (snapshot.status !== 'ready' || snapshot.isSuperAdmin !== true) return;
  await platformAdminController.loadSection(section, routeState.params || {});
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
  const mod = await import('./features/platform-portal/index.js');
  if (!platformPortalController) platformPortalController = mod.createPlatformPortalController({ platformPort: runtime.platform, authPort: runtime.auth });
  const sectionByRoute = {
    'platform-app':'app', 'platform-shops':'shops', 'platform-shop':'shops',
    'platform-subscriptions':'subscriptions', 'platform-requests':'requests', 'platform-request':'requests',
    'platform-support':'support', 'platform-support-ticket':'support', 'platform-profile':'profile',
  };
  const section = sectionByRoute[routeState.route.id] || 'app';
  const view = reactive(platformPortalController, (snapshot) => mod.createPlatformPortalView({
    controller: platformPortalController,
    state: snapshot,
    section,
    params: routeState.params,
    search: routeState.search,
    onNavigate: (target) => go(target),
    onSignedOut: () => { platformPortalController = null; go(platformHomeTarget(), true); },
  }));
  mount(view); remember(view.destroy);
  let snapshot = platformPortalController.getState();
  if (snapshot.status === 'idle' || snapshot.status === 'error') await platformPortalController.load();
  if (epoch !== renderEpoch) return;
  snapshot = platformPortalController.getState();
  if (section === 'subscriptions') {
    const q = new URLSearchParams(routeState.search || '');
    const requestedShop = q.get('shop') || snapshot.selectedShopId;
    const requestedPlan = q.get('plan') || '';
    if ((q.get('new') === '1' || !snapshot.shops.length) && !snapshot.checkout) {
      platformPortalController.beginCheckout({ kind: 'NEW_SHOP', tariffId: requestedPlan || undefined });
      snapshot = platformPortalController.getState();
    } else if (requestedPlan && snapshot.checkout && snapshot.checkout.tariffId !== requestedPlan) {
      platformPortalController.patchCheckout({ tariffId: requestedPlan });
      snapshot = platformPortalController.getState();
    }
    if (requestedShop && (snapshot.selectedShopId !== requestedShop || snapshot.historyStatus === 'idle')) await platformPortalController.loadHistory(requestedShop);
  } else if (section === 'requests' && routeState.params.requestId) {
    if (snapshot.selectedRequestId !== routeState.params.requestId || snapshot.requestHistoryStatus === 'idle') await platformPortalController.loadRequestHistory(routeState.params.requestId);
  } else if (section === 'support') {
    if (snapshot.supportStatus === 'idle') await platformPortalController.loadSupport();
    snapshot = platformPortalController.getState();
    if (routeState.params.ticketId && (Number(snapshot.selectedTicketId) !== Number(routeState.params.ticketId) || !snapshot.messages.length)) await platformPortalController.openTicket(routeState.params.ticketId);
  }
  if (epoch !== renderEpoch) return;
}

async function renderHome(routeState, epoch) {
  const [mod, bundleMod, cartMod] = await Promise.all([import('./features/home/index.js'), import('./features/bundle/index.js'), import('./features/cart/index.js')]);
  const result = await mod.loadHomeModel({ catalogPort: shopRuntime.services.catalog });
  if (epoch !== renderEpoch) return;
  if (result.ok) applyShopPublicMetadata({
    title: `${context.shop.name} — UStorE`,
    description: `${context.shop.name} onlayn do‘koni. Mahsulotlar va katalogni ko‘ring.`,
    pathname: '/',
    imageUrl: context.shop.logoUrl || null,
  });
  if (!result.ok) {
    const view = mod.createHomeView({ model:null, state: result.error?.code === 'SHOP_UNAVAILABLE' ? 'unavailable' : 'error', onRetry:()=>renderRoute(routeState) });
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
      model:result.data, addingBundleId,
      onOpenProduct:(p)=>go(`/product/${encodeURIComponent(p.id)}`),
      onOpenCategory:(c)=>go(`/catalog?category=${encodeURIComponent(c.id)}`),
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
  const mod = await import('./features/catalog/index.js');
  const [cats, products] = await Promise.all([
    shopRuntime.services.catalog.listCategories({ all:true }),
    shopRuntime.services.catalog.listProducts({}),
  ]);
  if (epoch !== renderEpoch) return;
  if (!cats.ok || !products.ok) { mountShell(routeState, stateView('error','Katalog yuklanmadi',(cats.error||products.error)?.message||'Server xatosi.','Qayta urinish',()=>renderRoute(routeState)), 'Katalog'); return; }
  const query = mod.parseCatalogQuery(routeState.search || '');
  if (routeState.route.id === 'catalog') {
    applyShopPublicMetadata({ title: `${context.shop.name} katalogi — UStorE`, description: `${context.shop.name} mahsulotlari va kategoriyalari.`, pathname: '/catalog', imageUrl: context.shop.logoUrl || null });
  } else {
    applyPrivateMetadata(`Qidiruv — ${context.shop.name}`, 'Ichki qidiruv natijalari indekslanmaydi.', shopCanonical('/catalog'));
  }
  const view = mod.createCatalogView({
    products:products.data.items, categories:cats.data.items, query,
    onOpenProduct:(p)=>go(`/product/${encodeURIComponent(p.id)}`),
    onQueryChange:(next)=>go(`${routeState.route.id === 'search' ? '/search' : '/catalog'}${mod.serializeCatalogQuery(next)}`, true),
  });
  mountShell(routeState, view.element, routeState.route.id === 'search' ? 'Qidiruv' : 'Katalog');
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
      product, selection:controller.getSelection(),
      onSelectColor:(v)=>{controller.selectColor(v);rerender();}, onSelectSize:(v)=>{controller.selectSize(v);rerender();},
      adding,
      onAddToCart:async()=>{
        if (adding) return;
        adding=true; addResult=null; rerender();
        const result=await controller.addToCart();
        adding=false; addResult=result; rerender();
      },
      onShare:()=>sharePage({ title: productMeta.title, text: productMeta.description, url: productMeta.canonicalUrl }),
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
  const view=reactive(controller,(state)=>mod.createProfileView({controller,state,onOpenProduct:(id)=>go(`/product/${encodeURIComponent(id)}`),onOpenSessions:()=>go('/profile/sessions')}));mountShell(routeState,view.element,'Profil');remember(view.destroy);await controller.load();
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
    if(!routeState.found) { mount(createNotFoundView({locale:uiLocale,onHome:()=>go('/')})); return; }
    const centralOrigin = isConfiguredPlatformOrigin() || (!!previewBase() && routeState.route?.id === 'home' && !new URLSearchParams(location.search).has('bot_id'));
    if ((centralOrigin && routeState.route?.id === 'home') || isExplicitPlatformRoute(routeState)) {
      armSlowRouteState(epoch, { title:'UStorE platformasi yuklanmoqda', message:'Sessiya va kerakli modul yuklanmoqda. Sekin tarmoqda bu biroz vaqt olishi mumkin.' });
    }
    if (centralOrigin && routeState.route?.id === 'home') { await renderPlatformHome(routeState, epoch); return; }
    if (isExplicitPlatformRoute(routeState)) {
      if (!allowExplicitPlatformRoute()) { mount(createNotFoundView({locale:uiLocale,onHome:()=>go('/')})); return; }
      if (routeState.route.id === 'platform-home') { await renderPlatformHome(routeState, epoch); return; }
      if (routeState.route.id === 'platform-login') { await renderPlatformLogin(routeState, epoch); return; }
      if (routeState.route.platformSuperAdmin) { await renderPlatformAdmin(routeState, epoch); return; }
      if (routeState.route.platformAuth) { await renderPlatformPortal(routeState, epoch); return; }
    }
    if (centralOrigin) { mount(createNotFoundView({locale:uiLocale,onHome:()=>go('/')})); return; }
    mount(stateView('loading','UStorE yuklanmoqda','Do‘kon va sessiya tekshirilmoqda.'));
    const runtimeResult=await ensureShopRuntime(); if(epoch!==renderEpoch)return;
    if(!runtimeResult.ok){mount(stateView('error','Do‘kon ochilmadi',runtimeResult.error?.message||'Tenant aniqlanmadi.','Qayta urinish',()=>{shopRuntime=null;renderRoute(routeState);}));return;}
    const contextResult=await refreshContext(epoch); if(epoch!==renderEpoch)return;
    if(!contextResult.ok){mount(stateView('error','Do‘kon ochilmadi',contextResult.error?.message||'Kontekst yuklanmadi.','Qayta urinish',()=>renderRoute(routeState)));return;}
    const protectedRoute=routeState.route.auth||routeState.route.admin||['cart','checkout'].includes(routeState.route.id);
    if(protectedRoute&&!context.actor){await renderShopSignIn(routeState,epoch);return;}
    if(routeState.route.admin&&!actorIsAdmin(context.actor)){mountShell(routeState,stateView('permission','Ruxsat yo‘q','Bu admin sahifasi uchun do‘kon vakolati kerak.'),'Ruxsat yo‘q');return;}
    switch(routeState.route.id){
      case 'home': return renderHome(routeState,epoch);
      case 'catalog': case 'search': return renderCatalog(routeState,epoch);
      case 'product': return renderProduct(routeState,epoch);
      case 'bundle': return renderBundle(routeState,epoch);
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
router.start();
