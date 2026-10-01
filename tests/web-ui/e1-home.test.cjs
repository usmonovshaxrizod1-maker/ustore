const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..', '..');
const moduleUrl = (file) => pathToFileURL(path.join(root, file)).href;

test('E1 home model follows existing boot shapes: activeBanners + featuredCategories(categoryId/productIds)', async () => {
  const { buildHomeModel } = await import(moduleUrl('web/features/home/home.js'));
  const model = buildHomeModel({
    categories: [{ id: 'a', name: 'A', parent_id: null }, { id: 'a-child', name: 'A child', parent_id: 'a' }, { id: 'b', name: 'B', parent_id: null }],
    products: [
      { id: 'p1', name: 'Visible', category_id: 'a-child', is_visible: true, status: 'ACTIVE', is_featured: true, created_at: '2026-09-20' },
      { id: 'p2', name: 'Hidden', category_id: 'a', is_visible: false, status: 'ACTIVE', is_featured: true, created_at: '2026-09-21' },
      { id: 'p3', name: 'Deleted', category_id: 'b', is_visible: true, status: 'DELETED', created_at: '2026-09-22' },
    ],
    activeBanners: [{ id: 'bn1', isActive: true, imageUrl: 'https://images.example/banner.webp' }, { id: 'bn2', isActive: false }],
    bundles: [{ id:'bu1', name:'Starter', bundlePrice:100, resolvedItems:[] }],
    featuredCategories: [{ categoryId: 'a', productIds: [] }],
  });
  assert.deepEqual(model.banners.map((x) => x.id), ['bn1']);
  assert.equal(model.featuredBlocks.length, 1);
  assert.equal(model.featuredBlocks[0].category.id, 'a');
  assert.deepEqual(model.featuredBlocks[0].products.map((x) => x.id), ['p1']);
  assert.deepEqual(model.featuredProducts.map((x) => x.id), ['p1']);
  assert.deepEqual(model.bundles.map((x) => x.id), ['bu1']);
});

test('E1 explicit productIds keep admin-selected order and still filter hidden products', async () => {
  const { buildHomeModel } = await import(moduleUrl('web/features/home/home.js'));
  const products = [
    { id: 'p1', name: 'One', category_id: 'a', is_visible: true, status: 'ACTIVE' },
    { id: 'p2', name: 'Two', category_id: 'a', is_visible: true, status: 'ACTIVE' },
    { id: 'p3', name: 'Hidden', category_id: 'a', is_visible: false, status: 'ACTIVE' },
  ];
  const model = buildHomeModel({ categories: [{ id: 'a', name: 'A', parent_id: null }], products, featuredCategories: [{ categoryId: 'a', productIds: ['p2', 'p3', 'p1'] }] });
  assert.deepEqual(model.featuredBlocks[0].products.map((x) => x.id), ['p2', 'p1']);
});

test('pinned products remain visible on home when featured categories are configured', async () => {
  const { buildHomeModel, createHomeView } = await import(moduleUrl('web/features/home/home.js'));
  class FakeNode {
    constructor(tag) { this.tagName=tag.toUpperCase(); this.children=[]; this.dataset={}; this.attributes={}; this.style={}; this.textContent=''; this.value=''; this.hidden=false; }
    append(...children) { this.children.push(...children); }
    setAttribute(key,value) { this.attributes[key]=String(value); }
    addEventListener() {}
  }
  const doc={ createElement(tag) { return new FakeNode(tag); } };
  const model=buildHomeModel({
    categories:[{id:'cat',name:'Kategoriya'}],
    products:[{id:'pinned',name:'Pinlangan',category_id:'cat',is_featured:true,stock:2,price:100}],
    featuredCategories:[{categoryId:'cat',productIds:['pinned']}],
  });
  const view=createHomeView({model},doc);
  const all=(node)=>[node,...node.children.flatMap(all)];
  const featured=all(view.element).find((node)=>node.dataset.section==='featured');
  assert.ok(featured);
  assert.ok(all(featured).some((node)=>node.dataset.productId==='pinned'));
});
