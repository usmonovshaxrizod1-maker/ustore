const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..','..');
const url=(f)=>pathToFileURL(path.join(root,f)).href;
const owner={shopRole:'OWNER',permissions:['*'],roleCodes:['OWNER']};
const manager={shopRole:'STAFF',permissions:['reports.view'],roleCodes:['MANAGER']};
const customStaff={shopRole:'STAFF',permissions:['staff.manage'],roleCodes:['CUSTOM']};

test('L2 recovered: staff/roles load through existing actions',async()=>{const {createMockAdminAdapter}=await import(url('web/services/mock/admin.js'));const {createAdminTeamController}=await import(url('web/features/admin-team/team.js'));const c=createAdminTeamController({adminPort:createMockAdminAdapter(),actor:owner});await c.load();const s=c.getState();assert.equal(s.status,'ready');assert.ok(s.staff.length>=3);assert.ok(s.roles.length>=3);});

test('L2 recovered: system MANAGER can read audit without staff.manage',async()=>{const {createMockAdminAdapter}=await import(url('web/services/mock/admin.js'));const {createAdminTeamController}=await import(url('web/features/admin-team/team.js'));const c=createAdminTeamController({adminPort:createMockAdminAdapter(),actor:manager});assert.equal(c.getState().permissions.staff,false);assert.equal(c.getState().permissions.audit,true);await c.load();assert.equal(c.getState().activeTab,'audit');assert.ok(c.getState().audit.length>0);});

test('L2 recovered: custom staff.manage does not automatically grant audit',async()=>{const {createMockAdminAdapter}=await import(url('web/services/mock/admin.js'));const {createAdminTeamController}=await import(url('web/features/admin-team/team.js'));const c=createAdminTeamController({adminPort:createMockAdminAdapter(),actor:customStaff});assert.equal(c.getState().permissions.staff,true);assert.equal(c.getState().permissions.audit,false);await c.setTab('audit');assert.equal(c.getState().activeTab,'staff');});

test('L2 recovered: owner mutation guard stops role/block/remove calls',async()=>{const {createAdminTeamController}=await import(url('web/features/admin-team/team.js'));const calls=[];const port={async invoke(action){calls.push(action);return{ok:true,data:{roles:[],permissions:[],staff:[],pendingInvites:[]}}}};const c=createAdminTeamController({adminPort:port,actor:owner});const row={tgId:'1',role:'OWNER',status:'ACTIVE',roles:[]};await c.setBlocked(row,true);await c.removeStaff(row);c.editStaffRoles(row);assert.equal(calls.length,0);assert.match(c.getState().mutationError.message,/OWNER/);});

test('L2 recovered: role draft remains after server failure',async()=>{const {createAdminTeamController}=await import(url('web/features/admin-team/team.js'));const port={async invoke(action){if(action==='role_create')return{ok:false,error:{code:'NETWORK_ERROR',message:'x',retryable:true}};return{ok:true,data:action==='role_list'?{roles:[],permissions:['reports.view']}:{staff:[],pendingInvites:[]}}}};const c=createAdminTeamController({adminPort:port,actor:owner});await c.load();c.editRole();c.updateRoleDraft({name:'Test',permissions:['reports.view']});await c.saveRole();assert.equal(c.getState().roleDraft.name,'Test');assert.equal(c.getState().mutationError.code,'NETWORK_ERROR');});

test('L2 recovered: used custom role needs explicit force before delete call',async()=>{const {createAdminTeamController}=await import(url('web/features/admin-team/team.js'));let deletes=0;const port={async invoke(action){if(action==='role_delete'){deletes++;return{ok:true,data:{deleted:true}}}return{ok:true,data:{}}}};const c=createAdminTeamController({adminPort:port,actor:owner});const role={id:'r1',isSystem:false,usedCount:2};await c.deleteRole(role);assert.equal(deletes,0);assert.equal(c.getState().mutationError.code,'CONFLICT');await c.deleteRole(role,{force:true});assert.equal(deletes,1);});
