const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');

function block(src, startNeedle, endNeedle, limit = 3000) {
  const start = src.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing ${startNeedle}`);
  const end = endNeedle ? src.indexOf(endNeedle, start + startNeedle.length) : -1;
  return src.slice(start, end > start ? end : start + limit);
}

// Real bug, found live: the card action menu (3-dot: Tahrirlash/Ko'chirish/
// O'chirish) stayed visibly open through the ENTIRE delete flow (preview
// check -> confirm dialog -> deleting) because the old onclick only set
// `cardActionMenu = null` without ever calling render() — nothing re-reads
// that variable until deleteCategory/deleteProduct's own render() call much
// later (after a successful delete). Edit/Move don't have this bug because
// opening their target modal calls render() immediately.
test('the delete action closes the 3-dot card menu SYNCHRONOUSLY (closeCardActionMenu, which calls render()) before the async preview/confirm/delete sequence starts — not just nulling a variable nothing re-reads until much later', () => {
  const menu = block(app, 'function cardActionMenuHtml(kind, id) {', 'function renderProductCardHTML', 3500);
  assert.match(menu, /const del = kind === 'product'\s*\n\s*\? `closeCardActionMenu\(event\);deleteProduct\('\$\{id\}'\);`\s*\n\s*: `closeCardActionMenu\(event\);deleteCategory\('\$\{id\}'\);`;/);
  assert.doesNotMatch(menu, /deleteCategory\('\$\{id\}', event\);cardActionMenu=null;/, 'the old non-reactive close must be gone');
  const closeFn = block(app, 'function closeCardActionMenu(event) {', 'function toggleInlineActionMenu');
  assert.match(closeFn, /render\(\);/, 'closeCardActionMenu must actually re-render, not just clear the variable');
});

test('deleteCategory() no longer shows a "Tekshirilmoqda..." toast before the confirm dialog — the delete-preview fetch is awaited silently and goes straight to appConfirm', () => {
  const fn = block(app, 'async function deleteCategory(id) {', 'async function duplicateProduct');
  assert.doesNotMatch(fn, /Tekshirilmoqda/, 'the intermediate loading toast must be gone, per explicit follow-up feedback');
  assert.doesNotMatch(fn, /hideActionToast\(\);\s*\n\s*const msg/, 'no toast shown/hidden before the confirm message is built');
  assert.match(fn, /preview = await callApi\('get_category_delete_preview', \{ categoryId: id \}\);/, 'the safety preview (subcategory/product counts) is still fetched — only the visible loading step was removed');
  assert.match(fn, /await appConfirm\(msg, \{ danger:true \}\)/, 'the informative confirm dialog (with real counts) is preserved');
  assert.doesNotMatch(app, /async function deleteCategory\(id, e\)/, 'the now-unused event param was dropped — closeCardActionMenu(event) already handles stopPropagation before this runs');
});

test('cache version bumped for this fix', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /ustore-shop-app\.js\?v=335/);
});

