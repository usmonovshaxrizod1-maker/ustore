const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadBrowserUmd } = require('./helpers/load-browser-umd.cjs');

const root = path.join(__dirname, '..');
const excelCode = fs.readFileSync(path.join(root, 'excel-import.js'), 'utf8');
const templateCode = fs.readFileSync(path.join(root, 'supabase', 'functions', 'shop-api', 'excel-template.ts'), 'utf8');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');

function loadExcelModule() {
  global.window = {};
  global.document = {};
  eval(excelCode);
  return global.window.UstoreExcel.__test;
}

test('Excel V4 template separates simple and variative products into two sheets', () => {
  assert.match(templateCode, /USTORE_EXCEL_IMPORT_V4_TWO_SHEETS/);
  assert.match(templateCode, /addWorksheet\("Oddiy tovarlar"/);
  assert.match(templateCode, /addWorksheet\("Variativ tovarlar"/);
  assert.match(templateCode, /\["Katalog yo'li", "Tovar nomi", "Izohi", "Yangi narx", "Eski narx", "Soni"\]/);
  assert.match(templateCode, /\["Katalog yo'li", "Tovar nomi", "Izohi", "Rangi", "O'lchami", "Yangi narx", "Eski narx", "Soni"\]/);
  assert.match(templateCode, /"Yashil", "S", 180000, 220000, 3/);
  assert.match(templateCode, /\[null, null, null, null, "M", 185000, 220000, 4\]/);
  assert.match(templateCode, /Kataklarni birlashtirmang/);
  assert.match(app, /excel-import\.js\?v=16/);
});

test('variative parser inherits product and color and makes one product with per-variant prices', () => {
  const api = loadExcelModule();
  const ExcelJS = loadBrowserUmd(path.join(root, 'vendor', 'exceljs.min.js'), 'ExcelJS');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Variativ tovarlar');
  ws.addRow(["Katalog yo'li", 'Tovar nomi', 'Izohi', 'Rangi', "O'lchami", 'Yangi narx', 'Eski narx', 'Soni']);
  for (let i = 2; i < 10; i++) ws.addRow([]);
  ws.getRow(10).values = [, 'Sport kiyimlari / Erkaklar / Futbolkalar', 'Sport futbolkasi', 'Test', 'Yashil', 'S', 180000, 220000, 3];
  ws.getRow(11).values = [, '', '', '', '', 'M', 185000, 230000, 4];
  ws.getRow(12).values = [, '', '', '', 'Oq', 'S', 175000, '', 2];
  ws.getRow(13).values = [, '', '', '', '', 'M', 180000, '', 3];

  const out = api.parseV4VariantSheet(ws, 10);
  assert.equal(out.issues.length, 0);
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].name, 'Sport futbolkasi');
  assert.equal(out.rows[0].price, 180000);
  assert.equal(out.rows[0].stock, 12);
  assert.deepEqual(out.rows[0].variants.map(v => [v.color, v.size, v.price, v.oldPrice, v.qty]), [
    ['Yashil', 'S', 180000, 220000, 3],
    ['Yashil', 'M', 185000, 230000, 4],
    ['Oq', 'S', 175000, null, 2],
    ['Oq', 'M', 180000, null, 3],
  ]);
  assert.equal(api.rowLabel(out.rows[0].excelRow), 'Variativ tovarlar!10');
});

test('simple parser imports only simple product rows and carries catalog path down', () => {
  const api = loadExcelModule();
  const ExcelJS = loadBrowserUmd(path.join(root, 'vendor', 'exceljs.min.js'), 'ExcelJS');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Oddiy tovarlar');
  ws.addRow(["Katalog yo'li", 'Tovar nomi', 'Izohi', 'Yangi narx', 'Eski narx', 'Soni']);
  for (let i = 2; i < 6; i++) ws.addRow([]);
  ws.getRow(6).values = [, 'Sport buyumlari / Shaker', '700 ml shaker', 'Test', 85000, 100000, 5];
  ws.getRow(7).values = [, '', '500 ml shaker', 'Test2', 65000, '', 8];

  const out = api.parseV4SimpleSheet(ws, 6);
  assert.equal(out.issues.length, 0);
  assert.equal(out.rows.length, 2);
  assert.deepEqual(out.rows[1].categoryPath, ['Sport buyumlari', 'Shaker']);
  assert.equal(out.rows[1].price, 65000);
  assert.equal(out.rows[1].stock, 8);
  assert.deepEqual(out.rows[1].variants, []);
  assert.equal(api.rowLabel(out.rows[1].excelRow), 'Oddiy tovarlar!7');
});
