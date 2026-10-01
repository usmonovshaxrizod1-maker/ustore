const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
test('automatic subdomains are unique, stable, reserved safely and restricted to backend', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table shops(id uuid primary key default gen_random_uuid(),status text);
      create table shop_reserved_slugs(slug text primary key);
      insert into shop_reserved_slugs values('admin');
      create table shop_slug_registry(slug text primary key,shop_id uuid unique references shops);
      create table shop_domains(id uuid primary key default gen_random_uuid(),shop_id uuid references shops,
        hostname text unique,kind text,status text default 'DRAFT',routing_ready boolean default false);
      create unique index one_subdomain on shop_domains(shop_id) where kind='SUBDOMAIN';`);
    await db.exec(fs.readFileSync('supabase/migrations/109_automatic_shop_subdomain.sql','utf8'));
    const shop = async (status='PROVISIONING') => (await db.query('insert into shops(status) values($1) returning id',[status])).rows[0].id;
    const reserve = async (id,name,base='ustr.uz') => (await db.query('select ustore_ensure_shop_subdomain($1,$2,$3) as domain',[id,name,base])).rows[0].domain;
    const first = await shop();
    const domain = await reserve(first,'Fitcore');
    assert.equal(domain.hostname,'fitcore.ustr.uz');
    assert.equal(domain.status,'DRAFT'); assert.equal(domain.routing_ready,false);
    assert.equal((await reserve(first,'Changed name')).id,domain.id);
    assert.equal((await reserve(await shop(),'Fitcore')).hostname,'fitcore2.ustr.uz');
    assert.equal((await reserve(await shop(),'admin')).hostname,'admin2.ustr.uz');
    assert.equal((await reserve(await shop(),'你好')).hostname,'shop.ustr.uz');
    const invalidShop = await shop();
    for (const base of ['https://ustr.uz','ustr.uz/path','ustr..uz','USTR.uz','ustr.123']) {
      await assert.rejects(reserve(invalidShop,'test',base),/invalid_hostname/);
    }
    await assert.rejects(reserve(await shop('FROZEN'),'frozen'),/shop_unavailable/);
    for (const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(reserve(first,'Fitcore'),/permission denied/);
      await db.exec('reset role');
    }
  } finally { await db.close(); }
});
