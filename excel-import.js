// USTORE v3 — Excel import module. Lazy-loaded only for admins.
(() => {
  const EXCELJS_LOCAL = './vendor/exceljs.min.js?v=4.4.0';
  const EXCELJS_LOAD_TIMEOUT_MS = 9000;
  const state = {
    busy: false,
    busyText: '',
    file: null,
    fileName: '',
    fileHash: '',
    rows: [],
    issues: [],
    decisions: {},
    aliases: [],
    baseRowIssues: [],
    rowIssues: [],
    sourceRows: [],
    lastBatch: null,
    prepared: false,
    progressDone: 0,
    progressTotal: 0,
    templateStatus: null,
    result: null,
    editingRow: null,
    editSequential: false,
  };

  function esc(v) {
    try { return escapeHtml(v); } catch { return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  }
  function rerender() { try { render(); } catch (e) { console.error(e); } }
  function xl(uz, ru) {
    try { return (window.ustoreGetLang?.() === 'ru') ? ru : uz; } catch { return uz; }
  }
  function norm(v) {
    return String(v ?? '').trim().toLocaleLowerCase('uz')
      .replace(/[ʻʼ‘’`]/g, "'").replace(/\s+/g, ' ');
  }
  function normalizeCategorySegment(v) {
    return String(v ?? '').trim().replace(/[ʻʼ‘’`]/g, "'").replace(/\s+/g, ' ');
  }
  function parseCategoryPath(v) {
    return String(v ?? '').split('/').map(normalizeCategorySegment).filter(Boolean);
  }
  function pathKey(parts) { return (parts || []).map(norm).filter(Boolean).join('\u001f'); }
  function parentKey(v) { return v === null || v === undefined ? '' : String(v); }

  function levenshtein(a, b) {
    a = norm(a); b = norm(b);
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const prev = Array.from({length: b.length + 1}, (_,i) => i);
    const cur = new Array(b.length + 1);
    for (let i=1;i<=a.length;i++) {
      cur[0]=i;
      for (let j=1;j<=b.length;j++) cur[j]=Math.min(cur[j-1]+1, prev[j]+1, prev[j-1]+(a[i-1]===b[j-1]?0:1));
      for (let j=0;j<=b.length;j++) prev[j]=cur[j];
    }
    return prev[b.length];
  }
  function similarity(a,b) {
    const aa=norm(a), bb=norm(b); if (!aa && !bb) return 1;
    return 1 - levenshtein(aa,bb) / Math.max(aa.length,bb.length,1);
  }

  function ensureExcelJS() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (window.__ustoreExcelJsPromise) return window.__ustoreExcelJsPromise;
    window.__ustoreExcelJsPromise = new Promise((resolve,reject) => {
      const old=document.querySelector('script[data-ustore-exceljs="1"]'); if(old)old.remove();
      const sc=document.createElement('script'); sc.src=EXCELJS_LOCAL; sc.async=true; sc.dataset.ustoreExceljs='1';
      let finished=false;
      const finish=(error)=>{
        if(finished)return;finished=true;clearTimeout(timer);
        if(error){sc.remove();reject(error);return;}
        if(window.ExcelJS)resolve(window.ExcelJS);
        else reject(new Error(xl('Lokal ExcelJS yuklanmadi. GitHubga vendor faylini ham yuklang.','Локальный ExcelJS не загрузился. Загрузите vendor-файл в GitHub.')));
      };
      const timer=setTimeout(()=>finish(new Error(xl('Excel moduli 9 soniyada yuklanmadi. Internetni tekshiring.','Модуль Excel не загрузился за 9 секунд. Проверьте интернет.'))),EXCELJS_LOAD_TIMEOUT_MS);
      sc.onload=()=>finish();
      sc.onerror=()=>finish(new Error(xl('Lokal Excel modulini yuklab bo‘lmadi.','Не удалось загрузить локальный модуль Excel.')));
      document.head.appendChild(sc);
    }).catch(error=>{window.__ustoreExcelJsPromise=null;throw error;});
    return window.__ustoreExcelJsPromise;
  }

  function canUseTelegramDownload() {
    const webApp=window.Telegram?.WebApp;
    if(!webApp||typeof webApp.downloadFile!=='function')return false;
    return typeof webApp.isVersionAtLeast!=='function'||webApp.isVersionAtLeast('8.0');
  }
  function browserDownload(url,fileName,pendingWindow) {
    if(pendingWindow&&!pendingWindow.closed){pendingWindow.location.replace(url);return;}
    const a=document.createElement('a');a.href=url;a.download=fileName;a.target='_blank';a.rel='noopener';document.body.appendChild(a);a.click();a.remove();
  }
  function startTemplateDownload(url,fileName,pendingWindow) {
    if(!/^https:\/\//i.test(url))throw new Error(xl('Server xavfsiz HTTPS download URL qaytarmadi.','Сервер не вернул безопасный HTTPS URL.'));
    if(canUseTelegramDownload()){
      try{
        window.Telegram.WebApp.downloadFile({url,file_name:fileName},accepted=>{
          if(accepted===false){state.templateStatus={type:'info',message:xl('Yuklab olish bekor qilindi.','Загрузка отменена.')};rerender();}
        });
        return 'telegram';
      }catch(error){console.warn('Telegram native download failed, using browser fallback',error);}
    }
    browserDownload(url,fileName,pendingWindow);return 'browser';
  }
  async function downloadTemplate() {
    if(state.busy)return;
    const nativeDownload=canUseTelegramDownload();
    let pendingWindow=null;
    if(!nativeDownload){try{pendingWindow=window.open('about:blank','_blank');}catch{}}
    state.busy=true;state.busyText=xl('Shablon tayyorlanmoqda…','Шаблон готовится…');state.templateStatus=null;rerender();
    try{
      const data=await callApi('get_excel_template_url',{});
      const url=String(data?.url||'');const fileName=String(data?.fileName||'Tovar_import_shablon.xlsx');
      const mode=startTemplateDownload(url,fileName,pendingWindow);
      state.templateStatus={type:'success',message:mode==='telegram'?xl('Telegram yuklab olish oynasi ochildi.','Открыто окно загрузки Telegram.'):xl('Shablonni yuklab olish boshlandi.','Загрузка шаблона началась.')};
    }catch(e){
      if(pendingWindow&&!pendingWindow.closed)pendingWindow.close();
      console.error(e);state.templateStatus={type:'error',message:xl('Shablonni tayyorlab bo‘lmadi: ','Не удалось подготовить шаблон: ')+(e.message||e)};
    }finally{state.busy=false;state.busyText='';rerender();}
  }

  function cellText(cell) {
    const v=cell?.value;
    if(v===null||v===undefined)return '';
    if(typeof v==='object'){
      if(Array.isArray(v.richText))return v.richText.map(x=>x.text||'').join('');
      if('result' in v && v.result!==undefined)return String(v.result??'');
      if('text' in v)return String(v.text??'');
      if('hyperlink' in v && v.text)return String(v.text);
    }
    return String(v).trim();
  }
  function numValue(v) {
    if(typeof v==='number')return v;
    const s=String(v??'').replace(/\s/g,'').replace(/,/g,'.').replace(/[^0-9.\-]/g,'');
    const n=Number(s); return Number.isFinite(n)?n:NaN;
  }
  function makeRowIssue(severity, code, excelRow, message, suggestion) {
    return {severity,code,excelRow,message,suggestion};
  }
  function parseVariantDetails(sizeText,colorText,stockText,excelRow) {
    const issues=[]; const variants=[];
    const sizeTokens=String(sizeText||'').split('/').map(x=>x.trim()).filter(Boolean);
    const colorGroups=String(colorText||'').split('/').map(x=>x.trim()).filter(Boolean);
    const declaredSizes=new Map();
    const addError=(code,message,suggestion)=>issues.push(makeRowIssue('ERROR',code,excelRow,message,suggestion));
    const addWarning=(code,message,suggestion)=>issues.push(makeRowIssue('WARNING',code,excelRow,message,suggestion));

    for(const token of sizeTokens){
      const parts=token.split(',').map(x=>x.trim()); const size=parts[0]||'';
      if(!size){addError('SIZE_EMPTY',xl(`Qator ${excelRow}: o'lcham nomi bo'sh.`,`Строка ${excelRow}: пустое название размера.`),xl("Masalan: 48,2/50,5","Например: 48,2/50,5"));continue;}
      if(declaredSizes.has(norm(size))){addError('SIZE_DUPLICATE',xl(`Qator ${excelRow}: “${size}” o'lchami takrorlangan.`,`Строка ${excelRow}: размер «${size}» повторяется.`),xl("Takroriy o'lchamni olib tashlang.","Удалите повторяющийся размер."));continue;}
      let qty=null;
      if(parts.length>1){
        if(parts.length!==2||!/^\d+$/.test(parts[1]))addError('SIZE_QTY_INVALID',xl(`Qator ${excelRow}: “${token}” o'lcham miqdori noto'g'ri.`,`Строка ${excelRow}: неверное количество размера «${token}».`),xl("O'lcham,son ko'rinishida yozing: 48,2","Укажите в формате размер,количество: 48,2"));
        else qty=Number(parts[1]);
      }
      declaredSizes.set(norm(size),{size,qty});
    }

    if(colorGroups.length){
      const seenVariants=new Set(); const totalsBySize=new Map();
      for(const group of colorGroups){
        const parts=group.split(',').map(x=>x.trim()).filter(Boolean);
        const first=parts[0]||'';
        const looksLikeSizeGroup=parts.length>1&&!/[-–—]\s*\d+$/.test(first);
        const size=looksLikeSizeGroup?first:null;
        const colorParts=looksLikeSizeGroup?parts.slice(1):parts;
        if(sizeTokens.length&&!size){
          addError('COLOR_SIZE_MISSING',xl(`Qator ${excelRow}: “${group}” rang guruhida o'lcham ko'rsatilmagan.`,`Строка ${excelRow}: в группе цветов «${group}» не указан размер.`),xl("Masalan: 48,Qizil-1,Qora-2","Например: 48,Qizil-1,Qora-2"));
        }
        if(size&&sizeTokens.length&&!declaredSizes.has(norm(size))){
          addWarning('COLOR_SIZE_UNKNOWN',xl(`Qator ${excelRow}: ranglardagi “${size}” o'lchami O'lchami ustunida yo'q.`,`Строка ${excelRow}: размера «${size}» из цветов нет в столбце размеров.`),xl("O'lcham nomlarini bir xil yozing.","Напишите размеры одинаково."));
        }
        let validInGroup=0;
        for(const token of colorParts){
          const m=token.match(/^(.*?)[-–—]\s*(\d+)$/);
          if(!m||!m[1].trim()){
            addError('COLOR_QTY_INVALID',xl(`Qator ${excelRow}: “${token}” rang miqdori noto'g'ri.`,`Строка ${excelRow}: неверное количество цвета «${token}».`),xl("Rang-son ko'rinishida yozing: Qizil-3","Укажите в формате цвет-количество: Qizil-3"));continue;
          }
          const color=m[1].trim(),qty=Number(m[2]); const key=`${norm(size||'')}|${norm(color)}`;
          if(seenVariants.has(key)){
            addError('VARIANT_DUPLICATE',xl(`Qator ${excelRow}: “${[size,color].filter(Boolean).join(' / ')}” varianti takrorlangan.`,`Строка ${excelRow}: вариант «${[size,color].filter(Boolean).join(' / ')}» повторяется.`),xl("Takroriy variantni olib tashlang.","Удалите повторяющийся вариант."));continue;
          }
          seenVariants.add(key); variants.push({size:size||null,color,qty}); validInGroup++;
          const sizeKey=norm(size||''); totalsBySize.set(sizeKey,(totalsBySize.get(sizeKey)||0)+qty);
        }
        if(!validInGroup)addError('COLOR_GROUP_EMPTY',xl(`Qator ${excelRow}: “${group}” guruhida yaroqli rang topilmadi.`,`Строка ${excelRow}: в группе «${group}» нет корректного цвета.`),xl("Rang va sonni tekshiring.","Проверьте цвет и количество."));
      }
      for(const {size,qty} of declaredSizes.values()){
        if(qty===null)continue;
        const colorTotal=totalsBySize.get(norm(size))||0;
        if(qty!==colorTotal)addWarning('SIZE_COLOR_STOCK_MISMATCH',xl(`Qator ${excelRow}: ${size} o'lchami ${qty} ta, ranglar yig'indisi esa ${colorTotal} ta.`,`Строка ${excelRow}: размер ${size} — ${qty}, сумма цветов — ${colorTotal}.`),xl("O'lcham va rang miqdorlarini tenglashtiring.","Сделайте количества размеров и цветов одинаковыми."));
      }
    }else if(sizeTokens.length){
      for(const {size,qty} of declaredSizes.values()){
        if(qty===null){
          addError('SIZE_QTY_REQUIRED',xl(`Qator ${excelRow}: “${size}” o'lchami uchun son ko'rsatilmagan.`,`Строка ${excelRow}: для размера «${size}» не указано количество.`),xl("Faqat o'lchamli tovar uchun 48,2/50,5 ko'rinishida yozing.","Для товара только с размерами укажите 48,2/50,5."));
          variants.push({size,color:null,qty:0});
        }else variants.push({size,color:null,qty});
      }
    }

    const stockString=String(stockText??'').trim();
    let stock=null;
    if(stockString){
      const parsed=numValue(stockText);
      if(!Number.isFinite(parsed)||parsed<0||!Number.isInteger(parsed))addError('STOCK_INVALID',xl(`Qator ${excelRow}: Soni musbat butun son bo'lishi kerak.`,`Строка ${excelRow}: количество должно быть целым неотрицательным числом.`),xl("Masalan: 15","Например: 15"));
      else stock=parsed;
    }
    const variantTotal=variants.reduce((sum,v)=>sum+(Number(v.qty)||0),0);
    if(variants.length&&stock!==null&&stock!==variantTotal)addWarning('TOTAL_STOCK_MISMATCH',xl(`Qator ${excelRow}: Soni ${stock} ta, variantlar yig'indisi ${variantTotal} ta. Importda ${variantTotal} ta olinadi.`,`Строка ${excelRow}: количество ${stock}, сумма вариантов ${variantTotal}. При импорте будет ${variantTotal}.`),xl("Soni ustunini variantlar yig'indisiga tenglang yoki bo'sh qoldiring.","Сделайте общее количество равным сумме вариантов или оставьте пустым."));
    if(!variants.length&&stock===null)addError('STOCK_REQUIRED',xl(`Qator ${excelRow}: oddiy tovar uchun Soni ko'rsatilmagan.`,`Строка ${excelRow}: для обычного товара не указано количество.`),xl("Soni ustuniga 0 yoki undan katta butun son yozing.","Укажите в столбце количества целое число от 0."));
    return {variants,stock:variants.length?variantTotal:(stock??0),issues};
  }
  async function sha256Bytes(bytes) {
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  async function fingerprintImportRows(rows) {
    const realRows=(rows||[]).map(row=>({
      categoryPath:(row.categoryPath||[]).map(norm),name:norm(row.name),nameRu:norm(row.nameRu),
      price:Number(row.price),oldPrice:row.oldPrice===null?null:Number(row.oldPrice),stock:Number(row.stock),
      desc:String(row.desc||'').trim(),descRu:String(row.descRu||'').trim(),
      variants:(row.variants||[]).map(v=>({size:norm(v.size),color:norm(v.color),qty:Number(v.qty)||0})),
    }));
    return sha256Bytes(new TextEncoder().encode(JSON.stringify(realRows)));
  }

  function buildCategoryMaps() {
    const byParent=new Map();
    for(const c of categories){
      const k=parentKey(c.parentId);
      if(!byParent.has(k))byParent.set(k,[]);
      byParent.get(k).push(c);
    }
    const byId=new Map(categories.map(c=>[String(c.id),c]));
    const aliasMap=new Map((state.aliases||[]).map(a=>[`${parentKey(a.parent_category_id)}|${norm(a.alias_normalized)}`,String(a.target_category_id)]));
    return {byParent,byId,aliasMap};
  }

  function analyzeIssues(rows) {
    const {byParent,byId,aliasMap}=buildCategoryMaps();
    const issues=new Map();
    const paths=[...new Map(rows.map(r=>[pathKey(r.categoryPath),r.categoryPath])).values()];

    for(const rawPath of paths){
      let parentId=null; let virtualParent=null;
      for(let i=0;i<rawPath.length;i++){
        const rawName=rawPath[i]; const rawPrefix=rawPath.slice(0,i+1); const key=pathKey(rawPrefix);
        const decision=state.decisions[key];
        if(decision){
          if(decision.type==='existing'){ parentId=String(decision.targetCategoryId); virtualParent=null; }
          else { virtualParent='new:'+key; parentId=null; }
          continue;
        }
        if(virtualParent){
          issues.set(key,{key,type:'NEW',rawName,rawPath:rawPrefix,parentId:null,parentVirtual:virtualParent});
          virtualParent='new:'+key; parentId=null; continue;
        }
        const siblings=byParent.get(parentKey(parentId))||[];
        const exact=siblings.find(c=>norm(c.name)===norm(rawName));
        if(exact){ parentId=String(exact.id); continue; }
        const aliasTarget=aliasMap.get(`${parentKey(parentId)}|${norm(rawName)}`);
        if(aliasTarget && byId.get(aliasTarget)){ parentId=aliasTarget; continue; }
        let best=null,score=0;
        for(const c of siblings){const sc=similarity(rawName,c.name);if(sc>score){score=sc;best=c;}}
        if(best && score>=0.82){
          issues.set(key,{key,type:'TYPO',rawName,rawPath:rawPrefix,parentId,targetCategoryId:String(best.id),targetName:best.name,score});
          // tentative suggestion so child levels can still be checked
          parentId=String(best.id);
        }else{
          issues.set(key,{key,type:'NEW',rawName,rawPath:rawPrefix,parentId});
          virtualParent='new:'+key; parentId=null;
        }
      }
    }
    state.issues=[...issues.values()];
  }

  function resolveCanonicalPath(rawPath) {
    const {byParent,byId,aliasMap}=buildCategoryMaps();
    let parentId=null; let virtualParent=false; const canonical=[]; const newPaths=[]; const aliases=[];
    for(let i=0;i<rawPath.length;i++){
      const rawName=rawPath[i]; const key=pathKey(rawPath.slice(0,i+1)); const decision=state.decisions[key];
      if(decision?.type==='existing'){
        const target=byId.get(String(decision.targetCategoryId));
        if(!target)throw new Error(`Katalog topilmadi: ${decision.targetName||rawName}`);
        canonical.push(target.name);
        if(!virtualParent && norm(rawName)!==norm(target.name)) aliases.push({alias:rawName,parentCategoryId:parentId,targetCategoryId:String(target.id)});
        parentId=String(target.id); virtualParent=false; continue;
      }
      if(decision?.type==='new'){
        canonical.push(rawName); newPaths.push([...canonical]); parentId=null; virtualParent=true; continue;
      }
      if(virtualParent)throw new Error(`Yangi katalog tasdiqlanmagan: ${rawName}`);
      const siblings=byParent.get(parentKey(parentId))||[];
      const exact=siblings.find(c=>norm(c.name)===norm(rawName));
      if(exact){canonical.push(exact.name);parentId=String(exact.id);continue;}
      const aliasTarget=aliasMap.get(`${parentKey(parentId)}|${norm(rawName)}`);
      const aliasCat=aliasTarget?byId.get(aliasTarget):null;
      if(aliasCat){canonical.push(aliasCat.name);parentId=String(aliasCat.id);continue;}
      throw new Error(`Katalog qarori yetishmaydi: ${rawName}`);
    }
    return {canonical,newPaths,aliases};
  }

  function existingLeafId(rawPath) {
    const {byParent,byId,aliasMap}=buildCategoryMaps(); let parentId=null;
    for(let i=0;i<rawPath.length;i++){
      const rawName=rawPath[i]; const key=pathKey(rawPath.slice(0,i+1)); const decision=state.decisions[key];
      if(decision?.type==='new')return null;
      if(decision?.type==='existing'){
        if(!byId.has(String(decision.targetCategoryId)))return null;
        parentId=String(decision.targetCategoryId); continue;
      }
      const siblings=byParent.get(parentKey(parentId))||[];
      const exact=siblings.find(c=>norm(c.name)===norm(rawName));
      if(exact){parentId=String(exact.id);continue;}
      const aliasTarget=aliasMap.get(`${parentKey(parentId)}|${norm(rawName)}`);
      if(aliasTarget&&byId.has(aliasTarget)){parentId=aliasTarget;continue;}
      return null;
    }
    return parentId;
  }

  function analyzeRows() {
    const issues=[...(state.baseRowIssues||[])];
    const exactSeen=new Map(); const productSeen=new Map();
    const activeProducts=(products||[]).filter(p=>String(p.status||'').toUpperCase()!=='DELETED');
    for(const r of state.rows){
      if(r.price<0)issues.push(makeRowIssue('ERROR','PRICE_NEGATIVE',r.excelRow,xl(`Qator ${r.excelRow}: narx manfiy bo'lishi mumkin emas.`,`Строка ${r.excelRow}: цена не может быть отрицательной.`),xl("0 yoki undan katta narx yozing.","Укажите цену от 0.")));
      if(r.oldPriceRaw&&r.oldPrice===null)issues.push(makeRowIssue('ERROR','OLD_PRICE_INVALID',r.excelRow,xl(`Qator ${r.excelRow}: eski narx noto'g'ri.`,`Строка ${r.excelRow}: неверная старая цена.`),xl("Eski narxni son bilan yozing yoki bo'sh qoldiring.","Укажите старую цену числом или оставьте пустой.")));
      if(r.oldPrice!==null&&r.oldPrice<=r.price)issues.push(makeRowIssue('WARNING','OLD_PRICE_NOT_HIGHER',r.excelRow,xl(`Qator ${r.excelRow}: eski narx yangi narxdan katta emas; eski narx saqlanmaydi.`,`Строка ${r.excelRow}: старая цена не выше новой и не будет сохранена.`),xl("Chegirma bo'lsa eski narxni kattaroq yozing.","Для скидки укажите старую цену выше новой.")));

      const productKey=`${pathKey(r.categoryPath)}|${norm(r.name)}`;
      const exactKey=[productKey,r.price,r.oldPrice??'',r.stock,norm(r.nameRu),norm(r.desc),norm(r.descRu),norm(r.sizeText),norm(r.colorText)].join('|');
      const isExactDuplicate=exactSeen.has(exactKey);
      if(isExactDuplicate)issues.push(makeRowIssue('ERROR','ROW_DUPLICATE',r.excelRow,xl(`Qator ${r.excelRow}: ${exactSeen.get(exactKey)}-qator bilan aynan bir xil.`,`Строка ${r.excelRow}: полностью совпадает со строкой ${exactSeen.get(exactKey)}.`),xl("Takroriy qatorni olib tashlang.","Удалите повторяющуюся строку.")));
      else exactSeen.set(exactKey,r.excelRow);
      if(!productSeen.has(productKey))productSeen.set(productKey,r.excelRow);
      else if(!isExactDuplicate){
        const first=productSeen.get(productKey);
        if(first!==r.excelRow)issues.push(makeRowIssue('WARNING','PRODUCT_NAME_DUPLICATE',r.excelRow,xl(`Qator ${r.excelRow}: shu katalogda “${r.name}” nomi ${first}-qatorda ham bor.`,`Строка ${r.excelRow}: название «${r.name}» уже есть в строке ${first} этого каталога.`),xl("Bu alohida tovar ekanini tekshiring.","Проверьте, что это отдельный товар.")));
      }

      const leafId=existingLeafId(r.categoryPath);
      if(leafId&&activeProducts.some(p=>String(p.categoryId??p.category_id??'')===String(leafId)&&norm(p.name)===norm(r.name))){
        issues.push(makeRowIssue('WARNING','PRODUCT_EXISTS',r.excelRow,xl(`Qator ${r.excelRow}: “${r.name}” shu katalogda bazada mavjud bo'lishi mumkin.`,`Строка ${r.excelRow}: товар «${r.name}», возможно, уже есть в этом каталоге.`),xl("Admin katalogidagi mavjud tovarni tekshiring.","Проверьте существующий товар в админ-каталоге.")));
      }
    }
    state.rowIssues=issues;
  }

  function correctCategory(key) {
    const issue=state.issues.find(x=>x.key===key); if(!issue)return;
    const next=prompt(xl('Katalog nomini to‘g‘rilang:','Исправьте название каталога:'),issue.rawName);
    if(next===null)return; const corrected=normalizeCategorySegment(next);
    if(!corrected)return alert(xl("Katalog nomi bo'sh bo'lmasin.","Название каталога не должно быть пустым."));
    const level=issue.rawPath.length-1;
    for(const r of state.rows){
      if(pathKey(r.categoryPath.slice(0,level+1))===key)r.categoryPath[level]=corrected;
    }
    for(const r of state.sourceRows||[]){
      if(pathKey((r.categoryPath||[]).slice(0,level+1))===key)r.categoryPath[level]=corrected;
    }
    state.decisions={}; analyzeIssues(state.rows); analyzeRows(); rerender();
  }
  function acceptSuggestionAt(index){const issue=state.issues[Number(index)];if(issue)acceptSuggestion(issue.key);}
  function approveNewAt(index){const issue=state.issues[Number(index)];if(issue)approveNew(issue.key);}
  function correctCategoryAt(index){const issue=state.issues[Number(index)];if(issue)correctCategory(issue.key);}

  function openRowEditor(excelRow, sequential=false) {
    const rowNumber=Number(excelRow);
    if(!state.sourceRows.some(r=>r.excelRow===rowNumber))return;
    state.editingRow=rowNumber;
    state.editSequential=!!sequential;
    rerender();
  }
  function closeRowEditor(){state.editingRow=null;state.editSequential=false;rerender();}
  function openFirstErrorEditor(){
    const first=state.rowIssues.filter(x=>x.severity==='ERROR').map(x=>x.excelRow).sort((a,b)=>a-b)[0];
    if(first)openRowEditor(first,true);
  }
  function rebuildSourceRow(source) {
    const issues=[];
    const r=source.excelRow;
    const effective=Array.isArray(source.categoryPath)?source.categoryPath.map(normalizeCategorySegment).filter(Boolean):[];
    if(source.categoryGap)issues.push(makeRowIssue('ERROR','CATEGORY_GAP',r,xl(`Qator ${r}: katalog yo'lida yuqori bosqich bo'sh qolgan.`,`Строка ${r}: в пути каталога пропущен верхний уровень.`),xl("Bosh katalogdan boshlab yo'lni to'ldiring yoki yuqoridagi yo'lni davom ettiring.","Заполните путь от корневого каталога или продолжите путь сверху.")));
    if(!effective.length)issues.push(makeRowIssue('WARNING','CATEGORY_EMPTY',r,xl(`Qator ${r}: katalog ko'rsatilmagan; tovar bosh darajaga tushadi.`,`Строка ${r}: каталог не указан; товар попадёт на корневой уровень.`),xl("Kerak bo'lsa katalog yo'lini kiriting.","При необходимости укажите путь каталога.")));
    const name=String(source.name||'').trim();
    if(!name){
      issues.push(makeRowIssue('ERROR','NAME_REQUIRED',r,xl(`Qator ${r}: tovar nomi yo'q.`,`Строка ${r}: нет названия товара.`),xl("Tovar nomi ustunini to'ldiring.","Заполните название товара.")));
      return {row:null,issues};
    }
    const price=numValue(source.priceRaw);
    if(!String(source.priceRaw??'').trim()||!Number.isFinite(price)){
      issues.push(makeRowIssue('ERROR','PRICE_INVALID',r,xl(`Qator ${r}: narx noto'g'ri.`,`Строка ${r}: неверная цена.`),xl("Tovar narxini 0 yoki undan katta son bilan yozing.","Укажите цену товара числом от 0.")));
      return {row:null,issues};
    }
    const oldPrice=numValue(source.oldPriceRaw);
    const variantData=parseVariantDetails(source.sizeText,source.colorText,source.stockRaw,r);
    issues.push(...variantData.issues);
    return {row:{
      excelRow:r,categoryPath:effective,name,nameRu:source.nameRu||'',price,priceRaw:String(source.priceRaw??''),oldPriceRaw:String(source.oldPriceRaw??''),
      oldPrice:Number.isFinite(oldPrice)?oldPrice:null,stock:variantData.stock,desc:String(source.desc||''),descRu:source.descRu||'',
      variants:variantData.variants,sizeText:String(source.sizeText||''),colorText:String(source.colorText||'')
    },issues};
  }
  async function saveRowEditor() {
    const excelRow=Number(state.editingRow); const source=state.sourceRows.find(r=>r.excelRow===excelRow); if(!source)return;
    source.categoryPath=parseCategoryPath(document.getElementById('xe-path')?.value||''); source.categoryGap=false;
    source.name=document.getElementById('xe-name')?.value.trim()||'';
    source.priceRaw=document.getElementById('xe-price')?.value.trim()||'';
    source.oldPriceRaw=document.getElementById('xe-oldprice')?.value.trim()||'';
    source.stockRaw=document.getElementById('xe-stock')?.value.trim()||'';
    source.desc=document.getElementById('xe-desc')?.value.trim()||'';
    source.sizeText=document.getElementById('xe-size')?.value.trim()||'';
    source.colorText=document.getElementById('xe-color')?.value.trim()||'';
    const rebuilt=rebuildSourceRow(source);
    state.rows=state.rows.filter(r=>r.excelRow!==excelRow);
    if(rebuilt.row)state.rows.push(rebuilt.row);
    state.rows.sort((a,b)=>a.excelRow-b.excelRow);
    state.baseRowIssues=state.baseRowIssues.filter(x=>x.excelRow!==excelRow).concat(rebuilt.issues);
    state.decisions={};
    analyzeIssues(state.rows);analyzeRows();
    state.fileHash=await fingerprintImportRows(state.rows);
    if(state.editSequential){
      const next=state.rowIssues.filter(x=>x.severity==='ERROR'&&x.excelRow!==excelRow).map(x=>x.excelRow).sort((a,b)=>a-b)[0];
      state.editingRow=next||null;
      if(!next)state.editSequential=false;
    }else state.editingRow=null;
    rerender();
  }

  async function handleFile(event) {
    const file=event?.target?.files?.[0]; if(!file)return;
    state.busy=true;state.busyText=xl('Excel tekshirilmoqda...','Excel проверяется...');state.result=null;rerender();
    try{
      const ExcelJS=await ensureExcelJS();
      const aliasPromise=callApi('get_category_aliases',{}).catch(()=>({aliases:[]}));
      const [arrayBuffer,aliasData]=await Promise.all([file.arrayBuffer(),aliasPromise]);
      state.aliases=aliasData.aliases||[]; state.file=file; state.fileName=file.name; state.fileHash='';
      const wb=new ExcelJS.Workbook(); await wb.xlsx.load(arrayBuffer);
      const ws=wb.getWorksheet('Tovarlar')||wb.worksheets[0]; if(!ws)throw new Error(xl("Excel ichida Tovarlar varag'i topilmadi",'В Excel не найден лист Tovarlar'));

      const headerMap=new Map();
      ws.getRow(1).eachCell((cell,col)=>{headerMap.set(norm(cellText(cell)),col);});
      const findCol=(...names)=>{for(const n of names){const c=headerMap.get(norm(n));if(c)return c;}return null;};
      const pathCol=findCol("Katalog yo'li","Katalog yo‘li");
      const catCols=[];
      for(const [h,col] of headerMap.entries()){
        if(h==='bosh katalog')catCols.push({depth:0,col});
        else {const m=h.match(/^katalog\s*(\d+)$/);if(m)catCols.push({depth:Number(m[1]),col});}
      }
      catCols.sort((a,b)=>a.depth-b.depth);
      if(!pathCol&&!catCols.length)throw new Error(xl("Katalog yo'li yoki eski Bosh katalog / Katalog1 ustunlari topilmadi","Не найден столбец Katalog yo'li или старые Bosh katalog / Katalog1"));
      // 3.6: Excel'da endi manual RU ustunlari o'qilmaydi (bo'lsa ham e'tiborsiz
      // qoldiriladi) — RU tarjimasi importdan keyin serverda avtomatik bajariladi.
      const cols={
        name:findCol('Tovar nomi'), nameRu:null,
        price:findCol('Tovar narxi','Narxi'), oldPrice:findCol('Eski narxi'), stock:findCol('Soni'),
        desc:findCol('Izohi','Izoh'), descRu:null,
        size:findCol("O'lchami","O‘lchami"), color:findCol('Rang')
      };
      if(!cols.name||!cols.price)throw new Error(xl('Tovar nomi yoki Tovar narxi ustuni topilmadi','Не найден столбец названия или цены товара'));

      let metadataStartRow=null;let metadataTemplateId='';
      const metadataSheet=wb.getWorksheet('USTORE_META')||wb.getWorksheet('USTORE_META');
      if(metadataSheet){
        metadataSheet.eachRow(row=>{
          const key=norm(cellText(row.getCell(1)));
          if(key==='template_id')metadataTemplateId=cellText(row.getCell(2));
          if(key==='data_start_row'){
            const parsed=Number(cellText(row.getCell(2)));
            if(Number.isInteger(parsed)&&parsed>=2)metadataStartRow=parsed;
          }
        });
      }
      const isNewSinglePathTemplate=!!pathCol;
      const dataStartRow=isNewSinglePathTemplate
        ? ((metadataTemplateId==='USTORE_EXCEL_IMPORT_V1'||metadataTemplateId==='USTORE_EXCEL_IMPORT_V3')&&metadataStartRow
          ? Math.max(6,metadataStartRow)
          : metadataTemplateId==='USTORE_EXCEL_IMPORT_V2'&&metadataStartRow
            ? Math.max(5,metadataStartRow)
            : 2)
        : 2;

      let lastPath=[]; const rows=[]; const baseIssues=[]; const sourceRows=[];
      for(let r=dataStartRow;r<=ws.rowCount;r++){
        const row=ws.getRow(r);let effective;let categoryGap=false;
        if(pathCol){
          const parsedPath=parseCategoryPath(cellText(row.getCell(pathCol)));
          if(parsedPath.length)lastPath=[...parsedPath];
          effective=parsedPath.length?[...parsedPath]:[...lastPath];
        }else{
          const catVals=catCols.map(x=>normalizeCategorySegment(cellText(row.getCell(x.col))));
          const anyCat=catVals.some(Boolean);
          if(!anyCat)effective=[...lastPath];
          else{
            const deepest=catVals.reduce((m,v,i)=>v?i:m,-1);effective=[...lastPath];
            for(let i=0;i<=deepest;i++){
              if(catVals[i])effective[i]=catVals[i];
              else if(!effective[i]){effective[i]='';categoryGap=true;}
            }
            effective=effective.slice(0,deepest+1).filter(Boolean);lastPath=[...effective];
          }
        }
        const name=cellText(row.getCell(cols.name));
        const priceRaw=cellText(row.getCell(cols.price));
        const nameRu=cols.nameRu?cellText(row.getCell(cols.nameRu)):'';
        const oldPriceRaw=cols.oldPrice?cellText(row.getCell(cols.oldPrice)):'';
        const stockRaw=cols.stock?cellText(row.getCell(cols.stock)):'';
        const desc=cols.desc?cellText(row.getCell(cols.desc)):'';
        const descRu=cols.descRu?cellText(row.getCell(cols.descRu)):'';
        const sizeText=cols.size?cellText(row.getCell(cols.size)):'';
        const colorText=cols.color?cellText(row.getCell(cols.color)):'';
        const other=[nameRu,oldPriceRaw,stockRaw,desc,descRu,sizeText,colorText].join('');
        if(!name && !priceRaw && !other)continue;
        const source={excelRow:r,categoryPath:[...effective],categoryGap,name,nameRu,priceRaw,oldPriceRaw,stockRaw,desc,descRu,sizeText,colorText};
        sourceRows.push(source);
        if(categoryGap)baseIssues.push(makeRowIssue('ERROR','CATEGORY_GAP',r,xl(`Qator ${r}: katalog yo'lida yuqori bosqich bo'sh qolgan.`,`Строка ${r}: в пути каталога пропущен верхний уровень.`),xl("Bosh katalogdan boshlab yo'lni to'ldiring yoki yuqoridagi yo'lni davom ettiring.","Заполните путь от корневого каталога или продолжите путь сверху.")));
        if(!effective.length)baseIssues.push(makeRowIssue('WARNING','CATEGORY_EMPTY',r,xl(`Qator ${r}: katalog ko'rsatilmagan; tovar bosh darajaga tushadi.`,`Строка ${r}: каталог не указан; товар попадёт на корневой уровень.`),xl("Kerak bo'lsa katalog yo'lini kiriting.","При необходимости укажите путь каталога.")));
        if(!name){baseIssues.push(makeRowIssue('ERROR','NAME_REQUIRED',r,xl(`Qator ${r}: tovar nomi yo'q.`,`Строка ${r}: нет названия товара.`),xl("Tovar nomi ustunini to'ldiring.","Заполните название товара.")));continue;}
        const price=numValue(row.getCell(cols.price).value);
        if(!priceRaw||!Number.isFinite(price)){baseIssues.push(makeRowIssue('ERROR','PRICE_INVALID',r,xl(`Qator ${r}: narx noto'g'ri.`,`Строка ${r}: неверная цена.`),xl("Tovar narxini 0 yoki undan katta son bilan yozing.","Укажите цену товара числом от 0.")));continue;}
        const oldPrice=cols.oldPrice?numValue(row.getCell(cols.oldPrice).value):NaN;
        const variantData=parseVariantDetails(sizeText,colorText,stockRaw,r);
        baseIssues.push(...variantData.issues);
        rows.push({
          excelRow:r,categoryPath:effective,name,nameRu,price,priceRaw,oldPriceRaw,
          oldPrice:Number.isFinite(oldPrice)?oldPrice:null,stock:variantData.stock,desc,descRu,
          variants:variantData.variants,sizeText,colorText
        });
      }
      if(!rows.length&&!baseIssues.length)throw new Error(xl('Import qilinadigan tovar topilmadi','Товары для импорта не найдены'));
      state.fileHash=await fingerprintImportRows(rows);
      state.rows=rows;state.sourceRows=sourceRows;state.baseRowIssues=baseIssues;state.decisions={};
      state.editingRow=null;state.editSequential=false;
      analyzeIssues(rows);analyzeRows();
    }catch(e){console.error(e);alert(xl("❌ Excelni o'qishda xatolik: ",'❌ Ошибка чтения Excel: ')+(e.message||e));state.rows=[];state.issues=[];state.baseRowIssues=[];state.rowIssues=[];state.sourceRows=[];}
    finally{state.busy=false;state.busyText='';rerender();}
  }

  function acceptSuggestion(key) {
    const issue=state.issues.find(x=>x.key===key); if(!issue||!issue.targetCategoryId)return;
    state.decisions[key]={type:'existing',targetCategoryId:issue.targetCategoryId,targetName:issue.targetName};
    analyzeIssues(state.rows);analyzeRows();rerender();
  }
  function approveNew(key) {
    const issue=state.issues.find(x=>x.key===key); if(!issue)return;
    state.decisions[key]={type:'new',name:issue.rawName}; analyzeIssues(state.rows);analyzeRows();rerender();
  }
  function reset() {
    Object.assign(state,{busy:false,busyText:'',file:null,fileName:'',fileHash:'',rows:[],issues:[],decisions:{},baseRowIssues:[],rowIssues:[],sourceRows:[],progressDone:0,progressTotal:0,templateStatus:null,result:null,editingRow:null,editSequential:false});rerender();
  }

  function downloadErrorRowsCsv() {
    const errors=state.rowIssues.filter(x=>x.severity==='ERROR'); if(!errors.length)return;
    const byRow=new Map();
    for(const issue of errors){if(!byRow.has(issue.excelRow))byRow.set(issue.excelRow,[]);byRow.get(issue.excelRow).push(issue);}
    const headers=['Excel qatori',"Katalog yo'li",'Tovar nomi','Tovar narxi','Eski narxi','Soni','Izohi',"O'lchami",'Rang','Xato sababi','Tuzatish tavsiyasi'];
    const quote=v=>`"${String(v??'').replace(/"/g,'""')}"`;
    const lines=[headers.map(quote).join(',')];
    for(const src of state.sourceRows){
      const found=byRow.get(src.excelRow); if(!found)continue;
      lines.push([src.excelRow,(src.categoryPath||[]).join(' / '),src.name,src.priceRaw,src.oldPriceRaw,src.stockRaw,src.desc,src.sizeText,src.colorText,found.map(x=>x.message).join(' | '),found.map(x=>x.suggestion).join(' | ')].map(quote).join(','));
    }
    const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=`${(state.fileName||'Tovar_import').replace(/\.xlsx$/i,'')}_xato_qatorlar.csv`; document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }

  async function doImport() {
    if(state.busy)return;
    if(!state.rows.length)return alert(xl('Avval Excel faylni tanlang.','Сначала выберите файл Excel.'));
    analyzeIssues(state.rows);analyzeRows();
    if(state.issues.length)return alert(`⚠️ ${state.issues.length} ${xl('ta katalog masalasini avval hal qiling.','вопросов по каталогам: сначала решите их.')}`);
    const blocking=state.rowIssues.filter(x=>x.severity==='ERROR');
    if(blocking.length)return alert(`❌ ${blocking.length} ${xl('ta qator xatosini avval tuzating.','ошибок строк: сначала исправьте их.')}`);
    state.busy=true;state.progressDone=0;state.progressTotal=state.rows.length;state.busyText=xl(`Tovarlar import qilinmoqda: 0 / ${state.rows.length}`,`Импорт товаров: 0 / ${state.rows.length}`);state.result=null;rerender();
    let batchId=null;
    try{
      const prepared=[]; const approvedMap=new Map(); const aliasMap=new Map();
      for(const r of state.rows){
        const resolved=resolveCanonicalPath(r.categoryPath);
        for(const p of resolved.newPaths)approvedMap.set(pathKey(p),p);
        for(const a of resolved.aliases)aliasMap.set(`${parentKey(a.parentCategoryId)}|${norm(a.alias)}`,a);
        prepared.push({excelRow:r.excelRow,categoryPath:resolved.canonical,name:r.name,nameRu:r.nameRu||null,price:r.price,oldPrice:r.oldPrice,stock:r.stock,desc:r.desc,descRu:r.descRu||null,variants:r.variants});
      }
      const chunks=[];for(let i=0;i<prepared.length;i+=75)chunks.push(prepared.slice(i,i+75));
      const started=await callApi('start_import_batch',{fileName:state.fileName,fileHash:state.fileHash,totalRows:prepared.length});
      batchId=Number(started.batchId);
      if(!batchId)throw new Error('import_batch_start_failed');
      state.lastBatch={id:batchId,fileName:state.fileName,status:'IN_PROGRESS',totalRows:prepared.length,importedRows:0};
      let imported=0; const createdCats=[]; const importedProducts=[];
      for(let i=0;i<chunks.length;i++){
        const data=await callApi('bulk_import_products',{
          rows:chunks[i],approvedNewPaths:[...approvedMap.values()],aliases:i===0?[...aliasMap.values()]:[],
          batchId,isFinal:i===chunks.length-1,offset:imported
        });
        batchId=data.batchId; imported+=Number(data.imported)||0;
        state.progressDone=imported;state.busyText=xl(`Tovarlar import qilinmoqda: ${imported} / ${prepared.length}`,`Импорт товаров: ${imported} / ${prepared.length}`);
        state.lastBatch={...state.lastBatch,importedRows:imported,status:i===chunks.length-1?'COMPLETED':'IN_PROGRESS'};
        (data.categories||[]).forEach(c=>{createdCats.push(c);try{upsertLocalCategory(c);}catch{}});
        (data.products||[]).forEach(p=>{importedProducts.push(p);try{upsertLocalProduct(p);}catch{}});
        rerender();
      }
      try{saveCatalogCache();}catch{}
      const uniqueCategories=new Set(createdCats.map(c=>String(c.id))).size;
      state.result={ok:true,batchId,imported,createdCategories:uniqueCategories,rasmsiz:importedProducts.filter(p=>!p.img).length,warnings:state.rowIssues.filter(x=>x.severity==='WARNING').length};
      state.lastBatch={...state.lastBatch,status:'COMPLETED',importedRows:imported};
      setTimeout(()=>{
        if(state.result?.ok&&activePopupModal==='EXCEL_IMPORT'){
          activePopupModal=null;
          try{saveCatalogCache();}catch{}
          render();
        }
      },1500);
    }catch(e){
      console.error(e);
      let autoRolledBack=false;
      if(batchId){try{await callApi('rollback_import_batch',{batchId});autoRolledBack=true;}catch(re){console.error('auto rollback failed',re);}}
      const raw=e.message||String(e); const serverRows=Array.isArray(e.details?.errors)?e.details.errors:[];
      const serverMessage=serverRows.length?serverRows.slice(0,10).map(x=>xl(`Qator ${x.row}: ${x.error}`,`Строка ${x.row}: ${x.error}`)).join(' · '):'';
      const friendly=raw==='duplicate_import'?xl('Bu fayl avval muvaffaqiyatli import qilingan. Duplicate import bloklandi.','Этот файл уже успешно импортирован. Повторный импорт заблокирован.'):raw==='import_in_progress'?xl('Bu fayl bo‘yicha import allaqachon ketmoqda. Ikkinchi import bloklandi.','Импорт этого файла уже выполняется. Повторный запуск заблокирован.'):(serverMessage||raw);
      state.result={ok:false,batchId,error:autoRolledBack?friendly:`${friendly}${batchId?xl(' Avtomatik rollback tugamadi; batchni qo‘lda bekor qiling.',' Автоматический откат не завершён; отмените batch вручную.'):''}`,rolledBack:autoRolledBack};
      if(batchId)state.lastBatch={...state.lastBatch,status:autoRolledBack?'ROLLED_BACK':'FAILED'};
      else if(raw==='import_in_progress'){try{const last=await callApi('get_last_import_batch',{});state.lastBatch=last.batch||state.lastBatch;}catch{}}
    }finally{state.busy=false;state.busyText='';state.progressDone=0;state.progressTotal=0;rerender();}
  }

  async function rollbackBatch() {
    if(state.busy)return;
    const id=state.result?.batchId||state.lastBatch?.id; if(!id)return;
    if(!confirm(xl(`Import #${id} bekor qilinsinmi? Shu importdagi tovarlar o'chiriladi.`,`Отменить импорт #${id}? Товары из этого импорта будут удалены.`)))return;
    state.busy=true;state.busyText=xl('Import bekor qilinmoqda...','Импорт отменяется...');rerender();
    try{await callApi('rollback_import_batch',{batchId:id});state.result={...(state.result||{}),batchId:id,rolledBack:true,ok:false,error:xl('Import admin tomonidan bekor qilindi','Импорт отменён администратором')};state.lastBatch={...(state.lastBatch||{}),id,status:'ROLLED_BACK'};await loadCatalog();}
    catch(e){alert(xl('❌ Bekor qilishda xato: ','❌ Ошибка отмены: ')+(e.message||e));}
    finally{state.busy=false;state.busyText='';rerender();}
  }

  function renderModal() {
    const errors=state.rowIssues.filter(x=>x.severity==='ERROR');
    const warnings=state.rowIssues.filter(x=>x.severity==='WARNING');
    const errorRows=new Set(errors.map(x=>x.excelRow));
    const readyRows=state.rows.filter(r=>!errorRows.has(r.excelRow)).length;
    const newCategoryCount=state.issues.filter(x=>x.type==='NEW').length+Object.values(state.decisions).filter(x=>x.type==='new').length;
    const similarCount=state.issues.filter(x=>x.type==='TYPO').length;
    const duplicateCount=state.rowIssues.filter(x=>['ROW_DUPLICATE','PRODUCT_NAME_DUPLICATE','PRODUCT_EXISTS','VARIANT_DUPLICATE','SIZE_DUPLICATE'].includes(x.code)).length;
    const mismatchCount=state.rowIssues.filter(x=>String(x.code).includes('MISMATCH')).length;
    const issueHtml=state.issues.map((issue,index)=>{
      if(issue.type==='TYPO')return `
        <div class="border border-amber-300 bg-amber-50 rounded-2xl p-3 space-y-2">
          <p class="font-bold text-amber-900">⚠️ ${xl("O'xshash katalog topildi",'Найден похожий каталог')}</p>
          <p><b>${esc(issue.rawName)}</b> → <b class="text-blue-700">${esc(issue.targetName)}</b> <span class="text-gray-400">(${Math.round(issue.score*100)}%)</span></p>
          <p class="text-[10px] text-gray-500">${xl("Yo'l",'Путь')}: ${esc(issue.rawPath.join(' / '))}</p>
          <div class="grid grid-cols-1 gap-2"><button onclick="UstoreExcel.acceptSuggestionAt(${index})" class="bg-blue-600 text-white py-2 rounded-xl font-bold">✅ ${xl('Mavjud katalogni tanlash','Выбрать существующий каталог')}</button><button onclick="UstoreExcel.correctCategoryAt(${index})" class="bg-white border border-slate-300 text-slate-700 py-2 rounded-xl font-bold">✏️ ${xl("Nomni qo'lda to'g'rilash",'Исправить название вручную')}</button><button onclick="UstoreExcel.approveNewAt(${index})" class="bg-white border border-amber-400 text-amber-800 py-2 rounded-xl font-bold">➕ ${xl('Ataylab yangi yaratish','Создать как новый')}</button></div>
        </div>`;
      return `
        <div class="border border-blue-200 bg-blue-50 rounded-2xl p-3 space-y-2">
          <p class="font-bold text-blue-900">🆕 ${xl('Yangi katalog topildi','Найден новый каталог')}</p>
          <p><b>${esc(issue.rawName)}</b></p><p class="text-[10px] text-gray-500">${xl("Yo'l",'Путь')}: ${esc(issue.rawPath.join(' / '))}</p>
          <div class="grid grid-cols-1 gap-2"><button onclick="UstoreExcel.correctCategoryAt(${index})" class="bg-white border border-slate-300 text-slate-700 py-2 rounded-xl font-bold">✏️ ${xl("Nomni qo'lda to'g'rilash",'Исправить название вручную')}</button><button onclick="UstoreExcel.approveNewAt(${index})" class="bg-blue-600 text-white py-2 rounded-xl font-bold">✅ ${xl('Yangi katalog sifatida tasdiqlash','Подтвердить как новый каталог')}</button></div>
        </div>`;
    }).join('');
    const issuesByRow=new Map();
    for(const item of [...errors,...warnings]){if(!issuesByRow.has(item.excelRow))issuesByRow.set(item.excelRow,[]);issuesByRow.get(item.excelRow).push(item);}
    const rowIssueHtml=[...issuesByRow.entries()].sort((a,b)=>a[0]-b[0]).slice(0,50).map(([excelRow,items])=>{
      const hasError=items.some(x=>x.severity==='ERROR');
      return `<div class="${hasError?'bg-red-50 border-red-200 text-red-900':'bg-amber-50 border-amber-200 text-amber-900'} border rounded-xl p-2 space-y-1"><div class="flex items-center justify-between gap-2"><p class="font-black">${hasError?'❌':'⚠️'} ${xl('Qator','Строка')} ${excelRow}</p><button onclick="UstoreExcel.openRowEditor(${excelRow})" class="bg-white border border-current px-2.5 py-1 rounded-lg font-bold">✏️ ${xl('Tuzatish','Исправить')}</button></div>${items.map(x=>`<div><p class="font-bold">${esc(x.message)}</p><p class="text-[10px] opacity-75">${esc(x.suggestion)}</p></div>`).join('')}</div>`;
    }).join('');
    const uniquePaths=new Set(state.rows.map(r=>pathKey(r.categoryPath))).size;
    const progressPercent=state.progressTotal?Math.min(100,Math.round(state.progressDone/state.progressTotal*100)):0;
    const canRollbackLast=(!state.result||(!state.result.ok&&!state.result.batchId))&&state.lastBatch?.id&&['COMPLETED','IN_PROGRESS','FAILED'].includes(state.lastBatch?.status);
    const editSource=state.sourceRows.find(r=>r.excelRow===Number(state.editingRow));
    const editorHtml=editSource?`<div class="bg-slate-50 border border-slate-300 rounded-2xl p-3 space-y-2"><div class="flex items-center justify-between"><h4 class="font-black">✏️ ${xl('Qatorni tuzatish','Исправление строки')} ${editSource.excelRow}</h4><button onclick="UstoreExcel.closeRowEditor()" class="bg-white border px-2 py-1 rounded-lg font-bold">✕</button></div><div><label class="font-bold">${xl("Katalog yo'li","Katalog yo'li")}</label><input id="xe-path" value="${esc((editSource.categoryPath||[]).join(' / '))}" class="w-full mt-1 p-2 border rounded-xl"></div><div><label class="font-bold">${xl('Tovar nomi','Название товара')}</label><input id="xe-name" value="${esc(editSource.name||'')}" class="w-full mt-1 p-2 border rounded-xl"></div><div class="grid grid-cols-2 gap-2"><div><label class="font-bold">${xl('Narx','Цена')}</label><input id="xe-price" inputmode="decimal" value="${esc(editSource.priceRaw||'')}" class="w-full mt-1 p-2 border rounded-xl"></div><div><label class="font-bold">${xl('Eski narx','Старая цена')}</label><input id="xe-oldprice" inputmode="decimal" value="${esc(editSource.oldPriceRaw||'')}" class="w-full mt-1 p-2 border rounded-xl"></div></div><div><label class="font-bold">${xl('Soni','Количество')}</label><input id="xe-stock" inputmode="numeric" value="${esc(editSource.stockRaw||'')}" class="w-full mt-1 p-2 border rounded-xl"></div><div><label class="font-bold">${xl('Izoh','Описание')}</label><textarea id="xe-desc" rows="2" class="w-full mt-1 p-2 border rounded-xl">${esc(editSource.desc||'')}</textarea></div><div><label class="font-bold">${xl("O'lchami",'Размер')}</label><input id="xe-size" value="${esc(editSource.sizeText||'')}" class="w-full mt-1 p-2 border rounded-xl"></div><div><label class="font-bold">${xl('Rang','Цвет')}</label><input id="xe-color" value="${esc(editSource.colorText||'')}" class="w-full mt-1 p-2 border rounded-xl"></div><button onclick="UstoreExcel.saveRowEditor()" class="w-full bg-blue-600 text-white font-black py-2.5 rounded-xl">✅ ${xl('Saqlash va qayta tekshirish','Сохранить и перепроверить')}</button></div>`:'';
    return `
      <div class="fc-excel-overlay" onclick="activePopupModal=null; render();">
        <div class="fc-excel-modal" onclick="event.stopPropagation()">
          <div class="fc-excel-header"><div><div class="fc-excel-title-icon">XLSX</div><div class="fc-excel-heading"><h3>${xl('Excel orqali tovar importi','Импорт товаров из Excel')}</h3><p>${xl('Xavfsiz preview + katalog typo tekshiruvi','Безопасный предпросмотр + проверка опечаток каталогов')}</p></div></div><button onclick="activePopupModal=null;render();" class="fc-excel-close" aria-label="${xl('Yopish','Закрыть')}">✕</button></div>
          ${state.busy?`<div class="fc-excel-busy"><div class="w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div><b>${esc(state.busyText||xl('Bajarilmoqda...','Выполняется...'))}</b>${state.progressTotal?`<div class="mt-3 h-2 bg-blue-100 rounded-full overflow-hidden"><div class="h-full bg-blue-600 transition-all" style="width:${progressPercent}%"></div></div><p class="mt-1 text-[10px] text-blue-700">${progressPercent}%</p>`:''}</div>`:''}
          ${editorHtml}
          <div class="fc-excel-primary-actions">
            <button onclick="UstoreExcel.downloadTemplate()" ${state.busy?'disabled':''} class="fc-excel-template-btn"><span>↓</span>${xl('Yangi shablon','Новый шаблон')}</button>
            <label class="fc-excel-file-btn ${state.busy?'is-disabled':''}"><span>↑</span>${xl('Excel tanlash','Выбрать Excel')}<input type="file" accept=".xlsx" class="hidden" onchange="UstoreExcel.handleFile(event)" ${state.busy?'disabled':''}></label>
          </div>
          ${state.templateStatus?`<div class="${state.templateStatus.type==='error'?'bg-red-50 border-red-200 text-red-800':state.templateStatus.type==='success'?'bg-emerald-50 border-emerald-200 text-emerald-800':'bg-slate-50 border-slate-200 text-slate-700'} border rounded-2xl p-3 font-bold">${state.templateStatus.type==='error'?'❌':state.templateStatus.type==='success'?'✅':'ℹ️'} ${esc(state.templateStatus.message)}</div>`:''}
          <div class="fc-excel-hint">💡 ${xl("Shablonda mavjud to'liq yo'llar <b>Kataloglar</b> varag'ida ko'rinadi va <b>Katalog yo'li</b> ustunida dropdown bor. 2–4-qatorlar namuna, 5-qator ogohlantirish, import 6-qatordan boshlanadi. Katalog yo'li bo'sh qolsa, <b>yuqoridagi oxirgi yo'l davom etadi</b>.","Полные пути видны на листе <b>Kataloglar</b>, а в столбце <b>Katalog yo'li</b> есть список. Строки 2–4 — примеры, строка 5 — предупреждение, импорт начинается со строки 6. Если путь пуст, <b>продолжается последний путь сверху</b>.")}</div>
          ${state.fileName?`<div class="bg-white border border-slate-200 rounded-2xl p-3 space-y-2"><p><b>${xl('Fayl','Файл')}:</b> ${esc(state.fileName)}</p><div class="grid grid-cols-3 gap-1 text-center"><div class="bg-slate-50 rounded-xl p-2"><b class="block text-base">${state.sourceRows.length}</b>${xl('jami qator','всего строк')}</div><div class="bg-emerald-50 rounded-xl p-2"><b class="block text-base text-emerald-700">${readyRows}</b>${xl('tayyor','готово')}</div><div class="bg-red-50 rounded-xl p-2"><b class="block text-base text-red-700">${errors.length}</b>${xl('xato','ошибок')}</div><div class="bg-amber-50 rounded-xl p-2"><b class="block text-base text-amber-700">${warnings.length}</b>${xl('ogohlantirish','предупр.')}</div><div class="bg-blue-50 rounded-xl p-2"><b class="block text-base text-blue-700">${newCategoryCount}</b>${xl('yangi katalog','новых каталогов')}</div><div class="bg-violet-50 rounded-xl p-2"><b class="block text-base text-violet-700">${similarCount}</b>${xl("o'xshash nom",'похожих имён')}</div></div><p class="text-[10px] text-slate-500">${xl("Katalog yo'llari",'Пути каталогов')}: ${uniquePaths} · ${xl('Duplicate belgilar','Признаки дублей')}: ${duplicateCount} · ${xl('Variant qoldiq farqi','Расхождения остатков')}: ${mismatchCount}</p></div>`:''}
          ${rowIssueHtml?`<div class="space-y-2"><div class="flex items-center justify-between gap-2"><h4 class="font-black">${xl('Qator tekshiruvi','Проверка строк')}</h4><div class="flex gap-1">${errors.length?`<button onclick="UstoreExcel.openFirstErrorEditor()" class="bg-blue-600 text-white px-2 py-1.5 rounded-xl font-bold">✏️ ${xl('Barcha xatolar','Все ошибки')}</button><button onclick="UstoreExcel.downloadErrorRowsCsv()" class="bg-red-600 text-white px-2 py-1.5 rounded-xl font-bold">⬇️ CSV</button>`:''}</div></div><div class="space-y-1 max-h-64 overflow-y-auto">${rowIssueHtml}</div>${issuesByRow.size>50?`<p class="text-[10px] text-gray-500">+ ${issuesByRow.size-50} ${xl('ta boshqa qator','других строк')}</p>`:''}</div>`:''}
          ${issueHtml?`<div class="space-y-2"><h4 class="font-black">${xl('Katalog qarorlari','Решения по каталогам')}</h4>${issueHtml}</div>`:''}
          ${state.rows.length && !state.issues.length && !errors.length?`<div class="bg-green-50 border border-green-200 rounded-2xl p-3"><p class="font-bold text-green-800">✅ ${xl('Preview tekshirildi. Importga tayyor.','Предпросмотр проверен. Готово к импорту.')}</p><p class="text-[10px] text-green-700">${warnings.length?xl(`${warnings.length} ta ogohlantirish importni bloklamaydi.`,`${warnings.length} предупреждений не блокируют импорт.`):''} ${xl("Rasmlar import qilinmaydi; keyin 'rasmi yo'q' filtri orqali qo'shiladi.","Изображения не импортируются; их можно добавить через фильтр «без изображения».")}</p></div>`:''}
          ${state.result?`<div class="${state.result.ok?'bg-emerald-50 border-emerald-200':'bg-red-50 border-red-200'} border rounded-2xl p-3 space-y-1"><p class="font-black">${state.result.ok?xl('✅ Import tugadi','✅ Импорт завершён'):xl('❌ Import tugamadi','❌ Импорт не завершён')}</p>${state.result.ok?`<p>${state.result.imported} ${xl('ta tovar','товаров')} · ${state.result.createdCategories} ${xl('ta yangi katalog','новых каталогов')} · ${state.result.rasmsiz} ${xl('ta rasmsiz','без изображений')} · ${state.result.warnings||0} ${xl('ta ogohlantirish','предупреждений')}</p>`:`<p>${esc(state.result.error||xl('Xato','Ошибка'))}</p>`}${state.result.batchId?`<p class="font-mono text-[10px]">Batch #${state.result.batchId}</p>`:''}${state.result.batchId&&!state.result.rolledBack?`<button onclick="UstoreExcel.rollbackBatch()" class="mt-2 w-full bg-red-600 text-white py-2 rounded-xl font-bold">↩️ ${xl('Shu importni bekor qilish','Отменить этот импорт')}</button>`:''}</div>`:''}
          ${canRollbackLast?`<div class="bg-slate-50 border border-slate-200 rounded-2xl p-3"><p class="font-bold">${xl('Oxirgi import','Последний импорт')}: #${state.lastBatch.id}</p><p class="text-[10px] text-slate-500">${esc(state.lastBatch.fileName||'')} · ${state.lastBatch.importedRows||state.lastBatch.totalRows||0} ${xl('ta tovar','товаров')}</p><button onclick="UstoreExcel.rollbackBatch()" class="mt-2 w-full bg-red-600 text-white py-2 rounded-xl font-bold">↩️ ${xl('Oxirgi importni bekor qilish','Отменить последний импорт')}</button></div>`:''}
          <div class="flex gap-2 pt-1">${state.rows.length?`<button onclick="UstoreExcel.doImport()" ${state.busy||state.issues.length||errors.length?'disabled':''} class="flex-1 ${state.issues.length||errors.length?'bg-gray-200 text-gray-400':'bg-green-600 text-white'} font-black py-3 rounded-xl">✅ ${state.rows.length} ${xl('ta tovarni import qilish','товаров: импортировать')}</button>`:''}<button onclick="UstoreExcel.reset()" ${state.busy?'disabled':''} class="bg-gray-100 text-gray-700 font-bold px-4 py-3 rounded-xl">${xl('Tozalash','Очистить')}</button></div>
        </div>
      </div>`;
  }

  async function prepare(){
    if(state.prepared)return true; state.prepared=true;
    try{const data=await callApi('get_last_import_batch',{});state.lastBatch=data.batch||null;}
    catch(e){console.warn('Last import batch unavailable',e);}
    return true;
  }
  window.UstoreExcel={prepare,renderModal,downloadTemplate,handleFile,acceptSuggestionAt,approveNewAt,correctCategoryAt,downloadErrorRowsCsv,openRowEditor,closeRowEditor,openFirstErrorEditor,saveRowEditor,doImport,rollbackBatch,reset,state,__test:{parseVariantDetails,parseCategoryPath,fingerprintImportRows,rebuildSourceRow}};
})();
