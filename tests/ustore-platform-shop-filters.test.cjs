const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../platform/platform-app.js'), 'utf8');
const ast = ts.createSourceFile('platform-app.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);

function declaration(name, variable = false) {
  let result;
  function visit(node) {
    if (!variable && ts.isFunctionDeclaration(node) && node.name?.text === name) result = node.getText(ast);
    else if (variable && ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(ast) === name)) result = node.getText(ast);
    if (!result) ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(result, `Missing ${name}`);
  return result;
}

function fixture(shops) {
  const context = vm.createContext({ shops: structuredClone(shops), window: {}, renderCount: 0 });
  vm.runInContext(`
    let myShops = shops, dashboardShopId = 'active-0', mySupportTickets = [];
    const render = () => renderCount++, pIcon = () => '', daysUntil = () => null;
    ${declaration('escapeHtml')}
    ${declaration('statusLabel')}
    const statusIcon = () => '';
    ${declaration('myShopStatusFilter', true)}
    ${declaration('myShopStatusFilters', true)}
    ${['getFilteredMyShops', 'renderMyShopStatusFilters', 'renderFilteredShopsEmpty', 'setMyShopStatusFilter', 'shopAvatarHtml', 'shopAvatarClass', 'renderShopDashboard', 'renderMyShopsTab', 'setDashboardShop'].map(n => declaration(n)).join('\n')}
  `, context);
  return { context, run: code => vm.runInContext(code, context) };
}
const shops = [
  ...Array.from({ length: 10 }, (_, i) => ({ id: `active-${i}`, shopName: `Shop ${i}`, status: 'ACTIVE' })),
  { id: 'frozen', shopName: 'Frozen shop', status: 'FROZEN' },
  { id: 'deleted', shopName: 'Deleted shop', status: 'TERMINATED' },
  { id: 'creating', shopName: 'Creating shop', status: 'PROVISIONING' },
  { id: 'deleting', shopName: 'Deleting shop', status: 'TERMINATING' },
];

test('default active filter and all four filters are shared by dashboard and shops tab', () => {
  const f = fixture(shops);
  assert.equal(f.run('myShopStatusFilter'), 'ACTIVE');
  for (const fn of ['renderShopDashboard', 'renderMyShopsTab']) {
    const html = f.run(`${fn}()`);
    for (const label of ['Barchasi', 'Faol', 'Muzlatilgan', 'O‘chirilgan']) assert.ok(html.includes(label));
    assert.match(html, /aria-pressed="true"[^>]*>Faol/);
    assert.ok(!html.includes('Frozen shop') && !html.includes('Deleted shop'));
    const card = fn === 'renderShopDashboard' ? 'plat-dashboard-shop-card' : 'plat-shop-list-card';
    assert.equal((html.match(new RegExp(`class="${card} `, 'g')) || []).length, 10);
  }
});

test('status filters include exactly their status; All preserves transitional shops and data', () => {
  const f = fixture(shops);
  for (const [filter, count] of [['ALL', 14], ['ACTIVE', 10], ['FROZEN', 1], ['TERMINATED', 1]]) {
    f.run(`setMyShopStatusFilter('${filter}')`);
    assert.equal(f.run('getFilteredMyShops().length'), count);
    if (filter !== 'ALL') assert.equal(f.run(`getFilteredMyShops().every(s => s.status === '${filter}')`), true);
  }
  assert.deepEqual(JSON.parse(f.run('JSON.stringify(myShops)')), shops);
  assert.equal(f.context.renderCount, 4);
  f.run(`setMyShopStatusFilter('not-a-status')`);
  assert.equal(f.run('myShopStatusFilter'), 'TERMINATED');
  assert.equal(f.context.renderCount, 4);
});

test('changing filter chooses a visible shop and never displays another status in focus', () => {
  const f = fixture(shops);
  f.run("setDashboardShop('active-3'); setMyShopStatusFilter('FROZEN')");
  const html = f.run('renderShopDashboard()');
  assert.equal(f.run('dashboardShopId'), 'frozen');
  assert.match(html, /<h2>Frozen shop<\/h2>/);
  assert.ok(!html.includes('Shop 3'));
  assert.match(html, /setDashboardShop\('frozen'\)/);
  assert.match(f.run('renderMyShopsTab()'), /openMyShopManage\('frozen'\)/);
});

test('empty filtered list keeps filters and recovery without stale shop stats', () => {
  const f = fixture(shops.filter(s => s.status === 'FROZEN'));
  for (const fn of ['renderShopDashboard', 'renderMyShopsTab']) {
    const html = f.run(`${fn}()`);
    assert.match(html, /Faol do‘kon yo‘q/);
    assert.match(html, /setMyShopStatusFilter\('ALL'\)/);
    assert.ok(!html.includes('plat-dashboard-focus') && !html.includes('Frozen shop'));
  }
  f.run("setMyShopStatusFilter('ALL')");
  assert.match(f.run('renderShopDashboard()'), /<h2>Frozen shop<\/h2>/);
});

test('zero shops and shops removed during refresh do not crash dashboard', () => {
  const f = fixture([]);
  assert.match(f.run('renderShopDashboard()'), /Faol do‘kon yo‘q/);
  assert.match(f.run('renderMyShopsTab()'), /startNewShopFlow/);
  const updated = fixture(shops);
  updated.run("setDashboardShop('active-2'); myShops = myShops.filter(s => s.id !== 'active-2')");
  updated.run('renderShopDashboard()');
  assert.equal(updated.run('dashboardShopId'), 'active-0');
});

test('shop names are escaped in compact cards and selection survives valid filter changes', () => {
  const f = fixture([{ id: 'active-0', status: 'ACTIVE', shopName: '<script>bad</script>' }]);
  const html = f.run('renderShopDashboard()');
  assert.ok(!html.includes('<script>bad'));
  assert.ok(html.includes('&lt;script&gt;'));
  f.run("setMyShopStatusFilter('ALL'); renderShopDashboard()");
  assert.equal(f.run('dashboardShopId'), 'active-0');
});
