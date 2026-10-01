const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const load = (f) => import(pathToFileURL(path.join(root, f)).href);
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

function storage() {
  const map = new Map();
  return { getItem:k=>map.has(k)?map.get(k):null, setItem:(k,v)=>map.set(k,String(v)), removeItem:k=>map.delete(k), map };
}

test('9a-b session token store is origin-session scoped storage, not URL/log state', async () => {
  const mod = await load('web/services/live/auth.js');
  const s = storage();
  const store = mod.createSessionStorageTokenStore(s);
  store.set('opaque-token-1');
  assert.equal(store.get(), 'opaque-token-1');
  assert.equal([...s.map.values()].some(v => v.includes('opaque-token-1')), true);
  store.clear();
  assert.equal(store.get(), '');
  const source = read('web/services/live/auth.js');
  assert.doesNotMatch(source, /localStorage.*session-token|console\.(?:log|info|debug).*token/i);
});

test('9a-b tenant resolver accepts bot_id without network only on configured shared host', async () => {
  const mod = await load('web/services/live/tenant.js');
  let calls = 0;
  const resolver = mod.createLiveTenantResolver({ endpoint:'https://project.example/functions/v1/shop-api', botIdHosts:['fitcore.example'], fetchImpl:async()=>{calls++; throw new Error('no');} });
  const result = await resolver.resolve({ locationRef:{ href:'https://fitcore.example/?bot_id=12345', hostname:'fitcore.example' } });
  assert.equal(result.ok, true);
  assert.equal(result.data.botId, '12345');
  assert.equal(result.data.source, 'BOT_ID');
  assert.equal(calls, 0);
});

test('9a-b tenant resolver uses hostname bootstrap when bot_id is absent', async () => {
  const mod = await load('web/services/live/tenant.js');
  let body = null;
  const resolver = mod.createLiveTenantResolver({ endpoint:'https://project.example/functions/v1/shop-api', fetchImpl:async(_url,init)=>{
    body = JSON.parse(init.body);
    return { ok:true, status:200, async json(){return {tenant:{botId:'777',shopId:'shop-1',domainId:'d1',hostname:'fitcore.uz',isPrimary:true}};} };
  }});
  const result = await resolver.resolve({ locationRef:{ href:'https://fitcore.uz/catalog', hostname:'fitcore.uz' } });
  assert.equal(result.ok, true);
  assert.equal(result.data.botId, '777');
  assert.equal(result.data.source, 'HOSTNAME');
  assert.deepEqual(body, { action:'resolve_web_tenant', clientMode:'web', payload:{hostname:'fitcore.uz'} });
});

test('9a-b production composer wires every required port with shared live token store', async () => {
  const mod = await load('web/runtime/production.js');
  const s = storage();
  const result = await mod.createProductionShopRuntime({
    config:{SUPABASE_URL:'https://project.example'}, sessionStorage:s,
    locationRef:{href:'http://localhost/?bot_id=123',hostname:'localhost'}, fetchImpl:async()=>{ throw new Error('network should not run during composition'); },
  });
  assert.equal(result.ok, true);
  for (const key of ['context','auth','catalog','cart','orders','payments','profile','support','admin','domains','platform']) assert.ok(result.data.services[key], key);
  assert.equal(result.data.services.mode, 'live');
  assert.equal(result.data.services.runtime, 'production');
});

test('9a-b production composer cannot silently fall back to mock or bundle mock provider', () => {
  const provider = read('web/services/provider.js');
  const core = read('web/services/core-provider.js');
  const runtime = read('web/runtime/production.js');
  assert.match(provider, /if \(mode === 'mock'\)/);
  assert.match(provider, /if \(!demoAllowed\).*Mock adapter production runtime’da taqiqlangan/);
  assert.doesNotMatch(core, /mock\/index|createMock/);
  assert.match(runtime, /core-provider\.js/);
  assert.doesNotMatch(runtime, /services\/provider\.js|createLocalDemoProvider/);
});

test('9a-b direct shop-origin sign-in controller starts central origin handoff, never password sign-in', async () => {
  const feature = await load('web/features/auth/origin-handoff.js');
  const calls=[];
  const s=storage();
  const cryptoRef={getRandomValues(bytes){bytes.fill(7);},subtle:{async digest(){return new Uint8Array(32).buffer;}}};
  const controller=feature.createCustomDomainSignInController({
    authPort:{ async beginOriginHandoff(input){calls.push(input);return {ok:true,data:{state:'s1',authorizeUrl:'https://central.example/auth/handoff?state=s1',expiresAt:'2099-01-01T00:00:00Z',targetOrigin:'https://fitcore.uz'}};} },
    returnTo:'/orders', store:feature.createOriginHandoffStore(s), cryptoRef,
  });
  const r=await controller.begin();
  assert.equal(r.ok,true); assert.equal(calls.length,1); assert.equal(calls[0].returnTo,'/orders'); assert.ok(calls[0].codeChallenge);
});

test('9a-b callback result has explicit standard-subdomain recovery UI', () => {
  const source = read('web/features/auth/origin-handoff.js');
  assert.match(source, /createOriginCallbackView/);
  assert.match(source, /Standart subdomendan ochish/);
  assert.match(source, /result\?\.fallbackUrl/);
});

test('9a-b server hostname tenant resolver is ACTIVE-route-only and browser-origin bound', () => {
  const api = read('supabase/functions/shop-api/index.ts');
  assert.match(api, /action === "resolve_web_tenant"/);
  assert.match(api, /req\.headers\.get\("origin"\)/);
  assert.match(api, /requestedHostname !== originHostname/);
  assert.match(api, /resolveActiveDomainRoute\(db, requestedHostname\)/);
  assert.match(api, /shop_bots[\s\S]{0,300}status[\s\S]{0,100}"ACTIVE"/);
  assert.doesNotMatch(api.slice(api.indexOf('action === "resolve_web_tenant"'), api.indexOf('// Astra-5a')), /token_ciphertext|token_iv/);
});
