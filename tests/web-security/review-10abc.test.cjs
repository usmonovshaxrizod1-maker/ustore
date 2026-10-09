const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cp=require('node:child_process');
const root=path.resolve(__dirname,'../..');
test('release rejects tampered artifacts, stale migration ledger and mismatched evidence',async()=>{
 const {inspectRelease,evidenceMatches}=await import('../../scripts/release-integrity.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ustore-release-'));
 try {
  for(const rel of ['web','scripts','supabase','config.public.js','config.public.example.js','package.json']) fs.cpSync(path.join(root,rel),path.join(dir,rel),{recursive:true});
  for(const name of fs.readdirSync(root)) if(fs.statSync(path.join(root,name)).isFile())fs.copyFileSync(path.join(root,name),path.join(dir,name));
  for(const name of ['platform','vendor'])fs.cpSync(path.join(root,name),path.join(dir,name),{recursive:true});
  cp.execFileSync(process.execPath,['scripts/build-production.mjs'],{cwd:dir});
  cp.execFileSync(process.execPath,['scripts/measure-production.mjs'],{cwd:dir});
  cp.execFileSync(process.execPath,['scripts/release-10a-audit.mjs'],{cwd:dir});
  const identity=inspectRelease(dir);
  assert.equal(identity.maxMigration,121);
  assert.equal(evidenceMatches({target:'staging',candidate:identity},identity),true);
  assert.equal(evidenceMatches({target:'staging',candidate:{...identity,sourceSha256:'old'}},identity),false);
  cp.execFileSync(process.execPath,['scripts/release-10b-audit.mjs'],{cwd:dir});
  const external={target:'test',candidate:identity,release:{deploymentCompleted:true,productionAccessVerified:true,productionSecretsVerified:true,domainActivationVerified:true,deployedBuildManifestSha256:identity.buildManifestSha256,deployedMigrationMax:'not-a-number',releaseArtifactId:'release-1'},smoke:Object.fromEntries(['catalogGuestVerified','checkoutPaymentVerified','centralLoginVerified','ownerAdminVerified','limitedStaffVerified','customDomainTlsVerified','miniAppVerified'].map(k=>[k,true])),rollback:{previousArtifactRecorded:true,rollbackOwnerConfirmed:true,previousArtifactId:'old'}};
  const evidence=path.join(dir,'evidence.json');fs.writeFileSync(evidence,JSON.stringify(external));
  const outcome=cp.spawnSync(process.execPath,['scripts/release-10c-audit.mjs'],{cwd:dir,env:{...process.env,USTORE_10C_EVIDENCE_FILE:evidence},encoding:'utf8'});
  assert.equal(outcome.status,1);
  const report=JSON.parse(outcome.stdout);assert.equal(report.status,'BLOCKED_EXTERNAL');assert.ok(report.missingExternal.includes('release.deployedMigrationMax_current'));assert.ok(report.missingExternal.includes('matching_10b_prerequisites'));
  const f=path.join(dir,'dist/web/app.js');const original=fs.readFileSync(f);
  fs.appendFileSync(f,'\n//tamper');assert.throws(()=>inspectRelease(dir),/artifact_mismatch/);fs.writeFileSync(f,original);
  fs.appendFileSync(path.join(dir,'supabase/migrations/105_review_cart_merge_replay.sql'),'\n-- changed');assert.throws(()=>inspectRelease(dir),/migration_ledger_mismatch/);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
