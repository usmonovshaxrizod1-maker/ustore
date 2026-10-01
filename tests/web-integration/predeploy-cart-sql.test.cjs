const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
// Run with NODE_PATH pointing to an installed @electric-sql/pglite package.
const {PGlite}=require('@electric-sql/pglite');
test('106 executes in PostgreSQL: atomic line operations, receipts, guest merge and legacy isolation',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table shops(id uuid primary key);create table accounts(id uuid primary key);
 create table cart_logs(shop_id uuid,tg_id text,account_id uuid,items jsonb,item_count integer,selected_promo_code text,updated_at timestamptz,customer_notified_at timestamptz,admin_reminded_at timestamptz,reminder_count integer,primary key(shop_id,tg_id));
 create table web_cart_merge_receipts(shop_id uuid,account_id uuid,merge_key text,response jsonb,request_items jsonb,primary key(shop_id,account_id,merge_key));
 insert into shops values('00000000-0000-0000-0000-000000000001');insert into accounts values('00000000-0000-0000-0000-000000000002');`);
 await db.exec(fs.readFileSync('supabase/migrations/106_web_cart_atomic_mutations.sql','utf8'));
 const scope=['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','123'];
 const mutate=async(id,op,line={})=>(await db.query('select ustore_mutate_web_cart($1,$2,$3,$4,$5,$6) as result',[...scope,id,op,JSON.stringify(line)])).rows[0].result;
 const line={type:'PRODUCT',productId:'p',lineKey:'product:p||',quantity:1};
 let r=await mutate('mutation-000000001','add',line);assert.equal(r.items[0].qty,1);
 r=await mutate('mutation-000000002','add',{type:'BUNDLE',bundleId:'b',lineKey:'bundle:b',quantity:2});assert.equal(r.items.length,2);
 r=await mutate('mutation-000000001','add',line);assert.equal(r.items.length,2);assert.equal(r.replayed,true);
 await assert.rejects(mutate('mutation-000000001','add',{...line,quantity:2}),/cart_mutation_conflict/);
 // Old Mini App snapshots are still accepted but cannot change the web cart.
 await db.exec(`update cart_logs set items='[]',item_count=0;`);
 assert.equal((await db.query('select item_count from web_carts')).rows[0].item_count,3);
 await db.query('select ustore_merge_web_cart($1,$2,$3,$4,$5)',[...scope,'guest-merge-000000001',JSON.stringify([{type:'PRODUCT',productId:'p',qty:2}])]);
 assert.equal((await db.query('select item_count from web_carts')).rows[0].item_count,5);
 r=await mutate('mutation-000000003','set',{lineKey:'product:p||',quantity:99});assert.equal(r.items.find(x=>x.productId==='p').qty,99);
 await assert.rejects(mutate('mutation-000000004','add',line),/invalid_cart_quantity/);
 r=await mutate('mutation-000000005','set',{lineKey:'bundle:b',quantity:0});assert.equal(r.items.length,1);
 await mutate('mutation-000000006','clear');assert.equal((await db.query('select item_count from web_carts')).rows[0].item_count,0);
 await db.exec('set role anon');await assert.rejects(db.query('select * from web_carts'),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}
});
