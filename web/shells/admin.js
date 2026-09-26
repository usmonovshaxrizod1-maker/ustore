import { applyBrandAccent, canAccess, createBrand, createNavLink, createShellButton } from './shared.js';
import { createFocusTrap } from '../a11y/focus-trap.js';
import { createTranslator } from '../i18n/index.js';

const DEFAULT_ADMIN_NAV = [
  { id: 'overview', label: 'Boshqaruv', labelKey: 'nav.admin.overview', fallback: 'Boshqaruv', iconText: '⌂', permission: null, href: '/admin' },
  { id: 'products', label: 'Mahsulotlar', labelKey: 'nav.admin.products', fallback: 'Mahsulotlar', iconText: '▦', permission: 'products.manage', href: '/admin/products' },
  { id: 'inventory', label: 'Ombor', labelKey: 'nav.admin.inventory', fallback: 'Ombor', iconText: '▤', permission: 'stock.view', href: '/admin/inventory' },
  { id: 'orders', label: 'Buyurtmalar', labelKey: 'nav.admin.orders', fallback: 'Buyurtmalar', iconText: '≡', permission: 'orders.view', href: '/admin/orders' },
  { id: 'marketing', label: 'Marketing', labelKey: 'nav.admin.marketing', fallback: 'Marketing', iconText: '◇', permission: 'marketing.manage', href: '/admin/marketing' },
  { id: 'reports', label: 'Hisobotlar', labelKey: 'nav.admin.reports', fallback: 'Hisobotlar', iconText: '▥', permission: 'reports.view', href: '/admin/reports' },
  { id: 'team', label: 'Jamoa', labelKey: 'nav.admin.team', fallback: 'Jamoa', iconText: '♙', permissionsAny: ['staff.manage'], rolesAny: ['MANAGER'], href: '/admin/team' },
  { id: 'support', label: 'Yordam', labelKey: 'nav.admin.support', fallback: 'Yordam', iconText: '?', permission: 'support.manage', href: '/admin/support' },
  { id: 'settings', label: 'Sozlamalar', labelKey: 'nav.admin.settings', fallback: 'Sozlamalar', iconText: '⚙', permissionsAny: ['shop.settings.manage', 'integrations.manage'], href: '/admin/settings' },
  { id: 'domains', label: 'Domenlar', labelKey: 'nav.admin.domains', fallback: 'Domenlar', iconText: '◎', permission: 'domains.manage', href: '/admin/domains' },
];

function getDocument(documentRef) {
  const doc = documentRef || globalThis.document;
  if (!doc?.createElement) throw new Error('A document with createElement() is required.');
  return doc;
}

function visibleItems(items, actor) {
  return items.filter((item) => {
    const permissionMatch = Array.isArray(item.permissionsAny) && item.permissionsAny.length
      ? item.permissionsAny.some((permission) => canAccess(actor, permission))
      : item.permission !== undefined ? canAccess(actor, item.permission) : false;
    const roleCodes = Array.isArray(actor?.roleCodes) ? actor.roleCodes : [];
    const roleMatch = Array.isArray(item.rolesAny) && item.rolesAny.some((role) => roleCodes.includes(role));
    return permissionMatch || roleMatch;
  });
}

function appendSlot(target, value) {
  if (value == null) return;
  if (Array.isArray(value)) target.append(...value);
  else target.append(value);
}

function createAdminNav(items, options, doc) {
  const nav = doc.createElement('nav');
  nav.className = options.className || 'uw-admin-nav';
  nav.setAttribute('aria-label', options.label || 'Admin navigatsiyasi');
  for (const item of items) {
    nav.append(createNavLink(item, { activeId: options.activeNav, onNavigate: options.onNavigate }, doc));
  }
  return nav;
}

export function createAdminShell(options = {}, documentRef) {
  const doc = getDocument(documentRef);
  const {
    context,
    activeNav = 'overview',
    pageTitle = 'Boshqaruv',
    content,
    branding = {},
    onNavigate,
    onOpenAccount,
    navItems = null,
    locale = 'uz',
  } = options;
  const tr = createTranslator(locale);
  const resolvedNavItems = navItems || DEFAULT_ADMIN_NAV.map((item) => ({ ...item, label: tr.t(item.labelKey, item.fallback) }));
  if (!context?.shop) throw new Error('Admin shell requires a resolved shop context.');
  if (!context.actor) throw new Error('Admin shell requires an authenticated actor.');

  const items = visibleItems(resolvedNavItems, context.actor);
  const root = doc.createElement('div');
  root.className = 'uw-root uw-shell uw-admin-shell';
  root.dataset.shell = 'admin';
  applyBrandAccent(root, branding.accent);

  const sidebar = doc.createElement('aside');
  sidebar.className = 'uw-admin-sidebar';
  sidebar.append(
    createBrand(context, { subtitle: tr.t('shell.adminSubtitle', 'Boshqaruv paneli') }, doc),
    createAdminNav(items, { activeNav, onNavigate }, doc),
  );

  const workspace = doc.createElement('div');
  workspace.className = 'uw-admin-workspace';
  const topbar = doc.createElement('header');
  topbar.className = 'uw-admin-topbar';

  const menuButton = createShellButton({
    label: tr.t('shell.menu', 'Menyu'),
    className: 'uw-admin-menu-button',
    expanded: false,
    controls: 'uw-admin-drawer',
  }, doc);
  const heading = doc.createElement('div');
  heading.className = 'uw-admin-topbar__heading';
  const title = doc.createElement('h1');
  title.className = 'uw-admin-topbar__title';
  title.textContent = String(pageTitle);
  const shopName = doc.createElement('p');
  shopName.className = 'uw-admin-topbar__shop';
  shopName.textContent = context.shop.name;
  heading.append(title, shopName);

  const actorButton = createShellButton({
    label: context.actor.displayName || 'Profil',
    className: 'uw-shell-action',
    onClick: onOpenAccount,
  }, doc);
  topbar.append(menuButton, heading, actorButton);

  const main = doc.createElement('main');
  main.id = 'uw-main-content';
  main.className = 'uw-shell-main uw-admin-main';
  const contentInner = doc.createElement('div');
  contentInner.className = 'uw-admin-content';
  appendSlot(contentInner, content);
  main.append(contentInner);
  workspace.append(topbar, main);

  const overlay = doc.createElement('button');
  overlay.type = 'button';
  overlay.className = 'uw-admin-drawer-overlay';
  overlay.setAttribute('aria-label', tr.t('shell.closeMenu', 'Menyuni yopish'));
  overlay.setAttribute('aria-hidden', 'true');
  overlay.tabIndex = -1;

  const drawer = doc.createElement('aside');
  drawer.id = 'uw-admin-drawer';
  drawer.className = 'uw-admin-drawer';
  drawer.dataset.state = 'closed';
  drawer.setAttribute('aria-hidden', 'true');
  const drawerHeader = doc.createElement('div');
  drawerHeader.className = 'uw-admin-drawer__header';
  const closeButton = createShellButton({ label: tr.t('shell.close', 'Yopish'), className: 'uw-shell-action' }, doc);
  drawerHeader.append(createBrand(context, { compact: true }, doc), closeButton);
  drawer.append(drawerHeader, createAdminNav(items, { activeNav, onNavigate, label: tr.t('shell.mobileAdminNavigation', 'Mobil admin navigatsiyasi') }, doc));
  drawer.inert = true;
  const focusTrap = createFocusTrap(drawer, { documentRef: doc, onEscape: () => setDrawerOpen(false) });

  function setDrawerOpen(open) {
    const next = Boolean(open);
    drawer.dataset.state = next ? 'open' : 'closed';
    drawer.setAttribute('aria-hidden', next ? 'false' : 'true');
    drawer.inert = !next;
    overlay.dataset.state = next ? 'open' : 'closed';
    overlay.setAttribute('aria-hidden', next ? 'false' : 'true');
    menuButton.setAttribute('aria-expanded', next ? 'true' : 'false');
    if (next) focusTrap.activate();
    else focusTrap.deactivate({ restoreFocus: true });
  }
  menuButton.addEventListener('click', () => setDrawerOpen(true));
  closeButton.addEventListener('click', () => setDrawerOpen(false));
  overlay.addEventListener('click', () => setDrawerOpen(false));

  root.append(sidebar, workspace, overlay, drawer);
  return { element: root, main, sidebar, drawer, menuButton, setDrawerOpen, visibleNavItems: items };
}
