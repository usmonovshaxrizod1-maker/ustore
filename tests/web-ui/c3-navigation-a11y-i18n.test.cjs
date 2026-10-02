const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..', '..');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

class FakeWindow {
  constructor(target = '/') {
    this.listeners = new Map();
    this._setTarget(target);
    this.history = {
      pushState: (_state, _title, next) => this._setTarget(next),
      replaceState: (_state, _title, next) => this._setTarget(next),
    };
  }
  _setTarget(target) {
    const url = new URL(target, 'https://shop.example');
    this.location = { pathname: url.pathname, search: url.search, hash: url.hash };
  }
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  removeEventListener(type, fn) { if (this.listeners.get(type) === fn) this.listeners.delete(type); }
  pop(target) { this._setTarget(target); this.listeners.get('popstate')?.({ type: 'popstate' }); }
}

class FakeFocusable {
  constructor(name) { this.name = name; this.focusCount = 0; this.attrs = {}; }
  focus() { this.focusCount += 1; this.ownerDocument.activeElement = this; }
  getAttribute(name) { return this.attrs[name] ?? null; }
}
class FakeContainer extends FakeFocusable {
  constructor(items, documentRef) {
    super('container');
    this.ownerDocument = documentRef;
    this.items = items;
    this.listeners = new Map();
    this.tabIndex = -1;
    for (const item of items) item.ownerDocument = documentRef;
  }
  querySelectorAll() { return this.items; }
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  removeEventListener(type, fn) { if (this.listeners.get(type) === fn) this.listeners.delete(type); }
  key(event) { this.listeners.get('keydown')?.(event); }
}

class FakeNode {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.dataset = {}; this.textContent = ''; this.className = ''; }
  append(...items) { this.children.push(...items); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener() {}
}
class FakeDocument { createElement(tag) { return new FakeNode(tag); } }

test('C3 route matcher restores deep links with params/query and marks unknown paths as 404', async () => {
  const { createRouteMatcher } = await import(moduleUrl('web/navigation/router.js'));
  const match = createRouteMatcher();
  const product = match('/product/sku%201?q=protein#details');
  assert.equal(product.found, true);
  assert.equal(product.route.id, 'product');
  assert.equal(product.params.productId, 'sku 1');
  assert.equal(product.search, '?q=protein');
  assert.equal(product.hash, '#details');
  const missing = match('/this-route-does-not-exist');
  assert.equal(missing.found, false);
  assert.equal(missing.route, null);
});

test('C3 router supports start/navigate/back-forward refresh semantics without external redirects', async () => {
  const { createRouter, normalizeInternalTarget } = await import(moduleUrl('web/navigation/router.js'));
  const windowRef = new FakeWindow('/catalog?q=shoe');
  const reasons = [];
  const router = createRouter({ windowRef, onChange: (_state, reason) => reasons.push(reason) });
  assert.equal(router.start().route.id, 'catalog');
  assert.equal(router.navigate('/cart').route.id, 'cart');
  windowRef.pop('/admin/orders');
  assert.equal(router.getCurrent().route.id, 'admin-orders');
  assert.equal(router.refresh().route.id, 'admin-orders');
  assert.deepEqual(reasons, ['start', 'navigate', 'popstate', 'refresh']);
  assert.throws(() => normalizeInternalTarget('//evil.example/login'), /same-origin relative/);
  assert.throws(() => normalizeInternalTarget('https://evil.example'), /same-origin relative/);
  router.destroy();
});

test('C3 not-found view exposes an explicit route-state marker', async () => {
  const { createNotFoundView } = await import(moduleUrl('web/navigation/not-found.js'));
  const panel = createNotFoundView({}, new FakeDocument());
  assert.equal(panel.dataset.routeState, 'not-found');
});

test('C3 focus trap cycles Tab, handles Escape, and restores opener focus', async () => {
  const { createFocusTrap } = await import(moduleUrl('web/a11y/focus-trap.js'));
  const documentRef = { activeElement: null };
  const opener = new FakeFocusable('opener'); opener.ownerDocument = documentRef; documentRef.activeElement = opener;
  const first = new FakeFocusable('first');
  const last = new FakeFocusable('last');
  const container = new FakeContainer([first, last], documentRef);
  let escaped = 0;
  const trap = createFocusTrap(container, { documentRef, onEscape: () => { escaped += 1; } });
  trap.activate();
  assert.equal(documentRef.activeElement, first);
  documentRef.activeElement = last;
  let prevented = 0;
  container.key({ key: 'Tab', shiftKey: false, preventDefault: () => { prevented += 1; } });
  assert.equal(documentRef.activeElement, first);
  documentRef.activeElement = first;
  container.key({ key: 'Tab', shiftKey: true, preventDefault: () => { prevented += 1; } });
  assert.equal(documentRef.activeElement, last);
  container.key({ key: 'Escape', preventDefault: () => { prevented += 1; } });
  assert.equal(escaped, 1);
  assert.equal(prevented, 3);
  trap.deactivate();
  assert.equal(documentRef.activeElement, opener);
});

test('C3 UZ/RU dictionaries share required navigation keys and translator falls back safely', async () => {
  const { WEB_DICTIONARIES, createTranslator } = await import(moduleUrl('web/i18n/index.js'));
  const required = ['nav.home', 'nav.catalog', 'nav.cart', 'nav.profile', 'route.notFound.title'];
  for (const key of required) {
    assert.equal(typeof WEB_DICTIONARIES.uz[key], 'string');
    assert.equal(typeof WEB_DICTIONARIES.ru[key], 'string');
  }
  const t = createTranslator('ru');
  assert.equal(t.t('nav.home'), 'Главная');
  t.setLocale('unknown');
  assert.equal(t.locale, 'uz');
  assert.equal(t.t('nav.home'), 'Bosh sahifa');
});

test('C3 shell defaults include real internal hrefs for native keyboard/link behavior', async () => {
  const customerSource = require('node:fs').readFileSync(path.join(root, 'web/shells/customer.js'), 'utf8');
  const adminSource = require('node:fs').readFileSync(path.join(root, 'web/shells/admin.js'), 'utf8');
  const sharedSource = require('node:fs').readFileSync(path.join(root, 'web/shells/shared.js'), 'utf8');
  assert.match(customerSource, /href:\s*'\/catalog'/);
  assert.match(adminSource, /href:\s*'\/admin\/products'/);
  assert.match(sharedSource, /createElement\(hasHref \? 'a' : 'button'\)/);
  assert.match(sharedSource, /event\?\.preventDefault\?\.\(\)/);
});
