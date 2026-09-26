const pending=new Map();
export function loadAdminAsset(path,globalName,doc=globalThis.document) {
  if(globalThis[globalName])return Promise.resolve(globalThis[globalName]);
  const url=new URL(`../../${path}`,import.meta.url).href;
  if(pending.has(url))return pending.get(url);
  const promise=new Promise((resolve,reject)=>{
    const script=doc.createElement('script');script.src=url;script.async=true;
    const timer=setTimeout(()=>finish(new Error(`${globalName} yuklanmadi`)),15000);
    function finish(error){clearTimeout(timer);script.onload=null;script.onerror=null;
      if(error){script.remove();reject(error);}else if(globalThis[globalName])resolve(globalThis[globalName]);else reject(new Error(`${globalName} mavjud emas`));}
    script.onload=()=>finish();script.onerror=()=>finish(new Error(`${globalName} yuklanmadi`));doc.head.appendChild(script);
  }).catch(error=>{pending.delete(url);throw error;});
  pending.set(url,promise);return promise;
}
export const loadImageIO=()=>loadAdminAsset('ustore-image-io.js','UstoreImageIO');
export async function loadExcelEngine(){
  await loadAdminAsset('vendor/exceljs.min.js','ExcelJS');
  const engine=await loadAdminAsset('excel-import.js','UstoreExcel');
  return engine.createInstance();
}

let reportPdfPending;
export function loadReportPdf(){
  if(!reportPdfPending)reportPdfPending=(async()=>{
    const pdf=await loadAdminAsset('vendor/jspdf.umd.min.js','jspdf');
    const response=await fetch(new URL('../../vendor/DejaVuSans.ttf',import.meta.url));
    if(!response.ok)throw new Error('Hisobot shrifti yuklanmadi.');
    const bytes=new Uint8Array(await response.arrayBuffer());let binary='';
    for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
    globalThis.UstoreReportFont=btoa(binary);return pdf;
  })().catch(error=>{reportPdfPending=null;throw error;});
  return reportPdfPending;
}
