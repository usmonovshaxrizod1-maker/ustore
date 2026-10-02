const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..','..');
const read=(f)=>fs.readFileSync(path.join(root,f),'utf8');
const load=(f)=>import(`${pathToFileURL(path.join(root,f)).href}?n2=${Date.now()}-${Math.random()}`);

class Node {
  constructor(tag){this.tagName=String(tag).toUpperCase();this.children=[];this.attributes={};this.dataset={};this.listeners={};this.className='';this.textContent='';this.value='';this.disabled=false;this.checked=false;this.files=[];this.type='';this.style={};this.href='';this.id='';this.target='';this.rel='';}
  append(...items){this.children.push(...items.filter(x=>x!=null));}
  prepend(...items){this.children.unshift(...items.filter(x=>x!=null));}
  replaceChildren(...items){this.children=[...items];}
  setAttribute(k,v){this.attributes[k]=String(v);}
  addEventListener(k,fn){this.listeners[k]=fn;}
  scrollIntoView(){}
}
class Doc{constructor(){this.byId=new Map();}createElement(tag){const n=new Node(tag);return n;}getElementById(id){return this.byId.get(id)||null;}}
const flat=(n)=>n&&typeof n==='object'?[n,...(n.children||[]).filter(x=>x&&typeof x==='object').flatMap(flat)]:[];
const texts=(n)=>flat(n).map(x=>x.textContent).filter(Boolean);

const boot={
  isSuperAdmin:false,
  platformActor:{accountId:'acct-1',displayName:'Shaxrizod',telegramLinked:true,platformRole:'USER'},
  myShops:[{id:'shop-1',publicCode:'FIT',status:'ACTIVE',shopName:'FITCORE',botUsername:'fitcore_bot',tariffId:'t1',tariffName:'Business',productLimit:500,usedProductCount:43,usedOrderCount:120,ordersToday:5,subscriptionExpiresAt:'2030-01-01T00:00:00Z'}],
  myRequests:[{id:'req-1',kind:'UPGRADE',upgradeAction:'EXTEND',status:'NEW',shopId:'shop-1',tariffId:'t1',tariffName:'Business',tariffPrice:199000,billingPeriod:'MONTHLY',createdAt:'2026-09-23T00:00:00Z'}],
  tariffs:[{id:'t1',name:'Business',price:199000,productLimit:500,isPopular:true,features:['Ombor']},{id:'t2',name:'Pro',price:299000,productLimit:1000,isPopular:false,features:['Hisobotlar']}],
  lifecycleSettings:{},
};

function portWith(overrides={}){const calls=[];return {calls,port:{invoke:async(action,payload={})=>{calls.push([action,payload]);if(overrides[action])return overrides[action](payload);if(action==='platform_boot')return {ok:true,data:boot};if(action==='platform_list_my_shops')return {ok:true,data:{myShops:boot.myShops}};if(action==='platform_list_my_subscription_requests')return {ok:true,data:{requests:boot.myRequests}};if(action==='platform_list_my_subscription_history')return {ok:true,data:{history:[{id:'h1',newTariffName:'Business',purchasedAmount:199000,billingPeriod:'MONTHLY',createdAt:'2026-09-01T00:00:00Z'}]}};if(action==='platform_get_payment_info')return {ok:true,data:{cardNumber:'8600 0000 0000 0000',cardHolder:'USTORE',isActive:true}};if(action==='platform_list_payment_methods')return {ok:true,data:{methods:[]}};if(action==='platform_submit_subscription_request')return {ok:true,data:{requestId:'req-2',status:'NEW'}};if(action==='platform_confirm_payment_claim')return {ok:true,data:{paymentClaimedAt:'2026-09-23T00:00:00Z'}};if(action==='platform_get_my_support_tickets')return {ok:true,data:{tickets:[]}};if(action==='platform_get_subscription_request_history')return {ok:true,data:{request:boot.myRequests[0],history:[]}};return {ok:true,data:{}};}}};}

test('N2 controller boots only central platform data and preserves server values',async()=>{
  const {createPlatformPortalController}=await load('web/features/platform-portal/platform-portal.js');
  const {port,calls}=portWith();const c=createPlatformPortalController({platformPort:port});const r=await c.load();
  assert.equal(r.ok,true);assert.deepEqual(calls[0],['platform_boot',{}]);const s=c.getState();assert.equal(s.actor.accountId,'acct-1');assert.equal(s.shops[0].usedOrderCount,120);assert.equal(s.tariffs[1].price,299000);assert.equal(s.requests[0].status,'NEW');
});

test('N2 protected platform routes keep platform flag through matcher and stay separate from shop admin routes',async()=>{
  const {createRouteMatcher}=await load('web/navigation/router.js');const match=createRouteMatcher();
  const shop=match('/platform/shops/shop-1');assert.equal(shop.route.id,'platform-shop');assert.equal(shop.route.platform,true);assert.equal(shop.route.platformAuth,true);assert.equal(shop.params.shopId,'shop-1');
  const support=match('/platform/support/15');assert.equal(support.route.platform,true);assert.equal(support.route.admin,false);
  const app=read('web/app.js');assert.ok(app.indexOf('routeState.route.platformAuth')<app.indexOf("launchView({ mode:'shop'"));assert.match(app,/mountSharedFrame\(\{ kind: 'platform', routeState, runtime/);
});

test('N2 renders shops subscriptions requests profile and help from platform state without Super Admin controls',async()=>{
  const {createPlatformPortalController,createPlatformPortalView}=await load('web/features/platform-portal/platform-portal.js');const {port}=portWith();const c=createPlatformPortalController({platformPort:port,authPort:{signOut:async()=>({ok:true,data:{}})}});await c.load();const doc=new Doc();
  for(const section of ['shops','subscriptions','requests','profile','support']){const view=createPlatformPortalView({controller:c,state:c.getState(),section,onNavigate:()=>{}},doc);const all=texts(view.element).join(' | ');assert.match(all,/UStorE/);if(section==='shops')assert.match(all,/FITCORE/);if(section==='subscriptions')assert.match(all,/Obunalar/);if(section==='requests')assert.match(all,/Arizalarim/);if(section==='profile')assert.match(all,/Account ID: acct-1/);if(section==='support')assert.match(all,/Yordam/);assert.doesNotMatch(all,/Platforma administratori|Tarif yaratish|Do‘konni muzlatish/);}
});

test('N2 subscription submit uses server tariff/request/payment actions and never calculates financial truth on client',async()=>{
  const {createPlatformPortalController}=await load('web/features/platform-portal/platform-portal.js');const {port,calls}=portWith();const c=createPlatformPortalController({platformPort:port});await c.load();c.beginCheckout({kind:'UPGRADE',shopId:'shop-1',tariffId:'t1',upgradeAction:'EXTEND'});c.selectCardPayment();c.patchCheckout({consentAccepted:true});const r=await c.submitCheckout();assert.equal(r.ok,true);
  const submit=calls.find(x=>x[0]==='platform_submit_subscription_request');assert.equal(submit[1].kind,'UPGRADE');assert.equal(submit[1].shopId,'shop-1');assert.equal(submit[1].tariffId,'t1');assert.equal(submit[1].paymentMethod,'CARD');assert.equal(submit[1].consentAccepted,true);assert.ok(calls.some(x=>x[0]==='platform_confirm_payment_claim'));
  const src=read('web/features/platform-portal/platform-portal.js');assert.doesNotMatch(src,/remainingValue\s*=|convertedDays\s*=|priceSnapshot\s*=|purchasedAmount\s*\+/);
});

test('N2 support flow reuses platform ticket actions and user can only work through own-ticket API',async()=>{
  const responses={
    platform_get_my_support_tickets:()=>({ok:true,data:{tickets:[{id:4,type:'SUPPORT',status:'OPEN',createdAt:'2026-09-23T00:00:00Z'}]}}),
    platform_get_support_messages:()=>({ok:true,data:{messages:[{id:1,sender:'USER',body:'Salom',createdAt:'2026-09-23T00:00:00Z'}]}}),
    platform_send_support_message:()=>({ok:true,data:{status:'OPEN'}}),
  };
  const {createPlatformPortalController}=await load('web/features/platform-portal/platform-portal.js');const {port,calls}=portWith(responses);const c=createPlatformPortalController({platformPort:port});await c.load();await c.loadSupport();await c.openTicket(4);await c.sendSupportMessage(4,'Javob');assert.ok(calls.some(x=>x[0]==='platform_get_my_support_tickets'));assert.ok(calls.some(x=>x[0]==='platform_get_support_messages'));assert.ok(calls.some(x=>x[0]==='platform_send_support_message'));
  const src=read('web/features/platform-portal/platform-portal.js');assert.doesNotMatch(src,/platform_admin_list_support_tickets|platform_freeze_shop|platform_apply_tariff|platform_upsert_tariff/);
});

test('N2 profile logout uses central auth port and does not touch shop context',async()=>{
  const {createPlatformPortalController}=await load('web/features/platform-portal/platform-portal.js');let signed=0;const {port}=portWith();const c=createPlatformPortalController({platformPort:port,authPort:{signOut:async()=>{signed++;return {ok:true,data:{signedOut:true}};}}});await c.load();const r=await c.signOut();assert.equal(r.ok,true);assert.equal(signed,1);assert.equal(c.getState().actor,null);
});

test('N2 CSS has dedicated responsive platform portal shell instead of reusing shop-admin shell',()=>{const css=read('web/styles/features.css');assert.match(css,/\.uw-platform-portal__body\{display:grid;grid-template-columns/);assert.match(css,/\.uw-platform-portal__nav/);assert.match(css,/@media\(max-width:47\.999rem\)[\s\S]*\.uw-platform-portal__nav\{position:fixed/);assert.match(css,/safe-area-inset-bottom/);});
