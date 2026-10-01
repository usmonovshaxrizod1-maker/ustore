const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const app = fs.readFileSync(path.join(__dirname, '../ustore-shop-app.js'), 'utf8');
const code = app.slice(app.indexOf('const catalogImageCache ='), app.indexOf('function warmCatalogBranch('));
function setup() {
  const images = [], links = [];
  const context = vm.createContext({ URL, Image: class {
    constructor() { this.complete = false; images.push(this); }
  }, document: {baseURI:'https://shop.test/', createElement:()=>({}), head:{appendChild:l=>links.push(l)}} });
  vm.runInContext(code, context);
  return { images, links, warm:(url,priority)=>context.warmCatalogImage(url,priority) };
}
test('warm requests start together without waiting; same URL is only warmed once', () => {
  const s = setup();
  for(let i=0;i<6;i++) s.warm(`https://img.test/${i}.webp`);
  assert.equal(s.images.length,6);
  assert.ok(s.images.every(i=>i.src && !i.complete));
  s.warm('https://img.test/0.webp','high');
  assert.equal(s.images.length,6);
  assert.equal(s.images[0].fetchPriority,'high');
  assert.equal(s.links.length,1);
  assert.ok(s.images.every(i=>i.referrerPolicy==='no-referrer'));
});
test('speculative traffic and retained image memory are bounded', () => {
  const s=setup();
  for(let i=0;i<200;i++) s.warm(`https://img.test/${i}`);
  assert.equal(s.images.length,16);
  s.images.forEach(i=>i.complete=true);
  for(let i=200;i<350;i++) {s.warm(`https://img.test/${i}`);s.images.at(-1).complete=true;}
  const before=s.images.length;
  s.warm('https://img.test/349');
  assert.equal(s.images.length,before);
  s.warm('https://img.test/0');
  assert.equal(s.images.length,before+1,'oldest completed image is evicted');
});
test('emoji and unsafe protocols never produce speculative requests',()=>{
  const s=setup(); ['📦','javascript:alert(1)','',null].forEach(s.warm);
  assert.equal(s.images.length,0);
});
test('banner has one actual image instead of a CSS background plus hidden probe',()=>{
  const start=app.indexOf('function renderBannerCarouselHtml');
  const block=app.slice(start,start+2400);
  assert.match(block,/fc-banner-image/);
  assert.doesNotMatch(block,/background-image|fc-image-sync-probe/);
  assert.doesNotMatch(app,/fc-image-sync-card is-loading/);
});
