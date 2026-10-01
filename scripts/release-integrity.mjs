import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { productionWebEntry } from './web-entry-paths.mjs';
export const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const walk = dir => fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)]).sort();
export function inspectRelease(root) {
  const read = rel => fs.readFileSync(path.join(root,rel));
  const json = rel => JSON.parse(read(rel));
  const manifest = json('dist/BUILD_MANIFEST.json');
  const files = manifest.files;
  if (!files || !Object.keys(files).length) throw Error('empty_build_manifest');
  for (const [rel, expected] of Object.entries(files)) {
    if (rel.includes('..') || path.isAbsolute(rel) || hash(read(`dist/${rel}`)) !== expected) throw Error(`artifact_mismatch:${rel}`);
    const source = rel === 'web/config.public.js' ? 'config.public.js' : rel;
    const sourceBytes = rel === 'web/index.html' ? Buffer.from(productionWebEntry(read(source).toString('utf8'))) : fs.existsSync(path.join(root,source)) ? read(source) : null;
    if (!['BUILD_AUDIT.json','PERFORMANCE_AUDIT.json'].includes(rel) && sourceBytes && hash(sourceBytes) !== expected) throw Error(`source_build_mismatch:${rel}`);
  }
  for (const full of walk(path.join(root,'dist'))) {
    const rel=path.relative(path.join(root,'dist'),full).split(path.sep).join('/');
    if (rel !== 'BUILD_MANIFEST.json' && !Object.hasOwn(files,rel)) throw Error(`unlisted_artifact:${rel}`);
  }
  for (const name of ['BUILD_AUDIT.json','PERFORMANCE_AUDIT.json']) if (!files[name]) throw Error(`unbound_audit:${name}`);
  const audit=json('dist/BUILD_AUDIT.json');
  if (audit.mockModulesIncluded !== false || audit.relativeImportsResolved !== true) throw Error('build_audit_failed');
  const ledger=json('docs/web/release-evidence/ASTRA_10A_MIGRATION_LEDGER.json');
  const names=fs.readdirSync(path.join(root,'supabase/migrations')).filter(n=>n.endsWith('.sql')).sort();
  if (!names.length || names.length !== ledger.migrations?.length) throw Error('migration_ledger_stale');
  names.forEach((name,i)=>{
    const m=ledger.migrations[i];
    if (Number(name.slice(0,3)) !== i+1 || m.number!==i+1 || m.name!==name || m.sha256!==hash(read(`supabase/migrations/${name}`))) throw Error('migration_ledger_mismatch');
  });
  const sourceFiles=['web','supabase/functions','supabase/migrations','scripts'].flatMap(d=>walk(path.join(root,d))).concat(['config.public.js','config.public.example.js','package.json'].map(f=>path.join(root,f))).sort();
  return {buildManifestSha256:hash(read('dist/BUILD_MANIFEST.json')),migrationSetSha256:hash(JSON.stringify(ledger.migrations)),sourceSha256:hash(JSON.stringify(sourceFiles.map(f=>[path.relative(root,f),hash(fs.readFileSync(f))]))),maxMigration:names.length};
}
export function evidenceMatches(evidence, identity) {
  return !!evidence && ['buildManifestSha256','migrationSetSha256','sourceSha256'].every(k=>evidence.candidate?.[k]===identity[k]) && typeof evidence.target==='string' && evidence.target.trim().length>0;
}
