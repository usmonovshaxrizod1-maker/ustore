// Local UI regression against the actual platform entry, scripts and frame bridge.
// No production login or writes. Pass Playwright module, output directory and browser executable.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.argv[2] || 'playwright');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[3] || path.join(root, 'dist/platform-shops-qa'));
const shops = [
  ...Array.from({ length: 10 }, (_, i) => ({ id: `active-${i}`, shopName: ['FITCORE', 'Test', 'Sport mahsulotlari', 'Магазин одежды', 'Juda uzun nomli yangi do‘kon'][i % 5], botUsername: `fixture_shop_${i}_bot`, status: 'ACTIVE', tariffId: 'premium', tariffName: 'Premium', usedProductCount: i * 20, productLimit: 500 })),
  { id: 'frozen', shopName: 'Muzlatilgan do‘kon', status: 'FROZEN' },
  { id: 'deleted', shopName: 'O‘chirilgan do‘kon', status: 'TERMINATED' },
  { id: 'creating', shopName: 'Sozlanayotgan do‘kon', status: 'PROVISIONING' },
  { id: 'deleting', shopName: 'O‘chirilayotgan do‘kon', status: 'TERMINATING' },
];
const boot = { isSuperAdmin: false, myShops: shops, myRequests: [], mySupportTickets: [], ownerNotifications: [], tariffs: [], landingSlides: [], platformActor: { firstName: 'Local', lastName: 'Test', telegramId: '12345' } };
const host = `import { createMiniAppFrameHost } from '/shared/frame-host.js';
  const data = ${JSON.stringify(boot)};
  if (location.search.includes('onlyFrozen')) data.myShops = data.myShops.filter(s => s.status === 'FROZEN');
  const host = createMiniAppFrameHost({kind:'platform',route:'/platform/app',viewerKey:'11111111-1111-4111-8111-111111111111',runtime:{endpoints:{platform:location.origin+'/qa-api'},tokenStore:{get:()=> 'isolated-test-session'}},fetchImpl:async()=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}})});
  document.body.append(host.element);`;
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/qa') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><link rel="stylesheet" href="/styles/index.css"><link rel="stylesheet" href="/shop-welcome.css"><script src="/shop-welcome.js"></script><script type="module" src="/qa-host.js"></script>'); return; }
  if (pathname === '/qa-host.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(host); return; }
  let relative = pathname.replace(/^\//, '');
  if (relative === 'platform-ui/') relative += 'index.html';
  const candidate = relative.startsWith('platform-ui/') ? path.join(root, 'platform', relative.slice('platform-ui/'.length))
    : relative.startsWith('web/') ? path.join(root, relative)
    : relative.startsWith('shared/') ? path.join(root, 'web', relative)
    : ['shop-welcome.js', 'shop-welcome.css', 'shop-welcome-art.svg'].includes(relative) ? path.join(root, relative)
    : path.join(root, 'dist/web', relative);
  if (!candidate.startsWith(root + path.sep) || !fs.existsSync(candidate) || fs.statSync(candidate).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  const type = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }[path.extname(candidate)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type }); res.end(fs.readFileSync(candidate));
});

async function verifyView(page, frame, width, height, mode) {
  await page.setViewportSize({ width, height });
  await frame.locator('.plat-dashboard-shop-card').first().waitFor();
  await page.locator('.ustore-welcome').waitFor({ state: 'detached' });
  const settle = () => frame.locator('body').evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
  await settle();
  const expected = width >= 768 ? 3 : 1;
  const home = await frame.locator('.plat-dashboard-shop-tabs').evaluate(el => ({
    columns: getComputedStyle(el).gridTemplateColumns.split(' ').length,
    count: el.children.length,
    overflow: document.documentElement.scrollWidth > innerWidth,
    bottom: el.getBoundingClientRect().bottom,
    cardWidth: el.firstElementChild.getBoundingClientRect().width,
  }));
  assert.equal(home.columns, expected); assert.equal(home.count, 10); assert.equal(home.overflow, false);
  if (width >= 768) { assert.ok(home.bottom < height, 'all ten compact shop cards fit this viewport'); assert.ok(home.cardWidth >= 200, 'tablet cards must have room for readable text'); }
  assert.equal(await frame.locator('.plat-shop-status-filters button[aria-pressed="true"]').innerText(), 'Faol');
  assert.equal(await frame.locator('.plat-shop-status-filters button').count(), 4);
  await page.screenshot({ path: path.join(output, `${mode}-${width}-home.png`), fullPage: true });
  await frame.locator('.plat-dashboard-shop-card').nth(3).click();
  assert.equal(await frame.locator('.plat-dashboard-shop-card[aria-pressed="true"]').count(), 1);
  await frame.getByRole('button', { name: 'Muzlatilgan', exact: true }).click();
  assert.equal(await frame.locator('.plat-dashboard-shop-card').count(), 1);
  assert.equal(await frame.locator('.plat-dashboard-focus h2').innerText(), 'Muzlatilgan do‘kon');
  await frame.locator('.plat-dashboard-head button').click();
  assert.equal(await frame.locator('.plat-shop-list-card').count(), 1);
  assert.equal(await frame.locator('.plat-shop-status-filters button[aria-pressed="true"]').innerText(), 'Muzlatilgan');
  await frame.getByRole('button', { name: 'O‘chirilgan', exact: true }).click();
  assert.equal(await frame.locator('.plat-shop-list-card').count(), 1);
  await frame.getByRole('button', { name: 'Barchasi', exact: true }).click();
  assert.equal(await frame.locator('.plat-shop-list-card').count(), 14);
  await frame.getByRole('button', { name: 'Faol', exact: true }).click();
  const list = await frame.locator('.plat-shop-list-simple').evaluate(el => ({ columns: getComputedStyle(el).gridTemplateColumns.split(' ').length, overflow: document.documentElement.scrollWidth > innerWidth, cardWidth: el.firstElementChild.getBoundingClientRect().width }));
  assert.equal(list.columns, expected); assert.equal(list.overflow, false);
  if (width >= 768) assert.ok(list.cardWidth >= 200, 'shop management cards must use the tablet width');
  await settle();
  await page.screenshot({ path: path.join(output, `${mode}-${width}-shops.png`), fullPage: true });
  await frame.locator('.plat-shop-list-card').first().click();
  await frame.getByText('Obuna va tarif', { exact: true }).waitFor();
  // Existing shop details and navigation still work after filtering.
  await frame.locator('button[onclick="goHomePage()"]:visible').click();
}

(async () => {
  fs.mkdirSync(output, { recursive: true }); let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ headless: true, ...(process.argv[4] ? { executablePath: process.argv[4] } : {}), args: ['--disable-gpu'] });
    const context = await browser.newContext();
    await context.route(/^https:\/\/(telegram\.org|cdn\.jsdelivr\.net)\//, route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    context.setDefaultTimeout(10000);
    const errors = [], page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    page.on('console', message => { if (message.type() === 'error') console.error('Browser:', message.text().slice(0, 400)); });
    page.on('requestfailed', request => console.error('Failed resource:', new URL(request.url()).pathname, request.failure()?.errorText));
    await page.goto(origin + '/qa'); const frame = page.frameLocator('iframe');
    try {
      for (const [width, height] of [[1440, 1000], [820, 1180], [390, 844]]) await verifyView(page, frame, width, height, 'web');
    } catch (error) {
      console.error('Page errors:', errors);
      for (const child of page.frames()) console.error('Frame:', child.url(), await child.locator('body').innerText().catch(() => 'unavailable'));
      throw error;
    }
    await page.goto(origin + '/qa?onlyFrozen');
    await frame.getByText('Faol do‘kon yo‘q', { exact: true }).waitFor();
    assert.equal(await frame.locator('.plat-dashboard-focus').count(), 0);
    await frame.getByRole('button', { name: 'Barcha do‘konlarni ko‘rish', exact: true }).click();
    assert.equal(await frame.locator('.plat-dashboard-shop-card').count(), 1);
    const mini = await context.newPage(); mini.on('pageerror', e => errors.push(e.message));
    await mini.addInitScript(() => { window.Telegram = { WebApp: { initData: 'isolated-local-test', expand() {}, ready() {}, colorScheme: 'light' } }; });
    await mini.route('**/functions/v1/platform-api', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(boot) }));
    await mini.goto(origin + '/platform-ui/index.html');
    for (const [width, height] of [[820, 1180], [390, 844]]) await verifyView(mini, mini, width, height, 'miniapp');
    assert.deepEqual(errors, []);
    console.log('PASS: real Web + Mini App, 3/1 columns, ten active cards, all four filters, shared selection, empty state, management navigation; zero page errors');
    console.log('Screenshots: ' + output);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
