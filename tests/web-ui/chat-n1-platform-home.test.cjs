const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname,'..','..');
const read = (f) => fs.readFileSync(path.join(root,f),'utf8');
const load = (f) => import(`${pathToFileURL(path.join(root,f)).href}?n1=${Date.now()}-${Math.random()}`);

class Node {
  constructor(tag){ this.tagName=String(tag).toUpperCase();this.children=[];this.attributes={};this.dataset={};this.listeners={};this.className='';this.textContent='';this.value='';this.disabled=false;this.type='';this.style={};this.href='';this.id=''; }
  append(...items){ this.children.push(...items); }
  replaceChildren(...items){ this.children=[...items]; }
  setAttribute(k,v){ this.attributes[k]=String(v); }
  addEventListener(k,fn){ this.listeners[k]=fn; }
}
class Doc { createElement(tag){ return new Node(tag); } getElementById(){ return null; } }
const flat=(n)=>[n,...(n.children||[]).filter(x=>x&&typeof x==='object').flatMap(flat)];
const texts=(n)=>flat(n).map(x=>x.textContent).filter(Boolean);
const buttons=(n)=>flat(n).filter(x=>x.tagName==='BUTTON');
const buttonLabel=(b)=>texts(b).join(' ');

const tariffs=[
  {id:'t-start',name:'Start',price:99000,productLimit:100,isPopular:false,features:["Telegram e-do'kon",'Katalog va mahsulotlar']},
  {id:'t-business',name:'Business',price:199000,productLimit:500,isPopular:true,features:['Buyurtmalarni boshqarish','Ombor nazorati']},
];

test('N1 controller reads only platform_public_catalog and keeps server tariff values',async()=>{
  const {createPlatformHomeController}=await load('web/features/platform-home/platform-home.js');
  const calls=[];
  const controller=createPlatformHomeController({platformPort:{invoke:async(action,payload)=>{calls.push([action,payload]);return {ok:true,data:{tariffs}};}}});
  const result=await controller.load();
  assert.equal(result.ok,true);
  assert.deepEqual(calls,[['platform_public_catalog',{}]]);
  const state=controller.getState();
  assert.equal(state.status,'ready');
  assert.equal(state.tariffs[1].price,199000);
  assert.equal(state.tariffs[1].productLimit,500);
  assert.equal(state.tariffs[1].isPopular,true);
});

test('N1 landing renders existing product explanation and tariff data without invented KPI/customer stats',async()=>{
  const {createPlatformHomeController,createPlatformHomeView}=await load('web/features/platform-home/platform-home.js');
  const controller=createPlatformHomeController({platformPort:{invoke:async()=>({ok:true,data:{tariffs}})}});
  await controller.load();
  const picked=[]; const logins=[];
  const view=createPlatformHomeView({controller,state:controller.getState(),onLogin:(m)=>logins.push(m||{}),onChoosePlan:(t)=>picked.push(t.id)},new Doc());
  const all=texts(view.element).join(' | ');
  assert.match(all,/Telegram’da o‘z e-do‘koningizni oching/);
  assert.match(all,/199[\s\u00a0]?000 so‘m/);
  assert.match(all,/500 tagacha mahsulot/);
  assert.match(all,/Ommabop/);
  assert.doesNotMatch(all,/\b\d+[kK+]?\s*(?:mijoz|do‘kon ulangan|buyurtma bugun|foydalanuvchi)/);
  const choose=buttons(view.element).filter(b=>buttonLabel(b)==='Kirish va tanlash');
  assert.equal(choose.length,2); await choose[1].listeners.click();
  assert.deepEqual(picked,['t-business']);
});

test('N1 pricing has honest loading, error and empty states',async()=>{
  const {createPlatformHomeController,createPlatformHomeView}=await load('web/features/platform-home/platform-home.js');
  const doc=new Doc();
  const loadingController=createPlatformHomeController({platformPort:{invoke:async()=>({ok:true,data:{tariffs:[]}})}});
  let view=createPlatformHomeView({controller:loadingController,state:loadingController.getState()},doc);
  assert.ok(texts(view.element).includes('Tariflar yuklanmoqda'));
  const errorController=createPlatformHomeController({platformPort:{invoke:async()=>({ok:false,error:{code:'NETWORK_ERROR',message:'Ulanmadi'}})}});
  await errorController.load(); view=createPlatformHomeView({controller:errorController,state:errorController.getState()},doc);
  assert.ok(texts(view.element).includes('Tariflar yuklanmadi'));
  const emptyController=createPlatformHomeController({platformPort:{invoke:async()=>({ok:true,data:{tariffs:[]}})}});
  await emptyController.load(); view=createPlatformHomeView({controller:emptyController,state:emptyController.getState()},doc);
  assert.ok(texts(view.element).includes('Hozircha faol tarif yo‘q'));
});

test('N1 live adapter permits only public catalog without token and keeps protected platform actions authenticated',async()=>{
  const {createLivePlatformAdapter}=await load('web/services/live/platform.js');
  const calls=[];
  const adapter=createLivePlatformAdapter({endpoint:'https://api.example/platform-api',tokenStore:{get:()=>''},fetchImpl:async(_url,init)=>{calls.push(init);return {ok:true,status:200,json:async()=>({tariffs})};}});
  const pub=await adapter.invoke('platform_public_catalog');
  assert.equal(pub.ok,true); assert.equal(calls.length,1);
  assert.equal(calls[0].headers.authorization,undefined);
  assert.deepEqual(JSON.parse(calls[0].body),{action:'platform_public_catalog',payload:{},clientMode:'public'});
  const protectedResult=await adapter.invoke('platform_boot');
  assert.equal(protectedResult.error.code,'AUTH_REQUIRED'); assert.equal(calls.length,1);
});

test('N1 backend public catalog is before auth and projects only active tariff display fields',()=>{
  const api=read('supabase/functions/platform-api/index.ts');
  const start=api.indexOf('if (String(action || "") === "platform_public_catalog")');
  const auth=api.indexOf('if (!PLATFORM_BOT_TOKEN)',start);
  assert.ok(start>0 && auth>start);
  const segment=api.slice(start,auth);
  assert.match(segment,/from\("tariffs"\)/);
  assert.match(segment,/eq\("is_active", true\)/);
  assert.match(segment,/id,name,price,product_limit,is_popular,features/);
  assert.doesNotMatch(segment,/myShops|platformActor|subscription_requests|telegram_user_id|shop_memberships/);
});

test('N1 routes central platform before shop tenant runtime and uses the configured production hostname',()=>{
  const routes=read('web/navigation/routes.js');
  const app=read('web/app.js');
  const config=read('config.public.js');
  assert.match(routes,/platform-home[^\n]+\/platform/);
  assert.match(routes,/platform-login[^\n]+\/platform\/login/);
  assert.match(app,/USTORE_BASE_HOSTNAME/);
  assert.match(app,/centralOrigin && routeState\.route\?\.id === 'home'[\s\S]{0,100}renderPlatformHome/);
  assert.ok(app.indexOf('isExplicitPlatformRoute(routeState)') < app.indexOf('ensureShopRuntime()'));
  assert.match(config,/USTORE_BASE_HOSTNAME:\s*"ustr\.uz"/);
});

test('N1 landing has responsive desktop/mobile design hooks and no legacy fake hero KPI',()=>{
  const css=read('web/styles/features.css');
  const ui=read('web/features/platform-home/platform-home.js');
  assert.match(css,/\.uw-platform-hero__inner\{display:grid;grid-template-columns/);
  assert.match(css,/@media\(max-width:47\.999rem\)/);
  assert.match(css,/\.uw-platform-plans\{display:grid/);
  assert.doesNotMatch(ui,/plat-landing-phone-kpi|<b>24<\/b>|1000\+|10 000\+/);
});
