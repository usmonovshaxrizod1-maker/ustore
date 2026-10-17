import { advanceBotCheckout,botCheckoutAddons } from './platform-bot-checkout.ts';
import { normalizeSubscriptionAddons } from './subscription-addons.ts';
import { telegramApi } from './telegram.ts';

// Called only inside the existing secret-verified platform bot webhook.
export async function handlePlatformBotCheckout(db:any,token:string,update:any,termsVersion:string,privacyVersion:string,superAdminId=''):Promise<boolean>{
  const callback=update.callback_query,message=update.message;
  const user=callback?.from||message?.from,chat=callback?.message?.chat||message?.chat;
  if(chat?.type!=='private'||!user?.id||String(chat.id)!==String(user.id))return false;
  const userId=String(user.id),command=String(message?.text||'').trim(),raw=String(callback?.data||'');
  if(message&&!message.text)return false; // Receipt photos retain the existing upload flow.
  const starting=raw==='shop:new'||/^\/(?:buy|start(?:@\w+)?\s+buy)$/.test(command);
  if(callback&&!raw.startsWith('shop:'))return false;
  if(message&&command.startsWith('/')&&!starting&&!['/cancel','/skip'].includes(command))return false;
  const send=async(text:string,buttons:any[][]=[])=>telegramApi(token,'sendMessage',{chat_id:userId,text,reply_markup:buttons.length?{inline_keyboard:buttons}:undefined});
  const {data:session,error:readError}=await db.from('platform_bot_checkout_sessions').select('*').eq('telegram_user_id',userId).maybeSingle();
  if(readError){console.error('bot checkout session read failed');if(starting||callback)await send('Xarid oynasini yuklab bo‘lmadi. /buy bilan qayta urinib ko‘ring.');return !!(starting||callback);}
  if(!starting&&!callback&&session?.step==='DONE')return false;
  if(!starting&&!session){if(callback){await telegramApi(token,'answerCallbackQuery',{callback_query_id:callback.id,text:'Xarid oynasi yopilgan. /buy yuboring.'});return true;}return false;}
  if(callback)await telegramApi(token,'answerCallbackQuery',{callback_query_id:callback.id});
  try{
    if(starting){
      let resumable=session&&new Date(session.expires_at).getTime()>Date.now()&&session.step!=='DONE';
      if(resumable&&session.data.requestId){const {data:r,error}=await db.from('subscription_requests').select('id,status,payment_claimed_at,payment_deadline_at').eq('id',session.data.requestId).eq('requester_telegram_id',userId).maybeSingle();if(error)throw error;resumable=!!r&&r.status==='NEW'&&(!!r.payment_claimed_at||!r.payment_deadline_at||new Date(r.payment_deadline_at).getTime()>Date.now());}
      if(resumable){await render(session);return true;}
      const fresh={telegram_user_id:userId,step:'TARIFF',data:{products:[],submissionKey:crypto.randomUUID()},callback_token:crypto.randomUUID().slice(0,8),revision:0,last_update_id:update.update_id,expires_at:new Date(Date.now()+86400000).toISOString(),updated_at:new Date().toISOString()};
      const {error}=await db.from('platform_bot_checkout_sessions').upsert(fresh);if(error)throw error;
      await render(fresh);return true;
    }
    if(new Date(session.expires_at).getTime()<=Date.now()){
      await db.from('platform_bot_checkout_sessions').delete().eq('telegram_user_id',userId).eq('revision',session.revision);
      await send('Xarid oynasi muddati tugagan. Yangi xarid uchun /buy yuboring.');return true;
    }
    if(Number(update.update_id)<=Number(session.last_update_id))return true;
    const parts=raw.split(':');
    if(callback&&parts[1]!==session.callback_token){await render(session);return true;}
    const action=callback?parts.slice(2).join(':'):'';
    if(command==='/cancel'||action==='cancel'){
      if(session.data.requestId){await send('Ariza allaqachon saqlangan. Davom etish uchun /buy yuboring. To‘lanmagan ariza 1 soatdan keyin muddati tugaydi.');return true;}
      await db.from('platform_bot_checkout_sessions').delete().eq('telegram_user_id',userId).eq('revision',session.revision);
      await send('Xarid oynasi yopildi. Yangi xarid: /buy');return true;
    }
    let next=structuredClone(session);
    if(session.step==='TARIFF'&&action.startsWith('t:')){next.data.tariffId=action.slice(2);next.step='PERIOD';}
    else if(session.step==='PERIOD'&&['monthly','annual'].includes(action)){next.data.billingPeriod=action;next.step='SHOP_NAME';}
    else if(session.step==='PAYMENT_METHOD'&&action==='services'){next.step='SERVICES';}
    else if(session.step==='CONFIRM'&&action==='methods'){next.step='PAYMENT_METHOD';}
    else if(session.step==='PAYMENT_METHOD'&&action.startsWith('pay:')){const tariff=await tariffFor(next.data.tariffId);next.data.quotedTariffPrice=Number(tariff.price)*(next.data.billingPeriod==='annual'?10:1);next.data.paymentMethodId=action.slice(4);next.step='CONFIRM';}
    else if(session.step==='CONFIRM'&&action==='submit'){
      const d=session.data;
      const tariff=await tariffFor(d.tariffId);
      const price=Number(tariff.price)*(d.billingPeriod==='annual'?10:1);
      if(price!==d.quotedTariffPrice)throw Error('Tarif narxi yangilandi. “To‘lov usuliga qaytish”ni bosing va yangi summani tekshiring.');
      const addons=normalizeSubscriptionAddons(botCheckoutAddons(d),{kind:'NEW_SHOP',tariffPriceSnapshot:price});
      const method=await paymentFor(d.paymentMethodId);
      const input={kind:'NEW_SHOP',tariffId:tariff.id,billingPeriod:d.billingPeriod,shopName:d.shopName,ownerTelegramId:userId,paymentMethod:method.type,paymentMethodId:method.id,addons:addons.items.map(({code,details})=>({code,details}))};
      const values={kind:'NEW_SHOP',shop_id:null,tariff_id:tariff.id,tariff_name_snapshot:tariff.name,tariff_price_snapshot:price,total_price_snapshot:addons.totalPrice,tariff_product_limit_snapshot:tariff.product_limit,billing_period:d.billingPeriod.toUpperCase(),duration_days:d.billingPeriod==='annual'?365:30,payment_method:method.type,payment_method_id:method.id,owner_telegram_id:userId,requested_shop_name:d.shopName,addons:addons.items};
      const {data:submitted,error}=await db.rpc('ustore_submit_web_subscription',{p_user:userId,p_key:d.submissionKey,p_input:input,p_values:values,p_prepared_id:null});if(error)throw error;
      next.data.requestId=submitted.requestId;next.data.totalPrice=submitted.totalPrice;next.data.paymentInstructions={text:method.text,url:method.url};next.step='PAYMENT';
      if(!submitted.replayed){
        const {error:historyError}=await db.from('subscription_request_history').insert({request_id:submitted.requestId,event_type:'REQUEST_SUBMITTED',actor_type:'BOT',actor_telegram_id:userId,metadata:{source:'TELEGRAM_BOT',totalPrice:addons.totalPrice}});if(historyError)throw historyError;
        const {error:consentError}=await db.from('platform_consent_log').insert({user_telegram_id:userId,terms_version:termsVersion,privacy_version:privacyVersion,source:'subscription_request:NEW_SHOP:BOT'});if(consentError)throw consentError;
      }
    }else if(session.step==='PAYMENT'&&action==='paid'){
      const {data:request,error}=await db.from('subscription_requests').update({payment_claimed_at:new Date().toISOString()}).eq('id',session.data.requestId).eq('requester_telegram_id',userId).eq('status','NEW').is('payment_claimed_at',null).gt('payment_deadline_at',new Date().toISOString()).select('id').maybeSingle();if(error)throw error;
      if(request){const {error}=await db.from('subscription_request_history').insert({request_id:request.id,event_type:'PAYMENT_CLAIMED',actor_type:'BOT',actor_telegram_id:userId,metadata:{source:'TELEGRAM_BOT'}});if(error)throw error;}
      else {const {data:r}=await db.from('subscription_requests').select('payment_claimed_at').eq('id',session.data.requestId).eq('requester_telegram_id',userId).maybeSingle();if(!r?.payment_claimed_at)throw Error('Ariza muddati tugagan. /buy bilan qayta boshlang.');}
      next.step='DONE';
    }else{
      const progressed=advanceBotCheckout({step:session.step,data:session.data},command,action||undefined);next={...next,...progressed};
    }
    next.callback_token=crypto.randomUUID().slice(0,8);next.revision=Number(session.revision)+1;next.last_update_id=update.update_id;next.updated_at=new Date().toISOString();
    const {data:saved,error}=await db.from('platform_bot_checkout_sessions').update({step:next.step,data:next.data,callback_token:next.callback_token,revision:next.revision,last_update_id:next.last_update_id,updated_at:next.updated_at}).eq('telegram_user_id',userId).eq('revision',session.revision).select('telegram_user_id').maybeSingle();
    if(error)throw error;if(!saved){await send('Boshqa javobingiz qabul qilindi. Oxirgi xabardagi bosqichdan davom eting.');return true;}
    await render(next);
  }catch(e:any){console.error('bot checkout failure',{code:e?.code||'validation'});await send(e?.code?'Amalni bajarib bo‘lmadi. Oxirgi bosqichdan qayta urinib ko‘ring.':String(e?.message||'Qayta urinib ko‘ring.').slice(0,500));}
  return true;

  async function tariffFor(id:string){const {data,error}=await db.from('tariffs').select('id,name,price,product_limit').eq('id',id).eq('is_active',true).maybeSingle();if(error)throw error;if(!data)throw Error('Tarif topilmadi. /buy bilan qayta boshlang.');return data;}
  async function paymentFor(id:string){
    if(id==='CARD'){const {data,error}=await db.from('platform_settings').select('payment_card_number,payment_card_holder,payment_card_active').eq('id',true).maybeSingle();if(error)throw error;if(!data?.payment_card_number||data.payment_card_active===false)throw Error('Karta to‘lovi hozir faol emas.');return {id:null,type:'CARD',text:`Karta: ${data.payment_card_number}\n${data.payment_card_holder||''}`,url:null};}
    const {data,error}=await db.from('platform_payment_methods').select('id,method_type,display_name,payment_url,is_active').eq('id',id).eq('is_active',true).maybeSingle();if(error)throw error;if(!data||!['CLICK','PAYME','PAYNET'].includes(data.method_type))throw Error('To‘lov usuli mavjud emas.');return {id:data.id,type:data.method_type,text:data.display_name||data.method_type,url:data.payment_url};
  }
  async function render(s:any){
    const button=(text:string,action:string)=>({text,callback_data:`shop:${s.callback_token}:${action}`});
    const cancel=[button('Xarid oynasini yopish','cancel')];
    if(s.step==='TARIFF'){
      const {data,error}=await db.from('tariffs').select('id,name,price').eq('is_active',true).order('sort_order');if(error)throw error;
      await send('Yangi do‘kon uchun tarifni tanlang:',[...(data||[]).map((t:any)=>[button(`${t.name} · ${Number(t.price).toLocaleString('uz-UZ')} so‘m/oy`,`t:${t.id}`)]),cancel]);return;
    }
    if(s.step==='PERIOD'){await send('Obuna davrini tanlang:',[[button('Oylik','monthly'),button('Yillik · 2 oy bepul','annual')],cancel]);return;}
    if(s.step==='SERVICES'){
      const d=s.data,t=await tariffFor(d.tariffId),price=Number(t.price)*(d.billingPeriod==='annual'?10:1);
      await send(`${d.shopName}\n${t.name} · ${d.billingPeriod==='annual'?'Yillik':'Oylik'} · ${price.toLocaleString('uz-UZ')} so‘m\n\nIxtiyoriy xizmatlar:\nMahsulotlarni kiritish: ${Math.round(price*.3).toLocaleString('uz-UZ')} so‘m (bir martalik). Rasmlarni keyin Shop App’da o‘zingiz yuklaysiz.\nDomen: yiliga 50 000 so‘m. Nom band bo‘lsa boshqa nomni kelishamiz.`,[[button(d.catalogSelected?`Mahsulotlar: ${(d.products||[]).length} ta · xizmatni olib tashlash`:'Mahsulotlarni biz kiritamiz',d.catalogSelected?'catalog_off':'catalog')],[button(d.domainSelected?`${d.domain} · ${d.years} yil · olib tashlash`:'Domenni biz olib ulaymiz',d.domainSelected?'domain_off':'domain')],[button('Davom etish','summary')],cancel]);return;
    }
    if(s.step==='VARIANT_CHOICE'){await send('Bu mahsulot uchun alohida rang/o‘lcham, narx va sonli variant qo‘shasizmi?',[[button('+ Variant','variant'),button('Mahsulot tayyor','product_done')],cancel]);return;}
    if(s.step==='PRODUCT_CHOICE'){await send('Mahsulot saqlandi. Yana qo‘shasizmi?',[[button('+ Mahsulot','product'),button('Mahsulot qo‘shishni tugatish','products_done')],cancel]);return;}
    if(['PAYMENT_METHOD','CONFIRM'].includes(s.step)){
      const d=s.data,t=await tariffFor(d.tariffId),price=Number(t.price)*(d.billingPeriod==='annual'?10:1);
      const quote=normalizeSubscriptionAddons(botCheckoutAddons(d),{kind:'NEW_SHOP',tariffPriceSnapshot:price});
      const summary=`${d.shopName}\nTarif: ${t.name} · ${price.toLocaleString('uz-UZ')} so‘m\n${quote.items.map(a=>`${a.code==='CATALOG_SETUP'?'Mahsulot kiritish':'Domen '+a.quantity+' yil'}: ${a.totalPrice.toLocaleString('uz-UZ')} so‘m`).join('\n')}\nJami: ${quote.totalPrice.toLocaleString('uz-UZ')} so‘m`;
      if(s.step==='CONFIRM'){await paymentFor(d.paymentMethodId);await send(summary+'\n\nArizani yuborish orqali UStorE foydalanish shartlari va maxfiylik siyosatiga rozilik bildirasiz. Hujjatlarni UStorE Mini App → Profil → Foydalanish shartlari / Maxfiylik siyosati orqali o‘qing.',[[button('Roziman, arizani yuborish','submit')],[button('To‘lov usuliga qaytish','methods')],cancel]);return;}
      const buttons:any[][]=[];try{await paymentFor('CARD');buttons.push([button('Karta orqali','pay:CARD')]);}catch{}
      const {data:methods,error}=await db.from('platform_payment_methods').select('id,display_name,method_type').eq('is_active',true);if(error)throw error;for(const m of methods||[])if(['CLICK','PAYME','PAYNET'].includes(m.method_type))buttons.push([button(m.display_name||m.method_type,`pay:${m.id}`)]);
      await send(summary+'\n\nTo‘lov usulini tanlang:',[...buttons,[button('Xizmatlarga qaytish','services')],cancel]);return;
    }
    if(s.step==='PAYMENT'){
      let method=s.data.paymentInstructions;try{if(!method)method=await paymentFor(s.data.paymentMethodId);}catch{method={text:'To‘lov usuli yangilangan. To‘lagan bo‘lsangiz, quyidagi tugma orqali xabar bering.',url:null};}const buttons:any[][]=[];
      if(method.url&&/^https:\/\//.test(method.url))buttons.push([{text:'To‘lov sahifasi',url:method.url}]);
      buttons.push([button('To‘ladim','paid')]);
      await send(`Ariza: ${s.data.requestId}\nJami: ${Number(s.data.totalPrice).toLocaleString('uz-UZ')} so‘m\n${method.text}\n\nTo‘lovni bajaring va “To‘ladim”ni bosing. Chekni keyin shu chatga rasm sifatida yuborishingiz mumkin. To‘lanmagan ariza 1 soat saqlanadi.`,buttons);return;
    }
    if(s.step==='DONE'){
      await send('To‘lov tasdig‘i qabul qilindi. Administrator tekshiradi. Chekni shu chatga yuborishingiz mumkin.');
      if(superAdminId)try{await telegramApi(token,'sendMessage',{chat_id:superAdminId,text:`Yangi do‘kon to‘lovi tekshiruvda\n${s.data.shopName}\nJami: ${s.data.totalPrice} so‘m\nAriza: ${s.data.requestId}`});}catch{console.error('bot checkout admin notification failed');}return;
    }
    const prompts:Record<string,string>={SHOP_NAME:'Do‘kon nomini yozing. U sizning Telegram akkauntingizga biriktiriladi.',PRODUCT_NAME:'Mahsulot nomini yozing.',PRODUCT_DESCRIPTION:'Mahsulot tavsifini yozing. O‘tkazib yuborish: /skip',PRODUCT_PRICE:'Mahsulot narxini so‘mda yozing (faqat raqam).',PRODUCT_QUANTITY:'Mahsulot sonini yozing (butun raqam).',PRODUCT_COLORS:'Ranglarini yozing yoki /skip yuboring.',PRODUCT_SIZES:'O‘lchamlarini yozing yoki /skip yuboring.',VARIANT_COLOR:'Variant rangini yozing yoki /skip yuboring.',VARIANT_SIZE:'Variant o‘lchamini yozing yoki /skip yuboring.',VARIANT_PRICE:'Variant narxini so‘mda yozing.',VARIANT_QUANTITY:'Variant sonini yozing.',DOMAIN_NAME:'Kerakli domen nomini yozing, masalan: dokon.uz',DOMAIN_YEARS:'Domen necha yilga kerak? 1 dan 10 gacha son yozing.'};
    await send(prompts[s.step]||'Oxirgi xabardagi tugmadan davom eting.',[cancel]);
  }
}
