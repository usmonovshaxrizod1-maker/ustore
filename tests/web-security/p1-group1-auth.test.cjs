const test=require('node:test');const assert=require('node:assert/strict');
const mod=()=>import('../../web/services/live/auth.js');
const response=data=>({ok:true,status:200,json:async()=>data});
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)}};
test('P1 malformed login cannot erase existing token or report successful login',async()=>{
 const {createLiveAuthAdapter,createMemoryTokenStore}=await mod();const tokenStore=createMemoryTokenStore('existing');
 const auth=createLiveAuthAdapter({endpoint:'https://auth.example',tokenStore,fetchImpl:async()=>response({})});
 const r=await auth.signInPassword({login:'a',password:'b'});assert.equal(r.error.code,'CONTRACT_MISMATCH');assert.equal(tokenStore.get(),'existing');
});
test('P1 late session rotation cannot resurrect a signed-out session',async()=>{
 const {createLiveAuthAdapter,createMemoryTokenStore}=await mod();const tokenStore=createMemoryTokenStore('old');const pending=deferred();
 const auth=createLiveAuthAdapter({endpoint:'https://auth.example',tokenStore,fetchImpl:async(_u,o)=>JSON.parse(o.body).action==='get_session'?pending.promise:response({})});
 const check=auth.getSession();await auth.signOut();pending.resolve(response({replacementToken:'rotated'}));assert.equal((await check).ok,false);assert.equal(tokenStore.get(),'');
});
test('P1 old login completion cannot overwrite a newer account',async()=>{
 const {createLiveAuthAdapter,createMemoryTokenStore}=await mod();const tokenStore=createMemoryTokenStore();const a=deferred();let n=0;
 const auth=createLiveAuthAdapter({endpoint:'https://auth.example',tokenStore,fetchImpl:async()=>++n===1?a.promise:response({accountId:'B',session:{token:'B-token'}})});
 const first=auth.signInPassword({});await auth.signInPassword({});a.resolve(response({accountId:'A',session:{token:'A-token'}}));assert.equal((await first).ok,false);assert.equal(tokenStore.get(),'B-token');
});
test('P1 concurrent getSession requests share a single rotation',async()=>{
 const {createLiveAuthAdapter,createMemoryTokenStore}=await mod();let n=0;const p=deferred();
 const auth=createLiveAuthAdapter({endpoint:'https://auth.example',tokenStore:createMemoryTokenStore('old'),fetchImpl:async()=>{n++;return p.promise}});
 const a=auth.getSession(),b=auth.getSession();p.resolve(response({accountId:'a',session:{id:'s'},replacementToken:'new'}));assert.ok((await a).ok);assert.ok((await b).ok);assert.equal(n,1);
});
test('P1 storage failure returns a safe Result and login controller leaves busy state',async()=>{
 const {createLiveAuthAdapter}=await mod();const {createLoginController}=await import('../../web/features/auth/login.js');
 const auth=createLiveAuthAdapter({endpoint:'https://auth.example',tokenStore:{get:()=>'',set(){throw Error('sensitive detail')},clear(){}},fetchImpl:async()=>response({accountId:'a',session:{token:'secret'}})});
 const c=createLoginController({authPort:auth});const r=await c.signInPassword({login:'x',password:'y'});assert.equal(r.ok,false);assert.equal(c.getState().busy,false);assert.doesNotMatch(JSON.stringify(r),/sensitive detail|secret/);
});
test('P1 password visibility preserves in-memory draft; successful login clears it',async()=>{
 const {createLoginController}=await import('../../web/features/auth/login.js');const c=createLoginController({authPort:{signInPassword:async()=>({ok:true,data:{}})}});
 c.updateDraft({login:'ali',password:'private'});c.togglePassword();assert.equal(c.getDraft().password,'private');assert.equal(c.getState().password,undefined);await c.signInPassword(c.getDraft());assert.equal(c.getDraft().password,'');
});
test('P1 wrong current password does not log out a valid session',async()=>{
 const {createLiveAuthAdapter,createMemoryTokenStore}=await mod();const tokenStore=createMemoryTokenStore('valid');
 const auth=createLiveAuthAdapter({endpoint:'https://auth.example',tokenStore,fetchImpl:async()=>({ok:false,status:401,json:async()=>({error:{code:'INVALID_CREDENTIALS'}})})});
 assert.equal((await auth.changePassword({})).ok,false);assert.equal(tokenStore.get(),'valid');
});
