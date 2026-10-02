const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const excelCode = fs.readFileSync(path.join(root, 'excel-import.js'), 'utf8');

function loadExcelModule() {
  global.window = {};
  global.document = {};
  eval(excelCode);
  return global.window.UstoreExcel.__test;
}

// Real bug, reported live: uploading a filled-in Excel template threw a raw
// ExcelJS internal error ("Cannot read properties of undefined (reading
// 'sheets')") straight at the user whenever the uploaded bytes weren't a
// genuine, well-formed .xlsx ZIP archive (wrong format, re-saved by another
// app, corrupted, etc). Fixed by checking the ZIP signature BEFORE handing
// the bytes to ExcelJS, plus wrapping the ExcelJS load call itself so any
// other internal parse failure also surfaces a friendly, actionable message
// instead of the raw library error.
test('looksLikeXlsxZip recognizes real ZIP/xlsx signatures and rejects everything else', () => {
  const { looksLikeXlsxZip } = loadExcelModule();
  const zipLocalFileHeader = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0, 0]).buffer;
  const zipEmptyArchive = new Uint8Array([0x50, 0x4B, 0x05, 0x06, 0, 0]).buffer;
  const zipSpanned = new Uint8Array([0x50, 0x4B, 0x07, 0x08, 0, 0]).buffer;
  assert.equal(looksLikeXlsxZip(zipLocalFileHeader), true);
  assert.equal(looksLikeXlsxZip(zipEmptyArchive), true);
  assert.equal(looksLikeXlsxZip(zipSpanned), true);

  const plainCsv = new TextEncoder().encode('name,price\nfoo,100\n').buffer;
  const htmlFile = new TextEncoder().encode('<html></html>').buffer;
  const tooShort = new Uint8Array([0x50, 0x4B]).buffer;
  const empty = new ArrayBuffer(0);
  assert.equal(looksLikeXlsxZip(plainCsv), false);
  assert.equal(looksLikeXlsxZip(htmlFile), false);
  assert.equal(looksLikeXlsxZip(tooShort), false);
  assert.equal(looksLikeXlsxZip(empty), false);
  assert.equal(looksLikeXlsxZip(null), false);
});

test('handleFile checks looksLikeXlsxZip before calling ExcelJS and gives a clear bilingual error instead of the raw library error', () => {
  const fnStart = excelCode.indexOf('async function handleFile(event) {');
  assert.ok(fnStart >= 0, 'handleFile must exist');
  const fnEnd = excelCode.indexOf('\n  }\n\n', fnStart);
  const fn = excelCode.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 4000);

  const zipCheckIdx = fn.indexOf('looksLikeXlsxZip(arrayBuffer)');
  const loadIdx = fn.indexOf('wb.xlsx.load(arrayBuffer)');
  assert.ok(zipCheckIdx >= 0, 'must call looksLikeXlsxZip');
  assert.ok(loadIdx >= 0, 'must still call wb.xlsx.load');
  assert.ok(zipCheckIdx < loadIdx, 'the ZIP signature check must run before handing bytes to ExcelJS');

  assert.match(fn, /Bu fayl haqiqiy \.xlsx \(Excel\) fayliga o'xshamayapti/);
  assert.match(fn, /Excel faylini o'qib bo'lmadi/, 'a second, generic friendly message covers any other ExcelJS internal parse failure');
  assert.doesNotMatch(fn, /reading 'sheets'/, 'the raw ExcelJS TypeError text must never be shown to the user');
});

test('any other ExcelJS load failure not caught by the signature check is still wrapped, not left to throw raw', () => {
  const fnStart = excelCode.indexOf('async function handleFile(event) {');
  const fnEnd = excelCode.indexOf('\n  }\n\n', fnStart);
  const fn = excelCode.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 4000);
  assert.match(fn, /try\{\s*\n\s*await wb\.xlsx\.load\(arrayBuffer\);\s*\n\s*\}catch\(loadErr\)\{/);
  assert.match(fn, /console\.error\('\[excel-import\] ExcelJS parse failed', loadErr\)/);
});

test('excel-import.js is exposed for direct unit testing and cache version bumped', () => {
  assert.match(excelCode, /looksLikeXlsxZip\}\};$/m);
  const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /excel-import\.js\?v=16/);
});
