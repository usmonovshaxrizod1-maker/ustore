import { createButton, createCard, createSelectField, createStatePanel, createTextField } from '../../components/ui.js';
import { fail, ok } from '../../services/ports/result.js';

function hasPermission(actor, permission) {
  if (!actor) return false;
  if (actor.shopRole === 'OWNER') return true;
  const perms = Array.isArray(actor.permissions) ? actor.permissions : [];
  return perms.includes('*') || perms.includes(permission);
}
function clone(value) { return value == null ? value : structuredClone(value); }
function uniq(values) { return [...new Set((values || []).map(String).filter(Boolean))]; }
function toMoney(value) { return `${Math.round(Number(value) || 0).toLocaleString('uz-UZ')} so‘m`; }
function dateStatus(row, now = Date.now()) {
  if (!row?.isActive) return 'INACTIVE';
  if (row.startsAt && new Date(row.startsAt).getTime() > now) return 'SCHEDULED';
  if (row.endsAt && new Date(row.endsAt).getTime() < now) return 'EXPIRED';
  if (row.usageLimit != null && Number(row.usedCount || 0) >= Number(row.usageLimit)) return 'LIMIT_REACHED';
  return 'ACTIVE';
}
function normalizeFeatured(entries) {
  return (Array.isArray(entries) ? entries : []).slice(0, 8).map((entry) => ({
    categoryId: String(entry?.categoryId || ''),
    productIds: uniq(entry?.productIds).slice(0, 6),
  })).filter((entry) => entry.categoryId);
}
function requiredName(value) { return String(value || '').trim().slice(0, 120); }

export function createAdminMarketingController({ adminPort, actor } = {}) {
  if (!adminPort?.invoke) throw new TypeError('adminPort.invoke kerak.');
  const listeners = new Set();
  let state = {
    allowed: hasPermission(actor, 'marketing.manage'), status: 'idle', error: null, busy: null,
    summary: null, featuredCategories: [], categories: [], products: [],
    banners: [], promotions: [], bundles: [], tiers: [], gifts: [], couponRules: [], promoUsage: null,
  };
  const snap = () => clone(state);
  const emit = () => listeners.forEach((fn) => fn(snap()));
  const set = (patch) => { state = { ...state, ...patch }; emit(); };
  async function invoke(action, payload = {}) {
    if (!state.allowed) return fail('FORBIDDEN', 'Marketing boshqaruvi uchun ruxsat yo‘q.');
    return adminPort.invoke(action, payload);
  }
  function applyListResult(index, key, field) {
    const result = index[key];
    return result?.ok ? (result.data?.[field] || []) : [];
  }
  async function load() {
    if (!state.allowed) { const r = fail('FORBIDDEN', 'Marketing boshqaruvi uchun ruxsat yo‘q.'); set({ status:'forbidden', error:r.error }); return r; }
    set({ status:'loading', error:null });
    const keys = ['bootstrap','summary','banners','promos','bundles','tiers','gifts','coupons'];
    const actions = ['get_marketing_bootstrap','marketing_summary','banner_list','promo_list','bundle_list','discount_tier_group_list','automatic_gift_list','reward_rule_list'];
    const results = await Promise.all(actions.map((action) => invoke(action, {})));
    const index = Object.fromEntries(keys.map((key, i) => [key, results[i]]));
    const firstError = results.find((r) => !r.ok);
    if (firstError) { set({ status:'error', error:firstError.error }); return firstError; }
    set({
      status:'ready', error:null,
      summary:index.summary.data || null,
      featuredCategories:normalizeFeatured(index.bootstrap.data?.featuredCategories),
      categories:index.bootstrap.data?.categories || [], products:index.bootstrap.data?.products || [],
      banners:applyListResult(index,'banners','banners'), promotions:applyListResult(index,'promos','promotions'),
      bundles:applyListResult(index,'bundles','bundles'), tiers:applyListResult(index,'tiers','groups'),
      gifts:applyListResult(index,'gifts','rules'), couponRules:applyListResult(index,'coupons','rules'),
    });
    return ok(snap());
  }
  async function run(label, fn, { reload = true } = {}) {
    set({ busy:label, error:null });
    const result = await fn();
    set({ busy:null, error:result.ok ? null : result.error });
    if (result.ok && reload) await load();
    return result;
  }
  async function saveFeatured(entries) {
    const normalized = normalizeFeatured(entries);
    if (normalized.length > 8 || normalized.some((e) => e.productIds.length > 6)) return fail('VALIDATION_ERROR', 'Bosh sahifaga ko‘pi bilan 8 katalog va har biriga 6 mahsulot tanlanadi.');
    return run('featured', async () => {
      const r = await invoke('set_featured_categories', { featuredCategories: normalized });
      if (r.ok && Array.isArray(r.data?.featuredCategories)) set({ featuredCategories: normalizeFeatured(r.data.featuredCategories) });
      return r;
    }, { reload:false });
  }
  async function saveBanner(draft = {}) {
    const isUpdate = Boolean(draft.id); const imageUrl = String(draft.imageUrl || '').trim();
    if (!isUpdate && !imageUrl && !draft.imageUpload) return fail('VALIDATION_ERROR', 'Banner rasmi kerak.');
    const payload = { ...draft, id:draft.id ? String(draft.id) : undefined, title:String(draft.title || '').trim(), imageUrl:imageUrl || undefined, isActive:draft.isActive !== false };
    return run(`banner:${draft.id || 'new'}`, () => invoke(isUpdate ? 'banner_update' : 'banner_create', payload));
  }
  async function reorderBanners(ids) { const order = uniq(ids); if (!order.length) return fail('VALIDATION_ERROR','Banner tartibi bo‘sh.'); return run('banner-reorder', () => invoke('banner_reorder',{order})); }
  async function deleteBanner(id) { return run(`banner-delete:${id}`, () => invoke('banner_delete',{id:String(id)})); }
  async function generatePromoCode() { return invoke('promo_generate_code',{}); }
  async function savePromo(draft = {}) {
    const isUpdate = Boolean(draft.id); const name = requiredName(draft.name); const code = String(draft.code || '').trim().toUpperCase();
    if (!name || !code) return fail('VALIDATION_ERROR','Promo nomi va kodi kerak.');
    const payload = { ...draft, id:draft.id ? String(draft.id):undefined, name, code, discountValue:Number(draft.discountValue), minOrderAmount:draft.minOrderAmount === '' ? null : draft.minOrderAmount, maxOrderAmount:draft.maxOrderAmount === '' ? null : draft.maxOrderAmount, usageLimit:draft.usageLimit === '' ? null : draft.usageLimit, perCustomerLimit:draft.perCustomerLimit === '' ? null : draft.perCustomerLimit };
    return run(`promo:${draft.id || 'new'}`, () => invoke(isUpdate ? 'promo_update' : 'promo_create', payload));
  }
  async function deletePromo(id) { return run(`promo-delete:${id}`, () => invoke('promo_delete',{id:String(id)})); }
  async function promoUsage(id) {
    const promoId = String(id || '');
    if (!promoId) return fail('VALIDATION_ERROR', 'Promo ID kerak.');
    const result = await invoke('promo_usage_list', { promoId });
    if (result.ok) set({ promoUsage: result.data || { promo: null, usages: [] } });
    return result;
  }
  async function saveBundle(draft = {}) {
    const isUpdate = Boolean(draft.id);
    const merged = new Map();
    for (const raw of draft.items || []) {
      const productId = String(raw?.productId || '');
      if (!productId) continue;
      merged.set(productId, (merged.get(productId) || 0) + Math.max(1, Math.round(Number(raw?.qty) || 1)));
    }
    const items = [...merged].map(([productId, qty]) => ({ productId, qty }));
    const bundlePrice = Number(draft.bundlePrice);
    if (!requiredName(draft.name) || items.length < 2) return fail('VALIDATION_ERROR','Aksiyaga nom va kamida 2 xil mahsulot kerak.');
    if (!Number.isFinite(bundlePrice) || bundlePrice <= 0) return fail('VALIDATION_ERROR','Aksiya narxini to‘g‘ri kiriting.');
    return run(`bundle:${draft.id || 'new'}`, () => invoke(isUpdate ? 'bundle_update' : 'bundle_create',{...draft,id:draft.id?String(draft.id):undefined,name:requiredName(draft.name),items,bundlePrice,isActive:draft.isActive!==false}));
  }
  async function deleteBundle(id) { return run(`bundle-delete:${id}`, () => invoke('bundle_delete',{id:String(id)})); }
  async function saveTier(draft = {}) {
    const isUpdate=Boolean(draft.id);
    const steps=(draft.steps||[]).map((s)=>({thresholdAmount:Number(s.thresholdAmount),discountType:s.discountType==='FIXED'?'FIXED':'PERCENT',discountValue:Number(s.discountValue)})).filter((s)=>Number.isFinite(s.thresholdAmount)&&s.thresholdAmount>0);
    if(!steps.length) return fail('VALIDATION_ERROR','Kamida bitta bosqich kerak.');
    if(steps.some((s)=>!Number.isFinite(s.discountValue)||s.discountValue<=0||(s.discountType==='PERCENT'&&s.discountValue>100))) return fail('VALIDATION_ERROR','Bosqich chegirmasi noto‘g‘ri.');
    const thresholds=steps.map((s)=>s.thresholdAmount);
    if(new Set(thresholds).size!==thresholds.length) return fail('VALIDATION_ERROR','Bir xil summa uchun ikki bosqich bo‘lishi mumkin emas.');
    steps.sort((a,b)=>a.thresholdAmount-b.thresholdAmount);
    return run(`tier:${draft.id||'new'}`,()=>invoke(isUpdate?'discount_tier_group_update':'discount_tier_group_create',{...draft,id:draft.id?String(draft.id):undefined,steps,isActive:draft.isActive!==false}));
  }
  async function deleteTier(id){return run(`tier-delete:${id}`,()=>invoke('discount_tier_group_delete',{id:String(id)}));}
  async function saveGift(draft={}){
    const isUpdate=Boolean(draft.id);
    const name=requiredName(draft.name);
    const conditionType=['ORDER_AMOUNT','SPECIFIC_PRODUCT','SPECIFIC_PRODUCTS','CATEGORY_QUANTITY'].includes(draft.conditionType)?draft.conditionType:'ORDER_AMOUNT';
    const giftProductId=String(draft.giftProductId||'');
    if(!name||!giftProductId)return fail('VALIDATION_ERROR','Sovg‘a nomi va mahsuloti kerak.');
    const payload={...draft,id:draft.id?String(draft.id):undefined,name,conditionType,giftProductId,giftQuantity:Math.max(1,Math.round(Number(draft.giftQuantity)||1)),isActive:draft.isActive!==false};
    if(conditionType==='ORDER_AMOUNT'){payload.thresholdAmount=Number(draft.thresholdAmount);if(!Number.isFinite(payload.thresholdAmount)||payload.thresholdAmount<=0)return fail('VALIDATION_ERROR','Minimal buyurtma summasi kerak.');}
    if(conditionType==='SPECIFIC_PRODUCT'){payload.targetProductId=String(draft.targetProductId||'');payload.thresholdQuantity=Math.max(1,Math.round(Number(draft.thresholdQuantity)||0));if(!payload.targetProductId||!payload.thresholdQuantity)return fail('VALIDATION_ERROR','Trigger mahsulot va miqdor kerak.');}
    if(conditionType==='CATEGORY_QUANTITY'){payload.targetCategoryId=String(draft.targetCategoryId||'');payload.thresholdQuantity=Math.max(1,Math.round(Number(draft.thresholdQuantity)||0));if(!payload.targetCategoryId||!payload.thresholdQuantity)return fail('VALIDATION_ERROR','Katalog va miqdor kerak.');}
    if(conditionType==='SPECIFIC_PRODUCTS'){payload.targetProductIds=uniq(draft.targetProductIds);payload.matchMode=draft.matchMode==='ALL'?'ALL':'ANY';if(!payload.targetProductIds.length)return fail('VALIDATION_ERROR','Kamida bitta trigger mahsulot kerak.');}
    return run(`gift:${draft.id||'new'}`,()=>invoke(isUpdate?'automatic_gift_update':'automatic_gift_create',payload));
  }
  async function deleteGift(id){return run(`gift-delete:${id}`,()=>invoke('automatic_gift_delete',{id:String(id)}));}
  async function saveCouponRule(draft={}){
    const isUpdate=Boolean(draft.id);
    const payload={...draft,id:draft.id?String(draft.id):undefined,triggerType:draft.triggerType==='LIFETIME_TOTAL'?'LIFETIME_TOTAL':'ORDER_TOTAL',rewardType:draft.rewardType==='FIXED'?'FIXED':'PERCENT',thresholdAmount:Number(draft.thresholdAmount),rewardValue:Number(draft.rewardValue),isActive:draft.isActive!==false};
    if(!Number.isFinite(payload.thresholdAmount)||payload.thresholdAmount<=0)return fail('VALIDATION_ERROR','Kupon uchun minimal summa kerak.');
    if(!Number.isFinite(payload.rewardValue)||payload.rewardValue<=0||(payload.rewardType==='PERCENT'&&payload.rewardValue>100))return fail('VALIDATION_ERROR','Kupon qiymati noto‘g‘ri.');
    return run(`coupon:${draft.id||'new'}`,()=>invoke(isUpdate?'reward_rule_update':'reward_rule_create',payload));
  }
  async function deleteCouponRule(id){return run(`coupon-delete:${id}`,()=>invoke('reward_rule_delete',{id:String(id)}));}
  return Object.freeze({ getState:snap, subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}, load, saveFeatured, saveBanner, reorderBanners, deleteBanner, generatePromoCode, savePromo, deletePromo, promoUsage, saveBundle, deleteBundle, saveTier, deleteTier, saveGift, deleteGift, saveCouponRule, deleteCouponRule });
}

function text(doc, tag, className, value) { const el=doc.createElement(tag); if(className)el.className=className; el.textContent=String(value??''); return el; }
function statusChip(doc, value) { const labels={ACTIVE:'Faol',SCHEDULED:'Rejalashtirilgan',EXPIRED:'Muddati tugagan',LIMIT_REACHED:'Limit tugagan',INACTIVE:'O‘chirilgan'}; const el=text(doc,'span','uw-marketing-chip',labels[value]||value); el.dataset.status=value; return el; }
function productName(state,id){return state.products.find((p)=>String(p.id)===String(id))?.name || `#${id}`;}
function categoryName(state,id){return state.categories.find((c)=>String(c.id)===String(id))?.name || `#${id}`;}
function makeDelete(doc,label,onClick){return createButton({label,variant:'danger',size:'sm',onClick},doc);}
function summaryCard(doc,label,count,active){const box=doc.createElement('div');box.className='uw-marketing-stat';box.append(text(doc,'small','',label),text(doc,'strong','',String(count||0)),text(doc,'span','',`${active||0} faol`));return box;}

function renderFeatured(doc, state, controller) {
  const wrap = doc.createElement('div');
  wrap.className = 'uw-marketing-featured';
  const draft = clone(state.featuredCategories);
  const chosen = new Map(draft.map((entry) => [String(entry.categoryId), new Set(entry.productIds.map(String))]));
  const grid = doc.createElement('div');
  grid.className = 'uw-marketing-featured-grid';

  for (const cat of state.categories) {
    const id = String(cat.id);
    const card = doc.createElement('div');
    card.className = 'uw-marketing-featured-card';
    const head = doc.createElement('label');
    const box = doc.createElement('input');
    box.type = 'checkbox';
    box.checked = chosen.has(id);
    head.append(box, text(doc, 'strong', '', cat.name));
    card.append(head);

    const products = state.products.filter((p) => String(p.category_id || p.categoryId || '') === id).slice(0, 24);
    const list = doc.createElement('div');
    list.className = 'uw-marketing-featured-products';
    for (const product of products) {
      const label = doc.createElement('label');
      const px = doc.createElement('input');
      px.type = 'checkbox';
      px.checked = chosen.get(id)?.has(String(product.id)) || false;
      px.disabled = !box.checked;
      label.append(px, text(doc, 'span', '', product.name));
      px.addEventListener('change', () => {
        const set = chosen.get(id) || new Set();
        if (px.checked) {
          if (set.size >= 6) { px.checked = false; return; }
          set.add(String(product.id));
        } else set.delete(String(product.id));
        chosen.set(id, set);
      });
      list.append(label);
    }
    box.addEventListener('change', () => {
      if (box.checked) {
        if (!chosen.has(id)) chosen.set(id, new Set());
      } else chosen.delete(id);
      for (const child of list.children || []) {
        const input = child.children?.[0];
        if (input) input.disabled = !box.checked;
      }
    });
    card.append(list);
    grid.append(card);
  }

  const save = createButton({
    label: 'Bosh sahifa kataloglarini saqlash',
    busy: state.busy === 'featured',
    onClick: () => controller.saveFeatured(
      [...chosen].slice(0, 8).map(([categoryId, set]) => ({ categoryId, productIds: [...set].slice(0, 6) })),
    ),
  }, doc);
  wrap.append(grid, save);
  return wrap;
}
function renderBannerSection(doc,state,controller){const body=doc.createElement('div');body.className='uw-marketing-section';const form=doc.createElement('form');form.className='uw-marketing-form';const title=createTextField({label:'Banner nomi',placeholder:'Yangi kolleksiya'},doc);const image=createTextField({label:'Rasm URL',placeholder:'https://…'},doc);const target=createSelectField({label:'Maqsad',options:[{value:'NONE',label:'Maqsadsiz'},{value:'PRODUCT',label:'Mahsulot'},{value:'CATEGORY',label:'Katalog'},{value:'BUNDLE',label:'Aksiya'},{value:'PROMOTION',label:'Promo-kod'},{value:'URL',label:'Tashqi URL'}]},doc);const targetValue=createTextField({label:'Maqsad ID / URL',placeholder:'ID yoki https://…'},doc);form.append(title.element,image.element,target.element,targetValue.element,createButton({label:'Banner qo‘shish',type:'submit'},doc));form.addEventListener('submit',(e)=>{e.preventDefault();const t=target.select.value;const payload={title:title.input.value,imageUrl:image.input.value,targetType:t};if(t==='URL')payload.targetUrl=targetValue.input.value;if(t==='PRODUCT')payload.targetProductId=targetValue.input.value;if(t==='CATEGORY')payload.targetCategoryId=targetValue.input.value;if(t==='BUNDLE')payload.targetBundleId=targetValue.input.value;if(t==='PROMOTION')payload.targetPromotionId=targetValue.input.value;controller.saveBanner(payload);});body.append(form);const active=state.banners.filter((b)=>b.isActive).slice(0,5);const vitrina=doc.createElement('div');vitrina.className='uw-marketing-vitrine';vitrina.append(text(doc,'h4','','Vitrina · 5 ta slot'));active.forEach((b,index)=>{const row=doc.createElement('div');row.className='uw-marketing-row';row.append(text(doc,'span','uw-marketing-order',String(index+1)),text(doc,'strong','',b.title||'Nomsiz banner'),statusChip(doc,dateStatus(b)));const actions=doc.createElement('div');if(index>0)actions.append(createButton({label:'↑',variant:'ghost',size:'sm',ariaLabel:'Yuqoriga',onClick:()=>{const ids=active.map(x=>x.id);[ids[index-1],ids[index]]=[ids[index],ids[index-1]];controller.reorderBanners(ids.concat(state.banners.filter(x=>!active.some(a=>a.id===x.id)).map(x=>x.id)));}},doc));if(index<active.length-1)actions.append(createButton({label:'↓',variant:'ghost',size:'sm',ariaLabel:'Pastga',onClick:()=>{const ids=active.map(x=>x.id);[ids[index+1],ids[index]]=[ids[index],ids[index+1]];controller.reorderBanners(ids.concat(state.banners.filter(x=>!active.some(a=>a.id===x.id)).map(x=>x.id)));}},doc));row.append(actions);vitrina.append(row);});body.append(vitrina,text(doc,'h4','','Barcha bannerlar'));for(const b of state.banners){const row=doc.createElement('div');row.className='uw-marketing-row';row.append(text(doc,'strong','',b.title||'Nomsiz banner'),text(doc,'small','',b.targetType||'NONE'),statusChip(doc,dateStatus(b)));const actions=doc.createElement('div');actions.className='uw-marketing-row__actions';actions.append(createButton({label:b.isActive?'O‘chirish':'Yoqish',variant:'ghost',size:'sm',onClick:()=>controller.saveBanner({id:b.id,isActive:!b.isActive})},doc),makeDelete(doc,'O‘chirish',()=>controller.deleteBanner(b.id)));row.append(actions);body.append(row);}return createCard({title:'Bannerlar',description:'Yuqorida Vitrina slotlari, pastda barcha bannerlar kutubxonasi.',body},doc);}

function renderPromoSection(doc,state,controller){
  const body=doc.createElement('div');body.className='uw-marketing-section';
  const form=doc.createElement('form');form.className='uw-marketing-form';
  const name=createTextField({label:'Promo nomi'},doc),code=createTextField({label:'Kod'},doc),value=createTextField({label:'Chegirma',type:'number'},doc),type=createSelectField({label:'Turi',options:[{value:'PERCENT',label:'Foiz'},{value:'FIXED',label:'Summa'}]},doc);
  form.append(name.element,code.element,type.element,value.element,createButton({label:'Kod yaratish',variant:'secondary',onClick:async()=>{const r=await controller.generatePromoCode();if(r.ok)code.input.value=r.data.code||'';}},doc),createButton({label:'Promo qo‘shish',type:'submit'},doc));
  form.addEventListener('submit',(e)=>{e.preventDefault();controller.savePromo({name:name.input.value,code:code.input.value,discountType:type.select.value,discountValue:value.input.value,isPublic:true,isActive:true});});
  body.append(form);
  for(const promo of state.promotions){
    const row=doc.createElement('div');row.className='uw-marketing-row';
    const copy=doc.createElement('div');copy.append(text(doc,'strong','',promo.name),text(doc,'small','',`${promo.code} · ${promo.discountType==='PERCENT'?`${promo.discountValue}%`:toMoney(promo.discountValue)} · ${promo.usedCount||0}${promo.usageLimit?`/${promo.usageLimit}`:''} ishlatilgan`));
    row.append(copy,statusChip(doc,dateStatus(promo)));
    const actions=doc.createElement('div');actions.className='uw-marketing-row__actions';
    actions.append(
      createButton({label:'Kimlar ishlatgan?',variant:'ghost',size:'sm',onClick:async()=>{const r=await controller.promoUsage(promo.id);const panel=doc.createElement('div');panel.className='uw-marketing-usage';panel.dataset.promoUsage=String(promo.id);if(!r.ok){panel.append(text(doc,'small','',r.error?.message||'Foydalanish tarixini yuklab bo‘lmadi.'));}else{const usages=r.data?.usages||[];panel.append(text(doc,'strong','',`${promo.code} · ${usages.length} ta foydalanish`));if(!usages.length)panel.append(text(doc,'small','','Hali hech kim ishlatmagan.'));for(const u of usages.slice(0,50))panel.append(text(doc,'small','',`${u.customerName||u.phone||`Telegram ${u.tgId||'—'}`} · #${u.orderId||'—'} · -${toMoney(u.discountAmount)}`));}body.append(panel);}},doc),
      createButton({label:promo.isActive?'O‘chirish':'Yoqish',variant:'ghost',size:'sm',onClick:()=>controller.savePromo({...promo,isActive:!promo.isActive})},doc),
      makeDelete(doc,'O‘chirish',()=>controller.deletePromo(promo.id)),
    );
    row.append(actions);body.append(row);
  }
  return createCard({title:'Promo-kodlar',description:'Status, limit, ishlatilgan soni va mijozlar tarixi aniq ko‘rinadi.',body},doc);
}
function productSelect(doc,state,label){return createSelectField({label,options:[{value:'',label:'Tanlang'},...state.products.map(p=>({value:String(p.id),label:p.name}))]},doc);}
function renderBundleSection(doc,state,controller){
  const body=doc.createElement('div');body.className='uw-marketing-section';
  const form=doc.createElement('form');form.className='uw-marketing-form';
  const name=createTextField({label:'Aksiya nomi'},doc),price=createTextField({label:'Bundle narxi',type:'number'},doc);
  const picks=Array.from({length:6},(_,i)=>productSelect(doc,state,`${i+1}-mahsulot${i<2?' *':''}`));
  form.append(name.element,price.element,...picks.map(x=>x.element),createButton({label:'Aksiya qo‘shish',type:'submit'},doc));
  form.addEventListener('submit',(e)=>{e.preventDefault();controller.saveBundle({name:name.input.value,bundlePrice:price.input.value,items:picks.map(x=>({productId:x.select.value,qty:1})).filter(x=>x.productId),isActive:true});});
  body.append(form);
  for(const bundle of state.bundles){
    const row=doc.createElement('div');row.className='uw-marketing-row';
    const copy=doc.createElement('div');const itemProducts=(bundle.items||[]).map(i=>state.products.find(p=>String(p.id)===String(i.productId))).filter(Boolean).slice(0,6);
    const collage=doc.createElement('span');collage.className='uw-marketing-collage';for(const product of itemProducts){const img=doc.createElement('img');img.src=product.img||'';img.alt='';img.title=product.name||'';img.width=64;img.height=64;img.loading='lazy';img.fetchPriority='low';img.decoding='async';img.referrerPolicy='no-referrer';collage.append(img);}
    copy.append(collage,text(doc,'strong','',bundle.name),text(doc,'small','',`${itemProducts.map(p=>p.name).join(' + ')} · ${toMoney(bundle.bundlePrice)}`));
    row.append(copy,statusChip(doc,dateStatus(bundle)),makeDelete(doc,'O‘chirish',()=>controller.deleteBundle(bundle.id)));body.append(row);
  }
  return createCard({title:'Aksiyalar (bundle)',description:'2–6 mahsulotli aksiya; kollaj avtomatik aksiya tarkibidan olinadi, server qoldiq/variantni tekshiradi.',body},doc);
}
function renderTierSection(doc,state,controller){
  const body=doc.createElement('div');body.className='uw-marketing-section';
  const form=doc.createElement('form');form.className='uw-marketing-form';
  const name=createTextField({label:'Qoida nomi'},doc);
  const pairs=Array.from({length:3},(_,i)=>({threshold:createTextField({label:`${i+1}-bosqich summa`,type:'number'},doc),discount:createTextField({label:`${i+1}-bosqich chegirma %`,type:'number'},doc)}));
  form.append(name.element,...pairs.flatMap(x=>[x.threshold.element,x.discount.element]),createButton({label:'Bosqichli chegirma qo‘shish',type:'submit'},doc));
  form.addEventListener('submit',(e)=>{e.preventDefault();controller.saveTier({name:name.input.value,steps:pairs.map(x=>({thresholdAmount:x.threshold.input.value,discountType:'PERCENT',discountValue:x.discount.input.value})).filter(x=>x.thresholdAmount&&x.discountValue),isActive:true});});
  body.append(form);
  for(const tier of state.tiers){const row=doc.createElement('div');row.className='uw-marketing-row';const steps=(tier.steps||[]).map(step=>`${toMoney(step.thresholdAmount)} → ${step.discountType==='PERCENT'?`${step.discountValue}%`:toMoney(step.discountValue)}`).join(' · ');const copy=doc.createElement('div');copy.append(text(doc,'strong','',tier.name||'Bosqichli chegirma'),text(doc,'small','',steps));row.append(copy,statusChip(doc,dateStatus(tier)),makeDelete(doc,'O‘chirish',()=>controller.deleteTier(tier.id)));body.append(row);}
  return createCard({title:'Bosqichli chegirmalar',description:'1–3 bosqich bir guruhda saqlanadi; checkout progress chizig‘i shu server bosqichlaridan oziqlanadi.',body},doc);
}
function renderGiftSection(doc,state,controller){
  const body=doc.createElement('div');body.className='uw-marketing-section';
  body.append(text(doc,'h4','','Yangi qoida · 4 tur'));

  const amountForm=doc.createElement('form');amountForm.className='uw-marketing-form';
  const amountName=createTextField({label:'Summa bo‘yicha sovg‘a nomi'},doc),amountThreshold=createTextField({label:'Buyurtma summasi',type:'number'},doc),amountGift=productSelect(doc,state,'Sovg‘a mahsulot');
  amountForm.append(amountName.element,amountThreshold.element,amountGift.element,createButton({label:'Summa bo‘yicha sovg‘a',type:'submit'},doc));
  amountForm.addEventListener('submit',(e)=>{e.preventDefault();controller.saveGift({name:amountName.input.value,conditionType:'ORDER_AMOUNT',thresholdAmount:Number(amountThreshold.input.value),giftProductId:amountGift.select.value,giftQuantity:1,isActive:true});});

  const quantityForm=doc.createElement('form');quantityForm.className='uw-marketing-form';
  const qtyName=createTextField({label:'Miqdor bo‘yicha sovg‘a nomi'},doc),qtyTrigger=productSelect(doc,state,'Trigger mahsulot'),qtyCount=createTextField({label:'Kerakli miqdor',type:'number'},doc),qtyGift=productSelect(doc,state,'Sovg‘a mahsulot');
  quantityForm.append(qtyName.element,qtyTrigger.element,qtyCount.element,qtyGift.element,createButton({label:'Miqdor bo‘yicha sovg‘a',type:'submit'},doc));
  quantityForm.addEventListener('submit',(e)=>{e.preventDefault();controller.saveGift({name:qtyName.input.value,conditionType:'SPECIFIC_PRODUCT',targetProductId:qtyTrigger.select.value,thresholdQuantity:Number(qtyCount.input.value),giftProductId:qtyGift.select.value,giftQuantity:1,isActive:true});});

  const productsForm=doc.createElement('form');productsForm.className='uw-marketing-form';
  const productsName=createTextField({label:'Mahsulot bo‘yicha sovg‘a nomi'},doc),triggers=[productSelect(doc,state,'Trigger 1'),productSelect(doc,state,'Trigger 2'),productSelect(doc,state,'Trigger 3')],match=createSelectField({label:'Shart',options:[{value:'ANY',label:'Kamida bittasi'},{value:'ALL',label:'Barchasi'}]},doc),productsGift=productSelect(doc,state,'Sovg‘a mahsulot');
  productsForm.append(productsName.element,...triggers.map(x=>x.element),match.element,productsGift.element,createButton({label:'Mahsulot bo‘yicha sovg‘a',type:'submit'},doc));
  productsForm.addEventListener('submit',(e)=>{e.preventDefault();controller.saveGift({name:productsName.input.value,conditionType:'SPECIFIC_PRODUCTS',targetProductIds:triggers.map(x=>x.select.value).filter(Boolean),matchMode:match.select.value,giftProductId:productsGift.select.value,giftQuantity:1,isActive:true});});

  const couponForm=doc.createElement('form');couponForm.className='uw-marketing-form';
  const couponTrigger=createSelectField({label:'Kupon sharti',options:[{value:'ORDER_TOTAL',label:'Bir buyurtma summasi'},{value:'LIFETIME_TOTAL',label:'Jami xaridlar'}]},doc),couponThreshold=createTextField({label:'Minimal summa',type:'number'},doc),couponType=createSelectField({label:'Kupon turi',options:[{value:'PERCENT',label:'Foiz'},{value:'FIXED',label:'Summa'}]},doc),couponValue=createTextField({label:'Kupon qiymati',type:'number'},doc);
  couponForm.append(couponTrigger.element,couponThreshold.element,couponType.element,couponValue.element,createButton({label:'Bir martalik kupon',type:'submit'},doc));
  couponForm.addEventListener('submit',(e)=>{e.preventDefault();controller.saveCouponRule({triggerType:couponTrigger.select.value,thresholdAmount:Number(couponThreshold.input.value),rewardType:couponType.select.value,rewardValue:Number(couponValue.input.value),isActive:true});});

  body.append(amountForm,quantityForm,productsForm,couponForm,text(doc,'h4','','Amaldagi sovg‘alar va kuponlar'));
  for(const gift of state.gifts){
    const type=gift.conditionType==='ORDER_AMOUNT'?'Summa bo‘yicha sovg‘a':gift.conditionType==='SPECIFIC_PRODUCTS'?'Mahsulot bo‘yicha':gift.conditionType==='SPECIFIC_PRODUCT'?'Miqdor bo‘yicha':'Katalog bo‘yicha';
    const row=doc.createElement('div');row.className='uw-marketing-row';const copy=doc.createElement('div');
    let condition='';if(gift.conditionType==='ORDER_AMOUNT')condition=`${toMoney(gift.thresholdAmount)}+`;else if(gift.conditionType==='SPECIFIC_PRODUCT')condition=`${productName(state,gift.targetProductId)} ×${gift.thresholdQuantity}`;else if(gift.conditionType==='SPECIFIC_PRODUCTS')condition=(gift.targetProductIds||[]).map(id=>productName(state,id)).join(gift.matchMode==='ALL'?' + ':' yoki ');else condition=`${categoryName(state,gift.targetCategoryId)} ×${gift.thresholdQuantity}`;
    copy.append(text(doc,'strong','',gift.name),text(doc,'small','',`${type} · ${condition} → ${productName(state,gift.giftProductId)} ×${gift.giftQuantity}`));
    row.append(copy,statusChip(doc,dateStatus(gift)),makeDelete(doc,'O‘chirish',()=>controller.deleteGift(gift.id)));body.append(row);
  }
  for(const rule of state.couponRules){const row=doc.createElement('div');row.className='uw-marketing-row';const copy=doc.createElement('div');copy.append(text(doc,'strong','',rule.triggerType==='LIFETIME_TOTAL'?'Jami xaridlar uchun kupon':'Bir buyurtma uchun kupon'),text(doc,'small','',`${toMoney(rule.thresholdAmount)} → ${rule.rewardType==='PERCENT'?`${rule.rewardValue}%`:toMoney(rule.rewardValue)} bir martalik kupon`));row.append(copy,statusChip(doc,rule.isActive?'ACTIVE':'INACTIVE'),makeDelete(doc,'O‘chirish',()=>controller.deleteCouponRule(rule.id)));body.append(row);}
  return createCard({title:'Avtomatik sovg‘a',description:'Mavjud backenddagi 4 asosiy UI turi: kupon, summa bo‘yicha, mahsulot bo‘yicha va miqdor bo‘yicha sovg‘a. Legacy katalog qoidalari ham ro‘yxatda saqlanadi.',body},doc);
}
export function createAdminMarketingView({ controller, documentRef = globalThis.document } = {}) {
  const doc=documentRef;if(!doc?.createElement)throw new Error('DOM document kerak.');const state=controller.getState();const root=doc.createElement('section');root.className='uw-admin-marketing';root.dataset.feature='admin-marketing';
  const head=doc.createElement('header');head.className='uw-admin-marketing__header';head.append(text(doc,'div','', 'Marketing'),text(doc,'small','', 'Banner, promo, aksiya, bosqichli chegirma va sovg‘alarni boshqarish.'));root.append(head);
  if(state.allowed===false){root.append(createStatePanel({kind:'permission',title:'Marketing boshqaruvi uchun ruxsat yo‘q'},doc));return {element:root};}
  if(state.status==='loading'){root.append(createStatePanel({kind:'loading',title:'Marketing yuklanmoqda'},doc));return {element:root};}
  if(state.status==='error'){root.append(createStatePanel({kind:'error',title:'Marketingni ochib bo‘lmadi',message:state.error?.message||'Qayta urinib ko‘ring.',actionLabel:'Qayta urinish',onAction:()=>controller.load()},doc));return {element:root};}
  if(state.summary){const stats=doc.createElement('div');stats.className='uw-marketing-stats';const c=state.summary.counts||{},a=state.summary.activeCounts||{};for(const [key,label] of [['banners','Banner'],['promos','Promo'],['bundles','Aksiya'],['tiers','Bosqich'],['gifts','Sovg‘a']])stats.append(summaryCard(doc,label,c[key],a[key]));root.append(stats);}
  root.append(createCard({title:'Bosh sahifa kataloglari',description:'Ko‘pi bilan 8 katalog; har birida 6 tagacha mahsulot. v308 dagi server-confirmed save yo‘li saqlandi.',body:renderFeatured(doc,state,controller)},doc));
  root.append(renderBannerSection(doc,state,controller),renderPromoSection(doc,state,controller),renderBundleSection(doc,state,controller),renderTierSection(doc,state,controller),renderGiftSection(doc,state,controller));
  if(state.error)root.prepend(createStatePanel({kind:'error',title:'Oxirgi amal bajarilmadi',message:state.error.message||'Qayta urinib ko‘ring.'},doc));return {element:root};
}

export { dateStatus, normalizeFeatured };
