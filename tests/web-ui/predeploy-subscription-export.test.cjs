const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function excel(){const mod={exports:{}};vm.runInThisContext('(function(module,exports,require){'+fs.readFileSync('vendor/exceljs.min.js','utf8')+'\n})')(mod,mod.exports,require);return mod.exports;}
test('XLSX contains separate typed cells, Unicode names and only authorized customer columns',async()=>{
 const {buildReportWorkbook}=await import('../../web/features/admin-reports/export.js');const ExcelJS=excel();
 const bytes=await buildReportWorkbook({piiVisible:false,customers:[{name:'=SUM(A1)',phone:'private',totalOrders:2,totalSpent:300},{name:'Протеин',totalOrders:1,totalSpent:100}]},'customers',ExcelJS);
 const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);const sheet=book.getWorksheet('Tafsilotlar');assert.equal(sheet.getCell('A2').value,'=SUM(A1)');assert.equal(sheet.getCell('A2').type,3);assert.equal(sheet.getCell('B2').value,2);assert.equal(sheet.getCell('C2').value,300);assert.equal(sheet.getCell('D2').value,null);assert.equal(sheet.getCell('A3').value,'Протеин');
});
test('paginated XLSX export collects all pages with fixed filters',async()=>{
 const {createAdminReportsController}=await import('../../web/features/admin-reports/reports.js');let exported;const calls=[];
 const c=createAdminReportsController({actor:{permissions:['reports.view']},adminPort:{invoke:async(a,p)=>{calls.push(p);return {ok:true,data:{products:[{name:`Page ${p.page}`,revenue:p.page}],totalPages:2,totalCount:2}};}},excelLoader:async()=>excel(),downloadXlsx:async(bytes)=>{exported=bytes;}});
 await c.setTab('products');assert.equal((await c.exportExcel()).ok,true);assert.deepEqual(calls.slice(-2).map(x=>x.page),[1,2]);assert.ok(exported.byteLength>0);
});
test('subscription lost-response recovery and claim retry reuse one submission identity',async()=>{
 const {createPlatformPortalController}=await import('../../web/features/platform-portal/platform-portal.js');const calls=[];let submissions=0,claims=0;const storage=new Map();
 const c=createPlatformPortalController({sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},platformPort:{invoke:async(action,payload)=>{calls.push({action,payload});if(action==='platform_boot')return {ok:true,data:{platformActor:{accountId:'a1'},myShops:[{id:'s1',tariffId:'t1'}],tariffs:[{id:'t1',name:'Plan'}]}};
 if(action==='platform_submit_subscription_request'){submissions++;return submissions===1?{ok:false,error:{code:'NETWORK_ERROR'}}:{ok:true,data:{requestId:'r1',status:'NEW',replayed:true}};}
 if(action==='platform_confirm_payment_claim'){claims++;return claims===1?{ok:false,error:{code:'NETWORK_ERROR'}}:{ok:true,data:{}};}return {ok:true,data:{}};}}});
 await c.load();c.beginCheckout({kind:'UPGRADE',shopId:'s1',tariffId:'t1'});c.selectCardPayment();c.patchCheckout({consentAccepted:true});const pending=c.submitCheckout();assert.equal(c.submitCheckout(),pending);await pending;await c.submitCheckout();assert.equal(c.getState().checkoutStatus,'claim-warning');assert.equal(c.getState().checkout.submittedRequestId,'r1');await c.submitCheckout();assert.equal(c.getState().checkoutStatus,'submitted');const sent=calls.filter(x=>x.action==='platform_submit_subscription_request');assert.equal(new Set(sent.map(x=>x.payload.submissionKey)).size,1);assert.equal(storage.size,0);
});
