import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const web=path.join(root,'dist','web');
if(!fs.existsSync(web)) throw new Error('dist/web missing; run build first');
const walk=(d)=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const files=walk(web).filter(f=>!['PERFORMANCE_AUDIT.json'].includes(path.basename(f)));
const rows=files.map(f=>{const b=fs.readFileSync(f);return {file:path.relative(web,f).split(path.sep).join('/'),bytes:b.length,gzipBytes:zlib.gzipSync(b,{level:9}).length};});
const js=rows.filter(r=>r.file.endsWith('.js')), css=rows.filter(r=>r.file.endsWith('.css')), images=rows.filter(r=>/\.(?:png|jpe?g|webp|gif|svg|avif)$/i.test(r.file));
const staticRx=/\b(?:import|export)\s+(?:[^;'"()]*?\s+from\s*)?['"](\.{1,2}\/[^'"]+)['"]/g;
const seen=new Set();
function visit(rel){ if(seen.has(rel)) return; seen.add(rel); const abs=path.join(web,rel); if(!fs.existsSync(abs)) return; const src=fs.readFileSync(abs,'utf8'); for(const m of src.matchAll(staticRx)){let t=path.posix.normalize(path.posix.join(path.posix.dirname(rel),m[1])); if(!path.posix.extname(t))t+='.js'; visit(t);} }
visit('app.js');
visit('config.public.js');
const initialJs=rows.filter(r=>seen.has(r.file));
const sum=(a,k)=>a.reduce((n,r)=>n+r[k],0);
const audit={format:1,task:'ASTRA-9c',measuredFrom:'dist/web',totals:{files:rows.length,rawBytes:sum(rows,'bytes'),gzipBytes:sum(rows,'gzipBytes'),jsRawBytes:sum(js,'bytes'),jsGzipBytes:sum(js,'gzipBytes'),cssRawBytes:sum(css,'bytes'),cssGzipBytes:sum(css,'gzipBytes'),staticImages:images.length,staticImageBytes:sum(images,'bytes')},initialStaticJs:{files:[...seen].sort(),rawBytes:sum(initialJs,'bytes'),gzipBytes:sum(initialJs,'gzipBytes')},lazyJs:{rawBytes:sum(js.filter(r=>!seen.has(r.file)),'bytes'),gzipBytes:sum(js.filter(r=>!seen.has(r.file)),'gzipBytes')},largest:rows.sort((a,b)=>b.bytes-a.bytes).slice(0,10),notes:['Dynamic route modules are excluded from initialStaticJs.','No synthetic speedup claim is made; these are artifact byte measurements only.']};
fs.writeFileSync(path.join(root,'dist','PERFORMANCE_AUDIT.json'),JSON.stringify(audit,null,2)+'\n');
const manifestPath=path.join(root,'dist','BUILD_MANIFEST.json');
if(fs.existsSync(manifestPath)) {
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  for(const name of ['PERFORMANCE_AUDIT.json','BUILD_AUDIT.json']) {
    manifest.files[name]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'dist',name))).digest('hex');
  }
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
}
console.log(`Performance audit: total ${audit.totals.rawBytes} B / gzip ${audit.totals.gzipBytes} B; initial JS gzip ${audit.initialStaticJs.gzipBytes} B`);
