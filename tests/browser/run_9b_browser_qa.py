#!/usr/bin/env python3
import base64, json, pathlib, re
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'artifacts' / 'browser-qa'
OUT.mkdir(parents=True, exist_ok=True)

ENTRY_DEPS = [
 'web/shells/index.js','web/components/ui.js','web/features/home/index.js',
 'web/features/admin-reports/index.js','web/features/admin-team/index.js',
 'web/features/admin-inventory/index.js','web/navigation/router.js'
]

IMPORT_RE = re.compile(r"(?P<prefix>\bfrom\s*|\bimport\s*)(?P<q>['\"])(?P<spec>[^'\"]+)(?P=q)")
DYN_RE = re.compile(r"(?P<prefix>\bimport\(\s*)(?P<q>['\"])(?P<spec>[^'\"]+)(?P=q)(?P<suffix>\s*\))")

def resolve_spec(base, spec):
    if spec.startswith('/web/'):
        p = ROOT / spec.lstrip('/')
    elif spec.startswith('.'):
        p = (base.parent / spec).resolve()
    else:
        return None
    if p.is_dir(): p = p / 'index.js'
    if not p.suffix: p = pathlib.Path(str(p)+'.js')
    return p

def build_graph(entry_files):
    sources, deps = {}, {}
    def visit(p):
        p=p.resolve(); key=str(p.relative_to(ROOT)).replace('\\','/')
        if key in sources: return key
        src=p.read_text(encoding='utf-8'); sources[key]=src; deps[key]={}
        specs=[]
        for rx in (IMPORT_RE,DYN_RE):
            for m in rx.finditer(src):
                spec=m.group('spec'); rp=resolve_spec(p,spec)
                if rp and rp.exists(): specs.append((spec,rp))
        for spec,rp in specs:
            depkey=visit(rp); deps[key][spec]=depkey
        return key
    roots=[visit(ROOT/f) for f in entry_files]
    order=[]; seen=set(); temp=set()
    def dfs(k):
        if k in seen:return
        if k in temp: raise RuntimeError(f'cycle:{k}')
        temp.add(k)
        for dk in deps[k].values():dfs(dk)
        temp.remove(k); seen.add(k); order.append(k)
    for r in roots:dfs(r)
    modules=[]
    for idx,k in enumerate(order):
        src=sources[k]; mapping={}
        for j,(spec,dk) in enumerate(deps[k].items()):
            tok=f'__USTORE_DEP_{idx}_{j}__'; mapping[tok]=dk
            src=src.replace(f"'{spec}'",f"'{tok}'").replace(f'"{spec}"',f'"{tok}"')
        modules.append({'key':k,'source':src,'deps':mapping})
    return modules, roots

MODULES, ROOT_KEYS = build_graph(ENTRY_DEPS)

HARNESS = r'''
import { createCustomerShell, createAdminShell } from '__SHELLS__';
import { createStatePanel } from '__UI__';
import { buildHomeModel, createHomeView } from '__HOME__';
import { createAdminReportsController, renderAdminReports } from '__REPORTS__';
import { createAdminTeamController, renderAdminTeam } from '__TEAM__';
import { createAdminInventoryController, createAdminInventoryView } from '__INVENTORY__';
import { createRouteMatcher } from '__ROUTER__';

const CASE=globalThis.__QA_CASE__;
const actors={
 customer:{accountId:'acct-c',displayName:'Demo Customer',shopRole:'CUSTOMER',roleCodes:['CUSTOMER'],permissions:[]},
 owner:{accountId:'acct-o',displayName:'Demo Owner',shopRole:'OWNER',roleCodes:['OWNER'],permissions:['*']},
 manager:{accountId:'acct-m',displayName:'Demo Manager',shopRole:'STAFF',roleCodes:['MANAGER'],permissions:['products.manage','stock.view','stock.manage','orders.view','orders.manage','support.manage','reports.view','marketing.manage','domains.manage']},
 staff:{accountId:'acct-s',displayName:'Demo Omborchi',shopRole:'STAFF',roleCodes:['WAREHOUSE'],permissions:['stock.view','stock.manage']}
};
const actor=actors[CASE.role]; const context={mode:'web',shop:{id:'shop-demo',slug:'fitcore-demo',name:'Fitcore Demo',currency:'UZS',lifecycle:'ACTIVE'},actor,capabilities:{admin:CASE.role!=='customer'}};
const adminPort={async invoke(action,payload={}){
 const ok=(data)=>({ok:true,data});
 if(action==='get_report_overview')return ok({dateFrom:'2026-08-24',dateTo:'2026-09-23',totalSales:18450000,orderCount:126,avgOrderValue:146429,totalUnitsSold:244,topProducts:[{name:'Whey Protein 2kg',revenue:6200000},{name:'Creatine 300g',revenue:4100000},{name:'Sport shaker',revenue:1850000}]});
 if(action==='list_admin_audit_log')return ok({entries:[{createdAt:'2026-09-23 08:42',adminName:'Demo Manager',action:'ORDER_STATUS_UPDATED',entityType:'ORDER',entityId:'#1042'},{createdAt:'2026-09-23 08:05',adminName:'Demo Owner',action:'PRODUCT_UPDATED',entityType:'PRODUCT',entityId:'PR-221'},{createdAt:'2026-09-22 19:30',adminName:'Demo Owner',action:'SETTINGS_UPDATED',entityType:'SHOP',entityId:'fitcore-demo'}],page:1,pageSize:30,totalCount:3,totalPages:1});
 if(action==='role_list')return ok({roles:[{id:'manager',name:'Manager',isSystem:true,usedCount:1,permissions:['reports.view','orders.manage']},{id:'warehouse',name:'Omborchi',isSystem:false,usedCount:1,permissions:['stock.view','stock.manage']}],permissions:['reports.view','stock.view','stock.manage','orders.manage']});
 if(action==='staff_list')return ok({staff:[{tgId:'1001',name:'Demo Owner',status:'ACTIVE',role:'OWNER',roles:[{id:'owner',name:'Owner',isPrimary:true}]},{tgId:'1002',name:'Demo Omborchi',status:'ACTIVE',role:'STAFF',roles:[{id:'warehouse',name:'Omborchi',isPrimary:true}]}],pendingInvites:[]});
 if(action==='get_inventory_rows')return ok({lowStockThreshold:5,rows:[{key:'p1:S',productId:'p1',productName:'Whey Protein 2kg',productSku:'PR001',variantSku:'PR001-S',color:'Vanil',size:'2kg',stock:14},{key:'p2:C',productId:'p2',productName:'Creatine 300g',productSku:'CR010',variantSku:'CR010-C',color:'Classic',size:'300g',stock:3},{key:'p3:X',productId:'p3',productName:'Sport shaker',productSku:'SH020',variantSku:null,color:'Qora',size:null,stock:0}]});
 if(action==='get_stock_movements')return ok({movements:[{operationType:'STOCK_IN',productName:'Creatine 300g',variantSku:'CR010-C',priorStock:1,newStock:3,delta:2},{operationType:'SET',productName:'Whey Protein 2kg',variantSku:'PR001-S',priorStock:12,newStock:14,delta:2}]});
 return ok({});
}};
function mount(content,title,activeNav,admin=true){
 const shell=admin?createAdminShell({context,activeNav,pageTitle:title,content}):createCustomerShell({context,activeNav,content});
 document.getElementById('root').replaceChildren(shell.element); globalThis.__QA_SHELL__=shell;
}
if(CASE.page==='home'){
 const products=[{id:'p1',name:'Whey Protein 2kg',price:749000,is_visible:true,is_featured:true,category_id:'c1',created_at:'2026-09-20'},{id:'p2',name:'Creatine 300g',price:289000,is_visible:true,is_featured:true,category_id:'c1',created_at:'2026-09-19'},{id:'p3',name:'Sport shaker',price:89000,is_visible:true,is_featured:true,category_id:'c2',created_at:'2026-09-18'},{id:'p4',name:'Yoga gilamcha',price:179000,is_visible:true,is_featured:true,category_id:'c2',created_at:'2026-09-17'}];
 const model=buildHomeModel({categories:[{id:'c1',name:'Sport ozuqalari',parent_id:null},{id:'c2',name:'Sport buyumlari',parent_id:null}],products,featuredCategories:[{categoryId:'c1'},{categoryId:'c2'}]});
 const v=createHomeView({model});mount(v.element,'Bosh sahifa','home',false);
}else if(CASE.page==='reports'){
 const c=createAdminReportsController({adminPort,actor});const v=renderAdminReports({controller:c});mount(v.element,'Hisobotlar','reports');await c.load();
}else if(CASE.page==='team'){
 const c=createAdminTeamController({adminPort,actor});const v=renderAdminTeam({controller:c});mount(v.element,'Jamoa','team');await c.load();
}else if(CASE.page==='inventory'){
 const c=createAdminInventoryController({adminPort,actor});await c.load();const v=createAdminInventoryView({controller:c,state:c.getState()});mount(v,'Ombor','inventory');
}else if(CASE.page==='reports-denied'){
 const c=createAdminReportsController({adminPort,actor});const v=renderAdminReports({controller:c});mount(v.element,'Hisobotlar','reports');await c.load();
}
const matcher=createRouteMatcher();globalThis.__QA_ROUTE_PROBES__=['/','/catalog','/admin/reports','/admin/team','/admin/inventory','/missing'].map(x=>({x,id:matcher(x).route?.id||null,found:matcher(x).found}));
globalThis.__QA_READY__=true;
'''

KEYS=dict(zip(ENTRY_DEPS,ROOT_KEYS))
HARNESS=(HARNESS.replace('__SHELLS__',KEYS['web/shells/index.js']).replace('__UI__',KEYS['web/components/ui.js']).replace('__HOME__',KEYS['web/features/home/index.js']).replace('__REPORTS__',KEYS['web/features/admin-reports/index.js']).replace('__TEAM__',KEYS['web/features/admin-team/index.js']).replace('__INVENTORY__',KEYS['web/features/admin-inventory/index.js']).replace('__ROUTER__',KEYS['web/navigation/router.js']))
# Harness imports use module keys as placeholder specs. Add it last.
hdeps={}
for i,key in enumerate(ROOT_KEYS):
    tok=f'__HARNESS_DEP_{i}__'; HARNESS=HARNESS.replace(f"'{key}'",f"'{tok}'"); hdeps[tok]=key
MODULES.append({'key':'__harness__','source':HARNESS,'deps':hdeps})

CSS='\n'.join((ROOT/f'web/styles/{n}').read_text(encoding='utf-8') for n in ['tokens.css','base.css','components.css','shells.css','features.css'])
HTML=f"<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><style>{CSS}</style><style>html,body{{margin:0;min-height:100%;background:var(--uw-color-bg,#f5f7fb)}}#root{{min-height:100vh}}</style></head><body><div id='root'></div></body></html>"

BLOB_LOADER="""async ({modules,entry})=>{const urls={};for(const m of modules){let src=m.source;for(const [tok,dep] of Object.entries(m.deps)){src=src.split(tok).join(urls[dep]);}urls[m.key]=URL.createObjectURL(new Blob([src],{type:'text/javascript'}));}await import(urls[entry]);return true;}"""

def render_case(browser, role, page_name, viewport, shot, open_drawer=False):
    ctx=browser.new_context(viewport=viewport, device_scale_factor=1)
    p=ctx.new_page(); errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
    p.set_content(HTML,wait_until='load');p.evaluate("c=>globalThis.__QA_CASE__=c",{'role':role,'page':page_name});p.evaluate(BLOB_LOADER,{'modules':MODULES,'entry':'__harness__'});p.wait_for_function('globalThis.__QA_READY__===true')
    if open_drawer:
        p.locator('.uw-admin-menu-button').click();p.wait_for_timeout(300)
    overflow=p.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1')
    p.screenshot(path=str(OUT/f'{shot}.png'),full_page=True)
    nav=p.locator('.uw-admin-sidebar .uw-nav-item__label').all_text_contents() if p.locator('.uw-admin-sidebar').count() else []
    probes=p.evaluate('globalThis.__QA_ROUTE_PROBES__')
    permission=p.locator('.uw-state[data-kind="permission"]').count()
    drawer_box=p.locator('.uw-admin-drawer').bounding_box() if p.locator('.uw-admin-drawer').count() else None
    brand_box=p.locator('.uw-admin-drawer .uw-brand').bounding_box() if p.locator('.uw-admin-drawer .uw-brand').count() else None
    scroll_x=p.evaluate('window.scrollX')
    ctx.close();return {'name':shot,'role':role,'page':page_name,'viewport':viewport,'overflow':overflow,'pageErrors':errors,'nav':nav,'permissionPanels':permission,'routeProbes':probes,'drawerBox':drawer_box,'brandBox':brand_box,'scrollX':scroll_x}

def render_legacy_shell(browser, viewport):
    html=(ROOT/'index.html').read_text(encoding='utf-8')
    html=re.sub(r'<script\\b[^>]*>[\\s\\S]*?</script>', '', html, flags=re.I)
    html=re.sub(r'<link\\b[^>]*href=[\"\\\'][^\"\\\']*ustore\\.css[^\"\\\']*[\"\\\'][^>]*>', '', html, flags=re.I)
    css=(ROOT/'ustore.css').read_text(encoding='utf-8')
    html=html.replace('</head>',f'<style>{css}</style></head>')
    ctx=browser.new_context(viewport=viewport,device_scale_factor=1);p=ctx.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
    p.set_content(html,wait_until='load');p.wait_for_timeout(100)
    overflow=p.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1')
    app=p.locator('#app-content').count();nav=p.locator('.ustore-bottom-nav').count()
    p.screenshot(path=str(OUT/'legacy-miniapp-mobile.png'),full_page=True)
    ctx.close();return {'name':'legacy-miniapp-mobile','role':'legacy','page':'miniapp-shell','viewport':viewport,'overflow':overflow,'pageErrors':errors,'appContent':app,'bottomNav':nav}

def main():
  cases=[]
  with sync_playwright() as pw:
    b=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    desk={'width':1440,'height':1000};mob={'width':390,'height':844}
    matrix=[('customer','home',desk,'customer-desktop-home',False),('customer','home',mob,'customer-mobile-home',False),('owner','reports',desk,'owner-desktop-reports',False),('owner','reports',mob,'owner-mobile-reports',True),('manager','team',desk,'manager-desktop-team',False),('manager','team',mob,'manager-mobile-team',True),('staff','inventory',desk,'staff-desktop-inventory',False),('staff','inventory',mob,'staff-mobile-inventory',True)]
    for x in matrix:cases.append(render_case(b,*x))
    narrow={'width':320,'height':760}
    for role,page,name in [('customer','home','customer-320-home'),('owner','reports','owner-320-reports'),('manager','team','manager-320-team'),('staff','inventory','staff-320-inventory')]: cases.append(render_case(b,role,page,narrow,name,False))
    legacy=render_legacy_shell(b,mob);cases.append(legacy)
    denied=render_case(b,'staff','reports-denied',desk,'staff-denied-reports',False);cases.append(denied)
    b.close()
  failures=[]
  for c in cases:
    if not c['overflow']:failures.append('overflow:'+c['name'])
    if c['pageErrors']:failures.append('pageerror:'+c['name']+':'+repr(c['pageErrors']))
  owner=next(c for c in cases if c['name']=='owner-desktop-reports');manager=next(c for c in cases if c['name']=='manager-desktop-team');staff=next(c for c in cases if c['name']=='staff-desktop-inventory')
  if not all(x in owner['nav'] for x in ['Hisobotlar','Jamoa','Sozlamalar','Domenlar']):failures.append('owner-nav')
  if 'Hisobotlar' not in manager['nav'] or 'Jamoa' not in manager['nav'] or 'Sozlamalar' in manager['nav']:failures.append('manager-nav')
  if staff['nav']!=['Boshqaruv','Ombor']:failures.append('limited-staff-nav:'+repr(staff['nav']))
  if denied['permissionPanels']<1:failures.append('staff-report-permission')
  legacy=next(c for c in cases if c['name']=='legacy-miniapp-mobile')
  if legacy['appContent']!=1 or legacy['bottomNav']!=1 or not legacy['overflow'] or legacy['pageErrors']: failures.append('legacy-miniapp-browser-shell')
  expected={'/':'home','/catalog':'catalog','/admin/reports':'admin-reports','/admin/team':'admin-team','/admin/inventory':'admin-inventory','/missing':None}
  for r in owner['routeProbes']:
    if r['id']!=expected[r['x']]:failures.append('route:'+repr(r))
  report={'task':'ASTRA-9b','environment':'real headless Chromium via set_content; source modules executed as Blob ESM because browser navigation is blocked by environment policy','screenshots':cases,'failures':failures,'browserNavigationBlockedByEnvironment':True}
  (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  print(json.dumps({'screenshots':len(cases),'failures':failures},ensure_ascii=False))
  raise SystemExit(1 if failures else 0)
if __name__=='__main__':main()
