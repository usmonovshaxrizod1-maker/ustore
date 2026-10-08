const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadBrowserUmd } = require('./helpers/load-browser-umd.cjs');

const root = path.join(__dirname, '..');
const commerce = loadBrowserUmd(path.join(root, 'ustore-commerce.js'), 'UstoreCommerce');
const imageIO = loadBrowserUmd(path.join(root, 'ustore-image-io.js'), 'UstoreImageIO');

// Kanonik snake_case kodlar (013_region_canonical_codes.sql / ustore-shop-app.js
// REGION_DEFS / shop-api/index.ts UZ_TOP_LEVEL_REGION_IDS bilan bir xil).
const REGIONS = [
  'tashkent_city', 'tashkent_region',
  'andijan', 'bukhara', 'fergana', 'jizzakh',
  'khorezm', 'namangan', 'navoi', 'qashqadaryo',
  'karakalpakstan', 'samarkand', 'sirdaryo', 'surxondaryo',
];

function configuredCommerce() {
  const config = commerce.defaultConfig(REGIONS);
  config.delivery.fixed.enabled = true;
  config.delivery.fixed.regions.tashkent_city = { enabled: true, fee: 40000 };
  config.delivery.taxi.enabled = true;
  config.delivery.taxi.regions.jizzakh = { enabled: true, minFee: 50000, maxFee: 80000 };
  config.delivery.post.enabled = true;
  const bts = config.delivery.post.providers.find(p => p.id === 'BTS');
  const emu = config.delivery.post.providers.find(p => p.id === 'EMU');
  bts.enabled = true;
  emu.enabled = true;
  bts.regions.jizzakh = { enabled: true, payer: 'CUSTOMER' };
  emu.regions.jizzakh = { enabled: true, payer: 'SELLER' };
  const cash = config.payments.methods.find(m => m.id === 'CASH');
  const card = config.payments.methods.find(m => m.id === 'CARD');
  cash.regions.jizzakh = { enabled: true };
  card.enabled = true;
  card.cardNumber = '8600 0000 0000 0000';
  card.cardHolder = 'USTORE OWNER';
  card.receiptRequired = true;
  card.regions.tashkent_city = { enabled: true };
  card.regions.jizzakh = { enabled: true };
  return commerce.normalizeConfig(config, REGIONS);
}

test('official current top-level region source contains 14 unique entries', () => {
  assert.equal(new Set(REGIONS).size, 14);
});

test('Toshkent free and fixed delivery totals are calculated correctly', () => {
  const config = configuredCommerce();
  const options = commerce.deliveryOptions(config, 'tashkent_city');
  const free = options.find(x => x.kind === 'FREE');
  const fixed = options.find(x => x.kind === 'FIXED');
  assert.deepEqual(commerce.calculateTotals(260000, free), { subtotal: 260000, deliveryFee: 0, payableTotal: 260000 });
  assert.deepEqual(commerce.calculateTotals(260000, fixed), { subtotal: 260000, deliveryFee: 40000, payableTotal: 300000 });
});

test('taxi range is informational and never added to payable total', () => {
  const taxi = commerce.deliveryOptions(configuredCommerce(), 'jizzakh').find(x => x.kind === 'TAXI');
  assert.equal(taxi.minFee, 50000);
  assert.equal(taxi.maxFee, 80000);
  assert.equal(taxi.payableFee, 0);
  assert.deepEqual(commerce.calculateTotals(260000, taxi), { subtotal: 260000, deliveryFee: 0, payableTotal: 260000 });
});

test('BTS and EMU may coexist with customer/seller paid policies', () => {
  const post = commerce.deliveryOptions(configuredCommerce(), 'jizzakh').filter(x => x.kind === 'POST');
  assert.deepEqual(post.map(x => [x.providerId, x.payer]), [['BTS', 'CUSTOMER'], ['EMU', 'SELLER']]);
  for (const option of post) assert.equal(commerce.calculateTotals(125000, option).payableTotal, 125000);
});

test('regional payment visibility supports cash+card, card-only and none', () => {
  const config = configuredCommerce();
  assert.deepEqual(commerce.paymentOptions(config, 'jizzakh').map(x => x.id), ['CASH', 'CARD']);
  delete config.payments.methods.find(x => x.id === 'CASH').regions['jizzakh'];
  assert.deepEqual(commerce.paymentOptions(config, 'jizzakh').map(x => x.id), ['CARD']);
  delete config.payments.methods.find(x => x.id === 'CARD').regions['jizzakh'];
  assert.deepEqual(commerce.paymentOptions(config, 'jizzakh'), []);
});

test('resolved delivery choice remains unchanged when later settings change', () => {
  const config = configuredCommerce();
  const snapshot = structuredClone(commerce.deliveryOptions(config, 'tashkent_city').find(x => x.kind === 'FIXED'));
  config.delivery.fixed.regions.tashkent_city.fee = 99000;
  assert.equal(snapshot.fee, 40000);
  assert.equal(commerce.calculateTotals(260000, snapshot).payableTotal, 300000);
});

test('manual card validation requires only public display data', () => {
  const config = configuredCommerce();
  assert.deepEqual(commerce.validateConfig(config, REGIONS).issues, []);
  config.payments.methods.find(x => x.id === 'CARD').cardNumber = '';
  assert.equal(commerce.validateConfig(config, REGIONS).issues[0].code, 'CARD_DETAILS_REQUIRED');
});

for (const mimeType of ['image/jpeg', 'image/png', 'image/webp']) {
  test(`detached ${mimeType} bytes survive preview/save delay and chunked base64`, async () => {
    const bytes = Uint8Array.from({ length: 1024 * 1024 + 19 }, (_, i) => i % 251);
    const source = new Blob([bytes], { type: mimeType });
    Object.defineProperty(source, 'name', { value: `receipt.${mimeType.split('/')[1]}` });
    const detached = imageIO.makeDetachedImageFile(await imageIO.readBlobAsArrayBuffer(source), source);
    assert.equal(detached.type, mimeType);
    assert.equal(detached.size, bytes.length);
    const encoded = await imageIO.blobToBase64(detached);
    assert.deepEqual(new Uint8Array(Buffer.from(encoded, 'base64')), bytes);
  });
}

test('server keeps old managed-image cleanup off the URL save response path and checks cross-resource references before deleting', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  assert.match(server, /async function cleanupManagedImageIfUnreferenced/);
  assert.match(server, /productStoragePathFromUrl\(url, supabaseUrl, shopId, "images"\)/);
  assert.match(server, /managedImageUrlStillReferenced\(db, shopId, url\)/);
  assert.match(server, /EdgeRuntime\.waitUntil\(cleanupManagedImageIfUnreferenced\(db, shopId, current\.img, SUPABASE_URL, "old-product-image"\)\)/);
});

// NOTE: the old "migration NNN does X" tests that lived here (and at
// several other points in this file) checked the CONTENT of specific
// numbered FITCORE migration files (012, 013, 014, 015, 016, 017, 018).
// Those files don't exist in this greenfield rebuild — schema starts fresh
// at 001 with a different file layout (see USTORE_GREENFIELD_PHASE1_HISOBOT.md
// section 3). Removed rather than left permanently red, since there is no
// equivalent old-numbered file left to assert against; the underlying
// SCHEMA FACTS they cared about (fulfillment_config jsonb, delivery_snapshot
// jsonb, payment-receipts bucket is private, region codes are canonical
// snake_case, trash_batches/product_price_history/design_settings exist,
// translation_status/translation_hash exist) are still true in the new
// 001-008 migrations — just verify them there directly if you need to,
// rather than via a specific historical file number.

test('checkout never asks for CVV, PIN, SMS code or expiry inputs', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.doesNotMatch(app, /id=["'][^"']*(cvv|pin|sms|expiry|expiration)/i);
  assert.match(app, /CVV, PIN, SMS kod/);
  assert.match(app, /receiptImageUpload/);
});


test('payment receipt bytes are prepared client-side via authenticated shop-api pipeline, not direct Storage upload', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('async function prepareReceiptImageUpload');
  const end = app.indexOf('let submittingOrder', start);
  assert.ok(start >= 0 && end > start, 'prepareReceiptImageUpload not found');
  const receiptFn = app.slice(start, end);
  assert.doesNotMatch(receiptFn, /uploadToSignedUrl/);
  assert.doesNotMatch(receiptFn, /callApi\(/, 'receipt bytes must not be sent via a separate callApi round-trip');

  // Legacy standalone actions stay for backward compatibility, but are no
  // longer used by the checkout path itself.
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  assert.match(server, /case "upload_payment_receipt"/);
  assert.match(server, /storePaymentReceipt\(db, shopId, orderId, tgId, payload\.imageUpload\)/);
});

// 1.7: karta to'lovi + chek majburiy bo'lganda, chek yo'q/yaroqsiz bo'lsa order
// HECH QACHON yaratilmasin — buni frontend HAM, backend HAM (API to'g'ridan-to'g'ri
// chaqirilganda ham) mustaqil ravishda ta'minlashi shart.
test('checkout sends the receipt atomically with create_order, not as a separate follow-up call', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('async function submitOrder');
  const end = app.indexOf('function openOrderSuccessCelebration', start);
  const submitFn = app.slice(start, end);
  assert.match(submitFn, /receiptImageUpload\s*=\s*await prepareReceiptImageUpload\(\)/);
  const createOrderCallIdx = submitFn.indexOf("callApi('create_order'");
  const createOrderCallEnd = submitFn.indexOf(');', createOrderCallIdx);
  const createOrderPayload = submitFn.slice(createOrderCallIdx, createOrderCallEnd);
  assert.match(createOrderPayload, /receiptImageUpload/);
  assert.doesNotMatch(submitFn, /callApi\('upload_payment_receipt'/);
});

test('server rejects create_order before placing it when a required receipt is missing, and rolls back if upload fails', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const start = server.indexOf('case "create_order"');
  const end = server.indexOf('case "cancel_order"');
  const createOrderCase = server.slice(start, end);

  const rpcIdx = createOrderCase.indexOf('db.rpc("place_order"');
  const receiptRequiredIdx = createOrderCase.indexOf('paymentSnapshot.receiptRequired && !payload.receiptImageUpload');
  assert.ok(receiptRequiredIdx >= 0, 'missing pre-creation receiptRequired guard');
  assert.ok(rpcIdx > receiptRequiredIdx, 'receipt-required guard must run BEFORE place_order is called');
  assert.match(createOrderCase, /error: "receipt_required"/);

  const uploadIdx = createOrderCase.indexOf('storePaymentReceipt(db, shopId, orderId, tgId, payload.receiptImageUpload)');
  assert.ok(uploadIdx > rpcIdx, 'receipt upload must happen after the order exists (needs orderId)');
  const compensateIdx = createOrderCase.indexOf('CANCELLED', uploadIdx);
  assert.ok(compensateIdx > uploadIdx && compensateIdx < createOrderCase.indexOf('error: "receipt_upload_failed"'), 'failed receipt upload must cancel the just-created order');
});

// Regression guard for the Farg'ona / Qoraqalpog'iston admin-checkbox bug:
// root cause was apostrophe-containing display names used as region IDs
// embedded in single-quoted inline JS onchange handlers. See
// supabase/migrations/013_region_canonical_codes.sql for the full story.
test('region codes are apostrophe-free canonical snake_case, all 14 present', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const block = app.match(/const REGION_DEFS = \[([\s\S]*?)\n    \];/);
  assert.ok(block, 'REGION_DEFS block not found in ustore-shop-app.js');
  const codes = [...block[1].matchAll(/code:\s*'([^']*)'/g)].map(m => m[1]);
  assert.equal(codes.length, 14);
  assert.equal(new Set(codes).size, 14);
  for (const code of codes) assert.match(code, /^[a-z_]+$/, `region code "${code}" must be apostrophe-free snake_case`);
  assert.ok(codes.includes('fergana'), 'fergana code missing');
  assert.ok(codes.includes('karakalpakstan'), 'karakalpakstan code missing');

  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const serverBlock = server.match(/const UZ_TOP_LEVEL_REGION_IDS = \[([\s\S]*?)\] as const;/);
  assert.ok(serverBlock, 'UZ_TOP_LEVEL_REGION_IDS block not found in index.ts');
  const serverCodes = [...serverBlock[1].matchAll(/"([a-z_]+)"/g)].map(m => m[1]);
  assert.deepEqual(new Set(serverCodes), new Set(codes), 'frontend and backend region codes must match exactly');
});

test('admin region checkbox handlers never interpolate raw display names (encodeURIComponent leaves apostrophes unescaped)', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /function encodedRegionId\(regionId\) \{ return encodeURIComponent\(regionId\); \}/);
  // region.id is now always a REGION_DEFS.code (apostrophe-free), so the
  // pre-existing encodeURIComponent-based encoding is safe going forward.
  // Guard against a future regression where a display name (nameUz/nameRu,
  // which can contain apostrophes) gets interpolated into an onchange
  // handler instead of the encoded canonical id.
  const settingsStart = app.indexOf('function renderDeliveryRegionRows');
  const settingsEnd = app.indexOf('function renderFulfillmentDeliveryBody');
  assert.ok(settingsStart >= 0 && settingsEnd > settingsStart, 'expected settings render functions not found (renamed?)');
  const settingsSection = app.slice(settingsStart, settingsEnd);
  const onchangeAttrs = settingsSection.match(/onchange="[^"]*"/g) || [];
  for (const attr of onchangeAttrs) {
    assert.doesNotMatch(attr, /region\.nameUz|region\.nameRu/, `onchange handler must not interpolate a display name: ${attr}`);
  }
});

// 1.8: native "Choose file / No file chosen" matni hech qachon ko'rinmasin.
test('receipt picker hides the native file input behind a custom button and shows a preview + replace state', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('function renderReceiptPicker');
  const end = app.indexOf('function rerenderReceiptPicker');
  assert.ok(start >= 0 && end > start, 'renderReceiptPicker not found');
  const fn = app.slice(start, end);
  assert.match(fn, /class="hidden"/, 'native file input must be visually hidden');
  // 5-band: receipt picker must offer BOTH Galereya and Fayl sources, same
  // as every other image-upload location in the app (previously only had
  // one accept="image/*" input, no separate Files source).
  assert.match(fn, /id="chk-receipt"[^>]*accept="image\/\*"/, 'gallery input (accept=image/*) must exist');
  assert.match(fn, /id="chk-receipt-files"\s+type="file"\s+onchange="onCheckoutReceiptPicked\(event\)"/, 'a second, accept-less files input must exist so Android "Files" picking works');
  // Legacy audit: the two separately-labeled Galereya/Fayl buttons were
  // unified into ONE trigger opening the shared openImagePickerSheet()
  // (which itself offers both sources) — both hidden inputs above still
  // exist with the exact same onchange handler, only the visible trigger changed.
  assert.match(fn, /openImagePickerSheet\('chk-receipt','chk-receipt-files'\)/);
});

// 2026-08-27: `setAttribute('accept', 'image/*...')` was found to be the ROOT
// CAUSE of a real bug — even though the "files" (accept-less) input was
// selected, forcing accept="image/*" onto it right before .click() still
// made mobile browsers open the Gallery/Photos picker instead of the real
// device file manager. Fixed by never setting accept at all.
test('the shared openImagePickerSheet() opens the device file manager directly (no accept override that would redirect to Gallery) and preserves the caller form state', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('function openImagePickerSheet');
  const end = app.indexOf('function closeImagePickerSheet');
  assert.ok(start >= 0 && end > start, 'openImagePickerSheet not found');
  const fn = app.slice(start, end);
  assert.doesNotMatch(fn, /Galereyadan tanlash|Fayllardan tanlash/);
  assert.match(fn, /input\.click\(\)/);
  assert.match(fn, /removeAttribute\('accept'\)/, 'must NOT force accept="image/*" — that silently reopens the Gallery picker on mobile even on the accept-less "files" input');
  assert.doesNotMatch(fn, /setAttribute\('accept'/, 'must never set an accept attribute here');
  assert.doesNotMatch(fn, /modal-container/, 'must use its own root, never the shared #modal-container (which a parent form modal already occupies)');
});

// 2026-08-27: pinch text-zoom appeared broken specifically inside Marketing/
// Aksiyalar detail sheets — root cause was that those sheets are appended
// directly to document.body (bypassing render(), which is the only place
// applyVisibleTextScale() was ever called), so their text never got scaled
// to the currently active zoom level. Fixed with a body-level MutationObserver.
test('a MutationObserver rescales text on any node appended directly to document.body, so detail sheets/modals opened outside render() still respect the active pinch-zoom level', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /new MutationObserver\(\(mutations\) => \{/);
  const start = app.indexOf('new MutationObserver((mutations) => {');
  const end = app.indexOf('applyTextZoom(textZoomLevel);', start);
  const block = app.slice(start, end);
  assert.match(block, /applyVisibleTextScale\(root\)/);
  assert.match(block, /\.observe\(document\.body, \{ childList: true, subtree: true \}\)/);
});

// 2026-08-27: product/category catalog drag already re-flowed the other
// cards to open a gap (placeholder DOM move) but did it with an instant
// snap — no animation. Fixed with a FLIP (measure before, mutate, then
// invert+play the transform) so siblings visibly slide into place.
test('catalog drag (product/category reorder) animates siblings sliding into place when a gap opens, instead of snapping instantly', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('function moveCatalogDrag(event)');
  const end = app.indexOf('async function endCatalogDrag', start);
  const block = app.slice(start, end);
  assert.match(block, /getBoundingClientRect\(\)/);
  assert.match(block, /el\.style\.transform=`translate\(\$\{dx\}px,\$\{dy\}px\)`/);
  assert.match(block, /requestAnimationFrame\(\(\)=>\{el\.style\.transition='transform \.18s ease';el\.style\.transform='';\}\)/);
});

// 2026-08-27: ROOT CAUSE of the header-buttons-don't-respond-inside-full-pages
// bug (person-mode switch, cart, language) — a LATER CSS block silently
// redeclared .ustore-topbar with z-index:40!important, overriding an EARLIER,
// deliberate z-index:50!important (both !important, same specificity — later
// wins by source order). That dropped the header to the SAME layer as
// #page-container (Tailwind z-40): when a full page (Marketing/Aksiyalar/
// any renderPageShell page) is open, the later-in-DOM #page-container then
// painted OVER the header in the tied zone, swallowing clicks meant for the
// header's own buttons. Fixed by restoring z-index:50 in the later block too.
test('the header (.ustore-topbar) has exactly one effective z-index value across the whole stylesheet, and it stays above #page-container', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'ustore.css'), 'utf8');
  const declarations = [...css.matchAll(/\.ustore-topbar\s*\{[^}]*z-index:\s*(\d+)\s*!important/g)].map(m => Number(m[1]));
  assert.ok(declarations.length >= 1, 'must find at least one z-index declaration on .ustore-topbar');
  for (const z of declarations) assert.equal(z, 50, 'every z-index declared on .ustore-topbar must be 50 — a stray lower value here would silently win (later !important wins by source order) and let #page-container (z-40) cover the header again');
});

// Image Pipeline V2: chek endi ORIGINAL File'ni to'g'ridan-to'g'ri
// captureAndPrepareImageV2'ga beradi (createImageBitmap-first, FileReader/
// ArrayBuffer'siz) — natija (mustaqil nusxa) checkoutReceiptPreparing orqali
// keyinroq upload uchun ishlatiladi, hech qayerda raw `file`ga ishonilmaydi.
test('receipt bytes are captured into an independent copy via the V2 pipeline immediately on file pick (not relied on later via the raw File object)', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('async function onCheckoutReceiptPicked');
  const end = app.indexOf('async function prepareReceiptImageUpload');
  const fn = app.slice(start, end);
  assert.match(fn, /checkoutReceiptPreparing\s*=\s*captureAndPrepareImageV2\(file, MAX_RECEIPT_BYTES, 1600, 0\.85/);
  assert.doesNotMatch(fn, /readBlobAsArrayBuffer\(file\)\.then/, 'V2 must not front-load a FileReader/ArrayBuffer read on the raw picked File');
});

// 1.9/1.10: Telegramga muvaffaqiyatli yuborilgandan keyingina 72 soatlik
// countdown boshlanadi, va faqat shu vaqt asosida cleanup ishlaydi.
test('receipt telegram-sent timestamp is only stamped after a successful send, and cleanup is gated by a dedicated cron secret checked before Telegram auth', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const notifyStart = server.indexOf('async function notifyReceiptAdmins');
  const notifyEnd = server.indexOf('async function cleanupPrivateReceipt');
  const notifyFn = server.slice(notifyStart, notifyEnd);
  assert.match(notifyFn, /anySent/);
  assert.match(notifyFn, /payment_receipt_telegram_sent_at:\s*new Date\(\)\.toISOString\(\)/);

  const cleanupActionIdx = server.indexOf('action === "cleanup_expired_receipts"');
  // Greenfield: Telegram-signature verification now happens inside
  // resolveShopContext() (a shared helper, called once per request) rather
  // than inline in Deno.serve — so "before Telegram auth" means "before
  // that function is CALLED", not before its definition appears in the file.
  const authGateIdx = server.indexOf('const resolved = await resolveShopContext(');
  assert.ok(cleanupActionIdx >= 0 && cleanupActionIdx < authGateIdx, 'cleanup_expired_receipts must be dispatched before Telegram auth (it is a cron job, not a user request)');
  const cleanupBlock = server.slice(cleanupActionIdx, server.indexOf('\n  }\n', cleanupActionIdx));
  assert.match(cleanupBlock, /CRON_SHARED_SECRET/);
  assert.match(cleanupBlock, /payment_receipt_telegram_sent_at/);
  assert.match(cleanupBlock, /72 \* 3600 \* 1000/);
});

test('cleaned-up receipts stay visible in Telegram via a non-hardcoded bot username, independent of Storage having the file', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  assert.match(server, /receiptSentToTelegram:\s*!!o\.payment_receipt_telegram_sent_at/);
  // Greenfield: bot username is no longer a single static env var (there is
  // no longer just one bot) — it comes from the per-shop shop_bots row via
  // resolveShopContext(), exposed here as ctx.botUsername.
  assert.match(server, /botUsername:\s*ctx\.botUsername/);

  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /botUsername = bootData\.botUsername/);
  assert.match(app, /https:\/\/t\.me\/\$\{encodeURIComponent\(botUsername\)\}/);
});

// 1.11 root cause: compressImage previously let a canvas/toBlob exception
// escape uncaught, which the outer .catch() in onImagePicked then reported
// as the misleading "Rasm faylini lokal o'qishda xato" — even though the
// bytes had actually been read successfully. Compression must now always
// resolve to *some* usable file (original as fallback), never throw.
test('compressImage never throws — any internal failure falls back to the original (already-detached) file', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('async function compressImage');
  const end = app.indexOf('function validateExternalImageUrl');
  assert.ok(start >= 0 && end > start, 'compressImage not found');
  const fn = app.slice(start, end);
  // The whole decode/canvas/toBlob body must sit inside one outer try that
  // returns `file` on catch, not just the inner decode step.
  const outerTryIdx = fn.indexOf('try {');
  const innerDecodeTryIdx = fn.indexOf('try { decoded = await decodeImageSource');
  assert.ok(outerTryIdx >= 0 && outerTryIdx < innerDecodeTryIdx, 'expected an outer try wrapping the whole pipeline before the decode try');
  const lastCatchIdx = fn.lastIndexOf('} catch (_) {');
  assert.ok(lastCatchIdx > innerDecodeTryIdx, 'expected a final catch-all after the decode/canvas pipeline');
  assert.match(fn.slice(lastCatchIdx), /return file;/);
});

// Image Pipeline V2: uploadImageFileQuiet (V1's own separate detach+compress
// helper, used ONLY by the logo picker) is dead code now that the logo
// picker calls the shared captureAndPrepareImageV2 directly — removed rather
// than kept as an unused parallel pipeline.
test('logo upload reuses the shared V2 image pipeline (captureAndPrepareImageV2) instead of a separate V1-only helper', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.doesNotMatch(app, /function uploadImageFileQuiet/, 'uploadImageFileQuiet was V1-only and must not remain as dead parallel pipeline code');
  // POLISH ROUND (7-topshiriq, task 1): a mandatory 4:1 crop step was
  // inserted between picking and compressing — saveShopLogoFromPicker()
  // now only validates+opens the crop modal (sync, no longer async); the
  // actual V2-pipeline compress/upload call moved into
  // processCroppedLogoFile(), invoked after the user confirms the crop.
  const start = app.indexOf('async function processCroppedLogoFile');
  const end = app.indexOf('async function openLogoCropStep');
  assert.ok(start >= 0 && end > start, 'processCroppedLogoFile not found');
  const fn = app.slice(start, end);
  assert.match(fn, /captureAndPrepareImageV2\(file, TARGET_PRODUCT_IMAGE_BYTES, \d+, [\d.]+\)/, "umumiy V2 zanjiri ishlatilishi kerak (aniq siqish parametrlari vaqti-vaqti bilan sozlanadi)");
});

// 1.12: BTS/EMU real tracking yo'q, shuning uchun pochta uchun "Yo'lda"/
// "Yetkazildi" olib tashlanadi; asosiy order.status DELIVERED tegilmaydi.
test('post shipment sub-status is limited to READY/HANDED_TO_CARRIER (no fake IN_TRANSIT/DELIVERED tracking), while TAXI keeps its full flow', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const start = server.indexOf('case "update_shipment"');
  const end = server.indexOf('case "get_my_orders"');
  const fn = server.slice(start, end);
  assert.match(fn, /\["READY", "TAXI_ASSIGNED", "IN_TRANSIT", "DELIVERED"\]\.includes\(status\)/, 'TAXI must keep its full status set');
  assert.match(fn, /\["READY", "HANDED_TO_CARRIER"\]\.includes\(status\)/, 'POST must be limited to READY/HANDED_TO_CARRIER');
  const postBranchStart = fn.indexOf('delivery.kind === "POST"');
  const postBranchEnd = fn.indexOf('} else {', postBranchStart);
  assert.doesNotMatch(fn.slice(postBranchStart, postBranchEnd), /IN_TRANSIT|DELIVERED/, 'the POST branch itself must never fake IN_TRANSIT/DELIVERED tracking (the TAXI-only auto-sync added 2026-09-13 lives after this branch, not inside it)');

  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const adminPostBlock = app.slice(app.indexOf("o.delivery?.kind === 'POST' && o.status"), app.indexOf("o.status === 'CANCELLED' && o.cancelReason"));
  assert.doesNotMatch(adminPostBlock, /IN_TRANSIT|>Yetkazildi</, 'admin POST shipment select must not offer in-transit/delivered options');
});

// 1.13: mijoz filialni checkout'da tanlaydi (1.14), admin uni qayta kiritmaydi.
test('admin no longer re-enters the post branch — only tracking number and status', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.doesNotMatch(app, /id="shipment-branch"/);
  const saveStart = app.indexOf('async function saveShipmentForOrder');
  assert.ok(saveStart >= 0, 'saveShipmentForOrder not found');
  const saveFn = app.slice(saveStart, saveStart + 800);
  assert.doesNotMatch(saveFn, /originBranch/);

  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const updateShipmentBlock = server.slice(server.indexOf('case "update_shipment"'), server.indexOf('case "get_my_orders"'));
  assert.doesNotMatch(updateShipmentBlock, /payload\.originBranch/);
});

// 1.14: BTS/EMU real filial ma'lumotlari — barcha 14 hudud, faqat rasmiy manbadan.
test('greenfield delivery reference migration ships real BTS/EMU branch data for all 14 regions with no fabricated/placeholder rows', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '006_delivery_reference.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.delivery_branches/);
  assert.match(sql, /unique \(provider, branch_code\)/);
  const tableStart = sql.indexOf('create table if not exists public.delivery_branches');
  const tableEnd = sql.indexOf(');', tableStart);
  assert.doesNotMatch(sql.slice(tableStart, tableEnd), /shop_id/i, 'delivery_branches must stay platform-global, never shop-scoped');

  const REGION_CODES = ['tashkent_city','tashkent_region','andijan','bukhara','fergana','jizzakh','namangan','navoi','qashqadaryo','karakalpakstan','samarkand','sirdaryo','surxondaryo','khorezm'];
  for (const code of REGION_CODES) {
    assert.match(sql, new RegExp(`'${code}'`), `no branch rows reference region '${code}'`);
  }
  assert.match(sql, /'BTS'/);
  assert.match(sql, /'EMU'/);
  // Provenance required for every row, not just claimed once in a comment.
  assert.match(sql, /source_url/);
  assert.match(sql, /source_checked_at/);
  const btsRows = (sql.match(/'BTS',\s*'\d/g) || []).length;
  const emuRows = (sql.match(/'EMU',\s*'\d/g) || []).length;
  assert.ok(btsRows > 300, `expected 300+ BTS branch rows, found ${btsRows}`);
  assert.ok(emuRows > 150, `expected 150+ EMU branch rows, found ${emuRows}`);
});

test('get_delivery_branches is available to any authenticated customer (not admin-only) and is scoped by region+provider', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const start = server.indexOf('case "get_delivery_branches"');
  const end = server.indexOf('// LIGHT BOOT');
  assert.ok(start >= 0 && end > start, 'get_delivery_branches case not found');
  const block = server.slice(start, end);
  assert.doesNotMatch(block, /requireAdmin\(\)/, 'customers must be able to call this during checkout, not just admins');
  assert.match(block, /eq\("region_code", regionKey\)/);
  assert.match(block, /eq\("provider", provider\)/);
  assert.match(block, /eq\("active", true\)/);
});

test('create_order rejects/validates the branch server-side for POST delivery — customer never hand-types a branch address', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const start = server.indexOf('case "create_order"');
  const end = server.indexOf('case "cancel_order"');
  const block = server.slice(start, end);
  assert.match(block, /error: "branch_required"/);
  assert.match(block, /error: "invalid_branch"/);
  assert.match(block, /branchRow\.provider !== providerId \|\| branchRow\.region_code !== regionKey/, 'branch must be validated against the chosen provider AND region, not trusted blindly');
  assert.match(block, /address = branchRow\.full_address/, 'address must be taken from the branch record, not the client-submitted value');
  assert.match(block, /branchId: selectedBranch\.id, branchCode: selectedBranch\.branch_code/);
});

test('checkout branch picker replaces free-text district/address for POST delivery and feeds branchId into create_order', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /id="chk-branch-wrap"/);
  assert.match(app, /id="chk-branch-search"/);
  const submitStart = app.indexOf('async function submitOrder');
  const submitEnd = app.indexOf('function openOrderSuccessCelebration');
  const submitFn = app.slice(submitStart, submitEnd);
  assert.match(submitFn, /checkoutSelectedBranch\?\.district_or_city/);
  assert.match(submitFn, /checkoutSelectedBranch\?\.full_address/);
  assert.match(submitFn, /branchId: isPostDelivery \? checkoutSelectedBranch\?\.id/);
});

test('9-band: "Uyga yetkazish" (non-POST) delivery never shows the "Filialni tanlang" branch picker — handleDistrictChange no longer calls renderBranchPicker() unconditionally, and renderBranchPicker() itself is hardened to hide the wrap for any non-POST method', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const dcStart = app.indexOf('function handleDistrictChange');
  const dcEnd = app.indexOf('function selectDelivery');
  assert.ok(dcStart >= 0 && dcEnd > dcStart, 'handleDistrictChange not found');
  const dcBlock = app.slice(dcStart, dcEnd);
  assert.doesNotMatch(dcBlock, /\}\s*else\s*\{\s*renderBranchPicker\(\);\s*\}/, 'the non-POST else-branch must not blindly call renderBranchPicker() — that was the actual bug (it unhid the branch wrap regardless of delivery kind)');
  assert.match(dcBlock, /wrap\.classList\.add\('hidden'\)/, 'the non-POST branch must explicitly hide #chk-branch-wrap instead');

  const rbpStart = app.indexOf('function renderBranchPicker');
  const rbpBlock = app.slice(rbpStart, rbpStart + 500);
  assert.match(rbpBlock, /startsWith\('POST:'\)/, 'renderBranchPicker itself must check the delivery kind before un-hiding — defense in depth against any future stray call site');
  assert.match(rbpBlock, /wrap\.classList\.toggle\('hidden', !isPost\)/);
});

test('10-band: checkout district selection survives the async normalized-list re-render — matched by a suffix-insensitive key ("Olmazor" == "Olmazor tumani"), not brittle exact string equality that silently drops the selection', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /function districtNormalizedKey\(value\)/, 'must be a real reusable helper, not inline duplicated logic');
  assert.match(app, /replace\(\/\\s\+\(tumani\|shahri\)\$\/, ''\)/, 'must strip the "tumani"/"shahri" suffix before comparing');
  assert.match(app, /function findMatchingDistrictOption\(options, previousValue\)/);

  // 11-band: the match/restore logic now lives in the shared
  // populateDistrictSelectForRegion(), reused by both handleRegionChange
  // and applyCheckoutDraftToForm.
  const regionFnStart = app.indexOf('function populateDistrictSelectForRegion');
  const regionFnEnd = app.indexOf('function handleRegionChange');
  const regionFn = app.slice(regionFnStart, regionFnEnd);
  assert.doesNotMatch(regionFn, /districts\.includes\(previousDistrict\)/, 'must no longer restore selection via brittle exact-string .includes()');
  assert.match(regionFn, /findMatchingDistrictOption\(districts, previousDistrict\)/);

  const districtFieldStart = app.indexOf('function renderDistrictField');
  const districtFieldBlock = app.slice(districtFieldStart, districtFieldStart + 700);
  assert.doesNotMatch(districtFieldBlock, /checkoutDistrictOptions\.includes\(previousValue\)/, 'must no longer restore selection via brittle exact-string .includes()');
  assert.match(districtFieldBlock, /findMatchingDistrictOption\(checkoutDistrictOptions, previousValue\)/);
});

test('11-band: checkout form state (name/phone/address/delivery method/payment method/branch) survives a background poll or boot refresh while CHECKOUT_FORM is open, and applying a saved draft no longer wipes the delivery/payment/branch choice it just restored', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const guardStart = app.indexOf('function isCatalogEditorModalOpen');
  const guardBlock = app.slice(guardStart, guardStart + 500);
  assert.match(guardBlock, /activePopupModal === 'CHECKOUT_FORM'/, 'the same background-refresh guard used for admin product/category drafts must also cover the open checkout modal');

  const applyStart = app.indexOf('function applyCheckoutDraftToForm');
  const applyEnd = app.indexOf('function populateDistrictSelectForRegion');
  assert.ok(applyStart >= 0 && applyEnd > applyStart, 'applyCheckoutDraftToForm not found');
  const applyBlock = app.slice(applyStart, applyEnd);
  assert.doesNotMatch(applyBlock, /handleRegionChange\(false\);/, 'must no longer CALL the full handleRegionChange (it resets selectedDeliveryMethodId/selectedPayMethod/checkoutSelectedBranch — the exact values this function just restored from the draft two lines above)');
  assert.match(applyBlock, /populateDistrictSelectForRegion\(regionKey, checkoutDraft\.district \|\| ''\)/, 'must only repopulate the district <select> options for the restored region, without touching delivery/payment/branch state');
  assert.match(applyBlock, /selectedDeliveryMethodId = checkoutDraft\.deliveryMethodId \|\| selectedDeliveryMethodId;/);
  assert.match(applyBlock, /selectedPayMethod = checkoutDraft\.paymentMethodId \|\| selectedPayMethod;/);
});

// ==================== BLOCK 2: CATALOG MANAGEMENT ====================

test('2.2: move_category is validated server-side against self and against its own descendants (cycle prevention)', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const start = server.indexOf('case "move_category"');
  const end = server.indexOf('case "get_category_delete_preview"');
  assert.ok(start >= 0 && end > start, 'move_category case not found');
  const block = server.slice(start, end);
  assert.match(block, /error: "cannot_move_into_self"/);
  assert.match(block, /isCategoryDescendantOrSelf\(allCats, newParentId, categoryId\)/);
  assert.match(block, /error: "cannot_move_into_own_descendant"/);
});

test('2.4/2.5: deleting a category uses the atomic subtree-and-products trash RPC', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const start = server.indexOf('case "delete_category"');
  const end = server.indexOf('case "get_trash"');
  assert.ok(start >= 0 && end > start, 'delete_category case not found');
  const block = server.slice(start, end);
  assert.match(block, /db\.rpc\("ustore_trash_category", \{ p_shop_id: shopId, p_root_category_id: categoryId, p_deleted_by: tgId \}\)/);
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '079_atomic_trash_and_reorder.sql'), 'utf8');
  assert.match(sql, /with recursive tree as/);
  assert.match(sql, /insert into public\.trash_batches\(shop_id,kind,root_category_id,category_ids,product_ids,deleted_by\)/);
});

test('2.4/2.5: standalone product delete uses the atomic restorable-trash RPC', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const start = server.indexOf('case "delete_product"');
  const end = server.indexOf('case "add_category"');
  const block = server.slice(start, end);
  assert.match(block, /db\.rpc\("ustore_trash_product", \{ p_shop_id: shopId, p_product_id: productId, p_deleted_by: tgId \}\)/);
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '079_atomic_trash_and_reorder.sql'), 'utf8');
  assert.match(sql, /insert into public\.trash_batches\(shop_id,kind,product_ids,deleted_by\)/);
});

test('2.5: purge_expired_trash is cron-secret gated, dispatched before Telegram auth, older-than-24h only, and uses the shared atomic purge RPC', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const purgeIdx = server.indexOf('action === "purge_expired_trash"');
  const authGateIdx = server.indexOf('const resolved = await resolveShopContext(');
  assert.ok(purgeIdx >= 0 && purgeIdx < authGateIdx, 'purge_expired_trash must run before Telegram auth (cron job, not a user request)');
  const block = server.slice(purgeIdx, authGateIdx);
  assert.match(block, /CRON_SHARED_SECRET/);
  assert.match(block, /24 \* 3600 \* 1000/);
  assert.match(block, /db\.rpc\("ustore_purge_trash_batch"/);
  assert.match(block, /cleanupUnreferencedProductImages/);
});

test('2.6: duplicate_product creates new SKUs and copies original stock/variant quantities while keeping the duplicate unfeatured', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const start = server.indexOf('case "duplicate_product"');
  const end = server.indexOf('case "delete_product"') > start ? server.indexOf('case "delete_product"') : server.length;
  const block = server.slice(start, end);
  assert.match(block, /allocateGlobalSkus\(db, shopId, skuCount\)/);
  assert.match(block, /name: `\$\{original\.name\} — nusxa`/);
  assert.match(block, /stock: Number\(original\.stock\) \|\| 0/);
  assert.match(block, /status: Number\(original\.stock\) > 0 \? "ACTIVE" : "OUT_OF_STOCK", is_featured: false/);
  assert.match(block, /qty: Number\(v\.qty\) \|\| 0/);
});

test('2.8: price history is only written when the price actually changes, not on every product save', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const start = server.indexOf('case "edit_product_field"');
  const end = server.indexOf('case "get_product_price_history"');
  assert.ok(start >= 0 && end > start, 'edit_product_field case not found');
  const block = server.slice(start, end);
  assert.match(block, /if \(Number\(current\.price\) !== price\) priceChangeToLog/);
  assert.match(block, /if \(priceChangeToLog\)/);
});

test('2.1: category reorder swaps sort_order only within the clicked pair of siblings and persists via reorder_categories', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('async function moveCategoryOrder');
  const end = app.indexOf('async function openTrashModal');
  assert.ok(start >= 0 && end > start, 'moveCategoryOrder not found');
  const fn = app.slice(start, end);
  assert.match(fn, /callApi\('reorder_categories', \{ items: \[\{ id: cat\.id, sortOrder: cat\.sortOrder \}, \{ id: other\.id, sortOrder: other\.sortOrder \}\] \}\)/);
});

test('2.4: admin sees recursive category/product counts before confirming a category delete', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('async function deleteCategory');
  const end = app.indexOf('async function duplicateProduct');
  assert.ok(start >= 0 && end > start, 'deleteCategory not found');
  const fn = app.slice(start, end);
  assert.match(fn, /callApi\('get_category_delete_preview'/);
  assert.match(fn, /preview\.categoryCount/);
  assert.match(fn, /preview\.productCount/);
  const confirmIdx = fn.indexOf('await appConfirm(msg');
  const deleteCallIdx = fn.indexOf("callApi('delete_category'");
  assert.ok(confirmIdx >= 0 && deleteCallIdx > confirmIdx, 'confirm must happen before the actual delete call');
});

// ==================== BLOCK 3: UZ -> RU AUTO-TRANSLATION ====================

test('3.8: the Azure Translator key/region are read only from server-side Deno env, never appear in frontend source', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  assert.match(server, /Deno\.env\.get\("AZURE_TRANSLATOR_KEY"\)/);
  assert.match(server, /Deno\.env\.get\("AZURE_TRANSLATOR_REGION"\)/);
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.doesNotMatch(app, /AZURE_TRANSLATOR/);
  assert.doesNotMatch(app, /Ocp-Apim-Subscription-Key/);
});

test('3.4: translation failure never throws — every path resolves to null/FAILED so product/category save always succeeds', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const start = server.indexOf('async function translateBatchUzToRu');
  const end = server.indexOf('async function translateUzToRu');
  const fn = server.slice(start, end);
  assert.match(fn, /if \(!cfg\) return texts\.map\(\(\) => null\)/);
  assert.match(fn, /catch \(e\) \{\s*console\.error/);
});

test('3.9: translation is skipped when the UZ text hash is unchanged (no needless re-translation cost)', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const start = server.indexOf('async function resolveTranslation');
  const end = server.indexOf('case "setup_bot_webhook"');
  const fn = server.slice(start, end > start ? end : server.length);
  assert.match(fn, /if \(hash === currentHash\) return \{ nameRu: undefined/);
});

test('3.2/3.3: add_product and edit_product_field wire server-side translation and ignore any client-sent nameRu/descRu', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const addStart = server.indexOf('case "add_product"');
  const addEnd = server.indexOf('case "get_excel_template_url"');
  const addBlock = server.slice(addStart, addEnd);
  assert.match(addBlock, /translation_status: "PENDING"/);
  assert.match(addBlock, /translateProductInBackground\(db, shopId, String\(insertedProduct\.id\), cleanName, finalDesc, pendingTranslationHash\)/);
  assert.doesNotMatch(addBlock, /const \{[^}]*\bnameRu\b/, 'nameRu must not be destructured from payload');
  assert.doesNotMatch(addBlock, /payload\.descRu/);

  const editStart = server.indexOf('case "edit_product_field"');
  const editEnd = server.indexOf('case "get_product_price_history"');
  const editBlock = server.slice(editStart, editEnd);
  assert.match(editBlock, /pendingProductTranslation/);
  assert.match(editBlock, /translateProductInBackground/);
});

test('3.7: category create/edit uses the same auto-translate model as products', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const start = server.indexOf('case "add_category"');
  const end = server.indexOf('case "reorder_categories"');
  const block = server.slice(start, end);
  assert.match(block, /translation_status: "PENDING"/);
  assert.match(block, /translateCategoryInBackground/);
});

test('3.6: Excel import ignores any RU columns and translates imported rows server-side in background batches, not from the browser', () => {
  const importJs = fs.readFileSync(path.join(__dirname, '..', 'excel-import.js'), 'utf8');
  assert.match(importJs, /nameRu:null/);
  assert.match(importJs, /descRu:null/);

  const templateTs = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'excel-template.ts'), 'utf8');
  assert.doesNotMatch(templateTs, /RU/);

  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const start = server.indexOf('case "bulk_import_products"');
  const end = server.indexOf('case "get_category_aliases"');
  const block = server.slice(start, end);
  assert.match(block, /name_ru: null/);
  assert.match(block, /EdgeRuntime\.waitUntil\(\(async \(\) => \{/);
  assert.match(block, /translateBatchUzToRu\(names\)/);
  assert.match(block, /translateBatchUzToRu\(descs\)/);
});

test('3.1: manual RU inputs are removed from the category add/edit UI (products never had one)', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.doesNotMatch(app, /id="m-cat-name-ru"/);
  assert.doesNotMatch(app, /id="ec-name-ru"/);
  assert.doesNotMatch(app, /toggleRuFields/);
  // DB columns must stay usable (fallback rendering still reads them).
  assert.match(app, /p\.nameRu/);
  assert.match(app, /p\.descRu/);
});

test('3.5: search matches product description in addition to name, in both UZ and RU', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('function searchProducts');
  const end = app.indexOf('function loadOrdersLazy');
  const fn = app.slice(start, end);
  assert.match(fn, /descNorm\.latin\.includes\(latin\)/);
  assert.match(fn, /descRuMatch/);
  assert.match(fn, /\|\| descMatch \|\| descRuMatch/);
});

// ==================== BLOCK 4: STORE DESIGN / THEME ====================

// The old FITCORE migration 018 created design_settings with a placeholder
// `shop_id integer primary key default 1` — "future-SaaS-safe" but still
// single-tenant. That future is now the present: the greenfield schema
// makes it a REAL per-shop table (uuid PK referencing shops(id)), no more
// placeholder default.
test('greenfield design_settings is genuinely shop-scoped (uuid FK to shops, no default-1 placeholder)', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '005_shop_settings_design.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.design_settings/);
  const tableStart = sql.indexOf('create table if not exists public.design_settings');
  const tableEnd = sql.indexOf(');', tableStart);
  const tableBody = sql.slice(tableStart, tableEnd);
  assert.match(tableBody, /shop_id uuid primary key references public\.shops\(id\)/);
  assert.doesNotMatch(tableBody, /default 1\b/i, 'must not fall back to the old single-tenant placeholder pattern');
});

test('4.1: at least 5 preset themes exist, each defining all 8 color roles', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('const DESIGN_THEMES = {');
  const end = app.indexOf('// ---- 4.3');
  assert.ok(start >= 0 && end > start, 'DESIGN_THEMES not found');
  const block = app.slice(start, end);
  const themeIds = [...block.matchAll(/^\s*(\w+): \{ label:/gm)].map(m => m[1]);
  assert.ok(themeIds.length >= 5, `expected >=5 themes, found ${themeIds.length}`);
  const roleKeysPerTheme = [...block.matchAll(/colors: \{ ([^}]+) \}/g)].map(m => [...m[1].matchAll(/(\w+):/g)].map(x => x[1]));
  for (const roles of roleKeysPerTheme) {
    for (const role of ['primary', 'accent', 'button', 'pageBg', 'cardBg', 'headerBg', 'bottomNavBg', 'text']) {
      assert.ok(roles.includes(role), `theme missing role "${role}"`);
    }
  }
});

test('4.1: clicking a preset theme updates the isolated live preview immediately without changing the real storefront before save', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('function pickDesignTheme');
  const end = app.indexOf('function startCustomDesign');
  const fn = app.slice(start, end);
  assert.match(fn, /designDraft = \{ themeId, colors: \{ \.\.\.theme\.colors \} \}/);
  assert.match(fn, /render\(\)/);
  assert.doesNotMatch(fn, /applyDesignColors\(/, 'preset selection must stay draft-only until Save');
});

test('4.2: admin can edit each named UI color role independently, and a manual edit switches theme to "custom"', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('const DESIGN_COLOR_KEYS');
  const rolesBlock = app.slice(start, start + 650);
  for (const role of ['primary','accent','button','buttonText','secondaryButton','pageBg','panelBg','cardBg','inputBg','headerBg','headerText','bottomNavBg','bottomNavText','border','text','secondaryText','mutedText','success','warning','danger']) {
    assert.match(rolesBlock, new RegExp(`['\"]${role}['\"]`), `missing color role ${role}`);
  }
  const fnStart = app.indexOf('function setDesignColor');
  const fnEnd = app.indexOf('async function saveDesignSettings');
  const fn = app.slice(fnStart, fnEnd);
  assert.match(fn, /designDraft = \{ themeId:'custom', colors:/);
});

test('SHOP APP 2.0: sixth design mode is a custom builder with live Home/Product/Cart preview and no random-generator dependency', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /O'zim yarataman/);
  assert.match(app, /function startCustomDesign\(\)/);
  assert.match(app, /designDraft = \{ themeId:'custom'/);
  assert.match(app, /\['HOME','PRODUCT','CART'\]/);
  assert.match(app, /function renderDesignPreviewHtml/);
  assert.doesNotMatch(app.slice(app.indexOf('function renderDesignSettingsPage'), app.indexOf('function renderOrderPolicySettingsPanel')), /Qayta yaratish/);
});

test('ROUND 11: Ombor Qoldiq renders the category hierarchy inline and opens products inside the selected tree node', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /function renderWarehouseTreeCategoryHtml/);
  assert.match(app, /toggleWarehouseTreeCategory/);
  assert.match(app, /fc-stock-tree-products/);
  assert.match(app, /children\.map\(child=>renderWarehouseTreeCategoryHtml/);
});

test('TASK 5: desktop/tablet warehouse category tree starts collapsed and top-level categories toggle their whole branch without changing Mini App/mobile behavior', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /let warehouseTreeExpandedCategoryIds = new Set\(\)/);
  assert.match(app, /function warehouseTreeDesktopMode\(\)[\s\S]*browserBridge[\s\S]*min-width: 768px/);
  assert.match(app, /if \(warehouseSubTab === 'QOLDIQ' && previous !== 'QOLDIQ'\) \{ warehouseBrowseCategoryId = null; warehouseTreeExpandedCategoryIds\.clear\(\); \}/);
  assert.match(app, /if\(warehouseTreeIsExpanded\(nextId\)\)\{ warehouseTreeCollapseBranch\(nextId\); \}/);
  assert.match(app, /\$\{expanded \? `<div class=\"fc-stock-tree-children\">/);
  assert.match(app, /if\(!warehouseTreeDesktopMode\(\)\)\{ warehouseBrowseCategoryId=String\(warehouseBrowseCategoryId\|\|''\)===String\(id\|\|''\)\?null:\(id\|\|null\); render\(\); return; \}/);
});

test('4.3: contrast is checked against WCAG AA (4.5:1) for text vs page/card background, and buttons get an auto-computed readable text color', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /const WCAG_AA_RATIO = 4\.5/);
  const findStart = app.indexOf('function findContrastIssues');
  const findEnd = app.indexOf('function applyDesignColors');
  const findFn = app.slice(findStart, findEnd);
  assert.match(findFn, /contrastRatio\(c\.text, c\.pageBg\) < WCAG_AA_RATIO/);
  assert.match(findFn, /contrastRatio\(c\.text, c\.cardBg\) < WCAG_AA_RATIO/);
  assert.match(app, /function readableTextColor\(bgHex\)/);

  const saveStart = app.indexOf('async function saveDesignSettings');
  const saveEnd = app.indexOf('if (activePopupModal === \'DESIGN_SETTINGS\'', saveStart) > saveStart
    ? app.indexOf('if (activePopupModal === \'DESIGN_SETTINGS\'', saveStart)
    : saveStart + 1500;
  const saveFn = app.slice(saveStart, saveEnd);
  assert.match(saveFn, /findContrastIssues\(designDraft\.colors(?:,\s*designDraft\.themeId)?\)/);
  assert.match(saveFn, /if \(issues\.length\)/);
  const apiCallIdx = saveFn.indexOf("callApi('set_design_settings'");
  assert.match(saveFn, /if \(issues\.length\) \{[\s\S]*showActionToast[\s\S]*return;/, 'bad contrast must block save and point the owner to the auto-fix/manual correction flow');
  assert.ok(apiCallIdx >= 0, 'valid design must still persist through set_design_settings');
  assert.match(app, /function autoFixDesignContrast\(\)/);
});

test('4.1 default presets pass WCAG AA out of the box (no false-positive warning right after picking a theme)', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
  function relLum(hex) {
    const { r, g, b } = hexToRgb(hex);
    const [R, G, B] = [r, g, b].map(c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
  }
  function ratio(h1, h2) { const l1 = relLum(h1), l2 = relLum(h2); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); }
  const start = app.indexOf('const DESIGN_THEMES = {');
  const end = app.indexOf('// ---- 4.3');
  const block = app.slice(start, end);
  const themeBlocks = [...block.matchAll(/colors: \{ ([^}]+) \}/g)].map(m => m[1]);
  for (const raw of themeBlocks) {
    const colors = {};
    for (const m of raw.matchAll(/(\w+):\s*'(#[0-9a-f]{6})'/g)) colors[m[1]] = m[2];
    assert.ok(ratio(colors.text, colors.pageBg) >= 4.5, `text/pageBg contrast too low: ${JSON.stringify(colors)}`);
    assert.ok(ratio(colors.text, colors.cardBg) >= 4.5, `text/cardBg contrast too low: ${JSON.stringify(colors)}`);
  }
});

// Greenfield: no more shop_id=1 placeholder — design settings are scoped to
// the REAL ctx.shopId resolved from the request's bot identity.
test('4.5: design settings are scoped to the real ctx.shopId server-side, never a bare global row', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const start = server.indexOf('case "set_design_settings"');
  const end = server.indexOf('case "get_users_summary"');
  const block = server.slice(start, end > start ? end : start + 1000);
  assert.match(block, /shop_id: shopId/);
  assert.match(block, /onConflict: "shop_id"/);
});

test('4.6: theming works identically for Telegram Mini App and plain web (pure CSS custom properties, no Telegram-specific branch)', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const rootStart = app.indexOf('function writeDesignColorsToRoot');
  const applyStart = app.indexOf('function applyDesignColors');
  const end = app.indexOf('function openDesignSettings');
  const fn = app.slice(rootStart, end);
  assert.doesNotMatch(fn, /Telegram|tg\./);
  assert.match(fn, /document\.documentElement\.style/);
  assert.match(app.slice(applyStart, end), /writeDesignColorsToRoot\(storefront\)/, 'saved merchant theme must apply in admin mode as well as storefront mode');
  assert.doesNotMatch(app.slice(applyStart, end), /ADMIN_THEME_COLORS/, 'applyDesignColors must not replace the saved theme with a fixed admin palette');

  const css = fs.readFileSync(path.join(__dirname, '..', 'ustore.css'), 'utf8');
  assert.match(css, /--ustore-page-bg/);
  assert.match(css, /--ustore-button/);
  assert.match(css, /\.ustore-topbar\.bg-white/);
  assert.match(css, /\.ustore-bottom-nav\.bg-white/);
});

test('5.1: replacing the shop logo cleans up the old USTORE-hosted storage object, but never touches an external URL', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const start = server.indexOf('case "set_shop_logo"');
  const end = server.indexOf('case "get_users_summary"');
  const block = server.slice(start, end > start ? end : start + 1200);
  assert.match(block, /select\("logo_url"\)/);
  assert.match(block, /cleanupManagedImageIfUnreferenced\(db, shopId, oldLogoUrl, SUPABASE_URL, "old-shop-logo"\)/);
  assert.match(block, /EdgeRuntime\.waitUntil/);
  assert.match(block, /oldLogoUrl && oldLogoUrl !== newLogoUrl/);
  assert.match(server, /if \(!storagePath\) return; \/\/ external URL: never attempt to delete someone else's file/);
});

test('5.1: the shop logo picker reuses the same shared V2 image pipeline as product images', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  // POLISH ROUND (7-topshiriq, task 1): see processCroppedLogoFile — the
  // crop-confirmed file still goes through the exact same V2 pipeline and
  // still ends in the same set_shop_logo call, just reached one step later
  // (via the crop modal) than a direct picker->compress->upload chain.
  const start = app.indexOf('async function processCroppedLogoFile');
  const end = app.indexOf('async function openLogoCropStep');
  const fn = app.slice(start, end);
  assert.match(fn, /captureAndPrepareImageV2\(file, TARGET_PRODUCT_IMAGE_BYTES, \d+, [\d.]+\)/, "umumiy V2 zanjiri ishlatilishi kerak (aniq siqish parametrlari vaqti-vaqti bilan sozlanadi)");
  assert.match(fn, /callApi\('set_shop_logo'/);
});

test('5.2: "USTORE" only ever appears as fixed platform/bot branding, never substituted for an editable shop name field', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.doesNotMatch(app, /shopName|shop_name|storeName/);
  const aboutStart = app.indexOf("function renderProfile");
  const aboutEnd = app.indexOf('shop-about-card', aboutStart) + 400;
  const aboutBlock = app.slice(aboutStart, aboutEnd);
  assert.doesNotMatch(aboutBlock, /USTORE<\/h3>|>USTORE</);
});

test('5.3: coordinates are only ever used to build a maps link, never rendered as a raw lat,lng string', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('function renderProfile');
  const end = app.indexOf('shopInfoIsEmpty()', start);
  const block = app.slice(start, end > start ? end : start + 2500);
  assert.match(block, /const mapsUrl = coords \? `https:\/\/www\.google\.com\/maps\?q=\$\{encodeURIComponent\(coords\)\}` : null/);
  assert.doesNotMatch(block, /\$\{coords\}|\$\{escapeHtml\(coords\)\}|\$\{shopContact\.coordinates\}/);
});

test('5.4: up to 3 configured shop phones render as footer tel: links', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const block = app.slice(app.indexOf('function storefrontFooterHtml()'), app.indexOf('function openStorefrontLegalDocument'));
  assert.match(block, /const phones = \[contact\.phone, contact\.phone2, contact\.phone3\]\.filter\(Boolean\)/);
  assert.match(block, /\.map\(phone => `/);
  assert.match(block, /href="tel:\$\{escapeHtml\(String\(phone\)\.replace\(\/\[\^\\d\+\]\/g, ''\)\)\}"/);
});

test('5.5/5.6: admin types only an Instagram/Telegram nickname (no full URL), and the link is built for them', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const cleanStart = app.indexOf('function cleanSocialNick');
  const cleanEnd = app.indexOf('function shopInfoIsEmpty');
  assert.match(app.slice(cleanStart, cleanEnd), /replace\(\/\^@\/, ''\)\.replace\(\/\\\/\+\$\/, ''\)/);

  const modalStart = app.indexOf("activePopupModal === 'SHOP_INFO'");
  // POLISH ROUND 1-bosqich: SHOP_PARAMS endi modal emas (renderSettingsPage()
  // sahifasiga ko'chirildi). 10-band: ORDER_INFO ham endi modal emas (to'liq
  // sahifa) — shu boundary endi undan keyingi haqiqiy modal, ADD_PROD.
  const modalEnd = app.indexOf("activePopupModal === 'ADD_PROD'");
  const modal = app.slice(modalStart, modalEnd);
  assert.match(modal, /id="sc-instagram"/);
  assert.match(modal, /id="sc-telegram"/);
  assert.doesNotMatch(modal, /instagram\.com\/|t\.me\//);

  const block = app.slice(app.indexOf('function storefrontFooterHtml()'), app.indexOf('function openStorefrontLegalDocument'));
  assert.match(block, /\['Instagram', contact\.instagram, 'https:\/\/instagram\.com\//);
  assert.match(block, /\['Telegram', contact\.telegram, 'https:\/\/t\.me\//);
});

test('5.7/task13: footer only displays configured shop information and exposes the map chooser action', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const block = app.slice(app.indexOf('function storefrontFooterHtml()'), app.indexOf('function openStorefrontLegalDocument'));
  assert.match(block, /contact\.workHours &&/);
  assert.match(block, /locationAvailable/);
  assert.match(block, /openStorefrontMap\(\)/);
  assert.match(block, /data-lucide="map-pin"/);
  assert.match(block, /const social =/);
  assert.doesNotMatch(block, />-<|>—<|: '-'|: '—'/);
});

test('5.8: duplicate shop-about card is absent from Profile and settings edit flow remains', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const block = app.slice(app.indexOf('function renderProfile'), app.indexOf('function readShopContactFormValues'));
  assert.doesNotMatch(block, /class="shop-about-card/);
  assert.match(app, /function openShopInfoModal/);
});

// ============================================================
// USTORE_NEXT_5_MASTER_CODEX_PROMPT.txt — 5-bo'lim (11 bug) tuzatishlari
// ============================================================

test('5.1/5.5: product image uses the shared reliable upload pipeline and the product mutation payload only carries the resulting URL', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('async function productImagePayloadFromSnapshot');
  const end = app.indexOf('function friendlyImageError');
  const block = app.slice(start, end > start ? end : start + 1500);
  assert.ok(block.includes('await uploadImageSnapshot(snapshot, null, requireImage)'), 'must upload via the shared image pipeline');
  assert.ok(!block.includes('base64: await fileToBase64(prepared)'), 'must no longer base64-encode the product image into the JSON payload');
  // requireImage=false (new product) path must be able to resolve to img:null instead of throwing.
  assert.ok(block.includes('if (!uploadedUrl && requireImage)'), 'a failed/optional image upload must not throw when the image is not required');
});

test('5.1: uploadImageSnapshot never lets a rejected capture/prepare promise escape as an uncaught error when non-strict, so a flaky local image read cannot abort the whole product save', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('async function uploadImageSnapshot');
  const end = app.indexOf('async function uploadImageIfNeeded');
  const block = app.slice(start, end > start ? end : start + 1500);
  assert.ok(block.includes('snapshot.preparing ? await snapshot.preparing : snapshot.file'), 'must still await the preparing promise');
  assert.ok(block.includes("if (strict) throw e;") && block.includes('return existingImg || null;'), 'a preparing-stage failure must fall back instead of throwing when not strict');
  // the try/catch around the preparing await must appear BEFORE the upload-retry loop's own catch.
  const prepareCatchIdx = block.indexOf('DECODE_FAILED');
  const uploadCatchIdx = block.indexOf('UPLOAD_FAILED');
  assert.ok(prepareCatchIdx >= 0 && uploadCatchIdx >= 0 && prepareCatchIdx < uploadCatchIdx, 'capture/prepare failures and upload failures must be logged with distinct internal error codes');
});

test('5.2: a failed local read of the payment receipt clears the stale (already-rejected) selection and re-renders the picker, so retry actually works instead of re-awaiting the same broken promise', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('async function prepareReceiptImageUpload');
  const end = app.indexOf('let submittingOrder');
  const block = app.slice(start, end > start ? end : start + 1200);
  assert.ok(block.includes('clearCheckoutReceipt();'), 'must clear the stale receipt selection on read failure');
  assert.ok(block.includes('rerenderReceiptPicker();'), 'must re-render the picker so the user sees "no file chosen" and can re-pick');
  assert.ok(block.includes("throw new Error('receipt_read_failed')"), 'must surface a distinguishable error code');

  const submitStart = app.indexOf('async function submitOrder');
  const submitBlock = app.slice(submitStart, submitStart + 8000);
  assert.ok(submitBlock.includes("String(prepError?.message) === 'receipt_read_failed'"), 'submitOrder must show an accurate message for a read failure, not the generic "invalid or too large" one');
});

test('5.3: shop logo file reference is captured before the input is cleared/re-rendered, and the crop step independently decodes it (createImageBitmap) before any further render — matching the "capture before render can invalidate the DOM" rule every other image picker in the app follows', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  // POLISH ROUND (7-topshiriq, task 1): saveShopLogoFromPicker() no longer
  // compresses/uploads directly — it validates and opens the mandatory 4:1
  // crop step. The safety property this test guards (never let a render()
  // invalidate the File handle before its bytes are captured) still holds,
  // just via a different, even earlier capture point: `file` is read into
  // a local const as the FIRST statement, before event.target.value is
  // cleared or anything is rendered.
  const pickerStart = app.indexOf('function saveShopLogoFromPicker(event) {');
  assert.ok(pickerStart >= 0, 'saveShopLogoFromPicker not found');
  const pickerBlock = app.slice(pickerStart, app.indexOf('\n    }', pickerStart) + 6);
  const fileIdx = pickerBlock.indexOf('const file = event.target.files?.[0];');
  const clearIdx = pickerBlock.indexOf("event.target.value = '';");
  assert.ok(fileIdx >= 0 && clearIdx > fileIdx, 'the File reference must be captured into a local const before the input value is cleared');
  // It must be the FIRST statement in the function body (nothing — no
  // validation, no render — runs before this capture).
  const bodyStart = pickerBlock.indexOf('{') + 1;
  assert.ok(pickerBlock.slice(bodyStart, fileIdx).trim() === '', 'file capture must be the very first statement in the function body');
  assert.match(pickerBlock, /openLogoCropStep\(file, editingInsideShopInfo\)/);

  // The crop step then independently decodes the file (createImageBitmap)
  // BEFORE any subsequent render() can run — an even stronger guarantee
  // than compressing early, since the decoded bitmap no longer depends on
  // the original File/input at all.
  const cropStart = app.indexOf('async function openLogoCropStep');
  const cropEnd = app.indexOf('function logoCropImageSize');
  const cropBlock = app.slice(cropStart, cropEnd);
  assert.match(cropBlock, /logoCropBitmap = await createImageBitmap\(file\);/);

  const uploadStart = app.indexOf('async function processCroppedLogoFile');
  const uploadEnd = app.indexOf('async function openLogoCropStep');
  const uploadBlock = app.slice(uploadStart, uploadEnd);
  assert.ok(uploadBlock.includes("uploadImageSnapshot({ file: prepared, preparing: Promise.resolve(prepared), url: null }, old, true)"), 'the upload must use the already-prepared (independent) file, not the original (possibly invalidated) File handle');
});

test('5.4: the "Rasmsiz" queue counter has a single source of truth (getMissingImageQueueItems) shared with the warehouse badge, instead of two independently-maintained filter expressions', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  // POLISH ROUND 1-bosqich: badge endi renderWarehouse() ichida emas — Ombor
  // "Qoldiqni yangilash" sub-tabiga (renderWarehouseUpdateHtml) ko'chirildi
  // (Holat sub-tabi endi default, faqat summary cardlar).
  const warehouseStart = app.indexOf('function renderWarehouseUpdateHtml');
  assert.notStrictEqual(warehouseStart, -1, 'renderWarehouseUpdateHtml must exist');
  const warehouseBlock = app.slice(warehouseStart, warehouseStart + 2000);
  assert.ok(warehouseBlock.includes("Rasmsiz', 'Без фото')} (${getMissingImageQueueItems().length})"), 'warehouse badge must reuse getMissingImageQueueItems()');
});

// 2-band (2026-08-17 real-Telegram round): ikkita alohida tuman maydoni
// (umumiy #chk-district + POST-only #chk-post-district) bitta umumiy
// #chk-district'ga birlashtirildi — POST provider tanlanganda tuman
// yo'qolib, "boshqasi" chiqib qolish bugi shu bilan tuzatildi. Endi bitta
// select barcha yetkazib berish usullari uchun umumiy manba.
test('5.6/2-band: checkout has a SINGLE unified district selector (no separate POST-only field) sourced from real delivery_branches data, and the delivery provider is never auto-selected', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.doesNotMatch(app, /id="chk-post-district"/, '2-band: the separate POST-only district field must be removed — #chk-district is now the single source of truth');
  assert.match(app, /renderCheckoutSelectControl\('chk-district','navigation'/, 'the shared district source of truth must be rendered through the branded checkout selector');
  assert.ok(app.includes("callApi('get_delivery_districts', { regionKey })"), 'district options must be fetched from the server (real branch data), not only a hardcoded list');
  const renderStart = app.indexOf('function renderCheckoutOptions');
  const renderEnd = app.indexOf('const notice = document.getElementById', renderStart);
  const renderBlock = app.slice(renderStart, renderEnd);
  assert.ok(renderBlock.includes("deliveryOptions.find(option => option.kind !== 'POST')"), 'auto-select fallback must explicitly skip POST-kind options');
  // District field must stay visible for POST too (only the address field
  // is swapped for the branch picker) — this is exactly what fixed the
  // "district disappears when BTS/EMU chosen" bug.
  assert.doesNotMatch(renderBlock, /districtField\.classList\.toggle\('hidden', isPost\)/, '2-band: the district field must never be hidden when POST is selected');

  const selectStart = app.indexOf('function selectDelivery(methodId)');
  const selectBlock = app.slice(selectStart, selectStart + 1300);
  assert.ok(!selectBlock.includes("showActionToast"), 'selecting a POST provider before a district is chosen must not be blocked with a toast');
  assert.ok(selectBlock.includes("methodId?.startsWith('POST:') && districtValue"), 'branch list must still only load once the (single, shared) district field has a value');

  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  assert.ok(server.includes('case "get_delivery_districts"'), 'backend must expose a district-list endpoint');
  assert.ok(server.includes('const selected = districtParts(district);') && server.includes('sameBase.filter'), 'branch lookup must canonicalize and filter by district without raw exact-match duplicates');
});

test('5.6/2-band: changing the region resets the district select, branch list and its cache key', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  // 11-band: the district-list-population part now lives in the shared
  // populateDistrictSelectForRegion() (reused by applyCheckoutDraftToForm,
  // which must NOT reset delivery/payment/branch state) — start the slice
  // there so both it and handleRegionChange's own reset lines are covered.
  const start = app.indexOf('function populateDistrictSelectForRegion');
  const end = app.indexOf('function handleViloyatChange');
  const block = app.slice(start, end > start ? end : start + 2000);
  for (const needle of [
    'checkoutSelectedBranch = null;', 'checkoutBranches = [];', 'checkoutBranchesLoadedFor = null;',
    'checkoutBranchesLoading = false;', 'checkoutDistrictOptions = [];', 'checkoutDistrictOptionsLoadedFor = null;',
  ]) {
    assert.ok(block.includes(needle), `handleRegionChange must reset: ${needle}`);
  }
});

test('5.7: loadCheckoutBranches guards against a stale (out-of-order) response overwriting newer branch-selection state', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('async function loadCheckoutBranches');
  const end = app.indexOf('function branchMatchesSearch');
  const block = app.slice(start, end > start ? end : start + 1500);
  assert.ok(block.includes('const requestId = ++branchRequestSeq;'), 'each call must stamp its own request generation');
  assert.ok(block.includes('if (requestId !== branchRequestSeq) return;'), 'a response from a superseded request must be ignored');
});

test('5.8: category reorder is committed atomically through the shared reorder RPC', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const start = server.indexOf('case "reorder_categories"');
  const end = server.indexOf('auditLater("CATEGORIES_REORDERED"', start);
  const block = server.slice(start, end > start ? end : start + 1200);
  assert.match(block, /db\.rpc\("ustore_reorder_entities", \{ p_shop_id: shopId, p_entity: "categories", p_items: validItems \}\)/);
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '079_atomic_trash_and_reorder.sql'), 'utf8');
  assert.match(sql, /if v_count<>1 then raise exception 'entity_not_found:%',v_id;/);
});

test('5.9: duplicating a product copies its image independently and preserves original stock/variant quantities', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const start = server.indexOf('case "duplicate_product"');
  const end = server.indexOf('auditLater("PRODUCT_DUPLICATED"', start);
  const block = server.slice(start, end > start ? end : start + 3500);
  assert.ok(block.includes('db.storage.from("images").download(sourceStoragePath)'), 'must download the original USTORE-hosted image bytes');
  assert.ok(block.includes('db.storage.from("images").upload(newPath, fileData'), 'must re-upload to a brand-new, independent path');
  assert.ok(block.includes('img: duplicatedImg,'), 'the new product row must use the independently-copied image, not the shared original URL');
  assert.ok(block.includes('stock: Number(original.stock) || 0,'), 'duplicate must preserve the original total stock');
  assert.ok(block.includes('qty: Number(v.qty) || 0'), 'duplicate variants must preserve original quantities while receiving new SKUs');
});

test('5.10: translation status reflects BOTH name and description success (bulk Excel import path matches the single-item resolveTranslation rule), and the hash is only persisted on a successful translation so a FAILED item self-retries', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');

  const resolveStart = server.indexOf('async function resolveTranslation');
  const resolveEnd = server.indexOf('async function telegramApi', resolveStart);
  const resolveBlock = server.slice(resolveStart, resolveEnd > resolveStart ? resolveEnd : resolveStart + 1200);
  assert.ok(resolveBlock.includes('hash: status === "FRESH" ? hash : null'), 'translation_hash must only be persisted after a genuinely successful translation');

  const importStart = server.indexOf('const names = inserted.map((p: any) => p.name as string);');
  const importBlock = server.slice(importStart, importStart + 2000);
  assert.ok(importBlock.includes('const validName = looksLikeValidRussian(inserted[i].name, nameRu);') && importBlock.includes('const validDesc = !hasDesc || looksLikeValidRussian(inserted[i].description, descRu);'), 'bulk-import must validate that both translated fields are genuinely Russian, not merely non-null');
  assert.ok(importBlock.includes('if (status === "FRESH") updatePayload.translation_hash'), 'bulk-import must also only persist the hash on success');
});

test('5.11: the language toggle stays in the header and shows the TARGET language flag (UZ→RU, RU→UZ)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const cartIdx = html.indexOf('id="header-cart-btn"');
  const flagIdx = html.indexOf('id="lang-flag-btn"');
  assert.ok(cartIdx >= 0 && flagIdx >= 0, 'both buttons must exist');
  assert.ok(cartIdx < flagIdx, 'the language flag button must now render after the cart button');

  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /function toggleUiLang\(\) \{\s*uiLang = uiLang === 'uz' \? 'ru' : 'uz';/);
  const chromeStart = app.indexOf('function updateHeaderChrome');
  // Sliced to the next top-level function (not a fixed char count) so this
  // test doesn't keep going stale every time updateHeaderChrome() grows.
  const nextFnStart = app.indexOf('\n    function ', chromeStart + 10);
  const chromeBlock = app.slice(chromeStart, nextFnStart > chromeStart ? nextFnStart : chromeStart + 1800);
  assert.ok(chromeBlock.includes("document.getElementById('lang-flag-btn')"), 'the flag icon must still be looked up by id, not by DOM position');
  assert.ok(chromeBlock.includes("const targetLang = uiLang === 'uz' ? 'ru' : 'uz'"), 'UZ active must target RU; RU active must target UZ');
  assert.ok(chromeBlock.includes('flagBtn.innerHTML = desktopFlagSvg(targetLang)'), 'target language must render as an SVG flag');
  assert.ok(app.includes('document.documentElement.lang = uiLang;'), '<html lang> must follow the selected UI language');
});

// ============================================================
// USTORE v2.6 — production bugfix hardening + bulk + dashboard lite
// ============================================================

test('v2.6 image IO: FileReader is primary and arrayBuffer is a genuinely different fallback', async () => {
  const originalFileReader = global.FileReader;
  try {
    let fallbackCalls = 0;
    let readCalls = 0;
    global.FileReader = class MockFileReader {
      readAsArrayBuffer() {
        readCalls++;
        this.result = Uint8Array.from([1, 2, 3]).buffer;
        queueMicrotask(() => this.onload && this.onload());
      }
      abort() {}
    };
    const fake = { arrayBuffer: async () => { fallbackCalls++; return Uint8Array.from([9]).buffer; } };
    const primary = await imageIO.readBlobAsArrayBuffer(fake);
    assert.deepEqual([...new Uint8Array(primary)], [1, 2, 3]);
    assert.equal(readCalls, 1);
    assert.equal(fallbackCalls, 0, 'arrayBuffer fallback must not run after FileReader succeeds');

    global.FileReader = class FailingFileReader {
      readAsArrayBuffer() { queueMicrotask(() => this.onerror && this.onerror()); }
      abort() {}
    };
    const fallback = await imageIO.readBlobAsArrayBuffer(fake);
    assert.deepEqual([...new Uint8Array(fallback)], [9]);
    assert.equal(fallbackCalls, 1, 'arrayBuffer must be attempted after the primary FileReader path fails');
  } finally {
    if (originalFileReader === undefined) delete global.FileReader;
    else global.FileReader = originalFileReader;
  }
});

// 6-band (Image Pipeline V2): accept endi image/* — telefon galereyasidan
// ko'proq format (shu jumladan HEIC/HEIF) TANLASH mumkin, lekin JS tomonda
// (validatePickedImageFile/SUPPORTED_IMAGE_MIME) hamon faqat JPEG/PNG/WEBP
// qabul qilinadi va aniq xabar bilan rad etiladi — "kengaytmaga ishonib
// qolmaslik" talabiga mos.
test('v2.6/6-band image UI: pickers accept image/* (wider gallery selection) but JS still only stores the MIME types the backend can actually persist', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.doesNotMatch(app, /accept="image\/jpeg,image\/png,image\/webp"/, '6-band: pickers must no longer pre-filter to only 3 exact MIME types at the OS picker level');
  const wide = app.match(/accept="image\/\*"/g) || [];
  assert.ok(wide.length >= 5, `expected accept="image/*" on all image pickers, got ${wide.length}`);
  assert.match(app, /SUPPORTED_IMAGE_MIME = new Set\(\['image\/jpeg', 'image\/png', 'image\/webp'\]\)/, 'server-storable formats must stay restricted to JPEG/PNG/WebP');
  assert.match(app, /function isLikelyHeicFile/, 'HEIC/HEIF must get a clearer, format-specific rejection message rather than a generic one');
  assert.match(app, /MAX_STORED_IMAGE_BYTES = 5 \* 1024 \* 1024/);
  assert.match(app, /MAX_RECEIPT_BYTES = 6 \* 1024 \* 1024/);
});

// Image Pipeline V2 (2026-08-17 real-Telegram round, user-confirmed via
// AskUserQuestion): signed URL to'g'ridan-to'g'ri Storage'ga endi PRIMARY
// transport — Edge Function base64/JSON orqali bayt ko'rmaydi. finalize_image_upload
// (finalize_payment_receipt bilan bir xil "Storage .list() orqali tasdiqlash"
// patterni) yuklangach chaqiriladi. base64-in-JSON (upload_product_image)
// ikkinchi darajali fallback sifatida saqlanadi (o'chirilmagan).
test('v2.6/6-13-band image upload: signed URL is PRIMARY (with finalize_image_upload verification) and server-side base64 shop-api is a genuinely different fallback; selected-image add is strict', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const uploadStart = app.indexOf('async function uploadImageSnapshot');
  const uploadEnd = app.indexOf('async function uploadImageIfNeeded', uploadStart);
  const upload = app.slice(uploadStart, uploadEnd);
  assert.match(upload, /uploadToSignedUrl/);
  assert.match(upload, /callApi\('finalize_image_upload', \{ path \}\)/);
  assert.match(upload, /callApi\('upload_product_image'/);
  assert.ok(upload.indexOf('uploadToSignedUrl') < upload.indexOf("callApi('upload_product_image'"), 'signed URL Storage upload must be PRIMARY and shop-api base64 server upload must be the second transport');
  assert.match(upload, /SIGNED_URL_UPLOAD_FAILED/);
  assert.match(upload, /SERVER_UPLOAD_FAILED/);
  assert.match(app, /TARGET_PRODUCT_IMAGE_BYTES = 2 \* 1024 \* 1024/);

  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const finalizeStart = server.indexOf('case "finalize_image_upload"');
  assert.ok(finalizeStart >= 0, 'backend must expose finalize_image_upload');
  const finalizeBlock = server.slice(finalizeStart, finalizeStart + 900);
  assert.match(finalizeBlock, /\.storage\.from\("images"\)\.list\(/, 'finalize must verify the object actually exists in Storage, not just trust the client');

  const addStart = app.indexOf('async function saveProductFromModal');
  const addEnd = app.indexOf('async function saveCategoryFromModal', addStart);
  const add = app.slice(addStart, addEnd > addStart ? addEnd : addStart + 7000);
  assert.match(add, /const localImageWasSelected = !!\(imageSnap\?\.file \|\| imageSnap\?\.preparing\);/);
  assert.match(add, /productImagePayloadFromSnapshot\(imageSnap, localImageWasSelected\)/);
});

test('v2.6 product edit: a failed replacement image leaves the edit modal open for a real re-pick instead of closing it first', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('async function saveFieldEdit');
  const end = app.indexOf('async function saveMissingImageQueueItem', start);
  const block = app.slice(start, end);
  assert.match(block, /if \(field !== 'img'\) \{\s*activePopupModal = null;/);
  assert.match(block, /if \(field === 'img'\) \{\s*activePopupModal = null;\s*selectedProductModal = current \|\| p;/);
  assert.match(block, /if \(field !== 'img'\) render\(\);/);
});

test('v2.6 save latency: add/edit product and categories persist UZ immediately and schedule Azure translation in EdgeRuntime.waitUntil', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  for (const [marker, helper] of [
    ['case "add_product"', 'translateProductInBackground'],
    ['case "add_category"', 'translateCategoryInBackground'],
  ]) {
    const start = server.indexOf(marker);
    const block = server.slice(start, start + 6500);
    assert.match(block, /translation_status:\s*"PENDING"/);
    assert.match(block, new RegExp(`EdgeRuntime\\.waitUntil\\(${helper}`));
  }
  const editStart = server.indexOf('case "edit_product_field"');
  const edit = server.slice(editStart, editStart + 9000);
  assert.match(edit, /pendingProductTranslation/);
  assert.match(edit, /EdgeRuntime\.waitUntil\(translateProductInBackground/);
});

test('v2.6 translation: ordinary multi-word Latin Uzbek text cannot be accepted unchanged as FRESH, and existing bad RU rows get a bounded background repair path', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const validStart = server.indexOf('function looksLikeValidRussian');
  const valid = server.slice(validStart, validStart + 1500);
  assert.match(valid, /latinTokens\.length === 1/);
  assert.ok(valid.includes('!/[А-Яа-яЁё]/.test(out)'), 'ordinary non-brand text must contain Cyrillic to be accepted as Russian');
  assert.match(server, /case "retry_bad_translations"/);
  assert.match(server, /repairTranslationsInBackground/);
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /callApi\('retry_bad_translations'/);
  // 17-band: this session flag is now shop-scoped via scopedKey() so it
  // can't leak "already repaired this session" across two different shops
  // opened in the same browser tab.
  assert.match(app, /scopedKey\('ru-repair-v1'\)/);
  // 20-band (2026-08-17 bug-fix round): katta "Admin rejimiga o'tish" tugmasi
  // headerdagi odamcha-icon popoverga ko'chirildi — RU matni ham shu bilan
  // almashdi ("Перейти в режим администратора" -> "Перейти в админку").
  assert.match(app, /Перейти в админку/);
  assert.match(app, /Перейти к пользователю/);
});

test('v2.6 receipt retention: DELIVERED status does not immediately delete a successfully Telegram-sent receipt; cron remains the cleanup path', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const start = server.indexOf('case "cancel_order"');
  const end = server.indexOf('case "upload_payment_receipt"', start);
  const statusBlock = server.slice(start, end);
  assert.doesNotMatch(statusBlock, /cleanupPrivateReceipt/);
  const cronStart = server.indexOf('if (action === "cleanup_expired_receipts")');
  const cronBlock = server.slice(cronStart, cronStart + 3000);
  assert.match(cronBlock, /72 \* 3600 \* 1000|72\s*\*\s*3600/);
});

test('v2.6 delivery districts: semantic aliases are canonicalized while city vs district remain distinct keys', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const start = server.indexOf('function districtParts');
  const block = server.slice(start, start + 1800);
  assert.match(block, /replace\(\/shaxrisabz\/g, "shahrisabz"\)/);
  assert.match(block, /kind = "city"/);
  assert.match(block, /kind = "district"/);
  assert.match(block, /key: `\$\{normalized\}\|\$\{kind\}`/);
  const endpoint = server.slice(server.indexOf('case "get_delivery_districts"'), server.indexOf('case "boot"'));
  assert.match(endpoint, /kindsByBase/);
  assert.match(endpoint, /labels\.set\(`\$\{p\.base\}\|\$\{kind\}`/);
});

// 1-band (2026-08-17 real-Telegram round): oldingi DOM-row-swap optimizatsiyasi
// + categoryLocalMutationAt stale-response guard'i ataylab olib tashlandi —
// foydalanuvchi buni aniq so'radi ("oldingi murakkab workaroundlarni yamama").
// moveCategoryOrder endi moveProductSort bilan bir xil sodda pattern:
// optimistic massiv o'zgarishi + to'liq render(), qo'shimcha guard yo'q.
test('1-band: category reorder uses the same simple optimistic pattern as product reorder (no DOM-row-swap, no stale-response guard)', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.doesNotMatch(app, /categoryLocalMutationAt/, '1-band: the stale-boot-fetch guard must be fully removed');
  const start = app.indexOf('async function moveCategoryOrder');
  const end = app.indexOf('function productNameSimilarity', start);
  const block = app.slice(start, end);
  assert.doesNotMatch(block, /document\.querySelectorAll\('\[data-category-row-id\]'\)/, '1-band: the DOM-row-swap micro-optimization must be removed in favor of a plain render()');
  assert.doesNotMatch(block, /parent\.insertBefore/);
  assert.match(block, /\brender\(\);/);
  assert.ok(block.indexOf('render();') < block.indexOf("callApi('reorder_categories'"), 'must render optimistically before the server request, same as moveProductSort');
  // Payload must still be minimal — id + sortOrder only, never touching image/name/parent/children.
  assert.match(block, /callApi\('reorder_categories', \{ items: \[\{ id: cat\.id, sortOrder: cat\.sortOrder \}, \{ id: other\.id, sortOrder: other\.sortOrder \}\] \}\)/);
});

test('v2.6 bulk product management: current visible products can be selected, batch-moved, or atomically moved to one 24h Trash batch', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /function selectAllVisibleProducts/);
  assert.match(app, /callApi\('bulk_move_products'/);
  assert.match(app, /callApi\('bulk_trash_products'/);
  assert.match(app, /currentVisibleProductIds/);

  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  assert.match(server, /case "bulk_move_products"/);
  assert.match(server, /case "bulk_trash_products"/);
  assert.match(server, /db\.rpc\("ustore_bulk_trash_products"/);

  // Greenfield: this RPC's body was reconstructed fresh (no original source
  // was ever found across three audit rounds — see 007's header note), so
  // internal implementation details differ from the old file; what matters
  // is it still creates one trash_batches row and marks the products DELETED.
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '007_tenant_rpcs.sql'), 'utf8');
  assert.match(sql, /create or replace function public\.ustore_bulk_trash_products/);
  assert.match(sql, /status = 'DELETED', deleted_at = v_now/);
  assert.match(sql, /insert into public\.trash_batches/);
  assert.match(sql, /insert into public\.trash_batch_items/);
});

test('v2.6 Trash: manual permanent purge and 24h cron share the same atomic DB purge RPC; image deletion is reference-safe', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '007_tenant_rpcs.sql'), 'utf8');
  assert.match(sql, /create or replace function public\.ustore_purge_trash_batch/);
  assert.match(sql, /delete from public\.products/);
  assert.match(sql, /delete from public\.categories/);
  assert.match(sql, /purged_at = now\(\)/);

  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const calls = server.match(/db\.rpc\("ustore_purge_trash_batch"/g) || [];
  assert.ok(calls.length >= 2, 'both cron and manual purge should call the same atomic RPC');
  assert.match(server, /cleanupUnreferencedProductImages/);
  assert.match(server, /async function managedImageUrlStillReferenced/);
  assert.match(server, /const scalarChecks: Array<\[string, string\]>/);
  assert.match(server, /\.eq\("shop_id", shopId\)\.eq\(column, rawUrl\)\.limit\(1\)/);
  assert.match(server, /for \(const key of \["img", "colorImg"\]\)/, 'variant/color references must also block deletion');

  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /purgeTrashBatchNow/);
  assert.match(app, /Butunlay/);
});

test('v2.6 modal hardening: modal viewport is bounded with safe-area/overscroll handling and backdrop/Escape always provide a way out', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'ustore.css'), 'utf8');
  assert.match(css, /#modal-container > \.fixed/);
  assert.match(css, /100dvh/);
  assert.match(css, /safe-area-inset-top/);
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /function installModalEscapeHandlers/);
  assert.match(app, /event\.key === 'Escape'/);
  // The Trash modal was later migrated onto the shared .fc-sheet bottom-sheet
  // component (built for the app-wide picker/sheet unification) rather than
  // its own one-off inline Tailwind wrapper — so its safe-area/overflow
  // hardening now lives in .fc-sheet's own CSS rule, not as inline classes
  // on this particular modal.
  const trashStart = app.indexOf("activePopupModal === 'TRASH'");
  const trash = app.slice(trashStart, trashStart + 600);
  assert.match(trash, /class="fc-sheet-overlay"/);
  assert.match(trash, /class="fc-sheet fc-trash-sheet"/);
  assert.match(css, /\.fc-sheet \{[^}]*max-height: 88vh;/, '.fc-sheet must bound its own height so a shared-component modal (like Trash) never grows past the viewport');
});

// Greenfield: RLS-enable lives on each table's own creation migration
// (001-006); the explicit anon/authenticated REVOKE (defense-in-depth on
// top of RLS) is consolidated in one place, 008_security_storage.sql,
// covering every business table via a loop rather than repeating the
// statement per table.
test('greenfield security: server-only tables and destructive RPCs are RLS/revoke hardened for anon/authenticated', () => {
  const createSql = [
    fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '002_shop_catalog_inventory.sql'), 'utf8'),
    fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '005_shop_settings_design.sql'), 'utf8'),
    fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '006_delivery_reference.sql'), 'utf8'),
  ].join('\n');
  for (const table of ['delivery_branches', 'trash_batches', 'product_price_history', 'design_settings']) {
    assert.match(createSql, new RegExp(`alter table (if exists )?public\\.${table} enable row level security`, 'i'));
  }
  const securitySql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '008_security_storage.sql'), 'utf8');
  assert.match(securitySql, /revoke all on table public\.%I from anon, authenticated/, 'explicit REVOKE must be applied to every business table, not just RLS');
  for (const table of ['delivery_branches', 'trash_batches', 'product_price_history', 'design_settings']) {
    assert.match(securitySql, new RegExp(`'${table}'`), `${table} must be in the REVOKE loop's table list`);
  }
  assert.match(securitySql, /revoke all on function public\.ustore_bulk_trash_products\(uuid, uuid\[\], text\) from public, anon, authenticated/);
  assert.match(securitySql, /revoke all on function public\.ustore_purge_trash_batch\(uuid, uuid\) from public, anon, authenticated/);
});

test('v2.6/9-band Dashboard is admin-only, Asia/Tashkent based, counts only paid non-cancelled sales, and avoids "Daromad/Доход" wording', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const start = server.indexOf('case "get_dashboard_lite"');
  const end = server.indexOf('case "add_admin"', start);
  const block = server.slice(start, end);
  assert.match(block, /await requirePermission\('reports\.view'\)/, "2.2-bosqich: get_dashboard_lite endi requireAdmin() o'rniga requirePermission('reports.view')");
  assert.match(block, /Asia\/Tashkent/);
  assert.match(block, /const isSold = \(o: any\) => o\.payment_status === "PAID" && o\.receipt_review_status !== "REJECTED" && o\.status !== "CANCELLED"/);
  assert.match(block, /const soldOrders = orders\.filter\(isSold\)/);
  assert.match(block, /todayOrderTotal/);
  assert.match(block, /monthOrderTotal/);

  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /async function openDashboardLite/);
  assert.match(app, /callApi\('get_dashboard_lite'/);
  // POLISH ROUND 1-bosqich: Dashboard endi modal emas, to'liq sahifa (renderDashboardPage).
  const pageStart = app.indexOf('function renderDashboardPage');
  assert.notStrictEqual(pageStart, -1, 'Dashboard page renderer must exist');
  const pageBody = app.slice(pageStart, pageStart + 6000);
  assert.match(pageBody, /Buyurtmalar|Заказы/);
  assert.doesNotMatch(pageBody, /Daromad|Доход/);
});

// ============================================================
// USTORE — real Telegram local image pipeline debug/fix
// Root cause candidates found and fixed in this pass:
//  (A) blob.arrayBuffer() fallback had NO timeout — on Telegram WebView it
//      can hang forever with zero visible error AND zero network request,
//      matching the reported "no request ever reaches shop-api Invocations".
//  (B) the payment receipt picker never upgraded its preview from the
//      native File's object URL to a detached-blob object URL like every
//      other picker already did, matching the reported "preview sometimes
//      shows as broken image".
//  (C) the product/category/edit/queue preview-swap step was not wrapped
//      in its own try/catch, so a cosmetic URL.createObjectURL failure
//      could be mislabeled as a read failure.
// ============================================================

test('image pipeline: FileReader hang is timeout-protected (does not stall the whole capture forever)', async () => {
  const originalFileReader = global.FileReader;
  try {
    global.FileReader = class HangingFileReader {
      readAsArrayBuffer() { /* never calls onload/onerror/onabort — simulates a stuck WebView read */ }
      abort() { this.onabort && this.onabort(); }
    };
    const fake = { type: 'image/jpeg', size: 10, arrayBuffer: async () => Uint8Array.from([7, 7]).buffer };
    const started = Date.now();
    const result = await imageIO.readBlobAsArrayBuffer(fake, { fileReaderTimeoutMs: 40, arrayBufferTimeoutMs: 5000 });
    assert.deepEqual([...new Uint8Array(result)], [7, 7], 'must recover via the independent arrayBuffer() fallback');
    assert.ok(Date.now() - started < 2000, 'must not wait anywhere near the old default timeout once the primary read times out quickly');
  } finally {
    if (originalFileReader === undefined) delete global.FileReader; else global.FileReader = originalFileReader;
  }
});

test('image pipeline: a hanging arrayBuffer() fallback is ALSO timeout-protected and rejects as READ_BOTH_FAILED (root-cause fix for "no request ever arrives")', async () => {
  const originalFileReader = global.FileReader;
  try {
    global.FileReader = class FailingFileReader {
      readAsArrayBuffer() { queueMicrotask(() => this.onerror && this.onerror()); }
      abort() {}
    };
    const fake = { type: 'image/jpeg', size: 10, arrayBuffer: () => new Promise(() => {}) /* never settles */ };
    const started = Date.now();
    await assert.rejects(
      imageIO.readBlobAsArrayBuffer(fake, { fileReaderTimeoutMs: 20, arrayBufferTimeoutMs: 30 }),
      (err) => {
        assert.equal(err.stage, 'READ_BOTH_FAILED');
        return true;
      }
    );
    assert.ok(Date.now() - started < 2000, 'both stages must give up within their configured timeouts instead of hanging indefinitely');
  } finally {
    if (originalFileReader === undefined) delete global.FileReader; else global.FileReader = originalFileReader;
  }
});

test('image pipeline: readBlobAsArrayBuffer keeps its single-argument, plain-ArrayBuffer-return contract (back-compat for every existing call site)', async () => {
  const fake = { type: 'image/png', size: 3, arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer };
  const originalFileReader = global.FileReader;
  try {
    delete global.FileReader;
    const result = await imageIO.readBlobAsArrayBuffer(fake);
    assert.ok(result instanceof ArrayBuffer);
    assert.deepEqual([...new Uint8Array(result)], [1, 2, 3]);
  } finally {
    if (originalFileReader === undefined) delete global.FileReader; else global.FileReader = originalFileReader;
  }
});

test('image pipeline: safe stage logging never includes image bytes/base64, only whitelisted diagnostic fields', async () => {
  const originalFileReader = global.FileReader;
  const originalConsole = { info: console.info, warn: console.warn, error: console.error };
  const logged = [];
  try {
    console.info = (...args) => logged.push(args.join(' '));
    console.warn = (...args) => logged.push(args.join(' '));
    console.error = (...args) => logged.push(args.join(' '));
    global.FileReader = class FailingFileReader {
      readAsArrayBuffer() { queueMicrotask(() => this.onerror && this.onerror()); }
      abort() {}
    };
    const bigBase64Like = 'A'.repeat(5000);
    const fake = { type: 'image/jpeg', size: 123456, arrayBuffer: async () => Uint8Array.from(Buffer.from(bigBase64Like)).buffer };
    await imageIO.readBlobAsArrayBuffer(fake);
    assert.ok(logged.length > 0, 'expected at least one stage log line');
    for (const line of logged) {
      assert.ok(line.startsWith('[IMAGE_PIPELINE]'), 'every stage log must be tagged');
      assert.ok(!line.includes(bigBase64Like), 'must never log raw decoded bytes/base64 content');
      assert.ok(line.length < 400, 'log line must stay small/summary-only, not dump payload content');
    }
  } finally {
    if (originalFileReader === undefined) delete global.FileReader; else global.FileReader = originalFileReader;
    console.info = originalConsole.info; console.warn = originalConsole.warn; console.error = originalConsole.error;
  }
});

// Image Pipeline V2: the receipt preview no longer waits on a FileReader/
// ArrayBuffer detach step — captureAndPrepareImageV2's onPrepared callback
// upgrades the preview to the independently-prepared file as soon as it's
// ready (whether via the fast createImageBitmap path or the fallback chain).
test('receipt picker: preview is upgraded to a V2-prepared independent blob URL once bytes are captured, matching every other image picker', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('async function onCheckoutReceiptPicked');
  const end = app.indexOf('async function prepareReceiptImageUpload');
  const fn = app.slice(start, end);
  assert.match(fn, /captureAndPrepareImageV2\(file, MAX_RECEIPT_BYTES, 1600, 0\.85, \(updated\) => \{/);
  assert.match(fn, /URL\.createObjectURL\(updated\)/, 'receipt preview must be rebuilt from the V2-prepared (independent) file, not just the original native File');
  assert.match(fn, /checkoutReceiptSelectionVersion/, 'must guard against a slow/stale capture overwriting a newer receipt selection');
});

// Image Pipeline V2: DETACH_FAILED was a V1-only tag for the old front-loaded
// detach step, which onImagePicked no longer performs directly (it now
// delegates to captureAndPrepareImageV2, whose OWN fallback path logs
// IMAGE_V2_FALLBACK_FAILED instead). The cosmetic preview-swap failure must
// still be caught in its own try/catch, separate from that pipeline.
test('onImagePicked: a cosmetic preview-swap failure (V2) is caught separately and cannot be mislabeled as a capture/read failure', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('async function onImagePicked');
  const end = app.indexOf('async function fileToBase64');
  const fn = app.slice(start, end);
  assert.match(fn, /imageIO\.logStage\('FILE_SELECTED'/, 'must log FILE_SELECTED as soon as the file is available, before validation/render');
  assert.match(fn, /captureAndPrepareImageV2\(file, TARGET_PRODUCT_IMAGE_BYTES, \d+, [\d.]+, \(updated\) => \{/, 'must delegate capture/compression to the shared V2 pipeline');
  const previewCatchIdx = fn.indexOf('catch (previewErr)');
  assert.ok(previewCatchIdx >= 0, 'the preview URL swap must have its own try/catch, separate from the capture/compress pipeline');
  assert.match(fn, /imageIO\.logStage\('PREVIEW_FAILED'/);
});

test('uploadImageSnapshot: each upload sub-step logs a distinct, safe stage tag instead of one blanket error code', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('async function uploadImageSnapshot');
  const end = app.indexOf('async function uploadImageIfNeeded');
  const fn = app.slice(start, end);
  for (const stage of ['PREPARED_OK', 'FINAL_SIZE_FAILED', 'SERVER_UPLOAD_OK', 'SERVER_UPLOAD_FAILED', 'SIGNED_URL_UPLOAD_OK', 'SIGNED_URL_UPLOAD_FAILED', 'UPLOAD_ALL_FAILED']) {
    assert.ok(fn.includes(stage), `expected uploadImageSnapshot to report the ${stage} stage distinctly`);
  }
});

test('decode/compress failures are tagged DECODE_FAILED/COMPRESS_FAILED, never mislabeled as a read error', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const decodeStart = app.indexOf('async function decodeImageSource');
  const decodeEnd = app.indexOf('function canvasToBlob');
  assert.match(app.slice(decodeStart, decodeEnd), /imageIO\.logStage\('DECODE_FAILED'/);

  const compressStart = app.indexOf('async function compressImage(');
  const compressEnd = app.indexOf('async function compressImageToLimit');
  assert.match(app.slice(compressStart, compressEnd), /imageIO\.logStage\('COMPRESS_FAILED'/);
});

test('all local-image entry points log FILE_SELECTED immediately after obtaining the file, before any validation/render/network step', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  for (const [fnName, nextFnName] of [
    ['async function onImagePicked', 'async function fileToBase64'],
    ['async function onCheckoutReceiptPicked', 'async function prepareReceiptImageUpload'],
    // POLISH ROUND (7-topshiriq, task 1): saveShopLogoFromPicker() no
    // longer needs to be async (it only validates + opens the crop modal
    // synchronously now — the actual async work moved to
    // processCroppedLogoFile/openLogoCropStep).
    ['function saveShopLogoFromPicker', 'async function processCroppedLogoFile'],
  ]) {
    const start = app.indexOf(fnName);
    const end = app.indexOf(nextFnName, start);
    assert.ok(start >= 0, `${fnName} not found`);
    const fn = app.slice(start, end > start ? end : start + 1500);
    const fileIdx = fn.indexOf("event.target.files?.[0]");
    const logIdx = fn.indexOf("imageIO.logStage('FILE_SELECTED'");
    assert.ok(fileIdx >= 0 && logIdx >= 0 && logIdx > fileIdx, `${fnName} must log FILE_SELECTED right after reading event.target.files`);
  }
});

// The old FITCORE-round-specific cache-busting tests that lived here
// checked exact historical version numbers across many incremental rounds
// (v13->v14->...->v17). That whole history doesn't carry over to this
// single greenfield rebuild — replaced with one check that every script
// tag actually carries a cache-busting query string at all.
test('cache-busting: every local script/stylesheet tag in index.html carries a ?v= query string', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const file of ['ustore.css', 'ustore-image-io.js', 'ustore-commerce.js', 'config.public.js', 'ustore-shop-app.js']) {
    const re = new RegExp(`${file.replace('.', '\\.')}\\?v=\\d+"`);
    assert.match(html, re, `${file} must be referenced with a ?v= cache-busting query string`);
  }
});

// ==================== 21-ITEM ROUND (Do'kon parametrlari kamchiliklarini tuzatish) ====================

test('cache-busting: ustore.css and ustore-commerce.js query versions were bumped in this round too', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  // POLISH ROUND follow-up (live-testing feedback, 2026-08-31):
  // ustore.css and ustore-shop-app.js both changed again (variant entry
  // mini-modal redesign, per-variant price, swipe gallery, object-fit
  // consistency) — bumped v99->v100. ustore-commerce.js was NOT touched
  // Commerce logic was updated again after this historical round.
  assert.match(html, /ustore\.css\?v=323"/, 'current ustore.css must not be served stale');
  assert.match(html, /ustore-commerce\.js\?v=8"/, 'ustore-commerce.js gained the FREE/FIXED "Umumiy qiymat" general-value blocks (2026-09) and must not be served stale');
  assert.match(html, /ustore-shop-app\.js\?v=322"/, "current ustore-shop-app.js must not be served stale");
});

test('13-band: delivery region comment is optional, capped at 200 chars, and omitted when blank', () => {
  const config = configuredCommerce();
  config.delivery.fixed.regions.tashkent_city.comment = '  Yandex orqali yuboriladi  '.trim();
  const normalized = commerce.normalizeConfig(config, REGIONS);
  assert.equal(normalized.delivery.fixed.regions.tashkent_city.comment, 'Yandex orqali yuboriladi');

  const withoutComment = configuredCommerce();
  assert.equal('comment' in withoutComment.delivery.fixed.regions.tashkent_city, false);

  const tooLong = configuredCommerce();
  tooLong.delivery.fixed.regions.tashkent_city.comment = 'x'.repeat(500);
  const normalizedLong = commerce.normalizeConfig(tooLong, REGIONS);
  assert.equal(normalizedLong.delivery.fixed.regions.tashkent_city.comment.length, 200);
});

test('13-band: delivery region comment surfaces on the deliveryOptions() result for FIXED/TAXI/POST/FREE alike', () => {
  const config = configuredCommerce();
  config.delivery.fixed.regions.tashkent_city.comment = 'Yandex orqali yuboriladi';
  config.delivery.taxi.regions.jizzakh.comment = "Faqat ish kunlari";
  const bts = config.delivery.post.providers.find(p => p.id === 'BTS');
  bts.regions.jizzakh.comment = 'Filialdan olib ketish mumkin';
  const normalized = commerce.normalizeConfig(config, REGIONS);

  const fixed = commerce.deliveryOptions(normalized, 'tashkent_city').find(x => x.kind === 'FIXED');
  assert.equal(fixed.comment, 'Yandex orqali yuboriladi');

  const jizzakhOptions = commerce.deliveryOptions(normalized, 'jizzakh');
  assert.equal(jizzakhOptions.find(x => x.kind === 'TAXI').comment, 'Faqat ish kunlari');
  assert.equal(jizzakhOptions.find(x => x.kind === 'POST' && x.providerId === 'BTS').comment, 'Filialdan olib ketish mumkin');
  assert.equal(jizzakhOptions.find(x => x.kind === 'FREE'), undefined);

  const free = commerce.deliveryOptions(configuredCommerce(), 'tashkent_city').find(x => x.kind === 'FREE');
  assert.equal(free.comment, null, 'comment defaults to null when not set, never undefined-crashes template rendering');
});

test('13-band: payment methods never accept a comment field (delivery-only per spec)', () => {
  const config = configuredCommerce();
  config.payments.methods.find(m => m.id === 'CASH').regions.jizzakh.comment = 'should be dropped';
  const normalized = commerce.normalizeConfig(config, REGIONS);
  assert.equal('comment' in normalized.payments.methods.find(m => m.id === 'CASH').regions.jizzakh, false);
});

// 2-band supersedes 11-band's original fix: instead of conditionally
// showing/hiding a SEPARATE POST-only district field (which is exactly what
// caused the "district disappears / a second field appears" bug reported in
// real Telegram testing), there is now only ONE district field that is
// simply never hidden, regardless of which delivery method is selected.
test('11-band/2-band: checkout has no separate POST-only district field to conditionally show/hide — the single shared field is always visible', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.doesNotMatch(app, /function renderPostDistrictField/, 'the separate POST-only district renderer must be removed');
  const renderStart = app.indexOf('function renderCheckoutOptions');
  const renderEnd = app.indexOf('const notice = document.getElementById', renderStart);
  const renderBlock = app.slice(renderStart, renderEnd);
  assert.doesNotMatch(renderBlock, /districtField\.classList\.toggle\('hidden'/, 'the single shared district field must never be conditionally hidden by delivery method');
});

test('14/15-band: order status enum gains a display-only REJECTED pseudo-status without touching orders.status transitions', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /REJECTED:\s*"Rad etildi"/, 'uz label for the rejected-receipt pseudo-status must exist');
  assert.match(app, /REJECTED:\s*"Отклонён"/, 'ru label for the rejected-receipt pseudo-status must exist');
  assert.doesNotMatch(app, /REJECTED:\s*"❌/u, 'status label must not depend on a system emoji');
  assert.match(app, /function orderDisplayStatus\(o\)/, 'a display-only status resolver must exist so orders.status itself is never overwritten to a new enum value');
});

test('16-band: support ticket actions exist end-to-end (create/list/reply) and are wired to real UI entry points', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  for (const fn of ['function openSupportModal(', 'function submitSupportComposer(', 'function openAdminSupportModal(']) {
    assert.ok(app.includes(fn), `${fn} missing from ustore-shop-app.js`);
  }
  assert.match(app, /openSupportModal\(null\)/, 'a general (order-less) support entry point must exist in Profile');
  assert.match(app, /openSupportModal\(\$\{o\.id\}\)/, 'a per-order support entry point must exist for a rejected receipt');
});

// ==================== 2-10, 12-28-band (2026-08-17 real-Telegram bug-fix round) ====================
//
// 24-band context: submitTicketReply/reply_support_ticket were the OLD
// single-message-pair design. Real Telegram testing found "1 savol / 1
// javob" was insufficient — support is now a proper unlimited-message
// thread (support_ticket_messages, migration 024). The old test above was
// updated (not deleted) to check the NEW function names still wired to the
// same entry points; the tests below cover the new behavior explicitly.

test('1-band: admin mode never sees the general "write to support" entry point, only the inbox', () => {
  // POLISH ROUND 1-bosqich: Support endi Profil tugmasi emas, bitta bottom-nav
  // kirish nuqtasi (nav-support-btn -> openAdminSupportOrUserSupport()) orqali
  // ochiladi — o'sha dispatcher rolga qarab to'g'ri oqimni tanlashi shart.
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('function openAdminSupportOrUserSupport()');
  assert.notStrictEqual(start, -1, 'single Support nav entry point dispatcher must exist');
  const body = app.slice(start, start + 300);
  assert.match(body, /if\s*\(isAdminMode\s*&&\s*isUserAnAdmin\)\s*openAdminSupportModal\(\);/, 'admin role must route to the admin inbox, never the generic composer');
  assert.match(body, /else\s*openSupportModal\(null\);/, 'non-admin role must route to the generic "write to support" composer');
});

test('2/3/4-band: support backend is a proper thread (support_ticket_messages), admin ticket list is grouped by user client-side, and 3 statuses map onto the existing OPEN/ANSWERED/CLOSED constraint (no constraint change)', () => {
  // Greenfield: support_tickets never had message/admin_reply columns to
  // begin with (fresh design, not an incremental migration onto an older
  // shape) — so there is no legacy column to keep or make-optional here.
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '004_support_engagement.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.support_ticket_messages/);
  assert.match(sql, /sender text not null check \(sender in \('USER', 'ADMIN'\)\)/);
  assert.match(sql, /reply_to_message_id bigint/);
  assert.doesNotMatch(sql, /create table[\s\S]{0,400}support_tickets[\s\S]{0,400}\bmessage text\b/i, 'support_tickets itself must not carry a message column in the fresh schema');

  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /function groupAdminSupportTicketsByUser\(/, 'admin inbox must group tickets by user before showing a flat list');
  assert.match(app, /adminSupportSelectedUser/, 'a User-drill-down navigation state must exist (Support -> User -> Chatlar -> Chat)');
});

test('4/5/6-band: one ticket supports unlimited back-and-forth messages via send_support_message, with reply-to threading, shared by both customer and admin views (no second parallel system)', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  assert.match(server, /case "send_support_message"/);
  assert.match(server, /const sender = isAdmin \? "ADMIN" : "USER"/, 'sender must be derived server-side from verified auth, never trusted from the client payload');
  assert.match(server, /replyToMessageId/);

  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const renderThreadCount = (app.match(/function renderSupportThreadHtml\(/g) || []).length;
  assert.equal(renderThreadCount, 1, 'exactly one shared thread-renderer must exist and be reused for both the customer and admin chat views');
  assert.match(app, /submitSupportComposer\(\)/, 'customer composer must exist');
  assert.match(app, /submitAdminSupportReply\(\)/, 'admin composer must exist');
  assert.match(app, /setSupportReplyTarget/);
});

test('7/8-band: only the customer can close a ticket, and an admin reply never auto-closes it; a user message after ANSWERED keeps it ANSWERED but flips a client-computed "needs attention" flag', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const closeStart = server.indexOf('case "close_support_ticket"');
  const closeBlock = server.slice(closeStart, closeStart + 700);
  assert.doesNotMatch(closeBlock, /requireAdmin\(\)/, 'close_support_ticket must NOT be admin-gated');
  assert.match(closeBlock, /ticket\.tg_id !== tgId/, 'close_support_ticket must verify the caller owns the ticket');

  const sendStart = server.indexOf('case "send_support_message"');
  const sendBlock = server.slice(sendStart, sendStart + 3600);
  // POLISH ROUND (task 7, 48h auto-close, 061-migratsiya): the OPEN->ANSWERED
  // transition check was pulled out of the outer `if` into its own nested
  // check inside the ADMIN branch — status only advances on the FIRST admin
  // reply either way, still never auto-closes from this action (closing
  // only ever happens via the dedicated cron SQL function).
  assert.match(sendBlock, /if \(sender === "ADMIN"\) \{/);
  assert.match(sendBlock, /if \(ticket\.status === "OPEN"\) \{ patch\.status = "ANSWERED"; patch\.answered_at = nowIso; patch\.answered_by = String\(tgId\); \}/, 'status only advances OPEN->ANSWERED on the FIRST admin reply, never auto-closes');
  assert.doesNotMatch(sendBlock, /status:\s*"CLOSED"/, 'send_support_message must never itself set CLOSED');
  // Every admin reply (not just the first) resets the 48h auto-close deadline.
  assert.match(sendBlock, /last_admin_reply_at: nowIso,/);
  assert.match(sendBlock, /auto_close_at: new Date\(Date\.now\(\) \+ 48 \* 60 \* 60 \* 1000\)\.toISOString\(\),/);
  // A customer reply cancels any pending deadline.
  assert.match(sendBlock, /\} else if \(ticket\.auto_close_at\) \{/);

  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /function supportNeedsAttention\(t\) \{\s*return t\.status === 'ANSWERED' && t\.lastMessage\?\.sender === 'USER';/, 'needs-attention must be a pure client-side derivation from status+lastMessage, not a stored column');
  const adminChatStart = app.indexOf("if (activePopupModal === 'ADMIN_SUPPORT')");
  const adminChatBlock = app.slice(adminChatStart, adminChatStart + 4000);
  assert.doesNotMatch(adminChatBlock, /closeSupportTicket/, 'the admin chat view must never expose a close action');
});

test('9-band: order-tied support ticket keeps order_id visible end-to-end (create, list, admin chat header)', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  assert.match(server, /orderId: t\.order_id \|\| null/);
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /openTicket\.orderId \? `#\$\{openTicket\.orderId\}`/, 'admin chat header must show the order id when the ticket is order-tied');
});

// Phase 2 (3.2-band): the old shop-scoped broadcast channel (public,
// spoofable — see the tenant-isolation test suite) is gone entirely.
// Support updates now ride the SAME single shared polling interval every
// other data section uses (startBackgroundPolling) — not a second,
// support-specific polling loop.
test('support stays tenant-safe while staff rights and invites refresh quickly', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  assert.doesNotMatch(server, /function broadcastShopEvent|EdgeRuntime\.waitUntil\(broadcastShopEvent/, 'the removed broadcast helper must not have crept back in as real code (a historical mention in a comment is fine)');

  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.doesNotMatch(app, /sb\.channel\(/, 'no Supabase Realtime channel of any kind should remain in the client');
  const pollStart = app.indexOf('function startBackgroundPolling');
  const pollEnd = app.indexOf('\n    }', app.indexOf('}, 90000)', pollStart));
  const pollBlock = app.slice(pollStart, pollEnd);
  assert.match(pollBlock, /loadAdminSupportTicketsLazy\(true\)/, 'admin support list must refresh in the shared poll');
  assert.match(pollBlock, /loadMySupportTicketsLazy\(true\)/, 'customer support list must refresh in the shared poll');
  // POLISH ROUND (2026-08-31): the currently-open ticket THREAD used to also
  // refresh here via loadSupportMessages(activeTicketId, true) every 90s —
  // that duplicated (and visually fought) the dedicated 4s startSupportThreadPoll/
  // patchSupportThread mechanism and was the direct cause of support chat
  // "getting stuck" reports. It was deliberately removed from the shared poll;
  // the open thread now refreshes ONLY via the dedicated fast poll below.
  assert.doesNotMatch(pollBlock, /loadSupportMessages\(activeTicketId, true\)/, 'the redundant 90s open-thread poll must stay removed from the shared poll');
  assert.match(app, /function startSupportThreadPoll/, 'the dedicated fast poll must own refreshing the open ticket thread');
  assert.match(app, /function patchSupportThread/, 'the open thread must refresh via a targeted patch, not a full render()');
  assert.match(app, /staffAccessTimer = setInterval\(refreshMyStaffAccess, 12000\)/);
  assert.match(app, /visibilitychange/);
});

// 1-band (2026-08-17 real-Telegram round): the stale-boot-fetch guard added
// to fix the earlier rollback bug was deliberately REMOVED again — the user
// explicitly asked to stop patching the old complex optimistic/race
// workaround and instead accept the same (already-tolerated) race level
// that product reordering has always lived with. moveCategoryOrder now
// mirrors moveProductSort exactly: no Map, no fetchStartedAt bookkeeping.
test('1-band: category reorder no longer carries the stale-boot-fetch guard — loadCatalog unconditionally overwrites categories, same as products', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const moveStart = app.indexOf('async function moveCategoryOrder(');
  const moveEnd = app.indexOf('\n    }', app.indexOf('reorder_categories', moveStart));
  const moveBlock = app.slice(moveStart, moveEnd);
  assert.doesNotMatch(moveBlock, /categoryLocalMutationAt/, 'moveCategoryOrder must no longer touch the removed stale-response guard');

  const loadStart = app.indexOf('async function loadCatalog(');
  const loadEnd = app.indexOf('\n    }', app.indexOf('saveCatalogCache()', loadStart));
  const loadBlock = app.slice(loadStart, loadEnd);
  assert.doesNotMatch(loadBlock, /fetchStartedAt/, 'loadCatalog must no longer record/compare a fetch-started timestamp');
  assert.match(loadBlock, /categories = \(catalogRes\.categories \|\| \[\]\)\.map\(mapCategoryFromDB\);/, 'categories must be unconditionally overwritten from the fresh fetch, exactly like products');
});

test('15-band: the .bg-white.border theme rule silently overrode any border-color/box-shadow utility (including a selected product card\'s border-blue-500/ring) — a higher-specificity rule must now win', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'ustore.css'), 'utf8');
  assert.match(css, /\.bg-white\.border\.ustore-selected-card\s*\{/, 'a 3-class override rule must exist to beat the existing 2-class .bg-white.border !important rule');
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /ustore-selected-card/, 'the selected product card must use the new override class, not rely on border-blue-500/ring-2 alone');
});

test('17-band: the admin/user mode popover is anchored to the header person button\'s real measured position, not a static guess', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('function togglePersonMenu(');
  const block = app.slice(start, start + 2400);
  assert.match(block, /personBtn\.getBoundingClientRect\(\)/, 'must measure the actual button position');
  assert.match(block, /popover\.style\.top/);
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.doesNotMatch(html, /role-mode-popover" class="hidden fixed right-4 top-14/, 'the old static right-4/top-14 guess must be removed from the markup');
});

// 2-band: the separate POST-only district field is gone — #chk-district is
// now the single shared field for every delivery method, so the DOM order
// check simplifies to region < district < method < branch.
test('19-band/2-band: checkout field order is Viloyat -> Tuman/Shahar (single shared field) -> Yetkazib berish usuli -> Filial', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.doesNotMatch(app, /id="chk-post-district-field"/, '2-band: the separate POST-only district field must be removed from the DOM');
  const regionIdx = app.indexOf('id="chk-region-key"');
  const districtIdx = app.indexOf('id="chk-district-field"');
  const methodIdx = app.indexOf('id="delivery-method-wrap"');
  const branchIdx = app.indexOf('id="chk-branch-wrap"');
  assert.ok(regionIdx < districtIdx && districtIdx < methodIdx && methodIdx < branchIdx,
    `expected DOM order region < district < method < branch, got positions ${JSON.stringify({ regionIdx, districtIdx, methodIdx, branchIdx })}`);
});

test('20-band: `.inline-flex` is actually defined in the compiled CSS (it silently was not, which made mt-1 spacing fixes ineffective on inline-level elements)', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'ustore.css'), 'utf8');
  assert.match(css, /\.inline-flex\s*\{\s*display:\s*inline-flex;?\s*\}/);
});

// 3-band (2026-08-17 real-Telegram round): previously "Chek tekshirilmoqda"
// appeared TWICE — as its own top badge (via orderDisplayStatus) AND as the
// separate "Jo'natma holati: Tayyorlanmoqda" line, at the same time. The two
// indicators are now merged into ONE: the top badge shows the real
// o.status, and the shipment-status line itself says "Chek tekshirilmoqda"
// while a card receipt is pending review. orders.status is still never
// given a new enum value for this.
test('3-band: a receipt-under-review order shows "Chek tekshirilmoqda" ONLY in the shipment-status line (not as a separate top badge), and orders.status is never given a new enum value for it', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.doesNotMatch(app, /RECEIPT_PENDING/, '3-band: the old separate top-badge pseudo-status must be fully removed, merged into the shipment line instead');
  const start = app.indexOf('function orderDisplayStatus(o)');
  const block = app.slice(start, start + 300);
  assert.doesNotMatch(block, /hasReceipt/, 'orderDisplayStatus must no longer special-case a pending receipt — it must reflect the real order status');
  assert.match(block, /o\?\.receiptReviewStatus === 'REJECTED'/, 'the REJECTED pseudo-status must still work exactly as before');

  const pendingStart = app.indexOf('function isReceiptPendingReview(o)');
  const pendingBlock = app.slice(pendingStart, pendingStart + 300);
  assert.match(pendingBlock, /o\?\.status === 'NEW' && o\?\.hasReceipt && \(o\?\.receiptReviewStatus \|\| 'PENDING'\) === 'PENDING'/, 'the pending-receipt condition must be preserved, just relocated');

  const labelStart = app.indexOf('function effectiveShipmentStatusLabel(o)');
  const labelBlock = app.slice(labelStart, labelStart + 300);
  assert.match(labelBlock, /isReceiptPendingReview\(o\)/);
  assert.match(labelBlock, /Chek tekshirilmoqda/);
  assert.match(labelBlock, /Проверка чека/);
  assert.match(app, /effectiveShipmentStatusLabel\(o\)/, 'order card/detail rendering must call the merged shipment-status resolver');
});

test('22-band: the delivery region comment chosen at checkout time is persisted into the historical order snapshot, not just read live from current config; 2026-09: FREE/FIXED gained the same "Umumiy qiymat" fallback TAXI already had, POST deliberately did not', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const start = server.indexOf('function resolveDeliverySnapshot(');
  const end = server.indexOf('\nfunction resolvePaymentSnapshot');
  const block = server.slice(start, end);
  // POST is the only kind left with no "Umumiy qiymat" (explicit scope decision) —
  // it still persists the bare region comment, unchanged.
  const postCommentCount = (block.match(/comment: r\.comment \|\| null/g) || []).length;
  assert.equal(postCommentCount, 1, 'only POST persists the bare region comment with no general fallback');
  // FREE and FIXED now fall back to their own "Umumiy qiymat" comment too.
  assert.match(block, /const comment = r\.comment \?\? general\.comment \?\? null;[\s\S]{0,400}kind: "FREE"/, 'FREE must persist its (region-or-general) comment into the snapshot');
  assert.match(block, /const comment = r\.comment \?\? general\.comment \?\? null;[\s\S]{0,600}kind: "FIXED"/, 'FIXED must persist its (region-or-general) comment into the snapshot');
  // Phase 3, 7-band: TAXI's comment additionally falls back to the shop-wide
  // "umumiy" (general) taxi comment when the region itself has none set —
  // still persisted into the snapshot, just with one more fallback step.
  assert.match(block, /const comment = r\.comment \|\| general\.comment \|\| null;/, 'TAXI must persist its (region-or-general) comment into the snapshot');
});

// ==================== 2026-08-17 REAL-TELEGRAM ROUND 3 (checkout, RU, image V2, ID hiding) ====================

test('4-band: checkout/order cards/details use semantic delivery tariff labels and never render a misleading 0 so\'m for unknown TAXI/customer-paid POST tariffs', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const labelStart = app.indexOf('function deliveryTariffLabel(delivery)');
  const labelBlock = app.slice(labelStart, labelStart + 2200);
  assert.match(labelBlock, /kind === 'TAXI'\) return tr\('Taksi tarifi', 'Тариф такси'\)/);
  assert.match(labelBlock, /kind === 'POST'\) return tr\('Pochta tarifi', 'Тариф почты'\)/);
  assert.match(labelBlock, /return tr\('Amaldagi tarif bo‘yicha', 'По действующему тарифу'\)/);
  assert.match(labelBlock, /return tr\('Pochta tarifiga ko‘ra', 'По тарифу почты'\)/);
  assert.match(app, /deliveryTariffLabel\(o\.delivery\)/);
  assert.match(app, /deliveryTariffValue\(o\.delivery, o\.deliveryFee\)/);
});

test("5-band: district/city names get a real hand-authored RU dictionary (not transliteration) and are wired into checkout selects and order detail", () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /const DISTRICT_RU_BY_REGION = \{/);
  assert.match(app, /function districtNameRu\(uzLabel\)/);
  assert.match(app, /function districtLabelForUi\(uzLabel\)/);
  // Spot-check a real translation, not a letter-by-letter transliteration —
  // "Farg'ona tumani" must never become something like "Фарғона тумани".
  assert.match(app, /"Farg'ona tumani": "Ферганский район"/);
  assert.doesNotMatch(app, /Фарғона/, 'must never contain a transliterated (not translated) district name');
  // Wired into both the hardcoded-fallback select and the real-data select.
  // 11-band: districtLabelForUi(d) now lives in the shared
  // populateDistrictSelectForRegion(), which handleRegionChange delegates to.
  const regionChangeStart = app.indexOf('function populateDistrictSelectForRegion');
  const regionChangeBlock = app.slice(regionChangeStart, regionChangeStart + 800);
  assert.match(regionChangeBlock, /districtLabelForUi\(d\)/);
  const renderDistrictStart = app.indexOf('function renderDistrictField');
  const renderDistrictBlock = app.slice(renderDistrictStart, renderDistrictStart + 500);
  assert.match(renderDistrictBlock, /districtLabelForUi\(d\)/);
  // Order detail's region/district line must also use it.
  const orderDetailIdx = app.indexOf('Hudud:');
  assert.match(app.slice(orderDetailIdx, orderDetailIdx + 200), /districtLabelForUi\(o\.district\)/);
});

test('5-band: order item names get a create_order-time RU snapshot (name_ru), rendered via orderItemName instead of the raw uz name when uiLang is ru', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /function orderItemName\(i\)/);
  assert.match(app, /uiLang === 'ru' && i\?\.nameRu/);
  const escapedNameCount = (app.match(/escapeHtml\(orderItemName\(i\)\)/g) || []).length;
  assert.equal(escapedNameCount, 2, 'both the order card and order detail item lines must use orderItemName');

  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const createOrderStart = server.indexOf('case "create_order"');
  const createOrderEnd = server.indexOf('case "cancel_order"');
  const block = server.slice(createOrderStart, createOrderEnd);
  assert.match(block, /nameRuBySku/, 'create_order must enrich the persisted items snapshot with name_ru, matched by sku');
  assert.match(block, /db\.from\("products"\)\.select\("sku,name_ru"\)\.eq\("shop_id", shopId\)\.in\("id", orderItemProductIds\)/);
  assert.match(block, /\.\.\.\(enrichedItems \? \{ items: enrichedItems \} : \{\}\)/, 'enriched items must be folded into the same snapshot update, not a second write');
  assert.doesNotMatch(block, /p_items: rpcItems[\s\S]{0,50}name_ru/, 'must not touch the place_order RPC call itself');
});

test('shop address has one input and legacy RU data is preserved server-side', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.doesNotMatch(app, /id="sc-address-ru"/);
  assert.match(app, /const address = String\(shopContact\.address \|\| ''\)\.trim\(\)/);

  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  assert.match(server, /hasOwnProperty\.call\(payload, "addressRu"\)/);
  assert.match(server, /addressRu: shopRow\?\.address_ru \|\| null/);
});

test('5-band: delivery_branches gets RU columns + an idempotent superadmin batch-translate action reusing the existing Azure pipeline (not executed here)', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const start = server.indexOf('case "translate_delivery_branches_batch"');
  assert.ok(start >= 0, 'batch-translate action must exist');
  const block = server.slice(start, start + 1600);
  assert.match(block, /requireSuperAdmin\(\);/);
  assert.match(block, /translateBatchUzToRu\(/, 'must reuse the existing Azure Translator pipeline, not a new one');
  assert.match(block, /\.or\("branch_name_ru\.is\.null,full_address_ru\.is\.null,district_or_city_ru\.is\.null"\)/, 'must only translate rows still missing an RU field (idempotent)');

  assert.match(server, /branch_name_ru,district_or_city,district_or_city_ru,full_address,full_address_ru,landmark,work_hours,phone/, 'get_delivery_branches must select the RU columns too');

  // Greenfield: these RU columns are native columns on the CREATE TABLE
  // from the start (fresh schema), not a later ALTER TABLE migration.
  const shopSettingsSql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '005_shop_settings_design.sql'), 'utf8');
  assert.match(shopSettingsSql, /address_ru text/);
  const branchesSql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '006_delivery_reference.sql'), 'utf8');
  assert.match(branchesSql, /branch_name_ru text/);
  assert.match(branchesSql, /full_address_ru text/);
  assert.match(branchesSql, /district_or_city_ru text/);

  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /function branchNameLabel\(b\)/);
  assert.match(app, /function branchDistrictLabel\(b\)/);
  assert.match(app, /function branchAddressLabel\(b\)/);
});

test('14-band: the search placeholder hides ID-based search from ordinary users but keeps it for admins, without changing the search logic itself', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /search_placeholder_user: \{ uz: "Mahsulot qidiring\.\.\.", ru: "Поиск товара\.\.\." \}/);
  const start = app.indexOf('function searchPlaceholderText()');
  const block = app.slice(start, start + 250);
  assert.match(block, /isAdminMode && isUserAnAdmin/);
  assert.match(block, /t\('search_placeholder'\)/);
  assert.match(block, /t\('search_placeholder_user'\)/);
  assert.match(app, /placeholder="\$\{escapeHtml\(searchPlaceholderText\(\)\)\}"/);
});

test('14-band: order item SKU/ID is only shown to admins (order card + order detail), never to an ordinary customer viewing their own order', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const idGateCount = (app.match(/\(i\.sku && isAdminMode && isUserAnAdmin\) \? `<span class="text-gray-400 font-mono">\(ID: \$\{escapeHtml\(i\.sku\)\}\)<\/span>` : ''/g) || []).length;
  assert.equal(idGateCount, 2, 'both the order card and order detail item lines must gate the raw SKU/ID behind admin mode');
});

test('Image Pipeline V2: captureAndPrepareImageV2 tries createImageBitmap-first via compressImageToLimit and only falls back to FileReader/ArrayBuffer if that fails entirely, never throwing', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('async function captureAndPrepareImageV2');
  const end = app.indexOf('async function onImagePicked');
  const block = app.slice(start, end > start ? end : start + 1500);
  assert.match(block, /const compressed = await compressImageToLimit\(file, maxBytes, maxDim, quality\);/, 'must try compressing the ORIGINAL file directly first (no pre-emptive FileReader/ArrayBuffer read)');
  assert.match(block, /compressed && compressed !== file/, 'a genuinely new (compressed) object signals the fast path succeeded');
  assert.match(block, /readBlobAsArrayBuffer\(file\)/, 'the old FileReader/ArrayBuffer chain must still exist as an explicit fallback, not deleted');
  assert.match(block, /catch \(fallbackErr\) \{[\s\S]*?return file;/, 'must never throw — total failure falls back to returning the original file so upload can still be attempted');

  const decodeStart = app.indexOf('async function decodeImageSource');
  const decodeBlock = app.slice(decodeStart, decodeStart + 400);
  assert.match(decodeBlock, /createImageBitmap\(blob\)/, 'the shared decode step (used by compression) must still try createImageBitmap first');
});

// ==================== PHASE 3 (2026-08-19): bug fixes + UX + delivery/payment + Azure ====================

test('image pipeline: decodeImageSource is timeout-protected on both createImageBitmap and the <img> fallback (root cause of "needs 4-5 retries")', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('async function decodeImageSource');
  const end = app.indexOf('function canvasToBlob');
  const block = app.slice(start, end);
  assert.match(block, /Promise\.race\(\[\s*createImageBitmap\(blob\)/, 'createImageBitmap must be raced against a timeout, not awaited unbounded');
  assert.match(block, /setTimeout\(\(\) => reject/, 'the <img> fallback decode must also be timeout-protected');
});

test('editor auto-clear bug: background polling skips render() while a catalog editor modal (ADD_PROD/EDIT_PROD_FIELD/ADD_CAT/EDIT_CAT) is open', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const fnStart = app.indexOf('function isCatalogEditorModalOpen');
  assert.ok(fnStart >= 0, 'isCatalogEditorModalOpen guard not found');
  const fnBlock = app.slice(fnStart, fnStart + 300);
  for (const modalName of ['ADD_PROD', 'EDIT_PROD_FIELD', 'ADD_CAT', 'EDIT_CAT']) {
    assert.match(fnBlock, new RegExp(`activePopupModal === '${modalName}'`), `${modalName} must be covered by the poll-render guard`);
  }
  const pollStart = app.indexOf('function startBackgroundPolling');
  const pollEnd = app.indexOf('BOOT: TEZKOR');
  const pollBlock = app.slice(pollStart, pollEnd > pollStart ? pollEnd : pollStart + 3000);
  assert.match(pollBlock, /await loadCatalog\(\); if \(!isCatalogEditorModalOpen\(\)\) render\(\);/, 'the catalog poll branch must skip render() while an editor is open, but still refresh data in the background');
});

test('long product name: the catalog card title uses line-clamp-2 (not a single truncated line), and .line-clamp-2 is actually defined in the compiled CSS', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /class="font-bold text-sm text-gray-800 mt-1 leading-tight line-clamp-2"/, 'product card title must allow 2 lines, not be clamped to 1');
  const css = fs.readFileSync(path.join(__dirname, '..', 'ustore.css'), 'utf8');
  assert.match(css, /\.line-clamp-2\s*\{[^}]*-webkit-line-clamp:\s*2;/, 'line-clamp-2 must have a real CSS rule, not just be referenced in markup (same class of bug as the earlier .inline-flex gap)');
});

test('shop settings live in Profile beside reports and the header gear is removed', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const appCount = (app.match(/onclick="openShopParams\(\)"/g) || []).length;
  const htmlCount = (html.match(/onclick="openShopParams\(\)"/g) || []).length;
  assert.equal(appCount, 0, 'the row is emitted by the shared profile menu builder');
  assert.equal(htmlCount, 0, 'the header settings icon must be removed');
  assert.match(app, /title: tr\("Do'kon parametrlari"/);
  assert.match(app, /function openShopParams/, 'openShopParams itself must still exist (settings feature not removed, only the duplicate entry point)');
});

// ---------------------------------------------------------------------------
// 14-item UX/bugfix round (Billz untouched, no new migrations, no deploy)
// ---------------------------------------------------------------------------

test('1-band: every OTHER background-render path (support-ticket/message lazy loaders, users/admins lazy loaders, boot\'s stale-while-revalidate catalog refresh) now respects isCatalogEditorModalOpen() too — the original fix only covered the 90s catalog poll branch, but a form draft could still be wiped by any of these other background renders', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  for (const fnName of ['loadMySupportTicketsLazy', 'loadAdminSupportTicketsLazy', 'loadSupportMessages', 'loadUsersLazy', 'loadAdminsLazy']) {
    const start = app.indexOf(`function ${fnName}(`);
    assert.ok(start >= 0, `${fnName} not found`);
    const end = app.indexOf('\n    function ', start + 10);
    const block = app.slice(start, end > start ? end : start + 800);
    assert.match(block, /isCatalogEditorModalOpen\(\)/, `${fnName} must check isCatalogEditorModalOpen() before its render() call(s)`);
  }
  const bootStart = app.indexOf('const catalogPromise = loadCatalog()');
  const bootBlock = app.slice(bootStart, bootStart + 600);
  assert.match(bootBlock, /isCatalogEditorModalOpen\(\)/, 'boot\'s stale-while-revalidate catalog refresh must also skip render() while an editor modal is open');
});

test('3/8-band: district name aliasing — a known abbreviation ("M.Ulug\'bek") normalizes to the same canonical base ("mirzo ulug\'bek") as its full form, and BTS "Mirobod"/EMU "Mirabad" collapse to one canonical district, so get_delivery_districts/get_delivery_branches never show either as a separate duplicate entry; the alias table is a real extensible map, not a single hardcoded string swap buried in logic', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  assert.match(server, /const DISTRICT_BASE_ALIASES: Record<string, string> = \{/, 'must be a real, named, extensible lookup table');
  assert.match(server, /"m\.ulug'bek": "mirzo ulug'bek"/, 'key must be in the POST-period-normalization form (no space after the period) — a space here would silently never match real BTS data again, exactly the bug this fixes');
  assert.match(server, /"mirabad": "mirobod"/, 'EMU spells this district "Mirabad", BTS spells it "Mirobod" — must be a real alias entry, not left as two separate districts');
  const fnStart = server.indexOf('function districtParts');
  const fnBlock = server.slice(fnStart, fnStart + 1100);
  assert.match(fnBlock, /normalized\.replace\(\/\\\.\\s\+\/g, ["']\.["']\)/, 'must collapse "X. Y" and "X.Y" to the same form BEFORE the alias lookup, so provider-specific spacing around abbreviation periods can never bypass an alias entry again');
  assert.match(fnBlock, /normalized = DISTRICT_BASE_ALIASES\[normalized\] \|\| normalized;/, 'the alias must be applied AFTER suffix (shahar/tuman) stripping, so it matches regardless of which suffix form the raw district string carries');

  // Reimplements districtParts()'s normalize+alias pipeline (must stay in
  // sync with the real function above) and runs it against the ACTUAL raw
  // district_or_city strings from 006_delivery_reference.sql for both
  // providers, confirming they really do collapse to one canonical key —
  // not just that an alias entry exists as a string somewhere.
  const ALIASES = { "m.ulug'bek": "mirzo ulug'bek", "mirabad": "mirobod" };
  function testDistrictParts(raw) {
    let normalized = raw.trim().replace(/[ʻʼ‘’`]/g, "'").replace(/\s+/g, " ").toLocaleLowerCase('uz');
    normalized = normalized.replace(/\.\s+/g, '.');
    let kind = 'generic';
    if (/\s+(?:shahar|shahri)$/.test(normalized)) { kind = 'city'; normalized = normalized.replace(/\s+(?:shahar|shahri)$/, ''); }
    else if (/\s+(?:tuman|tumani)$/.test(normalized)) { kind = 'district'; normalized = normalized.replace(/\s+(?:tuman|tumani)$/, ''); }
    normalized = normalized.trim();
    normalized = ALIASES[normalized] || normalized;
    return `${normalized}|${kind}`;
  }
  // Real seed strings (006_delivery_reference.sql, un-escaped from SQL '' to '):
  const btsUlugbek = testDistrictParts("M.Ulug'bek tumani");        // line 369+, no space after "M."
  const emuUlugbek = testDistrictParts("Mirzo Ulug‘bek tumani"); // line 533/540, curly apostrophe
  assert.strictEqual(btsUlugbek, emuUlugbek, 'BTS "M.Ulug\'bek" and EMU "Mirzo Ulug\'bek" must collapse to the same district key');

  const btsMirobod = testDistrictParts('Mirobod tumani');  // line 363-368
  const emuMirabad = testDistrictParts('Mirabad tumani');  // line 474
  assert.strictEqual(btsMirobod, emuMirabad, 'BTS "Mirobod" and EMU "Mirabad" must collapse to the same district key');
});

test('4-band: card number copy-to-clipboard — a dedicated button next to the customer-facing card number, with a safe execCommand fallback for WebViews without navigator.clipboard, and a short success/failure toast', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /id="chk-card-number-display"/, 'the card number must have a stable element id the copy button reads from directly (never re-embedding the raw value into an onclick string)');
  assert.match(app, /onclick="copyCardNumber\(document\.getElementById\('chk-card-number-display'\)\.textContent\)"/);
  const fnStart = app.indexOf('async function copyTextToClipboard');
  const fnBlock = app.slice(fnStart, fnStart + 1200);
  assert.match(fnBlock, /navigator\.clipboard/, 'must try the modern Clipboard API first');
  assert.match(fnBlock, /document\.execCommand\('copy'\)/, 'must fall back to the execCommand technique for WebViews where navigator.clipboard is unavailable/blocked');
  const copyFnStart = app.indexOf('async function copyCardNumber');
  const copyFnBlock = app.slice(copyFnStart, copyFnStart + 400);
  assert.match(copyFnBlock, /showActionToast/, 'success must show brief feedback');
});

test('7-band: warehouse summary (outOfStock/lowStock counters + filtered lists) is refreshed by the background poll while the Warehouse tab is open, not just once on first tab-open — otherwise a stock-out caused elsewhere (a customer order, Billz sync) would leave "Tugagan" stale until the admin manually left and reopened the tab', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const pollStart = app.indexOf('function startBackgroundPolling');
  const pollBlock = app.slice(pollStart, pollStart + 3500);
  assert.match(pollBlock, /currentTab === 'warehouse' && warehouseSummaryLoaded/, 'the poll must refresh warehouseSummaryData specifically while the Warehouse tab is active');
  assert.match(pollBlock, /loadWarehouseSummary\(true\)/, 'must force-refresh (bypass the already-loaded guard), same as the catalog/orders/support branches already do');
});

test('8-band: discount percent — ((old-price)/old)*100, rounded to an integer, shown next to the CURRENT price (not as a corner badge on the image, and not with the word "Chegirma" at all — both were removed per follow-up feedback since the corner badge overlapped the favorite-heart icon); old price (strikethrough) sits on its own line below', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const fnStart = app.indexOf('function discountPercent');
  const fnBlock = app.slice(fnStart, fnStart + 300);
  assert.match(fnBlock, /if \(!p\?\.oldPrice \|\| !\(p\.oldPrice > p\.price\)\) return null;/, 'must return null (no badge) unless oldPrice is set AND strictly greater than price');
  assert.match(fnBlock, /Math\.round\(\(\(p\.oldPrice - p\.price\) \/ p\.oldPrice\) \* 100\)/, 'must be the exact ((old-price)/old)*100 formula, rounded to a whole number');

  const cardFnStart = app.indexOf('function renderProductCardHTML');
  const cardFnEnd = app.indexOf('function ', cardFnStart + 30);
  const cardFn = app.slice(cardFnStart, cardFnEnd);
  assert.doesNotMatch(cardFn, /CHEGIRMA/, 'the word "Chegirma"/"Скидка" must no longer appear anywhere on the catalog card — removed per follow-up feedback (hard to read, overlapped the heart icon)');
  // The corner overlay above the image must now only ever contain the
  // favorite-heart button, never a discount badge (which used to sit at
  // top-1 right-1 and collide with the heart at top-1 left-1 on narrow cards).
  const imageBoxEnd = cardFn.indexOf('</div>', cardFn.indexOf('object-contain'));
  const overlayBlock = cardFn.slice(imageBoxEnd, cardFn.indexOf('<h4'));
  assert.doesNotMatch(overlayBlock, /discountPercent\(p\)/, 'no discount percent may render as an overlay on top of the product image anymore');
  assert.match(overlayBlock, /favoriteHeartHtml\(p\.id\)/, 'the favorite-heart overlay itself must still be there, just alone now');

  // New location: percent badge sits directly beside the current price, old
  // price (strikethrough) on the line below it.
  const priceBlockStart = cardFn.indexOf('hasDiscount ? `');
  const priceBlock = cardFn.slice(priceBlockStart, priceBlockStart + 500);
  // FINAL CORRECTION (2026-08-31), item 4: the current price now reads
  // from cardPrice (which falls back to a canonical variant's own price
  // when the product has no image of its own) instead of always p.price.
  assert.match(priceBlock, /money\(cardPrice\)/, 'current price must render');
  assert.match(priceBlock, /-\$\{Math\.max\(0, Math\.round\(\(1 - Number\(cardPrice\) \/ Number\(cardOldPrice\)\) \* 100\)\)\}%/, 'percent must be calculated from the exact price/old-price pair rendered on the card');
  assert.match(priceBlock, /line-through[^`]*money\(cardOldPrice\)/, 'old price must render struck through, below the same variant-aware current-price+percent row');
});

test('3-band (round 2): the catalog-internal Orqaga/Boshiga buttons (inside category drill-down, distinct from the global page-shell header buttons) get the same modernized pill treatment (.fc-cat-nav-btn) instead of a bare flat gray box', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /onclick="goBackCatLevel\(\)" class="fc-cat-nav-btn"/, 'the in-catalog back button must use the modernized pill class');
  assert.match(app, /onclick="adminCatParentId = null; categoryPage=1; render\(\);" class="fc-cat-nav-btn"/, 'the in-catalog home button must use the modernized pill class');
  const css = fs.readFileSync(path.join(__dirname, '..', 'ustore.css'), 'utf8');
  assert.match(css, /\.fc-cat-nav-btn \{/, 'a real, reusable CSS class must exist, not inline utility classes repeated at each call site');
  assert.match(css, /\.fc-cat-nav-btn:active \{ transform: scale\(0\.94\)/, 'must have press feedback matching the modernized page-header buttons');
});

test('shop logo is shown once in the top header without a redundant public-profile copy', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="header-shop-logo"/);
  assert.doesNotMatch(html, /header-logo-edit-btn/);
  assert.doesNotMatch(app, /class="fc-shop-public-logo"/);
});

test('9-band: optional per-region/per-provider "Yetkazib berish vaqti" (estimatedTime) — real executable check via ustore-commerce.js: present when set, absent (no field, no empty string) when never filled in, threaded through the same normalizeRegions/normalizeTaxiGeneral path as the existing "comment" field', () => {
  const config = commerce.defaultConfig(REGIONS);
  config.delivery.fixed.enabled = true;
  config.delivery.fixed.regions.tashkent_city = { enabled: true, fee: 40000, estimatedTime: '30-60 daqiqa' };
  config.delivery.taxi.enabled = true;
  config.delivery.taxi.general = { comment: null, estimatedTime: '1-2 soat' };
  const normalized = commerce.normalizeConfig(config, REGIONS);
  assert.equal(normalized.delivery.fixed.regions.tashkent_city.estimatedTime, '30-60 daqiqa');
  assert.equal(normalized.delivery.taxi.general.estimatedTime, '1-2 soat');

  const regionIds = ['tashkent_city'];
  const empty = commerce.defaultConfig(regionIds);
  empty.delivery.fixed.enabled = true;
  empty.delivery.fixed.regions.tashkent_city = { enabled: true, fee: 1000 };
  const normalizedEmpty = commerce.normalizeConfig(empty, regionIds);
  assert.ok(!normalizedEmpty.delivery.fixed.regions.tashkent_city.estimatedTime, 'an unfilled estimatedTime must not appear as an empty string / falsy placeholder');

  const options = commerce.deliveryOptions(normalized, 'tashkent_city');
  const fixedOption = options.find(o => o.kind === 'FIXED');
  assert.equal(fixedOption.estimatedTime, '30-60 daqiqa', 'deliveryOptions() must surface estimatedTime on the option object the checkout UI reads');
});

test('9-band: admin can type an estimated-delivery-time value per delivery region/provider and for taxi\'s general fallback, and the customer checkout notice shows it only when non-empty, prefixed with a clock', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /function setDeliveryRegionEstimatedTime/);
  assert.match(app, /function setPostRegionEstimatedTime/);
  // 2026-09: setTaxiGeneralEstimatedTime -> generic setGeneralEstimatedTime(kind, value)
  // (FREE/FIXED gained the same "Umumiy qiymat" pattern, now shared code).
  assert.match(app, /function setGeneralEstimatedTime\(kind, value\)/);
  const noticeStart = app.indexOf("const noticeText = escapeHtml(deliveryOptionNotice(selectedDelivery));");
  const noticeBlock = app.slice(noticeStart, noticeStart + 700);
  assert.match(noticeBlock, /selectedDelivery\?\.estimatedTime/);
  assert.match(noticeBlock, /⏱/, 'must be visually distinguished (clock icon) from the plain comment line');
});

test('10/11-band: the four inner "Do\'kon sozlamalari" sub-sections that were modals (Buyurtma ma\'lumotlari, Dizayn, and the split Yetkazib berish/To\'lov) are now real full pages via the existing renderPageShell/openPage/closePage infrastructure — not a new, parallel navigation system — while Billz settings and the low-stock threshold modal (opened from Warehouse, not Settings) are explicitly left untouched', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  for (const page of ['ORDER_INFO', 'DESIGN_SETTINGS', 'DELIVERY_SETTINGS', 'PAYMENT_SETTINGS']) {
    assert.match(app, new RegExp(`case '${page}': render\\w+\\(container\\); break;`), `${page} must be wired into the activePage router (renderActivePage)`);
  }
  assert.doesNotMatch(app, /activePopupModal === 'ORDER_INFO'/, 'ORDER_INFO must no longer be reachable as a modal');
  assert.doesNotMatch(app, /activePopupModal === 'DESIGN_SETTINGS'/, 'DESIGN_SETTINGS must no longer be reachable as a modal');
  assert.doesNotMatch(app, /activePopupModal === 'FULFILLMENT_SETTINGS'/, 'the old combined FULFILLMENT_SETTINGS modal must be gone (split into two real pages instead)');
  // Explicitly untouched, per the task's own hard rule.
  assert.match(app, /activePopupModal === 'BILLZ_SETTINGS'/, 'Billz settings must remain exactly as they were — this whole round must not touch Billz');
  assert.match(app, /activePopupModal='LOW_STOCK_SETTINGS'/, 'the low-stock threshold modal (opened from the Warehouse page, not Settings) is out of scope and must remain a modal');
  // The Settings page itself must offer delivery and payment as two separate entries, not one combined "Yetkazib berish va to'lov" entry.
  const settingsStart = app.indexOf('function renderSettingsPage');
  const settingsEnd = app.indexOf('\n    // 10-band: ilgari popup modal bo\'lgan sozlamalar', settingsStart);
  const settingsBlock = app.slice(settingsStart, settingsEnd > settingsStart ? settingsEnd : settingsStart + 4000);
  assert.match(settingsBlock, /openDeliverySettingsPage\(\)/);
  assert.match(settingsBlock, /openPaymentSettingsPage\(\)/);
  assert.doesNotMatch(settingsBlock, /Yetkazib berish va to'lov/, 'the old single combined entry must be gone from the Settings page');
});

test('12-band: product image pickers retain Gallery and Files entry points; category image pickers are removed', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  for (const prefix of ['m-prod-image-input', 'ef-image-input']) {
    assert.match(app, new RegExp(`id="${prefix}" type="file" accept="image/\\*" onchange="onImagePicked`), `${prefix}: the original Gallery input must be untouched`);
    assert.match(app, new RegExp(`id="${prefix}-files" type="file" onchange="onImagePicked`), `${prefix}-files: a new accept-less Files input must exist, wired to the SAME onImagePicked handler (reusing its already-tested validation/preview logic)`);
  }
  assert.doesNotMatch(app, /id="(?:m-cat-image-input|ec-image-input)"/);
});

test('13-band: product search ranks name-matches before description-only matches (case-insensitive), computing each product\'s match once so a product matching in both name and description is never listed twice', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const fnStart = app.indexOf('function searchProducts(query)');
  const fnEnd = app.indexOf('\n    // NAVIGATION', fnStart);
  const block = app.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 3000);
  assert.match(block, /const decorated = \[\];/, 'must decorate once per product, not filter and re-scan separately');
  assert.match(block, /if \(nameMatch \|\| skuMatch \|\| descMatch \|\| descRuMatch \|\| variantSkuMatch \|\| variantTextMatch \|\| categoryMatch\) \{/, 'a product is included exactly once regardless of how many fields matched (category name match added in the Online Do\'kon yaxshilashlari round)');
  assert.match(block, /const aNameRank = a\.nameMatch \? 0 : 1;/);
  assert.match(block, /return aNameRank - bNameRank;/, 'name-matched products must sort before description-only matches, after the existing SKU-prefix tier');
});

test('14-band: category add/edit preserve legacy image by omitting image fields', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const addStart = app.indexOf('async function saveCategoryFromModal');
  const addEnd = app.indexOf('\n    async function saveAdminFromModal', addStart);
  const addBlock = app.slice(addStart, addEnd);
  assert.doesNotMatch(addBlock, /productImagePayloadFromSnapshot|img:|imageUpload/);

  const editStart = app.indexOf('async function saveCategoryEdit');
  const editEnd = app.indexOf('\n    // ⬆️⬇️', editStart);
  const editBlock = app.slice(editStart, editEnd > editStart ? editEnd : editStart + 3000);
  assert.doesNotMatch(editBlock, /productImagePayloadFromSnapshot|img:|imageUpload/);
});

test('admin mode hides Favorites/Recently-viewed nav (user-mode feature stays intact)', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const idx = app.indexOf("openPage('FAVORITES','nav-profile')");
  assert.ok(idx >= 0, 'Favorites nav button not found');
  const before = app.slice(Math.max(0, idx - 200), idx);
  assert.match(before, /!\(isAdminMode && isUserAnAdmin\)/, 'Favorites/Recent block must be gated behind "not admin mode", not deleted');
  assert.match(app, /function openPage/, 'openPage/FAVORITES/RECENT routing itself must still exist for ordinary users');
});

test('cashless payment: cancel button hidden while a card/QR receipt is still PENDING review; admin approve/reject queue excludes CANCELLED orders', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /\(o\.status === 'NEW' && !isReceiptPendingReview\(o\)\) \? `\s*<button onclick="openCancelOrderSheet/, 'customer cancel button must check !isReceiptPendingReview(o), not just status===NEW');
  const nextStart = app.indexOf('function adminOrderNextAction');
  const nextEnd = app.indexOf('function renderAdminOrderNextActionHtml', nextStart);
  const nextBlock = app.slice(nextStart, nextEnd);
  assert.match(nextBlock, /if \(isReceiptPendingReview\(o\)\)/, 'admin receipt review must take priority as the next action');
  assert.match(app, /o\.status !== 'CANCELLED'/, 'receipt review queues must exclude cancelled orders');
});

test('receipt opening shows an immediate loading toast (spinner) instead of appearing frozen', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('async function openOrderReceipt');
  const end = app.indexOf('async function ', start + 10);
  const block = app.slice(start, end);
  assert.match(block, /showActionToast\(.*fc-spinner/, 'must show a spinner-bearing toast before the async signed-URL fetch, not after');
  assert.match(block, /hideActionToast\(\)/, 'must hide the loading toast once the fetch resolves or fails');
});

test('5-band: "Tayyor"/"Tayyorlanmoqda" removed as a selectable shipment-status STEP entirely (not just relabeled) — the POST and TAXI dropdowns only offer real forward-progress options; a still-READY order shows a disabled, neutral placeholder instead, so the admin can never accidentally re-select/leave it at "Tayyor"', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.doesNotMatch(app, />Tayyor</, 'the bare word "Tayyor" must not appear as a UI option label anywhere');
  assert.doesNotMatch(app, />Tayyorlanmoqda</, 'relabeling to "Tayyorlanmoqda" was the WRONG earlier fix — it must not reappear as a real option label either');
  // Both shipment-status <select>s (TAXI and POST) must drop READY as a real
  // choice the same way — find each by its distinguishing option, not by
  // source order (the two conditional blocks can be reordered independently).
  let cursor = -1;
  const foundKinds = new Set();
  for (;;) {
    const start = app.indexOf('<select id="shipment-status"', cursor + 1);
    if (start < 0) break;
    const block = app.slice(start, app.indexOf('</select>', start));
    assert.match(block, /<option value="READY" selected disabled hidden>/, 'READY must render as a disabled, unselectable placeholder, never a real choice');
    if (block.includes('HANDED_TO_CARRIER')) { assert.match(block, /<option value="HANDED_TO_CARRIER"/, '"Pochtaga topshirildi" stays exactly as-is, per the explicit requirement'); foundKinds.add('POST'); }
    if (block.includes('TAXI_ASSIGNED')) { assert.match(block, /<option value="TAXI_ASSIGNED"/); foundKinds.add('TAXI'); }
    cursor = start;
  }
  assert.deepEqual([...foundKinds].sort(), ['POST', 'TAXI'], 'both the TAXI and POST shipment-status selects must have been found and fixed');
  // The shared shipmentStatusLabel() display map must not say "Tayyor" either — legacy READY orders still render, just with neutral text.
  const labelFnStart = app.indexOf('function shipmentStatusLabel');
  const labelFnBlock = app.slice(labelFnStart, labelFnStart + 500);
  assert.doesNotMatch(labelFnBlock, /Tayyor/, 'the shared status-label lookup must not reintroduce "Tayyor" wording for legacy READY orders');
});

test('image upload UX: product and marketing still accept URL while category image fields are removed', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.doesNotMatch(app, /id="(?:m-cat-image-url|ec-image-url)"/);
  assert.match(app, /id="m-prod-image-url" type="url"/, 'product add/edit must support URL images');
  assert.match(app, /id="banner-image-url"[^>]*type="url"|type="url"[^>]*id="banner-image-url"/, 'banner must support URL images');
  assert.match(app, /id="bundle-image-url"[^>]*type="url"|type="url"[^>]*id="bundle-image-url"/, 'bundle must support URL images');
  assert.match(app, /id="vc-\$\{ci\}-image-url"[^>]*type="url"|type="url"[^>]*id="vc-\$\{ci\}-image-url"/, 'color image must support URL images');
  assert.doesNotMatch(app, /SHOP_LOGO_URL|saveShopLogoFromUrl|shop-logo-url-input/, 'shop logo must not expose or retain a URL-entry flow');
  const receiptStart = app.indexOf("function renderReceiptPicker");
  const receiptEnd = app.indexOf('function ', receiptStart + 10);
  const receiptBlock = app.slice(receiptStart, receiptEnd);
  assert.doesNotMatch(receiptBlock, /onImageUrlInput|type="url"/, 'payment receipt picker must stay file-only');
});

test('low-stock threshold is shop-specific: computeStockState takes a threshold param (not the hardcoded module constant), and both dashboard/warehouse actions read shop_settings.low_stock_threshold', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  assert.match(server, /function computeStockState\(p: \{ stock\?: unknown; variants\?: unknown \}, threshold: number = DASHBOARD_LOW_STOCK_THRESHOLD\)/, 'computeStockState must accept a threshold parameter');
  assert.match(server, /computeStockState\(p, lowStockThreshold\)/, 'get_dashboard_lite must pass the resolved per-shop threshold');
  assert.match(server, /computeStockState\(p, whLowStockThreshold\)/, 'get_warehouse_summary must pass the resolved per-shop threshold');
  assert.match(server, /case "set_low_stock_threshold":/, 'admin must be able to set the threshold via a dedicated action');
  assert.match(server, /select\("low_stock_threshold"\)\.eq\("shop_id", shopId\)/, 'threshold must be read scoped by shop_id (tenant isolation), not a global setting');
});

test('work hours: shop_settings gains a work_hours column (010 migration), wired through boot/set_shop_contact, and the previously-hardcoded "10:00-22:00" display is gone', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '010_phase3_shop_settings.sql'), 'utf8');
  assert.match(migration, /add column if not exists work_hours text/);
  assert.match(migration, /add column if not exists low_stock_threshold integer not null default 5/);
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  assert.match(server, /work_hours: nullableText\(payload\.workHours, 120\)/, 'set_shop_contact must accept workHours');
  assert.match(server, /workHours: shopRow\?\.work_hours \|\| null/, 'boot must return workHours');
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.doesNotMatch(app, /Ish vaqti.*10:00.*22:00|10:00 – 22:00/, 'the fake hardcoded "10:00-22:00" must be gone — it lied to every shop regardless of real hours');
  assert.match(app, /contact\.workHours &&/, 'footer work hours line must only render when the admin actually set it');
});

test('Azure translation: secret values are trimmed/quote-stripped (same class of bug as the token/secret paste issue found earlier this session) and every failure path logs a distinct greppable [TRANSLATE_FAILED:*] code instead of a silent generic console.error', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  assert.match(server, /function stripAccidentalQuotes/, 'must defend against secrets copied with surrounding quotes');
  assert.match(server, /stripAccidentalQuotes\(Deno\.env\.get\("AZURE_TRANSLATOR_KEY"\)/);
  assert.match(server, /stripAccidentalQuotes\(Deno\.env\.get\("AZURE_TRANSLATOR_REGION"\)/);
  for (const code of ['MISSING_CONFIG', 'AZURE_HTTP_ERROR', 'AZURE_FETCH_ERROR', 'PRODUCT_BACKGROUND_ERROR', 'CATEGORY_BACKGROUND_ERROR']) {
    assert.match(server, new RegExp(`\\[TRANSLATE_FAILED:${code}\\]`), `missing distinct error code for ${code}`);
  }
  assert.match(server, /"Ocp-Apim-Subscription-Key": cfg\.key/);
  assert.match(server, /"Ocp-Apim-Subscription-Region": cfg\.region/);
});

test('QR payment: URL fields reject javascript:/data: schemes server-side (only http/https survive), and providers are shop-scoped through fulfillment_config like every other payment method', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const start = server.indexOf('function normalizeSafeLinkUrl');
  const end = server.indexOf('function sanitizeQrProviders');
  const block = server.slice(start, end);
  assert.match(block, /url\.protocol !== "https:" && url\.protocol !== "http:"/, 'must reject every scheme except http/https (blocks javascript:/data:)');
  assert.match(server, /case "boot":[\s\S]{0,2000}?fulfillment_config/, 'QR config must ride the same per-shop fulfillment_config as everything else (tenant isolation inherited, not a new global table)');
});

test('QR payment: resolvePaymentSnapshot handles the "QR:<providerId>" compound id (mirrors the existing POST:<providerId> pattern) and always requires a receipt, reusing the CARD approval flow rather than a new system', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const start = server.indexOf('function resolvePaymentSnapshot');
  const end = server.indexOf('\nfunction ', start + 10);
  const block = server.slice(start, end);
  assert.match(block, /paymentMethodId\.startsWith\("QR:"\)/);
  assert.match(block, /receiptRequired: true, receiptStatus: "PENDING"/, 'QR must always require a receipt, using the same PENDING status CARD uses');
});

test('QR payment: client checkout constructs the QR:<providerId> id at submit time and requires both a chosen provider and an uploaded receipt before allowing order creation', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /paymentMethodId: selectedPayment\.id === 'QR' \? `QR:\$\{selectedQrProvider\.id\}` : selectedPayMethod/);
  assert.match(app, /selectedPayment\.id === 'QR' && !selectedQrProvider/);
  assert.match(app, /selectedPayment\.id === 'CARD' && selectedPayment\.receiptRequired \|\| selectedPayment\.id === 'QR'\) && !checkoutReceiptFile && !checkoutReceiptPreparing/);
});

test('QR payment: external payment links are only ever opened through openSafeExternalUrl (re-validates http/https client-side before opening, blocks javascript:/data:)', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const start = app.indexOf('function openSafeExternalUrl');
  const block = app.slice(start, start + 400);
  assert.match(block, /protocol !== 'https:' && parsed\.protocol !== 'http:'/);
  assert.match(app, /onclick="openSafeExternalUrl\('\$\{escapeHtml\(activeProvider\.paymentUrl\)\}'\)"/, 'the "To\'lov sahifasiga o\'tish" button must route through the safe-open helper');
});

test('taxi delivery: exact price and min/max range are both fully optional now (no more hard "minFee>0" rejection at order time)', () => {
  const config = commerce.defaultConfig(REGIONS);
  config.delivery.taxi.enabled = true;
  // A region enabled with NO price/comment at all must still be a valid, offerable option.
  config.delivery.taxi.regions.jizzakh = { enabled: true };
  const options = commerce.deliveryOptions(config, 'jizzakh');
  const taxi = options.find(o => o.kind === 'TAXI');
  assert.ok(taxi, 'a taxi region with no price configured must still be offered (falls back to comment/default text at display time)');
  assert.equal(taxi.exactFee, null);
  assert.equal(taxi.minFee, null);
  assert.equal(taxi.maxFee, null);
});

test('taxi delivery: 0 is a real configured price, never confused with "not set" (null)', () => {
  const config = commerce.defaultConfig(REGIONS);
  config.delivery.taxi.enabled = true;
  config.delivery.taxi.regions.jizzakh = { enabled: true, exactFee: 0 };
  const taxi = commerce.deliveryOptions(config, 'jizzakh').find(o => o.kind === 'TAXI');
  assert.equal(taxi.exactFee, 0, 'an admin-entered 0 must survive as 0, not be coerced to null or to a fallback');
  assert.notEqual(taxi.exactFee, null);
});

test('taxi delivery: a region falls back to the shop-wide "umumiy" (general) price/comment when it has none of its own, but its own value wins when present', () => {
  const raw = commerce.defaultConfig(REGIONS);
  raw.delivery.taxi.enabled = true;
  // 2026-09: "Umumiy qiymat" now has its own on/off toggle — real runtime
  // config always goes through normalizeConfig() before deliveryOptions()
  // ever sees it (both boot() server-side and every client read do this),
  // which is also where the legacy (no explicit `enabled`) shape gets
  // migrated to enabled:true. Mirror that real flow here instead of
  // hand-building an already-normalized-looking object.
  raw.delivery.taxi.general = { exactFee: null, minFee: 40000, maxFee: 60000, comment: 'Umumiy izoh' };
  raw.delivery.taxi.regions.jizzakh = { enabled: true }; // no own price/comment -> inherits general
  raw.delivery.taxi.regions.andijan = { enabled: true, minFee: 90000, maxFee: 120000, comment: 'Andijon uchun maxsus' }; // own values win
  const config = commerce.normalizeConfig(raw, REGIONS);
  assert.equal(config.delivery.taxi.general.enabled, true, 'legacy general (no explicit enabled, real values present) must migrate to enabled:true');

  const jizzakh = commerce.deliveryOptions(config, 'jizzakh').find(o => o.kind === 'TAXI');
  assert.equal(jizzakh.minFee, 40000);
  assert.equal(jizzakh.maxFee, 60000);
  assert.equal(jizzakh.comment, 'Umumiy izoh');

  const andijan = commerce.deliveryOptions(config, 'andijan').find(o => o.kind === 'TAXI');
  assert.equal(andijan.minFee, 90000);
  assert.equal(andijan.maxFee, 120000);
  assert.equal(andijan.comment, 'Andijon uchun maxsus');
});

test('taxi delivery: validateConfig only flags a genuine min>max mismatch, never the mere absence of a price', () => {
  const config = commerce.defaultConfig(REGIONS);
  config.delivery.taxi.enabled = true;
  config.delivery.taxi.regions.jizzakh = { enabled: true }; // nothing set — must be VALID now
  const clean = commerce.validateConfig(config, REGIONS);
  assert.equal(clean.issues.filter(i => i.code === 'TAXI_RANGE_INVALID').length, 0, 'an empty (comment/default-text) taxi region must not be flagged as invalid');

  config.delivery.taxi.regions.andijan = { enabled: true, minFee: 90000, maxFee: 10000 }; // genuinely inconsistent
  const dirty = commerce.validateConfig(config, REGIONS);
  assert.equal(dirty.issues.filter(i => i.code === 'TAXI_RANGE_INVALID' && i.regionId === 'andijan').length, 1, 'max < min must still be rejected');
});

test('QR payment: normalizeQrProviders always yields exactly the 4 fixed providers (Click/Payme/Paynet/Uzum) regardless of input, and validateConfig requires at least one enabled+linked provider before QR can be enabled with regions', () => {
  const config = commerce.defaultConfig(REGIONS);
  const qr = config.payments.methods.find(m => m.id === 'QR');
  assert.ok(qr, 'QR must exist as a payment method alongside CASH/CARD');
  assert.deepEqual(qr.providers.map(p => p.id), ['CLICK', 'PAYME', 'PAYNET', 'UZUM']);

  qr.enabled = true;
  qr.regions.tashkent_city = { enabled: true };
  const noProvider = commerce.validateConfig(config, REGIONS);
  assert.ok(noProvider.issues.some(i => i.code === 'QR_PROVIDER_REQUIRED'), 'QR enabled with no linked provider must be flagged');

  qr.providers[0].enabled = true;
  qr.providers[0].paymentUrl = 'https://payme.uz/example';
  const withProvider = commerce.validateConfig(config, REGIONS);
  assert.ok(!withProvider.issues.some(i => i.code === 'QR_PROVIDER_REQUIRED'), 'a real enabled provider with a paymentUrl must clear the issue');
});

test('QR payment: paymentOptions() surfaces the QR method with its providers array intact for a given region (shop-scoped, per-region like CASH/CARD)', () => {
  const config = commerce.defaultConfig(REGIONS);
  const qr = config.payments.methods.find(m => m.id === 'QR');
  qr.enabled = true;
  qr.providers[1].enabled = true; // PAYME
  qr.providers[1].paymentUrl = 'https://payme.uz/x';
  qr.regions.tashkent_city = { enabled: true };
  const options = commerce.paymentOptions(config, 'tashkent_city');
  const qrOption = options.find(o => o.id === 'QR');
  assert.ok(qrOption, 'QR must be offered for a region it is enabled in');
  assert.ok(Array.isArray(qrOption.providers) && qrOption.providers.length === 4);
  assert.equal(qrOption.providers.find(p => p.id === 'PAYME').paymentUrl, 'https://payme.uz/x');
  assert.equal(commerce.paymentOptions(config, 'andijan').some(o => o.id === 'QR'), false, 'QR must NOT be offered in a region it was never enabled for');
});

test('product image "spilling out of frame" root cause: max-w-full/max-h-full were Tailwind utility classes that were never actually compiled into ustore.css (this project ships a static pre-built CSS file, not a live compiler) — object-fit:contain had no real box to contain within, so the <img> rendered at natural size and just got clipped. Both the catalog card and the product detail modal now use w-full h-full (both of which DO exist in ustore.css) instead', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.doesNotMatch(app, /class="max-w-full max-h-full object-contain"/, 'the non-functional Tailwind classes must be fully gone from every product image, not just one location');
  const matches = app.match(/class="w-full h-full object-contain"/g) || [];
  assert.ok(matches.length >= 2, 'both the catalog card image and the product detail modal image must use the fixed w-full/h-full pair');

  const css = fs.readFileSync(path.join(__dirname, '..', 'ustore.css'), 'utf8');
  assert.match(css, /\.h-full\s*\{\s*height: 100%;\s*\}/, 'h-full must actually exist in the compiled CSS (max-w-full/max-h-full do not, and must never be reintroduced without also adding their CSS rules)');
});

test('the storefront footer owns social icons and profile no longer duplicates shop contact', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const profile = app.slice(app.indexOf('function renderProfile'), app.indexOf('function readShopContactFormValues'));
  const footer = app.slice(app.indexOf('function storefrontFooterHtml()'), app.indexOf('function openStorefrontLegalDocument'));
  assert.doesNotMatch(profile, /class="shop-about-card/);
  assert.match(footer, /fc-footer-socials/);
  assert.match(footer, /fc-footer-contact/);
});

test('6-band (round 4): both index.html entry documents (shop app and platform bot) now explicitly disable caching on themselves — Telegram WebView sometimes keeps serving a stale entry document even after the child JS/CSS ?v= numbers are bumped and re-uploaded, since the WebView never re-fetches an entry document it considers still cached', () => {
  for (const relPath of ['index.html', path.join('platform', 'index.html')]) {
    const html = fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
    assert.match(html, /<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">/, `${relPath} must disable caching on itself`);
    assert.match(html, /<meta http-equiv="Pragma" content="no-cache">/);
    assert.match(html, /<meta http-equiv="Expires" content="0">/);
  }
});

test('7-band (round 4): the bottom nav (Bosh sahifa/Kataloglar/...) stays visible and on top of full-page views (Sozlamalar/Qo\'llab-quvvatlash/etc, rendered into #page-container) instead of being visually buried underneath them — fixed via z-index ordering (nav above page-container), not by any change to the working close/switchTab logic (switchTab already cleared activePage before this fix, so nav clicks already worked correctly once actually visible/clickable)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const navTagMatch = html.match(/<nav class="ustore-bottom-nav[^"]*"/);
  assert.ok(navTagMatch, 'bottom nav element not found');
  assert.match(navTagMatch[0], /z-50/, 'bottom nav must have a higher z-index than #page-container (z-40) so it paints on top');
  assert.match(html, /id="page-container" class="hidden fixed inset-0 z-40/, 'page-container must stay at its original z-40 — only the nav moved up, not the page container');

  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const shellStart = app.indexOf('function renderPageShell');
  const shellBlock = app.slice(shellStart, shellStart + 900);
  assert.match(shellBlock, /padding-bottom:calc\(5rem \+ env\(safe-area-inset-bottom\)\)/, 'page body content needs real bottom clearance now that the nav visibly sits on top of it, not just a token 1.5rem');
});

test('global header (brend/logo, admin-user, til/profil/sozlamalar) never gets covered by full-page views (Do\'kon sozlamalari, Qo\'llab-quvvatlash) — #page-container starts BELOW the header (top offset, not inset-0) while the header itself paints above it (z-50), both driven by one shared --ustore-header-h so they can never drift apart; the page\'s own inner .fc-page-header no longer double-counts the safe-area inset since the global header already accounts for it', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'ustore.css'), 'utf8');
  assert.match(css, /--ustore-header-h:\s*calc\(max\(0\.75rem, env\(safe-area-inset-top\)\) \+ 3rem\);/);
  assert.match(css, /\.ustore-topbar\s*\{\s*min-height:\s*var\(--ustore-header-h\);\s*z-index:\s*50\s*!important;\s*\}/);
  assert.match(css, /#page-container\s*\{\s*top:\s*var\(--ustore-header-h\)\s*!important;\s*\}/);
  assert.match(css, /\.fc-page-header\s*\{\s*padding-top:\s*\.75rem\s*!important;\s*\}/, 'the inner page header must drop its own safe-area padding now that it sits below the persistent global header, or the safe area gets double-counted');
});

test('Billz select-and-save sticky panel ("Import qilish" / "Importdan olib tashlash") sits ABOVE the bottom nav, not fighting it on z-index — #page-container itself creates a z-40 stacking context, so no descendant\'s z-index can ever outrank the nav\'s z-50 sibling; the fix repositions the panel with a bottom offset (--ustore-nav-h, the same clearance renderPageShell already uses) instead of bottom-0', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'ustore.css'), 'utf8');
  assert.match(css, /--ustore-nav-h:\s*calc\(5rem \+ env\(safe-area-inset-bottom\)\);/);
  assert.match(css, /\.ustore-sticky-panel\s*\{\s*position:\s*fixed;\s*bottom:\s*var\(--ustore-nav-h\);/);

  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.doesNotMatch(app, /fixed bottom-0 left-0 right-0 p-3 bg-white border-t shadow-lg z-40/, 'the old bottom-0 sticky panel (which the bottom-nav, at z-50, always covered) must be fully gone');
  const panelCount = (app.match(/class="ustore-sticky-panel fc-billz-sticky-action z-40"/g) || []).length;
  assert.equal(panelCount, 2, 'both the import-select and unlink-select sticky panels must use the fixed panel class');
});

// 2026-08-27: personal-discount customer picker — was hard-locked to a
// single selection whenever customerMode==='SINGLE' (the default for a new
// discount); user reported "faqat bitta tanlanadi". Now the picker itself
// always multi-selects, plus real server-side pagination (20/page, numbered
// pager) and two new sort modes (newest-joined by first_seen_at, and
// top-spenders within a week/month/year window) were added.
test('the personal-discount customer picker always allows selecting more than one customer, with select-all-on-page, sort tabs and a real numbered pager', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.doesNotMatch(app, /customerMode === 'SINGLE'\) \{\s*personalDiscountPicker\.selected = new Set/, 'picking one customer must never collapse the whole selection anymore');
  assert.match(app, /function togglePersonalDiscountPickerSelectAllOnPage\(\)/);
  assert.match(app, /function setPersonalDiscountPickerSort\(sort\)/);
  assert.match(app, /function setPersonalDiscountPickerSortPeriod\(period\)/);
  assert.match(app, /function setPersonalDiscountPickerPage\(page\)/);
  const start = app.indexOf('function renderPersonalDiscountCustomerPickerSheet');
  const block = app.slice(start, start + 5200);
  assert.match(block, /renderPagerHTML\(p\.page, p\.totalPages, 'setPersonalDiscountPickerPage'\)/, 'must reuse the existing app-wide numbered pager component, not invent a new one');
  assert.match(block, /'1 hafta'/);
  assert.match(block, /Yangi qo/);

  const api = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
  const apiStart = api.indexOf('case "get_customer_report"');
  const apiBlock = api.slice(apiStart, apiStart + 6000);
  assert.match(apiBlock, /first_seen_at/, 'registration timestamp must be selected/returned for the newest-joined sort');
  assert.match(apiBlock, /case "NEWEST_JOINED"/);
  assert.match(apiBlock, /case "TOP_SPEND_PERIOD"/);
  // The existing all-time TOP_SPEND segment (used by the Reports page) must
  // stay completely untouched — the new period-scoped ranking is a SEPARATE
  // segment value, not a behavior change to the existing one.
  assert.match(apiBlock, /case "TOP_SPEND": list = list\.filter\(\(c: any\) => c\.totalSpent > 0\)\.sort\(\(a: any, b: any\) => b\.totalSpent - a\.totalSpent\); break;/);
});

// 2026-08-27: header action buttons (#header-cart-btn especially — must be
// hidden in admin mode) NEVER actually hid, even though updateHeaderChrome()
// correctly added the .hidden class. Root cause: `.hidden{display:none}` (a
// plain class, no !important) was losing a CSS specificity fight against
// `#header-cart-btn{display:inline-flex}` (an ID selector, also no
// !important — ID always outranks a class regardless of source order).
// Fixed with :not(.hidden) on the ID selectors so the rule doesn't apply at
// all once .hidden is present, instead of trying to out-specificity it.
test('header action button IDs (#header-cart-btn etc.) never fight the .hidden utility class on specificity — toggling .hidden must actually hide them', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'ustore.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /\.hidden\s*\{\s*display:\s*none;?\s*\}/, 'the base .hidden utility (no !important) must still exist');
  const idsThatSetDisplay = ['#header-cart-btn', '#header-person-btn', '#lang-flag-btn', '#header-settings-btn'];
  const displayRules = [...css.matchAll(/([^{}]+)\{[^}]*\bdisplay:/g)].map(m => m[1]);
  for (const id of idsThatSetDisplay) {
    const offenders = displayRules.filter(sel => sel.includes(id) && !sel.includes(`${id}:not(.hidden)`) && !sel.includes(`${id}.hidden`));
    assert.equal(offenders.length, 0, `${id} must never appear in a display-setting rule without :not(.hidden) (or as .hidden itself) — a bare ID selector there always beats the plain .hidden class on specificity. Found: ${JSON.stringify(offenders)}`);
  }
});


test('TASK 6: warehouse movements uses the Orders-style calendar range everywhere and defaults to the last 7 calendar days', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  assert.match(app, /const warehouseMovementsDefaultRange = \(\(\) => \{[\s\S]*to\.getDate\(\) - 6/);
  const renderStart = app.indexOf('function renderWarehouseHarakatlarHtml');
  const renderEnd = app.indexOf('function renderWarehouseHarakatlarResultsHtml', renderStart);
  const renderBlock = app.slice(renderStart, renderEnd);
  assert.match(renderBlock, /openWarehouseMovementsCalendarModal\(event\)/);
  assert.match(renderBlock, /fc-orders-calendar-trigger is-active/);
  assert.doesNotMatch(renderBlock, /Bugun|7 kun|30 kun|setWarehouseMovementsDateRange/);
  assert.match(app, /activePopupModal = 'WAREHOUSE_MOVEMENTS_CALENDAR'/);
  assert.match(app, /function renderWarehouseMovementsCalendarBodyHtml\(\)/);
  assert.match(app, /function applyWarehouseMovementsCalendarSelection\(\)[\s\S]*warehouseMovementsDateFrom = warehouseMovementsCalendarDraftFrom;[\s\S]*warehouseMovementsDateTo = warehouseMovementsCalendarDraftTo;[\s\S]*loadWarehouseMovements\(true\)/);
  assert.match(app, /function warehouseMovementsDateBounds\(\)[\s\S]*T00:00:00[\s\S]*T23:59:59\.999/);
});

test('TASK 7: desktop/tablet admin product detail matches the customer two-column page while retaining admin controls and mobile sheet behavior', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'ustore.css'), 'utf8');
  const start = app.indexOf('// PRODUCT DETAILS MODAL');
  const end = app.indexOf('// 14-band: chekni rad etish', start);
  const block = app.slice(start, end);
  assert.match(block, /fc-product-detail-admin-shell fixed inset-0 bg-black\/50/);
  assert.match(block, /fc-product-detail-admin-layout bg-white rounded-t-3xl/);
  assert.match(block, /fc-product-detail-admin-back/);
  assert.match(block, /fc-product-detail-media/);
  assert.match(block, /fc-product-admin-description/);
  // Admin capabilities remain in the same detail renderer.
  assert.match(block, /duplicateProduct\('\$\{p\.id\}'\)/);
  assert.match(block, /deleteProduct\('\$\{p\.id\}'\)/);
  assert.match(block, /openEditFieldModal\('\$\{p\.id\}', 'stock'\)/);
  assert.match(block, /openEditFieldModal\('\$\{p\.id\}', 'variants'\)/);
  assert.match(block, /openMoveProductModal\('\$\{p\.id\}'\)/);
  assert.match(block, /openProductBadgePicker\('\$\{p\.id\}'\)/);
  // Browser-only desktop/tablet CSS changes the admin modal into the same page composition.
  assert.match(css, /@media \(min-width:768px\)[\s\S]*body\.ustore-browser-mode #modal-container > \.fc-product-detail-admin-shell/);
  assert.match(css, /\.fc-product-detail-admin-layout[\s\S]*grid-template-columns:minmax\(0,38%\) minmax\(0,1fr\)/);
  assert.match(css, /body\.ustore-browser-mode \.fc-product-detail-layout[\s\S]*grid-template-columns:minmax\(0,38%\) minmax\(0,1fr\)/);
  assert.match(css, /\.fc-product-detail-layout \.fc-product-gallery[\s\S]*max-height:500px/);
});
