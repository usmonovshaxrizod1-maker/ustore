const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {stripTypeScriptTypes}=require('node:module');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../..');
const load=p=>import(pathToFileURL(path.join(root,p)).href);
function extract(file,start,end,name,deps){const s=fs.readFileSync(path.join(root,file),'utf8');const i=s.indexOf(start);assert.ok(i>=0);return new Function(...Object.keys(deps),stripTypeScriptTypes(s.slice(i,s.indexOf(end,i)))+'\nreturn '+name)(...Object.values(deps));}
function query(data){const q={then:r=>Promise.resolve({data}).then(r)};for(const k of ['select','eq','limit','maybeSingle'])q[k]=()=>q;return q;}
test('admin and platform adapters reject malformed successful HTTP responses',async()=>{
 for(const file of ['admin','platform']){
  const m=await load(`web/services/live/${file}.js`);
  const factory=file==='admin'?m.createLiveAdminAdapter:m.createLivePlatformAdapter;
  for(const value of [null,[],42,'ok']){
   const a=factory({endpoint:'https://api.example/api',botId:'12345',tokenStore:{get:()=> 'token'},fetchImpl:async()=>({ok:true,json:async()=>value})});
   assert.equal((await a.invoke(file==='admin'?'get_my_permissions':'platform_boot')).error.code,'CONTRACT_MISMATCH');
  }
 }
});
test('CORS permits the request ID sent by both web adapters',async()=>{
 const {corsHeaders}=await load('supabase/functions/_shared/http.ts');
 assert.ok(corsHeaders['Access-Control-Allow-Headers'].split(',').map(x=>x.trim()).includes('x-request-id'));
 assert.ok(corsHeaders['Access-Control-Allow-Methods'].includes('POST'));
});
test('new owner membership without backfilled account mapping remains usable; conflicting mapping denied',async()=>{
 const fn=extract('supabase/functions/shop-api/index.ts','async function resolveWebShopPrincipal(', '\nfunction webOwnedFilter','resolveWebShopPrincipal',{});
 for(const mapped of [null,'wrong']){
  const db={from(table){
   const rows={accounts:{id:'a',status:'ACTIVE'},account_identities:{provider_subject:'12345'},app_users:{tg_id:'12345',account_id:'a'},shop_memberships:{role:'OWNER',status:'ACTIVE',account_id:mapped}};
   const q=query(rows[table]);
   if(table==='shop_memberships')q.eq=(key,value)=>{assert.notEqual(key,'account_id');if(key==='telegram_user_id')assert.equal(value,'12345');return q;};
   return q;
  }};
  const r=await fn(db,'shop','a');
  if(mapped===null)assert.equal(r.principal.actor.shopRole,'OWNER');else assert.equal(r.error,'account_mapping_conflict');
 }
});
test('platform role derives only from verified identity, not shop membership',async()=>{
 const fn=extract('supabase/functions/platform-api/index.ts','async function resolvePlatformWebPrincipal(', '\n// 18-band','resolvePlatformWebPrincipal',{
  platformWebSessionToken:()=> 'token',resolveSession:async()=>({accountId:'a'}),
 });
 const db={from:t=>{assert.notEqual(t,'shop_memberships');return query(t==='accounts'?{status:'ACTIVE'}:[{provider_subject:'12345'}]);}};
 assert.equal((await fn(db,new Request('https://a.test'),'99999')).isPlatformSuperAdmin,false);
 assert.equal((await fn(db,new Request('https://a.test'),'12345')).isPlatformSuperAdmin,true);
});
test('customer notification failure resolves and never logs the raw provider error',async()=>{
 for(const [name,end] of [['notifyOrderCreatedCustomer','\nasync function notifyOrderStatusCustomer'],['notifyOrderStatusCustomer','\n// Faqat record_stock_in']]){
  const logs=[];
  const fn=extract('supabase/functions/shop-api/index.ts',`async function ${name}(`,end,name,{
   telegramApi:async()=>{throw new Error('SECRET_TOKEN');},escapeHtml:String,formatAmount:String,console:{error:(...x)=>logs.push(x)},
  });
  await fn('token',{id:1,tg_id:'12345',status:'NEW'});
  assert.equal(logs.length,1);assert.ok(!JSON.stringify(logs).includes('SECRET_TOKEN'));
 }
});
