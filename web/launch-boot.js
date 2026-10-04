// First-paint host detection. This file runs after the initial shell and before the deferred app module so
// a shop hostname never flashes the generic UStorE platform splash.
(() => {
  const normalize = (value) => String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/:\d+$/, '').replace(/\.$/, '');
  const host = normalize(globalThis.location?.hostname);
  const base = normalize(globalThis.APP_CONFIG?.USTORE_BASE_HOSTNAME);
  const isLocal = !host || host === 'localhost' || host === '127.0.0.1' || /(?:^|\.)(?:github\.io|pages\.dev)$/.test(host);
  const isCentral = !!base && (host === base || host === `www.${base}`);
  const isShop = !isLocal && !isCentral && globalThis.location?.pathname !== '/auth/handoff';

  try { document.documentElement.dataset.ustoreHost = isShop ? 'shop' : 'platform'; } catch (_) {}

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
      if (!isShop) return;

      let alreadyEntered = false;
      try { alreadyEntered = globalThis.sessionStorage?.getItem(`ustore:shop:entered:${host}`) === '1'; } catch (_) {}
      if (alreadyEntered) globalThis.__USTORE_SHOP_LAUNCH_SKIP__ = true;

      const rawSlug = base && host.endsWith(`.${base}`) ? host.slice(0, -(base.length + 1)).split('.').at(-1) : host.split('.')[0];
      let cached = null;
      try { cached = JSON.parse(globalThis.localStorage?.getItem(`ustore:shop:brand:${host}`) || 'null'); } catch (_) {}
      const name = String(cached?.name || '').trim() || rawSlug.split('-').filter(Boolean).map((part) => part ? part[0].toUpperCase() + part.slice(1) : '').join(' ') || 'Do‘kon';

      const shell = document.querySelector('#ustore-web-app .uw-shop-first-paint');
      if (!shell) return;
      const title = shell.querySelector('strong');
      if (title) title.textContent = name;
      const logoHost = shell.querySelector('.uw-shop-first-paint__logo');
      if (cached?.logoUrl && /^https:\/\//i.test(cached.logoUrl) && logoHost && !logoHost.querySelector('img')) {
        const img = document.createElement('img');
        img.src = cached.logoUrl;
        img.alt = '';
        img.addEventListener('error', () => img.remove(), { once: true });
        logoHost.append(img);
      }
    } catch (_) {}
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hydrate, { once: true });
  else hydrate();
})();
