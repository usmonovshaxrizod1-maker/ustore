// Local-only image path test. No live shop, database or provider calls.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'ustore-shop-app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'ustore.css'),'utf8');
const helper=app.slice(app.indexOf('const catalogImageCache ='),app.indexOf('async function uploadThumbnailSnapshot'));
const baselineZip=process.env.TASK5_BASELINE_ZIP;
const oldCss=baselineZip?execFileSync('unzip',['-p',baselineZip,'USTORE_GREENFIELD_FINAL_2026-09-16/ustore.css'],{encoding:'utf8',maxBuffer:2e6}):'';
const requests=[];
const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/image/')){
    requests.push({url:req.url,at:Date.now()});
    const n=Number(req.url.split('/').pop());
    setTimeout(()=>{res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'public,max-age=3600'});res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#2563eb"/><text x="30" y="54" fill="white">${n}</text></svg>`);},200+n*150);
    return;
  }
  res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html><head></head><body><main id="app-content"></main></body></html>');
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.TASK5_CHROME?{executablePath:process.env.TASK5_CHROME}:{})});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.addStyleTag({content:css});
    await page.addScriptTag({content:`const categories=[],products=[];const FALLBACK_IMG='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';${helper}`});
    const result=await page.evaluate(async()=>{
      const root=document.querySelector('#app-content');
      const markup=()=>[0,1,2,3].map(n=>`<article class="fc-image-card"><img src="/image/${n}" referrerpolicy="no-referrer" width="48" height="48"><span>Category ${n}</span></article>`).join('');
      const start=performance.now();
      [0,1,2,3].forEach(n=>warmCatalogImage('/image/'+n,'high'));
      // Model the interval between catalog data arrival and opening the route.
      await new Promise(r=>setTimeout(r,750));
      root.innerHTML=markup();
      await new Promise(r=>requestAnimationFrame(r));
      const readyAtOpen=[...root.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth).length;
      const visibleText=[...root.querySelectorAll('span')].every(i=>getComputedStyle(i).opacity==='1');
      await Promise.all([...root.querySelectorAll('img')].map(i=>i.decode()));
      const old=[...root.querySelectorAll('img')];
      const retained=captureCatalogImageNodes();root.innerHTML=markup();restoreCatalogImageNodes(retained);
      return {readyAtOpen,visibleText,reused:old.every((i,n)=>i===root.querySelectorAll('img')[n]),imageRequests:performance.getEntriesByType('resource').filter(r=>r.name.includes('/image/')).map(r=>({url:r.name.split('/').pop(),start:Math.round(r.startTime-start),end:Math.round(r.responseEnd-start)}))};
    });
    assert.equal(result.readyAtOpen,4);assert.ok(result.visibleText);assert.ok(result.reused);
    assert.equal(requests.length,4,'one HTTP request per image');
    const starts=requests.map(r=>r.at);assert.ok(Math.max(...starts)-Math.min(...starts)<200,'requests start in parallel');
    if(oldCss){
      await page.addStyleTag({content:oldCss});
      const before=await page.evaluate(()=>{document.querySelector('#app-content').innerHTML='<article class="fc-image-sync-card is-loading"><span>Category</span></article>';return getComputedStyle(document.querySelector('article span')).opacity;});
      assert.equal(before,'0');result.baselineTextOpacity=before;
    }
    console.log(JSON.stringify(result,null,2));
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
