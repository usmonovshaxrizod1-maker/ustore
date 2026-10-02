// The browser owns tenant routing and the session. The Mini App owns the UI.
// Session tokens never cross into the GitHub Pages frame.
const BRIDGE = 'ustore-miniapp-v1';
const MINI_APP_ORIGIN = 'https://usmonovshaxrizod1-maker.github.io';
const PUBLIC_SHOP_ACTIONS = new Set(['boot', 'get_catalog', 'get_web_bundles', 'get_web_promotions', 'get_web_promotion']);
const GUEST_READ_ACTIONS = new Set(['get_favorites', 'get_recent_views', 'get_my_orders', 'get_my_support_tickets']);
const BACKGROUND_GUEST_ACTIONS = new Set(['record_product_view', 'save_cart_snapshot']);

function safeRoute(value) {
  const route = String(value || '/');
  return route.startsWith('/') && !route.startsWith('//') && !route.includes('\\') ? route : '/';
}

export function createMiniAppFrameHost({ kind, route = '/', tenant = null, viewerKey = '', guestViewerKey = '', runtime, fetchImpl = fetch, onNavigate = () => {}, onAuthRequired = () => {} } = {}) {
  if (kind !== 'shop' && kind !== 'platform') throw new TypeError('Mini App turi noto‘g‘ri.');
  if (!runtime?.endpoints || !runtime?.tokenStore?.get) throw new TypeError('Web runtime tayyor emas.');
  const botId = kind === 'shop' ? String(tenant?.botId || '') : '';
  if (kind === 'shop' && !/^\d+$/.test(botId)) throw new TypeError('Do‘kon bot identifikatori noto‘g‘ri.');
  if (!/^[0-9a-f-]{36}$/i.test(String(viewerKey || ''))) throw new TypeError('Browser saqlash kaliti noto‘g‘ri.');
  const nonce = crypto.randomUUID() + crypto.randomUUID();
  const frame = document.createElement('iframe');
  const wrapper = document.createElement('main');
  wrapper.id = 'uw-main-content';
  wrapper.className = 'uw-miniapp-host';
  frame.className = 'uw-miniapp-frame';
  frame.title = kind === 'shop' ? `${tenant?.shopName || 'Do‘kon'} ilovasi` : 'UStorE ilovasi';
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation-by-user-activation allow-downloads');
  frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  const src = new URL(kind === 'shop' ? '/ustore/' : '/ustore/platform/', MINI_APP_ORIGIN);
  src.searchParams.set('web_frame', '1');
  src.searchParams.set('viewer', viewerKey);
  if (guestViewerKey && /^[0-9a-f-]{36}$/i.test(guestViewerKey)) src.searchParams.set('guest_viewer', guestViewerKey);
  if (botId) src.searchParams.set('bot_id', botId);
  frame.src = src.href;
  wrapper.append(frame);
  let alive = true;
  let ready = false;
  let lastRoute = safeRoute(route);
  const send = (message) => {
    if (alive && frame.contentWindow) frame.contentWindow.postMessage({ bridge: BRIDGE, kind, nonce, ...message }, MINI_APP_ORIGIN);
  };
  const invoke = async (action, payload) => {
    if (!/^[a-z][a-z0-9_]{0,79}$/.test(String(action || ''))) throw new Error('invalid_action');
    const token = String(runtime.tokenStore.get() || '');
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
    const response = await fetchImpl(endpoint, {
      method: 'POST', credentials: 'omit',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `UStoreSession ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
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
  const onMessage = async (event) => {
    if (!alive || event.origin !== MINI_APP_ORIGIN || event.source !== frame.contentWindow) return;
    const message = event.data;
    if (!message || message.bridge !== BRIDGE || message.kind !== kind) return;
    if (message.type === 'HELLO') {
      ready = true;
      send({ type: 'INIT', route: lastRoute, botId, authenticated: !!runtime.tokenStore.get() });
      return;
    }
    if (!ready || message.nonce !== nonce) return;
    if (message.type === 'NAVIGATE') {
      const next = safeRoute(message.route);
      lastRoute = next;
      onNavigate(next);
      return;
    }
    if (message.type !== 'REQUEST' || typeof message.id !== 'string' || message.id.length > 100) return;
    try {
      const data = await invoke(message.action, message.payload);
      send({ type: 'RESULT', id: message.id, ok: true, data });
    } catch (error) {
      send({ type: 'RESULT', id: message.id, ok: false, error: String(error?.message || 'request_failed') });
    }
  };
  window.addEventListener('message', onMessage);
  return Object.freeze({
    element: wrapper,
    route(next) { lastRoute = safeRoute(next); if (ready) send({ type: 'ROUTE', route: lastRoute }); },
    destroy() { alive = false; window.removeEventListener('message', onMessage); frame.src = 'about:blank'; },
  });
}
