// Runs before the existing Mini App script. Telegram launches never enter this
// branch; browser sessions live only in the embedding Web app's origin.
(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('web_frame') !== '1' || window.Telegram?.WebApp?.initData) return;
  if (window.parent === window) return;

  const kind = location.pathname.includes('/platform/') ? 'platform' : 'shop';
  const pending = new Map();
  let parentOrigin = '';
  let nonce = '';
  let initialRoute = '/';
  let authenticated = false;
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  const safeOrigin = (origin) => {
    try {
      const url = new URL(origin);
      return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
    } catch { return false; }
  };
  function applyRoute(target) {
    if (typeof window.USTORE_APPLY_WEB_ROUTE === 'function') window.USTORE_APPLY_WEB_ROUTE(target);
  }
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || !safeOrigin(event.origin)) return;
    const message = event.data;
    if (!message || message.bridge !== 'ustore-miniapp-v1') return;
    if (message.type === 'INIT' && !parentOrigin && message.kind === kind && typeof message.nonce === 'string' && message.nonce.length >= 24) {
      if (kind === 'shop' && String(message.botId || '') !== String(params.get('bot_id') || '')) return;
      parentOrigin = event.origin;
      nonce = message.nonce;
      initialRoute = String(message.route || '/');
      authenticated = message.authenticated === true;
      document.body.classList.add('ustore-browser-mode');
      resolveReady();
      return;
    }
    if (event.origin !== parentOrigin || message.nonce !== nonce) return;
    if (message.type === 'RESULT') {
      const task = pending.get(message.id);
      if (!task) return;
      pending.delete(message.id);
      clearTimeout(task.timer);
      if (message.ok) task.resolve(message.data);
      else {
        const error = new Error(String(message.error || 'request_failed'));
        error.details = message.details || null;
        task.reject(error);
      }
    } else if (message.type === 'ROUTE') {
      applyRoute(String(message.route || '/'));
    }
  });

  function request(action, payload = {}) {
    return ready.then(() => new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('request_timeout')); }, 50000);
      pending.set(id, { resolve, reject, timer });
      window.parent.postMessage({ bridge: 'ustore-miniapp-v1', type: 'REQUEST', kind, nonce, id, action, payload }, parentOrigin);
    }));
  }
  function navigate(route) {
    if (!parentOrigin || !String(route || '').startsWith('/')) return;
    window.parent.postMessage({ bridge: 'ustore-miniapp-v1', type: 'NAVIGATE', kind, nonce, route }, parentOrigin);
  }
  function appReady() {
    if (!parentOrigin) return;
    window.parent.postMessage({ bridge: 'ustore-miniapp-v1', type: 'APP_READY', kind, nonce }, parentOrigin);
  }
  window.USTORE_FRAME_BRIDGE = Object.freeze({ kind, ready, request, navigate, appReady, get initialRoute() { return initialRoute; }, get authenticated() { return authenticated; } });
  window.parent.postMessage({ bridge: 'ustore-miniapp-v1', type: 'HELLO', kind }, '*');
})();
