const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');

function functionBlock(name, nextName) {
  const start = app.indexOf(`function ${name}`);
  const end = app.indexOf(`function ${nextName}`, start + 1);
  assert.ok(start >= 0 && end > start, `${name} block missing`);
  return app.slice(start, end);
}

test('home blocks keep the requested order and optional renderers return no placeholder', () => {
  const block = functionBlock('renderHome(container)', 'handleSearchDebounced');
  const needles = [
    'renderActiveFilterChipsHtml()',
    'renderFeaturedCategoriesRowHtml()',
    'renderBannerCarouselHtml()',
    'id="products-grid"',
    'renderFeaturedCategoryBlocksHtml()',
  ];
  let cursor = -1;
  for (const needle of needles) {
    const index = block.indexOf(needle);
    assert.ok(index > cursor, `${needle} is out of order`);
    cursor = index;
  }
  assert.match(app, /if \(!entries\.length\) return '';/);
  assert.match(app, /if \(!activeBanners\.length\) return '';/);
});

test('an empty default pinned-products block collapses, but real search/filter empty state remains', () => {
  const block = functionBlock('handleSearch()', 'loadFavorites');
  assert.match(block, /const isUserSearching = Boolean\(q\.trim\(\)\) \|\| isCategoryFilterActive\(\)/);
  assert.match(block, /grid\.style\.display = isUserSearching \? '' : 'none'/);
  assert.match(block, /grid\.innerHTML = isUserSearching[\s\S]*: ''/);
  assert.doesNotMatch(block, /Bosh sahifa uchun tovar biriktirilmagan/);
  assert.match(block, /grid\.style\.display = ''/);
});
