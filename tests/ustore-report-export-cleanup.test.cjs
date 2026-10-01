const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const api = fs.readFileSync(path.join(root, 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
const cleanup = fs.readFileSync(path.join(root, 'supabase', 'functions', 'report-export-cleanup-cron', 'index.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '064_report_exports_cleanup.sql'), 'utf8');
const cron = fs.readFileSync(path.join(root, 'supabase', 'REPORT_EXPORT_CLEANUP_CRON_SETUP.sql'), 'utf8');
const config = fs.readFileSync(path.join(root, 'supabase', 'config.toml'), 'utf8');

test('report PDF upload registers a server-side 24h expiry and keeps latest.pdf overwrite behavior', () => {
  assert.match(api, /shops\/\$\{shopId\}\/users\/\$\{safeTg\}\/latest\.pdf/);
  assert.match(api, /upsert: true/);
  assert.match(api, /Date\.now\(\) \+ 24 \* 60 \* 60 \* 1000/);
  assert.match(api, /from\('report_export_files'\)\.upsert/);
  assert.match(api, /createSignedUrl\(path, 300/);
});

test('retention metadata is private and indexed by expiry', () => {
  assert.match(migration, /create table if not exists public\.report_export_files/);
  assert.match(migration, /expires_at timestamptz not null/);
  assert.match(migration, /report_export_files_expires_at_idx/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.report_export_files from anon, authenticated/);
  assert.match(migration, /from storage\.objects o/);
  assert.match(migration, /interval '24 hours'/);
});

test('cleanup cron accepts no user path, rechecks expiry, removes only managed report paths, then deletes metadata', () => {
  assert.match(cleanup, /USTORE_REPORT_EXPORT_CRON_SECRET/);
  assert.match(cleanup, /lte\("expires_at", nowIso\)/);
  assert.match(cleanup, /latest\\\.pdf/);
  assert.match(cleanup, /maybeSingle\(\)/);
  assert.match(cleanup, /storage\.from\(BUCKET\)\.remove\(\[path\]\)/);
  assert.match(cleanup, /from\("report_export_files"\)[\s\S]*\.delete\(\)/);
});

test('pg_cron checks cleanup every 15 minutes and is idempotently rescheduled', () => {
  assert.match(cron, /ustore-report-export-cleanup-hourly/);
  assert.match(cron, /'\*\/15 \* \* \* \*'/);
  assert.match(cron, /cron\.unschedule/);
  assert.match(cron, /report-export-cleanup-cron/);
  assert.match(config, /\[functions\.report-export-cleanup-cron\][\s\S]*verify_jwt = false/);
});
