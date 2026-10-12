// Actual Shop app + browser bridge with isolated API fixtures. No production writes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm'),assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]||'playwright');
const root=path.resolve(__dirname,'..'),output=path.resolve(process.argv[3]||path.join(root,'dist/checkout-qa'));
const context={module:{exports:{}}};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'ustore-commerce.js'),'utf8'),context);
const config=context.module.exports.defaultConfig(['tashkent_city']);config.checkout={enabled:true,phone:'+998901234567',telegram:'fixture_shop',instagram:'https://www.instagram.com/fixture_shop/'};
config.delivery.free.minimumEnabled=true;config.delivery.free.minimumSubtotal=800;
config.payments.methods[0].enabled=false;Object.assign(config.payments.methods[1],{enabled:true,regions:{tashkent_city:{enabled:true}},cardNumber:'1111111111111111',cardHolder:'Fixture Shop',receiptRequired:true});
const product={id:'00000000-0000-4000-8000-000000000003',name:'Local test product',price:1000,stock:10,isVisible:true,status:'ACTIVE',variants:[],img:''};
const boot={tgId:'123',isAdmin:false,isSuperAdmin:false,shopContact:{name:'Fixture Shop'},fulfillmentConfig:config,botUsername:'fixture_shop_bot',profile:{firstName:'Ali',lastName:'Valiyev',phone:'+998901234567'}};
let creates=[],failUpload=true,trackingStatus='NEW',trackingReceiptStatus='PENDING';
const response=(action,payload={})=>{
 if(action==='boot')return boot;
 if(action==='get_catalog')return{products:[product],categories:[]};
 if(action==='guest_discount_preview'||action==='discount_preview')return{subtotal:1000,totalDiscount:100};
 if(action==='guest_create_order'||action==='create_order'){
  creates.push(payload);if(failUpload)return{error:'receipt_upload_failed'};
  return{order:{id:42,isGuest:action.startsWith('guest'),guestTrackingCode:'0012345678',createdAt:'2026-10-12T00:00:00Z',status:'NEW',subtotal:1000,payableTotal:900,paymentStatus:'PENDING',payMethod:'CARD',hasReceipt:true,receiptReviewStatus:'PENDING',payment:{receiptStatus:'RECEIVED'}}};
 }
 if(action==='guest_track_order')return{tracking:{code:payload.code,status:trackingStatus,createdAt:'2026-10-12T00:00:00Z',total:900,paymentStatus:'PENDING',receiptReviewStatus:trackingReceiptStatus,shipmentStatus:'READY'},contacts:config.checkout};
 if(action==='set_guest_checkout_config'){config.checkout={...payload,telegram:context.module.exports.guestSocialUrl(payload.telegram,'telegram').split('/').pop(),instagram:context.module.exports.guestSocialUrl(payload.instagram,'instagram')};return{checkout:config.checkout};}
 if(action==='set_order_policies'){Object.assign(boot,payload);return{ok:true};}
 if(action==='get_my_orders')return{orders:[]};
 return{ok:true,bundles:[],promotions:[],districts:[],branches:[]};
};
const server=http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/qa-api'){let body='';for await(const part of req)body+=part;const {action,payload}=JSON.parse(body);const data=response(action,payload);res.writeHead(data.error?400:200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));return;}
 if(pathname==='/qa'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<link rel="stylesheet" href="/web/styles/index.css"><link rel="stylesheet" href="/shop-welcome.css"><script src="/shop-welcome.js"></script><script type="module" src="/qa-host.js"></script>');return;}
 if(pathname==='/qa-host.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(`import {createMiniAppFrameHost} from '/web/shared/frame-host.js';let token=new URLSearchParams(location.search).has('auth')?'fixture-token':'';const host=createMiniAppFrameHost({kind:'shop',route:'/cart',tenant:{botId:'12345',shopName:'Fixture Shop'},viewerKey:'11111111-1111-4111-8111-111111111111',runtime:{endpoints:{shop:location.origin+'/qa-api'},tokenStore:{get:()=>token},services:{auth:{signOut:async()=>{token='';return{ok:true}}}}},onSignedOut:()=>{window.qaSignedOut=true}});document.body.append(host.element);`);return;}
 let relative=pathname.replace(/^\//,'').replace(/^ustore\//,'');if(!relative)relative='index.html';
 const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end('not found');return;}
 const type={'.js':'text/javascript','.css':'text/css','.html':'text/html;charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';
 let content=fs.readFileSync(file);if(relative==='web/shared/frame-host.js')content=content.toString().replace("const MINI_APP_ORIGIN = 'https://usmonovshaxrizod1-maker.github.io';",'const MINI_APP_ORIGIN = location.origin;');
 res.writeHead(200,{'Content-Type':type});res.end(content);
});
(async()=>{let browser;fs.mkdirSync(output,{recursive:true});try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,...(process.argv[4]?{executablePath:process.argv[4]}:{}),args:['--disable-gpu']});
 const browserContext=await browser.newContext();
 await browserContext.route('https://**/*',async route=>{
  if(route.request().url().includes('/functions/v1/shop-api')){const {action,payload}=route.request().postDataJSON();const data=response(action,payload);await route.fulfill({status:data.error?400:200,contentType:'application/json',body:JSON.stringify(data)});return;}
  await route.fulfill({status:200,contentType:'text/javascript',body:''});
 });
 const page=await browserContext.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.log('browser error',m.text().slice(0,400))});
 await page.goto(origin+'/qa');const locator=page.frameLocator('iframe');await locator.locator('#app-content').waitFor();
 const frame=page.frames().find(f=>f.url().includes('/ustore/'));
 await frame.waitForFunction(()=>typeof authReady!=='undefined'&&authReady&&products.length>0);
 // Product details reuse the existing short blue add control and cart handlers.
 await frame.evaluate(()=>{cart={};openProductDetailModal(products[0].id);});
 assert.equal(await locator.locator('.fc-product-detail-add').innerText(),'Savatga');
 await locator.locator('.fc-product-detail-add').click();await locator.locator('.fc-product-detail-stepper').waitFor();
 await locator.locator('.fc-product-detail-stepper button').last().click();assert.equal(await frame.evaluate(()=>cart[products[0].id].qty),2);
 await locator.locator('.fc-product-detail-stepper button').first().click();assert.equal(await frame.evaluate(()=>cart[products[0].id].qty),1);
 await frame.evaluate(()=>{products[0].variants=[{sku:'QA-M',size:'M',color:'Black',qty:3,price:1000}];cart={};openProductDetailModal(products[0].id);});
 await locator.locator('.fc-variant-add-cart').click();await locator.locator('.fc-customer-variant-stepper').waitFor();
 await locator.locator('.fc-customer-variant-stepper button').last().click();assert.equal(await frame.evaluate(()=>Object.values(cart)[0].qty),2);
 await locator.locator('.fc-customer-variant-stepper button').first().click();assert.equal(await frame.evaluate(()=>Object.values(cart)[0].qty),1);
 await frame.evaluate(()=>{products[0].variants=[];cart={};selectedProductModal=null;});
 await frame.evaluate(()=>{cart={[products[0].id]:{qty:1}};switchTab('cart');openCheckoutForm();});
 await locator.locator('.fc-checkout-dialog').waitFor({timeout:10000});await locator.locator('button[onclick="continueGuestCheckout()"]').click();
 for(const [width,height] of [[360,800],[820,1180],[1440,1000]]){
  await page.setViewportSize({width,height});await locator.locator('#chk-firstname').fill('Shaxrizodbek');await locator.locator('#chk-lastname').fill('Abdullayev');await locator.locator('#chk-phone').focus();
  const nameBounds=await locator.locator('#chk-firstname').boundingBox();assert.ok(nameBounds.width>130,'Name input must occupy the content column, not a 20px icon column');
  assert.equal(await locator.locator('#chk-firstname').evaluate(el=>el.scrollLeft),0);
  await page.screenshot({path:path.join(output,'checkout-name-'+width+'.png')});
 }
 await locator.locator('#chk-firstname').fill('Ali');await locator.locator('#chk-lastname').fill('Valiyev');await locator.locator('#chk-phone').fill('+998 90 123 45 67');
 await frame.evaluate(()=>{checkoutDraft.district='Bektemir tumani';checkoutDraft.address='Uy 1';applyCheckoutDraftToForm();});
 await frame.evaluate(()=>checkoutGoStep(2));await locator.locator('#chk-receipt').waitFor({state:'attached'});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ5kAAAAASUVORK5CYII=','base64');
 await locator.locator('#chk-receipt').setInputFiles({name:'receipt.png',mimeType:'image/png',buffer:png});
 await frame.waitForFunction(()=>checkoutReceiptStatus==='ready');
 // Earlier-step validation reveals and focuses the offending field.
 await frame.evaluate(()=>{checkoutDraft.address='';const el=document.getElementById('chk-address');if(el)el.value='';submitOrder();});
 await frame.waitForFunction(()=>checkoutStep===1);assert.equal(creates.length,0);assert.equal(await locator.locator('#chk-address').getAttribute('aria-invalid'),'true');
 await locator.locator('#chk-address').fill('Uy 1');await frame.evaluate(()=>checkoutGoStep(2));
 await frame.evaluate(()=>submitOrder());await frame.waitForFunction(()=>!submittingOrder&&checkoutReceiptStatus==='error');
 assert.equal(creates.length,1);assert.equal(await locator.locator('.fc-checkout-receipt-preview').count(),1);assert.equal(await locator.locator('.fc-checkout-dialog').count(),0);
 failUpload=false;await frame.evaluate(()=>submitOrder());await locator.locator('.fc-checkout-dialog').waitFor({timeout:10000});
 assert.equal(creates.length,2);assert.equal(creates[0].checkoutKey,creates[1].checkoutKey);assert.equal(creates[1].firstName,'Ali');assert.ok(creates[1].receiptImageUpload.base64);
 assert.match(await locator.locator('.fc-checkout-dialog').innerText(),/0012345678/);assert.match(await locator.locator('.fc-checkout-dialog').innerText(),/Chekingiz qabul qilindi/);
 for(const label of ['Nusxalash','Telegram','Instagram','Qo‘ng‘iroq']) assert.ok((await locator.locator('.fc-checkout-dialog').innerText()).includes(label));
 for(const [width,height] of [[360,800],[390,844],[820,1180],[1440,1000]]){
  await page.setViewportSize({width,height});const bounds=await locator.locator('.fc-checkout-dialog').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1);assert.ok(bounds.y>=0&&bounds.y+bounds.height<=height+1);
  await page.screenshot({path:path.join(output,'guest-success-'+width+'.png')});
 }
 await locator.locator('button[onclick="finishOrderSuccess(\'orders\')"]').click();await locator.locator('#guest-tracking-code').waitFor();
 assert.equal(await locator.locator('#guest-tracking-code').inputValue(),'0012345678');await frame.evaluate(()=>trackGuestOrder());await locator.locator('.fc-guest-tracking-result').waitFor();
 assert.match(await locator.locator('.fc-guest-tracking-result').innerText(),/Chek tekshirilmoqda/);assert.doesNotMatch(await locator.locator('.fc-guest-tracking-result').innerText(),/998|Uy 1|#42/);
 await page.screenshot({path:path.join(output,'guest-tracking.png')});
 trackingStatus='CANCELLED';trackingReceiptStatus='REJECTED';await frame.evaluate(()=>trackGuestOrder());await frame.waitForFunction(()=>!guestTrackingBusy&&guestTrackingResult?.status==='CANCELLED');
 assert.match(await locator.locator('.fc-guest-tracking-result').innerText(),/Bekor qilingan/);assert.match(await locator.locator('.fc-guest-tracking-result').innerText(),/Chek rad etilgan/);
 assert.equal(await locator.locator('.fc-guest-contacts a[href^="tel:"]').getAttribute('target'),'_top');
 assert.match(await locator.locator('.fc-guest-contact-note').innerText(),/Buyurtma haqida to‘liqroq/);
 await page.screenshot({path:path.join(output,'guest-tracking-cancelled.png')});
 // The actual authenticated Web bridge exposes existing mobile logout; Mini
 // App does not gain a new logout or guest checkout flow.
 boot.isAdmin=true;boot.staffRole='OWNER';boot.myPermissions=['*'];
 await page.goto(origin+'/qa?auth=1');let authFrame=page.frames().find(f=>f.url().includes('/ustore/'));const authLocator=page.frameLocator('iframe');
 await authFrame.waitForFunction(()=>typeof authReady!=='undefined'&&authReady&&products.length>0);
 await page.setViewportSize({width:390,height:844});await authFrame.evaluate(()=>switchTab('profile'));
 await authLocator.locator('.fc-desktop-profile-logout').waitFor({state:'visible'});
 // Existing admin cards, toggles and stored contact values.
 await authFrame.evaluate(()=>{isUserAnAdmin=true;isAdminMode=true;myPermissions=['*'];staffRole='OWNER';openOrderPauseSettingsPage();});
 await authLocator.locator('#guest-contact-telegram').fill('@actual_store');await authLocator.locator('#guest-contact-instagram').fill('@actual.store');await authLocator.locator('#guest-settings-save').click();
 await authFrame.waitForFunction(()=>fulfillmentConfig.checkout.instagram==='https://www.instagram.com/actual.store/');
 await authLocator.locator('#guest-checkout-enabled').uncheck();await authFrame.waitForFunction(()=>fulfillmentConfig.checkout.enabled===false);
 assert.equal(await authLocator.locator('#guest-checkout-fields').isVisible(),false);await authLocator.locator('#guest-checkout-enabled').check();
 assert.equal(await authLocator.locator('#guest-contact-telegram').inputValue(),'actual_store');assert.equal(await authLocator.locator('#guest-contact-instagram').inputValue(),'actual.store');
 const gap=await authLocator.locator('.fc-guest-settings').evaluate(el=>el.getBoundingClientRect().top-el.previousElementSibling.getBoundingClientRect().bottom);assert.ok(gap>=12);
 await page.screenshot({path:path.join(output,'admin-guest-settings.png')});
 await authFrame.evaluate(()=>{isUserAnAdmin=true;isAdminMode=true;myPermissions=['*'];openOrderPolicySettingsPage();});
 const cancelToggle=authLocator.locator('input[onchange*="customerCancellationEnabled"]'),returnToggle=authLocator.locator('input[onchange*="returnRequestsEnabled"]');
 const returnBefore=await returnToggle.isChecked();await cancelToggle.uncheck();assert.equal(await authLocator.locator('.fc-policy-segments').count(),0);assert.equal(await returnToggle.isChecked(),returnBefore);
 await cancelToggle.check();assert.equal(await authLocator.locator('.fc-policy-segments button').count(),3);
 await returnToggle.uncheck();assert.equal(await authLocator.locator('.fc-return-days').count(),0);assert.equal(await cancelToggle.isChecked(),true);
 await returnToggle.check();assert.equal(await authLocator.locator('.fc-return-days').count(),1);
 await page.screenshot({path:path.join(output,'admin-policy-toggles.png')});
 await authFrame.evaluate(()=>{activePopupModal='REJECT_RECEIPT';renderModalContainer();});
 assert.equal(await authLocator.locator('.fc-reject-receipt .fc-btn-icon').count(),1);assert.equal(await authLocator.locator('.fc-reject-submit svg').count(),0);assert.equal(await authLocator.locator('.fc-reject-submit').innerText(),'Rad etish');
 await page.screenshot({path:path.join(output,'admin-reject-receipt.png')});await authLocator.locator('.fc-reject-receipt .fc-btn-icon').click();
 await authFrame.evaluate(()=>{orders=[{id:55,status:'NEW',delivery:{kind:'FREE'}}];updateOrderStatus(55,'CANCELLED');});
 await authLocator.locator('.fc-confirm-box.is-order-cancel').waitFor();assert.equal(await authLocator.locator('.fc-order-confirm-head .fc-btn-icon').count(),1);
 assert.equal(await authLocator.locator('.fc-confirm-actions button').last().innerText(),'Bekor qilish');
 await page.screenshot({path:path.join(output,'admin-cancel-confirm.png')});await authLocator.locator('.fc-order-confirm-head .fc-btn-icon').click();
 await authFrame.evaluate(()=>{isAdminMode=false;activePage=null;switchTab('profile');});
 await authLocator.locator('.fc-desktop-profile-logout').click();await authLocator.locator('#fc-confirm-root .fc-confirm-actions button').last().click();await page.waitForFunction(()=>window.qaSignedOut===true);
 // Native Mini App uses the same checkout code and confirmation design.
 boot.isAdmin=false;boot.staffRole=null;boot.myPermissions=[];
 await page.addInitScript(()=>{window.Telegram={WebApp:{initData:'fixture',initDataUnsafe:{user:{id:123,first_name:'Ali',last_name:'Valiyev'}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},onEvent(){},MainButton:{hide(){},onClick(){}},BackButton:{show(){},hide(){},onClick(){}}}};});
 await page.goto(origin+'/ustore/?bot_id=12345');await page.waitForFunction(()=>typeof authReady!=='undefined'&&authReady&&products.length>0);
 await page.evaluate(()=>{orders=[{id:42,createdAt:'2026-10-12T00:00:00Z',hasReceipt:true,paymentStatus:'PENDING',receiptReviewStatus:'PENDING'}];openOrderSuccessCelebration(42,null);});
 await page.locator('.fc-checkout-dialog').waitFor();assert.doesNotMatch(await page.locator('.fc-checkout-dialog').innerText(),/0012345678/);assert.match(await page.locator('.fc-checkout-dialog').innerText(),/#42/);
 await page.evaluate(()=>{activePopupModal=null;switchTab('profile');});assert.equal(await page.locator('.fc-desktop-profile-logout').count(),0);
 await page.screenshot({path:path.join(output,'mini-auth-success.png')});assert.deepEqual(errors,[]);
 console.log('Shop browser PASS: plain/variant cart +/-, checkout name layout, guest receipt/retry, safe cancelled tracking, contacts, admin settings/toggles/modals, mobile Web logout, shared Mini App, responsive sizes.');
 }finally{await browser?.close();server.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
