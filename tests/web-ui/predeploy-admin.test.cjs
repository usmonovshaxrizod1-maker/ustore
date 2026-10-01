const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const editor=()=>import('../../web/features/admin-products/editor.js');
test('save guards reject cross-section races, keep draft stable and release after network errors',async()=>{
 const {createAdminProductEditorController}=await editor();let finish,calls=0;
 const c=createAdminProductEditorController({actor:{permissions:['*']},adminPort:{invoke:async(action)=>{
 if(action==='get_admin_product_editor')return {ok:true,data:{product:{id:'p',name:'Original',price:12},categories:[]}};
 calls++;return new Promise(resolve=>finish=resolve);
 }}});await c.load('p');c.setField('name','Saved');const p=c.saveBasics();
 assert.equal((await c.savePrice()).error.code,'CONFLICT');c.setField('name','Changed');assert.equal(c.getState().draft.name,'Saved');
 await Promise.resolve();finish({ok:true,data:{}});await p;assert.equal(calls,1);assert.equal(c.getState().success,'Mahsulot saqlandi.');
});
test('category duplicate save shares request and exceptions clear busy state',async()=>{
 const {createAdminCategoryEditorController}=await editor();let calls=0;
 const c=createAdminCategoryEditorController({actor:{permissions:['*']},adminPort:{invoke:async()=>{calls++;throw Error('offline');}}});c.openCreate();c.setField('name','Katalog');const p=c.save();assert.equal(c.save(),p);await p;
 assert.equal(calls,1);assert.equal(c.getState().busy,false);assert.equal(c.getState().error.code,'NETWORK_ERROR');
});
test('isolated web Excel engines preserve legacy instance and cannot cross callbacks',async()=>{
 const box={window:{},document:{getElementById:()=>null,createElement:()=>({})},console};vm.createContext(box);vm.runInContext(fs.readFileSync('excel-import.js','utf8'),box);
 const legacy=box.window.UstoreExcel,a=legacy.createInstance(),b=legacy.createInstance();assert.notEqual(a,b);assert.equal(box.window.UstoreExcel,legacy);
 a.configure({api:async()=>({batch:{id:'a'}})});b.configure({api:async()=>({batch:{id:'b'}})});await Promise.all([a.prepare(),b.prepare()]);assert.equal(a.state.lastBatch.id,'a');assert.equal(b.state.lastBatch.id,'b');assert.equal(legacy.state.lastBatch,null);
});
