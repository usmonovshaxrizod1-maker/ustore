import { createButton, createCard, createStatePanel } from '../../components/ui.js';
import { createBundleCollage } from '../bundle/bundle.js';

function publicProducts(items) {
  return (Array.isArray(items) ? items : []).filter((product) => product?.is_visible !== false && product?.status !== 'DELETED');
}

function categoryBranchIds(categories, rootId) {
  const ids = new Set([String(rootId)]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of categories) {
      const id = String(category?.id || '');
      const parentId = category?.parent_id == null ? null : String(category.parent_id);
      if (id && parentId && ids.has(parentId) && !ids.has(id)) { ids.add(id); changed = true; }
    }
  }
  return ids;
}

export function buildHomeModel({ categories = [], products = [], bundles = [], activeBanners = [], featuredCategories = [] } = {}) {
  const safeProducts = publicProducts(products);
  const safeCategories = (Array.isArray(categories) ? categories : []).filter(Boolean);
  const byCategory = new Map(safeCategories.map((category) => [String(category.id), category]));
  const byProduct = new Map(safeProducts.map((product) => [String(product.id), product]));
  const featuredBlocks = (Array.isArray(featuredCategories) ? featuredCategories : []).slice(0, 8).map((entry) => {
    const category = byCategory.get(String(entry?.categoryId || ''));
    if (!category) return null;
    const selected = (Array.isArray(entry?.productIds) ? entry.productIds : []).map((id) => byProduct.get(String(id))).filter(Boolean).slice(0, 6);
    const branch = categoryBranchIds(safeCategories, category.id);
    const fallback = safeProducts.filter((product) => branch.has(String(product.category_id))).slice(0, 6);
    return { category, products: selected.length ? selected : fallback };
  }).filter((block) => block && block.products.length);
  return {
    banners: (Array.isArray(activeBanners) ? activeBanners : []).filter((banner) => banner?.isActive !== false).slice(0, 5),
    bundles: (Array.isArray(bundles) ? bundles : []).filter((bundle) => bundle?.id && bundle?.name).slice(0, 12),
    featuredBlocks,
    featuredProducts: safeProducts.filter((product) => product.is_featured).slice(0, 12),
    latestProducts: [...safeProducts].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 12),
  };
}

export async function loadHomeModel({ catalogPort, bootMarketing = {} } = {}) {
  if (!catalogPort) throw new TypeError('catalogPort kerak');
  const [categoriesResult, productsResult, bundlesResult] = await Promise.all([
    catalogPort.listCategories({ parentId: null }),
    catalogPort.listProducts({}),
    catalogPort.listBundles({}),
  ]);
  if (!categoriesResult.ok) return categoriesResult;
  if (!productsResult.ok) return productsResult;
  if (!bundlesResult.ok) return bundlesResult;
  return {
    ok: true,
    data: buildHomeModel({
      categories: categoriesResult.data.items,
      products: productsResult.data.items,
      bundles: bundlesResult.data.items,
      activeBanners: bootMarketing.activeBanners || [],
      featuredCategories: bootMarketing.featuredCategories || [],
    }),
  };
}

function text(doc, tag, value, className = '') {
  const node = doc.createElement(tag); node.textContent = String(value ?? ''); node.className = className; return node;
}

function appendProductGrid(doc, section, products, onOpenProduct) {
  const grid = doc.createElement('div'); grid.className = 'uw-product-grid';
  for (const product of products) {
    const card = createCard({ title: product.name, description: `${Number(product.price || 0).toLocaleString('uz-UZ')} so‘m` }, doc);
    card.dataset.productId = product.id;
    card.addEventListener('click', () => onOpenProduct?.(product));
    grid.append(card);
  }
  section.append(grid);
}

export function createHomeView({ model, state = 'ready', addingBundleId = null, onOpenProduct, onOpenCategory, onOpenBanner, onOpenBundle, onAddBundle, onRetry } = {}, documentRef = globalThis.document) {
  if (!documentRef?.createElement) throw new Error('Home UI uchun DOM kerak');
  const doc = documentRef;
  const root = doc.createElement('section'); root.className = 'uw-home'; root.dataset.feature = 'home';
  if (state === 'loading') { root.append(createStatePanel({ kind: 'loading', title: 'Yuklanmoqda', message: 'Do‘kon ma’lumotlari yuklanmoqda…' }, doc)); return { element: root }; }
  if (state === 'unavailable') { root.append(createStatePanel({ kind: 'error', title: 'Do‘kon vaqtincha mavjud emas', message: 'Keyinroq qayta urinib ko‘ring.', actionLabel: onRetry ? 'Qayta urinish' : '', onAction: onRetry }, doc)); return { element: root }; }
  if (state === 'error') { root.append(createStatePanel({ kind: 'error', title: 'Bosh sahifa yuklanmadi', message: 'Server yoki tarmoq javob bermadi. Mahsulotlar yo‘q deb ko‘rsatilmaydi.', actionLabel: onRetry ? 'Qayta urinish' : '', onAction: onRetry }, doc)); return { element: root }; }
  if (!model || (!model.featuredBlocks?.length && !model.featuredProducts?.length && !model.latestProducts?.length && !model.banners?.length && !model.bundles?.length)) {
    root.append(createStatePanel({ kind: 'empty', title: 'Hozircha mahsulotlar yo‘q', message: 'Do‘kon katalogi to‘ldirilganda shu yerda ko‘rinadi.' }, doc)); return { element: root };
  }

  if (model.banners?.length) {
    const strip = doc.createElement('section'); strip.className = 'uw-banner-strip'; strip.setAttribute('aria-label', 'Bannerlar');
    model.banners.forEach((banner, index) => {
      const hero = doc.createElement('button'); hero.type = 'button'; hero.className = 'uw-home-hero'; hero.dataset.bannerId = banner.id || '';
      if (banner.imageUrl) { const img = doc.createElement('img'); img.className = 'uw-home-hero__image'; img.src = banner.imageUrl; img.alt = ''; img.width = 1200; img.height = 480; img.loading = index === 0 ? 'eager' : 'lazy'; img.decoding = 'async'; img.fetchPriority = index === 0 ? 'high' : 'low'; img.referrerPolicy = 'no-referrer'; hero.append(img); }
      if (banner.mode === 'TEMPLATE' || banner.title || banner.subtitle) {
        const copy = doc.createElement('span'); copy.className = 'uw-home-hero__copy';
        copy.append(text(doc, 'span', banner.title || '', 'uw-home-hero__title'), text(doc, 'span', banner.subtitle || '', 'uw-home-hero__subtitle'));
        if (banner.ctaText) copy.append(text(doc, 'span', banner.ctaText, 'uw-home-hero__cta'));
        hero.append(copy);
      }
      hero.addEventListener('click', () => onOpenBanner?.(banner));
      if (index >= 3) hero.dataset.lazy = 'true';
      strip.append(hero);
    });
    root.append(strip);
  }

  if (model.bundles?.length) {
    const section = doc.createElement('section'); section.className = 'uw-home-section uw-home-bundles'; section.dataset.section = 'bundles';
    section.append(text(doc, 'h2', 'Aksiya to‘plamlari', 'uw-section-title'));
    const grid = doc.createElement('div'); grid.className = 'uw-bundle-grid';
    for (const bundle of model.bundles) {
      const saving = Number(bundle.savings) > 0 ? ` · ${Number(bundle.savings).toLocaleString('uz-UZ')} so‘m tejash` : '';
      const card = createCard({
        title:bundle.name,
        description:`${Number(bundle.bundlePrice || 0).toLocaleString('uz-UZ')} so‘m${saving}`,
        body:createBundleCollage(bundle, doc),
        actions:[
          createButton({ label:'Batafsil', variant:'secondary', onClick:()=>onOpenBundle?.(bundle) }, doc),
          createButton({ label:addingBundleId === String(bundle.id) ? 'Qo‘shilmoqda…' : 'Savatga qo‘shish', busy:addingBundleId === String(bundle.id), disabled:Boolean(addingBundleId), onClick:()=>onAddBundle?.(bundle) }, doc),
        ],
      }, doc);
      card.className += ' uw-bundle-card'; card.dataset.bundleId = String(bundle.id);
      grid.append(card);
    }
    section.append(grid); root.append(section);
  }

  for (const block of model.featuredBlocks || []) {
    const section = doc.createElement('section'); section.className = 'uw-home-section'; section.dataset.categoryId = block.category.id;
    const header = doc.createElement('div'); header.className = 'uw-section-heading'; header.append(text(doc, 'h2', block.category.name, 'uw-section-title'));
    const all = doc.createElement('button'); all.type = 'button'; all.className = 'uw-section-link'; all.textContent = 'Barchasini ko‘rish →'; all.addEventListener('click', () => onOpenCategory?.(block.category)); header.append(all);
    section.append(header); appendProductGrid(doc, section, block.products, onOpenProduct); root.append(section);
  }

  if (!model.featuredBlocks?.length && model.featuredProducts?.length) {
    const section = doc.createElement('section'); section.className = 'uw-home-section'; section.append(text(doc, 'h2', 'Tavsiya etilganlar', 'uw-section-title')); appendProductGrid(doc, section, model.featuredProducts, onOpenProduct); root.append(section);
  }
  return { element: root };
}
