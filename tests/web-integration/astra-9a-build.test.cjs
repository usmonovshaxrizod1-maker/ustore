const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const DIST = path.join(ROOT, 'dist');
const WEB_DIST = path.join(DIST, 'web');

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

test('ASTRA-9a production build regenerates dist from source', () => {
  const result = spawnSync(process.execPath, ['scripts/build-production.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Production build complete:/);
  const measured = spawnSync(process.execPath, ['scripts/measure-production.mjs'], { cwd: ROOT, encoding: 'utf8', env: process.env });
  assert.equal(measured.status, 0, `${measured.stdout}\n${measured.stderr}`);
  assert.ok(fs.existsSync(path.join(DIST, 'index.html')), 'legacy Mini App root missing');
  assert.ok(fs.existsSync(path.join(WEB_DIST, 'index.html')), 'premium web entry missing');
  assert.ok(fs.existsSync(path.join(WEB_DIST, 'app.js')), 'premium web app host missing');
  assert.ok(fs.existsSync(path.join(DIST, 'BUILD_MANIFEST.json')), 'build manifest missing');
  assert.ok(fs.existsSync(path.join(DIST, 'BUILD_AUDIT.json')), 'build audit missing');
});

test('ASTRA-9a premium production artifact contains no mock/fixture/demo provider path', () => {
  const forbiddenPaths = [
    path.join(WEB_DIST, 'services', 'mock'),
    path.join(WEB_DIST, 'fixtures'),
    path.join(WEB_DIST, 'services', 'provider.js'),
  ];
  for (const item of forbiddenPaths) assert.equal(fs.existsSync(item), false, `forbidden path shipped: ${item}`);

  const text = walk(WEB_DIST)
    .filter((file) => /\.(?:js|html|css|json|txt)$/i.test(file))
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
  assert.doesNotMatch(text, /services\/mock\//i);
  assert.doesNotMatch(text, /(?:^|[/'"])fixtures\//im);
  assert.doesNotMatch(text, /createLocalDemoProvider|createMock[A-Z]/);
  assert.doesNotMatch(text, /[?&](?:mode|adapter)=mock/i);
});

test('ASTRA-9a production artifact has no obvious browser-shipped secret literal', () => {
  const text = walk(DIST)
    .filter((file) => /\.(?:js|html|json|txt|css)$/i.test(file))
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
  // Public Supabase publishable keys are expected. These patterns target credentials
  // that must never be shipped to a browser artifact.
  assert.doesNotMatch(text, /sb_secret_[A-Za-z0-9_-]+/);
  assert.doesNotMatch(text, /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/); // Telegram bot token shape
  assert.doesNotMatch(text, /\bsk-[A-Za-z0-9_-]{20,}\b/); // common private API-key shape
  assert.equal(walk(DIST).some((file) => /(^|\/)\.env(?:\.|$)/.test(file.replaceAll('\\', '/'))), false);
});

test('ASTRA-9a build audit records implemented local capabilities without live claims', () => {
  const audit = JSON.parse(fs.readFileSync(path.join(DIST, 'BUILD_AUDIT.json'), 'utf8'));
  assert.equal(audit.task, 'ASTRA-9c');
  assert.equal(audit.mockModulesIncluded, false);
  assert.equal(audit.relativeImportsResolved, true);
  assert.equal(audit.capabilities.reportExcel.status, 'IMPLEMENTED_LOCAL');
  assert.equal(audit.capabilities.productAddLine.status, 'IMPLEMENTED_LOCAL');
  assert.equal(audit.capabilities.supportAttachmentUpload.status, 'IMPLEMENTED_LOCAL');
});

test('ASTRA-9a production app composes live runtime and never imports demo provider', () => {
  const app = fs.readFileSync(path.join(ROOT, 'web', 'app.js'), 'utf8');
  const runtime = fs.readFileSync(path.join(ROOT, 'web', 'runtime', 'production.js'), 'utf8');
  assert.match(app, /createProductionAuthRuntime/);
  assert.match(app, /createProductionShopRuntime/);
  assert.doesNotMatch(app, /services\/provider\.js|createLocalDemoProvider|createMock/);
  assert.match(runtime, /createLiveServiceProvider/);
  assert.match(runtime, /createLiveTenantResolver/);
  assert.doesNotMatch(runtime, /services\/provider\.js|services\/mock|createLocalDemoProvider|createMock/);
});

test('ASTRA-9a UI state contract accepts production warning/success/loading states', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'web', 'components', 'ui.js'), 'utf8');
  for (const kind of ['warning', 'success', 'loading']) {
    assert.match(ui, new RegExp(`['\"]${kind}['\"]`), `${kind} state not accepted`);
  }
});

test('ASTRA-9a build manifest fingerprints both legacy and premium-web roots', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(DIST, 'BUILD_MANIFEST.json'), 'utf8'));
  assert.deepEqual(manifest.roots, { miniApp: '.', premiumWeb: 'web', platform: 'platform' });
  for (const required of ['index.html', 'ustore-shop-app.js', 'platform/platform-app.js', 'web/index.html', 'web/app.js', 'web/runtime/production.js']) {
    assert.match(manifest.files[required] || '', /^[a-f0-9]{64}$/, `missing fingerprint: ${required}`);
  }
});
