const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function model(){const ctx={};vm.runInNewContext(fs.readFileSync('web/shared/subscription-service-addons.js','utf8'),ctx);return ctx.UStoreServiceAddons;}
test('Mini App UUIDs support secure WebViews without randomUUID',()=>{
 const id=model().secureUuid({getRandomValues(bytes){require('node:crypto').randomFillSync(bytes)}});
 assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.throws(()=>model().secureUuid({}),/Secure random/);
});
test('unselected services and upgrades carry no add-ons; selected services have matching totals',()=>{
 const m=model(),s=m.empty();assert.equal(m.payload(s,'NEW_SHOP').length,0);
 s.catalogSelected=true;s.domainSelected=true;s.domains=['sinov.uz'];s.years=2;
 const q=m.quote(s,'NEW_SHOP',200000);assert.equal(q.totalPrice,360000);assert.equal(q.lines.length,2);
 assert.equal(m.payload(s,'UPGRADE').length,0);assert.equal(m.quote(s,'UPGRADE',200000).totalPrice,200000);
 assert.equal(m.validate(s,'NEW_SHOP'),'');
});
test('incomplete domain service explains the exact field rather than clearing entered data',()=>{
 const m=model(),s=m.empty();s.domainSelected=true;s.domains=['https://bad.uz'];assert.match(m.validate(s,'NEW_SHOP'),/domen/i);
 s.domains=['sinov.uz'];s.years=11;assert.match(m.validate(s,'NEW_SHOP'),/1.*10/);
});
test('legacy UI exposes onclick helpers and both clients use the same service model',()=>{
 const app=fs.readFileSync('platform/platform-app.js','utf8'),portal=fs.readFileSync('web/features/platform-portal/platform-portal.js','utf8');
 for(const helper of ['openActiveShopsFromDashboard','openAdminOwnersFromDashboard','openAdminOwnerShops','setCatalogSetupSelected','setManagedDomainSelected','updateSubscriptionAddonStatus'])assert.match(app,new RegExp(`window\\.${helper} = ${helper}`));
 assert.match(app,/UStoreServiceAddons/);assert.match(portal,/UStoreServiceAddons/);assert.match(portal,/addons:.*payload/);
});
