const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const load = file => import(pathToFileURL(path.join(root,file)).href);
const shared = () => load('supabase/functions/_shared/shop-domains.ts');
test('slug normalization rejects reserved names and unsafe labels', async () => {
  const { normalizeShopSlug } = await shared();
  assert.equal(normalizeShopSlug(' FitCore '), 'fitcore');
  for (const x of ['admin','API','ab','-shop','shop-','shop.name','a'.repeat(41),'fit/core']) assert.throws(() => normalizeShopSlug(x));
});
test('hostname normalization rejects URL, IP, ports, wildcard and local names', async () => {
  const { normalizeDomainHostname } = await shared();
  assert.equal(normalizeDomainHostname(' FitCore.UZ. '), 'fitcore.uz');
  for (const x of ['https://fitcore.uz','fitcore.uz:443','*.fitcore.uz','127.0.0.1','[::1]','shop.local','a..uz','a@b.uz','a/../b.uz','a'.repeat(64)+'.uz']) assert.throws(() => normalizeDomainHostname(x), x);
});
test('state machine blocks premature activation and resurrection while removing', async () => {
  const { canTransitionDomain } = await shared();
  assert.equal(canTransitionDomain('DRAFT','ACTIVE'), false);
  assert.equal(canTransitionDomain('PENDING_DNS','ACTIVE'), false);
  assert.equal(canTransitionDomain('PENDING_TLS','ACTIVE'), true);
  assert.equal(canTransitionDomain('REMOVING','DRAFT'), false);
});
test('unconfigured provider cannot simulate DNS or TLS success', async () => {
  const { createUnconfiguredDomainProvider } = await shared();
  const provider = createUnconfiguredDomainProvider();
  for (const method of ['createHostname','inspectHostname','deleteHostname']) await assert.rejects(provider[method]('fitcore.uz'), /domain_provider_unavailable/);
});
test('denied or removed member cannot list or reserve domains', async () => {
  const { handleShopDomainAction } = await shared();
  const db = { rpc: async () => ({ data: false }), from: () => assert.fail('must not read domains') };
  for (const action of ['domains_list','domains_add','domains_reserve_slug','domains_verify']) {
    await assert.rejects(handleShopDomainAction(db,'shop','123',action,{ role:'OWNER', hostname:'fitcore.uz' },'ustore.uz'), /forbidden/);
  }
});
test('reservation derives hostname server-side and strips provider internals', async () => {
  const { handleShopDomainAction } = await shared();
  const calls=[];
  const db = { async rpc(name,args) {
    calls.push({name,args});
    return name === 'ustore_can_manage_domains' ? { data: true } : { data: {
      id:'d', hostname:args.p_hostname,kind:'SUBDOMAIN',status:'DRAFT',dns_status:'UNKNOWN',tls_status:'UNKNOWN',
      provider_id:'private-id', provider_name:'private', ownership_token:'secret',
    } };
  } };
  const result = await handleShopDomainAction(db,'trusted-shop','trusted-user','domains_reserve_slug',{
    slug:'Fitcore', shopId:'attacker', hostname:'evil.uz', status:'ACTIVE', isPrimary:true,
  },'ustore.uz');
  assert.equal(calls[1].args.p_shop_id,'trusted-shop');
  assert.equal(calls[1].args.p_hostname,'fitcore.ustore.uz');
  assert.equal(result.domain.status,'DRAFT');
  assert.equal(result.domain.isPrimary,false);
  assert.equal(JSON.stringify(result).includes('secret'),false);
  assert.equal(result.domain.provider_id,undefined);
});
test('custom add cannot claim the platform namespace', async () => {
  const { handleShopDomainAction } = await shared();
  const db = { rpc: async name => { assert.equal(name,'ustore_can_manage_domains'); return {data:true}; } };
  for (const hostname of ['ustore.uz','www.ustore.uz','nested.fitcore.ustore.uz'])
    await assert.rejects(handleShopDomainAction(db,'s','123','domains_add',{hostname},'ustore.uz'),/invalid_hostname/);
});
test('live adapter uses verified-session transport and cannot send role/status claims', async () => {
  const { createLiveDomainsAdapter } = await load('web/services/live/domains.js');
  const calls=[];
  const adapter=createLiveDomainsAdapter({ endpoint:'https://api.example/shop-api',botId:'12345',tokenStore:{get:()=> 'token'},
    fetchImpl:async (_,init)=>{calls.push(init);return {ok:true,json:async()=>({domain:{id:'d',status:'DRAFT'}})};} });
  assert.equal((await adapter.add({hostname:'fitcore.uz',role:'OWNER',status:'ACTIVE'})).data.status,'DRAFT');
  const body=JSON.parse(calls[0].body);
  assert.deepEqual(body.payload,{hostname:'fitcore.uz'});
  assert.equal(calls[0].headers.authorization,'UStoreSession token');
  assert.equal(body.clientMode,'web');
});
test('live adapter reports provider unavailability instead of success', async () => {
  const { createLiveDomainsAdapter } = await load('web/services/live/domains.js');
  const adapter=createLiveDomainsAdapter({endpoint:'https://api.example/shop-api',botId:'123',tokenStore:{get:()=> 'token'},
    fetchImpl:async()=>({ok:false,status:503,json:async()=>({error:'CAPABILITY_UNAVAILABLE'})})});
  assert.equal((await adapter.verify({domainId:'d'})).error.code,'CAPABILITY_UNAVAILABLE');
});
test('SQL defines global uniqueness, role gate, RLS and active-state prerequisites (static only)', () => {
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/097_shop_domain_registry.sql'),'utf8');
  for (const pattern of [/hostname text not null unique/,/pg_advisory_xact_lock/,/m.status='ACTIVE'/,/r.key='MANAGER' and r.is_system/,
    /rp.permission='domains.manage'/,/ownership_verified and dns_status='VERIFIED' and tls_status='ACTIVE' and routing_ready/,
    /where is_primary/,/domain_identity_immutable/,/enable row level security/,/from public,anon,authenticated/]) assert.match(sql,pattern);
});
