// First-paint branding for production web. This runs before the module graph so
// a managed shop subdomain never flashes the generic platform loading copy.
(() => {
  try {
    const normalize = (value) => String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/:\d+$/, '').replace(/\.$/, '');
    const host = normalize(globalThis.location?.hostname);
    const base = normalize(globalThis.APP_CONFIG?.USTORE_BASE_HOSTNAME);
    if (!host || !base || host === base || host === `www.${base}` || host === 'localhost' || host === '127.0.0.1' || /(?:^|\.)(?:github\.io|pages\.dev)$/.test(host)) return;
    let alreadyEntered = false;
    try { alreadyEntered = globalThis.sessionStorage?.getItem(`ustore:shop:entered:${host}`) === '1'; } catch (_) {}
    if (alreadyEntered) {
      globalThis.__USTORE_SHOP_LAUNCH_SKIP__ = true;
      document.querySelector('#ustore-web-app')?.replaceChildren();
      return;
    }
    const rawSlug = host.endsWith(`.${base}`) ? host.slice(0, -(base.length + 1)).split('.').at(-1) : host.split('.')[0];
    let cached = null;
    try { cached = JSON.parse(globalThis.localStorage?.getItem(`ustore:shop:brand:${host}`) || 'null'); } catch (_) {}
    const name = String(cached?.name || '').trim() || rawSlug.split('-').filter(Boolean).map((part) => part ? part[0].toUpperCase() + part.slice(1) : '').join(' ') || 'Do‘kon';
    const root = document.querySelector('#ustore-web-app .uw-launch');
    if (!root) return;
    root.classList.remove('uw-launch--platform'); root.classList.add('uw-launch--shop');
    if (!cached?.logoUrl) root.dataset.awaitBrand = 'true';
    const mark = root.querySelector('.uw-launch__monogram'); if (mark) mark.remove();
    const eyebrow = root.querySelector('.uw-launch__eyebrow'); if (eyebrow) eyebrow.remove();
    if (cached?.logoUrl && /^https:\/\//i.test(cached.logoUrl)) {
      const logo = document.createElement('img'); logo.className = 'uw-launch__logo'; logo.src = cached.logoUrl; logo.alt = '';
      logo.addEventListener('error', () => logo.remove(), { once: true });
      root.querySelector('.uw-launch__brand')?.prepend(logo);
    }
    const title = root.querySelector('.uw-launch__brand-copy h1'); if (title) title.textContent = `${name}’ga xush kelibsiz`;
    root.querySelector('.uw-launch__loader')?.remove();
    root.querySelector('.uw-launch__message')?.remove();
    root.querySelector('.uw-launch__foot')?.remove();
  } catch (_) {}
})();
