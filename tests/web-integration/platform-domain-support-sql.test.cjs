const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

test('platform domain SQL changes only the selected shop and audits the platform actor', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table shops(id uuid primary key default gen_random_uuid(), status text not null default 'ACTIVE');
      create table shop_reserved_slugs(slug text primary key); insert into shop_reserved_slugs values('admin');
      create table shop_slug_registry(slug text primary key, shop_id uuid not null unique references shops);
      create table shop_domains(id uuid primary key default gen_random_uuid(), shop_id uuid not null references shops,
        hostname text not null unique, kind text not null, status text not null default 'DRAFT',
        ownership_verified boolean not null default false, dns_status text not null default 'UNKNOWN',
        tls_status text not null default 'UNKNOWN', routing_ready boolean not null default false,
        is_primary boolean not null default false, dns_records jsonb not null default '[]',
        provider_name text, provider_id text, revision bigint not null default 0,
        last_checked_at timestamptz, error_code text, created_at timestamptz default now(), updated_at timestamptz default now(),
        operation_kind text, operation_started_at timestamptz);
      create unique index one_subdomain on shop_domains(shop_id) where kind='SUBDOMAIN';
      create unique index one_primary on shop_domains(shop_id) where is_primary;
      create table shop_settings(shop_id uuid primary key references shops,
        telegram_mini_app_domain_id uuid, telegram_mini_app_updated_at timestamptz);
      create table admin_audit_log(shop_id uuid, admin_tg_id text, action text, entity_type text, entity_id text, details jsonb);
      create function ustore_domain_state_guard() returns trigger language plpgsql as $$ begin
        if new.shop_id is distinct from old.shop_id or new.kind is distinct from old.kind then raise exception 'domain_identity_immutable'; end if;
        if new.hostname is distinct from old.hostname and old.kind <> 'SUBDOMAIN' then raise exception 'domain_identity_immutable'; end if;
        if new.status<>'ACTIVE' then new.is_primary=false; end if;
        new.revision=old.revision+1; return new;
      end $$;
      create trigger domain_guard before update on shop_domains for each row execute function ustore_domain_state_guard();`);
    await db.exec(fs.readFileSync('supabase/migrations/115_platform_domain_support.sql', 'utf8'));
    const one = (await db.query('insert into shops default values returning id')).rows[0].id;
    const two = (await db.query('insert into shops default values returning id')).rows[0].id;
    const create = async (shop, slug) => {
      await db.query('insert into shop_slug_registry values($1,$2)', [slug, shop]);
      const id = (await db.query(`insert into shop_domains(shop_id,hostname,kind,status,ownership_verified,dns_status,tls_status,routing_ready,is_primary)
        values($1,$2,'SUBDOMAIN','ACTIVE',true,'VERIFIED','ACTIVE',true,true) returning id`, [shop, `${slug}.ustr.uz`])).rows[0].id;
      await db.query('insert into shop_settings(shop_id,telegram_mini_app_domain_id) values($1,$2)', [shop, id]);
      return id;
    };
    const oldId = await create(one, 'fitcore');
    await create(two, 'another');
    const change = async (slug) => (await db.query('select ustore_platform_change_shop_subdomain($1,$2,$3,$4) as domain',
      [one, 'platform-admin', slug, 'ustr.uz'])).rows[0].domain;
    await assert.rejects(change('another'), /subdomain_taken/);
    await assert.rejects(change('admin'), /invalid_slug/);
    const changed = await change('fitshop');
    assert.equal(changed.id, oldId);
    assert.equal(changed.hostname, 'fitshop.ustr.uz');
    assert.equal(changed.status, 'DRAFT');
    assert.equal(changed.routing_ready, false);
    assert.equal((await db.query('select telegram_mini_app_domain_id from shop_settings where shop_id=$1', [one])).rows[0].telegram_mini_app_domain_id, null);
    assert.equal((await db.query('select hostname from shop_domains where shop_id=$1', [two])).rows[0].hostname, 'another.ustr.uz');
    assert.equal((await db.query("select admin_tg_id from admin_audit_log where action='PLATFORM_SUBDOMAIN_CHANGED'")).rows[0].admin_tg_id, 'platform-admin');
    await assert.rejects(db.query('select ustore_platform_set_primary_domain($1,$2,$3)', [one, 'platform-admin', oldId]), /domain_not_active/);
    await db.query("update shop_domains set status='ACTIVE',ownership_verified=true,dns_status='VERIFIED',tls_status='ACTIVE',routing_ready=true where id=$1", [oldId]);
    const primary = (await db.query('select ustore_platform_set_primary_domain($1,$2,$3) as domain', [one, 'platform-admin', oldId])).rows[0].domain;
    assert.equal(primary.is_primary, true);
    await db.exec('set role anon');
    await assert.rejects(db.query('select ustore_platform_change_shop_subdomain($1,$2,$3,$4)', [one, 'anon', 'other', 'ustr.uz']), /permission denied/);
  } finally { await db.close(); }
});
