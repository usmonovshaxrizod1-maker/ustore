const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const api = fs.readFileSync(path.join(root, 'supabase', 'functions', 'platform-api', 'index.ts'), 'utf8');
const app = fs.readFileSync(path.join(root, 'platform', 'platform-app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'platform', 'platform.css'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '058_application_payment_provisioning.sql'), 'utf8');

function actionBlock(action) {
  const start = api.indexOf(`case "${action}"`);
  assert.ok(start >= 0, `${action} not found`);
  const end = api.indexOf('\n      case ', start + 10);
  return api.slice(start, end > start ? end : start + 12000);
}

test('058 is additive and separates requester from owner while recording receipt origin', () => {
  assert.match(migration, /add column if not exists requested_by_user_id bigint/);
  assert.match(migration, /add column if not exists owner_telegram_id bigint/);
  assert.match(migration, /add column if not exists requested_shop_name text/);
  assert.match(migration, /add column if not exists receipt_source text/);
  assert.match(migration, /'PAYMENT_PAGE','MY_REQUESTS','TELEGRAM_BOT'/);
  assert.doesNotMatch(migration, /drop table/i);
  assert.doesNotMatch(migration, /drop column/i);
});

test('058 adds durable server-timestamped application history and bot receipt session tables', () => {
  assert.match(migration, /create table if not exists public\.subscription_request_history/);
  assert.match(migration, /created_at timestamptz not null default now\(\)/);
  assert.match(migration, /create table if not exists public\.platform_receipt_bot_sessions/);
  for (const event of ['REQUEST_SUBMITTED','PAYMENT_CLAIMED','RECEIPT_REQUESTED','RECEIPT_UPLOADED','PAYMENT_APPROVED','REQUEST_REJECTED','SHOP_CREATED']) {
    assert.match(migration, new RegExp(event));
  }
});

test('NEW_SHOP submit stores A as requester and editable B as owner without conflating identities', () => {
  const b = actionBlock('platform_submit_subscription_request');
  assert.match(b, /requestedShopName = String\(payload\.shopName/);
  assert.match(b, /ownerTelegramId = String\(payload\.ownerTelegramId/);
  assert.match(b, /requester_telegram_id: tgId, requested_by_user_id: tgId/);
  assert.match(b, /owner_telegram_id: ownerTelegramId, requested_shop_name: requestedShopName/);
  assert.match(b, /invalid_owner_telegram_id/);
});

test('checkout receipt is optional and, when present, is explicitly marked PAYMENT_PAGE', () => {
  const b = actionBlock('platform_submit_subscription_request');
  assert.match(b, /const upload = payload\.receiptImageUpload \|\| null/);
  assert.match(b, /receipt_source: "PAYMENT_PAGE"/);
  assert.match(b, /RECEIPT_UPLOADED[\s\S]*source: "PAYMENT_PAGE"/);
});

test('admin receipt request uses soft verification wording and creates RECEIPT_REQUESTED history', () => {
  const b = actionBlock('platform_request_receipt');
  assert.match(b, /To'lovni tasdiqlash uchun chek kerak/);
  assert.match(b, /To'lovingizni aniqlay olmadik\. Tekshiruvni davom ettirish uchun to'lov chekini yuboring\./);
  assert.doesNotMatch(b, /Pul tushmagan|To'lov amalga oshmagan/i);
  assert.match(b, /appendSubscriptionRequestHistory\(db, requestId, "RECEIPT_REQUESTED"/);
});

test('Arizalarim receipt upload is ownership-scoped and tagged MY_REQUESTS', () => {
  const b = actionBlock('platform_attach_request_receipt');
  assert.match(b, /String\(reqRow\.requester_telegram_id\) !== String\(tgId\)/);
  assert.match(b, /payload\.source === "PAYMENT_PAGE" \? "PAYMENT_PAGE" : "MY_REQUESTS"/);
  assert.match(b, /RECEIPT_UPLOADED/);
});

test('platform bot accepts receipt photos, auto-attaches one open request, and asks when there are several', () => {
  assert.match(api, /largestPhoto\?\.file_id/);
  assert.match(api, /\.eq\("requested_by_user_id", senderId\)\.eq\("status", "NEW"\)\.is\("receipt_storage_path", null\)/);
  assert.match(api, /rows\.length === 1/);
  assert.match(api, /text: "Qaysi ariza uchun chek\?"/);
  assert.match(api, /callback_data: `receipt_req:\$\{r\.id\}`/);
  assert.match(api, /receipt_source: "TELEGRAM_BOT"/);
  assert.match(api, /allowed_updates: \["message", "callback_query"\]/);
});

test('/id helper is available when Telegram ID cannot be auto-detected', () => {
  assert.match(api, /isIdCommand/);
  assert.match(api, /Sizning Telegram ID'ingiz: \$\{senderId\}/);
  assert.match(app, /Telegram ID avtomatik aniqlanmadi/);
  assert.match(app, /ID'imni aniqlash/);
});

test('USER has Arizalarim list, exact state labels, detail history, and top attention card', () => {
  assert.match(app, /if \(p === 'MY_REQUESTS'\)/);
  assert.match(app, /if \(p === 'MY_REQUEST_DETAILS'\)/);
  // 2026-08-29, 7-topshiriq round: labels were refined to the user's own
  // described 4-stage flow ("To'lov kutilmoqda -> To'lov tekshirilmoqda ->
  // To'lov tasdiqlandi -> Do'kon faollashtirildi") in userRequestDisplayStatus()
  // — more specific than bare "Kutilmoqda"/"Tasdiqlandi" (says WHAT is
  // pending/confirmed). Checked here by substring, matching the original
  // test's own style, just with the real current wording.
  for (const label of ["To'lov kutilmoqda", "To'lov tekshirilmoqda", "Chek so'raldi", 'Chek yuborildi', "To'lov tasdiqlandi", "Do'kon faollashtirildi", 'Rad etildi']) {
    assert.ok(app.includes(label), `missing user status ${label}`);
  }
  assert.match(app, /function userRequestDisplayStatus\(r\)/);
  assert.match(app, /function renderRequestTimeline/);
  assert.match(app, /To'lovni tasdiqlash uchun chek kerak/);
  assert.match(app, /Chekni yuborish/);
  assert.match(app, /Arizani ko'rish/);
  assert.match(app, /<b>Chek yuborildi<\/b>/);
  assert.match(app, /To'lovingiz tekshirilmoqda\./);
});

test('new-shop checkout shows shop name and editable owner Telegram ID confirmation', () => {
  assert.match(app, /function renderNewShopRequestIdentity/);
  assert.match(app, /Do'kon nomi/);
  assert.match(app, /Do'kon egasining Telegram IDsi/);
  assert.match(app, /Bu sizning Telegram ID'ingiz/);
  assert.match(app, /Do'kon quyidagi Telegram ID egasiga biriktiriladi/);
  assert.match(app, /shopName: flowKind === 'NEW_SHOP' \? newShopName\.trim\(\) : undefined/);
  assert.match(app, /ownerTelegramId: flowKind === 'NEW_SHOP' \? newShopOwnerTelegramId : undefined/);
});

test('approved NEW_SHOP opens an explicit provisioning stage instead of silently ending the request', () => {
  assert.match(app, /<h2>To'lov tasdiqlandi<\/h2>/);
  assert.match(app, /Do'kon qo'shish/);
  assert.match(app, /function renderRequestProvisioningBody/);
  for (const field of ["Do'kon nomi",'Owner Telegram ID','Tarif','Davr',"To'langan summa",'Obuna muddati','Bonus kunlar','Ariza ID']) {
    assert.ok(app.includes(field), `missing provisioning field: ${field}`);
  }
});

test('request provisioning takes owner/shop/tariff from DB, links membership through existing atomic RPC, and finalizes request', () => {
  const b = actionBlock('platform_provision_shop_from_request');
  assert.match(b, /const ownerTelegramId = String\(reqRow\.owner_telegram_id/);
  assert.match(b, /const requestedShopName = String\(reqRow\.requested_shop_name/);
  assert.match(b, /p_owner_telegram_id: ownerTelegramId/);
  assert.match(b, /applyTariffToShop\(db, shopId, reqRow\.tariff_id/);
  assert.match(b, /update\(\{ applied_shop_id: shopId, applied_at: appliedAt \}\)/);
  assert.match(b, /appendSubscriptionRequestHistory\(db, requestId, "SHOP_CREATED"/);
});

test('provisioning retry reuses applied_shop_id and does not call the create RPC again when a shop already exists', () => {
  const b = actionBlock('platform_provision_shop_from_request');
  assert.match(b, /let shopId = reqRow\.applied_shop_id \? String\(reqRow\.applied_shop_id\) : ""/);
  assert.match(b, /if \(!shopId\) \{[\s\S]*ustore_create_shop_provisioning/);
  assert.doesNotMatch(b, /if \(!shopId \|\| shopStatus === "PROVISIONING"\)/);
});

test('provisioned shop records exact owner in admin detail and appears through existing membership-based My Shops', () => {
  assert.match(app, /<h2>Do'kon yaratildi<\/h2>/);
  assert.match(app, /Owner: Telegram ID/);
  assert.match(api, /listMyShops\(db, tgId\)/);
  const rpc = fs.readFileSync(path.join(root, 'supabase', 'migrations', '009_platform_provisioning.sql'), 'utf8');
  assert.match(rpc, /insert into public\.shop_memberships \(shop_id, telegram_user_id, role, status\)[\s\S]*p_owner_telegram_id, 'OWNER', 'ACTIVE'/);
});

test('new UI handlers are exported and styling is scoped to the new application/provisioning classes', () => {
  for (const fn of ['openMyRequests','openMyRequestDetails','onMyRequestReceiptPicked','attachMyRequestReceipt','updateNewShopRequestIdentity','detectMyTelegramId','openRequestProvisioning','submitRequestProvisioning']) {
    assert.match(app, new RegExp(`window\\.${fn} = ${fn}`));
  }
  for (const cls of ['plat-receipt-attention','plat-my-request-card','plat-application-timeline','plat-provision-stage','plat-provision-summary']) {
    assert.match(css, new RegExp(`\\.${cls}`));
  }
});
