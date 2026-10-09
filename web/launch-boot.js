// First-paint host detection. This file runs after the initial shell and before the deferred app module so
// a shop hostname never flashes the generic UStorE platform splash.
(() => {
  const normalize = (value) => String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/:\d+$/, '').replace(/\.$/, '');
  const host = normalize(globalThis.location?.hostname);
  const base = normalize(globalThis.APP_CONFIG?.USTORE_BASE_HOSTNAME);
  const isLocal = !host || host === 'localhost' || host === '127.0.0.1' || /(?:^|\.)(?:github\.io|pages\.dev)$/.test(host);
  const isCentral = !!base && (host === base || host === `www.${base}`);
  const isShop = !isLocal && !isCentral && globalThis.location?.pathname !== '/auth/handoff';

  // Start the API and Mini App connections while the entry module loads.
  for (const endpoint of [globalThis.APP_CONFIG?.SUPABASE_URL, 'https://usmonovshaxrizod1-maker.github.io']) {
    try {
      const url = new URL(endpoint);
      if (url.protocol !== 'https:') continue;
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = url.origin;
      link.crossOrigin = 'anonymous';
      document.head.append(link);
    } catch (_) {}
  }

  try { document.documentElement.dataset.ustoreHost = isShop ? 'shop' : 'platform'; } catch (_) {}
  const authEntry = /^\/(?:auth(?:\/|$)|platform\/login(?:\/|$)|profile(?:\/|$)|orders(?:\/|$)|signin(?:\/|$))/.test(globalThis.location?.pathname || '');
  if (authEntry) {
    try { document.documentElement.dataset.ustoreAuthTransition = 'true'; } catch (_) {}
  }

  const hydrate = () => {
    try {
      if (globalThis.location?.pathname === '/auth/handoff') {
        const title = document.querySelector('.uw-launch__brand-copy h1');
        const message = document.querySelector('.uw-launch__message');
        if (title) title.textContent = 'UStorE';
        if (message) message.textContent = 'Xavfsiz kirish tayyorlanmoqda…';
        document.querySelector('.uw-launch__foot')?.remove();
        return;
      }
      if (authEntry) {
        const status = document.querySelector('.uw-auth-transition');
        if (status) status.textContent = globalThis.location?.pathname?.startsWith('/auth/') ? 'Kirish yakunlanmoqda…' : globalThis.location?.pathname?.startsWith('/platform/login') ? 'Kirish sahifasi ochilmoqda…' : 'Sahifa ochilmoqda…';
      }
      if (!isShop) return;

      let alreadyEntered = false;
      try { alreadyEntered = globalThis.sessionStorage?.getItem(`ustore:shop:entered:${host}`) === '1'; } catch (_) {}
      if (alreadyEntered) globalThis.__USTORE_SHOP_LAUNCH_SKIP__ = true;

      const rawSlug = base && host.endsWith(`.${base}`) ? host.slice(0, -(base.length + 1)).split('.').at(-1) : host.split('.')[0];
      let cached = null;
      try { cached = JSON.parse(globalThis.localStorage?.getItem(`ustore:shop:brand:${host}`) || 'null'); } catch (_) {}
      const name = String(cached?.name || '').trim() || rawSlug.split('-').filter(Boolean).map((part) => part ? part[0].toUpperCase() + part.slice(1) : '').join(' ') || 'Do‘kon';

      const shell = document.querySelector('#ustore-web-app .uw-shop-opening');
      if (!shell) return;
      let locale = 'uz';
      try { locale = globalThis.localStorage?.getItem('ustore.web.locale') || 'uz'; } catch (_) {}
      globalThis.USTORE_SHOP_WELCOME?.update?.(shell, {name,logoUrl:cached?.logoUrl || null,theme:cached?.theme,locale});
    } catch (_) {}
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hydrate, { once: true });
  else hydrate();
})();
