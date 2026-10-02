import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const root = process.cwd();
const migrationsDir = path.join(root, 'supabase', 'migrations');
const evidenceDir = path.join(root, 'docs', 'web', 'release-evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const migrationFiles = fs.readdirSync(migrationsDir).filter((n) => /^\d{3}_.+\.sql$/.test(n)).sort();
const byNumber = new Map();
for (const name of migrationFiles) {
  const n = Number(name.slice(0,3));
  if (!byNumber.has(n)) byNumber.set(n, []);
  byNumber.get(n).push(name);
}
const numbers = [...byNumber.keys()].sort((a,b)=>a-b);
const min = numbers[0] ?? 0;
const max = numbers.at(-1) ?? 0;
const duplicates = [...byNumber].filter(([, names]) => names.length > 1).map(([number,names])=>({number,names}));
const gaps = [];
if (min !== 1) gaps.push(1);
const unrecognized = fs.readdirSync(migrationsDir).filter(n=>n.endsWith('.sql') && !/^\d{3}_.+\.sql$/.test(n));
for (let n=min; n<=max; n++) if (!byNumber.has(n)) gaps.push(n);
const ledger = migrationFiles.map((name) => {
  const bytes = fs.readFileSync(path.join(migrationsDir,name));
  return { number:Number(name.slice(0,3)), name, bytes:bytes.length, sha256:sha256(bytes) };
});

const scanRoots = ['supabase/functions','web','scripts','platform'];
const sourceFiles = [];
for (const rel of scanRoots) {
  const start = path.join(root,rel);
  if (!fs.existsSync(start)) continue;
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir,{withFileTypes:true})) {
      const full=path.join(dir,ent.name);
      if (ent.isDirectory()) walk(full);
      else if (/\.(?:ts|js|mjs|cjs|tsx|jsx)$/.test(ent.name)) sourceFiles.push(full);
    }
  };
  walk(start);
}
const envRefs = new Map();
const patterns = [
  /Deno\.env\.get\(["']([A-Z0-9_]+)["']\)/g,
  /process\.env\.([A-Z0-9_]+)/g,
  /import\.meta\.env\.([A-Z0-9_]+)/g,
];
for (const file of sourceFiles) {
  const text=fs.readFileSync(file,'utf8');
  for (const re of patterns) {
    re.lastIndex=0;
    let m;
    while ((m=re.exec(text))) {
      const key=m[1];
      if (!envRefs.has(key)) envRefs.set(key,new Set());
      envRefs.get(key).add(path.relative(root,file));
    }
  }
}
const examplePath=path.join(root,'supabase','.env.example');
const example=fs.existsSync(examplePath)?fs.readFileSync(examplePath,'utf8'):'';
const runtimeEnv=[...envRefs].filter(([k])=>!k.startsWith('USTORE_TEST_') && !k.startsWith('TASK5_') && !k.startsWith('USTORE_STAGING_') && !k.startsWith('USTORE_10B_') && !k.startsWith('USTORE_10C_') && !k.startsWith('USTORE_PRODUCTION_')).sort(([a],[b])=>a.localeCompare(b));
const undocumented=runtimeEnv.filter(([k])=>!new RegExp(`^${k}=`, 'm').test(example)).map(([k])=>k);

const backupSql=fs.readFileSync(path.join(migrationsDir,'083_shop_backup_restore.sql'),'utf8');
const platformApi=fs.readFileSync(path.join(root,'supabase','functions','platform-api','index.ts'),'utf8');
const backupContract = {
  secretTablesExcluded: /'shop_bots','billz_connections','click_connections','payme_connections','uzum_connections'/.test(backupSql),
  restoreAudit: /'RESTORE_BACKUP'/.test(backupSql) && /platform_admin_action_log/.test(backupSql),
  restoreReprovisioning: /'status','PROVISIONING'/.test(backupSql),
  archiveFormatVersioned: /USTORE_SHOP_BACKUP/.test(platformApi) && /formatVersion:\s*1/.test(platformApi),
  zipTraversalGuard: /invalid_backup_storage_path/.test(platformApi),
  uploadSizeGuard: /500 \* 1024 \* 1024/.test(platformApi),
};

const requiredMigrationTail=Array.from({length:15},(_,i)=>91+i);
const tailPresent=requiredMigrationTail.every((n)=>byNumber.has(n));
const status = {
  generatedAt:new Date().toISOString(),
  environment:'LOCAL_SOURCE_ONLY',
  migrationLedger:{count:migrationFiles.length,min,max,duplicates,gaps,tail91to105Present:tailPresent,remoteLedgerVerified:false,postgresDryRun:'NOT_RUN_NO_POSTGRES_OR_REMOTE_DB'},
  backupRestore:{...backupContract,contractVerified:Object.values(backupContract).every(Boolean),realBackupRestore:'NOT_RUN_NO_POSTGRES_OR_STAGING_STORAGE'},
  staging:{smoke:'NOT_RUN_NO_STAGING_URL_OR_CREDENTIALS'},
  environmentVariables:{runtimeNames:runtimeEnv.map(([name,files])=>({name,files:[...files].sort()})),undocumented},
};
fs.writeFileSync(path.join(evidenceDir,'ASTRA_10A_MIGRATION_LEDGER.json'), JSON.stringify({generatedAt:status.generatedAt, remoteLedgerVerified:false, migrations:ledger},null,2)+'\n');
fs.writeFileSync(path.join(evidenceDir,'ASTRA_10A_AUDIT.json'), JSON.stringify(status,null,2)+'\n');

const failures=[];
if (unrecognized.length) failures.push(`unrecognized SQL filenames: ${unrecognized.join(",")}`);
if (duplicates.length) failures.push(`duplicate migration numbers: ${duplicates.map(x=>x.number).join(',')}`);
if (gaps.length) failures.push(`migration gaps: ${gaps.join(',')}`);
if (!tailPresent) failures.push('091-105 migration tail is incomplete');
if (undocumented.length) failures.push(`runtime env names missing from supabase/.env.example: ${undocumented.join(', ')}`);
if (!status.backupRestore.contractVerified) failures.push('backup/restore contract static verification failed');

console.log(`10a local release audit: migrations=${migrationFiles.length} range=${min}-${max}`);
console.log(`migration duplicates=${duplicates.length} gaps=${gaps.length} remoteLedgerVerified=false`);
console.log(`backup/restore contract=${status.backupRestore.contractVerified?'PASS':'FAIL'} realRestore=NOT_RUN`);
console.log(`runtime env names=${runtimeEnv.length} undocumented=${undocumented.length}`);
console.log(`staging smoke=NOT_RUN (no staging target configured)`);
if (failures.length) {
  for (const f of failures) console.error(`FAIL: ${f}`);
  process.exit(1);
}
console.log('ASTRA 10a local preflight: PASS_WITH_EXTERNAL_GATES');
