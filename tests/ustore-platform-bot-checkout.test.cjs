const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
function model(){const source=fs.readFileSync('supabase/functions/_shared/platform-bot-checkout.ts','utf8');const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,structuredClone});return exports;}
test('bot collects structured service choices with direct catalog toggle',()=>{
 const {advanceBotCheckout}=model();let s={step:'SHOP_NAME',data:{products:[]}};
 s=advanceBotCheckout(s,'Sinov');assert.equal(s.step,'SERVICES');
 s=advanceBotCheckout(s,'','catalog');assert.equal(s.step,'SERVICES');assert.equal(s.data.catalogSelected,true);
 s=advanceBotCheckout(s,'','domain');s=advanceBotCheckout(s,'SINOV.UZ');s=advanceBotCheckout(s,'2');
 assert.equal(s.step,'SERVICES');assert.equal(s.data.domain,'sinov.uz');assert.equal(s.data.years,2);
});
test('bot rejects malformed numeric input and invalid sequence without mutating state',()=>{
 const {advanceBotCheckout}=model();const s={step:'PRODUCT_PRICE',data:{products:[],currentProduct:{name:'A'}}};
 assert.throws(()=>advanceBotCheckout(s,'-1'),/Narx/);assert.equal(s.step,'PRODUCT_PRICE');
 assert.throws(()=>advanceBotCheckout({step:'DOMAIN_YEARS',data:{}},'11'),/1.*10/);
 assert.throws(()=>advanceBotCheckout({step:'SHOP_NAME',data:{}},'','products_done'),/bosqich/);
});
