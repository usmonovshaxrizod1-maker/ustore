// ============================================================================
// USTORE billz-sync — Billz (billz.ai) POS/ERP Phase 4: automatic sync.
// ============================================================================
// Cron-only Edge Function (pg_cron + pg_net, every 15 minutes — see the
// setup script at supabase/BILLZ_CRON_SETUP.sql). Not part of shop-api: it
// has no per-request shop context, it walks EVERY connected shop in one
// tick. Auth is a shared secret header, not Telegram initData or a
// Supabase session — there is no user on the other end of a cron tick.
// [functions.billz-sync] verify_jwt = false in config.toml, same reasoning
// as shop-api/platform-api: this caller never had a Supabase session either.
//
// For each shop with platform-granted Billz access AND an active
// billz_connections row, this does ONE full paginated crawl of that shop's
// Billz catalog (billzCrawlProductMap) and applies the result to every
// billz-linked UStorE product/variant via billz_apply_sync — which updates
// stock/name/description/price if still present in Billz, or marks it
// billz_deleted_at if it no longer exists there at all (partial-migration-
// safe by construction: a mid-crawl failure just means this shop's sync
// retries cleanly on the next 15-minute tick, nothing is left half-applied
// since each product/variant is its own independent RPC call).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";
import { getValidBillzAccessToken, billzCrawlProductMap, billzCreateSale, BillzApiError } from "../_shared/billz-client.ts";
import { json, corsHeaders } from "../_shared/http.ts";
import { decryptBotToken } from "../_shared/bot-token-crypto.ts";

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
async function telegramSend(botToken: string, chatId: string, text: string) {
  if (!botToken) return;
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ chat_id:chatId, text, parse_mode:"HTML" }) });
  if (!res.ok) throw new Error(`telegram_${res.status}`);
}
async function notifyTransitions(db: any, shopId: string, before: any, after: any, botToken: string) {
  if (!before || !after || !botToken) return;
  const productId = String(after.id || before.id || "");
  if (!productId) return;
  const targets: Array<string | null> = [];
  if ((Number(before.stock)||0) <= 0 && (Number(after.stock)||0) > 0) targets.push(null);
  const beforeMap = new Map((Array.isArray(before.variants)?before.variants:[]).map((v:any)=>[String(v?.sku||""), Number(v?.qty)||0]));
  for (const v of (Array.isArray(after.variants)?after.variants:[])) {
    const sku=String(v?.sku||""); if(!sku) continue;
    if ((Number(beforeMap.get(sku))||0) <= 0 && (Number(v?.qty)||0) > 0) targets.push(sku);
  }
  for (const variantSku of targets) {
    let q=db.from("stock_notifications").select("id,tg_id").eq("shop_id",shopId).eq("product_id",productId).is("notified_at",null);
    q=variantSku?q.eq("variant_sku",variantSku):q.is("variant_sku",null);
    const {data:subs}=await q; if(!subs?.length) continue;
    let variantLine="";
    if(variantSku){const v=(after.variants||[]).find((x:any)=>String(x?.sku||"")===variantSku);if(v)variantLine=`\n📦 Variant: ${escapeHtml([v.color,v.size].filter(Boolean).join(" / ")||variantSku)}`;}
    const text=`🔔 <b>Qayta sotuvda!</b>\n\n<b>${escapeHtml(after.name||before.name||"")}</b>${variantLine}\nQayta mavjud. Hoziroq buyurtma berishingiz mumkin.`;
    const deliveries = await Promise.allSettled(subs.map((sub:any)=>telegramSend(botToken,String(sub.tg_id),text)));
    const deliveredIds = subs.filter((_:any,index:number)=>deliveries[index]?.status === "fulfilled").map((x:any)=>x.id);
    if (deliveredIds.length) {
      const {error:markError}=await db.from("stock_notifications").update({notified_at:new Date().toISOString()})
        .eq("shop_id",shopId).in("id",deliveredIds);
      if(markError) throw markError;
    }
  }
}

async function syncPaidOrders(db:any, shopId:string, conn:any, accessToken:string):Promise<{synced:number;manual:number;failed:number}> {
  const summary={synced:0,manual:0,failed:0};
  if(!conn.billz_shop_id||!conn.billz_cashbox_id||!conn.billz_payment_type_id) return summary;
  const {data:orders,error:ordersError}=await db.from("orders")
    .select("id,items,total_discount,delivery_fee,billz_sync_status,billz_sync_attempts")
    .eq("shop_id",shopId).eq("payment_status","PAID").is("billz_order_id",null)
    .in("billz_sync_status",["PENDING","FAILED"]).lt("billz_sync_attempts",5)
    .order("paid_at",{ascending:true}).limit(20);
  if(ordersError) throw ordersError;
  for(const order of orders||[]){
    const {data:claimed}=await db.from("orders").update({
      billz_sync_status:"PROCESSING",billz_sync_error:null,billz_sync_attempts:Number(order.billz_sync_attempts||0)+1,
    }).eq("shop_id",shopId).eq("id",order.id).in("billz_sync_status",["PENDING","FAILED"]).select("id").maybeSingle();
    if(!claimed) continue;
    try{
      const saleItems=(Array.isArray(order.items)?order.items:[]).filter((it:any)=>!it?.isGift&&it?.sourceType!=="GIFT");
      const productIds=Array.from(new Set(saleItems.map((it:any)=>String(it.product_id||"")).filter(Boolean)));
      const {data:products,error:productsError}=productIds.length
        ? await db.from("products").select("id,billz_product_id,variants").eq("shop_id",shopId).in("id",productIds)
        : {data:[],error:null};
      if(productsError) throw productsError;
      const byId=new Map((products||[]).map((p:any)=>[String(p.id),p]));
      const billzItems:{billzProductId:string;qty:number}[]=[];
      let unmapped=0;
      for(const item of saleItems){
        const product:any=byId.get(String(item.product_id||""));
        let linked=product?.billz_product_id?String(product.billz_product_id):null;
        if(!linked&&Array.isArray(product?.variants)){
          const variant=product.variants.find((v:any)=>String(v?.sku||"")===String(item.sku||""));
          linked=variant?.billzProductId?String(variant.billzProductId):null;
        }
        const qty=Number(item.qty)||0;
        if(linked&&qty>0)billzItems.push({billzProductId:linked,qty}); else if(qty>0)unmapped++;
      }
      if(!billzItems.length){
        await db.from("orders").update({billz_sync_status:"SKIPPED",billz_sync_error:null}).eq("shop_id",shopId).eq("id",order.id);
        continue;
      }
      if(unmapped>0||Number(order.total_discount)>0||Number(order.delivery_fee)>0||saleItems.some((it:any)=>it?.sourceType==="BUNDLE")){
        await db.from("orders").update({
          billz_sync_status:"MANUAL_REQUIRED",
          billz_sync_error:"Qisman yoki noto'g'ri BILLZ sotuvini oldini olish uchun qo'lda solishtirish kerak",
        }).eq("shop_id",shopId).eq("id",order.id);
        summary.manual++; continue;
      }
      const sale=await billzCreateSale(accessToken,{
        billzShopId:conn.billz_shop_id,billzCashboxId:conn.billz_cashbox_id,
        billzPaymentTypeId:conn.billz_payment_type_id,billzPaymentTypeName:conn.billz_payment_type_name,
        items:billzItems,comment:`UStorE #${order.id}`,
      });
      await db.from("orders").update({
        billz_order_id:sale.orderId,billz_sync_status:"SYNCED",billz_sync_error:null,billz_synced_at:new Date().toISOString(),
      }).eq("shop_id",shopId).eq("id",order.id);
      summary.synced++;
    }catch(e:any){
      await db.from("orders").update({billz_sync_status:"FAILED",billz_sync_error:String(e?.message||e||"billz_order_sync_failed").slice(0,500)})
        .eq("shop_id",shopId).eq("id",order.id);
      summary.failed++;
    }
  }
  return summary;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const CRON_SECRET = Deno.env.get("USTORE_BILLZ_CRON_SECRET") || "";
  const gotSecret = req.headers.get("x-cron-secret") || "";
  if (!CRON_SECRET || gotSecret !== CRON_SECRET) return json({ error: "forbidden" }, 403);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const BOT_TOKEN_MASTER_KEY = Deno.env.get("USTORE_BOT_TOKEN_MASTER_KEY")!;
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: connections, error: connErr } = await db.from("billz_connections")
    .select("shop_id,billz_shop_id,billz_cashbox_id,billz_payment_type_id,billz_payment_type_name").eq("status", "CONNECTED");
  if (connErr) return json({ error: "connections_query_failed" }, 500);
  if (!connections?.length) return json({ shopsProcessed: 0, results: [] });

  const shopIds = connections.map((c: any) => c.shop_id);
  const { data: shops, error: shopsErr } = await db.from("shops")
    .select("id,billz_access_granted").in("id", shopIds);
  if (shopsErr) return json({ error: "shops_query_failed" }, 500);
  const grantedShopIds = new Set((shops || []).filter((s: any) => s.billz_access_granted).map((s: any) => s.id));

  const results: { shopId: string; ok: boolean; linkedCount?: number; error?: string }[] = [];

  for (const conn of connections) {
    const shopId = conn.shop_id as string;
    if (!grantedShopIds.has(shopId)) continue; // platform revoked access after connecting — skip, don't touch

    try {
      const accessToken = await getValidBillzAccessToken(db, shopId, BOT_TOKEN_MASTER_KEY);
      const productMap = await billzCrawlProductMap(accessToken, conn.billz_shop_id || null);

      const { data: linkedRows, error: prodErr } = await db.from("products")
        .select("id,name,stock,billz_product_id,variants").eq("shop_id", shopId).is("billz_deleted_at", null);
      if (prodErr) throw prodErr;

      let shopBotToken = "";
      try {
        const { data: botRow } = await db.from("shop_bots").select("token_ciphertext,token_iv").eq("shop_id", shopId).eq("status", "ACTIVE").maybeSingle();
        if (botRow?.token_ciphertext && botRow?.token_iv) shopBotToken = await decryptBotToken(BOT_TOKEN_MASTER_KEY, botRow.token_ciphertext, botRow.token_iv);
      } catch (e: any) { console.error("[BILLZ_RESTOCK_BOT_TOKEN_FAILED]", { shopId, code: e?.code || "decrypt_failed" }); }

      const snapshotByBillzId = new Map<string, any>();
      const billzIds = new Set<string>();
      for (const row of linkedRows || []) {
        if (row.billz_product_id) { billzIds.add(String(row.billz_product_id)); snapshotByBillzId.set(String(row.billz_product_id), structuredClone(row)); }
        for (const v of (Array.isArray(row.variants) ? row.variants : [])) {
          if (v?.billzProductId) { billzIds.add(String(v.billzProductId)); snapshotByBillzId.set(String(v.billzProductId), structuredClone(row)); }
        }
      }

      let syncedCount = 0;
      const syncErrors: string[] = [];
      for (const billzProductId of billzIds) {
        const entry = productMap.get(billzProductId);
        const { error: rpcErr } = await db.rpc("billz_apply_sync_v2", {
          p_shop_id: shopId, p_billz_product_id: billzProductId,
          p_new_stock: entry ? entry.stock : null,
          p_name: entry ? entry.name : null,
          p_description: entry ? entry.description : null,
          p_price: entry ? entry.price : null,
        });
        if (rpcErr) {
          syncErrors.push(`${billzProductId}:${String(rpcErr.message || "rpc_failed").slice(0, 120)}`);
          console.error("[BILLZ_SYNC_FAILED:RPC]", { shopId, billzProductId, message: rpcErr.message });
        }
        else {
          syncedCount++;
          const before = snapshotByBillzId.get(billzProductId);
          if (before?.id && shopBotToken) {
            const { data: after } = await db.from("products").select("id,name,stock,variants").eq("shop_id", shopId).eq("id", before.id).maybeSingle();
            if (after) {
              await notifyTransitions(db, shopId, before, after, shopBotToken);
              // Keep later variant/product Billz IDs in the same crawl relative to the latest state.
              for (const [id, snap] of snapshotByBillzId.entries()) if (snap?.id === before.id) snapshotByBillzId.set(id, structuredClone(after));
            }
          }
        }
      }

      if (syncErrors.length) {
        const message = `partial_sync:${syncedCount}/${billzIds.size}; ${syncErrors.slice(0, 2).join(" | ")}`;
        await db.from("billz_connections").update({ status: "ERROR", last_error: message.slice(0, 300) }).eq("shop_id", shopId);
        results.push({ shopId, ok: false, linkedCount: syncedCount, error: message });
      } else {
        await db.from("billz_connections").update({
          last_stock_sync_at: new Date().toISOString(),
          last_deletion_scan_at: new Date().toISOString(),
          status: "CONNECTED", last_error: null,
        }).eq("shop_id", shopId);
        await syncPaidOrders(db,shopId,conn,accessToken);
        results.push({ shopId, ok: true, linkedCount: billzIds.size });
      }
    } catch (e: any) {
      const message = e instanceof BillzApiError ? e.message : (e?.message || "billz_sync_failed");
      console.error("[BILLZ_SYNC_FAILED:SHOP]", { shopId, message });
      await db.from("billz_connections").update({ status: "ERROR", last_error: String(message).slice(0, 300) }).eq("shop_id", shopId);
      results.push({ shopId, ok: false, error: message });
    }
  }

  return json({ shopsProcessed: results.length, results });
});
