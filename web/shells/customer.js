import { applyBrandAccent, createBrand, createNavLink, createShellButton } from './shared.js';
import { createTranslator } from '../i18n/index.js';

const DEFAULT_MOBILE_NAV = [
  { id: 'home', labelKey: 'nav.home', fallback: 'Bosh sahifa', iconText: '⌂', href: '/' },
  { id: 'catalog', labelKey: 'nav.catalog', fallback: 'Katalog', iconText: '▦', href: '/catalog' },
  { id: 'cart', labelKey: 'nav.cart', fallback: 'Savat', iconText: '◫', href: '/cart' },
  { id: 'profile', labelKey: 'nav.profile', fallback: 'Profil', iconText: '○', href: '/profile' },
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
    onSearch,
    onNavigate,
    onOpenCart,
    onOpenAccount,
    mobileNavItems = null,
    locale = 'uz',
  } = options;
  const tr = createTranslator(locale);
  const navItems = mobileNavItems || DEFAULT_MOBILE_NAV.map((item) => ({ ...item, label: tr.t(item.labelKey, item.fallback) }));
  if (!context?.shop) throw new Error('Customer shell requires a resolved shop context.');

  const root = doc.createElement('div');
  root.className = 'uw-root uw-shell uw-customer-shell';
  root.dataset.shell = 'customer';
  applyBrandAccent(root, branding.accent);

  const header = doc.createElement('header');
  header.className = 'uw-customer-header';
  const headerInner = doc.createElement('div');
  headerInner.className = 'uw-customer-header__inner';
  headerInner.append(createBrand(context, {}, doc));

  const search = doc.createElement('form');
  search.className = 'uw-customer-search';
  search.setAttribute('role', 'search');
  const searchLabel = doc.createElement('label');
  searchLabel.className = 'uw-sr-only';
  searchLabel.htmlFor = 'uw-customer-search-input';
  searchLabel.textContent = tr.t('shell.searchProducts', 'Mahsulotlarni qidirish');
  const searchInput = doc.createElement('input');
  searchInput.id = 'uw-customer-search-input';
  searchInput.name = 'q';
  searchInput.type = 'search';
  searchInput.className = 'uw-customer-search__input';
  searchInput.placeholder = tr.t('shell.searchPlaceholder', 'Mahsulotlarni qidiring');
  const searchButton = createShellButton({ label: tr.t('shell.search', 'Qidirish'), className: 'uw-customer-search__button' }, doc);
  search.append(searchLabel, searchInput, searchButton);
  if (typeof onSearch === 'function') {
    search.addEventListener('submit', (event) => {
      event?.preventDefault?.();
      onSearch(searchInput.value || '');
    });
  }
  headerInner.append(search);

  const actions = doc.createElement('div');
  actions.className = 'uw-customer-header__actions';
  const accountLabel = context.actor?.displayName || tr.t('shell.signIn', 'Kirish');
  actions.append(
    createShellButton({ label: accountLabel, className: 'uw-shell-action', onClick: onOpenAccount }, doc),
    createShellButton({ label: tr.t('nav.cart', 'Savat'), className: 'uw-shell-action uw-shell-action--primary', onClick: onOpenCart }, doc),
  );
  headerInner.append(actions);
  header.append(headerInner);

  const mobileHeader = doc.createElement('header');
  mobileHeader.className = 'uw-customer-mobile-header';
  mobileHeader.append(
    createBrand(context, { compact: true }, doc),
    createShellButton({ label: tr.t('shell.search', 'Qidirish'), className: 'uw-shell-icon-button', onClick: () => onNavigate?.({ id: 'search', label: tr.t('shell.search', 'Qidirish') }) }, doc),
  );

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
  return { element: root, searchInput, main, bottomNav };
}
