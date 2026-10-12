const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function helpers(){const context={crypto:require('node:crypto').webcrypto,URL};vm.createContext(context);const source=fs.readFileSync('supabase/functions/_shared/guest-checkout.ts','utf8').replace(/export /g,'');vm.runInContext(ts.transpile(source)+'\nglobalThis.api={normalizeGuestCheckout,createGuestTrackingCode,guestTrackingProjection};',context);return context.api;}
test('guest checkout defaults off, validates required phone and genuine contact destinations',()=>{
 const h=helpers();assert.equal(h.normalizeGuestCheckout({}).enabled,false);
 assert.throws(()=>h.normalizeGuestCheckout({enabled:true},true),/guest_contact_phone_required/);
 const s=h.normalizeGuestCheckout({enabled:true,phone:'+998 90 123 45 67',telegram:'@actual_shop',instagram:'https://www.instagram.com/actual_shop/'},true);
 assert.equal(s.phone,'+998901234567');assert.equal(s.telegram,'actual_shop');assert.equal(s.instagram,'https://www.instagram.com/actual_shop/');
 assert.throws(()=>h.normalizeGuestCheckout({enabled:true,phone:'+998901234567',instagram:'https://instagram.com.evil.test/shop'},true),/invalid_guest_instagram/);
});
test('tracking codes stay strings of ten secure random digits and are not derived from order IDs',()=>{
 const h=helpers(), codes=new Set(Array.from({length:1000},()=>h.createGuestTrackingCode()));
 assert.equal(codes.size,1000);for(const c of codes)assert.match(c,/^\d{10}$/);
 const source=fs.readFileSync('supabase/functions/_shared/guest-checkout.ts','utf8');assert.match(source,/getRandomValues/);assert.doesNotMatch(source,/Math\.random/);
});
test('public tracking cannot expose address, phone, receipt, account, private items or internal order ID',()=>{
 const h=helpers(),r=h.guestTrackingProjection({id:9,guest_tracking_code:'0012345678',status:'NEW',created_at:'now',total_price:100,payment_status:'PENDING',payment_receipt_path:'private',receipt_review_status:'PENDING',phone:'secret',address:'secret',items:['secret'],account_id:'secret',shipment:{status:'READY'}});
 assert.equal(r.code,'0012345678');assert.equal(r.paymentStatus,'RECEIPT_REVIEW');
 for(const key of ['id','phone','address','items','account_id','payment_receipt_path'])assert.equal(key in r,false);
});
