// USTORE — Platform "Yordam" bo'limi (4-band): 3 statik qo'llanma sahifasi
// (4.1-4.3) + platforma darajasidagi support/muammo-xabar tizimi (4.4/4.5),
// yordam_bolimi_reja.html'da tasdiqlangan reja bo'yicha amalga oshirildi.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FUNCTIONS_DIR = path.join(__dirname, '..', 'supabase', 'functions');
const platformApi = fs.readFileSync(path.join(FUNCTIONS_DIR, 'platform-api', 'index.ts'), 'utf8');
const platformApp = fs.readFileSync(path.join(__dirname, '..', 'platform', 'platform-app.js'), 'utf8');
const migration019 = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '019_platform_support.sql'), 'utf8');

function actionBlock(source, action) {
  const start = source.indexOf(`case "${action}"`);
  assert.ok(start >= 0, `${action} not found`);
  const end = source.indexOf('\n      case ', start + 10);
  return source.slice(start, end > start ? end : start + 2000);
}

// ---------------------------------------------------------------------------
// 4.1-4.3 — statik qo'llanma sahifalari (backend yo'q)
// ---------------------------------------------------------------------------

// 2026-08-27, USER platform redesign 8/9-band: bu 3 qator endi HELP_NAV_ROWS
// konstantasida (icon, tone-klass, sarlavha, tavsif, action) — eski oddiy
// 3-elementli array o'rniga skrinshot 05'dagi rangli icon+tavsif bilan.
test('4.1-4.3: the three previously-inert Yordam cards now open real pages via onclick, not dead .plat-help-row divs', () => {
  assert.match(platformApp, /\['book', 'plat-help-icon-blue', "UStorE'dan foydalanish"[\s\S]{0,80}"openPage\('GUIDE_USAGE'\)"\]/);
  assert.match(platformApp, /\['card', 'plat-help-icon-green', "To'lov va obuna"[\s\S]{0,80}"openPage\('GUIDE_SUBSCRIPTION'\)"\]/);
  assert.match(platformApp, /\['shop', 'plat-help-icon-orange', "Do'kon sozlash"[\s\S]{0,80}"openPage\('GUIDE_SHOP_SETUP'\)"\]/);
  for (const p of ['GUIDE_USAGE', 'GUIDE_SUBSCRIPTION', 'GUIDE_SHOP_SETUP']) {
    assert.match(platformApp, new RegExp(`if \\(p === '${p}'\\) return pageShell`), `${p} must be routed in renderActivePage()`);
  }
});

test('4.1: the usage guide has all 8 real steps (tariff -> subscription -> bot -> catalog -> product -> payment -> delivery -> orders), and the tariff step links to the REAL tariffs page, not just text', () => {
  const start = platformApp.indexOf('function renderGuideUsageBody');
  const end = platformApp.indexOf('function renderGuideSubscriptionBody');
  const block = platformApp.slice(start, end);
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) assert.match(block, new RegExp(`guideStep\\(${n},`), `step ${n} missing`);
  assert.match(block, /onclick="openPage\('TARIFFS'\)">Tariflarni ko'rish/);
});

test('4.3: the shop-setup guide points at the shop\'s OWN bot (t.me/<botUsername>) when the user already has a shop, falling back to tariff selection when they don\'t — never a dead link', () => {
  const start = platformApp.indexOf('function renderGuideShopSetupBody');
  const end = platformApp.indexOf('function renderProfileTab');
  const block = platformApp.slice(start, end);
  assert.match(block, /myShop\?\.botUsername/);
  assert.match(block, /href="https:\/\/t\.me\/\$\{escapeHtml\(myShop\.botUsername\)\}"/);
  assert.match(block, /onclick="openPage\('TARIFFS'\)">Tarif tanlab boshlash/);
});

// ---------------------------------------------------------------------------
// 019 migration — additive, mirrors 004_support_engagement.sql's shape
// ---------------------------------------------------------------------------

test('019 migration is purely additive (creates platform_support_tickets/platform_support_ticket_messages, touches nothing from 001-018) and both tables get RLS enabled', () => {
  assert.doesNotMatch(migration019, /drop column|drop table/i);
  assert.match(migration019, /create table if not exists public\.platform_support_tickets/);
  assert.match(migration019, /create table if not exists public\.platform_support_ticket_messages/);
  assert.match(migration019, /alter table public\.platform_support_tickets enable row level security/);
  assert.match(migration019, /alter table public\.platform_support_ticket_messages enable row level security/);
});

test('platform_support_tickets.type is a closed 2-value enum (SUPPORT/BUG_REPORT) — ONE table serves both 4.4 and 4.5, mirroring admin_audit_log\'s polymorphic-action-column pattern instead of duplicating near-identical table pairs', () => {
  assert.match(migration019, /type text not null default 'SUPPORT' check \(type in \('SUPPORT', 'BUG_REPORT'\)\)/);
  assert.match(migration019, /status text not null default 'OPEN' check \(status in \('OPEN', 'ANSWERED', 'CLOSED'\)\)/);
});

// ---------------------------------------------------------------------------
// platform-api actions
// ---------------------------------------------------------------------------

test('platform_create_support_ticket reuses an existing non-CLOSED ticket of the same type for the same requester instead of always creating a new one (mirrors shop-level create_support_ticket exactly), and notifies the platform admin in the background', () => {
  const block = actionBlock(platformApi, 'platform_create_support_ticket');
  assert.match(block, /\.neq\("status", "CLOSED"\)/);
  assert.match(block, /notifyPlatformSupportAdmin\(PLATFORM_BOT_TOKEN, SUPER_ADMIN_ID, ticket, message\);/);
});

test('platform_send_support_message enforces ownership: a non-super-admin can only message their OWN ticket (403 otherwise), never trusts a client-claimed identity, and a CLOSED ticket rejects new messages', () => {
  const block = actionBlock(platformApi, 'platform_send_support_message');
  assert.match(block, /if \(!isPlatformSuperAdmin && ticket\.requester_telegram_id !== String\(tgId\)\) return json\(\{ error: "forbidden" \}, 403\);/);
  assert.match(block, /if \(ticket\.status === "CLOSED"\) return json\(\{ error: "ticket_closed" \}, 400\);/);
});

test('an ADMIN reply auto-transitions OPEN -> ANSWERED (mirrors shop-level send_support_message exactly) and notifies the REQUESTER, while a USER message notifies the platform admin instead — the two notification paths are never swapped', () => {
  const block = actionBlock(platformApi, 'platform_send_support_message');
  assert.match(block, /if \(sender === "ADMIN" && ticket\.status === "OPEN"\)/);
  assert.match(block, /status: "ANSWERED", answered_at: new Date\(\)\.toISOString\(\), answered_by: String\(tgId\),/);
  assert.match(block, /if \(sender === "ADMIN"\) notifyPlatformSupportReply\(PLATFORM_BOT_TOKEN, updatedTicket, body\);/);
  assert.match(block, /else notifyPlatformSupportAdmin\(PLATFORM_BOT_TOKEN, SUPER_ADMIN_ID, updatedTicket, body\);/);
});

test('platform_close_support_ticket lets the ticket owner close their own ticket OR the platform admin close any ticket, but forbids a third party from closing someone else\'s', () => {
  const block = actionBlock(platformApi, 'platform_close_support_ticket');
  assert.match(block, /if \(!isPlatformSuperAdmin && ticket\.requester_telegram_id !== String\(tgId\)\) return json\(\{ error: "forbidden" \}, 403\);/);
});

test('platform_get_support_messages is ownership-gated the same way as sending, and resolves attachment_path into a short-lived SIGNED url (never a raw storage path) via the existing payment-receipts bucket — no plaintext path or new bucket', () => {
  const block = actionBlock(platformApi, 'platform_get_support_messages');
  assert.match(block, /if \(!isPlatformSuperAdmin && ticket\.requester_telegram_id !== String\(tgId\)\) return json\(\{ error: "forbidden" \}, 403\);/);
  assert.match(block, /db\.storage\.from\("payment-receipts"\)\.createSignedUrl\(m\.attachment_path, 300\);/);
});

test('platform_admin_list_support_tickets is the only admin-wide ticket listing and is gated by requirePlatformSuperAdmin() — a regular user can never enumerate every ticket in the system, only their own via platform_get_my_support_tickets', () => {
  const block = actionBlock(platformApi, 'platform_admin_list_support_tickets');
  assert.match(block, /requirePlatformSuperAdmin\(\);/);
});

test('storeSupportAttachment mirrors storeSubscriptionReceipt\'s exact validation (mime whitelist, base64 shape, 6MB decoded cap) and reuses the SAME payment-receipts bucket under a distinct platform/support-tickets/ prefix — no new bucket, no relaxed validation for bug-report screenshots', () => {
  const start = platformApi.indexOf('async function storeSupportAttachment');
  const end = platformApi.indexOf('function mapPlatformTicket');
  const block = platformApi.slice(start, end);
  assert.match(block, /"image\/jpeg": "jpg", "image\/png": "png", "image\/webp": "webp"/);
  assert.match(block, /binary\.length > 6 \* 1024 \* 1024/);
  assert.match(block, /db\.storage\.from\("payment-receipts"\)\.upload\(path, bytes,/);
  assert.match(block, /`platform\/support-tickets\/\$\{ticketId\}\/\$\{tgId\}-\$\{crypto\.randomUUID\(\)\}\.\$\{ext\}`/);
});

// ---------------------------------------------------------------------------
// Frontend wiring
// ---------------------------------------------------------------------------

test('4.4 user flow: "Support bilan yozish" always calls loadMySupportTickets() on open (openSupportPage), and starting a new message goes through platform_create_support_ticket with type SUPPORT explicitly (never left to default so a future default change can\'t silently misfile it as a bug report)', () => {
  assert.match(platformApp, /function openSupportPage\(view = 'new'\) \{[\s\S]*?openPage\('SUPPORT'\);[\s\S]*?loadMySupportTickets\(\);[\s\S]*?\}/);
  const start = platformApp.indexOf('async function submitNewSupportMessage');
  const end = platformApp.indexOf('function supportThreadTitle');
  const block = platformApp.slice(start, end);
  assert.match(block, /type: 'SUPPORT', message/);
});

test('4.5 bug report requires both a title and a description before submitting, and the confirmation screen replaces the form (not stacked on top of it) after a successful send', () => {
  const start = platformApp.indexOf('async function submitBugReport');
  const end = platformApp.indexOf('// ======', start + 10);
  const block = platformApp.slice(start, end);
  assert.match(block, /if \(!title \|\| !desc\) return showToast/);
  assert.match(block, /type: 'BUG_REPORT', subject: title, pageContext: section \|\| undefined,/);
  assert.match(block, /bugReportSent = true;/);
  const renderStart = platformApp.indexOf('function renderBugReportBody');
  const renderBlock = platformApp.slice(renderStart, renderStart + 400);
  assert.match(renderBlock, /if \(bugReportSent\)/, 'the confirmation must be an early return, not additional markup alongside the form');
});

test('Support is now its own ADMIN root tab (Platform 2.0 Bosqich 2 — no longer buried inside Profile/Sozlamalar, since it is daily work, not a setting), reachable only in isAdminMode via renderAdminSupportTab(), and opening it loads ALL requesters\' tickets via the admin-only action, distinct from the user-scoped platform_get_my_support_tickets', () => {
  assert.match(platformApp, /if \(isAdminMode\) return renderAdminProfileTab\(\);/, 'Sozlamalar (ex-Profil) delegation must be unchanged');
  assert.doesNotMatch(platformApp, /openAdminSupportPage/, 'the old Profile-nested Support entry point must be fully gone, not left alongside the new tab');
  assert.match(platformApp, /if \(currentTab === 'support'\) return renderAdminSupportTab\(\);/, 'Support must be wired as a root admin tab');
  assert.match(platformApp, /\['support', 'headset', 'Support'\]/, 'Support must appear in the admin bottom-nav tabs array');
  const start = platformApp.indexOf('async function loadAdminSupportTickets');
  const end = platformApp.indexOf('function setAdminSupportFilter');
  const block = platformApp.slice(start, end);
  assert.match(block, /callPlatformApi\('platform_admin_list_support_tickets', payload\)/);
});

test('the admin thread view offers a "close" action only while the ticket is still open (never on an already-CLOSED ticket), and admin replies reuse the exact same send/render functions as the user side — no separate, divergent admin chat implementation', () => {
  const start = platformApp.indexOf('function renderAdminSupportThreadBody');
  const end = platformApp.indexOf('async function closeAdminSupportThread');
  const block = platformApp.slice(start, end);
  assert.match(block, /ticket && ticket\.status !== 'CLOSED'/);
  assert.match(block, /\$\{renderSupportThreadBody\(\)\}/, 'must reuse renderSupportThreadBody(), not a parallel admin-only render path');
});
