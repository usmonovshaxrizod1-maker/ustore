// ============================================================================
// USTORE uzum-webhook — Uzum Checkout "Acquiring Merchant Callback".
// ============================================================================
// Public endpoint (verify_jwt = false, see config.toml). Contract:
// developer.uzumbank.uz/en/checkout/ (Callbacks section, fetched live).
//
// ⚠️ SECURITY NOTE: unlike Click (MD5 sign_string) and Payme (Basic Auth),
// the Uzum Checkout docs did not document any signature or auth mechanism
// on the callback itself — only that "Your server must process the
// received callback request and return a status of 200 OK" (retried up to
// 5 times otherwise). As a defensive substitute, this handler ONLY ever
// transitions a transaction we ourselves created via uzumRegisterPayment
// (looked up by the orderId Uzum itself returned to us at registration
// time, which is unguessable — a random UUID) from REGISTERED to a final
// state, and cross-checks the callback's orderNumber against the order_id
// we stored for that same row. If Uzum's real production docs (available
// after partner onboarding) reveal a header signature, add verification
// here before going live — this gap is called out explicitly in the round
// report.
//
// This is a NEW, independent "UZUM" payment method (shop-api's
// resolvePaymentSnapshot), parallel to CLICK/PAYME and any existing manual
// QR:UZUM flow.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";
import { json, corsHeaders } from "../_shared/http.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ errorCode: 3000, message: "Method not allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ errorCode: 2000, message: "Invalid JSON" }, 400);
  }

  const orderId = String(body?.orderId || "");
  const operationState = String(body?.operationState || "");
  const orderNumber = String(body?.orderNumber || "");
  if (!orderId) return json({ errorCode: 2000, message: "orderId required" }, 400);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: txn } = await db.from("uzum_transactions").select("*").eq("uzum_order_id", orderId).maybeSingle();
  if (!txn) return json({ errorCode: 3005, message: "Payment not found" }, 200);
  if (String(txn.order_id) !== orderNumber) return json({ errorCode: 2000, message: "orderNumber mismatch" }, 200);

  // Idempotent — a retried callback for an already-final transaction is
  // acknowledged (200) without re-applying side effects.
  if (txn.state !== "REGISTERED") return json({ errorCode: 0, message: "already processed" });

  const shopId = txn.shop_id as string;
  const orderIdNum = Number(txn.order_id);

  if (operationState === "SUCCESS") {
    await db.from("uzum_transactions").update({ state: "COMPLETED", completed_at: new Date().toISOString() }).eq("id", txn.id);

    const { data: order } = await db.from("orders").select("id,status,payment_snapshot").eq("id", orderIdNum).eq("shop_id", shopId).maybeSingle();
    if (order && order.status === "NEW") {
      const { error: rpcErr } = await db.rpc("update_order_status", {
        p_shop_id: shopId, p_order_id: orderIdNum, p_new_status: "PROCESSING",
        p_requester_tg_id: "UZUM_WEBHOOK", p_is_admin: true, p_cancel_reason: null,
      });
      if (rpcErr) console.error("[UZUM_CONFIRM_STATUS_UPDATE_FAILED]", { shopId, orderId: orderIdNum, message: rpcErr.message });
      const snapshot = { ...(order.payment_snapshot || {}), receiptStatus: "AUTO_CONFIRMED", uzumConfirmedAt: new Date().toISOString() };
      await db.from("orders").update({ payment_snapshot: snapshot }).eq("id", orderIdNum).eq("shop_id", shopId);
    }
  } else {
    await db.from("uzum_transactions").update({ state: "DECLINED" }).eq("id", txn.id);
    try {
      await db.rpc("update_order_status", {
        p_shop_id: shopId, p_order_id: orderIdNum, p_new_status: "CANCELLED", p_requester_tg_id: "UZUM_WEBHOOK",
        p_is_admin: true, p_cancel_reason: "Uzum to'lovi rad etildi",
      });
    } catch (e) { console.error("[UZUM_DECLINE_STATUS_UPDATE_FAILED]", e); }
  }

  return json({ errorCode: 0, message: "ok" });
});
