const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..', '..');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function memoryStorage() {
  const values = new Map();
  return { getItem:(key)=>values.get(key) ?? null, setItem:(key,value)=>values.set(key,String(value)), removeItem:(key)=>values.delete(key) };
}

class FakeNode {
  constructor(tag='div') { this.tagName=String(tag).toUpperCase(); this.children=[]; this.attributes={}; this.dataset={}; this.className=''; this.textContent=''; this.listeners={}; this.style={}; }
  append(...items){ this.children.push(...items); }
  setAttribute(name,value){ this.attributes[name]=String(value); }
  addEventListener(name,fn){ this.listeners[name]=fn; }
}
class FakeDocument { createElement(tag){ return new FakeNode(tag); } }
function flatten(node){ return [node,...(node.children||[]).filter((item)=>item&&typeof item==='object').flatMap(flatten)]; }

test('web public catalog requests the tenant-scoped active bundle projection', async () => {
  const { createLiveShopPublicAdapters } = await import(moduleUrl('web/services/live/shop-public.js'));
  const calls=[];
  const fetchImpl=async(_url,init)=>{
    const body=JSON.parse(init.body); calls.push(body);
    return { ok:true, status:200, json:async()=>({ bundles:[{ id:'b1', name:'Set', bundlePrice:200, resolvedItems:[] }] }) };
  };
  const adapters=createLiveShopPublicAdapters({endpoint:'https://api.example/functions/v1/shop-api',botId:'12345',fetchImpl});
  const listed=await adapters.catalog.listBundles();
  const detail=await adapters.catalog.getBundle({bundleId:'b1'});
  assert.equal(listed.ok,true); assert.equal(listed.data.items[0].id,'b1'); assert.equal(detail.ok,true);
  assert.deepEqual(calls.map(({action,clientMode,botId})=>({action,clientMode,botId})),[
    {action:'get_web_bundles',clientMode:'web',botId:'12345'},
    {action:'get_web_bundles',clientMode:'web',botId:'12345'},
  ]);
});

test('bundle detail builds one BUNDLE cart line with composition, current price and savings', async () => {
  const { createBundleDetailController, createBundleDetailView } = await import(moduleUrl('web/features/bundle/bundle.js'));
  const bundle={id:'b1',name:'Start set',description:'Demo',bundlePrice:430,regularTotal:500,savings:70,resolvedItems:[
    {productId:'p1',name:'Protein',qty:1,img:'https://img.example/p1.webp',price:400},
    {productId:'p2',name:'Shaker',qty:2,img:null,price:50},
  ]};
  let sent=null;
  const controller=createBundleDetailController({catalogPort:{getBundle:async()=>({ok:true,data:bundle})},bundleId:'b1',onAddToCart:async(line)=>{sent=line;return {ok:true,data:{}};}});
  assert.equal((await controller.load()).ok,true); assert.equal((await controller.addToCart()).ok,true);
  assert.deepEqual(sent,{bundleId:'b1',quantity:1,name:'Start set',bundleName:'Start set',unitPrice:430,regularTotal:500,savings:70,imageUrl:'https://img.example/p1.webp',optionLabel:'Protein + Shaker × 2'});
  const view=createBundleDetailView({bundle},new FakeDocument());
  const text=flatten(view.element).map((node)=>node.textContent).join(' | ');
  assert.match(text,/To‘plam tarkibi/); assert.match(text,/70 so‘m tejaysiz/); assert.match(text,/To‘plamni savatga qo‘shish/);
  assert.equal(flatten(view.element).filter((node)=>node.tagName==='IMG').length,1);
});

test('guest bundle line stays one bundle and never merges with an ordinary component product', async () => {
  const { createCartController, createGuestCartStore } = await import(moduleUrl('web/features/cart/cart.js'));
  const unexpected=async()=>{throw new Error('guest must not call private cart');};
  const controller=createCartController({cartPort:{load:unexpected,mergeGuest:unexpected,addLine:unexpected,updateLine:unexpected,clear:unexpected,quote:unexpected},shopId:'s1',guestStore:createGuestCartStore(memoryStorage()),authenticated:false});
  await controller.addLine({productId:'p1',quantity:1,name:'Protein',unitPrice:400});
  await controller.addLine({bundleId:'b1',quantity:1,name:'Start set',unitPrice:430});
  await controller.addLine({bundleId:'b1',quantity:1,name:'Start set',unitPrice:430});
  const lines=controller.getState().cart.lines;
  assert.equal(lines.length,2); assert.equal(lines.find((line)=>line.bundleId==='b1').quantity,2); assert.equal(lines.find((line)=>line.productId==='p1').quantity,1);
});

test('authenticated cart hydrates backend bundle identifiers with name, contents, price and savings', async () => {
  const { createCartController } = await import(moduleUrl('web/features/cart/cart.js'));
  const raw={shopId:'s1',currency:'UZS',lines:[{bundleId:'b1',quantity:1}]};
  const bundle={id:'b1',name:'Start set',bundlePrice:430,regularTotal:500,savings:70,coverImageUrl:'https://img.example/set.webp',resolvedItems:[{productId:'p1',name:'Protein',qty:1},{productId:'p2',name:'Shaker',qty:1}]};
  const controller=createCartController({cartPort:{load:async()=>({ok:true,data:raw}),mergeGuest:async()=>({ok:true,data:raw}),addLine:async()=>({ok:true,data:raw}),updateLine:async()=>({ok:true,data:raw}),clear:async()=>({ok:true,data:{cleared:true}}),quote:async()=>({ok:true,data:{subtotal:430,total:430,serverAuthoritative:true}})},catalogPort:{getProduct:async()=>({ok:false}),getBundle:async()=>({ok:true,data:bundle})},shopId:'s1',authenticated:true});
  assert.equal((await controller.load()).ok,true);
  const line=controller.getState().cart.lines[0];
  assert.equal(line.kind,'BUNDLE'); assert.equal(line.name,'Start set'); assert.equal(line.unitPrice,430); assert.equal(line.regularTotal,500); assert.equal(line.savings,70); assert.equal(line.optionLabel,'Protein + Shaker');
});

test('Supabase web public branch exposes only the filtered bundle projection while checkout stays authoritative', () => {
  const api=read('supabase/functions/shop-api/index.ts');
  assert.match(api,/async function publicWebBundles/);
  assert.match(api,/\.eq\("shop_id", shopId\)\.eq\("is_active", true\)/);
  assert.match(api,/availableProductStock\(product\) < qty/);
  assert.match(api,/action === "get_web_bundles"/);
  assert.match(api,/buildWebAuthoritativeCart[\s\S]*from\("bundles"\)/);
});

test('customer route wires home card and bundle detail through the existing cart controller', () => {
  const app=read('web/app.js'); const routes=read('web/navigation/routes.js');
  assert.match(routes,/id: 'bundle', path: '\/bundle\/:bundleId'/);
  assert.match(app,/onAddBundle:async\(bundle\)=>/);
  assert.match(app,/bundleMod\.bundleCartLine\(bundle\)/);
  assert.match(app,/createBundleDetailController/);
  assert.match(app,/onAddToCart:\(line\)=>cartController\.addLine\(line\)/);
});
