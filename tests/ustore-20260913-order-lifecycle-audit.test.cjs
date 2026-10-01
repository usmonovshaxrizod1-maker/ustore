const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'ustore-shop-app.js'), 'utf8');
const shopApi = fs.readFileSync(path.join(root, 'supabase', 'functions', 'shop-api', 'index.ts'), 'utf8');

function block(src, startNeedle, endNeedle, limit = 3000) {
  const start = src.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing ${startNeedle}`);
  const end = endNeedle ? src.indexOf(endNeedle, start + startNeedle.length) : -1;
  return src.slice(start, end > start ? end : start + limit);
}

// Full order-lifecycle logic audit (2026-09-13), requested directly by the
// user ("naqdda/kartada qanday bosqichlar... taksida/pochtada qanday..."):
// three real inconsistencies found and fixed, all confirmed by the user
// before implementing.

// BUG 1: after an admin rejects a customer's payment receipt (declaring it
// invalid), order.status stays 'NEW' (reject_payment_receipt only touches
// receipt_review_status) — so the OLD adminOrderNextAction() fell through
// to its "status==='NEW'" branch and suggested "Accept order" as the primary
// next action, right after the admin had just declared the payment invalid.
test('adminOrderNextAction suggests CANCEL (not accept) immediately after a receipt is rejected, checked before the generic NEW-status branch', () => {
  const fn = block(app, 'function adminOrderNextAction(o) {', '\n    function renderAdminOrderNextActionHtml', 1600);
  const rejectIdx = fn.indexOf("o.receiptReviewStatus === 'REJECTED' && o.status === 'NEW'");
  const newIdx = fn.indexOf("if (o.status === 'NEW') return");
  assert.ok(rejectIdx > 0, 'rejected-receipt branch must exist');
  assert.ok(rejectIdx < newIdx, 'the rejected-receipt check must run BEFORE the generic NEW branch, or it would never be reached');
  const rejectBranch = fn.slice(rejectIdx, newIdx);
  assert.match(rejectBranch, /updateOrderStatus\(\$\{o\.id\}, 'CANCELLED'\)/);
  assert.doesNotMatch(rejectBranch, /PROCESSING/, 'must never suggest advancing a rejected-receipt order');
});

// BUG 2: POST delivery already required shipment.status==='HANDED_TO_CARRIER'
// before order.status could become DELIVERED (both server + client gate).
// TAXI had NO equivalent gate — an admin could mark a TAXI order DELIVERED
// before the taxi had even left (shipment still READY/TAXI_ASSIGNED).
test('TAXI now requires shipment IN_TRANSIT (or already DELIVERED) before order.status can become DELIVERED, mirroring the pre-existing POST gate — both server and client', () => {
  const serverGate = block(shopApi, 'if (action === "update_order_status" && newStatus === "DELIVERED") {', 'case "cancel_order" && !isAdmin', 1200);
  assert.match(serverGate, /delivery_snapshot\?\.kind === "POST" && deliveryGate\.shipment\?\.status !== "HANDED_TO_CARRIER"/);
  assert.match(serverGate, /delivery_snapshot\?\.kind === "TAXI" && !\["IN_TRANSIT", "DELIVERED"\]\.includes\(deliveryGate\.shipment\?\.status\)/);
  assert.match(serverGate, /taxi_in_transit_required_before_delivery/);

  const clientGate = block(app, 'async function updateOrderStatus(id, newStatus) {', 'if (newStatus === \'CANCELLED\'', 1200);
  assert.match(clientGate, /old\.delivery\?\.kind === 'POST' && old\.shipment\?\.status !== 'HANDED_TO_CARRIER'/);
  assert.match(clientGate, /old\.delivery\?\.kind === 'TAXI' && !\['IN_TRANSIT','DELIVERED'\]\.includes\(old\.shipment\?\.status\)/);
});

// BUG 3: marking a TAXI shipment's own sub-status "Yetkazildi" (DELIVERED)
// never touched order.status at all — the two were fully independent, so an
// admin had to remember to ALSO separately click the order-level "Yetkazildi"
// button, or the order stayed "Jarayonda" in every report/filter forever
// even though the shipment said delivered.
test('update_shipment auto-syncs order.status to DELIVERED when a TAXI shipment reaches DELIVERED (reusing the same update_order_status RPC + delivered_at pattern, not a parallel implementation)', () => {
  const fn = block(shopApi, 'case "update_shipment": {', 'case "get_my_orders"', 4000);
  assert.match(fn, /shipment\.kind === "TAXI" && shipment\.status === "DELIVERED" && !\["DELIVERED", "CANCELLED"\]\.includes\(order\.status\)/);
  assert.match(fn, /db\.rpc\("update_order_status", \{/);
  assert.match(fn, /p_new_status: "DELIVERED"/);
  assert.match(fn, /delivered_at: new Date\(\)\.toISOString\(\) \}\)\.eq\("id", orderId\)\.eq\("shop_id", shopId\)\.is\("delivered_at", null\)/);
  assert.match(fn, /mapOrderForClient\(finalOrder,/, 'the response must reflect the SYNCED order, not the stale pre-sync row');
});

test('POST delivery is untouched by this round: still only READY/HANDED_TO_CARRIER, no fake IN_TRANSIT/DELIVERED tracking added to it', () => {
  const fn = block(shopApi, 'case "update_shipment": {', 'case "get_my_orders"', 4000);
  const postStart = fn.indexOf('delivery.kind === "POST"');
  const postEnd = fn.indexOf('} else {', postStart);
  assert.doesNotMatch(fn.slice(postStart, postEnd), /IN_TRANSIT/, 'POST branch itself must not gain TAXI-style tracking');
});
