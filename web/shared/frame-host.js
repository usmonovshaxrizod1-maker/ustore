// The browser owns tenant routing and the session. The Mini App owns the UI.
// Session tokens never cross into the GitHub Pages frame.
import { secureFrameNonce } from './browser-id.js';
import { fetchJsonWithTimeout } from './fetch-json.js';
const BRIDGE = 'ustore-miniapp-v1';
const MINI_APP_ORIGIN = 'https://usmonovshaxrizod1-maker.github.io';
// PLATFORM Web is self-hosted at ustr.uz. Only the Telegram Mini App and
// Shop iframe remain on GitHub Pages; no cross-site PLATFORM frame needed.
const platformFrameUrl = () => new URL(location.hostname === 'usmonovshaxrizod1-maker.github.io' ? '/ustore/web/platform-ui/' : '/platform-ui/', location.origin);
const PUBLIC_SHOP_ACTIONS = new Set(['boot', 'get_catalog', 'get_web_bundles', 'get_web_promotions', 'get_web_promotion']);
const GUEST_READ_ACTIONS = new Set(['get_favorites', 'get_recent_views', 'get_my_orders', 'get_my_support_tickets']);
const BACKGROUND_GUEST_ACTIONS = new Set(['record_product_view', 'save_cart_snapshot']);

function safeRoute(value) {
  const route = String(value || '/');
  return route.startsWith('/') && !route.startsWith('//') && !route.includes('\\') ? route : '/';
}

export function createMiniAppFrameHost({ kind, route = '/', tenant = null, viewerKey = '', guestViewerKey = '', runtime, fetchImpl = fetch, onNavigate = () => {}, onAuthRequired = () => {}, onSignedOut = () => {} } = {}) {
  if (kind !== 'shop' && kind !== 'platform') throw new TypeError('Mini App turi noto‘g‘ri.');
  if (!runtime?.endpoints || !runtime?.tokenStore?.get) throw new TypeError('Web runtime tayyor emas.');
  const botId = kind === 'shop' ? String(tenant?.botId || '') : '';
  if (kind === 'shop' && !/^\d+$/.test(botId)) throw new TypeError('Do‘kon bot identifikatori noto‘g‘ri.');
  if (!/^[0-9a-f-]{36}$/i.test(String(viewerKey || ''))) throw new TypeError('Browser saqlash kaliti noto‘g‘ri.');
  const nonce = secureFrameNonce();
  const frameOrigin = kind === 'platform' ? location.origin : MINI_APP_ORIGIN;
  const frame = document.createElement('iframe');
  const wrapper = document.createElement('main');
  wrapper.id = 'uw-main-content';
  wrapper.className = 'uw-miniapp-host';
  frame.className = 'uw-miniapp-frame';
  frame.title = kind === 'shop' ? `${tenant?.shopName || 'Do‘kon'} ilovasi` : 'UStorE ilovasi';
  if (kind === 'shop') frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation-by-user-activation allow-downloads');
  // PLATFORM UI is the app's own checked-in code on the same origin.
  frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  const src = kind === 'shop' ? new URL('/ustore/', MINI_APP_ORIGIN) : platformFrameUrl();
  if (kind === 'platform') src.searchParams.set('v', '20261009t8');
  src.searchParams.set('web_frame', '1');
  src.searchParams.set('viewer', viewerKey);
  if (guestViewerKey && /^[0-9a-f-]{36}$/i.test(guestViewerKey)) src.searchParams.set('guest_viewer', guestViewerKey);
  if (botId) src.searchParams.set('bot_id', botId);
  frame.src = src.href;
  let placeholder = null;
  if (kind === 'shop') {
    wrapper.className = `${wrapper.className} is-loading`.trim();
    placeholder = globalThis.USTORE_SHOP_WELCOME.create({
      name:tenant?.shopName || 'Do‘kon',logoUrl:tenant?.logoUrl || null,
      theme:tenant?.designSettings || null,locale:document.documentElement.lang || 'uz',
    });
  }
  wrapper.append(frame);
  if (placeholder) wrapper.append(placeholder);
  let alive = true;
  let launchElement = placeholder;
  let ready = false;
  let lastRoute = safeRoute(route);
  // Native Web PLATFORM is served from this origin; if the iframe still
  // fails to boot, surface an actionable retry instead of a crashed blank tab.
  let platformAppReady = false;
  const platformFailureTimer = kind === 'platform' ? setTimeout(() => {
    if (!alive || platformAppReady) return;
    const panel = document.createElement('section');
    panel.className = 'uw-miniapp-failure';
    panel.setAttribute('role', 'alert');
    const title = document.createElement('h2');
    title.textContent = 'Boshqaruv sahifasi ochilmadi';
    const copy = document.createElement('p');
    copy.textContent = 'Ulanish cho‘zildi. Internetni tekshiring va qayta urinib ko‘ring.';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Qayta urinish';
    retry.addEventListener('click', () => location.reload());
    panel.append(title, copy, retry);
    wrapper.append(panel);
  }, 18000) : null;
  const loadingTimer = kind === 'shop' ? setTimeout(() => {
    if (!alive || !placeholder) return;
    globalThis.USTORE_SHOP_WELCOME.failure(placeholder, {
      message:'Ulanish cho‘zildi. Internetni tekshiring yoki qayta urinib ko‘ring.',
      locale:document.documentElement.lang,
    });
  }, 15000) : null;
  const send = (message) => {
    if (alive && frame.contentWindow) frame.contentWindow.postMessage({ bridge: BRIDGE, kind, nonce, ...message }, frameOrigin);
  };
  const invoke = async (action, payload) => {
    if (!/^[a-z][a-z0-9_]{0,79}$/.test(String(action || ''))) throw new Error('invalid_action');
    const token = String(runtime.tokenStore.get() || '');
    if (action === 'web_credentials_status' || action === 'web_credentials_change_login' || action === 'web_credentials_change_password' || action === 'web_credentials_finish_password_change') {
      if (action === 'web_credentials_finish_password_change') {
        if (token) throw new Error('password_change_not_finished');
        setTimeout(() => onSignedOut(), 0);
        return { signedOut: true };
      }
      if (!token) throw new Error('auth_required');
      const request = action === 'web_credentials_status'
        ? runtime.auth.getCredentialsStatus()
        : action === 'web_credentials_change_login'
          ? runtime.auth.changeLogin({ login: String(payload?.login || '') })
          : runtime.auth.changePassword({ currentPassword: String(payload?.currentPassword || ''), newPassword: String(payload?.newPassword || '') });
      const result = await request;
      if (!result?.ok) throw new Error(String(result?.error?.code || result?.error?.message || 'credential_update_failed'));
      return result.data || { ok: true };
    }
    if (action === 'web_sign_out') {
      const result = kind === 'platform' ? await runtime.auth.signOut() : await runtime.services?.auth?.signOut?.();
      if (!result?.ok) throw new Error(String(result?.error?.message || result?.error?.code || 'sign_out_failed'));
      return { signedOut: true };
    }
    if (kind === 'shop' && action === 'boot' && !token) {
      const cached = runtime.takeGuestBoot?.();
      if (cached) return { ...cached, botUsername: cached.botUsername || String(tenant?.botUsername || '').replace(/^@/, '') || null };
    }
    // A visitor can browse public campaigns before signing in. These public
    // projections never contain another customer's private promo codes.
    if (kind === 'shop' && !token && action === 'get_marketing_campaigns') {
      const [bundles, promotions] = await Promise.all([
        invoke('get_web_bundles', {}), invoke('get_web_promotions', {}),
      ]);
      return { bundles: bundles.bundles || [], promotions: promotions.promotions || [], tiers: [], tierGroups: [], rewardRules: [], giftRules: [], personalDiscounts: [], myPromoCodes: [] };
    }
    if (kind === 'shop' && !token && action === 'get_campaign_detail') {
      const id = String(payload?.id || '');
      if (payload?.kind === 'BUNDLE') {
        const { bundles = [] } = await invoke('get_web_bundles', {});
        const bundle = bundles.find((item) => String(item.id) === id);
        if (!bundle) throw new Error('not_found');
        return { kind: 'BUNDLE', bundle };
      }
      const { promotion } = await invoke('get_web_promotion', { promotionId: id });
      return { kind: 'PROMOTION', promotion };
    }
    if (kind === 'shop' && !token && !PUBLIC_SHOP_ACTIONS.has(action)) {
      if (GUEST_READ_ACTIONS.has(action)) return action === 'get_my_orders' ? { orders: [] } : action === 'get_my_support_tickets' ? { tickets: [] } : { productIds: [] };
      if (BACKGROUND_GUEST_ACTIONS.has(action)) return { ok: true };
      onAuthRequired(lastRoute);
      throw new Error('auth_required');
    }
    if (kind === 'platform' && !token) {
      onAuthRequired(lastRoute);
      throw new Error('auth_required');
    }
    const endpoint = kind === 'shop' ? runtime.endpoints.shop : runtime.endpoints.platform;
    const body = kind === 'shop'
      ? { action, payload: payload || {}, botId, clientMode: 'web', ...(token && action !== 'get_catalog' ? { uiMode: 'shared' } : {}) }
      : { action, payload: payload || {}, clientMode: 'web' };
    // Catalog stays on the public Web projection, including its admin-aware
    // visibility. Guest boot stays public; authenticated boot is the full UI.
    const options = {
      method: 'POST', credentials: 'omit',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `UStoreSession ${token}` } : {}) },
      body: JSON.stringify(body),
    };
    let response, data;
    if (action === 'boot' || action === 'get_catalog') {
      ({ response, data } = await fetchJsonWithTimeout(fetchImpl, endpoint, options));
    } else {
      response = await fetchImpl(endpoint, options);
      data = await response.json().catch(() => ({}));
    }
    if (!alive) throw new Error('frame_closed');
    if (token && runtime.tokenStore.get() !== token) throw new Error('session_changed');
    if (!response.ok || data?.error) {
      if (response.status === 401 || data?.error === 'auth_required' || data?.error === 'session_expired') onAuthRequired(lastRoute);
      throw new Error(String(data?.error || `Server xatosi (${response.status})`));
    }
    if (data?.webSession?.replacementToken) runtime.tokenStore.set(data.webSession.replacementToken);
    if (data?.webSession) delete data.webSession;
    if (kind === 'shop' && action === 'boot' && !data.botUsername) {
      data.botUsername = String(tenant?.botUsername || '').replace(/^@/, '') || null;
    }
    return data;
  };
  // Fetch while the iframe downloads its scripts, instead of waiting for its
  // HELLO and boot. Only the existing server-authorized boot is reused.
  const startup = new Map();
  if (kind === 'shop') {
    for (const action of ['boot', 'get_catalog']) {
      const entry = { token: runtime.tokenStore.get() || '', at: Date.now(), promise: null };
      entry.promise = invoke(action, {}).then(
        data => ({ ok: true, data }), error => ({ ok: false, error }),
      );
      startup.set(action, entry);
    }
  }
  const onMessage = async (event) => {
    if (!alive || event.origin !== frameOrigin || event.source !== frame.contentWindow) return;
    const message = event.data;
    if (!message || message.bridge !== BRIDGE || message.kind !== kind) return;
    if (message.type === 'HELLO') {
      ready = true;
      send({ type: 'INIT', route: lastRoute, botId, authenticated: !!runtime.tokenStore.get() });
      return;
    }
    if (!ready || message.nonce !== nonce) return;
    if (message.type === 'APP_READY') {
      platformAppReady = true;
      clearTimeout(platformFailureTimer);
      clearTimeout(loadingTimer);
      wrapper.className = `${String(wrapper.className || '').replace(/\bis-loading\b/g, '').replace(/\bis-ready\b/g, '').trim()} is-ready`.trim();
      globalThis.USTORE_SHOP_WELCOME.dismiss(placeholder);
      placeholder = null;
      return;
    }
    if (message.type === 'NAVIGATE') {
      const next = safeRoute(message.route);
      lastRoute = next;
      onNavigate(next);
      return;
    }
    if (message.type !== 'REQUEST' || typeof message.id !== 'string' || message.id.length > 100) return;
    try {
      const cached = startup.get(message.action);
      startup.delete(message.action);
      let data;
      if (cached && cached.token === (runtime.tokenStore.get() || '') && Date.now() - cached.at < 30000 && !Object.keys(message.payload || {}).length) {
        const result = await cached.promise;
        if (!result.ok) throw result.error;
        data = result.data;
      } else data = await invoke(message.action, message.payload);
      send({ type: 'RESULT', id: message.id, ok: true, data });
      if (message.action === 'web_sign_out') setTimeout(() => onSignedOut(), 0);
    } catch (error) {
      send({ type: 'RESULT', id: message.id, ok: false, error: String(error?.message || 'request_failed') });
    }
  };
  window.addEventListener('message', onMessage);
  return Object.freeze({
    element: wrapper,
    route(next) { lastRoute = safeRoute(next); if (ready) send({ type: 'ROUTE', route: lastRoute }); },
    destroy() { alive = false; clearTimeout(platformFailureTimer); clearTimeout(loadingTimer); startup.clear(); launchElement?.remove?.(); window.removeEventListener('message', onMessage); frame.src = 'about:blank'; },
  });
}
