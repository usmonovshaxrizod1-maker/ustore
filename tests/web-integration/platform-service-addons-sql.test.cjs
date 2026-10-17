const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const migrationDir = path.join(__dirname, '..', '..', 'supabase', 'migrations');

function addonMigrationPath() {
  const matches = fs.readdirSync(migrationDir).filter((name) => name.endsWith('_platform_service_addons.sql'));
  assert.equal(matches.length, 1, 'exactly one CLI-generated platform_service_addons migration must exist');
  return path.join(migrationDir, matches[0]);
}

async function createPreMigrationDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create table public.subscription_requests(
      id uuid primary key default gen_random_uuid(),
      requester_telegram_id bigint not null,
      requested_by_user_id bigint,
      kind text not null,
      shop_id uuid,
      tariff_id uuid,
      tariff_name_snapshot text,
      tariff_price_snapshot numeric(14,2) not null,
      tariff_product_limit_snapshot integer,
      status text not null default 'NEW',
      receipt_storage_path text,
      payment_claimed_at timestamptz,
      payment_deadline_at timestamptz,
      owner_telegram_id bigint,
      requested_shop_name text,
      requested_bot_name text,
      requested_bot_bio text,
      billing_period text,
      duration_days integer,
      upgrade_action text,
      payment_method text,
      payment_method_id uuid,
      web_submission_key text,
      web_submission_input jsonb,
      updated_at timestamptz default now(),
      created_at timestamptz default now()
    );
    create unique index subscription_web_submission_key_idx
      on public.subscription_requests(requester_telegram_id,web_submission_key)
      where web_submission_key is not null;
  `);
  await db.exec(fs.readFileSync(addonMigrationPath(), 'utf8'));
  return db;
}

function submissionValues(overrides = {}) {
  return {
    kind: 'NEW_SHOP',
    tariff_id: '00000000-0000-0000-0000-000000000001',
    tariff_name_snapshot: 'Business',
    tariff_price_snapshot: 200000,
    tariff_product_limit_snapshot: 1000,
    total_price_snapshot: 310000,
    owner_telegram_id: '123456',
    requested_shop_name: 'Sinov do‘koni',
    billing_period: 'MONTHLY',
    duration_days: 30,
    payment_method: 'CARD',
    addons: [
      { code: 'CATALOG_SETUP', quantity: 1, unitPrice: 60000, totalPrice: 60000, details: { products: [{ name: 'Mahsulot', quantity: 2, price: 10000 }] } },
      { code: 'MANAGED_DOMAIN', quantity: 1, unitPrice: 50000, totalPrice: 50000, details: { domain: 'sinov.uz', years: 1 } },
    ],
    ...overrides,
  };
}

async function submit(db, key, input, values = submissionValues()) {
  return (await db.query(
    'select public.ustore_submit_web_subscription($1,$2,$3,$4,$5) as result',
    ['123456', key, JSON.stringify(input), JSON.stringify(values), null],
  )).rows[0].result;
}

test('service add-ons are written atomically and an identical replay stays idempotent', async () => {
  const db = await createPreMigrationDatabase();
  try {
    const input = { kind: 'NEW_SHOP', addons: submissionValues().addons };
    const first = await submit(db, 'service-addon-key-0001', input);
    const replay = await submit(db, 'service-addon-key-0001', input);
    assert.equal(replay.requestId, first.requestId);
    assert.equal(replay.replayed, true);

    const request = (await db.query('select tariff_price_snapshot,total_price_snapshot from public.subscription_requests where id=$1', [first.requestId])).rows[0];
    assert.equal(Number(request.tariff_price_snapshot), 200000);
    assert.equal(Number(request.total_price_snapshot), 310000);

    const addons = (await db.query('select code,quantity,unit_price,total_price,details from public.subscription_request_addons where request_id=$1 order by code', [first.requestId])).rows;
    assert.equal(addons.length, 2);
    assert.deepEqual(addons.map((row) => row.code), ['CATALOG_SETUP', 'MANAGED_DOMAIN']);
    assert.equal(Number(addons[0].total_price), 60000);
    assert.equal(Number(addons[1].total_price), 50000);
  } finally {
    await db.close();
  }
});

test('changed replay conflicts and database constraints protect duplicate add-ons', async () => {
  const db = await createPreMigrationDatabase();
  try {
    const input = { kind: 'NEW_SHOP', addons: submissionValues().addons };
    const first = await submit(db, 'service-addon-key-0002', input);
    await assert.rejects(submit(db, 'service-addon-key-0002', { ...input, changed: true }), /submission_payload_conflict/);
    await assert.rejects(
      db.query(`insert into public.subscription_request_addons(request_id,code,quantity,unit_price,total_price,details)
        values($1,'CATALOG_SETUP',1,60000,60000,'{}')`, [first.requestId]),
      /unique|duplicate/i,
    );
  } finally {
    await db.close();
  }
});

test('legacy totals are backfilled, add-ons cascade, RLS is enabled and public roles cannot execute the RPC', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table public.subscription_requests(
        id uuid primary key default gen_random_uuid(), requester_telegram_id bigint not null,
        requested_by_user_id bigint, kind text not null, shop_id uuid, tariff_id uuid,
        tariff_name_snapshot text, tariff_price_snapshot numeric(14,2) not null,
        tariff_product_limit_snapshot integer, status text default 'NEW', receipt_storage_path text,
        payment_claimed_at timestamptz, payment_deadline_at timestamptz, owner_telegram_id bigint,
        requested_shop_name text, requested_bot_name text, requested_bot_bio text, billing_period text,
        duration_days integer, upgrade_action text, payment_method text, payment_method_id uuid,
        web_submission_key text, web_submission_input jsonb, updated_at timestamptz default now(), created_at timestamptz default now()
      );
      create unique index subscription_web_submission_key_idx on public.subscription_requests(requester_telegram_id,web_submission_key) where web_submission_key is not null;
      insert into public.subscription_requests(requester_telegram_id,kind,tariff_price_snapshot) values(77,'NEW_SHOP',125000);
    `);
    await db.exec(fs.readFileSync(addonMigrationPath(), 'utf8'));
    const legacy = (await db.query('select total_price_snapshot from public.subscription_requests where requester_telegram_id=77')).rows[0];
    assert.equal(Number(legacy.total_price_snapshot), 125000);

    const input = { kind: 'NEW_SHOP', addons: submissionValues().addons };
    const created = await submit(db, 'service-addon-key-0003', input);
    await db.query('delete from public.subscription_requests where id=$1', [created.requestId]);
    assert.equal((await db.query('select count(*)::int as count from public.subscription_request_addons where request_id=$1', [created.requestId])).rows[0].count, 0);

    const rls = (await db.query("select relrowsecurity from pg_class where oid='public.subscription_request_addons'::regclass")).rows[0];
    assert.equal(rls.relrowsecurity, true);
    const privileges = (await db.query(`select
      has_function_privilege('anon','public.ustore_submit_web_subscription(text,text,jsonb,jsonb,uuid)','EXECUTE') as anon_execute,
      has_function_privilege('authenticated','public.ustore_submit_web_subscription(text,text,jsonb,jsonb,uuid)','EXECUTE') as authenticated_execute,
      has_function_privilege('service_role','public.ustore_submit_web_subscription(text,text,jsonb,jsonb,uuid)','EXECUTE') as service_execute`)).rows[0];
    assert.equal(privileges.anon_execute, false);
    assert.equal(privileges.authenticated_execute, false);
    assert.equal(privileges.service_execute, true);
  } finally {
    await db.close();
  }
});
