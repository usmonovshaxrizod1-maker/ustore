const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const start = js.indexOf('    function renderCardReplacementControls(method) {');
const end = js.indexOf('    function renderPaymentMethodSettings(method) {', start);
assert.ok(start > 0 && end > start, 'card editor code must be defined');
const src = js.slice(start, end);
function mockHarness({ saved = '8600 1111 2222 3333', replacement = '9860 0000 2222 4444', outcome = true, holder = 'New Owner' } = {}) {
  const savedCard = { id:'CARD', cardNumber: saved, cardHolder:'Old Owner', receiptRequired:false };
  const draftCard = { id:'CARD', cardNumber: replacement, cardHolder:holder, receiptRequired:true };
  const ctx = {
    cardReplacementEditorOpen: false, fulfillmentSavePending:false,
    fulfillmentConfig: { payments: { methods: [savedCard] } },
    paymentMethodConfig: (id) => id === 'CARD' ? draftCard : null,
    tr: (uz) => uz,
    escapeHtml: (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    renderFulfillmentBody: undefined,
    rerenderFulfillmentBody: () => { ctx.draws++; },
    draws:0,
    showAppNotice: (m) => ctx.notices.push(m), notices:[],
    saveFulfillmentSettings: async () => { ctx.saves++; return outcome; }, saves:0,
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { ctx, savedCard, draftCard };
}
test('card replacement exposes masked current card and explicit edit/save/cancel buttons', () => {
  const { ctx, draftCard } = mockHarness();
  const summary = ctx.renderCardReplacementControls(draftCard);
  assert.match(summary, /Kartani almashtirish/);
  assert.match(summary, /•••• •••• •••• 3333/);
  assert.ok(!summary.includes('8600 1111 2222 3333'), 'current card PAN is masked in summary');
  ctx.beginCardReplacement();
  const editing = ctx.renderCardReplacementControls(draftCard);
  assert.match(editing, /saveCardReplacement\(\)/);
  assert.match(editing, /cancelCardReplacement\(\)/);
  assert.match(editing, /oninput="setCardSetting\('cardNumber'/);
});
test('successful save confirms server before closing editor; preserves stored card until ack', async () => {
  const { ctx, savedCard, draftCard } = mockHarness();
  ctx.beginCardReplacement();
  await ctx.saveCardReplacement();
  assert.equal(ctx.saves, 1);
  assert.equal(ctx.cardReplacementEditorOpen, false);
  assert.equal(draftCard.cardNumber, '9860 0000 2222 4444');
  assert.equal(savedCard.cardNumber, '8600 1111 2222 3333');
});
test('failed save retains typed card and leaves editor open; cancel restores saved baseline', async () => {
  const { ctx, draftCard } = mockHarness({ outcome: false });
  ctx.beginCardReplacement();
  await ctx.saveCardReplacement();
  assert.equal(ctx.saves, 1);
  assert.equal(ctx.cardReplacementEditorOpen, true);
  assert.equal(draftCard.cardNumber, '9860 0000 2222 4444');
  ctx.cancelCardReplacement();
  assert.equal(ctx.cardReplacementEditorOpen, false);
  assert.equal(draftCard.cardNumber, '8600 1111 2222 3333');
});
test('invalid card details do not invoke server save', async () => {
  const { ctx } = mockHarness({ replacement: '123', holder:' ' });
  await ctx.saveCardReplacement();
  assert.equal(ctx.saves, 0);
  assert.equal(ctx.notices.length, 1);
});
test('desktop/tablet responsive layout is browser admin only', () => {
  assert.match(js, /fulfillmentDesktopWorkspace\('DELIVERY'/);
  assert.match(js, /fulfillmentDesktopWorkspace\('PAYMENTS'/);
  assert.match(js, /fc-fulfillment-choice-grid/);
  assert.match(js, /fc-delivery-config-grid/);
  assert.match(js, /fc-payment-settings-panel/);
  assert.match(css, /@media\(min-width:768px\)[\s\S]*?body\.ustore-browser-mode\.fc-admin-mode \.fc-fulfillment-workspace/);
  assert.match(css, /@media\(min-width:1150px\)[\s\S]*?\.fc-fulfillment-choice-grid\{grid-template-columns:repeat\(4,/);
  assert.match(css, /\.fc-fulfillment-desktop-sidebar\{display:none\}/);
  assert.match(css, /\.fc-icon-action-bar\.hidden\{display:none!important\}/);
  assert.match(html, /ustore\.css\?v=332/);
  assert.match(html, /ustore-shop-app\.js\?v=335/);
});
