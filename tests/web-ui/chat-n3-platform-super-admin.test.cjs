const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..','..');
const read=(f)=>fs.readFileSync(path.join(root,f),'utf8');
const load=(f)=>import(`${pathToFileURL(path.join(root,f)).href}?n3=${Date.now()}-${Math.random()}`);

class Node {
  constructor(tag){this.tagName=String(tag).toUpperCase();this.children=[];this.attributes={};this.dataset={};this.listeners={};this.className='';this.textContent='';this.value='';this.disabled=false;this.checked=false;this.files=[];this.type='';this.style={};this.href='';this.id='';this.target='';this.rel='';this.min='';this.max='';this.placeholder='';this.autocomplete='';}
  append(...items){this.children.push(...items.filter(x=>x!=null));}
  prepend(...items){this.children.unshift(...items.filter(x=>x!=null));}
  replaceChildren(...items){this.children=[...items];}
  setAttribute(k,v){this.attributes[k]=String(v);}
  addEventListener(k,fn){this.listeners[k]=fn;}
  scrollIntoView(){}
}
class Doc{createElement(tag){return new Node(tag);}getElementById(){return null;}}
const flat=(n)=>n&&typeof n==='object'?[n,...(n.children||[]).filter(x=>x&&typeof x==='object').flatMap(flat)]:[];
const texts=(n)=>flat(n).map(x=>x.textContent).filter(Boolean);

const superBoot={isSuperAdmin:true,platformActor:{accountId:'acct-super',displayName:'Platform Boss',telegramLinked:true,platformRole:'SUPER_ADMIN'},myShops:[],myRequests:[],tariffs:[],lifecycleSettings:{}};
const userBoot={isSuperAdmin:false,platformActor:{accountId:'acct-owner',displayName:'Shop Owner',telegramLinked:true,platformRole:'USER'},myShops:[{id:'shop-own',status:'ACTIVE'}],myRequests:[],tariffs:[],lifecycleSettings:{}};
function portWith(boot=superBoot,overrides={}){const calls=[];return {calls,port:{invoke:async(action,payload={})=>{calls.push([action,payload]);if(overrides[action])return overrides[action](payload);if(action==='platform_boot')return {ok:true,data:boot};if(action==='platform_admin_dashboard_summary')return {ok:true,data:{activeShopsCount:3,newRequestsCount:2,expiringSoonCount:1,expiredCount:1,supportOpenCount:1,totalUsersCount:3,recentShops:[{id:'s1',public_code:'FIT',status:'ACTIVE'}],attentionItems:[]}};if(action==='platform_list_shops')return {ok:true,data:{shops:[{id:'s1',publicCode:'FIT',status:'ACTIVE',botUsername:'fitcore_bot',botName:'FITCORE',ownerTelegramId:'123456',tariffName:'Biznes',subscriptionExpiresAt:'2030-01-01T00:00:00Z',billzAccessGranted:true,clickAccessGranted:false,paymeAccessGranted:false,uzumAccessGranted:false}]}};if(action==='platform_list_subscription_history')return {ok:true,data:{history:[]}};if(action==='platform_list_shop_admin_actions')return {ok:true,data:{actions:[]}};if(action==='platform_list_subscription_requests')return {ok:true,data:{requests:[{id:'r1',kind:'NEW_SHOP',status:'NEW',requesterTelegramId:'77777',requesterFirstName:'Ali',tariffName:'Biznes',tariffPrice:199000,paymentClaimedAt:'2026-09-23T00:00:00Z',createdAt:'2026-09-23T00:00:00Z'}]}};if(action==='platform_get_subscription_request_history')return {ok:true,data:{request:{id:'r1',kind:'NEW_SHOP',status:'APPROVED',awaitingProvisioning:true,requestedShopName:'Demo',tariffName:'Biznes',tariffPrice:199000,createdAt:'2026-09-23T00:00:00Z'},history:[]}};if(action==='platform_admin_list_support_tickets')return {ok:true,data:{tickets:[]}};if(action==='platform_admin_list_tariffs')return {ok:true,data:{tariffs:[{id:'t1',name:'Biznes',price:199000,productLimit:500,isActive:true,isPopular:true,sortOrder:1,features:['Hisobotlar']}]}};if(action==='platform_admin_analytics_summary')return {ok:true,data:{period:'30d',totalCount:4,newShopCount:2,renewalCount:1,planChangeCount:1,revenue:796000,byPeriod:{MONTHLY:{count:4,revenue:796000},ANNUAL:{count:0,revenue:0}},byTariff:[],salesTimeline:[],retentionRate:80,retentionCohortSize:10}};if(action==='platform_get_lifecycle_settings')return {ok:true,data:{settings:{retentionDays:30,autoFreezeOnExpiry:true,supportLabel:'Yordam'}}};if(action==='platform_get_payment_info')return {ok:true,data:{cardNumber:'8600',cardHolder:'USTORE',isActive:true}};if(action==='platform_admin_list_payment_methods')return {ok:true,data:{methods:[]}};if(action==='platform_admin_list_notification_templates')return {ok:true,data:{templates:[]}};return {ok:true,data:{}};}}};}

test('N3 shop OWNER/platform USER cannot elevate into Super Admin actions',async()=>{
  const {createPlatformAdminController}=await load('web/features/platform-admin/platform-admin.js');
  const {port,calls}=portWith(userBoot);const c=createPlatformAdminController({platformPort:port});const r=await c.load();assert.equal(r.ok,false);assert.equal(c.getState().status,'forbidden');assert.equal(c.getState().isSuperAdmin,false);
  const before=calls.length;const x=await c.loadDashboard();assert.equal(x.ok,false);assert.equal(calls.length,before);assert.deepEqual(calls.map(x=>x[0]),['platform_boot']);
});

test('N3 Super Admin controller uses existing platform admin actions and preserves server KPI truth',async()=>{
  const {createPlatformAdminController}=await load('web/features/platform-admin/platform-admin.js');const {port,calls}=portWith();const c=createPlatformAdminController({platformPort:port});await c.load();await c.loadDashboard();await c.loadShops({shopId:'s1'});await c.loadAnalytics('30d');
  assert.equal(c.getState().dashboard.activeShopsCount,3);assert.equal(c.getState().analytics.revenue,796000);assert.equal(c.getState().shops[0].ownerTelegramId,'123456');
  for(const a of ['platform_admin_dashboard_summary','platform_list_shops','platform_list_subscription_history','platform_list_shop_admin_actions','platform_admin_analytics_summary'])assert.ok(calls.some(x=>x[0]===a),a);
});

test('N3 platform admin routes are central-only and explicitly marked Super Admin before generic platform portal dispatch',async()=>{
  const {createRouteMatcher}=await load('web/navigation/router.js');const match=createRouteMatcher();const r=match('/platform/admin/shops/s1');assert.equal(r.route.id,'platform-admin-shop');assert.equal(r.route.platform,true);assert.equal(r.route.platformAuth,true);assert.equal(r.route.platformSuperAdmin,true);assert.equal(r.params.shopId,'s1');
  const app=read('web/app.js');assert.match(app,/routeState\.route\.platformSuperAdmin[^\n]+renderPlatformAdmin/);assert.ok(app.indexOf('routeState.route.platformSuperAdmin')<app.indexOf('routeState.route.platformAuth'));
  assert.match(app,/allowExplicitPlatformRoute\(\)/); // custom shop domains do not expose /platform/admin
});

test('N3 view renders dedicated desktop Super Admin shell and user portal gets admin link only for server-confirmed super admin',async()=>{
  const {createPlatformAdminController,createPlatformAdminView}=await load('web/features/platform-admin/platform-admin.js');const {port}=portWith();const c=createPlatformAdminController({platformPort:port,authPort:{signOut:async()=>({ok:true})}});await c.load();await c.loadDashboard();const doc=new Doc();const v=createPlatformAdminView({controller:c,state:c.getState(),section:'overview',onNavigate:()=>{}},doc);const all=texts(v.element).join(' | ');assert.match(all,/SUPER ADMIN/);assert.match(all,/Platforma boshqaruvi/);assert.match(all,/Faol do‘konlar/);
  const {createPlatformPortalController,createPlatformPortalView}=await load('web/features/platform-portal/platform-portal.js');const {port:userPort}=portWith(userBoot);const uc=createPlatformPortalController({platformPort:userPort});await uc.load();const uv=createPlatformPortalView({controller:uc,state:uc.getState(),section:'app',onNavigate:()=>{}},doc);assert.doesNotMatch(texts(uv.element).join(' | '),/Super Admin/);
  const {port:saPort}=portWith(superBoot);const sc=createPlatformPortalController({platformPort:saPort});await sc.load();const sv=createPlatformPortalView({controller:sc,state:sc.getState(),section:'app',onNavigate:()=>{}},doc);assert.match(texts(sv.element).join(' | '),/Super Admin/);
});

test('N3 request provisioning keeps bot token one-shot and never stores secret in controller state',async()=>{
  const overrides={platform_provision_shop_from_request:(p)=>({ok:true,data:{shopId:'new-shop',receivedRequestId:p.requestId}})};const {createPlatformAdminController}=await load('web/features/platform-admin/platform-admin.js');const {port,calls}=portWith(superBoot,overrides);const c=createPlatformAdminController({platformPort:port});await c.load();const token='123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi';const r=await c.provisionShop('r1',token);assert.equal(r.ok,true);const call=calls.find(x=>x[0]==='platform_provision_shop_from_request');assert.equal(call[1].botToken,token);assert.equal(JSON.stringify(c.getState()).includes(token),false);assert.equal(Object.hasOwn(c.getState(),'botToken'),false);
});

test('N3 mutations reuse backend-authoritative shop/request/support/tariff/settings actions',async()=>{
  const {createPlatformAdminController}=await load('web/features/platform-admin/platform-admin.js');const {port,calls}=portWith();const c=createPlatformAdminController({platformPort:port});await c.load();await c.setIntegrationAccess('s1','click',true);await c.grantDays('s1',7,'Bonus');await c.freezeShop('s1','Test');await c.approveRequest('r1');await c.rejectRequest('r2','Noto‘g‘ri chek');await c.saveTariff({id:'t1',name:'Biznes',price:199000,productLimit:500,features:['Hisobotlar'],isActive:true,isPopular:true});await c.savePaymentInfo({cardNumber:'8600',cardHolder:'USTORE',isActive:true});
  for(const a of ['platform_set_click_access','platform_grant_subscription_days','platform_freeze_shop','platform_approve_subscription_request','platform_reject_subscription_request','platform_upsert_tariff','platform_set_payment_info'])assert.ok(calls.some(x=>x[0]===a),a);
  const src=read('web/features/platform-admin/platform-admin.js');assert.doesNotMatch(src,/roleCodes|shopRole|products\.manage|staff\.manage/);
});

test('N3 CSS uses separate desktop platform-admin shell and does not reuse shop-admin authorization shell',()=>{
  const css=read('web/styles/features.css');assert.match(css,/\.uw-platform-admin__body\{display:grid;grid-template-columns:15rem minmax\(0,1fr\)/);assert.match(css,/\.uw-platform-admin__nav/);assert.match(css,/\.uw-platform-admin-table__row/);assert.match(css,/@media\(max-width:59\.999rem\)/);
  const backend=read('supabase/functions/platform-api/index.ts');assert.match(backend,/Shop roles NEVER grant platform Super Admin authority/);assert.match(backend,/function requirePlatformSuperAdmin\(\)/);
});
