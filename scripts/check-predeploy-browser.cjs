// Local Chromium integration against dist/web; all backend responses are fixtures.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../dist/web');
const server=http.createServer((req,res)=>{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))file=path.join(root,'index.html');if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.ttf':'font/ttf'}[path.extname(file)]||'application/octet-stream'));res.end(fs.readFileSync(file));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;let browser;
try{browser=await chromium.launch({headless:true,...(process.env.USTORE_TEST_CHROME?{executablePath:process.env.USTORE_TEST_CHROME}:{}),args:['--no-sandbox']});const results=[];
for(const viewport of [{width:1365,height:900},{width:390,height:844}]){
 const context=await browser.newContext({viewport});await context.addInitScript(()=>sessionStorage.setItem('ustore:web:session-token:v1','local-test-session'));
 const page=await context.newPage();page.setDefaultTimeout(10000);console.log(`Browser ${viewport.width}: admin create`);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const categories=[{id:'c1',name:'Sport',parent_id:null},{id:'c2',name:'Protein',parent_id:'c1'}];let product={id:'p1',name:'Protein',price:100,stock:8,category_id:'c2',variants:[],description:'Test'};let cart=[];const calls=[];
 await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===base)return route.continue();if(!url.pathname.includes('/functions/v1/'))return route.abort();if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':base,'access-control-allow-headers':'content-type,authorization','access-control-allow-methods':'POST,OPTIONS'}});const {action,payload={}}=route.request().postDataJSON();calls.push({action,payload});let data={};
 if(action==='resolve_web_tenant')data={tenant:{shopId:'s1',botId:'123',hostname:'127.0.0.1'}};
 else if(action==='boot')data={shop:{id:'s1',slug:'test',lifecycle:'ACTIVE'},shopContact:{name:'Test Shop'},webSession:{authenticated:true,actor:{accountId:'a1',displayName:'Owner',shopRole:'OWNER',roleCodes:['OWNER'],permissions:['*']}}};
 else if(action==='get_catalog')data={categories,products:[product]};
 else if(action==='get_admin_product_editor')data={product,categories};
 else if(action==='get_admin_products')data={products:[product],categories,page:1,pageSize:25,totalCount:1,totalPages:1};
 else if(action==='add_product'){product={...product,...payload,id:'p2'};data={product};}
 else if(action==='edit_product_field'){product={...product,[payload.field]:payload.value};data={product};}
 else if(action==='edit_category')data={category:{id:payload.categoryId,name:payload.name,parent_id:payload.parentId,img:payload.img||null}};
 else if(action==='get_last_import_batch')data={batch:null};
 else if(action==='billz_get_status')data={status:'DISCONNECTED'};
 else if(action==='get_report_overview')data={dateFrom:'2026-09-01',dateTo:'2026-09-24',totalSales:100,orderCount:1,totalUnitsSold:1,topProducts:[{name:'Протеин',unitsSold:1,revenue:100}]};
 else if(action==='web_cart_load')data={cart:{shopId:'s1',lines:cart}};
 else if(action==='web_cart_mutate'){const l=payload.line;if(payload.operation==='add')cart.push(l);else if(payload.operation==='clear')cart=[];else cart=cart.map(x=>x.lineKey===l.lineKey?{...x,quantity:l.quantity}:x).filter(x=>x.quantity);data={cart:{shopId:'s1',lines:cart}};}
 else if(action==='web_checkout_quote')data={quote:{subtotal:100,total:100,delivery:0,discount:0,currency:'UZS',serverAuthoritative:true}};
 await route.fulfill({status:200,headers:{'access-control-allow-origin':base},contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(base+'/admin/products/new?bot_id=123');await page.getByLabel(/^Nomi/).waitFor().catch(async e=>{console.error(await page.locator('body').innerText(),JSON.stringify(calls),errors);throw e;});
 await page.getByLabel(/^Nomi/).pressSequentially('New product');assert.equal(await page.getByLabel(/^Nomi/).inputValue(),'New product');
 await page.getByLabel('Narx',{exact:true}).fill('120');await page.getByLabel('Qoldiq',{exact:true}).fill('4');await page.getByLabel('Katalog',{exact:true}).selectOption('c2');
 await page.getByRole('button',{name:'Mahsulotni yaratish',exact:true}).click();await page.getByText('Mahsulot saqlandi.',{exact:true}).waitFor();assert.equal(calls.filter(x=>x.action==='add_product').length,1);
 console.log('category edit');await page.goto(base+'/admin/categories/c2/edit?bot_id=123');await page.getByLabel(/^Katalog nomi/).fill('New category');await page.getByRole('button',{name:'Saqlash',exact:true}).click();await page.getByText('Katalog saqlandi.',{exact:true}).waitFor();
 console.log('import');await page.goto(base+'/admin/imports?bot_id=123');await page.getByLabel('Excel fayl tanlash').waitFor();assert.equal(await page.evaluate(()=>typeof window.UstoreExcel.createInstance),'function');
 await page.getByLabel('Excel fayl tanlash').setInputFiles({name:'broken.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('not an xlsx')});
 await page.waitForFunction(()=>document.body.innerText.includes('Excel')&&!document.body.innerText.includes('Sahifa ochilmadi'));
 console.log('reports');await page.goto(base+'/admin/reports?bot_id=123');await page.getByRole('button',{name:'Excel',exact:true}).waitFor();
 const excelDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Excel',exact:true}).click();const x=await excelDownload;assert.match(x.suggestedFilename(),/\.xlsx$/);
 const pdfDownload=page.waitForEvent('download');await page.getByRole('button',{name:'PDF',exact:true}).click();const pdf=await pdfDownload;assert.match(pdf.suggestedFilename(),/\.pdf$/);
 const out=path.resolve('docs/web/review-evidence/predeploy');fs.mkdirSync(out,{recursive:true});if(viewport.width===1365){await x.saveAs('/tmp/ustore-browser-report.xlsx');await pdf.saveAs('/tmp/ustore-browser-report.pdf');}
 await page.goto(base+'/catalog?bot_id=123');
 if(viewport.width<768)await page.getByRole('button',{name:'Filtrlar',exact:true}).click();
 const category=page.locator('[data-category-id="c2"]:visible');await category.waitFor();await category.click();
 await page.waitForURL(url=>url.searchParams.get('category')==='c2');
 await page.locator('[data-category-id="c2"][data-active="true"]').first().waitFor({state:'attached'});
 assert.equal(await page.locator('[data-category-id="c2"][data-active="true"]').count(),2);
 assert.equal(errors.length,0,errors.join('\n'));results.push({viewport,adminCreate:true,categoryEdit:true,importAssets:true,xlsx:true,pdf:true,nestedCatalog:true});await context.close();
}
fs.mkdirSync('docs/web/review-evidence/predeploy',{recursive:true});fs.writeFileSync('docs/web/review-evidence/predeploy/browser.json',JSON.stringify({environment:'LOCAL_CHROMIUM_FIXTURE_BACKEND',results},null,2)+'\n');console.log(JSON.stringify(results));
}finally{await browser?.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
