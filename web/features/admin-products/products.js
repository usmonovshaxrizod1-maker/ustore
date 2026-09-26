import { createButton, createStatePanel } from '../../components/ui.js';
import { fail, ok } from '../../services/ports/result.js';

const VISIBILITY = new Set(['ALL', 'VISIBLE', 'HIDDEN']);
const STOCK = new Set(['ALL', 'IN_STOCK', 'OUT_OF_STOCK']);
const SORT = new Set(['CATALOG', 'NAME_ASC', 'PRICE_ASC', 'PRICE_DESC', 'STOCK_ASC', 'STOCK_DESC', 'SOLD_DESC', 'NEWEST']);
function clone(value) { return value == null ? value : structuredClone(value); }
function text(value) { return String(value ?? '').trim(); }
function idText(value) { return value == null ? null : String(value); }
function clampPage(value) { const n = Number.parseInt(String(value || 1), 10); return Number.isInteger(n) && n > 0 ? n : 1; }
function clampPageSize(value) { const n = Number.parseInt(String(value || 25), 10); return Math.min(100, Math.max(10, Number.isInteger(n) ? n : 25)); }
function enumValue(value, set, fallback) { const v = String(value || fallback).toUpperCase(); return set.has(v) ? v : fallback; }
function hasPermission(actor, permission) { const list = Array.isArray(actor?.permissions) ? actor.permissions : []; return list.includes('*') || list.includes(permission); }
function availableStock(raw) {
  const variants = Array.isArray(raw?.variants) ? raw.variants : [];
  if (variants.length) return variants.reduce((sum, row) => sum + Math.max(0, Number(row?.qty) || 0), 0);
  return Math.max(0, Number(raw?.stock) || 0);
}

export function normalizeAdminProduct(raw = {}) {
  return {
    ...raw,
    id: idText(raw.id), sku: text(raw.sku) || null, name: text(raw.name) || 'Nomsiz mahsulot', nameRu: text(raw.nameRu ?? raw.name_ru) || null,
    price: Math.max(0, Number(raw.price) || 0), oldPrice: raw.oldPrice ?? raw.old_price ?? null,
    stock: availableStock(raw), categoryId: idText(raw.categoryId ?? raw.category_id), status: String(raw.status || 'ACTIVE').toUpperCase(),
    imageUrl: raw.thumbImg ?? raw.thumb_img ?? raw.img ?? null, isFeatured: raw.isFeatured ?? raw.is_featured ?? false,
    isVisible: (raw.isVisible ?? raw.is_visible) !== false, sortOrder: Number(raw.sortOrder ?? raw.sort_order ?? 0) || 0,
    soldCount: Number(raw.soldCount ?? raw.sold_count ?? 0) || 0, createdAt: raw.createdAt ?? raw.created_at ?? null,
    importBatchId: raw.importBatchId ?? raw.import_batch_id ?? null, badge: raw.badge ?? null,
  };
}

export function normalizeAdminCategory(raw = {}) {
  return { ...raw, id: idText(raw.id), name: text(raw.name) || 'Nomsiz katalog', nameRu: text(raw.nameRu ?? raw.name_ru) || null, parentId: idText(raw.parentId ?? raw.parent_id), sortOrder: Number(raw.sortOrder ?? raw.sort_order ?? 0) || 0 };
}

export function adminProductActionAvailability(actor) {
  const canManageProducts = hasPermission(actor, 'products.manage');
  return Object.freeze({
    canOpen: canManageProducts,
    canEdit: canManageProducts,
    canToggleVisibility: canManageProducts,
    canDuplicate: canManageProducts,
    canBulkMove: canManageProducts,
    canBulkTrash: canManageProducts,
    canImportExport: hasPermission(actor, 'products.import_export'),
  });
}

export function createAdminProductsController({ adminPort, actor } = {}) {
  if (!adminPort?.invoke) throw new TypeError('adminPort kerak');
  const capabilities = adminProductActionAvailability(actor);
  let selected = new Set();
  let generation = 0;
  let state = {
    status: 'idle', products: [], categories: [], error: null, busyAction: null, capabilities,
    filters: { search: '', categoryId: 'ALL', visibility: 'ALL', stock: 'ALL', sort: 'CATALOG', page: 1, pageSize: 25 },
    pagination: { page: 1, pageSize: 25, totalCount: 0, totalPages: 1 }, selectedIds: [],
  };
  const listeners = new Set();
  const snapshot = () => clone(state);
  const emit = () => listeners.forEach((fn) => fn(snapshot()));
  const set = (patch) => { state = { ...state, ...patch, selectedIds: [...selected] }; emit(); return snapshot(); };
  const stale = () => fail('CONFLICT', 'So‘rov holati o‘zgargan.');
  const deny = () => fail('FORBIDDEN', 'Mahsulotlarni boshqarish uchun ruxsat yo‘q.');

  function currentFilters(overrides = {}) {
    const merged = { ...state.filters, ...overrides };
    return {
      search: text(merged.search).slice(0, 80), categoryId: text(merged.categoryId) || 'ALL',
      visibility: enumValue(merged.visibility, VISIBILITY, 'ALL'), stock: enumValue(merged.stock, STOCK, 'ALL'),
      sort: enumValue(merged.sort, SORT, 'CATALOG'), page: clampPage(merged.page), pageSize: clampPageSize(merged.pageSize),
    };
  }

  async function load(overrides = {}) {
    if (!capabilities.canOpen) { set({ status: 'permission', error: deny().error }); return deny(); }
    const run = ++generation;
    const filters = currentFilters(overrides);
    set({ status: 'loading', error: null, filters });
    const result = await adminPort.invoke('get_admin_products', filters);
    if (run !== generation) return stale();
    if (!result.ok) { set({ status: result.error.code === 'FORBIDDEN' ? 'permission' : 'error', error: result.error }); return result; }
    const products = (result.data?.products || []).map(normalizeAdminProduct);
    const categories = (result.data?.categories || []).map(normalizeAdminCategory);
    const visibleIds = new Set(products.map((row) => row.id));
    for (const id of [...selected]) if (!visibleIds.has(id)) selected.delete(id);
    const pagination = {
      page: clampPage(result.data?.page || filters.page), pageSize: clampPageSize(result.data?.pageSize || filters.pageSize),
      totalCount: Math.max(0, Number(result.data?.totalCount || 0)), totalPages: Math.max(1, Number(result.data?.totalPages || 1)),
    };
    set({ status: 'ready', products, categories, pagination, filters: { ...filters, page: pagination.page }, error: null });
    return ok({ items: products, categories, ...pagination });
  }

  function setSearch(value) { set({ filters: { ...state.filters, search: String(value ?? ''), page: 1 } }); return snapshot(); }
  function setCategory(value) { set({ filters: { ...state.filters, categoryId: text(value) || 'ALL', page: 1 } }); return snapshot(); }
  function setVisibility(value) { set({ filters: { ...state.filters, visibility: enumValue(value, VISIBILITY, 'ALL'), page: 1 } }); return snapshot(); }
  function setStock(value) { set({ filters: { ...state.filters, stock: enumValue(value, STOCK, 'ALL'), page: 1 } }); return snapshot(); }
  function setSort(value) { set({ filters: { ...state.filters, sort: enumValue(value, SORT, 'CATALOG'), page: 1 } }); return snapshot(); }
  function setPageSize(value) { set({ filters: { ...state.filters, pageSize: clampPageSize(value), page: 1 } }); return snapshot(); }
  async function applyFilters() { selected.clear(); return load({ page: 1 }); }
  async function nextPage() { selected.clear(); return load({ page: Math.min(state.pagination.totalPages, state.pagination.page + 1) }); }
  async function previousPage() { selected.clear(); return load({ page: Math.max(1, state.pagination.page - 1) }); }

  function toggleSelection(productId) {
    const id = idText(productId); if (!id || !state.products.some((row) => row.id === id)) return snapshot();
    if (selected.has(id)) selected.delete(id); else selected.add(id); set({}); return snapshot();
  }
  function selectPage() { selected = new Set(state.products.map((row) => row.id)); set({}); return snapshot(); }
  function clearSelection() { selected.clear(); set({}); return snapshot(); }

  async function toggleVisibility(productId, value) {
    if (!capabilities.canToggleVisibility) return deny();
    const id = idText(productId); if (!id) return fail('VALIDATION_ERROR', 'Mahsulot ID kerak.');
    set({ busyAction: `visibility:${id}`, error: null });
    const result = await adminPort.invoke('toggle_product_visibility', { productId: id, value: value !== false });
    if (!result.ok) { set({ busyAction: null, error: result.error }); return result; }
    const isVisible = result.data?.isVisible !== false;
    set({ busyAction: null, products: state.products.map((row) => row.id === id ? { ...row, isVisible } : row), error: null });
    return ok({ productId: id, isVisible });
  }

  async function duplicateProduct(productId) {
    if (!capabilities.canDuplicate) return deny();
    const id = idText(productId); if (!id) return fail('VALIDATION_ERROR', 'Mahsulot ID kerak.');
    set({ busyAction: `duplicate:${id}`, error: null });
    const result = await adminPort.invoke('duplicate_product', { productId: id });
    if (!result.ok) { set({ busyAction: null, error: result.error }); return result; }
    const product = normalizeAdminProduct(result.data?.product || {});
    set({ busyAction: null, error: null });
    await load({ page: state.pagination.page });
    return ok(product);
  }

  async function bulkMove(categoryId) {
    if (!capabilities.canBulkMove) return deny();
    const ids = [...selected]; if (!ids.length) return fail('VALIDATION_ERROR', 'Kamida bitta mahsulot tanlang.');
    const normalized = categoryId == null || categoryId === 'UNCATEGORIZED' || categoryId === '' ? null : String(categoryId);
    if (normalized && !state.categories.some((row) => row.id === normalized)) return fail('VALIDATION_ERROR', 'Katalog topilmadi.');
    set({ busyAction: 'bulk-move', error: null });
    const result = await adminPort.invoke('bulk_move_products', { productIds: ids, categoryId: normalized });
    if (!result.ok) { set({ busyAction: null, error: result.error }); return result; }
    selected.clear(); set({ busyAction: null, error: null }); await load({ page: state.pagination.page }); return result;
  }

  async function bulkTrash({ confirmed = false } = {}) {
    if (!capabilities.canBulkTrash) return deny();
    const ids = [...selected]; if (!ids.length) return fail('VALIDATION_ERROR', 'Kamida bitta mahsulot tanlang.');
    if (!confirmed) return fail('VALIDATION_ERROR', 'Chiqindiga o‘tkazish alohida tasdiqlanishi kerak.');
    set({ busyAction: 'bulk-trash', error: null });
    const result = await adminPort.invoke('bulk_trash_products', { productIds: ids });
    if (!result.ok) { set({ busyAction: null, error: result.error }); return result; }
    selected.clear(); set({ busyAction: null, error: null }); await load({ page: Math.min(state.pagination.page, state.pagination.totalPages) }); return result;
  }

  function resetPrivateState() {
    generation++; selected.clear();
    state = { status: 'idle', products: [], categories: [], error: null, busyAction: null, capabilities, filters: { search: '', categoryId: 'ALL', visibility: 'ALL', stock: 'ALL', sort: 'CATALOG', page: 1, pageSize: 25 }, pagination: { page: 1, pageSize: 25, totalCount: 0, totalPages: 1 }, selectedIds: [] };
    emit();
  }

  return Object.freeze({
    getState: snapshot, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, load,
    setSearch, setCategory, setVisibility, setStock, setSort, setPageSize, applyFilters, nextPage, previousPage,
    toggleSelection, selectPage, clearSelection, toggleVisibility, duplicateProduct, bulkMove, bulkTrash, resetPrivateState,
  });
}

function getDocument(documentRef) { const doc = documentRef ?? globalThis.document; if (!doc?.createElement) throw new Error('Admin products UI uchun DOM kerak'); return doc; }
function elText(doc, tag, className, value) { const el = doc.createElement(tag); el.className = className; el.textContent = String(value ?? ''); return el; }
function money(value, currency = 'UZS') { try { return new Intl.NumberFormat('uz-UZ', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value) || 0); } catch (_) { return `${Number(value) || 0} ${currency}`; } }
function categoryName(categories, id) { return categories.find((row) => row.id === id)?.name || (id ? 'Noma’lum katalog' : 'Katalogsiz'); }
function selected(state, id) { return (state.selectedIds || []).includes(id); }
function addOption(doc, select, value, label, current) { const option = doc.createElement('option'); option.value = value; option.textContent = label; option.selected = value === current; select.append(option); }

export function createAdminProductsView({ controller, state = controller?.getState?.() || {}, currency = 'UZS', onEditProduct, confirmAction } = {}, documentRef) {
  if (!controller) throw new TypeError('controller kerak');
  const doc = getDocument(documentRef);
  const root = doc.createElement('section'); root.className = 'uw-admin-products';
  const header = doc.createElement('header'); header.className = 'uw-admin-products__header';
  const intro = doc.createElement('div'); intro.append(elText(doc, 'h2', '', 'Mahsulotlar'), elText(doc, 'p', '', 'Mahsulotlarni izlang, filtrlang, saralang va ommaviy boshqaring.'));
  const count = elText(doc, 'span', 'uw-admin-products__count', `${state.pagination?.totalCount || 0} ta mahsulot`); header.append(intro, count); root.append(header);

  if (!state.capabilities?.canOpen || state.status === 'permission') {
    root.append(createStatePanel({ kind: 'permission', title: 'Ruxsat yo‘q', message: 'Mahsulotlar bo‘limi uchun products.manage huquqi talab qilinadi.' }, doc)); return root;
  }

  const toolbar = doc.createElement('form'); toolbar.className = 'uw-admin-products-toolbar';
  const search = doc.createElement('input'); search.type = 'search'; search.className = 'uw-field__control'; search.value = state.filters?.search || ''; search.placeholder = 'Nomi, SKU yoki ID bo‘yicha qidirish'; search.setAttribute('aria-label', 'Mahsulotlarni qidirish');
  const category = doc.createElement('select'); category.className = 'uw-field__control'; category.setAttribute('aria-label', 'Katalog bo‘yicha filtr');
  addOption(doc, category, 'ALL', 'Barcha kataloglar', state.filters?.categoryId || 'ALL'); addOption(doc, category, 'UNCATEGORIZED', 'Katalogsiz', state.filters?.categoryId || 'ALL');
  for (const row of state.categories || []) addOption(doc, category, row.id, row.name, state.filters?.categoryId || 'ALL');
  const visibility = doc.createElement('select'); visibility.className = 'uw-field__control'; visibility.setAttribute('aria-label', 'Ko‘rinish filtri');
  for (const [v,l] of [['ALL','Barcha ko‘rinish'],['VISIBLE','Ko‘rinadi'],['HIDDEN','Yashirilgan']]) addOption(doc, visibility, v, l, state.filters?.visibility || 'ALL');
  const stock = doc.createElement('select'); stock.className = 'uw-field__control'; stock.setAttribute('aria-label', 'Qoldiq filtri');
  for (const [v,l] of [['ALL','Barcha qoldiq'],['IN_STOCK','Sotuvda'],['OUT_OF_STOCK','Qoldiq yo‘q']]) addOption(doc, stock, v, l, state.filters?.stock || 'ALL');
  const sort = doc.createElement('select'); sort.className = 'uw-field__control'; sort.setAttribute('aria-label', 'Saralash');
  for (const [v,l] of [['CATALOG','Katalog tartibi'],['NAME_ASC','Nom A–Z'],['PRICE_ASC','Narx: arzon → qimmat'],['PRICE_DESC','Narx: qimmat → arzon'],['STOCK_ASC','Qoldiq: kam → ko‘p'],['STOCK_DESC','Qoldiq: ko‘p → kam'],['SOLD_DESC','Ko‘p sotilgan'],['NEWEST','Yangi qo‘shilgan']]) addOption(doc, sort, v, l, state.filters?.sort || 'CATALOG');
  const apply = createButton({ label: 'Qo‘llash', type: 'submit', busy: state.status === 'loading' }, doc);
  toolbar.append(search, category, visibility, stock, sort, apply);
  toolbar.addEventListener('submit', (event) => { event.preventDefault(); controller.setSearch(search.value); controller.setCategory(category.value); controller.setVisibility(visibility.value); controller.setStock(stock.value); controller.setSort(sort.value); controller.applyFilters(); });
  root.append(toolbar);

  if (state.error && state.products?.length) root.append(createStatePanel({ kind: 'error', title: 'Amal bajarilmadi', message: state.error.message || 'Qayta urinib ko‘ring.' }, doc));
  if (state.status === 'loading' && !state.products?.length) { root.append(createStatePanel({ kind: 'loading', title: 'Mahsulotlar yuklanmoqda', message: 'Bir oz kuting.' }, doc)); return root; }
  if (state.status === 'error' && !state.products?.length) { root.append(createStatePanel({ kind: 'error', title: 'Mahsulotlarni ochib bo‘lmadi', message: state.error?.message || 'Qayta urinib ko‘ring.', actionLabel: 'Qayta urinish', onAction: () => controller.load() }, doc)); return root; }
  if (!state.products?.length) { root.append(createStatePanel({ kind: 'empty', title: 'Mahsulot topilmadi', message: 'Qidiruv yoki filtrlarni o‘zgartirib ko‘ring.' }, doc)); return root; }

  const bulk = doc.createElement('div'); bulk.className = 'uw-admin-products-bulk';
  const selection = elText(doc, 'strong', '', `${state.selectedIds?.length || 0} ta tanlangan`); bulk.append(selection);
  bulk.append(createButton({ label: 'Sahifadagini tanlash', variant: 'ghost', size: 'sm', onClick: () => controller.selectPage() }, doc));
  bulk.append(createButton({ label: 'Tanlovni tozalash', variant: 'ghost', size: 'sm', disabled: !state.selectedIds?.length, onClick: () => controller.clearSelection() }, doc));
  if (state.capabilities?.canBulkMove) {
    const move = doc.createElement('select'); move.className = 'uw-field__control uw-admin-products-bulk__select'; move.setAttribute('aria-label', 'Tanlanganlarni ko‘chirish katalogi');
    addOption(doc, move, '', 'Ko‘chirish uchun katalog…', ''); addOption(doc, move, 'UNCATEGORIZED', 'Katalogsiz', ''); for (const row of state.categories || []) addOption(doc, move, row.id, row.name, '');
    bulk.append(move, createButton({ label: 'Ko‘chirish', variant: 'secondary', size: 'sm', disabled: !state.selectedIds?.length || state.busyAction === 'bulk-move', busy: state.busyAction === 'bulk-move', onClick: () => { if (move.value) controller.bulkMove(move.value); } }, doc));
  }
  if (state.capabilities?.canBulkTrash) {
    bulk.append(createButton({ label: 'Chiqindiga', variant: 'danger', size: 'sm', disabled: !state.selectedIds?.length || state.busyAction === 'bulk-trash', busy: state.busyAction === 'bulk-trash', onClick: async () => {
      const ask = typeof confirmAction === 'function' ? confirmAction : (message) => globalThis.confirm?.(message) === true;
      if (await ask(`${state.selectedIds?.length || 0} ta mahsulot chiqindiga o‘tkazilsinmi?`)) controller.bulkTrash({ confirmed: true });
    } }, doc));
  }
  root.append(bulk);

  const tableWrap = doc.createElement('div'); tableWrap.className = 'uw-admin-products-table-wrap';
  const table = doc.createElement('table'); table.className = 'uw-admin-products-table';
  const thead = doc.createElement('thead'); const hr = doc.createElement('tr');
  for (const label of ['', 'Mahsulot', 'Katalog', 'Narx', 'Qoldiq', 'Ko‘rinish', 'Amallar']) hr.append(elText(doc, 'th', '', label)); thead.append(hr); table.append(thead);
  const tbody = doc.createElement('tbody');
  for (const product of state.products || []) {
    const tr = doc.createElement('tr'); tr.dataset.selected = selected(state, product.id) ? 'true' : 'false';
    const selectCell = doc.createElement('td'); const box = doc.createElement('input'); box.type = 'checkbox'; box.checked = selected(state, product.id); box.setAttribute('aria-label', `${product.name}ni tanlash`); box.addEventListener('change', () => controller.toggleSelection(product.id)); selectCell.append(box);
    const productCell = doc.createElement('td'); productCell.className = 'uw-admin-products-product';
    const media = doc.createElement('div'); media.className = 'uw-admin-products-product__media'; if (product.imageUrl) { const img = doc.createElement('img'); img.src = product.imageUrl; img.alt = ''; img.width = 96; img.height = 96; img.loading = 'lazy'; img.decoding = 'async'; img.fetchPriority = 'low'; img.referrerPolicy = 'no-referrer'; media.append(img); } else media.textContent = '📦';
    const info = doc.createElement('div'); info.append(elText(doc, 'strong', '', product.name), elText(doc, 'small', '', product.sku || `#${product.id}`)); productCell.append(media, info);
    const categoryCell = elText(doc, 'td', '', categoryName(state.categories || [], product.categoryId));
    const priceCell = doc.createElement('td'); priceCell.append(elText(doc, 'strong', '', money(product.price, currency))); if (Number(product.oldPrice) > product.price) priceCell.append(elText(doc, 'small', 'uw-admin-products-old-price', money(product.oldPrice, currency)));
    const stockCell = elText(doc, 'td', '', `${product.stock} dona`); stockCell.dataset.stock = product.stock > 0 ? 'available' : 'empty';
    const visibleCell = doc.createElement('td'); const chip = elText(doc, 'span', 'uw-admin-products-visibility', product.isVisible ? 'Ko‘rinadi' : 'Yashirilgan'); chip.dataset.visible = product.isVisible ? 'true' : 'false'; visibleCell.append(chip);
    const actionCell = doc.createElement('td'); actionCell.className = 'uw-admin-products-actions';
    if (typeof onEditProduct === 'function' && state.capabilities?.canEdit) actionCell.append(createButton({ label: 'Tahrirlash', variant: 'ghost', size: 'sm', onClick: () => onEditProduct(product) }, doc));
    if (state.capabilities?.canToggleVisibility) actionCell.append(createButton({ label: product.isVisible ? 'Yashirish' : 'Ko‘rsatish', variant: 'ghost', size: 'sm', busy: state.busyAction === `visibility:${product.id}`, onClick: () => controller.toggleVisibility(product.id, !product.isVisible) }, doc));
    if (state.capabilities?.canDuplicate) actionCell.append(createButton({ label: 'Nusxalash', variant: 'ghost', size: 'sm', busy: state.busyAction === `duplicate:${product.id}`, onClick: () => controller.duplicateProduct(product.id) }, doc));
    tr.append(selectCell, productCell, categoryCell, priceCell, stockCell, visibleCell, actionCell); tbody.append(tr);
  }
  table.append(tbody); tableWrap.append(table); root.append(tableWrap);

  const cards = doc.createElement('div'); cards.className = 'uw-admin-products-cards';
  for (const product of state.products || []) {
    const card = doc.createElement('article'); card.className = 'uw-admin-product-card'; card.dataset.selected = selected(state, product.id) ? 'true' : 'false';
    const top = doc.createElement('div'); top.className = 'uw-admin-product-card__top'; const box = doc.createElement('input'); box.type = 'checkbox'; box.checked = selected(state, product.id); box.setAttribute('aria-label', `${product.name}ni tanlash`); box.addEventListener('change', () => controller.toggleSelection(product.id));
    const title = doc.createElement('div'); title.append(elText(doc, 'strong', '', product.name), elText(doc, 'small', '', product.sku || `#${product.id}`)); top.append(box, title, elText(doc, 'span', 'uw-admin-products-visibility', product.isVisible ? 'Ko‘rinadi' : 'Yashirilgan'));
    const meta = doc.createElement('div'); meta.className = 'uw-admin-product-card__meta'; meta.append(elText(doc, 'span', '', categoryName(state.categories || [], product.categoryId)), elText(doc, 'span', '', money(product.price, currency)), elText(doc, 'span', '', `${product.stock} dona`));
    const actions = doc.createElement('div'); actions.className = 'uw-admin-products-actions';
    if (typeof onEditProduct === 'function' && state.capabilities?.canEdit) actions.append(createButton({ label: 'Tahrirlash', variant: 'ghost', size: 'sm', onClick: () => onEditProduct(product) }, doc));
    if (state.capabilities?.canToggleVisibility) actions.append(createButton({ label: product.isVisible ? 'Yashirish' : 'Ko‘rsatish', variant: 'ghost', size: 'sm', onClick: () => controller.toggleVisibility(product.id, !product.isVisible) }, doc));
    if (state.capabilities?.canDuplicate) actions.append(createButton({ label: 'Nusxalash', variant: 'ghost', size: 'sm', onClick: () => controller.duplicateProduct(product.id) }, doc));
    card.append(top, meta, actions); cards.append(card);
  }
  root.append(cards);

  const pager = doc.createElement('div'); pager.className = 'uw-admin-products-pager';
  pager.append(createButton({ label: 'Oldingi', variant: 'ghost', size: 'sm', disabled: (state.pagination?.page || 1) <= 1, onClick: () => controller.previousPage() }, doc));
  pager.append(elText(doc, 'span', '', `${state.pagination?.page || 1} / ${state.pagination?.totalPages || 1}`));
  pager.append(createButton({ label: 'Keyingi', variant: 'ghost', size: 'sm', disabled: (state.pagination?.page || 1) >= (state.pagination?.totalPages || 1), onClick: () => controller.nextPage() }, doc));
  root.append(pager); return root;
}
