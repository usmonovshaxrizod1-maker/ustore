// ============================================================================
// USTORE platform-api — the MAIN UStorE bot's backend. Phase 2.
// ============================================================================
// Completely separate from shop-api: this function authenticates against
// USTORE_PLATFORM_BOT_TOKEN (one single bot — the platform's own), never a
// shop's bot token, and every one of its actions is gated to the platform
// Super Admin (USTORE_SUPER_ADMIN_ID) for administrative actions. A small
// credential-management surface is available to any user whose initData is
// verified by this CENTRAL platform bot. It is what lets the Super Admin
// connect a NEW shop's Telegram bot to this platform — shop-api itself never
// creates shops, it only ever SERVES a shop that already exists and is ACTIVE.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";
import JSZip from "npm:jszip@3.10.1";
import { encryptBotToken, decryptBotToken } from "../_shared/bot-token-crypto.ts";
import { SHOP_FREEZE_DAYS } from "../_shared/lifecycle-constants.ts";
import { json, corsHeaders } from "../_shared/http.ts";
import { verifyTelegramInitData, telegramWebhookSecret, telegramApi } from "../_shared/telegram.ts";
import { ensureTelegramAccount } from "../_shared/account-identity.ts";
import { approveTelegramWebChallenge } from "../_shared/web-telegram-auth.ts";
import { changeLogin, issueInitialCredentials, resetCredentialsForTelegram, setCredentialsPasswordForTelegram, resolveSession } from "../_shared/web-auth.ts";
import { handlePlatformDomainAction } from "../_shared/shop-domains.ts";
import { CATEGORY_ICON_IDS } from "../_shared/category-icons.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };


const CATEGORY_ICON_ALLOWED_TAGS = new Set(["svg","g","path","circle","rect","line","polyline","polygon","ellipse"]);
const CATEGORY_ICON_ALLOWED_ATTRS = new Set([
  "viewBox","d","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","fill-rule","clip-rule",
  "cx","cy","r","rx","ry","x","y","x1","y1","x2","y2","points","transform","opacity","width","height"
]);
function sanitizeCategorySvg(raw: unknown): string {
  let svg = String(raw || "").trim().replace(/^<\?xml[^>]*>\s*/i, "").replace(/<!--([\s\S]*?)-->/g, "");
  if (svg.length < 20 || svg.length > 20000) throw new Error("invalid_category_svg_size");
  if (!/^<svg\b[\s\S]*<\/svg>$/i.test(svg)) throw new Error("invalid_category_svg");
  if (/\b(?:script|foreignObject|style|iframe|object|embed|image|a|use|symbol)\b/i.test(svg)) throw new Error("unsafe_category_svg");
  if (/\bon[a-z]+\s*=|\b(?:href|xlink:href|style)\s*=|url\s*\(|javascript:|data:/i.test(svg)) throw new Error("unsafe_category_svg");
  const open = svg.match(/^<svg\b([^>]*)>/i);
  if (!open || !/\bviewBox\s*=\s*["']0\s+0\s+64\s+64["']/i.test(open[1])) throw new Error("invalid_category_svg_viewbox");
  const tags = Array.from(svg.matchAll(/<\/?\s*([a-zA-Z][\w:-]*)\b/g)).map((m) => m[1]);
  if (tags.some((tag) => !CATEGORY_ICON_ALLOWED_TAGS.has(tag))) throw new Error("unsafe_category_svg_tag");
  for (const m of svg.matchAll(/\s([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*["'][^"']*["']/g)) {
    const attr = m[1];
    if (attr === "xmlns" || attr === "aria-hidden" || attr === "focusable") continue;
    if (!CATEGORY_ICON_ALLOWED_ATTRS.has(attr)) throw new Error("unsafe_category_svg_attribute");
    if ((attr === "fill" || attr === "stroke") && !/^(?:none|currentColor|inherit)$/i.test(m[0].split(/=\s*/)[1].replace(/["']/g, "").trim())) throw new Error("category_svg_color_must_use_currentcolor");
  }
  const inner = svg.replace(/^<svg\b[^>]*>/i, "").replace(/<\/svg>\s*$/i, "").trim();
  if (!inner) throw new Error("invalid_category_svg");
  return `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${inner}</svg>`;
}
function categoryIconId(raw: unknown): string {
  const id = String(raw || "").trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(id)) throw new Error("invalid_category_icon_id");
  return id;
}
function categoryIconGroup(raw: unknown): string {
  const group = String(raw || "custom").trim().toLowerCase() || "custom";
  if (!/^[a-z][a-z0-9_]{0,31}$/.test(group)) throw new Error("invalid_category_icon_group");
  return group;
}

async function ensureShopSubdomain(db: any, shopId: string, name: string) {
  const { data, error } = await db.rpc("ustore_ensure_shop_subdomain", {
    p_shop_id: shopId, p_name: name,
    p_base_hostname: Deno.env.get("USTORE_BASE_HOSTNAME") || "ustr.uz",
  });
  if (error) throw error;
  let row = data;
  if (Deno.env.get("USTORE_WILDCARD_READY") === "true") {
    const activated = await db.rpc("ustore_activate_shop_subdomain", {
      p_shop_id: shopId, p_base_hostname: Deno.env.get("USTORE_BASE_HOSTNAME") || "ustr.uz",
    });
    if (activated.error) throw activated.error;
    row = activated.data || row;
  }
  return { hostname: String(row.hostname), status: String(row.status) };
}

// 11-band: universal shop Mini App base URL — the SAME url for every shop,
// distinguished only by its ?bot_id= query param. Overridable via env in
// case the GitHub Pages URL ever changes, without a code redeploy.
const DEFAULT_SHOP_MINI_APP_BASE_URL = "https://usmonovshaxrizod1-maker.github.io/ustore/";
// ?v=2: Telegram WebView'lar ba'zan mini-app manzilini o'zi ichki keshlaydi —
// bu OS/Telegram-ilova darajasidagi kesh tozalashdan MUSTAQIL, alohida joyda
// saqlanadi. Manzil satrini (query orqali) o'zgartirish Telegram'ni buni
// "yangi sahifa" deb hisoblashga majbur qiladi, eski keshni chetlab o'tadi.
const DEFAULT_PLATFORM_MINI_APP_URL = "https://usmonovshaxrizod1-maker.github.io/ustore/platform/?v=3";

// Maxfiylik/Shartlar: versiya raqamlari kodda konstanta sifatida — alohida
// sozlama jadvali/UI kerak emas. Matn muhim o'zgarganda shu qiymatlarni
// qo'lda oshirish kifoya (frontend TERMS/PRIVACY sahifalarida ham xuddi shu
// versiyalar ko'rsatiladi — ikkalasi ham platform-app.js'da qo'lda mos
// qilib yozilishi kerak, chunki ikkita alohida deploy birlik).
const TERMS_VERSION = "1.0";
const PRIVACY_VERSION = "1.0";

function botTokenLooksValid(token: string): boolean {
  return /^\d{6,12}:[A-Za-z0-9_-]{30,50}$/.test(token);
}

function platformWebSessionToken(req: Request): string | null {
  const raw = String(req.headers.get("authorization") || "").trim();
  const match = raw.match(/^UStoreSession\s+([A-Za-z0-9_-]{40,180})$/);
  return match ? match[1] : null;
}

type PlatformPrincipal = {
  authMode: "telegram" | "web";
  tgId: string;
  accountId: string;
  displayName: string;
  isPlatformSuperAdmin: boolean;
};

async function resolvePlatformWebPrincipal(db: any, req: Request, superAdminTelegramId: string): Promise<PlatformPrincipal | null> {
  const token = platformWebSessionToken(req);
  if (!token) return null;
  // Platform actions deliberately do not silently rotate here because most
  // legacy responses have no shared refresh-token envelope. Rotation remains
  // available through the dedicated web-auth get_session flow.
  const session = await resolveSession(db, token, false);
  if (!session) return null;
  const { data: identities, error: identityError } = await db.from("account_identities")
    .select("provider_subject").eq("account_id", session.accountId).eq("provider", "TELEGRAM").limit(2);
  if (identityError) throw identityError;
  // Existing platform ownership/subscription rows are Telegram-keyed. Never
  // guess when an account has no Telegram proof or an ambiguous mapping.
  if (!identities || identities.length !== 1 || !/^\d{5,20}$/.test(String(identities[0]?.provider_subject || ""))) {
    throw new Error("forbidden:telegram_identity_required");
  }
  const tgId = String(identities[0].provider_subject);
  const { data: account, error: accountError } = await db.from("accounts")
    .select("display_name,status").eq("id", session.accountId).maybeSingle();
  if (accountError) throw accountError;
  if (!account || account.status !== "ACTIVE") return null;
  return {
    authMode: "web",
    tgId,
    accountId: String(session.accountId),
    displayName: String(account.display_name || `ustore.${tgId.slice(-6)}`),
    // Important: shop OWNER/MANAGER/STAFF membership is intentionally absent
    // from this decision. Platform Super Admin is a separate server authority.
    isPlatformSuperAdmin: superAdminTelegramId !== "" && tgId === superAdminTelegramId,
  };
}

// 18-band: never let a raw Telegram/driver error (which could in principle
// echo back request details) reach the client or a log line verbatim when
// a bot token was involved in producing it — always re-throw/return a fixed,
// safe message instead.
function safeBotError(_e: unknown): string {
  return "invalid_or_unreachable_bot_token";
}

// ---- SaaS obuna tizimi: umumiy yordamchilar --------------------------------
// shop-api'dagi countActiveProducts bilan bir xil mantiq (DELETED'dan
// boshqasi hisoblanadi) — bu yerga nusxalangan, chunki ikki Edge Function
// orasida umumiy modul yo'q (har biri o'z holicha deploy qilinadi).
async function countActiveProducts(db: any, shopId: string): Promise<number> {
  const { count } = await db.from("products").select("id", { count: "exact", head: true }).eq("shop_id", shopId).neq("status", "DELETED");
  return count || 0;
}
// 2026-08-27, USER platform redesign: real order count + real "today's
// orders" for the shop dashboard/Do'konlarim cards — MD explicitly forbids
// fake numbers, so this reuses the exact same count-only query pattern as
// countActiveProducts() above instead of inventing a new stats endpoint.
async function countShopOrders(db: any, shopId: string): Promise<number> {
  const { count } = await db.from("orders").select("id", { count: "exact", head: true }).eq("shop_id", shopId);
  return count || 0;
}
async function countShopOrdersToday(db: any, shopId: string): Promise<number> {
  const now = new Date();
  const tzParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const y = Number(tzParts.find((p) => p.type === "year")?.value);
  const m = Number(tzParts.find((p) => p.type === "month")?.value);
  const d = Number(tzParts.find((p) => p.type === "day")?.value);
  const dayStart = new Date(Date.UTC(y, m - 1, d, -5, 0, 0)).toISOString();
  const { count } = await db.from("orders").select("id", { count: "exact", head: true }).eq("shop_id", shopId).gte("created_at", dayStart);
  return count || 0;
}

// Bitta Telegram foydalanuvchiga tegishli barcha do'konlar — "mavjud
// do'konlarim" ro'yxati (tarif oshirish oqimi) VA boot() ikkalasi ham shundan
// foydalanadi. shop_memberships orqali (owner_telegram_id degan ustun yo'q —
// egalik shu jadvalda saqlanadi), username qo'lda yozdirilmaydi.
async function listMyShops(db: any, telegramUserId: string): Promise<any[]> {
  const { data: memberships } = await db.from("shop_memberships")
    .select("shop_id").eq("telegram_user_id", telegramUserId).eq("role", "OWNER").eq("status", "ACTIVE");
  const shopIds = (memberships || []).map((m: any) => m.shop_id);
  if (!shopIds.length) return [];
  const [{ data: shops }, { data: bots }, { data: settings }] = await Promise.all([
    db.from("shops").select("id,public_code,status").in("id", shopIds),
    db.from("shop_bots").select("shop_id,bot_username").in("shop_id", shopIds),
    // 2026-08-27: name/logo_url qo'shildi — USER platform Do'konlarim/Dashboard
    // kartalarida haqiqiy do'kon nomi/logotipi ko'rsatilishi kerak (fake
    // ma'lumot taqiqlangan), bular allaqachon shop-app o'zi to'ldiradigan
    // ustunlar — yangi jadval/ustun kerak emas.
    db.from("shop_settings").select("shop_id,tariff_id,product_limit,subscription_expires_at,name,logo_url,lifecycle_reason,lifecycle_changed_at,frozen_at").in("shop_id", shopIds),
  ]);
  const tariffIds = Array.from(new Set((settings || []).map((s: any) => s.tariff_id).filter(Boolean)));
  const { data: tariffRows } = tariffIds.length
    ? await db.from("tariffs").select("id,name").in("id", tariffIds)
    : { data: [] as any[] };
  const tariffNameById = new Map((tariffRows || []).map((t: any) => [t.id, t.name]));
  const botByShop = new Map((bots || []).map((b: any) => [b.shop_id, b]));
  const settingsByShop = new Map((settings || []).map((s: any) => [s.shop_id, s]));
  return Promise.all((shops || []).map(async (s: any) => {
    const st = settingsByShop.get(s.id);
    const [usedProductCount, usedOrderCount, ordersToday] = await Promise.all([
      countActiveProducts(db, s.id), countShopOrders(db, s.id), countShopOrdersToday(db, s.id),
    ]);
    return {
      id: s.id, publicCode: s.public_code, status: s.status,
      shopName: st?.name || null, logoUrl: st?.logo_url || null,
      botUsername: botByShop.get(s.id)?.bot_username || null,
      tariffId: st?.tariff_id || null,
      tariffName: st?.tariff_id ? (tariffNameById.get(st.tariff_id) || null) : null,
      productLimit: st?.product_limit ?? null,
      usedProductCount, usedOrderCount, ordersToday,
      subscriptionExpiresAt: st?.subscription_expires_at || null,
      lifecycleReason: st?.lifecycle_reason || null,
      lifecycleChangedAt: st?.lifecycle_changed_at || null,
      // Completion pass (section 5): "X / 60 kun" progress-bar user-tomonda
      // ko'rsatilishi uchun — admin tarafida allaqachon shu ustundan
      // foydalanilardi (platform_list_shops), bu yerda ham xuddi shunday
      // xavfsiz, qo'shimcha ustun.
      frozenAt: st?.frozen_at || null,
    };
  }));
}

// Tarifni bitta do'konga qo'llash — UPGRADE tasdiqlashda ICHKI ishlatiladi,
// hamda admin uchun alohida "tarifni bog'lash" tugmasi orqali ham (yangi
// ulangan do'konni tasdiqlangan NEW_SHOP so'rovi tarifiga qo'lda bog'lash
// uchun — platform_connect_bot o'zi tarifga ATAYLAB tegmaydi, pastga qarang).
// product_limit tarifdan "nusxa" sifatida olinadi — keyin tarif tahrirlansa
// ham, allaqachon obuna bo'lgan do'konga orqaga ta'sir qilmasin uchun.
//
// 2026-08-28, 054-migratsiya: QIYMAT-ASOSLI PRORATSIYA (spec "7-bo'lim").
// - isExtend=true (XUDDI SHU tarif, "kun qo'shish"/"uzaytirish"): narx
//   almashmayapti, proratsiya YO'Q — qolgan (to'langan) kunlar ustiga
//   yangi sotib olingan kunlar shunchaki qo'shiladi.
// - isExtend=false, tarif ALMASHTIRILSA: qolgan to'langan kunlar ESKI
//   kunlik narxda (shop_settings.current_period_daily_rate — HAQIQIY
//   to'lovdan hisoblangan, jonli tarif narxidan EMAS, shu bilan keyin
//   tarif narxi o'zgarsa ham eski to'lovlar retroaktiv o'zgarmaydi) pul
//   qiymatiga aylantiriladi, so'ng YANGI tarifning kunlik narxida qayta
//   kunlarga aylantirilib, yangi sotib olingan davr ustiga qo'shiladi.
// - Bonus kunlar (birinchi obunadagi +7) HECH QACHON pul hisobiga
//   aralashmaydi — alohida kuzatiladi, CHANGE/EXTEND'da o'zgarishsiz
//   ko'chadi (yo'qolmaydi, lekin ko'paytirilmaydi ham).
// - Har bir chaqiruv subscription_history'ga to'liq breakdown yozadi
//   (admin "Obuna tarixi"si uchun).
async function applyTariffToShop(
  db: any,
  shopId: string,
  tariffId: string,
  options: { durationDays?: number; billingPeriod?: string; paidAmount?: number; isExtend?: boolean; allowFirstBonus?: boolean } = {},
): Promise<{ bonusDaysApplied: number; expiresAt: string; convertedDays: number; remainingValue: number }> {
  const { data: tariff, error: tariffErr } = await db.from("tariffs").select("name,price,product_limit").eq("id", tariffId).maybeSingle();
  if (tariffErr) throw tariffErr;
  if (!tariff) throw new Error("tariff_not_found");
  const { data: existing } = await db.from("shop_settings")
    .select("tariff_id,subscription_expires_at,current_period_paid_end_at,current_period_daily_rate,current_period_bonus_days")
    .eq("shop_id", shopId).maybeSingle();

  const isFirstSubscription = !existing?.subscription_expires_at;
  const durationDays = Math.max(1, Math.min(400, Math.trunc(Number(options.durationDays || 30))));
  const billingPeriod = options.billingPeriod === "ANNUAL" ? "ANNUAL" : "MONTHLY";
  // Haqiqatan to'langan summa — chaqiruvchi bermasa, jonli tarif narxiga
  // tushadi (masalan admin hech qanday so'rovsiz to'g'ridan-to'g'ri
  // bog'laganda — bu yagona holat, chunki boshqa hamma joyda haqiqiy
  // tariff_price_snapshot chaqiruvchidan uzatiladi).
  const paidAmount = Number.isFinite(Number(options.paidAmount)) ? Number(options.paidAmount) : Number(tariff.price);
  const isExtend = options.isExtend === true;
  const bonusDays = isFirstSubscription && options.allowFirstBonus !== false ? 7 : 0;

  const now = Date.now();
  const oldTariffId = existing?.tariff_id || null;
  const oldExpiresAt = existing?.subscription_expires_at || null;
  const oldPaidEndMs = existing?.current_period_paid_end_at ? new Date(existing.current_period_paid_end_at).getTime() : NaN;
  const oldDailyRate = Number(existing?.current_period_daily_rate) || 0;
  // Migratsiyadan OLDINGI do'konlarda bu ustunlar bo'sh — bilinmagan
  // qiymatni TO'QIB CHIQARMAYMIZ, shunchaki 0 (konvertatsiya qilinadigan
  // hech narsa yo'q, faqat yangi davr qo'shiladi).
  const remainingPaidDays = Number.isFinite(oldPaidEndMs) && oldPaidEndMs > now ? (oldPaidEndMs - now) / (24 * 3600 * 1000) : 0;

  let convertedDays = 0;
  let remainingValue = 0;
  if (!isExtend && !isFirstSubscription && remainingPaidDays > 0 && oldDailyRate > 0) {
    remainingValue = remainingPaidDays * oldDailyRate;
    const newDailyRate = paidAmount / durationDays;
    convertedDays = newDailyRate > 0 ? Math.floor(remainingValue / newDailyRate) : 0;
  }

  const paidEndBaseMs = isExtend && Number.isFinite(oldPaidEndMs) && oldPaidEndMs > now ? oldPaidEndMs : now;
  const extraPaidDays = isExtend ? durationDays : (durationDays + convertedDays);
  const newPaidEndMs = paidEndBaseMs + extraPaidDays * 24 * 3600 * 1000;

  // Qolgan bonus kunlarni ko'chirish — faqat CHANGE/EXTEND'da (birinchi
  // obunada bonus yangidan beriladi, ikkalasi bir vaqtda bo'lmaydi).
  let carriedBonusDays = 0;
  if (!isFirstSubscription && existing?.subscription_expires_at) {
    const oldExpiresMs = new Date(existing.subscription_expires_at).getTime();
    const oldBonusTotal = Number(existing.current_period_bonus_days) || 0;
    if (oldBonusTotal > 0 && oldExpiresMs > now) {
      const bonusTailStart = Number.isFinite(oldPaidEndMs) ? Math.max(oldPaidEndMs, now) : now;
      carriedBonusDays = Math.min(oldBonusTotal, Math.max(0, Math.round((oldExpiresMs - bonusTailStart) / (24 * 3600 * 1000))));
    }
  }
  const totalBonusDays = bonusDays + carriedBonusDays;
  const newDailyRateStored = paidAmount / durationDays;
  const expiresAtMs = newPaidEndMs + totalBonusDays * 24 * 3600 * 1000;
  const expiresAt = new Date(expiresAtMs).toISOString();

  const { error } = await db.from("shop_settings").update({
    tariff_id: tariffId, product_limit: tariff.product_limit, subscription_expires_at: expiresAt, frozen_at: null,
    current_period_paid_end_at: new Date(newPaidEndMs).toISOString(),
    current_period_daily_rate: newDailyRateStored,
    current_period_bonus_days: totalBonusDays,
  }).eq("shop_id", shopId);
  if (error) throw error;

  let oldTariffName: string | null = null;
  if (oldTariffId) {
    try { oldTariffName = (await db.from("tariffs").select("name").eq("id", oldTariffId).maybeSingle()).data?.name || null; } catch (_) { /* audit-only, xatosi asosiy oqimni to'xtatmasin */ }
  }
  try {
    await db.from("subscription_history").insert({
      shop_id: shopId,
      event_type: isFirstSubscription ? "NEW" : isExtend ? "EXTEND" : "CHANGE",
      old_tariff_id: oldTariffId, old_tariff_name: oldTariffName, old_expires_at: oldExpiresAt,
      new_tariff_id: tariffId, new_tariff_name: tariff.name, new_expires_at: expiresAt,
      purchased_days: durationDays, purchased_amount: paidAmount, billing_period: billingPeriod,
      remaining_paid_days_before: Math.round(remainingPaidDays * 100) / 100,
      remaining_value_converted: Math.round(remainingValue * 100) / 100,
      converted_days: convertedDays, bonus_days: totalBonusDays,
    });
  } catch (e) { console.error("subscription_history insert error", e); }

  return { bonusDaysApplied: bonusDays, expiresAt, convertedDays, remainingValue };
}

// Dry-run — HECH NARSA yozmaydi, faqat platform_confirm_payment_claim'dan
// OLDIN mijozga "tarif almashtirsam nima bo'ladi" preview'ini ko'rsatish
// uchun (spec: "plan-change preview screen"). Xuddi applyTariffToShop bilan
// BIR XIL formula — ikkalasi orasida drift bo'lmasligi uchun preview alohida
// hisob-kitob yozmaydi, shunchaki applyTariffToShop'ning YOZMAYDIGAN
// qismini takrorlaydi (o'qish-uchun so'rovlar ikkalasida ham bir xil).
async function previewTariffChange(
  db: any, shopId: string, tariffId: string, durationDays: number, paidAmount: number, isExtend: boolean,
): Promise<{ remainingPaidDays: number; remainingValue: number; convertedDays: number; estimatedExpiresAt: string }> {
  const { data: tariff, error: tariffErr } = await db.from("tariffs").select("price").eq("id", tariffId).maybeSingle();
  if (tariffErr) throw tariffErr;
  if (!tariff) throw new Error("tariff_not_found");
  const { data: existing } = await db.from("shop_settings")
    .select("subscription_expires_at,current_period_paid_end_at,current_period_daily_rate,current_period_bonus_days")
    .eq("shop_id", shopId).maybeSingle();
  const now = Date.now();
  const oldPaidEndMs = existing?.current_period_paid_end_at ? new Date(existing.current_period_paid_end_at).getTime() : NaN;
  const oldDailyRate = Number(existing?.current_period_daily_rate) || 0;
  const remainingPaidDays = Number.isFinite(oldPaidEndMs) && oldPaidEndMs > now ? (oldPaidEndMs - now) / (24 * 3600 * 1000) : 0;
  let remainingValue = 0;
  let convertedDays = 0;
  if (!isExtend && existing?.subscription_expires_at && remainingPaidDays > 0 && oldDailyRate > 0) {
    remainingValue = remainingPaidDays * oldDailyRate;
    const newDailyRate = paidAmount / durationDays;
    convertedDays = newDailyRate > 0 ? Math.floor(remainingValue / newDailyRate) : 0;
  }
  const paidEndBaseMs = isExtend && Number.isFinite(oldPaidEndMs) && oldPaidEndMs > now ? oldPaidEndMs : now;
  const extraPaidDays = isExtend ? durationDays : (durationDays + convertedDays);
  const newPaidEndMs = paidEndBaseMs + extraPaidDays * 24 * 3600 * 1000;
  let carriedBonusDays = 0;
  if (existing?.subscription_expires_at) {
    const oldExpiresMs = new Date(existing.subscription_expires_at).getTime();
    const oldBonusTotal = Number(existing.current_period_bonus_days) || 0;
    if (oldBonusTotal > 0 && oldExpiresMs > now) {
      const bonusTailStart = Number.isFinite(oldPaidEndMs) ? Math.max(oldPaidEndMs, now) : now;
      carriedBonusDays = Math.min(oldBonusTotal, Math.max(0, Math.round((oldExpiresMs - bonusTailStart) / (24 * 3600 * 1000))));
    }
  }
  const estimatedExpiresAt = new Date(newPaidEndMs + carriedBonusDays * 24 * 3600 * 1000).toISOString();
  return {
    remainingPaidDays: Math.round(remainingPaidDays * 100) / 100,
    remainingValue: Math.round(remainingValue * 100) / 100,
    convertedDays, estimatedExpiresAt,
  };
}

// 15/18/19-bandlar: kun qo'shish/muzlatish/qayta faollashtirish/o'chirish —
// hammasi bitta naqsh: shop egasini shop_memberships orqali topib xabar
// yuboradi (fire-and-forget, xato bo'lsa jim yutiladi — admin amali hech
// qachon Telegram sekinligi/xatosi tufayli to'xtab qolmasin).
function notifyShopOwnerInBackground(db: any, botToken: string, shopId: string, text: string): void {
  EdgeRuntime.waitUntil((async () => {
    try {
      const { data: membership } = await db.from("shop_memberships")
        .select("telegram_user_id").eq("shop_id", shopId).eq("role", "OWNER").eq("status", "ACTIVE").maybeSingle();
      if (membership?.telegram_user_id) {
        await telegramApi(botToken, "sendMessage", { chat_id: String(membership.telegram_user_id), text });
      }
    } catch (e) { console.error("notifyShopOwnerInBackground error", e); }
  })());
}

// 4.4/4.5-band: platforma darajasidagi support/muammo-xabari — 004-migratsiya
// (support_tickets) bilan bir xil naqsh, requester_telegram_id tenant kaliti
// bilan. Ikkala yo'nalish (adminga yangi xabar / foydalanuvchiga javob) ham
// fire-and-forget — Telegram sekinligi asosiy so'rovni to'xtatib qo'ymasin.
function notifyPlatformSupportAdmin(botToken: string, superAdminId: string, ticket: any, messageBody: string): void {
  if (!superAdminId) return;
  EdgeRuntime.waitUntil((async () => {
    try {
      const typeLabel = ticket.type === "BUG_REPORT" ? "⚠️ Muammo xabari" : "💬 Support";
      const who = ticket.requester_username ? `@${ticket.requester_username}` : (ticket.requester_first_name || ticket.requester_telegram_id);
      await telegramApi(botToken, "sendMessage", {
        chat_id: superAdminId,
        text: `${typeLabel} — #${ticket.id}\n${who}${ticket.page_context ? `\nBo'lim: ${ticket.page_context}` : ""}\n\n${messageBody}`,
      });
    } catch (e) { console.error("notifyPlatformSupportAdmin error", e); }
  })());
}
function notifyPlatformSupportReply(botToken: string, ticket: any, replyBody: string): void {
  EdgeRuntime.waitUntil((async () => {
    try {
      await telegramApi(botToken, "sendMessage", {
        chat_id: String(ticket.requester_telegram_id),
        text: `💬 Javob keldi (#${ticket.id}):\n\n${replyBody}`,
      });
    } catch (e) { console.error("notifyPlatformSupportReply error", e); }
  })());
}
// storeSubscriptionReceipt bilan bir xil tekshiruv/hajm qoidalari, xuddi shu
// payment-receipts bucket'da — yangi bucket kerak emas.
async function storeSupportAttachment(db: any, ticketId: number, tgId: string, upload: any): Promise<{ path: string }> {
  const mimeType = String(upload?.mimeType || "").toLowerCase();
  const extensionByMime: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const ext = extensionByMime[mimeType];
  const base64 = String(upload?.base64 || "").replace(/\s+/g, "");
  if (!ext || !base64 || base64.length > 8_400_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error("invalid_attachment_file");
  let binary: string;
  try { binary = atob(base64); } catch { throw new Error("invalid_attachment_file"); }
  if (!binary.length || binary.length > 6 * 1024 * 1024) throw new Error("attachment_too_large");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const path = `platform/support-tickets/${ticketId}/${tgId}-${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage.from("payment-receipts").upload(path, bytes, { contentType: mimeType, cacheControl: "300", upsert: false });
  if (error) throw new Error(`attachment_upload_failed:${error.message}`);
  return { path };
}
function mapPlatformTicket(t: any) {
  return {
    id: t.id, type: t.type, subject: t.subject || null, pageContext: t.page_context || null,
    status: t.status, requesterUsername: t.requester_username || null, requesterFirstName: t.requester_first_name || null,
    createdAt: t.created_at, answeredAt: t.answered_at || null, closedAt: t.closed_at || null,
  };
}

// 15/18/19-bandlar: platforma darajali admin-amal auditi — 004_support_
// engagement.sql'dagi shop-scoped admin_audit_log bilan bir xil g'oya,
// lekin platform_admin_action_log jadvaliga (017-migratsiya).
async function logPlatformAdminAction(db: any, adminTgId: string, shopId: string, action: string, details: Record<string, unknown>): Promise<void> {
  const { error } = await db.from("platform_admin_action_log").insert({ admin_tg_id: adminTgId, shop_id: shopId, action, details });
  if (error) console.error("logPlatformAdminAction error", error);
}

// shop-api'dagi storePaymentReceipt bilan AYNAN bir xil tekshiruv/hajm
// qoidalari, xuddi shu `payment-receipts` bucket'da, faqat platforma darajali
// yo'l prefiksi bilan (shop hali mavjud bo'lmasligi ham mumkin — NEW_SHOP
// so'rovida shopId yo'q, shuning uchun yo'l shop_id emas, requestId asosida).
// Lifecycle round v2: shopga tegishli BARCHA Supabase Storage fayllarini
// (logotip/katalog/variant/banner/start-rasm/QR/chek/hisobot — hammasi
// "shops/<shopId>/..." prefiksi ostida, shop-api'dagi upload yo'llari
// bilan bir xil konvensiya) topib o'chiradi. Storage'da haqiqiy
// "papka" tushunchasi yo'q (S3-uslubidagi prefiks), shuning uchun
// list() bitta darajani qaytaradi — pastdagi funksiya papkalarga
// (entry.id === null — Supabase'ning "bu haqiqiy fayl emas, ichki
// prefiks" belgisi) rekursiv kiradi.
async function listStorageFilesRecursive(db: any, bucket: string, prefix: string): Promise<string[]> {
  const collected: string[] = [];
  const limit = 1000;
  for (let offset = 0;; offset += limit) {
    const { data: entries, error } = await db.storage.from(bucket).list(prefix, { limit, offset });
    if (error) throw error;
    if (!entries) throw new Error(`storage_list_failed:${bucket}:${prefix}`);
    for (const entry of entries) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        const nested = await listStorageFilesRecursive(db, bucket, fullPath);
        collected.push(...nested);
      } else {
        collected.push(fullPath);
      }
    }
    if (entries.length < limit) break;
  }
  return collected;
}
// BEST-EFFORT: bitta bucket muvaffaqiyatsiz bo'lsa ham, qolganlari va
// (undan ham muhimi) pastdagi DB purge davom etadi — Storage'ning o'zi
// vaqtincha ishlamay qolishi do'kon ma'lumotini o'chirishga to'sqinlik
// qilmasligi kerak (platform_connect_bot'dagi "NOT transactional"
// Telegram-config bosqichi bilan bir xil falsafa).
async function purgeShopStorageFiles(db: any, shopId: string): Promise<Record<string, number>> {
  const buckets = ["images", "payment-receipts", "report-exports"];
  const results: Record<string, number> = {};
  for (const bucket of buckets) {
    try {
      const paths = await listStorageFilesRecursive(db, bucket, `shops/${shopId}`);
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await db.storage.from(bucket).remove(paths.slice(i, i + 100));
        if (error) throw error;
      }
      results[bucket] = paths.length;
    } catch (e) {
      console.error("[TERMINATE_STORAGE_CLEANUP_FAILED]", { shopId, bucket, message: (e as any)?.message || e });
      throw new Error(`storage_cleanup_failed:${bucket}:${String((e as any)?.message || e).slice(0,200)}`);
    }
  }
  return results;
}

const SHOP_BACKUP_BUCKET = "shop-backups";
const SHOP_BACKUP_STORAGE_BUCKETS = ["images", "payment-receipts", "report-exports"] as const;

function safeBackupFileName(value: unknown): string {
  return String(value || "shop").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "shop";
}

async function createShopBackupArchive(db: any, shopId: string, createdBy: string): Promise<{ id: string; path: string; url: string; sizeBytes: number; rowCount: number; fileCount: number }> {
  const [{ data: backupData, error: dataError }, { data: settings, error: settingsError }, { data: shop, error: shopError }] = await Promise.all([
    db.rpc("ustore_build_shop_backup_data", { p_shop_id: shopId }),
    db.from("shop_settings").select("name").eq("shop_id", shopId).maybeSingle(),
    db.from("shops").select("public_code").eq("id", shopId).maybeSingle(),
  ]);
  if (dataError) throw dataError;
  if (settingsError) throw settingsError;
  if (shopError) throw shopError;
  if (!backupData || !shop) throw new Error("shop_not_found");

  const createdAt = new Date().toISOString();
  const manifest = {
    format: "USTORE_SHOP_BACKUP", formatVersion: 1, createdAt, shopId,
    shopName: settings?.name || null, publicCode: shop.public_code || null,
    secretsExcluded: ["shop_bots", "billz_connections", "click_connections", "payme_connections", "uzum_connections"],
    restoreMode: "PROVISIONING_RECONNECT_REQUIRED",
  };
  const dataJson = JSON.stringify(backupData);
  const dataBytes = new TextEncoder().encode(dataJson).byteLength;
  if (dataBytes > 200 * 1024 * 1024) throw new Error("backup_too_large");
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("data.json", dataJson);

  let fileCount = 0;
  let uncompressedBytes = dataBytes;
  for (const bucket of SHOP_BACKUP_STORAGE_BUCKETS) {
    const paths = await listStorageFilesRecursive(db, bucket, `shops/${shopId}`);
    for (const path of paths) {
      const { data: blob, error } = await db.storage.from(bucket).download(path);
      if (error || !blob) throw error || new Error(`backup_download_failed:${bucket}`);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      uncompressedBytes += bytes.byteLength;
      if (uncompressedBytes > 450 * 1024 * 1024) throw new Error("backup_too_large");
      zip.file(`storage/${bucket}/${path}`, bytes);
      fileCount += 1;
    }
  }
  const archive = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const rowCount = Object.values(backupData as Record<string, unknown>).reduce((sum: number, rows: any) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
  const name = safeBackupFileName(settings?.name || shop.public_code);
  const path = `platform/backups/${shopId}/${createdAt.replace(/[:.]/g, "-")}-${name}.zip`;
  const { error: uploadError } = await db.storage.from(SHOP_BACKUP_BUCKET).upload(path, archive, { contentType: "application/zip", cacheControl: "3600", upsert: false });
  if (uploadError) throw uploadError;
  const { data: backupRow, error: rowError } = await db.from("shop_backups").insert({
    original_shop_id: shopId, shop_name: settings?.name || null, storage_path: path,
    size_bytes: archive.byteLength, row_count: rowCount, file_count: fileCount,
    status: "READY", created_by: createdBy,
  }).select("id").single();
  if (rowError) {
    await db.storage.from(SHOP_BACKUP_BUCKET).remove([path]);
    throw rowError;
  }
  const { data: signed, error: signedError } = await db.storage.from(SHOP_BACKUP_BUCKET).createSignedUrl(path, 3600, { download: `${name}-backup.zip` });
  if (signedError || !signed?.signedUrl) throw signedError || new Error("backup_link_failed");
  return { id: String(backupRow.id), path, url: signed.signedUrl, sizeBytes: archive.byteLength, rowCount, fileCount };
}

async function restoreShopBackupArchive(db: any, uploadPath: string, restoredBy: string): Promise<{ shopId: string; fileCount: number }> {
  const { data: blob, error: downloadError } = await db.storage.from(SHOP_BACKUP_BUCKET).download(uploadPath);
  if (downloadError || !blob) throw downloadError || new Error("backup_upload_not_found");
  if (blob.size > 500 * 1024 * 1024) throw new Error("backup_too_large");
  const zip = await JSZip.loadAsync(await blob.arrayBuffer(), { checkCRC32: true });
  const manifestFile = zip.file("manifest.json"), dataFile = zip.file("data.json");
  if (!manifestFile || !dataFile) throw new Error("invalid_backup_zip");
  if (Object.keys(zip.files).length > 100_000) throw new Error("backup_too_many_files");
  const manifestText = await manifestFile.async("string");
  if (manifestText.length > 1024 * 1024) throw new Error("invalid_backup_manifest");
  const dataText = await dataFile.async("string");
  const dataTextBytes = new TextEncoder().encode(dataText).byteLength;
  if (dataTextBytes > 200 * 1024 * 1024) throw new Error("backup_too_large");
  const manifest = JSON.parse(manifestText);
  const backupData = JSON.parse(dataText);
  if (manifest?.format !== "USTORE_SHOP_BACKUP" || Number(manifest?.formatVersion) !== 1 || !manifest?.shopId) throw new Error("invalid_backup_manifest");
  if (!backupData || Array.isArray(backupData) || typeof backupData !== "object") throw new Error("invalid_backup_data");
  const shopId = String(manifest.shopId);

  const uploaded: Array<{ bucket: string; path: string }> = [];
  let restoredBytes = dataTextBytes;
  try {
    for (const [name, entry] of Object.entries(zip.files) as Array<[string, any]>) {
      if (entry.dir || !name.startsWith("storage/")) continue;
      const match = name.match(/^storage\/(images|payment-receipts|report-exports)\/(shops\/([0-9a-f-]{36})\/.+)$/i);
      if (!match || match[3].toLowerCase() !== shopId.toLowerCase() || name.includes("..")) throw new Error("invalid_backup_storage_path");
      const bytes = await entry.async("uint8array");
      restoredBytes += bytes.byteLength;
      if (restoredBytes > 450 * 1024 * 1024) throw new Error("backup_too_large");
      const { error } = await db.storage.from(match[1]).upload(match[2], bytes, { upsert: false });
      if (error) throw error;
      uploaded.push({ bucket: match[1], path: match[2] });
    }
    const { data: restoredShopId, error: restoreError } = await db.rpc("ustore_restore_shop_backup_data", { p_manifest: manifest, p_data: backupData, p_restored_by: restoredBy });
    if (restoreError) throw restoreError;
    const backupId = manifest.backupId ? String(manifest.backupId) : null;
    if (backupId) await db.from("shop_backups").update({ status: "RESTORED", restored_at: new Date().toISOString(), restored_by: restoredBy }).eq("id", backupId);
    return { shopId: String(restoredShopId || shopId), fileCount: uploaded.length };
  } catch (error) {
    for (const bucket of SHOP_BACKUP_STORAGE_BUCKETS) {
      const paths = uploaded.filter((f) => f.bucket === bucket).map((f) => f.path);
      for (let i = 0; i < paths.length; i += 100) await db.storage.from(bucket).remove(paths.slice(i, i + 100));
    }
    throw error;
  } finally {
    await db.storage.from(SHOP_BACKUP_BUCKET).remove([uploadPath]);
  }
}

async function storeSubscriptionReceipt(db: any, requestId: string, tgId: string, upload: any): Promise<{ path: string }> {
  const mimeType = String(upload?.mimeType || "").toLowerCase();
  const extensionByMime: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const ext = extensionByMime[mimeType];
  const base64 = String(upload?.base64 || "").replace(/\s+/g, "");
  if (!ext || !base64 || base64.length > 8_400_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error("invalid_receipt_file");
  let binary: string;
  try { binary = atob(base64); } catch { throw new Error("invalid_receipt_file"); }
  if (!binary.length || binary.length > 6 * 1024 * 1024) throw new Error("receipt_too_large");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const path = `platform/subscription-requests/${requestId}/${tgId}-${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage.from("payment-receipts").upload(path, bytes, { contentType: mimeType, cacheControl: "300", upsert: false });
  if (error) throw new Error(`receipt_upload_failed:${error.message}`);
  return { path };
}



// Apply owner-requested bot presentation immediately after the Super Admin
// supplies a valid bot token. Username is intentionally untouched: Bot API's
// bot-owned profile methods cover name/about/description/profile photo, not the
// @username. A static profile photo must be a freshly uploaded JPG.
async function telegramMultipartApi(botToken: string, method: string, form: FormData) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) throw new Error(data?.description || `telegram_${method}_failed`);
  return data;
}

async function syncRequestedBotProfile(db: any, botToken: string, reqRow: any, shopId: string): Promise<{ photoSkipped: boolean }> {
  const name = String(reqRow?.requested_bot_name || "").trim().replace(/\s+/g, " ").slice(0, 64);
  const description = String(reqRow?.requested_bot_bio || "").trim().slice(0, 512);
  const shortDescription = description.slice(0, 120);
  if (name) await telegramApi(botToken, "setMyName", { name });
  if (shortDescription) await telegramApi(botToken, "setMyShortDescription", { short_description: shortDescription });
  if (description) await telegramApi(botToken, "setMyDescription", { description });

  let photoSkipped = false;
  const photoPath = String(reqRow?.bot_photo_storage_path || "");
  if (photoPath) {
    const { data: blob, error } = await db.storage.from("payment-receipts").download(photoPath);
    if (error || !blob) throw new Error("bot_profile_photo_download_failed");
    const mime = String(blob.type || "").toLowerCase();
    // New Platform clients normalize bot photos to JPEG before submission.
    // For a legacy pending PNG/WebP request, do not block shop activation:
    // Telegram requires InputProfilePhotoStatic to be JPG, so surface a warning.
    if (mime === "image/jpeg" || /\.jpe?g$/i.test(photoPath)) {
      const form = new FormData();
      form.append("photo", JSON.stringify({ type: "static", photo: "attach://profile_photo" }));
      form.append("profile_photo", blob, "profile.jpg");
      await telegramMultipartApi(botToken, "setMyProfilePhoto", form);
    } else {
      photoSkipped = true;
    }
  }
  if (name) {
    const { error } = await db.from("shop_bots").update({ bot_name: name }).eq("shop_id", shopId);
    if (error) throw error;
  }
  return { photoSkipped };
}

async function storePlatformAsset(
  db: any,
  namespace: "payment-methods" | "notification-templates",
  ownerKey: string,
  upload: any,
): Promise<{ path: string }> {
  const mimeType = String(upload?.mimeType || "").toLowerCase();
  const extensionByMime: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const ext = extensionByMime[mimeType];
  const base64 = String(upload?.base64 || "").replace(/\s+/g, "");
  if (!ext || !base64 || base64.length > 4_300_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error("invalid_image_file");
  let binary: string;
  try { binary = atob(base64); } catch { throw new Error("invalid_image_file"); }
  if (!binary.length || binary.length > 3 * 1024 * 1024) throw new Error("image_too_large");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const safeOwner = ownerKey.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
  const path = `platform/assets/${namespace}/${safeOwner}/${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage.from("payment-receipts").upload(path, bytes, { contentType: mimeType, cacheControl: "3600", upsert: false });
  if (error) throw new Error(`image_upload_failed:${error.message}`);
  return { path };
}

async function signedPlatformAssetUrl(db: any, path: string | null, ttlSeconds = 3600): Promise<string | null> {
  if (!path) return null;
  try {
    const { data, error } = await db.storage.from("payment-receipts").createSignedUrl(path, ttlSeconds);
    if (error) return null;
    return data?.signedUrl || null;
  } catch (_) { return null; }
}

// Uploaded platform visual assets are unique by default, but never assume a
// stored path is unshared: before removing a replaced logo/template image,
// re-check every platform table that can reference the managed path. This is
// the platform-side equivalent of shop-api's reference-safe image cleanup.
async function platformAssetPathStillReferenced(db: any, path: string): Promise<boolean> {
  const checks: Array<[string, string]> = [
    ["platform_payment_methods", "logo_storage_path"],
    ["notification_templates", "image_storage_path"],
  ];
  for (const [table, column] of checks) {
    const { data, error } = await db.from(table).select(column).eq(column, path).limit(1);
    if (error) { console.error(`[platform-asset-ref:${table}.${column}]`, error); return true; }
    if ((data || []).length) return true;
  }
  return false;
}
async function cleanupPlatformAssetIfUnreferenced(db: any, path: string | null, label = "platform-asset"): Promise<void> {
  const normalized = String(path || "").trim();
  if (!normalized) return;
  if (!/^platform\/assets\/(?:payment-methods|notification-templates)\//.test(normalized)) return;
  if (await platformAssetPathStillReferenced(db, normalized)) return;
  const { error } = await db.storage.from("payment-receipts").remove([normalized]);
  if (error) console.error(`[${label}:cleanup]`, error);
}

async function purgeExpiredPaymentDrafts(db: any): Promise<number> {
  try {
    const { data, error } = await db.rpc("ustore_purge_expired_payment_drafts");
    if (error) { console.error("payment draft purge error", error); return 0; }
    return Number(data || 0);
  } catch (e) {
    console.error("payment draft purge error", e);
    return 0;
  }
}

type LifecycleSettings = {
  autoFreezeOnExpiry: boolean;
  retentionDays: number;
  supportLabel: string;
  supportUrl: string | null;
  freezeUserTitle: string;
  freezeUserBody: string;
  freezeActionText: string;
  terminateUserTitle: string;
  terminateUserBody: string;
  freezeReasons: string[];
  terminateReasons: string[];
};

function normalizeReasonList(value: any, fallback: string[]): string[] {
  const rows = Array.isArray(value) ? value : fallback;
  return rows.map((v: any) => String(v || "").trim().slice(0, 120)).filter(Boolean).slice(0, 20);
}

async function loadLifecycleSettings(db: any): Promise<LifecycleSettings> {
  const fallback: LifecycleSettings = {
    autoFreezeOnExpiry: true,
    retentionDays: SHOP_FREEZE_DAYS,
    supportLabel: "Admin bilan bog'lanish",
    supportUrl: null,
    freezeUserTitle: "Do'koningiz vaqtincha muzlatildi",
    freezeUserBody: "Sabab: {REASON}\nQayta faollashtirish uchun: {ACTION}",
    freezeActionText: "Muammoni bartaraf eting yoki UStorE administratori bilan bog'laning.",
    terminateUserTitle: "Do'koningiz o'chirildi",
    terminateUserBody: "Sabab: {REASON}\nQo'shimcha ma'lumot uchun administrator bilan bog'laning.",
    freezeReasons: ["Obuna muddati tugadi", "To'lov bo'yicha muammo", "Qoidabuzarlik", "Texnik tekshiruv"],
    terminateReasons: ["Foydalanuvchi so'rovi", "Uzoq muddat faol emas", "Qoidabuzarlik", "Boshqa"],
  };
  try {
    const { data } = await db.from("platform_lifecycle_settings").select("*").eq("id", true).maybeSingle();
    if (!data) return fallback;
    return {
      autoFreezeOnExpiry: data.auto_freeze_on_expiry !== false,
      retentionDays: Math.max(1, Math.min(365, Number(data.retention_days || SHOP_FREEZE_DAYS))),
      supportLabel: String(data.support_label || fallback.supportLabel),
      supportUrl: data.support_url ? String(data.support_url) : null,
      freezeUserTitle: String(data.freeze_user_title || fallback.freezeUserTitle),
      freezeUserBody: String(data.freeze_user_body || fallback.freezeUserBody),
      freezeActionText: String(data.freeze_action_text || fallback.freezeActionText),
      terminateUserTitle: String(data.terminate_user_title || fallback.terminateUserTitle),
      terminateUserBody: String(data.terminate_user_body || fallback.terminateUserBody),
      freezeReasons: normalizeReasonList(data.freeze_reasons, fallback.freezeReasons),
      terminateReasons: normalizeReasonList(data.terminate_reasons, fallback.terminateReasons),
    };
  } catch (_) { return fallback; }
}

function fillLifecycleTemplate(body: string, values: Record<string, string>): string {
  let out = String(body || "");
  for (const [k, v] of Object.entries(values)) out = out.split(`{${k}}`).join(v);
  return out;
}

// Lifecycle round: extracted from notifyLifecycleOwnerInBackground() so
// platform_terminate_shop can AWAIT it directly (see below) instead of
// firing-and-forgetting it — TERMINATE now fully purges the shop's rows
// right after this call, and platform_lifecycle_notification_log.shop_id
// is NOT NULL REFERENCES shops(id), so this notification (including its
// own internal log inserts) MUST finish and commit before that shop_id
// stops existing, or the insert would fail with a foreign-key error.
// precomputedRecipient lets a caller skip the shop_memberships lookup
// entirely — also needed for TERMINATE, since that row is about to be
// deleted too (or already was, for a caller that resolves it first).
async function sendLifecycleNotification(
  db: any,
  botToken: string,
  shopId: string,
  notificationType: "FROZEN" | "REACTIVATED" | "TERMINATED" | "GRACE_EXTENDED",
  values: Record<string, string>,
  precomputedRecipient?: string,
): Promise<void> {
  let recipient: string | null = precomputedRecipient || null;
  try {
    const [{ data: membership }, { data: template }, settings] = await Promise.all([
      precomputedRecipient ? Promise.resolve({ data: null }) : db.from("shop_memberships").select("telegram_user_id").eq("shop_id", shopId).eq("role", "OWNER").eq("status", "ACTIVE").maybeSingle(),
      db.from("notification_templates").select("body,image_url,image_storage_path,is_active").eq("type", notificationType).maybeSingle(),
      loadLifecycleSettings(db),
    ]);
    recipient = precomputedRecipient || (membership?.telegram_user_id ? String(membership.telegram_user_id) : null);
    if (!recipient) {
      await db.from("platform_lifecycle_notification_log").insert({ shop_id: shopId, notification_type: notificationType, status: "SKIPPED", error_text: "owner_not_found" });
      return;
    }
    if (template?.is_active === false) {
      await db.from("platform_lifecycle_notification_log").insert({ shop_id: shopId, notification_type: notificationType, recipient_telegram_id: recipient, status: "SKIPPED", error_text: "template_disabled" });
      return;
    }
    const body = String(template?.body || (
      notificationType === "FROZEN"
        ? "❄️ {SHOP_NAME} do'koningiz vaqtincha muzlatildi.\nSabab: {REASON}\n{ACTION}"
        : notificationType === "REACTIVATED"
          ? "✅ {SHOP_NAME} do'koningiz qayta faollashtirildi."
          : notificationType === "GRACE_EXTENDED"
            ? "⏳ {SHOP_NAME} uchun muzlatish muddati {DAYS} kunga uzaytirildi. Shu muddat ichida obunani yangilang, aks holda do'koningiz butunlay o'chiriladi."
            : "🔴 {SHOP_NAME} do'koningiz o'chirildi.\nSabab: {REASON}\n{ACTION}"
    ));
    const text = fillLifecycleTemplate(body, {
      SHOP_NAME: values.SHOP_NAME || "Do'koningiz",
      REASON: values.REASON || "Ko'rsatilmagan",
      ACTION: values.ACTION || settings.freezeActionText,
      SUPPORT_CONTACT: settings.supportUrl || settings.supportLabel,
      DAYS: values.DAYS || "",
    });
    const storedImageUrl = await signedPlatformAssetUrl(db, template?.image_storage_path || null, 3600);
    const imageUrl = storedImageUrl || template?.image_url || null;
    if (imageUrl) await telegramApi(botToken, "sendPhoto", { chat_id: recipient, photo: imageUrl, caption: text });
    else await telegramApi(botToken, "sendMessage", { chat_id: recipient, text });
    await db.from("platform_lifecycle_notification_log").insert({ shop_id: shopId, notification_type: notificationType, recipient_telegram_id: recipient, status: "SENT" });
  } catch (e) {
    console.error("sendLifecycleNotification error", e);
    try {
      await db.from("platform_lifecycle_notification_log").insert({
        shop_id: shopId, notification_type: notificationType, recipient_telegram_id: recipient,
        status: "FAILED", error_text: String((e as any)?.message || e).slice(0, 500),
      });
    } catch (_) {}
  }
}
function notifyLifecycleOwnerInBackground(
  db: any,
  botToken: string,
  shopId: string,
  notificationType: "FROZEN" | "REACTIVATED" | "TERMINATED" | "GRACE_EXTENDED",
  values: Record<string, string>,
  precomputedRecipient?: string,
): void {
  EdgeRuntime.waitUntil(sendLifecycleNotification(db, botToken, shopId, notificationType, values, precomputedRecipient));
}

async function appendSubscriptionRequestHistory(
  db: any,
  requestId: string,
  eventType: string,
  actorType: "USER" | "ADMIN" | "SYSTEM" | "BOT",
  actorTelegramId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await db.from("subscription_request_history").insert({
    request_id: requestId,
    event_type: eventType,
    actor_type: actorType,
    actor_telegram_id: actorTelegramId || null,
    metadata,
  });
  if (error) throw error;
}

function mapSubscriptionRequest(r: any) {
  return {
    id: r.id,
    requesterTelegramId: String(r.requester_telegram_id),
    requestedByUserId: String(r.requested_by_user_id || r.requester_telegram_id),
    ownerTelegramId: r.owner_telegram_id == null ? null : String(r.owner_telegram_id),
    requestedShopName: r.requested_shop_name || null,
    requesterUsername: r.requester_username,
    requesterFirstName: r.requester_first_name,
    kind: r.kind,
    shopId: r.shop_id,
    tariffId: r.tariff_id,
    tariffName: r.tariff_name_snapshot,
    tariffPrice: Number(r.tariff_price_snapshot),
    tariffProductLimit: r.tariff_product_limit_snapshot,
    billingPeriod: r.billing_period || "MONTHLY",
    durationDays: Number(r.duration_days || 30),
    upgradeAction: r.upgrade_action || null,
    paymentMethod: r.payment_method || null,
    paymentMethodId: r.payment_method_id || null,
    status: r.status,
    hasReceipt: !!r.receipt_storage_path,
    receiptSource: r.receipt_source || null,
    receiptUploadedAt: r.receipt_uploaded_at || null,
    paymentClaimedAt: r.payment_claimed_at || null,
    paymentDeadlineAt: r.payment_deadline_at || null,
    receiptRequestedAt: r.receipt_requested_at || null,
    rejectReason: r.reject_reason,
    reviewedAt: r.reviewed_at,
    reviewedBy: r.reviewed_by,
    createdAt: r.created_at,
    appliedShopId: r.applied_shop_id || null,
    appliedAt: r.applied_at || null,
    awaitingProvisioning: r.kind === "NEW_SHOP" && r.status === "APPROVED" && !r.applied_at,
    shopCreated: !!r.applied_shop_id && !!r.applied_at,
    // Do'kon egasi so'ragan bot nomi/bio/rasmi — Telegram'ga hech qanday
    // avtomatik ta'sir qilmaydi, faqat admin botni @BotFather orqali
    // yaratayotganda qo'lda foydalanishi uchun ko'rsatiladi.
    requestedBotName: r.requested_bot_name || null,
    requestedBotBio: r.requested_bot_bio || null,
    hasBotPhoto: !!r.bot_photo_storage_path,
    botPhotoUploadedAt: r.bot_photo_uploaded_at || null,
  };
}

const SUBSCRIPTION_REQUEST_SELECT = "id,requester_telegram_id,requested_by_user_id,owner_telegram_id,requested_shop_name,requester_username,requester_first_name,kind,shop_id,tariff_id,tariff_name_snapshot,tariff_price_snapshot,tariff_product_limit_snapshot,billing_period,duration_days,upgrade_action,status,receipt_storage_path,receipt_uploaded_at,receipt_source,payment_method,payment_method_id,payment_claimed_at,payment_deadline_at,receipt_requested_at,reject_reason,reviewed_at,reviewed_by,created_at,applied_shop_id,applied_at,requested_bot_name,requested_bot_bio,bot_photo_storage_path,bot_photo_uploaded_at";

async function listMySubscriptionRequests(db: any, tgId: string, limit = 100): Promise<any[]> {
  await purgeExpiredPaymentDrafts(db);
  const { data, error } = await db.from("subscription_requests")
    .select(SUBSCRIPTION_REQUEST_SELECT)
    .eq("requested_by_user_id", tgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(mapSubscriptionRequest);
}

async function storeTelegramSubscriptionReceipt(
  db: any,
  botToken: string,
  requestId: string,
  tgId: string,
  telegramFileId: string,
): Promise<{ path: string }> {
  const fileInfo = await telegramApi(botToken, "getFile", { file_id: telegramFileId });
  const filePath = String(fileInfo?.result?.file_path || "");
  if (!filePath) throw new Error("telegram_receipt_file_not_found");
  const response = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
  if (!response.ok) throw new Error("telegram_receipt_download_failed");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 6 * 1024 * 1024) throw new Error("receipt_too_large");
  const contentType = String(response.headers.get("content-type") || "image/jpeg").toLowerCase();
  const extensionByMime: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const ext = extensionByMime[contentType] || "jpg";
  const safeMime = extensionByMime[contentType] ? contentType : "image/jpeg";
  const path = `platform/subscription-requests/${requestId}/${tgId}-${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage.from("payment-receipts").upload(path, bytes, { contentType: safeMime, cacheControl: "300", upsert: false });
  if (error) throw new Error(`receipt_upload_failed:${error.message}`);
  return { path };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const PLATFORM_BOT_TOKEN = Deno.env.get("USTORE_PLATFORM_BOT_TOKEN")!;
  const SUPER_ADMIN_ID = String(Deno.env.get("USTORE_SUPER_ADMIN_ID") ?? "");
  const BOT_TOKEN_MASTER_KEY = Deno.env.get("USTORE_BOT_TOKEN_MASTER_KEY")!;
  const SHOP_MINI_APP_BASE_URL = Deno.env.get("SHOP_MINI_APP_BASE_URL") || DEFAULT_SHOP_MINI_APP_BASE_URL;
  const PLATFORM_MINI_APP_URL = Deno.env.get("PLATFORM_MINI_APP_URL") || DEFAULT_PLATFORM_MINI_APP_URL;
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  // ---- Platform bot's own Telegram webhook (/start) ------------------------
  // 19/20-band: the main UStorE bot is webhook-driven too, not polling —
  // this is its ENTIRE webhook surface (no shop concept involved at all).
  if (body?.update_id !== undefined) {
    if (!PLATFORM_BOT_TOKEN) return json({ error: "platform_bot_not_configured" }, 500);
    const expectedSecret = await telegramWebhookSecret(PLATFORM_BOT_TOKEN);
    const gotSecret = req.headers.get("x-telegram-bot-api-secret-token") || "";
    if (gotSecret !== expectedSecret) return json({ error: "forbidden:webhook_secret" }, 403);
    const message = body?.message;
    const callback = body?.callback_query;

    async function attachTelegramReceiptToRequest(requestId: string, senderId: string, telegramFileId: string): Promise<boolean> {
      const { data: reqRow, error: reqErr } = await db.from("subscription_requests")
        .select("id,status,requested_by_user_id,requester_telegram_id,receipt_storage_path,payment_claimed_at,payment_deadline_at,kind,upgrade_action,billing_period,tariff_name_snapshot,tariff_price_snapshot,requested_shop_name")
        .eq("id", requestId).maybeSingle();
      if (reqErr) throw reqErr;
      if (!reqRow || String(reqRow.requested_by_user_id || reqRow.requester_telegram_id) !== senderId || reqRow.status !== "NEW") return false;
      if (!reqRow.payment_claimed_at && reqRow.payment_deadline_at && new Date(reqRow.payment_deadline_at).getTime() <= Date.now()) {
        await db.from("subscription_requests").delete().eq("id", requestId).eq("status", "NEW").is("payment_claimed_at", null);
        return false;
      }
      if (reqRow.receipt_storage_path) return true;

      const stored = await storeTelegramSubscriptionReceipt(db, PLATFORM_BOT_TOKEN, requestId, senderId, telegramFileId);
      const now = new Date().toISOString();
      const wasClaimed = !!reqRow.payment_claimed_at;
      const { error: updateErr } = await db.from("subscription_requests").update({
        receipt_storage_path: stored.path,
        receipt_uploaded_at: now,
        receipt_source: "TELEGRAM_BOT",
        payment_claimed_at: reqRow.payment_claimed_at || now,
      }).eq("id", requestId);
      if (updateErr) throw updateErr;
      if (!wasClaimed) await appendSubscriptionRequestHistory(db, requestId, "PAYMENT_CLAIMED", "BOT", senderId, { source: "TELEGRAM_BOT" });
      await appendSubscriptionRequestHistory(db, requestId, "RECEIPT_UPLOADED", "BOT", senderId, { source: "TELEGRAM_BOT" });

      EdgeRuntime.waitUntil((async () => {
        try {
          if (!SUPER_ADMIN_ID) return;
          const { data: signed } = await db.storage.from("payment-receipts").createSignedUrl(stored.path, 300);
          const kindLabel = reqRow.kind === "NEW_SHOP" ? "Yangi do'kon" : reqRow.upgrade_action === "EXTEND" ? "Obunani uzaytirish" : "Tarifni o'zgartirish";
          const caption = `🧾 Chek Telegram bot orqali yuborildi\n${kindLabel}${reqRow.requested_shop_name ? ` · ${reqRow.requested_shop_name}` : ""}\n${reqRow.tariff_name_snapshot} — ${reqRow.tariff_price_snapshot} so'm\nSo'rov ID: ${requestId}`;
          if (signed?.signedUrl) await telegramApi(PLATFORM_BOT_TOKEN, "sendPhoto", { chat_id: SUPER_ADMIN_ID, photo: signed.signedUrl, caption });
        } catch (e) { console.error("telegram receipt admin notify error", e); }
      })());
      return true;
    }

    if (callback?.id) {
      const senderId = String(callback?.from?.id || "");
      const data = String(callback?.data || "");
      if (senderId && data.startsWith("receipt_req:")) {
        const requestId = data.slice("receipt_req:".length);
        try {
          const { data: session } = await db.from("platform_receipt_bot_sessions")
            .select("telegram_file_id,created_at").eq("telegram_user_id", senderId).maybeSingle();
          const fresh = session?.created_at && Date.now() - new Date(session.created_at).getTime() <= 60 * 60 * 1000;
          if (!session?.telegram_file_id || !fresh) {
            await telegramApi(PLATFORM_BOT_TOKEN, "answerCallbackQuery", { callback_query_id: callback.id, text: "Tanlov eskirgan. Chek rasmini qayta yuboring.", show_alert: true });
          } else {
            const ok = await attachTelegramReceiptToRequest(requestId, senderId, session.telegram_file_id);
            if (!ok) {
              await telegramApi(PLATFORM_BOT_TOKEN, "answerCallbackQuery", { callback_query_id: callback.id, text: "Bu ariza ochiq emas yoki sizga tegishli emas.", show_alert: true });
            } else {
              await db.from("platform_receipt_bot_sessions").delete().eq("telegram_user_id", senderId);
              await telegramApi(PLATFORM_BOT_TOKEN, "answerCallbackQuery", { callback_query_id: callback.id, text: "Chek arizaga biriktirildi." });
              await telegramApi(PLATFORM_BOT_TOKEN, "sendMessage", { chat_id: senderId, text: "✅ Chek yuborildi. To'lovingiz tekshirilmoqda." });
            }
          }
        } catch (e) {
          console.error("platform receipt callback error", e);
          try { await telegramApi(PLATFORM_BOT_TOKEN, "answerCallbackQuery", { callback_query_id: callback.id, text: "Chekni biriktirib bo'lmadi. Qayta urinib ko'ring.", show_alert: true }); } catch (_) {}
        }
      }
      return json({ ok: true });
    }

    const chatId = message?.chat?.id;
    const senderId = String(message?.from?.id || chatId || "");
    const text = String(message?.text || "").trim();
    const tokens = text.split(/\s+/).filter(Boolean);
    const firstToken = String(tokens[0] || "").toLowerCase();
    const startPayloadRaw = String(tokens[1] || "");
    const startPayload = startPayloadRaw.toLowerCase();
    const isStartCommand = firstToken === "/start" || firstToken.startsWith("/start@");
    const isIdCommand = firstToken === "/id" || firstToken.startsWith("/id@");
    const isLoginCommand = firstToken === "/login" || firstToken.startsWith("/login@");
    if (chatId && isIdCommand) {
      try {
        await telegramApi(PLATFORM_BOT_TOKEN, "sendMessage", { chat_id: chatId, text: `Sizning Telegram ID'ingiz: ${senderId}` });
      } catch (e) { console.error("platform /id send error", e); }
      return json({ ok: true });
    }
    // ASTRA-4b: browser-bound Telegram web login. The state token is
    // case-sensitive; never lowercase it. This branch runs only after the
    // central bot webhook-secret verification above, so a shop bot cannot
    // approve or reset the global UStorE web identity.
    if (chatId && isStartCommand && startPayloadRaw.startsWith("webauth_")) {
      const state = startPayloadRaw.slice("webauth_".length);
      try {
        const displayName = [message?.from?.first_name, message?.from?.last_name].filter(Boolean).join(" ").trim() || null;
        const accountId = await ensureTelegramAccount(db, senderId, displayName);
        const approval = await approveTelegramWebChallenge(db, { state, accountId, telegramUserId: senderId });
        const approved = approval === "APPROVED" || approval === "ALREADY_APPROVED";
        const text = approved
          ? "✅ Web kirish tasdiqlandi. Brauzerga qayting va ko‘rsatilgan Telegram profilingizni tasdiqlab davom eting."
          : approval === "EXPIRED"
            ? "⌛ Kirish so‘rovi muddati tugagan. Saytdan yangi Telegram kirish so‘rovini boshlang."
            : approval === "CONSUMED"
              ? "ℹ️ Bu kirish so‘rovi avval ishlatilgan. Kerak bo‘lsa saytdan yangisini boshlang."
              : approval === "APPROVED_OTHER"
                ? "⛔ Bu kirish so‘rovi boshqa Telegram akkaunti bilan tasdiqlangan. Xavfsizlik uchun o‘zgartirilmadi."
                : "⛔ Kirish so‘rovi topilmadi yoki yaroqsiz.";
        await telegramApi(PLATFORM_BOT_TOKEN, "sendMessage", { chat_id: chatId, text });
      } catch (e) {
        console.error("platform webauth approval error", { code: (e as any)?.code || "unknown" });
        try { await telegramApi(PLATFORM_BOT_TOKEN, "sendMessage", { chat_id: chatId, text: "Web kirishni tasdiqlab bo‘lmadi. Saytdan yangi so‘rov boshlang." }); } catch (_) {}
      }
      return json({ ok: true });
    }
    if (chatId && (isLoginCommand || (isStartCommand && startPayload === "credentials"))) {
      try {
        const displayName = [message?.from?.first_name, message?.from?.last_name].filter(Boolean).join(" ").trim() || null;
        const accountId = await ensureTelegramAccount(db, senderId, displayName);
        const now = new Date();
        await db.from("telegram_credential_entry").upsert({
          telegram_user_id: senderId,
          account_id: accountId,
          state_nonce_hash: null,
          requested_at: now.toISOString(),
          expires_at: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
          consumed_at: null,
        });
        const credentialsUrl = new URL(PLATFORM_MINI_APP_URL);
        credentialsUrl.searchParams.set("screen", "web-credentials");
        await telegramApi(PLATFORM_BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: "🔐 <b>UStorE web kirishi</b>\n\nLogin/parolni olish yoki almashtirish faqat UStorE'ning tasdiqlangan Telegram Mini App oynasida bajariladi. Parol bot chatiga yuborilmaydi.",
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [[{ text: "Login va parolni boshqarish", web_app: { url: credentialsUrl.toString() } }]] },
        });
      } catch (e) {
        console.error("platform credential entry error", { code: (e as any)?.code || "unknown" });
        try { await telegramApi(PLATFORM_BOT_TOKEN, "sendMessage", { chat_id: chatId, text: "Web kirish oynasini hozir ochib bo‘lmadi. Keyinroq qayta urinib ko‘ring." }); } catch (_) {}
      }
      return json({ ok: true });
    }
    if (chatId && isStartCommand) {
      try {
        await telegramApi(PLATFORM_BOT_TOKEN, "sendMessage", {
          chat_id: chatId,
          text: "👋 <b>UStorE</b>\n\nWeb sayt va Telegram Mini App orqali savdo qiladigan do‘koningizni bitta joydan boshqaring. Boshlash uchun pastdagi tugmani bosing. Telegram ID'ingizni bilish uchun /id yuborishingiz mumkin.",
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[{ text: "UStorE boshqaruv panelini ochish", web_app: { url: PLATFORM_MINI_APP_URL } }]],
          },
        });
      } catch (e) { console.error("platform /start send error", e); }
      return json({ ok: true });
    }

    const photos = Array.isArray(message?.photo) ? message.photo : [];
    const largestPhoto = photos.length ? photos[photos.length - 1] : null;
    if (chatId && senderId && largestPhoto?.file_id) {
      try {
        await purgeExpiredPaymentDrafts(db);
        const { data: openRows, error: openErr } = await db.from("subscription_requests")
          .select("id,kind,upgrade_action,tariff_name_snapshot,requested_shop_name,created_at")
          .eq("requested_by_user_id", senderId).eq("status", "NEW").is("receipt_storage_path", null)
          .order("created_at", { ascending: false }).limit(10);
        if (openErr) throw openErr;
        const rows = openRows || [];
        if (!rows.length) {
          await telegramApi(PLATFORM_BOT_TOKEN, "sendMessage", { chat_id: chatId, text: "Hozir chek biriktirish mumkin bo'lgan ochiq arizangiz yo'q." });
        } else if (rows.length === 1) {
          const ok = await attachTelegramReceiptToRequest(rows[0].id, senderId, largestPhoto.file_id);
          if (ok) await telegramApi(PLATFORM_BOT_TOKEN, "sendMessage", { chat_id: chatId, text: "✅ Chek yuborildi. To'lovingiz tekshirilmoqda." });
        } else {
          await db.from("platform_receipt_bot_sessions").upsert({
            telegram_user_id: senderId,
            telegram_file_id: largestPhoto.file_id,
            telegram_message_id: message?.message_id || null,
            created_at: new Date().toISOString(),
          });
          const buttons = rows.map((r: any) => {
            const type = r.kind === "NEW_SHOP" ? "Yangi do'kon" : r.upgrade_action === "EXTEND" ? "Uzaytirish" : "Tarif o'zgartirish";
            const title = r.requested_shop_name ? `${type} · ${r.requested_shop_name}` : `${type} · ${r.tariff_name_snapshot}`;
            return [{ text: title.slice(0, 52), callback_data: `receipt_req:${r.id}` }];
          });
          await telegramApi(PLATFORM_BOT_TOKEN, "sendMessage", {
            chat_id: chatId,
            text: "Qaysi ariza uchun chek?",
            reply_markup: { inline_keyboard: buttons },
          });
        }
      } catch (e) {
        console.error("platform telegram receipt error", e);
        try { await telegramApi(PLATFORM_BOT_TOKEN, "sendMessage", { chat_id: chatId, text: "Chekni biriktirib bo'lmadi. Keyinroq qayta urinib ko'ring." }); } catch (_) {}
      }
    }
    return json({ ok: true });
  }

  const { action, payload = {}, initData } = body || {};

  // CHAT-N1: public platform landing catalog. This is intentionally the only
  // unauthenticated platform action: it exposes active tariff display fields
  // only and never platform actor/shop/subscription/private state.
  if (String(action || "") === "platform_public_catalog") {
    const { data: tariffRows, error: tariffError } = await db.from("tariffs")
      .select("id,name,price,product_limit,is_popular,features")
      .eq("is_active", true)
      .order("sort_order")
      .order("price");
    if (tariffError) {
      console.error('[PLATFORM_PUBLIC_CATALOG_FAILED]', { code: 'DATABASE_ERROR' });
      return json({ error: 'NETWORK_ERROR' }, 503);
    }
    return json({
      tariffs: (tariffRows || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        price: Number(t.price),
        productLimit: t.product_limit,
        isPopular: t.is_popular === true,
        features: Array.isArray(t.features) ? t.features : [],
      })),
    });
  }

  // ---- Regular actions: central Telegram initData OR central web session. ---
  // Web auth maps the central account back to its verified Telegram identity
  // because the current platform ownership/subscription schema is Telegram-keyed.
  // Shop roles NEVER grant platform Super Admin authority.
  if (!PLATFORM_BOT_TOKEN) return json({ error: "platform_bot_not_configured" }, 500);
  const requestedClientMode = String(body?.clientMode || "telegram").toLowerCase();
  let authMode: "telegram" | "web" = "telegram";
  let tgId = "";
  let accountId = "";
  let verifiedDisplayName = "";
  let isPlatformSuperAdmin = false;

  if (requestedClientMode === "web") {
    try {
      const principal = await resolvePlatformWebPrincipal(db, req, SUPER_ADMIN_ID);
      if (!principal) return json({ error: "session_expired" }, 401);
      authMode = principal.authMode;
      tgId = principal.tgId;
      accountId = principal.accountId;
      verifiedDisplayName = principal.displayName;
      isPlatformSuperAdmin = principal.isPlatformSuperAdmin;
    } catch (e) {
      const message = String((e as any)?.message || "");
      if (message === "forbidden:telegram_identity_required") return json({ error: message }, 403);
      console.error('[PLATFORM_WEB_AUTH_FAILED]', { code: 'identity_lookup_failed' });
      return json({ error: 'NETWORK_ERROR' }, 500);
    }
  } else {
    const verified = await verifyTelegramInitData(initData, PLATFORM_BOT_TOKEN);
    if (!verified.ok) return json({ error: `auth_failed:${"reason" in verified ? verified.reason : "invalid"}` }, 401);
    tgId = verified.tgId;
    verifiedDisplayName = [verified.firstName, verified.lastName].filter(Boolean).join(" ").trim() || verified.username || `ustore.${tgId.slice(-6)}`;
    try {
      accountId = await ensureTelegramAccount(db, tgId, verifiedDisplayName);
    } catch (_) {
      console.error('[PLATFORM_TELEGRAM_ACCOUNT_FAILED]', { code: 'identity_lookup_failed' });
      return json({ error: 'NETWORK_ERROR' }, 500);
    }
    // 5-band: client-supplied identity (initDataUnsafe on the frontend) is
    // NEVER used for authorization — only the cryptographically verified tgId.
    isPlatformSuperAdmin = SUPER_ADMIN_ID !== "" && tgId === SUPER_ADMIN_ID;
  }

  function requirePlatformSuperAdmin() {
    if (!isPlatformSuperAdmin) throw new Error("forbidden:not_platform_super_admin");
  }

  const TELEGRAM_REAUTH_ACTIONS = new Set([
    "platform_prepare_web_credentials",
    "platform_web_credentials_status",
    "platform_issue_web_credentials",
    "platform_reset_web_credentials",
    "platform_change_web_login",
    "platform_set_web_password",
  ]);
  if (authMode === "web" && TELEGRAM_REAUTH_ACTIONS.has(String(action || ""))) {
    return json({ error: "forbidden:telegram_reauthentication_required" }, 403);
  }

  // ASTRA-4c: Global web credentials can only be managed with central-bot verified
  // initData. The profile opens a short-lived entry just like the /login bot
  // command; shop-bot initData cannot authorize central password actions.
  async function credentialEntryStatus() {
    const accountId = await ensureTelegramAccount(db, tgId, verifiedDisplayName);
    const nowIso = new Date().toISOString();
    const { data: entry, error: entryError } = await db.from("telegram_credential_entry")
      .select("account_id,expires_at,consumed_at").eq("telegram_user_id", tgId).maybeSingle();
    if (entryError) throw entryError;
    const valid = !!entry && String(entry.account_id) === accountId && !entry.consumed_at && String(entry.expires_at) > nowIso;
    const { data: credential, error: credentialError } = await db.from("account_credentials")
      .select("login_display").eq("account_id", accountId).maybeSingle();
    if (credentialError) throw credentialError;
    return { accountId, valid, expiresAt: valid ? String(entry.expires_at) : null, credentialExists: !!credential, login: credential?.login_display ? String(credential.login_display) : null };
  }
  async function claimCredentialEntry(accountId: string): Promise<boolean> {
    const nowIso = new Date().toISOString();
    const { data, error } = await db.from("telegram_credential_entry")
      .update({ consumed_at: nowIso })
      .eq("telegram_user_id", tgId).eq("account_id", accountId)
      .is("consumed_at", null).gt("expires_at", nowIso)
      .select("account_id").maybeSingle();
    if (error) throw error;
    return !!data;
  }

  try {
    switch (action) {
      case "platform_shop_domains": {
        requirePlatformSuperAdmin();
        const shopId = String(body?.shopId || "");
        if (!/^[0-9a-f-]{36}$/i.test(shopId)) return json({ error: "invalid_shop_id" }, 400);
        const domainAction = String(body?.domainAction || "list");
        if (!["list", "change_slug", "add", "verify", "set_primary", "remove"].includes(domainAction)) return json({ error: "invalid_domain_action" }, 400);
        try {
          return json(await handlePlatformDomainAction(db, shopId, tgId, domainAction, body, Deno.env.get("USTORE_BASE_HOSTNAME") || "ustr.uz"));
        } catch (error: any) {
          const code = String(error?.message || "");
          if (code === "shop_not_found" || code === "domain_not_found") return json({ error: "NOT_FOUND" }, 404);
          if (code === "domain_provider_unavailable" || code === "domain_provider_capability") return json({ error: "CAPABILITY_UNAVAILABLE" }, 503);
          if (code === "subdomain_taken" || code === "domain_operation_busy" || error?.code === "23505") return json({ error: "CONFLICT" }, 409);
          if (["invalid_slug", "invalid_hostname", "invalid_domain_id", "cannot_remove_default_subdomain", "domain_not_active"].includes(code)) return json({ error: code }, 400);
          console.error("[PLATFORM_DOMAIN_ACTION_FAILED]", { code: code.slice(0, 80), action: domainAction });
          return json({ error: "NETWORK_ERROR" }, 502);
        }
      }
      case "platform_prepare_web_credentials": {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
        const { error } = await db.from("telegram_credential_entry").upsert({
          telegram_user_id: tgId, account_id: accountId, state_nonce_hash: null,
          requested_at: now.toISOString(), expires_at: expiresAt, consumed_at: null,
        });
        if (error) throw error;
        const status = await credentialEntryStatus();
        const issued = status.credentialExists ? null : await issueInitialCredentials(db, {
          accountId: status.accountId, telegramUserId: tgId, loginHint: verifiedDisplayName,
        });
        if (issued?.created) await db.from("web_auth_audit").insert({ account_id: status.accountId, event_type: "CREDENTIAL_ISSUED_TELEGRAM", metadata: { source: "PLATFORM_MINI_APP_AUTO" } });
        return json({ ok: true, expiresAt, valid: status.valid, credentialExists: true,
          login: issued?.login || status.login, created: issued?.created === true,
          password: issued?.created ? issued.password : null });
      }
      case "platform_web_credentials_status": {
        const status = await credentialEntryStatus();
        const issued = status.valid && !status.credentialExists ? await issueInitialCredentials(db, {
          accountId: status.accountId, telegramUserId: tgId, loginHint: verifiedDisplayName,
        }) : null;
        if (issued?.created) await db.from("web_auth_audit").insert({ account_id: status.accountId, event_type: "CREDENTIAL_ISSUED_TELEGRAM", metadata: { source: "PLATFORM_MINI_APP_AUTO" } });
        return json({ ok: true, ...status, credentialExists: status.credentialExists || issued?.created === true,
          login: issued?.login || status.login, created: issued?.created === true,
          password: issued?.created ? issued.password : null });
      }

      case "platform_issue_web_credentials": {
        const status = await credentialEntryStatus();
        if (!status.valid || !(await claimCredentialEntry(status.accountId))) return json({ error: "credential_entry_expired" }, 409);
        const issued = await issueInitialCredentials(db, { accountId: status.accountId, telegramUserId: tgId, loginHint: verifiedDisplayName });
        if (issued.created) await db.from("web_auth_audit").insert({ account_id: status.accountId, event_type: "CREDENTIAL_ISSUED_TELEGRAM", metadata: {} });
        return json({ ok: true, login: issued.login, created: issued.created, credentialExists: true, password: issued.created ? issued.password : null });
      }

      case "platform_reset_web_credentials": {
        const status = await credentialEntryStatus();
        if (!status.valid || !(await claimCredentialEntry(status.accountId))) return json({ error: "credential_entry_expired" }, 409);
        const reset = await resetCredentialsForTelegram(db, { accountId: status.accountId, loginHint: status.login || verifiedDisplayName, telegramUserId: tgId });
        return json({ ok: true, login: reset.login, password: reset.password, credentialExists: true, sessionsRevoked: true });
      }

      case "platform_change_web_login": {
        const status = await credentialEntryStatus();
        if (!status.valid || !(await claimCredentialEntry(status.accountId))) return json({ error: "credential_entry_expired" }, 409);
        const result = await changeLogin(db, status.accountId, String(payload.login || ""));
        return json({ ok: true, login: result.login, credentialExists: status.credentialExists });
      }
      case "platform_set_web_password": {
        const status = await credentialEntryStatus();
        if (!status.valid || !(await claimCredentialEntry(status.accountId))) return json({ error: "credential_entry_expired" }, 409);
        const result = await setCredentialsPasswordForTelegram(db, {
          accountId: status.accountId, loginHint: status.login || verifiedDisplayName,
          telegramUserId: tgId, password: String(payload.password || ""),
        });
        return json({ ok: true, login: result.login, credentialExists: true, sessionsRevoked: true });
      }
      // 8-band: preview a bot before committing to connect it. Returns only
      // safe metadata — the token itself is never echoed back.
      case "platform_verify_bot": {
        requirePlatformSuperAdmin();
        const botToken = String(payload.botToken || "").trim();
        if (!botTokenLooksValid(botToken)) return json({ error: "invalid_bot_token_format" }, 400);

        let me: any;
        try {
          const res = await telegramApi(botToken, "getMe", {});
          me = res.result;
        } catch (e) {
          console.error("platform_verify_bot getMe error", safeBotError(e));
          return json({ error: safeBotError(e) }, 400);
        }
        if (!me?.id) return json({ error: "invalid_bot_token" }, 400);

        const { data: existingBot } = await db.from("shop_bots").select("shop_id,status").eq("telegram_bot_id", String(me.id)).maybeSingle();
        let alreadyConnected = false;
        let retryable = false;
        if (existingBot) {
          const { data: existingShop } = await db.from("shops").select("status").eq("id", existingBot.shop_id).maybeSingle();
          if (existingShop?.status === "PROVISIONING") retryable = true;
          else alreadyConnected = true;
        }

        return json({
          telegramBotId: String(me.id),
          username: me.username || null,
          name: me.first_name || null,
          alreadyConnected,
          retryable,
        });
      }

      // 9-band: THE main provisioning flow. Client-sent getMe is never
      // trusted — the server re-validates the token itself, right here.
      case "platform_connect_bot": {
        requirePlatformSuperAdmin();
        const botToken = String(payload.botToken || "").trim();
        const ownerTelegramId = String(payload.ownerTelegramId || "").trim();
        if (!botTokenLooksValid(botToken)) return json({ error: "invalid_bot_token_format" }, 400);
        // BIGINT-safe: kept as a digit-string throughout, never coerced to
        // a JS Number (which loses precision above 2^53).
        if (!/^\d{5,15}$/.test(ownerTelegramId)) return json({ error: "invalid_owner_telegram_id" }, 400);

        let me: any;
        try {
          const res = await telegramApi(botToken, "getMe", {});
          me = res.result;
        } catch (e) {
          console.error("platform_connect_bot getMe error", safeBotError(e));
          return json({ error: safeBotError(e) }, 400);
        }
        if (!me?.id) return json({ error: "invalid_bot_token" }, 400);
        const telegramBotId = String(me.id);

        const { ciphertext, iv } = await encryptBotToken(BOT_TOKEN_MASTER_KEY, botToken);
        const tokenLast4 = botToken.slice(-4);

        let provisionResult: any;
        {
          const { data, error } = await db.rpc("ustore_create_shop_provisioning", {
            p_owner_telegram_id: ownerTelegramId,
            p_telegram_bot_id: telegramBotId,
            p_bot_username: me.username || null,
            p_bot_name: me.first_name || null,
            p_token_ciphertext: ciphertext,
            p_token_iv: iv,
            p_token_last4: tokenLast4,
          });
          if (error) {
            const m = String(error.message || "");
            if (m.includes("bot_already_connected")) return json({ error: "bot_already_connected" }, 409);
            throw error;
          }
          provisionResult = data;
        }
        const shopId = provisionResult.shopId;
        const subdomain = await ensureShopSubdomain(db, shopId, String(me.first_name || me.username || "shop"));

        // 12/13-band: Telegram-side config. These are NOT transactional —
        // if either fails, the shop stays in PROVISIONING (never flips to
        // ACTIVE) and the Super Admin can just call platform_connect_bot
        // again with the same token to retry (ustore_create_shop_provisioning
        // recognizes the existing PROVISIONING shop and reuses it, per its
        // own doc comment in 009_platform_provisioning.sql).
        try {
          await telegramApi(botToken, "setChatMenuButton", {
            menu_button: {
              type: "web_app",
              text: "Do'konni ochish",
              web_app: { url: `${SHOP_MINI_APP_BASE_URL}?bot_id=${encodeURIComponent(telegramBotId)}` },
            },
          });
          const secretToken = await telegramWebhookSecret(botToken);
          await telegramApi(botToken, "setWebhook", {
            url: `${SUPABASE_URL}/functions/v1/shop-api?bot_id=${encodeURIComponent(telegramBotId)}`,
            secret_token: secretToken,
            allowed_updates: ["message"],
            drop_pending_updates: false,
          });
        } catch (e) {
          console.error("platform_connect_bot telegram config error", safeBotError(e));
          return json({
            ok: true, shopId, status: "PROVISIONING",
            error: "telegram_config_failed_retry_available",
          }, 200);
        }

        const { error: activateErr } = await db.from("shops").update({ status: "ACTIVE" }).eq("id", shopId);
        if (activateErr) throw activateErr;

        // SaaS obuna oqimi: bu chaqiruv HAR DOIM, so'rov mavjudligidan
        // qat'iy nazar ishga tushadi (mavjud oqim "o'zgarishsiz" qolishi
        // uchun ataylab shunday — hech qanday yangi majburiy maydon
        // qo'shilmadi). Tarifni bog'lash esa ATAYLAB alohida qadam
        // (platform_apply_tariff) — bu yerda emas.
        try {
          await telegramApi(botToken, "sendMessage", {
            chat_id: ownerTelegramId,
            text: "🎉 Do'koningiz tayyor! /start tugmasini bosing.",
          });
        } catch (e) { console.error("new shop welcome message error", e); }

        // 10-band: qo'shimcha xabarnoma — UStorE (platform) botining
        // O'ZIDAN, botning aniq havolasi bilan. Yuqoridagi xabar YANGI
        // BOT'ning o'zidan (o'sha bot hali sotuvchiga notanish bo'lishi
        // mumkin), bu esa sotuvchiga allaqachon tanish UStorE botidan
        // kelgani uchun ishonchliroq tasdiqlash sifatida xizmat qiladi.
        if (me.username) {
          try {
            await telegramApi(PLATFORM_BOT_TOKEN, "sendMessage", {
              chat_id: ownerTelegramId,
              text: `🎉 Do'koningiz muvaffaqiyatli ulandi!\n\nBotingiz: @${me.username}\nhttps://t.me/${me.username}`,
            });
          } catch (e) { console.error("platform bot connect notify error", e); }
        }

        return json({ ok: true, shopId, status: "ACTIVE", telegramBotId, subdomain, isRetry: !!provisionResult.isRetry });
      }

      // 16-band: shop roster for the platform Mini App. Token material never
      // leaves the database — not even to this trusted, super-admin-only caller.
      case "platform_list_shops": {
        requirePlatformSuperAdmin();
        const { data: shops, error: shopsErr } = await db.from("shops")
          .select("id,public_code,status,created_at,billz_access_granted,click_access_granted,payme_access_granted,uzum_access_granted").order("created_at", { ascending: false });
        if (shopsErr) throw shopsErr;
        const shopIds = (shops || []).map((s: any) => s.id);
        const [{ data: bots }, { data: memberships }, { data: settings }, { data: billzConns }, { data: clickConns }, { data: paymeConns }, { data: uzumConns }] = await Promise.all([
          shopIds.length ? db.from("shop_bots").select("shop_id,telegram_bot_id,bot_username,bot_name,status,created_at").in("shop_id", shopIds) : Promise.resolve({ data: [] }),
          shopIds.length ? db.from("shop_memberships").select("shop_id,telegram_user_id,role,status").in("shop_id", shopIds).eq("role", "OWNER").eq("status", "ACTIVE") : Promise.resolve({ data: [] }),
          // SaaS obuna tizimi: tarif/limit/muddat — mavjud xavfsiz-ustunlar
          // select'i (yuqorida) O'ZGARTIRILMAGAN, bu shunchaki YANGI, alohida join.
          shopIds.length ? db.from("shop_settings").select("shop_id,tariff_id,product_limit,subscription_expires_at,frozen_at").in("shop_id", shopIds) : Promise.resolve({ data: [] }),
          // 2026-08-28: integratsiya UX birlashtirish — RUXSAT (access_granted,
          // yuqorida) bilan HAQIQIY ULANISH HOLATINI (bu yerda) aralashtirmaslik
          // uchun. Hech qanday token/parol ustuni SELECT qilinmaydi — faqat
          // status (+Click/Payme uchun verified, +Billz uchun last_error).
          shopIds.length ? db.from("billz_connections").select("shop_id,status,last_error").in("shop_id", shopIds) : Promise.resolve({ data: [] }),
          shopIds.length ? db.from("click_connections").select("shop_id,status,verified").in("shop_id", shopIds) : Promise.resolve({ data: [] }),
          shopIds.length ? db.from("payme_connections").select("shop_id,status,verified").in("shop_id", shopIds) : Promise.resolve({ data: [] }),
          shopIds.length ? db.from("uzum_connections").select("shop_id,status").in("shop_id", shopIds) : Promise.resolve({ data: [] }),
        ]);
        const botByShop = new Map((bots || []).map((b: any) => [b.shop_id, b]));
        const ownerByShop = new Map((memberships || []).map((m: any) => [m.shop_id, m]));
        const settingsByShop = new Map((settings || []).map((s: any) => [s.shop_id, s]));
        const billzConnByShop = new Map((billzConns || []).map((c: any) => [c.shop_id, c]));
        const clickConnByShop = new Map((clickConns || []).map((c: any) => [c.shop_id, c]));
        const paymeConnByShop = new Map((paymeConns || []).map((c: any) => [c.shop_id, c]));
        const uzumConnByShop = new Map((uzumConns || []).map((c: any) => [c.shop_id, c]));
        const tariffIds = Array.from(new Set((settings || []).map((s: any) => s.tariff_id).filter(Boolean)));
        const { data: tariffRows } = tariffIds.length
          ? await db.from("tariffs").select("id,name").in("id", tariffIds)
          : { data: [] as any[] };
        const tariffNameById = new Map((tariffRows || []).map((t: any) => [t.id, t.name]));
        return json({
          shops: (shops || []).map((s: any) => {
            const bot = botByShop.get(s.id);
            const owner = ownerByShop.get(s.id);
            const st = settingsByShop.get(s.id);
            const billzConn = billzConnByShop.get(s.id);
            const clickConn = clickConnByShop.get(s.id);
            const paymeConn = paymeConnByShop.get(s.id);
            const uzumConn = uzumConnByShop.get(s.id);
            return {
              id: s.id, publicCode: s.public_code, status: s.status, createdAt: s.created_at,
              botId: bot?.telegram_bot_id ? String(bot.telegram_bot_id) : null,
              botUsername: bot?.bot_username || null, botName: bot?.bot_name || null,
              botStatus: bot?.status || null, botConnectedAt: bot?.created_at || null,
              ownerTelegramId: owner?.telegram_user_id ? String(owner.telegram_user_id) : null,
              billzAccessGranted: s.billz_access_granted === true,
              clickAccessGranted: s.click_access_granted === true,
              paymeAccessGranted: s.payme_access_granted === true,
              uzumAccessGranted: s.uzum_access_granted === true,
              // Haqiqiy ulanish holati — do'kon admini o'zi BILLZ_SETTINGS/
              // CLICK_SETTINGS/... orqali kiritgan kredensiallardan (shop-api).
              // Ruxsat berilgan bo'lish HALI ulangan degani emas.
              billzConnectionStatus: billzConn?.status || "DISCONNECTED",
              billzLastError: billzConn?.last_error || null,
              clickConnectionStatus: clickConn?.status || "DISCONNECTED",
              clickVerified: clickConn?.verified === true,
              paymeConnectionStatus: paymeConn?.status || "DISCONNECTED",
              paymeVerified: paymeConn?.verified === true,
              uzumConnectionStatus: uzumConn?.status || "DISCONNECTED",
              tariffName: st?.tariff_id ? (tariffNameById.get(st.tariff_id) || null) : null,
              productLimit: st?.product_limit ?? null,
              subscriptionExpiresAt: st?.subscription_expires_at || null,
              frozenAt: st?.frozen_at || null,
            };
          }),
        });
      }

      // Billz (billz.ai) integratsiyasi — boshqarilgan/beta chiqarilish:
      // faqat bosh admin qaysi do'konlarga ruxsat berganini belgilaydi.
      // Do'konning o'z admini bu bayroqni o'zgartira olmaydi (shop-api'da
      // bunday action yo'q — faqat requireBillzAccessGranted() orqali o'qiladi).
      case "platform_set_billz_access": {
        requirePlatformSuperAdmin();
        const shopId = String(payload.shopId || "").trim();
        const enabled = payload.enabled === true;
        if (!shopId) return json({ error: "shop_id_required" }, 400);
        const { error } = await db.from("shops").update({
          billz_access_granted: enabled,
          billz_access_granted_at: new Date().toISOString(),
          billz_access_granted_by: tgId,
        }).eq("id", shopId);
        if (error) throw error;
        return json({ ok: true, shopId, billzAccessGranted: enabled });
      }

      // Click.uz avtomatik to'lov integratsiyasi — Billz'ning aynan bir xil
      // ruxsat-darvoza naqshi.
      case "platform_set_click_access": {
        requirePlatformSuperAdmin();
        const shopId = String(payload.shopId || "").trim();
        const enabled = payload.enabled === true;
        if (!shopId) return json({ error: "shop_id_required" }, 400);
        const { error } = await db.from("shops").update({
          click_access_granted: enabled,
          click_access_granted_at: new Date().toISOString(),
          click_access_granted_by: tgId,
        }).eq("id", shopId);
        if (error) throw error;
        return json({ ok: true, shopId, clickAccessGranted: enabled });
      }

      // Payme/Uzum avtomatik to'lov integratsiyasi — aynan bir xil ruxsat-darvoza naqshi.
      case "platform_set_payme_access": {
        requirePlatformSuperAdmin();
        const shopId = String(payload.shopId || "").trim();
        const enabled = payload.enabled === true;
        if (!shopId) return json({ error: "shop_id_required" }, 400);
        const { error } = await db.from("shops").update({
          payme_access_granted: enabled,
          payme_access_granted_at: new Date().toISOString(),
          payme_access_granted_by: tgId,
        }).eq("id", shopId);
        if (error) throw error;
        return json({ ok: true, shopId, paymeAccessGranted: enabled });
      }
      case "platform_set_uzum_access": {
        requirePlatformSuperAdmin();
        const shopId = String(payload.shopId || "").trim();
        const enabled = payload.enabled === true;
        if (!shopId) return json({ error: "shop_id_required" }, 400);
        const { error } = await db.from("shops").update({
          uzum_access_granted: enabled,
          uzum_access_granted_at: new Date().toISOString(),
          uzum_access_granted_by: tgId,
        }).eq("id", shopId);
        if (error) throw error;
        return json({ ok: true, shopId, uzumAccessGranted: enabled });
      }

      // ---- 4.4/4.5-band: Yordam bo'limi — Support / Muammo haqida xabar ----
      // Ikkalasi ham bitta ticket infratuzilmasidan, faqat `type` bilan
      // farqlanadi. Ochiq (istalgan tasdiqlangan Telegram foydalanuvchi) —
      // faqat o'z ticket'iga yozish/ko'rish tekshiriladi, admin harakatlari
      // esa requirePlatformSuperAdmin() bilan gate qilinadi.
      case "platform_create_support_ticket": {
        const type = payload.type === "BUG_REPORT" ? "BUG_REPORT" : "SUPPORT";
        const message = String(payload.message || "").trim().slice(0, 2000);
        if (!message) return json({ error: "message_required" }, 400);
        const subject = payload.subject ? String(payload.subject).trim().slice(0, 200) : null;
        const pageContext = payload.pageContext ? String(payload.pageContext).trim().slice(0, 100) : null;

        // Yopilmagan mavjud ticket bo'lsa (bir xil turdagi) qayta ishlatiladi,
        // aks holda yangisi ochiladi — 004-migratsiyadagi shop-level naqsh.
        const { data: existingRows } = await db.from("platform_support_tickets")
          .select("*").eq("requester_telegram_id", String(tgId)).eq("type", type).neq("status", "CLOSED")
          .order("id", { ascending: false }).limit(1);
        let ticket = (existingRows || [])[0] || null;
        if (!ticket) {
          const { data: created, error: createError } = await db.from("platform_support_tickets").insert({
            requester_telegram_id: String(tgId), requester_username: verified.username || null,
            requester_first_name: verified.firstName || null, type, subject, page_context: pageContext,
          }).select("*").single();
          if (createError) throw createError;
          ticket = created;
        }

        let attachmentPath: string | null = null;
        if (payload.attachmentUpload) {
          try { attachmentPath = (await storeSupportAttachment(db, ticket.id, String(tgId), payload.attachmentUpload)).path; }
          catch (e: any) { return json({ error: e?.message || "attachment_upload_failed" }, 400); }
        }
        const { data: msg, error: msgError } = await db.from("platform_support_ticket_messages").insert({
          ticket_id: ticket.id, sender: "USER", sender_tg_id: String(tgId), body: message, attachment_path: attachmentPath,
        }).select("*").single();
        if (msgError) throw msgError;
        notifyPlatformSupportAdmin(PLATFORM_BOT_TOKEN, SUPER_ADMIN_ID, ticket, message);
        return json({ ticketId: ticket.id, status: ticket.status });
      }

      case "platform_send_support_message": {
        const ticketId = Number(payload.ticketId);
        const body = String(payload.body || "").trim().slice(0, 2000);
        if (!Number.isInteger(ticketId) || ticketId <= 0 || !body) return json({ error: "invalid_message" }, 400);
        const { data: ticket, error: ticketError } = await db.from("platform_support_tickets").select("*").eq("id", ticketId).maybeSingle();
        if (ticketError) throw ticketError;
        if (!ticket) return json({ error: "ticket_not_found" }, 404);
        if (!isPlatformSuperAdmin && ticket.requester_telegram_id !== String(tgId)) return json({ error: "forbidden" }, 403);
        if (ticket.status === "CLOSED") return json({ error: "ticket_closed" }, 400);
        const sender = isPlatformSuperAdmin ? "ADMIN" : "USER";
        const { data: msg, error: msgError } = await db.from("platform_support_ticket_messages").insert({
          ticket_id: ticketId, sender, sender_tg_id: String(tgId), body,
        }).select("*").single();
        if (msgError) throw msgError;
        let updatedTicket = ticket;
        if (sender === "ADMIN" && ticket.status === "OPEN") {
          const { data: statusUpdated, error: statusError } = await db.from("platform_support_tickets").update({
            status: "ANSWERED", answered_at: new Date().toISOString(), answered_by: String(tgId),
          }).eq("id", ticketId).select("*").single();
          if (statusError) throw statusError;
          updatedTicket = statusUpdated;
        }
        if (sender === "ADMIN") notifyPlatformSupportReply(PLATFORM_BOT_TOKEN, updatedTicket, body);
        else notifyPlatformSupportAdmin(PLATFORM_BOT_TOKEN, SUPER_ADMIN_ID, updatedTicket, body);
        return json({ status: updatedTicket.status });
      }

      case "platform_close_support_ticket": {
        const ticketId = Number(payload.ticketId);
        if (!Number.isInteger(ticketId) || ticketId <= 0) return json({ error: "invalid_ticket" }, 400);
        const { data: ticket } = await db.from("platform_support_tickets").select("id,requester_telegram_id,status").eq("id", ticketId).maybeSingle();
        if (!ticket) return json({ error: "ticket_not_found" }, 404);
        if (!isPlatformSuperAdmin && ticket.requester_telegram_id !== String(tgId)) return json({ error: "forbidden" }, 403);
        if (ticket.status === "CLOSED") return json({ ok: true });
        const { error } = await db.from("platform_support_tickets").update({
          status: "CLOSED", closed_at: new Date().toISOString(), closed_by: String(tgId),
        }).eq("id", ticketId);
        if (error) throw error;
        return json({ ok: true });
      }

      case "platform_get_my_support_tickets": {
        const type = payload.type === "BUG_REPORT" ? "BUG_REPORT" : "SUPPORT";
        const { data, error } = await db.from("platform_support_tickets")
          .select("*").eq("requester_telegram_id", String(tgId)).eq("type", type).order("id", { ascending: false }).limit(50);
        if (error) throw error;
        return json({ tickets: (data || []).map(mapPlatformTicket) });
      }

      case "platform_get_support_messages": {
        const ticketId = Number(payload.ticketId);
        if (!Number.isInteger(ticketId) || ticketId <= 0) return json({ error: "invalid_ticket" }, 400);
        const { data: ticket } = await db.from("platform_support_tickets").select("id,requester_telegram_id").eq("id", ticketId).maybeSingle();
        if (!ticket) return json({ error: "ticket_not_found" }, 404);
        if (!isPlatformSuperAdmin && ticket.requester_telegram_id !== String(tgId)) return json({ error: "forbidden" }, 403);
        const { data, error } = await db.from("platform_support_ticket_messages").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true }).limit(500);
        if (error) throw error;
        const withUrls = await Promise.all((data || []).map(async (m: any) => {
          let attachmentUrl: string | null = null;
          if (m.attachment_path) {
            const { data: signed } = await db.storage.from("payment-receipts").createSignedUrl(m.attachment_path, 300);
            attachmentUrl = signed?.signedUrl || null;
          }
          return { id: m.id, sender: m.sender, body: m.body, attachmentUrl, createdAt: m.created_at };
        }));
        return json({ messages: withUrls });
      }

      case "platform_admin_list_support_tickets": {
        requirePlatformSuperAdmin();
        const statusFilter = ["OPEN", "ANSWERED", "CLOSED"].includes(String(payload.status)) ? String(payload.status) : null;
        let query = db.from("platform_support_tickets").select("*").order("id", { ascending: false }).limit(200);
        if (statusFilter) query = query.eq("status", statusFilter);
        const { data, error } = await query;
        if (error) throw error;
        return json({ tickets: (data || []).map(mapPlatformTicket) });
      }

      // 19-band: one-time (idempotent — safe to call again) setup of the
      // PLATFORM bot's own menu button + webhook. Not called automatically
      // by anything — the Super Admin triggers it once after deploy.
      case "platform_setup": {
        requirePlatformSuperAdmin();
        await telegramApi(PLATFORM_BOT_TOKEN, "setChatMenuButton", {
          menu_button: { type: "web_app", text: "UStorE boshqaruv paneli", web_app: { url: PLATFORM_MINI_APP_URL } },
        });
        const secretToken = await telegramWebhookSecret(PLATFORM_BOT_TOKEN);
        const data = await telegramApi(PLATFORM_BOT_TOKEN, "setWebhook", {
          url: `${SUPABASE_URL}/functions/v1/platform-api`,
          secret_token: secretToken,
          allowed_updates: ["message", "callback_query"],
          drop_pending_updates: false,
        });
        return json({ ok: true, description: data?.description || "Platform bot configured" });
      }

      // ---- SaaS obuna tizimi, 2-bosqich: boot, mening do'konlarim, --------
      // ---- so'rov yuborish/ko'rish/tasdiqlash/rad etish, dashboard --------
      case "platform_boot": {
        // Ochiq — har qanday tasdiqlangan Telegram foydalanuvchi (yangi
        // tashrif buyuruvchi ham) chaqiradi, frontend shunga qarab
        // landing/dashboard'ni tanlaydi.
        const [myShops, { data: tariffRows }, myRequests, lifecycleSettings] = await Promise.all([
          listMyShops(db, tgId),
          db.from("tariffs").select("id,name,price,product_limit,is_popular,features").eq("is_active", true).order("sort_order").order("price"),
          listMySubscriptionRequests(db, tgId, 50),
          loadLifecycleSettings(db),
        ]);
        // 2026-08-28, 055-migratsiya: "Mini-App ochilgan, lekin obuna
        // bo'lmagan" eslatmalari (Group A) uchun birinchi tashrif vaqtini
        // qayd etadi — FAQAT do'koni yo'q foydalanuvchilar uchun, va FAQAT
        // birinchi marta (keyingi tashriflarda ustun allaqachon bor, hech
        // narsa qayta yozilmaydi — shu bilan "birinchi tashrif" ma'nosi
        // saqlanadi). Xato bo'lsa jim yutiladi — bu asosiy boot oqimini
        // hech qachon to'xtatmasin.
        if (!myShops.length) {
          // EdgeRuntime.waitUntil — javobni sekinlashtirmaydi (kutilmaydi),
          // lekin oddiy await'siz promise'dan farqli, isolate javobdan keyin
          // yopib qo'yilsa ham yozuv HAQIQATAN bajarilishini kafolatlaydi.
          // supabase-js insert() xato tashlamaydi (natija tekshirilmaydi) —
          // birinchi tashrifda qator yaratiladi, keyingilarida PK-konflikt
          // sabab yaratilmaydi, ikkalasi ham bizga bir xil natija.
          EdgeRuntime.waitUntil(db.from("platform_visitor_tracking").insert({ telegram_user_id: tgId }));
        }
        return json({
          isSuperAdmin: isPlatformSuperAdmin,
          authMode,
          platformActor: {
            accountId,
            displayName: verifiedDisplayName,
            telegramUserId: tgId,
            telegramLinked: true,
            platformRole: isPlatformSuperAdmin ? "SUPER_ADMIN" : "USER",
          },
          myShops,
          myRequests,
          lifecycleSettings,
          tariffs: (tariffRows || []).map((t: any) => ({
            id: t.id, name: t.name, price: Number(t.price), productLimit: t.product_limit, isPopular: t.is_popular === true,
            features: Array.isArray(t.features) ? t.features : [],
          })),
        });
      }

      case "platform_list_my_shops": {
        return json({ myShops: await listMyShops(db, tgId) });
      }

      case "platform_prepare_subscription_request": {
        // NEW_SHOP payment screen is resumable for one hour. This creates a
        // lightweight unpaid draft BEFORE the user leaves Telegram for
        // Click/Payme/Paynet, so Arizalarim can reopen the exact flow.
        await purgeExpiredPaymentDrafts(db);
        const kind = String(payload.kind || "");
        if (kind !== "NEW_SHOP") return json({ error: "draft_only_for_new_shop" }, 400);
        const tariffId = String(payload.tariffId || "");
        if (!tariffId) return json({ error: "tariff_id_required" }, 400);
        const billingPeriod = String(payload.billingPeriod || "monthly").toUpperCase();
        if (!["MONTHLY", "ANNUAL"].includes(billingPeriod)) return json({ error: "invalid_billing_period" }, 400);
        const { data: tariff, error: tariffErr } = await db.from("tariffs")
          .select("id,name,price,product_limit").eq("id", tariffId).eq("is_active", true).maybeSingle();
        if (tariffErr) throw tariffErr;
        if (!tariff) return json({ error: "tariff_not_found" }, 400);
        const requestedShopNameRaw = String(payload.shopName || "").trim().replace(/\s+/g, " ").slice(0, 80);
        const ownerRaw = String(payload.ownerTelegramId || tgId).replace(/\D/g, "").slice(0, 15);
        const requestedShopName = requestedShopNameRaw || null;
        const ownerTelegramId = /^\d{5,15}$/.test(ownerRaw) ? ownerRaw : String(tgId);
        // Draft-safe bot metadata: these are non-sensitive text fields and are
        // persisted with the one-hour NEW_SHOP draft so a background re-render,
        // Telegram WebView refresh or "Arizalarim" resume never wipes them.
        const requestedBotName = String(payload.botName || "").trim().replace(/\s+/g, " ").slice(0, 64) || null;
        const requestedBotBio = String(payload.botBio || "").trim().slice(0, 500) || null;
        const durationDays = billingPeriod === "ANNUAL" ? 365 : 30;
        const priceSnapshot = billingPeriod === "ANNUAL" ? Number(tariff.price) * 10 : Number(tariff.price);
        const requestedId = payload.requestId ? String(payload.requestId) : "";

        let existing: any = null;
        if (requestedId) {
          const { data } = await db.from("subscription_requests").select("*")
            .eq("id", requestedId).eq("requested_by_user_id", tgId).eq("kind", "NEW_SHOP").eq("status", "NEW")
            .is("payment_claimed_at", null).maybeSingle();
          existing = data || null;
        }
        if (!existing) {
          const { data } = await db.from("subscription_requests").select("*")
            .eq("requested_by_user_id", tgId).eq("kind", "NEW_SHOP").eq("status", "NEW")
            .is("payment_claimed_at", null).gt("payment_deadline_at", new Date().toISOString())
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          existing = data || null;
        }

        if (existing) {
          const deadline = existing.payment_deadline_at || new Date(new Date(existing.created_at).getTime() + 60 * 60 * 1000).toISOString();
          if (new Date(deadline).getTime() <= Date.now()) {
            await db.from("subscription_requests").delete().eq("id", existing.id);
            existing = null;
          } else {
            const { error: updErr } = await db.from("subscription_requests").update({
              owner_telegram_id: ownerTelegramId,
              requested_shop_name: requestedShopName,
              requested_bot_name: requestedBotName,
              requested_bot_bio: requestedBotBio,
              tariff_id: tariff.id,
              tariff_name_snapshot: tariff.name,
              tariff_price_snapshot: priceSnapshot,
              tariff_product_limit_snapshot: tariff.product_limit,
              billing_period: billingPeriod,
              duration_days: durationDays,
              payment_deadline_at: deadline,
              updated_at: new Date().toISOString(),
            }).eq("id", existing.id);
            if (updErr) throw updErr;
            return json({ ok: true, requestId: existing.id, paymentDeadlineAt: deadline, reused: true });
          }
        }

        const deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        const { data: inserted, error: insertErr } = await db.from("subscription_requests").insert({
          requester_telegram_id: tgId,
          requested_by_user_id: tgId,
          requester_username: payload.requesterUsername ? String(payload.requesterUsername).slice(0, 80) : null,
          requester_first_name: payload.requesterFirstName ? String(payload.requesterFirstName).slice(0, 120) : null,
          owner_telegram_id: ownerTelegramId,
          requested_shop_name: requestedShopName,
          requested_bot_name: requestedBotName,
          requested_bot_bio: requestedBotBio,
          kind: "NEW_SHOP",
          shop_id: null,
          tariff_id: tariff.id,
          tariff_name_snapshot: tariff.name,
          tariff_price_snapshot: priceSnapshot,
          tariff_product_limit_snapshot: tariff.product_limit,
          billing_period: billingPeriod,
          duration_days: durationDays,
          status: "NEW",
          payment_deadline_at: deadline,
        }).select("id,created_at").single();
        if (insertErr) throw insertErr;
        try {
          await appendSubscriptionRequestHistory(db, inserted.id, "PAYMENT_STARTED", "USER", tgId, {
            tariffId: tariff.id, billingPeriod, shopName: requestedShopName, ownerTelegramId,
          });
        } catch (e) { console.error("payment draft history error", e); }
        return json({ ok: true, requestId: inserted.id, paymentDeadlineAt: deadline, reused: false });
      }

      case "platform_submit_subscription_request": {
        // 5-band (Maxfiylik/shartlar): checkbox holatiga faqat frontendda
        // ishonilmaydi — server ham talab qiladi va TASHqi so'rov emas,
        // shu bitta chaqiruv ichida rozilikni yozadi.
        if (payload.consentAccepted !== true) return json({ error: "consent_required" }, 400);
        const webSubmissionKey = requestedClientMode === "web" ? String(payload.submissionKey || "") : null;
        const webSubmissionInput = [payload.kind||null,payload.shopId||null,payload.tariffId||null,payload.requestId||null,payload.billingPeriod||"monthly",payload.upgradeAction||null,payload.paymentMethod||null,payload.paymentMethodId||null,payload.shopName||null,payload.ownerTelegramId||null,payload.botName||null,payload.botBio||null];
        if (webSubmissionKey !== null) {
          if (!/^[a-zA-Z0-9:_-]{16,200}$/.test(webSubmissionKey)) return json({error:"invalid_submission_key"},400);
          const {data:prior,error:priorError}=await db.from("subscription_requests").select("id,status,web_submission_input,receipt_storage_path,payment_claimed_at").eq("requester_telegram_id",tgId).eq("web_submission_key",webSubmissionKey).maybeSingle();
          if(priorError)throw priorError;
          if(prior){if(JSON.stringify(prior.web_submission_input)!==JSON.stringify(webSubmissionInput))return json({error:"submission_payload_conflict"},409);return json({ok:true,requestId:prior.id,status:prior.status,replayed:true,hasReceipt:Boolean(prior.receipt_storage_path),paymentClaimedAt:prior.payment_claimed_at});}
        }
        const kind = String(payload.kind || "");
        if (kind !== "NEW_SHOP" && kind !== "UPGRADE") return json({ error: "invalid_kind" }, 400);
        const tariffId = String(payload.tariffId || "");
        if (!tariffId) return json({ error: "tariff_id_required" }, 400);

        let requestedShopName: string | null = null;
        let ownerTelegramId: string | null = null;
        if (kind === "NEW_SHOP") {
          requestedShopName = String(payload.shopName || "").trim().replace(/\s+/g, " ").slice(0, 80);
          ownerTelegramId = String(payload.ownerTelegramId || "").trim();
          if (requestedShopName.length < 2) return json({ error: "shop_name_required" }, 400);
          if (!/^\d{5,15}$/.test(ownerTelegramId)) return json({ error: "invalid_owner_telegram_id" }, 400);
        }

        let shopId: string | null = null;
        if (kind === "UPGRADE") {
          shopId = String(payload.shopId || "");
          if (!shopId) return json({ error: "shop_id_required" }, 400);
          // Mijoz aytgan shopId'ga ISHONILMAYDI — egalik shop_memberships'dan
          // server tomonida tekshiriladi.
          const { data: membership } = await db.from("shop_memberships")
            .select("shop_id").eq("shop_id", shopId).eq("telegram_user_id", tgId).eq("role", "OWNER").eq("status", "ACTIVE").maybeSingle();
          if (!membership) return json({ error: "not_shop_owner" }, 403);
        }

        const { data: tariff, error: tariffErr } = await db.from("tariffs")
          .select("id,name,price,product_limit").eq("id", tariffId).eq("is_active", true).maybeSingle();
        if (tariffErr) throw tariffErr;
        if (!tariff) return json({ error: "tariff_not_found" }, 400);

        const billingPeriod = String(payload.billingPeriod || "monthly").toUpperCase();
        if (billingPeriod !== "MONTHLY" && billingPeriod !== "ANNUAL") return json({ error: "invalid_billing_period" }, 400);
        const paymentMethod = String(payload.paymentMethod || "").toUpperCase();
        if (!["CARD", "CLICK", "PAYME", "PAYNET"].includes(paymentMethod)) return json({ error: "invalid_payment_method" }, 400);
        let paymentMethodId: string | null = null;
        if (paymentMethod !== "CARD") {
          paymentMethodId = payload.paymentMethodId ? String(payload.paymentMethodId) : null;
          if (!paymentMethodId) return json({ error: "payment_method_id_required" }, 400);
          const { data: configuredMethod, error: methodErr } = await db.from("platform_payment_methods")
            .select("id,method_type,is_active").eq("id", paymentMethodId).maybeSingle();
          if (methodErr) throw methodErr;
          if (!configuredMethod || configuredMethod.is_active !== true || configuredMethod.method_type !== paymentMethod) {
            return json({ error: "payment_method_not_available" }, 400);
          }
        } else {
          const { data: platformSettings, error: settingsErr } = await db.from("platform_settings")
            .select("payment_card_number,payment_card_active").eq("id", true).maybeSingle();
          if (settingsErr) throw settingsErr;
          if (!platformSettings?.payment_card_number || platformSettings.payment_card_active === false) {
            return json({ error: "payment_method_not_available" }, 400);
          }
        }
        const durationDays = billingPeriod === "ANNUAL" ? 365 : 30;
        const priceSnapshot = billingPeriod === "ANNUAL" ? Number(tariff.price) * 10 : Number(tariff.price);
        let upgradeAction: string | null = null;
        if (kind === "UPGRADE") {
          const requestedAction = String(payload.upgradeAction || "").toUpperCase();
          if (requestedAction === "EXTEND" || requestedAction === "CHANGE") upgradeAction = requestedAction;
          if (!upgradeAction) {
            const { data: currentSettings } = await db.from("shop_settings").select("tariff_id").eq("shop_id", shopId).maybeSingle();
            upgradeAction = currentSettings?.tariff_id === tariffId ? "EXTEND" : "CHANGE";
          }
        }

        if (webSubmissionKey !== null) {
          const values={kind,shop_id:shopId,tariff_id:tariff.id,tariff_name_snapshot:tariff.name,tariff_price_snapshot:priceSnapshot,tariff_product_limit_snapshot:tariff.product_limit,billing_period:billingPeriod,duration_days:durationDays,upgrade_action:upgradeAction,payment_method:paymentMethod,payment_method_id:paymentMethodId,owner_telegram_id:ownerTelegramId,requested_shop_name:requestedShopName,requested_bot_name:kind==="NEW_SHOP"?String(payload.botName||"").trim().slice(0,64)||null:null,requested_bot_bio:kind==="NEW_SHOP"?String(payload.botBio||"").trim().slice(0,500)||null:null};
          const {data:submitted,error:submitError}=await db.rpc("ustore_submit_web_subscription",{p_user:tgId,p_key:webSubmissionKey,p_input:webSubmissionInput,p_values:values,p_prepared_id:payload.requestId||null});
          if(submitError){const message=String(submitError.message||"");if(message.includes("conflict")||message==="request_already_pending"||message==="submission_draft_expired")return json({error:message},409);throw submitError;}
          if(!submitted.replayed){
            try{await appendSubscriptionRequestHistory(db,submitted.requestId,"REQUEST_SUBMITTED","USER",tgId,{kind,tariffId:tariff.id,billingPeriod,paymentMethod});await db.from("platform_consent_log").insert({user_telegram_id:tgId,shop_id:shopId,terms_version:TERMS_VERSION,privacy_version:PRIVACY_VERSION,source:`subscription_request:${kind}`});}catch(e){console.error("web submission history",e);}
          }
          return json({ok:true,...submitted});
        }

        await purgeExpiredPaymentDrafts(db);

        // NEW_SHOP may already have a one-hour unpaid draft created when the
        // payment screen opened. Final submission reuses that same row.
        const preparedRequestId = payload.requestId ? String(payload.requestId) : "";
        let preparedReq: any = null;
        if (preparedRequestId && kind === "NEW_SHOP") {
          const { data: prepared, error: preparedErr } = await db.from("subscription_requests").select("*")
            .eq("id", preparedRequestId).eq("requested_by_user_id", tgId).eq("kind", "NEW_SHOP").eq("status", "NEW").maybeSingle();
          if (preparedErr) throw preparedErr;
          if (!prepared) return json({ error: "payment_draft_not_found" }, 404);
          if (prepared.payment_claimed_at) return json({ error: "payment_already_claimed" }, 409);
          if (prepared.payment_deadline_at && new Date(prepared.payment_deadline_at).getTime() <= Date.now()) {
            await db.from("subscription_requests").delete().eq("id", prepared.id);
            return json({ error: "payment_draft_expired" }, 410);
          }
          preparedReq = prepared;
        }

        // Bitta odam bir xil (kind + do'kon) uchun ikkinchi kutilayotgan
        // submitted/reviewing request yubormasin. The current unpaid draft is
        // explicitly excluded.
        let dupQuery = db.from("subscription_requests").select("id")
          .eq("requester_telegram_id", tgId).eq("kind", kind).eq("status", "NEW");
        if (kind === "UPGRADE") dupQuery = dupQuery.eq("shop_id", shopId);
        if (preparedReq?.id) dupQuery = dupQuery.neq("id", preparedReq.id);
        if (kind === "NEW_SHOP") dupQuery = dupQuery.not("payment_claimed_at", "is", null);
        const { data: existingReq } = await dupQuery.limit(1).maybeSingle();
        if (existingReq) return json({ error: "request_already_pending" }, 409);

        // Chek ixtiyoriy; attached receipt itself is a user payment claim.
        const upload = payload.receiptImageUpload || null;
        const requesterUsername = payload.requesterUsername ? String(payload.requesterUsername).slice(0, 80) : null;
        const requesterFirstName = payload.requesterFirstName ? String(payload.requesterFirstName).slice(0, 120) : null;
        const paymentClaimedAt = upload ? new Date().toISOString() : null;
        const finalRequestedBotName = kind === "NEW_SHOP" ? (payload.botName ? String(payload.botName).trim().replace(/\s+/g, " ").slice(0, 64) : null) : null;
        const finalRequestedBotBio = kind === "NEW_SHOP" ? (payload.botBio ? String(payload.botBio).trim().slice(0, 500) : null) : null;

        let requestId: string;
        let requestWasNewlyInserted = false;
        if (preparedReq) {
          const { error: updateDraftErr } = await db.from("subscription_requests").update({
            requester_username: requesterUsername,
            requester_first_name: requesterFirstName,
            owner_telegram_id: ownerTelegramId,
            requested_shop_name: requestedShopName,
            requested_bot_name: kind === "NEW_SHOP" ? finalRequestedBotName : preparedReq.requested_bot_name,
            requested_bot_bio: kind === "NEW_SHOP" ? finalRequestedBotBio : preparedReq.requested_bot_bio,
            tariff_id: tariff.id,
            tariff_name_snapshot: tariff.name,
            tariff_price_snapshot: priceSnapshot,
            tariff_product_limit_snapshot: tariff.product_limit,
            billing_period: billingPeriod,
            duration_days: durationDays,
            payment_method: paymentMethod,
            payment_method_id: paymentMethodId,
            payment_claimed_at: paymentClaimedAt,
            updated_at: new Date().toISOString(),
          }).eq("id", preparedReq.id);
          if (updateDraftErr) throw updateDraftErr;
          requestId = String(preparedReq.id);
        } else {
          const { data: inserted, error: insertErr } = await db.from("subscription_requests").insert({
            requester_telegram_id: tgId, requested_by_user_id: tgId, requester_username: requesterUsername, requester_first_name: requesterFirstName,
            owner_telegram_id: ownerTelegramId, requested_shop_name: requestedShopName,
            requested_bot_name: kind === "NEW_SHOP" ? finalRequestedBotName : null, requested_bot_bio: kind === "NEW_SHOP" ? finalRequestedBotBio : null,
            kind, shop_id: shopId, tariff_id: tariff.id,
            tariff_name_snapshot: tariff.name, tariff_price_snapshot: priceSnapshot, tariff_product_limit_snapshot: tariff.product_limit,
            billing_period: billingPeriod, duration_days: durationDays, upgrade_action: upgradeAction,
            payment_method: paymentMethod, payment_method_id: paymentMethodId,
            payment_claimed_at: paymentClaimedAt,
            payment_deadline_at: kind === "NEW_SHOP" ? new Date(Date.now() + 60 * 60 * 1000).toISOString() : null,
          }).select("id").single();
          if (insertErr) throw insertErr;
          requestId = inserted.id;
          requestWasNewlyInserted = true;
        }

        try {
          // Drafts already have PAYMENT_STARTED; final submit adds the actual
          // application submission milestone once.
          if (requestWasNewlyInserted || !preparedReq?.payment_method) {
            await appendSubscriptionRequestHistory(db, requestId, "REQUEST_SUBMITTED", "USER", tgId, {
              kind, shopName: requestedShopName, ownerTelegramId, tariffId: tariff.id, billingPeriod, paymentMethod,
            });
          }
          if (paymentClaimedAt) await appendSubscriptionRequestHistory(db, requestId, "PAYMENT_CLAIMED", "USER", tgId, { source: "PAYMENT_PAGE" });
        } catch (e) { console.error("subscription request history insert error", e); }

        // Rozilik — audit uchun saqlanadi (jim yutiladi: so'rovning o'zi
        // consent yozuvi muvaffaqiyatsiz bo'lgani uchun to'xtab qolmasin,
        // lekin konsol logga chiqadi keyinroq tekshirish uchun).
        try {
          await db.from("platform_consent_log").insert({
            user_telegram_id: tgId, shop_id: shopId, terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION,
            source: `subscription_request:${kind}`,
          });
        } catch (e) { console.error("platform_consent_log insert error", e); }

        // Chek biriktirilgan bo'lsagina saqlanadi — ixtiyoriy bo'lgani uchun
        // bu butun blok endi shartli.
        let receiptPath: string | null = null;
        if (upload) {
          try {
            const stored = await storeSubscriptionReceipt(db, requestId, tgId, upload);
            receiptPath = stored.path;
          } catch (e: any) {
            // Newly inserted half-request is rolled back; a resumable unpaid
            // draft is kept so the user can choose another image and retry.
            if (requestWasNewlyInserted) await db.from("subscription_requests").delete().eq("id", requestId);
            return json({ error: e?.message === "receipt_too_large" ? "receipt_too_large" : "invalid_receipt_file" }, 400);
          }
          const receiptUploadedAt = new Date().toISOString();
          const { error: updateErr } = await db.from("subscription_requests").update({
            receipt_storage_path: receiptPath, receipt_uploaded_at: receiptUploadedAt, receipt_source: "PAYMENT_PAGE",
          }).eq("id", requestId);
          if (updateErr) throw updateErr;
          try { await appendSubscriptionRequestHistory(db, requestId, "RECEIPT_UPLOADED", "USER", tgId, { source: "PAYMENT_PAGE" }); }
          catch (e) { console.error("subscription receipt history insert error", e); }
        }

        // Bot nomi/bio/rasmi — FAQAT NEW_SHOP uchun va ixtiyoriy. Bu yerda
        // request bilan birga saqlanadi; admin bot tokenini ulagach
        // platform_provision_shop_from_request ularni Telegram Bot API orqali
        // avtomatik qo'llaydi (username esa ataylab o'zgartirilmaydi).
        if (kind === "NEW_SHOP") {
          const requestedBotName = finalRequestedBotName;
          const requestedBotBio = finalRequestedBotBio;
          const botPhotoUpload = payload.botPhotoUpload || null;
          let botPhotoPath: string | null = null;
          if (botPhotoUpload) {
            try {
              const stored = await storeSubscriptionReceipt(db, requestId, tgId, botPhotoUpload);
              botPhotoPath = stored.path;
            } catch (e: any) {
              return json({ error: e?.message === "receipt_too_large" ? "bot_photo_too_large" : "invalid_bot_photo_file" }, 400);
            }
          }
          if (requestedBotName || requestedBotBio || botPhotoPath) {
            const { error: botInfoErr } = await db.from("subscription_requests").update({
              requested_bot_name: requestedBotName,
              requested_bot_bio: requestedBotBio,
              bot_photo_storage_path: botPhotoPath,
              bot_photo_uploaded_at: botPhotoPath ? new Date().toISOString() : null,
            }).eq("id", requestId);
            if (botInfoErr) throw botInfoErr;
          }
        }

        EdgeRuntime.waitUntil((async () => {
          try {
            if (!SUPER_ADMIN_ID) return;
            // 25-band: spec'dagi aniq format — ism, tarif — narx, tur belgisi.
            const kindLabel = kind === "NEW_SHOP" ? "🆕 Yangi do'kon" : upgradeAction === "EXTEND" ? "🔁 Obunani uzaytirish" : "⬆️ Tarifni o'zgartirish";
            const periodLabel = billingPeriod === "ANNUAL" ? "Yillik (2 oy bepul)" : "Oylik";
            const ownerLine = kind === "NEW_SHOP" ? `\nDo'kon: ${requestedShopName}\nOwner Telegram ID: ${ownerTelegramId}` : "";
            const caption = `💳 Yangi obuna so'rovi\n${requesterFirstName || tgId}\n${tariff.name} — ${priceSnapshot} so'm\n${periodLabel}\n${kindLabel}${ownerLine}`;
            if (receiptPath) {
              const { data: signed } = await db.storage.from("payment-receipts").createSignedUrl(receiptPath, 300);
              if (signed?.signedUrl) await telegramApi(PLATFORM_BOT_TOKEN, "sendPhoto", { chat_id: SUPER_ADMIN_ID, photo: signed.signedUrl, caption });
            } else {
              // Chek yo'q — mijoz keyinroq "To'ladim" bosganda alohida xabar
              // boradi (platform_confirm_payment_claim), hozircha shunchaki
              // yangi so'rov borligini bildiradi.
              await telegramApi(PLATFORM_BOT_TOKEN, "sendMessage", { chat_id: SUPER_ADMIN_ID, text: `${caption}\n\n⏳ Chek hali biriktirilmagan.` });
            }
          } catch (e) { console.error("subscription request admin notify error", e); }
        })());

        return json({ ok: true, requestId, status: "NEW" });
      }

      // Chek biriktirmagan mijoz to'lovni amalga oshirgach shu action'ni
      // chaqiradi ("To'ladim" tugmasi). PUBLIC (super-admin talab qilinmaydi
      // — istalgan tasdiqlangan Telegram user chaqira oladi, xuddi
      // platform_record_consent kabi), lekin faqat O'ZINING so'rovini
      // da'vo qila oladi (requester_telegram_id server tomonda tekshiriladi,
      // mijoz aytgan requestId'ga ko'r-ko'rona ishonilmaydi). Vaqt HAR DOIM
      // server (CURRENT_TIMESTAMP), mijoz brauzeri yubormaydi/yubora olmaydi.
      case "platform_confirm_payment_claim": {
        const requestId = String(payload.requestId || "");
        if (!requestId) return json({ error: "request_id_required" }, 400);
        const { data: reqRow, error: reqErr } = await db.from("subscription_requests")
          .select("id,requester_telegram_id,status,payment_claimed_at,payment_deadline_at,tariff_name_snapshot,tariff_price_snapshot,payment_method")
          .eq("id", requestId).maybeSingle();
        if (reqErr) throw reqErr;
        if (!reqRow || String(reqRow.requester_telegram_id) !== String(tgId)) return json({ error: "not_found" }, 404);
        if (reqRow.status !== "NEW") return json({ error: "request_not_pending" }, 409);
        if (!reqRow.payment_claimed_at && reqRow.payment_deadline_at && new Date(reqRow.payment_deadline_at).getTime() <= Date.now()) {
          await db.from("subscription_requests").delete().eq("id", requestId).eq("status", "NEW").is("payment_claimed_at", null);
          return json({ error: "payment_draft_expired" }, 410);
        }
        let claimedAt = reqRow.payment_claimed_at;
        if (!claimedAt) {
          claimedAt = new Date().toISOString();
          const { data:claimed, error: updErr } = await db.from("subscription_requests").update({ payment_claimed_at: claimedAt }).eq("id", requestId).eq("status","NEW").is("payment_claimed_at",null).select("id").maybeSingle();
          if (updErr) throw updErr;
          if(!claimed){const {data:current}=await db.from("subscription_requests").select("payment_claimed_at").eq("id",requestId).maybeSingle();return current?.payment_claimed_at?json({ok:true,paymentClaimedAt:current.payment_claimed_at}):json({error:"request_not_pending"},409);}
          try { await appendSubscriptionRequestHistory(db, requestId, "PAYMENT_CLAIMED", "USER", tgId, {}); }
          catch (e) { console.error("payment claim history error", e); }
          EdgeRuntime.waitUntil((async () => {
            try {
              if (SUPER_ADMIN_ID) {
                await telegramApi(PLATFORM_BOT_TOKEN, "sendMessage", {
                  chat_id: SUPER_ADMIN_ID,
                  text: `🧾 To'lov tasdiqlandi (chek ixtiyoriy)\n${reqRow.tariff_name_snapshot} — ${reqRow.tariff_price_snapshot} so'm\nUsul: ${reqRow.payment_method || 'Noma’lum'}\nSo'rov ID: ${requestId}\nShu vaqt atrofidagi tushumni tekshiring; kerak bo'lsa chek so'rang.`,
                });
              }
            } catch (e) { console.error("payment claim notify error", e); }
          })());
        }
        return json({ ok: true, paymentClaimedAt: claimedAt });
      }

      // Admin uchun aksincha yo'nalish: chek biriktirilmagan so'rovni ko'rib,
      // kerak deb topsa mijozdan aniq so'raydi (bitta tugma, Telegram orqali
      // xabar). Vaqt server tomonda qayd etiladi — admin qachon so'raganini
      // keyin ko'rish uchun ("Chek talab qilindi" holati shu yerdan chiqadi).
      case "platform_request_receipt": {
        requirePlatformSuperAdmin();
        const requestId = String(payload.requestId || "");
        if (!requestId) return json({ error: "request_id_required" }, 400);
        const { data: reqRow, error: reqErr } = await db.from("subscription_requests")
          .select("id,status,requester_telegram_id,receipt_storage_path,payment_claimed_at").eq("id", requestId).maybeSingle();
        if (reqErr) throw reqErr;
        if (!reqRow) return json({ error: "request_not_found" }, 404);
        if (reqRow.status !== "NEW") return json({ error: "request_not_pending" }, 409);
        if (!reqRow.payment_claimed_at) return json({ error: "payment_not_claimed" }, 409);
        if (reqRow.receipt_storage_path) return json({ error: "receipt_already_attached" }, 409);
        const requestedAt = new Date().toISOString();
        const { error: updErr } = await db.from("subscription_requests").update({ receipt_requested_at: requestedAt }).eq("id", requestId);
        if (updErr) throw updErr;
        try { await appendSubscriptionRequestHistory(db, requestId, "RECEIPT_REQUESTED", "ADMIN", tgId, {}); }
        catch (e) { console.error("receipt request history error", e); }
        EdgeRuntime.waitUntil((async () => {
          try {
            await telegramApi(PLATFORM_BOT_TOKEN, "sendMessage", {
              chat_id: String(reqRow.requester_telegram_id),
              text: "📎 To'lovni tasdiqlash uchun chek kerak\n\nTo'lovingizni aniqlay olmadik. Tekshiruvni davom ettirish uchun to'lov chekini yuboring.\n\nUStorE Mini App → Arizalarim ichidan yoki shu botga chek rasmini yuborishingiz mumkin.",
            });
          } catch (e) { console.error("receipt request customer notify error", e); }
        })());
        return json({ ok: true, receiptRequestedAt: requestedAt });
      }

      // Mijoz tomonidan: admin "Chek so'rash" bosgan (yoki bosmagan bo'lsa
      // ham, o'zi xohlab) — chekni ALLAQACHON yaratilgan so'rovga keyinroq
      // biriktirish. platform_submit_subscription_request qayta chaqirilmaydi
      // (u "bitta kutilayotgan so'rov" dublikat-tekshiruvidan o'tolmaydi).
      // Chek biriktirilishi o'zi "to'ladim" da'vosi hisoblanadi — hali
      // qo'yilmagan bo'lsa payment_claimed_at ham shu yerda qo'yiladi.
      case "platform_attach_request_receipt": {
        const requestId = String(payload.requestId || "");
        if (!requestId) return json({ error: "request_id_required" }, 400);
        const { data: reqRow, error: reqErr } = await db.from("subscription_requests")
          .select("id,requester_telegram_id,requester_first_name,status,receipt_storage_path,payment_claimed_at,payment_deadline_at,kind,upgrade_action,billing_period,tariff_name_snapshot,tariff_price_snapshot,requested_shop_name")
          .eq("id", requestId).maybeSingle();
        if (reqErr) throw reqErr;
        if (!reqRow || String(reqRow.requester_telegram_id) !== String(tgId)) return json({ error: "not_found" }, 404);
        if (reqRow.status !== "NEW") return json({ error: "request_not_pending" }, 409);
        if (!reqRow.payment_claimed_at && reqRow.payment_deadline_at && new Date(reqRow.payment_deadline_at).getTime() <= Date.now()) {
          await db.from("subscription_requests").delete().eq("id", requestId).eq("status", "NEW").is("payment_claimed_at", null);
          return json({ error: "payment_draft_expired" }, 410);
        }
        if (reqRow.receipt_storage_path) return json({ error: "receipt_already_attached" }, 409);
        const upload = payload.receiptImageUpload;
        if (!upload) return json({ error: "receipt_required" }, 400);
        let receiptPath: string;
        try {
          const stored = await storeSubscriptionReceipt(db, requestId, tgId, upload);
          receiptPath = stored.path;
        } catch (e: any) {
          return json({ error: e?.message === "receipt_too_large" ? "receipt_too_large" : "invalid_receipt_file" }, 400);
        }
        const claimedAt = reqRow.payment_claimed_at || new Date().toISOString();
        const receiptSource = payload.source === "PAYMENT_PAGE" ? "PAYMENT_PAGE" : "MY_REQUESTS";
        const receiptUploadedAt = new Date().toISOString();
        const { data:attached, error: updErr } = await db.from("subscription_requests").update({
          receipt_storage_path: receiptPath, receipt_uploaded_at: receiptUploadedAt, payment_claimed_at: claimedAt, receipt_source: receiptSource,
        }).eq("id", requestId).eq("status","NEW").is("receipt_storage_path",null).select("id").maybeSingle();
        if (updErr) throw updErr;
        if(!attached){await db.storage.from("payment-receipts").remove([receiptPath]);return json({error:"receipt_already_attached"},409);}
        try {
          if (!reqRow.payment_claimed_at) await appendSubscriptionRequestHistory(db, requestId, "PAYMENT_CLAIMED", "USER", tgId, { source: receiptSource });
          await appendSubscriptionRequestHistory(db, requestId, "RECEIPT_UPLOADED", "USER", tgId, { source: receiptSource });
        } catch (e) { console.error("attach receipt history error", e); }
        EdgeRuntime.waitUntil((async () => {
          try {
            if (!SUPER_ADMIN_ID) return;
            const { data: signed } = await db.storage.from("payment-receipts").createSignedUrl(receiptPath, 300);
            if (!signed?.signedUrl) return;
            const kindLabel = reqRow.kind === "NEW_SHOP" ? "🆕 Yangi do'kon" : reqRow.upgrade_action === "EXTEND" ? "🔁 Obunani uzaytirish" : "⬆️ Tarifni o'zgartirish";
            const periodLabel = reqRow.billing_period === "ANNUAL" ? "Yillik (2 oy bepul)" : "Oylik";
            await telegramApi(PLATFORM_BOT_TOKEN, "sendPhoto", {
              chat_id: SUPER_ADMIN_ID, photo: signed.signedUrl,
              caption: `🧾 Chek biriktirildi · ${receiptSource === "MY_REQUESTS" ? "Arizalarim" : "To'lov oynasi"}\n${reqRow.requester_first_name || tgId}\n${reqRow.tariff_name_snapshot} — ${reqRow.tariff_price_snapshot} so'm\n${periodLabel}\n${kindLabel}${reqRow.requested_shop_name ? ` · ${reqRow.requested_shop_name}` : ""}\nSo'rov ID: ${requestId}`,
            });
          } catch (e) { console.error("attach receipt admin notify error", e); }
        })());
        return json({ ok: true, paymentClaimedAt: claimedAt });
      }

      case "platform_list_my_subscription_requests": {
        return json({ requests: await listMySubscriptionRequests(db, tgId, 100) });
      }

      case "platform_get_subscription_request_history": {
        const requestId = String(payload.requestId || "");
        if (!requestId) return json({ error: "request_id_required" }, 400);
        const { data: reqRow, error: reqErr } = await db.from("subscription_requests")
          .select(SUBSCRIPTION_REQUEST_SELECT).eq("id", requestId).maybeSingle();
        if (reqErr) throw reqErr;
        if (!reqRow) return json({ error: "request_not_found" }, 404);
        const requestedBy = String(reqRow.requested_by_user_id || reqRow.requester_telegram_id);
        if (!isPlatformSuperAdmin && requestedBy !== String(tgId)) return json({ error: "not_found" }, 404);
        const { data: historyRows, error: historyErr } = await db.from("subscription_request_history")
          .select("id,event_type,actor_type,actor_telegram_id,metadata,created_at")
          .eq("request_id", requestId).order("created_at", { ascending: true }).order("id", { ascending: true });
        if (historyErr) throw historyErr;
        return json({
          request: mapSubscriptionRequest(reqRow),
          history: (historyRows || []).map((h: any) => ({
            id: h.id, eventType: h.event_type, actorType: h.actor_type,
            actorTelegramId: h.actor_telegram_id == null ? null : String(h.actor_telegram_id),
            metadata: h.metadata || {}, createdAt: h.created_at,
          })),
        });
      }

      case "platform_list_subscription_requests": {
        requirePlatformSuperAdmin();
        await purgeExpiredPaymentDrafts(db);
        const status = payload.status ? String(payload.status) : null;
        let q = db.from("subscription_requests").select(SUBSCRIPTION_REQUEST_SELECT)
          .order("created_at", { ascending: false }).limit(200);
        if (status && ["NEW", "APPROVED", "REJECTED"].includes(status)) q = q.eq("status", status);
        const { data, error } = await q;
        if (error) throw error;
        return json({ requests: (data || []).map(mapSubscriptionRequest) });
      }

      case "platform_get_subscription_receipt_url": {
        requirePlatformSuperAdmin();
        const requestId = String(payload.requestId || "");
        const { data: reqRow, error: reqErr } = await db.from("subscription_requests").select("receipt_storage_path").eq("id", requestId).maybeSingle();
        if (reqErr) throw reqErr;
        if (!reqRow?.receipt_storage_path) return json({ error: "receipt_not_found" }, 404);
        const { data, error } = await db.storage.from("payment-receipts").createSignedUrl(reqRow.receipt_storage_path, 120);
        if (error) throw error;
        return json({ url: data.signedUrl });
      }

      // Do'kon egasi so'ragan bot rasmini admin ko'rishi uchun — xuddi
      // chekni ko'rish bilan bir xil naqsh (vaqtinchalik signed URL,
      // token/parol emas, shuning uchun xavfsizlik profili bir xil).
      case "platform_get_bot_photo_url": {
        requirePlatformSuperAdmin();
        const requestId = String(payload.requestId || "");
        const { data: reqRow, error: reqErr } = await db.from("subscription_requests").select("bot_photo_storage_path").eq("id", requestId).maybeSingle();
        if (reqErr) throw reqErr;
        if (!reqRow?.bot_photo_storage_path) return json({ error: "bot_photo_not_found" }, 404);
        const { data, error } = await db.storage.from("payment-receipts").createSignedUrl(reqRow.bot_photo_storage_path, 120);
        if (error) throw error;
        return json({ url: data.signedUrl });
      }

      case "platform_approve_subscription_request": {
        requirePlatformSuperAdmin();
        const requestId = String(payload.requestId || "");
        const { data: reqRow, error: reqErr } = await db.from("subscription_requests").select("*").eq("id", requestId).maybeSingle();
        if (reqErr) throw reqErr;
        if (!reqRow) return json({ error: "request_not_found" }, 404);
        // Idempotentlik — allaqachon tasdiqlangan/rad etilgan so'rov ikkinchi
        // marta ishlov berilmasin (UPGRADE'da bu real yon ta'sirga ega).
        if (reqRow.status !== "NEW") return json({ error: "request_not_pending" }, 409);
        if (!reqRow.payment_claimed_at) return json({ error: "payment_not_claimed" }, 409);

        const reviewedAt = new Date().toISOString();
        const { error: updErr } = await db.from("subscription_requests").update({
          status: "APPROVED", reviewed_at: reviewedAt, reviewed_by: tgId,
        }).eq("id", requestId);
        if (updErr) throw updErr;
        try { await appendSubscriptionRequestHistory(db, requestId, "PAYMENT_APPROVED", "ADMIN", tgId, {}); }
        catch (e) { console.error("approval history error", e); }

        let customerMessage: string;
        if (reqRow.kind === "UPGRADE") {
          const durationDays = Number(reqRow.duration_days || 30);
          const isExtend = reqRow.upgrade_action === "EXTEND";
          // 2026-08-28, 054-migratsiya: qiymat-asosli proratsiya — haqiqatan
          // to'langan summa (tariff_price_snapshot) uzatiladi, jonli tarif
          // narxi EMAS (keyin tarif narxi o'zgarsa ham bu to'lov o'zgarmaydi).
          const { bonusDaysApplied, expiresAt, convertedDays } = await applyTariffToShop(db, reqRow.shop_id, reqRow.tariff_id, {
            durationDays, billingPeriod: reqRow.billing_period, paidAmount: Number(reqRow.tariff_price_snapshot), isExtend, allowFirstBonus: true,
          });
          const periodLabel = reqRow.billing_period === "ANNUAL" ? "yillik" : "oylik";
          customerMessage = isExtend
            ? `✅ Obunangiz uzaytirildi (${periodLabel}).\nYangi tugash sanasi: ${new Date(expiresAt).toLocaleDateString("uz-UZ")}.`
            : bonusDaysApplied
              ? `🎉 Tarifingiz faollashdi: ${reqRow.tariff_name_snapshot}.\n🎁 Birinchi obunada +${bonusDaysApplied} kun bonus qo'shildi. Rahmat!`
              : `✅ ${reqRow.tariff_name_snapshot} tarifiga o'tdingiz.${convertedDays > 0 ? `\nEski tarifdan qolgan qiymat ${convertedDays} kunga aylantirilib, yangi muddatga qo'shildi.` : ''}\nYangi tugash sanasi: ${new Date(expiresAt).toLocaleDateString("uz-UZ")}.`;
        } else {
          customerMessage = "✅ To'lovingiz tasdiqlandi. Yangi do'konni yaratish bosqichi ochildi.";
        }
        EdgeRuntime.waitUntil((async () => {
          try {
            await telegramApi(PLATFORM_BOT_TOKEN, "sendMessage", { chat_id: String(reqRow.requester_telegram_id), text: customerMessage });
          } catch (e) { console.error("subscription approve customer notify error", e); }
        })());

        return json({ ok: true });
      }

      case "platform_reject_subscription_request": {
        requirePlatformSuperAdmin();
        const requestId = String(payload.requestId || "");
        const reason = String(payload.reason || "").trim().slice(0, 500);
        if (!reason) return json({ error: "reason_required" }, 400);
        const { data: reqRow, error: reqErr } = await db.from("subscription_requests").select("status,requester_telegram_id,payment_claimed_at").eq("id", requestId).maybeSingle();
        if (reqErr) throw reqErr;
        if (!reqRow) return json({ error: "request_not_found" }, 404);
        if (reqRow.status !== "NEW") return json({ error: "request_not_pending" }, 409);
        if (!reqRow.payment_claimed_at) return json({ error: "payment_not_claimed" }, 409);

        const { error } = await db.from("subscription_requests").update({
          status: "REJECTED", reject_reason: reason, reviewed_at: new Date().toISOString(), reviewed_by: tgId,
        }).eq("id", requestId);
        if (error) throw error;
        try { await appendSubscriptionRequestHistory(db, requestId, "REQUEST_REJECTED", "ADMIN", tgId, { reason }); }
        catch (e) { console.error("reject history error", e); }

        EdgeRuntime.waitUntil((async () => {
          try {
            await telegramApi(PLATFORM_BOT_TOKEN, "sendMessage", {
              chat_id: String(reqRow.requester_telegram_id),
              text: `❌ Obuna so'rovingiz rad etildi.\nSabab: ${reason}`,
            });
          } catch (e) { console.error("subscription reject customer notify error", e); }
        })());

        return json({ ok: true });
      }

      case "platform_provision_shop_from_request": {
        requirePlatformSuperAdmin();
        const requestId = String(payload.requestId || "");
        const botToken = String(payload.botToken || "").trim();
        if (!requestId) return json({ error: "request_id_required" }, 400);
        if (!botTokenLooksValid(botToken)) return json({ error: "invalid_bot_token_format" }, 400);

        const { data: reqRow, error: reqErr } = await db.from("subscription_requests")
          .select("*").eq("id", requestId).maybeSingle();
        if (reqErr) throw reqErr;
        if (!reqRow) return json({ error: "request_not_found" }, 404);
        if (reqRow.kind !== "NEW_SHOP") return json({ error: "not_new_shop_request" }, 409);
        if (reqRow.status !== "APPROVED") return json({ error: "payment_not_approved" }, 409);
        if (reqRow.applied_at) return json({ error: "shop_already_created", shopId: reqRow.applied_shop_id }, 409);
        const ownerTelegramId = String(reqRow.owner_telegram_id || "");
        const requestedShopName = String(reqRow.requested_shop_name || "").trim();
        if (!/^\d{5,15}$/.test(ownerTelegramId) || !requestedShopName) return json({ error: "request_provisioning_data_missing" }, 409);

        let me: any;
        try {
          const res = await telegramApi(botToken, "getMe", {});
          me = res.result;
        } catch (e) {
          console.error("platform_provision_shop_from_request getMe error", safeBotError(e));
          return json({ error: safeBotError(e) }, 400);
        }
        if (!me?.id) return json({ error: "invalid_bot_token" }, 400);
        const telegramBotId = String(me.id);

        const { ciphertext, iv } = await encryptBotToken(BOT_TOKEN_MASTER_KEY, botToken);
        const tokenLast4 = botToken.slice(-4);
        let shopId = reqRow.applied_shop_id ? String(reqRow.applied_shop_id) : "";
        let shopStatus: string | null = null;
        if (shopId) {
          const [{ data: shopRow }, { data: botRow }] = await Promise.all([
            db.from("shops").select("status").eq("id", shopId).maybeSingle(),
            db.from("shop_bots").select("telegram_bot_id").eq("shop_id", shopId).maybeSingle(),
          ]);
          if (!shopRow || String(botRow?.telegram_bot_id || "") !== telegramBotId) return json({ error: "provisioning_bot_mismatch" }, 409);
          shopStatus = shopRow.status;
        }

        if (!shopId) {
          const { data: provisionResult, error: provisionErr } = await db.rpc("ustore_create_shop_provisioning", {
            p_owner_telegram_id: ownerTelegramId,
            p_telegram_bot_id: telegramBotId,
            p_bot_username: me.username || null,
            p_bot_name: me.first_name || null,
            p_token_ciphertext: ciphertext,
            p_token_iv: iv,
            p_token_last4: tokenLast4,
          });
          if (provisionErr) {
            const m = String(provisionErr.message || "");
            if (m.includes("bot_already_connected")) return json({ error: "bot_already_connected" }, 409);
            throw provisionErr;
          }
          shopId = String(provisionResult.shopId);
          const { error: linkErr } = await db.from("subscription_requests")
            .update({ applied_shop_id: shopId }).eq("id", requestId).is("applied_at", null);
          if (linkErr) throw linkErr;
          shopStatus = "PROVISIONING";
        }

        const subdomain = await ensureShopSubdomain(db, shopId, requestedShopName);
        let botProfilePhotoSkipped = false;
        if (shopStatus !== "ACTIVE") {
          try {
            const profileSync = await syncRequestedBotProfile(db, botToken, reqRow, shopId);
            botProfilePhotoSkipped = profileSync.photoSkipped;
            await telegramApi(botToken, "setChatMenuButton", {
              menu_button: { type: "web_app", text: "Do'konni ochish", web_app: { url: `${SHOP_MINI_APP_BASE_URL}?bot_id=${encodeURIComponent(telegramBotId)}` } },
            });
            const secretToken = await telegramWebhookSecret(botToken);
            await telegramApi(botToken, "setWebhook", {
              url: `${SUPABASE_URL}/functions/v1/shop-api?bot_id=${encodeURIComponent(telegramBotId)}`,
              secret_token: secretToken,
              allowed_updates: ["message"],
              drop_pending_updates: false,
            });
          } catch (e) {
            console.error("request provisioning telegram/profile config error", safeBotError(e));
            return json({ ok: true, shopId, status: "PROVISIONING", error: "telegram_config_failed_retry_available" });
          }
          const { error: activateErr } = await db.from("shops").update({ status: "ACTIVE" }).eq("id", shopId);
          if (activateErr) throw activateErr;
        }

        const { error: nameErr } = await db.from("shop_settings").update({ name: requestedShopName }).eq("shop_id", shopId);
        if (nameErr) throw nameErr;

        const { data: existingSettings, error: settingsErr } = await db.from("shop_settings")
          .select("tariff_id,subscription_expires_at,current_period_bonus_days").eq("shop_id", shopId).maybeSingle();
        if (settingsErr) throw settingsErr;
        let bonusDaysApplied = Number(existingSettings?.current_period_bonus_days || 0);
        let expiresAt = existingSettings?.subscription_expires_at || null;
        if (!expiresAt) {
          const applied = await applyTariffToShop(db, shopId, reqRow.tariff_id, {
            durationDays: Number(reqRow.duration_days || 30),
            billingPeriod: reqRow.billing_period,
            paidAmount: Number(reqRow.tariff_price_snapshot),
            isExtend: false,
            allowFirstBonus: true,
          });
          bonusDaysApplied = applied.bonusDaysApplied;
          expiresAt = applied.expiresAt;
        } else if (String(existingSettings?.tariff_id || "") !== String(reqRow.tariff_id)) {
          return json({ error: "provisioned_shop_subscription_conflict" }, 409);
        }

        const appliedAt = new Date().toISOString();
        const { error: finalizeErr } = await db.from("subscription_requests").update({ applied_shop_id: shopId, applied_at: appliedAt }).eq("id", requestId);
        if (finalizeErr) throw finalizeErr;
        try {
          await appendSubscriptionRequestHistory(db, requestId, "SHOP_CREATED", "ADMIN", tgId, {
            shopId, shopName: requestedShopName, ownerTelegramId, telegramBotId, bonusDaysApplied, expiresAt,
            botProfileSynced: true, botProfilePhotoSkipped,
          });
        } catch (e) { console.error("shop created history error", e); }

        EdgeRuntime.waitUntil((async () => {
          try {
            await telegramApi(botToken, "sendMessage", {
              chat_id: ownerTelegramId,
              text: `🎉 ${requestedShopName} do'koni tayyor! /start tugmasini bosing.${bonusDaysApplied ? `\n🎁 +${bonusDaysApplied} kun bonus qo'shildi.` : ""}`,
            });
          } catch (e) { console.error("provisioned shop owner welcome error", e); }
          try {
            await telegramApi(PLATFORM_BOT_TOKEN, "sendMessage", {
              chat_id: ownerTelegramId,
              text: `✅ ${requestedShopName} UStorE Platform hisobingizga biriktirildi.${me.username ? `\nBot: @${me.username}` : ""}`,
            });
          } catch (e) { console.error("platform owner provision notify error", e); }
          const requestedBy = String(reqRow.requested_by_user_id || reqRow.requester_telegram_id);
          if (requestedBy !== ownerTelegramId) {
            try {
              await telegramApi(PLATFORM_BOT_TOKEN, "sendMessage", {
                chat_id: requestedBy,
                text: `✅ ${requestedShopName} do'koni yaratildi va Telegram ID ${ownerTelegramId} egasiga biriktirildi.`,
              });
            } catch (e) { console.error("requester provision notify error", e); }
          }
        })());

        return json({ ok: true, shopId, status: "ACTIVE", telegramBotId, subdomain, bonusDaysApplied, expiresAt, appliedAt, botProfileSynced: true, botProfilePhotoSkipped });
      }

      // Ikkalasida ham ishlatiladi: UPGRADE tasdiqlashda avtomatik (yuqorida),
      // va admin uchun alohida tugma — yangi ulangan do'konni tasdiqlangan
      // NEW_SHOP so'rovi tarifiga qo'lda bog'lash uchun.
      case "platform_apply_tariff": {
        requirePlatformSuperAdmin();
        const shopId = String(payload.shopId || "");
        const tariffId = String(payload.tariffId || "");
        if (!shopId || !tariffId) return json({ error: "shop_id_and_tariff_id_required" }, 400);
        let matchedNewShopRequest: any = null;
        try {
          const { data: owner } = await db.from("shop_memberships")
            .select("telegram_user_id").eq("shop_id", shopId).eq("role", "OWNER").eq("status", "ACTIVE").maybeSingle();
          if (owner?.telegram_user_id) {
            const { data: approvedRows } = await db.from("subscription_requests")
              .select("id,billing_period,duration_days,tariff_price_snapshot")
              .eq("requester_telegram_id", owner.telegram_user_id).eq("kind", "NEW_SHOP").eq("status", "APPROVED")
              .eq("tariff_id", tariffId).is("applied_at", null).order("created_at", { ascending: true }).limit(1);
            matchedNewShopRequest = approvedRows?.[0] || null;
          }
        } catch (e) { console.error("matching NEW_SHOP subscription request failed", e); }
        // Orqada turgan haqiqiy so'rov topilmasa (masalan admin to'g'ridan-
        // to'g'ri bog'lasa) — applyTariffToShop o'zi jonli tarif narxiga
        // qaytadi (funksiya ichidagi hujjatlashtirilgan fallback).
        const { bonusDaysApplied } = await applyTariffToShop(db, shopId, tariffId, {
          durationDays: Number(matchedNewShopRequest?.duration_days || 30),
          billingPeriod: matchedNewShopRequest?.billing_period,
          paidAmount: matchedNewShopRequest?.tariff_price_snapshot !== undefined ? Number(matchedNewShopRequest.tariff_price_snapshot) : undefined,
          isExtend: false, allowFirstBonus: true,
        });
        if (matchedNewShopRequest?.id) {
          await db.from("subscription_requests").update({ applied_shop_id: shopId, applied_at: new Date().toISOString() }).eq("id", matchedNewShopRequest.id);
        }
        const notifyCustomer = payload.notifyCustomer !== false;
        if (notifyCustomer) {
          notifyShopOwnerInBackground(db, PLATFORM_BOT_TOKEN, shopId, bonusDaysApplied
            ? `🎉 Do'koningiz tayyor! /start tugmasini bosing.\n🎁 Birinchi obunada +${bonusDaysApplied} kun bonus qo'shildi.`
            : "🎉 Tarifingiz faollashdi!");
        }
        return json({ ok: true });
      }

      // 2026-08-28, 054-migratsiya: "Plan change preview" (spec 7-bo'lim) —
      // to'lovga o'tishdan OLDIN mijozga "qolgan qiymatingiz X kunga
      // aylanadi, yangi tugash sanasi taxminan Y" ko'rsatish. HECH NARSA
      // YOZMAYDI (dry-run) — applyTariffToShop bilan bir xil formuladan
      // foydalanadi (previewTariffChange), shu bilan ikkalasi hech qachon
      // bir-biridan farqlanib qolmaydi. Mijoz o'z do'koni uchun so'raydi —
      // egalik shop_memberships orqali tekshiriladi (UPGRADE oqimidagi bir
      // xil naqsh), boshqa birovning do'koni uchun so'ralmaydi.
      case "platform_preview_tariff_change": {
        const shopId = String(payload.shopId || "");
        const tariffId = String(payload.tariffId || "");
        if (!shopId || !tariffId) return json({ error: "shop_id_and_tariff_id_required" }, 400);
        const { data: membership } = await db.from("shop_memberships")
          .select("shop_id").eq("shop_id", shopId).eq("telegram_user_id", tgId).eq("role", "OWNER").eq("status", "ACTIVE").maybeSingle();
        if (!membership) return json({ error: "not_shop_owner" }, 403);
        const { data: tariff, error: tariffErr } = await db.from("tariffs").select("price").eq("id", tariffId).eq("is_active", true).maybeSingle();
        if (tariffErr) throw tariffErr;
        if (!tariff) return json({ error: "tariff_not_found" }, 400);
        const billingPeriod = String(payload.billingPeriod || "monthly").toUpperCase() === "ANNUAL" ? "ANNUAL" : "MONTHLY";
        const durationDays = billingPeriod === "ANNUAL" ? 365 : 30;
        // Xuddi platform_submit_subscription_request bilan bir xil formula
        // (priceSnapshot) — preview haqiqiy to'lanadigan summani ko'rsatishi
        // kerak, boshqacha hisob-kitob ikkalasini drift qildirib qo'yadi.
        const paidAmount = billingPeriod === "ANNUAL" ? Number(tariff.price) * 10 : Number(tariff.price);
        const { data: currentSettings } = await db.from("shop_settings").select("tariff_id").eq("shop_id", shopId).maybeSingle();
        const isExtend = currentSettings?.tariff_id === tariffId;
        const preview = await previewTariffChange(db, shopId, tariffId, durationDays, paidAmount, isExtend);
        return json({ ...preview, paidAmount, durationDays, isExtend });
      }

      // Platform 2.0, Completion pass (2.4/section-6-band): "Faoliyat tarixi"
      // — REAL, mavjud audit jadvalidan (platform_admin_action_log, 017-
      // migratsiya) — yangi audit tizimi YARATILMAGAN, faqat o'qish uchun
      // qo'shimcha action. Fake/to'qib chiqarilgan faoliyat yo'q.
      case "platform_list_shop_admin_actions": {
        requirePlatformSuperAdmin();
        const shopId = String(payload.shopId || "");
        if (!shopId) return json({ error: "shop_id_required" }, 400);
        const { data, error } = await db.from("platform_admin_action_log")
          .select("id,admin_tg_id,action,details,created_at")
          .eq("shop_id", shopId).order("created_at", { ascending: false }).limit(30);
        if (error) throw error;
        return json({
          actions: (data || []).map((a: any) => ({ id: a.id, adminTgId: a.admin_tg_id, action: a.action, details: a.details || {}, createdAt: a.created_at })),
        });
      }

      case "platform_list_subscription_history": {
        requirePlatformSuperAdmin();
        const shopId = String(payload.shopId || "");
        if (!shopId) return json({ error: "shop_id_required" }, 400);
        const { data, error } = await db.from("subscription_history")
          .select("id,event_type,old_tariff_name,old_expires_at,new_tariff_name,new_expires_at,purchased_days,purchased_amount,billing_period,remaining_paid_days_before,remaining_value_converted,converted_days,bonus_days,created_at")
          .eq("shop_id", shopId).order("created_at", { ascending: false }).limit(50);
        if (error) throw error;
        return json({
          history: (data || []).map((h: any) => ({
            id: h.id, eventType: h.event_type, oldTariffName: h.old_tariff_name, oldExpiresAt: h.old_expires_at,
            newTariffName: h.new_tariff_name, newExpiresAt: h.new_expires_at, purchasedDays: h.purchased_days,
            purchasedAmount: Number(h.purchased_amount), billingPeriod: h.billing_period,
            remainingPaidDaysBefore: Number(h.remaining_paid_days_before), remainingValueConverted: Number(h.remaining_value_converted),
            convertedDays: h.converted_days, bonusDays: h.bonus_days, createdAt: h.created_at,
          })),
        });
      }

      // Platform 2.0, Completion pass (2.1-band): USER-tomonlama "To'lovlar
      // tarixi" — platform_list_subscription_history bilan AYNAN bir xil
      // jadval/ustun/mapping (kod DUPLIKATSIYA emas, faqat auth farqli):
      // super-admin emas, shop egasi (shop_memberships orqali, listMyShops()
      // bilan bir xil tekshiruv) o'z do'konining tarixini so'raydi.
      case "platform_list_my_subscription_history": {
        const shopId = String(payload.shopId || "");
        if (!shopId) return json({ error: "shop_id_required" }, 400);
        const { data: membership } = await db.from("shop_memberships")
          .select("shop_id").eq("shop_id", shopId).eq("telegram_user_id", tgId).eq("role", "OWNER").eq("status", "ACTIVE").maybeSingle();
        if (!membership) return json({ error: "forbidden" }, 403);
        const { data, error } = await db.from("subscription_history")
          .select("id,event_type,old_tariff_name,old_expires_at,new_tariff_name,new_expires_at,purchased_days,purchased_amount,billing_period,remaining_paid_days_before,remaining_value_converted,converted_days,bonus_days,created_at")
          .eq("shop_id", shopId).order("created_at", { ascending: false }).limit(50);
        if (error) throw error;
        return json({
          history: (data || []).map((h: any) => ({
            id: h.id, eventType: h.event_type, oldTariffName: h.old_tariff_name, oldExpiresAt: h.old_expires_at,
            newTariffName: h.new_tariff_name, newExpiresAt: h.new_expires_at, purchasedDays: h.purchased_days,
            purchasedAmount: Number(h.purchased_amount), billingPeriod: h.billing_period,
            remainingPaidDaysBefore: Number(h.remaining_paid_days_before), remainingValueConverted: Number(h.remaining_value_converted),
            convertedDays: h.converted_days, bonusDays: h.bonus_days, createdAt: h.created_at,
          })),
        });
      }

      // ---- Obuna hayot sikli: kun qo'shish/muzlatish/qayta faollashtirish/ -
      // ---- o'chirish (15/18/19-bandlar) -------------------------------------
      case "platform_grant_subscription_days": {
        requirePlatformSuperAdmin();
        const shopId = String(payload.shopId || "");
        const days = Math.trunc(Number(payload.days));
        const reason = String(payload.reason || "").trim().slice(0, 300);
        if (!shopId) return json({ error: "shop_id_required" }, 400);
        if (!Number.isFinite(days) || days <= 0 || days > 365) return json({ error: "invalid_days" }, 400);
        if (!reason) return json({ error: "reason_required" }, 400);

        const { data: settings, error: settingsErr } = await db.from("shop_settings")
          .select("subscription_expires_at").eq("shop_id", shopId).maybeSingle();
        if (settingsErr) throw settingsErr;
        const previousExpiry: string | null = settings?.subscription_expires_at || null;
        // Muddati allaqachon o'tgan bo'lsa, hozirdan boshlab hisoblanadi —
        // "o'tgan sanaga qo'shish" ma'nosiz bo'lardi.
        const baseMs = previousExpiry ? Math.max(new Date(previousExpiry).getTime(), Date.now()) : Date.now();
        const newExpiry = new Date(baseMs + days * 24 * 3600 * 1000).toISOString();
        const { error } = await db.from("shop_settings").update({ subscription_expires_at: newExpiry }).eq("shop_id", shopId);
        if (error) throw error;

        await logPlatformAdminAction(db, tgId, shopId, "GRANT_DAYS", { days, reason, previousExpiry, newExpiry });
        notifyShopOwnerInBackground(db, PLATFORM_BOT_TOKEN, shopId, `🎁 Obunangizga ${days} kun qo'shildi.\nSabab: ${reason}`);
        return json({ ok: true, newExpiry });
      }

      case "platform_create_shop_backup": {
        requirePlatformSuperAdmin();
        const shopId = String(payload.shopId || "");
        if (!shopId) return json({ error: "shop_id_required" }, 400);
        try {
          const backup = await createShopBackupArchive(db, shopId, tgId);
          return json({ ok: true, backupId: backup.id, downloadUrl: backup.url, sizeBytes: backup.sizeBytes, rowCount: backup.rowCount, fileCount: backup.fileCount, expiresIn: 3600 });
        } catch (e) {
          console.error("[SHOP_BACKUP_CREATE_FAILED]", { shopId, message: (e as any)?.message || e });
          return json({ error: String((e as any)?.message || e).includes("backup_too_large") ? "backup_too_large" : "backup_create_failed" }, 500);
        }
      }

      case "platform_prepare_shop_restore_upload": {
        requirePlatformSuperAdmin();
        const size = Number(payload.size || 0);
        if (!Number.isFinite(size) || size <= 0 || size > 500 * 1024 * 1024) return json({ error: "backup_too_large" }, 400);
        const path = `platform/restore-uploads/${tgId}/${crypto.randomUUID()}.zip`;
        const { data, error } = await db.storage.from(SHOP_BACKUP_BUCKET).createSignedUploadUrl(path);
        if (error || !data?.token) throw error || new Error("backup_upload_url_failed");
        return json({ path, token: data.token });
      }

      case "platform_restore_shop_backup": {
        requirePlatformSuperAdmin();
        const uploadPath = String(payload.uploadPath || "");
        const expectedPrefix = `platform/restore-uploads/${tgId}/`;
        if (!uploadPath.startsWith(expectedPrefix) || !/^[0-9a-f-]{36}\.zip$/i.test(uploadPath.slice(expectedPrefix.length))) return json({ error: "invalid_backup_upload_path" }, 400);
        try {
          const restored = await restoreShopBackupArchive(db, uploadPath, tgId);
          return json({ ok: true, shopId: restored.shopId, fileCount: restored.fileCount, status: "PROVISIONING", requiresReconnect: true });
        } catch (e) {
          console.error("[SHOP_BACKUP_RESTORE_FAILED]", { uploadPath, message: (e as any)?.message || e });
          const raw = String((e as any)?.message || e);
          if (raw.includes("shop_already_exists")) return json({ error: "shop_already_exists" }, 409);
          if (raw.includes("invalid_backup") || raw.includes("unsupported_backup") || raw.includes("backup_shop")) return json({ error: "invalid_backup_zip" }, 400);
          return json({ error: "backup_restore_failed" }, 500);
        }
      }

      case "platform_freeze_shop": {
        requirePlatformSuperAdmin();
        const shopId = String(payload.shopId || "");
        const reason = String(payload.reason || "").trim().slice(0, 300);
        if (!shopId) return json({ error: "shop_id_required" }, 400);
        if (!reason) return json({ error: "reason_required" }, 400);

        const lifecycle = await loadLifecycleSettings(db);
        const { data: frozen, error: freezeError } = await db.rpc("ustore_freeze_shop", {
          p_shop_id: shopId, p_reason: reason, p_retention_days: lifecycle.retentionDays,
        });
        if (freezeError) {
          const message = String(freezeError.message || "");
          if (message.includes("shop_not_found")) return json({ error: "shop_not_found" }, 404);
          if (message.includes("shop_already")) return json({ error: message.includes("terminated") ? "shop_already_terminated" : "shop_already_frozen" }, 409);
          throw freezeError;
        }
        await logPlatformAdminAction(db, tgId, shopId, "FREEZE", { reason, previousStatus: frozen.previousStatus, newStatus: "FROZEN", frozenDeleteAt: frozen.frozenDeleteAt });
        notifyLifecycleOwnerInBackground(db, PLATFORM_BOT_TOKEN, shopId, "FROZEN", {
          SHOP_NAME: frozen?.name || "Do'koningiz",
          REASON: reason,
          ACTION: lifecycle.freezeActionText,
        });
        return json({ ok: true });
      }

      // Lifecycle round: bitta muzlatilgan do'kon uchun grace-muddatni
      // (ma'lumot saqlanadigan/o'chirilishigacha bo'lgan davr) uzaytirish —
      // platform_grant_subscription_days'dan MUSTAQIL (u subscription_expires_at,
      // ya'ni tarif/to'lov muddatini uzaytiradi — bu ikkalasi boshqa-boshqa
      // narsa). frozen_at "muzlatish soatining boshlanish nuqtasi" sifatida
      // qayta ishlatiladi — oldinga surilsa, platform-subscription-cron'dagi
      // graceDeadlineIso (=frozen_at+retention_days) ham shunga mos oldinga
      // suriladi. Asl muzlatish voqeasi platform_admin_action_log'da
      // (FREEZE yozuvi) saqlanib qoladi — yo'qolmaydi.
      case "platform_extend_frozen_grace": {
        requirePlatformSuperAdmin();
        const shopId = String(payload.shopId || "");
        const days = Math.trunc(Number(payload.days));
        const reason = String(payload.reason || "").trim().slice(0, 300);
        if (!shopId) return json({ error: "shop_id_required" }, 400);
        if (!Number.isFinite(days) || days <= 0 || days > 365) return json({ error: "invalid_days" }, 400);

        const { data: extended, error: extendError } = await db.rpc("ustore_extend_frozen_deadline", { p_shop_id: shopId, p_days: days });
        if (extendError) {
          const message = String(extendError.message || "");
          if (message.includes("shop_not_found")) return json({ error: "shop_not_found" }, 404);
          if (message.includes("shop_not_frozen")) return json({ error: "shop_not_frozen" }, 409);
          throw extendError;
        }
        await logPlatformAdminAction(db, tgId, shopId, "EXTEND_FROZEN_GRACE", { days, reason: reason || null, previousDeadline: extended.previousDeadline, newDeadline: extended.newDeadline });
        notifyLifecycleOwnerInBackground(db, PLATFORM_BOT_TOKEN, shopId, "GRACE_EXTENDED", {
          SHOP_NAME: extended?.name || "Do'koningiz",
          DAYS: String(days),
        });
        // Bu do'kon uchun ochiq turgan "muddat tugadi" vazifasi (agar bor
        // bo'lsa) endi hal qilindi — shop TERMINATE emas, davom etadi.
        // Xato bo'lsa ham (masalan hech qanday ochiq vazifa bo'lmasa)
        // asosiy oqim to'xtamaydi — bu shunchaki tozalash.
        try {
          await db.from("platform_admin_tasks").update({
            resolved_at: new Date().toISOString(), resolved_action: "EXTENDED", resolved_by: tgId,
          }).eq("shop_id", shopId).eq("type", "FREEZE_EXPIRED").is("resolved_at", null);
        } catch (e) { console.error("[EXTEND_GRACE_TASK_RESOLVE_FAILED]", { shopId, message: (e as any)?.message || e }); }
        return json({ ok: true, newFrozenAt: extended.newDeadline, newDeadline: extended.newDeadline });
      }

      case "platform_reactivate_shop": {
        requirePlatformSuperAdmin();
        const shopId = String(payload.shopId || "");
        if (!shopId) return json({ error: "shop_id_required" }, 400);

        const { data: reactivated, error: reactivateError } = await db.rpc("ustore_reactivate_shop", { p_shop_id: shopId });
        if (reactivateError) {
          const message = String(reactivateError.message || "");
          if (message.includes("shop_not_found")) return json({ error: "shop_not_found" }, 404);
          if (message.includes("shop_not_frozen")) return json({ error: "shop_not_frozen" }, 409);
          throw reactivateError;
        }

        await logPlatformAdminAction(db, tgId, shopId, "REACTIVATE", { previousStatus: "FROZEN", newStatus: "ACTIVE" });
        notifyLifecycleOwnerInBackground(db, PLATFORM_BOT_TOKEN, shopId, "REACTIVATED", {
          SHOP_NAME: reactivated?.name || "Do'koningiz",
          REASON: "",
          ACTION: "",
        });
        return json({ ok: true });
      }

      // Ma'lumot darhol o'chirilmaydi — faqat status TERMINATED bo'ladi
      // (haqiqiy o'chirish/anonimizatsiya keyingi, alohida jarayon).
      // Lifecycle round v2 (2026-09-06, foydalanuvchi talabi): TERMINATE
      // endi "status=TERMINATED, ma'lumot saqlanadi" DEGAN EMAS — do'konning
      // BARCHA ma'lumoti (mahsulot/buyurtma/mijoz/banner/sozlama/bot
      // ulanishi/egalik) Supabase'dan BUTUNLAY o'chiriladi, va bot Telegram
      // ID'si SHU ZAHOTI bo'shab, xohlagan admin uni yangi do'kon sifatida
      // qayta ulay oladi (avval shop_bots qatori DISABLED holda qolar,
      // unique cheklov bot ID'sini abadiy "band" qilib turardi — bu haqiqiy
      // ishlatishda topilgan bug, endi tuzatildi). Yagona qoladigan iz —
      // do'kon egasiga boradigan bitta Telegram xabari (nima uchun
      // uzilgani bilan) — platform_admin_action_log/subscription_requests
      // kabi PLATFORMA darajasidagi audit jadvallari shop_id'ni "on delete
      // set null" bilan saqlaydi (bu ATAYLAB — audit tarixi yo'qolmasin),
      // lekin do'konning O'ZIGA tegishli hech narsa qolmaydi.
      case "platform_terminate_shop": {
        requirePlatformSuperAdmin();
        const shopId = String(payload.shopId || "");
        const reason = String(payload.reason || "").trim().slice(0, 300);
        if (!shopId) return json({ error: "shop_id_required" }, 400);
        if (!reason) return json({ error: "reason_required" }, 400);

        const { data: shopRow, error: shopErr } = await db.from("shops").select("status,public_code").eq("id", shopId).maybeSingle();
        if (shopErr) throw shopErr;
        if (!shopRow) return json({ error: "shop_not_found" }, 404);
        if (shopRow.status === "TERMINATED") return json({ error: "shop_already_terminated" }, 409);
        const previousStatus = shopRow.status;

        // Write-lock: purge boshlanishi bilanoq (eng birinchi ish sifatida)
        // status 'TERMINATING'ga o'tkaziladi — resolveShopContext() HAR
        // QANDAY status!=='ACTIVE'ni allaqachon bloklaydi, shuning uchun
        // bu bitta qator kodni o'zgartirmasdan shu do'konga yangi
        // buyurtma/mahsulot/sozlama yozuvlari kelib qolishining oldini
        // oladi. Muvaffaqiyatli purge oxirida shop qatorining o'zi
        // butunlay o'chadi — bu holat "doimiy" emas, faqat o'tish bosqichi
        // (agar pastda biror joyda xato chiqsa, admin "O'chirish"ni qayta
        // bossa, xuddi shu jarayon xavfsiz qaytadan boshlanadi).
        const { error: lockErr } = await db.from("shops").update({ status: "TERMINATING" }).eq("id", shopId);
        if (lockErr) throw lockErr;

        // Purge'dan OLDIN kerak bo'ladigan hamma narsa (nom, egasi) shu
        // yerda o'qib olinadi — shop_settings/shop_memberships pastda
        // butunlay o'chadi.
        const { data: settingsRow } = await db.from("shop_settings").select("name").eq("shop_id", shopId).maybeSingle();
        const shopName = settingsRow?.name || null;
        const { data: ownerMembership } = await db.from("shop_memberships")
          .select("telegram_user_id").eq("shop_id", shopId).eq("role", "OWNER").eq("status", "ACTIVE").maybeSingle();
        const ownerTelegramId = ownerMembership?.telegram_user_id ? String(ownerMembership.telegram_user_id) : null;

        const lifecycle = await loadLifecycleSettings(db);
        await logPlatformAdminAction(db, tgId, shopId, "TERMINATE", { reason, previousStatus, shopName, ownerTelegramId });

        // O'chirishdan OLDIN avtomatik, yuklab olinadigan to'liq ZIP nusxa.
        // Secret/tokenlar backup SQL funksiyasida ataylab chiqarilmaydi.
        let deletionBackup: { id: string; path: string; url: string; sizeBytes: number; rowCount: number; fileCount: number };
        try {
          deletionBackup = await createShopBackupArchive(db, shopId, tgId);
        } catch (backupError) {
          await db.from("shops").update({ status: previousStatus }).eq("id", shopId).eq("status", "TERMINATING");
          console.error("[TERMINATE_BACKUP_FAILED]", { shopId, message: (backupError as any)?.message || backupError });
          return json({ error: "backup_create_failed_before_delete" }, 502);
        }

        // Xabar MUQARRAR shu yerda, purge'dan OLDIN, va AWAIT bilan
        // yuboriladi (odatdagi fire-and-forget EMAS) — chunki
        // platform_lifecycle_notification_log.shop_id "not null references
        // shops(id)" — agar bu pastdagi purge'dan KEYIN (fon rejimida)
        // yozilsa, shopId endi mavjud bo'lmagani uchun xato beradi.
        await sendLifecycleNotification(db, PLATFORM_BOT_TOKEN, shopId, "TERMINATED", {
          SHOP_NAME: shopName || "Do'koningiz",
          REASON: reason,
          ACTION: lifecycle.supportUrl ? `${lifecycle.supportLabel}: ${lifecycle.supportUrl}` : lifecycle.supportLabel,
        }, ownerTelegramId || undefined);

        // Bot Telegram tomonda ham "tozalanadi" (webhook o'chadi, menyu
        // tugmasi standartga qaytadi) — BEST-EFFORT, xato bo'lsa ham
        // pastdagi purge davom etadi (Telegram'ning o'zi ishlamay qolishi
        // do'kon ma'lumotini o'chirishga to'sqinlik qilmasligi kerak).
        try {
          const { data: botRow } = await db.from("shop_bots")
            .select("token_ciphertext,token_iv").eq("shop_id", shopId).maybeSingle();
          if (botRow) {
            const botToken = await decryptBotToken(BOT_TOKEN_MASTER_KEY, botRow.token_ciphertext, botRow.token_iv);
            await telegramApi(botToken, "deleteWebhook", {});
            await telegramApi(botToken, "setChatMenuButton", { menu_button: { type: "default" } });
          }
        } catch (e) {
          console.error("[TERMINATE_BOT_TEARDOWN_FAILED]", { shopId, message: (e as any)?.message || e });
        }

        // Supabase Storage'dagi fayllar (logotip/katalog/variant/banner/
        // start-rasm/chek/hisobot) — BEST-EFFORT, DB transaction ichida
        // emas (Storage API SQL emas). Xato bo'lsa ham pastdagi DB purge
        // baribir davom etadi — ikkalasi orasidagi mos kelmaslik xavfini
        // minimal qilish uchun bu DOIM DB purge'dan OLDIN ishga tushadi
        // (agar avval DB o'chirilib, keyin Storage muvaffaqiyatsiz bo'lsa,
        // "qaysi shopga tegishli edi" degan ma'lumot allaqachon yo'qolgan
        // bo'lardi — bu tartib shu holatni oldini oladi).
        let storageCleanup: Record<string, number>;
        try {
          storageCleanup = await purgeShopStorageFiles(db, shopId);
        } catch (storageError) {
          await db.from("shops").update({ status: previousStatus }).eq("id", shopId).eq("status", "TERMINATING");
          return json({ error: "storage_cleanup_failed", detail: String((storageError as any)?.message || storageError) }, 502);
        }

        // Haqiqiy, to'liq DB tozalash — RESET_TEST_SHOPS_EXCEPT_FITCORE.sql'da
        // tasdiqlangan xuddi shu texnika (070-migratsiya), endi qayta
        // ishlatiladigan RPC sifatida: mazmun-jadvallari (composite FK'lar
        // tufayli tartib muammosi bo'lmasligi uchun trigger'lari vaqtincha
        // o'chirilib) tozalanadi, so'ng bot/egalik/do'konning o'zi ham
        // o'chiriladi — shop_bots o'chishi bilan Telegram bot ID'si DARHOL
        // bo'shaydi. Bitta RPC chaqiruvi — Postgres funksiyasi ichida
        // xato chiqsa, chaqiruvchi statement (shu bitta .rpc() so'rovi)
        // BUTUNLAY bekor qilinadi (hech qanday "yarim purge" qolmaydi).
        // platform_admin_tasks'dagi shu do'konga tegishli hal qilinmagan
        // vazifa ham shu bilan birga avtomatik o'chadi (shop_id ON DELETE
        // CASCADE) — alohida "resolve" chaqiruvi shart emas.
        const { data: deletionArchiveId, error: purgeErr } = await db.rpc("ustore_purge_shop_completely", {
          p_shop_id: shopId,
          p_reason: reason,
          p_admin_tg_id: tgId,
          p_shop_name: shopName,
          p_public_code: shopRow.public_code || null,
          p_owner_tg_id: ownerTelegramId,
          p_previous_status: previousStatus,
          p_storage_cleanup: storageCleanup,
          p_backup_id: deletionBackup.id,
        });
        if (purgeErr) throw purgeErr;

        return json({ ok: true, storageCleanup, deletionArchiveId, backupId: deletionBackup.id, backupDownloadUrl: deletionBackup.url, backupSizeBytes: deletionBackup.sizeBytes, backupExpiresIn: 3600 });
      }

      // ---- Rozilik auditi (Foydalanish shartlari + Maxfiylik siyosati) ------
      // Ochiq — istalgan tasdiqlangan Telegram foydalanuvchi chaqiradi, super
      // admin talab qilinmaydi. platform_submit_subscription_request ichida
      // ham serverga tekshirib ko'rilishi uchun chaqiriladi (faqat frontend
      // checkbox'iga ishonilmaydi).
      case "platform_record_consent": {
        const shopId = payload.shopId ? String(payload.shopId) : null;
        const source = payload.source ? String(payload.source).slice(0, 80) : null;
        const telegramPlatformInfo = payload.telegramPlatformInfo ? String(payload.telegramPlatformInfo).slice(0, 200) : null;
        const { error } = await db.from("platform_consent_log").insert({
          user_telegram_id: tgId, shop_id: shopId, terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION,
          source, telegram_platform_info: telegramPlatformInfo,
        });
        if (error) throw error;
        return json({ ok: true, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION });
      }

      case "platform_admin_dashboard_summary": {
        requirePlatformSuperAdmin();
        const now = Date.now();
        const nowIso = new Date(now).toISOString();
        const expiringThreshold7d = new Date(now + 7 * 24 * 3600 * 1000).toISOString();
        const expiringThreshold3d = new Date(now + 3 * 24 * 3600 * 1000).toISOString();
        const provisioningStuckThreshold = new Date(now - 1 * 3600 * 1000).toISOString();
        const [
          { count: activeShopsCount },
          { count: newRequestsCount },
          { count: expiringSoonCount },
          { count: expiredCount },
          { data: ownerRows },
          { data: recentShops },
          { data: newRequestRows },
          { data: expiringSoonRows },
          { data: stuckProvisioningRows },
          { data: freezeExpiredTaskRows },
          { count: supportOpenCount },
          { data: supportOpenRows },
          { count: awaitingBotConnectCount },
        ] = await Promise.all([
          db.from("shops").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
          db.from("subscription_requests").select("id", { count: "exact", head: true }).eq("status", "NEW"),
          db.from("shop_settings").select("shop_id", { count: "exact", head: true })
            .not("subscription_expires_at", "is", null).lte("subscription_expires_at", expiringThreshold7d).gte("subscription_expires_at", nowIso),
          // "Muddati tugagan" — real status=FROZEN sanog'i (cron obuna
          // muddati o'tganda avtomatik shu holatga o'tkazadi, 17-band).
          db.from("shops").select("id", { count: "exact", head: true }).eq("status", "FROZEN"),
          // "Jami foydalanuvchi" = do'kon egalarining o'zi (tanlangan metrika
          // — har bir do'konning ICHKI app_users'ini yig'ish emas, bu shop
          // darajasidagi biznes ma'lumot, platforma o'qimasligi kerak).
          db.from("shop_memberships").select("telegram_user_id").eq("role", "OWNER").eq("status", "ACTIVE"),
          db.from("shops").select("id,public_code,status,created_at").order("created_at", { ascending: false }).limit(10),
          // ---- "Diqqat talab qiladi" ro'yxati uchun ----------------------
          db.from("subscription_requests").select("id,requester_first_name,tariff_name_snapshot,kind").eq("status", "NEW").order("created_at", { ascending: true }).limit(20),
          db.from("shop_settings").select("shop_id,subscription_expires_at")
            .not("subscription_expires_at", "is", null).lte("subscription_expires_at", expiringThreshold3d).gte("subscription_expires_at", nowIso),
          db.from("shops").select("id,public_code").eq("status", "PROVISIONING").lte("created_at", provisioningStuckThreshold),
          // Lifecycle round v2: bu ENDI live-hisoblangan chegara emas —
          // idempotent, PERSISTED vazifalar (platform_admin_tasks,
          // 071-migratsiya) ro'yxati. platform-subscription-cron do'kon
          // muzlatish muddati tugaganda BIR MARTA shu turdagi vazifani
          // yaratadi (scheduler necha marta ishlasa ham, qisman UNIQUE
          // indeks tufayli takrorlanmaydi); admin "O'chirish" yoki
          // "Muddatni uzaytirish"ni tanlagach, vazifa hal qilingan deb
          // belgilanadi (yoki TERMINATE'da shop butunlay o'chib, vazifa
          // ham cascade bilan ketadi).
          db.from("platform_admin_tasks").select("shop_id,created_at").eq("type", "FREEZE_EXPIRED").is("resolved_at", null),
          // Platform 2.0, Bosqich 2 (spec 34-band): "Support" — Action
          // Required'ning 4 ta turkumidan biri. Faqat javob KUTAYOTGAN
          // (OPEN) murojaatlar — ANSWERED/CLOSED admin uchun endi harakat
          // talab qilmaydi.
          db.from("platform_support_tickets").select("id", { count: "exact", head: true }).eq("status", "OPEN"),
          db.from("platform_support_tickets").select("id,subject,type,requester_first_name,requester_username").eq("status", "OPEN").order("id", { ascending: true }).limit(20),
          // "Bot ulash" — to'lovi tasdiqlangan, lekin hali do'kon/bot
          // ulanmagan arizalar (mapSubscriptionRequest'dagi awaitingProvisioning
          // bilan AYNAN bir xil shart — bu yerda faqat sanoq uchun).
          db.from("subscription_requests").select("id", { count: "exact", head: true }).eq("kind", "NEW_SHOP").eq("status", "APPROVED").is("applied_at", null),
        ]);
        const totalUsersCount = new Set((ownerRows || []).map((r: any) => String(r.telegram_user_id))).size;

        // "Diqqat talab qiladi" — yangi to'lov / obunasi tugayotgan shop /
        // PROVISIONING'da qotib qolgan / muzlatish muddati tugagan.
        const attentionItems: any[] = [];
        for (const r of newRequestRows || []) {
          attentionItems.push({ type: "NEW_REQUEST", requestId: r.id, label: r.requester_first_name || "Foydalanuvchi", detail: `${r.kind === "NEW_SHOP" ? "Yangi do'kon" : "Tarif oshirish"} — ${r.tariff_name_snapshot}` });
        }
        if ((expiringSoonRows || []).length) {
          const shopIds = (expiringSoonRows || []).map((r: any) => r.shop_id);
          const { data: codes } = await db.from("shops").select("id,public_code").in("id", shopIds);
          const codeById = new Map((codes || []).map((s: any) => [s.id, s.public_code]));
          for (const r of expiringSoonRows || []) {
            attentionItems.push({ type: "EXPIRING_SOON", shopId: r.shop_id, label: codeById.get(r.shop_id) || r.shop_id, detail: `Tugaydi: ${r.subscription_expires_at}` });
          }
        }
        for (const s of stuckProvisioningRows || []) {
          attentionItems.push({ type: "STUCK_PROVISIONING", shopId: s.id, label: s.public_code, detail: "Sozlanmoqda holatida qotib qolgan" });
        }
        for (const t of supportOpenRows || []) {
          attentionItems.push({ type: "SUPPORT_WAITING", ticketId: t.id, label: t.requester_first_name || (t.requester_username ? `@${t.requester_username}` : "Foydalanuvchi"), detail: `${t.type === "BUG_REPORT" ? "🐞 Bug" : "Support"}${t.subject ? ` — ${t.subject}` : ""}` });
        }
        if ((freezeExpiredTaskRows || []).length) {
          const shopIds = (freezeExpiredTaskRows || []).map((r: any) => r.shop_id);
          const { data: codes } = await db.from("shops").select("id,public_code").in("id", shopIds);
          const codeById = new Map((codes || []).map((s: any) => [s.id, s.public_code]));
          for (const r of freezeExpiredTaskRows || []) {
            attentionItems.push({ type: "GRACE_EXPIRED", shopId: r.shop_id, label: codeById.get(r.shop_id) || r.shop_id, detail: "Muzlatish muddati tugagan — qaror kerak" });
          }
        }

        return json({
          activeShopsCount: activeShopsCount || 0,
          newRequestsCount: newRequestsCount || 0,
          expiringSoonCount: expiringSoonCount || 0,
          expiredCount: expiredCount || 0,
          supportOpenCount: supportOpenCount || 0,
          awaitingBotConnectCount: awaitingBotConnectCount || 0,
          freezeExpiredCount: (freezeExpiredTaskRows || []).length,
          totalUsersCount,
          recentShops: recentShops || [],
          attentionItems,
        });
      }

      // 2026-08-28: Dashboard analitika bo'limi (davr tanlovchi + jami/yangi/
      // uzaytirish/tarif-o'zgarishi/daromad/to'lov-davri/tarif taqsimoti +
      // savdo dinamikasi). Hech qanday YANGI raqam TO'QIB CHIQARILMAYDI —
      // hammasi tasdiqlangan (status=APPROVED) subscription_requests
      // qatorlaridan (real pul harakati shu yerda, tariff_price_snapshot
      // orqali — keyin tarif narxi o'zgarsa ham eski hisobotlar to'g'ri
      // qoladi) va shops.status/created_at'dan hisoblanadi.
      case "platform_admin_analytics_summary": {
        requirePlatformSuperAdmin();
        const period = String(payload.period || "30d");
        const periodDays = period === "7d" ? 7 : period === "90d" ? 90 : period === "all" ? null : 30;
        const since = periodDays ? new Date(Date.now() - periodDays * 24 * 3600 * 1000).toISOString() : null;

        let approvedQuery = db.from("subscription_requests")
          .select("kind,upgrade_action,billing_period,tariff_name_snapshot,tariff_price_snapshot,reviewed_at")
          .eq("status", "APPROVED").order("reviewed_at", { ascending: true }).limit(5000);
        if (since) approvedQuery = approvedQuery.gte("reviewed_at", since);
        const { data: approvedRows, error: apErr } = await approvedQuery;
        if (apErr) throw apErr;
        const rows = approvedRows || [];

        const totalCount = rows.length;
        const newShopCount = rows.filter((r: any) => r.kind === "NEW_SHOP").length;
        const renewalCount = rows.filter((r: any) => r.kind === "UPGRADE" && r.upgrade_action === "EXTEND").length;
        const planChangeCount = rows.filter((r: any) => r.kind === "UPGRADE" && r.upgrade_action === "CHANGE").length;
        const revenue = rows.reduce((sum: number, r: any) => sum + Number(r.tariff_price_snapshot || 0), 0);

        const byPeriod: Record<string, { count: number; revenue: number }> = {
          MONTHLY: { count: 0, revenue: 0 }, ANNUAL: { count: 0, revenue: 0 },
        };
        for (const r of rows) {
          const key = r.billing_period === "ANNUAL" ? "ANNUAL" : "MONTHLY";
          byPeriod[key].count += 1;
          byPeriod[key].revenue += Number(r.tariff_price_snapshot || 0);
        }

        const tariffMap = new Map<string, { count: number; revenue: number }>();
        for (const r of rows) {
          const name = r.tariff_name_snapshot || "Noma'lum";
          const entry = tariffMap.get(name) || { count: 0, revenue: 0 };
          entry.count += 1; entry.revenue += Number(r.tariff_price_snapshot || 0);
          tariffMap.set(name, entry);
        }
        const byTariff = Array.from(tariffMap.entries())
          .map(([tariffName, v]) => ({ tariffName, count: v.count, revenue: v.revenue }))
          .sort((a, b) => b.revenue - a.revenue);

        // Kunlik savdo dinamikasi — chizish uchun (reviewed_at kuni bo'yicha).
        const dayMap = new Map<string, { count: number; revenue: number }>();
        for (const r of rows) {
          if (!r.reviewed_at) continue;
          const day = String(r.reviewed_at).slice(0, 10);
          const entry = dayMap.get(day) || { count: 0, revenue: 0 };
          entry.count += 1; entry.revenue += Number(r.tariff_price_snapshot || 0);
          dayMap.set(day, entry);
        }
        const salesTimeline = Array.from(dayMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([day, v]) => ({ day, label: day.slice(5), count: v.count, revenue: v.revenue }));

        // Retention — shops.created_at + HOZIRGI status'dan (real, hech narsa
        // to'qib chiqarilmaydi, davr-tanlovchidan MUSTAQIL — bu joriy holat
        // ko'rsatkichi). PROVISIONING'dagilar (hali sozlanmagan, hali
        // "mijoz" bo'lib ulgurmagan) kohortaga kirmaydi. ACTIVE/FROZEN =
        // hali "ushlab qolingan" (FROZEN — to'lov to'xtagan, lekin
        // ma'lumot hali saqlanmoqda, chin ma'noda chiqib ketmagan);
        // TERMINATED = chin ma'noda chiqib ketgan.
        const retentionCutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
        const { data: cohortShops, error: cohortErr } = await db.from("shops")
          .select("status").neq("status", "PROVISIONING").lte("created_at", retentionCutoff);
        if (cohortErr) throw cohortErr;
        const cohortSize = (cohortShops || []).length;
        const retainedSize = (cohortShops || []).filter((s: any) => s.status === "ACTIVE" || s.status === "FROZEN").length;
        const retentionRate = cohortSize ? Math.round((retainedSize / cohortSize) * 100) : null;

        return json({
          period, totalCount, newShopCount, renewalCount, planChangeCount, revenue,
          byPeriod, byTariff, salesTimeline,
          retentionRate, retentionCohortSize: cohortSize,
        });
      }

      // ---- SaaS obuna tizimi, 1-bosqich: tariflar + to'lov ma'lumoti -------
      // Tariflar bazadan boshqariladi — kodga qattiq yozilmaydi, admin
      // Tariflar bo'limidan istalgan vaqt o'zgartira oladi.
      case "platform_list_category_icons": {
        requirePlatformSuperAdmin();
        const { data, error } = await db.from("category_icon_library")
          .select("id,group_key,name_uz,name_ru,name_en,search_terms,svg_body,is_active,sort_order,created_at,updated_at")
          .order("group_key").order("sort_order").order("id");
        if (error) throw error;
        return json({ packagedCount: CATEGORY_ICON_IDS.size, icons: (data || []).map((row: any) => ({
          id: row.id, group: row.group_key, uz: row.name_uz, ru: row.name_ru || row.name_uz, en: row.name_en || row.name_uz,
          searchTerms: Array.isArray(row.search_terms) ? row.search_terms : [], svg: row.svg_body,
          isActive: row.is_active === true, sortOrder: Number(row.sort_order || 0), createdAt: row.created_at, updatedAt: row.updated_at,
        })) });
      }

      case "platform_upsert_category_icons": {
        requirePlatformSuperAdmin();
        const requested = Array.isArray(payload.icons) ? payload.icons.slice(0, 50) : [];
        if (!requested.length) return json({ error: "category_icons_required" }, 400);
        const rows: any[] = [];
        for (let index = 0; index < requested.length; index += 1) {
          const icon = requested[index] || {};
          const id = categoryIconId(icon.id);
          if (CATEGORY_ICON_IDS.has(id)) return json({ error: "packaged_category_icon_id_reserved", id }, 409);
          const groupKey = categoryIconGroup(icon.group);
          const nameUz = String(icon.uz || icon.nameUz || id.replace(/_/g, " ")).trim().slice(0, 120);
          const nameRu = String(icon.ru || icon.nameRu || nameUz).trim().slice(0, 120);
          const nameEn = String(icon.en || icon.nameEn || nameUz).trim().slice(0, 120);
          if (!nameUz) return json({ error: "invalid_category_icon_name", id }, 400);
          const svgBody = sanitizeCategorySvg(icon.svg);
          const searchTerms = Array.from(new Set([id, nameUz, nameRu, nameEn, ...(Array.isArray(icon.searchTerms) ? icon.searchTerms : [])]
            .map((x) => String(x || "").trim()).filter(Boolean).slice(0, 30)));
          rows.push({ id, group_key: groupKey, name_uz: nameUz, name_ru: nameRu, name_en: nameEn, search_terms: searchTerms,
            svg_body: svgBody, is_active: true, sort_order: Number.isFinite(Number(icon.sortOrder)) ? Math.trunc(Number(icon.sortOrder)) : index,
            created_by: tgId, updated_at: new Date().toISOString() });
        }
        const { data, error } = await db.from("category_icon_library").upsert(rows, { onConflict: "id" })
          .select("id,group_key,name_uz,name_ru,name_en,search_terms,svg_body,is_active,sort_order,created_at,updated_at");
        if (error) throw error;
        return json({ ok: true, count: data?.length || rows.length, icons: data || [] });
      }

      case "platform_set_category_icon_active": {
        requirePlatformSuperAdmin();
        const id = categoryIconId(payload.id);
        if (CATEGORY_ICON_IDS.has(id)) return json({ error: "packaged_category_icon_cannot_be_disabled" }, 409);
        const { data, error } = await db.from("category_icon_library").update({ is_active: payload.isActive === true, updated_at: new Date().toISOString() })
          .eq("id", id).select("id,is_active").maybeSingle();
        if (error) throw error;
        if (!data) return json({ error: "category_icon_not_found" }, 404);
        return json({ ok: true, id: data.id, isActive: data.is_active === true });
      }

      case "platform_list_tariffs": {
        // Ochiq — istalgan tasdiqlangan Telegram foydalanuvchi (obuna
        // sahifasi buni ko'radi), faqat FAOL tariflar, token/parol yo'q.
        const { data, error } = await db.from("tariffs")
          .select("id,name,price,product_limit,is_popular,features")
          .eq("is_active", true).order("sort_order").order("price");
        if (error) throw error;
        return json({
          tariffs: (data || []).map((t: any) => ({
            id: t.id, name: t.name, price: Number(t.price),
            productLimit: t.product_limit, isPopular: t.is_popular === true,
            features: Array.isArray(t.features) ? t.features : [],
          })),
        });
      }

      case "platform_admin_list_tariffs": {
        requirePlatformSuperAdmin();
        const { data, error } = await db.from("tariffs")
          .select("id,name,price,product_limit,is_active,is_popular,sort_order,features")
          .order("sort_order").order("price");
        if (error) throw error;
        return json({
          tariffs: (data || []).map((t: any) => ({
            id: t.id, name: t.name, price: Number(t.price), productLimit: t.product_limit,
            isActive: t.is_active === true, isPopular: t.is_popular === true, sortOrder: t.sort_order,
            features: Array.isArray(t.features) ? t.features : [],
          })),
        });
      }

      case "platform_upsert_tariff": {
        requirePlatformSuperAdmin();
        const id = payload.id ? String(payload.id) : null;
        const name = String(payload.name || "").trim().slice(0, 80);
        const price = Number(payload.price);
        const productLimitRaw = payload.productLimit;
        const productLimit = (productLimitRaw === null || productLimitRaw === "" || productLimitRaw === undefined)
          ? null : Number(productLimitRaw);
        const isActive = payload.isActive !== false;
        const isPopular = payload.isPopular === true;
        const sortOrder = Number.isFinite(Number(payload.sortOrder)) ? Math.trunc(Number(payload.sortOrder)) : 0;

        if (!name) return json({ error: "name_required" }, 400);
        if (!Number.isFinite(price) || price < 0) return json({ error: "invalid_price" }, 400);
        if (productLimit !== null && (!Number.isInteger(productLimit) || productLimit <= 0)) {
          return json({ error: "invalid_product_limit" }, 400);
        }

        // 2026-08-28: har tarif endi O'Z xususiyatlar ro'yxatiga ega
        // (avval frontendda HAMMA tarifga bir xil hardcode ro'yxat
        // ko'rsatilardi — 050-migratsiya). Bo'sh qatorlar chetlab
        // o'tiladi, har biri 80 belgigacha, ko'pi bilan 20 ta.
        const featuresRaw = Array.isArray(payload.features) ? payload.features : [];
        const features = featuresRaw
          .map((f: any) => String(f || "").trim())
          .filter((f: string) => f.length > 0)
          .slice(0, 20)
          .map((f: string) => f.slice(0, 80));

        // "Ommabop" — bir vaqtda faqat bitta tarifda bo'lishi mumkin (baza
        // darajasida ham 016'dagi qisman unique indeks bilan kafolatlangan).
        // Avval boshqalarini o'chiramiz, keyin tanlanganini yoqamiz.
        if (isPopular) {
          const { error: clearErr } = await db.from("tariffs").update({ is_popular: false }).eq("is_popular", true);
          if (clearErr) throw clearErr;
        }

        const row = {
          name, price, product_limit: productLimit, is_active: isActive,
          is_popular: isPopular, sort_order: sortOrder, features, updated_at: new Date().toISOString(),
        };

        if (id) {
          const { error } = await db.from("tariffs").update(row).eq("id", id);
          if (error) throw error;
          return json({ ok: true, id });
        }
        const { data: inserted, error: insertErr } = await db.from("tariffs").insert(row).select("id").single();
        if (insertErr) throw insertErr;
        return json({ ok: true, id: inserted.id });
      }

      // "O'chirish" tugmasi yo'q — faqat isActive=false (tarif tarixiy
      // so'rovlar/do'konlarda FK sifatida abadiy to'g'ri qolishi kerak).

      case "platform_get_payment_info": {
        // Ochiq — obuna to'lov sahifasi buni ko'rsatadi.
        const { data, error } = await db.from("platform_settings")
          .select("payment_card_number,payment_card_holder,payment_card_active").eq("id", true).maybeSingle();
        if (error) throw error;
        return json({ cardNumber: data?.payment_card_number || null, cardHolder: data?.payment_card_holder || null, isActive: data?.payment_card_active !== false });
      }

      case "platform_set_payment_info": {
        requirePlatformSuperAdmin();
        const cardNumber = String(payload.cardNumber || "").replace(/[^\d ]/g, "").trim().slice(0, 32) || null;
        const cardHolder = String(payload.cardHolder || "").trim().slice(0, 120) || null;
        const isActive = payload.isActive !== false;
        const { error } = await db.from("platform_settings").update({
          payment_card_number: cardNumber, payment_card_holder: cardHolder, payment_card_active: isActive,
          updated_at: new Date().toISOString(), updated_by: tgId,
        }).eq("id", true);
        if (error) throw error;
        return json({ ok: true });
      }

      // 2026-08-28: platforma to'lov usullari — Click/Payme/Paynet
      // HAVOLA-CRUD (052-migratsiya). Karta (platform_settings, yuqorida)
      // bilan mustaqil, parallel yashaydi — bu yerga tegilmaydi. Bular
      // shop-api'dagi merchant-webhook integratsiyasi EMAS: admin bitta
      // http(s) havola qo'yadi, mijoz bosadi/to'laydi, keyin mavjud
      // "To'ladim" (platform_confirm_payment_claim) oqimi orqali xabar
      // beradi — Karta bilan bir xil keyingi qadam.
      case "platform_list_payment_methods": {
        // User checkout: only active methods. Custom uploaded logo is private;
        // return a short-lived signed URL. Frontend has a code-drawn fallback.
        const { data, error } = await db.from("platform_payment_methods")
          .select("id,method_type,display_name,payment_url,logo_storage_path")
          .eq("is_active", true).order("sort_order").order("created_at");
        if (error) throw error;
        const methods = await Promise.all((data || []).map(async (m: any) => ({
          id: m.id,
          methodType: m.method_type,
          displayName: m.display_name,
          paymentUrl: m.payment_url,
          logoUrl: await signedPlatformAssetUrl(db, m.logo_storage_path || null, 3600),
          hasCustomLogo: !!m.logo_storage_path,
        })));
        return json({ methods });
      }

      case "platform_admin_list_payment_methods": {
        requirePlatformSuperAdmin();
        const { data, error } = await db.from("platform_payment_methods")
          .select("id,method_type,display_name,payment_url,is_active,sort_order,logo_storage_path")
          .order("sort_order").order("created_at");
        if (error) throw error;
        const methods = await Promise.all((data || []).map(async (m: any) => ({
          id: m.id,
          methodType: m.method_type,
          displayName: m.display_name,
          paymentUrl: m.payment_url,
          isActive: m.is_active === true,
          sortOrder: m.sort_order,
          logoUrl: await signedPlatformAssetUrl(db, m.logo_storage_path || null, 3600),
          hasCustomLogo: !!m.logo_storage_path,
        })));
        return json({ methods });
      }

      case "platform_upsert_payment_method": {
        requirePlatformSuperAdmin();
        const id = payload.id ? String(payload.id) : null;
        const methodType = String(payload.methodType || "").toUpperCase();
        if (!["CLICK", "PAYME", "PAYNET"].includes(methodType)) return json({ error: "invalid_method_type" }, 400);
        const displayName = String(payload.displayName || "").trim().slice(0, 60);
        if (!displayName) return json({ error: "display_name_required" }, 400);
        const paymentUrl = String(payload.paymentUrl || "").trim().slice(0, 500);
        if (!/^https?:\/\//i.test(paymentUrl)) return json({ error: "invalid_payment_url" }, 400);
        const isActive = payload.isActive !== false;
        const sortOrder = Number.isFinite(Number(payload.sortOrder)) ? Math.trunc(Number(payload.sortOrder)) : 0;

        let currentLogoPath: string | null = null;
        if (id) {
          const { data: current, error: currentErr } = await db.from("platform_payment_methods")
            .select("logo_storage_path").eq("id", id).maybeSingle();
          if (currentErr) throw currentErr;
          if (!current) return json({ error: "payment_method_not_found" }, 404);
          currentLogoPath = current.logo_storage_path || null;
        }

        let nextLogoPath = payload.removeLogo === true ? null : currentLogoPath;
        let newlyUploadedLogoPath: string | null = null;
        if (payload.logoImageUpload) {
          try {
            const stored = await storePlatformAsset(db, "payment-methods", id || methodType, payload.logoImageUpload);
            nextLogoPath = stored.path;
            newlyUploadedLogoPath = stored.path;
          } catch (e: any) {
            return json({ error: e?.message === "image_too_large" ? "image_too_large" : "invalid_image_file" }, 400);
          }
        }

        const row = {
          method_type: methodType,
          display_name: displayName,
          payment_url: paymentUrl,
          is_active: isActive,
          sort_order: sortOrder,
          logo_storage_path: nextLogoPath,
          updated_at: new Date().toISOString(),
          updated_by: tgId,
        };
        let finalId = id;
        if (id) {
          const { error } = await db.from("platform_payment_methods").update(row).eq("id", id);
          if (error) {
            if (newlyUploadedLogoPath) await cleanupPlatformAssetIfUnreferenced(db, newlyUploadedLogoPath, "failed-payment-logo");
            throw error;
          }
        } else {
          const { data: inserted, error: insertErr } = await db.from("platform_payment_methods").insert(row).select("id").single();
          if (insertErr) {
            if (newlyUploadedLogoPath) await cleanupPlatformAssetIfUnreferenced(db, newlyUploadedLogoPath, "failed-payment-logo");
            throw insertErr;
          }
          finalId = inserted.id;
        }
        if (currentLogoPath && currentLogoPath !== nextLogoPath) {
          EdgeRuntime.waitUntil(cleanupPlatformAssetIfUnreferenced(db, currentLogoPath, "old-payment-logo").catch(() => {}));
        }
        return json({ ok: true, id: finalId });
      }

      // 2026-08-28: Telegram bildirishnoma shablonlari (053-migratsiya, spec
      // bo'lim D) — admin har bir turning matnini/rasmini/faol-faolsizligini
      // tahrirlaydi. Tur ro'yxati QATTIQ (yangi tur qo'shilmaydi, faqat
      // migratsiyada seedланган 6 tasi) — shu sabab upsert emas, faqat
      // UPDATE (row allaqachon mavjud, PK — `type`).
      case "platform_get_lifecycle_settings": {
        const settings = await loadLifecycleSettings(db);
        return json({ settings });
      }

      case "platform_update_lifecycle_settings": {
        requirePlatformSuperAdmin();
        const current = await loadLifecycleSettings(db);
        const retentionDays = Math.max(1, Math.min(365, Math.trunc(Number(payload.retentionDays || current.retentionDays))));
        const supportLabel = String(payload.supportLabel || current.supportLabel).trim().slice(0, 80) || "Admin bilan bog'lanish";
        const supportUrlRaw = payload.supportUrl == null ? current.supportUrl : String(payload.supportUrl || "").trim().slice(0, 500);
        if (supportUrlRaw && !/^(https?:\/\/|tg:\/\/)/i.test(supportUrlRaw)) return json({ error: "invalid_support_url" }, 400);
        const freezeUserTitle = String(payload.freezeUserTitle || current.freezeUserTitle).trim().slice(0, 160);
        const freezeUserBody = String(payload.freezeUserBody || current.freezeUserBody).trim().slice(0, 1000);
        const freezeActionText = String(payload.freezeActionText || current.freezeActionText).trim().slice(0, 500);
        const terminateUserTitle = String(payload.terminateUserTitle || current.terminateUserTitle).trim().slice(0, 160);
        const terminateUserBody = String(payload.terminateUserBody || current.terminateUserBody).trim().slice(0, 1000);
        if (!freezeUserTitle || !freezeUserBody || !freezeActionText || !terminateUserTitle || !terminateUserBody) return json({ error: "lifecycle_text_required" }, 400);
        const freezeReasons = normalizeReasonList(payload.freezeReasons, current.freezeReasons);
        const terminateReasons = normalizeReasonList(payload.terminateReasons, current.terminateReasons);
        if (!freezeReasons.length || !terminateReasons.length) return json({ error: "lifecycle_reason_required" }, 400);
        const row = {
          auto_freeze_on_expiry: payload.autoFreezeOnExpiry !== false,
          retention_days: retentionDays,
          support_label: supportLabel,
          support_url: supportUrlRaw || null,
          freeze_user_title: freezeUserTitle,
          freeze_user_body: freezeUserBody,
          freeze_action_text: freezeActionText,
          terminate_user_title: terminateUserTitle,
          terminate_user_body: terminateUserBody,
          freeze_reasons: freezeReasons,
          terminate_reasons: terminateReasons,
          updated_at: new Date().toISOString(),
          updated_by: tgId,
        };
        const { error } = await db.from("platform_lifecycle_settings").update(row).eq("id", true);
        if (error) throw error;
        return json({ ok: true, settings: await loadLifecycleSettings(db) });
      }

      case "platform_admin_list_notification_templates": {
        requirePlatformSuperAdmin();
        const { data, error } = await db.from("notification_templates")
          .select("type,body,image_url,image_storage_path,is_active,updated_at").order("type");
        if (error) throw error;
        const templates = await Promise.all((data || []).map(async (t: any) => ({
          type: t.type,
          body: t.body,
          imageUrl: t.image_url,
          uploadedImageUrl: await signedPlatformAssetUrl(db, t.image_storage_path || null, 3600),
          hasUploadedImage: !!t.image_storage_path,
          isActive: t.is_active === true,
          updatedAt: t.updated_at,
        })));
        return json({ templates });
      }

      case "platform_update_notification_template": {
        requirePlatformSuperAdmin();
        const type = String(payload.type || "");
        const validTypes = ["EXPIRY_7D", "EXPIRY_3D", "EXPIRY_1D", "FROZEN", "GRACE_7D", "GRACE_1D", "VISITOR_1D", "VISITOR_3D", "VISITOR_7D", "REACTIVATED", "TERMINATED"];
        if (!validTypes.includes(type)) return json({ error: "invalid_template_type" }, 400);
        const body = String(payload.body || "").trim().slice(0, 1000);
        if (!body) return json({ error: "body_required" }, 400);
        const imageUrlRaw = payload.imageUrl ? String(payload.imageUrl).trim().slice(0, 500) : null;
        if (imageUrlRaw && !/^https:\/\//i.test(imageUrlRaw)) return json({ error: "invalid_image_url" }, 400);
        const isActive = payload.isActive !== false;
        const { data: current, error: currentErr } = await db.from("notification_templates")
          .select("image_storage_path").eq("type", type).maybeSingle();
        if (currentErr) throw currentErr;
        if (!current) return json({ error: "template_not_found" }, 404);
        const currentPath = current.image_storage_path || null;
        let nextPath = (payload.removeImage === true || imageUrlRaw) ? null : currentPath;
        let newlyUploadedTemplatePath: string | null = null;
        if (payload.imageUpload) {
          try {
            const stored = await storePlatformAsset(db, "notification-templates", type, payload.imageUpload);
            nextPath = stored.path;
            newlyUploadedTemplatePath = stored.path;
          } catch (e: any) {
            return json({ error: e?.message === "image_too_large" ? "image_too_large" : "invalid_image_file" }, 400);
          }
        }
        const { error } = await db.from("notification_templates").update({
          body,
          image_url: imageUrlRaw,
          image_storage_path: nextPath,
          is_active: isActive,
          updated_at: new Date().toISOString(),
          updated_by: tgId,
        }).eq("type", type);
        if (error) {
          if (newlyUploadedTemplatePath) await cleanupPlatformAssetIfUnreferenced(db, newlyUploadedTemplatePath, "failed-notification-image");
          throw error;
        }
        if (currentPath && currentPath !== nextPath) {
          EdgeRuntime.waitUntil(cleanupPlatformAssetIfUnreferenced(db, currentPath, "old-notification-image").catch(() => {}));
        }
        return json({ ok: true });
      }

      case "platform_send_test_notification": {
        requirePlatformSuperAdmin();
        const type = String(payload.type || "");
        const validTypes = ["EXPIRY_7D", "EXPIRY_3D", "EXPIRY_1D", "FROZEN", "GRACE_7D", "GRACE_1D", "VISITOR_1D", "VISITOR_3D", "VISITOR_7D", "REACTIVATED", "TERMINATED"];
        if (!validTypes.includes(type)) return json({ error: "invalid_template_type" }, 400);
        const { data: tpl, error: tplErr } = await db.from("notification_templates")
          .select("body,image_url,image_storage_path").eq("type", type).maybeSingle();
        if (tplErr) throw tplErr;
        if (!tpl) return json({ error: "template_not_found" }, 404);
        const sampleDate = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
        const settings = await loadLifecycleSettings(db);
        const samplePlaceholders: Record<string, string> = {
          SHOP_NAME: "Namuna do'kon",
          DAYS_LEFT: "3",
          EXPIRY_DATE: sampleDate,
          RETENTION_DAYS_LEFT: "7",
          REASON: "Namuna sabab",
          ACTION: settings.freezeActionText,
          SUPPORT_CONTACT: settings.supportUrl || settings.supportLabel,
        };
        let text = tpl.body;
        for (const [key, value] of Object.entries(samplePlaceholders)) text = text.split(`{${key}}`).join(value);
        text = `🧪 SINOV XABARI (haqiqiy mijozga yuborilmaydi)\n\n${text}`;
        const uploaded = await signedPlatformAssetUrl(db, tpl.image_storage_path || null, 3600);
        const image = uploaded || tpl.image_url || null;
        if (image) await telegramApi(PLATFORM_BOT_TOKEN, "sendPhoto", { chat_id: tgId, photo: image, caption: text });
        else await telegramApi(PLATFORM_BOT_TOKEN, "sendMessage", { chat_id: tgId, text });
        return json({ ok: true });
      }

      default:
        return json({ error: "unknown_action" }, 400);
    }
  } catch (e: any) {
    console.error("[PLATFORM_API_ACTION_FAILED]", { action: String(action || ""), code: e?.code || "server_error" });
    const msg = e?.message || String(e);
    if (msg.startsWith("forbidden:")) return json({ error: msg }, 403);
    if (["platform_prepare_web_credentials","platform_web_credentials_status","platform_issue_web_credentials","platform_reset_web_credentials","platform_change_web_login","platform_set_web_password"].includes(String(action || ""))) {
      if (msg.startsWith("VALIDATION_ERROR")) return json({ error: "invalid_credential_value" }, 400);
      if (msg.startsWith("CONFLICT")) return json({ error: "credential_value_conflict" }, 409);
      return json({ error: "credential_action_failed" }, 500);
    }
    return json({ error: "server_error" }, 500);
  }
});
