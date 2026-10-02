const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..','..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('Astra-9a merge recovery keeps L1/L2 source present beside L3/domain source',()=>{for(const f of ['web/features/admin-reports/reports.js','web/features/admin-team/team.js','web/features/admin-settings/settings.js','web/features/domains/domains.js'])assert.equal(fs.existsSync(path.join(root,f)),true,f);const web=read('web/index.js');assert.match(web,/admin-reports/);assert.match(web,/admin-team/);});

test('Astra-9a team actions are web allowlisted but audit keeps authoritative special gate',()=>{const live=read('web/services/live/admin.js'),api=read('supabase/functions/shop-api/index.ts');for(const a of ['role_list','role_create','role_update','role_delete','staff_list','staff_invite','staff_cancel_invite','staff_update_roles','staff_set_blocked','staff_remove','list_admin_audit_log'])assert.match(live,new RegExp(`'${a}'`));assert.match(api,/role_list: 'staff\.manage'/);assert.match(api,/staff_remove: 'staff\.manage'/);assert.match(api,/list_admin_audit_log: null/);assert.match(api,/case "list_admin_audit_log": \{[\s\S]*?requireAuditLogAccess\(\)/);});

test('Astra-9a route/nav include reports and team without duplicating settings/domains',()=>{const routes=read('web/navigation/routes.js'),nav=read('web/shells/admin.js');assert.equal((routes.match(/path: '\/admin\/reports'/g)||[]).length,1);assert.equal((routes.match(/path: '\/admin\/team'/g)||[]).length,1);assert.equal((routes.match(/path: '\/admin\/settings'/g)||[]).length,1);assert.equal((routes.match(/path: '\/admin\/domains'/g)||[]).length,1);assert.match(nav,/rolesAny: \['MANAGER'\]/);});
