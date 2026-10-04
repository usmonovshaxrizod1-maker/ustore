const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('local migration inventory is exactly sequential 001-117 with no duplicates', () => {
  const names = fs.readdirSync(path.join(root, 'supabase', 'migrations')).filter((n) => /^\d{3}_.+\.sql$/.test(n)).sort();
  assert.equal(names.length, 117);
  const nums = names.map((n) => Number(n.slice(0, 3)));
  assert.deepEqual(nums, Array.from({ length: 117 }, (_, i) => i + 1));
});

test('10a documents current domain/auth runtime names without embedding their values', () => {
  const env = read('supabase/.env.example');
  for (const name of ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ZONE_ID','USTORE_WILDCARD_READY','USTORE_CUSTOM_DOMAIN_MINI_APP_ENABLED','USTORE_BASE_HOSTNAME','WEB_AUTH_CENTRAL_URL']) {
    assert.match(env, new RegExp(`^${name}=`, 'm'));
  }
  assert.doesNotMatch(env, /SUPABASE_SERVICE_ROLE_KEY="[^\"]+"/);
  assert.doesNotMatch(env, /CLOUDFLARE_API_TOKEN="[^\"]+"/);
  assert.doesNotMatch(env, /USTORE_BOT_TOKEN_MASTER_KEY="[^\"]+"/);
});

test('10a release audit is executable and reports external gates rather than fake success', () => {
  const r = spawnSync(process.execPath, ['scripts/release-10a-audit.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /PASS_WITH_EXTERNAL_GATES/);
  assert.match(r.stdout, /realRestore=NOT_RUN/);
  assert.match(r.stdout, /staging smoke=NOT_RUN/);
});

test('10a staging smoke dry-run is network-free and names required staging inputs', () => {
  const r = spawnSync(process.execPath, ['scripts/staging-smoke-10a.mjs', '--dry-run'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /USTORE_STAGING_WEB_URL/);
  assert.match(r.stdout, /USTORE_STAGING_PLATFORM_API_URL/);
  assert.match(r.stdout, /No network request was made/);
});

test('10a backup/restore evidence explicitly distinguishes static contract from real restore', () => {
  const doc = read('docs/web/BACKUP_RESTORE_EVIDENCE_10A.md');
  assert.match(doc, /verified locally/i);
  assert.match(doc, /not.*evidence yet/i);
  assert.match(doc, /no `psql`/i);
  assert.match(doc, /RESTORE_BACKUP/);
});

test('10a release checklist keeps remote ledger, PostgreSQL dry-run, restore and staging smoke unchecked', () => {
  const doc = read('docs/web/RELEASE_CHECKLIST.md');
  assert.match(doc, /- \[ \] \*\*Remote migration ledger compared/);
  assert.match(doc, /- \[ \] PostgreSQL\/Supabase migration dry-run/);
  assert.match(doc, /- \[ \] Fresh staging shop backup ZIP created/);
  assert.match(doc, /- \[ \] Central platform HTML opens on staging/);
});
