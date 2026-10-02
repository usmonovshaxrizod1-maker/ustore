const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const config = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8').replace(/^\uFEFF/, ''));

test('default deployment uses zone-owned routes until Cloudflare for SaaS is enabled', () => {
  const current = config('wrangler.jsonc');
  const saas = config('wrangler.saas.jsonc');
  assert.deepEqual(current.routes.map(route => route.pattern), ['ustr.uz/*', '*.ustr.uz/*']);
  assert.deepEqual(saas.routes.map(route => route.pattern), ['*/*']);
  assert.equal(current.name, saas.name);
  assert.deepEqual(current.assets, saas.assets);
});
