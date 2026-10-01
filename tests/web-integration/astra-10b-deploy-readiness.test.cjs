const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('10b package scripts exist', () => {
  const p = JSON.parse(read('package.json'));
  assert.equal(p.scripts['release:10b'], 'node scripts/release-10b-audit.mjs');
  assert.equal(p.scripts['deploy:10b:guard'], 'node scripts/deploy-10b-guard.mjs');
  assert.equal(p.scripts['smoke:production:readonly'], 'node scripts/production-smoke-10b.mjs');
});

test('10b runbook enforces DB -> backend -> frontend -> smoke -> domains', () => {
  const s = read('docs/web/ASTRA_10B_DEPLOY_RUNBOOK.md');
  const positions = ['Phase 1 — additive database first','Phase 2 — compatible backend/Edge functions','Phase 3 — generated frontend artifact','Phase 4 — read-only production smoke','Phase 5 — domain activation last'].map((x) => s.indexOf(x));
  assert.ok(positions.every((n) => n >= 0));
  assert.deepEqual([...positions].sort((a,b)=>a-b), positions);
  assert.match(s, /Migration \*\*103 must be applied before deploying 9c source\*\*/);
});

test('10b runbook freezes domain mutations during 102/backend crossing', () => {
  const s = read('docs/web/ASTRA_10B_DEPLOY_RUNBOOK.md');
  assert.match(s, /freeze custom-domain mutations/i);
  assert.match(s, /USTORE_CUSTOM_DOMAIN_MINI_APP_ENABLED/);
});

test('deploy guard refuses missing evidence and explicit approval', () => {
  const r = cp.spawnSync(process.execPath, ['scripts/deploy-10b-guard.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /deploy_blocked/);
});

test('release 10b audit remains truthful without external evidence', () => {
  const r = cp.spawnSync(process.execPath, ['scripts/release-10b-audit.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(read('docs/web/release-evidence/ASTRA_10B_DEPLOY_PLAN.json'));
  assert.equal(j.deployed, false);
  assert.equal(j.deployClaimAllowed, false);
  assert.equal(j.status, 'READY_FOR_OPERATOR_ONCE_EXTERNAL_GATES');
  assert.ok(j.missingExternal.length >= 8);
});

test('external evidence template contains references only and defaults all gates false', () => {
  const j = JSON.parse(read('docs/web/release-evidence/ASTRA_10B_EXTERNAL_EVIDENCE.example.json'));
  assert.ok(Object.values(j.gates).every((x) => x === false));
  assert.ok(!JSON.stringify(j).match(/service_role_key|bot_token|api[_-]?token\s*[:=]\s*[A-Za-z0-9_-]{20,}/i));
});
