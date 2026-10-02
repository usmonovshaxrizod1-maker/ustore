const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const load = (file) => import(pathToFileURL(path.join(root, file)).href);

test('live addLine sends one atomic mutation with the exact selected variant', async () => {
  const { createLiveShopPrivateAdapters } = await load('web/services/live/shop-private.js');
  const calls = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body); calls.push(body);
    if (body.action === 'web_cart_load') return { ok:true, status:200, json:async()=>({ cart:{ shopId:'shop-1', currency:'UZS', lines:[] } }) };
    if (body.action === 'web_cart_mutate') return { ok:true, status:200, json:async()=>({ cart:{ shopId:'shop-1', currency:'UZS', lines:[body.payload.line] } }) };
    throw new Error(`unexpected ${body.action}`);
  };
  const adapter = createLiveShopPrivateAdapters({ endpoint:'https://api.example/shop-api', botId:'123', fetchImpl, tokenStore:{get:()=> 'session',set(){}} });
  const result = await adapter.cart.addLine({ productId:'p1', size:'L', color:'Qora', variantId:'v-black-l', quantity:1, unitPrice:999999 });
  assert.equal(result.ok, true);
  assert.deepEqual(calls.map((call) => call.action), ['web_cart_mutate']);
  const sent = calls[0].payload.line;
  assert.equal(sent.productId, 'p1');
  assert.equal(sent.size, 'L');
  assert.equal(sent.color, 'Qora');
  assert.equal(sent.variantId, 'v-black-l');
  assert.equal(sent.quantity, 1);
});

test('product route replaces the temporary warning with cart controller mutation and feedback', () => {
  const source = fs.readFileSync(path.join(root, 'web/app.js'), 'utf8');
  const start = source.indexOf('async function renderProduct');
  const end = source.indexOf('async function renderCart', start);
  const block = source.slice(start, end);
  assert.match(block, /onAddToCart:\(line\)=>cartController\.addLine\(line\)/);
  assert.match(block, /await controller\.addToCart\(\)/);
  assert.match(block, /Savatga qo‘shildi/);
  assert.doesNotMatch(block, /Savatga qo‘shish vaqtincha yopiq/);
});
