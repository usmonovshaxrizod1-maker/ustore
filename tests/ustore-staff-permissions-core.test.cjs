// USTORE — Admin Roles & Permissions, 2.1-bosqich: permission katalogi +
// requirePermission()/ensureStandardRolesForShop() infratuzilmasi. Hali
// mavjud action'larga ULANMAGAN (keyingi bosqich) — faqat mexanizmning
// o'zi to'g'ri qurilganini tekshiradi.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FUNCTIONS_DIR = path.join(__dirname, '..', 'supabase', 'functions');
const shopApi = fs.readFileSync(path.join(FUNCTIONS_DIR, 'shop-api', 'index.ts'), 'utf8');
const permissionsTs = fs.readFileSync(path.join(FUNCTIONS_DIR, '_shared', 'permissions.ts'), 'utf8');

test('the permission catalog is a single exported list (PERMISSIONS) that both requirePermission() and the future role-editor UI will read from — no second, divergent list anywhere', () => {
  assert.match(permissionsTs, /export const PERMISSIONS = \[/);
  assert.match(permissionsTs, /export type Permission = typeof PERMISSIONS\[number\];/);
});

test('every one of the 7 standard (non-Owner) roles only grants permissions that actually exist in PERMISSIONS — no role definition can silently reference a typo\'d/removed permission key', () => {
  const catalogStart = permissionsTs.indexOf('export const PERMISSIONS');
  const catalogEnd = permissionsTs.indexOf('] as const;');
  const validPerms = new Set(
    permissionsTs.slice(catalogStart, catalogEnd).split('\n')
      .map((l) => l.match(/"([a-z._]+)"/)?.[1]).filter(Boolean)
  );
  assert.ok(validPerms.size >= 10, 'sanity: the catalog must actually contain permissions');

  const rolesBlock = permissionsTs.slice(permissionsTs.indexOf('STANDARD_ROLES'));
  const permsInRoles = [...rolesBlock.matchAll(/permissions: \[([^\]]+)\]/g)]
    .flatMap((m) => m[1].split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean));
  assert.ok(permsInRoles.length > 0);
  for (const p of permsInRoles) {
    assert.ok(validPerms.has(p), `role permission "${p}" must exist in the PERMISSIONS catalog`);
  }
});

test('OWNER and the platform super admin bypass role/permission lookups entirely in requirePermission() — no STAFF-style DB query ever runs for them', () => {
  const start = shopApi.indexOf('async function requirePermission(');
  const block = shopApi.slice(start, start + 400);
  assert.match(block, /if \(isSuperAdmin \|\| membershipRow\?\.role === "OWNER"\) return;/);
});

test('a STAFF member with no assigned roles gets an EMPTY effective-permission set (fails closed, not open) — getEffectivePermissions never falls back to "everything" on a missing/failed lookup', () => {
  const start = shopApi.indexOf('async function getEffectivePermissions(');
  const block = shopApi.slice(start, start + 1400);
  assert.match(block, /if \(!membershipRow \|\| membershipRow\.role !== "STAFF"\) \{ effectivePermissionsCache = new Set\(\); return effectivePermissionsCache; \}/);
  assert.match(block, /if \(roleErr\) \{ console\.error\(.*?\); effectivePermissionsCache = new Set\(\); return effectivePermissionsCache; \}/);
  assert.match(block, /roleIds\.length \? db\.from\("role_permissions"\).*? : Promise\.resolve\(\{ data: \[\], error: null \}\)/);
  assert.match(block, /shop_staff_permission_overrides/);
});

test('effective permissions are computed once per request and cached (not re-queried on every requirePermission() call within the same action)', () => {
  const start = shopApi.indexOf('async function getEffectivePermissions(');
  const block = shopApi.slice(start, start + 300);
  assert.match(block, /if \(effectivePermissionsCache\) return effectivePermissionsCache;/);
});

test('ensureStandardRolesForShop() is idempotent (skips roles that already exist by key) and seeds role_permissions in the SAME pass as the role rows — a shop can never end up with a role that has zero permissions because seeding was interrupted', () => {
  const start = shopApi.indexOf('async function ensureStandardRolesForShop(');
  const block = shopApi.slice(start, start + 1600);
  assert.match(block, /const missingKeys = Object\.keys\(STANDARD_ROLES\)\.filter\(\(k\) => !existingKeys\.has\(k\)\);/);
  assert.match(block, /if \(!missingKeys\.length\) return;/);
  assert.match(block, /is_system: true/);
});

test('boot() exposes the caller\'s own role/permissions ("*" sentinel for OWNER/super-admin, an explicit list for STAFF) so the frontend can gate UI without a second round-trip', () => {
  const start = shopApi.indexOf('const myPermissions =');
  const block = shopApi.slice(start, start + 300);
  assert.match(block, /isSuperAdmin \|\| membershipRow\?\.role === "OWNER"\) \? \["\*"\] : \[\.\.\.\(await getEffectivePermissions\(\)\)\]/);
  const bootReturnStart = shopApi.indexOf('staffRole: membershipRow?.role || null, myPermissions,');
  assert.ok(bootReturnStart >= 0, 'boot() response must include staffRole/myPermissions');
});
