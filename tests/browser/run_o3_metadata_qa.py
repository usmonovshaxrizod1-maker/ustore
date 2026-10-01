#!/usr/bin/env python3
import json, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'artifacts' / 'browser-qa-o3'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE = (ROOT / 'web/metadata/metadata.js').read_text(encoding='utf-8')
HTML = "<!doctype html><html lang='uz'><head><meta charset='utf-8'><title>Initial</title></head><body><main>O3 QA</main></body></html>"


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        page = browser.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.set_content(HTML)
        page.evaluate("""async source => {
          const u=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
          globalThis.__O3=await import(u);
        }""", SOURCE)
        public = page.evaluate("""() => {
          const m=__O3.createDocumentMetadataManager({documentRef:document});
          const out=m.publicPage({title:'Creatine — FITCORE',description:'Creatine mahsuloti',canonicalUrl:'https://fitcore.uz/product/p1',imageUrl:'https://cdn.example/p1.jpg',type:'product',locale:'uz',siteName:'FITCORE'});
          return {out,title:document.title,canonical:document.querySelector('link[rel=canonical]')?.href,robots:document.querySelector('meta[name=robots]')?.content,ogUrl:document.querySelector('meta[property="og:url"]')?.content,ogImage:document.querySelector('meta[property="og:image"]')?.content,twitter:document.querySelector('meta[name="twitter:card"]')?.content};
        }""")
        private = page.evaluate("""() => {
          const m=__O3.createDocumentMetadataManager({documentRef:document});
          const out=m.privatePage({title:'Admin — UStorE',description:'Private'});
          return {out,title:document.title,canonical:document.querySelector('link[rel=canonical]'),robots:document.querySelector('meta[name=robots]')?.content,ogImage:document.querySelector('meta[property="og:image"]')};
        }""")
        share = page.evaluate("""async () => {
          let copied='';
          const nav={share:async()=>{throw new Error('native fail')},clipboard:{writeText:async v=>{copied=v}}};
          const out=await __O3.sharePage({title:'Creatine',url:'https://fitcore.uz/product/p1#red'},nav);
          return {out,copied};
        }""")
        browser.close()

    failures=[]
    if public['title']!='Creatine — FITCORE': failures.append('public-title')
    if public['canonical']!='https://fitcore.uz/product/p1': failures.append('public-canonical')
    if not public['robots'].startswith('index,follow'): failures.append('public-robots')
    if public['ogUrl']!='https://fitcore.uz/product/p1': failures.append('public-og-url')
    if public['twitter']!='summary_large_image': failures.append('twitter-card')
    if private['canonical'] is not None: failures.append('private-canonical-not-removed')
    if not private['robots'].startswith('noindex'): failures.append('private-noindex')
    if private['ogImage'] is not None: failures.append('private-og-image-not-removed')
    if not share['out']['ok'] or share['out']['data']['method']!='clipboard' or share['copied']!='https://fitcore.uz/product/p1': failures.append('share-fallback')
    if errors: failures.append('pageerror:'+repr(errors))
    report={'task':'CHAT-O3','environment':'real headless Chromium; metadata module source loaded as Blob ESM','public':public,'private':private,'share':share,'errors':errors,'failures':failures,'serverPrerenderVerified':False}
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'checks':9,'failures':failures},ensure_ascii=False))
    raise SystemExit(1 if failures else 0)

if __name__=='__main__': main()
