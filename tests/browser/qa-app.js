import { createLocalDemoProvider } from '/web/services/provider.js';
import { WEB_ROUTES } from '/web/navigation/routes.js';
import { createRouter } from '/web/navigation/router.js';
import { createNotFoundView } from '/web/navigation/not-found.js';
import { createCustomerShell, createAdminShell } from '/web/shells/index.js';
import { createStatePanel } from '/web/components/ui.js';
import { loadHomeModel, createHomeView } from '/web/features/home/index.js';
import { createCatalogView } from '/web/features/catalog/index.js';
import { createProfileController, createProfileView } from '/web/features/profile/index.js';
import { createAdminReportsController, renderAdminReports } from '/web/features/admin-reports/index.js';
import { createAdminTeamController, renderAdminTeam } from '/web/features/admin-team/index.js';
import { createAdminSettingsController, createAdminSettingsView } from '/web/features/admin-settings/index.js';
import { createAdminInventoryController, createAdminInventoryView } from '/web/features/admin-inventory/index.js';
import { createAdminMarketingController, createAdminMarketingView } from '/web/features/admin-marketing/index.js';

const root = document.getElementById('qa-root');
const params = new URLSearchParams(location.search);
const requestedRole = params.get('role');
if (requestedRole) sessionStorage.setItem('ustore-qa-role', requestedRole);
const role = sessionStorage.getItem('ustore-qa-role') || 'customer';
const roleMap = { customer:'customer', owner:'owner', manager:'manager', staff:'staffLimited', staffLimited:'staffLimited' };
const scenario = roleMap[role] || 'customer';
const provider = createLocalDemoProvider({
  contextScenario: scenario,
  authSession: 'customer',
  profile: { actor: role === 'owner' ? 'owner' : 'customer' },
  platform: { role: role === 'owner' ? 'owner' : 'customer' },
});
let context = null;
let router = null;
let cleanup = [];
let renderSeq = 0;

function clearCleanup(){ for(const fn of cleanup.splice(0)){ try{fn?.();}catch(_){}} }
function remember(fn){ if(typeof fn==='function') cleanup.push(fn); return fn; }
function elementOf(v){ return v?.element || v; }
function mount(v){ clearCleanup(); root.replaceChildren(elementOf(v)); if(typeof v?.destroy==='function') remember(v.destroy); }
function withQaQuery(target){
  const u = new URL(target, location.origin);
  u.searchParams.set('qa','1'); u.searchParams.set('role',role);
  return `${u.pathname}${u.search}${u.hash}`;
}
function go(target, replace=false){ const next=withQaQuery(target); replace?router.replace(next):router.navigate(next); }
function navHandler(item){ if(item?.href) go(item.href); else if(item?.id==='search') go('/catalog'); }
function shellFor(routeState, content, title=''){
  if(routeState.route?.admin){
    return createAdminShell({context,activeNav:routeState.route.navId,pageTitle:title||'Boshqaruv',content,onNavigate:navHandler,onOpenAccount:()=>go('/profile')});
  }
  return createCustomerShell({context,activeNav:routeState.route?.navId||'home',content,onNavigate:navHandler,onOpenCart:()=>go('/catalog'),onOpenAccount:()=>go('/profile'),onSearch:()=>go('/catalog')});
}
function reactive(controller, factory){
  const host=document.createElement('div'); let childDestroy=null;
  const render=()=>{try{childDestroy?.();}catch(_){} const v=factory(controller.getState());childDestroy=typeof v?.destroy==='function'?v.destroy:null;host.replaceChildren(elementOf(v));};
  render(); const unsub=controller.subscribe?.(render); return {element:host,destroy(){try{unsub?.();}catch(_){}try{childDestroy?.();}catch(_){}}};
}
function permissionView(title='Ruxsat yo‘q',message='Bu sahifa uchun yetarli huquq yo‘q.'){return createStatePanel({kind:'permission',title,message});}
function actorIsAdmin(actor){return !!actor && (actor.shopRole==='OWNER'||actor.shopRole==='STAFF'||(actor.roleCodes||[]).includes('MANAGER'));}

async function renderCustomer(routeState, seq){
  if(routeState.route.id==='home'){
    const result=await loadHomeModel({catalogPort:provider.catalog}); if(seq!==renderSeq)return;
    const view=result.ok?createHomeView({model:result.data,onOpenProduct:()=>go('/catalog'),onOpenCategory:()=>go('/catalog')}):createStatePanel({kind:'error',title:'Bosh sahifa ochilmadi',message:result.error?.message||'Xato'});
    mount(shellFor(routeState,elementOf(view),'Bosh sahifa')); return;
  }
  if(routeState.route.id==='catalog'||routeState.route.id==='search'){
    const [p,c]=await Promise.all([provider.catalog.listProducts({}),provider.catalog.listCategories({parentId:null})]); if(seq!==renderSeq)return;
    const view=createCatalogView({products:p.ok?p.data.items:[],categories:c.ok?c.data.items:[],query:{}});
    mount(shellFor(routeState,view.element||view,'Katalog')); return;
  }
  if(routeState.route.id==='profile'){
    const ctl=createProfileController({profilePort:provider.profile,initialAccountId:context.actor?.accountId}); const view=reactive(ctl,s=>createProfileView({controller:ctl,state:s,onOpenSessions:()=>{}}));
    mount(shellFor(routeState,view.element,'Profil')); remember(view.destroy); await ctl.load(); return;
  }
  mount(shellFor(routeState,createStatePanel({kind:'empty',title:'QA sahifa',message:'Bu browser matriksida shu customer route render qilinmaydi.'}),'QA');
}

async function renderAdmin(routeState){
  if(!actorIsAdmin(context.actor)){ mount(shellFor(routeState,permissionView(),'Ruxsat yo‘q')); return; }
  const id=routeState.route.id; let controller=null, view=null, title='Boshqaruv';
  if(id==='admin-reports'){ controller=createAdminReportsController({adminPort:provider.admin,actor:context.actor}); view=renderAdminReports({controller}); title='Hisobotlar'; }
  else if(id==='admin-team'){ controller=createAdminTeamController({adminPort:provider.admin,actor:context.actor}); view=renderAdminTeam({controller}); title='Jamoa'; }
  else if(id==='admin-settings'){ controller=createAdminSettingsController({adminPort:provider.admin,actor:context.actor}); view=reactive(controller,s=>createAdminSettingsView({controller,state:s,confirmAction:()=>true,openExternal:()=>{}})); title='Sozlamalar'; }
  else if(id==='admin-inventory'){ controller=createAdminInventoryController({adminPort:provider.admin,actor:context.actor}); view=reactive(controller,s=>createAdminInventoryView({controller,state:s})); title='Ombor'; }
  else if(id==='admin-marketing'){ controller=createAdminMarketingController({adminPort:provider.admin,actor:context.actor}); view=createAdminMarketingView({controller}); title='Marketing'; }
  else if(id==='admin-overview'){ view=createStatePanel({kind:'empty',title:'Boshqaruv paneli',message:'9b browser QA — role navigatsiyasi tekshirilmoqda.'}); }
  else { view=createNotFoundView({onHome:()=>go('/admin')}); title='404'; }
  mount(shellFor(routeState,elementOf(view),title)); if(typeof view?.destroy==='function') remember(view.destroy); if(typeof controller?.load==='function') await controller.load();
}

async function renderRoute(routeState){
  const seq=++renderSeq; window.__USTORE_QA__.lastRoute=routeState.route?.id||null; window.__USTORE_QA__.ready=false;
  try{
    if(!routeState.found){mount(createNotFoundView({onHome:()=>go('/')}));return;}
    if(routeState.route.admin) await renderAdmin(routeState); else await renderCustomer(routeState,seq);
  }catch(error){mount(createStatePanel({kind:'error',title:'QA render xatosi',message:error?.stack||error?.message||String(error)}));window.__USTORE_QA__.error=String(error?.stack||error);}
  finally{ requestAnimationFrame(()=>{window.__USTORE_QA__.ready=true; document.body.dataset.qaReady='true';}); }
}

window.__USTORE_QA__={role,scenario,ready:false,lastRoute:null,error:null,provider};
const contextResult=await provider.context.resolve();
if(!contextResult.ok){mount(createStatePanel({kind:'error',title:'Context xatosi',message:contextResult.error?.message||'Context yo‘q'}));throw new Error('QA context failed');}
context=contextResult.data; window.__USTORE_QA__.context=context;
router=createRouter({routes:WEB_ROUTES,onChange:renderRoute,windowRef:window}); window.__USTORE_QA__.router=router;
router.start();
