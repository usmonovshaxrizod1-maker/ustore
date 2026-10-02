const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const url = (file) => pathToFileURL(path.join(root, file)).href;

function hexRgb(value) {
  const m = String(value || '').trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) throw new Error(`hex expected: ${value}`);
  const h = m[1];
  return [0,2,4].map((i) => parseInt(h.slice(i,i+2),16) / 255);
}
function luminance(hex) {
  const [r,g,b] = hexRgb(hex).map((x) => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126*r + 0.7152*g + 0.0722*b;
}
function contrast(a,b) {
  const x=luminance(a), y=luminance(b);
  return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);
}
function token(css, name) {
  const m=css.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})`));
  return m?.[1] || '';
}

class FakeStyle { setProperty(name,value){ this[name]=String(value); } }
class FakeNode {
  constructor(tag){ this.tagName=String(tag).toUpperCase();this.children=[];this.attributes={};this.dataset={};this.style=new FakeStyle();this.className='';this.textContent='';this.value='';this.listeners={};this.id='';this.tabIndex=-1;this.hidden=false; }
  append(...items){this.children.push(...items);} setAttribute(n,v){this.attributes[n]=String(v);} getAttribute(n){return this.attributes[n]??null;} addEventListener(t,f){this.listeners[t]=f;} removeEventListener(t,f){if(this.listeners[t]===f)delete this.listeners[t];} focus(){this.ownerDocument.activeElement=this;} querySelectorAll(){return [];} querySelector(){return null;}
}
class FakeDocument { constructor(){this.activeElement=null;} createElement(tag){const n=new FakeNode(tag);n.ownerDocument=this;return n;} }
function flatten(node){return [node,...(node.children||[]).flatMap(flatten)];}

const owner = JSON.parse(read('web/fixtures/context/owner-active.json'));

 test('O1 static hosting keeps SPA deep-link fallback while router still owns real 404 state', async () => {
  const build=read('scripts/build-production.mjs');
  assert.match(build, /404\.html/);
  assert.doesNotMatch(build, /writeFileSync\([^\n]*_redirects|copyFile\([^\n]*_redirects/);
  assert.match(build, /404\.html/);
  const { createRouteMatcher } = await import(url('web/navigation/router.js'));
  const match=createRouteMatcher();
  assert.equal(match('/platform/admin/shops/shop%201?tab=history').params.shopId,'shop 1');
  assert.equal(match('/missing/deep/link').found,false);
});

test('O1 route transitions have a keyboard focus target without breaking native back scroll semantics', () => {
  const app=read('web/app.js');
  assert.match(app, /routeMainTarget\(node\)/);
  assert.match(app, /\['navigate','replace','popstate','locale'\]/);
  assert.match(app, /activeRouteReason === 'navigate' \|\| activeRouteReason === 'replace'/);
  assert.doesNotMatch(app, /activeRouteReason === 'popstate'[\s\S]{0,120}scrollTo/);
  assert.match(app, /main\.focus\(\{ preventScroll:true \}\)/);
});

test('O1 admin mobile drawer is inert while closed and traps/restores keyboard focus while open', () => {
  const source=read('web/shells/admin.js');
  assert.match(source, /createFocusTrap/);
  assert.match(source, /drawer\.inert = true/);
  assert.match(source, /drawer\.inert = !next/);
  assert.match(source, /focusTrap\.activate\(\)/);
  assert.match(source, /focusTrap\.deactivate\(\{ restoreFocus: true \}\)/);
});

test('O1 reduced-motion utility changes programmatic smooth scrolling to auto', async () => {
  const { prefersReducedMotion, preferredScrollBehavior, scrollElementIntoView } = await import(url('web/a11y/preferences.js'));
  const reduced={matchMedia:()=>({matches:true})};
  const normal={matchMedia:()=>({matches:false})};
  assert.equal(prefersReducedMotion(reduced),true);
  assert.equal(preferredScrollBehavior(reduced),'auto');
  assert.equal(preferredScrollBehavior(normal),'smooth');
  let received=null;
  assert.equal(scrollElementIntoView({scrollIntoView:(x)=>{received=x;}},{block:'center'},reduced),true);
  assert.equal(received.behavior,'auto');
  assert.equal(received.block,'center');
});

test('O1 semantic text tokens meet WCAG AA contrast on the normal surface', () => {
  const css=read('web/styles/tokens.css');
  const surface=token(css,'--uw-color-surface');
  for(const name of ['--uw-color-text','--uw-color-text-muted','--uw-color-text-subtle','--uw-color-link']) {
    const c=token(css,name);
    assert.ok(contrast(c,surface)>=4.5,`${name} contrast ${contrast(c,surface).toFixed(2)} < 4.5`);
  }
});

test('O1 UZ/RU core chrome has dictionary parity and Russian shell labels render without changing route hrefs', async () => {
  const { WEB_DICTIONARIES } = await import(url('web/i18n/index.js'));
  const keys=['nav.home','nav.catalog','nav.cart','nav.profile','nav.admin.overview','nav.admin.inventory','nav.admin.team','a11y.skipToMain','shell.menu','route.notFound.title'];
  for(const key of keys){assert.equal(typeof WEB_DICTIONARIES.uz[key],'string');assert.equal(typeof WEB_DICTIONARIES.ru[key],'string');}
  const { createCustomerShell, createAdminShell } = await import(url('web/shells/index.js'));
  const doc=new FakeDocument();
  const c=createCustomerShell({context:owner,locale:'ru'},doc);
  const cText=flatten(c.element).map(x=>x.textContent).filter(Boolean);
  assert.ok(cText.includes('Каталог'));
  assert.ok(cText.includes('Корзина'));
  const a=createAdminShell({context:owner,locale:'ru'},doc);
  const aText=flatten(a.element).map(x=>x.textContent).filter(Boolean);
  assert.ok(aText.includes('Склад'));
  assert.ok(aText.includes('Команда'));
  const catalog=flatten(c.element).find(x=>x.dataset?.navId==='catalog');
  assert.equal(catalog.href,'/catalog');
});

test('O1 platform/admin form controls added in N2/N3 carry explicit accessible names', () => {
  const admin=read('web/features/platform-admin/platform-admin.js');
  const portal=read('web/features/platform-portal/platform-portal.js');
  const orders=read('web/features/admin-orders/orders.js');
  assert.match(admin, /function nameControl/);
  for(const label of ['Do‘konlarni qidirish','Bot token','Tarif nomi','Tarif narxi','Analitika davri','Karta raqami','To‘lov usuli turi','Avtomatik xabar matni']) assert.ok(admin.includes(label),label);
  for(const label of ['Support xabari','Murojaat turi','Murojaat mavzusi','Murojaat matni','Rasm biriktirish']) assert.ok(portal.includes(label),label);
  assert.match(orders,/Buyurtmalarni qidirish/);
});

test('O1 responsive styles retain phone/tablet/desktop breakpoints and no motion exception bypasses reduce mode', () => {
  const features=read('web/styles/features.css');
  const shells=read('web/styles/shells.css');
  const base=read('web/styles/base.css');
  assert.match(features,/max-width:47\.999rem/);
  assert.match(features,/max-width:63\.999rem/);
  assert.match(features,/max-width:79\.999rem/);
  assert.match(shells,/max-width:\s*47\.999rem/);
  assert.match(shells,/max-width:\s*63\.999rem/);
  assert.match(base,/prefers-reduced-motion:\s*reduce/);
  assert.match(base,/animation-duration:\s*0\.01ms\s*!important/);
  assert.match(base,/transition-duration:\s*0\.01ms\s*!important/);
});
