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

test('shop handoff returns from Telegram to the actual routed central path', () => {
  const app = read('web/app.js');
  const routes = read('web/navigation/routes.js');
  const server = read('supabase/functions/_shared/telegram-oidc.ts');
  assert.match(routes, /path: '\/auth\/handoff'/);
  assert.match(server, /path\.startsWith\("\/auth\/handoff\?"\)/);
  assert.match(app, /result\.data\.returnTo\.startsWith\('\/auth\/handoff\?'\)/);
  assert.match(app, /await controller\.signInTelegram\(\)/);
});

test('shop Telegram choice starts OIDC without a second click and retains retry on failure', async () => {
  const app = read('web/app.js');
  const start = app.indexOf('async function renderCentralHandoff(routeState, epoch) {');
  const end = app.indexOf('async function renderOriginCallback', start);
  assert.ok(start >= 0 && end > start);
  for (const fail of [false, true]) {
    let starts = 0;
    const shown = [];
    const loginController = { signInTelegram: async () => { starts++; return { ok: !fail }; } };
    const context = {
      URLSearchParams,
      renderEpoch: 1,
      loadProductionRuntimeModule: async () => ({ createProductionAuthRuntime: () => ({ auth: {
        getSession: async () => ({ ok: false }),
        getOriginHandoff: async () => ({ ok: true, data: { status: 'PENDING', botUsername: 'fitcore_bot' } }),
      } }) }),
      loadAuthFeatureModule: async () => ({}),
      loadLoginFeatureModule: async () => ({ createLoginController: () => loginController, createLoginView: () => ({ element: {} }) }),
      stateView: () => ({ kind: 'loading' }),
      reactive: () => ({ element: { kind: 'retry' }, destroy() {} }),
      mount: (view) => shown.push(view.element || view),
      remember: () => {},
      location: { assign: () => {} },
    };
    const render = vm.runInNewContext(`${app.slice(start, end)}\nrenderCentralHandoff`, context);
    await render({ search: `?state=${'s'.repeat(43)}&method=telegram`, target: `/auth/handoff?state=${'s'.repeat(43)}` }, 1);
    assert.equal(starts, 1);
    assert.equal(shown[0].kind, 'retry');
    assert.equal(starts, 1); // explicit shop choice immediately starts OIDC; no extra loading page
    assert.equal(shown.some((view) => view.kind === 'retry'), true);
  }
});
