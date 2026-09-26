import { createButton, createCard, createSelectField, createStatePanel, createTextField } from '../../components/ui.js';
import { fail, ok } from '../../services/ports/result.js';

export const REPORT_TABS = Object.freeze(['overview','sales','customers','products']);
export const REPORT_PERIODS = Object.freeze(['today','week','month','30d','90d','year','all','custom']);
const ACTION_BY_TAB = Object.freeze({ overview:'get_report_overview', sales:'get_sales_report', customers:'get_customer_report', products:'get_product_report' });
const LABEL_BY_TAB = Object.freeze({ overview:'Umumiy', sales:'Savdo', customers:'Mijozlar', products:'Mahsulotlar' });

function clone(value) { return value == null ? value : structuredClone(value); }
function text(value) { return String(value ?? '').trim(); }
function number(value) { const n=Number(value); return Number.isFinite(n) ? n : 0; }
function can(actor, permission) {
  if (!actor) return false;
  if (actor.shopRole === 'OWNER') return true;
  const list = Array.isArray(actor.permissions) ? actor.permissions : [];
  return list.includes('*') || list.includes(permission);
}
function money(value) { return `${Math.round(number(value)).toLocaleString('uz-UZ')} so‘m`; }
function dateLabel(value) { if (!value) return '—'; try { return new Intl.DateTimeFormat('uz-UZ',{dateStyle:'medium'}).format(new Date(value)); } catch { return String(value); } }
function rangePayload(state) {
  const out = { period: state.period === 'custom' ? '30d' : state.period };
  if (state.period === 'custom') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(state.dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(state.dateTo)) return fail('VALIDATION_ERROR','Ixtiyoriy davr uchun boshlanish va tugash sanasini kiriting.');
    if (state.dateFrom > state.dateTo) return fail('VALIDATION_ERROR','Boshlanish sanasi tugash sanasidan keyin bo‘lishi mumkin emas.');
    out.dateFrom = state.dateFrom; out.dateTo = state.dateTo;
  }
  return ok(out);
}
function reportPayload(state, tab) {
  const range = rangePayload(state); if (!range.ok) return range;
  const payload = { ...range.data };
  if (tab === 'customers') Object.assign(payload, state.filters.customers);
  if (tab === 'products') Object.assign(payload, state.filters.products);
  return ok(payload);
}
function base64FromArrayBuffer(buffer) {
  const bytes = new Uint8Array(buffer); let binary='';
  for (let i=0;i<bytes.length;i+=0x8000) binary += String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return globalThis.btoa ? globalThis.btoa(binary) : null;
}
function buildPdf(data, tab, windowRef=globalThis.window) {
  const JsPdf = windowRef?.jspdf?.jsPDF;
  if (!JsPdf) return fail('CAPABILITY_UNAVAILABLE','PDF kutubxonasi yuklanmagan.');
  const doc = new JsPdf({ unit:'mm', format:'a4' });
  let y=16;
  const line=(label,value)=>{ doc.setFontSize?.(10); doc.text?.(`${label}: ${value}`,14,y); y+=6; if(y>280){doc.addPage?.();y=16;} };
  doc.setFontSize?.(16); doc.text?.(`UStorE — ${LABEL_BY_TAB[tab]} hisobot`,14,y); y+=9;
  line('Davr', `${dateLabel(data?.dateFrom)} — ${dateLabel(data?.dateTo)}`);
  if (tab === 'overview') {
    line('Tasdiqlangan tushum', money(data?.totalSales)); line('Buyurtmalar', data?.orderCount ?? 0); line('O‘rtacha buyurtma', money(data?.avgOrderValue)); line('Sotilgan birlik', data?.totalUnitsSold ?? 0);
    for (const row of (data?.topProducts || []).slice(0,12)) line(row.name || 'Mahsulot', money(row.revenue));
  } else if (tab === 'sales') {
    line('Tasdiqlangan tushum', money(data?.totalSales)); line('Jami buyurtmalar', data?.totalOrders ?? 0); line('Sotuv buyurtmalari', data?.soldOrderCount ?? 0); line('O‘rtacha buyurtma', money(data?.avgOrderValue));
    for (const row of (data?.byProduct || []).slice(0,15)) line(row.name || 'Mahsulot', `${row.unitsSold ?? 0} dona · ${money(row.revenue)}`);
  } else if (tab === 'customers') {
    const k=data?.kpi || {}; line('Jami mijozlar',k.totalCustomers ?? 0); line('Yangi mijozlar',k.newCustomers ?? 0); line('Qayta xarid qilganlar',k.repeatCustomers ?? 0); line('O‘rtacha xarid',money(k.avgCustomerSpend));
    for (const row of (data?.customers || []).slice(0,30)) line(row.name || row.tgId || 'Mijoz', `${row.totalOrders ?? 0} buyurtma · ${money(row.totalSpent)}${data?.piiVisible && row.phone ? ` · ${row.phone}` : ''}`);
  } else {
    line('Jami tushum',money(data?.totalSales)); line('Natijalar',data?.totalCount ?? 0);
    for (const row of (data?.products || []).slice(0,30)) line(row.name || row.productId || 'Mahsulot', `${row.unitsSold ?? 0} dona · ${money(row.revenue)}`);
  }
  return ok(doc);
}

export function createAdminReportsController({ adminPort, actor, telegramWebApp, windowRef=globalThis.window } = {}) {
  if (!adminPort?.invoke) throw new TypeError('adminPort.invoke kerak.');
  const listeners=new Set();
  const allowed=can(actor,'reports.view');
  let state={ allowed, status:'idle', error:null, activeTab:'overview', period:'30d', dateFrom:'', dateTo:'', data:{overview:null,sales:null,customers:null,products:null}, filters:{ customers:{search:'',segment:'ALL',page:1,pageSize:20}, products:{view:'TOP_REVENUE',page:1,pageSize:20} }, exporting:false, exportError:null };
  const snapshot=()=>clone(state); const emit=()=>listeners.forEach(fn=>fn(snapshot())); const patch=(p)=>{state={...state,...p};emit();return snapshot();};
  async function load(tab=state.activeTab) {
    if (!allowed) return patch({status:'permission',error:fail('FORBIDDEN','Hisobotlarni ko‘rish huquqi yo‘q.').error});
    if (!REPORT_TABS.includes(tab)) return patch({status:'error',error:fail('VALIDATION_ERROR','Noma’lum hisobot turi.').error});
    const payload=reportPayload(state,tab); if(!payload.ok) return patch({status:'error',error:payload.error});
    patch({status:'loading',error:null,activeTab:tab});
    const result=await adminPort.invoke(ACTION_BY_TAB[tab],payload.data);
    if(!result?.ok) return patch({status:'error',error:result?.error || fail('NETWORK_ERROR','Hisobot yuklanmadi.').error});
    return patch({status:'ready',error:null,data:{...state.data,[tab]:clone(result.data)}});
  }
  async function setTab(tab,{loadNow=true}={}) { if(!REPORT_TABS.includes(tab)) return snapshot(); patch({activeTab:tab,error:null}); return loadNow?load(tab):snapshot(); }
  async function setPeriod(period,{loadNow=true}={}) { if(!REPORT_PERIODS.includes(period)) return snapshot(); patch({period,error:null}); return loadNow && period!=='custom'?load():snapshot(); }
  function setCustomRange(dateFrom,dateTo){ return patch({period:'custom',dateFrom:text(dateFrom),dateTo:text(dateTo),error:null}); }
  function setCustomerFilters(values={}) { return patch({filters:{...state.filters,customers:{...state.filters.customers,...clone(values),page:values.search!==undefined||values.segment!==undefined?1:(values.page??state.filters.customers.page)}}}); }
  function setProductFilters(values={}) { return patch({filters:{...state.filters,products:{...state.filters.products,...clone(values),page:values.view!==undefined?1:(values.page??state.filters.products.page)}}}); }
  async function exportPdf() {
    const tab=state.activeTab, data=state.data[tab];
    if(!data) return patch({exportError:fail('VALIDATION_ERROR','Avval hisobotni yuklang.').error});
    patch({exporting:true,exportError:null});
    try {
      const built=buildPdf(data,tab,windowRef); if(!built.ok) return patch({exporting:false,exportError:built.error});
      const doc=built.data; const fileName=`ustore-${tab}-${String(data.dateFrom||'report').slice(0,10)}.pdf`.replace(/[^a-z0-9_.-]+/gi,'-');
      if(telegramWebApp?.openLink && typeof doc.output==='function') {
        const buffer=doc.output('arraybuffer'); const base64=base64FromArrayBuffer(buffer);
        if(base64){ const uploaded=await adminPort.invoke('upload_report_pdf',{fileName,pdfUpload:{mimeType:'application/pdf',base64}}); if(uploaded?.ok && uploaded.data?.url){ telegramWebApp.openLink(uploaded.data.url); return patch({exporting:false,exportError:null}); } }
      }
      if(typeof doc.save==='function') doc.save(fileName); else return patch({exporting:false,exportError:fail('CAPABILITY_UNAVAILABLE','PDF yuklab olish funksiyasi mavjud emas.').error});
      return patch({exporting:false,exportError:null});
    } catch (_) { return patch({exporting:false,exportError:fail('NETWORK_ERROR','PDF eksport bajarilmadi.').error}); }
  }
  return Object.freeze({ getState:snapshot, subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}, load, setTab, setPeriod, setCustomRange, setCustomerFilters, setProductFilters, exportPdf, exportExcel(){return fail('CAPABILITY_UNAVAILABLE','Hisobotlar uchun Excel/XLSX eksport backendda mavjud emas.');} });
}

function metric(doc,label,value){const n=doc.createElement('div');n.className='uw-report-metric';const a=doc.createElement('span');a.textContent=label;const b=doc.createElement('strong');b.textContent=String(value);n.append(a,b);return n;}
function simpleTable(doc, columns, rows){const wrap=doc.createElement('div');wrap.className='uw-table-wrap';const table=doc.createElement('table');table.className='uw-data-table';const thead=doc.createElement('thead'),tr=doc.createElement('tr');for(const c of columns){const th=doc.createElement('th');th.textContent=c.label;tr.append(th);}thead.append(tr);const tbody=doc.createElement('tbody');for(const row of rows){const r=doc.createElement('tr');for(const c of columns){const td=doc.createElement('td');const v=typeof c.value==='function'?c.value(row):row[c.value];td.textContent=String(v ?? '—');r.append(td);}tbody.append(r);}table.append(thead,tbody);wrap.append(table);return wrap;}
function renderData(doc,state){const data=state.data[state.activeTab];if(!data)return createStatePanel({kind:'empty',title:'Hisobot hali yuklanmagan',message:'Davrni tanlang va hisobotni yuklang.'},doc);const root=doc.createElement('div');root.className='uw-report-content';const metrics=doc.createElement('div');metrics.className='uw-report-metrics';if(state.activeTab==='overview'){metrics.append(metric(doc,'Tushum',money(data.totalSales)),metric(doc,'Buyurtmalar',data.orderCount??0),metric(doc,'O‘rtacha buyurtma',money(data.avgOrderValue)),metric(doc,'Sotilgan birlik',data.totalUnitsSold??0));root.append(metrics,simpleTable(doc,[{label:'Mahsulot',value:'name'},{label:'Tushum',value:r=>money(r.revenue)}],data.topProducts||[]));}else if(state.activeTab==='sales'){metrics.append(metric(doc,'Tushum',money(data.totalSales)),metric(doc,'Buyurtmalar',data.totalOrders??0),metric(doc,'Sotuv buyurtmalari',data.soldOrderCount??0),metric(doc,'O‘rtacha',money(data.avgOrderValue)));root.append(metrics,simpleTable(doc,[{label:'Mahsulot',value:'name'},{label:'Dona',value:'unitsSold'},{label:'Tushum',value:r=>money(r.revenue)}],data.byProduct||[]));}else if(state.activeTab==='customers'){const k=data.kpi||{};metrics.append(metric(doc,'Mijozlar',k.totalCustomers??0),metric(doc,'Yangi',k.newCustomers??0),metric(doc,'Takroriy',k.repeatCustomers??0),metric(doc,'O‘rtacha xarid',money(k.avgCustomerSpend)));const cols=[{label:'Mijoz',value:'name'},{label:'Buyurtma',value:'totalOrders'},{label:'Xarid',value:r=>money(r.totalSpent)}];if(data.piiVisible)cols.push({label:'Telefon',value:'phone'});root.append(metrics,simpleTable(doc,cols,data.customers||[]));}else{metrics.append(metric(doc,'Tushum',money(data.totalSales)),metric(doc,'Natijalar',data.totalCount??0));root.append(metrics,simpleTable(doc,[{label:'Mahsulot',value:'name'},{label:'Dona',value:'unitsSold'},{label:'Qoldiq',value:'currentStock'},{label:'Tushum',value:r=>money(r.revenue)}],data.products||[]));}return root;}

export function renderAdminReports({ controller, documentRef=globalThis.document }={}) {
  if(!controller?.getState) throw new TypeError('controller kerak.'); const doc=documentRef; const root=doc.createElement('section');root.className='uw-feature uw-admin-reports';
  const render=()=>{const state=controller.getState();root.replaceChildren();if(!state.allowed){root.append(createStatePanel({kind:'permission',title:'Hisobotlarga ruxsat yo‘q',message:'reports.view huquqi kerak.'},doc));return;}
    const toolbar=doc.createElement('div');toolbar.className='uw-feature-toolbar';const tabs=doc.createElement('div');tabs.className='uw-tab-row';for(const tab of REPORT_TABS)tabs.append(createButton({label:LABEL_BY_TAB[tab],variant:state.activeTab===tab?'primary':'ghost',size:'sm',onClick:()=>controller.setTab(tab)},doc));
    const periods=createSelectField({label:'Davr',value:state.period,options:[['today','Bugun'],['week','7 kun'],['month','Oy'],['30d','30 kun'],['90d','90 kun'],['year','Yil'],['all','Barchasi'],['custom','Ixtiyoriy']].map(([value,label])=>({value,label}))},doc);periods.select.addEventListener('change',()=>controller.setPeriod(periods.select.value));toolbar.append(tabs,periods.element);
    if(state.period==='custom'){const row=doc.createElement('div');row.className='uw-inline-fields';const f=createTextField({label:'Boshlanish',type:'date',value:state.dateFrom},doc),t=createTextField({label:'Tugash',type:'date',value:state.dateTo},doc);const apply=()=>controller.setCustomRange(f.input.value,t.input.value);f.input.addEventListener('change',apply);t.input.addEventListener('change',apply);row.append(f.element,t.element,createButton({label:'Qo‘llash',variant:'secondary',onClick:()=>controller.load()},doc));root.append(toolbar,row);}else root.append(toolbar);
    if(state.activeTab==='customers'){const row=doc.createElement('div');row.className='uw-inline-fields';const q=createTextField({label:'Qidiruv',value:state.filters.customers.search},doc);q.input.addEventListener('change',()=>{controller.setCustomerFilters({search:q.input.value});controller.load();});const s=createSelectField({label:'Segment',value:state.filters.customers.segment,options:['ALL','TOP_ORDERS','TOP_SPEND','REPEAT','NEW','NEVER_ORDERED','DORMANT','HIGH_CANCEL'].map(v=>({value:v,label:v}))},doc);s.select.addEventListener('change',()=>{controller.setCustomerFilters({segment:s.select.value});controller.load();});row.append(q.element,s.element);root.append(row);}
    if(state.activeTab==='products'){const row=doc.createElement('div');row.className='uw-inline-fields';const s=createSelectField({label:'Ko‘rinish',value:state.filters.products.view,options:['TOP_REVENUE','TOP_SOLD','LEAST_SOLD','NEVER_SOLD','LOW_STOCK','OUT_OF_STOCK','TRENDING_UP','TRENDING_DOWN'].map(v=>({value:v,label:v}))},doc);s.select.addEventListener('change',()=>{controller.setProductFilters({view:s.select.value});controller.load();});row.append(s.element);root.append(row);}
    const actions=doc.createElement('div');actions.className='uw-feature-actions';actions.append(createButton({label:'Yangilash',variant:'secondary',busy:state.status==='loading',onClick:()=>controller.load()},doc),createButton({label:'PDF',variant:'secondary',busy:state.exporting,onClick:()=>controller.exportPdf()},doc),createButton({label:'Excel',variant:'ghost',disabled:true,ariaLabel:'Excel eksport backendda mavjud emas'},doc));root.append(actions);
    if(state.status==='loading'){root.append(createStatePanel({kind:'loading',title:'Hisobot yuklanmoqda…',message:'Serverdagi tasdiqlangan raqamlar olinmoqda.'},doc));return;}if(state.status==='error'){root.append(createStatePanel({kind:'error',title:'Hisobot yuklanmadi',message:state.error?.message||'Xato',actionLabel:'Qayta urinish',onAction:()=>controller.load()},doc));return;}root.append(renderData(doc,state));if(state.exportError)root.append(createStatePanel({kind:'error',title:'Eksport bajarilmadi',message:state.exportError.message},doc));};
  render(); const unsubscribe=controller.subscribe(render); return {element:root,destroy:unsubscribe};
}
