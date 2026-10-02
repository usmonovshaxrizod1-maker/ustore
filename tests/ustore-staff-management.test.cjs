// USTORE — Admin Roles & Permissions, 2.3/2.4/2.5-bosqich: Owner himoyasi +
// egalikni topshirish + custom rollar + xodimlar/invite oqimi. Ixcham,
// eng muhim xavfsizlik xususiyatlariga qaratilgan statik tahlil.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shopApi = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
const migration032 = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '032_ownership_transfer.sql'), 'utf8');

// ---------------- Owner himoyasi ----------------

for (const action of ['staff_update_roles', 'staff_set_blocked', 'staff_remove']) {
  test(`${action} refuses to target an OWNER membership — rolla/permission tizimi Owner ustidan HECH QACHON ishlamaydi`, () => {
    const start = shopApi.indexOf(`case "${action}"`);
    const end = shopApi.indexOf('\n      case "', start + 10);
    const block = shopApi.slice(start, end > start ? end : start + 1500);
    assert.match(block, /if \(target\.role !== "STAFF"\) return json\(\{ error: "cannot_(edit_owner_roles|block_owner|remove_owner)" \}, 400\);/);
  });
}

test('transfer_ownership is gated by a DIRECT role check (membershipRow?.role === "OWNER"), never by requirePermission()/staff.manage — a staff member with every other permission granted still cannot transfer ownership', () => {
  const start = shopApi.indexOf('case "transfer_ownership"');
  const block = shopApi.slice(start, start + 400);
  assert.match(block, /if \(!isSuperAdmin && membershipRow\?\.role !== "OWNER"\) throw new Error\("forbidden:not_owner"\);/);
  assert.doesNotMatch(block, /requirePermission\(/, 'ownership transfer must never be reachable via the granular permission system');
});

test('transfer_shop_ownership runs as ONE plpgsql function (implicit single transaction) — promoting the new owner and demoting/removing the old one can never partially apply', () => {
  assert.match(migration032, /create or replace function public\.transfer_shop_ownership\(/);
  assert.match(migration032, /language plpgsql/);
  // Both mutations must live inside the same function body (not split across two RPCs).
  const bodyStart = migration032.indexOf('as $$');
  const bodyEnd = migration032.indexOf('\n$$;');
  const body = migration032.slice(bodyStart, bodyEnd);
  assert.match(body, /update public\.shop_memberships set role = 'OWNER'/);
  assert.match(body, /update public\.shop_memberships set role = 'STAFF'|delete from public\.shop_memberships where shop_id = p_shop_id and telegram_user_id = p_from_tg_id/);
});

test('the ownership-transfer target must already be an ACTIVE member of the shop — you cannot hand ownership to a random Telegram id who was never even invited', () => {
  assert.match(migration032, /if not exists \(\s*\n\s*select 1 from public\.shop_memberships\s*\n\s*where shop_id = p_shop_id and telegram_user_id = p_to_tg_id and status = 'ACTIVE'\s*\n\s*\) then\s*\n\s*raise exception 'target_not_active_member';/);
});

// ---------------- Custom rollar ----------------

test('role_delete refuses to delete a standard (is_system) role outright, and requires an explicit force flag to delete a custom role that is still assigned to staff', () => {
  const start = shopApi.indexOf('case "role_delete"');
  const block = shopApi.slice(start, start + 1000);
  assert.match(block, /if \(role\.is_system\) return json\(\{ error: "cannot_delete_system_role" \}, 400\);/);
  assert.match(block, /if \(\(count \|\| 0\) > 0 && !payload\.force\) return json\(\{ error: "role_in_use", usedCount: count \}, 400\);/);
});

test('role_create/role_update only accept permission strings that pass isValidPermission() — an unrecognized permission string is silently dropped, never stored', () => {
  const createStart = shopApi.indexOf('case "role_create"');
  const createBlock = shopApi.slice(createStart, createStart + 700);
  assert.match(createBlock, /payload\.permissions\.filter\(\(p: unknown\) => isValidPermission\(p\) && p !== 'staff\.permissions\.manage'\)/);

  const updateStart = shopApi.indexOf('case "role_update"');
  const updateBlock = shopApi.slice(updateStart, updateStart + 1200);
  assert.match(updateBlock, /payload\.permissions\.filter\(\(p: unknown\) => isValidPermission\(p\) && p !== 'staff\.permissions\.manage'\) as Permission\[\]/);
});

// ---------------- Xodimlar / Invite ----------------

test('staff_invite validates every role id actually belongs to this shop before creating the invite — a client cannot pre-authorize a role from a different tenant', () => {
  const start = shopApi.indexOf('case "staff_invite"');
  const block = shopApi.slice(start, start + 900);
  assert.match(block, /db\.from\("roles"\)\.select\("id"\)\.eq\("shop_id", shopId\)\.in\("id", roleIds\)/);
  assert.match(block, /if \(\(validRoles \|\| \[\]\)\.length !== roleIds\.length\) return json\(\{ error: "invalid_role" \}, 400\);/);
});

test('staff_invite_respond is deliberately NOT behind requirePermission()/requireAdmin() — the invitee is not yet staff when they call it, and the action instead checks the invite belongs to THEM by tgId', () => {
  const start = shopApi.indexOf('case "staff_invite_respond"');
  const end = shopApi.indexOf('\n      case "staff_update_roles"', start);
  const block = shopApi.slice(start, end);
  assert.doesNotMatch(block, /requirePermission\(|requireAdmin\(\)/);
  assert.match(block, /if \(String\(invite\.telegram_user_id\) !== tgId\) return json\(\{ error: "forbidden" \}, 403\);/);
});

test('accepting an invite grants EXACTLY the roles that were offered (from the invite row, not from the current request payload) — the invitee cannot escalate by claiming extra roles at accept-time', () => {
  const start = shopApi.indexOf('case "staff_invite_respond"');
  const block = shopApi.slice(start, start + 1800);
  assert.match(block, /const roleIds: string\[\] = Array\.isArray\(invite\.role_ids\) \? invite\.role_ids : \[\];/);
  assert.doesNotMatch(block, /payload\.roleIds/, 'must never read role ids from the caller\'s own payload when accepting');
});

test('an invite past its expires_at is rejected and flipped to EXPIRED on the spot (lazy expiry) rather than silently honored forever', () => {
  const start = shopApi.indexOf('case "staff_invite_respond"');
  const block = shopApi.slice(start, start + 700);
  assert.match(block, /if \(new Date\(invite\.expires_at\)\.getTime\(\) < Date\.now\(\)\) \{/);
  assert.match(block, /status: "EXPIRED"/);
});

test('boot() surfaces the caller\'s own pending invite (if any, and not expired) so the frontend can show an accept/reject prompt without a separate lookup action', () => {
  assert.match(shopApi, /pendingStaffInvite: pendingInviteR\.data \? \{ id: pendingInviteR\.data\.id, roleIds: pendingInviteR\.data\.role_ids, createdAt: pendingInviteR\.data\.created_at \} : null,/);
  assert.match(shopApi, /\.gt\("expires_at", new Date\(\)\.toISOString\(\)\)/);
});
