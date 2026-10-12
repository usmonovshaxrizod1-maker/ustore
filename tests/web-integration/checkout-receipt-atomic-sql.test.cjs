const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('checkout transaction verifies private receipt, rolls back failures and replays once',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create schema storage; create table storage.objects(bucket_id text,name text,metadata jsonb);
      create table orders(id bigint generated always as identity,shop_id uuid,tg_id text,checkout_key uuid,subtotal numeric,status text default 'NEW',delivery_snapshot jsonb,payment_snapshot jsonb,payment_receipt_path text,payment_receipt_uploaded_at timestamptz,receipt_review_status text default 'PENDING',shipment jsonb);
      alter table orders add column delivery_fee numeric,add column total_price numeric,add column payable_total numeric,add column promo_code text,add column promo_discount numeric,add column tier_discount numeric,add column vip_discount numeric,add column discount_source text,add column tier_id uuid,add column tier_snapshot jsonb;
      create table shop_settings(shop_id uuid,fulfillment_config jsonb);
      create table promotion_redemptions(shop_id uuid,promotion_id uuid,order_id bigint,tg_id text,discount_amount numeric);
      create table customer_discount_usages(shop_id uuid,customer_discount_id uuid,order_id bigint,tg_id text,discount_amount numeric);
      create table stock(qty int);insert into stock values(5);
      create function place_order(uuid,text,text,text,text,text,text,text,jsonb,uuid) returns jsonb language plpgsql as $$ declare i bigint;begin
        update stock set qty=qty-1;
        insert into orders(shop_id,tg_id,checkout_key,subtotal) values($1,$2,$10,100) returning id into i;
        return jsonb_build_object('id',i,'subtotal',100);
      end $$;`);
    await db.exec(fs.readFileSync('supabase/migrations/20261011160643_checkout_receipt_atomic.sql','utf8'));
    const shop='00000000-0000-0000-0000-000000000001', key='00000000-0000-4000-8000-000000000002';
    const path=`shops/${shop}/receipts/${key}/tg-file.png`;
    const params=[shop,'123','Ali Valiyev','+998901234567','TASHKENT','Bektemir','Uy','CARD','[]',key,path,'{"kind":"FREE"}','{"receiptRequired":true,"receiptStatus":"RECEIVED"}'];
    const submit=()=>db.query('select ustore_create_checkout_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) as result',params);
    await assert.rejects(submit(),/receipt_storage_verify_failed/);
    assert.equal((await db.query('select qty from stock')).rows[0].qty,5);
    assert.equal((await db.query('select count(*)::int as n from orders')).rows[0].n,0);
    await db.query('insert into storage.objects values($1,$2,$3)',['payment-receipts',path,'{"size":100}']);
    let r=(await submit()).rows[0].result;assert.equal(r.receiptPath,path);
    r=(await submit()).rows[0].result;assert.equal(r.replayed,true);
    assert.equal((await db.query('select qty from stock')).rows[0].qty,4);
    assert.equal((await db.query('select count(*)::int as n from orders')).rows[0].n,1);
    params[1]='attacker';await assert.rejects(submit(),/checkout_key_conflict/);
    await db.exec('set role anon');await assert.rejects(submit(),/permission denied/);
  } finally {await db.close();}
});
