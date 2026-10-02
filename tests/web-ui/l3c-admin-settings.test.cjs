const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..','..');
const url=(f)=>pathToFileURL(path.join(root,f)).href;
const read=(f)=>fs.readFileSync(path.join(root,f),'utf8');
function actor(perms=['*'],shopRole='OWNER'){return{shopRole,permissions:perms};}
function settings(){return{
  shopContact:{name:'Fitcore',address:'Sergeli',phone:'+998901112233'},
  branding:{logoUrl:null,logoType:'WORDMARK',logoWordmark:{presetId:'clean',text:'FITCORE',textColor:'#ffffff',backgroundColor:'#0f172a'},startMessage:'Salom',startImageUrl:'https://managed.example/start.jpg'},
  fulfillmentConfig:{version:1,delivery:{},payments:{methods:[]}},designSettings:{themeId:'minimal',colors:{primary:'#2563eb'}},ordersPaused:false,ordersPausedNote:'',lowStockThreshold:5,
  orderPolicies:{customerCancelCutoff:'BEFORE_SHIPPED',returnRequestsEnabled:true,returnWindowDays:7,returnPolicyText:''},discountPolicy:{}
};}
function makePort({failAction=null,unavailable=null}={}){
  const calls=[];let click={status:'DISCONNECTED',merchantId:null,serviceId:null,verified:false};let clickProgress={verified:false,confirmedCount:0,pending:null};
  let payme={status:'DISCONNECTED',merchantId:null,login:null,verified:false};let paymeProgress={verified:false,confirmedCount:0,pending:null};let uzum={status:'DISCONNECTED',terminalId:null};
  return{calls,port:{async invoke(action,payload={}){calls.push({action,payload:structuredClone(payload)});if(action===failAction)return{ok:false,error:{code:'NETWORK_ERROR',message:'xato'}};
    if(action==='get_admin_settings')return{ok:true,data:settings()};
    if(action==='billz_get_status')return unavailable==='billz'?{ok:false,error:{code:'FORBIDDEN',message:'closed'}}:{ok:true,data:{status:'DISCONNECTED'}};
    if(action==='click_get_status')return unavailable==='click'?{ok:false,error:{code:'FORBIDDEN',message:'closed'}}:{ok:true,data:structuredClone(click)};
    if(action==='click_connect'){click={status:'CONNECTED',merchantId:payload.merchantId,serviceId:payload.serviceId,verified:false};clickProgress={verified:false,confirmedCount:0,pending:null};return{ok:true,data:{ok:true,status:'CONNECTED'}};}
    if(action==='click_disconnect'){click={...click,status:'DISCONNECTED',verified:false};return{ok:true,data:{ok:true}};}
    if(action==='click_start_test_payment'){clickProgress={...clickProgress,pending:{id:'t1',amount:payload.amount}};return{ok:true,data:{ok:true,testRunId:'t1',invoiceId:'i1',attemptNumber:1}};}
    if(action==='click_test_progress')return{ok:true,data:structuredClone(clickProgress)};
    if(action==='payme_get_status')return{ok:true,data:structuredClone(payme)};
    if(action==='payme_connect'){payme={status:'CONNECTED',merchantId:payload.merchantId,login:payload.login,verified:false};return{ok:true,data:{ok:true,status:'CONNECTED'}};}
    if(action==='payme_disconnect'){payme={...payme,status:'DISCONNECTED',verified:false};return{ok:true,data:{ok:true}};}
    if(action==='payme_start_test_payment'){paymeProgress={...paymeProgress,pending:{id:'p1',amount:payload.amount}};return{ok:true,data:{ok:true,testRunId:'p1',checkoutUrl:'https://demo.example/payme',attemptNumber:1}};}
    if(action==='payme_test_progress')return{ok:true,data:structuredClone(paymeProgress)};
    if(action==='uzum_get_status')return{ok:true,data:structuredClone(uzum)};
    if(action==='uzum_connect'){uzum={status:'CONNECTED',terminalId:payload.terminalId};return{ok:true,data:{ok:true,status:'CONNECTED'}};}
    if(action==='uzum_disconnect'){uzum={...uzum,status:'DISCONNECTED'};return{ok:true,data:{ok:true}};}
    if(action==='set_design_settings')return{ok:true,data:{ok:true,designSettings:{themeId:payload.themeId,colors:structuredClone(payload.colors)}}};
    if(action==='set_start_message')return{ok:true,data:{ok:true,startMessage:payload.startMessage||'',startImageUrl:payload.removeStartImage?null:'https://managed.example/start.jpg'}};
    if(action==='set_shop_logo')return{ok:true,data:{ok:true,branding:{logoType:payload.logoType,logoUrl:payload.logoUrl||null,logoWordmark:structuredClone(payload.wordmark||null)}}};
    return{ok:false,error:{code:'CAPABILITY_UNAVAILABLE',message:action}};
  }}};
}
class FakeStyle{setProperty(n,v){this[n]=String(v)}}
class FakeNode{constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.dataset={};this.style=new FakeStyle();this.className='';this.textContent='';this.value='';this.listeners={};this.disabled=false;this.checked=false;this.type='';this.title='';}append(...x){this.children.push(...x)}setAttribute(n,v){this.attributes[n]=String(v)}addEventListener(n,fn){this.listeners[n]=fn}}
class FakeDocument{createElement(tag){return new FakeNode(tag)}}
function flatten(node,out=[]){if(node&&typeof node==='object'){out.push(node);for(const c of node.children||[])if(c&&typeof c==='object')flatten(c,out);}return out;}

async function loaded(portOpts={}){const {createAdminSettingsController}=await import(url('web/features/admin-settings/settings.js'));const p=makePort(portOpts);const c=createAdminSettingsController({adminPort:p.port,actor:actor(),locale:'uz'});await c.load();return{p,c};}

test('L3-c language switch is explicitly client-only and invokes no server mutation',async()=>{
  const {createAdminSettingsController}=await import(url('web/features/admin-settings/settings.js'));const p=makePort();let chosen=null;const c=createAdminSettingsController({adminPort:p.port,actor:actor(),locale:'uz',onLocaleChange:(x)=>chosen=x});await c.load();const before=p.calls.length;
  const r=c.setClientLocale('ru');assert.equal(r.ok,true);assert.equal(r.data.persisted,false);assert.equal(c.getState().locale,'ru');assert.equal(chosen,'ru');assert.equal(p.calls.length,before);
});

test('L3-c branding saves design, start content and wordmark through reviewed server actions',async()=>{
  const {p,c}=await loaded();c.update('designSettings.themeId','dark');c.update('designSettings.colors.primary','#112233');c.update('branding.startMessage','Yangi start');c.update('branding.startImageUrl',null);c.update('branding.logoWordmark.text','USTORE');
  const r=await c.saveSection('branding');assert.equal(r.ok,true);assert.equal(c.isDirty('branding'),false);for(const action of ['set_design_settings','set_start_message','set_shop_logo'])assert.ok(p.calls.some(x=>x.action===action),action);
  const start=p.calls.find(x=>x.action==='set_start_message');assert.equal(start.payload.removeStartImage,true);assert.equal(c.getState().saved.branding.startImageUrl,null);
});

test('L3-c branding validation blocks invalid hex before any branding mutation',async()=>{
  const {p,c}=await loaded();c.update('branding.logoWordmark.textColor','red');const before=p.calls.length;const r=await c.saveSection('branding');assert.equal(r.ok,false);assert.equal(r.error.code,'VALIDATION_ERROR');assert.equal(p.calls.length,before);assert.equal(c.isDirty('branding'),true);
});

test('L3-c partial branding failure keeps draft dirty but retains already-confirmed design canonical',async()=>{
  const {createAdminSettingsController}=await import(url('web/features/admin-settings/settings.js'));const p=makePort({failAction:'set_start_message'});const c=createAdminSettingsController({adminPort:p.port,actor:actor()});await c.load();c.update('designSettings.themeId','dark');c.update('branding.startMessage','Draft qoladi');const r=await c.saveSection('branding');assert.equal(r.ok,false);assert.equal(c.getState().saved.designSettings.themeId,'dark');assert.equal(c.getState().saved.branding.startMessage,'Salom');assert.equal(c.getState().draft.branding.startMessage,'Draft qoladi');assert.equal(c.isDirty('branding'),true);
});

test('L3-c integration credentials are one-shot payloads and never enter controller state',async()=>{
  const {p,c}=await loaded();const secret='SUPER-SECRET-CLICK';const r=await c.connectIntegration('click',{merchantId:'m2',serviceId:'s2',merchantUserId:'u2',secretKey:secret});assert.equal(r.ok,true);const call=p.calls.find(x=>x.action==='click_connect');assert.equal(call.payload.secretKey,secret);const serialized=JSON.stringify(c.getState());assert.equal(serialized.includes(secret),false);assert.equal(serialized.includes('secretKey'),false);assert.equal(c.getState().integrations.click.details.merchantId,'m2');
});

test('L3-c unavailable provider refuses connect before credential mutation call',async()=>{
  const {p,c}=await loaded({unavailable:'click'});const before=p.calls.filter(x=>x.action==='click_connect').length;const r=await c.connectIntegration('click',{merchantId:'m',serviceId:'s',merchantUserId:'u',secretKey:'k'});assert.equal(r.ok,false);assert.equal(r.error.code,'CAPABILITY_UNAVAILABLE');assert.equal(p.calls.filter(x=>x.action==='click_connect').length,before);
});

test('L3-c disconnect needs confirmation and Click/Payme tests use existing contracts',async()=>{
  const {p,c}=await loaded();await c.connectIntegration('click',{merchantId:'m',serviceId:'s',merchantUserId:'u',secretKey:'k'});assert.equal((await c.disconnectIntegration('click')).error.code,'VALIDATION_ERROR');assert.equal(p.calls.some(x=>x.action==='click_disconnect'),false);const testClick=await c.startIntegrationTest('click',{amount:1000,phoneNumber:'+998 90 123 45 67'});assert.equal(testClick.ok,true);assert.equal(p.calls.find(x=>x.action==='click_start_test_payment').payload.phoneNumber,'998901234567');
  await c.connectIntegration('payme',{merchantId:'pm',login:'login',password:'pw'});const testPayme=await c.startIntegrationTest('payme',{amount:1200});assert.equal(testPayme.ok,true);assert.match(testPayme.data.checkoutUrl,/^https:\/\//);assert.equal((await c.disconnectIntegration('payme',{confirmed:true})).ok,true);
});

test('L3-c view has client-only language, managed branding and ephemeral secret inputs without arbitrary logo URL',async()=>{
  const {createAdminSettingsView}=await import(url('web/features/admin-settings/settings.js'));const {c}=await loaded();const doc=new FakeDocument();c.setSection('language');let view=createAdminSettingsView({controller:c},doc);let text=flatten(view.element).map(n=>n.textContent).join(' | ');assert.match(text,/joriy web klientiga/);assert.equal(flatten(view.element).some(n=>n.tagName==='BUTTON'&&n.textContent==='Saqlash'),false);
  c.setSection('branding');view=createAdminSettingsView({controller:c},doc);text=flatten(view.element).map(n=>n.textContent).join(' | ');assert.match(text,/tashqi URL/i);assert.equal(flatten(view.element).some(n=>String(n.attributes?.placeholder||'').includes('http')),false);
  c.setSection('integrations');view=createAdminSettingsView({controller:c},doc);assert.ok(flatten(view.element).some(n=>n.type==='password'));
});

test('L3-c live/server allowlists expose only reviewed branding and integration mutations with proper permissions',()=>{
  const live=read('web/services/live/admin.js');const api=read('supabase/functions/shop-api/index.ts');
  for(const action of ['set_design_settings','set_shop_logo','set_start_message','click_connect','click_disconnect','click_start_test_payment','payme_connect','payme_disconnect','payme_start_test_payment','uzum_connect','uzum_disconnect'])assert.match(live,new RegExp(`'${action}'`));
  for(const action of ['set_design_settings','set_shop_logo','set_start_message'])assert.match(api,new RegExp(`${action}: 'shop\\.settings\\.manage'`));
  for(const action of ['click_connect','click_disconnect','click_start_test_payment','payme_connect','payme_disconnect','payme_start_test_payment','uzum_connect','uzum_disconnect'])assert.match(api,new RegExp(`${action}: 'integrations\\.manage'`));
  assert.match(api,/set_shop_logo[\s\S]*invalid_logo_source/);assert.match(api,/branding: \{ logoType, logoUrl: newLogoUrl/);
});

test('L3-c mock adapter supports safe integration lifecycle without returning secret credentials',async()=>{
  const {createMockAdminAdapter}=await import(url('web/services/mock/admin.js'));const m=createMockAdminAdapter();await m.invoke('click_connect',{merchantId:'m',serviceId:'s',merchantUserId:'u',secretKey:'never-return'});let r=await m.invoke('click_get_status');assert.equal(r.ok,true);assert.equal(JSON.stringify(r.data).includes('never-return'),false);assert.equal(r.data.status,'CONNECTED');await m.invoke('click_disconnect',{});r=await m.invoke('click_get_status');assert.equal(r.data.status,'DISCONNECTED');
  await m.invoke('uzum_connect',{terminalId:'t',apiKey:'also-never-return'});r=await m.invoke('uzum_get_status');assert.equal(JSON.stringify(r.data).includes('also-never-return'),false);assert.equal(r.data.terminalId,'t');
});

test('L3-c source does not persist integration secrets in browser storage and clears secret fields after submit',()=>{
  const ui=read('web/features/admin-settings/settings.js');assert.doesNotMatch(ui,/localStorage|sessionStorage/);assert.match(ui,/finally\{secret\.input\.value='';\}/);assert.match(ui,/finally\{pass\.input\.value='';\}/);assert.match(ui,/finally\{api\.input\.value='';\}/);
});
