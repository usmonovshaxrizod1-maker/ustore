// ============================================================================
// USTORE click-webhook — Click.uz Shop API, Prepare + Complete callbacks.
// ============================================================================
// Public endpoint (verify_jwt = false, see config.toml). Auth is NOT a
// header secret like billz-sync/Telegram webhooks — Click signs every
// request body itself (sign_string, MD5 over documented fields + the
// shop's own SECRET_KEY), so verifying that signature per-request IS the
// authentication. Contract: docs.click.uz/en/shop-api/requests + /errors
// (fetched and read directly, not from memory, given this handles real
// money). Content-Type from Click is application/x-www-form-urlencoded;
// every response — success AND logical error alike — is HTTP 200 with a
// JSON body carrying Click's own numeric error code, per their documented
// convention (a non-200 status is not part of that contract and would
// likely just make Click's side retry/alert instead of reading the body).
//
// This is a SEPARATE, new "CLICK" payment method (shop-api's
// resolvePaymentSnapshot) — it does not touch the existing manual
// "QR:CLICK" flow (customer uploads a receipt, admin approves by hand),
// which keeps working exactly as before for shops that haven't connected
// their own Click Merchant account.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";
import { json, corsHeaders } from "../_shared/http.ts";
import { decryptBotToken } from "../_shared/bot-token-crypto.ts";
import { computeClickPrepareSign, computeClickCompleteSign } from "../_shared/click-client.ts";

function clickReply(error: number, error_note: string, extra: Record<string, unknown> = {}) {
  return json({ error, error_note, ...extra });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return clickReply(-8, "Error in request from click");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return clickReply(-8, "Error in request from click");
  }
  const get = (k: string) => String(form.get(k) ?? "");

  const clickTransId = get("click_trans_id");
  const serviceId = get("service_id");
  const merchantTransId = get("merchant_trans_id");
  const amountStr = get("amount");
  const action = get("action");
  const incomingError = Number(get("error") || "0");
  const signTime = get("sign_time");
  const signString = get("sign_string");
  const merchantPrepareIdIn = get("merchant_prepare_id");

  if (!clickTransId || !serviceId || !merchantTransId || !amountStr || (action !== "0" && action !== "1") || !signTime || !signString) {
    return clickReply(-8, "Error in request from click");
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const BOT_TOKEN_MASTER_KEY = Deno.env.get("USTORE_BOT_TOKEN_MASTER_KEY")!;
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: conn } = await db.from("click_connections")
    .select("shop_id,secret_key_ciphertext,secret_key_iv")
    .eq("service_id", serviceId).eq("status", "CONNECTED").maybeSingle();
  if (!conn?.secret_key_ciphertext) return clickReply(-8, "Error in request from click");

  const shopId = conn.shop_id as string;
  const { data: shopRow } = await db.from("shops").select("click_access_granted").eq("id", shopId).maybeSingle();
  if (!shopRow?.click_access_granted) return clickReply(-8, "Error in request from click");

  const secretKey = await decryptBotToken(BOT_TOKEN_MASTER_KEY, conn.secret_key_ciphertext, conn.secret_key_iv);

  if (action === "0") {
    // ---- Prepare ----
    const expectedSign = computeClickPrepareSign(secretKey, {
      clickTransId, serviceId, merchantTransId, amount: amountStr, action, signTime,
    });
    if (expectedSign.toLowerCase() !== signString.toLowerCase()) return clickReply(-1, "SIGN CHECK FAILED!");

    // 048-band: admin do'kon sozlamalarida "Sinash" tugmasini bosganda
    // yaratilgan REAL (lekin haqiqiy buyurtmaga bog'liq bo'lmagan) test
    // to'lovi — quyidagi haqiqiy-buyurtma yo'liga UMUMAN kirmaydi, alohida,
    // to'liq mustaqil tekshiruv. payment_test_runs.id ning o'zi
    // merchant_prepare_id sifatida ishlatiladi (qo'shimcha yozuv shart emas).
    if (merchantTransId.startsWith("TEST-")) {
      const testRunId = Number(merchantTransId.slice(5));
      if (!Number.isInteger(testRunId) || testRunId <= 0) return clickReply(-5, "User does not exist");
      const { data: testRun } = await db.from("payment_test_runs")
        .select("id,status,amount").eq("id", testRunId).eq("shop_id", shopId).eq("provider", "CLICK").maybeSingle();
      if (!testRun) return clickReply(-5, "User does not exist");
      if (testRun.status === "CANCELLED") return clickReply(-9, "Transaction cancelled");
      const amount = Number(amountStr);
      if (!Number.isFinite(amount) || Math.abs(amount - Number(testRun.amount)) > 0.01) return clickReply(-2, "Incorrect parameter amount");
      return clickReply(0, "Success", { click_trans_id: clickTransId, merchant_trans_id: merchantTransId, merchant_prepare_id: testRun.id });
    }

    const orderId = Number(merchantTransId);
    if (!Number.isInteger(orderId) || orderId <= 0) return clickReply(-5, "User does not exist");

    const { data: existing } = await db.from("click_transactions")
      .select("id,state,merchant_trans_id,amount").eq("shop_id", shopId).eq("click_trans_id", Number(clickTransId)).maybeSingle();
    if (existing) {
      if (String(existing.merchant_trans_id) !== merchantTransId) return clickReply(-6, "Transaction does not exist");
      const retryAmount = Number(amountStr);
      if (!Number.isFinite(retryAmount) || Math.abs(retryAmount - Number(existing.amount)) > 0.01) return clickReply(-2, "Incorrect parameter amount");
      if (existing.state === "CANCELLED") return clickReply(-9, "Transaction cancelled");
      return clickReply(0, "Success", { click_trans_id: clickTransId, merchant_trans_id: merchantTransId, merchant_prepare_id: existing.id });
    }

    const { data: order } = await db.from("orders").select("id,status,payable_total").eq("id", orderId).eq("shop_id", shopId).maybeSingle();
    if (!order || order.status !== "NEW") return clickReply(-5, "User does not exist");

    const amount = Number(amountStr);
    if (!Number.isFinite(amount) || Math.abs(amount - Number(order.payable_total)) > 0.01) return clickReply(-2, "Incorrect parameter amount");

    const { data: inserted, error: insertErr } = await db.from("click_transactions").insert({
      shop_id: shopId, order_id: orderId, click_trans_id: Number(clickTransId), merchant_trans_id: merchantTransId,
      amount, state: "PREPARED", error: 0, error_note: "Success",
    }).select("id").single();
    if (insertErr || !inserted) return clickReply(-8, "Error in request from click");

    return clickReply(0, "Success", { click_trans_id: clickTransId, merchant_trans_id: merchantTransId, merchant_prepare_id: inserted.id });
  }

  // ---- Complete (action === "1") ----
  const merchantPrepareId = Number(merchantPrepareIdIn);
  if (!Number.isInteger(merchantPrepareId)) return clickReply(-6, "Transaction does not exist");

  const expectedSign = computeClickCompleteSign(secretKey, {
    clickTransId, serviceId, merchantTransId, merchantPrepareId, amount: amountStr, action, signTime,
  });
  if (expectedSign.toLowerCase() !== signString.toLowerCase()) return clickReply(-1, "SIGN CHECK FAILED!");

  // 048-band: test to'lovi Complete'i — real buyurtma/click_transactions'ga
  // umuman tegmaydi. Muvaffaqiyatli tasdiqlansa payment_test_runs'ni
  // CONFIRMED qiladi, va agar shu do'kon uchun 3-si ham tasdiqlangan bo'lsa,
  // click_connections.verified=true qilib qo'yadi — shundan keyingina bu
  // to'lov usuli xaridorlarga (resolvePaymentSnapshot) ko'rinadi.
  if (merchantTransId.startsWith("TEST-")) {
    const testRunId = Number(merchantTransId.slice(5));
    if (!Number.isInteger(testRunId) || testRunId !== merchantPrepareId) return clickReply(-6, "Transaction does not exist");
    const { data: testRun } = await db.from("payment_test_runs")
      .select("id,status").eq("id", testRunId).eq("shop_id", shopId).eq("provider", "CLICK").maybeSingle();
    if (!testRun) return clickReply(-6, "Transaction does not exist");
    if (testRun.status === "CANCELLED") return clickReply(-9, "Transaction cancelled");
    if (testRun.status === "CONFIRMED") return clickReply(-4, "Already paid");
    if (incomingError < 0) {
      await db.from("payment_test_runs").update({ status: "CANCELLED" }).eq("id", testRunId);
      return clickReply(-9, "Transaction cancelled");
    }
    await db.from("payment_test_runs").update({ status: "CONFIRMED", confirmed_at: new Date().toISOString(), external_ref: clickTransId }).eq("id", testRunId);
    const { count: confirmedCount } = await db.from("payment_test_runs")
      .select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("provider", "CLICK").eq("status", "CONFIRMED");
    if ((confirmedCount || 0) >= 3) await db.from("click_connections").update({ verified: true }).eq("shop_id", shopId);
    return clickReply(0, "Success", { click_trans_id: clickTransId, merchant_trans_id: merchantTransId, merchant_confirm_id: testRunId });
  }

  const { data: txn } = await db.from("click_transactions")
    .select("id,order_id,state,amount,merchant_trans_id").eq("shop_id", shopId).eq("click_trans_id", Number(clickTransId)).maybeSingle();
  if (!txn || txn.id !== merchantPrepareId || String(txn.merchant_trans_id) !== merchantTransId) return clickReply(-6, "Transaction does not exist");
  const completeAmount = Number(amountStr);
  if (!Number.isFinite(completeAmount) || Math.abs(completeAmount - Number(txn.amount)) > 0.01) return clickReply(-2, "Incorrect parameter amount");
  if (txn.state === "CANCELLED") return clickReply(-9, "Transaction cancelled");
  if (txn.state === "CONFIRMED") return clickReply(-4, "Already paid");

  if (incomingError < 0) {
    const { error: cancelError } = await db.from("click_transactions").update({ state: "CANCELLED", error: incomingError, error_note: get("error_note") || null, cancelled_at: new Date().toISOString() })
      .eq("id", txn.id);
    if (cancelError) return clickReply(-8, "Error in request from click");
    return clickReply(-9, "Transaction cancelled");
  }

  // DB trigger updates transaction + order payment/status in this same
  // transaction. Never acknowledge success if either half failed.
  const { error: confirmError } = await db.from("click_transactions").update({
    state: "CONFIRMED", error: 0, error_note: "Success", confirmed_at: new Date().toISOString(),
  }).eq("id", txn.id);
  if (confirmError) return clickReply(-8, "Error in request from click");

  return clickReply(0, "Success", { click_trans_id: clickTransId, merchant_trans_id: merchantTransId, merchant_confirm_id: txn.id });
});
