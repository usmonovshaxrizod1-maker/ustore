import { inspectRelease, evidenceMatches } from './release-integrity.mjs';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const evidenceFile = (process.env.USTORE_10B_EVIDENCE_FILE || '').trim();
const approved = process.env.USTORE_10B_EXECUTION_APPROVED === 'YES_DEPLOY_10B';
const dryRun = process.argv.includes('--dry-run');
const required = [
  'remoteMigrationLedgerVerified',
  'postgresDryRunVerified',
  'backupRestoreVerified',
  'stagingSmokeVerified',
  'productionAccessVerified',
  'productionSecretsReady',
  'centralHostnameOwnershipVerified',
  'rollbackOwnerAssigned',
];

if (dryRun) {
  console.log('ASTRA 10b deploy guard dry-run. No deployment command is executed by this script.');
  console.log('Required evidence gates:');
  for (const key of required) console.log(`- ${key}`);
  console.log('Execution also requires USTORE_10B_EXECUTION_APPROVED=YES_DEPLOY_10B.');
  process.exit(0);
}

if (!evidenceFile) {
  console.error('deploy_blocked: USTORE_10B_EVIDENCE_FILE is required');
  process.exit(2);
}
const absolute = path.resolve(root, evidenceFile);
if (!fs.existsSync(absolute)) {
  console.error(`deploy_blocked: evidence file not found: ${absolute}`);
  process.exit(2);
}
const evidence = JSON.parse(fs.readFileSync(absolute, 'utf8'));
const missing = required.filter((key) => evidence?.gates?.[key] !== true);
if (missing.length) {
  console.error(`deploy_blocked: missing verified gates: ${missing.join(', ')}`);
  process.exit(2);
}
if (!approved) {
  console.error('deploy_blocked: explicit execution approval missing');
  process.exit(2);
}
for (const rel of ['dist/BUILD_MANIFEST.json','dist/BUILD_AUDIT.json','dist/PERFORMANCE_AUDIT.json']) {
  if (!fs.existsSync(path.join(root, rel))) {
    console.error(`deploy_blocked: generated production artifact evidence missing: ${rel}`);
    process.exit(2);
  }
}

const identity = inspectRelease(root);
if (!evidenceMatches(evidence, identity)) { console.error('deploy_blocked: candidate_identity_mismatch'); process.exit(2); }
const plan = JSON.parse(fs.readFileSync(path.join(root,'docs/web/release-evidence/ASTRA_10B_DEPLOY_PLAN.json'),'utf8'));
if (plan.status === 'LOCAL_BLOCKED' || !evidenceMatches({candidate:plan.baseline,target:evidence.target},identity)) { console.error('deploy_blocked: stale_or_blocked_plan'); process.exit(2); }
console.log('10b guard passed. This repository intentionally does not auto-deploy unknown production infrastructure.');
console.log('Follow docs/web/ASTRA_10B_DEPLOY_RUNBOOK.md with the verified target/provider commands.');
console.log('Do not mark deployed until command output + smoke evidence are captured.');
