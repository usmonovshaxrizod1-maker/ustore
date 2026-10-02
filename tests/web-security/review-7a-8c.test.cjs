const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const load = p => import(pathToFileURL(path.resolve(__dirname, '../..', p)).href);
const shared = () => load('supabase/functions/_shared/shop-domains.ts');
const response = (result, status=200) => ({ok:status<400,status,json:async()=>({success:status<400,result})});

test('provider pending ownership stays unverified and preserves TXT/CNAME TLS records', async () => {
  global.Deno = {env:{get:k=>({CLOUDFLARE_API_TOKEN:'test',CLOUDFLARE_ZONE_ID:'zone'})[k]}};
  const {createCloudflareDomainProvider} = await shared();
  const provider = createCloudflareDomainProvider(async()=>response({id:'cf1',status:'pending',ssl:{status:'pending_validation',validation_records:[{txt_name:'_acme.test.uz',txt_value:'txt'},{cname:'_acme2.test.uz',cname_target:'dcv.uz'}]}}));
  const snap = await provider.inspectHostname('cf1');
  assert.equal(snap.ownershipVerified,false);
  assert.equal(snap.dnsStatus,'PENDING');
  assert.deepEqual(snap.records.map(r=>[r.type,r.name,r.value]),[['TXT','_acme.test.uz','txt'],['CNAME','_acme2.test.uz','dcv.uz']]);
});
test('provider reconciles exact existing hostname before create and treats delete 404 as complete', async () => {
  const {createCloudflareDomainProvider} = await shared();
  const calls=[];
  const provider=createCloudflareDomainProvider(async(url,init)=>{
    calls.push([url,init.method]);
    return init.method==='DELETE'?response(null,404):response([{id:'cf1',hostname:'fitcore.uz',custom_metadata:{ustore_domain_key:'key'},status:'active',ssl:{status:'active'}}]);
  });
  assert.equal((await provider.createHostname('fitcore.uz','key')).providerId,'cf1');
  await provider.deleteHostname('cf1');
  assert.deepEqual(calls.map(x=>x[1]),['GET','DELETE']);
  assert.match(calls[0][0],/hostname=fitcore.uz/);
});
test('malformed provider result is rejected rather than recorded as pending success', async()=>{
  const {createCloudflareDomainProvider}=await shared();
  await assert.rejects(createCloudflareDomainProvider(async()=>response({status:'active'})).inspectHostname('x'),/domain_provider_error/);
});
test('busy domain operation stops external provider calls', async()=>{
  const {handleShopDomainAction}=await shared();
  const original=global.fetch;
  let requests=0;
  global.fetch=async()=>{requests++;throw Error('unexpected');};
  const db={from(){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:{id:'d',shop_id:'s',kind:'CUSTOM',status:'DRAFT',revision:1}})};return q},
    rpc:async(name)=>name==='ustore_can_manage_domains'?{data:true}:{error:new Error('domain_operation_busy')}};
  try{await assert.rejects(handleShopDomainAction(db,'s','123','domains_verify',{domainId:'d'},'ustore.uz'),/domain_operation_busy/);assert.equal(requests,0);}finally{global.fetch=original;}
});
test('callback clears code URL before rejecting wrong origin or expired state', async()=>{
  const {completeCustomDomainLogin}=await load('web/features/auth/origin-handoff.js');
  for(const pending of [{targetOrigin:'https://other.uz',expiresAt:'2099-01-01'},{targetOrigin:'https://fitcore.uz',expiresAt:'2000-01-01'}]){
    let cleaned='';let calls=0;
    const result=await completeCustomDomainLogin({url:'https://fitcore.uz/auth/callback?state=s&code=secret',store:{get:()=>({state:'s',codeVerifier:'v',...pending})},authPort:{exchangeOriginHandoff:async()=>{calls++;}},historyRef:{replaceState(_a,_b,url){cleaned=url}}});
    assert.equal(result.ok,false);assert.equal(calls,0);assert.equal(cleaned,'/auth/callback');
  }
});
test('domain adapter rejects successful HTTP with missing result payload',async()=>{
  const {createLiveDomainsAdapter}=await load('web/services/live/domains.js');
  for(const body of [null,[],{}, {domain:[]}]){
    const adapter=createLiveDomainsAdapter({endpoint:'https://api.uz/shop-api',botId:'123',tokenStore:{get:()=> 'token'},fetchImpl:async()=>({ok:true,json:async()=>body})});
    assert.equal((await adapter.verify({domainId:'d'})).error.code,'CONTRACT_MISMATCH');
  }
});
test('public route query requires active tenant as well as active domain',async()=>{
  const {resolveActiveDomainRoute}=await shared();const filters=[];
  const q={select(){return q},eq(k,v){filters.push([k,v]);return q},maybeSingle:async()=>({data:null})};
  assert.equal(await resolveActiveDomainRoute({from:()=>q},'fitcore.uz'),null);
  assert.ok(filters.some(([k,v])=>k==='shops.status'&&v==='ACTIVE'));
});
