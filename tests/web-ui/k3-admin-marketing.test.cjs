const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..','..');
const moduleUrl=(f)=>pathToFileURL(path.join(root,f)).href;
function owner(){return {shopRole:'OWNER',permissions:['*']};}
function makePort(){
  const calls=[];
  const data={
    featuredCategories:[{categoryId:'c1',productIds:['p1']}],
    categories:[{id:'c1',name:'Protein'},{id:'c2',name:'Vitamin'}],
    products:[{id:'p1',name:'Whey',category_id:'c1'},{id:'p2',name:'Creatine',category_id:'c1'},{id:'p3',name:'Omega',category_id:'c2'}],
    banners:[{id:'b1',title:'Top',imageUrl:'https://x.invalid/a.jpg',targetType:'NONE',isActive:true,sortOrder:0}],
    promotions:[{id:'pr1',name:'Promo',code:'TEST10',discountType:'PERCENT',discountValue:10,usedCount:2,usageLimit:10,isActive:true,source:'MANUAL'}],
    bundles:[{id:'bu1',name:'Set',items:[{productId:'p1',qty:1},{productId:'p2',qty:1}],bundlePrice:200,isActive:true}],
    groups:[{id:'t1',name:'Tier',steps:[{thresholdAmount:1000,discountType:'PERCENT',discountValue:2}],isActive:true}],
    gifts:[{id:'g1',name:'Gift',conditionType:'ORDER_AMOUNT',thresholdAmount:1000,giftProductId:'p3',giftQuantity:1,isActive:true}],
    rewards:[{id:'r1',triggerType:'ORDER_TOTAL',thresholdAmount:2000,rewardType:'PERCENT',rewardValue:5,isActive:true}],
  };
  return {calls,port:{async invoke(action,payload={}){calls.push({action,payload:structuredClone(payload)});
    if(action==='get_marketing_bootstrap')return {ok:true,data:{featuredCategories:data.featuredCategories,categories:data.categories,products:data.products}};
    if(action==='marketing_summary')return {ok:true,data:{counts:{banners:1,promos:1,bundles:1,tiers:1,gifts:2},activeCounts:{banners:1,promos:1,bundles:1,tiers:1,gifts:2},activeTotal:6}};
    if(action==='banner_list')return {ok:true,data:{banners:data.banners}};
    if(action==='promo_list')return {ok:true,data:{promotions:data.promotions}};
    if(action==='bundle_list')return {ok:true,data:{bundles:data.bundles}};
    if(action==='discount_tier_group_list')return {ok:true,data:{groups:data.groups}};
    if(action==='automatic_gift_list')return {ok:true,data:{rules:data.gifts}};
    if(action==='reward_rule_list')return {ok:true,data:{rules:data.rewards}};
    if(action==='set_featured_categories'){data.featuredCategories=structuredClone(payload.featuredCategories);return {ok:true,data:{ok:true,featuredCategories:data.featuredCategories}};}
    if(action==='promo_generate_code')return {ok:true,data:{code:'USTABC'}};
    if(action==='promo_usage_list')return {ok:true,data:{promo:{id:'pr1',code:'TEST10',name:'Promo'},usages:[{id:'u1',tgId:11,customerName:'Ali',orderId:77,discountAmount:1000}]}};
    if(['banner_create','banner_update','banner_reorder','banner_delete','promo_create','promo_update','promo_delete','bundle_create','bundle_update','bundle_delete','discount_tier_group_create','discount_tier_group_update','discount_tier_group_delete','automatic_gift_create','automatic_gift_update','automatic_gift_delete','reward_rule_create','reward_rule_update','reward_rule_delete'].includes(action))return {ok:true,data:{ok:true}};
    return {ok:false,error:{code:'CAPABILITY_UNAVAILABLE',message:'no',retryable:false}};
  }}};
}
class FakeStyle{setProperty(n,v){this[n]=String(v)}}
class FakeNode{constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.dataset={};this.style=new FakeStyle();this.className='';this.textContent='';this.value='';this.listeners={};this.disabled=false;this.checked=false;this.type='';}append(...x){this.children.push(...x)}prepend(...x){this.children.unshift(...x)}setAttribute(n,v){this.attributes[n]=String(v)}removeAttribute(n){delete this.attributes[n]}addEventListener(n,fn){this.listeners[n]=fn}}
class FakeDocument{createElement(tag){return new FakeNode(tag)}}
function flatten(node,out=[]){if(node&&typeof node==='object'){out.push(node);for(const c of node.children||[])if(c&&typeof c==='object')flatten(c,out);}return out;}

test('K3 loads all marketing surfaces and bootstrap',async()=>{
 const {createAdminMarketingController}=await import(moduleUrl('web/features/admin-marketing/marketing.js'));const {port,calls}=makePort();const c=createAdminMarketingController({adminPort:port,actor:owner()});const r=await c.load();assert.equal(r.ok,true);const s=c.getState();assert.equal(s.banners.length,1);assert.equal(s.promotions.length,1);assert.equal(s.bundles.length,1);assert.equal(s.tiers.length,1);assert.equal(s.gifts.length,1);assert.equal(s.couponRules.length,1);for(const a of ['get_marketing_bootstrap','marketing_summary','banner_list','promo_list','bundle_list','discount_tier_group_list','automatic_gift_list','reward_rule_list'])assert.ok(calls.some(x=>x.action===a));
});

test('K3 featured save preserves v308 max 8 categories / 6 products and waits for server confirmation',async()=>{
 const {createAdminMarketingController}=await import(moduleUrl('web/features/admin-marketing/marketing.js'));const {port,calls}=makePort();const c=createAdminMarketingController({adminPort:port,actor:owner()});await c.load();const r=await c.saveFeatured([{categoryId:'c1',productIds:['p1','p2','p1']}]);assert.equal(r.ok,true);const call=calls.findLast(x=>x.action==='set_featured_categories');assert.deepEqual(call.payload.featuredCategories,[{categoryId:'c1',productIds:['p1','p2']}]);assert.deepEqual(c.getState().featuredCategories,[{categoryId:'c1',productIds:['p1','p2']}]);
});

test('K3 routes mutations through existing marketing actions rather than a parallel engine',async()=>{
 const {createAdminMarketingController}=await import(moduleUrl('web/features/admin-marketing/marketing.js'));const {port,calls}=makePort();const c=createAdminMarketingController({adminPort:port,actor:owner()});await c.load();
 await c.saveBanner({title:'B',imageUrl:'https://x.invalid/b.jpg'});await c.savePromo({name:'P',code:'P10',discountType:'PERCENT',discountValue:10});await c.saveBundle({name:'Set',bundlePrice:100,items:[{productId:'p1',qty:1},{productId:'p2',qty:1}]});await c.saveTier({name:'T',steps:[{thresholdAmount:1000,discountType:'PERCENT',discountValue:2}]});await c.saveGift({name:'G',conditionType:'ORDER_AMOUNT',thresholdAmount:1000,giftProductId:'p3'});await c.saveCouponRule({triggerType:'ORDER_TOTAL',thresholdAmount:1000,rewardType:'PERCENT',rewardValue:5});
 for(const a of ['banner_create','promo_create','bundle_create','discount_tier_group_create','automatic_gift_create','reward_rule_create'])assert.ok(calls.some(x=>x.action===a),a);
});

test('K3 denies marketing before network for actor without marketing.manage',async()=>{
 const {createAdminMarketingController}=await import(moduleUrl('web/features/admin-marketing/marketing.js'));const calls=[];const c=createAdminMarketingController({adminPort:{invoke:async(...a)=>{calls.push(a);return {ok:true,data:{}}}},actor:{shopRole:'STAFF',permissions:['orders.view']}});const r=await c.load();assert.equal(r.ok,false);assert.equal(r.error.code,'FORBIDDEN');assert.equal(calls.length,0);
});

test('K3 view renders featured + banner + promo + bundle + tier + gift surfaces',async()=>{
 const {createAdminMarketingController,createAdminMarketingView}=await import(moduleUrl('web/features/admin-marketing/marketing.js'));const {port}=makePort();const c=createAdminMarketingController({adminPort:port,actor:owner()});await c.load();const view=createAdminMarketingView({controller:c,documentRef:new FakeDocument()});const nodes=flatten(view.element);const text=nodes.map(n=>n.textContent).join(' | ');assert.match(text,/Bosh sahifa kataloglari/);assert.match(text,/Bannerlar/);assert.match(text,/Promo-kodlar/);assert.match(text,/Aksiyalar/);assert.match(text,/Bosqichli chegirmalar/);assert.match(text,/Avtomatik sovg‘a/);
});

test('K3 live/server allowlists are narrow and every marketing handler remains permission checked',()=>{
 const live=fs.readFileSync(path.join(root,'web/services/live/admin.js'),'utf8');const api=fs.readFileSync(path.join(root,'supabase/functions/shop-api/index.ts'),'utf8');
 for(const action of ['get_marketing_bootstrap','marketing_summary','set_featured_categories','banner_list','promo_list','bundle_list','discount_tier_group_list','automatic_gift_list','reward_rule_list']){assert.match(live,new RegExp(`'${action}'`));assert.match(api,new RegExp(`${action}: 'marketing\\.manage'`));}
 assert.match(api,/case "get_marketing_bootstrap"[\s\S]*requirePermission\('marketing\.manage'\)/);assert.match(api,/case "set_featured_categories"[\s\S]*\.update\(\{ featured_category_ids: entries/);assert.match(api,/featured_categories_save_not_confirmed/);
});



test('K3 promo usage uses backend promoId contract and stores returned history',async()=>{
 const {createAdminMarketingController}=await import(moduleUrl('web/features/admin-marketing/marketing.js'));const {port,calls}=makePort();const c=createAdminMarketingController({adminPort:port,actor:owner()});await c.load();const r=await c.promoUsage('pr1');assert.equal(r.ok,true);const call=calls.findLast(x=>x.action==='promo_usage_list');assert.deepEqual(call.payload,{promoId:'pr1'});assert.equal(c.getState().promoUsage.usages[0].orderId,77);
});

test('K3 supports the four existing gift UI types without inventing a new engine',async()=>{
 const {createAdminMarketingController}=await import(moduleUrl('web/features/admin-marketing/marketing.js'));const {port,calls}=makePort();const c=createAdminMarketingController({adminPort:port,actor:owner()});await c.load();
 assert.equal((await c.saveGift({name:'Amount',conditionType:'ORDER_AMOUNT',thresholdAmount:1000,giftProductId:'p3'})).ok,true);
 assert.equal((await c.saveGift({name:'Qty',conditionType:'SPECIFIC_PRODUCT',targetProductId:'p1',thresholdQuantity:2,giftProductId:'p3'})).ok,true);
 assert.equal((await c.saveGift({name:'Products',conditionType:'SPECIFIC_PRODUCTS',targetProductIds:['p1','p2'],matchMode:'ALL',giftProductId:'p3'})).ok,true);
 assert.equal((await c.saveCouponRule({triggerType:'ORDER_TOTAL',thresholdAmount:5000,rewardType:'PERCENT',rewardValue:10})).ok,true);
 const giftCalls=calls.filter(x=>x.action==='automatic_gift_create');assert.equal(giftCalls.length,3);assert.equal(giftCalls[1].payload.conditionType,'SPECIFIC_PRODUCT');assert.deepEqual(giftCalls[2].payload.targetProductIds,['p1','p2']);assert.ok(calls.some(x=>x.action==='reward_rule_create'));
});

test('K3 normalizes duplicate bundle products and validates tier values before network',async()=>{
 const {createAdminMarketingController}=await import(moduleUrl('web/features/admin-marketing/marketing.js'));const {port,calls}=makePort();const c=createAdminMarketingController({adminPort:port,actor:owner()});await c.load();
 const b=await c.saveBundle({name:'Set',bundlePrice:1000,items:[{productId:'p1',qty:1},{productId:'p1',qty:2},{productId:'p2',qty:1}]});assert.equal(b.ok,true);const bundleCall=calls.findLast(x=>x.action==='bundle_create');assert.deepEqual(bundleCall.payload.items,[{productId:'p1',qty:3},{productId:'p2',qty:1}]);
 const before=calls.length;const bad=await c.saveTier({name:'Bad',steps:[{thresholdAmount:1000,discountType:'PERCENT',discountValue:101}]});assert.equal(bad.ok,false);assert.equal(bad.error.code,'VALIDATION_ERROR');assert.equal(calls.length,before);
});
test('K3 styles are web namespaced and do not patch legacy Mini App CSS',()=>{const css=fs.readFileSync(path.join(root,'web/styles/features.css'),'utf8');assert.match(css,/\.uw-admin-marketing/);assert.match(css,/\.uw-marketing-vitrine/);assert.match(css,/\.uw-marketing-featured-grid/);assert.match(css,/\.uw-marketing-collage/);assert.match(css,/\.uw-marketing-usage/);});
