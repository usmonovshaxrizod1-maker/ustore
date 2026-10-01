const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname,'..','..');
const moduleUrl = (file) => pathToFileURL(path.join(root,file)).href;
const fixture = (f) => JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));

class Node {
  constructor(tag){ this.tagName=String(tag).toUpperCase();this.children=[];this.attributes={};this.dataset={};this.listeners={};this.className='';this.textContent='';this.value='';this.disabled=false;this.type='';this.placeholder='';this.style={}; }
  append(...items){ this.children.push(...items); }
  replaceChildren(...items){ this.children=[...items]; }
  setAttribute(k,v){ this.attributes[k]=String(v); }
  addEventListener(k,fn){ this.listeners[k]=fn; }
}
class Doc { createElement(tag){ return new Node(tag); } }
const flat = (n) => [n,...(n.children||[]).flatMap(flat)];
const texts = (n) => flat(n).map(x=>x.textContent).filter(Boolean);
const buttons = (n) => flat(n).filter(x=>x.tagName==='BUTTON');

function owner(){ return fixture('web/fixtures/context/owner-active.json'); }
function basePort(overrides={}){
  return {
    list: async()=>({ok:true,data:[]}),
    add: async()=>({ok:true,data:{id:'new-domain'}}),
    verify: async()=>({ok:true,data:{id:'new-domain'}}),
    setPrimary: async()=>({ok:true,data:{id:'new-domain'}}),
    remove: async()=>({ok:true,data:{removing:true}}),
    ...overrides,
  };
}

test('M2 hostname normalizer safely extracts hostname and rejects wildcard/port input', async()=>{
  const {normalizeDomainInput}=await import(moduleUrl('web/features/domains/domains.js'));
  assert.deepEqual(normalizeDomainInput(' HTTPS://WWW.Fitcore.UZ/catalog?q=1 ').hostname,'www.fitcore.uz');
  assert.equal(normalizeDomainInput(' HTTPS://WWW.Fitcore.UZ/catalog?q=1 ').changed,true);
  assert.equal(normalizeDomainInput('fitcore.uz').valid,true);
  assert.equal(normalizeDomainInput('*.fitcore.uz').valid,false);
  assert.equal(normalizeDomainInput('https://fitcore.uz:8443/path').valid,false);
  assert.equal(normalizeDomainInput('fitcore..uz').valid,false);
});

test('M2 add form shows normalization plus explicit apex/www separate-hostname guidance', async()=>{
  const {createDomainsFeature}=await import(moduleUrl('web/features/domains/domains.js'));
  const feature=createDomainsFeature({port:basePort(),context:owner()},new Doc());
  const open=buttons(feature.element).find(b=>b.textContent==='O‘z domenimni ulash');
  assert.ok(open); open.listeners.click();
  const input=flat(feature.element).find(x=>x.tagName==='INPUT');
  assert.ok(input);
  input.value='HTTPS://WWW.Fitcore.UZ/shop'; input.listeners.input();
  const currentTexts=texts(feature.element);
  assert.ok(currentTexts.includes('Tayyor domen: www.fitcore.uz'));
  assert.ok(currentTexts.includes('Texnik ma’lumot'));
  assert.ok(currentTexts.some(x=>x.includes('fitcore.uz va www.fitcore.uz alohida hostname hisoblanadi')));
});

test('M2 add sends only normalized hostname to existing domains_add port and does not invent paired www/apex add', async()=>{
  const {createDomainsFeature}=await import(moduleUrl('web/features/domains/domains.js'));
  const calls=[]; const toasts=[];
  const port=basePort({
    list:async()=>({ok:true,data:[]}),
    add:async(payload)=>{ calls.push(payload); return {ok:true,data:{id:'d1',hostname:payload.hostname,status:'DRAFT'}}; },
  });
  const feature=createDomainsFeature({port,context:owner(),onToast:(x)=>toasts.push(x)},new Doc());
  buttons(feature.element).find(b=>b.textContent==='O‘z domenimni ulash').listeners.click();
  const input=flat(feature.element).find(x=>x.tagName==='INPUT');
  input.value='https://WWW.Fitcore.UZ/path'; input.listeners.input();
  await buttons(feature.element).find(b=>b.textContent==='Qo‘shish').listeners.click();
  assert.deepEqual(calls,[{hostname:'www.fitcore.uz'}]);
  assert.ok(toasts.some(x=>x.tone==='success' && x.message.includes('Tekshirish')));
});

test('M2 DNS instructions render backend TXT/CNAME/A records and separate apex, www and verification groups', async()=>{
  const {createDomainsFeature}=await import(moduleUrl('web/features/domains/domains.js'));
  const clipboard=[];
  const domain={id:'d1',hostname:'fitcore.uz',kind:'CUSTOM',status:'PENDING_DNS',ownershipVerified:false,dnsStatus:'PENDING',tlsStatus:'UNKNOWN',isPrimary:false,lastCheckedAt:null,errorCode:null,records:[
    {type:'A',name:'fitcore.uz',value:'203.0.113.10',purpose:'ROUTING'},
    {type:'CNAME',name:'www.fitcore.uz',value:'shops.ustore.example',purpose:'ROUTING'},
    {type:'TXT',name:'_ustore-verify.fitcore.uz',value:'verify-token.example',purpose:'OWNERSHIP'},
    {type:'CNAME',name:'_acme-challenge.fitcore.uz',value:'tls-validation.example',purpose:'TLS'},
  ]};
  const feature=createDomainsFeature({port:basePort({list:async()=>({ok:true,data:[domain]})}),context:owner(),clipboard:{writeText:async(v)=>clipboard.push(v)}},new Doc());
  await feature.load();
  const groups=flat(feature.element).filter(x=>x.className==='uw-domain-record-group');
  assert.deepEqual(groups.map(g=>g.dataset.scope),['apex','www','other']);
  const rows=flat(feature.element).filter(x=>x.className==='uw-domain-record');
  assert.deepEqual(rows.map(r=>r.dataset.recordType),['A','CNAME','TXT','CNAME']);
  const allText=texts(feature.element);
  for(const label of ['Apex / ildiz domen','WWW domen','Tasdiqlash va boshqa yozuvlar','Egalikni tasdiqlash','HTTPS sertifikati']) assert.ok(allText.includes(label),label);
  const copyValue=buttons(rows[0]).find(b=>b.textContent==='Qiymatni nusxalash');
  await copyValue.listeners.click();
  assert.deepEqual(clipboard,['203.0.113.10']);
});

test('M2 verify/retry uses existing domains_verify action path and reloads status without fake ACTIVE state', async()=>{
  const {createDomainsFeature}=await import(moduleUrl('web/features/domains/domains.js'));
  let phase=0; const verifyCalls=[];
  const failed={id:'d1',hostname:'fitcore.uz',kind:'CUSTOM',status:'ERROR',dnsStatus:'ERROR',tlsStatus:'UNKNOWN',isPrimary:false,records:[],errorCode:'DNS_NOT_VERIFIED'};
  const pending={...failed,status:'PENDING_DNS',dnsStatus:'PENDING',errorCode:null,records:[{type:'TXT',name:'_verify.fitcore.uz',value:'token',purpose:'OWNERSHIP'}]};
  const port=basePort({
    list:async()=>({ok:true,data:[phase ? pending : failed]}),
    verify:async(payload)=>{ verifyCalls.push(payload); phase=1; return {ok:true,data:pending}; },
  });
  const feature=createDomainsFeature({port,context:owner(),confirm:async()=>true},new Doc());
  await feature.load();
  const retry=buttons(feature.element).find(b=>b.textContent==='Qayta urinish');
  assert.ok(retry); await retry.listeners.click();
  assert.deepEqual(verifyCalls,[{domainId:'d1'}]);
  assert.equal(feature.state.items[0].status,'PENDING_DNS');
  assert.notEqual(feature.state.items[0].status,'ACTIVE');
});

test('M2 stays on the existing 8a-8c domain backend contract',()=>{
  const ui=fs.readFileSync(path.join(root,'web/features/domains/domains.js'),'utf8');
  const live=fs.readFileSync(path.join(root,'web/services/live/domains.js'),'utf8');
  const server=fs.readFileSync(path.join(root,'supabase/functions/_shared/shop-domains.ts'),'utf8');
  for(const action of ['domains_add','domains_verify','domains_list']) assert.match(`${ui}\n${live}`,new RegExp(action));
  assert.match(server,/dns_records: snap\.records/);
  assert.match(server,/String\(record\.type \|\| \(record\.cname \? 'CNAME' : 'TXT'\)\)\.toUpperCase\(\)/);
  assert.doesNotMatch(ui,/domains_add_apex|domains_add_www|m2_dns_records/);
});
