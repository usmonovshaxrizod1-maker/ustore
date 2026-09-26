import { createButton, createCard, createSelectField, createStatePanel, createTextField } from '../../components/ui.js';
import { fail, ok } from '../../services/ports/result.js';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const BADGES = new Set(['', 'NEW', 'TOP', 'RECOMMENDED', 'PROMO']);

function clone(value) { return value == null ? value : structuredClone(value); }
function text(value) { return String(value ?? '').trim(); }
function idText(value) { return value == null || value === '' ? null : String(value); }
function money(value, fallback = null) {
  if (value === '' || value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
function intQty(value, fallback = 0) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}
function hasPermission(actor, permission) {
  const permissions = Array.isArray(actor?.permissions) ? actor.permissions : [];
  return permissions.includes('*') || permissions.includes(permission);
}
function fieldError(message, extra = {}) { return fail('VALIDATION_ERROR', message, { fieldErrors: extra }); }

export function adminEditorCapabilities(actor) {
  return Object.freeze({
    products: hasPermission(actor, 'products.manage'),
    catalog: hasPermission(actor, 'catalog.manage'),
  });
}

export function validateImageFile(file) {
  if (!file) return fieldError('Rasm fayli tanlanmagan.');
  const mimeType = String(file.type || '').toLowerCase();
  const size = Number(file.size || 0);
  if (!IMAGE_TYPES.has(mimeType)) return fieldError('Faqat JPG, PNG yoki WebP rasm tanlang.');
  if (!Number.isFinite(size) || size <= 0 || size > MAX_IMAGE_BYTES) return fieldError('Rasm 6 MB dan katta bo‘lmasligi kerak.');
  return ok({ mimeType, size });
}

export async function imageUploadFromFile(file, imageIO = globalThis.UstoreImageIO) {
  const valid = validateImageFile(file);
  if (!valid.ok) return valid;
  if (!imageIO?.blobToBase64) return fail('CAPABILITY_UNAVAILABLE', 'Rasm tayyorlash yordamchisi mavjud emas.');
  try {
    const base64 = await imageIO.blobToBase64(file);
    if (!base64) return fail('VALIDATION_ERROR', 'Rasm o‘qilmadi.');
    return ok({ mimeType: valid.data.mimeType, base64 });
  } catch (_) {
    return fail('VALIDATION_ERROR', 'Rasmni o‘qib bo‘lmadi. Boshqa fayl tanlab ko‘ring.');
  }
}

export function normalizeEditableVariant(raw = {}) {
  return {
    size: text(raw.size) || null,
    color: text(raw.color) || null,
    colorRu: text(raw.colorRu ?? raw.color_ru) || null,
    qty: intQty(raw.qty, 0),
    sku: text(raw.sku) || null,
    billzProductId: text(raw.billzProductId ?? raw.billz_product_id) || null,
    img: text(raw.img) || null,
    colorImg: text(raw.colorImg ?? raw.color_img) || null,
    price: money(raw.price, null),
    oldPrice: money(raw.oldPrice ?? raw.old_price, null),
    imageFile: null,
  };
}

function emptyDraft(categoryId = null) {
  return {
    id: null, name: '', description: '', nameRu: '', descriptionRu: '', categoryId: idText(categoryId),
    price: '', oldPrice: '', stock: '0', badge: '', imageUrl: '', imageFile: null,
    variants: [],
  };
}

export function normalizeProductEditor(raw = {}, categories = []) {
  const variants = Array.isArray(raw.variants) ? raw.variants.map(normalizeEditableVariant) : [];
  return {
    id: idText(raw.id),
    name: text(raw.name),
    description: text(raw.description ?? raw.desc),
    nameRu: text(raw.name_ru ?? raw.nameRu),
    descriptionRu: text(raw.description_ru ?? raw.descRu),
    categoryId: idText(raw.category_id ?? raw.categoryId),
    price: raw.price ?? '', oldPrice: raw.old_price ?? raw.oldPrice ?? '', stock: raw.stock ?? 0,
    badge: BADGES.has(String(raw.badge || '').toUpperCase()) ? String(raw.badge || '').toUpperCase() : '',
    imageUrl: text(raw.img), imageFile: null,
    variants,
    categories: clone(categories),
  };
}

export function validateProductDraft(draft, { creating = false } = {}) {
  const fieldErrors = {};
  if (!text(draft?.name)) fieldErrors.name = 'Mahsulot nomini kiriting.';
  const variants = Array.isArray(draft?.variants) ? draft.variants : [];
  const basePrice = Number(draft?.price);
  if (!Number.isFinite(basePrice) || basePrice < 0) fieldErrors.price = 'Narx 0 yoki undan katta son bo‘lishi kerak.';
  const oldPrice = draft?.oldPrice === '' || draft?.oldPrice == null ? null : Number(draft.oldPrice);
  if (oldPrice !== null && (!Number.isFinite(oldPrice) || oldPrice <= basePrice)) fieldErrors.oldPrice = 'Eski narx yangi narxdan katta bo‘lishi kerak.';
  if (!variants.length) {
    const stock = Number.parseInt(String(draft?.stock ?? ''), 10);
    if (!Number.isInteger(stock) || stock < 0) fieldErrors.stock = 'Qoldiq manfiy bo‘lmagan butun son bo‘lishi kerak.';
  }
  const seen = new Set();
  variants.forEach((row, index) => {
    const size = text(row?.size); const color = text(row?.color);
    if (!size && !color) fieldErrors[`variant.${index}.identity`] = 'Rang yoki o‘lchamdan kamida bittasini kiriting.';
    const key = `${size.toLocaleLowerCase('uz-UZ')}\u001f${color.toLocaleLowerCase('uz-UZ')}`;
    if (seen.has(key)) fieldErrors[`variant.${index}.duplicate`] = 'Bir xil rang/o‘lcham kombinatsiyasi takrorlangan.';
    seen.add(key);
    const qty = Number.parseInt(String(row?.qty ?? ''), 10);
    if (!Number.isInteger(qty) || qty < 0) fieldErrors[`variant.${index}.qty`] = 'Variant qoldig‘i manfiy bo‘lmagan butun son bo‘lishi kerak.';
    const price = Number(row?.price);
    if (!Number.isFinite(price) || price <= 0) fieldErrors[`variant.${index}.price`] = 'Variant narxi 0 dan katta bo‘lishi kerak.';
    const old = row?.oldPrice === '' || row?.oldPrice == null ? null : Number(row.oldPrice);
    if (old !== null && (!Number.isFinite(old) || old <= price)) fieldErrors[`variant.${index}.oldPrice`] = 'Variant eski narxi yangi narxdan katta bo‘lishi kerak.';
  });
  if (creating && !BADGES.has(String(draft?.badge || '').toUpperCase())) fieldErrors.badge = 'Badge noto‘g‘ri.';
  return Object.keys(fieldErrors).length ? fieldError('Formadagi xatolarni tuzating.', fieldErrors) : ok(true);
}

function persistedVariant(row) {
  const price = money(row.price, null);
  const oldPrice = money(row.oldPrice, null);
  return {
    size: text(row.size) || null, color: text(row.color) || null, colorRu: text(row.colorRu) || null,
    qty: intQty(row.qty, 0), sku: text(row.sku) || null, billzProductId: text(row.billzProductId) || null,
    img: text(row.img) || null, colorImg: text(row.colorImg) || null,
    price, oldPrice: oldPrice !== null && price !== null && oldPrice > price ? oldPrice : null,
  };
}

export function createAdminProductEditorController({ adminPort, actor, imageIO = globalThis.UstoreImageIO } = {}) {
  if (!adminPort?.invoke) throw new TypeError('adminPort kerak');
  const capabilities = adminEditorCapabilities(actor);
  let state = { status: 'idle', mode: null, draft: emptyDraft(), categories: [], error: null, fieldErrors: {}, busy: null, capabilities };
  const listeners = new Set();
  const snapshot = () => clone(state);
  const emit = () => listeners.forEach((fn) => fn(snapshot()));
  const set = (patch) => { state = { ...state, ...patch }; emit(); return snapshot(); };
  const deny = () => fail('FORBIDDEN', 'Mahsulotlarni boshqarish uchun ruxsat yo‘q.');

  let mutationPending=null, mutationName=null;
  function protect(name, action) {
    return (...args)=>{
      if(mutationPending) return name===mutationName?mutationPending:Promise.resolve(fail('CONFLICT','Saqlash tugashini kuting.'));
      mutationName=name;
      mutationPending=Promise.resolve().then(()=>action(...args)).catch(()=>fail('NETWORK_ERROR','Saqlash natijasini tekshiring.',{retryable:true})).then(result=>{
        set({busy:null,error:result.ok?null:result.error,success:result.ok?'Mahsulot saqlandi.':null});return result;
      }).finally(()=>{mutationPending=null;mutationName=null;});
      set({busy:name,error:null,success:null});return mutationPending;
    };
  }
  function openCreate({ categories = [], categoryId = null } = {}) {
    if (!capabilities.products) { const result=deny(); set({status:'permission',error:result.error}); return result; }
    set({ status: 'ready', mode: 'create', draft: emptyDraft(categoryId), categories: clone(categories), error: null, fieldErrors: {}, busy: null });
    return ok(snapshot());
  }

  async function load(productId) {
    if (!capabilities.products) { const result=deny(); set({status:'permission',error:result.error}); return result; }
    const id = idText(productId); if (!id) return fieldError('Mahsulot ID kerak.');
    set({ status: 'loading', mode: 'edit', error: null, fieldErrors: {} });
    const result = await adminPort.invoke('get_admin_product_editor', { productId: id });
    if (!result.ok) { set({ status: result.error.code === 'FORBIDDEN' ? 'permission' : 'error', error: result.error }); return result; }
    const categories = clone(result.data?.categories || []);
    set({ status: 'ready', mode: 'edit', categories, draft: normalizeProductEditor(result.data?.product || {}, categories), error: null, fieldErrors: {}, busy: null });
    return ok(snapshot());
  }

  function setField(field, value) { if(mutationPending)return snapshot();
    const allowed = new Set(['name','description','categoryId','price','oldPrice','stock','badge','imageUrl']);
    if (!allowed.has(field)) return snapshot();
    set({ draft: { ...state.draft, [field]: value }, fieldErrors: { ...state.fieldErrors, [field]: undefined } });
    return snapshot();
  }
  function chooseImageFile(file) { if(mutationPending)return snapshot(); const v = validateImageFile(file); if (!v.ok) { set({ error: v.error }); return v; } set({ draft: { ...state.draft, imageFile: file }, error: null }); return ok(true); }
  function clearImageFile() { if(mutationPending)return snapshot(); set({ draft: { ...state.draft, imageFile: null } }); return snapshot(); }
  function addVariant(seed = {}) { if(mutationPending)return snapshot(); set({ draft: { ...state.draft, variants: [...state.draft.variants, normalizeEditableVariant(seed)] } }); return snapshot(); }
  function removeVariant(index) { if(mutationPending)return snapshot(); const variants = [...state.draft.variants]; if (index >= 0 && index < variants.length) variants.splice(index, 1); set({ draft: { ...state.draft, variants } }); return snapshot(); }
  function setVariantField(index, field, value) { if(mutationPending)return snapshot();
    const allowed = new Set(['size','color','colorRu','qty','price','oldPrice','img','colorImg']);
    if (!allowed.has(field) || !state.draft.variants[index]) return snapshot();
    const variants = [...state.draft.variants]; variants[index] = { ...variants[index], [field]: value }; set({ draft: { ...state.draft, variants } }); return snapshot();
  }
  function chooseVariantImageFile(index, file) { if(mutationPending)return snapshot();
    const v = validateImageFile(file); if (!v.ok) { set({ error: v.error }); return v; }
    if (!state.draft.variants[index]) return fieldError('Variant topilmadi.');
    const variants = [...state.draft.variants]; variants[index] = { ...variants[index], imageFile: file }; set({ draft: { ...state.draft, variants }, error: null }); return ok(true);
  }

  async function prepareImage(file) {
    if (!file) return ok(null);
    return imageUploadFromFile(file, imageIO);
  }
  async function prepareVariantUploads() {
    const uploads = [];
    for (let index = 0; index < state.draft.variants.length; index++) {
      const file = state.draft.variants[index]?.imageFile;
      if (!file) continue;
      const prepared = await prepareImage(file); if (!prepared.ok) return prepared;
      uploads.push({ index, target: 'colorImg', imageUpload: prepared.data });
    }
    return ok(uploads);
  }

  let productCreatePending = null;
  async function createProductInternal() {
    if (!capabilities.products) return deny();
    const valid = validateProductDraft(state.draft, { creating: true });
    if (!valid.ok) { set({ fieldErrors: valid.error.fieldErrors || {}, error: valid.error }); return valid; }
    set({ busy: 'create', error: null, fieldErrors: {} });
    const image = await prepareImage(state.draft.imageFile); if (!image.ok) { set({ busy: null, error: image.error }); return image; }
    const variantUploads = await prepareVariantUploads(); if (!variantUploads.ok) { set({ busy: null, error: variantUploads.error }); return variantUploads; }
    const variants = state.draft.variants.map(persistedVariant);
    const payload = {
      name: text(state.draft.name), desc: text(state.draft.description), categoryId: idText(state.draft.categoryId),
      price: Number(state.draft.price), oldPrice: state.draft.oldPrice === '' ? null : Number(state.draft.oldPrice),
      stock: variants.length ? 0 : intQty(state.draft.stock, 0), badge: BADGES.has(String(state.draft.badge || '').toUpperCase()) ? String(state.draft.badge || '').toUpperCase() : null,
      img: image.data ? null : (text(state.draft.imageUrl) || null), imageUpload: image.data, variants,
      variantImageUploads: variantUploads.data,
    };
    const result = await adminPort.invoke('add_product', payload);
    if (!result.ok) { set({ busy: null, error: result.error }); return result; }
    set({ busy: null, mode: 'edit', draft: normalizeProductEditor(result.data?.product || {}, state.categories), error: null, status: 'ready' });
    return result;
  }

  function createProduct() {
    if (productCreatePending) return productCreatePending;
    productCreatePending = Promise.resolve().then(createProductInternal).catch(() => {
      const result = fail('NETWORK_ERROR', 'Mahsulot yaratish natijasini tekshiring.');
      set({busy:null,error:result.error}); return result;
    }).finally(() => {productCreatePending=null;});
    return productCreatePending;
  }

  async function saveBasics() {
    if (!capabilities.products) return deny();
    if (!state.draft.id) return fieldError('Avval mahsulotni yarating.');
    if (!text(state.draft.name)) return fieldError('Mahsulot nomini kiriting.', { name: 'Mahsulot nomini kiriting.' });
    set({ busy: 'basics', error: null });
    const result = await adminPort.invoke('edit_product_field', { productId: state.draft.id, field: 'name', value: text(state.draft.name), field2: 'desc', value2: text(state.draft.description) });
    set({ busy: null, error: result.ok ? null : result.error }); return result;
  }
  async function savePrice() {
    if (!capabilities.products) return deny(); if (!state.draft.id) return fieldError('Avval mahsulotni yarating.');
    const valid = validateProductDraft({ ...state.draft, stock: 0, variants: state.draft.variants }, { creating: false });
    if (!valid.ok && (valid.error.fieldErrors?.price || valid.error.fieldErrors?.oldPrice)) return valid;
    set({ busy: 'price', error: null });
    const result = await adminPort.invoke('edit_product_field', { productId: state.draft.id, field: 'price', value: Number(state.draft.price), oldPrice: state.draft.oldPrice === '' ? null : Number(state.draft.oldPrice) });
    set({ busy: null, error: result.ok ? null : result.error }); return result;
  }
  async function saveCategory() {
    if (!capabilities.products) return deny(); if (!state.draft.id) return fieldError('Avval mahsulotni yarating.');
    set({ busy: 'category', error: null }); const result = await adminPort.invoke('edit_product_field', { productId: state.draft.id, field: 'categoryId', value: idText(state.draft.categoryId) }); set({ busy: null, error: result.ok ? null : result.error }); return result;
  }
  async function saveStock() {
    if (!capabilities.products) return deny(); if (!state.draft.id) return fieldError('Avval mahsulotni yarating.');
    if (state.draft.variants.length) return fieldError('Variativ mahsulot qoldig‘i variantlar orqali saqlanadi.');
    const stock = Number.parseInt(String(state.draft.stock), 10); if (!Number.isInteger(stock) || stock < 0) return fieldError('Qoldiq noto‘g‘ri.', { stock: 'Qoldiq noto‘g‘ri.' });
    set({ busy: 'stock', error: null }); const result = await adminPort.invoke('edit_product_field', { productId: state.draft.id, field: 'stock', value: stock }); set({ busy: null, error: result.ok ? null : result.error }); return result;
  }
  async function saveImage() {
    if (!capabilities.products) return deny(); if (!state.draft.id) return fieldError('Avval mahsulotni yarating.');
    const prepared = await prepareImage(state.draft.imageFile); if (!prepared.ok) return prepared;
    if (!prepared.data && !text(state.draft.imageUrl)) return fieldError('Rasm fayli yoki HTTPS URL kiriting.');
    set({ busy: 'image', error: null });
    const result = await adminPort.invoke('edit_product_field', { productId: state.draft.id, field: 'img', value: prepared.data ? null : text(state.draft.imageUrl), imageUpload: prepared.data, thumbImg: null });
    if (result.ok) set({ draft: { ...state.draft, imageFile: null, imageUrl: text(result.data?.product?.img) || state.draft.imageUrl }, busy: null, error: null }); else set({ busy: null, error: result.error });
    return result;
  }
  async function saveVariants() {
    if (!capabilities.products) return deny(); if (!state.draft.id) return fieldError('Avval mahsulotni yarating.');
    const valid = validateProductDraft(state.draft); if (!valid.ok) { set({ fieldErrors: valid.error.fieldErrors || {}, error: valid.error }); return valid; }
    if (!state.draft.variants.length) return fieldError('Kamida bitta variant qo‘shing.');
    const uploads = await prepareVariantUploads(); if (!uploads.ok) return uploads;
    set({ busy: 'variants', error: null, fieldErrors: {} });
    const result = await adminPort.invoke('edit_product_field', { productId: state.draft.id, field: 'variants', value: state.draft.variants.map(persistedVariant), variantImageUploads: uploads.data });
    if (result.ok) set({ draft: normalizeProductEditor(result.data?.product || {}, state.categories), busy: null, error: null }); else set({ busy: null, error: result.error });
    return result;
  }

  return Object.freeze({
    subscribe(fn) { listeners.add(fn); fn(snapshot()); return () => listeners.delete(fn); }, getState: snapshot,
    openCreate, load, setField, chooseImageFile, clearImageFile, addVariant, removeVariant, setVariantField, chooseVariantImageFile,
    createProduct:protect('create',createProduct), saveBasics:protect('basics',saveBasics), savePrice:protect('price',savePrice), saveCategory:protect('category',saveCategory), saveStock:protect('stock',saveStock), saveImage:protect('image',saveImage), saveVariants:protect('variants',saveVariants),
  });
}

export function createAdminCategoryEditorController({ adminPort, actor, imageIO = globalThis.UstoreImageIO } = {}) {
  if (!adminPort?.invoke) throw new TypeError('adminPort kerak');
  const capabilities = adminEditorCapabilities(actor);
  let state = { status: 'idle', mode: 'create', draft: { id: null, name: '', parentId: null, imageUrl: '', imageFile: null }, originalImageUrl: '', categories: [], error: null, busy: false, capabilities };
  const listeners = new Set(); const snapshot = () => clone(state); const emit = () => listeners.forEach((fn) => fn(snapshot())); const set = (patch) => { state = { ...state, ...patch }; emit(); return snapshot(); };
  const deny = () => fail('FORBIDDEN', 'Kataloglarni boshqarish uchun ruxsat yo‘q.');
  function openCreate({ categories = [], parentId = null } = {}) { if (!capabilities.catalog) return deny(); set({ status:'ready', mode:'create', categories:clone(categories), draft:{id:null,name:'',parentId:idText(parentId),imageUrl:'',imageFile:null}, originalImageUrl:'', error:null }); return ok(snapshot()); }
  function openEdit(category, categories = []) { if (!capabilities.catalog) return deny(); set({ status:'ready', mode:'edit', categories:clone(categories), draft:{id:idText(category?.id),name:text(category?.name),parentId:idText(category?.parent_id ?? category?.parentId),imageUrl:text(category?.img),imageFile:null}, originalImageUrl:text(category?.img), error:null }); return ok(snapshot()); }
  let pending=null;
  function setField(field,value){ if(pending)return snapshot(); if(!['name','parentId','imageUrl'].includes(field)) return snapshot(); set({draft:{...state.draft,[field]:value}}); return snapshot(); }
  function chooseImageFile(file){if(pending)return snapshot(); const v=validateImageFile(file); if(!v.ok){set({error:v.error});return v;} set({draft:{...state.draft,imageFile:file},error:null}); return ok(true); }
  async function save(){ if(!capabilities.catalog) return deny(); const name=text(state.draft.name); if(!name) return fieldError('Katalog nomini kiriting.',{name:'Katalog nomini kiriting.'}); let imageUpload=null; if(state.draft.imageFile){const p=await imageUploadFromFile(state.draft.imageFile,imageIO);if(!p.ok)return p;imageUpload=p.data;} set({busy:true,error:null}); let result; if(state.mode==='create'){result=await adminPort.invoke('add_category',{name,parentId:idText(state.draft.parentId),img:imageUpload?null:(text(state.draft.imageUrl)||null),imageUpload});}else{const imageChanged=text(state.draft.imageUrl)!==text(state.originalImageUrl);const editPayload={categoryId:state.draft.id,name,parentId:idText(state.draft.parentId),imageUpload};if(!imageUpload&&imageChanged)editPayload.img=text(state.draft.imageUrl)||null;result=await adminPort.invoke('edit_category',editPayload);} if(!result.ok){set({busy:false,error:result.error});return result;} const category=result.data?.category||{}; set({busy:false,error:null,mode:'edit',originalImageUrl:text(category.img),draft:{id:idText(category.id),name:text(category.name),parentId:idText(category.parent_id),imageUrl:text(category.img),imageFile:null}}); return result; }
  function saveProtected(){
    if(pending)return pending;
    pending=Promise.resolve().then(save).catch(()=>fail('NETWORK_ERROR','Katalogni saqlash natijasini tekshiring.',{retryable:true})).then(result=>{
      set({busy:false,error:result.ok?null:result.error,success:result.ok?'Katalog saqlandi.':null});return result;
    }).finally(()=>{pending=null;});
    set({busy:true,error:null,success:null});return pending;
  }
  return Object.freeze({ subscribe(fn){listeners.add(fn);fn(snapshot());return()=>listeners.delete(fn);}, getState:snapshot, openCreate, openEdit, setField, chooseImageFile, save:saveProtected });
}

function elText(doc, tag, className, value) { const node = doc.createElement(tag); if (className) node.className = className; node.textContent = String(value ?? ''); return node; }
function addDropHandlers(node, onFile) {
  node.addEventListener('dragover', (event) => { event.preventDefault?.(); node.dataset.drag = 'true'; });
  node.addEventListener('dragleave', () => { node.dataset.drag = 'false'; });
  node.addEventListener('drop', (event) => { event.preventDefault?.(); node.dataset.drag = 'false'; const file = event.dataTransfer?.files?.[0]; if (file) onFile(file); });
}
function filePicker(doc, { label, onFile, className = '' }) {
  const wrap = doc.createElement('div'); wrap.className = `uw-image-drop ${className}`.trim(); wrap.tabIndex = 0; wrap.setAttribute('role','button');
  wrap.append(elText(doc,'strong','',label), elText(doc,'span','', 'Rasmni bu yerga tashlang yoki fayl tanlang'));
  const input = doc.createElement('input'); input.type='file'; input.accept='image/jpeg,image/png,image/webp'; input.className='uw-visually-hidden'; input.setAttribute('aria-label', label);
  input.addEventListener('change', () => { const file=input.files?.[0]; if(file) onFile(file); }); wrap.addEventListener('click',()=>input.click?.()); wrap.addEventListener('keydown',(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault?.();input.click?.();}}); addDropHandlers(wrap,onFile); wrap.append(input); return {wrap,input};
}

export function createAdminProductEditorView({ controller, documentRef = globalThis.document } = {}) {
  const doc = documentRef; if (!doc?.createElement) throw new Error('DOM document kerak');
  const state = controller.getState(); const root = doc.createElement('section'); root.className='uw-admin-product-editor'; root.dataset.feature='admin-product-editor';
  if (state.status === 'loading') { root.append(createStatePanel({kind:'loading',title:'Mahsulot yuklanmoqda…'},doc)); return {element:root}; }
  if (state.status === 'permission') { root.append(createStatePanel({kind:'permission',title:'Ruxsat yo‘q',message:'Mahsulotlarni boshqarish huquqi kerak.'},doc)); return {element:root}; }
  const d=state.draft;
  const header=doc.createElement('header'); header.className='uw-editor-header'; header.append(elText(doc,'div','',state.mode==='create'?'Yangi mahsulot':'Mahsulotni tahrirlash'),elText(doc,'small','',state.mode==='create'?'Mahsulot ma’lumotlari va variantlarini kiriting.':d.id||'')); root.append(header);

  const basics=doc.createElement('div'); basics.className='uw-editor-grid';
  const name=createTextField({label:'Nomi',value:d.name,required:true,error:state.fieldErrors?.name||''},doc); name.input.addEventListener('input',()=>controller.setField('name',name.input.value)); basics.append(name.element);
  const category=createSelectField({label:'Katalog',value:d.categoryId||'',options:[{value:'',label:'Katalogsiz'},...(state.categories||[]).map(c=>({value:c.id,label:c.name}))]},doc); category.select.addEventListener('change',()=>controller.setField('categoryId',category.select.value||null)); basics.append(category.element);
  const price=createTextField({label:'Narx',type:'number',value:d.price,inputMode:'decimal',error:state.fieldErrors?.price||''},doc); price.input.addEventListener('input',()=>controller.setField('price',price.input.value)); basics.append(price.element);
  const oldPrice=createTextField({label:'Eski narx',type:'number',value:d.oldPrice,inputMode:'decimal',error:state.fieldErrors?.oldPrice||''},doc); oldPrice.input.addEventListener('input',()=>controller.setField('oldPrice',oldPrice.input.value)); basics.append(oldPrice.element);
  const stock=createTextField({label:'Qoldiq',type:'number',value:d.stock,inputMode:'numeric',disabled:(d.variants||[]).length>0,error:state.fieldErrors?.stock||'',help:(d.variants||[]).length?'Variativ mahsulot qoldig‘i variantlardan hisoblanadi.':''},doc); stock.input.addEventListener('input',()=>controller.setField('stock',stock.input.value)); basics.append(stock.element);
  const desc=createTextField({label:'Tavsif',value:d.description},doc); desc.input.addEventListener('input',()=>controller.setField('description',desc.input.value)); basics.append(desc.element);
  root.append(createCard({title:'Asosiy ma’lumot',body:basics,actions:state.mode==='edit'?[createButton({label:'Nom va tavsifni saqlash',busy:state.busy==='basics',onClick:()=>controller.saveBasics()},doc),createButton({label:'Narxni saqlash',variant:'secondary',busy:state.busy==='price',onClick:()=>controller.savePrice()},doc),createButton({label:'Katalogni saqlash',variant:'ghost',busy:state.busy==='category',onClick:()=>controller.saveCategory()},doc),createButton({label:'Qoldiqni saqlash',variant:'ghost',disabled:(d.variants||[]).length>0,busy:state.busy==='stock',onClick:()=>controller.saveStock()},doc)]:[]},doc));

  const media=doc.createElement('div'); media.className='uw-editor-media'; const url=createTextField({label:'Rasm URL',value:d.imageUrl,placeholder:'https://…',help:'Faqat HTTPS URL yoki qurilmadan rasm.'},doc); url.input.addEventListener('input',()=>controller.setField('imageUrl',url.input.value)); media.append(url.element); const picker=filePicker(doc,{label:'Mahsulot rasmi',onFile:(file)=>controller.chooseImageFile(file)}); media.append(picker.wrap); if(d.imageUrl) {const img=doc.createElement('img'); img.src=d.imageUrl; img.alt='Mahsulot rasmi'; img.className='uw-editor-image-preview'; img.width=720; img.height=720; img.loading='lazy'; img.decoding='async'; img.referrerPolicy='no-referrer'; media.append(img);} root.append(createCard({title:'Rasm',description:'Drag-and-drop yoki oddiy file picker ishlaydi.',body:media,actions:state.mode==='edit'?[createButton({label:'Rasmni saqlash',busy:state.busy==='image',onClick:()=>controller.saveImage()},doc)]:[]},doc));

  const variants=doc.createElement('div'); variants.className='uw-variant-editor'; (d.variants||[]).forEach((row,index)=>{const card=doc.createElement('div');card.className='uw-variant-editor__row'; const color=createTextField({label:'Rang',value:row.color||''},doc);color.input.addEventListener('input',()=>controller.setVariantField(index,'color',color.input.value)); const size=createTextField({label:'O‘lcham',value:row.size||''},doc);size.input.addEventListener('input',()=>controller.setVariantField(index,'size',size.input.value)); const qty=createTextField({label:'Qoldiq',type:'number',value:row.qty,inputMode:'numeric'},doc);qty.input.addEventListener('input',()=>controller.setVariantField(index,'qty',qty.input.value)); const vp=createTextField({label:'Narx',type:'number',value:row.price??'',inputMode:'decimal'},doc);vp.input.addEventListener('input',()=>controller.setVariantField(index,'price',vp.input.value)); const vo=createTextField({label:'Eski narx',type:'number',value:row.oldPrice??'',inputMode:'decimal'},doc);vo.input.addEventListener('input',()=>controller.setVariantField(index,'oldPrice',vo.input.value)); const vurl=createTextField({label:'Rang rasmi URL',value:row.colorImg||''},doc);vurl.input.addEventListener('input',()=>controller.setVariantField(index,'colorImg',vurl.input.value)); card.append(color.element,size.element,qty.element,vp.element,vo.element,vurl.element); const vpkr=filePicker(doc,{label:'Rang rasmi',onFile:(file)=>controller.chooseVariantImageFile(index,file),className:'uw-image-drop--compact'});card.append(vpkr.wrap,createButton({label:'Variantni olib tashlash',variant:'ghost',size:'sm',onClick:()=>controller.removeVariant(index)},doc));variants.append(card);}); variants.append(createButton({label:'+ Variant qo‘shish',variant:'secondary',onClick:()=>controller.addVariant({price:d.price||''})},doc)); root.append(createCard({title:'Rang / o‘lcham / narx / qoldiq',description:'Har kombinatsiya mustaqil narx va rasmga ega bo‘lishi mumkin.',body:variants,actions:state.mode==='edit'?[createButton({label:'Variantlarni saqlash',busy:state.busy==='variants',onClick:()=>controller.saveVariants()},doc)]:[]},doc));
  if(state.mode==='create') root.append(createButton({label:'Mahsulotni yaratish',busy:state.busy==='create',onClick:()=>controller.createProduct()},doc));
  if(state.success) root.append(createStatePanel({kind:'success',title:state.success},doc));
  if(state.error) root.append(createStatePanel({kind:'error',title:'Saqlash bajarilmadi',message:state.error.message||'Xatolik yuz berdi.'},doc));
  if(state.busy)root.querySelectorAll?.('input,select,button').forEach(node=>{node.disabled=true;});
  return {element:root};
}

export function createAdminCategoryEditorView({ controller, documentRef = globalThis.document } = {}) {
  const doc=documentRef;if(!doc?.createElement)throw new Error('DOM document kerak');const state=controller.getState();const d=state.draft;const root=doc.createElement('section');root.className='uw-admin-category-editor';root.dataset.feature='admin-category-editor';
  const name=createTextField({label:'Katalog nomi',value:d.name,required:true},doc);name.input.addEventListener('input',()=>controller.setField('name',name.input.value));const parent=createSelectField({label:'Ichki katalog',value:d.parentId||'',options:[{value:'',label:'Asosiy katalog'},...(state.categories||[]).filter(c=>String(c.id)!==String(d.id||'')).map(c=>({value:c.id,label:c.name}))],help:'Katalogni boshqa ota katalogga ko‘chirishda server siklni tekshiradi.'},doc);parent.select.addEventListener('change',()=>controller.setField('parentId',parent.select.value||null));const url=createTextField({label:'Rasm URL',value:d.imageUrl,placeholder:'https://…'},doc);url.input.addEventListener('input',()=>controller.setField('imageUrl',url.input.value));const body=doc.createElement('div');body.className='uw-editor-grid';body.append(name.element,parent.element,url.element);const picker=filePicker(doc,{label:'Katalog rasmi',onFile:(file)=>controller.chooseImageFile(file)});body.append(picker.wrap);root.append(createCard({title:state.mode==='create'?'Yangi katalog':'Katalogni tahrirlash',body,actions:[createButton({label:state.mode==='create'?'Katalog yaratish':'Saqlash',busy:state.busy,onClick:()=>controller.save()},doc)]},doc));if(state.success)root.append(createStatePanel({kind:'success',title:state.success},doc));if(state.error)root.append(createStatePanel({kind:'error',title:'Saqlash bajarilmadi',message:state.error.message||'Xatolik yuz berdi.'},doc));if(state.busy)root.querySelectorAll?.('input,select,button').forEach(node=>{node.disabled=true;});return{element:root};
}
