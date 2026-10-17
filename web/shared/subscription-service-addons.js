/* Shared Web/Mini App presentation model. Server validates and prices again. */
(function () {
  function secureUuid(cryptoRef=globalThis.crypto) {
    if(typeof cryptoRef?.randomUUID==='function')return cryptoRef.randomUUID();
    if(typeof cryptoRef?.getRandomValues!=='function')throw Error('Secure random generator unavailable');
    const bytes=new Uint8Array(16);cryptoRef.getRandomValues(bytes);
    bytes[6]=(bytes[6]&0x0f)|0x40;bytes[8]=(bytes[8]&0x3f)|0x80;
    const hex=Array.from(bytes,v=>v.toString(16).padStart(2,'0'));
    return hex.slice(0,4).join('')+'-'+hex.slice(4,6).join('')+'-'+hex.slice(6,8).join('')+'-'+hex.slice(8,10).join('')+'-'+hex.slice(10).join('');
  }
  const empty=()=>({catalogSelected:false,products:[],domainSelected:false,domain:'',years:1});
  function payload(s,kind) {
    if(kind!=='NEW_SHOP')return [];
    const items=[];
    if(s.catalogSelected)items.push({code:'CATALOG_SETUP',details:{products:s.products.map(({name,description,price,quantity,colors,sizes,variants})=>({name,description:description||'',price,quantity,colors:colors||'',sizes:sizes||'',variants:(variants||[]).map(({color,size,price,quantity})=>({color:color||'',size:size||'',price,quantity}))}))}});
    if(s.domainSelected)items.push({code:'MANAGED_DOMAIN',details:{domain:s.domain.trim().toLowerCase(),years:Number(s.years)}});
    return items;
  }
  function quote(s,kind,tariffPrice) {
    const lines=[];
    if(kind==='NEW_SHOP'&&s.catalogSelected)lines.push({code:'CATALOG_SETUP',label:'Do‘kon va mahsulotlarni kiritish',price:Math.round(Number(tariffPrice)*.3)});
    if(kind==='NEW_SHOP'&&s.domainSelected)lines.push({code:'MANAGED_DOMAIN',label:`Domen xizmati · ${s.years} yil`,price:50000*Number(s.years)});
    return {lines,totalPrice:Number(tariffPrice)+lines.reduce((sum,line)=>sum+line.price,0)};
  }
  function validate(s,kind) {
    if(kind!=='NEW_SHOP')return '';
    const valid=(value,integer=false)=>value!==''&&value!=null&&Number.isFinite(Number(value))&&Number(value)>=0&&(!integer||Number.isSafeInteger(Number(value)));
    if(s.catalogSelected){
      if(!s.products.length)return 'Kamida bitta mahsulot qo‘shing.';
      if(s.products.length>100)return 'Bir arizada ko‘pi bilan 100 ta mahsulot kiritiladi.';
      for(const [i,p] of s.products.entries()){
        if(!String(p.name||'').trim())return `${i+1}-mahsulot nomini kiriting.`;
        if(!valid(p.price)||!valid(p.quantity,true))return `${i+1}-mahsulot narxi va sonini to‘g‘ri kiriting.`;
        if((p.variants||[]).some(v=>!valid(v.price)||!valid(v.quantity,true)))return `${i+1}-mahsulot variant narxi va sonini tekshiring.`;
      }
    }
    if(s.domainSelected){
      if(!/^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(s.domain.trim().toLowerCase()))return 'Domen nomini to‘g‘ri kiriting, masalan: dokon.uz';
      if(!Number.isInteger(Number(s.years))||Number(s.years)<1||Number(s.years)>10)return 'Domen muddati 1 dan 10 yilgacha bo‘lsin.';
    }
    return '';
  }
  globalThis.UStoreServiceAddons={empty,payload,quote,validate,secureUuid};
})();
