const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('ustore-shop-app.js','utf8');
const css = fs.readFileSync('ustore.css','utf8');
const excel = fs.readFileSync('excel-import.js','utf8');
const template = fs.readFileSync('supabase/functions/shop-api/excel-template.ts','utf8');

test('variant detail price is active in both admin and customer mode', () => {
  assert.match(app, /const activeVariant = activeColorSizeVariant\(p\);/);
  assert.doesNotMatch(app, /const activeVariant = !isAdminMode \? activeColorSizeVariant\(p\) : null;/);
});

test('swiping product color image synchronizes color, size, price and stock source', () => {
  assert.match(app, /function syncActiveVariantFromGalleryIndex\(index\)/);
  assert.match(app, /activeColorName = colorName;/);
  assert.match(app, /activeSizeName = fallback\?\.size \|\| null;/);
  assert.match(app, /rerenderProductDetailPreserveScroll\(\(\) => scrollProductGalleryTo\(closest, false\)\)/);
});

test('Excel template uses separate simple/variative sheets with per-variant price/old price/stock rows', () => {
  assert.match(template, /addWorksheet\("Oddiy tovarlar"/);
  assert.match(template, /addWorksheet\("Variativ tovarlar"/);
  assert.match(template, /"Rangi", "O'lchami", "Yangi narx", "Eski narx", "Soni"/);
  assert.match(excel, /function parseV4VariantSheet\(ws, dataStartRow\)/);
  assert.match(excel, /currentColor=color/);
  assert.match(excel, /price:Number\(price\),oldPrice,colorImg:null,img:null/);
});

test('catalog breadcrumb stays one line, does not shrink, and scrolls horizontally', () => {
  assert.match(css, /\.fc-catalog-breadcrumb[^}]*overflow-x:auto!important;/s);
  assert.match(css, /\.fc-catalog-breadcrumb button,[\s\S]*flex:0 0 auto!important;/);
  assert.match(css, /\.fc-catalog-breadcrumb button\{[\s\S]*white-space:nowrap!important;/);
});
