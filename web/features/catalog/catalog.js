import { createStatePanel } from '../../components/ui.js';
import { createProductCard } from '../product/card.js';

const SORT_VALUES = new Set(['relevance', 'price-asc', 'price-desc', 'newest', 'sold']);

function cleanNumber(value) {
  if (value === '' || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function parseCatalogQuery(input = '') {
  const params = input instanceof URLSearchParams ? input : new URLSearchParams(String(input).replace(/^\?/, ''));
  const sort = SORT_VALUES.has(params.get('sort')) ? params.get('sort') : 'relevance';
  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);
  return {
    q: (params.get('q') || '').trim(),
    categoryId: (params.get('category') || '').trim() || null,
    minPrice: cleanNumber(params.get('min')),
    maxPrice: cleanNumber(params.get('max')),
    inStock: params.get('stock') === '1',
    discount: params.get('discount') === '1',
    sort,
    page,
  };
}

export function serializeCatalogQuery(state = {}) {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.categoryId) params.set('category', state.categoryId);
  if (state.minPrice != null) params.set('min', String(state.minPrice));
  if (state.maxPrice != null) params.set('max', String(state.maxPrice));
  if (state.inStock) params.set('stock', '1');
  if (state.discount) params.set('discount', '1');
  if (state.sort && state.sort !== 'relevance') params.set('sort', state.sort);
  if (Number(state.page) > 1) params.set('page', String(state.page));
  const value = params.toString();
  return value ? `?${value}` : '';
}

function variantPrices(product) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  if (!variants.length) return [Number(product?.price) || 0];
  return variants.map((variant) => Number(variant?.price ?? product?.price) || 0);
}

function currentPrice(product) { return Math.min(...variantPrices(product)); }
function hasDiscount(product) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  if (!variants.length) return Number(product?.old_price) > Number(product?.price);
  return variants.some((variant) => Number(variant?.oldPrice ?? variant?.old_price ?? product?.old_price) > Number(variant?.price ?? product?.price));
}
function totalStock(product) {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  return variants.length ? variants.reduce((sum, variant) => sum + (Number(variant?.qty ?? variant?.stock) || 0), 0) : Number(product?.stock) || 0;
}

export function applyCatalogQuery(products, state, categories = []) {
  let items = (Array.isArray(products) ? products : []).filter((product) => product?.is_visible !== false && product?.status !== 'DELETED');
  const q = String(state?.q || '').toLocaleLowerCase('uz-UZ');
  if (q) items = items.filter((product) => [product.name, product.name_ru, product.sku, product.description, product.description_ru].some((value) => String(value || '').toLocaleLowerCase('uz-UZ').includes(q)));
  if(state?.categoryId){const selected=new Set([state.categoryId]);let changed=true;while(changed){changed=false;for(const row of categories){if(selected.has(row.parent_id)&&!selected.has(row.id)){selected.add(row.id);changed=true;}}}items=items.filter(product=>selected.has(product.category_id));}
  if (state?.minPrice != null) items = items.filter((product) => currentPrice(product) >= state.minPrice);
  if (state?.maxPrice != null) items = items.filter((product) => currentPrice(product) <= state.maxPrice);
  if (state?.inStock) items = items.filter((product) => totalStock(product) > 0);
  if (state?.discount) items = items.filter(hasDiscount);
  if (state?.sort === 'price-asc') items.sort((a, b) => currentPrice(a) - currentPrice(b));
  else if (state?.sort === 'price-desc') items.sort((a, b) => currentPrice(b) - currentPrice(a));
  else if (state?.sort === 'newest') items.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  else if (state?.sort === 'sold') items.sort((a, b) => (Number(b.sold_count) || 0) - (Number(a.sold_count) || 0));
  return items;
}

export function paginateCatalog(items, page = 1, pageSize = 24) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, Number(page) || 1), pages);
  const start = (safePage - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: safePage, pages, total };
}

export function buildCategoryTree(categories = []) {
  const rows = (Array.isArray(categories) ? categories : []).map((category) => ({ ...category, children: [] }));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const roots = [];
  for (const row of rows) {
    const parent = row.parent_id ? byId.get(row.parent_id) : null;
    if (parent) parent.children.push(row); else roots.push(row);
  }
  return roots;
}

export function createCatalogView({ products = [], categories = [], query = {}, loading = false, onOpenProduct, onAddProduct, onFavorite, favoriteIds = new Set(), canManage = false, onPin, onEdit, onVisibility, onDuplicate, onTrash, onQueryChange, locale = 'uz' } = {}, documentRef = globalThis.document) {
  if (!documentRef?.createElement) throw new Error('Catalog UI uchun DOM kerak');
  const doc = documentRef;
  const tr = (uz, ru) => locale === 'ru' ? ru : uz;
  const root = doc.createElement('section'); root.className = 'uw-catalog'; root.dataset.feature = 'catalog';
  if (loading) { root.append(createStatePanel({ kind: 'loading', title: tr('Katalog yuklanmoqda', 'Загрузка каталога'), message: tr('Mahsulotlar yuklanmoqda…', 'Загрузка товаров…') }, doc)); return { element: root }; }

  let sheetOpen = false;
  const notify = (patch) => onQueryChange?.({ ...query, ...patch, page: patch.page ?? 1 });
  const toolbar = doc.createElement('div'); toolbar.className = 'uw-catalog-toolbar';
  const search = doc.createElement('form'); search.className = 'uw-catalog-search'; search.setAttribute('role', 'search');
  const searchLabel = doc.createElement('label'); searchLabel.className = 'uw-sr-only'; searchLabel.htmlFor = 'uw-catalog-q'; searchLabel.textContent = tr('Mahsulotlarni qidirish', 'Поиск товаров');
  const searchInput = doc.createElement('input'); searchInput.id = 'uw-catalog-q'; searchInput.type = 'search'; searchInput.name = 'q'; searchInput.value = query.q || ''; searchInput.placeholder = tr('Mahsulot yoki SKU', 'Товар или SKU');
  const searchButton = doc.createElement('button'); searchButton.type = 'submit'; searchButton.textContent = tr('Qidirish', 'Найти');
  search.append(searchLabel, searchInput, searchButton);
  search.addEventListener('submit', (event) => { event?.preventDefault?.(); notify({ q: String(searchInput.value || '').trim() }); });

  const sort = doc.createElement('select'); sort.className = 'uw-catalog-sort'; sort.setAttribute('aria-label', tr('Saralash', 'Сортировка'));
  for (const [value, uz, ru] of [['relevance','Mosligi bo‘yicha','По соответствию'],['price-asc','Narx: arzon','Сначала дешевле'],['price-desc','Narx: qimmat','Сначала дороже'],['newest','Yangi','Новинки'],['sold','Ko‘p sotilgan','Популярные']]) {
    const option = doc.createElement('option'); option.value = value; option.textContent = tr(uz, ru); option.selected = (query.sort || 'relevance') === value; sort.append(option);
  }
  sort.addEventListener('change', () => notify({ sort: sort.value }));
  const filterButton = doc.createElement('button'); filterButton.type = 'button'; filterButton.className = 'uw-catalog-filter-button'; filterButton.textContent = tr('Filtrlar', 'Фильтры');
  toolbar.append(search, sort, filterButton); root.append(toolbar);

  const chips = doc.createElement('div'); chips.className = 'uw-catalog-chips'; chips.setAttribute('aria-label', tr('Kategoriyalar', 'Категории'));
  for (const category of [{ id: null, name: tr('Barchasi', 'Все') }, ...categories.filter((row) => !row.parent_id)]) {
    const chip = doc.createElement('button'); chip.type = 'button'; chip.textContent = locale === 'ru' ? category.name_ru || category.name : category.name; chip.dataset.active = (query.categoryId || null) === category.id ? 'true' : 'false';
    chip.addEventListener('click', () => notify({ categoryId: category.id })); chips.append(chip);
  }
  root.append(chips);

  const filtered = applyCatalogQuery(products, query, categories);
  const page = paginateCatalog(filtered, query.page, 24);
  const layout = doc.createElement('div'); layout.className = 'uw-catalog-layout';

  function buildFilters(className, mode) {
    const panel = doc.createElement(mode === 'sheet' ? 'div' : 'aside'); panel.className = className; panel.dataset.filterMode = mode;
    if (mode === 'desktop') panel.setAttribute('aria-label', tr('Katalog filtrlari', 'Фильтры каталога'));
    const tree = buildCategoryTree(categories);
    const all = doc.createElement('button'); all.type = 'button'; all.textContent = tr('Barcha kataloglar', 'Все категории'); all.dataset.categoryId = ''; all.addEventListener('click', () => notify({ categoryId: null })); panel.append(all);
    const flattened=[];const visited=new Set();function visit(rows,depth=0){for(const row of rows){if(visited.has(row.id))continue;visited.add(row.id);flattened.push({...row,depth});visit(row.children,depth+1);}}visit(tree);
    for (const category of flattened) { const item = doc.createElement('button'); item.type = 'button'; item.className = 'uw-catalog-category'; item.textContent = locale === 'ru' ? category.name_ru || category.name : category.name; item.style.marginInlineStart = `${category.depth * 12}px`; item.dataset.categoryId = category.id; item.dataset.active = query.categoryId === category.id ? 'true' : 'false'; item.addEventListener('click', () => notify({ categoryId: category.id })); panel.append(item); }
    for (const [label, key] of [[tr('Faqat qoldiqda bor', 'Только в наличии'),'inStock'],[tr('Faqat chegirmali', 'Только со скидкой'),'discount']]) {
      const row = doc.createElement('label'); row.className = 'uw-catalog-check'; const input = doc.createElement('input'); input.type = 'checkbox'; input.checked = Boolean(query[key]); input.addEventListener('change', () => notify({ [key]: input.checked })); const span = doc.createElement('span'); span.textContent = label; row.append(input, span); panel.append(row);
    }
    const prices = doc.createElement('form'); prices.className = 'uw-catalog-price-filter';
    const min = doc.createElement('input'); min.type = 'number'; min.min = '0'; min.inputMode = 'numeric'; min.placeholder = tr('Narx: dan', 'Цена: от'); min.value = query.minPrice ?? ''; min.setAttribute('aria-label', tr('Eng arzon narx', 'Цена от'));
    const max = doc.createElement('input'); max.type = 'number'; max.min = '0'; max.inputMode = 'numeric'; max.placeholder = tr('Narx: gacha', 'Цена: до'); max.value = query.maxPrice ?? ''; max.setAttribute('aria-label', tr('Eng qimmat narx', 'Цена до'));
    const apply = doc.createElement('button'); apply.type = 'submit'; apply.textContent = tr('Qo‘llash', 'Применить');
    prices.append(min, max, apply);
    prices.addEventListener('submit', (event) => { event?.preventDefault?.(); notify({ minPrice: cleanNumber(min.value), maxPrice: cleanNumber(max.value) }); });
    panel.append(prices);
    return panel;
  }

  const aside = buildFilters('uw-catalog-sidebar', 'desktop');
  const sheet = buildFilters('uw-catalog-filter-sheet', 'sheet');
  sheet.dataset.state = 'closed'; sheet.setAttribute('aria-hidden', 'true');
  const sheetClose = doc.createElement('button'); sheetClose.type = 'button'; sheetClose.className = 'uw-catalog-filter-close'; sheetClose.textContent = tr('Yopish', 'Закрыть'); sheet.append(sheetClose);
  const setFilterSheetOpen = (open) => { sheetOpen = Boolean(open); sheet.dataset.state = sheetOpen ? 'open' : 'closed'; sheet.setAttribute('aria-hidden', sheetOpen ? 'false' : 'true'); filterButton.setAttribute('aria-expanded', sheetOpen ? 'true' : 'false'); };
  filterButton.setAttribute('aria-expanded', 'false'); filterButton.addEventListener('click', () => setFilterSheetOpen(!sheetOpen)); sheetClose.addEventListener('click', () => setFilterSheetOpen(false));

  const main = doc.createElement('div'); main.className = 'uw-catalog-results';
  if (!page.items.length) main.append(createStatePanel({ kind: 'empty', title: tr('Mahsulot topilmadi', 'Товары не найдены'), message: tr('Qidiruv yoki filtrlarni o‘zgartirib ko‘ring.', 'Измените запрос или фильтры.') }, doc));
  else {
    const grid = doc.createElement('div'); grid.className = 'uw-product-grid';
    page.items.forEach((product, index) => grid.append(createProductCard(product, {
      index, onOpen: onOpenProduct, onAdd: onAddProduct, onFavorite, isFavorite: favoriteIds.has(String(product.id)),
      canManage, onPin, onEdit, onVisibility, onDuplicate, onTrash, locale,
    }, doc)));
    main.append(grid);
    if (page.pages > 1) {
      const pager = doc.createElement('nav'); pager.className = 'uw-catalog-pager'; pager.setAttribute('aria-label', 'Katalog sahifalari');
      const prev = doc.createElement('button'); prev.type = 'button'; prev.textContent = tr('Oldingi', 'Назад'); prev.disabled = page.page <= 1; prev.addEventListener('click', () => notify({ page: page.page - 1 }));
      const status = doc.createElement('span'); status.textContent = `${page.page} / ${page.pages}`;
      const next = doc.createElement('button'); next.type = 'button'; next.textContent = tr('Keyingi', 'Далее'); next.disabled = page.page >= page.pages; next.addEventListener('click', () => notify({ page: page.page + 1 }));
      pager.append(prev, status, next); main.append(pager);
    }
  }
  layout.append(aside, main); root.append(layout, sheet);
  return { element: root, page, queryString: serializeCatalogQuery({ ...query, page: page.page }), setFilterSheetOpen };
}
