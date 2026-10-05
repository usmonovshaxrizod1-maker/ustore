const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..', '..');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

class Node {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.dataset = {}; this.listeners = {}; this.className = ''; this.textContent = ''; this.value = ''; this.style = {}; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = [...items]; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(key, handler) { this.listeners[key] = handler; }
}
class Doc { createElement(tag) { return new Node(tag); } }
const flat = (node) => [node, ...(node.children || []).flatMap(flat)];
const findClass = (node, className) => flat(node).find((item) => item.className.split(' ').includes(className));
const buttons = (node) => flat(node).filter((item) => item.tagName === 'BUTTON');
const owner = { actor: { shopRole: 'OWNER' } };
const domain = { id: 's1', kind: 'SUBDOMAIN', hostname: 'demo.ustr.uz', status: 'ACTIVE', dnsStatus: 'VERIFIED', tlsStatus: 'ACTIVE', records: [] };

test('subdomain starts compact and expands its existing details on tap', async () => {
  const { createDomainsFeature } = await import(moduleUrl('web/features/domains/domains.js'));
  const feature = createDomainsFeature({ port: { list: async () => ({ ok: true, data: [domain] }), add: async () => ({}), verify: async () => ({}), setPrimary: async () => ({}), remove: async () => ({}) }, context: owner }, new Doc());
  await feature.load();
  let card = findClass(feature.element, 'uw-domain-card');
  assert.equal(findClass(card, 'uw-domain-card__body').hidden, true);
  const toggle = buttons(card)[0];
  assert.equal(toggle.attributes['aria-expanded'], 'false');
  toggle.listeners.click();
  card = findClass(feature.element, 'uw-domain-card');
  assert.equal(findClass(card, 'uw-domain-card__body').hidden, false);
  assert.equal(buttons(card)[0].attributes['aria-expanded'], 'true');
});

test('copied AI guide reflects the current public domain status and entered hostname', async () => {
  const { createDomainsFeature } = await import(moduleUrl('web/features/domains/domains.js'));
  const copied = [];
  const custom = { id: 'c1', kind: 'CUSTOM', hostname: 'www.demo.uz', status: 'PENDING_TLS', dnsStatus: 'VERIFIED', tlsStatus: 'PENDING', errorCode: 'ROUTING_DNS_PENDING', records: [{ type: 'CNAME', name: 'www.demo.uz', value: 'customers.ustr.uz', purpose: 'ROUTING' }], secret: 'MUST_NOT_COPY' };
  const port = { list: async () => ({ ok: true, data: [domain, custom] }), add: async () => ({}), verify: async () => ({}), setPrimary: async () => ({}), remove: async () => ({}) };
  const feature = createDomainsFeature({ port, context: owner, clipboard: { writeText: async (value) => copied.push(value) } }, new Doc());
  await feature.load();
  buttons(feature.element).find((button) => button.textContent === 'O‘z domenimni ulash').listeners.click();
  const input = flat(feature.element).find((item) => item.tagName === 'INPUT');
  input.value = 'demo.uz'; input.listeners.input();
  await buttons(feature.element).find((button) => button.textContent === 'AI yo‘riqnomasini nusxalash').listeners.click();
  assert.equal(copied.length, 1);
  for (const phrase of ['demo.uz', 'www.demo.uz', 'customers.ustr.uz', 'PENDING_TLS', 'ROUTING_DNS_PENDING', 'Har javobda faqat BITTA', 'www.domen.uz va domen.uz ikkita alohida']) assert.match(copied[0], new RegExp(phrase));
  assert.match(copied[0], /sotuvchini UStorE’ning Custom Hostnames sahifasiga kiritma/);
  assert.match(copied[0], /Bir xil _acme-challenge nomi ostida bir nechta alohida TXT qiymat/);
  assert.match(copied[0], /“Tekshirish” ilovadagi joriy holatni yangilaydi, lekin sertifikat chiqarishni qayta ishga tushirmaydi/);
  assert.doesNotMatch(copied[0], /MUST_NOT_COPY/);
});
