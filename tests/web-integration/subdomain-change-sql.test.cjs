const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

test('110 changes only the owner shop subdomain, rejects taken names and resets routing', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table shops(id uuid primary key default gen_random_uuid(),status text not null default 'ACTIVE');
      create table shop_reserved_slugs(slug text primary key); insert into shop_reserved_slugs values('admin');
      create table shop_slug_registry(slug text primary key,shop_id uuid not null unique references shops);
      create table shop_domains(id uuid primary key default gen_random_uuid(),shop_id uuid not null references shops,
        hostname text not null unique,kind text not null,status text not null default 'DRAFT',ownership_verified boolean not null default false,
        dns_status text not null default 'UNKNOWN',tls_status text not null default 'UNKNOWN',routing_ready boolean not null default false,
        is_primary boolean not null default false,dns_records jsonb not null default '[]',provider_name text,provider_id text,
        revision bigint not null default 0,last_checked_at timestamptz,error_code text,created_at timestamptz default now(),updated_at timestamptz default now(),
        operation_kind text,operation_started_at timestamptz);
      create unique index one_subdomain on shop_domains(shop_id) where kind='SUBDOMAIN';
      create table admin_audit_log(shop_id uuid,admin_tg_id text,action text,entity_type text,entity_id text,details jsonb);
      create function ustore_can_manage_domains(p_shop_id uuid,p_tg_id text) returns boolean language sql as $$ select p_tg_id='owner' $$;
      create function ustore_domain_state_guard() returns trigger language plpgsql as $$ begin return new; end $$;
      create trigger shop_domain_state_guard before update on shop_domains for each row execute function ustore_domain_state_guard();`);
    await db.exec(fs.readFileSync('supabase/migrations/110_subdomain_change_and_credentials.sql','utf8'));
    const one=(await db.query("insert into shops default values returning id")).rows[0].id;
    const two=(await db.query("insert into shops default values returning id")).rows[0].id;
    const domain=async(shop,host,slug)=>{
      await db.query('insert into shop_slug_registry values($1,$2)',[slug,shop]);
      return (await db.query(`insert into shop_domains(shop_id,hostname,kind,status,ownership_verified,dns_status,tls_status,routing_ready,is_primary,dns_records,provider_name,provider_id,last_checked_at)
        values($1,$2,'SUBDOMAIN','ACTIVE',true,'VERIFIED','ACTIVE',true,true,'[{"type":"TXT"}]','TEST','provider',now()) returning id`,[shop,host])).rows[0].id;
    };
    const id=await domain(one,'fitcore.ustr.uz','fitcore');
    await domain(two,'taken.ustr.uz','taken');
    const change=async(slug,user='owner')=>(await db.query('select ustore_change_shop_subdomain($1,$2,$3,$4) as domain',[one,user,slug,'ustr.uz'])).rows[0].domain;
    const changed=await change('fitshop');
    assert.equal(changed.id,id); assert.equal(changed.hostname,'fitshop.ustr.uz'); assert.equal(changed.status,'DRAFT');
    assert.equal(changed.routing_ready,false); assert.equal(changed.ownership_verified,false); assert.equal(changed.is_primary,false);
    assert.equal(Number(changed.revision),1);
    assert.equal((await db.query('select slug from shop_slug_registry where shop_id=$1',[one])).rows[0].slug,'fitshop');
    assert.equal((await change('fitshop')).id,id);
    await assert.rejects(change('taken'),/subdomain_taken/);
    await assert.rejects(change('admin'),/invalid_slug/);
    await assert.rejects(change('new-name','stranger'),/forbidden:domains.manage/);
    const custom=(await db.query("insert into shop_domains(shop_id,hostname,kind) values($1,'custom.uz','CUSTOM') returning id",[two])).rows[0].id;
    await assert.rejects(db.query("update shop_domains set hostname='other.uz' where id=$1",[custom]),/domain_identity_immutable/);
    const audit=(await db.query("select details from admin_audit_log where action='SUBDOMAIN_CHANGED'")).rows[0].details;
    assert.equal(audit.old_hostname,'fitcore.ustr.uz'); assert.equal(audit.new_hostname,'fitshop.ustr.uz');
    await db.exec('set role anon');
    await assert.rejects(change('anonymous'),/permission denied/);
  } finally { await db.close(); }
});

