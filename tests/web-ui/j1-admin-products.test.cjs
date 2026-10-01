const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..', '..');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

function ownerActor() { return { shopRole: 'OWNER', permissions: ['*'] }; }

function makeAdminPort() {
  const calls = [];
  let products = [
    { id: 'p1', sku: 'SKU-1', name: 'Protein', price: 200000, stock: 2, category_id: 'c1', status: 'ACTIVE', is_visible: true, variants: [], sold_count: 7 },
    { id: 'p2', sku: 'SKU-2', name: 'Kiyim', price: 150000, stock: 0, category_id: 'c2', status: 'OUT_OF_STOCK', is_visible: false, variants: [{ sku:'v1', qty:3 }, { sku:'v2', qty:4 }], sold_count: 2 },
  ];
  return {
    calls,
    port: {
      async invoke(action, payload) {
        calls.push({ action, payload: structuredClone(payload || {}) });
        if (action === 'get_admin_products') return { ok: true, data: { products: structuredClone(products), categories: [{ id:'c1',name:'Sport ozuqalari'},{id:'c2',name:'Sport kiyimlari'}], page: payload.page || 1, pageSize: payload.pageSize || 25, totalCount: products.length, totalPages: 1 } };
        if (action === 'toggle_product_visibility') { const row=products.find(x=>x.id===payload.productId); row.is_visible=payload.value!==false; return { ok:true, data:{ productId:row.id, isVisible:row.is_visible } }; }
        if (action === 'duplicate_product') { const source=products.find(x=>x.id===payload.productId); const copy={...source,id:'p-copy',name:source.name+' — nusxa'}; products.push(copy); return {ok:true,data:{product:copy}}; }
        if (action === 'bulk_move_products') { products=products.map(x=>payload.productIds.includes(x.id)?{...x,category_id:payload.categoryId}:x); return {ok:true,data:{count:payload.productIds.length,products:[]}}; }
        if (action === 'bulk_trash_products') { products=products.filter(x=>!payload.productIds.includes(x.id)); return {ok:true,data:{ok:true,count:payload.productIds.length,batchId:'b1'}}; }
        return { ok:false, error:{code:'CAPABILITY_UNAVAILABLE',message:'no',retryable:false} };
      },
    },
  };
}

test('J1 normalizes variant stock and permission-aware action availability', async () => {
  const { normalizeAdminProduct, adminProductActionAvailability } = await import(moduleUrl('web/features/admin-products/products.js'));
  const product = normalizeAdminProduct({ id:'p', name:'T', stock:99, variants:[{qty:2},{qty:5}], is_visible:false });
  assert.equal(product.stock, 7);
  assert.equal(product.isVisible, false);
  assert.equal(adminProductActionAvailability({ permissions:['products.manage'] }).canBulkTrash, true);
  assert.equal(adminProductActionAvailability({ permissions:['stock.view'] }).canOpen, false);
});

test('J1 controller sends search/filter/sort/page to admin API and keeps page selection explicit', async () => {
  const { createAdminProductsController } = await import(moduleUrl('web/features/admin-products/products.js'));
  const { port, calls } = makeAdminPort();
  const controller = createAdminProductsController({ adminPort: port, actor: ownerActor() });
  controller.setSearch('protein'); controller.setCategory('c1'); controller.setVisibility('VISIBLE'); controller.setStock('IN_STOCK'); controller.setSort('PRICE_DESC');
  const result = await controller.applyFilters();
  assert.equal(result.ok, true);
  assert.deepEqual(calls[0], { action:'get_admin_products', payload:{ search:'protein', categoryId:'c1', visibility:'VISIBLE', stock:'IN_STOCK', sort:'PRICE_DESC', page:1, pageSize:25 } });
  controller.toggleSelection('p1');
  assert.deepEqual(controller.getState().selectedIds, ['p1']);
  controller.selectPage();
  assert.equal(controller.getState().selectedIds.length, 2);
  controller.clearSelection();
  assert.deepEqual(controller.getState().selectedIds, []);
});

test('J1 existing product actions work through allowlisted admin calls and trash requires explicit confirmation', async () => {
  const { createAdminProductsController } = await import(moduleUrl('web/features/admin-products/products.js'));
  const { port, calls } = makeAdminPort();
  const controller = createAdminProductsController({ adminPort: port, actor: ownerActor() });
  await controller.load();
  assert.equal((await controller.toggleVisibility('p1', false)).ok, true);
  assert.equal(controller.getState().products.find(x=>x.id==='p1').isVisible, false);
  assert.equal((await controller.duplicateProduct('p1')).ok, true);
  controller.toggleSelection('p1');
  assert.equal((await controller.bulkMove('c2')).ok, true);
  controller.toggleSelection('p2');
  assert.equal((await controller.bulkTrash()).error.code, 'VALIDATION_ERROR');
  assert.equal(calls.filter(x=>x.action==='bulk_trash_products').length, 0);
  assert.equal((await controller.bulkTrash({ confirmed:true })).ok, true);
  assert.ok(calls.some(x=>x.action==='toggle_product_visibility'));
  assert.ok(calls.some(x=>x.action==='duplicate_product'));
  assert.ok(calls.some(x=>x.action==='bulk_move_products'));
  assert.ok(calls.some(x=>x.action==='bulk_trash_products'));
});

test('J1 denies product page/actions without products.manage before network', async () => {
  const { createAdminProductsController } = await import(moduleUrl('web/features/admin-products/products.js'));
  const calls=[];
  const controller = createAdminProductsController({ adminPort:{invoke:async(...args)=>{calls.push(args);return {ok:true,data:{}};}}, actor:{permissions:['stock.view']} });
  const result = await controller.load();
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'FORBIDDEN');
  assert.equal(calls.length, 0);
});

test('J1 mock admin supports products list and mutations for local/demo mode', async () => {
  const { createMockAdminAdapter } = await import(moduleUrl('web/services/mock/admin.js'));
  const adapter = createMockAdminAdapter();
  const list = await adapter.invoke('get_admin_products', { page:1, pageSize:25, search:'', categoryId:'ALL', visibility:'ALL', stock:'ALL', sort:'CATALOG' });
  assert.equal(list.ok, true);
  assert.equal(list.data.products.length, 3);
  assert.equal((await adapter.invoke('toggle_product_visibility',{productId:'prod-001',value:false})).data.isVisible, false);
  assert.equal((await adapter.invoke('duplicate_product',{productId:'prod-001'})).ok, true);
});

test('J1 live/server allowlists expose only reviewed catalog actions with products.manage and keep public catalog separate', async () => {
  const api = fs.readFileSync(path.join(root,'supabase/functions/shop-api/index.ts'),'utf8');
  const live = fs.readFileSync(path.join(root,'web/services/live/admin.js'),'utf8');
  for (const action of ['get_admin_products','toggle_product_visibility','duplicate_product','bulk_move_products','bulk_trash_products']) {
    assert.match(api, new RegExp(`${action}: 'products\\.manage'`));
    assert.match(live, new RegExp(`'${action}'`));
  }
  assert.match(api, /case "get_admin_products"[\s\S]*await requirePermission\('products\.manage'\)/);
  assert.match(api, /count:\s*"exact"/);
  assert.match(api, /case "get_catalog"/);
  assert.doesNotMatch(api.slice(api.indexOf('case "get_admin_products"'), api.indexOf('case "set_design_settings"')), /publicWebCatalog/);
});

test('J1 source has desktop table + mobile cards, search/filter/sort/selection and permission-safe action labels', () => {
  const ui = fs.readFileSync(path.join(root,'web/features/admin-products/products.js'),'utf8');
  const css = fs.readFileSync(path.join(root,'web/styles/features.css'),'utf8');
  for (const phrase of ['Mahsulotlar','Nomi, SKU yoki ID bo‘yicha qidirish','Barcha kataloglar','Ko‘rinadi','Yashirilgan','Katalog tartibi','Sahifadagini tanlash','Tanlovni tozalash','Ko‘chirish','Chiqindiga','Nusxalash']) assert.match(ui,new RegExp(phrase));
  assert.match(ui,/uw-admin-products-table/);
  assert.match(ui,/uw-admin-products-cards/);
  assert.match(css,/uw-admin-products-table-wrap/);
  assert.match(css,/uw-admin-products-cards/);
  assert.match(css,/max-width:\s*63\.999rem/);
});
