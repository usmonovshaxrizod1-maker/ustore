const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const commerceContext = { module: { exports: {} } }; vm.createContext(commerceContext);
vm.runInContext(fs.readFileSync('ustore-commerce.js','utf8'), commerceContext);
const commerce = commerceContext.module.exports;
const api = fs.readFileSync('supabase/functions/shop-api/index.ts','utf8');

test('checkout validation points to the earlier step and normalizes Uzbek phone', () => {
  const base={fullname:'Ali Valiyev',phone:'+998 90 123 45 67',regionKey:'tashkent_city',district:'Bektemir',address:'Uy 1',deliveryMethodId:'FIXED',paymentMethodId:'CARD'};
  assert.equal(commerce.validateCheckoutFields(base).error,null);
  assert.deepEqual(JSON.parse(JSON.stringify(commerce.validateCheckoutFields({...base,address:''}).error)),{field:'chk-address',step:1,code:'address_required'});
  assert.equal(commerce.validateCheckoutFields({...base,phone:'+998'}).error.field,'chk-phone');
  assert.equal(commerce.validateCheckoutFields({...base,deliveryMethodId:'POST:BTS',address:'',district:'',branch:{id:4}}).error,null);
});

test('private receipt upload verifies stored object, not just a preview', async () => {
  const fn=api.slice(api.indexOf('async function storePaymentReceipt('),api.indexOf('\nfunction nullableText',api.indexOf('async function storePaymentReceipt(')));
  const context={atob,Uint8Array,crypto:require('node:crypto').webcrypto};
  vm.createContext(context); vm.runInContext(ts.transpile(fn+'\nglobalThis.storePaymentReceipt=storePaymentReceipt;'),context);
  let listCalls=0; const bucket={upload:async()=>({error:null}),list:async()=>{listCalls++;return{data:[],error:null}},remove:async()=>({error:null})};
  const db={storage:{from:()=>bucket}};
  await assert.rejects(context.storePaymentReceipt(db,'shop',1,'tg',{mimeType:'image/png',base64:Buffer.from([137,80,78,71,13,10,26,10,0]).toString('base64')}),/receipt_storage_verify_failed/);
  assert.equal(listCalls,1);
});

test('receipt failure cannot create or cancel an order', () => {
  const create=api.slice(api.indexOf('case "create_order":'),api.indexOf('case "cancel_order":',api.indexOf('case "create_order":')));
  assert.ok(create.indexOf('await storePaymentReceipt') < create.indexOf('db.rpc("ustore_create_checkout_order"'));
  assert.doesNotMatch(create,/p_cancel_reason: "To'lov cheki yuklanmadi"/);
  assert.match(create,/checkout_key.*checkoutKey/s);
});
test('hidden earlier-step controls cannot erase the saved name, address or phone on receipt retry',()=>{
 const source=fs.readFileSync('ustore-shop-app.js','utf8');
 const fn=source.slice(source.indexOf('    function saveCheckoutDraft()'),source.indexOf('    function saveGuestCheckoutName()'));
 const c={checkoutStep:2,CHECKOUT_FLOW_VERSION:2,checkoutDraft:{fullname:'Ali Valiyev',phone:'+998901234567',address:'Uy 1',district:'Bektemir',regionKey:'tashkent_city'},selectedDeliveryMethodId:'FREE',selectedPayMethod:'CARD',checkoutSelectedBranch:null,document:{getElementById:()=>({value:''})},localStorage:{setItem(){}},scopedKey:v=>v,persistCheckoutDraftServer(){}};
 vm.createContext(c);vm.runInContext(fn+'\nsaveCheckoutDraft()',c);
 assert.equal(c.checkoutDraft.address,'Uy 1');assert.equal(c.checkoutDraft.phone,'+998901234567');assert.equal(c.checkoutDraft.fullname,'Ali Valiyev');
});
test('lost RPC responses preserve receipts and recover only this tenant and owner',async()=>{
 const source=fs.readFileSync('supabase/functions/_shared/checkout-recovery.ts','utf8');
 const c={exports:{}};vm.createContext(c);vm.runInContext(ts.transpile(source,{module:ts.ModuleKind.CommonJS}),c);
 const attempts=[];
 const mock=result=>({from:table=>({select:()=>({eq:(key,value)=>{attempts.push([table,key,value]);return{eq:(k,v)=>{attempts.push([table,k,v]);return{maybeSingle:async()=>result}}}}})})});
 const recover=c.exports.recoverCheckoutAttempt;
 const row={id:42,tg_id:null,receipt_path:'private/receipt.png'};
 assert.equal((await recover(mock({data:row}),'shop-a','key',null,{message:'fetch failed'})).order.id,42);
 assert.ok(attempts.some(v=>v[1]==='shop_id'&&v[2]==='shop-a'));
 assert.equal((await recover(mock({data:null}),'shop-a','key',null,{message:'fetch failed'})).canRemoveReceipt,false);
 assert.equal((await recover(mock({error:{message:'timeout'}}),'shop-a','key',null,{code:'P0001'})).canRemoveReceipt,false);
 assert.equal((await recover(mock({data:null}),'shop-a','key',null,{code:'P0001'})).canRemoveReceipt,true);
 for(const code of ['40003','08007','08006','PGRST000']) assert.equal((await recover(mock({data:null}),'shop-a','key',null,{code})).canRemoveReceipt,false);
 const conflict=await recover(mock({data:{...row,tg_id:'another-user'}}),'shop-a','key','user',{code:'P0001'});
 assert.equal(conflict.order,null);assert.equal(conflict.conflict,true);assert.equal(conflict.canRemoveReceipt,false);
});
