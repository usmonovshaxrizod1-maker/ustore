const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const url = (file) => pathToFileURL(path.join(root, file)).href;

test('O3 canonical URL uses the authoritative host root and strips query/hash noise', async () => {
  const { buildCanonicalUrl, absolutePublicUrl } = await import(url('web/metadata/metadata.js'));
  assert.equal(buildCanonicalUrl('https://fitcore.uz/old/path?x=1#x', '/product/p%201'), 'https://fitcore.uz/product/p%201');
  assert.equal(buildCanonicalUrl('https://fitcore.uz', 'catalog'), 'https://fitcore.uz/catalog');
  assert.equal(buildCanonicalUrl('javascript:alert(1)', '/'), null);
  assert.equal(absolutePublicUrl('/media/a.jpg', 'https://fitcore.uz/product/1'), 'https://fitcore.uz/media/a.jpg');
});

test('O3 public metadata can only become indexable with an HTTP(S) canonical URL', async () => {
  const { createPageMetadata, ROBOTS } = await import(url('web/metadata/metadata.js'));
  const publicMeta = createPageMetadata({ title:'Protein', description:'Mahsulot', canonicalUrl:'https://fitcore.uz/product/1', indexable:true, locale:'uz' });
  assert.equal(publicMeta.indexable, true);
  assert.equal(publicMeta.robots, ROBOTS.index);
  assert.equal(publicMeta.locale, 'uz_UZ');
  const unsafe = createPageMetadata({ title:'Private', indexable:true, canonicalUrl:null });
  assert.equal(unsafe.indexable, false);
  assert.equal(unsafe.robots, ROBOTS.noindex);
});

test('O3 share contract prefers native share and safely falls back to canonical URL clipboard copy', async () => {
  const { sharePage } = await import(url('web/metadata/metadata.js'));
  let shared = null;
  const native = await sharePage({ title:'Protein', text:'Ko‘ring', url:'https://fitcore.uz/product/1#variant' }, { share:async (data)=>{ shared=data; } });
  assert.equal(native.ok, true); assert.equal(native.data.method, 'native'); assert.equal(shared.url, 'https://fitcore.uz/product/1');
  let copied = '';
  const fallback = await sharePage({ title:'Protein', url:'https://fitcore.uz/product/1' }, { share:async()=>{ throw new Error('native fail'); }, clipboard:{writeText:async(v)=>{copied=v;}} });
  assert.equal(fallback.ok, true); assert.equal(fallback.data.method, 'clipboard'); assert.equal(copied, 'https://fitcore.uz/product/1');
});

test('O3 app wires indexable metadata only to public platform/shop surfaces and product share uses canonical metadata', () => {
  const app = read('web/app.js');
  assert.match(app, /applyPrivateMetadata\('UStorE'/);
  assert.match(app, /canonicalRoot = isConfiguredPlatformOrigin\(\) && routeState\?\.pathname === '\/'/);
  assert.match(app, /applyShopPublicMetadata\(\{[\s\S]*pathname: '\/'/);
  assert.match(app, /routeState\.route\.id === 'catalog'/);
  assert.match(app, /applyPrivateMetadata\(`Qidiruv/);
  assert.match(app, /productPath = `\/product\/\$\{encodeURIComponent\(product\.id\)\}`/);
  assert.match(app, /onShare:\(\)=>sharePage\(\{ title: productMeta\.title, text: productMeta\.description, url: productMeta\.canonicalUrl \}\)/);
});

test('O3 private admin/account/auth/search/platform portal routes carry static X-Robots-Tag noindex rules', () => {
  const headers = read('web/_headers');
  for (const route of ['/admin','/admin/*','/auth/*','/cart','/checkout','/orders*','/profile*','/support*','/search','/platform/login','/platform/app','/platform/shops*','/platform/admin','/platform/admin/*']) {
    assert.ok(headers.includes(`${route}\n  X-Robots-Tag: noindex, nofollow, noarchive`), route);
  }
  assert.match(headers, /Content-Security-Policy:/);
});

test('O3 robots policy blocks private areas without inventing a sitemap endpoint', () => {
  const robots = read('web/robots.txt');
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Allow: \//);
  for (const route of ['/admin','/auth/','/cart','/checkout','/orders','/profile','/search','/platform/admin']) assert.ok(robots.includes(`Disallow: ${route}`), route);
  assert.doesNotMatch(robots, /^Sitemap:/m);
  assert.match(robots, /No fake sitemap URL/);
});

test('O3 production build preserves source-controlled route indexing headers and records server/prerender boundary', () => {
  const build = read('scripts/build-production.mjs');
  assert.match(build, /copyFile\(path\.join\(webSource, '_headers'\), path\.join\(webDist, '_headers'\)\)/);
  assert.match(build, /SPA_METADATA_CONTRACT_READY_SERVER_PENDING/);
  assert.match(build, /social previews/);
  assert.match(build, /server\/prerender layer/);
});

test('O3 static shell has truthful generic description/robots but does not fake route-specific social preview HTML', () => {
  const html = read('web/index.html');
  assert.match(html, /meta name="description"/);
  assert.match(html, /meta name="robots" content="index,follow/);
  assert.doesNotMatch(html, /property="og:url"/);
  assert.doesNotMatch(html, /property="og:image"/);
  const product = read('web/features/product/detail.js');
  assert.match(product, /label: tr\('Ulashish', 'Поделиться'\)/);
  assert.match(product, /Havola nusxalandi\./);
});
