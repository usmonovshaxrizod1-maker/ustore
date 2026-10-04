const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname,'..','..');
const moduleUrl = (file) => `${pathToFileURL(path.join(root,file)).href}?m3=${Date.now()}-${Math.random()}`;
const fixture = (f) => JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));

class Node {
  constructor(tag){ this.tagName=String(tag).toUpperCase();this.children=[];this.attributes={};this.dataset={};this.listeners={};this.className='';this.textContent='';this.value='';this.disabled=false;this.type='';this.placeholder='';this.style={}; }
  append(...items){ this.children.push(...items); }
  replaceChildren(...items){ this.children=[...items]; }
  setAttribute(k,v){ this.attributes[k]=String(v); }
  addEventListener(k,fn){ this.listeners[k]=fn; }
}
class Doc { createElement(tag){ return new Node(tag); } }
const flat=(n)=>[n,...(n.children||[]).flatMap(flat)];
const texts=(n)=>flat(n).map(x=>x.textContent).filter(Boolean);
const buttons=(n)=>flat(n).filter(x=>x.tagName==='BUTTON');
const owner=()=>fixture('web/fixtures/context/owner-active.json');
function port(items,overrides={}){ return {
  list:async()=>({ok:true,data:items}), add:async()=>({ok:true,data:{}}), verify:async()=>({ok:true,data:{}}),
  setPrimary:async()=>({ok:true,data:{}}), remove:async()=>({ok:true,data:{removed:true}}), ...overrides,
}; }

test('M3 lifecycle distinguishes DNS waiting, DNS-ready/TLS-waiting, ACTIVE, ERROR and REMOVING',async()=>{
  const {createDomainsFeature}=await import(moduleUrl('web/features/domains/domains.js'));
  const domains=['pending-dns','pending-tls','active','error','removing'].map(n=>fixture(`web/fixtures/domain/${n}.json`));
  const feature=createDomainsFeature({port:port(domains),context:owner()},new Doc());
  await feature.load();
  const cards=flat(feature.element).filter(x=>x.className==='uw-domain-card');
  assert.equal(cards.length,5);
  const byStatus=Object.fromEntries(cards.map(c=>[c.dataset.status,c]));
  assert.ok(texts(byStatus.PENDING_DNS).some(x=>x.includes('DNS hali tasdiqlanmagan')));
  assert.ok(texts(byStatus.PENDING_TLS).some(x=>x.includes('DNS tasdiqlangan') && x.includes('HTTPS')));
  assert.ok(texts(byStatus.ACTIVE).some(x=>x.includes('DNS va HTTPS tayyor')));
  assert.ok(texts(byStatus.ERROR).some(x=>x.includes('Tekshiruv xato bilan tugadi')));
  assert.ok(texts(byStatus.REMOVING).some(x=>x.includes('Domen uzilmoqda')));
});

test('M3 never offers primary action to inactive domains and only ACTIVE non-primary can be promoted',async()=>{
  const {createDomainsFeature}=await import(moduleUrl('web/features/domains/domains.js'));
  const pending=fixture('web/fixtures/domain/pending-tls.json');
  const active=fixture('web/fixtures/domain/active.json');
  const feature=createDomainsFeature({port:port([pending,active]),context:owner(),confirm:async()=>true},new Doc());
  await feature.load();
  const cards=flat(feature.element).filter(x=>x.className==='uw-domain-card');
  const pendingCard=cards.find(c=>c.dataset.status==='PENDING_TLS');
  const activeCard=cards.find(c=>c.dataset.status==='ACTIVE');
  assert.equal(buttons(pendingCard).some(b=>b.textContent==='Asosiy qilish'),false);
  assert.equal(buttons(activeCard).some(b=>b.textContent==='Asosiy qilish'),true);
  const migration=fs.readFileSync(path.join(root,'supabase/migrations/102_domain_review_safety.sql'),'utf8');
  assert.match(migration,/status<>'ACTIVE' or not v_row\.routing_ready then raise exception 'domain_not_active'/);
});

test('M3 unlink confirmation explains primary and Telegram Mini App fallback impact before remove',async()=>{
  const {createDomainsFeature}=await import(moduleUrl('web/features/domains/domains.js'));
  const domain={...fixture('web/fixtures/domain/active.json'),id:'d-primary',hostname:'fitcore.uz',isPrimary:true};
  const prompts=[]; const removes=[];
  const feature=createDomainsFeature({
    port:port([domain],{
      getMiniAppTarget:async()=>({ok:true,data:{domainId:'d-primary',hostname:'fitcore.uz',customDomainSwitchEnabled:true}}),
      remove:async(payload)=>{removes.push(payload);return {ok:true,data:{removed:true}};},
    }), context:owner(), confirm:async(message)=>{prompts.push(message);return true;},
  },new Doc());
  await feature.load();
  const unlink=buttons(feature.element).find(b=>b.textContent==='Uzish');
  assert.ok(unlink); await unlink.listeners.click();
  assert.equal(prompts.length,1);
  assert.match(prompts[0],/asosiy domen/);
  assert.match(prompts[0],/Telegram Mini App standart UStorE manziliga qaytariladi/);
  assert.deepEqual(removes,[{domainId:'d-primary'}]);
});

test('M3 REMOVING state is read-only apart from copy and cannot verify/primary/remove/open',async()=>{
  const {createDomainsFeature}=await import(moduleUrl('web/features/domains/domains.js'));
  const removing=fixture('web/fixtures/domain/removing.json');
  const feature=createDomainsFeature({port:port([removing]),context:owner()},new Doc());
  await feature.load();
  const card=flat(feature.element).find(x=>x.className==='uw-domain-card');
  const labels=buttons(card).map(b=>b.textContent);
  assert.deepEqual(labels,['','⧉']);
  assert.equal(buttons(card)[0].attributes['aria-expanded'],'true');
  assert.equal(buttons(card)[1].attributes['aria-label'],'Manzilni nusxalash');
});

test('M3 no-permission state remains explicit and does not fetch domains',async()=>{
  const {createDomainsFeature}=await import(moduleUrl('web/features/domains/domains.js'));
  let listCalls=0;
  const feature=createDomainsFeature({port:port([], {list:async()=>{listCalls++;return {ok:true,data:[]};}}),context:fixture('web/fixtures/context/staff-limited-active.json')},new Doc());
  await feature.load();
  assert.equal(listCalls,0);
  assert.ok(texts(feature.element).includes('Domenlarni boshqarish huquqi yo‘q'));
});

test('M3 shared component exposes Telegram mobile-sheet mode while web stays page mode',async()=>{
  const {createDomainsFeature}=await import(moduleUrl('web/features/domains/domains.js'));
  const webFeature=createDomainsFeature({port:port([]),context:owner()},new Doc());
  const telegramContext=JSON.parse(JSON.stringify(owner())); telegramContext.mode='telegram';
  const tgFeature=createDomainsFeature({port:port([]),context:telegramContext},new Doc());
  assert.equal(webFeature.element.dataset.mode,'web');
  assert.equal(tgFeature.element.dataset.mode,'telegram');
  assert.match(tgFeature.element.className,/is-telegram/);
  const css=fs.readFileSync(path.join(root,'web/styles/features.css'),'utf8');
  assert.match(css,/\.uw-domains\.is-telegram/);
  const app=fs.readFileSync(path.join(root,'ustore-shop-app.js'),'utf8');
  assert.match(app,/createDomainsFeature\([\s\S]{0,500}context, language: uiLang/);
});
