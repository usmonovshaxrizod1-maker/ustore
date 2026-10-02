#!/usr/bin/env python3
import json, pathlib, re
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'artifacts' / 'browser-qa-o1'
OUT.mkdir(parents=True, exist_ok=True)
IMPORT_RE = re.compile(r"(?P<prefix>\bfrom\s*|\bimport\s*)(?P<q>['\"])(?P<spec>[^'\"]+)(?P=q)")
DYN_RE = re.compile(r"(?P<prefix>\bimport\(\s*)(?P<q>['\"])(?P<spec>[^'\"]+)(?P=q)(?P<suffix>\s*\))")

def resolve_spec(base, spec):
    if spec.startswith('/web/'):
        p = ROOT / spec.lstrip('/')
    elif spec.startswith('.'):
        p = (base.parent / spec).resolve()
    else:
        return None
    if p.is_dir():
        p = p / 'index.js'
    if not p.suffix:
        p = pathlib.Path(str(p) + '.js')
    return p

def graph(entry):
    srcs, deps = {}, {}
    def visit(p):
        p = p.resolve(); key = str(p.relative_to(ROOT)).replace('\\', '/')
        if key in srcs: return key
        source = p.read_text(); srcs[key] = source; deps[key] = {}
        for rx in (IMPORT_RE, DYN_RE):
            for m in rx.finditer(source):
                rp = resolve_spec(p, m.group('spec'))
                if rp and rp.exists(): deps[key][m.group('spec')] = visit(rp)
        return key
    root = visit(ROOT / entry); order, seen = [], set()
    def dfs(key):
        if key in seen: return
        for dep in deps[key].values(): dfs(dep)
        seen.add(key); order.append(key)
    dfs(root); modules = []
    for i, key in enumerate(order):
        source = srcs[key]; mapping = {}
        for j, (spec, dep) in enumerate(deps[key].items()):
            token = f'__O1_D_{i}_{j}__'; mapping[token] = dep
            source = source.replace(f"'{spec}'", f"'{token}'").replace(f'"{spec}"', f'"{token}"')
        modules.append({'key': key, 'source': source, 'deps': mapping})
    return modules, root

SHELL_MODULES, SHELL_ENTRY = graph('web/shells/index.js')
ADMIN_MODULES, ADMIN_ENTRY = graph('web/features/platform-admin/index.js')
CSS = '\n'.join((ROOT / f'web/styles/{name}').read_text() for name in [
    'tokens.css','document.css','base.css','components.css','shells.css','features.css'
])
HTML = f"""<!doctype html><html lang='uz'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><style>{CSS}</style></head><body><div id='root'></div></body></html>"""
LOADER = """async ({modules,entry,slot})=>{const urls={};for(const m of modules){let s=m.source;for(const [t,d] of Object.entries(m.deps))s=s.split(t).join(urls[d]);urls[m.key]=URL.createObjectURL(new Blob([s],{type:'text/javascript'}));}globalThis[slot]=await import(urls[entry]);}"""
CONTEXT = {
    'shop': {'id':'s1','name':'FITCORE','publicCode':'FITCORE','status':'ACTIVE'},
    'actor': {
        'displayName':'Owner Demo','roleCodes':['OWNER','MANAGER'],
        'permissions':['products.manage','stock.view','orders.view','marketing.manage','reports.view','staff.manage','support.manage','shop.settings.manage','integrations.manage','domains.manage']
    }
}
SUPER = {'isSuperAdmin':True,'platformActor':{'accountId':'super-1','displayName':'Super Admin Demo','platformRole':'SUPER_ADMIN','telegramLinked':True},'myShops':[],'myRequests':[],'tariffs':[],'lifecycleSettings':{}}

ADMIN_HARNESS = r"""
const {createPlatformAdminController,createPlatformAdminView}=globalThis.__O1_ADMIN;
const ok=(data)=>({ok:true,data});
const port={async invoke(action,payload={}){
 if(action==='platform_boot')return ok(globalThis.__O1_BOOT);
 if(action==='platform_get_lifecycle_settings')return ok({settings:{retentionDays:30,autoFreezeOnExpiry:true,supportLabel:'Yordam',supportUrl:'https://t.me/ustore'}});
 if(action==='platform_get_payment_info')return ok({cardNumber:'8600 0000 0000 0000',cardHolder:'USTORE',isActive:true});
 if(action==='platform_admin_list_payment_methods')return ok({methods:[{id:'pm1',methodType:'CLICK',displayName:'Click',paymentUrl:'https://example.com/pay',isActive:true,sortOrder:1}]});
 if(action==='platform_admin_list_notification_templates')return ok({templates:[{type:'EXPIRY_3D',body:'Obunangiz tugashiga {DAYS_LEFT} kun qoldi.',imageUrl:'',isActive:true}]});
 return ok({});
}};
const c=createPlatformAdminController({platformPort:port,authPort:{signOut:async()=>({ok:true})}});await c.load();await c.loadSection('settings',{});
const v=createPlatformAdminView({controller:c,state:c.getState(),section:'settings',params:{},onNavigate:()=>{},onSignedOut:()=>{}},document);
document.getElementById('root').replaceChildren(v.element);globalThis.__O1_READY=true;
"""

def visible_accessible_name_check(page):
    return page.evaluate("""() => Array.from(document.querySelectorAll('input,select,textarea')).filter(el=>{
      const st=getComputedStyle(el);return st.display!=='none'&&st.visibility!=='hidden'&&!el.hidden;
    }).map(el=>{const labels=el.labels?Array.from(el.labels).map(x=>x.textContent.trim()).filter(Boolean):[];const name=(el.getAttribute('aria-label')||labels.join(' ')||el.getAttribute('aria-labelledby')||el.title||'').trim();return {tag:el.tagName,type:el.type||'',name,placeholder:el.placeholder||''};})""")

def shell_case(browser, name, width, height, kind='customer', locale='uz'):
    ctx = browser.new_context(viewport={'width':width,'height':height})
    page = ctx.new_page(); errors=[]; page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(HTML); page.evaluate(LOADER, {'modules':SHELL_MODULES,'entry':SHELL_ENTRY,'slot':'__O1_SHELLS'})
    page.evaluate("""({context,kind,locale})=>{const api=globalThis.__O1_SHELLS;const content=document.createElement('section');content.innerHTML='<h2>QA content</h2><p>Responsive content block.</p>';const opts={context,content,locale,pageTitle:'QA',activeNav:'overview'};const shell=kind==='admin'?api.createAdminShell(opts,document):api.createCustomerShell(opts,document);document.getElementById('root').replaceChildren(shell.element);globalThis.__O1_SHELL=shell;}""", {'context':CONTEXT,'kind':kind,'locale':locale})
    overflow=page.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1')
    lang_text=page.locator('#root').inner_text()
    result={'name':name,'width':width,'height':height,'kind':kind,'locale':locale,'overflow':overflow,'errors':errors,'text':lang_text[:2000]}
    page.screenshot(path=str(OUT/f'{name}.png'),full_page=True)
    ctx.close(); return result

def drawer_keyboard_case(browser):
    ctx=browser.new_context(viewport={'width':390,'height':844});page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(HTML);page.evaluate(LOADER, {'modules':SHELL_MODULES,'entry':SHELL_ENTRY,'slot':'__O1_SHELLS'})
    page.evaluate("""(context)=>{const api=globalThis.__O1_SHELLS;const content=document.createElement('div');content.textContent='Drawer QA';const shell=api.createAdminShell({context,content,pageTitle:'Boshqaruv',locale:'uz'},document);document.getElementById('root').replaceChildren(shell.element);globalThis.__O1_SHELL=shell;}""",CONTEXT)
    menu=page.locator('.uw-admin-menu-button');menu.focus();menu.click();page.wait_for_timeout(50)
    opened=page.evaluate("""()=>({state:__O1_SHELL.drawer.dataset.state,aria:__O1_SHELL.drawer.getAttribute('aria-hidden'),inert:__O1_SHELL.drawer.inert,activeInside:__O1_SHELL.drawer.contains(document.activeElement)})""")
    # Exercise tab loop for more steps than there are links; focus must remain inside drawer.
    tab_inside=[]
    for _ in range(15):
        page.keyboard.press('Tab');tab_inside.append(page.evaluate('__O1_SHELL.drawer.contains(document.activeElement)'))
    page.keyboard.press('Escape');page.wait_for_timeout(30)
    closed=page.evaluate("""()=>({state:__O1_SHELL.drawer.dataset.state,aria:__O1_SHELL.drawer.getAttribute('aria-hidden'),inert:__O1_SHELL.drawer.inert,restored:document.activeElement===__O1_SHELL.menuButton})""")
    overflow=page.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1')
    page.screenshot(path=str(OUT/'o1-admin-drawer-keyboard.png'),full_page=True)
    ctx.close();return {'name':'admin-drawer-keyboard','opened':opened,'tabInside':all(tab_inside),'closed':closed,'overflow':overflow,'errors':errors}

def reduced_motion_case(browser):
    ctx=browser.new_context(viewport={'width':390,'height':844}, reduced_motion='reduce');page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(HTML);page.evaluate(LOADER, {'modules':SHELL_MODULES,'entry':SHELL_ENTRY,'slot':'__O1_SHELLS'})
    page.evaluate("""(context)=>{const api=globalThis.__O1_SHELLS;const content=document.createElement('button');content.textContent='Motion target';const shell=api.createCustomerShell({context,content,locale:'uz'},document);document.getElementById('root').replaceChildren(shell.element);}""",CONTEXT)
    values=page.evaluate("""()=>{const root=document.querySelector('.uw-root');const el=root.querySelector('button');const cs=getComputedStyle(el);return {media:matchMedia('(prefers-reduced-motion: reduce)').matches,transition:cs.transitionDuration,animation:cs.animationDuration,scroll:getComputedStyle(root).scrollBehavior};}""")
    ctx.close();return {'name':'reduced-motion','values':values,'errors':errors}

def admin_forms_case(browser):
    ctx=browser.new_context(viewport={'width':1440,'height':1200});page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(HTML);page.evaluate('x=>globalThis.__O1_BOOT=x',SUPER);page.evaluate(LOADER, {'modules':ADMIN_MODULES,'entry':ADMIN_ENTRY,'slot':'__O1_ADMIN'});page.evaluate(f"async()=>{{{ADMIN_HARNESS}}}");page.wait_for_function('globalThis.__O1_READY===true')
    controls=visible_accessible_name_check(page);unnamed=[x for x in controls if not x['name']]
    overflow=page.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1')
    page.screenshot(path=str(OUT/'o1-platform-admin-form-labels.png'),full_page=True)
    ctx.close();return {'name':'platform-admin-form-labels','controlCount':len(controls),'unnamed':unnamed,'overflow':overflow,'errors':errors}

def main():
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        cases=[
            shell_case(browser,'o1-customer-360-ru',360,800,'customer','ru'),
            shell_case(browser,'o1-admin-390-uz',390,844,'admin','uz'),
            shell_case(browser,'o1-customer-768-uz',768,900,'customer','uz'),
            shell_case(browser,'o1-admin-1024-ru',1024,900,'admin','ru'),
            shell_case(browser,'o1-admin-1440-uz',1440,1000,'admin','uz'),
            drawer_keyboard_case(browser),
            reduced_motion_case(browser),
            admin_forms_case(browser),
        ]
        browser.close()
    failures=[]
    for c in cases:
        if c.get('overflow') is False: failures.append('overflow:'+c['name'])
        if c.get('errors'): failures.append('pageerror:'+c['name']+':'+repr(c['errors']))
    drawer=next(c for c in cases if c['name']=='admin-drawer-keyboard')
    if drawer['opened'] != {'state':'open','aria':'false','inert':False,'activeInside':True}: failures.append('drawer-open-state')
    if not drawer['tabInside']: failures.append('drawer-tab-escaped')
    if drawer['closed'] != {'state':'closed','aria':'true','inert':True,'restored':True}: failures.append('drawer-close-restore')
    motion=next(c for c in cases if c['name']=='reduced-motion')['values']
    if not motion['media']: failures.append('reduced-motion-media')
    # Chromium serializes 0.01ms as 1e-05s.
    if motion['transition'] not in ('1e-05s','0.00001s','0s'): failures.append('reduced-motion-transition:'+motion['transition'])
    forms=next(c for c in cases if c['name']=='platform-admin-form-labels')
    if forms['unnamed']: failures.append('unnamed-form-controls:'+repr(forms['unnamed']))
    ru=next(c for c in cases if c['name']=='o1-customer-360-ru')['text']
    if 'Каталог' not in ru or 'Корзина' not in ru: failures.append('ru-core-chrome')
    report={'task':'CHAT-O1','environment':'real headless Chromium; source modules with deterministic local fixtures; no live Supabase/provider/DNS','viewports':[360,390,768,1024,1440],'cases':cases,'failures':failures,'liveSupabase':False}
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'cases':len(cases),'failures':failures},ensure_ascii=False))
    raise SystemExit(1 if failures else 0)

if __name__=='__main__': main()
