const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..', '..');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

function owner() { return { shopRole:'OWNER', permissions:['*'] }; }
function file(name='x.jpg') { return { name, type:'image/jpeg', size:1024 }; }
function imageIO() { return { blobToBase64: async () => 'QUJD' }; }

function makePort() {
  const calls=[];
  const categories=[{id:'c1',name:'Protein',parent_id:null,img:'📦'}];
  let product={id:'p1',sku:'SKU1',name:'Protein',description:'Desc',price:100,old_price:150,stock:2,category_id:'c1',img:'https://example.invalid/a.jpg',variants:[]};
  return { calls, port:{ async invoke(action,payload={}) { calls.push({action,payload:structuredClone(payload)});
    if(action==='get_admin_product_editor') return {ok:true,data:{product:structuredClone(product),categories:structuredClone(categories)}};
    if(action==='add_product'){ product={id:'p-new',sku:'NEW',name:payload.name,description:payload.desc,price:payload.price,old_price:payload.oldPrice,stock:payload.variants?.length?payload.variants.reduce((s,v)=>s+Number(v.qty||0),0):payload.stock,category_id:payload.categoryId,img:payload.imageUpload?'https://cdn/new.jpg':payload.img,variants:(payload.variants||[]).map((v,i)=>({...v,colorImg:payload.variantImageUploads?.some(x=>x.index===i)?`https://cdn/v${i}.jpg`:v.colorImg}))}; return {ok:true,data:{product:structuredClone(product)}}; }
    if(action==='edit_product_field'){ if(payload.field==='name') product.name=payload.value; if(payload.field==='desc') product.description=payload.value; if(payload.field2==='desc') product.description=payload.value2; if(payload.field==='price'){product.price=payload.value;product.old_price=payload.oldPrice;} if(payload.field==='categoryId') product.category_id=payload.value; if(payload.field==='stock') product.stock=payload.value; if(payload.field==='img') product.img=payload.imageUpload?'https://cdn/main.jpg':payload.value; if(payload.field==='variants'){product.variants=payload.value.map((v,i)=>({...v,colorImg:payload.variantImageUploads?.some(x=>x.index===i)?`https://cdn/variant-${i}.jpg`:v.colorImg}));product.stock=product.variants.reduce((s,v)=>s+Number(v.qty||0),0);product.price=Number(product.variants[0]?.price||product.price);} return {ok:true,data:{product:structuredClone(product)}}; }
    if(action==='add_category') return {ok:true,data:{category:{id:'c2',name:payload.name,parent_id:payload.parentId||null,img:payload.imageUpload?'https://cdn/cat.jpg':payload.img}}};
    if(action==='edit_category') return {ok:true,data:{category:{id:payload.categoryId,name:payload.name,parent_id:null,img:payload.imageUpload?'https://cdn/cat-edit.jpg':payload.img}}};
    return {ok:false,error:{code:'CAPABILITY_UNAVAILABLE',message:'no',retryable:false}};
  }}};
}

class FakeStyle { setProperty(name,value){this[name]=String(value);} }
class FakeNode { constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.dataset={};this.style=new FakeStyle();this.className='';this.textContent='';this.value='';this.listeners={};this.disabled=false;this.files=[];} append(...x){this.children.push(...x);} setAttribute(n,v){this.attributes[n]=String(v);} addEventListener(n,fn){this.listeners[n]=fn;} removeAttribute(n){delete this.attributes[n];} click(){} }
class FakeDocument { createElement(tag){return new FakeNode(tag);} }

function flatten(node,out=[]){out.push(node);for(const child of node.children||[]) if(child&&typeof child==='object') flatten(child,out);return out;}

test('J2 validates variants and preserves existing SKU/BILLZ/color image metadata', async () => {
  const { normalizeEditableVariant, validateProductDraft } = await import(moduleUrl('web/features/admin-products/editor.js'));
  const v=normalizeEditableVariant({size:'M',color:'Qora',qty:2,sku:'S1',billzProductId:'B1',colorImg:'https://x.example/a.jpg',price:120,oldPrice:150});
  assert.equal(v.sku,'S1'); assert.equal(v.billzProductId,'B1'); assert.equal(v.colorImg,'https://x.example/a.jpg');
  const valid=validateProductDraft({name:'T',price:100,oldPrice:120,stock:0,variants:[v]}); assert.equal(valid.ok,true);
  const duplicate=validateProductDraft({name:'T',price:100,stock:0,variants:[v,{...v,sku:'S2'}]}); assert.equal(duplicate.ok,false); assert.ok(duplicate.error.fieldErrors['variant.1.duplicate']);
});

test('J2 create product uses existing image helper for main + variant files and one add_product call', async () => {
  const { createAdminProductEditorController } = await import(moduleUrl('web/features/admin-products/editor.js'));
  const {port,calls}=makePort(); const c=createAdminProductEditorController({adminPort:port,actor:owner(),imageIO:imageIO()});
  c.openCreate({categories:[{id:'c1',name:'Protein'}],categoryId:'c1'}); c.setField('name','Yangi'); c.setField('price','100'); c.setField('oldPrice','130'); c.chooseImageFile(file('main.jpg'));
  c.addVariant({color:'Qora',size:'M',qty:3,price:110,oldPrice:140}); c.chooseVariantImageFile(0,file('black.jpg'));
  const result=await c.createProduct(); assert.equal(result.ok,true);
  const call=calls.find(x=>x.action==='add_product'); assert.ok(call); assert.equal(call.payload.imageUpload.base64,'QUJD'); assert.equal(call.payload.variantImageUploads[0].index,0); assert.equal(call.payload.variants[0].price,110);
});

test('J2 edit sections reuse existing edit_product_field and variants keep exact combination prices', async () => {
  const { createAdminProductEditorController } = await import(moduleUrl('web/features/admin-products/editor.js'));
  const {port,calls}=makePort(); const c=createAdminProductEditorController({adminPort:port,actor:owner(),imageIO:imageIO()}); await c.load('p1');
  c.setField('name','Protein 2'); c.setField('description','Yangi desc'); assert.equal((await c.saveBasics()).ok,true);
  c.setField('price','200'); c.setField('oldPrice','250'); assert.equal((await c.savePrice()).ok,true);
  c.addVariant({color:'Yashil',size:'L',qty:4,price:220,oldPrice:260,sku:'KEEP'}); c.chooseVariantImageFile(0,file()); assert.equal((await c.saveVariants()).ok,true);
  const variantCall=calls.find(x=>x.action==='edit_product_field'&&x.payload.field==='variants'); assert.equal(variantCall.payload.value[0].price,220); assert.equal(variantCall.payload.value[0].oldPrice,260); assert.equal(variantCall.payload.value[0].sku,'KEEP'); assert.equal(variantCall.payload.variantImageUploads.length,1);
});

test('J2 category editor requires catalog.manage and sends only icon fields', async () => {
  const { createAdminCategoryEditorController } = await import(moduleUrl('web/features/admin-products/editor.js'));
  const deniedCalls=[]; const denied=createAdminCategoryEditorController({adminPort:{invoke:async(...a)=>{deniedCalls.push(a);return {ok:true,data:{}};}},actor:{permissions:['products.manage']},imageIO:imageIO()}); assert.equal(denied.openCreate().error.code,'FORBIDDEN'); assert.equal(deniedCalls.length,0);
  const {port,calls}=makePort(); const c=createAdminCategoryEditorController({adminPort:port,actor:{permissions:['catalog.manage']},imageIO:imageIO()}); c.openCreate({categories:[]}); c.setField('name','Vitaminlar'); c.setField('iconId','nutrition_vitamins'); assert.equal((await c.save()).ok,true); assert.equal(calls.at(-1).action,'add_category'); assert.equal(calls.at(-1).payload.iconId,'nutrition_vitamins'); assert.equal('img' in calls.at(-1).payload,false); assert.equal('imageUpload' in calls.at(-1).payload,false);
  c.openEdit({id:'c1',name:'Protein',img:'📦'},[]); c.setField('name','Proteinlar'); assert.equal((await c.save()).ok,true); assert.equal(calls.at(-1).action,'edit_category'); assert.equal('img' in calls.at(-1).payload,false);
});

test('J2 denies product editor before network without products.manage', async () => {
  const { createAdminProductEditorController } = await import(moduleUrl('web/features/admin-products/editor.js'));
  const calls=[]; const c=createAdminProductEditorController({adminPort:{invoke:async(...a)=>{calls.push(a);return {ok:true,data:{}};}},actor:{permissions:['catalog.manage']},imageIO:imageIO()});
  assert.equal((await c.load('p1')).error.code,'FORBIDDEN'); assert.equal(c.openCreate().error.code,'FORBIDDEN'); assert.equal(calls.length,0);
});

test('J2 mock admin supports full editor actions', async () => {
  const { createMockAdminAdapter } = await import(moduleUrl('web/services/mock/admin.js'));
  const mock=createMockAdminAdapter(); const detail=await mock.invoke('get_admin_product_editor',{productId:'prod-003'}); assert.equal(detail.ok,true); assert.ok(detail.data.product.description);
  const added=await mock.invoke('add_product',{name:'Demo',price:100,stock:2,variants:[]}); assert.equal(added.ok,true);
  const edited=await mock.invoke('edit_product_field',{productId:added.data.product.id,field:'name',value:'Demo 2'}); assert.equal(edited.data.product.name,'Demo 2');
  assert.equal((await mock.invoke('add_category',{name:'Demo cat'})).ok,true);
});

test('J2 live/server allowlists are narrow and server re-checks product/catalog permissions plus image validation', () => {
  const api=fs.readFileSync(path.join(root,'supabase/functions/shop-api/index.ts'),'utf8'); const live=fs.readFileSync(path.join(root,'web/services/live/admin.js'),'utf8');
  for(const action of ['get_admin_product_editor','add_product','edit_product_field']) { assert.match(live,new RegExp(`'${action}'`)); assert.match(api,new RegExp(`${action}: 'products\\.manage'`)); }
  for(const action of ['add_category','edit_category']) { assert.match(live,new RegExp(`'${action}'`)); assert.match(api,new RegExp(`${action}: 'catalog\\.manage'`)); }
  assert.match(api,/case "get_admin_product_editor"[\s\S]*requirePermission\('products\.manage'\)/); assert.match(api,/variantImageUploads/); assert.match(api,/invalid_variant_image_upload/); assert.match(api,/case "add_category"[\s\S]*payload\.imageUpload/); assert.match(api,/case "edit_category"[\s\S]*payload\.imageUpload/); assert.match(api,/normalizeProductImageUrl/);
});

test('J2 view keeps product image picker but category editor only exposes icon fields', async () => {
  const { createAdminProductEditorController, createAdminProductEditorView, createAdminCategoryEditorController, createAdminCategoryEditorView } = await import(moduleUrl('web/features/admin-products/editor.js'));
  const {port}=makePort(); const doc=new FakeDocument(); const pc=createAdminProductEditorController({adminPort:port,actor:owner(),imageIO:imageIO()}); pc.openCreate({categories:[{id:'c1',name:'Protein'}]}); pc.setField('name','Demo'); pc.setField('price','100'); pc.addVariant({color:'Qora',size:'M',qty:1,price:100}); const pv=createAdminProductEditorView({controller:pc,documentRef:doc}).element; assert.equal(pv.dataset.feature,'admin-product-editor'); const nodes=flatten(pv); assert.ok(nodes.some(n=>n.className?.includes('uw-image-drop'))); assert.ok(nodes.some(n=>n.tagName==='INPUT'&&n.type==='file'));
  const cc=createAdminCategoryEditorController({adminPort:port,actor:owner(),imageIO:imageIO()}); cc.openCreate({categories:[]}); const cv=createAdminCategoryEditorView({controller:cc,documentRef:doc}).element; assert.equal(cv.dataset.feature,'admin-category-editor'); assert.equal(flatten(cv).some(n=>n.listeners?.drop),false); assert.equal(flatten(cv).some(n=>n.tagName==='INPUT'&&n.type==='file'),false);
});
