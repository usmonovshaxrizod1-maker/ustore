function getDocument(documentRef) {
  const doc = documentRef || globalThis.document;
  if (!doc?.createElement) throw new Error('A document with createElement() is required.');
  return doc;
}

function normalizeText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

export function canAccess(actor, permission) {
  if (!permission) return true;
  if (!actor) return false;
  const permissions = Array.isArray(actor.permissions) ? actor.permissions : [];
  return permissions.includes('*') || permissions.includes(permission);
}

export function createShellButton({ label, className = '', onClick, expanded, controls }, documentRef) {
  const doc = getDocument(documentRef);
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  if (expanded != null) button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  if (controls) button.setAttribute('aria-controls', controls);
  if (typeof onClick === 'function') button.addEventListener('click', onClick);
  return button;
}

export function createBrand(context, options = {}, documentRef) {
  const doc = getDocument(documentRef);
  const shop = context?.shop || {};
  const name = normalizeText(shop.name, 'UStorE');
  const brand = doc.createElement('div');
  brand.className = `uw-brand ${options.compact ? 'uw-brand--compact' : ''}`.trim();

  const mark = doc.createElement('span');
  mark.className = 'uw-brand__mark';
  mark.setAttribute('aria-hidden', 'true');

  if (shop.logoUrl) {
    const image = doc.createElement('img');
    image.className = 'uw-brand__logo';
    image.src = String(shop.logoUrl);
    image.alt = '';
    image.width = 96;
    image.height = 96;
    image.loading = 'eager';
    image.decoding = 'async';
    image.fetchPriority = 'high';
    image.referrerPolicy = 'no-referrer';
    mark.append(image);
  } else {
    const initial = Array.from(name)[0] || 'U';
    mark.textContent = initial.toUpperCase();
  }

  const copy = doc.createElement('span');
  copy.className = 'uw-brand__copy';
  const title = doc.createElement('span');
  title.className = 'uw-brand__name';
  title.textContent = name;
  copy.append(title);
  if (options.subtitle) {
    const subtitle = doc.createElement('span');
    subtitle.className = 'uw-brand__subtitle';
    subtitle.textContent = String(options.subtitle);
    copy.append(subtitle);
  }

  brand.append(mark, copy);
  return brand;
}

export function createNavLink(item, { activeId = '', onNavigate } = {}, documentRef) {
  const doc = getDocument(documentRef);
  const hasHref = typeof item.href === 'string' && item.href.startsWith('/') && !item.href.startsWith('//');
  const control = doc.createElement(hasHref ? 'a' : 'button');
  if (hasHref) control.href = item.href;
  else control.type = 'button';
  control.className = 'uw-nav-item';
  control.dataset.navId = String(item.id || '');
  if (String(item.id || '') === String(activeId || '')) {
    control.dataset.active = 'true';
    control.setAttribute('aria-current', 'page');
  }

  if (item.iconText) {
    const icon = doc.createElement('span');
    icon.className = 'uw-nav-item__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = String(item.iconText);
    control.append(icon);
  }
  const label = doc.createElement('span');
  label.className = 'uw-nav-item__label';
  label.textContent = String(item.label || '');
  control.append(label);
  if (typeof onNavigate === 'function') {
    control.addEventListener('click', (event) => {
      if (hasHref) event?.preventDefault?.();
      onNavigate(item);
    });
  }
  return control;
}

export function applyBrandAccent(root, accent) {
  if (!accent || !root?.style) return;
  const value = String(accent).trim();
  // Only accept simple CSS colors. Provider/backend remains authoritative for stored branding values.
  if (/^#[0-9a-f]{3,8}$/i.test(value) || /^(rgb|hsl)a?\([^)]+\)$/i.test(value)) {
    if (typeof root.style.setProperty === 'function') root.style.setProperty('--uw-shop-accent', value);
    else root.style['--uw-shop-accent'] = value;
  }
}
