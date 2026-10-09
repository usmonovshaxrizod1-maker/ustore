const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function bootWelcome() {
  class Element {
    constructor(tag) {
      this.tagName = tag;
      this.className = '';
      this.children = [];
      this.attributes = {};
      this.styleValues = {};
      this.style = { setProperty: (k, v) => {this.styleValues[k] = v;} };
      this.classList = {
        toggle: (name, yes) => { const v = new Set(this.className.split(/\s+/).filter(Boolean)); yes ? v.add(name) : v.delete(name); this.className = Array.from(v).join(' '); },
        add: (name) => { if (!this.className.split(/\s+/).includes(name)) this.className += ` ${name}`; },
      };
      this.dataset = {};
      this.events = {};
    }
    append(...children) { for (const child of children) { this.children.push(child); child.parent=this; } }
    replaceChildren(...children) {this.children=[];this.append(...children);}
    setAttribute(k,v) { this.attributes[k]=v; }
    addEventListener(k,fn) { this.events[k]=fn; }
    remove() { if (this.parent) this.parent.children=this.parent.children.filter(child=>child!==this);this.removed=true; }
    querySelector(selector) {
      const className = selector.startsWith('.') ? selector.slice(1) : null;
      for (const child of this.children) {
        if ((className && child.className.split(/\s+/).includes(className)) || child.tagName === selector) return child;
        const sub=child.querySelector(selector);if (sub)return sub;
      }
      return null;
    }
  }
  const window = {matchMedia:()=>({matches:true}),location:{reload(){}}};
  const document = {createElement: (tag)=>new Element(tag)};
  vm.runInNewContext(fs.readFileSync(path.join(root,'shop-welcome.js'),'utf8'), {window,document,URL,setTimeout,console});
  return { api:window.USTORE_SHOP_WELCOME, document };
}
test('Task1 welcome: reusable element with brand, 3 dots, language, logo validation', () => {
  const {api}=bootWelcome();
  const welcome=api.create({name:'FITCORE',logoUrl:'https://example.com/brand.png',locale:'uz'});
  assert.match(welcome.className,/ustore-welcome/);
  assert.equal(welcome.querySelector('.ustore-welcome__name').textContent,'FITCORE');
  assert.equal(welcome.querySelector('.ustore-welcome__greeting').textContent,'Xush kelibsiz');
  assert.equal(welcome.querySelector('.ustore-welcome__dots').children.length,3);
  assert.equal(welcome.querySelector('.ustore-welcome__logo').children.length,2);
  api.update(welcome,{name:'Green Shop',locale:'ru',logoUrl:'http://unsafe.example/logo.svg'});
  assert.equal(welcome.querySelector('.ustore-welcome__greeting').textContent,'Добро пожаловать');
  assert.equal(welcome.querySelector('.ustore-welcome__logo').children.length,1);
});
test('Task1 welcome: theme presets, color override, dark contrast, error fallback', () => {
  const {api}=bootWelcome();
  const welcome=api.create({name:'Sport',theme:{themeId:'sport',colors:{}}});
  assert.equal(welcome.styleValues['--ustore-welcome-accent'],'rgb(22,163,74)');
  assert.equal(welcome.className.includes('ustore-welcome--dark'),false);
  api.setTheme(welcome,{themeId:'dark',colors:{primary:'#60a5fa',pageBg:'#15253c'}});
  assert.equal(welcome.className.includes('ustore-welcome--dark'),true);
  api.failure(welcome,{message:'Network unavailable'});
  assert.equal(welcome.attributes['aria-busy'],'false');
  assert.equal(welcome.querySelector('.ustore-welcome__dots').hidden,true);
  assert.equal(welcome.querySelector('.ustore-welcome__error').children[0].textContent,'Network unavailable');
  api.dismiss(welcome,{immediate:true});
  assert.equal(welcome.removed,true);
});
test('Task1 welcome: Web and Mini App receive shared assets, never old shop spinner', () => {
  const read=(name)=>fs.readFileSync(path.join(root,name),'utf8');
  for(const file of ['index.html','web/index.html','web/404.html']) {
    assert.match(read(file),/shop-welcome\.css/);
    assert.match(read(file),/shop-welcome\.js/);
    assert.match(read(file),/ustore-welcome__dots/);
  }
  const host=read('web/shared/frame-host.js');
  assert.match(host,/USTORE_SHOP_WELCOME\.create/);
  assert.match(host,/USTORE_SHOP_WELCOME\.dismiss/);
  assert.match(read('web/styles/index.css'),/\.uw-miniapp-host\.is-loading \.uw-miniapp-frame\{opacity:0/);
  assert.doesNotMatch(read('web/styles/index.css'),/\.uw-shop-opening::after/);
  const css=read('shop-welcome.css');
  assert.match(css,/shop-welcome-art\.svg/);
  assert.match(css,/@media\(min-width:1024px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(css,/animation:.*url\(/);
});
