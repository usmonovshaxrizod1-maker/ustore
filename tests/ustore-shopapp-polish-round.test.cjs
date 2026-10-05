// USTORE SHOP APP — 7-topshiriqli POLISH ROUND (2026-08-30):
// 1) shop logo majburiy 4:1 crop, 2) "nomdan logo yaratish" (wordmark),
// 3) Click/Payme/Uzum -> "To'lov parametrlari", 4) variativ tovarda rasm
// faqat rangga tegishli (o'lchamda alohida rasm yo'q), 5-6) support chat redizayn + tezlik + optimistik yuborish +
// read receipts, 7) 48 soat javobsiz support avtomatik yopish.
// Static-pattern tests (no live Supabase) — same style as the rest of
// tests/ustore-*.test.cjs.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const mig060 = fs.readFileSync(path.join(root, 'supabase', 'migrations', '060_shop_logo_wordmark.sql'), 'utf8');
const mig061 = fs.readFileSync(path.join(root, 'supabase', 'migrations', '061_support_auto_close.sql'), 'utf8');
const mig062 = fs.readFileSync(path.join(root, 'supabase', 'migrations', '062_variant_price.sql'), 'utf8').replace(/\r\n/g, '\n');
const mig007 = fs.readFileSync(path.join(root, 'supabase', 'migrations', '007_tenant_rpcs.sql'), 'utf8').replace(/\r\n/g, '\n');

function actionBlock(action) {
  const start = api.indexOf(`case "${action}"`);
  assert.ok(start >= 0, `${action} not found`);
  const end = api.indexOf('\n      case ', start + 10);
  return api.slice(start, end > start ? end : start + 6000);
}

// ---------------------------------------------------------------------------
// Task 1: shop logo 4:1 crop
// ---------------------------------------------------------------------------

test('task 1: picking a logo file opens a mandatory 4:1 crop step BEFORE compression — the crop canvas is a fixed 4:1 aspect (960x240) and pan/zoom is clamped so the image always covers the frame (no gaps, no deformation)', () => {
  assert.match(app, /function saveShopLogoFromPicker\(event\) \{/, 'must no longer be async — it only validates and opens the crop step now');
  assert.doesNotMatch(app, /async function saveShopLogoFromPicker/);
  assert.match(app, /openLogoCropStep\(file, editingInsideShopInfo\)/);
  assert.match(app, /const LOGO_CROP_CANVAS_W = 960, LOGO_CROP_CANVAS_H = 240;/);

  const resetStart = app.indexOf('function resetLogoCropTransform()');
  const resetBlock = app.slice(resetStart, app.indexOf('\n    }', resetStart) + 6);
  assert.match(resetBlock, /Math\.max\(LOGO_CROP_CANVAS_W \/ w, LOGO_CROP_CANVAS_H \/ h\)/, 'must compute a "cover" scale so the image always fully fills the 4:1 frame, never leaving gaps');

  const clampStart = app.indexOf('function clampLogoCropOffset()');
  const clampBlock = app.slice(clampStart, app.indexOf('\n    }', clampStart) + 6);
  assert.match(clampBlock, /const minX = LOGO_CROP_CANVAS_W - scaledW, maxX = 0;/, 'pan must be clamped so the image can never be dragged to reveal empty space');

  // Confirming the crop draws the CURRENT canvas (already clamped/cover-scaled) to a blob — no separate resize/deform step.
  const confirmStart = app.indexOf('async function confirmLogoCrop()');
  const confirmBlock = app.slice(confirmStart, app.indexOf('\n    }', confirmStart) + 6);
  assert.match(confirmBlock, /canvas\.toBlob\(resolve, mimeType, 0\.92\)/);
  assert.match(confirmBlock, /await processCroppedLogoFile\(croppedFile, editingInsideShopInfo\);/, 'the cropped file must feed into the SAME existing compress/upload pipeline, not a new parallel one');

  // The 4:1 + recommended-size hint appears before the upload button, not after picking.
  const shopInfoLogoStart = app.indexOf('fc-shop-logo-hint');
  assert.ok(shopInfoLogoStart >= 0);
  assert.match(app, /Logo 4:1 formatda bo‘lishi kerak\. Tavsiya etilgan o‘lcham: 1200 × 300 px\./);

  // Old logos (not yet cropped, potentially any aspect ratio) are never touched — no migration/backfill for existing logo_url values.
  assert.doesNotMatch(mig060, /update public\.shop_settings set logo_url/i);
});

// ---------------------------------------------------------------------------
// Task 2: "nomdan logo yaratish" (wordmark)
// ---------------------------------------------------------------------------

test('task 2: shop_settings supports IMAGE/WORDMARK and switching logo source replaces the previous active source without keeping a stale image reference', () => {
  assert.match(mig060, /add column if not exists logo_type text not null default 'IMAGE'/);
  assert.match(mig060, /check \(logo_type in \('IMAGE', 'WORDMARK'\)\)/);
  assert.match(mig060, /add column if not exists logo_wordmark jsonb;/);

  const block = actionBlock('set_shop_logo');
  assert.match(block, /const logoType = payload\.logoType === "WORDMARK" \? "WORDMARK" : "IMAGE";/);
  assert.match(block, /if \(!presetId \|\| !text\) return json\(\{ error: "invalid_wordmark" \}, 400\);/);
  assert.match(block, /const newLogoUrl = logoType === "IMAGE" \? \(payload\.logoUrl \|\| null\) : null;/);
  assert.match(block, /logo_url: newLogoUrl/);
  assert.match(block, /logo_wordmark: logoType === "WORDMARK" \? wordmark : null/);
  assert.match(block, /cleanupManagedImageIfUnreferenced\(db, shopId, oldLogoUrl, SUPABASE_URL, "old-shop-logo"\)/);

  assert.match(app, /const WORDMARK_PRESETS = \[/);
  const presetsBlock = app.slice(app.indexOf('const WORDMARK_PRESETS = ['), app.indexOf('];', app.indexOf('const WORDMARK_PRESETS = [')));
  const presetCount = (presetsBlock.match(/\{ id:/g) || []).length;
  assert.ok(presetCount > 6, 'wordmark chooser must offer more than 6 professional styles');
  for (const family of ['sans', 'mono', 'serif', 'condensed', 'wide', 'rounded', 'display']) {
    assert.match(presetsBlock, new RegExp(`family: '${family}'`), `wordmark styles must include a visually distinct ${family} direction`);
  }
  assert.doesNotMatch(app, /@font-face/, 'no bundled/custom font file is required; system/browser stacks keep Telegram WebView light');

  assert.match(app, /function wordmarkFontFamily\(family\) \{/);
  assert.match(app, /ui-monospace, SFMono-Regular, Menlo, Consolas, monospace/, 'mono preset must reuse a system mono stack');
  assert.match(css, /\.fc-wordmark-style-menu\{[^}]*max-height:[^;}]+;[^}]*overflow-y:auto/s, 'Word-like style list must have bounded height and internal vertical scroll');
  assert.doesNotMatch(app, /switchLogoBackToImage|Yuklangan rasmga qaytish/, 'there must be no UI or helper for switching back to an obsolete logo source');

  // Header actually toggles between the uploaded-image <img> and the live wordmark <span> — no rasterization.
  const headerStart = app.indexOf('function updateHeaderChrome()');
  const headerBlock = app.slice(headerStart, app.indexOf('\n    }', headerStart) + 6);
  assert.match(headerBlock, /if \(shopLogoType === 'WORDMARK' && shopLogoWordmark\?\.text\)/);
  assert.match(headerBlock, /wordmarkEl\.innerHTML = renderWordmarkHtml\(shopLogoWordmark\.presetId, shopLogoWordmark\.text, \{ textColor: shopLogoWordmark\.textColor \|\| '#172033', bgColor: shopLogoWordmark\.backgroundColor \|\| '#ffffff' \}\);/);
  assert.match(html, /<span id="header-shop-logo-wordmark" class="hidden ustore-header-wordmark"><\/span>/);
});

// ---------------------------------------------------------------------------
// Task 3: Click/Payme/Uzum relocated to "To'lov parametrlari"
// ---------------------------------------------------------------------------

test("task 3 (superseded 2026-09-05 by the full \"To'lov usullari\" restructure): Click/Payme entry points stay out of \"Do'kon sozlamalari\" (Billz correctly stays put) and now live under To'lov usullari → Ekvayring orqali as dedicated pages; Uzum is fully excluded from admin UI (nav-unreachable) while its own modal/backend code remains completely untouched (lock-in)", () => {
  const settingsStart = app.indexOf('function renderSettingsPage(container)');
  const settingsBlock = app.slice(settingsStart, app.indexOf('\n    }', settingsStart) + 6);
  assert.doesNotMatch(settingsBlock, /openClickSettings\(\)|openPaymeSettings\(\)|openUzumSettings\(\)/, "Do'kon sozlamalari must no longer contain any online-acquiring entry point");
  assert.match(settingsBlock, /openBillzSettings\(\)/, 'Billz (inventory sync, not payment) must stay in Do\'kon sozlamalari');

  // Main "To'lov usullari" page: exactly 4 categories, Ekvayring conditional.
  const menuStart = app.indexOf('function renderPaymentsMenuHtml()');
  const menuBlock = app.slice(menuStart, app.indexOf('\n    }', menuStart) + 6);
  assert.match(menuBlock, /Naqd orqali/);
  assert.match(menuBlock, /Karta orqali/);
  assert.match(menuBlock, /Ekvayring orqali/);
  assert.match(menuBlock, /QR orqali/);

  // Ekvayring orqali sub-menu: Click + Payme only, NEVER Uzum.
  const acqMenuStart = app.indexOf('function renderAcquiringMenuHtml()');
  const acqMenuBlock = app.slice(acqMenuStart, app.indexOf('\n    }', acqMenuStart) + 6);
  assert.match(acqMenuBlock, /id: 'CLICK'/);
  assert.match(acqMenuBlock, /id: 'PAYME'/);
  assert.doesNotMatch(acqMenuBlock, /id: 'UZUM'/, 'Uzum must never be offered in the Ekvayring orqali menu');

  // Merged Click/Payme provider page exists and is wired into the router.
  assert.match(app, /function renderAcquiringProviderPageHtml\(providerId\)/);
  assert.match(app, /function renderFulfillmentPaymentsPanel\(\)[\s\S]{0,600}renderAcquiringProviderPageHtml\('CLICK'\)/);
  assert.match(app, /function renderFulfillmentPaymentsPanel\(\)[\s\S]{0,600}renderAcquiringProviderPageHtml\('PAYME'\)/);

  // Uzum's own modal/backend code is untouched (lock-in) even though no
  // admin navigation path can reach it any more (verified above/elsewhere).
  assert.match(app, /activePopupModal === 'UZUM_SETTINGS'/);
  assert.match(app, /async function openUzumSettings\(\)/);
  assert.match(app, /async function connectUzum\(\)/);
  assert.match(api, /case "click_connect"/);
  assert.match(api, /case "payme_connect"/);
  assert.match(api, /case "uzum_connect"/);
});

// ---------------------------------------------------------------------------
// Task 4: per-variant image
// ---------------------------------------------------------------------------

test('task 4: current variative image model is color-owned only; no size image editor remains, legacy size img stays backend-compatible, and removed old variant files are reference-safe cleaned after save', () => {
  assert.match(api, /type VariantInput = \{[^}]*img\?: string \| null; colorImg\?: string \| null; price\?: number \| null; oldPrice\?: number \| null[^}]*\};/s);
  const cleanStart = api.indexOf('function cleanVariants(variants: any, legacySizes?: any): VariantInput[] {');
  const cleanBlock = api.slice(cleanStart, api.indexOf('\n}', cleanStart) + 2);
  assert.match(cleanBlock, /img: v\?\.img \? normalizeProductImageUrl\(v\.img\) : null,/, 'backend must preserve legacy/imported variant images but validate them as safe HTTPS image URLs');
  assert.match(cleanBlock, /colorImg: v\?\.colorImg \? normalizeProductImageUrl\(v\.colorImg\) : null,/);
  assert.match(app, /function pickColorImage\(idx\) \{/);
  assert.doesNotMatch(app, /function pickSizeRowImage\(|function onSizeRowImagePicked\(|function removeSizeRowImage\(/, 'size-level image edit helpers must be removed, not merely hidden');
  assert.match(app, /colorImg: color\?\.img \|\| null/);
  assert.match(app, /img: null, \/\/ current UI: image belongs to color only/);
  assert.doesNotMatch(app, /vr-\$\{row\.idx\}-image-input/);
  const editBlock = actionBlock('edit_product_field');
  assert.match(editBlock, /const removedVariantImageUrls: string\[\] = \[\];/);
  assert.match(editBlock, /cleanupManagedImageIfUnreferenced\(db, shopId, url, SUPABASE_URL, "old-variant-image"\)/);
});

test('task 5: the old hardcoded-hex .ustore-msg-* bubble classes are fully gone, replaced by the app\'s existing .fc-* design tokens — a SYSTEM-authored message (the 48h auto-close note) renders as a centered plain note, never as a "mine"/"theirs" bubble', () => {
  assert.doesNotMatch(app, /ustore-msg-row|ustore-msg-bubble|ustore-reply-bar/, 'the old class names must not remain anywhere, not even as dead code');
  assert.doesNotMatch(css, /\.ustore-msg-row|\.ustore-msg-bubble/, 'the old CSS rules must be fully removed, not just superseded');
  const threadStart = app.indexOf('function renderSupportThreadHtml(messages, viewerIsAdmin)');
  const threadBlock = app.slice(threadStart, app.indexOf('\n    }', threadStart) + 6);
  assert.match(threadBlock, /if \(m\.sender === 'SYSTEM'\) \{\s*\n\s*return `<div class="fc-chat-system-note">\$\{escapeHtml\(m\.body\)\}<\/div>`;/);
  assert.match(css, /\.fc-chat-bubble\.is-mine \{ background: var\(--fc-primary\);/);
});

test('task 5 (read receipts): opening a thread (get_support_messages) marks the COUNTERPART\'s unread messages as read BEFORE selecting — an admin viewing marks USER messages read, a customer viewing marks ADMIN messages read (never marks the viewer\'s own messages) — and the frontend renders a single ✓ for an unread "mine" message, double ✓✓ once readAt is set', () => {
  const block = actionBlock('get_support_messages');
  assert.match(block, /const counterpartSender = isAdmin \? "USER" : "ADMIN";/);
  assert.match(block, /\.eq\("sender", counterpartSender\)\.is\("read_at", null\);/);
  const readMarkIdx = block.indexOf('counterpartSender');
  const selectIdx = block.indexOf('.select("*").eq("ticket_id", ticketId)');
  assert.ok(readMarkIdx >= 0 && selectIdx > readMarkIdx, 'the read-receipt update must run BEFORE the select, so the response already reflects it');
  assert.match(api, /readAt: m\.read_at \|\| null,/);

  assert.match(app, /\$\{mine && !isPending && !isFailed \? `<span class="fc-chat-ticks \$\{m\.readAt \? 'is-read' : ''\}">\$\{ICON_CHECK\}\$\{m\.readAt \? ICON_CHECK : ''\}<\/span>` : ''\}/);
});

test('task 6: sending a support message shows an immediate "Yuborilmoqda..." optimistic bubble (patched into the thread DOM in place, never a full page render — so it never yanks the reader\'s scroll position) that becomes the real message on success or a "Yuborilmadi — Qayta urinish" retry state on failure, and the fast per-thread poll (4s, get_support_messages) only runs while a thread is actually open — started on open, stopped on every exit path (back/close/switch tab)', () => {
  assert.match(app, /const tempId = `pending-\$\{Date\.now\(\)\}-\$\{Math\.random\(\)\.toString\(36\)\.slice\(2, 7\)\}`;/);
  assert.match(app, /pending: true \}\];\s*\n\s*supportReplyTarget = null;\s*\n\s*if \(textarea\) textarea\.value = '';\s*\n\s*patchSupportThread\(\{ forceBottom: true \}\);/, 'the pending bubble must be shown via a targeted DOM patch, not render()');
  assert.match(app, /function retrySupportMessage\(tempId\) \{/);
  assert.match(app, /pending: false, failed: true \} : m\)\);/);

  const pollStart = app.indexOf('function startSupportThreadPoll(ticketId)');
  const pollBlock = app.slice(pollStart, app.indexOf('\n    }', pollStart) + 6);
  assert.match(pollBlock, /\}, 4000\);/);
  assert.match(pollBlock, /if \(currentOpenSupportTicketId\(\) !== ticketId\) \{ stopSupportThreadPoll\(\); return; \}/, 'a stale poll for a ticket that is no longer open must self-terminate, not keep firing');
  assert.match(pollBlock, /if \(document\.visibilityState !== 'visible'\) return;/);

  // Started on every "open a thread" path, stopped on every generic exit path.
  for (const startCall of ["startSupportThreadPoll(ticketId);", "startSupportThreadPoll(active.id);", "startSupportThreadPoll(data.ticket.id);"]) {
    assert.ok(app.includes(startCall), `missing poll start call: ${startCall}`);
  }
  const closePageStart = app.indexOf('function closePage() {');
  assert.match(app.slice(closePageStart, closePageStart + 200), /stopSupportThreadPoll\(\);/, 'closePage() must stop the poll — it is the generic exit for the Support page among many others');
  const switchTabStart = app.indexOf('function switchTab(tab) {');
  assert.match(app.slice(switchTabStart, switchTabStart + 400), /stopSupportThreadPoll\(\);/);

  // Never polls faster than every 4s, and never runs unconditionally forever (matches the "no unnecessary polling" requirement).
  assert.doesNotMatch(app, /setInterval\([^)]*get_support_messages/, 'the poll body itself must not be an inline setInterval literal duplicating the dedicated helper');
});

// ---------------------------------------------------------------------------
// Task 7: 48h auto-close
// ---------------------------------------------------------------------------

test('task 7: support_tickets gains additive last_admin_reply_at/auto_close_at columns, support_ticket_messages.sender is widened (not replaced) to allow a SYSTEM-authored note, and a dedicated idempotent SQL function (matching the existing ustore_purge_expired_payment_drafts pattern — no new Edge Function) closes only tickets whose deadline has actually passed, reusing the EXISTING status=CLOSED/closed_at/closed_by columns (never a new status value) so every existing "closed ticket" UI path covers auto-closed tickets for free', () => {
  assert.match(mig061, /add column if not exists last_admin_reply_at timestamptz,\s*\n\s*add column if not exists auto_close_at timestamptz;/);
  assert.match(mig061, /check \(sender in \('USER', 'ADMIN', 'SYSTEM'\)\);/);
  assert.match(mig061, /add column if not exists read_at timestamptz;/);

  const fnStart = mig061.indexOf('create or replace function public.ustore_auto_close_stale_support_tickets()');
  const fnBlock = mig061.slice(fnStart, mig061.indexOf('$$;', fnStart) + 3);
  assert.match(fnBlock, /where status = 'ANSWERED'\s*\n\s*and auto_close_at is not null\s*\n\s*and auto_close_at <= now\(\)/, 'must only ever touch tickets whose deadline has genuinely passed');
  assert.match(fnBlock, /sender_tg_id, body\)\s*\n\s*values \(t\.shop_id, t\.id, 'SYSTEM', 'SYSTEM',/, 'the auto-close note must be attributed to SYSTEM, never the human admin');
  assert.match(fnBlock, /'48 soat davomida foydalanuvchidan javob kelmagani sababli murojaat avtomatik tugallandi\./);
  assert.match(fnBlock, /status = 'CLOSED', closed_at = now\(\), closed_by = 'SYSTEM_AUTO_CLOSE', auto_close_at = null/, 'must reuse the existing CLOSED state, not invent a new status value');
  assert.match(mig061, /revoke all on function public\.ustore_auto_close_stale_support_tickets\(\) from public, anon, authenticated;/);
  assert.match(mig061, /grant execute on function public\.ustore_auto_close_stale_support_tickets\(\) to service_role;/);

  const cronSetup = fs.readFileSync(path.join(root, 'supabase', 'SUPPORT_AUTO_CLOSE_CRON_SETUP.sql'), 'utf8');
  assert.match(cronSetup, /select cron\.schedule\(\s*\n\s*'support-ticket-auto-close',\s*\n\s*'0 \* \* \* \*',/, 'hourly is enough granularity for a 48h deadline');
  assert.match(cronSetup, /\$\$select public\.ustore_auto_close_stale_support_tickets\(\);\$\$/);
});

// ---------------------------------------------------------------------------
// 2026-08-31 — live-testing follow-up round: variant image picker Gallery
// fix, hero image replaced with a real swipeable gallery (not a single
// hero-swap), consistent square/contain product images everywhere, and
// per-variant optional price (server-authoritative, place_order RPC).
// ---------------------------------------------------------------------------

test('rang image picker is a device image picker and still validates the selected file before upload', () => {
  assert.match(app, /id="vc-\$\{ci\}-image-input" class="hidden" accept="image\/\*" onchange="onColorImagePicked\(event, \$\{ci\}\)"/);
  const pickedStart = app.indexOf('async function onColorImagePicked(event, idx)');
  const pickedBlock = app.slice(pickedStart, app.indexOf('\n    }', pickedStart) + 6);
  assert.match(pickedBlock, /validatePickedImageFile\(file\)/);
});

test('the per-variant-card thumbnail was removed (superseded by the swipeable hero gallery below, per direct user feedback that the image should show in the MAIN image area, not above each variant button)', () => {
  assert.doesNotMatch(app, /class="w-full h-12 object-cover rounded-lg mb-1" onerror="this\.remove\(\)"/, 'the old per-variant-card thumbnail markup must be fully gone');
});

test('product detail hero is a 1:1 swipeable gallery with one slide per color; sizes reuse the color image and variant re-render preserves page scroll', () => {
  const galleryFnStart = app.indexOf('function productGalleryImages(p)');
  const galleryFnBlock = app.slice(galleryFnStart, app.indexOf('\n    }', galleryFnStart) + 6);
  assert.match(galleryFnBlock, /key: `color:\$\{v\.color\}`/);
  assert.doesNotMatch(galleryFnBlock, /key: `variant:/, 'size-specific gallery slides are intentionally removed');
  assert.match(app, /function scrollProductGalleryToVariant\(colorName, sizeName\)/);
  assert.match(app, /function rerenderProductDetailPreserveScroll\(afterRender\)/);
  assert.match(app, /if \(next && scrollTop !== null\) next\.scrollTop = scrollTop;/);
  assert.match(css, /\.fc-product-gallery\{[^}]*aspect-ratio:1\/1[^}]*overflow-x:auto[^}]*scroll-snap-type:x mandatory/s);
  assert.match(css, /\.fc-product-gallery-slide img\{[^}]*object-fit:contain/s);
});

test('every product-image spot that used to crop with object-cover now uses object-contain (a rectangular logo/photo is shrunk to fit fully inside its box, never cropped) — the box itself (square/fixed size) is unchanged, only the fit behavior', () => {
  assert.doesNotMatch(app, /object-cover rounded-lg flex-shrink-0" loading="lazy">/, 'cart line item image must no longer crop');
  assert.doesNotMatch(app, /object-cover rounded-xl flex-shrink-0">/, 'warehouse/admin product-row images must no longer crop');
  assert.match(app, /class="w-12 h-12 object-contain bg-gray-50 rounded-lg flex-shrink-0 p-0\.5" loading="lazy"/);
});

test('per-variant price: cleanVariants() preserves an optional price field (falls back to the product\'s own price when absent, exactly like today), the frontend has a single shared variantPrice(p, size, color) helper reused by BOTH the cart and checkout-form item lists (never two independently-computed prices that could drift), and — the actual money-charging authority — place_order RPC (062-migratsiya) uses the variant\'s own price ONLY when the matched variant actually specifies one, otherwise the product\'s own price column exactly as before', () => {
  const cleanBlock = api.slice(api.indexOf('function cleanVariants(variants: any, legacySizes?: any): VariantInput[] {'), api.indexOf('\n}', api.indexOf('function cleanVariants(variants: any, legacySizes?: any): VariantInput[] {')) + 2);
  assert.match(cleanBlock, /price: optionalVariantMoney\(v\?\.price, "price"\)/);
  assert.match(api, /function optionalVariantMoney\(value: unknown, field: "price" \| "oldPrice"\)/);

  const priceFnStart = app.indexOf('function variantPrice(p, size, color)');
  const priceFnBlock = app.slice(priceFnStart, app.indexOf('\n    }', priceFnStart) + 6);
  assert.match(priceFnBlock, /return \(vPrice !== null && Number\.isFinite\(vPrice\)\) \? vPrice : Number\(p\?\.price\) \|\| 0;/);
  // Both cart and the checkout-form sheet must call the SAME helper, not
  // reimplement the "variant price or product price" fallback twice.
  const variantPriceCallSites = (app.match(/price: variantPrice\(p, size, color\)/g) || []).length;
  assert.equal(variantPriceCallSites, 2, 'expected exactly 2 call sites: renderCart() and the CHECKOUT_FORM item list');

  // place_order RPC: the override must be additive/backward-compatible —
  // when a variant has no price, v_price is untouched (still the product's
  // own RETURNING price from the row it just updated).
  assert.match(mig062, /v_price := coalesce\(\s*\n\s*nullif\(v_current_variants -> v_matched_idx ->> 'price', ''\)::numeric,\s*\n\s*v_price\s*\n\s*\);/, 'must fall back to the product\'s own price when the variant specifies none — never NULL out a price for existing non-priced variants');
  // The override is inserted strictly AFTER the RETURNING clause that sets
  // v_price from the product row, and only inside the variant-matched
  // branch (a product with no variants at all must be completely unaffected).
  const returningIdx = mig062.indexOf('returning price, name, sku, img into v_price, v_name, v_sku, v_img;');
  const overrideIdx = mig062.indexOf("v_price := coalesce(\n        nullif(v_current_variants");
  assert.ok(returningIdx >= 0 && overrideIdx > returningIdx, 'the variant-price override must run AFTER v_price is first set from the product row, or it would have nothing to fall back to');

  // Sanity: migration 062 is a full, faithful copy of 007's place_order
  // (same signature/grants) — not a divergent reimplementation that could
  // silently drop unrelated behavior (stock decrement, sold_count, gift
  // eligibility inputs, etc.) that production actually depends on.
  const sig = 'p_shop_id uuid,\n  p_tg_id text,\n  p_user_name text,\n  p_phone text,\n  p_region text,\n  p_district text,\n  p_address text,\n  p_pay_method text,\n  p_items jsonb';
  assert.ok(mig007.includes(sig) && mig062.includes(sig), 'the function signature must match exactly between the original and the redefinition');
  assert.match(mig062, /revoke all on function public\.place_order\(uuid, text, text, text, text, text, text, text, jsonb\) from public, anon, authenticated;/);
  assert.match(mig062, /grant execute on function public\.place_order\(uuid, text, text, text, text, text, text, text, jsonb\) to service_role;/);
});

// ---------------------------------------------------------------------------
// Variant entry redesign ("Ustun qo'shish" mini-modal) — per direct user
// choice (full new mini-modal design, not just adding a price field to the
// old inline table). Each variant is now added/edited through a popup
// (level1 required, level2/image/price all optional), with a grouped
// read-only summary list replacing the old always-editable table.
// ---------------------------------------------------------------------------

// BITTA SAHIFADA TUGATISH (ikkinchi tuzatish round, 2026-08-31): the
// modal-based color/size mini-oyna system was ITSELF superseded — the user
// explicitly required "hech qanday yangi modal/popup ochilmasin", so both
// "Rang qo'shish" and "O'lcham qo'shish" mini-modals were removed and
// replaced with inline cards/rows on the SAME page. Rows now reference
// their color by INDEX (colorIndex into productColorDrafts), not by name
// string — renaming a color is then a pure O(1) state update, no fan-out
// to sibling rows needed.
test("Rang+O'lcham admin builder is two-level (LIST -> focused COLOR editor), not a long inline accordion; adding a color automatically creates one size row and each color is saved independently", () => {
  assert.match(app, /let variantBuilderScreen = 'LIST';/);
  assert.match(app, /function addColorDraft\(\) \{[\s\S]*variantBuilderRows\.push\(blankVariantRow\(idx\)\);[\s\S]*variantBuilderScreen = 'COLOR';/);
  assert.match(app, /function saveActiveColorDraft\(\)/);
  assert.match(app, /function renderVariantColorsHtml\(\)/);
  assert.match(app, /function renderActiveColorEditorHtml\(\)/);
  assert.match(app, /if \(variantBuilderScreen === 'COLOR'\) return renderActiveColorEditorHtml\(\);/);
  assert.match(app, /tr\("O'lcham qo'shish"/);
  assert.match(app, /tr\("Rang qo'shish"/);
  assert.doesNotMatch(app, /Ustun qo'shish/);
});

test('ADD_PROD simple and variative flows are mutually exclusive: simple form has only the Variativ tovar switch, while ON replaces it with a separate variative builder and preserves typed name/description', () => {
  const start = app.indexOf(`if (activePopupModal === 'ADD_PROD') {`);
  const block = app.slice(start, app.indexOf(`if (activePopupModal === 'ADD_CAT') {`, start));
  assert.match(block, /if \(isVariativeProductDraft\) \{/);
  assert.match(block, /if \(variantBuilderScreen === 'COLOR'\)/);
  assert.match(block, /Variativ tovar qo'shish/);
  assert.match(block, /onchange="toggleVariativeProductDraft\(\)"/);
  assert.match(app, /function toggleVariativeProductDraft\(\) \{\s*syncProductFormDraftFromDom\(\);/);
  assert.match(app, /function backToSimpleProductForm\(\)/);
  assert.doesNotMatch(block, /Ustun qo'shish/);
});

test('current price is mandatory for every variative color+size combination; old price is optional and there is no product-level fallback price UI in the variative builder', () => {
  assert.match(app, /<label for="vr-\$\{row\.idx\}-price">\$\{tr\('Narx \*','Цена \*'\)\}<\/label>/);
  assert.match(app, /<label for="vr-\$\{row\.idx\}-oldprice">\$\{tr\('Eski narx','Старая цена'\)\}<\/label>/);
  assert.match(app, /if \(r\.price === '' \|\| !Number\.isFinite\(price\) \|\| price < 0\)/);
  assert.match(app, /const canonical = variants\[0\];\s*\n\s*price = Math\.max\(0, Number\(canonical\.price\) \|\| 0\);/);
  assert.doesNotMatch(app, /Narx ixtiyoriy/);
  assert.doesNotMatch(app, /Asosiy narx \(fallback\)/);
});

test('support chat speed fix: no duplicate progress toast + no duplicate/conflicting poll', () => {
  // Root cause #1: apiActionNeedsProgress() endi send_support_message'ni
  // chetlab o'tadi — aks holda submitSupportComposer()ning o'z optimistik
  // "Yuborilmoqda..." bubble'i bilan raqobatlashadigan generik toast chiqardi.
  const gateStart = app.indexOf('function apiActionNeedsProgress(action)');
  const gateBlock = app.slice(gateStart, app.indexOf('\n    }', gateStart) + 6);
  assert.match(gateBlock, /send_support_message/, 'send_support_message must be exempted from the generic progress toast');

  // Root cause #2: startBackgroundPolling()dagi ESKI 90s support-thread
  // poll (loadSupportMessages(activeTicketId, true) — TO'LIQ render(),
  // scroll/focus saqlanmaydi) olib tashlandi — bu YANGI dedikatsiya
  // qilingan 4s poll (startSupportThreadPoll/patchSupportThread, targeted
  // DOM patch) bilan bir vaqtda ishlab, chatni "qotib qolgandek" ko'rsatardi.
  const pollStart = app.indexOf('function startBackgroundPolling');
  const pollEnd = app.indexOf('\n    }', app.indexOf('}, 90000)', pollStart));
  const pollBlock = app.slice(pollStart, pollEnd);
  assert.doesNotMatch(pollBlock, /loadSupportMessages\(activeTicketId, true\)/, 'the redundant 90s open-thread poll must not be in the shared background poll');

  // The dedicated fast poll must still exist and actually be a lightweight
  // patch, not a full render() (which would itself reset scroll/focus).
  assert.match(app, /function startSupportThreadPoll/);
  assert.match(app, /function stopSupportThreadPoll/);
  assert.match(app, /function patchSupportThread/);
  const patchFnStart = app.indexOf('function patchSupportThread');
  const patchFnBlock = app.slice(patchFnStart, app.indexOf('\n    }', patchFnStart) + 6);
  assert.doesNotMatch(patchFnBlock, /\brender\(\)/, 'patchSupportThread must patch the DOM directly, never call the full render()');
});

// Jonli sinov (2026-08-31), item 3: bosh sahifadagi banner karuselining
// cheksiz-loop "sakrash" joyida (oxiridan boshiga / boshidan oxiriga)
// bir lahza xira/kichraytirilgan holatga tushib, keyin CSS transition
// bilan "otilib chiqib" ko'rinardi — jonli brauzerda tasdiqlangan
// root-cause: element.style.transition='none' (!important stylesheet
// qoidasini yenga olmaydi) o'rniga endi teng-specificity ustore.css
// klassi (.is-jump-instant) ishlatiladi.
test('banner carousel loop keeps only boundary clones and does not use the old transition-kill hack', () => {
  const fnStart = app.indexOf('function initBannerCarousel()');
  assert.ok(fnStart >= 0, 'initBannerCarousel must exist');
  const fnBlock = app.slice(fnStart, fnStart + 5500);
  assert.match(fnBlock, /const initialIndex = 0;/);
  assert.match(fnBlock, /centerCard\(originalCards\[initialIndex\], 'auto'\)/);
  assert.match(fnBlock, /cloneNode\(true\)/);
  assert.doesNotMatch(fnBlock, /jumpWithoutSnap|is-jump-instant/);

  const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
  assert.doesNotMatch(css, /\.fc-banner-card\.is-jump-instant\{transition:none!important\}/);
});

// CORRECTION ROUND (tasdiqlangan, 2026-08-31), item 10/12/14: customer variant
// picker converted from multi-select (checkbox-style, several variants at
// once) to single-select (radio-style, one at a time) — confirmed with the
// user because the two were mutually exclusive with the spec's "tanlangan
// variant narxi/qoldig'i tepada" requirement. The multi-select capability is
// intentionally gone; this test locks in the new single-select contract.
// FINAL CORRECTION (tasdiqlangan spec, 2026-08-31), items 7/8/9/10: the
// earlier single-select (radio-style) conversion was ITSELF reverted per a
// new, more detailed spec — the user explicitly wants a HYBRID model: one
// "active" variant for PREVIEW (image/price/stock at the top) that is fully
// INDEPENDENT from quantity state, where EVERY variant keeps its own
// quantity stepper and multiple can be nonzero at once (matching the
// original multi-select cart behavior, layered under the new preview UX).
// VARIATIV TOVAR QAYTA QURISH (Uzum Market uslubi, 2026-08-31): the earlier
// multi-select HYBRID model (several color+size combos with independent
// quantities, all addable at once) was ITSELF superseded per the new,
// AskUserQuestion-confirmed spec — a single active combination now (color
// then size, in that order), matching Uzum: only ONE color+size can be
// "being configured" at a time. Quantity is expressed by the EXISTING
// simple-product cart pattern (not-in-cart -> "Savatga qo'shish"; in-cart
// -> qty +/- + "Savatchaga o'tish") rather than a pre-add quantity picker.
test("customer variant picker is Uzum-style Rang -> O'lcham: selection changes active combination/hero/price/stock but never auto-increments quantity; qty=0 shows Add-to-cart and qty>0 shows the inline stepper", () => {
  const colorStart = app.indexOf('function selectColor(name)');
  const colorBlock = app.slice(colorStart, app.indexOf('\n    }', colorStart) + 6);
  const sizeStart = app.indexOf('function selectSize(name)');
  const sizeBlock = app.slice(sizeStart, app.indexOf('\n    }', sizeStart) + 6);
  assert.match(colorBlock, /activeColorName = name;/);
  assert.match(sizeBlock, /activeSizeName = name;/);
  assert.doesNotMatch(colorBlock, /addVariantItemsToCart|changeActiveVariantCartQty/);
  assert.doesNotMatch(sizeBlock, /addVariantItemsToCart|changeActiveVariantCartQty/);
  assert.match(app, /onclick="addVariantToCart[^>]*class="fc-variant-add-cart"/);
  assert.match(app, /class="fc-variant-cart-inline"/);
  assert.match(app, /class="fc-customer-variant-stepper"/);
  assert.match(app, /rerenderProductDetailPreserveScroll/);
});

test('product image previews use fixed/consistent containers with object-contain rather than crop', () => {
  assert.match(css, /\.fc-image-preview-square\{[^}]*aspect-ratio:1\/1[^}]*object-fit:contain/s);
  assert.doesNotMatch(app, /id="(?:m-cat-prev|ec-img-prev)"/);
  assert.match(app, /id="ef-img-prev"[^>]*object-contain/);
});

test('item 18: product/variant images share one 1:1 size-guidance hint (JPG/PNG/WEBP, recommended 1200×1200, minimum 800×800 — soft guidance, never a hard upload block), and the image containers use aspect-ratio (not a fixed px height) so they stay truly square at any card width', () => {
  const hintFnStart = app.indexOf('function productImageSizeHintHtml()');
  assert.ok(hintFnStart >= 0, 'a single shared hint helper must exist, reused everywhere (not copy-pasted text)');
  const hintFnBlock = app.slice(hintFnStart, app.indexOf('\n    }', hintFnStart) + 6);
  assert.match(hintFnBlock, /1:1/);
  assert.match(hintFnBlock, /1200×1200/);
  assert.match(hintFnBlock, /800×800/);

  const hintCallSites = (app.match(/\$\{productImageSizeHintHtml\(\)\}/g) || []).length;
  assert.equal(hintCallSites, 2, 'variative products no longer expose a product-level or per-size image field; the shared hint remains on normal product image/edit flows');

  // JPG/PNG/WEBP was already enforced app-wide via validatePickedImageFile —
  // confirm it is not weakened/duplicated by this round.
  assert.match(app, /const SUPPORTED_IMAGE_MIME = new Set\(\['image\/jpeg', 'image\/png', 'image\/webp'\]\);/);

  // Square containers must resize proportionally with their box, not be
  // pinned to a fixed height regardless of width.
  const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
  assert.match(css, /\.fc-img-square\{aspect-ratio:1\/1;width:100%;height:auto\}/, 'a shared square utility must exist (this project\'s pre-compiled CSS has no Tailwind aspect-square)');
  assert.match(app, /class="fc-img-square rounded-xl mb-2 bg-gray-50 overflow-hidden flex items-center justify-center p-1\.5"/, 'the catalog card image box must use the proportional square utility, not a fixed h-32');
  assert.doesNotMatch(app, /class="w-full h-32 rounded-xl mb-2 bg-gray-50 overflow-hidden flex items-center justify-center p-1\.5"/, 'the old fixed-height version must be fully replaced');
  assert.match(css, /\.fc-product-gallery\{display:flex;width:100%;aspect-ratio:1\/1;/, 'the product-detail swipeable gallery must also be a proportional square, not a fixed 12rem height');
});

// FINAL CORRECTION (tasdiqlangan spec, 2026-08-31), items 1/2/4: a full-file
// search (frontend AND shop-api) found NO code anywhere that averages,
// means, or sums-then-divides variant prices — item 1's symptom traced back
// to the REAL root cause instead: the catalog card always rendered the
// product's own base price/image, completely ignoring variants, so it never
// reflected any specific variant's actual price (and stayed blank when the
// product had no image of its own even though a variant did).
test('variant prices are never averaged; product card uses the default first-color/first-available-size context consistently for image/current/old price', () => {
  assert.doesNotMatch(app, /variant[^\n]{0,80}(average|avg|mean)/i);
  const cardStart = app.indexOf('function renderProductCardHTML(p, idx, totalLen)');
  const cardBlock = app.slice(cardStart, app.indexOf('\n    }', cardStart) + 6);
  assert.match(cardBlock, /const defaultSelection = vars\.length \? defaultVariantSelection\(p\) : null;/);
  assert.match(cardBlock, /const fallbackVariant = defaultSelection\?\.variant \|\| canonicalFallbackVariant\(p\);/);
  assert.match(cardBlock, /variantDisplayImage\(p, fallbackVariant\.size, fallbackVariant\.color\)/);
  assert.match(cardBlock, /const cardPrice = fallbackVariant \? variantPrice\(p, fallbackVariant\.size, fallbackVariant\.color\) : p\.price;/);
  assert.match(cardBlock, /const cardOldPrice = fallbackVariant \? \(fallbackVariant\.oldPrice \?\? null\) : p\.oldPrice;/);
});

test('Billz import already speaks the new Rang(color)/O\'lcham(size) model — no backend Billz code needed to change: attribute-name regex maps rang/color/цвет -> color and o‘lcham/size/размер -> size, billzProductId is the sync identity (never name-matching), no fake color/size is fabricated for a non-variative Billz product, and per-variant price/stock are never averaged', () => {
  const browseBlock = actionBlock('billz_browse_products');
  assert.match(browseBlock, /size: findAttr\(v\.product_attributes, \/o\.\?lcham\|size\|размер\/i\),/, 'O\'lcham maps from the size-ish Billz attribute — matches the new model\'s child dimension');
  assert.match(browseBlock, /color: findAttr\(v\.product_attributes, \/rang\|color\|цвет\/i\),/, 'Rang maps from the color-ish Billz attribute — matches the new model\'s parent dimension');
  assert.match(browseBlock, /billzProductId: String\(v\.id\),/, 'each Billz variant child carries its OWN id forward — this is the sync identity, never a name-match');
  assert.match(browseBlock, /variants: Array\.isArray\(p\.variations\) \? p\.variations\.map\(mapVariantChild\) : \[\],/, 'a non-variative Billz product gets an EMPTY variants array — no synthetic color/size is ever fabricated');

  const importBlock = actionBlock('billz_import_products');
  assert.match(importBlock, /billzProductId: v\.billzProductId,/, 'billzProductId survives the browse->import payload hop, per variant');
  assert.match(importBlock, /const finalStock = variantsWithSku\s*\n\s*\? variantsWithSku\.reduce\(\(sum, v\) => sum \+ \(Number\(v\.qty\) \|\| 0\), 0\)/, 'product-level stock is a real SUM of each variant\'s own stock, never an average');
  assert.doesNotMatch(importBlock, /reduce\([^)]*\/\s*\w+\.length/, 'no divide-by-count anywhere in the import path — confirms no averaging math exists');
});

// ============================================================================
// 4 TA YANGI TOPSHIRIQNI IMPLEMENT QILISH (2026-09-01)
// 1) variativ tovar UX/UI qayta tashkil (per-size optional image fallback,
//    price/oldPrice optional again with base-price fallback), 2) barcha rasm
//    upload joylari icon-only, 3) wordmark generator uchun 3-so'z/20-belgi
//    limiti, 4) root-cause: rang/o'lcham bosilganda umumiy xato toasti.
// ============================================================================
const platformApp = fs.readFileSync(path.join(root, 'platform', 'platform-app.js'), 'utf8');
const platformCss = fs.readFileSync(path.join(root, 'platform', 'platform.css'), 'utf8');

test('task 4 root-cause: color/size onclick handlers HTML-escape their JSON.stringify() argument so a plain name (e.g. "Qora") — and one containing a quote/apostrophe — never breaks the surrounding double-quoted onclick attribute into invalid JS', () => {
  assert.match(app, /onclick="selectColor\(\$\{escapeHtml\(JSON\.stringify\(c\.name\)\)\}\)"/, 'color swatch onclick must escape the JSON string before it lands inside the double-quoted attribute');
  assert.match(app, /onclick="selectSize\(\$\{escapeHtml\(JSON\.stringify\(v\.size\)\)\}\)"/, 'size chip onclick must escape the JSON string before it lands inside the double-quoted attribute');
  // Live-repro-confirmed root cause: `onclick="selectColor(${JSON.stringify(c.name)})"` without
  // escapeHtml() renders as `onclick="selectColor("Qora")"` — the attribute value parser stops at
  // the FIRST unescaped ", truncating the handler to invalid JS ("selectColor(") which throws
  // "SyntaxError: Unexpected end of input" on click, caught by the global handler and shown as
  // the generic "Xatolik yuz berdi..." toast. This exact plain (un-escaped) pattern must be gone.
  assert.doesNotMatch(app, /onclick="selectColor\(\$\{JSON\.stringify\(c\.name\)\}\)"/, 'the un-escaped, HTML-breaking pattern must not reappear');
  assert.doesNotMatch(app, /onclick="selectSize\(\$\{JSON\.stringify\(v\.size\)\}\)"/, 'the un-escaped, HTML-breaking pattern must not reappear');
});

test('item 1.8 root-cause: renderModalContainer() unconditionally re-paints lucide icons on every exit path (try/finally), so a caller that forgets safeCreateIcons() (e.g. the color/size inline CRUD handlers) never leaves a freshly-inserted <i data-lucide> as an invisible "empty square" — confirmed live: the qty +/- stepper icons render as real <svg> elements', () => {
  const renderStart = app.indexOf('function renderModalContainer() {');
  assert.ok(renderStart >= 0);
  const tryStart = app.indexOf('try {', renderStart);
  assert.ok(tryStart >= 0 && tryStart - renderStart < 1200, 'the function body must be wrapped in try/finally near its top');
  const finallyBlock = app.slice(app.indexOf('} finally {', tryStart), app.indexOf('}', app.indexOf('} finally {', tryStart) + 20) + 1);
  assert.match(finallyBlock, /safeCreateIcons\(\);/, 'safeCreateIcons() must run in the finally block, guaranteed regardless of which branch/early-return fired');
});

test("variative image fallback is color image -> product image -> any legacy variant image -> no-image; size never owns its own image", () => {
  const fnStart = app.indexOf('function variantDisplayImage(p, size, color)');
  const fnBlock = app.slice(fnStart, app.indexOf('\n    }', fnStart) + 6);
  assert.match(fnBlock, /const colorImg = variantColorImage\(p, color\);/);
  assert.match(fnBlock, /if \(colorImg\) return colorImg;/);
  assert.match(fnBlock, /if \(hasProductImage\(p\)\) return p\.img;/);
  assert.match(fnBlock, /const fallbackVariant = productVariants\(p\)\.find\(\(x\) => x\.colorImg \|\| x\.img\);/);
  assert.match(fnBlock, /return fallbackVariant\?\.colorImg \|\| fallbackVariant\?\.img \|\| FALLBACK_IMG;/);
  assert.doesNotMatch(fnBlock, /if \(v\?\.img\)/, 'the selected size no longer has an independent image');
  const callSites = (app.match(/img: variantDisplayImage\(p, size, color\)/g) || []).length;
  assert.equal(callSites, 2);
});

test('variative add form has no product-level fallback price fields: each color+size current price is required and products.price is only a backward-compatible canonical value from the first variant', () => {
  const addProdStart = app.indexOf(`if (activePopupModal === 'ADD_PROD') {`);
  const addProdBlock = app.slice(addProdStart, app.indexOf(`if (activePopupModal === 'ADD_CAT') {`, addProdStart));
  const variativePart = addProdBlock.slice(addProdBlock.indexOf('if (isVariativeProductDraft)'), addProdBlock.indexOf('// Oddiy tovar'));
  assert.doesNotMatch(variativePart, /m-prod-price/);
  assert.doesNotMatch(variativePart, /Asosiy narx \(fallback\)/);
  assert.match(variativePart, /renderVariantBuilderHtml\(\)/);
  const saveStart = app.indexOf('async function saveProductFromModal()');
  const saveBlock = app.slice(saveStart, app.indexOf('\n    }', saveStart) + 6);
  assert.match(saveBlock, /const canonical = variants\[0\];/);
  assert.match(saveBlock, /price = Math\.max\(0, Number\(canonical\.price\) \|\| 0\);/);
});

test('task 2 legacy icon-first styling remains, while current visual-content forms may expose compact URL fields without old verbose fallback labels', () => {
  assert.doesNotMatch(app, />\s*Xotiradan yuklash\s*</);
  assert.doesNotMatch(app, /Rasm URL \(ixtiyoriy\)/);
  assert.match(app, /id="m-prod-image-button"[^>]*class="fc-image-icon-action"[^>]*aria-label=/);
  assert.match(app, /onclick="pickColorImage\(\$\{ci\}\)" class="fc-image-icon-action"/);
  assert.match(app, /onclick="removeColorImage\(\$\{ci\}\)" class="fc-image-icon-action is-danger"/);
  assert.match(css, /\.fc-image-icon-action,\.fc-icon-plain\{[^}]*border:0!important;[^}]*background:transparent!important/s);
  assert.match(css, /button\[onclick\*="openImagePickerSheet"\]\{[^}]*background:transparent!important;[^}]*border:0!important/s);
  assert.match(platformApp, /class="plat-upload-zone is-compact is-icon-only"[^>]*aria-label="Rasm tanlash"/);
  assert.match(platformCss, /\.plat-upload-zone\.is-icon-only\{[^}]*border:0!important;[^}]*background:transparent!important/s);
  assert.doesNotMatch(platformApp, /Yoki rasm URL <em>fallback<\/em>/);
});

test('task 3: the wordmark generator uses a SEPARATE short-name field (not the official shop-name field) capped at 3 words / 20 characters, with a live char/word counter and save-time validation — the official shop name is never touched by this feature', () => {
  assert.match(app, /const WORDMARK_MAX_CHARS = 20;/);
  assert.match(app, /const WORDMARK_MAX_WORDS = 3;/);
  assert.match(app, /function clampWordmarkText\(text\) \{/);
  assert.match(app, /function wordmarkWordCount\(text\) \{/);

  // Live counter: rendered on open and kept live via oninput, shows both
  // char and word counts, and turns visibly "over" without hard-blocking typing.
  assert.match(app, /function wordmarkCounterHtml\(\) \{/);
  assert.match(app, /\$\{chars\}\/\$\{WORDMARK_MAX_CHARS\} \$\{tr\('belgi', 'симв\.'\)\} · \$\{words\}\/\$\{WORDMARK_MAX_WORDS\} \$\{tr\("so'z", 'слова'\)\}/);
  assert.match(app, /maxlength="\$\{WORDMARK_MAX_CHARS\}" oninput="setWordmarkDraftText\(this\.value\)"/);
  assert.match(css, /\.fc-wordmark-counter\.is-over \{ color: var\(--fc-danger, #dc2626\); \}/);

  // The official shop-name field (sc-name) is a completely separate DOM id
  // and state variable (shopInfoDraft.name / shopContact.name) — the
  // wordmark's own draft (wordmarkDraftText) is a distinct piece of state
  // that openWordmarkGenerator() only SEEDS from the shop name (once, clamped),
  // it never writes back to it.
  assert.doesNotMatch(app, /wordmarkDraftText\s*=\s*.*\.name\s*=/, 'the wordmark draft must never assign back into any .name field');
  const openStart = app.indexOf('function openWordmarkGenerator() {');
  const openBlock = app.slice(openStart, app.indexOf('\n    }', openStart) + 6);
  assert.match(openBlock, /wordmarkDraftText = clampWordmarkText\(shopLogoWordmark\?\.text \|\| currentShopNameForWordmark\(\)\);/, 'the seeded default must be clamped to the new limit immediately, not left to overflow until the first keystroke');

  // Save-time validation: word count is enforced with a clear, non-crashing message.
  const saveWmStart = app.indexOf('async function saveWordmarkLogo() {');
  const saveWmBlock = app.slice(saveWmStart, app.indexOf('\n    }', saveWmStart) + 6);
  assert.match(saveWmBlock, /if \(wordmarkWordCount\(text\) > WORDMARK_MAX_WORDS\) return showAppNotice\(/);
});

// ---------------------------------------------------------------------------
// "To'lov usullari" restructure (2026-09-05): 4-category page + Ekvayring
// sub-menu (Click/Payme only) + merged provider pages + verification gating.
// ---------------------------------------------------------------------------

test('no 💳 emoji remains in any of the NEW/CHANGED payment UI (4-category menu, Ekvayring sub-menu, merged Click/Payme provider page, the Sinash pending-notice copy) — row icons now come from the existing inline-SVG icon system (ICON_CASH/ICON_CARD/ICON_BOLT/ICON_QR); the untouched UZUM_SETTINGS modal (out of scope, left exactly as the user required) is the one deliberate exception and is excluded from this check', () => {
  for (const fnName of ['renderPaymentsMenuHtml', 'renderAcquiringMenuHtml', 'renderAcquiringProviderPageHtml', 'renderPaymentMethodSettings', 'clickPaymentVerifyBlockHtml']) {
    const start = app.indexOf(`function ${fnName}(`);
    assert.ok(start >= 0, `${fnName} not found`);
    const block = app.slice(start, app.indexOf('\n    }', start) + 6);
    assert.doesNotMatch(block, /💳/, `${fnName} must not contain a 💳 emoji`);
  }
  assert.doesNotMatch(app, /activePopupModal === 'CLICK_SETTINGS'|activePopupModal === 'PAYME_SETTINGS'/, 'the old standalone Click/Payme modals (which used to carry 💳 headers) must be fully retired');
});

test('renderPaymentMethodSettings uses method.name for the label and never shows the QR icon/label for a non-QR method (root-cause fix for Payme showing up as "QR orqali" with a QR icon)', () => {
  const fnStart = app.indexOf('function renderPaymentMethodSettings(method)');
  const fnBlock = app.slice(fnStart, app.indexOf('\n    }', fnStart) + 6);
  assert.match(fnBlock, /const label = method\.name;/, 'label must come from method.name, not a hardcoded ternary that mislabels PAYME/CLICK as QR');
  assert.match(fnBlock, /method\.id === 'QR' \? ICON_QR : ICON_BOLT/, 'ICON_QR must be reserved for the actual QR method id, everything else (CLICK/PAYME/UZUM) falls back to ICON_BOLT');
});

test('the 4-category "To\'lov usullari" menu and the merged Click/Payme provider page are wired into renderFulfillmentPaymentsPanel(), the single router used by both a full render() and the lighter #fulfillment-panel patch', () => {
  const fnStart = app.indexOf('function renderFulfillmentPaymentsPanel()');
  const fnBlock = app.slice(fnStart, app.indexOf('\n    }', fnStart) + 6);
  assert.match(fnBlock, /return renderPaymentsMenuHtml\(\);/);
  assert.match(fnBlock, /paymentsPageView === 'ACQUIRING_MENU'\) return renderAcquiringMenuHtml\(\);/);
  assert.match(fnBlock, /paymentsPageView === 'CASH' \|\| paymentsPageView === 'CARD' \|\| paymentsPageView === 'QR'/, 'Naqd/Karta/QR must each get their own dedicated inner page view');
});

test('the "To\'lov usullari" page header/back-button recompute from paymentsPageView at every level (MENU -> closes the settings page, CASH/CARD/ACQUIRING_MENU/QR -> back to MENU, Click/Payme provider pages -> back to ACQUIRING_MENU) — never jumps straight to Profile from a nested level', () => {
  assert.match(app, /ACQUIRING_CLICK: "setPaymentsPageView\('ACQUIRING_MENU'\)"/);
  assert.match(app, /ACQUIRING_PAYME: "setPaymentsPageView\('ACQUIRING_MENU'\)"/);
  assert.match(app, /MENU: 'closeFulfillmentSettingsPage\(\)'/);
});

test('saving payment settings from any inner page (e.g. mid-way through Click/Payme setup) re-renders in place and never forces navigation back to MENU or Profile — saveFulfillmentSettings() never touches paymentsPageView or activePage', () => {
  const fnStart = app.indexOf('async function saveFulfillmentSettings()');
  const fnBlock = app.slice(fnStart, app.indexOf('\n    }', fnStart) + 6);
  assert.doesNotMatch(fnBlock, /paymentsPageView\s*=/, 'must not reset paymentsPageView on save');
  assert.doesNotMatch(fnBlock, /closeFulfillmentSettingsPage\(\)|activePage\s*=/, 'must not navigate away from the current page on save');
});

test('new shops always see all 4 payment categories (Naqd/Karta/Ekvayring/QR are never conditioned on any existing config data) and Click/Payme default OFF until the admin completes credential+3x-verify+region flow', () => {
  const menuStart = app.indexOf('function renderPaymentsMenuHtml()');
  const menuBlock = app.slice(menuStart, app.indexOf('\n    }', menuStart) + 6);
  assert.doesNotMatch(menuBlock, /fulfillmentDraft\.payments\.methods\.find|fulfillmentConfig\.payments/, 'the 4 rows must be static/always-present, not conditioned on saved config existing');
  assert.match(api, /\{ id: "CLICK", name: "Click orqali \(avtomatik\)", enabled: false, regions: \{\} \}/, 'default seed keeps CLICK off for brand-new shops');
  assert.match(api, /\{ id: "PAYME", name: "Payme orqali \(avtomatik\)", enabled: false, regions: \{\} \}/, 'default seed keeps PAYME off for brand-new shops');
});

// ---------------------------------------------------------------------------
// Lifecycle round (2026-09-06): boot() must tell a FROZEN/TERMINATED shop's
// mini-app apart from a real network error, instead of the old one-size-
// fits-all "check your internet, try again" message.
// ---------------------------------------------------------------------------

test('boot()\'s catch block distinguishes shop_frozen (reversible — keeps the Qayta urinish/retry button) from shop_terminated/unknown_or_disabled_bot (permanent — no retry button) from every other error (unchanged generic network-error message)', () => {
  const start = app.indexOf('async function boot()');
  const catchStart = app.indexOf('} catch (e) {', start);
  const block = app.slice(catchStart, app.indexOf('\n      }', catchStart) + 6);
  assert.match(block, /const isFrozen = code === 'shop_frozen';/);
  assert.match(block, /const isGone = code === 'shop_terminated' \|\| code === 'unknown_or_disabled_bot';/);
  assert.match(block, /Bu do'kon vaqtincha faoliyatini to'xtatgan/);
  assert.match(block, /Bu do'kon endi mavjud emas/);
  // The retry button is rendered ONLY inside the `isFrozen ? ... : ''`
  // ternary — since isFrozen/isGone are mutually exclusive by definition
  // (shop_frozen vs. shop_terminated/unknown_or_disabled_bot), this alone
  // proves the permanent (isGone) case never shows a pointless retry button.
  assert.match(block, /\$\{isFrozen \? `<br><br><button type="button" onclick="boot\(\)" class="fc-btn fc-btn-primary">\$\{tr\('Qayta urinish', 'Повторить'\)\}<\/button>` : ''\}/, 'a frozen shop keeps the retry button since it can become ACTIVE again; a gone shop gets an empty string instead');
  // The old generic message/button must still exist for genuine network errors.
  assert.match(block, /Ma'lumotlarni yuklab bo'lmadi/);
});
