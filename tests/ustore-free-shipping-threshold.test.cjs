const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={module:{exports:{}}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('ustore-commerce.js','utf8'),ctx);const c=ctx.module.exports;
test('free delivery minimum is opt-in and uses strict greater-than on discounted subtotal',()=>{
 const raw=c.defaultConfig(['tashkent_city']);raw.delivery.free.minimumEnabled=true;raw.delivery.free.minimumSubtotal=300000;
 const config=c.normalizeConfig(raw,['tashkent_city']);
 assert.equal(c.deliveryOptions(config,'tashkent_city',null,300000)[0].eligible,false);
 assert.equal(c.deliveryOptions(config,'tashkent_city',null,300001)[0].eligible,true);
 assert.equal(c.deliveryOptions(config,'tashkent_city',null,299999)[0].remaining,2);
 raw.delivery.free.minimumEnabled=false;
 assert.equal(c.deliveryOptions(c.normalizeConfig(raw,['tashkent_city']),'tashkent_city',null,1)[0].eligible,true);
});
