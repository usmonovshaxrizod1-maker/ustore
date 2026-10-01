const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'ustore.css'), 'utf8');
const api = fs.readFileSync(path.join(root, 'supabase/functions/shop-api/index.ts'), 'utf8');

test('welcome modal is fully removed without removing the boot loader', () => {
  assert.doesNotMatch(app, /ADMIN_WELCOME|showAdminWelcomeModal|fc-welcome-card/);
  assert.doesNotMatch(css, /\.fc-welcome-(overlay|card|primary|secondary)/);
  assert.match(css, /\.fc-boot-welcome-loader/);
});

test('featured categories use update + insert fallback and a centered saving indicator', () => {
  const apiStart = api.indexOf('case "set_featured_categories"');
  const apiBlock = api.slice(apiStart, apiStart + 3200);
  assert.match(apiBlock, /\.update\(\{ featured_category_ids: entries/);
  assert.match(apiBlock, /if \(!updated\)/);
  assert.match(apiBlock, /\.insert\(\{ shop_id: shopId, featured_category_ids: entries \}\)/);
  assert.doesNotMatch(apiBlock, /\.upsert\(/);
  assert.match(app, /fc-featured-save-float[\s\S]{0,900}data-lucide="check"/);
  assert.match(app, /fc-featured-save-float[\s\S]{0,900}fc-featured-save-spinner/);
  assert.match(css, /\.fc-featured-save-spinner/);
});

test('abandoned cart bulk controls distinguish page selection from all matching selection', () => {
  assert.match(app, /function selectEligibleAbandonedOnPage\(/);
  assert.match(app, /function selectAllEligibleAbandonedMatching\(/);
  assert.match(app, /Shu sahifadagilar/);
  assert.match(app, /Filtrga mos hammasi/);
  assert.match(app, /👥/);
  assert.match(app, /📨/);
});

test('audit log has arbitrary calendar range and Uzbek labels', () => {
  assert.match(app, /auditLogDateFrom/);
  assert.match(app, /auditLogDateTo/);
  assert.match(app, /type="date"/);
  assert.doesNotMatch(app, /auditLogDatePreset/);
  assert.match(app, /ORDER_STATUS_CHANGED:'Buyurtma holati o‘zgartirildi'/);
  assert.match(app, /SUPPORT_TICKET_MESSAGE:'Murojaatga xabar yozildi'/);
  assert.match(app, /discount_tier_group:'Chegirma guruhi'/);
});

test('support first message is optimistic with spinner, ticks, retry and registered customer data', () => {
  assert.match(app, /supportPendingFirstMessage/);
  assert.match(app, /sendPendingFirstSupportMessage/);
  assert.match(app, /fc-chat-pending-dot/);
  assert.match(app, /circle-alert/);
  assert.match(app, /rotate-cw/);
  assert.match(app, /m\.readAt \? '✓✓' : '✓'/);
  assert.doesNotMatch(app, />💬 \$\{openTicket\.orderId/);
  assert.match(api, /profile_first_name,profile_last_name,first_name,last_name,username,phone/);
  assert.match(api, /customer: customerById/);
  assert.match(app, /customer\?\.name \|\| summaryName/);
});

test('task 5 follow-up removes whole-card loading gates', () => {
  assert.match(app, /function revealCoordinatedImage/);
  assert.doesNotMatch(css, /\.fc-image-sync-card\.is-loading>\*\{opacity:0\}/);
});
