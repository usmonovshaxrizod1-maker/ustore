const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root,'ustore-shop-app.js'),'utf8');
const catalog = JSON.parse(fs.readFileSync(path.join(root,'vendor/wordmark-fonts/catalog.json'),'utf8'));
const chunk = code.slice(code.indexOf('const WORDMARK_PRESETS = ['),code.indexOf('function currentShopNameForWordmark()'));

test('all 50 real font binaries are distinct, licensed and cover Uzbek Latin plus Russian', () => {
  const hashes = new Set();
  assert.equal(catalog.fonts.length, 50);
  for (const record of catalog.fonts) {
    const bytes = fs.readFileSync(path.join(root,'vendor/wordmark-fonts',record.file));
    assert.equal(bytes.subarray(0,4).toString(), 'wOF2');
    assert.ok(bytes.length > 10000);
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash, record.sha256); hashes.add(hash);
    const license = fs.readFileSync(path.join(root,'vendor/wordmark-fonts',record.license),'utf8');
    assert.match(license, /SIL OPEN FONT LICENSE|Ubuntu Font Licence|Apache License/i);
    for (const char of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюяЎўOʻzbek Gʼalaba O‘rik') {
      const point=char.codePointAt(0);
      assert.ok(record.ranges.some(([first,last])=>point>=first&&point<=last),`${record.family}: ${char}`);
    }
  }
  assert.equal(hashes.size, 50);
});

function fontRuntime({fail=false}={}) {
  let loads=0, requests=0, added=0;
  const context = vm.createContext({
    document:{querySelectorAll:()=>[],fonts:{add:()=>{added++;}}}, window:{},
    fetch:async(url)=>{requests++;assert.equal(url,'./vendor/wordmark-fonts/catalog.json');return {ok:true,json:async()=>catalog};},
    FontFace:class {constructor(family,url){assert.match(family,/^UStore /);assert.match(url,/vendor\/wordmark-fonts\/font-[\w-]+\.woff2/);this.status='unloaded';} async load(){loads++;if(fail)throw Error('offline');this.status='loaded';return this;}},
    setTimeout,clearTimeout,tr:a=>a,escapeHtml:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  });
  vm.runInContext(chunk+';globalThis.f={ensureWordmarkFont,wordmarkSupportsText,renderWordmarkHtml,WORDMARK_PRESETS,WORDMARK_LEGACY_PRESETS};',context);
  return {f:context.f,stats:()=>({loads,requests,added})};
}

test('50 unique presets use packaged bytes, retain old IDs and deduplicate loads', async () => {
  const {f,stats}=fontRuntime();
  assert.equal(f.WORDMARK_PRESETS.length,50);
  assert.equal(new Set(f.WORDMARK_PRESETS.map(p=>p.font)).size,50);
  assert.equal(f.WORDMARK_LEGACY_PRESETS.length,15);
  for (const preset of f.WORDMARK_PRESETS) assert.ok(catalog.fonts.some(r=>r.id===preset.id&&r.family===preset.font&&r.weight===preset.weight));
  const one=f.ensureWordmarkFont('font-montserrat');
  const two=f.ensureWordmarkFont('font-montserrat');
  assert.equal(one,two);assert.equal(await one,true);
  assert.deepEqual(stats(),{loads:1,requests:1,added:1});
  assert.match(f.renderWordmarkHtml('font-montserrat','Oʻzbek Магазин'),/data-font-state="ready"/);
  assert.match(f.renderWordmarkHtml('font-montserrat','Oʻzbek'),/font-family:&quot;UStore Montserrat&quot;;/);
  assert.match(f.renderWordmarkHtml('geometric-bold','SHOP'),/font-family:var\(--default-font-family/);
  assert.deepEqual(stats(),{loads:1,requests:1,added:1});
});

test('loading errors never paint generic fonts; failed loads can be retried', async () => {
  const {f,stats}=fontRuntime({fail:true});
  assert.match(f.renderWordmarkHtml('font-montserrat','SHOP',{deferFont:true}),/data-font-state="loading"/);
  assert.equal(await f.ensureWordmarkFont('font-montserrat'),false);
  assert.match(f.renderWordmarkHtml('font-montserrat','SHOP',{deferFont:true}),/data-font-state="error"/);
  assert.equal(await f.ensureWordmarkFont('font-montserrat'),false);
  assert.equal(stats().loads,2);
  const css=fs.readFileSync(path.join(root,'ustore.css'),'utf8');
  assert.match(css,/\.fc-wordmark\[data-font-state\]:not\(\[data-font-state="ready"\]\)>\.fc-wordmark-text\{display:none!important\}/);
  assert.doesNotMatch(chunk,/fonts\.googleapis|display=swap/);
  assert.match(code,/if \(!\(await ensureWordmarkFont\(wordmarkDraftPresetId\)\)\)/);
});

test('preview, save and PNG export reject unsupported glyphs instead of silently borrowing another font', async () => {
  const {f}=fontRuntime();
  await f.ensureWordmarkFont('font-manrope');
  assert.equal(f.wordmarkSupportsText('font-manrope','Magazin Магазин Oʻzbek'),true);
  assert.equal(f.wordmarkSupportsText('font-manrope','漢字'),false);
  assert.match(f.renderWordmarkHtml('font-manrope','漢字'),/data-font-state="unsupported"/);
  assert.match(code,/wordmarkSupportsText\(wordmarkDraftPresetId, text\)/);
  const exportCode=code.slice(code.indexOf('async function exportWordmarkLogo()'),code.indexOf('\n    function ',code.indexOf('async function exportWordmarkLogo()')));
  assert.match(exportCode,/await ensureWordmarkFont\(preset.id\)/);
  assert.match(exportCode,/wordmarkSupportsText\(preset.id, text\)/);
  assert.match(exportCode,/context.font = .*wordmarkFontFamily\(preset\)/);
  assert.match(exportCode,/canvasToBlob\(canvas, 'image\/png'/);
});
