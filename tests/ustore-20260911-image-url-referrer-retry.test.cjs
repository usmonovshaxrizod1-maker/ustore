const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');

function block(startNeedle, endNeedle, limit = 2500) {
  const start = app.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing ${startNeedle}`);
  const end = endNeedle ? app.indexOf(endNeedle, start + startNeedle.length) : -1;
  return app.slice(start, end > start ? end : start + limit);
}

// Real bug, reported live 2026-09-11: an external image URL the admin had
// used successfully 5-6 times across several products started showing
// "Rasmni bu URL orqali ko'rsatib bo'lmadi" (couldn't display the image via
// this URL) for what was still a genuinely valid URL. Root-caused to the
// browser's plain <img> onerror firing — most likely because a third-party
// image host's hotlink/referrer protection blocks requests once it sees the
// Telegram Mini App's own page as the referrer, and/or a single transient
// network hiccup was treated as a permanent "broken URL" verdict with zero
// retry. Fixed two ways: (1) referrerpolicy="no-referrer" on every <img> tag
// that loads a dynamic/external product-owner-entered image URL, so hosts
// with referrer-based hotlink protection are not tripped by our own domain
// leaking as the referrer; (2) onImageUrlInput's preview now retries once
// (cache-busted) before showing the "couldn't display" error, so a single
// transient failure doesn't get misreported as a dead link.
test('every dynamically-sourced <img> tag (product/category/banner/bundle/order/profile/preview) carries referrerpolicy="no-referrer"', () => {
  const targets = [
    'class="fc-home-recent-card fc-image-card"><img referrerpolicy="no-referrer" src="${escapeHtml(p.thumbImg || p.img',
    '<img referrerpolicy="no-referrer" loading="${idx < 6 ? \'eager\' : \'lazy\'}" fetchpriority="${idx < 6 ? \'high\' : \'auto\'}" decoding="async" src="${escapeHtml(cardImg',
    '<img referrerpolicy="no-referrer" src="${escapeHtml(item.img',
    '<img referrerpolicy="no-referrer" src="${escapeHtml(i.img)}" onerror="this.style.display',
    '<img referrerpolicy="no-referrer" id="banner-image-prev"',
    '<img referrerpolicy="no-referrer" id="bundle-image-prev"',
    '<img referrerpolicy="no-referrer" id="m-prod-prev"',
    '<img referrerpolicy="no-referrer" id="miq-img-prev"',
    '<img referrerpolicy="no-referrer" id="ef-img-prev"',
    '<img referrerpolicy="no-referrer" src="${escapeHtml(img.url)}"',
    '<img src="${escapeHtml(supportAttachmentDraft.previewUrl)}" alt="" referrerpolicy="no-referrer"',
    '<img src="${escapeHtml(m.attachment.url)}" alt="${escapeHtml(m.attachment.name',
  ];
  for (const t of targets) assert.ok(app.includes(t), `missing referrerpolicy on: ${t}`);
});

test('onImageUrlInput retries once through the image proxy before showing the error, and keeps the original URL as the saved value', () => {
  const fn = block('function onImageUrlInput(value, previewId, errorId, buttonId) {', '\n    }\n\n    function xlImageText');
  assert.match(fn, /let retriedOnce = false;/);
  assert.match(fn, /if \(!retriedOnce\) \{/);
  assert.match(fn, /preview\.src = 'https:\/\/wsrv\.nl\/\?url=' \+ encodeURIComponent\(validUrl\) \+ '&w=300';/);
  assert.match(fn, /tempImageUrl = validUrl;/, 'the SAVED value must stay the clean URL, never the cache-busted retry src');
  assert.doesNotMatch(fn, /tempImageUrl = .*wsrv/, 'proxy URL must never be assigned into tempImageUrl');
});

test('QR-code reading (payment merchant QR) is unaffected — it decodes an uploaded local file via BarcodeDetector, never loads an external image URL over the network', () => {
  const fn = block('async function tryAutoFillQrPaymentUrlFromFile(providerId, file) {', 'async function ', 1500);
  assert.match(fn, /new BarcodeDetector/);
  assert.match(fn, /createImageBitmap\(file\)/, 'reads the local File object directly — no network fetch, so hotlink/referrer blocking cannot apply here');
  assert.doesNotMatch(fn, /\.src\s*=/, 'no <img src=...> network load in the QR decode path');
});

test('cache version bumped for this fix', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /ustore-shop-app\.js\?v=325/);
});

