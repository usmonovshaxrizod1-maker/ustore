const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
function load() {
  const source = fs.readFileSync('supabase/functions/_shared/subscription-addons.ts','utf8');
  const result = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  const exports = {};
  vm.runInNewContext(result.outputText,{exports,URL});
  return exports.normalizeSubscriptionAddons;
}
const context = {kind:'NEW_SHOP',tariffPriceSnapshot:200001};
const catalog = {code:'CATALOG_SETUP',details:{products:[{name:'Ko‘ylak',price:50000,quantity:2,variants:[{color:'Qora',size:'M',price:52000,quantity:1}]}]}};
test('idempotency comparison survives JSONB object key reordering and preserves array order',()=>{
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('supabase/functions/_shared/subscription-addons.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,URL});
  const stable=exports.stableSubscriptionInput;
  assert.equal(stable({b:2,a:[{name:'A',price:1}]}),stable({a:[{price:1,name:'A'}],b:2}));
  assert.notEqual(stable({a:[1,2]}),stable({a:[2,1]}));
});
test('catalog uses selected period price, rounds whole UZS and ignores client prices',()=>{
  const normalize = load();
  const result = normalize([{...catalog,totalPrice:1,unitPrice:1}],context);
  assert.equal(result.items[0].totalPrice,60000);
  assert.equal(result.totalPrice,260001);
  assert.equal(normalize([catalog],{...context,tariffPriceSnapshot:2000010}).items[0].totalPrice,600003);
});
test('domain years and normalized names use the fixed annual price',()=>{
  const normalize = load();
  for(const years of [1,10]) {
    const r = normalize([{code:'MANAGED_DOMAIN',details:{domain:'  SINOV.UZ ',years}}],context);
    assert.equal(r.items[0].details.domain,'sinov.uz');
    assert.equal(r.addonsTotal,50000*years);
  }
  for(const years of [0,11,1.5,'2x']) assert.throws(()=>normalize([{code:'MANAGED_DOMAIN',details:{domain:'sinov.uz',years}}],context),/domain_years/);
  for(const domain of ['https://sinov.uz','a','-a.uz','a..uz','a.uz/path']) assert.throws(()=>normalize([{code:'MANAGED_DOMAIN',details:{domain,years:1}}],context),/domain_name/);
});
test('invalid catalog, duplicate codes and upgrades fail before persistence',()=>{
  const normalize = load();
  assert.throws(()=>normalize([catalog],{...context,kind:'UPGRADE'}),/new_shop_only/);
  assert.throws(()=>normalize([catalog,catalog],context),/duplicate/);
  for(const product of [{name:'',price:0,quantity:1},{name:'A',price:-1,quantity:1},{name:'A',price:1,quantity:-1},{name:'A',price:1,quantity:1,variants:[{price:-1,quantity:1}]}]) {
    assert.throws(()=>normalize([{code:'CATALOG_SETUP',details:{products:[product]}}],context),/catalog_/);
  }
  assert.throws(()=>normalize([{code:'CATALOG_SETUP',details:{products:[]}}],context),/catalog_products/);
  assert.equal(normalize([],{...context,kind:'UPGRADE'}).totalPrice,200001);
});
test('API prices add-ons on the server, maps legacy totals and atomically audits admin transitions',()=>{
  const source=fs.readFileSync('supabase/functions/platform-api/index.ts','utf8');
  assert.match(source,/normalizeSubscriptionAddons\(payload.addons/);
  assert.match(source,/totalPrice: Number\(r.total_price_snapshot \?\? r.tariff_price_snapshot\)/);
  assert.match(source,/subscription_request_addons\(\*\)/);
  const start=source.indexOf('case "platform_admin_update_addon_status"');
  assert.ok(start>0);
  const block=source.slice(start,source.indexOf('\n      case ',start+10));
  assert.match(block,/requirePlatformSuperAdmin\(\)/);
  assert.match(block,/ustore_update_subscription_addon/);
  assert.match(block,/409/);
});
