const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname,'..','..');
const read = (f) => fs.readFileSync(path.join(root,f),'utf8');
const fixture = (f) => JSON.parse(read(f));
const moduleUrl = (file) => `${pathToFileURL(path.join(root,file)).href}?m1=${Date.now()}-${Math.random()}`;

class Node {
  constructor(tag){ this.tagName=String(tag).toUpperCase();this.children=[];this.attributes={};this.dataset={};this.listeners={};this.className='';this.textContent='';this.value='';this.disabled=false;this.style={};this.href='';this.type='';this.tabIndex=0; }
  append(...items){ this.children.push(...items); }
  replaceChildren(...items){ this.children=[...items]; }
  setAttribute(k,v){ this.attributes[k]=String(v); }
  addEventListener(k,fn){ this.listeners[k]=fn; }
}
class Doc { createElement(tag){ return new Node(tag); } }
function flat(n){ return [n,...(n.children||[]).flatMap(flat)]; }
function textNodes(rootNode){ return flat(rootNode).map((x)=>x.textContent).filter(Boolean); }

function domainPort(calls, domains){
  return {
    list: async()=>{ calls.push(['list']); return {ok:true,data:domains}; },
    add: async(payload)=>{ calls.push(['add',payload]); return {ok:true,data:{}}; },
    verify: async(payload)=>{ calls.push(['verify',payload]); return {ok:true,data:{}}; },
    setPrimary: async(payload)=>{ calls.push(['primary',payload]); return {ok:true,data:{}}; },
    remove: async(payload)=>{ calls.push(['remove',payload]); return {ok:true,data:{}}; },
  };
}

test('M1 premium admin route wires domain feature as loadable controller so mounted page actually fetches current domains',()=>{
  const app=read('web/app.js');
  assert.match(app,/admin-domains'[\s\S]{0,260}createAdminDomainsPage\(\{services:shopRuntime\.services,context,language:uiLocale\}\);controller=view;title='Domenlar'/);
  assert.match(app,/if\(controller\?\.load\) await controller\.load/);
});

test('M1 domain component shows current UStorE subdomain first with copy/open and primary marker',async()=>{
  const {createDomainsFeature}=await import(moduleUrl('web/features/domains/domains.js'));
  const calls=[]; const clipboardCalls=[]; const openCalls=[];
  const domains=[
    {id:'custom',hostname:'fitcore.uz',kind:'CUSTOM',status:'ACTIVE',dnsStatus:'VERIFIED',tlsStatus:'ACTIVE',isPrimary:false,records:[]},
    {id:'sub',hostname:'fitcore.ustore.uz',kind:'SUBDOMAIN',status:'ACTIVE',dnsStatus:'VERIFIED',tlsStatus:'ACTIVE',isPrimary:true,records:[]},
  ];
  const feature=createDomainsFeature({
    port:domainPort(calls,domains),
    context:fixture('web/fixtures/context/owner-active.json'),
    clipboard:{writeText:async(v)=>clipboardCalls.push(v)},
    openUrl:(url)=>openCalls.push(url),
  },new Doc());
  await feature.load();
  assert.equal(calls.filter(x=>x[0]==='list').length,1);
  const cards=flat(feature.element).filter(x=>x.className==='uw-domain-card');
  assert.equal(cards.length,2);
  const firstTexts=textNodes(cards[0]);
  assert.ok(firstTexts.includes('fitcore.ustore.uz'));
  assert.ok(firstTexts.includes('UStorE manzili'));
  assert.ok(firstTexts.includes('Asosiy'));
  const buttons=flat(cards[0]).filter(x=>x.tagName==='BUTTON');
  const copyButton=buttons.find(x=>x.attributes?.['aria-label']==='Manzilni nusxalash');
  const openButton=buttons.find(x=>x.textContent==='Ochish');
  assert.ok(copyButton); assert.ok(openButton);
  await copyButton.listeners.click();
  openButton.listeners.click();
  assert.deepEqual(clipboardCalls,['fitcore.ustore.uz']);
  assert.deepEqual(openCalls,['https://fitcore.ustore.uz']);
});

test('M1 admin navigation exposes Domenlar to OWNER and system MANAGER, not limited staff',async()=>{
  const {createAdminShell}=await import(moduleUrl('web/shells/admin.js'));
  const doc=new Doc();
  const content=doc.createElement('div');
  const owner=createAdminShell({context:fixture('web/fixtures/context/owner-active.json'),content},doc);
  const manager=createAdminShell({context:fixture('web/fixtures/context/manager-active.json'),content},doc);
  const staff=createAdminShell({context:fixture('web/fixtures/context/staff-limited-active.json'),content},doc);
  const hasDomains=(shell)=>shell.visibleNavItems.some(x=>x.id==='domains'&&x.href==='/admin/domains');
  assert.equal(hasDomains(owner),true);
  assert.equal(hasDomains(manager),true);
  assert.equal(hasDomains(staff),false);
});

test('M1 stays on existing domain contract and does not invent a second M1 backend API',()=>{
  const ui=read('web/features/domains/domains.js');
  const live=read('web/services/live/domains.js');
  for(const action of ['domains_list','domains_add','domains_verify','domains_set_primary','domains_remove']) {
    assert.match(`${ui}\n${live}`,new RegExp(action));
  }
  assert.doesNotMatch(ui,/m1_domain|domains_m1|current_subdomain_get/);
});
