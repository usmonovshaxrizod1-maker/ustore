const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('a single release URL version reaches all Telegram Login modules on GitHub Pages', () => {
  const html = read('web/index.html');
  const app = read('web/app.js');
  const runtime = read('web/runtime/production.js');
  const live = read('web/services/live/index.js');
  const match = html.match(/src="\.\/app\.js\?v=([^"&]+)"/);
  assert.ok(match, 'HTML must request the new app.js after a manual upload');
  const version = match[1];
  for (const [source, spec] of [
    [app, `./runtime/production.js?v=${version}`],
    [app, `./features/auth/login.js?v=${version}`],
    [app, `./features/auth/official-telegram-callback.js?v=${version}`],
    [runtime, `../services/live/index.js?v=${version}`],
    [live, `./auth.js?v=${version}`],
  ]) assert.ok(source.includes(spec), `Stale module import: ${spec}`);
});

test('official login accepts www only for the configured platform host', () => {
  const source = read('supabase/functions/web-auth/index.ts');
  const match = source.match(/function officialTelegramOriginAllowed\(origin: string \| null\): boolean \{[\s\S]*?\n\}/);
  assert.ok(match);
  const check = vm.runInNewContext(`${match[0].replace('(origin: string | null): boolean', '(origin)')}\nofficialTelegramOriginAllowed`, {
    centralAuthOrigin: () => 'https://ustr.uz', URL,
  });
  assert.equal(check('https://ustr.uz'), true);
  assert.equal(check('https://www.ustr.uz'), true);
  assert.equal(check('https://usmonovshaxrizod1-maker.github.io'), true);
  assert.equal(check('https://fitcore.ustr.uz'), false);
  assert.equal(check('https://evil.example'), false);
});
