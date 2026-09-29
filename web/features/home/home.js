import { createButton, createCard, createStatePanel } from '../../components/ui.js';
import { createBundleCollage } from '../bundle/bundle.js';
import { createProductCard } from '../product/card.js';
import { applyCatalogQuery } from '../catalog/catalog.js';

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
    categories: safeCategories,
    allProducts: safeProducts,
    bundles: (Array.isArray(bundles) ? bundles : []).filter((bundle) => bundle?.id && bundle?.name).slice(0, 12),
    featuredBlocks,
    featuredProducts: safeProducts.filter((product) => product.is_featured).slice(0, 12),
    latestProducts: [...safeProducts].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 12),
  };
}

export async function loadHomeModel({ catalogPort, bootMarketing = {} } = {}) {
  if (!catalogPort) throw new TypeError('catalogPort kerak');
  const [categoriesResult, productsResult, bundlesResult] = await Promise.all([
    catalogPort.listCategories({ all: true }),
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

function appendProductGrid(doc, section, products, cardOptions = {}) {
  const grid = doc.createElement('div'); grid.className = 'uw-product-grid';
  products.forEach((product, index) => grid.append(createProductCard(product, { ...cardOptions, isFavorite: cardOptions.favoriteIds?.has(String(product.id)) || false, index }, doc)));
  section.append(grid);
}

export function createHomeView({ model, state = 'ready', addingBundleId = null, onOpenProduct, onOpenCategory, onOpenBanner, onOpenBundle, onAddBundle, onAddProduct, onFavorite, favoriteIds = new Set(), canManage = false, onPin, onEdit, onVisibility, onDuplicate, onTrash, onAdmin, onRetry } = {}, documentRef = globalThis.document) {
  if (!documentRef?.createElement) throw new Error('Home UI uchun DOM kerak');
  const doc = documentRef;
  const root = doc.createElement('section'); root.className = 'uw-home'; root.dataset.feature = 'home';
  if (state === 'loading') { root.append(createStatePanel({ kind: 'loading', title: 'Yuklanmoqda', message: 'Do‘kon ma’lumotlari yuklanmoqda…' }, doc)); return { element: root }; }
  if (state === 'unavailable') { root.append(createStatePanel({ kind: 'error', title: 'Do‘kon vaqtincha mavjud emas', message: 'Keyinroq qayta urinib ko‘ring.', actionLabel: onRetry ? 'Qayta urinish' : '', onAction: onRetry }, doc)); return { element: root }; }
  if (state === 'error') { root.append(createStatePanel({ kind: 'error', title: 'Bosh sahifa yuklanmadi', message: 'Server yoki tarmoq javob bermadi. Mahsulotlar yo‘q deb ko‘rsatilmaydi.', actionLabel: onRetry ? 'Qayta urinish' : '', onAction: onRetry }, doc)); return { element: root }; }
  if (!model || (!model.featuredBlocks?.length && !model.featuredProducts?.length && !model.latestProducts?.length && !model.banners?.length && !model.bundles?.length)) {
    root.append(createStatePanel({ kind: 'empty', title: 'Hozircha mahsulotlar yo‘q', message: 'Do‘kon katalogi to‘ldirilganda shu yerda ko‘rinadi.' }, doc)); return { element: root };
  }

  const cardOptions = { onOpen: onOpenProduct, onAdd: onAddProduct, onFavorite, favoriteIds, canManage, onPin, onEdit, onVisibility, onDuplicate, onTrash };
  const renderProducts = (target, products) => appendProductGrid(doc, target, products, cardOptions);
  const bar = doc.createElement('div'); bar.className = 'uw-home-tools';
  if (onAdmin) {
    const launcher = doc.createElement('div'); launcher.className = 'uw-home-admin-launcher';
    launcher.append(text(doc, 'span', 'Admin rejimi · Boshqaruv markazi'));
    const open = doc.createElement('button'); open.type = 'button'; open.textContent = 'Ochish'; open.addEventListener('click', onAdmin); launcher.append(open);
    root.append(launcher);
  }
  const search = doc.createElement('input'); search.type = 'search'; search.id = 'uw-home-search'; search.placeholder = 'Mahsulot nomi yoki ID'; search.setAttribute('aria-label', 'Mahsulotlarni qidirish');
  const filter = doc.createElement('button'); filter.type = 'button'; filter.textContent = 'Filtr'; filter.setAttribute('aria-expanded', 'false');
  bar.append(search, filter);
  const chips = doc.createElement('div'); chips.className = 'uw-home-category-chips';
  for (const block of model.featuredBlocks || []) {
    const chip = doc.createElement('button'); chip.type = 'button'; chip.textContent = block.category.name; chip.addEventListener('click', () => { blockElements.get(String(block.category.id))?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); }); chips.append(chip);
  }
  bar.append(chips);
  const filterPanel = doc.createElement('div'); filterPanel.className = 'uw-home-filter-panel'; filterPanel.hidden = true;
  const categorySelect = doc.createElement('select'); categorySelect.setAttribute('aria-label', 'Kategoriya');
  const allCategory = doc.createElement('option'); allCategory.value = ''; allCategory.textContent = 'Barcha kategoriyalar'; categorySelect.append(allCategory);
  for (const category of model.categories || []) { const option = doc.createElement('option'); option.value = String(category.id); option.textContent = category.name; categorySelect.append(option); }
  const stock = doc.createElement('label'); const stockInput = doc.createElement('input'); stockInput.type = 'checkbox'; stock.append(stockInput, text(doc, 'span', 'Faqat qoldiqda bor'));
  const discount = doc.createElement('label'); const discountInput = doc.createElement('input'); discountInput.type = 'checkbox'; discount.append(discountInput, text(doc, 'span', 'Faqat chegirmali'));
  filterPanel.append(categorySelect, stock, discount); bar.append(filterPanel);
  const searchResults = doc.createElement('section'); searchResults.className = 'uw-home-search-results'; searchResults.hidden = true;
  const blockElements = new Map();
  const defaultContent = doc.createElement('div'); defaultContent.className = 'uw-home-default';
  function updateSearch() {
    const query = { q: String(search.value || '').trim(), categoryId: categorySelect.value || null, inStock: stockInput.checked, discount: discountInput.checked };
    const active = Boolean(query.q || query.categoryId || query.inStock || query.discount);
    searchResults.hidden = !active; defaultContent.hidden = active;
    if (!active) return;
    searchResults.replaceChildren();
    const found = applyCatalogQuery(model.allProducts || [], query, model.categories || []);
    searchResults.append(text(doc, 'h2', `Natijalar (${found.length})`, 'uw-section-title'));
    if (found.length) renderProducts(searchResults, found);
    else searchResults.append(createStatePanel({ kind: 'empty', title: 'Mahsulot topilmadi', message: 'Boshqa so‘z yoki filtr bilan urinib ko‘ring.' }, doc));
  }
  search.addEventListener('input', updateSearch); categorySelect.addEventListener('change', updateSearch); stockInput.addEventListener('change', updateSearch); discountInput.addEventListener('change', updateSearch);
  filter.addEventListener('click', () => { filterPanel.hidden = !filterPanel.hidden; filter.setAttribute('aria-expanded', filterPanel.hidden ? 'false' : 'true'); });
  root.append(bar, searchResults, defaultContent);

  if (model.banners?.length) {
    const strip = doc.createElement('section'); strip.className = 'uw-banner-strip'; strip.setAttribute('aria-label', 'Bannerlar');
    model.banners.forEach((banner, index) => {
      const hero = doc.createElement('button'); hero.type = 'button'; hero.className = 'uw-home-hero'; hero.dataset.bannerId = banner.id || '';
      if (banner.imageUrl) { const img = doc.createElement('img'); img.className = 'uw-home-hero__image'; img.src = banner.imageUrl; img.alt = ''; img.width = 1200; img.height = 480; img.loading = index === 0 ? 'eager' : 'lazy'; img.decoding = 'async'; img.fetchPriority = index === 0 ? 'high' : 'low'; img.referrerPolicy = 'no-referrer'; img.addEventListener('error', () => { img.hidden = true; }); hero.append(img); }
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
    defaultContent.append(strip);
    if (model.banners.length > 1) {
      const dots = doc.createElement('div'); dots.className = 'uw-banner-indicators'; dots.setAttribute('aria-label', 'Banner holati');
      const slides = Array.from(strip.children);
      let active = -1;
      const updateActive = () => {
        const center = strip.scrollLeft + strip.clientWidth / 2;
        let next = 0; let distance = Infinity;
        slides.forEach((slide, index) => { const delta = Math.abs(slide.offsetLeft + slide.clientWidth / 2 - center); if (delta < distance) { distance = delta; next = index; } });
        if (next === active) return; active = next;
        Array.from(dots.children).forEach((dot, index) => { dot.dataset.active = index === active ? 'true' : 'false'; dot.setAttribute('aria-current', index === active ? 'true' : 'false'); });
      };
      slides.forEach((slide, index) => { const dot = doc.createElement('button'); dot.type = 'button'; dot.className = 'uw-banner-indicator'; dot.setAttribute('aria-label', `Banner ${index + 1}`); dot.addEventListener('click', () => slide.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' })); dots.append(dot); });
      strip.addEventListener('scroll', updateActive, { passive: true });
      dots.children[0].dataset.active = 'true'; dots.children[0].setAttribute('aria-current', 'true');
      defaultContent.append(dots);
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { slides[Math.min(2, slides.length - 1)]?.scrollIntoView?.({ block: 'nearest', inline: 'center' }); updateActive(); });
    }
    let pointerX = null; let moved = false;
    strip.addEventListener('pointerdown', (event) => { pointerX = event.clientX; moved = false; }, { passive: true });
    strip.addEventListener('pointermove', (event) => { if (pointerX !== null && Math.abs(event.clientX - pointerX) > 8) moved = true; }, { passive: true });
    strip.addEventListener('click', (event) => { if (moved) { event.preventDefault(); event.stopPropagation(); moved = false; } }, true);
    strip.addEventListener('pointerup', () => { pointerX = null; }, { passive: true });
    strip.addEventListener('pointercancel', () => { pointerX = null; moved = false; });
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
    section.append(grid); defaultContent.append(section);
  }

  for (const block of model.featuredBlocks || []) {
    const section = doc.createElement('section'); section.className = 'uw-home-section'; section.dataset.categoryId = block.category.id;
    const header = doc.createElement('div'); header.className = 'uw-section-heading'; header.append(text(doc, 'h2', block.category.name, 'uw-section-title'));
    const all = doc.createElement('button'); all.type = 'button'; all.className = 'uw-section-link'; all.textContent = 'Barchasini ko‘rish →'; all.addEventListener('click', () => onOpenCategory?.(block.category)); header.append(all);
    section.append(header); appendProductGrid(doc, section, block.products, cardOptions); blockElements.set(String(block.category.id), section); defaultContent.append(section);
  }

  if (!model.featuredBlocks?.length && model.featuredProducts?.length) {
    const section = doc.createElement('section'); section.className = 'uw-home-section'; section.append(text(doc, 'h2', 'Tavsiya etilganlar', 'uw-section-title')); appendProductGrid(doc, section, model.featuredProducts, cardOptions); defaultContent.append(section);
  }
  return { element: root };
}
