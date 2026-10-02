const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT,p),'utf8');

test('9c session generation + atomic credential/revoke RPCs exist', () => {
  const sql=read('supabase/migrations/103_release_security_hardening.sql');
  for(const token of ['session_version','ustore_create_web_session','ustore_revoke_all_web_sessions_atomic','ustore_replace_credentials_and_revoke','SESSION_VERSION_CHANGED']) assert.match(sql,new RegExp(token));
  const auth=read('supabase/functions/_shared/web-auth.ts');
  assert.match(auth,/ustore_replace_credentials_and_revoke/);
  assert.match(auth,/ustore_create_web_session/);
  assert.match(auth,/session_version/);
});

test('9c browser auth POST requires allowlisted Origin and never uses credentials cookies', () => {
  const auth=read('supabase/functions/web-auth/index.ts');
  assert.match(auth,/if \(!corsOrigin\).*Origin not allowed/);
  assert.match(auth,/Cache-Control.*no-store/);
  for(const p of ['web/services/live/auth.js','web/services/live/shop-private.js']) assert.match(read(p),/credentials:\s*'omit'/);
});

test('9c guest cart merge is server-atomic and idempotent', () => {
  const sql=read('supabase/migrations/103_release_security_hardening.sql');
  assert.match(sql,/web_cart_merge_receipts/);
  assert.match(sql,/ustore_merge_web_cart/);
  assert.match(sql,/pg_advisory_xact_lock/);
  const live=read('web/services/live/shop-private.js');
  const block=live.slice(live.indexOf('async mergeGuest'), live.indexOf('async updateLine'));
  assert.match(block,/web_cart_merge_guest/);
  assert.doesNotMatch(block,/web_cart_load/);
  assert.match(block,/idempotencyKey/);
});

test('9c guest store persists a stable merge key across saves', async () => {
  const mod=await import(pathToFileURL(path.join(ROOT,'web/features/cart/cart.js')).href+'?9c='+Date.now());
  const m=new Map(); const storage={getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};
  const store=mod.createGuestCartStore(storage); const shop='shop-1';
  const a=store.save(shop,{shopId:shop,lines:[{lineKey:'p1',quantity:1}]});
  const b=store.save(shop,{shopId:shop,lines:[{lineKey:'p1',quantity:2}]});
  assert.ok(a.mergeKey.length>=16); assert.equal(b.mergeKey,a.mergeKey); assert.equal(store.load(shop).mergeKey,a.mergeKey);
});

test('9c payment PROCESSING is recovery state, not a duplicate external start', async () => {
  const mod=await import(pathToFileURL(path.join(ROOT,'web/features/checkout/submit.js')).href+'?9c='+Date.now());
  let starts=0, statuses=0;
  const paymentsPort={
    async start(){starts++; return {ok:true,data:{orderId:7,status:'PROCESSING',recoveryRequired:true,serverAuthoritative:true}};},
    async getStatus(){statuses++; return {ok:true,data:{orderId:7,status:'PROCESSING',recoveryRequired:true,serverAuthoritative:true}};}
  };
  const c=mod.createCheckoutSubmitController({ordersPort:{async create(){return {ok:true,data:{id:7}};}},paymentsPort,checkoutIntent:{paymentMethod:'CLICK'},intentStore:{get(){return null},set(){},clear(){}},makeKey:p=>p+':12345678901234567890'});
  await c.submit(); assert.equal(c.getState().status,'payment-unknown'); assert.equal(starts,1);
  await c.retry(); assert.equal(starts,1); assert.equal(statuses,1); assert.equal(c.getState().status,'payment-unknown');
});

test('9c backend returns PROCESSING recovery without creating a second payment start', () => {
  const src=read('supabase/functions/shop-api/index.ts');
  assert.match(src,/sameKey\.status\) === "PROCESSING"[\s\S]{0,350}recoveryRequired: true/);
  assert.match(src,/externalStartAttempted\)[\s\S]{0,250}status: "PROCESSING"[\s\S]{0,150}recoveryRequired: true/);
  assert.match(src,/attemptStatus[\s\S]{0,250}recoveryRequired/);
});

test('9c premium CSP and static-host header policy are present', () => {
  const html=read('web/index.html'); const headers=read('web/_headers'); const build=read('scripts/build-production.mjs');
  assert.match(html,/Content-Security-Policy/); assert.match(html,/object-src 'none'/); assert.match(html,/connect-src 'self' https:\/\/\*\.supabase\.co/);
  for(const x of ["frame-ancestors 'none'",'X-Content-Type-Options','Referrer-Policy','Permissions-Policy']) assert.ok(headers.includes(x));
  assert.match(build,/copyFile\(path\.join\(webSource, '_headers'\), path\.join\(webDist, '_headers'\)\)/);
});

test('9c JS/npm and Edge Supabase dependencies are exact-pinned', () => {
  const pkg=JSON.parse(read('package.json'));
  for(const section of ['dependencies','devDependencies']) for(const [name,v] of Object.entries(pkg[section]||{})) assert.doesNotMatch(v,/^[~^*]|\bx\b/i,`${name} is not pinned`);
  const edge=[]; const walk=d=>fs.readdirSync(d,{withFileTypes:true}).forEach(e=>e.isDirectory()?walk(path.join(d,e.name)):e.name.endsWith('.ts')&&edge.push(path.join(d,e.name)));
  walk(path.join(ROOT,'supabase/functions'));
  const imports=edge.map(f=>fs.readFileSync(f,'utf8')).join('\n');
  assert.doesNotMatch(imports,/supabase-js@2["']/); assert.match(imports,/supabase-js@2\.116\.0/);
});

test('9c critical top-level API logging and unknown 500 bodies are redacted', () => {
  const shop=read('supabase/functions/shop-api/index.ts'); const platform=read('supabase/functions/platform-api/index.ts'); const billz=read('supabase/functions/_shared/billz-client.ts');
  assert.match(shop,/\[SHOP_API_ACTION_FAILED\].*code:/s); assert.doesNotMatch(shop,/Action "\$\{action\}" error:/);
  assert.match(platform,/\[PLATFORM_API_ACTION_FAILED\].*code:/s);
  assert.doesNotMatch(billz,/BILLZ_FAILED:ACCESS_TOKEN_DECRYPT[^\n]*message:/);
  assert.match(shop,/return json\(\{ error: "server_error" \}, 500\)/);
});


test('9c/O2 customer/admin image surfaces use explicit loading/decoding/referrer hints', () => {
  const home=read('web/features/home/home.js'); const product=read('web/features/product/detail.js'); const marketing=read('web/features/admin-marketing/marketing.js');
  assert.match(home,/fetchPriority = index === 0 \? 'high' : 'low'/); assert.match(home,/decoding = 'async'/);
  assert.match(product,/loading = 'lazy'/); assert.match(product,/referrerPolicy = 'no-referrer'/);
  assert.match(marketing,/loading='lazy'/); assert.match(marketing,/decoding='async'/);
});

test('9c/O3 build keeps performance audit and does not overclaim server/prerender SEO completion', () => {
  const pkg=JSON.parse(read('package.json')); assert.match(pkg.scripts.build,/measure-production\.mjs/);
  const measure=read('scripts/measure-production.mjs'); assert.match(measure,/initialStaticJs/); assert.match(measure,/gzipBytes/);
  const build=read('scripts/build-production.mjs');
  assert.match(build,/seo: \{ status: 'SPA_METADATA_CONTRACT_READY_SERVER_PENDING'/);
  assert.match(build,/server\/prerender layer/);
  assert.doesNotMatch(build,/SEO_COMPLETE|PRERENDER_COMPLETE/);
});
