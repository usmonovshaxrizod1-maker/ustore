#!/usr/bin/env python3
import json, pathlib, re
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'artifacts'/'browser-qa-n3'; OUT.mkdir(parents=True,exist_ok=True)
ENTRY='web/features/platform-admin/index.js'
IMPORT_RE=re.compile(r"(?P<prefix>\bfrom\s*|\bimport\s*)(?P<q>['\"])(?P<spec>[^'\"]+)(?P=q)")
DYN_RE=re.compile(r"(?P<prefix>\bimport\(\s*)(?P<q>['\"])(?P<spec>[^'\"]+)(?P=q)(?P<suffix>\s*\))")
def resolve_spec(base,spec):
    if spec.startswith('/web/'): p=ROOT/spec.lstrip('/')
    elif spec.startswith('.'): p=(base.parent/spec).resolve()
    else:return None
    if p.is_dir():p=p/'index.js'
    if not p.suffix:p=pathlib.Path(str(p)+'.js')
    return p
def graph(entry):
    srcs={}; deps={}
    def visit(p):
        p=p.resolve(); k=str(p.relative_to(ROOT)).replace('\\','/')
        if k in srcs:return k
        s=p.read_text(); srcs[k]=s; deps[k]={}
        for rx in (IMPORT_RE,DYN_RE):
            for m in rx.finditer(s):
                rp=resolve_spec(p,m.group('spec'))
                if rp and rp.exists(): deps[k][m.group('spec')]=visit(rp)
        return k
    root=visit(ROOT/entry); order=[]; seen=set()
    def dfs(k):
        if k in seen:return
        for d in deps[k].values():dfs(d)
        seen.add(k);order.append(k)
    dfs(root); mods=[]
    for i,k in enumerate(order):
        s=srcs[k]; mp={}
        for j,(spec,d) in enumerate(deps[k].items()):
            tok=f'__D_{i}_{j}__'; mp[tok]=d; s=s.replace(f"'{spec}'",f"'{tok}'").replace(f'"{spec}"',f'"{tok}"')
        mods.append({'key':k,'source':s,'deps':mp})
    return mods,root
MODULES,ROOT_KEY=graph(ENTRY)
CSS='\n'.join((ROOT/f'web/styles/{n}').read_text() for n in ['tokens.css','base.css','components.css','shells.css','features.css'])
HTML=f"<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><style>{CSS}</style><style>html,body{{margin:0;min-height:100%}}#root{{min-height:100vh}}</style></head><body><div id='root'></div></body></html>"
LOADER="""async ({modules,entry})=>{const urls={};for(const m of modules){let s=m.source;for(const [t,d] of Object.entries(m.deps))s=s.split(t).join(urls[d]);urls[m.key]=URL.createObjectURL(new Blob([s],{type:'text/javascript'}));}globalThis.__N3=await import(urls[entry]);}"""
SUPER={'isSuperAdmin':True,'platformActor':{'accountId':'super-1','displayName':'Super Admin Demo','platformRole':'SUPER_ADMIN','telegramLinked':True},'myShops':[],'myRequests':[],'tariffs':[],'lifecycleSettings':{}}
USER={'isSuperAdmin':False,'platformActor':{'accountId':'owner-1','displayName':'Shop Owner Demo','platformRole':'USER','telegramLinked':True},'myShops':[{'id':'s-own','status':'ACTIVE'}],'myRequests':[],'tariffs':[],'lifecycleSettings':{}}
HARNESS="""
const {createPlatformAdminController,createPlatformAdminView}=globalThis.__N3;
const boot=globalThis.__BOOT; const section=globalThis.__SECTION; const params=globalThis.__PARAMS||{};
const ok=(data)=>({ok:true,data});
const port={async invoke(action,payload={}){
 if(action==='platform_boot')return ok(boot);
 if(action==='platform_admin_dashboard_summary')return ok({activeShopsCount:12,newRequestsCount:3,expiringSoonCount:2,expiredCount:1,supportOpenCount:2,totalUsersCount:10,recentShops:[{id:'s1',public_code:'FITCORE',status:'ACTIVE',created_at:'2026-09-22T09:00:00Z'}],attentionItems:[{type:'NEW_REQUEST',requestId:'r1',label:'Ali',detail:'Yangi do\\'kon — Biznes'}]});
 if(action==='platform_list_shops')return ok({shops:[{id:'s1',publicCode:'FITCORE',status:'ACTIVE',botUsername:'fitcore_bot',botName:'FITCORE',ownerTelegramId:'123456789',tariffName:'Biznes',productLimit:500,subscriptionExpiresAt:'2026-10-23T00:00:00Z',billzAccessGranted:true,billzConnectionStatus:'CONNECTED',clickAccessGranted:true,clickConnectionStatus:'CONNECTED',paymeAccessGranted:false,paymeConnectionStatus:'DISCONNECTED',uzumAccessGranted:false,uzumConnectionStatus:'DISCONNECTED'}]});
 if(action==='platform_list_subscription_history')return ok({history:[{id:'h1',eventType:'PURCHASE',newTariffName:'Biznes',purchasedAmount:199000,createdAt:'2026-09-01T00:00:00Z'}]});
 if(action==='platform_list_shop_admin_actions')return ok({actions:[{id:1,action:'GRANT_DAYS',adminTgId:'999',createdAt:'2026-09-20T00:00:00Z'}]});
 if(action==='platform_list_subscription_requests')return ok({requests:[{id:'r1',kind:'NEW_SHOP',status:'APPROVED',awaitingProvisioning:true,requestedShopName:'Demo Shop',requestedBotName:'Demo Bot',requesterFirstName:'Ali',requesterTelegramId:'77777',tariffName:'Biznes',tariffPrice:199000,paymentMethod:'CARD',paymentClaimedAt:'2026-09-22T10:00:00Z',createdAt:'2026-09-22T09:00:00Z'}]});
 if(action==='platform_get_subscription_request_history')return ok({request:{id:'r1',kind:'NEW_SHOP',status:'APPROVED',awaitingProvisioning:true,requestedShopName:'Demo Shop',requestedBotName:'Demo Bot',requesterFirstName:'Ali',requesterTelegramId:'77777',tariffName:'Biznes',tariffPrice:199000,paymentMethod:'CARD',paymentClaimedAt:'2026-09-22T10:00:00Z',createdAt:'2026-09-22T09:00:00Z'},history:[{eventType:'PAYMENT_APPROVED',actorType:'ADMIN',createdAt:'2026-09-22T11:00:00Z'}]});
 if(action==='platform_admin_list_support_tickets')return ok({tickets:[]});
 if(action==='platform_admin_list_tariffs')return ok({tariffs:[{id:'t1',name:'Biznes',price:199000,productLimit:500,isActive:true,isPopular:true,sortOrder:1,features:['Hisobotlar','Marketing']}]});
 if(action==='platform_admin_analytics_summary')return ok({period:'30d',totalCount:8,newShopCount:4,renewalCount:3,planChangeCount:1,revenue:1592000,byPeriod:{MONTHLY:{count:8,revenue:1592000},ANNUAL:{count:0,revenue:0}},byTariff:[{tariffName:'Biznes',count:8,revenue:1592000}],salesTimeline:[{day:'2026-09-22',count:2,revenue:398000}],retentionRate:80,retentionCohortSize:10});
 if(action==='platform_get_lifecycle_settings')return ok({settings:{retentionDays:30,autoFreezeOnExpiry:true,supportLabel:'Yordam',supportUrl:'https://t.me/ustore'}});
 if(action==='platform_get_payment_info')return ok({cardNumber:'8600 0000 0000 0000',cardHolder:'USTORE',isActive:true});
 if(action==='platform_admin_list_payment_methods')return ok({methods:[{id:'pm1',methodType:'CLICK',displayName:'Click',paymentUrl:'https://example.com/pay',isActive:true,sortOrder:1}]});
 if(action==='platform_admin_list_notification_templates')return ok({templates:[{type:'EXPIRY_3D',body:'Obunangiz tugashiga {DAYS_LEFT} kun qoldi.',isActive:true}]});
 return ok({}); }};
const c=createPlatformAdminController({platformPort:port,authPort:{signOut:async()=>({ok:true})}}); await c.load(); if(c.getState().isSuperAdmin)await c.loadSection(section,params);
const v=createPlatformAdminView({controller:c,state:c.getState(),section,params,onNavigate:()=>{},onSignedOut:()=>{}},document);document.getElementById('root').replaceChildren(v.element);globalThis.__READY=true;
"""
def render(browser,name,section,width,height,params=None,superadmin=True):
    ctx=browser.new_context(viewport={'width':width,'height':height});p=ctx.new_page();errs=[];p.on('pageerror',lambda e:errs.append(str(e)));p.set_content(HTML);p.evaluate('x=>globalThis.__BOOT=x',SUPER if superadmin else USER);p.evaluate('x=>globalThis.__SECTION=x',section);p.evaluate('x=>globalThis.__PARAMS=x',params or {});p.evaluate(LOADER,{'modules':MODULES,'entry':ROOT_KEY});p.evaluate(f"async()=>{{{HARNESS}}}");p.wait_for_function('globalThis.__READY===true');overflow=p.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1');txt=p.locator('#root').inner_text();p.screenshot(path=str(OUT/f'{name}.png'),full_page=True);ctx.close();return {'name':name,'overflow':overflow,'errors':errs,'text':txt[:7000]}
def main():
  with sync_playwright() as pw:
    b=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox']);cases=[
      render(b,'n3-dashboard-desktop','overview',1440,1000),
      render(b,'n3-shop-detail-desktop','shops',1440,1100,{'shopId':'s1'}),
      render(b,'n3-request-detail-desktop','requests',1280,1000,{'requestId':'r1'}),
      render(b,'n3-settings-desktop','settings',1440,1200),
      render(b,'n3-forbidden-desktop','overview',1280,800,superadmin=False),
    ];b.close()
  failures=[]
  for c in cases:
    if not c['overflow']:failures.append('overflow:'+c['name'])
    if c['errors']:failures.append('pageerror:'+c['name']+':'+repr(c['errors']))
  if 'Platforma boshqaruvi' not in cases[0]['text']:failures.append('dashboard-content')
  if 'FITCORE' not in cases[1]['text'] or 'Lifecycle amallari' not in cases[1]['text']:failures.append('shop-detail-content')
  if 'Bot token' not in cases[2]['text'] and 'Do‘konni yaratish' not in cases[2]['text']:failures.append('request-provision-content')
  if 'Platforma sozlamalari' not in cases[3]['text']:failures.append('settings-content')
  if 'Super Admin vakolati kerak' not in cases[4]['text']:failures.append('forbidden-content')
  report={'task':'CHAT-N3','environment':'real headless Chromium; Super Admin source modules with local platform-api fixture','cases':cases,'failures':failures,'liveSupabase':False};(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'cases':len(cases),'failures':failures},ensure_ascii=False));raise SystemExit(1 if failures else 0)
if __name__=='__main__':main()
