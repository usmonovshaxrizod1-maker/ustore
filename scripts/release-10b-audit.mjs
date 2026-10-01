import { inspectRelease, evidenceMatches } from './release-integrity.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const identity = inspectRelease(root);
const evidenceDir = path.join(root, 'docs', 'web', 'release-evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const exists = (p) => fs.existsSync(p);
const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

const tenAPath = path.join(evidenceDir, 'ASTRA_10A_AUDIT.json');
const manifestPath = path.join(root, 'dist', 'BUILD_MANIFEST.json');
const buildAuditPath = path.join(root, 'dist', 'BUILD_AUDIT.json');
const perfPath = path.join(root, 'dist', 'PERFORMANCE_AUDIT.json');
const migration103 = path.join(root, 'supabase', 'migrations', '103_release_security_hardening.sql');
const evidenceInput = (process.env.USTORE_10B_EVIDENCE_FILE || '').trim();

const tenA = exists(tenAPath) ? readJson(tenAPath) : null;
const external = evidenceInput && exists(path.resolve(root, evidenceInput))
  ? readJson(path.resolve(root, evidenceInput))
  : null;

const requiredExternal = [
  'remoteMigrationLedgerVerified',
  'postgresDryRunVerified',
  'backupRestoreVerified',
  'stagingSmokeVerified',
  'productionAccessVerified',
  'productionSecretsReady',
  'centralHostnameOwnershipVerified',
  'rollbackOwnerAssigned',
];
const externalGates = Object.fromEntries(requiredExternal.map((key) => [key, external?.gates?.[key] === true]));
const missingExternal = requiredExternal.filter((key) => !externalGates[key]);

if (external && !evidenceMatches(external, identity)) missingExternal.push('candidate_identity');

const phases = [
  {
    order: 1,
    id: 'database',
    label: 'Additive DB migrations',
    requiredBefore: ['remote migration ledger comparison', 'fresh backup', 'staging PostgreSQL dry-run'],
    action: 'Apply reviewed missing migrations through 107. Deploy 106/107 with the matching web and Edge code; 106 copies web carts into authoritative account storage. Freeze auth issuance during 104 plus matching Edge deployment; old session/handoff RPC signatures are removed.',
    rollback: 'Do not blindly down-migrate. Keep additive schema and roll application code back unless a reviewed compensating migration is explicitly prepared.',
  },
  {
    order: 2,
    id: 'backend',
    label: 'Compatible Edge/backend functions',
    requiredBefore: ['database phase verified'],
    action: 'Deploy compatible server functions after schema. Temporarily freeze custom-domain mutations while migration 102/domain helper compatibility is crossing versions.',
    rollback: '104 requires a compatible DB/Edge pair; do not roll old Edge back alone. Keep auth issuance/domain mutations frozen until compatibility is restored.',
  },
  {
    order: 3,
    id: 'frontend',
    label: 'Production web/Mini App artifact',
    requiredBefore: ['backend smoke passes', 'production build fingerprint recorded'],
    action: 'Deploy deterministic dist artifact matching BUILD_MANIFEST.json. Do not hand-edit dist on host.',
    rollback: 'Restore the previously recorded immutable frontend artifact/build ID.',
  },
  {
    order: 4,
    id: 'smoke',
    label: 'Read-only production smoke',
    requiredBefore: ['frontend deployed'],
    action: 'Verify central HTML, CSP/security headers, public tariff projection, auth entry and basic tenant routing before enabling new domain traffic.',
    rollback: 'If Critical/High smoke fails, stop release and restore previous frontend/backend revision before any domain activation.',
  },
  {
    order: 5,
    id: 'domains',
    label: 'Domain/TLS activation',
    requiredBefore: ['smoke phase passes', 'Cloudflare/DNS ownership and routing evidence'],
    action: 'Only then enable/verify domain routing flags and ACTIVE custom-domain traffic. Keep custom-domain Mini App flag off unless separately verified.',
    rollback: 'Disable new routing/feature flags, fall back to canonical UStorE subdomain and reconcile provider state; do not delete unknown in-flight provider resources.',
  },
];

const localChecks = {
  tenAAuditPresent: Boolean(tenA),
  tenALocalMigrationShapePass: Boolean(tenA?.migrationLedger && tenA.migrationLedger.duplicates?.length === 0 && tenA.migrationLedger.gaps?.length === 0 && tenA.migrationLedger.tail91to105Present),
  tenABackupContractPass: Boolean(tenA?.backupRestore?.contractVerified),
  buildManifestPresent: exists(manifestPath),
  buildAuditPresent: exists(buildAuditPath),
  performanceAuditPresent: exists(perfPath),
  migration103Present: exists(migration103),
};
const releaseCriticalLocal = ['tenAAuditPresent','tenALocalMigrationShapePass','tenABackupContractPass','migration103Present','buildManifestPresent','buildAuditPresent','performanceAuditPresent'];
const localFailures = releaseCriticalLocal.filter((name) => !localChecks[name]);

const plan = {
  generatedAt: new Date().toISOString(),
  environment: 'LOCAL_RELEASE_ORCHESTRATION_ONLY',
  status: localFailures.length
    ? 'LOCAL_BLOCKED'
    : missingExternal.length
      ? 'READY_FOR_OPERATOR_ONCE_EXTERNAL_GATES'
      : 'EXTERNAL_EVIDENCE_PRESENT_REVIEW_BEFORE_EXECUTION',
  deployed: false,
  deployClaimAllowed: false,
  baseline: {
    ...identity,
    buildManifestSha256: exists(manifestPath) ? sha256(manifestPath) : null,
    buildAuditSha256: exists(buildAuditPath) ? sha256(buildAuditPath) : null,
    migration103Sha256: exists(migration103) ? sha256(migration103) : null,
  },
  localChecks,
  externalEvidenceFile: evidenceInput || null,
  externalGates,
  missingExternal,
  phases,
  invariants: [
    'No deployment is claimed without operator evidence and actual target access.',
    'Migration 103 precedes backend source that calls its atomic RPCs.',
    'Custom-domain mutations are frozen during migration-102/backend compatibility crossing.',
    'Frontend deploy uses the generated dist artifact; host-side source edits are forbidden.',
    'Domain activation is last, after post-deploy smoke.',
  ],
};

fs.writeFileSync(path.join(evidenceDir, 'ASTRA_10B_DEPLOY_PLAN.json'), JSON.stringify(plan, null, 2) + '\n');
console.log(`10b deploy orchestration: ${plan.status}`);
console.log(`critical local checks: ${releaseCriticalLocal.length - localFailures.length}/${releaseCriticalLocal.length}; performanceAuditPresent=${localChecks.performanceAuditPresent}`);
console.log(`external gates missing: ${missingExternal.length}${missingExternal.length ? ` (${missingExternal.join(', ')})` : ''}`);
console.log('deployment executed: NO');
if (localFailures.length) process.exit(1);
console.log(missingExternal.length ? 'ASTRA 10b local orchestration: PASS_WITH_EXTERNAL_GATES' : 'ASTRA 10b local orchestration: EVIDENCE_PRESENT_REQUIRES_EXPLICIT_EXECUTION');
