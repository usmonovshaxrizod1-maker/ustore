const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');
test('107 PostgreSQL submission is atomic, actor-scoped, immutable and replayable after approval',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create table subscription_requests(id uuid primary key default gen_random_uuid(),requester_telegram_id bigint,requested_by_user_id bigint,kind text,shop_id uuid,tariff_id uuid,tariff_name_snapshot text,tariff_price_snapshot numeric,tariff_product_limit_snapshot integer,status text default 'NEW',receipt_storage_path text,payment_claimed_at timestamptz,payment_deadline_at timestamptz,owner_telegram_id bigint,requested_shop_name text,requested_bot_name text,requested_bot_bio text,billing_period text,duration_days integer,upgrade_action text,payment_method text,payment_method_id uuid,updated_at timestamptz);`);
 await db.exec(fs.readFileSync('supabase/migrations/107_web_subscription_submission.sql','utf8'));
 const values={kind:'NEW_SHOP',tariff_id:'00000000-0000-0000-0000-000000000001',tariff_name_snapshot:'Plan',tariff_price_snapshot:100,owner_telegram_id:'123456',requested_shop_name:'Shop',billing_period:'MONTHLY',duration_days:30,payment_method:'CARD'};
 const submit=async(user,key,input=['NEW_SHOP'])=>(await db.query('select ustore_submit_web_subscription($1,$2,$3,$4) as result',[user,key,JSON.stringify(input),JSON.stringify(values)])).rows[0].result;
 const first=await submit('123456','submission-00000001');const replay=await submit('123456','submission-00000001');assert.equal(first.requestId,replay.requestId);assert.equal(replay.replayed,true);
 await assert.rejects(submit('123456','submission-00000001',['changed']),/submission_payload_conflict/);await assert.rejects(submit('123456','submission-00000002'),/request_already_pending/);
 const other=await submit('987654','submission-00000001');assert.notEqual(first.requestId,other.requestId);
 await db.query("update subscription_requests set status='APPROVED' where id=$1",[first.requestId]);assert.equal((await submit('123456','submission-00000001')).status,'APPROVED');
 assert.equal((await db.query('select count(*)::int as n from subscription_requests')).rows[0].n,2);
 await db.exec('set role anon');await assert.rejects(submit('123456','submission-00000001'),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}
});
