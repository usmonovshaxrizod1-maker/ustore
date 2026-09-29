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
    { id:'home', label:tr.t('nav.home', 'Bosh sahifa'), href:'/' },
    { id:'catalog', label:tr.t('nav.catalog', 'Katalog'), href:'/catalog' },
    { id:'promotions', label:tr.t('nav.promotions', 'Aksiyalar'), href:'/promotions' },
    { id:'orders', label:tr.t('nav.orders', 'Buyurtmalar'), href:'/orders' },
  ]) desktopNav.append(createNavLink(item, { activeId:activeNav, onNavigate }, doc));
  headerInner.append(desktopNav);

  const actions = doc.createElement('div');
  actions.className = 'uw-customer-header__actions';
  const languages = doc.createElement('div'); languages.className = 'uw-customer-language'; languages.setAttribute('aria-label', 'Til / Язык');
  for (const language of ['uz', 'ru']) {
    const choice = createShellButton({ label: language.toUpperCase(), className: 'uw-customer-language__choice', onClick: () => onLocaleChange?.(language) }, doc);
    choice.dataset.active = locale === language ? 'true' : 'false'; choice.setAttribute('aria-pressed', locale === language ? 'true' : 'false'); languages.append(choice);
  }
  actions.append(languages);
  const accountLabel = context.actor?.displayName || tr.t('shell.signIn', 'Kirish');
  actions.append(
    createShellButton({ label: accountLabel, className: 'uw-shell-action', onClick: onOpenAccount }, doc),
    createShellButton({ label: tr.t('nav.cart', 'Savat'), className: 'uw-shell-action uw-shell-action--primary', onClick: onOpenCart }, doc),
  );
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
  const mobileSearch = createShellButton({ label: '⌕', className: 'uw-shell-icon-button', onClick: () => onNavigate?.({ id: 'search', label: tr.t('shell.search', 'Qidirish') }) }, doc);
  mobileSearch.setAttribute('aria-label', tr.t('shell.search', 'Qidirish'));
  const mobileAccount = createShellButton({ label: '○', className: 'uw-shell-icon-button', onClick:onOpenAccount }, doc);
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
