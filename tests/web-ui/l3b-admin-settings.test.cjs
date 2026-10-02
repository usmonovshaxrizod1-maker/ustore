const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..','..');
const url=(f)=>pathToFileURL(path.join(root,f)).href;
const read=(f)=>fs.readFileSync(path.join(root,f),'utf8');

function actor(perms=['*'],shopRole='OWNER'){return{shopRole,permissions:perms};}
function data(){return{
  shopContact:{name:'Fitcore',address:'Sergeli',coordinates:'41.2,69.2',phone:'90',phone2:'',phone3:'',instagram:'fitcore',telegram:'',facebook:'',workHours:'09:00-22:00'},
  branding:{logoUrl:null,logoType:'IMAGE',logoWordmark:null,startMessage:'Salom',startImageUrl:null},
  fulfillmentConfig:{version:1,delivery:{free:{enabled:true,regions:{tashkent_city:{enabled:true}},general:{enabled:false}},fixed:{enabled:false,regions:{},general:{enabled:false,fee:null}},taxi:{enabled:false,general:{enabled:false,minFee:null,maxFee:null},regions:{}},post:{enabled:false,providers:[]}},payments:{methods:[{id:'CASH',name:'Naqd',enabled:true,regions:{}},{id:'CLICK',name:'Click orqali (avtomatik)',enabled:false,regions:{}}]}},
  designSettings:{themeId:'minimal',colors:{primary:'#2563eb'}},ordersPaused:false,ordersPausedNote:'',lowStockThreshold:5,
  orderPolicies:{customerCancelCutoff:'BEFORE_SHIPPED',returnRequestsEnabled:true,returnWindowDays:7,returnPolicyText:'Qoidalar'},discountPolicy:{}
};}
function makePort({settingsError=null,providerForbidden=false,mutationErrorAction=null}={}){
  const calls=[];
  return{calls,port:{async invoke(action,payload={}){
    calls.push({action,payload:structuredClone(payload)});
    if(action===mutationErrorAction)return{ok:false,error:{code:'NETWORK_ERROR',message:'Saqlash xatosi'}};
    if(action==='get_admin_settings')return settingsError?{ok:false,error:settingsError}:{ok:true,data:data()};
    if(action==='set_shop_contact')return{ok:true,data:{ok:true,shopContact:structuredClone(payload)}};
    if(action==='set_low_stock_threshold')return{ok:true,data:{ok:true,lowStockThreshold:Number(payload.threshold)}};
    if(action==='set_orders_paused')return{ok:true,data:{ok:true}};
    if(action==='set_fulfillment_config')return{ok:true,data:{ok:true,fulfillmentConfig:structuredClone(payload.config)}};
    if(action==='set_order_policies')return{ok:true,data:{ok:true}};
    if(action==='billz_get_status')return providerForbidden?{ok:false,error:{code:'FORBIDDEN',message:'not granted'}}:{ok:true,data:{status:'CONNECTED',billzShopName:'Fitcore'}};
    if(action==='click_get_status')return{ok:true,data:{status:'CONNECTED',merchantId:'m1',serviceId:'s1',verified:false}};
    if(action==='click_test_progress')return{ok:true,data:{verified:false,confirmedCount:2,pending:null}};
    if(action==='payme_get_status')return{ok:true,data:{status:'DISCONNECTED',merchantId:null,login:null,verified:false}};
    if(action==='payme_test_progress')return{ok:true,data:{verified:false,confirmedCount:0,pending:null}};
    if(action==='uzum_get_status')return{ok:true,data:{status:'DISCONNECTED',terminalId:null}};
    return{ok:false,error:{code:'CAPABILITY_UNAVAILABLE',message:'no'}};
  }}};
}
class FakeStyle{setProperty(n,v){this[n]=String(v)}}
class FakeNode{constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.dataset={};this.style=new FakeStyle();this.className='';this.textContent='';this.value='';this.listeners={};this.disabled=false;this.checked=false;this.type='';this.title='';}append(...x){this.children.push(...x)}setAttribute(n,v){this.attributes[n]=String(v)}addEventListener(n,fn){this.listeners[n]=fn}}
class FakeDocument{createElement(tag){return new FakeNode(tag)}}
function flatten(node,out=[]){if(node&&typeof node==='object'){out.push(node);for(const c of node.children||[])if(c&&typeof c==='object')flatten(c,out);}return out;}
function buttonByLabel(rootNode,label){return flatten(rootNode).find(n=>n.tagName==='BUTTON'&&flatten(n,[]).some(c=>c.textContent===label));}

test('L3-b loads settings projection and integration reads without mutations',async()=>{
  const {createAdminSettingsController}=await import(url('web/features/admin-settings/settings.js'));
  const p=makePort();const c=createAdminSettingsController({adminPort:p.port,actor:actor()});const r=await c.load();
  assert.equal(r.ok,true);assert.equal(c.getState().saved.shopContact.name,'Fitcore');
  for(const action of ['get_admin_settings','billz_get_status','click_get_status','click_test_progress','payme_get_status','uzum_get_status'])assert.ok(p.calls.some(x=>x.action===action),action);
  assert.equal(p.calls.some(x=>x.action==='payme_test_progress'),false,'disconnected provider should not fetch progress');
  assert.equal(p.calls.some(x=>x.action.startsWith('set_')),false);
});

test('L3-b local edits become dirty and reset never claims server save',async()=>{
  const {createAdminSettingsController}=await import(url('web/features/admin-settings/settings.js'));
  const p=makePort();const c=createAdminSettingsController({adminPort:p.port,actor:actor()});await c.load();
  c.update('shopContact.name','Yangi nom');assert.equal(c.isDirty('shop'),true);assert.equal(c.getState().saved.shopContact.name,'Fitcore');
  c.resetSection('shop');assert.equal(c.isDirty('shop'),false);assert.equal(c.getState().draft.shopContact.name,'Fitcore');assert.equal(p.calls.some(x=>x.action.startsWith('set_')),false);
});

test('L3-b shop save marks saved only after all reviewed server mutations succeed',async()=>{
  const {createAdminSettingsController}=await import(url('web/features/admin-settings/settings.js'));
  const p=makePort();const c=createAdminSettingsController({adminPort:p.port,actor:actor()});await c.load();
  c.update('shopContact.name','Yangi Fitcore');c.update('lowStockThreshold',8);c.update('ordersPaused',true);c.update('ordersPausedNote','Bugun yopiq');
  const r=await c.saveSection('shop');assert.equal(r.ok,true);assert.equal(c.isDirty('shop'),false);assert.equal(c.getState().saved.shopContact.name,'Yangi Fitcore');
  assert.equal(c.getState().saved.lowStockThreshold,8);assert.equal(c.getState().saved.ordersPaused,true);assert.equal(c.getState().saveSuccess.section,'shop');
  assert.deepEqual(p.calls.filter(x=>x.action.startsWith('set_')).map(x=>x.action),['set_shop_contact','set_low_stock_threshold','set_orders_paused']);
});

test('L3-b failed save preserves draft and dirty state instead of fake success',async()=>{
  const {createAdminSettingsController}=await import(url('web/features/admin-settings/settings.js'));
  const p=makePort({mutationErrorAction:'set_low_stock_threshold'});const c=createAdminSettingsController({adminPort:p.port,actor:actor()});await c.load();
  c.update('shopContact.name','Draft qoladi');c.update('lowStockThreshold',9);
  const r=await c.saveSection('shop');assert.equal(r.ok,false);assert.equal(c.isDirty('shop'),true);assert.equal(c.getState().draft.shopContact.name,'Draft qoladi');
  assert.equal(c.getState().saved.shopContact.name,'Fitcore');assert.equal(c.getState().saveError.section,'shop');assert.equal(c.getState().saveSuccess,null);
});

test('L3-b delivery save does not leak unsaved payment draft into shared fulfillment mutation',async()=>{
  const {createAdminSettingsController}=await import(url('web/features/admin-settings/settings.js'));
  const p=makePort();const c=createAdminSettingsController({adminPort:p.port,actor:actor()});await c.load();
  c.update('fulfillmentConfig.payments.methods.1.enabled',true);c.update('fulfillmentConfig.delivery.fixed.enabled',true);c.update('fulfillmentConfig.delivery.fixed.general.fee',25000);
  const r=await c.saveSection('delivery');assert.equal(r.ok,true);const call=p.calls.find(x=>x.action==='set_fulfillment_config');assert.ok(call);
  assert.equal(call.payload.config.delivery.fixed.enabled,true);assert.equal(call.payload.config.payments.methods[1].enabled,false);
  assert.equal(c.isDirty('delivery'),false);assert.equal(c.isDirty('payments'),true);assert.equal(c.getState().draft.fulfillmentConfig.payments.methods[1].enabled,true);
});

test('L3-b separates shop.settings.manage from integrations.manage permissions',async()=>{
  const {createAdminSettingsController}=await import(url('web/features/admin-settings/settings.js'));
  const p=makePort();const c=createAdminSettingsController({adminPort:p.port,actor:actor(['integrations.manage'],'STAFF')});const r=await c.load();
  assert.equal(r.ok,true);assert.equal(c.getState().permissions.settings,false);assert.equal(c.getState().activeSection,'integrations');assert.equal(p.calls.some(x=>x.action==='get_admin_settings'),false);assert.equal(p.calls.some(x=>x.action==='click_get_status'),true);assert.equal(c.update('shopContact.name','x').error.code,'FORBIDDEN');
});

test('L3-b maps platform-gated integration denial to UNAVAILABLE, not fake disconnected',async()=>{
  const {createAdminSettingsController}=await import(url('web/features/admin-settings/settings.js'));
  const p=makePort({providerForbidden:true});const c=createAdminSettingsController({adminPort:p.port,actor:actor()});await c.load();
  assert.equal(c.getState().integrations.billz.availability,'UNAVAILABLE');assert.equal(c.getState().integrations.billz.status,'UNAVAILABLE');
});

test('L3-b core settings surfaces remain mounted and server-save capable after L3-c extension',async()=>{
  const {createAdminSettingsController,createAdminSettingsView}=await import(url('web/features/admin-settings/settings.js'));
  const p=makePort();const c=createAdminSettingsController({adminPort:p.port,actor:actor()});await c.load();const doc=new FakeDocument();
  const sections=['shop','delivery','payments','returns','branding','integrations'];const expected=['Do‘kon ma’lumotlari','Yetkazib berish','To‘lov usullari','Bekor qilish va qaytarish','Branding','Integratsiyalar'];
  for(let i=0;i<sections.length;i++){c.setSection(sections[i]);const view=createAdminSettingsView({controller:c},doc);assert.match(flatten(view.element).map(n=>n.textContent).join(' | '),new RegExp(expected[i]));}
  c.setSection('shop');c.update('shopContact.name','UI draft');const view=createAdminSettingsView({controller:c},doc);assert.equal(buttonByLabel(view.element,'Saqlash').disabled,false);
});

test('L3-b permission/loading/error states are explicit',async()=>{
  const {createAdminSettingsController,createAdminSettingsView}=await import(url('web/features/admin-settings/settings.js'));
  const none=createAdminSettingsController({adminPort:{invoke:async()=>{throw new Error('network must not be called')}},actor:actor([],'STAFF')});assert.equal((await none.load()).error.code,'FORBIDDEN');
  let view=createAdminSettingsView({controller:none},new FakeDocument());assert.match(flatten(view.element).map(n=>n.textContent).join(' '),/Ruxsat yo‘q/);
  const p=makePort({settingsError:{code:'NETWORK_ERROR',message:'Server yo‘q'}});const c=createAdminSettingsController({adminPort:p.port,actor:actor(['shop.settings.manage'],'STAFF')});await c.load();view=createAdminSettingsView({controller:c},new FakeDocument());assert.match(flatten(view.element).map(n=>n.textContent).join(' '),/Sozlamalarni ochib bo‘lmadi/);
});

test('L3-b reviewed core settings actions remain allowlisted with original permissions',()=>{
  const live=read('web/services/live/admin.js');const api=read('supabase/functions/shop-api/index.ts');
  for(const action of ['get_admin_settings','set_shop_contact','set_low_stock_threshold','set_orders_paused','set_fulfillment_config','set_order_policies','click_get_status','click_test_progress','payme_get_status','payme_test_progress','uzum_get_status']){assert.match(live,new RegExp(`'${action}'`));assert.match(api,new RegExp(action));}
  for(const action of ['set_shop_contact','set_low_stock_threshold','set_orders_paused','set_fulfillment_config','set_order_policies'])assert.match(api,new RegExp(`${action}: 'shop\.settings\.manage'`));
});

test('L3-b settings nav supports settings-only or integrations-only actors; CSS is responsive and frontend keeps credential fields out',async()=>{
  const {createAdminShell}=await import(url('web/shells/admin.js'));const doc=new FakeDocument();
  const integrationsOnly={shop:{name:'Fitcore'},actor:{shopRole:'STAFF',displayName:'Xodim',permissions:['integrations.manage']}};
  const shell=createAdminShell({context:integrationsOnly},doc);assert.ok(shell.visibleNavItems.some(x=>x.id==='settings'));
  const source=read('web/shells/admin.js');const routes=read('web/navigation/routes.js');const css=read('web/styles/features.css');const ui=read('web/features/admin-settings/settings.js');
  assert.match(source,/id: 'settings'[\s\S]*permissionsAny:[\s\S]*shop\.settings\.manage[\s\S]*integrations\.manage[\s\S]*\/admin\/settings/);assert.match(routes,/\/admin\/settings/);assert.match(css,/\.uw-admin-settings/);assert.match(css,/max-width:63\.999rem/);assert.match(css,/max-width:39\.999rem/);
  assert.doesNotMatch(ui,/localStorage|sessionStorage/);assert.match(ui,/Credentiallar faqat ulash tugmasi bosilgan paytda/);assert.match(ui,/finally\{secret\.input\.value='';\}/);
});
