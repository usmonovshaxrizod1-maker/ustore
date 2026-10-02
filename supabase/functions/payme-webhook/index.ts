// ============================================================================
// USTORE payme-webhook — Payme Merchant API, JSON-RPC 2.0 callbacks.
// ============================================================================
// Public endpoint (verify_jwt = false, see config.toml). Contract:
// developer.help.paycom.uz (Merchant API protocol + methods, fetched and
// read directly via browser, not from memory, given this handles real
// money). Unlike Click, Payme does NOT sign the request body — it
// authenticates itself to us via a per-request HTTP Basic Auth header
// (login:password, issued when the merchant adds a web-kassa). Every
// response is HTTP 200 with a JSON-RPC envelope — {result,id} on success or
// {error:{code,message,data},id} on failure, per Payme's documented
// convention (a non-200 status is not part of the contract).
//
// This is a NEW, independent "PAYME" payment method (shop-api's
// resolvePaymentSnapshot) — parallel to CLICK and the existing manual
// QR:PAYME flow (customer uploads a receipt, admin approves by hand), which
// keeps working exactly as before for shops that haven't connected their
// own Payme Merchant account.
//
// "account" field we chose for the checkout URL / CreateTransaction lookup:
// order_id (our own orders.id, matching Click's merchant_trans_id role).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";
import { json, corsHeaders } from "../_shared/http.ts";
import { decryptBotToken } from "../_shared/bot-token-crypto.ts";
import { verifyPaymeBasicAuth, paymeResult, paymeError, PAYME_ERROR } from "../_shared/payme-client.ts";

const MSG = {
  notFound: { uz: "Tranzaksiya topilmadi", ru: "Транзакция не найдена", en: "Transaction not found" },
  invalidAmount: { uz: "Noto'g'ri summa", ru: "Неверная сумма", en: "Invalid amount" },
  orderNotFound: { uz: "Buyurtma topilmadi", ru: "Заказ не найден", en: "Order not found" },
  cannotPerform: { uz: "Amalni bajarib bo'lmaydi", ru: "Невозможно выполнить операцию", en: "Cannot perform operation" },
  orderDone: { uz: "Buyurtma allaqachon yakunlangan", ru: "Заказ уже выполнен", en: "Order already completed" },
  systemError: { uz: "Tizim xatosi", ru: "Системная ошибка", en: "System error" },
  authFailed: { uz: "Avtorizatsiya xatosi", ru: "Ошибка авторизации", en: "Authorization failed" },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(paymeError(PAYME_ERROR.METHOD_NOT_POST, MSG.systemError, null, null));

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(paymeError(PAYME_ERROR.PARSE_ERROR, MSG.systemError, null, null));
  }
  const { method, params, id: rpcId } = body || {};
  if (!method || typeof params !== "object") {
    return json(paymeError(PAYME_ERROR.INVALID_REQUEST, MSG.systemError, null, rpcId ?? null));
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const BOT_TOKEN_MASTER_KEY = Deno.env.get("USTORE_BOT_TOKEN_MASTER_KEY")!;
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Payme doesn't identify the shop in the request itself — the merchant id
  // (m=) only appears in the checkout URL, never sent back to us. We
  // instead authenticate+identify the shop TOGETHER: try each CONNECTED
  // payme_connections row's login against the Basic Auth header. In
  // practice a given webhook URL is per-deployment (all shops share one
  // payme-webhook function), so this scan is over a small, active set.
  const authHeader = req.headers.get("Authorization");
  const { data: connections } = await db.from("payme_connections")
    .select("shop_id,login,password_ciphertext,password_iv").eq("status", "CONNECTED");
  let matchedShopId: string | null = null;
  for (const conn of connections || []) {
    if (!conn.password_ciphertext) continue;
    const password = await decryptBotToken(BOT_TOKEN_MASTER_KEY, conn.password_ciphertext, conn.password_iv);
    if (verifyPaymeBasicAuth(authHeader, conn.login || "", password)) { matchedShopId = conn.shop_id as string; break; }
  }
  if (!matchedShopId) return json(paymeError(PAYME_ERROR.INSUFFICIENT_PRIVILEGE, MSG.authFailed, null, rpcId ?? null));

  const { data: shopRow } = await db.from("shops").select("payme_access_granted").eq("id", matchedShopId).maybeSingle();
  if (!shopRow?.payme_access_granted) return json(paymeError(PAYME_ERROR.INSUFFICIENT_PRIVILEGE, MSG.authFailed, null, rpcId ?? null));
  const shopId = matchedShopId;

  const orderIdRaw = params?.account?.order_id;
  // 048-band: admin "Sinash" tugmasi orqali yaratgan test to'lovi — checkout
  // URL'da account.order_id="TEST-<payment_test_runs.id>" qilib yuboriladi.
  // Bu HAQIQIY buyurtmaga umuman bog'lanmaydi (payme_transactions.order_id
  // orders'ga real FOREIGN KEY bo'lgani uchun uni qayta ishlatib bo'lmaydi) —
  // to'liq mustaqil, alohida tekshiruv.
  const isTestAccount = typeof orderIdRaw === "string" && orderIdRaw.startsWith("TEST-");
  const testRunId = isTestAccount ? Number(orderIdRaw.slice(5)) : NaN;
  const orderId = Number(orderIdRaw);
  const amountTiyin = Number(params?.amount);

  if (method === "CheckPerformTransaction") {
    if (isTestAccount) {
      if (!Number.isInteger(testRunId) || testRunId <= 0) return json(paymeError(PAYME_ERROR.ACCOUNT_ERROR, MSG.orderNotFound, "order_id", rpcId));
      const { data: testRun } = await db.from("payment_test_runs").select("id,status,amount").eq("id", testRunId).eq("shop_id", shopId).eq("provider", "PAYME").maybeSingle();
      if (!testRun || testRun.status !== "PENDING") return json(paymeError(PAYME_ERROR.ACCOUNT_ERROR, MSG.orderNotFound, "order_id", rpcId));
      const expectedTiyin = Math.round(Number(testRun.amount) * 100);
      if (!Number.isFinite(amountTiyin) || amountTiyin !== expectedTiyin) return json(paymeError(PAYME_ERROR.INVALID_AMOUNT, MSG.invalidAmount, null, rpcId));
      return json(paymeResult({ allow: true }, rpcId));
    }
    if (!Number.isInteger(orderId) || orderId <= 0) return json(paymeError(PAYME_ERROR.ACCOUNT_ERROR, MSG.orderNotFound, "order_id", rpcId));
    const { data: order } = await db.from("orders").select("id,status,payable_total").eq("id", orderId).eq("shop_id", shopId).maybeSingle();
    if (!order || order.status !== "NEW") return json(paymeError(PAYME_ERROR.ACCOUNT_ERROR, MSG.orderNotFound, "order_id", rpcId));
    const expectedTiyin = Math.round(Number(order.payable_total) * 100);
    if (!Number.isFinite(amountTiyin) || amountTiyin !== expectedTiyin) return json(paymeError(PAYME_ERROR.INVALID_AMOUNT, MSG.invalidAmount, null, rpcId));
    return json(paymeResult({ allow: true }, rpcId));
  }

  if (method === "CreateTransaction") {
    const paymeTransactionId = String(params?.id || "");
    if (!paymeTransactionId) return json(paymeError(PAYME_ERROR.INVALID_REQUEST, MSG.systemError, null, rpcId));

    if (isTestAccount) {
      if (!Number.isInteger(testRunId) || testRunId <= 0) return json(paymeError(PAYME_ERROR.ACCOUNT_ERROR, MSG.orderNotFound, "order_id", rpcId));
      const { data: testRun } = await db.from("payment_test_runs").select("id,status,amount,external_ref,payme_create_time_ms").eq("id", testRunId).eq("shop_id", shopId).eq("provider", "PAYME").maybeSingle();
      if (!testRun) return json(paymeError(PAYME_ERROR.ACCOUNT_ERROR, MSG.orderNotFound, "order_id", rpcId));
      if (testRun.external_ref === paymeTransactionId) {
        return json(paymeResult({ create_time: testRun.payme_create_time_ms, transaction: String(testRun.id), state: testRun.status === "CANCELLED" ? -1 : testRun.status === "CONFIRMED" ? 2 : 1 }, rpcId));
      }
      if (testRun.status !== "PENDING" || testRun.external_ref) return json(paymeError(PAYME_ERROR.CANNOT_PERFORM, MSG.cannotPerform, null, rpcId));
      const expectedTiyin = Math.round(Number(testRun.amount) * 100);
      if (!Number.isFinite(amountTiyin) || amountTiyin !== expectedTiyin) return json(paymeError(PAYME_ERROR.INVALID_AMOUNT, MSG.invalidAmount, null, rpcId));
      const createTime = Number(params?.time) || Date.now();
      await db.from("payment_test_runs").update({ external_ref: paymeTransactionId, payme_create_time_ms: createTime }).eq("id", testRunId);
      return json(paymeResult({ create_time: createTime, transaction: String(testRun.id), state: 1 }, rpcId));
    }

    const { data: existing } = await db.from("payme_transactions").select("*").eq("shop_id", shopId).eq("payme_transaction_id", paymeTransactionId).maybeSingle();
    if (existing) {
      if (!Number.isInteger(orderId) || Number(existing.order_id) !== orderId) {
        return json(paymeError(PAYME_ERROR.ACCOUNT_ERROR, MSG.orderNotFound, "order_id", rpcId));
      }
      const expectedTiyin = Math.round(Number(existing.amount) * 100);
      if (!Number.isFinite(amountTiyin) || amountTiyin !== expectedTiyin) {
        return json(paymeError(PAYME_ERROR.INVALID_AMOUNT, MSG.invalidAmount, null, rpcId));
      }
      return json(paymeResult({ create_time: existing.create_time, transaction: String(existing.id), state: existing.state }, rpcId));
    }

    if (!Number.isInteger(orderId) || orderId <= 0) return json(paymeError(PAYME_ERROR.ACCOUNT_ERROR, MSG.orderNotFound, "order_id", rpcId));
    const { data: order } = await db.from("orders").select("id,status,payable_total").eq("id", orderId).eq("shop_id", shopId).maybeSingle();
    if (!order || order.status !== "NEW") return json(paymeError(PAYME_ERROR.ACCOUNT_ERROR, MSG.orderNotFound, "order_id", rpcId));
    const expectedTiyin = Math.round(Number(order.payable_total) * 100);
    if (!Number.isFinite(amountTiyin) || amountTiyin !== expectedTiyin) return json(paymeError(PAYME_ERROR.INVALID_AMOUNT, MSG.invalidAmount, null, rpcId));

    // A different payme_transaction_id already created+pending for this same
    // order would mean the customer opened two checkout sessions — reject
    // the second (mirrors Click's "already prepared, one active txn per
    // order" expectation via the orders.status==='NEW' guard above, but
    // double-checked here since CreateTransaction is retried by Payme on
    // lost responses and must stay idempotent per payme_transaction_id).
    const createTime = Number(params?.time) || Date.now();
    const { data: inserted, error: insertErr } = await db.from("payme_transactions").insert({
      shop_id: shopId, order_id: orderId, payme_transaction_id: paymeTransactionId,
      amount: amountTiyin / 100, state: 1, create_time: createTime,
    }).select("*").single();
    if (insertErr || !inserted) return json(paymeError(PAYME_ERROR.SYSTEM_ERROR, MSG.systemError, null, rpcId));

    return json(paymeResult({ create_time: createTime, transaction: String(inserted.id), state: 1 }, rpcId));
  }

  if (method === "PerformTransaction") {
    const paymeTransactionId = String(params?.id || "");
    // 048-band: test to'lovlar payme_transactions'da EMAS — external_ref
    // orqali payment_test_runs'dan qidiriladi.
    const { data: testTxn } = await db.from("payment_test_runs").select("id,status,payme_perform_time_ms").eq("shop_id", shopId).eq("provider", "PAYME").eq("external_ref", paymeTransactionId).maybeSingle();
    if (testTxn) {
      if (testTxn.status === "CONFIRMED") return json(paymeResult({ transaction: String(testTxn.id), perform_time: testTxn.payme_perform_time_ms, state: 2 }, rpcId));
      if (testTxn.status !== "PENDING") return json(paymeError(PAYME_ERROR.CANNOT_PERFORM, MSG.cannotPerform, null, rpcId));
      const performTime = Date.now();
      await db.from("payment_test_runs").update({ status: "CONFIRMED", payme_perform_time_ms: performTime, confirmed_at: new Date().toISOString() }).eq("id", testTxn.id);
      const { count: confirmedCount } = await db.from("payment_test_runs")
        .select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("provider", "PAYME").eq("status", "CONFIRMED");
      if ((confirmedCount || 0) >= 3) await db.from("payme_connections").update({ verified: true }).eq("shop_id", shopId);
      return json(paymeResult({ transaction: String(testTxn.id), perform_time: performTime, state: 2 }, rpcId));
    }
    const { data: txn } = await db.from("payme_transactions").select("*").eq("shop_id", shopId).eq("payme_transaction_id", paymeTransactionId).maybeSingle();
    if (!txn) return json(paymeError(PAYME_ERROR.TRANSACTION_NOT_FOUND, MSG.notFound, null, rpcId));
    if (txn.state === 2) return json(paymeResult({ transaction: String(txn.id), perform_time: txn.perform_time, state: 2 }, rpcId));
    if (txn.state !== 1) return json(paymeError(PAYME_ERROR.CANNOT_PERFORM, MSG.cannotPerform, null, rpcId));

    const performTime = Date.now();
    // DB trigger updates the transaction and order atomically. A database
    // failure must be returned as a Payme system error, never as success.
    const { error: performError } = await db.from("payme_transactions").update({ state: 2, perform_time: performTime }).eq("id", txn.id);
    if (performError) return json(paymeError(PAYME_ERROR.SYSTEM_ERROR, MSG.systemError, null, rpcId));

    return json(paymeResult({ transaction: String(txn.id), perform_time: performTime, state: 2 }, rpcId));
  }

  if (method === "CancelTransaction") {
    const paymeTransactionId = String(params?.id || "");
    const reason = Number(params?.reason) || 0;
    const { data: testTxn } = await db.from("payment_test_runs").select("id,status,payme_perform_time_ms,payme_cancel_time_ms").eq("shop_id", shopId).eq("provider", "PAYME").eq("external_ref", paymeTransactionId).maybeSingle();
    if (testTxn) {
      if (testTxn.status === "CANCELLED") return json(paymeResult({ transaction: String(testTxn.id), cancel_time: testTxn.payme_cancel_time_ms, state: testTxn.payme_perform_time_ms ? -2 : -1 }, rpcId));
      const cancelTime = Date.now();
      const newState = testTxn.payme_perform_time_ms ? -2 : -1;
      await db.from("payment_test_runs").update({ status: "CANCELLED", payme_cancel_time_ms: cancelTime, payme_cancel_reason: reason }).eq("id", testTxn.id);
      return json(paymeResult({ transaction: String(testTxn.id), cancel_time: cancelTime, state: newState }, rpcId));
    }
    const { data: txn } = await db.from("payme_transactions").select("*").eq("shop_id", shopId).eq("payme_transaction_id", paymeTransactionId).maybeSingle();
    if (!txn) return json(paymeError(PAYME_ERROR.TRANSACTION_NOT_FOUND, MSG.notFound, null, rpcId));

    const { data: order } = await db.from("orders").select("id,status").eq("id", txn.order_id).eq("shop_id", shopId).maybeSingle();
    // Per Payme docs: a PERFORMED transaction can only be cancelled if the
    // order hasn't been fully fulfilled yet — we treat any status beyond
    // NEW/PROCESSING (i.e. SHIPPED/DELIVERED) as "already done" and refuse,
    // matching -31007 semantics.
    if (txn.state === 2 && order && !["NEW", "PROCESSING"].includes(order.status)) {
      return json(paymeError(PAYME_ERROR.ORDER_ALREADY_DONE, MSG.orderDone, null, rpcId));
    }
    if (txn.state === -1 || txn.state === -2) {
      return json(paymeResult({ transaction: String(txn.id), cancel_time: txn.cancel_time, state: txn.state }, rpcId));
    }

    const cancelTime = Date.now();
    const newState = txn.state === 2 ? -2 : -1;
    const { error: cancelError } = await db.from("payme_transactions").update({ state: newState, cancel_time: cancelTime, reason }).eq("id", txn.id);
    if (cancelError) return json(paymeError(PAYME_ERROR.SYSTEM_ERROR, MSG.systemError, null, rpcId));

    return json(paymeResult({ transaction: String(txn.id), cancel_time: cancelTime, state: newState }, rpcId));
  }

  if (method === "CheckTransaction") {
    const paymeTransactionId = String(params?.id || "");
    const { data: testTxn } = await db.from("payment_test_runs").select("id,status,payme_create_time_ms,payme_perform_time_ms,payme_cancel_time_ms,payme_cancel_reason").eq("shop_id", shopId).eq("provider", "PAYME").eq("external_ref", paymeTransactionId).maybeSingle();
    if (testTxn) {
      const state = testTxn.status === "CANCELLED" ? (testTxn.payme_perform_time_ms ? -2 : -1) : testTxn.status === "CONFIRMED" ? 2 : 1;
      return json(paymeResult({
        create_time: testTxn.payme_create_time_ms, perform_time: testTxn.payme_perform_time_ms || 0, cancel_time: testTxn.payme_cancel_time_ms || 0,
        transaction: String(testTxn.id), state, reason: testTxn.payme_cancel_reason ?? null,
      }, rpcId));
    }
    const { data: txn } = await db.from("payme_transactions").select("*").eq("shop_id", shopId).eq("payme_transaction_id", paymeTransactionId).maybeSingle();
    if (!txn) return json(paymeError(PAYME_ERROR.TRANSACTION_NOT_FOUND, MSG.notFound, null, rpcId));
    return json(paymeResult({
      create_time: txn.create_time, perform_time: txn.perform_time || 0, cancel_time: txn.cancel_time || 0,
      transaction: String(txn.id), state: txn.state, reason: txn.reason ?? null,
    }, rpcId));
  }

  return json(paymeError(PAYME_ERROR.METHOD_NOT_FOUND, MSG.systemError, method, rpcId));
});
