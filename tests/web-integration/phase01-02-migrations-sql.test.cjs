const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

test('migrations 113 and 114 apply and enforce domain permissions and legal types', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table shops(id uuid primary key default gen_random_uuid(), status text not null default 'ACTIVE');
      create table shop_memberships(shop_id uuid not null references shops, telegram_user_id bigint not null,
        role text not null, status text not null default 'ACTIVE', primary key(shop_id,telegram_user_id));
      create table roles(id uuid primary key default gen_random_uuid(), shop_id uuid not null references shops,
        key text, is_system boolean not null default false, unique(shop_id,id));
      create table role_permissions(shop_id uuid not null,role_id uuid not null,permission text not null,
        primary key(shop_id,role_id,permission));
      create table membership_roles(shop_id uuid not null,telegram_user_id bigint not null,role_id uuid not null,
        primary key(shop_id,telegram_user_id,role_id));
      create table categories(id uuid primary key default gen_random_uuid(),shop_id uuid not null references shops);
      create table shop_settings(shop_id uuid primary key references shops);
      create table shop_legal_documents(shop_id uuid not null references shops,doc_type text not null,
        constraint shop_legal_documents_doc_type_check check(doc_type in ('PRIVACY','TERMS')));`);
    await db.exec(fs.readFileSync('supabase/migrations/113_domains_staff_category_icons.sql', 'utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/114_storefront_optional_legal_documents.sql', 'utf8'));
    const shop = (await db.query('insert into shops default values returning id')).rows[0].id;
    for (const [id, role] of [[101, 'OWNER'], [102, 'STAFF'], [103, 'STAFF'], [104, 'STAFF']])
      await db.query('insert into shop_memberships values($1,$2,$3,$4)', [shop, id, role, 'ACTIVE']);
    const manager = (await db.query('insert into roles(shop_id,key,is_system) values($1,$2,true) returning id', [shop, 'MANAGER'])).rows[0].id;
    const staffRole = (await db.query('insert into roles(shop_id,key,is_system) values($1,$2,false) returning id', [shop, 'CUSTOM'])).rows[0].id;
    await db.query('insert into membership_roles values($1,$2,$3),($1,$4,$5)', [shop, 102, manager, 103, staffRole]);
    await db.query("insert into role_permissions values($1,$2,'domains.manage')", [shop, staffRole]);
    const can = async id => (await db.query('select ustore_can_manage_domains($1,$2) as allowed', [shop, String(id)])).rows[0].allowed;
    assert.equal(await can(101), true);
    assert.equal(await can(102), true);
    assert.equal(await can(103), true);
    assert.equal(await can(104), false);
    await db.query("insert into shop_staff_permission_overrides values($1,102,'domains.manage',false,101,now()),($1,103,'domains.manage',false,101,now()),($1,104,'domains.manage',true,101,now())", [shop]);
    assert.equal(await can(102), true, 'system manager cannot be disabled');
    assert.equal(await can(103), false, 'explicit OFF overrides role');
    assert.equal(await can(104), true, 'explicit ON grants lower employee');
    await db.query("update shop_memberships set status='DISABLED' where shop_id=$1 and telegram_user_id=104", [shop]);
    assert.equal(await can(104), false, 'inactive employee is denied');
    await db.query("insert into categories(shop_id,icon_id,icon_color) values($1,'supp_protein','blue')", [shop]);
    await assert.rejects(db.query("insert into categories(shop_id,icon_id) values($1,'<script>')", [shop]), /categories_icon_id_safe_check/);
    await db.query("insert into shop_settings(shop_id,about,email) values($1,'About','shop@example.uz')", [shop]);
    await db.query("insert into shop_legal_documents values($1,'OFFER')", [shop]);
    await assert.rejects(db.query("insert into shop_legal_documents values($1,'UNKNOWN')", [shop]), /shop_legal_documents_doc_type_check/);
  } finally { await db.close(); }
});
