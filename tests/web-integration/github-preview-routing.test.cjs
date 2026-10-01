const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const routerModule = () => import(pathToFileURL(path.join(root, 'web/navigation/router.js')).href);
function fakeWindow(initial = '/ustore/web/') {
  const listeners = new Map();
  const origin = 'https://usmonovshaxrizod1-maker.github.io';
  const state = { location: new URL(initial, origin), addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name) { listeners.delete(name); } };
  state.history = {
    pushState(_state, _title, target) { state.location = new URL(target, state.location.origin); },
    replaceState(_state, _title, target) { state.location = new URL(target, state.location.origin); },
  };
  state.fire = (name) => listeners.get(name)?.();
  return state;
}
test('GitHub Pages preview uses its exact directory, preserves bot_id and survives browser history', async () => {
  const {createRouter}=await routerModule();
  const w=fakeWindow('/ustore/web/?bot_id=123');
  const r=createRouter({windowRef:w,previewBase:'/ustore/web/'});
  assert.equal(r.start().route.id,'home');
  assert.equal(r.navigate('/catalog?q=protein').route.id,'catalog');
  assert.equal(w.location.href,'https://usmonovshaxrizod1-maker.github.io/ustore/web/?bot_id=123#/catalog?q=protein');
  w.location = new URL('/ustore/web/?bot_id=123#/cart',w.location.origin);
  assert.equal(r.refresh().route.id,'cart');
  assert.equal(r.replace('/platform/login').route.id,'platform-login');
  assert.equal(w.location.pathname,'/ustore/web/');
  r.destroy();
});
test('custom hostname and central domain retain ordinary clean URLs', async () => {
  const {createRouter}=await routerModule();
  const w=fakeWindow('https://fitcore.ustr.uz/catalog');
  const r=createRouter({windowRef:w,previewBase:''});
  assert.equal(r.start().route.id,'catalog');
  r.navigate('/product/p1');
  assert.equal(w.location.href,'https://fitcore.ustr.uz/product/p1');
  r.destroy();
});
test('preview assets are relative and the only source copy is web/', () => {
  const html=fs.readFileSync(path.join(root,'web/index.html'),'utf8');
  for (const name of ['./app.js','./config.public.js','./styles/index.css']) assert.ok(html.includes(name));
  assert.match(fs.readFileSync(path.join(root,'config.public.js'),'utf8'),/USTORE_BASE_HOSTNAME:\s*"ustr\.uz"/);
});
