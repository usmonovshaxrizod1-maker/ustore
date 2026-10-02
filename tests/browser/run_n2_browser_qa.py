#!/usr/bin/env python3
import json, pathlib, re
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'artifacts' / 'browser-qa-n2'
OUT.mkdir(parents=True, exist_ok=True)
ENTRY = 'web/features/platform-portal/index.js'
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
    if not p.suffix: p = pathlib.Path(str(p) + '.js')
    return p

def build_graph(entry):
    sources, deps = {}, {}
    def visit(p):
        p = p.resolve(); key = str(p.relative_to(ROOT)).replace('\\','/')
        if key in sources: return key
        src = p.read_text(encoding='utf-8'); sources[key] = src; deps[key] = {}
        for rx in (IMPORT_RE, DYN_RE):
            for m in rx.finditer(src):
                spec = m.group('spec'); rp = resolve_spec(p, spec)
                if rp and rp.exists(): deps[key][spec] = visit(rp)
        return key
    root = visit(ROOT / entry)
    order=[]; seen=set(); temp=set()
    def dfs(k):
        if k in seen: return
        if k in temp: raise RuntimeError('cycle:' + k)
        temp.add(k)
        for dk in deps[k].values(): dfs(dk)
        temp.remove(k); seen.add(k); order.append(k)
    dfs(root)
    modules=[]
    for i,k in enumerate(order):
        src=sources[k]; mapping={}
        for j,(spec,dk) in enumerate(deps[k].items()):
            tok=f'__DEP_{i}_{j}__'; mapping[tok]=dk
            src=src.replace(f"'{spec}'",f"'{tok}'").replace(f'"{spec}"',f'"{tok}"')
        modules.append({'key':k,'source':src,'deps':mapping})
    return modules, root

MODULES, ROOT_KEY = build_graph(ENTRY)
CSS='\n'.join((ROOT/f'web/styles/{n}').read_text(encoding='utf-8') for n in ['tokens.css','base.css','components.css','shells.css','features.css'])
HTML=f"<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><style>{CSS}</style><style>html,body{{margin:0;min-height:100%;background:var(--uw-color-bg,#f5f7fb)}}#root{{min-height:100vh}}</style></head><body><div id='root'></div></body></html>"
LOADER="""async ({modules,entry})=>{const urls={};for(const m of modules){let src=m.source;for(const [tok,dep] of Object.entries(m.deps)){src=src.split(tok).join(urls[dep]);}urls[m.key]=URL.createObjectURL(new Blob([src],{type:'text/javascript'}));}const mod=await import(urls[entry]);globalThis.__N2_MOD__=mod;return true;}"""
BOOT={
 'isSuperAdmin':False,
 'platformActor':{'accountId':'acct-1','displayName':'Shaxrizod Demo','telegramLinked':True,'platformRole':'USER'},
 'myShops':[{'id':'s1','publicCode':'FIT01','status':'ACTIVE','shopName':'Fitcore Demo','botUsername':'fitcore_demo_bot','tariffId':'t2','tariffName':'Biznes','productLimit':500,'usedProductCount':126,'usedOrderCount':842,'ordersToday':17,'subscriptionExpiresAt':'2026-10-23T00:00:00Z'}],
 'myRequests':[{'id':'r1','kind':'UPGRADE','shopId':'s1','tariffId':'t3','tariffName':'Pro','tariffPrice':399000,'durationDays':30,'upgradeAction':'CHANGE','paymentMethod':'CARD','status':'APPROVED','createdAt':'2026-09-22T09:00:00Z'}],
 'tariffs':[{'id':'t1','name':'Start','price':99000,'productLimit':100,'features':['Katalog','Buyurtmalar']},{'id':'t2','name':'Biznes','price':199000,'productLimit':500,'isPopular':True,'features':['Katalog','Hisobotlar','Marketing']},{'id':'t3','name':'Pro','price':399000,'productLimit':2000,'features':['Kengaytirilgan imkoniyatlar']}],
 'lifecycleSettings':{}
}

HARNESS="""
const {createPlatformPortalController,createPlatformPortalView}=globalThis.__N2_MOD__;
const BOOT=globalThis.__N2_BOOT__;
const port={async invoke(action,payload={}){
 const ok=(data)=>({ok:true,data});
 if(action==='platform_boot') return ok(BOOT);
 if(action==='platform_list_my_shops') return ok({myShops:BOOT.myShops});
 if(action==='platform_list_my_subscription_requests') return ok({requests:BOOT.myRequests});
 if(action==='platform_list_my_subscription_history') return ok({history:[{id:'h1',tariffName:'Biznes',price:199000,status:'ACTIVE',createdAt:'2026-09-01T10:00:00Z'}]});
 if(action==='platform_get_subscription_request_history') return ok({history:[{eventType:'CREATED',createdAt:'2026-09-22T09:00:00Z',actorType:'USER'},{eventType:'APPROVED',createdAt:'2026-09-22T10:00:00Z',actorType:'ADMIN'}]});
 if(action==='platform_get_my_support_tickets') return ok({tickets:[{id:11,type:payload.type||'SUPPORT',subject:'Demo savol',status:'ANSWERED',createdAt:'2026-09-22T11:00:00Z'}]});
 if(action==='platform_get_support_messages') return ok({messages:[{id:1,sender:'USER',body:'Salom',createdAt:'2026-09-22T11:00:00Z'},{id:2,sender:'ADMIN',body:'Assalomu alaykum, yordam beramiz.',createdAt:'2026-09-22T11:05:00Z'}]});
 if(action==='platform_list_payment_methods') return ok({methods:[]});
 if(action==='platform_get_payment_info') return ok({});
 return ok({});
}};
const auth={async signOut(){return {ok:true}}};
const c=createPlatformPortalController({platformPort:port,authPort:auth});
await c.load();
if(globalThis.__N2_SECTION__==='support') await c.loadSupport();
if(globalThis.__N2_SECTION__==='requests' && globalThis.__N2_PARAMS__?.requestId) await c.loadRequestHistory(globalThis.__N2_PARAMS__.requestId);
const v=createPlatformPortalView({controller:c,state:c.getState(),section:globalThis.__N2_SECTION__,params:globalThis.__N2_PARAMS__||{},search:'',onNavigate:()=>{},onSignedOut:()=>{}},document);
document.getElementById('root').replaceChildren(v.element);
globalThis.__N2_READY__=true;
"""

def render(browser,name,section,viewport,params=None):
    ctx=browser.new_context(viewport=viewport,device_scale_factor=1)
    p=ctx.new_page(); errors=[]; p.on('pageerror',lambda e:errors.append(str(e)))
    p.set_content(HTML,wait_until='load')
    p.evaluate('x=>globalThis.__N2_BOOT__=x',BOOT)
    p.evaluate('x=>globalThis.__N2_SECTION__=x',section)
    p.evaluate('x=>globalThis.__N2_PARAMS__=x',params or {})
    p.evaluate(LOADER,{'modules':MODULES,'entry':ROOT_KEY})
    p.evaluate(f"async()=>{{{HARNESS}}}")
    p.wait_for_function('globalThis.__N2_READY__===true')
    overflow=p.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1')
    p.screenshot(path=str(OUT/f'{name}.png'),full_page=True)
    nav=p.locator('.uw-platform-portal__nav').count()
    text=p.locator('#root').inner_text()[:5000]
    ctx.close()
    return {'name':name,'section':section,'viewport':viewport,'overflow':overflow,'pageErrors':errors,'navCount':nav,'text':text}

def main():
    cases=[]
    with sync_playwright() as pw:
        b=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        cases.append(render(b,'platform-app-mobile','app',{'width':390,'height':844}))
        cases.append(render(b,'platform-shops-desktop','shops',{'width':1440,'height':1000}))
        cases.append(render(b,'platform-support-mobile','support',{'width':320,'height':760}))
        cases.append(render(b,'platform-request-desktop','requests',{'width':1440,'height':1000},{'requestId':'r1'}))
        b.close()
    failures=[]
    for c in cases:
        if not c['overflow']: failures.append('overflow:'+c['name'])
        if c['pageErrors']: failures.append('pageerror:'+c['name']+':'+repr(c['pageErrors']))
        if c['navCount']!=1: failures.append('nav:'+c['name'])
    if 'Fitcore Demo' not in cases[0]['text']: failures.append('overview-shop-content')
    if 'Mening murojaatlarim' not in cases[2]['text']: failures.append('support-content')
    if 'Ariza tarixi' not in cases[3]['text']: failures.append('request-history-content')
    report={'task':'CHAT-N2','environment':'real headless Chromium; platform portal source modules run as Blob ESM with local API fixture','cases':cases,'failures':failures,'liveSupabase':False}
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'cases':len(cases),'failures':failures},ensure_ascii=False))
    raise SystemExit(1 if failures else 0)
if __name__=='__main__': main()
