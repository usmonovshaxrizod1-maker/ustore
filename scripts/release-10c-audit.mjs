import { inspectRelease, evidenceMatches } from './release-integrity.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import childProcess from 'node:child_process';
import process from 'node:process';

const root = process.cwd();
const identity = inspectRelease(root);
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const hashFile = (rel) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');

const requiredFiles = [
  'dist/BUILD_MANIFEST.json',
  'dist/BUILD_AUDIT.json',
  'dist/PERFORMANCE_AUDIT.json',
  'docs/web/release-evidence/ASTRA_10A_MIGRATION_LEDGER.json',
  'docs/web/release-evidence/ASTRA_10B_DEPLOY_PLAN.json',
];
const missingFiles = requiredFiles.filter((rel) => !fs.existsSync(path.join(root, rel)));
if (missingFiles.length) {
  console.error(`10c_release_audit_failed: missing ${missingFiles.join(', ')}`);
  process.exit(1);
}

const manifestHash = hashFile('dist/BUILD_MANIFEST.json');
const auditHash = hashFile('dist/BUILD_AUDIT.json');
const perfHash = hashFile('dist/PERFORMANCE_AUDIT.json');
const migrationLedger = readJson('docs/web/release-evidence/ASTRA_10A_MIGRATION_LEDGER.json');
const deployPlan = readJson('docs/web/release-evidence/ASTRA_10B_DEPLOY_PLAN.json');
const migrationNumbers = (migrationLedger.migrations || []).map((m) => Number(m.number)).filter(Number.isFinite);
const maxMigration = migrationNumbers.length ? Math.max(...migrationNumbers) : null;
const candidateId = `ustore-rc-${manifestHash.slice(0, 12)}-m${String(maxMigration ?? 'unknown')}`;

let gitCommit = null;
try {
  gitCommit = childProcess.execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
  }).trim() || null;
} catch {
  gitCommit = null;
}

const evidenceFile = (process.env.USTORE_10C_EVIDENCE_FILE || '').trim();
let externalEvidence = null;
let evidenceError = null;
if (evidenceFile) {
  const absolute = path.resolve(root, evidenceFile);
  try {
    externalEvidence = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (e) {
    evidenceError = String(e?.message || e);
  }
}

const smokeKeys = [
  'catalogGuestVerified',
  'checkoutPaymentVerified',
  'centralLoginVerified',
  'ownerAdminVerified',
  'limitedStaffVerified',
  'customDomainTlsVerified',
  'miniAppVerified',
];
const releaseKeys = [
  'deploymentCompleted',
  'productionAccessVerified',
  'productionSecretsVerified',
  'domainActivationVerified',
];
const rollbackKeys = ['previousArtifactRecorded', 'rollbackOwnerConfirmed'];

const missingExternal = [];
if (!externalEvidence) {
  missingExternal.push('10cExternalEvidence');
} else {
  for (const key of releaseKeys) if (externalEvidence?.release?.[key] !== true) missingExternal.push(`release.${key}`);
  for (const key of smokeKeys) if (externalEvidence?.smoke?.[key] !== true) missingExternal.push(`smoke.${key}`);
  for (const key of rollbackKeys) if (externalEvidence?.rollback?.[key] !== true) missingExternal.push(`rollback.${key}`);
  if ((externalEvidence?.release?.deployedBuildManifestSha256 || '') !== manifestHash) {
    missingExternal.push('release.deployedBuildManifestSha256_matches_candidate');
  }
  if (!Number.isInteger(externalEvidence?.release?.deployedMigrationMax) || externalEvidence.release.deployedMigrationMax !== maxMigration) {
    missingExternal.push('release.deployedMigrationMax_current');
  }
  if (!String(externalEvidence?.release?.releaseArtifactId || '').trim()) {
    missingExternal.push('release.releaseArtifactId');
  }
}

if (!evidenceMatches({candidate:deployPlan.baseline,target:externalEvidence?.target || 'local'},identity) || deployPlan.status === 'LOCAL_BLOCKED') missingExternal.push('fresh_10b_plan');
if (externalEvidence) {
  if (!evidenceMatches(externalEvidence,identity)) missingExternal.push('candidate_identity');
  let prerequisite=null;
  try { prerequisite=JSON.parse(fs.readFileSync(path.resolve(root,process.env.USTORE_10B_EVIDENCE_FILE || ''),'utf8')); } catch {}
  const keys=['remoteMigrationLedgerVerified','postgresDryRunVerified','backupRestoreVerified','stagingSmokeVerified','productionAccessVerified','productionSecretsReady','centralHostnameOwnershipVerified','rollbackOwnerAssigned'];
  if (!evidenceMatches(prerequisite,identity) || prerequisite?.target !== externalEvidence.target || keys.some(k=>prerequisite?.gates?.[k]!==true)) missingExternal.push('matching_10b_prerequisites');
  if (!externalEvidence.rollback?.previousArtifactId?.trim()) missingExternal.push('rollback.previousArtifactId');
}
const fullyVerified = !evidenceError && missingExternal.length === 0;
const result = {
  generatedAt: new Date().toISOString(),
  task: 'ASTRA-10c',
  environment: 'LOCAL_FINAL_RELEASE_GATE',
  status: fullyVerified ? 'RELEASE_EVIDENCE_VERIFIED' : 'BLOCKED_EXTERNAL',
  productionReleased: fullyVerified,
  releaseCandidate: {
    buildId: candidateId,
    ...identity,
    sourceCommit: gitCommit,
    sourceCommitStatus: gitCommit ? 'AVAILABLE' : 'UNAVAILABLE_NOT_A_GIT_WORKTREE',
    buildManifestSha256: manifestHash,
    buildAuditSha256: auditHash,
    performanceAuditSha256: perfHash,
    maxMigration,
    migrationCount: migrationNumbers.length,
  },
  tenB: {
    deployedClaimFromLocalPlan: deployPlan.deployed === true,
    localDeployPlanStatus: deployPlan.status || null,
  },
  externalEvidence: evidenceFile || null,
  evidenceError,
  missingExternal,
  invariants: [
    'A local release-candidate build ID is not a production release ID.',
    'Production release is verified only when deployed build fingerprint and migration level match this candidate.',
    'Catalog, checkout/payment, central login, OWNER, limited STAFF, custom-domain TLS and Mini App all require production evidence.',
    'Rollback requires both a recorded previous immutable artifact and an assigned owner.',
    'No credential values are stored in this report.',
  ],
};

const out = path.join(root, 'docs/web/release-evidence/ASTRA_10C_RELEASE_CANDIDATE.json');
fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ status: result.status, releaseCandidate: result.releaseCandidate, missingExternal }, null, 2));
if (evidenceError || (evidenceFile && !fullyVerified)) process.exit(1);
