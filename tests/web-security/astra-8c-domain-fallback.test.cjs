const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const load = (f) => import(pathToFileURL(path.join(root, f)).href);

function unavailableDomainDb() {
  const handoff = {
    target_origin:'https://fitcore.uz', target_hostname:'fitcore.uz', target_shop_id:'00000000-0000-0000-0000-000000000001',
    target_domain_id:'custom-1', return_path:'/orders', expires_at:'2099-01-01T00:00:00Z', authorized_at:null, consumed_at:null, cancelled_at:null,
  };
  return {
    from(table) {
      if (table === 'web_origin_auth_handoffs') {
        const q = {
          select(){ return q; }, eq(){ return q; }, is(){ return q; },
          async maybeSingle(){ return { data: handoff, error:null }; },
          update(){ return q; },
        }; return q;
      }
      if (table === 'shop_domains') {
        const filters = {};
        const q = {
          select(){ return q; },
          eq(k,v){ filters[k]=v; return q; },
          async maybeSingle(){
            if (filters.kind === 'SUBDOMAIN') return { data:{ hostname:'fitcore.ustore.uz' }, error:null };
            return { data:null, error:null };
          },
        }; return q;
      }
      if (table === 'shop_settings') return { select(){return this;}, eq(){return this;}, async maybeSingle(){return {data:{name:'Fitcore'},error:null};} };
      throw new Error(`unexpected table ${table}`);
    },
  };
}

test('8c unavailable custom-domain handoff is cancelled logically and exposes active UStorE subdomain fallback', async () => {
  const mod = await load('supabase/functions/_shared/web-origin-handoff.ts');
  const result = await mod.getOriginAuthHandoff(unavailableDomainDb(), 'S'.repeat(43));
  assert.equal(result.status, 'DOMAIN_UNAVAILABLE');
  assert.equal(result.fallbackOrigin, 'https://fitcore.ustore.uz');
  assert.equal(result.fallbackUrl, 'https://fitcore.ustore.uz/orders');
});

test('8c browser callback returns fallback URL instead of retrying a dead custom origin', async () => {
  const feature = await load('web/features/auth/origin-handoff.js');
  const map = new Map();
  const storage = { getItem:k=>map.get(k)||null, setItem:(k,v)=>map.set(k,v), removeItem:k=>map.delete(k) };
  const store = feature.createOriginHandoffStore(storage);
  store.set({ state:'state-1', codeVerifier:'V'.repeat(43), targetOrigin:'https://fitcore.uz', expiresAt:'2099-01-01T00:00:00Z', fallbackOrigin:'https://fitcore.ustore.uz', returnTo:'/orders' });
  const result = await feature.completeCustomDomainLogin({
    authPort:{ async exchangeOriginHandoff(){ return { ok:false, error:{ code:'DOMAIN_NOT_VERIFIED', message:'gone', retryable:false } }; } },
    url:'https://fitcore.uz/auth/callback?state=state-1&code=code-1', store,
  });
  assert.equal(result.ok, false);
  assert.equal(result.fallbackUrl, 'https://fitcore.ustore.uz/orders');
  assert.equal(store.get(), null);
});

test('8c SQL cancels pending handoffs on domain loss and removes ephemeral handoffs before final domain delete', () => {
  const sql = read('supabase/migrations/101_domain_auth_fallback_and_miniapp.sql');
  for (const pattern of [
    /telegram_mini_app_domain_id uuid references public\.shop_domains\(id\) on delete set null/i,
    /after update of status,routing_ready or delete on public\.shop_domains/i,
    /update public\.web_origin_auth_handoffs[\s\S]*cancelled_at=coalesce\(cancelled_at,now\(\)\)/i,
    /delete from public\.web_origin_auth_handoffs where target_domain_id=p_domain_id/i,
    /delete from public\.shop_domains where id=p_domain_id/i,
  ]) assert.match(sql, pattern);
});

test('8c Mini App target switch is explicit, ACTIVE-domain gated, and primary-domain change does not auto-switch Telegram', () => {
  const api = read('supabase/functions/shop-api/index.ts');
  assert.match(api, /domains_get_mini_app_target: 'domains\.manage'/);
  assert.match(api, /domains_set_mini_app_target: 'domains\.manage'/);
  assert.match(api, /payload\?\.confirm !== true/);
  assert.match(api, /domain\.status !== "ACTIVE" \|\| domain\.routing_ready !== true/);
  assert.match(api, /USTORE_CUSTOM_DOMAIN_MINI_APP_ENABLED/);
  assert.match(api, /telegramApi\(BOT_TOKEN, "setChatMenuButton"/);
  const primaryCase = api.slice(api.indexOf('case "domains_list"'), api.indexOf('case "set_start_message"'));
  assert.match(primaryCase, /domains_set_primary/);
  assert.doesNotMatch(primaryCase, /domains_set_primary[\s\S]{0,500}setChatMenuButton/);
});

test('8c current /start links follow explicit target while legacy base remains fallback and old sent links stay valid', () => {
  const api = read('supabase/functions/shop-api/index.ts');
  assert.match(api, /resolveTelegramMiniAppTarget\(db, String\(botRow\.shop_id\), rawBotId, SHOP_MINI_APP_BASE_URL\)/);
  assert.match(api, /fallbackUrl = miniAppUrl\(defaultBaseUrl, botId\)/);
  assert.match(api, /SHOP_MINI_APP_BASE_URL/);
  assert.match(api, /Existing already-sent legacy buttons remain valid/);
});

test('8c removing selected custom domain first restores Telegram menu to default fallback', () => {
  const api = read('supabase/functions/shop-api/index.ts');
  assert.match(api, /if \(action === 'domains_remove' \|\| action === 'domains_change_slug'\)/);
  assert.match(api, /currentTarget\.domainId/);
  assert.match(api, /web_app: \{ url: currentTarget\.fallbackUrl \}/);
  assert.match(api, /TELEGRAM_MINI_APP_FALLBACK/);
});

test('8c shared Domains adapters expose explicit Mini App target get/set without making them required for old adapters', async () => {
  const domains = await load('web/services/ports/domains.js');
  const required = { list:async()=>{},add:async()=>{},verify:async()=>{},setPrimary:async()=>{},remove:async()=>{} };
  const oldPort = domains.createDomainsPort(required);
  assert.equal(typeof oldPort.getMiniAppTarget, 'undefined');
  const extended = domains.createDomainsPort({ ...required, getMiniAppTarget:async()=>({ok:true}), setMiniAppTarget:async()=>({ok:true}) });
  assert.equal(typeof extended.getMiniAppTarget, 'function');
  assert.equal(typeof extended.setMiniAppTarget, 'function');
});

test('8c Mini App domains bridge maps explicit target actions and confirmation flag', async () => {
  const mod = await load('web/features/domains/domains.js');
  const calls=[];
  const port = mod.createMiniAppDomainsPort(async(action,payload)=>{ calls.push([action,payload]); if(action==='domains_get_mini_app_target') return {target:{mode:'DEFAULT'}}; if(action==='domains_set_mini_app_target') return {target:{mode:'DOMAIN'}}; return {items:[]}; });
  await port.getMiniAppTarget();
  await port.setMiniAppTarget({domainId:'d1',confirm:true});
  assert.deepEqual(calls.map(x=>x[0]), ['domains_get_mini_app_target','domains_set_mini_app_target']);
  assert.deepEqual(calls[1][1], {domainId:'d1',confirm:true});
});
