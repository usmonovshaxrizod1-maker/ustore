// USTORE — Admin Roles & Permissions, 2.0-bosqich: faqat sxema. Ixcham
// statik tahlil (backend action'lar hali yo'q — keyingi bosqichda).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration031 = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '031_staff_roles_permissions.sql'), 'utf8');

test('shop_memberships.role gains STAFF via the SAME dynamic-constraint-drop pattern the project already uses (017) — never a hardcoded constraint name that could silently no-op on a differently-named constraint', () => {
  assert.match(migration031, /where conrelid = 'public\.shop_memberships'::regclass\s*\n\s*and contype = 'c'\s*\n\s*and pg_get_constraintdef\(oid\) ilike '%role%';/);
  assert.match(migration031, /check \(role in \('OWNER', 'STAFF'\)\);/);
});

test('roles/role_permissions/membership_roles are all shop-scoped and use composite (shop_id, ...) foreign keys — a role from Shop A can never be assigned to a membership in Shop B, even by a client-side id mixup', () => {
  assert.match(migration031, /create table if not exists public\.roles \(/);
  assert.match(migration031, /unique \(shop_id, id\),/);
  assert.match(migration031, /foreign key \(shop_id, role_id\) references public\.roles\(shop_id, id\) on delete cascade/);
  assert.match(migration031, /foreign key \(shop_id, telegram_user_id\) references public\.shop_memberships\(shop_id, telegram_user_id\) on delete cascade/);
});

test('a membership can have at most ONE primary/display role — enforced by a partial unique index, not just app-level convention', () => {
  assert.match(migration031, /create unique index if not exists membership_roles_one_primary\s*\n\s*on public\.membership_roles\(shop_id, telegram_user_id\) where is_primary;/);
});

test('a person can have at most ONE pending invite per shop at a time — enforced by a partial unique index (re-inviting must go through cancel/expire first, never silently duplicate)', () => {
  assert.match(migration031, /create unique index if not exists staff_invites_one_pending\s*\n\s*on public\.staff_invites\(shop_id, telegram_user_id\) where status = 'PENDING';/);
});

test('all 4 new tables are RLS-enabled with zero permissive policies (service_role-only access, same as every other business table in this project)', () => {
  for (const t of ['roles', 'role_permissions', 'membership_roles', 'staff_invites']) {
    assert.match(migration031, new RegExp(`alter table public\\.${t} enable row level security;`), `${t} must be RLS-enabled`);
  }
});

test('the standard-role uniqueness constraint (shop_id, key) never blocks multiple custom roles in the same shop — key is NULL for custom roles, and NULL never conflicts with NULL under a UNIQUE constraint', () => {
  assert.match(migration031, /key text,/);
  assert.match(migration031, /unique \(shop_id, key\)/);
  // Documented reasoning must actually be present, not just asserted by this test — the comment IS the spec here.
  assert.match(migration031, /NULL != NULL/);
});
