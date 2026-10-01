// USTORE — Admin Roles & Permissions, 2.3/2.4/2.5-bosqich FRONTEND: yangi
// Xodimlar/Rollar sahifalari, taklif oqimi, egalikni topshirish UI'si.
// Ixcham statik tahlil — backend himoyasi allaqachon
// ustore-staff-management.test.cjs'da tekshirilgan, bu yerda faqat
// frontend'ning o'sha himoyani DUBLIKAT qilmasligini (UI ham Owner
// qatorini yashiradi) va to'g'ri action/payload chaqirilishini tekshiradi.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');

test('staff and role pages require owner or delegated staff permission', () => {
  for (const fn of ['openStaffPage', 'openRolesPage']) {
    const start = app.indexOf(`function ${fn}(`);
    assert.ok(start >= 0, `${fn} must exist`);
    const block = app.slice(start, start + 250);
    if (fn === 'openStaffPage') assert.match(block, /if \(!\(staffRole === 'OWNER' \|\| \(canViewAuditLog && hasPermission\('staff\.permissions\.manage'\)\)\)\) return;/);
    else assert.match(block, /if \(!\(staffRole === 'OWNER' \|\| hasPermission\('staff\.manage'\)\)\) return;/);
  }
});

test('renderStaffDetailSheet hides the roles checklist, block toggle, and remove button entirely for an OWNER-role member — the frontend never even renders controls that the backend would reject', () => {
  const start = app.indexOf('function renderStaffDetailSheet(');
  const end = app.indexOf('\n    async function saveStaffRoles', start);
  const block = app.slice(start, end);
  assert.match(block, /const isOwnerRow = m\.role === 'OWNER';/);
  const ownerBranchIdx = block.indexOf('isOwnerRow ? `');
  assert.ok(ownerBranchIdx >= 0);
  const ownerBranch = block.slice(ownerBranchIdx, block.indexOf('`}', ownerBranchIdx));
  assert.doesNotMatch(ownerBranch, /saveStaffRoles|toggleStaffBlocked|removeStaffMember/, 'owner branch of the ternary must not contain any staff-mutation controls');
});

test('the pending-invite accept flow calls staff_invite_respond with accept:true and reloads the page afterward (role/permission set changed, safest to re-boot rather than patch client state)', () => {
  const start = app.indexOf('async function respondToPendingInvite(');
  const block = app.slice(start, start + 700);
  assert.match(block, /await callApi\('staff_invite_respond', \{ inviteId, accept \}\);/);
  assert.match(block, /location\.reload\(\)/);
});

test('the pending-invite banner (renderPendingInviteBannerHtml) only renders when pendingStaffInvite is truthy, and is wired into the Profile page above the admin/user menus so an invited-but-not-yet-staff user still sees it', () => {
  const fnStart = app.indexOf('function renderPendingInviteBannerHtml(');
  const fnBlock = app.slice(fnStart, fnStart + 200);
  assert.match(fnBlock, /if \(!pendingStaffInvite\) return '';/);
  const invitePos = app.indexOf('${renderPendingInviteBannerHtml()}');
  const adminMenuPos = app.indexOf('${adminMenu}', invitePos);
  assert.ok(invitePos >= 0 && adminMenuPos > invitePos && adminMenuPos - invitePos < 700, 'the pending-invite banner must render before ${adminMenu} in the Profile page, close enough that it is not buried elsewhere');
});

test('submitTransferOwnership() requires BOTH a selected target and the confirmation checkbox before calling fcConfirm (a second, explicit confirmation dialog) — a single click can never transfer ownership', () => {
  const start = app.indexOf('async function submitTransferOwnership(');
  const block = app.slice(start, start + 900);
  assert.match(block, /if \(!target \|\| !confirmed\) \{ showAppNotice\(/);
  assert.match(block, /const ok = await fcConfirm\(/);
  assert.match(block, /await callApi\('transfer_ownership', \{ toTelegramUserId: target, oldOwnerNewRole: 'STAFF' \}\);/);
});

test('openTransferOwnershipSheet() only offers members with role===\'STAFF\' && status===\'ACTIVE\' as transfer targets — an OWNER cannot be selected as a transfer target, and a blocked/disabled staff member cannot receive ownership', () => {
  const start = app.indexOf('function openTransferOwnershipSheet(');
  const block = app.slice(start, start + 500);
  assert.match(block, /staffList\.filter\(m => m\.role === 'STAFF' && m\.status === 'ACTIVE'\)/);
});

test('deleteRoleAt() only sends force:true after a SECOND confirmation shown specifically because the server responded role_in_use — force is never sent on the first attempt', () => {
  const start = app.indexOf('async function deleteRoleAt(');
  const block = app.slice(start, start + 1200);
  const firstCallIdx = block.indexOf("await callApi('role_delete', { id });");
  assert.ok(firstCallIdx >= 0, 'first attempt must call role_delete without force');
  const forceCallIdx = block.indexOf("await callApi('role_delete', { id, force: true });");
  assert.ok(forceCallIdx > firstCallIdx, 'force:true call must come after the first, unforced attempt');
  assert.match(block.slice(firstCallIdx, forceCallIdx), /role_in_use/);
});

test('the old platform-admin-provisioning page keeps its own separate gate (isSuperAdmin && isAdminMode) and route key (PLATFORM_ADMINS), untouched by the new staff.manage-based Xodimlar system', () => {
  const start = app.indexOf('function openPlatformAdminsPage(');
  const block = app.slice(start, start + 200);
  assert.match(block, /if \(!\(isSuperAdmin && isAdminMode\)\) return;/);
  assert.match(block, /openPage\('PLATFORM_ADMINS', 'nav-profile'\);/);
});

test('renderActivePage router wires STAFF and ROLES to the new shop-level renderers, and PLATFORM_ADMINS to the untouched legacy renderer — no leftover reference to a function name that no longer exists', () => {
  assert.match(app, /case 'PLATFORM_ADMINS': renderPlatformAdminsPage\(container\); break;/);
  assert.match(app, /case 'STAFF': renderStaffPage\(container\); break;/);
  assert.match(app, /case 'ROLES': renderRolesPage\(container\); break;/);
});
