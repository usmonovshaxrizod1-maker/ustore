const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..','..');
const moduleUrl=(file)=>pathToFileURL(path.join(root,file)).href;

function owner(){return {permissions:['*']};}
function fakeExcelEngine(){
  const state={busy:false,busyText:'',fileName:'',rows:[],issues:[],rowIssues:[],progressDone:0,progressTotal:0,result:null,stagedImport:null,lastBatch:null};
  let bridge={}; const calls=[];
  const notify=()=>bridge.onChange?.(state);
  return {calls,state,configure(opts){bridge=opts;notify();},getSnapshot(){return state;},async prepare(){calls.push(['prepare']);},async downloadTemplate(){calls.push(['template']);await bridge.api('get_excel_template_url',{});},async handleFile(evt){calls.push(['file',evt.target.files[0].name]);state.fileName=evt.target.files[0].name;state.rows=[{name:'A'}];notify();},async doImport(){calls.push(['import']);state.stagedImport={batchId:'b1'};state.result={staged:true,totalRows:1};notify();},acceptSuggestionAt(i){calls.push(['accept',i]);},approveNewAt(i){calls.push(['new',i]);},async rollbackBatch(opts){calls.push(['rollback',opts]);state.lastBatch={id:'b1',status:'ROLLED_BACK'};notify();},async reset(){calls.push(['reset']);state.rows=[];notify();}};
}

test('J3 Excel controller reuses legacy engine bridge and admin actions',async()=>{
  const {createExcelImportController}=await import(moduleUrl('web/features/admin-imports/imports.js'));
  const engine=fakeExcelEngine();const apiCalls=[];const port={invoke:async(action,payload)=>{apiCalls.push({action,payload});return {ok:true,data:{url:'https://x.example/a.xlsx'}};}};
  const c=createExcelImportController({adminPort:port,actor:owner(),excelEngine:engine});
  assert.equal((await c.load()).ok,true);await c.chooseFile({name:'demo.xlsx'});assert.equal(c.getState().engine.fileName,'demo.xlsx');await c.downloadTemplate();assert.equal(apiCalls[0].action,'get_excel_template_url');await c.process();assert.equal(c.getState().engine.stagedImport.batchId,'b1');assert.equal((await c.rollback()).ok,false);assert.equal((await c.rollback({confirmed:true})).ok,true);
});

test('J3 Excel controller blocks before network without products.import_export',async()=>{
  const {createExcelImportController}=await import(moduleUrl('web/features/admin-imports/imports.js'));
  const engine=fakeExcelEngine();const calls=[];const c=createExcelImportController({adminPort:{invoke:async(...a)=>{calls.push(a);return {ok:true,data:{}};}},actor:{permissions:['products.manage']},excelEngine:engine});
  assert.equal((await c.load()).error.code,'FORBIDDEN');assert.equal(calls.length,0);
});

test('J3 BILLZ controller connect, browse, import and unlink use existing server actions',async()=>{
  const {createBillzImportController}=await import(moduleUrl('web/features/admin-imports/imports.js'));
  const calls=[];let connected=false;let imported=[];const port={invoke:async(action,payload={})=>{calls.push({action,payload});
    if(action==='billz_get_status')return {ok:true,data:{status:connected?'CONNECTED':'DISCONNECTED'}};
    if(action==='billz_connect'){connected=true;return {ok:true,data:{shops:[]}};}
    if(action==='billz_list_config_options')return {ok:true,data:{shops:[],cashboxes:[],paymentTypes:[]}};
    if(action==='billz_get_categories')return {ok:true,data:{categories:[{id:'bc1',name:'Sport'}]}};
    if(action==='billz_browse_products')return {ok:true,data:{items:[{billzProductId:'b1',name:'Protein',price:100,stock:2}],count:1,page:1,truncated:false}};
    if(action==='billz_import_products'){imported=[{id:'p1',billzProductId:'b1',name:'Protein'}];return {ok:true,data:{imported,importedCount:1,failedCount:0}};}
    if(action==='billz_list_imported_products')return {ok:true,data:{items:imported}};
    if(action==='billz_unlink_products'){imported=[];return {ok:true,data:{ok:true}};}
    if(action==='billz_list_deleted_products')return {ok:true,data:{items:[]}};
    return {ok:true,data:{}};
  }};
  const c=createBillzImportController({adminPort:port,actor:owner()});assert.equal((await c.load()).ok,true);assert.equal((await c.connect('secret')).ok,true);assert.equal(c.getState().connection.status,'CONNECTED');c.toggleSelected('b1');assert.equal((await c.importSelected()).ok,true);assert.equal(c.getState().imported.length,1);c.toggleImported('p1');assert.equal((await c.unlinkSelected()).ok,false);assert.equal((await c.unlinkSelected({confirmed:true})).ok,true);assert.ok(calls.some(x=>x.action==='billz_browse_products'));assert.ok(calls.some(x=>x.action==='billz_import_products'));
});

test('J3 BILLZ denies integrations.manage before network',async()=>{
  const {createBillzImportController}=await import(moduleUrl('web/features/admin-imports/imports.js'));const calls=[];const c=createBillzImportController({adminPort:{invoke:async(...a)=>{calls.push(a);return {ok:true,data:{}};}},actor:{permissions:['products.import_export']}});assert.equal((await c.load()).error.code,'FORBIDDEN');assert.equal(calls.length,0);
});

test('J3 mock admin supports Excel and BILLZ demo lifecycle',async()=>{
  const {createMockAdminAdapter}=await import(moduleUrl('web/services/mock/admin.js'));const a=createMockAdminAdapter();assert.equal((await a.invoke('get_excel_template_url',{})).ok,true);const start=await a.invoke('start_import_batch',{fileName:'x.xlsx',totalRows:1});assert.equal(start.ok,true);assert.equal((await a.invoke('stage_import_products',{batchId:start.data.batchId,rows:[{}],offset:0})).ok,true);assert.equal((await a.invoke('billz_connect',{secretToken:'x'})).ok,true);const browse=await a.invoke('billz_browse_products',{page:1,limit:10});assert.equal(browse.ok,true);assert.ok(browse.data.items.length>=1);
});

test('J3 legacy Excel engine exposes configurable bridge without replacing import parser',()=>{
  const src=fs.readFileSync(path.join(root,'excel-import.js'),'utf8');assert.match(src,/function configure\(options = \{\}\)/);assert.match(src,/async function apiCall/);assert.match(src,/currentCategories\(\)/);assert.match(src,/currentProducts\(\)/);assert.match(src,/const engine=\{configure,getSnapshot:/);assert.match(src,/parseV4SimpleSheet/);assert.match(src,/parseV4VariantSheet/);assert.match(src,/stage_import_products/);assert.match(src,/bulk_import_products/);
});

test('J3 live/server allowlists keep Excel and BILLZ secrets server-side',()=>{
  const live=fs.readFileSync(path.join(root,'web/services/live/admin.js'),'utf8');const api=fs.readFileSync(path.join(root,'supabase/functions/shop-api/index.ts'),'utf8');for(const action of ['get_excel_template_url','start_import_batch','stage_import_products','bulk_import_products','rollback_import_batch','billz_get_status','billz_connect','billz_browse_products','billz_import_products']){assert.match(live,new RegExp(`'${action}'`));assert.match(api,new RegExp(action));}assert.match(api,/billz_connect:[^\n]*'integrations\.manage'/);assert.match(api,/start_import_batch:[^\n]*'products\.import_export'/);assert.match(api,/encryptBotToken|secret_token_ciphertext/);const ui=fs.readFileSync(path.join(root,'web/features/admin-imports/imports.js'),'utf8');assert.doesNotMatch(ui,/localStorage[\s\S]{0,80}secret/i);
});

test('J3 premium view has Excel preview/progress/error and BILLZ browse/import surfaces',async()=>{
  const src=fs.readFileSync(path.join(root,'web/features/admin-imports/imports.js'),'utf8');const css=fs.readFileSync(path.join(root,'web/styles/features.css'),'utf8');for(const phrase of ['Excel orqali import','Serverda tekshirish','Tasdiqlash va katalogga saqlash','BILLZ maxfiy integratsiya kaliti','Tanlanganlarni import qilish','Barcha kategoriyalar'])assert.match(src,new RegExp(phrase));assert.match(src,/progress/);assert.match(src,/uw-billz-grid/);assert.match(css,/uw-admin-imports/);assert.match(css,/uw-import-progress/);assert.match(css,/uw-billz-grid/);
});
