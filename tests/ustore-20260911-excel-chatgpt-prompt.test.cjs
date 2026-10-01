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
  return global.window.UstoreExcel;
}

// Same pattern as the bulk-catalog "ChatGPT uchun prompt" button (see
// ustore-20260911-bulk-catalog-chatgpt.test.cjs): a single button that
// copies a fixed prompt directly on click, no separate modal/guide.
test('Excel import modal has a ChatGPT-prompt button near the top that copies EXCEL_CHATGPT_PROMPT directly on click', () => {
  assert.match(excelCode, /const EXCEL_CHATGPT_PROMPT = `Men UStorE'ga mahsulotlarni Excel orqali ommaviy yuklamoqchiman\./);
  assert.match(excelCode, /async function copyExcelChatGptPrompt\(btn\) \{/);
  assert.match(excelCode, /copyTextToClipboard\(EXCEL_CHATGPT_PROMPT\)/);

  const modalStart = excelCode.indexOf('function renderModal() {');
  const headerIdx = excelCode.indexOf('fc-excel-header', modalStart);
  const btnIdx = excelCode.indexOf('UstoreExcel.copyExcelChatGptPrompt(this)', modalStart);
  const primaryActionsIdx = excelCode.indexOf('fc-excel-primary-actions', modalStart);
  assert.ok(headerIdx > 0 && btnIdx > headerIdx, 'the prompt button must come after the modal header');
  assert.ok(btnIdx < primaryActionsIdx, 'the prompt button must sit above the template/upload actions row, near the top');
});

test('copyExcelChatGptPrompt guards double-click, shows success/error toast, and swaps the label to "Nusxalandi" briefly on success', () => {
  const fnStart = excelCode.indexOf('async function copyExcelChatGptPrompt(btn) {');
  const fnEnd = excelCode.indexOf('\n  }\n', fnStart);
  const fn = excelCode.slice(fnStart, fnEnd);
  assert.match(fn, /if \(btn\?\.disabled\) return;/);
  assert.match(fn, /btn\.disabled = true/);
  assert.match(fn, /ChatGPT prompti nusxalandi/);
  assert.match(fn, /Nusxalandi ✓/);
  assert.match(fn, /Promptni nusxalab bo\\'lmadi/);
});

test('EXCEL_CHATGPT_PROMPT covers the two-sheet structure, catalog auto-matching + new-catalog approval flow, and ends with the required summary report', () => {
  const { state } = loadExcelModule();
  assert.ok(state, 'module must still load cleanly with the new constant present');
  const promptStart = excelCode.indexOf("const EXCEL_CHATGPT_PROMPT = `");
  const promptEnd = excelCode.indexOf('`;', promptStart);
  const prompt = excelCode.slice(promptStart, promptEnd);
  assert.match(prompt, /UStorE Excel shablonini yuklang/);
  assert.match(prompt, /3-listdagi "Kataloglar" ro'yxatini o'qing/);
  assert.match(prompt, /Oddiy tovarlar" listiga, variativ tovarlarni "Variativ tovarlar" listiga/);
  assert.match(prompt, /Excelga rasm qo'shmang/);
  assert.match(prompt, /Oxirida qisqa hisobot bering/);
  assert.match(prompt, /yangi qo'shilgan kataloglar/);
  assert.doesNotMatch(prompt, /nusxa olganda shu prompt nusxa olinishi kerak/, 'the meta-instruction about the button itself must not leak into the ChatGPT-facing prompt text');
});

// Real bug, found live 2026-09-11: a user's GPT-filled file failed to load
// with the exact "Cannot read properties of undefined (reading 'sheets')"
// error. Root cause, confirmed by inspecting the actual uploaded file: every
// XML part was namespace-prefixed (<x:workbook>, <x:sheet>, ...) instead of
// using the default spreadsheetml namespace — the tell-tale sign of GPT
// rebuilding the file from scratch via xml.etree/lxml instead of editing the
// original template in place with openpyxl. ExcelJS (like most real-world
// consumers) only recognizes the unprefixed form, so the file was rejected.
test('EXCEL_CHATGPT_PROMPT explicitly requires openpyxl.load_workbook() on the original file (not a from-scratch XML rebuild) and a self-check re-open before returning the file', () => {
  const promptStart = excelCode.indexOf("const EXCEL_CHATGPT_PROMPT = `");
  const promptEnd = excelCode.indexOf('`;', promptStart);
  const prompt = excelCode.slice(promptStart, promptEnd);
  assert.match(prompt, /FAQAT openpyxl kutubxonasining load_workbook\(\) funksiyasi bilan oching/);
  assert.match(prompt, /xml\.etree, lxml yoki boshqa usul bilan qo'lda qayta yig'ib chiqmang va noldan yaratmang/);
  assert.match(prompt, /Saqlagandan keyin faylni yana bir marta load_workbook\(\) bilan ochib, xatosiz ochilishini albatta tekshiring/);
});

test('copyExcelChatGptPrompt is exported on UstoreExcel for the inline onclick handler', () => {
  assert.match(excelCode, /reset,copyExcelChatGptPrompt,state,__test:/);
});

test('cache version bumped for this feature', () => {
  const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /excel-import\.js\?v=16/);
});
