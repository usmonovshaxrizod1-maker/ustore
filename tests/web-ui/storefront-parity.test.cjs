const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..', '..');
const url = (file) => pathToFileURL(path.join(root, file)).href;

class FakeNode {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {}; this.hidden = false; this.textContent = ''; this.value = ''; this.listeners = {}; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, listener) { this.listeners[name] = listener; }
}
class FakeDocument { createElement(tag) { return new FakeNode(tag); } }
function flatten(node) { return [node, ...node.children.flatMap(flatten)]; }

test('web boot passes the same shop banners and featured categories into home model', async () => {
  const { createLiveShopPublicAdapters } = await import(url('web/services/live/shop-public.js'));
  const { loadHomeModel } = await import(url('web/features/home/home.js'));
  let catalogCalls = 0;
  const adapters = createLiveShopPublicAdapters({
    endpoint: 'https://api.example/functions/v1/shop-api', botId: '123',
    fetchImpl: async (_url, init) => {
      const action = JSON.parse(init.body).action;
      if (action === 'get_catalog') catalogCalls++;
      const data = action === 'boot' ? {
        shop: { id: 'shop-old', slug: 'old-shop', lifecycle: 'ACTIVE', currency: 'UZS' },
        shopContact: { name: 'Eski do‘kon' },
        activeBanners: [{ id: 'banner-1', imageUrl: 'https://cdn.example/banner.jpg' }],
        featuredCategories: [{ categoryId: 'cat-1', productIds: ['prod-1'] }],
      } : action === 'get_catalog' ? {
        products: [{ id: 'prod-1', name: 'Mahsulot', category_id: 'cat-1', price: 100, is_featured: true }],
        categories: [{ id: 'cat-1', name: 'Katalog', parent_id: null }],
      } : { bundles: [] };
      return { ok: true, json: async () => data };
    },
  });
  const context = await adapters.context.resolve();
  assert.equal(context.ok, true);
  const model = await loadHomeModel({ catalogPort: adapters.catalog, bootMarketing: context.data.marketing });
  assert.equal(model.ok, true);
  assert.deepEqual(model.data.banners.map((item) => item.id), ['banner-1']);
  assert.deepEqual(model.data.featuredBlocks[0].products.map((item) => item.id), ['prod-1']);
  assert.equal(catalogCalls, 1);
});

test('product card keeps selected variant image and price together and shows real discount', async () => {
  const { productCardModel, createProductCard } = await import(url('web/features/product/card.js'));
  const product = { id: 'p1', name: 'Ko‘ylak', stock: 3, price: 250, old_price: 300, badge: 'PROMO', variants: [{ color: 'Ko‘k', size: 'M', qty: 3, price: 200, oldPrice: 250, img: 'https://cdn.example/blue.jpg' }] };
  const model = productCardModel(product);
  assert.equal(model.image, 'https://cdn.example/blue.jpg');
  assert.equal(model.price, 200);
  assert.equal(model.oldPrice, 250);
  assert.equal(model.discount, 20);
  const card = createProductCard(product, {}, new FakeDocument());
  const nodes = flatten(card);
  assert.ok(nodes.some((node) => node.tagName === 'IMG' && node.src === model.image));
  assert.ok(nodes.some((node) => node.textContent === '-20%'));
  assert.ok(nodes.some((node) => node.textContent === 'Variant tanlash'));
  assert.equal(nodes.some((node) => node.textContent === '📌'), false);
});

test('customer card adds simple product and admin controls require explicit capability', async () => {
  const { createProductCard } = await import(url('web/features/product/card.js'));
  const product = { id: 'p2', name: 'Mahsulot', stock: 2, price: 100, is_featured: false };
  let added = 0; let pinned = 0;
  const customer = createProductCard(product, { onAdd: () => { added++; } }, new FakeDocument());
  const add = flatten(customer).find((node) => node.textContent === 'Savatga qo‘shish');
  add.listeners.click();
  assert.equal(added, 1);
  assert.equal(flatten(customer).some((node) => node.textContent === '📌'), false);
  const admin = createProductCard(product, { canManage: true, onPin: async () => { pinned++; return { ok: true }; }, onEdit: () => {} }, new FakeDocument());
  const pin = flatten(admin).find((node) => node.attributes['aria-label'] === 'Pin qilish');
  await pin.listeners.click();
  assert.equal(pinned, 1);
  assert.equal(product.is_featured, true);
});

test('home banners have one indicator each and category chips target their real block', async () => {
  const { buildHomeModel, createHomeView } = await import(url('web/features/home/home.js'));
  const model = buildHomeModel({
    categories: [{ id:'cat-1', name:'Kiyim', parent_id:null }],
    products: [{ id:'p1', name:'Ko‘ylak', category_id:'cat-1', price:100, stock:2 }],
    featuredCategories: [{ categoryId:'cat-1', productIds:['p1'] }],
    activeBanners: [{ id:'b1', imageUrl:'https://cdn.example/1.jpg' }, { id:'b2', imageUrl:'https://cdn.example/2.jpg' }],
  });
  let opened = null;
  const view = createHomeView({ model, onOpenBanner:(banner)=>{ opened=banner.id; } }, new FakeDocument());
  const nodes = flatten(view.element);
  assert.equal(nodes.filter((node) => node.className === 'uw-banner-indicator').length, 2);
  assert.ok(nodes.some((node) => node.className === 'uw-home-category-chips'));
  const banners = nodes.filter((node) => node.className === 'uw-home-hero');
  banners[1].listeners.click();
  assert.equal(opened, 'b2');
});

test('promotion detail uses the shop-scoped public endpoint and shows matching products', async () => {
  const { createLiveShopPublicAdapters } = await import(url('web/services/live/shop-public.js'));
  const { promotionProducts, createPromotionView } = await import(url('web/features/promotion/promotion.js'));
  const requests = [];
  const adapters = createLiveShopPublicAdapters({
    endpoint: 'https://api.example/functions/v1/shop-api', botId: '123',
    fetchImpl: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return { ok:true, json: async () => ({ promotion: { id:'promo-1', name:'Kuzgi aksiya', code:'KUZ10', discountType:'PERCENT', discountValue:10, productIds:['p1'], categoryIds:['cat2'], usageLimit:10, usedCount:3 } }) };
    },
  });
  const result = await adapters.catalog.getPromotion({ promotionId:'promo-1' });
  assert.equal(result.ok, true);
  assert.deepEqual(requests[0], { action:'get_web_promotion', payload:{ promotionId:'promo-1' }, clientMode:'web', botId:'123' });
  const products = promotionProducts(result.data, [
    { id:'p1', name:'Birinchi', category_id:'cat1', price:100, stock:2 },
    { id:'p2', name:'Ikkinchi', category_id:'cat2', price:200, stock:2 },
    { id:'p3', name:'Yashirin', category_id:'cat2', is_visible:false },
  ]);
  assert.deepEqual(products.map((item) => item.id), ['p1', 'p2']);
  let copied = '';
  const view = createPromotionView({ promotion:result.data, products, onCopy:(code)=>{ copied=code; } }, new FakeDocument());
  const nodes = flatten(view.element);
  assert.ok(nodes.some((item) => item.textContent === '7 ta'));
  assert.ok(nodes.some((item) => item.textContent === 'KUZ10'));
  nodes.find((item) => item.textContent === 'Nusxalash').listeners.click();
  assert.equal(copied, 'KUZ10');
});

test('active offer list links real bundles and promo codes', async () => {
  const { createPromotionsView } = await import(url('web/features/promotion/promotion.js'));
  let opened = '';
  const view = createPromotionsView({
    bundles:[{ id:'bundle-1', name:'To‘plam', bundlePrice:90000, savings:10000 }],
    promotions:[{ id:'promo-1', name:'Kuzgi kod', code:'KUZ10', discountType:'PERCENT', discountValue:10 }],
    onOpenBundle:(item)=>{ opened=item.id; }, onOpenPromotion:(item)=>{ opened=item.id; },
  }, new FakeDocument());
  const cards = flatten(view.element).filter((item) => item.className === 'uw-promotions__card');
  assert.equal(cards.length, 2);
  cards[0].listeners.click(); assert.equal(opened, 'bundle-1');
  cards[1].listeners.click(); assert.equal(opened, 'promo-1');
});
