const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root,'ustore-shop-app.js'),'utf8');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const css = fs.readFileSync(path.join(root,'ustore.css'),'utf8');
const webIndex = fs.readFileSync(path.join(root,'web/index.html'),'utf8');
const headers = fs.readFileSync(path.join(root,'web/_headers'),'utf8');
const block = code.slice(code.indexOf('const WORDMARK_PRESETS = ['),code.indexOf('const WORDMARK_COLOR_PRESETS = ['));

test('Word-like font list contains exactly 50 unique actual typeface families, not 50 stack variations',()=>{
  const entries=[...block.matchAll(/\{ id: '([^']+)', label: \(\) => '([^']+)', font: '([^']+)', weight: (\d+), fallback: '([^']+)'/g)];
  assert.equal(entries.length,50);
  assert.equal(new Set(entries.map(x=>x[1])).size,50);
  assert.equal(new Set(entries.map(x=>x[3])).size,50);
  for(const [,id,label,font,weight,fallback] of entries){
    assert.equal(label,font);
    assert.match(weight,/^\d+$/);
    assert.ok(['monospace','sans-serif','serif','cursive'].includes(fallback));
    assert.ok(id.length<=40);
  }
});

test('Pre-existing wordmark preset identifiers remain resolvable; old monogram is preserved for saved logos',()=>{
  for(const old of ['geometric-bold','corporate-clean','elegant-serif','luxury-serif','condensed-sport','wide-tech','mono-tech','mono-minimal','dynamic-italic','soft-rounded','fashion-light','retro-display','minimal-upper','editorial'])
    assert.ok(block.includes(`id: '${old}'`),`lost original legacy ID ${old}`);
  assert.match(block,/const WORDMARK_LEGACY_PRESETS = \[[\s\S]*id: 'monogram-badge'/);
  assert.match(code,/WORDMARK_LEGACY_PRESETS\.find\(\(p\) => p.id === id\)/);
  assert.match(code,/WORDMARK_LEGACY_PRESETS\.some\(\(p\) => p.id === storedPresetId\)/);
});

test('Chosen font is loaded on demand, previews lazy-loaded, and failed font is not silently saved as a fallback',()=>{
  assert.match(code,/new IntersectionObserver\(/);
  assert.match(code,/ensureWordmarkFont\(entry.target.dataset.presetId\)/);
  assert.match(code,/deferFont: true/);
  assert.match(code,/if \(!\(await ensureWordmarkFont\(wordmarkDraftPresetId\)\)\)/);
  assert.match(code,/fonts\.googleapis\.com\/css2\?family=/);
  assert.match(code,/document\.fonts\.load/);
  assert.match(code,/wordmarkRequestedFonts\.has\(preset.font\)/);
  assert.match(code,/filterWordmarkStyles\(this.value\)/);
  assert.match(css,/\.fc-wordmark-style-option\[hidden\]\{display:none!important\}/);
});

test('Google Fonts narrowly whitelisted by web CSP, style assets cache busted, and no font binaries added',()=>{
  for(const content of [webIndex,headers]){
    assert.match(content,/style-src 'self' https:\/\/fonts\.googleapis\.com/);
    assert.match(content,/font-src 'self' data: https:\/\/fonts\.gstatic\.com/);
  }
  assert.match(html,/ustore-shop-app\.js\?v=333/);
  assert.match(html,/ustore\.css\?v=331/);
  assert.doesNotMatch(block, /\.woff|\.ttf|\.otf|@font-face/);
});

test('Font loader requests one Google family per preset and deduplicates requests',async()=>{
  const chunk = code.slice(code.indexOf('const WORDMARK_PRESETS = ['),code.indexOf('function currentShopNameForWordmark()'));
  const links=[];
  const fakeDocument = {
    createElement(){return {dataset:{},onload:null,onerror:null};},
    head:{appendChild(link){links.push(link); setImmediate(()=>link.onload());}},
    fonts:{async load(css,text){assert.match(css,/"Montserrat"/);assert.match(text,/FITCORE/);return [{status:'loaded'}];}},
  };
  const context=vm.createContext({document:fakeDocument,window:{},setTimeout,clearTimeout,encodeURIComponent,tr:(a)=>a,escapeHtml:(x)=>String(x)});
  vm.runInContext(chunk+';globalThis.fontFns={ensureWordmarkFont,renderWordmarkHtml,WORDMARK_PRESETS};',context);
  const f=context.fontFns;
  const one=f.ensureWordmarkFont('font-montserrat');
  const two=f.ensureWordmarkFont('font-montserrat');
  assert.equal(one,two);
  assert.equal(await one,true);
  assert.equal(links.length,1);
  assert.match(links[0].href,/family=Montserrat:wght@900&display=swap/);
  const rendered=f.renderWordmarkHtml('font-montserrat','FITCORE',{deferFont:true});
  assert.match(rendered,/font-family:"Montserrat", sans-serif/);
  assert.equal(links.length,1);
  assert.match(f.renderWordmarkHtml('geometric-bold','FITCORE'),/font-family:var\(--default-font-family/);
  assert.equal(links.length,1, 'a saved legacy preset must not request a new font');
});
