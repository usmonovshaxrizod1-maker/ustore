import { createButton, createStatePanel } from '../../components/ui.js';
import { fail, ok } from '../../services/ports/result.js';

const STATUS = new Set(['ALL','NEW','PROCESSING','DELIVERED','CANCELLED']);
const SOURCE = new Set(['ALL','WEB','TELEGRAM','UNKNOWN']);
const PAYMENT = new Set(['ALL','PENDING','PAID','FAILED','REFUNDED']);
const STATUS_LABELS = Object.freeze({ NEW:'Yangi', PROCESSING:'Jarayonda', DELIVERED:'Yetkazildi', CANCELLED:'Bekor qilindi' });
const NEXT_STATUS = Object.freeze({ NEW:['PROCESSING','CANCELLED'], PROCESSING:['DELIVERED','CANCELLED'], DELIVERED:[], CANCELLED:[] });
function clone(v){return v==null?v:structuredClone(v);} function text(v){return String(v??'').trim();}
function hasPermission(actor,p){const a=Array.isArray(actor?.permissions)?actor.permissions:[];return a.includes('*')||a.includes(p);}
function normStatus(v){const s=text(v).toUpperCase();return STATUS.has(s)&&s!=='ALL'?s:'NEW';}
function normSource(v){const s=text(v).toUpperCase();return ['WEB','TELEGRAM'].includes(s)?s:'UNKNOWN';}
function money(v){try{return `${new Intl.NumberFormat('uz-UZ').format(Number(v)||0)} so‘m`;}catch{return `${Number(v)||0} so‘m`;}}
function dateLabel(v){if(!v)return '—';try{return new Intl.DateTimeFormat('uz-UZ',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v));}catch{return String(v);}}

export function normalizeAdminOrder(raw={}){
  return {
    ...raw, id:String(raw.id??''), source:normSource(raw.source??raw.order_source), status:normStatus(raw.status),
    user:text(raw.user??raw.user_name)||'Noma’lum mijoz', phone:text(raw.phone)||null, region:text(raw.region)||null, district:text(raw.district)||null,
    address:text(raw.address)||null, payMethod:text(raw.payMethod??raw.pay_method)||null, paymentStatus:text((raw.paymentStatus ?? raw.payment_status) || 'PENDING').toUpperCase(),
    items:Array.isArray(raw.items)?raw.items:[], payableTotal:Number(raw.payableTotal??raw.payable_total??raw.totalPrice??raw.total_price)||0,
    subtotal:Number(raw.subtotal)||0, deliveryFee:Number(raw.deliveryFee??raw.delivery_fee)||0, createdAt:raw.createdAt??raw.created_at??null,
    internalNote:raw.internalNote??raw.internal_note??null, shipment:raw.shipment||null, delivery:raw.delivery||raw.delivery_snapshot||null,
  };
}

export function adminOrderActionAvailability(actor, order={}){
  const canView=hasPermission(actor,'orders.view'); const canManage=hasPermission(actor,'orders.manage');
  const status=normStatus(order.status); return {canView,canManage,nextStatuses:canManage?(NEXT_STATUS[status]||[]):[]};
}

export function createAdminOrdersController({adminPort,actor}={}){
  if(!adminPort?.invoke)throw new TypeError('adminPort kerak');
  const canView=hasPermission(actor,'orders.view'); const canManage=hasPermission(actor,'orders.manage');
  let state={status:'idle',all:[],items:[],selected:null,selectedId:null,error:null,busyAction:null,capabilities:{canView,canManage},filters:{search:'',status:'ALL',source:'ALL',paymentStatus:'ALL',region:'ALL',payMethod:'ALL',dateFrom:'',dateTo:''}};
  const listeners=new Set(); const snapshot=()=>clone(state); const emit=()=>listeners.forEach(fn=>fn(snapshot())); const set=(p)=>{state={...state,...p};emit();return snapshot();};
  const deny=()=>fail('FORBIDDEN','Buyurtmalarni ko‘rish uchun ruxsat yo‘q.');
  function apply(){
    const f=state.filters; const q=text(f.search).toLocaleLowerCase('uz-UZ');
    const from=f.dateFrom?new Date(`${f.dateFrom}T00:00:00`).getTime():null; const to=f.dateTo?new Date(`${f.dateTo}T23:59:59.999`).getTime():null;
    const items=state.all.filter(o=>{
      if(q&&!`${o.id} ${o.user} ${o.phone||''}`.toLocaleLowerCase('uz-UZ').includes(q))return false;
      if(f.status!=='ALL'&&o.status!==f.status)return false; if(f.source!=='ALL'&&o.source!==f.source)return false;
      if(f.paymentStatus!=='ALL'&&o.paymentStatus!==f.paymentStatus)return false; if(f.region!=='ALL'&&String(o.region||'')!==f.region)return false;
      if(f.payMethod!=='ALL'&&String(o.payMethod||'')!==f.payMethod)return false; const t=o.createdAt?new Date(o.createdAt).getTime():0;
      if(from&&t<from)return false;if(to&&t>to)return false;return true;
    });
    state={...state,items}; emit(); return snapshot();
  }
  async function load(){
    if(!canView){set({status:'permission',error:deny().error});return deny();} set({status:'loading',error:null});
    const r=await adminPort.invoke('get_all_orders',{}); if(!r.ok){set({status:r.error.code==='FORBIDDEN'?'permission':'error',error:r.error});return r;}
    const all=(r.data?.orders||[]).map(normalizeAdminOrder); set({status:'ready',all,items:all,error:null}); apply(); return ok({items:state.items,total:state.items.length});
  }
  function setFilter(name,value){if(!(name in state.filters))return snapshot(); const next={...state.filters,[name]:String(value??'')}; if(['status','source','paymentStatus'].includes(name)) next[name]=String(value||'ALL').toUpperCase(); set({filters:next}); return apply();}
  function open(orderId){const id=String(orderId??'');const order=state.all.find(x=>x.id===id)||null;set({selectedId:id||null,selected:order,error:order?null:{code:'NOT_FOUND',message:'Buyurtma topilmadi.',retryable:false}});return order?ok(order):fail('NOT_FOUND','Buyurtma topilmadi.');}
  async function updateStatus(orderId,newStatus,{reason=null}={}){
    if(!canManage)return fail('FORBIDDEN','Buyurtma holatini o‘zgartirish uchun ruxsat yo‘q.'); const id=String(orderId??''); const current=state.all.find(x=>x.id===id); if(!current)return fail('NOT_FOUND','Buyurtma topilmadi.');
    const target=String(newStatus||'').toUpperCase(); if(!(NEXT_STATUS[current.status]||[]).includes(target))return fail('CONFLICT','Bu holat o‘tishi ruxsat etilmagan.');
    set({busyAction:`status:${id}`,error:null}); const r=await adminPort.invoke('update_order_status',{orderId:Number(id),newStatus:target,reason:text(reason)||null});
    if(!r.ok){set({busyAction:null,error:r.error});return r;} const updated=normalizeAdminOrder(r.data?.order||{...current,status:target});
    const all=state.all.map(x=>x.id===id?{...x,...updated}:x); state={...state,all,busyAction:null,selected:state.selectedId===id?{...state.selected,...updated}:state.selected,error:null}; apply(); return ok(updated);
  }
  return Object.freeze({getState:snapshot,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},load,setFilter,applyFilters:apply,open,closeDetail(){set({selected:null,selectedId:null,error:null});},updateStatus});
}

function docOf(d){const doc=d??globalThis.document;if(!doc?.createElement)throw new Error('Admin orders UI uchun DOM kerak');return doc;}
function node(doc,tag,cls,value){const n=doc.createElement(tag);n.className=cls||'';if(value!=null)n.textContent=String(value);return n;}
export function createAdminOrdersView({controller,state=controller?.getState?.()||{}}={},documentRef){
  if(!controller)throw new TypeError('controller kerak'); const doc=docOf(documentRef); const root=node(doc,'section','uw-admin-orders');
  const head=node(doc,'header','uw-admin-orders__header');head.append(node(doc,'div','', 'Buyurtmalar'),node(doc,'small','',`${state.items?.length||0} ta`));root.append(head);
  if(state.status==='loading'){root.append(createStatePanel({kind:'loading',title:'Buyurtmalar yuklanmoqda',message:'Bir oz kuting.'},doc));return root;}
  if(state.status==='permission'){root.append(createStatePanel({kind:'permission',title:'Ruxsat yo‘q',message:'orders.view huquqi talab qilinadi.'},doc));return root;}
  if(state.error){root.append(createStatePanel({kind:'error',title:'Buyurtmalarni ochib bo‘lmadi',message:state.error.message||'Qayta urinib ko‘ring.',actionLabel:'Qayta urinish',onAction:()=>controller.load()},doc));return root;}
  const filters=node(doc,'div','uw-admin-orders-filters');
  const search=doc.createElement('input');search.className='uw-field__control';search.placeholder='#ID, mijoz yoki telefon';search.setAttribute('aria-label','Buyurtmalarni qidirish');search.value=state.filters?.search||'';search.addEventListener('input',e=>controller.setFilter('search',e.target.value));filters.append(search);
  for(const [name,label,values] of [['status','Holat',['ALL','NEW','PROCESSING','DELIVERED','CANCELLED']],['source','Manba',['ALL','WEB','TELEGRAM','UNKNOWN']],['paymentStatus','To‘lov',['ALL','PENDING','PAID','FAILED','REFUNDED']]]){const s=doc.createElement('select');s.className='uw-field__control';s.setAttribute('aria-label',label);for(const v of values){const o=doc.createElement('option');o.value=v;o.textContent=v==='ALL'?label:v;o.selected=String(state.filters?.[name]||'ALL')===v;s.append(o);}s.addEventListener('change',e=>controller.setFilter(name,e.target.value));filters.append(s);} root.append(filters);
  if(!state.items?.length){root.append(createStatePanel({kind:'empty',title:'Buyurtma topilmadi',message:'Filterlarni o‘zgartirib ko‘ring.'},doc));return root;}
  const layout=node(doc,'div','uw-admin-orders-layout'); const wrap=node(doc,'div','uw-admin-orders-table-wrap');const table=node(doc,'table','uw-admin-orders-table');const thead=doc.createElement('thead');const trh=doc.createElement('tr');for(const h of ['ID','Mijoz','Holat','Manba','To‘lov','Jami','Sana'])trh.append(node(doc,'th','',h));thead.append(trh);table.append(thead);const tbody=doc.createElement('tbody');
  for(const o of state.items){const tr=doc.createElement('tr');tr.dataset.active=state.selectedId===o.id?'true':'false';for(const v of [`#${o.id}`,o.user,STATUS_LABELS[o.status]||o.status,o.source,o.paymentStatus,money(o.payableTotal),dateLabel(o.createdAt)])tr.append(node(doc,'td','',v));tr.addEventListener('click',()=>controller.open(o.id));tbody.append(tr);}table.append(tbody);wrap.append(table);
  const cards=node(doc,'div','uw-admin-orders-cards');for(const o of state.items){const b=doc.createElement('button');b.type='button';b.className='uw-admin-order-card';b.append(node(doc,'strong','',`#${o.id} · ${o.user}`),node(doc,'span','',`${STATUS_LABELS[o.status]||o.status} · ${o.source}`),node(doc,'small','',`${money(o.payableTotal)} · ${dateLabel(o.createdAt)}`));b.addEventListener('click',()=>controller.open(o.id));cards.append(b);}const left=node(doc,'div','uw-admin-orders-master');left.append(wrap,cards);layout.append(left);
  const detail=node(doc,'aside','uw-admin-order-detail'); if(!state.selected)detail.append(createStatePanel({kind:'empty',title:'Buyurtmani tanlang',message:'Tafsilotlar shu yerda ochiladi.'},doc));else{const o=state.selected;detail.append(node(doc,'h3','',`Buyurtma #${o.id}`),node(doc,'p','',`${o.user}${o.phone?` · ${o.phone}`:''}`),node(doc,'p','',`${o.region||''} ${o.district||''} ${o.address||''}`.trim()),node(doc,'p','',`Manba: ${o.source} · To‘lov: ${o.paymentStatus}`),node(doc,'strong','',money(o.payableTotal)));if(o.internalNote)detail.append(node(doc,'p','uw-admin-order-note',`Ichki izoh: ${o.internalNote}`));const acts=node(doc,'div','uw-admin-order-actions');const avail=adminOrderActionAvailability({permissions:state.capabilities?.canManage?['orders.manage']:[]},o);for(const s of avail.nextStatuses){acts.append(createButton({label:STATUS_LABELS[s]||s,variant:s==='CANCELLED'?'danger':'primary',busy:state.busyAction===`status:${o.id}`,onClick:()=>controller.updateStatus(o.id,s)},doc));}detail.append(acts);}layout.append(detail);root.append(layout);return root;
}
