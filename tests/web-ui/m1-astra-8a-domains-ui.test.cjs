const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname,'..','..');
const moduleUrl = (file) => pathToFileURL(path.join(root,file)).href;
const read = (f) => fs.readFileSync(path.join(root,f),'utf8');
const fixture = (f) => JSON.parse(read(f));

class Node {
  constructor(tag){ this.tagName=String(tag).toUpperCase();this.children=[];this.attributes={};this.dataset={};this.listeners={};this.className='';this.textContent='';this.value='';this.disabled=false;this.style={}; }
  append(...items){ this.children.push(...items); }
  replaceChildren(...items){ this.children=[...items]; }
  setAttribute(k,v){ this.attributes[k]=String(v); }
  addEventListener(k,fn){ this.listeners[k]=fn; }
}
class Doc { createElement(tag){ return new Node(tag); } }
function flat(n){ return [n,...(n.children||[]).flatMap(flat)]; }

test('8a shared domain feature grants OWNER and system MANAGER, not limited staff', async()=>{
  const {createDomainsFeature}=await import(moduleUrl('web/features/domains/domains.js'));
  const port={list:async()=>({ok:true,data:[]}),add:async()=>({ok:true,data:{}}),verify:async()=>({ok:true,data:{}}),setPrimary:async()=>({ok:true,data:{}}),remove:async()=>({ok:true,data:{}})};
  const owner=createDomainsFeature({port,context:fixture('web/fixtures/context/owner-active.json')},new Doc());
  const manager=createDomainsFeature({port,context:fixture('web/fixtures/context/manager-active.json')},new Doc());
  const staff=createDomainsFeature({port,context:fixture('web/fixtures/context/staff-limited-active.json')},new Doc());
  assert.equal(owner.canManage(),true);assert.equal(manager.canManage(),true);assert.equal(staff.canManage(),false);
});

test('8a domain list keeps DNS and HTTPS as separate states and exposes provider records', async()=>{
  const {createDomainsFeature}=await import(moduleUrl('web/features/domains/domains.js'));
  const calls=[];const port={
    list:async()=>({ok:true,data:[{id:'d1',hostname:'fitcore.ustore.uz',kind:'SUBDOMAIN',status:'ACTIVE',ownershipVerified:true,dnsStatus:'VERIFIED',tlsStatus:'ACTIVE',isPrimary:true,records:[],lastCheckedAt:null,errorCode:null},{id:'d2',hostname:'fitcore.uz',kind:'CUSTOM',status:'PENDING_TLS',ownershipVerified:true,dnsStatus:'VERIFIED',tlsStatus:'PENDING',isPrimary:false,records:[{type:'TXT',name:'_cf-custom-hostname.fitcore.uz',value:'token',purpose:'OWNERSHIP'}],lastCheckedAt:null,errorCode:null}]}),
    add:async x=>(calls.push(['add',x]),{ok:true,data:{}}),verify:async x=>(calls.push(['verify',x]),{ok:true,data:{}}),setPrimary:async x=>(calls.push(['primary',x]),{ok:true,data:{}}),remove:async x=>(calls.push(['remove',x]),{ok:true,data:{}})
  };
  const feature=createDomainsFeature({port,context:fixture('web/fixtures/context/owner-active.json')},new Doc());
  await feature.load();
  assert.equal(feature.state.items.length,2);
  const texts=flat(feature.element).map(x=>x.textContent).filter(Boolean);
  assert.ok(texts.includes('DNS'));assert.ok(texts.includes('HTTPS'));assert.ok(texts.includes('fitcore.uz'));assert.ok(texts.includes('_cf-custom-hostname.fitcore.uz'));
});

test('8a Mini App adapter maps shared UI actions to existing server domain actions', async()=>{
  const {createMiniAppDomainsPort}=await import(moduleUrl('web/features/domains/domains.js'));
  const calls=[];const port=createMiniAppDomainsPort(async(action,payload)=>{calls.push([action,payload]); if(action==='domains_list')return {items:[]}; return {domain:{id:'d1'}};});
  await port.list();await port.add({hostname:'fitcore.uz'});await port.changeSubdomain({slug:'fitshop'});await port.verify({domainId:'d1'});await port.setPrimary({domainId:'d1'});await port.remove({domainId:'d1'});
  assert.deepEqual(calls.map(x=>x[0]),['domains_list','domains_add','domains_change_slug','domains_verify','domains_set_primary','domains_remove']);
});

test('8a premium web has route/nav and shared feature exposes copy, verify/retry, primary and unlink controls',()=>{
  const route=read('web/navigation/routes.js');const shell=read('web/shells/admin.js');const ui=read('web/features/domains/domains.js');const css=read('web/styles/features.css');
  assert.match(route,/\/admin\/domains/);assert.match(shell,/permission: 'domains\.manage'.*\/admin\/domains/);
  for(const phrase of ['O‘z domenimni ulash','Subdomenni almashtirish','Manzilni nusxalash','Tekshirish','Qayta urinish','Asosiy qilish','Uzish','DNS','HTTPS'])assert.match(ui,new RegExp(phrase));
  assert.match(css,/uw-domain-card/);assert.match(css,/max-width:47\.999rem/);
});

test('8a existing Mini App mounts the same shared domain component only for OWNER/MANAGER',()=>{
  const app=read('ustore-shop-app.js');
  assert.match(app,/case 'DOMAINS_SETTINGS': renderDomainsSettingsPage/);
  assert.match(app,/import\('\.\/web\/features\/domains\/index\.js(?:\?[^']+)?'\)/);
  assert.match(app,/createMiniAppDomainsPort\(callApi\)/);
  assert.match(app,/staffRole === 'OWNER'.*canViewAuditLog.*domains\.manage/);
  assert.match(app,/openDomainsSettingsPage\(\)/);
  assert.match(app,/page === 'DOMAINS_SETTINGS'/);
});

test('8a server keeps fresh domains.manage gate and audits successful verify/primary/remove actions',()=>{
  const helper=read('supabase/functions/_shared/shop-domains.ts');const api=read('supabase/functions/shop-api/index.ts');const migration=read('supabase/migrations/097_shop_domain_registry.sql');
  assert.match(helper,/ustore_can_manage_domains/);assert.match(migration,/DOMAIN_RESERVED/);
  assert.match(api,/DOMAIN_VERIFY_REQUESTED/);assert.match(api,/DOMAIN_PRIMARY_CHANGED/);assert.match(api,/DOMAIN_REMOVE_REQUESTED/);
  assert.match(api,/domains_verify: 'domains\.manage'/);assert.match(api,/domains_set_primary: 'domains\.manage'/);assert.match(api,/domains_remove: 'domains\.manage'/);
});
