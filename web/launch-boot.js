// First-paint branding for production web. This runs before the module graph so
// a managed shop subdomain never flashes the generic platform loading copy.
(() => {
  try {
    const normalize = (value) => String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/:\d+$/, '').replace(/\.$/, '');
    const host = normalize(globalThis.location?.hostname);
    const base = normalize(globalThis.APP_CONFIG?.USTORE_BASE_HOSTNAME);
    if (!host || !base || host === base || host === `www.${base}` || !host.endsWith(`.${base}`)) return;
    const rawSlug = host.slice(0, -(base.length + 1)).split('.').at(-1) || '';
    const name = rawSlug.split('-').filter(Boolean).map((part) => part ? part[0].toUpperCase() + part.slice(1) : '').join(' ') || 'Do‘kon';
    const root = document.querySelector('#ustore-web-app .uw-launch');
    if (!root) return;
    root.classList.remove('uw-launch--platform'); root.classList.add('uw-launch--shop');
    const mark = root.querySelector('.uw-launch__monogram'); if (mark) mark.textContent = (name[0] || 'D').toUpperCase();
    const eyebrow = root.querySelector('.uw-launch__eyebrow'); if (eyebrow) eyebrow.textContent = 'USTORE SHOP';
    const title = root.querySelector('.uw-launch__brand-copy h1'); if (title) title.textContent = `${name}’ga xush kelibsiz`;
    const message = root.querySelector('.uw-launch__message'); if (message) message.textContent = 'Do‘kon tayyorlanmoqda…';
    const foot = root.querySelector('.uw-launch__foot'); if (foot) foot.textContent = 'Mahsulotlar va do‘kon ma’lumotlari yuklanmoqda';
  } catch (_) {}
})();
