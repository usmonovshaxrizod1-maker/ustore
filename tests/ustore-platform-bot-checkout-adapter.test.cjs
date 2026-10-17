const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
function harness(session=null){
 const sent=[],rows={platform_bot_checkout_sessions:session?[clone(session)]:[],tariffs:[{id:'tariff',name:'Business',price:200000,is_active:true,product_limit:1000}],platform_settings:[{id:true,payment_card_number:'1234',payment_card_active:true}],platform_payment_methods:[],subscription_requests:[],subscription_request_history:[],platform_consent_log:[]};
 let failSend=false,rpcCalls=0;
 const db={from(table){let op='select',value,filters=[];const q={select(){return q},eq(k,v){filters.push(r=>String(r[k])===String(v));return q},is(k,v){filters.push(r=>r[k]===v);return q},gt(k,v){filters.push(r=>r[k]>v);return q},order(){return q},update(v){op='update';value=v;return q},insert(v){op='insert';value=v;return q},upsert(v){op='upsert';value=v;return q},delete(){op='delete';return q},maybeSingle(){return execute(true)},then(ok,bad){return execute(false).then(ok,bad)}};async function execute(single){let matches=rows[table].filter(r=>filters.every(f=>f(r)));if(op==='update')matches.forEach(r=>Object.assign(r,clone(value)));if(op==='insert'){rows[table].push(clone(value));matches=[value]}if(op==='upsert'){rows[table]=[clone(value)];matches=[value]}if(op==='delete')rows[table]=rows[table].filter(r=>!matches.includes(r));return {data:clone(single?matches[0]||null:matches),error:null}}return q},async rpc(name,args){rpcCalls++;assert.equal(name,'ustore_submit_web_subscription');assert.equal(args.p_values.tariff_price_snapshot,200000);assert.equal(args.p_values.total_price_snapshot,250000);return {data:{requestId:'request',totalPrice:250000,replayed:false},error:null}}};
 function load(file,requireFn){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:requireFn,structuredClone,crypto:require('node:crypto').webcrypto,console:{error(){}},URL});return exports;}
 const pure=load('supabase/functions/_shared/platform-bot-checkout.ts');const pricing=load('supabase/functions/_shared/subscription-addons.ts');
 const handler=load('supabase/functions/_shared/platform-bot-checkout-handler.ts',p=>p.includes('platform-bot-checkout.ts')?pure:p.includes('subscription-addons')?pricing:{telegramApi:async(_token,method,payload)=>{if(method==='sendMessage'){if(failSend){failSend=false;throw Error('network')}sent.push(payload)}return {ok:true}}}).handlePlatformBotCheckout;
 const message=(text,id=2,type='private')=>({update_id:id,message:{text,from:{id:123456},chat:{id:123456,type}}});
 const callback=(action,token=rows.platform_bot_checkout_sessions[0]?.callback_token,id=2)=>({update_id:id,callback_query:{id:'cb',data:`shop:${token}:${action}`,from:{id:123456},message:{chat:{id:123456,type:'private'}}}});
 return {rows,sent,message,callback,run:u=>handler(db,'secret',u,'1.0','1.0'),failNextSend(){failSend=true},get rpcCalls(){return rpcCalls}};
}
const base=(step,data={})=>({telegram_user_id:'123456',step,data,callback_token:'current',revision:0,last_update_id:1,expires_at:new Date(Date.now()+86400000).toISOString()});
test('bot only handles private purchase messages and preserves receipt/auth routing',async()=>{
 const h=harness();assert.equal(await h.run(h.message('/buy',2,'group')),false);assert.equal(await h.run(h.message('/start login_abc')),false);assert.equal(await h.run({...h.message(''),message:{from:{id:123456},chat:{id:123456,type:'private'},photo:[{}]}}),false);
 assert.equal(await h.run(h.message('/buy')),true);assert.equal(h.rows.platform_bot_checkout_sessions[0].step,'TARIFF');assert.match(h.sent[0].text,/tarifni tanlang/);
});
test('stale buttons and restart recover a committed payment without making another request',async()=>{
 const session=base('PAYMENT',{requestId:'saved',paymentMethodId:'CARD',shopName:'Sinov',totalPrice:250000});const h=harness(session);h.rows.subscription_requests.push({id:'saved',requester_telegram_id:'123456',status:'NEW',payment_claimed_at:null,payment_deadline_at:new Date(Date.now()+3600000).toISOString()});
 await h.run(h.callback('paid','stale'));assert.match(h.sent.at(-1).text,/saved/);
 await h.run(h.message('/buy',3));assert.equal(h.rows.platform_bot_checkout_sessions[0].data.requestId,'saved');assert.match(h.sent.at(-1).text,/250/);
 await h.run(h.message('/cancel',4));assert.equal(h.rows.platform_bot_checkout_sessions.length,1);assert.equal(h.rpcCalls,0);
});
test('expired session is removed and invalid steps leave persisted data unchanged',async()=>{
 const expired=base('SHOP_NAME');expired.expires_at=new Date(0).toISOString();const h=harness(expired);await h.run(h.message('Sinov'));assert.equal(h.rows.platform_bot_checkout_sessions.length,0);assert.match(h.sent.at(-1).text,/muddati tugagan/);
 const other=harness(base('DOMAIN_YEARS',{}));await other.run(other.message('11'));assert.equal(other.rows.platform_bot_checkout_sessions[0].step,'DOMAIN_YEARS');assert.match(other.sent.at(-1).text,/1.*10/);
});
test('submission uses server pricing once and recovers instructions after a failed Telegram send',async()=>{
 const h=harness(base('CONFIRM',{tariffId:'tariff',billingPeriod:'monthly',shopName:'Sinov',paymentMethodId:'CARD',quotedTariffPrice:200000,domainSelected:true,domain:'sinov.uz',years:1,submissionKey:'stable-submission-key'}));h.failNextSend();
 await h.run(h.callback('submit'));assert.equal(h.rpcCalls,1);assert.equal(h.rows.platform_bot_checkout_sessions[0].step,'PAYMENT');
 await h.run(h.callback('submit','current',3));assert.equal(h.rpcCalls,1);assert.match(h.sent.at(-1).text,/request/);assert.match(h.sent.at(-1).text,/250/);
});
test('tariff changes require a fresh confirmation instead of silently charging more',async()=>{
 const h=harness(base('CONFIRM',{tariffId:'tariff',billingPeriod:'monthly',quotedTariffPrice:100000}));await h.run(h.callback('submit'));assert.equal(h.rpcCalls,0);assert.equal(h.rows.platform_bot_checkout_sessions[0].step,'CONFIRM');assert.match(h.sent.at(-1).text,/narxi yangilandi/);
});
test('expired request can restart and a disabled method never hides payment claim',async()=>{
 const h=harness(base('PAYMENT',{requestId:'expired',paymentMethodId:'CARD',totalPrice:200000}));h.rows.subscription_requests.push({id:'expired',requester_telegram_id:'123456',status:'NEW',payment_claimed_at:null,payment_deadline_at:new Date(0).toISOString()});
 await h.run(h.message('/buy'));assert.equal(h.rows.platform_bot_checkout_sessions[0].step,'TARIFF');
 const old=harness(base('PAYMENT',{requestId:'saved',paymentMethodId:'CARD',totalPrice:200000}));old.rows.platform_settings[0].payment_card_active=false;
 await old.run(old.callback('paid','stale'));assert.equal(old.sent.at(-1).reply_markup.inline_keyboard.at(-1)[0].text,'To‘ladim');
});
