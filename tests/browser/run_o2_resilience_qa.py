#!/usr/bin/env python3
import json, pathlib, re
from playwright.sync_api import sync_playwright

ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'artifacts'/'browser-qa-o2'; OUT.mkdir(parents=True,exist_ok=True)
IMPORT_RE=re.compile(r"(?P<prefix>\bfrom\s*|\bimport\s*)(?P<q>['\"])(?P<spec>[^'\"]+)(?P=q)")
DYN_RE=re.compile(r"(?P<prefix>\bimport\(\s*)(?P<q>['\"])(?P<spec>[^'\"]+)(?P=q)(?P<suffix>\s*\))")

def resolve(base,spec):
    if not spec.startswith('.'): return None
    p=(base.parent/spec).resolve()
    if p.is_dir(): p=p/'index.js'
    if not p.suffix: p=pathlib.Path(str(p)+'.js')
    return p

def graph(entry):
    sources={}; deps={}
    def visit(p):
        p=p.resolve(); k=str(p.relative_to(ROOT)).replace('\\','/')
        if k in sources:return k
        src=p.read_text(encoding='utf-8'); sources[k]=src; deps[k]={}
        for rx in (IMPORT_RE,DYN_RE):
            for m in rx.finditer(src):
                spec=m.group('spec'); rp=resolve(p,spec)
                if rp and rp.exists(): deps[k][spec]=visit(rp)
        return k
    root=visit(ROOT/entry); order=[]; seen=set()
    def dfs(k):
        if k in seen:return
        for d in deps[k].values():dfs(d)
        seen.add(k);order.append(k)
    dfs(root)
    mods=[]
    for i,k in enumerate(order):
        src=sources[k]; mapping={}
        for j,(spec,dk) in enumerate(deps[k].items()):
            tok=f'__D_{i}_{j}__'; mapping[tok]=dk; src=src.replace(f"'{spec}'",f"'{tok}'").replace(f'"{spec}"',f'"{tok}"')
        mods.append({'key':k,'source':src,'deps':mapping})
    return mods,root

MODS,ENTRY=graph('web/features/home/index.js')
LOADER="""async ({modules,entry})=>{const urls={};for(const m of modules){let src=m.source;for(const [tok,dep] of Object.entries(m.deps)){src=src.split(tok).join(urls[dep]);}urls[m.key]=URL.createObjectURL(new Blob([src],{type:'text/javascript'}));}globalThis.__O2=await import(urls[entry]);}"""

def main():
  with sync_playwright() as pw:
    b=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    p=b.new_page(); errors=[]; p.on('pageerror',lambda e:errors.append(str(e)))
    p.set_content("<!doctype html><html><body><main id='root'></main></body></html>")
    p.evaluate(LOADER,{'modules':MODS,'entry':ENTRY})
    result=p.evaluate("""() => {
      const root=document.querySelector('#root');
      const model={banners:[{id:'b1',imageUrl:'https://example.invalid/1.jpg'},{id:'b2',imageUrl:'https://example.invalid/2.jpg'}],featuredBlocks:[],featuredProducts:[],latestProducts:[]};
      const v=__O2.createHomeView({model});root.replaceChildren(v.element);
      const imgs=[...root.querySelectorAll('img')].map(x=>({width:x.width,height:x.height,loading:x.loading,priority:x.fetchPriority,decoding:x.decoding,referrerPolicy:x.referrerPolicy}));
      const error=__O2.createHomeView({model:null,state:'error',onRetry:()=>{}}).element.textContent;
      const empty=__O2.createHomeView({model:{banners:[],featuredBlocks:[],featuredProducts:[],latestProducts:[]}}).element.textContent;
      const loading=__O2.createHomeView({model:null,state:'loading'}).element.querySelector('[data-kind=loading]');
      return {imgs,error,empty,loadingRole:loading?.getAttribute('role'),loadingBusy:loading?.getAttribute('aria-busy')};
    }""")
    b.close()
  failures=[]
  if len(result['imgs'])!=2: failures.append('image-count')
  else:
    a,c=result['imgs']
    if (a['width'],a['height'],a['loading'],a['priority'])!=(1200,480,'eager','high'): failures.append('hero-priority')
    if (c['width'],c['height'],c['loading'],c['priority'])!=(1200,480,'lazy','low'): failures.append('lazy-banner')
  if 'Bosh sahifa yuklanmadi' not in result['error']: failures.append('error-state')
  if 'Hozircha mahsulotlar yo‘q' not in result['empty']: failures.append('empty-state')
  if result['loadingRole']!='status' or result['loadingBusy']!='true': failures.append('loading-semantics')
  if errors: failures.append('pageerror:'+repr(errors))
  report={'task':'CHAT-O2','environment':'real headless Chromium; Home ESM graph loaded as Blob modules','checks':6,'result':result,'pageErrors':errors,'failures':failures}
  (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  print(json.dumps({'checks':6,'failures':failures},ensure_ascii=False))
  raise SystemExit(1 if failures else 0)
if __name__=='__main__':main()
