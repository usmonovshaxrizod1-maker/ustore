// ============================================================================
// USTORE platform-subscription-cron — obuna hayot sikli, avtomatik qism.
// ============================================================================
// Cron-only Edge Function (pg_cron + pg_net, kuniga bir marta — qarang
// supabase/PLATFORM_CRON_SETUP.sql), billz-sync bilan bir xil x-cron-secret
// autentifikatsiya naqshi.
//
// Bu funksiya FAQAT ikkita ishni qiladi:
//   1) ACTIVE + subscription_expires_at < now() bo'lgan do'konlarni FROZEN
//      qiladi (frozen_at=now()) va egasiga xabar yuboradi.
//   2) Ogohlantirish xabarlari: tugashiga 7/3/1 kun qolganda (ACTIVE), va
//      muzlatilgandan 7/1 kun oldin (grace 30 kun) qolganda.
// O'CHIRISH (terminatsiya) BU YERDA YO'Q — ataylab. 25+ kun muzlatilgan
// do'konlar admin Dashboard'ning "Diqqat talab qiladi" ro'yxatida ko'rinadi,
// lekin admin har doim qo'lda "O'chirish" bosishi kerak (tasodifiy avtomatik
// o'chirishning oldini olish uchun).
//
// 2026-08-28, 053-migratsiya: matnlar endi `notification_templates`dan
// (admin tahrirlay oladi, o'zgartirilmagan bo'lsa default matn ishlatiladi)
// va dedup endi HAQIQIY `notification_events` jadvalidan (avvalgi "kunlik
// oyna" hisob-kitobi — cron kechikib/ikki marta ishlab qolsa xato yoki
// takrorlanish xavfi bor edi, endi shop_id+type+milestone UNIQUE bilan
// baza darajasida kafolatlangan).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";
import { telegramApi } from "../_shared/telegram.ts";
import { json, corsHeaders } from "../_shared/http.ts";
import { SHOP_FREEZE_DAYS } from "../_shared/lifecycle-constants.ts";

function daysFromNowIso(days: number): string {
  return new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
}
// Berilgan sanadan "n kun oldin/keyin"gi 24 soatlik oyna ichidami — bu FAQAT
// "bugun shu milestone'ni tekshirish kerakmi" degan tezkor filtr, haqiqiy
// takrorlanmaslikni notification_events'dagi UNIQUE constraint ta'minlaydi
// (shuning uchun oyna aniq bo'lmasa ham — masalan cron bir kun kechiksa —
// milestone baribir faqat bir marta yuboriladi, hech qachon ikki marta emas).
function isWithinDayWindow(targetIso: string, daysOffset: number): boolean {
  const target = new Date(targetIso).getTime();
  const windowStart = Date.now() + (daysOffset - 1.5) * 24 * 3600 * 1000;
  const windowEnd = Date.now() + (daysOffset + 0.5) * 24 * 3600 * 1000;
  return target > windowStart && target <= windowEnd;
}

type Template = { body: string; imageUrl: string | null; imageStoragePath: string | null; isActive: boolean };

function fillPlaceholders(body: string, placeholders: Record<string, string>): string {
  let text = body;
  for (const [key, value] of Object.entries(placeholders)) text = text.split(`{${key}}`).join(value);
  return text;
}

async function resolveTemplateImage(db: any, tpl: Template): Promise<string | null> {
  if (tpl.imageStoragePath) {
    try {
      const { data, error } = await db.storage.from("payment-receipts").createSignedUrl(tpl.imageStoragePath, 3600);
      if (!error && data?.signedUrl) return data.signedUrl;
    } catch (_) {}
  }
  return tpl.imageUrl || null;
}

async function notifyOwner(db: any, botToken: string, shopId: string, text: string, imageUrl: string | null): Promise<{sent:boolean;recipient:string|null;error:string|null}> {
  let recipient: string | null = null;
  try {
    const { data: membership } = await db.from("shop_memberships")
      .select("telegram_user_id").eq("shop_id", shopId).eq("role", "OWNER").eq("status", "ACTIVE").maybeSingle();
    if (!membership?.telegram_user_id) return { sent: false, recipient: null, error: "owner_not_found" };
    recipient = String(membership.telegram_user_id);
    if (imageUrl) await telegramApi(botToken, "sendPhoto", { chat_id: recipient, photo: imageUrl, caption: text });
    else await telegramApi(botToken, "sendMessage", { chat_id: recipient, text });
    return { sent: true, recipient, error: null };
  } catch (e) {
    const message = String((e as any)?.message || e);
    console.error("[SUBSCRIPTION_CRON] notify error", { shopId, message });
    return { sent: false, recipient, error: message };
  }
}

// Idempotent bildirishnoma: avval notification_events'ga INSERT qilishga
// urinadi — UNIQUE(shop_id,type,milestone) konflikt bersa (23505), bu
// milestone allaqachon yuborilgan degani, jim o'tkazib yuboriladi (xato
// emas). Faqat insert MUVAFFAQIYATLI bo'lsagina haqiqatan xabar jo'natiladi.
async function sendTemplatedNotification(
  db: any, botToken: string, shopId: string, type: string, milestone: string,
  templates: Map<string, Template>, placeholders: Record<string, string>,
): Promise<boolean> {
  const tpl = templates.get(type);
  if (!tpl || !tpl.isActive) return false;
  const { error: insErr } = await db.from("notification_events").insert({ shop_id: shopId, notification_type: type, milestone });
  if (insErr) {
    if (insErr.code !== "23505") console.error("[SUBSCRIPTION_CRON] notification_events insert error", { shopId, type, message: insErr.message });
    return false;
  }
  const imageUrl = await resolveTemplateImage(db, tpl);
  const delivery = await notifyOwner(db, botToken, shopId, fillPlaceholders(tpl.body, placeholders), imageUrl);
  if (!delivery.sent) {
    // The row is a delivery receipt, not merely an attempt marker. Remove a
    // failed claim so the next cron run can retry the notification.
    await db.from("notification_events").delete()
      .eq("shop_id", shopId).eq("notification_type", type).eq("milestone", milestone);
  }
  if (type === "FROZEN") {
    try {
      await db.from("platform_lifecycle_notification_log").insert({
        shop_id: shopId,
        notification_type: type,
        recipient_telegram_id: delivery.recipient,
        status: delivery.sent ? "SENT" : (delivery.error === "owner_not_found" ? "SKIPPED" : "FAILED"),
        error_text: delivery.error,
      });
    } catch (_) {}
  }
  return delivery.sent;
}

async function loadTemplates(db: any): Promise<Map<string, Template>> {
  const { data } = await db.from("notification_templates").select("type,body,image_url,image_storage_path,is_active");
  const map = new Map<string, Template>();
  for (const t of data || []) map.set(t.type, {
    body: t.body,
    imageUrl: t.image_url || null,
    imageStoragePath: t.image_storage_path || null,
    isActive: t.is_active === true,
  });
  return map;
}

// 2026-08-28, 055-migratsiya: Group A ("Mini-App ochilgan, lekin obuna
// bo'lmagan") — do'konga bog'liq emas, shu sabab shop-based
// sendTemplatedNotification()'dan ALOHIDA. Idempotentlik: shop_id+type+
// milestone UNIQUE o'rniga, bu yerda shartli UPDATE (faqat ustun hali NULL
// bo'lsa) — bir xil natija, boshqa mexanizm (chunki bu yerda "shop"
// tushunchasi umuman yo'q, notification_events'ning shop_id NOT NULL
// talabini qondira olmaydi).
async function sendVisitorReminder(
  db: any, botToken: string, telegramUserId: string, type: string, sentColumn: string, templates: Map<string, Template>,
): Promise<boolean> {
  const tpl = templates.get(type);
  if (!tpl || !tpl.isActive) return false;
  const { data: updated, error } = await db.from("platform_visitor_tracking")
    .update({ [sentColumn]: new Date().toISOString() })
    .eq("telegram_user_id", telegramUserId).is(sentColumn, null).select("telegram_user_id");
  if (error || !updated || !updated.length) return false; // allaqachon yuborilgan yoki DB xatosi — yubormaymiz
  try {
    const imageUrl = await resolveTemplateImage(db, tpl);
    if (imageUrl) await telegramApi(botToken, "sendPhoto", { chat_id: telegramUserId, photo: imageUrl, caption: tpl.body });
    else await telegramApi(botToken, "sendMessage", { chat_id: telegramUserId, text: tpl.body });
  } catch (e) {
    console.error("[SUBSCRIPTION_CRON] visitor reminder send error", { telegramUserId, type, message: (e as any)?.message || e });
    await db.from("platform_visitor_tracking").update({ [sentColumn]: null }).eq("telegram_user_id", telegramUserId);
    return false;
  }
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const CRON_SECRET = Deno.env.get("USTORE_PLATFORM_CRON_SECRET") || "";
  const gotSecret = req.headers.get("x-cron-secret") || "";
  if (!CRON_SECRET || gotSecret !== CRON_SECRET) return json({ error: "forbidden" }, 403);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const PLATFORM_BOT_TOKEN = Deno.env.get("USTORE_PLATFORM_BOT_TOKEN")!;
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 059: one-hour payment drafts are purged on every lifecycle run too. API
  // reads also purge, so stale drafts never remain visible to user/admin.
  try { await db.rpc("ustore_purge_expired_payment_drafts"); } catch (_) {}

  const { data: lifecycleRow } = await db.from("platform_lifecycle_settings").select("*").eq("id", true).maybeSingle();
  const autoFreezeOnExpiry = lifecycleRow?.auto_freeze_on_expiry !== false;
  const retentionDays = Math.max(1, Math.min(365, Number(lifecycleRow?.retention_days || SHOP_FREEZE_DAYS)));
  const freezeActionText = String(lifecycleRow?.freeze_action_text || "Muammoni bartaraf eting yoki UStorE administratori bilan bog'laning.");
  const supportContact = String(lifecycleRow?.support_url || lifecycleRow?.support_label || "UStorE administratori");

  const nowIso = new Date().toISOString();
  const templates = await loadTemplates(db);
  let frozenCount = 0;
  let warned7dCount = 0;
  let warned3dCount = 0;
  let warned1dCount = 0;
  let warnedGrace7dCount = 0;
  let warnedGrace1dCount = 0;
  let freezeExpiredTaskCount = 0;
  let visitorReminder1dCount = 0;
  let visitorReminder3dCount = 0;
  let visitorReminder7dCount = 0;

  // ---- 1) Muddati o'tgan ACTIVE do'konlarni muzlatish ----------------------
  if (autoFreezeOnExpiry) {
    const { data: expiredSettings, error } = await db.from("shop_settings")
      .select("shop_id,name,subscription_expires_at").not("subscription_expires_at", "is", null).lt("subscription_expires_at", nowIso);
    if (error) return json({ error: "expired_query_failed" }, 500);
    const shopIds = (expiredSettings || []).map((r: any) => r.shop_id);
    if (shopIds.length) {
      const { data: activeShops } = await db.from("shops").select("id").in("id", shopIds).eq("status", "ACTIVE");
      const expiredByShop = new Map((expiredSettings || []).map((r: any) => [r.shop_id, r]));
      for (const s of activeShops || []) {
        const row = expiredByShop.get(s.id) as any;
        const reason = "Obuna muddati tugadi";
        const { data: frozen, error: freezeError } = await db.rpc("ustore_freeze_shop", {
          p_shop_id: s.id, p_reason: reason, p_retention_days: retentionDays,
        });
        if (freezeError) { console.error("[SUBSCRIPTION_CRON] freeze failed", { shopId: s.id, message: freezeError.message }); continue; }
        frozenCount++;
        const sent = await sendTemplatedNotification(db, PLATFORM_BOT_TOKEN, s.id, "FROZEN", frozen.frozenAt, templates, {
          SHOP_NAME: row?.name || "Do'koningiz",
          REASON: reason,
          ACTION: freezeActionText,
          SUPPORT_CONTACT: supportContact,
        });
        if (!sent) { /* shablon o'chirilgan yoki yetkazish xatosi — muzlatish o'zi baribir amalga oshadi */ }
      }
    }
  }

  // ---- 2) Tugashiga 7/3/1 kun qolgan ACTIVE do'konlarga ogohlantirish ------
  {
    const { data: settings } = await db.from("shop_settings")
      .select("shop_id,name,subscription_expires_at").not("subscription_expires_at", "is", null).gte("subscription_expires_at", nowIso).lte("subscription_expires_at", daysFromNowIso(7));
    const shopIds = (settings || []).map((r: any) => r.shop_id);
    const activeShopIds = shopIds.length
      ? new Set(((await db.from("shops").select("id").in("id", shopIds).eq("status", "ACTIVE")).data || []).map((s: any) => s.id))
      : new Set();
    for (const r of settings || []) {
      if (!activeShopIds.has(r.shop_id)) continue;
      const placeholders = { SHOP_NAME: r.name || "Do'koningiz", EXPIRY_DATE: String(r.subscription_expires_at).slice(0, 10) };
      if (isWithinDayWindow(r.subscription_expires_at, 7)) {
        if (await sendTemplatedNotification(db, PLATFORM_BOT_TOKEN, r.shop_id, "EXPIRY_7D", r.subscription_expires_at, templates, { ...placeholders, DAYS_LEFT: "7" })) warned7dCount++;
      } else if (isWithinDayWindow(r.subscription_expires_at, 3)) {
        if (await sendTemplatedNotification(db, PLATFORM_BOT_TOKEN, r.shop_id, "EXPIRY_3D", r.subscription_expires_at, templates, { ...placeholders, DAYS_LEFT: "3" })) warned3dCount++;
      } else if (isWithinDayWindow(r.subscription_expires_at, 1)) {
        if (await sendTemplatedNotification(db, PLATFORM_BOT_TOKEN, r.shop_id, "EXPIRY_1D", r.subscription_expires_at, templates, { ...placeholders, DAYS_LEFT: "1" })) warned1dCount++;
      }
    }
  }

  // ---- 3) Muzlatilgan do'konlarga grace-period ogohlantirishlari (kanonik
  //      SHOP_FREEZE_DAYS/retentionDays muddatning 7 kun va 1 kun qolganida,
  //      ya'ni muzlatilgandan retentionDays-7/retentionDays-1 kun o'tganda —
  //      standart 60 kunlik muddatda bu 53/59-kunlarga to'g'ri keladi)
  //      ---------------------------------------------------------------
  {
    const { data: frozenSettings } = await db.from("shop_settings")
      .select("shop_id,name,frozen_at,frozen_delete_at").not("frozen_at", "is", null);
    const shopIds = (frozenSettings || []).map((r: any) => r.shop_id);
    const frozenShopIds = shopIds.length
      ? new Set(((await db.from("shops").select("id").in("id", shopIds).eq("status", "FROZEN")).data || []).map((s: any) => s.id))
      : new Set();
    for (const r of frozenSettings || []) {
      if (!frozenShopIds.has(r.shop_id)) continue;
      const graceDeadlineIso = r.frozen_delete_at || new Date(new Date(r.frozen_at).getTime() + retentionDays * 24 * 3600 * 1000).toISOString();
      const placeholders = { SHOP_NAME: r.name || "Do'koningiz", RETENTION_DAYS_LEFT: "" };
      if (isWithinDayWindow(graceDeadlineIso, 7)) {
        if (await sendTemplatedNotification(db, PLATFORM_BOT_TOKEN, r.shop_id, "GRACE_7D", graceDeadlineIso, templates, { ...placeholders, RETENTION_DAYS_LEFT: "7" })) warnedGrace7dCount++;
      } else if (isWithinDayWindow(graceDeadlineIso, 1)) {
        if (await sendTemplatedNotification(db, PLATFORM_BOT_TOKEN, r.shop_id, "GRACE_1D", graceDeadlineIso, templates, { ...placeholders, RETENTION_DAYS_LEFT: "1" })) warnedGrace1dCount++;
      }
      // Lifecycle round v2: muddat HAQIQATAN tugagan bo'lsa (bugungi kunga
      // qadar), platform admin uchun BIR MARTALIK vazifa yaratiladi —
      // AVTOMATIK terminate/purge YO'Q (foydalanuvchi aniq talab qilgan:
      // "60 kun tugaganda platform adminiga notification/task chiqsin...
      // avtomatik terminate qilinmasin"). Idempotentlik — oddiy INSERT +
      // 071-migratsiyadagi qisman UNIQUE indeks (shop_id,type) WHERE
      // resolved_at IS NULL: takroriy INSERT 23505 (unique_violation)
      // bilan jim rad etiladi — notification_events'dagi bilan bir xil
      // naqsh, yangi mexanizm o'ylab topilmagan.
      if (new Date(graceDeadlineIso).getTime() <= Date.now()) {
        const { error: taskErr } = await db.from("platform_admin_tasks").insert({ type: "FREEZE_EXPIRED", shop_id: r.shop_id });
        if (!taskErr) freezeExpiredTaskCount++;
        else if (taskErr.code !== "23505") console.error("[SUBSCRIPTION_CRON] platform_admin_tasks insert error", { shopId: r.shop_id, message: taskErr.message });
      }
    }
  }

  // ---- 4) Mini-App ochilgan, lekin hech qachon do'kon egasi bo'lmagan
  //      foydalanuvchilarga eslatma (Group A, 055-migratsiya) — +1/+3/+7
  //      kundan keyin, keyin TO'XTAYDI (cheksiz marketing emas). Har bir
  //      eslatmadan OLDIN qayta tekshiriladi: shu orada obuna bo'lgan
  //      bo'lsa (endi shop_memberships'da OWNER qatori bor), yuborilmaydi.
  {
    const { data: visitors } = await db.from("platform_visitor_tracking")
      .select("telegram_user_id,first_visit_at,reminder_1d_sent_at,reminder_3d_sent_at,reminder_7d_sent_at")
      .is("reminder_7d_sent_at", null); // 7d yuborilgan = sikl tugagan, boshqa hech narsa yuborilmaydi
    const visitorIds = (visitors || []).map((v: any) => String(v.telegram_user_id));
    // Haqiqiy "hali do'koni yo'qmi" tekshiruvi — bitta batch so'rov bilan
    // (2/3-bo'limlardagi bir xil naqsh: N+1 emas).
    const ownerRows = visitorIds.length
      ? (await db.from("shop_memberships").select("telegram_user_id").in("telegram_user_id", visitorIds).eq("role", "OWNER").eq("status", "ACTIVE")).data || []
      : [];
    const nowOwnerIds = new Set(ownerRows.map((r: any) => String(r.telegram_user_id)));
    for (const v of visitors || []) {
      const tgIdStr = String(v.telegram_user_id);
      if (nowOwnerIds.has(tgIdStr)) continue; // shu orada obuna bo'lgan — eslatma shart emas
      const firstVisitMs = new Date(v.first_visit_at).getTime();
      const due1d = new Date(firstVisitMs + 1 * 24 * 3600 * 1000).toISOString();
      const due3d = new Date(firstVisitMs + 3 * 24 * 3600 * 1000).toISOString();
      const due7d = new Date(firstVisitMs + 7 * 24 * 3600 * 1000).toISOString();
      if (!v.reminder_1d_sent_at && isWithinDayWindow(due1d, 0)) {
        if (await sendVisitorReminder(db, PLATFORM_BOT_TOKEN, tgIdStr, "VISITOR_1D", "reminder_1d_sent_at", templates)) visitorReminder1dCount++;
      } else if (!v.reminder_3d_sent_at && isWithinDayWindow(due3d, 0)) {
        if (await sendVisitorReminder(db, PLATFORM_BOT_TOKEN, tgIdStr, "VISITOR_3D", "reminder_3d_sent_at", templates)) visitorReminder3dCount++;
      } else if (!v.reminder_7d_sent_at && isWithinDayWindow(due7d, 0)) {
        if (await sendVisitorReminder(db, PLATFORM_BOT_TOKEN, tgIdStr, "VISITOR_7D", "reminder_7d_sent_at", templates)) visitorReminder7dCount++;
      }
    }
  }

  return json({
    frozenCount, warned7dCount, warned3dCount, warned1dCount, warnedGrace7dCount, warnedGrace1dCount,
    freezeExpiredTaskCount,
    visitorReminder1dCount, visitorReminder3dCount, visitorReminder7dCount,
  });
});
