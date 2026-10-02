const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../ustore-shop-app.js'), 'utf8');
const code = source.slice(source.indexOf('    function cleanFeaturedSelection('), source.indexOf('    // Shop takomillashtirish, 2-band: avval'));
function fixture(callApi) {
  const c = { featuredCategories: [{categoryId:'cat', productIds:['live','removed']}], featuredCategoriesSaving:false,
    render(){}, tr:uz=>uz, console:{error(){}}, notices:[], callApi };
  c.showActionToast = (...args)=>c.notices.push(args);
  vm.createContext(c); vm.runInContext(code, c); return c;
}
test('deleted hidden product is removed only after explicit server rejection and successful retry', async()=>{
  const calls=[];
  const c=fixture(async(action,payload)=>{
    calls.push(action);
    if(calls.length===1) { const e=new Error('invalid_product'); e.details={invalidProductIds:['removed']}; throw e; }
    assert.deepEqual(JSON.parse(JSON.stringify(payload.featuredCategories)),[{categoryId:'cat',productIds:['live']}]);
    return {ok:true,featuredCategories:payload.featuredCategories};
  });
  await c.saveFeaturedCategories();
  assert.deepEqual(calls,['set_featured_categories','set_featured_categories']);
  assert.equal(c.featuredCategories[0].productIds.length,1);
  assert.equal(c.featuredCategoriesSaving,false);
});
test('failed save preserves selections and resets busy state with readable reason',async()=>{
  const c=fixture(async()=>{throw new Error('column featured_category_ids does not exist');});
  await c.saveFeaturedCategories();
  assert.equal(c.featuredCategories[0].productIds.length,2);
  assert.equal(c.featuredCategoriesSaving,false);
  assert.match(c.notices[0][0],/090/);
  assert.equal(c.notices[0][1],'error');
});
test('double click sends only one request, no success before server confirmation',async()=>{
  let resolve, count=0;
  const c=fixture(()=>{count++;return new Promise(r=>resolve=r);});
  const pending=c.saveFeaturedCategories();
  await c.saveFeaturedCategories();
  assert.equal(count,1); assert.equal(c.featuredCategoriesSaving,true);
  resolve({}); await pending;
  assert.equal(c.notices[0][1],'error');
  assert.equal(c.featuredCategoriesSaving,false);
});
