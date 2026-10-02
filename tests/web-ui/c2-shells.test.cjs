const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

class FakeStyle {
  setProperty(name, value) { this[name] = String(value); }
}
class FakeNode {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.style = new FakeStyle();
    this.className = '';
    this.textContent = '';
    this.listeners = {};
    this.value = '';
  }
  append(...items) { this.children.push(...items); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, fn) { this.listeners[type] = fn; }
}
class FakeDocument { createElement(tag) { return new FakeNode(tag); } }

async function shells() { return import(moduleUrl('web/shells/index.js')); }
function flatten(node) {
  const output = [node];
  for (const child of node.children || []) output.push(...flatten(child));
  return output;
}

const guest = json('web/fixtures/context/guest-active.json');
const owner = json('web/fixtures/context/owner-active.json');
const manager = json('web/fixtures/context/manager-active.json');

test('C2 stylesheet is isolated, imported, and contains desktop/mobile shell breakpoints', () => {
  const index = read('web/styles/index.css');
  const css = read('web/styles/shells.css');
  assert.match(index, /shells\.css/);
  assert.match(css, /\.uw-customer-header/);
  assert.match(css, /\.uw-admin-sidebar/);
  assert.match(css, /max-width:\s*63\.999rem/);
  assert.match(css, /max-width:\s*47\.999rem/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.doesNotMatch(css, /(^|\n)\s*(body|html)\s*\{/m);
});

test('customer shell takes shop name from context and keeps guest sign-in CTA', async () => {
  const { createCustomerShell } = await shells();
  const doc = new FakeDocument();
  const shell = createCustomerShell({ context: guest }, doc);
  const nodes = flatten(shell.element);
  assert.equal(shell.element.dataset.shell, 'customer');
  assert.ok(nodes.some((node) => node.textContent === 'Fitcore Demo'));
  assert.ok(nodes.some((node) => node.textContent === 'Kirish'));
  assert.equal(shell.bottomNav.attributes['aria-label'], 'Asosiy navigatsiya');
});

test('owner mobile nav includes orders and permissioned warehouse with active state', async () => {
  const { createCustomerShell } = await shells();
  const doc = new FakeDocument();
  const shell = createCustomerShell({ context: owner, activeNav: 'cart' }, doc);
  const navItems = flatten(shell.bottomNav).filter((node) => node.className === 'uw-nav-item');
  assert.equal(navItems.length, 6);
  assert.ok(navItems.some((node) => node.dataset.navId === 'orders'));
  assert.ok(navItems.some((node) => node.dataset.navId === 'warehouse'));
  assert.equal(navItems.filter((node) => node.dataset.active === 'true').length, 1);
  assert.equal(navItems.find((node) => node.dataset.active === 'true').dataset.navId, 'cart');
});

test('customer shell accepts an explicit safe brand accent without inventing backend fields', async () => {
  const { createCustomerShell } = await shells();
  const doc = new FakeDocument();
  const shell = createCustomerShell({ context: owner, branding: { accent: '#123456' } }, doc);
  assert.equal(shell.element.style['--uw-shop-accent'], '#123456');
});

test('admin shell uses actor permissions to hide unavailable navigation', async () => {
  const { createAdminShell } = await shells();
  const doc = new FakeDocument();
  const navItems = [
    { id: 'orders', label: 'Buyurtmalar', permission: 'orders.view' },
    { id: 'domains', label: 'Domenlar', permission: 'domains.manage' },
  ];
  const shell = createAdminShell({ context: manager, navItems }, doc);
  assert.deepEqual(shell.visibleNavItems.map((item) => item.id), ['orders', 'domains']);
});

test('owner wildcard permission can see permission-scoped admin navigation', async () => {
  const { createAdminShell } = await shells();
  const doc = new FakeDocument();
  const navItems = [
    { id: 'products', label: 'Mahsulotlar', permission: 'products.manage' },
    { id: 'domains', label: 'Domenlar', permission: 'domains.manage' },
  ];
  const shell = createAdminShell({ context: owner, navItems }, doc);
  assert.deepEqual(shell.visibleNavItems.map((item) => item.id), ['products', 'domains']);
});

test('admin mobile drawer starts closed and controller keeps aria state synchronized', async () => {
  const { createAdminShell } = await shells();
  const doc = new FakeDocument();
  const shell = createAdminShell({ context: owner }, doc);
  assert.equal(shell.drawer.dataset.state, 'closed');
  assert.equal(shell.drawer.attributes['aria-hidden'], 'true');
  assert.equal(shell.menuButton.attributes['aria-expanded'], 'false');
  shell.setDrawerOpen(true);
  assert.equal(shell.drawer.dataset.state, 'open');
  assert.equal(shell.drawer.attributes['aria-hidden'], 'false');
  assert.equal(shell.menuButton.attributes['aria-expanded'], 'true');
  shell.setDrawerOpen(false);
  assert.equal(shell.drawer.dataset.state, 'closed');
  assert.equal(shell.menuButton.attributes['aria-expanded'], 'false');
});

test('admin shell refuses unauthenticated context instead of rendering fake admin', async () => {
  const { createAdminShell } = await shells();
  const doc = new FakeDocument();
  assert.throws(() => createAdminShell({ context: guest }, doc), /authenticated actor/);
});
