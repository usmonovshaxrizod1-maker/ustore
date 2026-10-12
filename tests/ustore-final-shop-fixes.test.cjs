const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync('ustore-shop-app.js','utf8');
const context={module:{exports:{}},URL};vm.createContext(context);vm.runInContext(fs.readFileSync('ustore-commerce.js','utf8'),context);
const commerce=context.module.exports;
const guest={exports:{},URL};vm.createContext(guest);vm.runInContext(ts.transpile(fs.readFileSync('supabase/functions/_shared/guest-checkout.ts','utf8'),{module:ts.ModuleKind.CommonJS}),guest);
test('contact usernames and existing profile URLs normalize without accepting spoofed destinations',()=>{
 for(const input of ['store.name','@store.name','https://www.instagram.com/store.name/']) assert.equal(guest.exports.normalizeGuestCheckout({instagram:input}).instagram,'https://www.instagram.com/store.name/');
 for(const input of ['store.name','@store.name','https://www.instagram.com/store.name/']) assert.equal(commerce.guestSocialUrl(input,'instagram'),'https://www.instagram.com/store.name/');
 for(const input of ['store_name','@store_name','https://t.me/store_name']) assert.equal(guest.exports.normalizeGuestCheckout({telegram:input}).telegram,'store_name');
 for(const input of ['store_name','@store_name','https://t.me/store_name']) assert.equal(commerce.guestSocialUrl(input,'telegram'),'https://t.me/store_name');
 for(const input of ['javascript:alert(1)','https://instagram.com.evil.test/store/','https://www.instagram.com/p/photo/']) assert.throws(()=>guest.exports.normalizeGuestCheckout({instagram:input},true),/invalid_guest_instagram/);
});
test('customer cancellation obeys independent enable flag, cutoff and actual shipment, including NEW already sent',()=>{
 const can=(status,shipmentStatus,enabled=true,cutoff='BEFORE_SHIPPED')=>commerce.customerCanCancel({status,shipment:{status:shipmentStatus}},{enabled,cutoff});
 assert.equal(can('NEW','READY',false),false);
 for(const cutoff of ['NEW_ONLY','BEFORE_SHIPPED','ANY_NON_TERMINAL']){
  assert.equal(can('NEW','READY',true,cutoff),true);assert.equal(can('CANCELLED','READY',true,cutoff),false);assert.equal(can('DELIVERED','DELIVERED',true,cutoff),false);
 }
 assert.equal(can('PROCESSING','READY',true,'NEW_ONLY'),false);
 assert.equal(can('PROCESSING','READY'),true);assert.equal(can('PROCESSING','IN_TRANSIT'),false);assert.equal(can('NEW','HANDED_TO_CARRIER'),false);
 assert.equal(can('PROCESSING','IN_TRANSIT',true,'ANY_NON_TERMINAL'),true);assert.equal(can('PROCESSING','DELIVERED',true,'ANY_NON_TERMINAL'),false);
});
test('tracking returns independent order, payment, receipt and shipment states; cancellation is never masked by rejected receipt',()=>{
 const row={guest_tracking_code:'0012345678',status:'CANCELLED',payment_status:'PENDING',receipt_review_status:'REJECTED',payment_receipt_path:'private',shipment:{status:'IN_TRANSIT'}};
 const tracking=guest.exports.guestTrackingProjection(row);
 assert.equal(tracking.status,'CANCELLED');assert.equal(tracking.paymentStatus,'PENDING');assert.equal(tracking.receiptReviewStatus,'REJECTED');assert.equal(tracking.shipmentStatus,'IN_TRANSIT');
 const fn=source.slice(source.indexOf('    function orderDisplayStatus('),source.indexOf('    function isReceiptPendingReview('));const c={};vm.createContext(c);vm.runInContext(fn,c);
 assert.equal(c.orderDisplayStatus({status:'CANCELLED',receiptReviewStatus:'REJECTED'}),'CANCELLED');
});
test('telephone contacts leave native tel navigation to the browser, never the HTTP-only Telegram openLink API',()=>{
 const fn=source.slice(source.indexOf('    function openGuestContact('),source.indexOf('    function checkoutDialogHtml('));
 let intercepted=0;const c={tg:{openLink(){intercepted++}},browserBridge:{authenticated:false}};vm.createContext(c);vm.runInContext(fn,c);
 c.openGuestContact({preventDefault(){intercepted++}},'tel:+998901234567','phone');assert.equal(intercepted,0);
});
test('delayed render restoration never overwrites controlled contact drafts or policy toggles',()=>{
 const fn=source.slice(source.indexOf('    function restoreShopRenderState('),source.indexOf('    let webFrameReadyNotified',source.indexOf('    function restoreShopRenderState(')));
 const fields={guest:{value:'@new_name',type:'text',closest:selector=>selector==='.fc-guest-settings'?{}:null},policy:{checked:true,type:'checkbox',closest:selector=>selector==='.fc-order-policy-panel'?{}:null},ordinary:{value:'unsaved form',type:'text',closest:()=>null}};
 const c={document:{getElementById:id=>fields[id],querySelector:()=>null,querySelectorAll:()=>[]},requestAnimationFrame:fn=>fn(),setTimeout:fn=>fn()};vm.createContext(c);vm.runInContext(fn,c);
 c.restoreShopRenderState({fields:[{key:'guest',value:'old',checked:null},{key:'policy',checked:false,value:''},{key:'ordinary',value:'saved field',checked:null}]});
 assert.equal(fields.guest.value,'@new_name');assert.equal(fields.policy.checked,true);assert.equal(fields.ordinary.value,'saved field');
});
