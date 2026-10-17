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
  const empty=()=>({catalogSelected:false,products:[],domainSelected:false,domain:'',domains:[''],years:1});
  function payload(s,kind) {
    if(kind!=='NEW_SHOP'&&kind!=='ADDON_SERVICE'&&kind!=='EXISTING_SHOP')return [];
    const items=[];
    if(s.catalogSelected)items.push({code:'CATALOG_SETUP',details:{requested:true}});
    if(s.domainSelected){
      const rawDomains=(Array.isArray(s.domains)&&s.domains.length?s.domains:[s.domain||''])
        .map(d=>String(d||'').trim().toLowerCase())
        .filter(Boolean)
        .map(d=>d.endsWith('.uz')?d:`${d}.uz`)
        .slice(0,7);
      items.push({code:'MANAGED_DOMAIN',details:{domain:rawDomains[0]||'',domains:rawDomains,years:Number(s.years||1)}});
    }
    return items;
  }
  function quote(s,kind,tariffPrice) {
    const lines=[];
    const allowed=['NEW_SHOP','ADDON_SERVICE','EXISTING_SHOP'];
    if(allowed.includes(kind)&&s.catalogSelected)lines.push({code:'CATALOG_SETUP',label:'Do‘kon va mahsulotlarni kiritish',price:Math.round(Number(tariffPrice)*.3)});
    if(allowed.includes(kind)&&s.domainSelected)lines.push({code:'MANAGED_DOMAIN',label:`Domen xizmati · ${s.years} yil`,price:50000*Number(s.years||1)});
    const basePrice=kind==='ADDON_SERVICE'?0:Number(tariffPrice);
    return {lines,totalPrice:basePrice+lines.reduce((sum,line)=>sum+line.price,0)};
  }
  function validate(s,kind) {
    const allowed=['NEW_SHOP','ADDON_SERVICE','EXISTING_SHOP'];
    if(!allowed.includes(kind))return '';
    if(s.domainSelected){
      const rawDomains=(Array.isArray(s.domains)&&s.domains.length?s.domains:[s.domain||''])
        .map(d=>String(d||'').trim().toLowerCase())
        .filter(Boolean);
      if(!rawDomains.length)return 'Kamida bitta .uz domen nomini kiriting, masalan: dokon.uz';
      for(const d of rawDomains){
        const full=d.endsWith('.uz')?d:`${d}.uz`;
        if(!/^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+uz$/i.test(full)){
          return 'Domen nomini to‘g‘ri kiriting (faqat .uz domenlari qabul qilinadi).';
        }
      }
      if(!Number.isInteger(Number(s.years))||Number(s.years)<1||Number(s.years)>10)return 'Domen muddati 1 dan 10 yilgacha bo‘lsin.';
    }
    return '';
  }
  globalThis.UStoreServiceAddons={empty,payload,quote,validate,secureUuid};
})();
