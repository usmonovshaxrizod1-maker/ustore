const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {stripTypeScriptTypes}=require('node:module');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const load=p=>import(pathToFileURL(path.join(root,p)).href);
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
function extract(start,end,name,deps){const s=read('supabase/functions/_shared/web-auth.ts');const body=s.slice(s.indexOf(start),s.indexOf(end,s.indexOf(start))).replace(/^export /,'');return new Function(...Object.keys(deps),stripTypeScriptTypes(body)+`;return ${name}`)(...Object.values(deps));}

test('password login passes the exact verified hash even if generation changed during bcrypt',async()=>{
  let passed;
  const fn=extract('export async function authenticatePassword(','\nexport async function createSession','authenticatePassword',{
    normalizeLogin:x=>x,sha256Hex:async x=>x,validateLogin:()=>true,validatePassword:()=>true,
    bcrypt:{compare:async()=>true},createSession:async(...args)=>{passed=args;throw Error('SESSION_VERSION_CHANGED')}
  });
  const db={rpc:async()=>({data:{allowed:true}}),from(table){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:table==='account_credentials'?{account_id:'a',password_hash:'OLD_VERIFIED_HASH',password_algo:'bcrypt'}:{status:'ACTIVE',session_version:2}}),insert:async()=>({})};return q}};
  assert.deepEqual(await fn(db,'login','password'),{ok:false,code:'INVALID_CREDENTIALS'});
  assert.equal(passed[3],2);assert.equal(passed[4],'OLD_VERIFIED_HASH');
});
test('create session RPC binds password hash and never emits a token on conflict',async()=>{
  let input;
  const fn=extract('export async function createSession(','\nexport async function resolveSession','createSession',{
    generateSessionToken:()=> 'secret',sha256Hex:async()=> 'token-hash',SESSION_TTL_SECONDS:3600,
  });
  await assert.rejects(fn({rpc:async(name,args)=>{input=args;return {data:[{result:'CREDENTIAL_CHANGED'}]}}},'a','PASSWORD',2,'hash'),/SESSION_VERSION_CHANGED/);
  assert.equal(input.p_expected_password_hash,'hash');
});
test('104 SQL uses qualified generation columns, shared mint locks and fresh central session (static, not PostgreSQL)',()=>{
  const sql=read('supabase/migrations/104_review_auth_concurrency.sql');
  assert.match(sql,/v_hash is distinct from p_expected_password_hash/);
  assert.match(sql,/returning a\.session_version into v_version/);
  assert.doesNotMatch(sql,/select session_version into|set session_version=session_version/);
  assert.match(sql,/ws\.id=p_session_id[\s\S]*ws\.revoked_at is null/);
  assert.equal((sql.match(/a\.status='ACTIVE' for share/g)||[]).length,4);
});
test('custom domain rejects foreign bot_id even when query supplies an explicit locator',async()=>{
  const {createLiveTenantResolver}=await load('web/services/live/tenant.js');let calls=0;
  const resolver=createLiveTenantResolver({endpoint:'https://api.uz',fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({tenant:{botId:'1',shopId:'s',hostname:'shop.uz'}})}}});
  const r=await resolver.resolve({locationRef:{href:'https://shop.uz/?bot_id=2',hostname:'shop.uz'}});
  assert.equal(r.error.code,'FORBIDDEN');assert.equal(calls,1);
});
test('authenticated cart merges persisted guest once, clears on success, retains on lost response',async()=>{
  const {createCartController,createGuestCartStore}=await load('web/features/cart/cart.js');
  const store=createGuestCartStore(storage());const cart={shopId:'s',lines:[{lineKey:'p',quantity:1}]};
  const saved=store.save('s',cart);let calls=0;let fail=true;
  const port={load:async()=>({ok:true,data:cart}),quote:async()=>({ok:true,data:{}}),mergeGuest:async args=>{calls++;assert.equal(args.idempotencyKey,saved.mergeKey);return fail?{ok:false,error:{code:'NETWORK_ERROR'}}:{ok:true,data:cart}}};
  const c=createCartController({cartPort:port,shopId:'s',authenticated:true,guestStore:store});
  await c.load();assert.equal(store.load('s').mergeKey,saved.mergeKey);
  fail=false;await c.load();assert.equal(store.load('s'),null);
  await c.load();assert.equal(calls,2);
});
test('unauthenticated cart loads guest locally without authenticated merge RPC',async()=>{
  const {createCartController,createGuestCartStore}=await load('web/features/cart/cart.js');
  const store=createGuestCartStore(storage());store.save('s',{shopId:'s',lines:[{lineKey:'p',quantity:2}]});
  const c=createCartController({cartPort:{mergeGuest:()=>assert.fail('guest merge requires login'),quote:async()=>({ok:true,data:{}})},shopId:'s',guestStore:store,authenticated:false});
  assert.equal((await c.load()).data.lines[0].quantity,2);
});
test('105 replay rejects changed payload and returns current cart instead of old receipt (static)',()=>{
  const sql=read('supabase/migrations/105_review_cart_merge_replay.sql');
  assert.match(sql,/prior_items is distinct from p_incoming_items/);
  assert.match(sql,/from public\.cart_logs cl/);assert.doesNotMatch(sql,/return prior \|\|/);
});
test('payment pending and resumed unknown do not dispatch another provider start',async()=>{
  const {createCheckoutSubmitController,createCheckoutIntentStore}=await load('web/features/checkout/submit.js');
  const st=createCheckoutIntentStore(storage());let starts=0;let status=0;
  const args={checkoutIntent:{paymentMethod:'CLICK'},intentStore:st,ordersPort:{create:async()=>({ok:true,data:{id:1}})},paymentsPort:{start:async()=>{starts++;return {ok:true,data:{status:'PENDING',redirectUrl:'https://pay.uz'}}},getStatus:async()=>{status++;return {ok:true,data:{status:'PROCESSING'}}}},makeKey:()=> 'k'.repeat(20)};
  const c=createCheckoutSubmitController(args);await c.submit();await c.submit();assert.equal(starts,1);
  st.set({...st.get(),status:'payment-unknown'});
  await createCheckoutSubmitController(args).submit();assert.equal(starts,1);assert.equal(status,1);
});
test('checkout controller rejects a different draft while an earlier result is unresolved',async()=>{
  const {createCheckoutSubmitController,createCheckoutIntentStore}=await load('web/features/checkout/submit.js');
  const st=createCheckoutIntentStore(storage());st.set({status:'unknown',intentFingerprint:JSON.stringify({paymentMethod:'CLICK'}),idempotencyKey:'old'});
  const c=createCheckoutSubmitController({checkoutIntent:{paymentMethod:'CASH'},intentStore:st,ordersPort:{create:()=>assert.fail('must not reuse prior intent')},paymentsPort:{start(){},getStatus(){}}});
  assert.equal((await c.submit()).error.code,'CONFLICT');assert.equal(st.get().idempotencyKey,'old');
});
test('measurement follows static barrel exports and accounts for public config script',()=>{
  const src=read('scripts/measure-production.mjs');assert.match(src,/import\|export/);assert.match(src,/visit\('config.public.js'\)/);
});
