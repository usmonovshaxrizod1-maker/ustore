const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..','..');
const url=(f)=>pathToFileURL(path.join(root,f)).href;
const owner={shopRole:'OWNER',permissions:['*'],roleCodes:['OWNER']};
const limited={shopRole:'STAFF',permissions:['orders.view'],roleCodes:['WAREHOUSE']};

test('L1 recovered: overview uses server response without recomputing KPI',async()=>{
 const {createMockAdminAdapter}=await import(url('web/services/mock/admin.js'));const {createAdminReportsController}=await import(url('web/features/admin-reports/reports.js'));
 const c=createAdminReportsController({adminPort:createMockAdminAdapter(),actor:owner});await c.load();const s=c.getState();assert.equal(s.status,'ready');assert.equal(s.data.overview.totalSales,370000);assert.equal(s.data.overview.orderCount,2);
});

test('L1 recovered: period/custom dates and customer/product server filters are forwarded',async()=>{
 const {createAdminReportsController}=await import(url('web/features/admin-reports/reports.js'));const calls=[];const port={async invoke(action,payload){calls.push({action,payload});return{ok:true,data:action==='get_customer_report'?{customers:[],page:1,pageSize:20,totalCount:0,totalPages:1,piiVisible:false,kpi:{}}:{products:[],page:1,pageSize:20,totalCount:0,totalPages:1,totalSales:0}};}};
 const c=createAdminReportsController({adminPort:port,actor:owner});c.setCustomRange('2026-09-01','2026-09-10');c.setCustomerFilters({search:'Ali',segment:'REPEAT'});await c.setTab('customers');let call=calls.at(-1);assert.equal(call.action,'get_customer_report');assert.equal(call.payload.dateFrom,'2026-09-01');assert.equal(call.payload.dateTo,'2026-09-10');assert.equal(call.payload.search,'Ali');assert.equal(call.payload.segment,'REPEAT');c.setProductFilters({view:'LOW_STOCK',page:2});await c.setTab('products');call=calls.at(-1);assert.equal(call.payload.view,'LOW_STOCK');
});

test('L1 recovered: reports.view permission gate blocks network request',async()=>{
 const {createAdminReportsController}=await import(url('web/features/admin-reports/reports.js'));let calls=0;const c=createAdminReportsController({adminPort:{async invoke(){calls++;return{ok:true,data:{}}}},actor:limited});await c.load();assert.equal(c.getState().status,'permission');assert.equal(calls,0);
});

test('L1 recovered: Excel requires loaded authorized report data',async()=>{
 const {createAdminReportsController}=await import(url('web/features/admin-reports/reports.js'));const c=createAdminReportsController({adminPort:{async invoke(){return{ok:true,data:{}}}},actor:owner});const r=await c.exportExcel();assert.equal(r.ok,false);assert.equal(r.error.code,'VALIDATION_ERROR');
});

test('L1 recovered: PDF exporter uses already loaded report data and does not refetch',async()=>{
 const {createAdminReportsController}=await import(url('web/features/admin-reports/reports.js'));let calls=0;const data={dateFrom:'2026-09-01',dateTo:'2026-09-02',totalSales:100,orderCount:1,avgOrderValue:100,totalUnitsSold:1,topProducts:[]};const port={async invoke(action){calls++;return{ok:true,data}}};let saved=null;function PDF(){this.text=()=>{};this.setFontSize=()=>{};this.save=(name)=>{saved=name};}const c=createAdminReportsController({adminPort:port,actor:owner,windowRef:{jspdf:{jsPDF:PDF}}});await c.load();const before=calls;await c.exportPdf();assert.equal(calls,before);assert.match(saved,/ustore-overview/);
});
