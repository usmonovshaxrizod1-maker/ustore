const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const load = (file) => import(pathToFileURL(path.join(root, file)).href);

function activeDomainDb({ inserted = null, rpc = null } = {}) {
  return {
    from(table) {
      if (table === 'shop_domains') {
        const q = { select(){return q;}, eq(){return q;}, async maybeSingle(){ return { data: { id:'domain-1', shop_id:'shop-1', hostname:'fitcore.uz', is_primary:true, status:'ACTIVE', routing_ready:true }, error:null }; } };
        return q;
      }
      if (table === 'web_origin_auth_handoffs') {
        return { async insert(row) { if (inserted) inserted(row); return { error:null }; } };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: rpc || (() => { throw new Error('unexpected rpc'); }),
  };
}

test('8b PKCE verifier/challenge use S256-safe shapes and reject weak verifier', async () => {
  const mod = await load('supabase/functions/_shared/web-origin-handoff.ts');
  const verifier = 'A'.repeat(43);
  assert.equal(mod.isValidPkceVerifier(verifier), true);
  assert.equal(mod.isValidPkceVerifier('short'), false);
  const challenge = await mod.pkceChallenge(verifier);
  assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(mod.isValidPkceChallenge(challenge), true);
});

test('8b begin binds an ACTIVE exact domain and stores state hash + PKCE challenge, never verifier/token', async () => {
  const mod = await load('supabase/functions/_shared/web-origin-handoff.ts');
  let row;
  const db = activeDomainDb({ inserted: (value) => { row = value; } });
  const result = await mod.beginOriginAuthHandoff(db, {
    origin:'https://fitcore.uz', returnTo:'/checkout?from=login', codeChallenge:'B'.repeat(43), centralAuthBaseUrl:'https://ustore.uz',
  });
  assert.match(result.state, /^[A-Za-z0-9_-]{40,60}$/);
  assert.equal(result.authorizeUrl.startsWith('https://ustore.uz/auth/handoff?state='), true);
  assert.equal(result.targetOrigin, 'https://fitcore.uz');
  assert.equal(row.target_domain_id, 'domain-1');
  assert.equal(row.target_shop_id, 'shop-1');
  assert.equal(row.target_origin, 'https://fitcore.uz');
  assert.equal(row.return_path, '/checkout?from=login');
  assert.equal(row.code_challenge, 'B'.repeat(43));
  assert.notEqual(row.state_hash, result.state);
  assert.equal(JSON.stringify(row).includes('us1_'), false);
  assert.equal(Object.keys(row).some((k) => /verifier/i.test(k)), false);
});

test('8b authorize emits only short-lived code/state to exact target callback, not a web session token', async () => {
  const mod = await load('supabase/functions/_shared/web-origin-handoff.ts');
  let args;
  const db = { async rpc(name, input) {
    assert.equal(name, 'ustore_authorize_origin_handoff'); args = input;
    return { data: { result:'OK', target_origin:'https://fitcore.uz', return_path:'/orders', target_shop_id:'shop-1', target_domain_id:'domain-1' }, error:null };
  } };
  const result = await mod.authorizeOriginAuthHandoff(db, { state:'S'.repeat(43), accountId:'00000000-0000-0000-0000-000000000001' });
  assert.equal(result.ok, true);
  const url = new URL(result.redirectUrl);
  assert.equal(url.origin, 'https://fitcore.uz');
  assert.equal(url.pathname, '/auth/callback');
  assert.equal(url.searchParams.get('state'), 'S'.repeat(43));
  assert.match(url.searchParams.get('code'), /^[A-Za-z0-9_-]{40,60}$/);
  assert.equal(result.redirectUrl.includes('us1_'), false);
  assert.equal(result.redirectUrl.includes('/orders'), false, 'intended path stays server-side until exchange');
  assert.notEqual(args.p_authorization_code_hash, url.searchParams.get('code'));
});

test('8b exchange is exact-origin + PKCE bound and returns session only in response body', async () => {
  const mod = await load('supabase/functions/_shared/web-origin-handoff.ts');
  const verifier = 'V'.repeat(43);
  const expectedChallenge = await mod.pkceChallenge(verifier);
  let rpcArgs;
  const db = activeDomainDb({ rpc: async (name, input) => {
    assert.equal(name, 'ustore_exchange_origin_handoff'); rpcArgs = input;
    return { data: { result:'OK', account_id:'account-1', session_id:'session-1', session_expires_at:'2026-10-22T00:00:00Z', target_origin:'https://fitcore.uz', return_path:'/orders', target_shop_id:'shop-1', target_domain_id:'domain-1' }, error:null };
  }});
  const result = await mod.exchangeOriginAuthHandoff(db, { origin:'https://fitcore.uz', state:'S'.repeat(43), authorizationCode:'C'.repeat(43), codeVerifier:verifier });
  assert.equal(result.ok, true);
  assert.match(result.session.token, /^us1_[A-Za-z0-9_-]+$/);
  assert.equal(result.returnTo, '/orders');
  assert.equal(rpcArgs.p_origin, 'https://fitcore.uz');
  assert.equal(rpcArgs.p_code_challenge, expectedChallenge);
  assert.notEqual(rpcArgs.p_authorization_code_hash, 'C'.repeat(43));
  assert.notEqual(rpcArgs.p_session_token_hash, result.session.token);
});

test('8b SQL makes authorization code one-time, validates active target and creates session atomically', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations/100_custom_domain_auth_handoff.sql'), 'utf8');
  for (const pattern of [
    /state_hash text not null unique/i,
    /authorization_code_hash text unique/i,
    /code_challenge text not null/i,
    /for update/i,
    /r\.consumed_at is not null/i,
    /r\.authorization_expires_at is null or r\.authorization_expires_at <= now_ts/i,
    /r\.code_challenge<>p_code_challenge/i,
    /r\.target_origin<>p_origin/i,
    /d\.status='ACTIVE' and d\.routing_ready/i,
    /insert into public\.web_sessions/i,
    /'ORIGIN_HANDOFF'/i,
    /update public\.web_origin_auth_handoffs set consumed_at=now_ts/i,
    /enable row level security/i,
  ]) assert.match(sql, pattern);
  assert.doesNotMatch(sql, /password\s+text|session_token\s+text|code_verifier\s+text/i);
});

test('8b web-auth separates central authorize from active custom-domain exchange and never trusts forwarded host', () => {
  const source = fs.readFileSync(path.join(root, 'supabase/functions/web-auth/index.ts'), 'utf8');
  assert.match(source, /begin_origin_handoff/);
  assert.match(source, /authorize_origin_handoff/);
  assert.match(source, /exchange_origin_handoff/);
  assert.match(source, /origin !== centralAuthOrigin\(\)/);
  assert.match(source, /resolveActiveReturnOrigin/);
  assert.match(source, /"get_session", "sign_out", "list_sessions"/);
  assert.doesNotMatch(source, /x-forwarded-host|req\.headers\.get\(["']host["']\)/i);
});

test('8b browser flow stores verifier only in origin sessionStorage, scrubs code/state after exchange', async () => {
  const feature = await load('web/features/auth/origin-handoff.js');
  const map = new Map();
  const storage = { getItem:k=>map.get(k) || null, setItem:(k,v)=>map.set(k,v), removeItem:k=>map.delete(k) };
  const store = feature.createOriginHandoffStore(storage);
  let beginInput; let redirected;
  const auth = {
    async beginOriginHandoff(input) { beginInput=input; return { ok:true, data:{ state:'state-1', authorizeUrl:'https://ustore.uz/auth/handoff?state=state-1', expiresAt:'2099-01-01T00:00:00Z', targetOrigin:'https://fitcore.uz' } }; },
    async exchangeOriginHandoff(input) { assert.equal(input.state,'state-1'); assert.equal(input.code,'code-1'); assert.equal(input.codeVerifier,store.get().codeVerifier); return { ok:true, data:{ returnTo:'/orders' } }; },
  };
  await feature.beginCustomDomainLogin({ authPort:auth, returnTo:'/orders', store, onRedirect:u=>{redirected=u;} });
  assert.match(beginInput.codeChallenge, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(redirected, 'https://ustore.uz/auth/handoff?state=state-1&method=telegram&lang=uz');
  assert.match(store.get().codeVerifier, /^[A-Za-z0-9_-]{43}$/);
  let cleaned='';
  const result = await feature.completeCustomDomainLogin({ authPort:auth, url:'https://fitcore.uz/auth/callback?state=state-1&code=code-1', store, historyRef:{ state:null, replaceState(_s,_t,u){cleaned=u;} } });
  assert.equal(result.ok,true);
  assert.equal(store.get(),null);
  assert.equal(cleaned,'/auth/callback');
});

test('shop password choice opens central password tab without trusting a bot from the URL', async () => {
  const feature = await load('web/features/auth/origin-handoff.js');
  const map = new Map();
  const store = feature.createOriginHandoffStore({ getItem:key=>map.get(key)||null, setItem:(key,value)=>map.set(key,value), removeItem:key=>map.delete(key) });
  let redirected = '';
  const authPort = { async beginOriginHandoff() { return { ok:true, data:{ state:'state-2', authorizeUrl:'https://ustore.uz/auth/handoff?state=state-2', expiresAt:'2099-01-01T00:00:00Z', targetOrigin:'https://fitcore.uz' } }; } };
  await feature.beginCustomDomainLogin({ authPort, returnTo:'/orders', method:'password', botUsername:'untrusted_bot', locale:'ru', store, onRedirect:url=>{ redirected=url; } });
  const destination = new URL(redirected);
  assert.equal(destination.searchParams.get('method'), 'password');
  assert.equal(destination.searchParams.get('lang'), 'ru');
  assert.equal(destination.searchParams.has('bot'), false);
});

test('8b routes expose central handoff and origin callback without putting token/password in route', () => {
  const routes = fs.readFileSync(path.join(root, 'web/navigation/routes.js'), 'utf8');
  assert.match(routes, /path: '\/auth\/handoff'/);
  assert.match(routes, /path: '\/auth\/callback'/);
  assert.doesNotMatch(routes, /access_token|password=/i);
});
