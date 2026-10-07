const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const url = (file) => pathToFileURL(path.join(root, file)).href;

class FakeNode {
  constructor(tag='div') { this.tagName=String(tag).toUpperCase(); this.children=[]; this.attributes={}; this.dataset={}; this.style={}; this.className=''; this.textContent=''; this.hidden=false; this.listeners={}; this.width=0; this.height=0; this.loading=''; this.decoding=''; this.fetchPriority=''; this.referrerPolicy=''; this.src=''; this.alt=''; }
  append(...items){ this.children.push(...items); }
  replaceChildren(...items){ this.children=[...items]; }
  setAttribute(name,value){ this.attributes[name]=String(value); }
  getAttribute(name){ return this.attributes[name] ?? null; }
  addEventListener(type,fn){ this.listeners[type]=fn; }
}
class FakeDocument { createElement(tag){ return new FakeNode(tag); } }
function flatten(node){ return [node,...(node.children||[]).flatMap(flatten)]; }

test('O2 production runtime/auth features are deferred instead of being static initial dependencies', () => {
  const app = read('web/app.js');
  assert.doesNotMatch(app, /^import .*runtime\/production\.js/m);
  assert.doesNotMatch(app, /^import .*features\/auth\/(?:login|origin-handoff)\.js/m);
  assert.match(app, /import\('\.\/runtime\/production\.js(?:\?v=[^']+)?'\)/);
  assert.match(app, /import\('\.\/features\/auth\/login\.js(?:\?v=[^']+)?'\)/);
  assert.match(app, /import\('\.\/features\/auth\/origin-handoff\.js(?:\?v=[^']+)?'\)/);
});

test('O2 route modules remain lazy and platform routes get a delayed slow-network state', () => {
  const app = read('web/app.js');
  for (const feature of ['platform-home','home','catalog','product','cart','checkout','orders','profile','support']) {
    assert.match(app, new RegExp(`import\\('\\./features/${feature}/index\\.js(?:\\?v=[^']+)?'\\)`), feature);
  }
  assert.match(app, /createMiniAppFrameHost/);
  assert.match(app, /runtime\.platform\.invoke\('platform_boot'/);
  assert.match(app, /function armSlowRouteState\(/);
  assert.match(app, /delay = 320/);
  assert.match(app, /launchView\(/);
  assert.match(app, /Biznesingiz uchun platforma tayyorlanmoqda/);
});

test('O2 home network failure is distinct from a legitimate empty catalog and offers retry', async () => {
  const { createHomeView } = await import(url('web/features/home/home.js'));
  const doc = new FakeDocument();
  const errorView = createHomeView({ model:null, state:'error', onRetry:()=>{} }, doc);
  const errorText = flatten(errorView.element).map(n=>n.textContent).join(' ');
  assert.match(errorText, /Bosh sahifa yuklanmadi/);
  assert.match(errorText, /Mahsulotlar yo‘q deb ko‘rsatilmaydi/);
  const emptyView = createHomeView({ model:{banners:[],featuredBlocks:[],featuredProducts:[],latestProducts:[]}, state:'ready' }, doc);
  const emptyText = flatten(emptyView.element).map(n=>n.textContent).join(' ');
  assert.match(emptyText, /Hozircha mahsulotlar yo‘q/);
});

test('O2 first banner is prioritized while later banners are dimensioned and lazy', async () => {
  const { createHomeView } = await import(url('web/features/home/home.js'));
  const doc = new FakeDocument();
  const model={banners:[{id:'b1',imageUrl:'https://cdn.example/1.jpg'},{id:'b2',imageUrl:'https://cdn.example/2.jpg'}],featuredBlocks:[],featuredProducts:[],latestProducts:[]};
  const view=createHomeView({model},doc);
  const images=flatten(view.element).filter(n=>n.tagName==='IMG');
  assert.equal(images.length,2);
  assert.equal(images[0].width,1200); assert.equal(images[0].height,480); assert.equal(images[0].loading,'eager'); assert.equal(images[0].fetchPriority,'high');
  assert.equal(images[1].width,1200); assert.equal(images[1].height,480); assert.equal(images[1].loading,'lazy'); assert.equal(images[1].fetchPriority,'low');
  assert.equal(images[1].decoding,'async'); assert.equal(images[1].referrerPolicy,'no-referrer');
});

test('O2 product, logo, support and admin images carry explicit dimensions and loading policy', () => {
  const product=read('web/features/product/detail.js');
  const shell=read('web/shells/shared.js');
  const support=read('web/features/support/support.js');
  const adminProducts=read('web/features/admin-products/products.js');
  const marketing=read('web/features/admin-marketing/marketing.js');
  assert.match(product,/mainImage\.width = 800; mainImage\.height = 800; mainImage\.loading = 'eager'/);
  assert.match(product,/img\.width = 96; img\.height = 96; img\.loading = 'lazy'/);
  assert.match(shell,/image\.width = 96;[\s\S]{0,100}image\.loading = 'eager'/);
  assert.match(support,/image\.width = 640; image\.height = 480; image\.loading = 'lazy'; image\.decoding = 'async'; image\.fetchPriority = 'low'/);
  assert.match(adminProducts,/img\.width = 96; img\.height = 96; img\.loading = 'lazy'; img\.decoding = 'async'; img\.fetchPriority = 'low'/);
  assert.match(marketing,/img\.width=64;img\.height=64;img\.loading='lazy';img\.fetchPriority='low'/);
});

test('O2 loading state is semantically announced instead of masquerading as empty state', async () => {
  const { createStatePanel } = await import(url('web/components/ui.js'));
  const doc = new FakeDocument();
  const panel = createStatePanel({kind:'loading',title:'Yuklanmoqda',message:'Kuting'},doc);
  assert.equal(panel.getAttribute('role'),'status');
  assert.equal(panel.getAttribute('aria-live'),'polite');
  assert.equal(panel.getAttribute('aria-busy'),'true');
  for (const file of ['web/features/cart/cart.js','web/features/catalog/catalog.js','web/features/orders/orders.js','web/features/admin-settings/settings.js','web/features/support/support.js']) {
    const source=read(file);
    assert.match(source,/kind:\s*['"]loading['"]/);
  }
});

test('O2 shop home renderer maps transport/server errors to error state rather than empty success', () => {
  const app=read('web/app.js');
  assert.match(app,/result\.error\?\.code === 'SHOP_UNAVAILABLE' \? 'unavailable' : 'error'/);
  assert.match(app,/onRetry:\(\)=>renderRoute\(routeState\)/);
});

test('O2 performance audit records real raw/gzip JS/CSS and lazy-vs-initial bytes without synthetic speed claims', () => {
  const measure=read('scripts/measure-production.mjs');
  assert.match(measure,/jsGzipBytes/);
  assert.match(measure,/cssGzipBytes/);
  assert.match(measure,/initialStaticJs/);
  assert.match(measure,/lazyJs/);
  assert.match(measure,/No synthetic speedup claim is made/);
  assert.match(read('package.json'),/"audit:performance": "node scripts\/measure-production\.mjs"/);
});
