// USTORE — 14/15-band: bekor qilish sabab+cutoff, qaytarish/muammo
// murojaati (alohida tur + seller toggle). Ixcham statik tahlil.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shopApi = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');
const migration030 = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '030_cancellation_and_returns.sql'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'ustore-shop-app.js'), 'utf8');

test('030 migration: customer_cancel_cutoff/return_requests_enabled land on shop_settings, ticket_type on support_tickets — all additive with safe defaults (existing shops keep current behavior)', () => {
  assert.match(migration030, /add column if not exists customer_cancel_cutoff text not null default 'BEFORE_SHIPPED'/);
  assert.match(migration030, /add column if not exists return_requests_enabled boolean not null default true;/);
  assert.match(migration030, /add column if not exists ticket_type text not null default 'SUPPORT'/);
});

test('the cancel-cutoff check only applies to a CUSTOMER-initiated cancel_order (never to admin, who can always cancel via update_order_status) — gated on both action name and !isAdmin', () => {
  const idx = shopApi.indexOf("if (action === \"cancel_order\" && !isAdmin) {");
  assert.ok(idx >= 0);
});

test('BEFORE_SHIPPED (the default) blocks self-cancel once shipment has actually progressed (IN_TRANSIT/HANDED_TO_CARRIER), not just by a coarse order-status check', () => {
  const start = shopApi.indexOf('const cutoff = settingsForCutoff');
  const block = shopApi.slice(start, start + 700);
  assert.match(block, /const shipped = \["IN_TRANSIT", "HANDED_TO_CARRIER"\]\.includes\(shipmentStatus\);/);
  assert.match(block, /cutoff === "BEFORE_SHIPPED" \? \(orderForCutoff\?\.status === "NEW" \|\| \(orderForCutoff\?\.status === "PROCESSING" && !shipped\)\)/);
});

test('a customer-supplied cancel reason is used verbatim when given, and only falls back to the old hardcoded text when left blank — never silently discarded', () => {
  assert.match(shopApi, /const cancelReason = action === "cancel_order" \? \(nullableText\(payload\.reason, 500\) \|\| "Mijoz tomonidan bekor qilindi"\) : nullableText\(payload\.reason, 500\);/);
});

test('a RETURN-type support ticket is REJECTED server-side when return_requests_enabled is false — the seller toggle is enforced where the ticket is created, not just by hiding the button', () => {
  const start = shopApi.indexOf('case "create_support_ticket"');
  const end = shopApi.indexOf('\n      case "send_support_message"', start);
  const block = shopApi.slice(start, end > start ? end : start + 1500);
  assert.match(block, /if \(settingsRow\?\.return_requests_enabled === false\) return json\(\{ error: "return_requests_disabled" \}, 400\);/);
});

test('RETURN and SUPPORT tickets for the SAME order are tracked as separate threads (dedup query filters by ticket_type too), so opening a return request never gets silently merged into an unrelated open support chat', () => {
  const start = shopApi.indexOf('case "create_support_ticket"');
  const end = shopApi.indexOf('\n      case "send_support_message"', start);
  const block = shopApi.slice(start, end > start ? end : start + 1500);
  assert.match(block, /\.eq\("ticket_type", ticketType\)\.neq\("status", "CLOSED"\)/);
});

test('the frontend cancellation sheet sends the chosen/typed reason to cancel_order (never a bare confirm() with no reason), and shows a distinct message when the server rejects it for being past the cutoff', () => {
  const start = appJs.indexOf('async function submitCancelOrder()');
  const block = appJs.slice(start, start + 1400);
  assert.match(block, /callApi\('cancel_order', \{ orderId, reason \}\)/);
  assert.match(block, /cancel_not_allowed_at_this_stage/);
});

test('the customer order-help flow always exposes support, but RETURN is enabled only when seller policy + DELIVERED + return-window eligibility pass; the return action opens a RETURN-typed ticket', () => {
  const eligibilityStart = appJs.indexOf('function orderReturnEligibility(order)');
  const eligibilityBlock = appJs.slice(eligibilityStart, eligibilityStart + 1200);
  assert.match(eligibilityBlock, /!order \|\| !returnRequestsEnabled/);
  assert.match(eligibilityBlock, /order\.status !== 'DELIVERED' \|\| !order\.deliveredAt/);
  assert.match(eligibilityBlock, /returnWindowDays/);
  assert.match(eligibilityBlock, /if \(leftMs < 0\) return \{ allowed:false/);

  const sheetStart = appJs.indexOf('function openOrderHelpSheet(orderId)');
  const sheetBlock = appJs.slice(sheetStart, sheetStart + 1800);
  assert.match(sheetBlock, /eligibility\.allowed \? `<button[^`]*openSupportModal\(\$\{order\.id\},'RETURN'\)/);
  assert.match(sheetBlock, /openSupportModal\(\$\{order\.id\},'SUPPORT'\)/);
});
