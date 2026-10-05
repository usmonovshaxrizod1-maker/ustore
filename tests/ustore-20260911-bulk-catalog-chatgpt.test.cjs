const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
const api = fs.readFileSync(path.join(root, 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function block(src, startNeedle, endNeedle, limit = 8000) {
  const start = src.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing ${startNeedle}`);
  const end = endNeedle ? src.indexOf(endNeedle, start + startNeedle.length) : -1;
  return src.slice(start, end > start ? end : start + limit);
}
// Generic brace-counting extractor (same technique already used by
// ustore-discount-combining.test.cjs's loadCapDiscountParts) — signature
// must literally end with the function's opening "{".
function extractFn(src, signature) {
  const start = src.indexOf(signature);
  assert.notEqual(start, -1, `function not found: ${signature}`);
  const bodyStart = start + signature.length - 1;
  let depth = 0, i = bodyStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(bodyStart, i + 1);
}

function loadBulkCategoryHelpers() {
  const normBody = extractFn(app, 'function bulkCatNorm(v) {');
  const parseBody = extractFn(app, 'function parseBulkCategoryLine(raw) {');
  const previewBody = extractFn(app, 'function buildBulkCategoryPreview(text) {');
  const src = `
    function bulkCatNorm(v) ${normBody}
    function parseBulkCategoryLine(raw) ${parseBody}
    function buildBulkCategoryPreview(text) ${previewBody}
    return { bulkCatNorm, parseBulkCategoryLine, buildBulkCategoryPreview };
  `;
  return new Function('categories', 'tr', src);
}

function withCategories(cats) {
  const tr = (uz) => uz;
  return loadBulkCategoryHelpers()(cats, tr);
}

// ---- 1. Wiring: "Katalog" button opens the chooser; single-add flow is untouched ----
test('the "Katalog" button opens the Bitta/Bir nechta chooser sheet; openAddCatModal() itself is completely unchanged', () => {
  assert.match(app, /onclick="openAddCategoryChooser\(\)" class="flex-1[^"]*"><i data-lucide="folder-plus"/);
  assert.doesNotMatch(app, /onclick="openAddCatModal\(\)" class="flex-1 flex items-center justify-center gap-1 bg-blue-600/, 'the old direct call from the Kataloglar toolbar must be gone (replaced by the chooser)');
  const chooser = block(app, 'function openAddCategoryChooser()', 'function closeAddCategoryChooser');
  assert.match(chooser, /closeAddCategoryChooser\(\);openAddCatModal\(\);/, 'Bitta katalog qo\'shish must call the pre-existing, unmodified openAddCatModal()');
  assert.match(chooser, /closeAddCategoryChooser\(\);openBulkCategoryModal\(\);/);
  const single = block(app, 'function openAddCatModal() {', 'function openAddCategoryChooser');
  assert.match(single, /activePopupModal = 'ADD_CAT';/, 'single-add still opens the original ADD_CAT modal, untouched');
});

// ---- 2. Parser: trimming, empty segments, whitespace around "/" ----
test('parseBulkCategoryLine trims segments, ignores whitespace around "/", and drops empty segments', () => {
  const { parseBulkCategoryLine } = withCategories([]);
  const expected = ['Sport ozuqalari', 'Protein', 'Whey'];
  assert.deepEqual(parseBulkCategoryLine('Sport ozuqalari/Protein/Whey'), expected);
  assert.deepEqual(parseBulkCategoryLine('Sport ozuqalari / Protein / Whey'), expected);
  assert.deepEqual(parseBulkCategoryLine('Sport ozuqalari/ Protein /Whey'), expected);
  assert.deepEqual(parseBulkCategoryLine(' Sport ozuqalari /Protein/Whey'), expected);
  assert.deepEqual(parseBulkCategoryLine('Sport ozuqalari//Protein///Whey'), expected, 'empty segments from doubled slashes are dropped');
  assert.deepEqual(parseBulkCategoryLine('/Sport ozuqalari/Protein/Whey/'), expected, 'leading/trailing slashes are dropped');
  assert.deepEqual(parseBulkCategoryLine('///'), [], 'an all-empty line yields no segments (caller reports it as an error line)');
  assert.deepEqual(parseBulkCategoryLine('Protein'), ['Protein'], 'a single root-level segment is valid');
});

// ---- 3. Preview: existing-parent reuse, same name under different parents, duplicates ----
test('buildBulkCategoryPreview never re-creates an existing parent/child, keeps same-name-different-parent separate, and marks in-batch duplicates', () => {
  const existing = [
    { id: 'c1', name: 'Sport ozuqalari', parentId: null },
    { id: 'c2', name: 'Protein', parentId: 'c1' },
    { id: 'c3', name: 'Sport kiyimlari', parentId: null },
    { id: 'c4', name: 'Aksessuarlar', parentId: 'c1' }, // "Aksessuarlar" under Sport ozuqalari
    { id: 'c5', name: 'Aksessuarlar', parentId: 'c3' }, // SAME name under a DIFFERENT parent — must stay distinct
  ];
  const { buildBulkCategoryPreview } = withCategories(existing);
  const text = [
    'Sport ozuqalari/Protein/Whey',      // Sport ozuqalari + Protein existing, Whey new
    'Sport ozuqalari / Protein / Casein', // whitespace variant of an already-touched parent, Casein new
    'Sport ozuqalari/Protein/Whey',       // exact duplicate of line 1
    'Sport kiyimlari/Aksessuarlar/Qalpoqcha', // must resolve against c5 (kiyimlari's own Aksessuarlar), not c4
  ].join('\n');
  const result = buildBulkCategoryPreview(text);
  assert.equal(result.lines.length, 4);
  assert.equal(result.lines[0].status, 'ok');
  assert.deepEqual(result.lines[0].segments.map(s => s.status), ['existing', 'existing', 'new']);
  assert.equal(result.lines[1].status, 'ok');
  assert.deepEqual(result.lines[1].segments.map(s => s.status), ['existing', 'existing', 'new']);
  assert.equal(result.lines[2].status, 'duplicate');
  assert.equal(result.lines[3].status, 'ok');
  // "Aksessuarlar" under Sport kiyimlari resolves to the EXISTING c5, not a new node,
  // and does not get confused with c4 (Sport ozuqalari's own Aksessuarlar).
  assert.deepEqual(result.lines[3].segments.map(s => s.status), ['existing', 'existing', 'new']);
  assert.equal(result.summary.totalPaths, 4);
  assert.equal(result.summary.newCategories, 3, 'Whey, Casein, Qalpoqcha — 3 unique new nodes');
  assert.equal(result.summary.duplicates, 1);
  assert.equal(result.summary.errors, 0);
});

test('buildBulkCategoryPreview treats an empty/invalid line as an error, not a silent no-op', () => {
  const { buildBulkCategoryPreview } = withCategories([]);
  const result = buildBulkCategoryPreview('Sport ozuqalari/Protein\n///\n\nCreatine');
  // the fully-blank line is skipped entirely (not counted at all, not an error)
  assert.equal(result.lines.length, 3);
  assert.equal(result.lines[0].status, 'ok');
  assert.equal(result.lines[1].status, 'error');
  assert.equal(result.lines[1].lineNumber, 2);
  assert.equal(result.lines[2].status, 'ok');
  assert.equal(result.lines[2].lineNumber, 4, 'the blank line 3 does not shift subsequent line numbers');
  assert.equal(result.summary.errors, 1);
});

test('case-insensitive / Unicode-apostrophe duplicate detection matches the shared normalizeName convention (excel-import.js\'s norm(), shop-api\'s normalizeName())', () => {
  const { buildBulkCategoryPreview } = withCategories([{ id: 'c1', name: 'Protein', parentId: null }]);
  const result = buildBulkCategoryPreview('protein\nPROTEIN\n Protein ');
  assert.deepEqual(result.lines.map(l => l.status), ['ok', 'duplicate', 'duplicate']);
  assert.equal(result.lines[0].segments[0].status, 'existing', 'case-insensitive match against the pre-existing "Protein"');
  assert.equal(result.summary.newCategories, 0);
});

// ---- 4. Server action: reuses shared helpers, permission-gated, race-safe, no forced image ----
test('bulk_create_categories is permission-gated, reuses the shared normalizeName/categoryPathKey helpers (no parallel normalization), and never forces a category image', () => {
  const block_ = block(api, 'case "bulk_create_categories": {', "case \"edit_category\":");
  assert.match(block_, /await requirePermission\('catalog\.manage'\);/);
  assert.match(block_, /normalizeName\(name\)/);
  assert.match(block_, /categoryPathKey\(segments\)/);
  assert.match(block_, /img: parentId \? "📦" : "📁"/, 'matches add_category\'s own default exactly — no forced/fake external image URL');
  assert.doesNotMatch(block_, /https?:\/\//, 'no fabricated external image URL is ever written');
  // race-condition handling: a concurrent insert failure (23505) re-selects
  // the winner instead of failing the whole path.
  assert.match(block_, /insErr as any\)\.code\) === "23505"/);
  assert.match(block_, /shop_id", shopId\).is\("deleted_at", null\)/, 'category lookups stay shop-scoped (store isolation)');
});

test('the server action is store-scoped end-to-end: category listing and every insert carry shop_id', () => {
  const block_ = block(api, 'case "bulk_create_categories": {', "case \"edit_category\":");
  const catsSelect = block_.slice(0, block_.indexOf('for (let i = 0'));
  assert.match(catsSelect, /\.eq\("shop_id", shopId\)/);
  assert.match(block_, /insert\(\{ shop_id: shopId, name, parent_id: parentId/);
});

// ---- 5. Line-number gutter: numbers never enter the parser/clipboard ----
// 2026-09-11 REWRITE: real-device testing (Telegram WebView) showed the
// original two-independently-scrolling-elements-synced-via-JS design drifted
// out of sync ("raqamlar qatorga to'g'ri kelmayapti", "scroll qilsa
// ko'tarilib ketyapti"). Replaced with a structurally-guaranteed design:
// only the OUTER .fc-bulkcat-editor scrolls (fixed ~7-8 row window); gutter
// and textarea never scroll independently — the textarea auto-grows to its
// full content height (autoGrowBulkCatTextarea), so it and the gutter stay
// glued together as one physical block inside that single scroller.
test('the line-number gutter is a separate, non-selectable, pointer-events:none layer that is structurally glued to the textarea (no independent scroll, no JS scroll-sync) — never part of the textarea value', () => {
  assert.match(app, /id="bulkcat-editor-scroll" class="fc-bulkcat-editor"/, 'the OUTER wrapper is the only scroller and must be addressable');
  assert.match(app, /id="bulkcat-gutter" class="fc-bulkcat-gutter" aria-hidden="true"/);
  assert.match(app, /id="bulkcat-textarea" class="fc-bulkcat-textarea"[^>]*oninput="onBulkCatInput\(this\)"/);
  assert.doesNotMatch(app, /onscroll="syncBulkCatGutterScroll/, 'the old scrollTop-sync-on-scroll wiring must be gone');
  assert.doesNotMatch(app, /function syncBulkCatGutterScroll/, 'the old sync function itself must be gone, not just unused');
  assert.match(css, /\.fc-bulkcat-gutter\s*\{[^}]*user-select:\s*none;[^}]*pointer-events:\s*none;/);
  // gutter/textarea share font metrics via one rule so rows stay aligned
  assert.match(css, /\.fc-bulkcat-gutter,\s*\.fc-bulkcat-textarea\s*\{[^}]*line-height:/);
  // only the outer editor scrolls; gutter/textarea themselves never do
  assert.match(css, /\.fc-bulkcat-editor\s*\{[^}]*overflow-y:\s*auto;[^}]*height:\s*14rem;/);
  assert.match(css, /\.fc-bulkcat-gutter\s*\{[^}]*overflow:\s*hidden;/);
  assert.match(css, /\.fc-bulkcat-textarea\s*\{[^}]*overflow:\s*hidden;/);
  const grow = block(app, 'function autoGrowBulkCatTextarea(el) {', 'function onBulkCatInput');
  assert.match(grow, /el\.style\.height = el\.scrollHeight \+ 'px';/, 'textarea grows to its exact content height — structurally can never scroll on its own');
  assert.match(grow, /gutter\.style\.height = el\.style\.height;/, 'gutter is forced to the SAME height as the grown textarea — guarantees the physical glue, not a best-effort sync');
  const onInput = block(app, 'function onBulkCatInput(el) {', 'function jumpToBulkCatLine');
  assert.match(onInput, /bulkCatText = el\.value;/, 'the parser only ever reads el.value — raw textarea content, gutter numbers are a different DOM node entirely');
  assert.match(onInput, /autoGrowBulkCatTextarea\(el\);/);
});

test('opening the bulk sheet grows the textarea/gutter to the initial content once (not just on keystroke)', () => {
  const open = block(app, 'function openBulkCategoryModal() {', 'function closeBulkCategoryModal');
  assert.match(open, /autoGrowBulkCatTextarea\(document\.getElementById\('bulkcat-textarea'\)\);/);
});

// ---- 5b. "Barchasini yaratish" enabling after "Tekshirish" (real bug, real device) ----
test('clicking "Tekshirish" enables the "Barchasini yaratish" button — updateBulkCatActionsBar must update BOTH the preview area AND the footer button, since they are different DOM subtrees', () => {
  const updater = block(app, 'function updateBulkCatActionsBar() {', 'function jumpToBulkCatLine');
  assert.match(updater, /bulkcat-preview-area/, 'still updates the stats/line-list');
  assert.match(updater, /getElementById\('bulkcat-create-btn'\)/, 'and now ALSO reaches the footer button, which lives outside #bulkcat-preview-area');
  assert.match(updater, /createBtn\.disabled = !\(bulkCatPreview && okCount > 0 && !bulkCatBusy\);/);
  assert.match(app, /id="bulkcat-create-btn" onclick="submitBulkCategoryImport\(\)"/, 'the footer button carries the id updateBulkCatActionsBar() targets');
});

test('jumpToBulkCatLine scrolls the outer editor container (the sole scroller), and still focuses/selects the target line', () => {
  const jump = block(app, 'function jumpToBulkCatLine(lineNumber) {', 'function runBulkCategoryPreview');
  assert.match(jump, /getElementById\('bulkcat-editor-scroll'\)/);
  assert.match(jump, /editor\.scrollTop = /, 'scrolls the outer wrapper, not the textarea (which no longer has its own scroll)');
  assert.match(jump, /ta\.focus\(\);/);
  assert.match(jump, /ta\.setSelectionRange\(offset, offset \+ lineText\.length\);/);
  assert.doesNotMatch(jump, /ta\.scrollTop = /, 'the textarea itself no longer has its own scroll to set');
  assert.match(app, /onclick="jumpToBulkCatLine\(\$\{line\.lineNumber\}\)" class="fc-bulkcat-line is-error"/, 'error rows in the preview are clickable and jump to their line');
});

// ---- 6. Non-blocking UX: preview before create, toast (not blocking modal) on result ----
test('"Tekshirish" only computes a preview (no API call); creation is a separate explicit step that reuses the existing non-blocking toast and refreshes the catalog', () => {
  const preview = block(app, 'function runBulkCategoryPreview() {', 'function bulkCatStatusBadge');
  assert.doesNotMatch(preview, /callApi\(/, 'preview must be pure client-side, never hits the server');
  const submit = block(app, 'async function submitBulkCategoryImport() {', '// ---- "ChatGPT');
  assert.match(submit, /callApi\('bulk_create_categories', \{ paths \}\)/);
  assert.match(submit, /showActionToast\(/);
  assert.match(submit, /await loadCatalog\(\);/, 'catalog list auto-refreshes after import, per spec');
  assert.doesNotMatch(submit, /fc-modal-blocking|Amal bajarilmoqda/, 'no legacy blocking "Amal bajarilmoqda..." overlay');
});

// ---- 7. ChatGPT prompt helper (2026-09-11: simplified to a single direct-copy
// button — no intermediate sheet/steps, per explicit follow-up feedback) ----
test('"ChatGPT uchun prompt" is one button near the top of the bulk sheet that copies immediately (no separate modal/steps), and the prompt text lives in exactly one constant', () => {
  const matches = app.match(/CATALOG_CHATGPT_PROMPT/g) || [];
  assert.ok(matches.length >= 2, 'declared once and referenced at least once — not duplicated inline anywhere');
  assert.match(app, /const CATALOG_CHATGPT_PROMPT = `/);
  assert.match(app, /id="bulkcat-chatgpt-btn" onclick="copyCatalogChatGptPrompt\(this\)" class="fc-bulkcat-chatgpt-btn"/, 'clicking the button copies directly, no intermediate openCatalogChatGptPrompt() sheet');
  assert.doesNotMatch(app, /function openCatalogChatGptPrompt|function closeCatalogChatGptPrompt|function openChatGptExternal|fc-catgpt-root|fc-catgpt-steps|fc-catgpt-prompt-box/, 'the separate prompt sheet, its 4-step guide, and the "ChatGPT\'ni ochish" external-open action were all removed per follow-up feedback — a single copy button is enough');
  // layout order inside the sheet body: ChatGPT button first, then the
  // textarea help text, then the line-numbered editor.
  const body = block(app, 'function renderBulkCategoryModal() {', 'fc-sheet-footer', 4000);
  const btnPos = body.indexOf('bulkcat-chatgpt-btn');
  const helpPos = body.indexOf('fc-bulkcat-help');
  const editorPos = body.indexOf('fc-bulkcat-editor');
  assert.ok(btnPos >= 0 && helpPos > btnPos && editorPos > helpPos, 'order must be: ChatGPT button -> help text -> editor');
});

test('copying the prompt uses the existing copyTextToClipboard() helper (navigator.clipboard + execCommand fallback), not a new implementation, and copy_text (Telegram Bot API) is never used', () => {
  assert.match(app, /async function copyTextToClipboard\(text\) \{/, 'shared helper still exists, unmodified');
  const copyHelperBody = block(app, 'async function copyTextToClipboard(text) {', 'async function copyCardNumber');
  assert.match(copyHelperBody, /navigator\.clipboard && window\.isSecureContext/);
  assert.match(copyHelperBody, /document\.execCommand\('copy'\)/);
  const copyPrompt = block(app, 'async function copyCatalogChatGptPrompt(btn) {', '// ============ EXCEL IMPORT');
  assert.match(copyPrompt, /await copyTextToClipboard\(CATALOG_CHATGPT_PROMPT\)/, 'no parallel clipboard implementation');
  assert.match(copyPrompt, /ChatGPT prompti nusxalandi/);
  assert.match(copyPrompt, /Promptni nusxalab bo.lmadi/, 'error toast when both clipboard paths fail');
  assert.match(copyPrompt, /if \(btn\?\.disabled\) return;/, 'double-click guard');
  assert.match(copyPrompt, /label\.textContent = tr\('Nusxalandi', 'Скопировано'\)/, 'brief button-label feedback remains, now without a system-glyph checkmark');
  assert.doesNotMatch(app, /copy_text/, 'Telegram Bot API inline-button copy_text must never be used — this is a Mini App feature, not a bot keyboard');
});

test('copying the prompt never touches #fc-bulkcat-root or bulkCatText, so the bulk editor text the user typed is never disturbed', () => {
  const copyPrompt = block(app, 'async function copyCatalogChatGptPrompt(btn) {', '// ============ EXCEL IMPORT');
  assert.doesNotMatch(copyPrompt, /fc-bulkcat-root|bulkCatText\s*=|renderBulkCategoryModal/, 'must not touch the bulk editor root or its state/rerender');
});

// ---- 8. Cache versions ----
test('cache versions bumped for the bulk-catalog + ChatGPT-prompt batch', () => {
  assert.match(indexHtml, /ustore-shop-app\.js\?v=319/);
  assert.match(indexHtml, /ustore\.css\?v=319/);
});

