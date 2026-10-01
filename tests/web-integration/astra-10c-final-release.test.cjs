const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const releaseScript = fs.readFileSync(path.join(root, 'scripts/release-10c-audit.mjs'), 'utf8');
const smokeScript = fs.readFileSync(path.join(root, 'scripts/production-smoke-10c.mjs'), 'utf8');
const guide = fs.readFileSync(path.join(root, 'docs/web/ASTRA_10C_FINAL_RELEASE.md'), 'utf8');
const example = JSON.parse(fs.readFileSync(path.join(root, 'docs/web/release-evidence/ASTRA_10C_EXTERNAL_EVIDENCE.example.json'), 'utf8'));

test('10c release candidate is bound to BUILD_MANIFEST sha256 and max migration, not a made-up production id', () => {
  assert.match(releaseScript, /hashFile\('dist\/BUILD_MANIFEST\.json'\)/);
  assert.match(releaseScript, /ustore-rc-\$\{manifestHash\.slice\(0, 12\)\}-m/);
  assert.match(releaseScript, /UNAVAILABLE_NOT_A_GIT_WORKTREE/);
  assert.match(guide, /real release commit SHA is intentionally not invented/i);
});

test('10c requires same deployed build fingerprint and current migration level', () => {
  assert.match(releaseScript, /deployedBuildManifestSha256/);
  assert.match(releaseScript, /deployedMigrationMax/);
  assert.match(releaseScript, /deployedBuildManifestSha256_matches_candidate/);
  assert.match(releaseScript, /deployedMigrationMax_current/);
});

test('10c final smoke matrix includes catalog, checkout/payment, login, OWNER, limited STAFF, custom-domain TLS and Mini App', () => {
  for (const key of ['catalogGuestVerified','checkoutPaymentVerified','centralLoginVerified','ownerAdminVerified','limitedStaffVerified','customDomainTlsVerified','miniAppVerified']) {
    assert.match(releaseScript, new RegExp(key));
  }
});

test('10c external evidence template contains references/signoffs but no credential value fields', () => {
  assert.equal(example.release.deploymentCompleted, false);
  assert.equal(example.smoke.checkoutPaymentVerified, false);
  const raw = JSON.stringify(example).toLowerCase();
  assert.doesNotMatch(raw, /password|service_role_key|api[_-]?key|bot[_-]?token|secret\s*value/);
});

test('10c production smoke checks public platform/shop/custom-domain TLS/Mini App reachability and does not fake authenticated smoke', () => {
  assert.match(smokeScript, /platform_html/);
  assert.match(smokeScript, /public_tariffs/);
  assert.match(smokeScript, /shop_catalog_html/);
  assert.match(smokeScript, /custom_domain_tls_html/);
  assert.match(smokeScript, /mini_app_html/);
  assert.match(smokeScript, /Authenticated checkout\/login\/OWNER\/STAFF evidence must be captured separately/);
});

test('10c local audit remains BLOCKED_EXTERNAL without production evidence', () => {
  const out = cp.execFileSync(process.execPath, ['scripts/release-10c-audit.mjs'], { cwd: root, encoding: 'utf8' });
  const parsed = JSON.parse(out);
  assert.equal(parsed.status, 'BLOCKED_EXTERNAL');
  assert.ok(parsed.releaseCandidate.buildId.startsWith('ustore-rc-'));
  const report = JSON.parse(fs.readFileSync(path.join(root, 'docs/web/release-evidence/ASTRA_10C_RELEASE_CANDIDATE.json'), 'utf8'));
  assert.equal(report.productionReleased, false);
  assert.ok(report.missingExternal.includes('10cExternalEvidence'));
});
