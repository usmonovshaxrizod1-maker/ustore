const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

class FakeNode {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.className = '';
    this.textContent = '';
    this.disabled = false;
    this.listeners = {};
  }
  append(...items) { this.children.push(...items); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, fn) { this.listeners[type] = fn; }
}
class FakeDocument { createElement(tag) { return new FakeNode(tag); } }

async function ui() { return import(moduleUrl('web/components/index.js')); }

test('C1 style entrypoint is isolated and imports token/base/component layers', () => {
  const index = read('web/styles/index.css');
  assert.match(index, /tokens\.css/);
  assert.match(index, /base\.css/);
  assert.match(index, /components\.css/);
  const base = read('web/styles/base.css');
  assert.match(base, /\.uw-root/);
  assert.doesNotMatch(base, /(^|\n)\s*(body|html)\s*\{/m);
});

test('semantic tokens include shop accent, readable state colors, spacing, radius and focus', () => {
  const css = read('web/styles/tokens.css');
  for (const token of [
    '--uw-shop-accent', '--uw-color-canvas', '--uw-color-surface', '--uw-color-text',
    '--uw-color-text-muted', '--uw-color-primary', '--uw-color-success', '--uw-color-warning',
    '--uw-color-danger', '--uw-color-focus', '--uw-space-4', '--uw-radius-md', '--uw-focus-ring',
  ]) assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('keyboard focus and reduced-motion fallback are explicit', () => {
  const base = read('web/styles/base.css');
  assert.match(base, /:focus-visible/);
  assert.match(base, /prefers-reduced-motion:\s*reduce/);
});

test('button exposes busy state without hiding its label', async () => {
  const { createButton } = await ui();
  const doc = new FakeDocument();
  const button = createButton({ label: 'Saqlash', busy: true }, doc);
  assert.equal(button.tagName, 'BUTTON');
  assert.equal(button.disabled, true);
  assert.equal(button.attributes['aria-busy'], 'true');
  assert.equal(button.children.at(-1).textContent, 'Saqlash');
});

test('field keeps a real label and wires error/help ids to aria-describedby', async () => {
  const { createTextField } = await ui();
  const doc = new FakeDocument();
  const field = createTextField({ id: 'login', label: 'Login', help: 'Telegram orqali olinadi', error: 'Login noto‘g‘ri' }, doc);
  assert.equal(field.label.htmlFor, 'login');
  assert.equal(field.input.attributes['aria-invalid'], 'true');
  assert.equal(field.input.attributes['aria-describedby'], 'login-help login-error');
});

test('danger toast is assertive while normal toast is polite', async () => {
  const { createToast } = await ui();
  const doc = new FakeDocument();
  const danger = createToast({ tone: 'danger', message: 'Saqlanmadi' }, doc);
  const success = createToast({ tone: 'success', message: 'Saqlandi' }, doc);
  assert.equal(danger.attributes.role, 'alert');
  assert.equal(danger.attributes['aria-live'], 'assertive');
  assert.equal(success.attributes.role, 'status');
  assert.equal(success.attributes['aria-live'], 'polite');
});

test('state component distinguishes error semantics and skeleton has accessible loading state', async () => {
  const { createStatePanel, createSkeleton } = await ui();
  const doc = new FakeDocument();
  const state = createStatePanel({ kind: 'error', title: 'Yuklab bo‘lmadi', actionLabel: 'Qayta urinish' }, doc);
  const skeleton = createSkeleton({}, doc);
  assert.equal(state.attributes.role, 'alert');
  assert.equal(state.dataset.kind, 'error');
  assert.equal(skeleton.attributes.role, 'status');
  assert.equal(skeleton.attributes['aria-label'], 'Yuklanmoqda');
});
