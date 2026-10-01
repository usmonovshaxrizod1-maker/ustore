const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const load=file=>import(pathToFileURL(path.resolve(__dirname,'../..',file)).href);
class Node {
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(k,v){this.attributes[k]=v;}
  addEventListener(){}
}
const doc={createElement:tag=>new Node(tag)};
test('3B import page bridges catalog updates and disconnects engine on unmount',async()=>{
  const {createAdminImportsPage}=await load('web/features/admin-imports/page.js');let bridge;
  const engine={configure(value){bridge=value;},handleFile:async()=>{},doImport:async()=>{},prepare:async()=>{},getSnapshot:()=>({})};
  const page=await createAdminImportsPage({documentRef:doc,actor:{permissions:['products.import_export']},engineLoader:async()=>engine,adminPort:{invoke:async()=>({ok:true,data:[]})},catalogPort:{listCategories:async()=>({ok:true,data:{items:[]}}),listProducts:async()=>({ok:true,data:{items:[]}})}});
  await page.load();bridge.onCatalogMutation('product',{id:'p1',name:'First'});bridge.onCatalogMutation('product',{id:'p1',name:'Updated'});
  assert.equal(bridge.getProducts().length,1);assert.equal(bridge.getProducts()[0].name,'Updated');
  bridge.onCatalogMutation('category',{id:'c1'});assert.equal(bridge.getCategories()[0].id,'c1');
  page.destroy();assert.equal(bridge.onChange,null);await assert.rejects(bridge.api(),/yopilgan/);
});
test('3B denied create and edit leave loading state without backend requests',async()=>{
  const {createAdminProductEditorPage}=await load('web/features/admin-products/editor-page.js');
  for(const productId of [undefined,'p1']){
    const page=createAdminProductEditorPage({documentRef:doc,actor:{permissions:[]},productId,adminPort:{invoke:()=>{throw new Error('Forbidden request');}}});
    assert.equal((await page.load()).ok,false);assert.equal(page.controller.getState().status,'permission');page.destroy();
  }
});
test('3B new product opens existing controller with supplied categories',async()=>{
  const {createAdminProductEditorPage}=await load('web/features/admin-products/editor-page.js');
  const page=createAdminProductEditorPage({documentRef:doc,actor:{permissions:['products.manage']},categories:[{id:'c1',name:'Test'}],adminPort:{invoke:async()=>{throw new Error('No request before submit');}}});
  await page.load();assert.equal(page.controller.getState().mode,'create');
  assert.equal(page.controller.getState().categories[0].id,'c1');page.destroy();
});
test('3B creation and import routes remain admin protected',async()=>{
  const {createRouteMatcher}=await load('web/navigation/router.js');const match=createRouteMatcher();
  for(const url of ['/admin/products/new','/admin/categories/new','/admin/imports'])assert.equal(match(url).route.admin,true);
});
test('3B asset loader resolves from module URL rather than deep route',async()=>{
  const {loadAdminAsset}=await load('web/runtime/admin-assets.js');let script;
  const fake={createElement:()=>({remove(){}}),head:{appendChild(node){script=node;globalThis.TestAdminAsset={ready:true};node.onload();}}};
  const result=await loadAdminAsset('ustore-image-io.js','TestAdminAsset',fake);
  assert.equal(result.ready,true);assert.ok(script.src.endsWith('/ustore-image-io.js'));
  assert.ok(!script.src.includes('/web/runtime/'));delete globalThis.TestAdminAsset;
});
test('editor deep link remains admin protected',async()=>{
  const {createRouteMatcher}=await load('web/navigation/router.js');
  const route=createRouteMatcher()('/admin/products/p1/edit');
  assert.equal(route.route.admin,true);assert.equal(route.params.productId,'p1');
});
test('mounted editor loads real action, preserves input DOM, and saves through existing action',async()=>{
  const {createAdminProductEditorPage}=await load('web/features/admin-products/editor-page.js');
  const calls=[];
  const page=createAdminProductEditorPage({documentRef:doc,actor:{permissions:['products.manage']},productId:'p1',adminPort:{invoke:async(action,payload)=>{
    calls.push({action,payload});
    return {ok:true,data:{product:{id:'p1',name:'Original',price:100,stock:2},categories:[]}};
  }}});
  assert.equal((await page.load()).ok,true);
  const body=page.element.children[1];const editor=body.children[0];
  page.controller.setField('name','Updated');
  assert.equal(body.children[0],editor);
  assert.equal((await page.controller.saveBasics()).ok,true);
  assert.equal(calls[0].action,'get_admin_product_editor');
  assert.ok(calls.some(c=>c.action==='edit_product_field'&&c.payload.field==='name'&&c.payload.value==='Updated'));
  page.destroy();const detached=body.children[0];
  await page.controller.load('p1');assert.equal(body.children[0],detached);
});
test('failed load exposes error, not editable empty product',async()=>{
  const {createAdminProductEditorPage}=await load('web/features/admin-products/editor-page.js');
  const page=createAdminProductEditorPage({documentRef:doc,actor:{permissions:['products.manage']},productId:'p1',adminPort:{invoke:async()=>({ok:false,error:{code:'NOT_FOUND',message:'Missing'}})}});
  await page.load();assert.equal(page.controller.getState().status,'error');
  assert.notEqual(page.element.children[1].children[0].dataset.feature,'admin-product-editor');page.destroy();
});
