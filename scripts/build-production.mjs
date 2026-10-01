import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { productionWebEntry } from './web-entry-paths.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'dist');
const webSource = path.join(root, 'web');
const webDist = path.join(dist, 'web');

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const rel = (p) => path.relative(root, p).split(path.sep).join('/');
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function copyFile(src, dst) { ensureDir(path.dirname(dst)); fs.copyFileSync(src, dst); }
function copyTree(src, dst, filter = () => true) {
  if (!fs.existsSync(src)) return;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name); const to = path.join(dst, entry.name);
    if (!filter(from, entry)) continue;
    if (entry.isDirectory()) copyTree(from, to, filter); else if (entry.isFile()) copyFile(from, to);
  }
}
function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full)); else if (entry.isFile()) out.push(full);
  }
  return out;
}

fs.rmSync(dist, { recursive: true, force: true });
ensureDir(dist);

// Legacy Telegram Mini App remains the default root artifact. This mirrors the
// old build copy-set but is deterministic and does not hand-edit dist.
for (const name of ['index.html','ustore.css','excel-import.js','config.public.js','config.public.example.js']) {
  const src = path.join(root, name); if (fs.existsSync(src)) copyFile(src, path.join(dist, name));
}
for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (entry.isFile() && /^ustore-.*\.js$/i.test(entry.name)) copyFile(path.join(root, entry.name), path.join(dist, entry.name));
}
copyTree(path.join(root, 'platform'), path.join(dist, 'platform'));
copyTree(path.join(root, 'vendor'), path.join(dist, 'vendor'));

// Premium web is a separate static origin root under dist/web. Only production
// code is copied: fixtures, mock adapters and the demo provider selector are
// intentionally excluded so a release artifact cannot silently switch to mock.
const excludedWebRoots = new Set(['fixtures']);
const excludedWebFiles = new Set(['README.md','index.js']);
function webFilter(full, entry) {
  const relative = path.relative(webSource, full).split(path.sep).join('/');
  const top = relative.split('/')[0];
  if (entry.isDirectory() && excludedWebRoots.has(top)) return false;
  if (relative === 'services/mock' || relative.startsWith('services/mock/')) return false;
  if (relative === 'services/provider.js') return false;
  if (entry.isFile() && excludedWebFiles.has(relative)) return false;
  return true;
}
copyTree(webSource, webDist, webFilter);
// Lazy admin assets must also exist when dist/web is hosted as the origin root.
for(const name of ['ustore-image-io.js','excel-import.js'])copyFile(path.join(root,name),path.join(webDist,name));
copyTree(path.join(root,'vendor'),path.join(webDist,'vendor'));

copyFile(path.join(root, 'config.public.js'), path.join(webDist, 'config.public.js'));
fs.writeFileSync(path.join(webDist, 'index.html'), productionWebEntry(fs.readFileSync(path.join(webSource, 'index.html'), 'utf8')));
// Route fallback for GitHub Pages preview via 404.html. Cloudflare Workers
// Static Assets provides SPA fallback through wrangler.jsonc, so no _redirects loop is emitted.
copyFile(path.join(webDist, 'index.html'), path.join(webDist, '404.html'));
// Keep security + route-level indexing headers in source control so private
// admin/account routes cannot silently lose X-Robots-Tag during a build.
copyFile(path.join(webSource, '_headers'), path.join(webDist, '_headers'));

const webFiles = walk(webDist);
const textFiles = webFiles.filter((f) => /\.(?:js|html|css|json|txt)$/i.test(f));
const joined = textFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const forbidden = [
  ['mock adapter path', /services\/mock\//i],
  ['fixture path', /(?:^|[/'\"])fixtures\//im],
  ['demo provider', /createLocalDemoProvider|createMock[A-Z]/],
  ['production query mock switch', /[?&](?:mode|adapter)=mock/i],
];
const violations = forbidden.filter(([, rx]) => rx.test(joined)).map(([name]) => name);
if (violations.length) throw new Error(`Production web artifact mock leakage: ${violations.join(', ')}`);
for (const forbiddenPath of [path.join(webDist,'services','mock'), path.join(webDist,'fixtures'), path.join(webDist,'services','provider.js')]) {
  if (fs.existsSync(forbiddenPath)) throw new Error(`Forbidden production path exists: ${path.relative(dist, forbiddenPath)}`);
}

// Ensure every relative static import/export in copied JS resolves inside the
// production artifact. Dynamic import() is included in the same check.
const missingImports = [];
const specRx = /(?:from\s*|import\s*\()\s*['"](\.{1,2}\/[^'"]+)['"]/g;
for (const file of webFiles.filter((f) => f.endsWith('.js'))) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(specRx)) {
    const raw = match[1].split('?')[0].split('#')[0];
    const target = path.resolve(path.dirname(file), raw);
    const candidates = [target, `${target}.js`, path.join(target, 'index.js')];
    if (!candidates.some((p) => fs.existsSync(p))) missingImports.push(`${path.relative(webDist,file)} -> ${raw}`);
  }
}
if (missingImports.length) throw new Error(`Production web missing imports:\n${missingImports.join('\n')}`);

const files = walk(dist).filter((f) => path.basename(f) !== 'BUILD_MANIFEST.json' && path.basename(f) !== 'BUILD_AUDIT.json');
const manifest = {
  format: 1,
  source: 'ASTRA-9c',
  roots: { miniApp: '.', premiumWeb: 'web', platform: 'platform' },
  files: Object.fromEntries(files.sort().map((f) => [path.relative(dist,f).split(path.sep).join('/'), sha256(fs.readFileSync(f))])),
};
const audit = {
  format: 1,
  task: 'ASTRA-9c',
  productionWebEntry: 'web/index.html',
  mockModulesIncluded: false,
  relativeImportsResolved: missingImports.length === 0,
  security: { cspMeta: true, staticHostHeaders: 'web/_headers', dependencyVersionsPinned: true, edgeSupabaseVersion: '2.116.0' },
  seo: { status: 'SPA_METADATA_CONTRACT_READY_SERVER_PENDING', evidence: 'O3 adds runtime canonical/robots/OpenGraph/Twitter metadata plus static X-Robots-Tag rules for private routes. Search indexing, route-specific social previews, dynamic sitemap and true 404 semantics still require a production server/prerender layer and are not claimed complete.' },
  capabilities: {
    reportExcel: { status:'IMPLEMENTED_LOCAL', evidence:'ExcelJS export of authorized report data, with customer/product pagination' },
    productAddLine: { status:'IMPLEMENTED_LOCAL', evidence:'web_cart_mutate uses migration106 account-scoped atomic operations; live rollout unverified' },
    supportAttachmentUpload: { status:'IMPLEMENTED_LOCAL', evidence:'production runtime injects signed private storage uploader; live storage unverified' },
  },
};
fs.writeFileSync(path.join(dist,'BUILD_MANIFEST.json'), JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(dist,'BUILD_AUDIT.json'), JSON.stringify(audit,null,2)+'\n');
console.log(`Production build complete: ${files.length} files + manifest/audit`);
