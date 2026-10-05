import { applyBrandAccent, canAccess, createBrand, createNavLink, createShellButton } from './shared.js';
import { createTranslator } from '../i18n/index.js';

const DEFAULT_MOBILE_NAV = [
  { id: 'home', labelKey: 'nav.home', fallback: 'Bosh sahifa', iconName: 'home', href: '/' },
  { id: 'catalog', labelKey: 'nav.catalog', fallback: 'Kataloglar', iconName: 'folder', href: '/catalog' },
  { id: 'cart', labelKey: 'nav.cart', fallback: 'Savatcha', iconName: 'bag', href: '/cart' },
  { id: 'orders', labelKey: 'nav.orders', fallback: 'Buyurtmalar', iconName: 'package', href: '/orders' },
  { id: 'profile', labelKey: 'nav.profile', fallback: 'Profil', iconName: 'user', href: '/profile' },
];

function getDocument(documentRef) {
  const doc = documentRef || globalThis.document;
  if (!doc?.createElement) throw new Error('A document with createElement() is required.');
  return doc;
}


function languageFlagSvg(language) {
  if (language === 'ru') return '<svg class="uw-language-flag-svg" viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" rx="2" fill="#fff"/><rect y="6.667" width="30" height="6.667" fill="#1c57a7"/><rect y="13.334" width="30" height="6.666" fill="#d52b1e"/></svg>';
  return '<svg class="uw-language-flag-svg" viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" rx="2" fill="#1eb5e9"/><rect y="6.2" width="30" height="1" fill="#ce1126"/><rect y="7.2" width="30" height="5.6" fill="#fff"/><rect y="12.8" width="30" height="1" fill="#ce1126"/><rect y="13.8" width="30" height="6.2" fill="#1eb53a"/><circle cx="5.4" cy="4" r="2.15" fill="#fff"/><circle cx="6.2" cy="3.7" r="2.15" fill="#1eb5e9"/><g fill="#fff"><circle cx="9.2" cy="2.1" r=".45"/><circle cx="11" cy="2.1" r=".45"/><circle cx="12.8" cy="2.1" r=".45"/><circle cx="10.1" cy="3.7" r=".45"/><circle cx="11.9" cy="3.7" r=".45"/><circle cx="9.2" cy="5.25" r=".45"/><circle cx="11" cy="5.25" r=".45"/></g></svg>';
}

function shellActionIconSvg(name) {
  const paths = {
    search: ['M21 21l-4.35-4.35', 'M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0'],
    user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M4 21a8 8 0 0 1 16 0'],
  }[name] || [];
  return `<svg class="uw-shell-action-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths.map((d) => `<path d="${d}"></path>`).join('')}</svg>`;
}

function appendSlot(target, value) {
  if (value == null) return;
  if (Array.isArray(value)) target.append(...value);
  else target.append(value);
}

export function createCustomerShell(options = {}, documentRef) {
  const doc = getDocument(documentRef);
  const {
    context,
    activeNav = 'home',
    content,
    branding = {},
    onNavigate,
    onOpenCart,
    onOpenAccount,
    onOpenAdmin,
    hideAccountAction = false,
    mobileNavItems = null,
    locale = 'uz',
    onLocaleChange,
  } = options;
  const tr = createTranslator(locale);
  const navItems = mobileNavItems || DEFAULT_MOBILE_NAV.map((item) => ({ ...item, label: tr.t(item.labelKey, item.fallback) }));
  if (!context?.shop) throw new Error('Customer shell requires a resolved shop context.');
  if (!mobileNavItems && canAccess(context.actor, 'stock.view') && context.actor?.shopRole !== 'CUSTOMER') {
    navItems.splice(4, 0, { id: 'warehouse', label: tr.t('nav.warehouse', 'Ombor'), iconName: 'warehouse', href: '/admin/inventory' });
  }

  const root = doc.createElement('div');
  root.className = 'uw-root uw-shell uw-customer-shell';
  root.dataset.shell = 'customer';
  applyBrandAccent(root, branding.accent);

  const header = doc.createElement('header');
  header.className = 'uw-customer-header';
  const headerInner = doc.createElement('div');
  headerInner.className = 'uw-customer-header__inner';
  headerInner.append(createBrand(context, {}, doc));

  const desktopNav = doc.createElement('nav'); desktopNav.className = 'uw-customer-desktop-nav'; desktopNav.setAttribute('aria-label', 'Do‘kon bo‘limlari');
  for (const item of [
    { id:'home', label:tr.t('nav.home', 'Bosh sahifa'), iconName:'home', href:'/' },
    { id:'catalog', label:tr.t('nav.catalog', 'Katalog'), iconName:'folder', href:'/catalog' },
    { id:'promotions', label:tr.t('nav.promotions', 'Aksiyalar'), iconName:'gift', href:'/promotions' },
    { id:'orders', label:tr.t('nav.orders', 'Buyurtmalar'), iconName:'package', href:'/orders' },
  ]) desktopNav.append(createNavLink(item, { activeId:activeNav, onNavigate }, doc));
  headerInner.append(desktopNav);

  const actions = doc.createElement('div');
  actions.className = 'uw-customer-header__actions';
  const languages = doc.createElement('div'); languages.className = 'uw-customer-language'; languages.setAttribute('aria-label', 'Til / Язык');
  for (const language of ['uz', 'ru']) {
    const languageLabel = language === 'uz' ? 'O‘zbekcha' : 'Русский';
    const choice = createShellButton({ label: languageLabel, className: 'uw-customer-language__choice', onClick: () => onLocaleChange?.(language) }, doc);
    choice.innerHTML = languageFlagSvg(language);
    choice.setAttribute('aria-label', languageLabel);
    choice.title = languageLabel;
    choice.dataset.active = locale === language ? 'true' : 'false'; choice.setAttribute('aria-pressed', locale === language ? 'true' : 'false'); languages.append(choice);
  }
  actions.append(languages);
  const accountLabel = context.actor?.displayName || tr.t('shell.signIn', 'Kirish');
  if (!hideAccountAction) actions.append(createShellButton({ label: accountLabel, className: 'uw-shell-action', onClick: onOpenAccount }, doc));
  actions.append(createShellButton({ label: tr.t('nav.cart', 'Savat'), className: 'uw-shell-action uw-shell-action--primary', onClick: onOpenCart }, doc));
  if (typeof onOpenAdmin === 'function') actions.prepend(createShellButton({ label:'Boshqaruv', className:'uw-shell-action uw-shell-action--admin', onClick:onOpenAdmin }, doc));
  headerInner.append(actions);
  header.append(headerInner);

  const mobileHeader = doc.createElement('header');
  mobileHeader.className = 'uw-customer-mobile-header';
  mobileHeader.append(createBrand(context, { compact: true }, doc));
  const mobileActions = doc.createElement('div'); mobileActions.className = 'uw-customer-mobile-header__actions';
  if (typeof onOpenAdmin === 'function') mobileActions.append(createShellButton({ label:'ADMIN', className:'uw-customer-admin-badge', onClick:onOpenAdmin }, doc));
  const mobileLanguage = createShellButton({ label: locale.toUpperCase(), className: 'uw-shell-icon-button uw-customer-mobile-language', onClick: () => onLocaleChange?.(locale === 'uz' ? 'ru' : 'uz') }, doc);
  mobileLanguage.setAttribute('aria-label', locale === 'uz' ? 'Русский язык' : 'O‘zbek tili');
  const mobileSearch = createShellButton({ label: tr.t('shell.search', 'Qidirish'), className: 'uw-shell-icon-button', onClick: () => onNavigate?.({ id: 'search', label: tr.t('shell.search', 'Qidirish') }) }, doc);
  mobileSearch.innerHTML = shellActionIconSvg('search');
  mobileSearch.setAttribute('aria-label', tr.t('shell.search', 'Qidirish'));
  const mobileAccount = createShellButton({ label: tr.t('nav.profile', 'Profil'), className: 'uw-shell-icon-button', onClick:onOpenAccount }, doc);
  mobileAccount.innerHTML = shellActionIconSvg('user');
  mobileAccount.setAttribute('aria-label', tr.t('nav.profile', 'Profil'));
  mobileActions.append(mobileLanguage, mobileSearch, mobileAccount);
  mobileHeader.append(mobileActions);

  const main = doc.createElement('main');
  main.className = 'uw-shell-main uw-customer-main';
  main.id = 'uw-main-content';
  const contentInner = doc.createElement('div');
  contentInner.className = 'uw-shell-content';
  appendSlot(contentInner, content);
  main.append(contentInner);

  const footer = doc.createElement('footer');
  footer.className = 'uw-customer-footer';
  const footerInner = doc.createElement('div');
  footerInner.className = 'uw-customer-footer__inner';
  const footerBrand = createBrand(context, { compact: true }, doc);
  const footerText = doc.createElement('p');
  footerText.className = 'uw-customer-footer__text';
  footerText.textContent = tr.t('shell.poweredBy', 'UStorE orqali ishlaydi');
  footerInner.append(footerBrand, footerText);
  footer.append(footerInner);

  const bottomNav = doc.createElement('nav');
  bottomNav.className = 'uw-customer-bottom-nav';
  bottomNav.setAttribute('aria-label', tr.t('shell.mainNavigation', 'Asosiy navigatsiya'));
  for (const item of navItems) {
    bottomNav.append(createNavLink(item, { activeId: activeNav, onNavigate }, doc));
  }

  root.append(header, mobileHeader, main, footer, bottomNav);
  return { element: root, searchInput: null, main, bottomNav };
}
