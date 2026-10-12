const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const read=name=>fs.readFileSync('supabase/migrations/'+name,'utf8');
const shop='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002',product='00000000-0000-0000-0000-000000000003';
const key=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema storage;create table storage.objects(bucket_id text,name text,metadata jsonb);
 create table shops(id uuid primary key,status text default 'ACTIVE');create table accounts(id uuid primary key);
 create table products(id uuid,shop_id uuid,name text,price numeric,sku text,img text,status text default 'ACTIVE',stock int,sold_count int default 0,variants jsonb,updated_at timestamptz,primary key(shop_id,id));
 create table stock_movements(id bigint generated always as identity,shop_id uuid,product_id uuid,variant_sku text,prior_stock int,delta int,new_stock int,operation_type text,admin_tg_id text,order_id bigint);
 create table shop_settings(shop_id uuid primary key,fulfillment_config jsonb);
 create table promotion_redemptions(shop_id uuid,promotion_id uuid,order_id bigint,tg_id text not null,discount_amount numeric);
 create table customer_discount_usages(shop_id uuid,customer_discount_id uuid,order_id bigint,tg_id text,discount_amount numeric);
 create table automatic_gift_usages(shop_id uuid,order_id bigint,tg_id text not null);
 insert into shops(id) values('${shop}'),('${other}');
 insert into products(id,shop_id,name,price,stock) values('${product}','${shop}','Local fixture',100,20);`);
 const core=read('003_users_orders_payments.sql');
 await db.exec(core.match(/create table if not exists public.app_users \([\s\S]*?\n\);/)[0]);
 await db.exec(core.match(/create table if not exists public.orders \([\s\S]*?\n\);/)[0]);
 await db.exec(`alter table orders add column account_id uuid,add column checkout_key uuid,add column gift_snapshot jsonb,add column payment_status text default 'PENDING',add column payment_due_at timestamptz,add column paid_at timestamptz,add column delivered_at timestamptz,add column active_payment_provider text,add column active_payment_reference text,add column promo_code text,add column promo_discount numeric,add column tier_discount numeric,add column vip_discount numeric,add column discount_source text,add column tier_id uuid,add column tier_snapshot jsonb;
 create unique index orders_checkout_key_unique on orders(shop_id,checkout_key) where checkout_key is not null;`);
 const hardening=read(fs.readdirSync('supabase/migrations').find(n=>n.startsWith('074_')));
 const start=hardening.indexOf('create or replace function public.place_order('),end=hardening.indexOf('\ncreate or replace function',start+10);
 await db.exec(hardening.slice(start,end));
 await db.exec(read('20261011160643_checkout_receipt_atomic.sql'));
 await db.exec(read('20261011161230_guest_checkout_tracking.sql'));
 await db.exec(read('20261012024744_guest_checkout_search_path.sql'));
 const policyMigration=fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_shop_customer_cancellation_policy.sql'));
 if(policyMigration)await db.exec(read(policyMigration));
 const paths=await db.query("select proconfig from pg_proc where proname in ('ustore_place_guest_base','ustore_place_guest_order')");
 assert.equal(paths.rows.length,2);for(const fn of paths.rows)assert.ok(fn.proconfig.includes('search_path=public'));
 const workflow=read('075_order_workflow_atomic.sql');const approve=workflow.indexOf('create or replace function public.ustore_approve_payment_receipt');
 await db.exec(workflow.slice(approve,workflow.indexOf('create or replace function public.ustore_expire_unpaid_orders')));
 return db;
}
test('guest orders: no accounts, atomic receipt/stock, strict discounted threshold, unique secure code, tenant/owner isolation',async()=>{
 const db=await fixture();try{
  const config={checkout:{enabled:true,phone:'+998901234567'},delivery:{free:{minimumEnabled:true,minimumSubtotal:80}}};
  await db.query('insert into shop_settings values($1,$2)',[shop,JSON.stringify(config)]);
  const submit=async(n,{code='0012345678',discount=0,receipt=true,kind='FREE',fee=0}={})=>{
   const path=`shops/${shop}/receipts/${key(n)}/guest.png`;
   if(receipt)await db.query('insert into storage.objects values($1,$2,$3)',['payment-receipts',path,'{"size":128}']);
   return (await db.query('select ustore_create_checkout_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) as r',[shop,null,'Ali Valiyev','+998901234567','TASHKENT','Bektemir','Uy','CARD',JSON.stringify([{product_id:product,qty:1}]),key(n),path,JSON.stringify({kind}),JSON.stringify({receiptRequired:true,receiptStatus:'RECEIVED'}),JSON.stringify({isGuest:true,guestTrackingCode:code,expectedSubtotal:100,totalDiscount:discount,deliveryFee:fee})])).rows[0].r;
  };
  const counts=async()=>({orders:(await db.query('select count(*)::int n from orders')).rows[0].n,stock:(await db.query('select stock from products')).rows[0].stock});
  await assert.rejects(submit(1,{receipt:false}),/receipt_storage_verify_failed/);
  assert.deepEqual(await counts(),{orders:0,stock:20});
  await assert.rejects(submit(1,{discount:20}),/free_delivery_minimum_not_met/); // Equal is not eligible.
  await assert.rejects(submit(1,{discount:21}),/free_delivery_minimum_not_met/);
  assert.deepEqual(await counts(),{orders:0,stock:20});
  const first=await submit(1,{discount:19});assert.ok(first.id);
  const saved=(await db.query('select * from orders where id=$1',[first.id])).rows[0];
  assert.equal(saved.guest_tracking_code,'0012345678');assert.equal(saved.tg_id,null);assert.equal(saved.account_id,null);
  assert.equal(saved.is_guest,true);assert.equal(saved.payment_status,'PENDING');assert.equal(saved.receipt_review_status,'PENDING');assert.equal(Number(saved.payable_total),81);
  assert.equal((await db.query('select count(*)::int n from app_users')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from accounts')).rows[0].n,0);
  assert.equal((await submit(1)).replayed,true);assert.deepEqual(await counts(),{orders:1,stock:19});
  await assert.rejects(submit(2),/orders_guest_tracking_code_unique/);assert.deepEqual(await counts(),{orders:1,stock:19});
  assert.equal((await db.query('select count(*)::int n from orders where shop_id=$1 and guest_tracking_code=$2',[other,'0012345678'])).rows[0].n,0);
  await assert.rejects(db.query('select update_order_status($1,$2,$3,$4,$5,$6)',[shop,first.id,'NEW','attacker',false,null]),/invalid_transition/);
  await assert.rejects(db.query('select update_order_status($1,$2,$3,$4,$5,$6)',[shop,first.id,'CANCELLED','attacker',false,null]),/forbidden:not_owner/);
  await db.query('select ustore_approve_payment_receipt($1,$2,$3)',[shop,first.id,'admin']);
  await assert.rejects(db.query('select update_order_status($1,$2,$3,$4,$5,$6)',[shop,first.id,'PROCESSING','attacker',false,null]),/forbidden:not_owner/);
  const paid=(await db.query('select status,payment_status,receipt_review_status from orders where id=$1',[first.id])).rows[0];
  assert.deepEqual(paid,{status:'PROCESSING',payment_status:'PAID',receipt_review_status:'APPROVED'});
  await db.query('select update_order_status($1,$2,$3,$4,$5,$6)',[shop,first.id,'CANCELLED','admin',true,'Fixture']);
  assert.deepEqual(await counts(),{orders:1,stock:20});
  config.checkout.enabled=false;await db.query('update shop_settings set fulfillment_config=$2 where shop_id=$1',[shop,JSON.stringify(config)]);
  await assert.rejects(submit(3,{code:'0012345679'}),/guest_checkout_disabled/);
  await db.exec('set role anon');await assert.rejects(db.query('select * from guest_request_limits'),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}
});
test('guest limits are persistent, independent by tenant, and settings preserve delivery config',async()=>{
 const db=await fixture();try{
  await db.query('insert into shop_settings values($1,$2)',[shop,'{"delivery":{"free":{"enabled":true}}}']);
  await assert.rejects(db.query('select ustore_set_guest_checkout($1,$2)',[shop,'{"enabled":true}']),/guest_contact_phone_required/);
  await db.query('select ustore_set_guest_checkout($1,$2)',[shop,'{"enabled":true,"phone":"+998901234567"}']);
  assert.equal((await db.query('select fulfillment_config from shop_settings')).rows[0].fulfillment_config.delivery.free.enabled,true);
  const request=async(s=shop,k='CREATE')=>(await db.query('select ustore_guest_rate_limit($1,$2,$3) allowed',[s,'a'.repeat(64),k])).rows[0].allowed;
  for(let i=0;i<5;i++)assert.equal(await request(),true);assert.equal(await request(),false);assert.equal(await request(other),true);
  for(let i=0;i<30;i++)assert.equal(await request(shop,'TRACK'),true);assert.equal(await request(shop,'TRACK'),false);
  assert.equal(await request(shop,'PREVIEW'),true);
 }finally{await db.close();}
});
test('locked cancellation RPC enforces OFF and all customer cutoffs while preserving admin cancellation',async()=>{
 const db=await fixture();try{
  await db.exec('alter table shop_settings add column if not exists customer_cancellation_enabled boolean not null default true; alter table shop_settings add column if not exists customer_cancel_cutoff text not null default \'BEFORE_SHIPPED\';');
  await db.query('insert into shop_settings(shop_id,fulfillment_config,customer_cancellation_enabled) values($1,$2,false)',[shop,'{}']);
  const owner='123';const created=await db.query('select public.place_order($1,$2,$3,$4,$5,$6,$7,$8,$9) as result',[shop,owner,'Ali Valiyev','+998901234567','TASHKENT','Bektemir','Uy 1','CASH',JSON.stringify([{product_id:product,qty:1}])]);
  const id=created.rows[0].result.id;
  const cancel=admin=>db.query('select public.update_order_status($1,$2,$3,$4,$5,$6)',[shop,id,'CANCELLED',owner,admin,'fixture']);
  await assert.rejects(cancel(false),/customer_cancellation_disabled/);
  await db.query('update shop_settings set customer_cancellation_enabled=true,customer_cancel_cutoff=$1 where shop_id=$2',['NEW_ONLY',shop]);
  await db.query('update orders set status=$1 where id=$2',['PROCESSING',id]);await assert.rejects(cancel(false),/cancel_not_allowed_at_this_stage/);
  await db.query('update shop_settings set customer_cancel_cutoff=$1 where shop_id=$2',['BEFORE_SHIPPED',shop]);
  await db.query('update orders set shipment=$1 where id=$2',['{"status":"HANDED_TO_CARRIER"}',id]);await assert.rejects(cancel(false),/cancel_not_allowed_at_this_stage/);
  await db.query('update orders set status=$1 where id=$2',['NEW',id]);await assert.rejects(cancel(false),/cancel_not_allowed_at_this_stage/);
  await db.query('update orders set shipment=$1 where id=$2',['{"status":"DELIVERED"}',id]);
  await db.query('update shop_settings set customer_cancel_cutoff=$1 where shop_id=$2',['ANY_NON_TERMINAL',shop]);await assert.rejects(cancel(false),/cancel_not_allowed_at_this_stage/);
  await db.query('update orders set status=$1,shipment=$2 where id=$3',['PROCESSING','{"status":"IN_TRANSIT"}',id]);await cancel(false);
  await assert.rejects(cancel(false),/cancel_not_allowed_at_this_stage/);
  await db.query('update orders set status=$1 where id=$2',['NEW',id]);await db.query('update shop_settings set customer_cancellation_enabled=false where shop_id=$1',[shop]);await cancel(true);
 }finally{await db.close()}
});
