export type BotCheckoutState = {step:string;data:Record<string,any>};
export function advanceBotCheckout(state:BotCheckoutState,text:string,action?:string):BotCheckoutState {
  const s=structuredClone(state),d=s.data;
  const clean=(max:number)=>{const v=text.trim();if(!v||v.length>max)throw Error(`Matn kiriting (ko‘pi bilan ${max} belgi).`);return v;};
  const numeric=(integer=false)=>{if(!/^\d+(?:\.\d{1,2})?$/.test(text.trim()))throw Error('Narx yoki sonni musbat raqam bilan kiriting.');const v=Number(text);if(!Number.isFinite(v)||v>1e10||(integer&&!Number.isInteger(v)))throw Error('Narx yoki son noto‘g‘ri.');return v;};
  if(action){
    if(s.step==='SERVICES'){
      if(action==='catalog'){d.catalogSelected=true;s.step='SERVICES';return s;}
      if(action==='catalog_off'){d.catalogSelected=false;return s;}
      if(action==='domain'){d.domainSelected=true;s.step='DOMAIN_NAME';return s;}
      if(action==='domain_off'){d.domainSelected=false;return s;}
      if(action==='summary'){s.step='PAYMENT_METHOD';return s;}
    }
    if(s.step==='VARIANT_CHOICE'){
      if(action==='variant'){d.currentVariant={};s.step='VARIANT_COLOR';return s;}
      if(action==='product_done'){if((d.products||[]).length>=100)throw Error('100 ta mahsulot chegarasi.');d.products=[...(d.products||[]),d.currentProduct];delete d.currentProduct;s.step='PRODUCT_CHOICE';return s;}
    }
    if(s.step==='PRODUCT_CHOICE'){
      if(action==='product'){s.step='PRODUCT_NAME';return s;}
      if(action==='products_done'){s.step='SERVICES';return s;}
    }
    throw Error('Bu tugma joriy bosqichga mos emas. Oxirgi xabardagi tugmadan foydalaning.');
  }
  switch(s.step){
    case 'SHOP_NAME':d.shopName=clean(80);if(d.shopName.length<2)throw Error('Do‘kon nomi kamida 2 belgi bo‘lsin.');s.step='SERVICES';break;
    case 'PRODUCT_NAME':d.currentProduct={name:clean(200),variants:[]};s.step='PRODUCT_DESCRIPTION';break;
    case 'PRODUCT_DESCRIPTION':d.currentProduct.description=text==='/skip'?'':clean(3000);s.step='PRODUCT_PRICE';break;
    case 'PRODUCT_PRICE':d.currentProduct.price=numeric();s.step='PRODUCT_QUANTITY';break;
    case 'PRODUCT_QUANTITY':d.currentProduct.quantity=numeric(true);s.step='PRODUCT_COLORS';break;
    case 'PRODUCT_COLORS':d.currentProduct.colors=text==='/skip'?'':clean(500);s.step='PRODUCT_SIZES';break;
    case 'PRODUCT_SIZES':d.currentProduct.sizes=text==='/skip'?'':clean(500);s.step='VARIANT_CHOICE';break;
    case 'VARIANT_COLOR':d.currentVariant.color=text==='/skip'?'':clean(100);s.step='VARIANT_SIZE';break;
    case 'VARIANT_SIZE':d.currentVariant.size=text==='/skip'?'':clean(100);s.step='VARIANT_PRICE';break;
    case 'VARIANT_PRICE':d.currentVariant.price=numeric();s.step='VARIANT_QUANTITY';break;
    case 'VARIANT_QUANTITY':d.currentVariant.quantity=numeric(true);if(d.currentProduct.variants.length>=100)throw Error('100 ta variant chegarasi.');d.currentProduct.variants.push(d.currentVariant);delete d.currentVariant;s.step='VARIANT_CHOICE';break;
    case 'DOMAIN_NAME':{const domain=clean(253).toLowerCase();const full=domain.endsWith('.uz')?domain:`${domain}.uz`;if(!/^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.uz$/.test(full))throw Error('Domenni dokon.uz shaklida kiriting.');d.domain=full;d.domains=[full];s.step='DOMAIN_YEARS';break;}
    case 'DOMAIN_YEARS':{const years=Number(text);if(!/^\d+$/.test(text)||!Number.isInteger(years)||years<1||years>10)throw Error('Muddati 1 dan 10 yilgacha bo‘lsin.');d.years=years;s.step='SERVICES';break;}
    default:throw Error('Oxirgi xabardagi tugmani tanlang.');
  }
  return s;
}
export function botCheckoutAddons(data:Record<string,any>):any[] {
  const items=[];
  if(data.catalogSelected)items.push({code:'CATALOG_SETUP',details:{requested:true}});
  if(data.domainSelected)items.push({code:'MANAGED_DOMAIN',details:{domain:data.domain,domains:data.domains||[data.domain],years:data.years}});
  return items;
}
