const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');

test('home search hides every default discovery block and only leaves search results', () => {
  const start = app.indexOf('function handleSearch()');
  const end = app.indexOf('async function loadFavorites', start);
  const block = app.slice(start, end);
  assert.match(block, /const isSearchMode = Boolean\(q\.trim\(\)\)/);
  assert.match(block, /querySelectorAll\('\.fc-home-default-block'\)/);
  assert.match(block, /block\.style\.display = isSearchMode \? 'none' : ''/);
  assert.match(block, /let filtered = searchProducts\(q\)/);
});

test('catalog row, banners and featured catalog products are default home content; campaigns stay off home', () => {
  assert.match(app, /fc-cat-nav-row fc-home-default-block/);
  assert.match(app, /fc-banner-strip fc-home-default-block/);
  assert.doesNotMatch(app, /id="fc-home-bundles-section"/);
  assert.doesNotMatch(app, /function renderHomeBundlesSectionHtml/);
  assert.match(app, /id="fc-home-cat-block-\$\{c\.id\}" class="space-y-2 fc-home-default-block"/);
});
