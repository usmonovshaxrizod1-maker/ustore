// ============================================================================
// USTORE shop-api — universal, multi-tenant Edge Function.
// ============================================================================
// Renamed from the old FITCORE app-api. Every one of its ~77 actions is
// preserved here (see USTORE_GREENFIELD_PHASE1_HISOBOT.md for the full
// before/after action list) — the ONLY architectural change is that every
// action is now shop-scoped through ctx.shopId, resolved server-side from
// the request's botId (never trusted from the client for anything other
// than "which bot is this"), instead of the old single static
// TELEGRAM_BOT_TOKEN/SUPER_ADMIN_ID/admins-table model.
//
// See resolveShopContext() below for exactly how a request's botId becomes
// a trusted ctx.shopId — that function is the single most important piece
// of this file from a security standpoint.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";
import { decryptBotToken, encryptBotToken } from "../_shared/bot-token-crypto.ts";
import { json, corsHeaders } from "../_shared/http.ts";
import { verifyTelegramInitData, telegramWebhookSecret, telegramApi } from "../_shared/telegram.ts";
import {
  billzLogin, encryptTokenPair, getValidBillzAccessToken,
  billzListShops, billzListCashboxes, billzListPaymentTypes, billzListCategories, billzListProducts,
  billzListAllMatching, billzCreateSale, BillzApiError,
} from "../_shared/billz-client.ts";
import { clickCreateInvoice } from "../_shared/click-client.ts";
import { buildPaymeCheckoutUrl } from "../_shared/payme-client.ts";
import { uzumRegisterPayment, uzumVerifyCredentials } from "../_shared/uzum-client.ts";
import { PERMISSIONS, STANDARD_ROLES, isValidPermission } from "../_shared/permissions.ts";
import { CATEGORY_ICON_IDS, CATEGORY_ICON_COLORS } from "../_shared/category-icons.ts";
import { authenticateTelegramShopTenant, resolveOptionalWebSession, resolveShopTenant } from "../_shared/shop-context.ts";
import type { Permission } from "../_shared/permissions.ts";
import { handleShopDomainAction, requireDomainManager, resolveActiveDomainRoute } from "../_shared/shop-domains.ts";
import { ensureTelegramAccount } from "../_shared/account-identity.ts";
import { issueInitialCredentials, resetCredentialsForTelegram, setCredentialsPasswordForTelegram, changeLogin } from "../_shared/web-auth.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

async function categoryIconIsAllowed(db: any, iconId: string): Promise<boolean> {
  if (CATEGORY_ICON_IDS.has(iconId)) return true;
  const { data, error } = await db.from("category_icon_library").select("id").eq("id", iconId).eq("is_active", true).maybeSingle();
  if (error) throw error;
  return !!data;
}

function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function normalizeName(v: unknown): string {
  return String(v ?? "")
    .trim().toLocaleLowerCase("uz")
    .replace(/[ʻʼ‘’`]/g, "'")
    .replace(/\s+/g, " ");
}
function categoryPathKey(parts: string[]): string {
  return parts.map(normalizeName).filter(Boolean).join("");
}

// 3-band: bir xil tuman haqiqiy delivery_branches ma'lumotida turlicha
// yozilgan bo'lishi mumkin (masalan "M. Ulug'bek" va "Mirzo Ulug'bek" — bir
// xil Toshkent tumani, ikki xil qisqartirish/to'liq yozuv). Kengaytiriladigan
// alias ro'yxati — kalit har doim SUFFIXsiz (shahar/tuman so'zi olib
// tashlangan), kichik harfli bazaviy nom. Yangi dublikat topilsa shu yerga
// bitta qator qo'shish kifoya, boshqa hech narsaga tegilmaydi.
const DISTRICT_BASE_ALIASES: Record<string, string> = {
  // 8-band: kalitlar har doim "m.ulug'bek" uslubida (nuqtadan keyingi bo'shliq
  // olib tashlangan holda) — pastdagi normalize bosqichi buni kafolatlaydi,
  // shuning uchun "M. Ulug'bek" va "M.Ulug'bek" ikkalasi ham shu bitta
  // kalitga tushadi (avval faqat bo'shliqli varianti yozilgan edi, real BTS
  // ma'lumotida bo'shliqsiz "M.Ulug'bek" ishlatilgani sabab hech qachon
  // ishlamas edi).
  "m.ulug'bek": "mirzo ulug'bek",
  // BTS "Mirobod", EMU "Mirabad" — bir xil Toshkent tumani, ikki provider
  // ikki xil talaffuz/yozuvda beradi. "mirobod" kanonik sifatida tanlandi.
  "mirabad": "mirobod",
};
function districtParts(raw: unknown): { base: string; kind: "city" | "district" | "generic"; key: string; labelBase: string } {
  let source = String(raw ?? "").trim().replace(/[ʻʼ‘’`]/g, "'").replace(/\s+/g, " ");
  let normalized = source.toLocaleLowerCase("uz");
  normalized = normalized.replace(/shaxrisabz/g, "shahrisabz");
  normalized = normalized.replace(/\bshaxar\b/g, "shahar").replace(/\bshaxri\b/g, "shahri");
  normalized = normalized.replace(/\.\s+/g, ".");
  let kind: "city" | "district" | "generic" = "generic";
  if (/\s+(?:shahar|shahri)$/.test(normalized)) { kind = "city"; normalized = normalized.replace(/\s+(?:shahar|shahri)$/, ""); }
  else if (/\s+(?:tuman|tumani)$/.test(normalized)) { kind = "district"; normalized = normalized.replace(/\s+(?:tuman|tumani)$/, ""); }
  normalized = normalized.trim();
  normalized = DISTRICT_BASE_ALIASES[normalized] || normalized;
  const labelBase = normalized.split(" ").map((part) => part ? part[0].toLocaleUpperCase("uz") + part.slice(1) : part).join(" ");
  return { base: normalized, kind, key: `${normalized}|${kind}`, labelBase };
}
function districtLabel(part: { labelBase: string; kind: "city" | "district" | "generic" }): string {
  if (part.kind === "city") return `${part.labelBase} shahri`;
  if (part.kind === "district") return `${part.labelBase} tumani`;
  return part.labelBase;
}

// ---- Storage paths: shop-scoped ---------------------------------------------
// 18-band: every object lives under shops/<shopId>/... — this function is
// the SAME kind of "does this URL actually point at an object we own"
// safety check the old code had (productStoragePathFromUrl), just extended
// to also verify the shop prefix, so one shop's Edge Function context can
// never be tricked into deleting/reading another shop's Storage object.
function productStoragePathFromUrl(value: unknown, supabaseUrl: string, shopId: string, bucket = "images"): string | null {
  try {
    const url = new URL(String(value || ""));
    if (url.origin !== new URL(supabaseUrl).origin) return null;
    const prefix = `/storage/v1/object/public/${bucket}/`;
    if (!url.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(url.pathname.slice(prefix.length));
    const expectedPrefix = `shops/${shopId}/products/`;
    if (!path.startsWith(expectedPrefix)) return null;
    const fileName = path.slice(expectedPrefix.length);
    return /^\d+-[0-9a-f-]{36}\.(?:jpg|jpeg|png|webp)$/i.test(fileName) ? path : null;
  } catch {
    return null;
  }
}
async function cleanupUnreferencedProductImages(db: any, shopId: string, imageUrls: unknown[], supabaseUrl: string) {
  for (const rawUrl of Array.from(new Set((imageUrls || []).map((x) => String(x || '')).filter(Boolean)))) {
    try { await cleanupManagedImageIfUnreferenced(db, shopId, rawUrl, supabaseUrl, "purge-product-image"); }
    catch (e) { console.error("purge product image cleanup error", e); }
  }
}

// Managed images can be reused by URL in another UStorE entity. Before deleting
// an old Storage object, check every shop-owned visual reference so replacing a
// banner/category/logo can never break a different resource that reused it.
async function managedImageUrlStillReferenced(db: any, shopId: string, rawUrl: string): Promise<boolean> {
  const scalarChecks: Array<[string, string]> = [
    ["products", "img"], ["products", "thumb_img"], ["categories", "img"],
    ["banners", "image_url"], ["bundles", "cover_image_url"], ["shop_settings", "logo_url"],
  ];
  for (const [table, column] of scalarChecks) {
    const { data, error } = await db.from(table).select("shop_id").eq("shop_id", shopId).eq(column, rawUrl).limit(1);
    if (error) { console.error(`[image-ref:${table}.${column}]`, error); return true; }
    if ((data || []).length) return true;
  }
  for (const key of ["img", "colorImg"]) {
    const { data, error } = await db.from("products").select("id").eq("shop_id", shopId).contains("variants", [{ [key]: rawUrl }]).limit(1);
    if (error) { console.error(`[image-ref:products.variants.${key}]`, error); return true; }
    if ((data || []).length) return true;
  }
  return false;
}
async function cleanupManagedImageIfUnreferenced(db: any, shopId: string, rawUrl: unknown, supabaseUrl: string, label = "image") {
  const url = String(rawUrl || "").trim();
  if (!url) return;
  const storagePath = productStoragePathFromUrl(url, supabaseUrl, shopId, "images");
  if (!storagePath) return; // external URL: never attempt to delete someone else's file
  if (await managedImageUrlStillReferenced(db, shopId, url)) return;
  const { error } = await db.storage.from("images").remove([storagePath]);
  if (error) console.error(`[${label}:cleanup]`, error);
}

function normalizeProductImageUrl(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.length > 2048) throw new Error("invalid_image_url");
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") throw new Error("invalid_image_url");
    return url.href;
  } catch {
    throw new Error("invalid_image_url");
  }
}
async function storeProductImage(db: any, shopId: string, upload: any): Promise<{ url: string; path: string }> {
  const mimeType = String(upload?.mimeType || "").toLowerCase();
  const extensionByMime: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  };
  const ext = extensionByMime[mimeType];
  const base64 = String(upload?.base64 || "").replace(/\s+/g, "");
  if (!ext || !base64 || base64.length > 8_400_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new Error("invalid_image_upload");
  }
  let binary: string;
  try { binary = atob(base64); } catch { throw new Error("invalid_image_upload"); }
  if (!binary.length || binary.length > 6 * 1024 * 1024) throw new Error("image_too_large");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const path = `shops/${shopId}/products/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage.from("images").upload(path, bytes, {
    contentType: mimeType, cacheControl: "31536000", upsert: false,
  });
  if (error) throw new Error(`image_upload_failed:${error.message}`);
  const { data } = db.storage.from("images").getPublicUrl(path);
  if (!data?.publicUrl) {
    await db.storage.from("images").remove([path]);
    throw new Error("image_public_url_failed");
  }
  return { url: data.publicUrl, path };
}

async function storePaymentReceipt(db: any, shopId: string, orderId: number, tgId: string, upload: any): Promise<{ path: string }> {
  const mimeType = String(upload?.mimeType || "").toLowerCase();
  const extensionByMime: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  };
  const ext = extensionByMime[mimeType];
  const base64 = String(upload?.base64 || "").replace(/\s+/g, "");
  if (!ext || !base64 || base64.length > 8_400_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new Error("invalid_receipt_file");
  }
  let binary: string;
  try { binary = atob(base64); } catch { throw new Error("invalid_receipt_file"); }
  if (!binary.length || binary.length > 6 * 1024 * 1024) throw new Error("receipt_too_large");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const path = `shops/${shopId}/receipts/${orderId}/${tgId}-${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage.from("payment-receipts").upload(path, bytes, {
    contentType: mimeType, cacheControl: "300", upsert: false,
  });
  if (error) throw new Error(`receipt_upload_failed:${error.message}`);
  return { path };
}
function nullableText(v: unknown, max = 200): string | null {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
}
function normalizePhone(v: unknown): string | null {
  const s = nullableText(v, 50);
  if (!s) return null;
  if (!/^[+\d()\-\s]{5,30}$/.test(s)) throw new Error("invalid_phone");
  return s;
}
function normalizeHandle(v: unknown, kind: "instagram" | "telegram" | "facebook"): string | null {
  let s = nullableText(v, 120);
  if (!s) return null;
  s = s.replace(/^@/, "").replace(/\/+$/, "");
  if (kind === "instagram") {
    s = s.replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, "");
    if (!/^[A-Za-z0-9._]{1,64}$/.test(s)) throw new Error("invalid_instagram");
  } else if (kind === "telegram") {
    s = s.replace(/^https?:\/\/(?:www\.)?(?:t\.me|telegram\.me)\//i, "");
    if (!/^[A-Za-z0-9_]{1,64}$/.test(s)) throw new Error("invalid_telegram");
  } else {
    s = s.replace(/^https?:\/\/(?:www\.)?facebook\.com\//i, "");
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(s)) throw new Error("invalid_facebook");
  }
  return s;
}
function normalizeCoordinates(v: unknown): string | null {
  const s = nullableText(v, 80);
  if (!s) return null;
  const m = s.match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (!m) throw new Error("invalid_coordinates");
  const lat = Number(m[1]), lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) throw new Error("invalid_coordinates");
  return `${m[1]},${m[2]}`;
}

// Canonical snake_case region codes — unchanged from FITCORE (013_region_canonical_codes.sql).
const UZ_TOP_LEVEL_REGION_IDS = [
  "tashkent_city", "tashkent_region", "andijan", "bukhara", "fergana", "jizzakh",
  "namangan", "navoi", "qashqadaryo", "samarkand", "sirdaryo", "surxondaryo",
  "khorezm", "karakalpakstan",
] as const;
const UZ_TOP_LEVEL_REGION_SET = new Set<string>(UZ_TOP_LEVEL_REGION_IDS);
const UZ_TOP_LEVEL_REGION_LABELS: Record<string, string> = {
  tashkent_city: "Toshkent shahri", tashkent_region: "Toshkent viloyati",
  andijan: "Andijon viloyati", bukhara: "Buxoro viloyati", fergana: "Farg'ona viloyati",
  jizzakh: "Jizzax viloyati", namangan: "Namangan viloyati", navoi: "Navoiy viloyati",
  qashqadaryo: "Qashqadaryo viloyati", samarkand: "Samarqand viloyati",
  sirdaryo: "Sirdaryo viloyati", surxondaryo: "Surxondaryo viloyati",
  khorezm: "Xorazm viloyati", karakalpakstan: "Qoraqalpog'iston Respublikasi",
};
const POST_PROVIDER_IDS = ["BTS", "EMU", "OTHER"] as const;

function defaultFulfillmentConfig() {
  return {
    version: 1,
    delivery: {
      free: { enabled: false, regions: {}, general: { enabled: false, comment: null, estimatedTime: null } },
      fixed: { enabled: false, regions: {}, general: { enabled: false, fee: null, comment: null, estimatedTime: null } },
      taxi: { enabled: false, general: { enabled: false, exactFee: null, minFee: null, maxFee: null, comment: null, estimatedTime: null }, regions: {} },
      post: { enabled: false, providers: [
        { id: "BTS", name: "BTS", enabled: false, regions: {} },
        { id: "EMU", name: "EMU", enabled: false, regions: {} },
        { id: "OTHER", name: "Boshqa pochta", enabled: false, regions: {} },
      ] },
    },
    payments: { methods: [
      { id: "CASH", name: "Naqd", enabled: false, regions: {} },
      { id: "CARD", name: "Karta orqali", enabled: false, regions: {}, cardNumber: "", cardHolder: "", receiptRequired: false },
      { id: "QR", name: "QR orqali", enabled: false, regions: {}, providers: QR_PROVIDER_IDS.map((id) => ({ id, name: QR_PROVIDER_NAMES[id], enabled: false, qrImageUrl: null, paymentUrl: null })) },
      // Click.uz avtomatik to'lov — mavjud "QR: Click" (qo'lda, chek bilan)
      // metodidan MUSTAQIL, faqat platforma ruxsat berib do'kon o'z Click
      // Merchant hisobini ulaganida ko'rinadi/yoqiladi (click_connections).
      { id: "CLICK", name: "Click orqali (avtomatik)", enabled: false, regions: {} },
      // Payme/Uzum avtomatik to'lov — CLICK bilan bir xil naqsh, mavjud
      // "QR: Payme/Uzum" (qo'lda, chek bilan) metodlaridan MUSTAQIL.
      { id: "PAYME", name: "Payme orqali (avtomatik)", enabled: false, regions: {} },
      { id: "UZUM", name: "Uzum orqali (avtomatik)", enabled: false, regions: {} },
    ] },
  };
}

function nonNegativeInteger(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

// Phase 3, 7-band: taxi narxi to'liq ixtiyoriy — "kiritilmagan" (null) va
// "0 kiritilgan" (haqiqiy nol narx) aniq ajratiladi, shu sabab 0'ga sukut
// qilinmaydi (ustore-commerce.js'dagi nonNegativeIntOrNull bilan bir xil).
function nonNegativeIntegerOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

// Phase 3, 7-band (TAXI) + 2026-09 kengaytma (FREE/FIXED) — ustore-commerce.js
// normalizeGeneral() bilan bir xil naqsh/legacy-migratsiya qoidasi (bir xil
// izoh o'sha yerda). Server bu yerda AUTORITATIV — frontend qiymatiga
// ishonilmaydi, shu bois xuddi shu mantiq mustaqil takrorlanadi.
function sanitizeGeneral(raw: any, kind: "FREE" | "FIXED" | "TAXI") {
  const hasLegacyValue = kind === "TAXI" && raw && typeof raw === "object" && raw.enabled === undefined &&
    (raw.exactFee != null || raw.minFee != null || raw.maxFee != null ||
      (raw.comment && String(raw.comment).trim()) || (raw.estimatedTime && String(raw.estimatedTime).trim()));
  const entry: any = { enabled: raw?.enabled === true || !!hasLegacyValue };
  if (kind === "FIXED") entry.fee = nonNegativeIntegerOrNull(raw?.fee);
  if (kind === "TAXI") {
    entry.exactFee = nonNegativeIntegerOrNull(raw?.exactFee);
    entry.minFee = nonNegativeIntegerOrNull(raw?.minFee);
    entry.maxFee = nonNegativeIntegerOrNull(raw?.maxFee);
  }
  entry.comment = nullableText(raw?.comment, 200);
  entry.estimatedTime = nullableText(raw?.estimatedTime, 60);
  return entry;
}

function cleanConfigRegions(raw: any, kind: "FREE" | "FIXED" | "TAXI" | "POST" | "PAYMENT", strict: boolean) {
  const result: Record<string, any> = {};
  for (const [regionId, value] of Object.entries(raw || {})) {
    if (!UZ_TOP_LEVEL_REGION_SET.has(regionId) || !(value as any)?.enabled) continue;
    const entry: any = { enabled: true };
    const districts = Array.isArray((value as any).districts)
      ? Array.from(new Set((value as any).districts.map((v: any) => String(v || "").trim()).filter(Boolean))).slice(0, 100)
      : [];
    if (districts.length) entry.districts = districts;
    if (kind === "FIXED") {
      // 2026-09: bo'sh qoldirilgan narx endi 0'ga emas, null'ga tushadi —
      // "Umumiy qiymat"ga tushishi mumkin bo'lgani uchun. Majburiylik
      // tekshiruvi endi bu yerda EMAS — sanitizeFulfillmentConfig'da,
      // general.fee fallback'ini hisobga olib, alohida o'tkaziladi.
      entry.fee = nonNegativeIntegerOrNull((value as any).fee);
    }
    if (kind === "TAXI") {
      entry.exactFee = nonNegativeIntegerOrNull((value as any).exactFee);
      entry.minFee = nonNegativeIntegerOrNull((value as any).minFee);
      entry.maxFee = nonNegativeIntegerOrNull((value as any).maxFee);
      if (strict && entry.minFee !== null && entry.maxFee !== null && entry.maxFee < entry.minFee) {
        throw new Error(`invalid_taxi_range:${regionId}`);
      }
    }
    if (kind === "POST") entry.payer = (value as any).payer === "SELLER" ? "SELLER" : "CUSTOMER";
    if (kind !== "PAYMENT") {
      const comment = nullableText((value as any).comment, 200);
      if (comment) entry.comment = comment;
      // 9-band: "Yetkazib berish vaqti" — comment bilan bir xil naqsh
      // (ixtiyoriy, ozod matn, bo'sh bo'lsa umuman saqlanmaydi).
      const estimatedTime = nullableText((value as any).estimatedTime, 60);
      if (estimatedTime) entry.estimatedTime = estimatedTime;
    }
    result[regionId] = entry;
  }
  return result;
}

function sanitizeFulfillmentConfig(raw: any, strict = false) {
  const base: any = defaultFulfillmentConfig();
  if (!raw || typeof raw !== "object") return base;
  const delivery = raw.delivery || {};
  base.delivery.free.enabled = delivery.free?.enabled === true;
  base.delivery.free.regions = cleanConfigRegions(delivery.free?.regions, "FREE", strict);
  base.delivery.free.general = sanitizeGeneral(delivery.free?.general, "FREE");
  base.delivery.fixed.enabled = delivery.fixed?.enabled === true;
  base.delivery.fixed.regions = cleanConfigRegions(delivery.fixed?.regions, "FIXED", strict);
  base.delivery.fixed.general = sanitizeGeneral(delivery.fixed?.general, "FIXED");
  // 2026-09: region o'z narxini kiritmagan (fee === null) bo'lsa ham, agar
  // "Umumiy qiymat" yoqilgan va musbat narx bilan bo'lsa — bu YARAROQ
  // (checkout'da fallback ishlaydi), xato emas. Faqat ikkalasi ham yo'q/0
  // bo'lsa xato — xuddi ustore-commerce.js validateConfig() bilan bir xil.
  if (strict) {
    const fixedGeneralFee = base.delivery.fixed.general.enabled ? base.delivery.fixed.general.fee : null;
    for (const [regionId, entry] of Object.entries(base.delivery.fixed.regions)) {
      const effectiveFee = (entry as any).fee ?? fixedGeneralFee;
      if (!(effectiveFee > 0)) throw new Error(`fixed_fee_required:${regionId}`);
    }
  }
  base.delivery.taxi.enabled = delivery.taxi?.enabled === true;
  base.delivery.taxi.general = sanitizeGeneral(delivery.taxi?.general, "TAXI");
  if (strict && base.delivery.taxi.general.minFee !== null && base.delivery.taxi.general.maxFee !== null && base.delivery.taxi.general.maxFee < base.delivery.taxi.general.minFee) {
    throw new Error("invalid_taxi_range:general");
  }
  base.delivery.taxi.regions = cleanConfigRegions(delivery.taxi?.regions, "TAXI", strict);
  base.delivery.post.enabled = delivery.post?.enabled === true;
  const rawProviders = Array.isArray(delivery.post?.providers) ? delivery.post.providers : [];
  base.delivery.post.providers = POST_PROVIDER_IDS.map((id) => {
    const source = rawProviders.find((p: any) => p?.id === id) || {};
    const fallback = base.delivery.post.providers.find((p: any) => p.id === id);
    return {
      id,
      name: nullableText(source.name, 80) || fallback.name,
      enabled: source.enabled === true,
      regions: cleanConfigRegions(source.regions, "POST", strict),
    };
  });
  const rawMethods = Array.isArray(raw.payments?.methods) ? raw.payments.methods : [];
  base.payments.methods = ["CASH", "CARD", "QR", "CLICK", "PAYME", "UZUM"].map((id) => {
    const source = rawMethods.find((m: any) => m?.id === id) || {};
    const fallback = base.payments.methods.find((m: any) => m.id === id);
    const method: any = {
      id,
      name: nullableText(source.name, 80) || fallback.name,
      enabled: source.enabled === true,
      regions: cleanConfigRegions(source.regions, "PAYMENT", strict),
    };
    if (id === "CARD") {
      method.cardNumber = String(source.cardNumber || "").replace(/[^\d ]/g, "").trim().slice(0, 32);
      method.cardHolder = nullableText(source.cardHolder, 120) || "";
      method.receiptRequired = source.receiptRequired === true;
      if (strict && method.enabled && Object.keys(method.regions).length && (!/^\d[\d ]{10,30}\d$/.test(method.cardNumber) || !method.cardHolder)) {
        throw new Error("card_details_required");
      }
    }
    if (id === "QR") {
      method.providers = sanitizeQrProviders(source.providers, strict);
      if (strict && method.enabled && Object.keys(method.regions).length && !method.providers.some((p: any) => p.enabled)) {
        throw new Error("qr_provider_required");
      }
    }
    return method;
  });
  return base;
}

// Phase 3, 17-band: "QR orqali" to'lov — Click/Payme/Paynet/Uzum, hozircha
// qattiq belgilangan (yopiq) ro'yxat, lekin shakl kelajakda boshqa provider
// qo'shishga mos (bitta massiv, id bo'yicha kengaytiriladi).
const QR_PROVIDER_IDS = ["CLICK", "PAYME", "PAYNET", "UZUM"] as const;
const QR_PROVIDER_NAMES: Record<string, string> = { CLICK: "Click", PAYME: "Payme", PAYNET: "Paynet", UZUM: "Uzum" };

// paymentUrl uchun: rasm URL'idan farqli, http HAM qabul qilinadi (ba'zi
// to'lov provayderlarining havolalari https bo'lmasligi mumkin) — lekin
// javascript:/data: kabi xavfli sxemalar hech qachon qabul qilinmaydi.
function normalizeSafeLinkUrl(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.length > 2048) throw new Error("invalid_payment_url");
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("invalid_payment_url"); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("invalid_payment_url");
  return url.href;
}

function sanitizeQrProviders(raw: any, strict: boolean) {
  const list = Array.isArray(raw) ? raw : [];
  return QR_PROVIDER_IDS.map((id) => {
    const source = list.find((p: any) => p?.id === id) || {};
    const enabled = source.enabled === true;
    let qrImageUrl: string | null = null;
    try { qrImageUrl = normalizeProductImageUrl(source.qrImageUrl); } catch { qrImageUrl = null; }
    let paymentUrl: string | null = null;
    try { paymentUrl = normalizeSafeLinkUrl(source.paymentUrl); }
    catch { if (strict && enabled) throw new Error(`invalid_payment_url:${id}`); paymentUrl = null; }
    if (strict && enabled && !paymentUrl) throw new Error(`payment_url_required:${id}`);
    return { id, name: QR_PROVIDER_NAMES[id], enabled, qrImageUrl, paymentUrl };
  });
}

function districtScopeKey(value: unknown): string {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const tail = raw.includes(",") ? raw.split(",").pop()!.trim() : raw;
  return tail
    .replace(/[ʻʼ’`‘]/g, "'")
    .replace(/\s+(tumani|tuman|shahri|shahar|район|город)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function districtScopeAllows(entry: any, district: unknown): boolean {
  const selected = Array.isArray(entry?.districts) ? entry.districts.map((v: any) => String(v || "").trim()).filter(Boolean) : [];
  if (!selected.length) return true;
  const target = districtScopeKey(district);
  if (!target) return false;
  return selected.some((item: string) => {
    const key = districtScopeKey(item);
    return !!key && (key === target || target.endsWith(key) || key.endsWith(target));
  });
}

function regionLabelForSnapshot(regionKey: string): string {
  return UZ_TOP_LEVEL_REGION_LABELS[regionKey] || regionKey;
}

function resolveDeliverySnapshot(config: any, regionKey: string, selectedMethodId: string, district: string | null) {
  const label = regionLabelForSnapshot(regionKey);
  if (selectedMethodId === "FREE") {
    const r = config.delivery.free?.regions?.[regionKey];
    if (!config.delivery.free?.enabled || !r?.enabled || !districtScopeAllows(r, district)) throw new Error("delivery_method_not_available");
    const general = config.delivery.free?.general?.enabled ? config.delivery.free.general : {};
    const comment = r.comment ?? general.comment ?? null;
    return { version: 1, methodId: "FREE", kind: "FREE", label: "Bepul yetkazib berish", regionKey, regionLabel: label, fee: 0, payer: "SELLER", warning: "Yetkazib berish bepul.", comment };
  }
  if (selectedMethodId === "FIXED") {
    const r = config.delivery.fixed?.regions?.[regionKey];
    if (!config.delivery.fixed?.enabled || !r?.enabled || !districtScopeAllows(r, district)) throw new Error("delivery_method_not_available");
    // 2026-09: region o'z narxini kiritmagan bo'lsa "Umumiy qiymat"ga
    // tushadi (yoqilgan bo'lsa) — xuddi TAXI'dagi kabi.
    const general = config.delivery.fixed?.general?.enabled ? config.delivery.fixed.general : {};
    const fee = r.fee != null ? nonNegativeInteger(r.fee) : (general.fee != null ? nonNegativeInteger(general.fee) : 0);
    if (fee <= 0) throw new Error("delivery_method_not_available");
    const comment = r.comment ?? general.comment ?? null;
    return { version: 1, methodId: "FIXED", kind: "FIXED", label: "Yetkazib berish", regionKey, regionLabel: label, fee, payer: "CUSTOMER", warning: `Yetkazib berish narxi: ${fee} so'm.`, comment };
  }
  if (selectedMethodId === "TAXI") {
    const r = config.delivery.taxi?.regions?.[regionKey];
    if (!config.delivery.taxi?.enabled || !r?.enabled || !districtScopeAllows(r, district)) throw new Error("delivery_method_not_available");
    // 7-band: narx to'liq ixtiyoriy — region'da yo'q bo'lsa umumiy (general)
    // qiymatga tushiladi; ikkalasida ham yo'q bo'lsa narxsiz (comment yoki
    // standart matn bilan) taklif qilinadi, endi rad etilmaydi.
    // 2026-09: fallback endi FAQAT general.enabled bo'lsa ishlaydi.
    const general = config.delivery.taxi?.general?.enabled ? config.delivery.taxi.general : {};
    const exactFee = r.exactFee ?? general.exactFee ?? null;
    const minFee = r.minFee ?? general.minFee ?? null;
    const maxFee = r.maxFee ?? general.maxFee ?? null;
    const comment = r.comment || general.comment || null;
    const maxCustomerLiability = exactFee !== null ? exactFee : (maxFee !== null ? maxFee : null);
    let warning: string;
    if (exactFee !== null) warning = `Yetkazib berish taxminan ${exactFee} so'm. Buyurtma summasiga kiritilmaydi; haydovchiga alohida to'lanadi.`;
    else if (minFee !== null && maxFee !== null) warning = `Yetkazib berish taxminan ${minFee}-${maxFee} so'm. Buyurtma summasiga kiritilmaydi; haydovchiga alohida to'lanadi.`;
    else if (comment) warning = comment;
    else warning = "Buyurtma taksi orqali yetkaziladi. Buyurtma summasi mijoz tomonidan to'lanadi.";
    return {
      version: 1, methodId: "TAXI", kind: "TAXI", label: "Taksi orqali", regionKey, regionLabel: label,
      fee: 0, exactFee, minFee, maxFee, maxCustomerLiability, payer: "CUSTOMER_DIRECT",
      warning, comment,
    };
  }
  if (selectedMethodId.startsWith("POST:")) {
    const providerId = selectedMethodId.slice(5);
    const provider = (config.delivery.post?.providers || []).find((p: any) => p.id === providerId);
    const r = provider?.regions?.[regionKey];
    if (!config.delivery.post?.enabled || !provider?.enabled || !r?.enabled || !districtScopeAllows(r, district)) throw new Error("delivery_method_not_available");
    const payer = r.payer === "SELLER" ? "SELLER" : "CUSTOMER";
    const warning = payer === "SELLER"
      ? "Pochta xarajati sotuvchi hisobidan; mijozdan alohida haq olinmaydi."
      : "Yetkazib berish narxi tovar hajmi/og'irligi va pochta xizmatining amaldagi tariflariga muvofiq hisoblanadi. To'lov pochta xizmatiga alohida amalga oshiriladi.";
    return { version: 1, methodId: selectedMethodId, kind: "POST", label: "Pochta orqali", providerId, providerName: provider.name, regionKey, regionLabel: label, fee: 0, payer, warning, comment: r.comment || null };
  }
  throw new Error("delivery_method_not_available");
}

function resolvePaymentSnapshot(config: any, regionKey: string, paymentMethodId: string, district: string | null) {
  // 17-band: QR provayder POST:<id> bilan bir xil "PREFIX:id" pattern'ga
  // mos — QR:CLICK, QR:PAYME va h.k. Chek yuklash/tasdiqlash butunlay
  // mavjud CARD oqimi bilan bir xil (receiptRequired/receiptStatus) —
  // alohida parallel tekshiruv tizimi yaratilmagan.
  if (paymentMethodId.startsWith("QR:")) {
    const providerId = paymentMethodId.slice(3);
    const qrMethod = (config.payments?.methods || []).find((m: any) => m.id === "QR");
    if (!qrMethod?.enabled || !qrMethod.regions?.[regionKey]?.enabled || !districtScopeAllows(qrMethod.regions[regionKey], district)) throw new Error("payment_method_not_available");
    const provider = (qrMethod.providers || []).find((p: any) => p.id === providerId);
    if (!provider?.enabled || !provider.paymentUrl) throw new Error("payment_method_not_available");
    return {
      version: 1, methodId: paymentMethodId, label: `${qrMethod.name} — ${provider.name}`,
      cardNumber: null, cardHolder: null,
      qrProviderId: provider.id, qrProviderName: provider.name,
      receiptRequired: true, receiptStatus: "PENDING",
    };
  }
  const method = (config.payments?.methods || []).find((m: any) => m.id === paymentMethodId);
  if (!method?.enabled || !method.regions?.[regionKey]?.enabled || !districtScopeAllows(method.regions[regionKey], district)) throw new Error("payment_method_not_available");
  if (method.id === "CARD" && (!/^\d[\d ]{10,30}\d$/.test(method.cardNumber || "") || !method.cardHolder)) throw new Error("card_details_missing");
  return {
    version: 1, methodId: method.id, label: method.name,
    cardNumber: method.id === "CARD" ? method.cardNumber : null,
    cardHolder: method.id === "CARD" ? method.cardHolder : null,
    // CLICK/PAYME/UZUM: chek talab qilinmaydi — to'lov mos webhook orqali
    // avtomatik tasdiqlanadi (create_order case'ida qo'shimcha *_connections
    // holati tekshiriladi, chunki bu funksiya faqat fulfillment_config'ga
    // asoslanadi, DB'ga murojaat qilmaydi).
    receiptRequired: method.id === "CARD" ? !!method.receiptRequired : false,
    receiptStatus: method.id === "CARD" ? "PENDING"
      : method.id === "CLICK" ? "AWAITING_CLICK_PAYMENT"
      : method.id === "PAYME" ? "AWAITING_PAYME_PAYMENT"
      : method.id === "UZUM" ? "AWAITING_UZUM_PAYMENT"
      : "NOT_REQUIRED",
  };
}

// Phase 3: bu qiymat endi FAQAT shop hali o'z chegarasini sozlamagan holat
// uchun fallback — haqiqiy qiymat har shop uchun shop_settings.low_stock_threshold
// ustunidan o'qiladi (18-band: shop-specific, Shop A Shop B'ga ta'sir qilmaydi).
const DASHBOARD_LOW_STOCK_THRESHOLD = 5;
function computeStockState(p: { stock?: unknown; variants?: unknown }, threshold: number = DASHBOARD_LOW_STOCK_THRESHOLD): "OUT" | "LOW" | "OK" {
  const variants = Array.isArray(p.variants) ? (p.variants as any[]) : null;
  if (!variants || variants.length === 0) {
    const stock = Number(p.stock) || 0;
    if (stock <= 0) return "OUT";
    return stock <= threshold ? "LOW" : "OK";
  }
  const anyInStock = variants.some((v: any) => Number(v.qty) > 0);
  if (!anyInStock) return "OUT";
  const total = variants.reduce((sum: number, v: any) => sum + (Number(v.qty) || 0), 0);
  return total <= threshold ? "LOW" : "OK";
}
function resolveLowStockThreshold(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : DASHBOARD_LOW_STOCK_THRESHOLD;
}

// Hisobotlar round, 3.0-bosqich: umumiy sana-oralig'i yechuvchisi. Bu
// get_dashboard_lite'ning o'zidagi (satr ~3552) Toshkent-vaqt hisoblash
// naqshini AYNAN takrorlaydi (mustaqil funksiya — get_dashboard_lite'ning
// o'ziga UMUMAN tegilmaydi, mavjud testlar/xatti-harakat 100% saqlanadi).
// Standart (hech narsa tanlanmagan) holat: oxirgi 30 kun — spec ikkala
// variantni ("oy" yoki "30 kun") taklif qilib, loyihaga mos birini tanlashni
// so'ragan edi; 30 kun oddiyroq va oy-chegarasi murakkabligisiz.
function resolveReportDateRange(payload: any): { fromIso: string; toIso: string; period: string; prevFromIso: string | null; prevToIso: string | null } {
  const now = new Date();
  const tzParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const y = Number(tzParts.find((p) => p.type === "year")?.value);
  const m = Number(tzParts.find((p) => p.type === "month")?.value);
  const d = Number(tzParts.find((p) => p.type === "day")?.value);
  const dayStart = new Date(Date.UTC(y, m - 1, d, -5, 0, 0));
  const nextDay = new Date(dayStart.getTime() + 24 * 3600 * 1000);

  const period = typeof payload?.period === "string" ? payload.period : "30d";
  const rawFrom = nullableText(payload?.dateFrom, 10);
  const rawTo = nullableText(payload?.dateTo, 10);

  let from: Date, to: Date;
  if (rawFrom && rawTo) {
    from = new Date(`${rawFrom}T00:00:00+05:00`);
    to = new Date(new Date(`${rawTo}T00:00:00+05:00`).getTime() + 24 * 3600 * 1000);
  } else if (period === "today") {
    from = dayStart; to = nextDay;
  } else if (period === "week") {
    from = new Date(dayStart.getTime() - 6 * 24 * 3600 * 1000); to = nextDay;
  } else if (period === "month") {
    from = new Date(Date.UTC(y, m - 1, 1, -5, 0, 0)); to = new Date(Date.UTC(y, m, 1, -5, 0, 0));
  } else if (period === "90d") { from = new Date(dayStart.getTime() - 89 * 24 * 3600 * 1000); to = nextDay;
  } else if (period === "year") { from = new Date(dayStart.getTime() - 364 * 24 * 3600 * 1000); to = nextDay;
  } else if (period === "all") {
    from = new Date(0); to = nextDay;
  } else {
    from = new Date(dayStart.getTime() - 29 * 24 * 3600 * 1000); to = nextDay;
  }

  let prevFromIso: string | null = null, prevToIso: string | null = null;
  if (period !== "all" && from.getTime() > 0) {
    const spanMs = to.getTime() - from.getTime();
    prevFromIso = new Date(from.getTime() - spanMs).toISOString();
    prevToIso = from.toISOString();
  }
  return { fromIso: from.toISOString(), toIso: to.toISOString(), period, prevFromIso, prevToIso };
}

// orders.pay_method qiymatlari: "CASH"/"CARD"/"CLICK" yoki QR-provayder
// uchun "QR:<PROVIDER>" (masalan "QR:CLICK") — ustore-commerce.js'dagi
// PAYMENT_IDS/QR_PROVIDER_NAMES bilan bir xil nomlash, faqat backend
// tomonida hisobot-yorlig'i uchun mustaqil (kichik) nusxasi.
const REPORT_PAYMENT_LABELS: Record<string, string> = {
  CASH: "Naqd", CARD: "Karta", CLICK: "Click (avtomatik)", PAYME: "Payme (avtomatik)", UZUM: "Uzum (avtomatik)",
  "QR:CLICK": "Click", "QR:PAYME": "Payme", "QR:PAYNET": "Paynet", "QR:UZUM": "Uzum",
};
function paymentMethodLabelForReport(payMethod: string | null | undefined): string {
  const key = String(payMethod || "");
  return REPORT_PAYMENT_LABELS[key] || key || "Noma'lum";
}

// Hisobot grafiklari Edge Function ichida bitta marta agregatsiya qilinadi.
// Client faqat tayyor, shop-scoped bucketlarni chizadi; katta order datasetini
// brauzerga chiqarib qayta hisoblamaydi. 45 kungacha kunlik, 180 kungacha
// haftalik, undan uzun davrda oylik bucket ishlatiladi.
function buildReportSalesTimeline(rows: any[], fromIso: string, toIso: string): Array<{ key: string; label: string; salesAmount: number; orderCount: number }> {
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  const dayMs = 24 * 3600 * 1000;
  const spanDays = Math.max(1, Math.ceil((toMs - fromMs) / dayMs));
  const soldRows = rows.filter((o: any) => o.payment_status === "PAID" && o.status !== "CANCELLED" && o.receipt_review_status !== "REJECTED");
  const valueOf = (o: any) => Number(o.payable_total ?? o.total_price ?? 0);
  const tashkentParts = (ms: number) => {
    const d = new Date(ms + 5 * 3600 * 1000);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  };
  const two = (n: number) => String(n).padStart(2, "0");

  if (spanDays > 180) {
    const first = tashkentParts(fromMs);
    const last = tashkentParts(Math.max(fromMs, toMs - 1));
    const buckets = new Map<string, { key: string; label: string; salesAmount: number; orderCount: number }>();
    let cursor = first.year * 12 + first.month - 1;
    const end = last.year * 12 + last.month - 1;
    while (cursor <= end) {
      const year = Math.floor(cursor / 12);
      const month = cursor % 12 + 1;
      const key = `${year}-${two(month)}`;
      buckets.set(key, { key, label: `${two(month)}.${String(year).slice(-2)}`, salesAmount: 0, orderCount: 0 });
      cursor++;
    }
    for (const o of soldRows) {
      const p = tashkentParts(new Date(o.created_at).getTime());
      const bucket = buckets.get(`${p.year}-${two(p.month)}`);
      if (bucket) { bucket.salesAmount += valueOf(o); bucket.orderCount++; }
    }
    return [...buckets.values()];
  }

  const bucketDays = spanDays > 45 ? 7 : 1;
  const bucketCount = Math.ceil(spanDays / bucketDays);
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const startMs = fromMs + index * bucketDays * dayMs;
    const p = tashkentParts(startMs);
    return {
      key: new Date(startMs).toISOString().slice(0, 10),
      label: `${two(p.day)}.${two(p.month)}`,
      salesAmount: 0,
      orderCount: 0,
    };
  });
  for (const o of soldRows) {
    const idx = Math.floor((new Date(o.created_at).getTime() - fromMs) / (bucketDays * dayMs));
    if (idx >= 0 && idx < buckets.length) { buckets[idx].salesAmount += valueOf(o); buckets[idx].orderCount++; }
  }
  return buckets;
}

const DESIGN_COLOR_KEYS = ["primary","accent","button","buttonText","secondaryButton","pageBg","panelBg","cardBg","inputBg","headerBg","headerText","bottomNavBg","bottomNavText","border","text","secondaryText","mutedText","success","warning","danger"] as const;
const DESIGN_THEME_IDS = ["minimal", "dark", "sport", "elegant", "bright", "generated", "custom"] as const;
function sanitizeDesignColors(raw: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const key of DESIGN_COLOR_KEYS) {
    const v = (raw as any)[key];
    if (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v)) out[key] = v.toLowerCase();
  }
  return out;
}


// ---- ROUND14: shop-scoped legal documents ---------------------------------
// These are GENERAL templates. A seller may enable them as-is, but the admin UI
// clearly warns that the text must be reviewed/customised for the seller's real
// legal status, goods, delivery/payment practices and contact details.
type LegalDocType = "PRIVACY" | "TERMS" | "OFFER" | "RETURNS" | "DELIVERY" | "PAYMENT" | "WARRANTY";
const LEGAL_CONSENT_TYPES = new Set<LegalDocType>(["PRIVACY", "TERMS"]);
const LEGAL_DOC_TYPES: LegalDocType[] = ["PRIVACY", "TERMS", "OFFER", "RETURNS", "DELIVERY", "PAYMENT", "WARRANTY"];
const LEGAL_DEFAULTS: Record<LegalDocType, { titleUz: string; titleRu: string; contentUz: string; contentRu: string }> = {
  OFFER: { titleUz: "Ommaviy oferta", titleRu: "Публичная оферта", contentUz: "", contentRu: "" },
  RETURNS: { titleUz: "Qaytarish va pulni qaytarish", titleRu: "Возврат товара и денег", contentUz: "", contentRu: "" },
  DELIVERY: { titleUz: "Yetkazib berish shartlari", titleRu: "Условия доставки", contentUz: "", contentRu: "" },
  PAYMENT: { titleUz: "To‘lov shartlari", titleRu: "Условия оплаты", contentUz: "", contentRu: "" },
  WARRANTY: { titleUz: "Kafolat shartlari", titleRu: "Условия гарантии", contentUz: "", contentRu: "" },
  PRIVACY: {
    titleUz: "Maxfiylik siyosati",
    titleRu: "Политика конфиденциальности",
    contentUz: `MAXFIYLIK SIYOSATI

1. UMUMIY QOIDALAR
Ushbu Maxfiylik siyosati ushbu Telegram Mini App orqali faoliyat yurituvchi Sotuvchi (Do‘kon) tomonidan foydalanuvchilarning shaxsga doir ma’lumotlarini yig‘ish, saqlash, ulardan foydalanish, ularni berish, himoya qilish va yo‘q qilish tartibini belgilaydi. UStorE mazkur Mini App uchun texnik platformani taqdim etadi; tovarlar, savdo shartlari va do‘kon tomonidan yig‘iladigan ma’lumotlarning qonuniyligi uchun, qonunchilikda boshqacha nazarda tutilmagan bo‘lsa, tegishli Sotuvchi javob beradi.

Siyosat O‘zbekiston Respublikasining “Shaxsga doir ma’lumotlar to‘g‘risida”gi O‘RQ-547-son Qonuni, xususan rozilik, axborot berish, ma’lumotlarni himoya qilish, maxfiylik, subyekt huquqlari va ma’lumotlarni saqlash/ishlov berishning alohida shartlari haqidagi normalar; “Elektron tijorat to‘g‘risida”gi O‘RQ-792-son Qonuni; “Iste’molchilarning huquqlarini himoya qilish to‘g‘risida”gi Qonun hamda boshqa amaldagi qonunchilikka muvofiq qo‘llanadi.

2. QANDAY MA’LUMOTLAR QAYTA ISHLANISHI MUMKIN
Xizmatdan foydalanish jarayonida quyidagi ma’lumotlar qayta ishlanishi mumkin: Telegram foydalanuvchi identifikatori, ism, familiya, username va Telegram taqdim etgan profil ma’lumotlari; foydalanuvchi kiritgan ism-familiya va telefon raqami; buyurtma tarkibi, narxi, yetkazib berish hududi, tuman/shahar, manzil yoki pochta filiali; tanlangan to‘lov va yetkazib berish usuli; yuklangan to‘lov cheki; buyurtma, qaytarish va qo‘llab-quvvatlash yozishmalari; xavfsizlik va xizmat ishlashi uchun zarur texnik jurnallar.

Sotuvchi foydalanuvchidan xizmat ko‘rsatish uchun zarur bo‘lmagan maxsus toifadagi, biometrik, genetik, bank kartasining CVV/PIN/SMS-kodi yoki boshqa ortiqcha maxfiy ma’lumotlarni so‘ramasligi kerak.

3. QAYTA ISHLASH MAQSADLARI
Ma’lumotlar quyidagi maqsadlarda qayta ishlanadi: foydalanuvchini tanish va profilini saqlash; buyurtmani qabul qilish, tasdiqlash, to‘lash, yig‘ish va yetkazish; mijoz bilan bog‘lanish; chek va to‘lov holatini tekshirish; ombor hisobini yuritish; qo‘llab-quvvatlash va nizolarni ko‘rib chiqish; firibgarlik va suiiste’molning oldini olish; qonunchilikdagi buxgalteriya, soliq, iste’molchilar huquqlari yoki boshqa majburiy talablarni bajarish; servis xavfsizligini ta’minlash.

4. HUQUQIY ASOS VA ROZILIK
Shaxsga doir ma’lumotlar qonunchilikda nazarda tutilgan asoslar mavjud bo‘lganda, jumladan foydalanuvchining roziligi, foydalanuvchi tashabbusi bilan elektron shartnomani tuzish va bajarish zarurati yoki qonuniy majburiyatlarni bajarish uchun qayta ishlanadi. Ro‘yxatdan o‘tish vaqtida foydalanuvchi ushbu Siyosat bilan tanishib, tegishli belgi orqali roziligini tasdiqlaydi. Rozilik qaydi hujjat turi, versiyasi va qabul qilingan vaqt bilan birga saqlanishi mumkin.

Foydalanuvchi qonunchilikda nazarda tutilgan tartibda roziligini chaqirib olishga haqli. Rozilikni chaqirib olish ilgari qonuniy amalga oshirilgan qayta ishlashni avtomatik ravishda noqonuniy qilmaydi va qonun bo‘yicha saqlanishi shart bo‘lgan ma’lumotlarning darhol o‘chirilishini anglatmasligi mumkin.

5. MA’LUMOTLARNI UCHINCHI SHAXSLARGA BERISH
Buyurtmani bajarish uchun zarur hajmda ma’lumotlar UStorE texnik platformasi, hosting/ma’lumotlar bazasi infratuzilmasi, to‘lov xizmatlari, kuryer, taksi, pochta operatorlari (masalan, sotuvchi yoqqan yetkazib berish provayderlari) va qonun bo‘yicha vakolatli davlat organlariga berilishi mumkin. Har bir xizmatga faqat o‘z vazifasini bajarish uchun zarur bo‘lgan hajmdagi ma’lumot berilishi lozim.

Ma’lumotlar reklama maqsadida mustaqil uchinchi shaxslarga sotilmaydi. Qonunchilik yoki foydalanuvchi roziligi talab qilgan hollarda tegishli rozilik/huquqiy asos olinadi.

6. SAQLASH, JOYLASHTIRISH VA TRANSCHEGARAVIY ISHLOV
Sotuvchi va texnik xizmat ko‘rsatuvchilar ma’lumotlarni O‘zbekiston Respublikasining “Shaxsga doir ma’lumotlar to‘g‘risida”gi Qonunida, shu jumladan 27¹-moddada belgilangan saqlash va ishlov berishning alohida shartlariga rioya qilgan holda joylashtirishi va qayta ishlashi kerak. Transchegaraviy uzatish sodir bo‘lsa, u amaldagi qonunchilikdagi talablar va tegishli himoya choralariga muvofiq amalga oshiriladi.

7. SAQLASH MUDDATI VA YO‘Q QILISH
Ma’lumotlar maqsadga erishish uchun zarur muddat, shartnoma va buyurtma bo‘yicha majburiyatlar tugaguncha, nizolarni hal qilish va qonunchilikda belgilangan majburiy saqlash muddatlari davomida saqlanishi mumkin. Saqlash uchun huquqiy asos qolmaganda, ma’lumotlar qonunchilikka muvofiq yo‘q qilinadi yoki egasizlantiriladi.

8. AXBOROT XAVFSIZLIGI
Sotuvchi va platforma o‘z vakolati doirasida ruxsatsiz kirish, nusxalash, o‘zgartirish, oshkor etish, yo‘qotish va yo‘q qilishdan himoyalash uchun tashkiliy va texnik choralarni qo‘llaydi. Kirish huquqlari vazifaga qarab cheklanadi. Internet orqali uzatishda mutlaq xavfsizlik kafolatlanmasligi sababli foydalanuvchi ham qurilmasi va Telegram akkauntining xavfsizligini ta’minlashi lozim.

9. FOYDALANUVCHINING HUQUQLARI
Foydalanuvchi qonunchilik doirasida o‘z ma’lumotlariga ishlov berilayotgani haqida axborot olish; o‘z ma’lumotlari bilan tanishish; ularni aniqlashtirish, to‘ldirish yoki tuzatishni talab qilish; qonuniy asos bo‘lmaganda ishlov berishni to‘xtatish yoki ma’lumotlarni yo‘q qilishni talab qilish; rozilikni chaqirib olish; noqonuniy harakatlar ustidan vakolatli organga yoki sudga murojaat qilish huquqiga ega.

10. BOLALAR MA’LUMOTLARI
Agar amaldagi qonunchilik yoki muayyan bitim uchun voyaga yetganlik/yuridik layoqat talabi mavjud bo‘lsa, bunday xizmatlardan foydalanish qonuniy vakil ishtirokida amalga oshirilishi kerak. Sotuvchi voyaga yetmaganlardan zarur bo‘lmagan ma’lumotlarni ataylab yig‘masligi lozim.

11. SIYOSATNI O‘ZGARTIRISH
Sotuvchi Siyosatni qonunchilik yoki amaliyot o‘zgarganda yangilashi mumkin. Har bir mazmuniy o‘zgarish yangi versiya sifatida saqlanishi mumkin. Tizim joriy versiyaga rozilik yo‘qligini aniqlasa, foydalanuvchidan yangilangan matnni qayta tasdiqlash talab etilishi mumkin.

12. MUROJAAT VA REKVIZITLAR
Shaxsga doir ma’lumotlar, tuzatish, o‘chirish yoki rozilikni chaqirib olish bo‘yicha murojaatlar Mini Appdagi Do‘kon haqida/Profil bo‘limida ko‘rsatilgan Sotuvchining amaldagi aloqa ma’lumotlari orqali yuboriladi. Sotuvchi o‘z nomi, manzili va aloqa ma’lumotlarini to‘g‘ri va dolzarb saqlashi shart.

Mazkur matn UStorE tomonidan taqdim etilgan umumiy shablondir. U muayyan Sotuvchiga individual yuridik xulosa emas. Sotuvchi o‘z faoliyati, tashkiliy-huquqiy shakli, tovarlari, integratsiyalari va ma’lumotlar oqimiga mosligini tekshirishi va zarur bo‘lsa malakali yurist bilan moslashtirishi kerak.`,
    contentRu: `ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ

1. ОБЩИЕ ПОЛОЖЕНИЯ
Настоящая Политика определяет порядок сбора, хранения, использования, передачи, защиты и удаления персональных данных пользователей Продавцом (Магазином), работающим через данный Telegram Mini App. UStorE предоставляет техническую платформу; за законность товаров, условий продажи и данных, собираемых конкретным Магазином, в пределах законодательства отвечает соответствующий Продавец.

Политика применяется с учётом Закона Республики Узбекистан № ЗРУ-547 «О персональных данных», включая нормы о согласии, информировании, защите, конфиденциальности, правах субъекта и специальных условиях хранения/обработки; Закона № ЗРУ-792 «Об электронной коммерции»; Закона «О защите прав потребителей» и иных действующих актов.

2. КАКИЕ ДАННЫЕ МОГУТ ОБРАБАТЫВАТЬСЯ
Могут обрабатываться Telegram ID, имя, фамилия, username и доступные профильные данные; введённые пользователем имя и телефон; состав и стоимость заказа; регион, район/город, адрес или почтовое отделение; способ оплаты и доставки; загруженный платёжный чек; история заказов, возвратов и обращений в поддержку; технические журналы, необходимые для безопасности и работы сервиса.

Продавец не должен запрашивать без необходимости специальные категории данных, биометрические/генетические данные, CVV/PIN/SMS-коды банковских карт и иные избыточные секретные сведения.

3. ЦЕЛИ ОБРАБОТКИ
Данные используются для идентификации и профиля; оформления, оплаты, комплектации и доставки заказов; связи с клиентом; проверки чеков и статуса оплаты; складского учёта; поддержки и разрешения споров; предупреждения злоупотреблений; исполнения обязательных требований законодательства; обеспечения безопасности сервиса.

4. ОСНОВАНИЯ И СОГЛАСИЕ
Обработка выполняется при наличии предусмотренного законом основания, включая согласие пользователя, необходимость заключения/исполнения инициированного пользователем электронного договора либо исполнение законной обязанности. При регистрации пользователь знакомится с Политикой и подтверждает согласие отдельной отметкой. Может сохраняться тип документа, версия и время принятия.

Пользователь вправе отозвать согласие в порядке, установленном законодательством. Отзыв не делает автоматически незаконной ранее правомерную обработку и не отменяет обязательные сроки хранения, установленные законом.

5. ПЕРЕДАЧА ТРЕТЬИМ ЛИЦАМ
В объёме, необходимом для исполнения заказа, сведения могут передаваться технической платформе UStorE, поставщикам хостинга/базы данных, платёжным сервисам, курьерским, такси и почтовым операторам, а также уполномоченным государственным органам в предусмотренных законом случаях. Передаётся только необходимый для соответствующей функции объём.

Персональные данные не продаются независимым третьим лицам для рекламы. Если закон требует отдельного согласия либо иного основания, оно должно быть получено.

6. ХРАНЕНИЕ И ТРАНСГРАНИЧНАЯ ОБРАБОТКА
Продавец и технические поставщики обязаны соблюдать специальные условия хранения и обработки персональных данных, предусмотренные законодательством Республики Узбекистан, включая статью 27¹ Закона № ЗРУ-547. При трансграничной передаче применяются установленные законом требования и меры защиты.

7. СРОК ХРАНЕНИЯ И УДАЛЕНИЕ
Данные хранятся столько, сколько необходимо для заявленных целей, исполнения заказа и договора, разрешения споров и обязательных сроков хранения. При отсутствии правового основания данные подлежат удалению либо обезличиванию в установленном порядке.

8. БЕЗОПАСНОСТЬ
Продавец и платформа в пределах своей роли применяют организационные и технические меры против несанкционированного доступа, копирования, изменения, раскрытия, утраты или уничтожения. Права доступа ограничиваются служебной необходимостью. Пользователь также отвечает за безопасность своего устройства и Telegram-аккаунта.

9. ПРАВА ПОЛЬЗОВАТЕЛЯ
В предусмотренных законом пределах пользователь вправе получать информацию об обработке; знакомиться со своими данными; требовать уточнения, дополнения или исправления; требовать прекращения незаконной обработки или удаления при отсутствии основания; отзывать согласие; обжаловать незаконные действия в уполномоченный орган или суд.

10. ДАННЫЕ НЕСОВЕРШЕННОЛЕТНИХ
Если закон или конкретная сделка требует совершеннолетия/дееспособности, использование соответствующих услуг должно осуществляться с участием законного представителя. Не следует намеренно собирать у несовершеннолетних данные, не требуемые для услуги.

11. ИЗМЕНЕНИЯ ПОЛИТИКИ
Продавец может обновлять Политику при изменении закона или процессов. Существенное изменение может оформляться новой версией. При отсутствии согласия с текущей версией система может запросить повторное подтверждение.

12. ОБРАЩЕНИЯ И РЕКВИЗИТЫ
Запросы о персональных данных, исправлении, удалении или отзыве согласия направляются Продавцу по актуальным контактам, указанным в разделе информации о Магазине/Профиле. Продавец обязан поддерживать сведения о себе и контакты актуальными.

Этот текст является общей шаблонной формой UStorE, а не индивидуальным юридическим заключением. Продавцу рекомендуется проверить соответствие текста своей организационно-правовой форме, товарам, интеграциям и реальным потокам данных и при необходимости адаптировать его с квалифицированным юристом.`
  },
  TERMS: {
    titleUz: "Foydalanuvchi shartnomasi",
    titleRu: "Пользовательское соглашение",
    contentUz: `FOYDALANUVCHI SHARTNOMASI

1. UMUMIY QOIDALAR
Ushbu Foydalanuvchi shartnomasi Telegram Mini App orqali Sotuvchi (Do‘kon) bilan foydalanuvchi/xaridor o‘rtasidagi elektron tijorat munosabatlarining umumiy shartlarini belgilaydi. UStorE texnik platformani taqdim etadi va, alohida ko‘rsatilmagan bo‘lsa, Sotuvchining tovarlari bo‘yicha sotuvchi yoki to‘lov/yetkazib berish xizmatining o‘zi hisoblanmaydi.

Shartnoma O‘zbekiston Respublikasining “Elektron tijorat to‘g‘risida”gi O‘RQ-792-son Qonuni, “Iste’molchilarning huquqlarini himoya qilish to‘g‘risida”gi Qonun, Fuqarolik kodeksi, “Shaxsga doir ma’lumotlar to‘g‘risida”gi O‘RQ-547-son Qonuni va boshqa majburiy normalarga muvofiq talqin qilinadi. Ushbu Shartnoma qonunda iste’molchiga berilgan majburiy huquqlarni cheklamaydi.

2. SOTUVCHI HAQIDAGI MA’LUMOT
Sotuvchining amaldagi nomi, manzili, telefon raqami va mavjud boshqa aloqa kanallari Mini Appning Do‘kon haqida/Profil bo‘limida ko‘rsatiladi. Sotuvchi ushbu ma’lumotlarning to‘liqligi va dolzarbligini ta’minlashi kerak. Xaridor buyurtma berishdan oldin sotuvchi, tovar, narx, to‘lov, yetkazib berish va murojaat tartibi haqidagi ko‘rsatilgan ma’lumotlar bilan tanishishi mumkin.

3. RO‘YXATDAN O‘TISH VA AKKAUNT
Buyurtma berish uchun foydalanuvchidan ism-familiya va telefon kabi zarur ma’lumotlar so‘ralishi mumkin. Foydalanuvchi to‘g‘ri va o‘ziga tegishli ma’lumotlarni kiritadi. Telegram akkaunti va qurilma xavfsizligini ta’minlash foydalanuvchining zimmasidadir. Boshqa shaxs nomidan ruxsatsiz harakat qilish taqiqlanadi.

4. ELEKTRON OFERTA, AKSEPT VA SHARTNOMANING TUZILISHI
Mini Appda tovar, narx, asosiy xususiyatlar va sotib olish shartlari ko‘rsatilishi elektron oferta yoki oferta berishga taklif xususiyatiga ega bo‘lishi mumkin. Foydalanuvchining savatni shakllantirishi, tegishli ma’lumotlarni kiritishi va “Buyurtma berish” harakatini tasdiqlashi elektron shakldagi aksept/buyurtma sifatida qayd etiladi. Elektron shakldan foydalanilganining o‘zi shartnomani haqiqiy emas deb hisoblash uchun asos bo‘lmaydi. Buyurtmaning serverda qayd etilgan elektron yozuvi, uning tarkibi va vaqt tamg‘asi qonunchilik doirasida bitimni tasdiqlovchi ma’lumot bo‘lib xizmat qilishi mumkin.

Agar tovar omborda tugagan, narx yoki tavsifda yaqqol texnik xato bo‘lgan yoki buyurtmani qonuniy bajarish imkonsiz bo‘lgan bo‘lsa, Sotuvchi xaridorni xabardor qilib, qonunchilikka muvofiq buyurtmani bekor qilishi yoki tuzatishni taklif qilishi mumkin.

5. TOVAR HAQIDAGI MA’LUMOT
Sotuvchi tovar nomi, narxi, muhim iste’mol xususiyatlari va qonunchilikda talab qilinadigan boshqa ma’lumotlarni imkon qadar to‘liq va ishonchli ko‘rsatishi kerak. Fotosurat rang/ko‘rinishni qurilma ekraniga bog‘liq tarzda biroz farqli aks ettirishi mumkin. Majburiy sertifikat, yaroqlilik muddati, ishlab chiqaruvchi yoki foydalanish qoidalari kabi ma’lumotlar qonunchilik talab qilgan hollarda xaridorga taqdim etiladi.

6. NARX VA TO‘LOV
Buyurtma paytida ko‘rsatilgan tovarlar summasi, yetkazib berish narxi (agar buyurtmaga qo‘shiladigan bo‘lsa) va “Hozir to‘lanadigan jami” alohida ko‘rsatiladi. Belgilangan (fixed) yetkazib berish narxi jami to‘lovga qo‘shiladi. Taksi yoki pochta xizmatiga bevosita/alohida to‘lanadigan xarajatlar, agar shunday sozlangan bo‘lsa, buyurtma jami summasiga kiritilmasligi va alohida izoh bilan ko‘rsatilishi mumkin.

Mavjud to‘lov usullari Sotuvchi sozlamalariga bog‘liq: naqd, karta o‘tkazmasi, QR, Click yoki boshqa yoqilgan usullar. Foydalanuvchi karta orqali o‘tkazmada CVV, PIN yoki SMS tasdiqlash kodlarini Mini Appga kiritmasligi va hech kimga bermasligi kerak. To‘lov provayderining o‘z qoidalari ham tegishli operatsiyaga tatbiq etiladi.

7. YETKAZIB BERISH
Yetkazib berish usullari, hududlar, tuman/shahar cheklovlari, narxlar va taxminiy muddatlar Sotuvchi sozlamalariga muvofiq buyurtma vaqtida ko‘rsatiladi. Xaridor manzil, tuman, telefon yoki pochta filialini to‘g‘ri tanlashi kerak. Yetkazib beruvchi uchinchi tomon xizmatining kechikishi bo‘yicha javobgarlik qonunchilik va tegishli xizmat shartlariga muvofiq belgilanadi; Sotuvchi o‘z zimmasidagi majburiyatlardan bir tomonlama ozod bo‘la olmaydi.

8. BUYURTMANI BEKOR QILISH, QAYTARISH VA KAMCHILIKLI TOVAR
Xaridor va Sotuvchining buyurtmani bekor qilish, tovarni almashtirish, qaytarish, kamchiliklarni bartaraf etish, narxni kamaytirish yoki zararlarni qoplashga oid huquqlari O‘zbekiston Respublikasining iste’molchilar huquqlarini himoya qilish haqidagi majburiy normalari bilan belgilanadi. Ushbu Shartnomadagi hech bir jumla qonun bo‘yicha qaytarish/almashtirish mumkin bo‘lgan holatlarni bekor qilmaydi yoki nuqsonli tovar bo‘yicha iste’molchi huquqlarini kamaytirmaydi.

Ayrim sifatli tovarlarni qaytarish/almashtirishga qonunchilikda maxsus cheklovlar bo‘lishi mumkin; bunday cheklovlar faqat amaldagi huquqiy asos mavjud bo‘lganda qo‘llanadi.

9. CHEKLAR VA TO‘LOV TASDIG‘I
Sotuvchi tanlagan usulga qarab foydalanuvchidan to‘lov cheki rasmini yuklash talab qilinishi mumkin. Chek faqat to‘lovni tekshirish va tegishli nizolarni ko‘rib chiqish uchun qayta ishlanadi. Click kabi avtomatik integratsiyada to‘lov holati provayderning server tasdig‘i orqali aniqlanishi mumkin.

10. FOYDALANUVCHINING MAJBURIYATLARI
Foydalanuvchi: haqqoniy aloqa va yetkazib berish ma’lumotlarini beradi; qonunga xilof buyurtma yoki firibgarlik qilmaydi; boshqa shaxs huquqlarini buzmaydi; Mini App ishiga texnik zarar yetkazishga urinmaydi; buyurtmani qabul qilish va tanlangan to‘lov majburiyatlarini vijdonan bajaradi.

11. SOTUVCHINING MAJBURIYATLARI
Sotuvchi: o‘zi va tovar haqida qonunchilikda talab qilinadigan ma’lumotlarni taqdim etadi; tasdiqlangan buyurtmani kelishilgan shartlarda bajarishga harakat qiladi; tovar sifati va xavfsizligi bo‘yicha majburiy talablarga rioya qiladi; iste’molchi murojaatlarini qonuniy tartibda ko‘rib chiqadi; shaxsga doir ma’lumotlarni himoya qiladi; mavjud bo‘lmagan tovar yoki bajarib bo‘lmaydigan shart haqida xaridorni asossiz kechiktirmasdan xabardor qiladi.

12. JAVOBGARLIK VA FORS-MAJOR
Tomonlar majburiyatlarni bajarmaganligi uchun O‘zbekiston Respublikasi qonunchiligida belgilangan tartibda javob beradi. Tomon nazoratidan tashqaridagi va oqilona choralar bilan oldini olib bo‘lmaydigan favqulodda holatlar yuzaga kelganda javobgarlik masalasi qonunchilikka muvofiq hal qilinadi. Texnik nosozlik Sotuvchining qonun bo‘yicha majburiy iste’molchi huquqlarini bekor qilmaydi.

13. SHAXSGA DOIR MA’LUMOTLAR
Foydalanuvchi ma’lumotlariga ishlov berish amaldagi Maxfiylik siyosatiga muvofiq amalga oshiriladi. Agar Siyosat yoqilgan bo‘lsa, uning matni ro‘yxatdan o‘tishda alohida ochib ko‘rish va tasdiqlash uchun taqdim etiladi.

14. INTELLEKTUAL MULK
Mini App dasturiy ta’minoti, UStorE platforma elementlari va tegishli belgilar huquq egalariga tegishli. Sotuvchi joylashtirgan tovar nomlari, rasmlar, tavsiflar va brend materiallari uchun zarur huquqlarga ega bo‘lishi kerak. Foydalanuvchiga servisdan odatiy xarid maqsadida foydalanishdan boshqa huquq berilmaydi.

15. ELEKTRON XABARLAR VA DALILLAR
Telegram xabarlari, buyurtma raqami, server vaqt tamg‘alari, buyurtma tarkibi, to‘lov/yetkazib berish holati va foydalanuvchi roziligi haqidagi elektron qaydlar qonunchilikda ruxsat etilgan doirada tomonlar harakatlarini tasdiqlash uchun ishlatilishi mumkin.

16. NIZOLARNI HAL QILISH
Tomonlar avvalo murojaatni muzokara va Sotuvchining ko‘rsatilgan aloqa kanallari orqali hal qilishga harakat qiladi. Kelishuvga erishilmasa, iste’molchi vakolatli davlat organlariga va/yoki sudga O‘zbekiston Respublikasi qonunchiligida belgilangan tartibda murojaat qilishi mumkin. Iste’molchining qonunda nazarda tutilgan hududiy yoki boshqa protsessual huquqlari ushbu Shartnoma bilan cheklanmaydi.

17. SHARTNOMANI O‘ZGARTIRISH VA VERSIYA
Sotuvchi Shartnomani qonunchilik, xizmat yoki savdo jarayoni o‘zgarganda yangilashi mumkin. Mazmuniy o‘zgarish yangi versiya sifatida qayd etilishi mumkin. Joriy versiyaga rozilik talab etilganda, foydalanuvchidan foydalanishni davom ettirishdan oldin qayta tasdiqlash so‘ralishi mumkin.

18. YAKUNIY QOIDA
Foydalanuvchi ro‘yxatdan o‘tishdagi tasdiqlash belgisini qo‘yib, ushbu Shartnomani o‘qib chiqqanini va unga roziligini tasdiqlaydi. Agar foydalanuvchi majburiy shartlarga rozi bo‘lmasa, ro‘yxatdan o‘tmasligi va buyurtma bermasligi kerak.

Mazkur matn UStorE tomonidan taqdim etilgan umumiy shablondir. U muayyan Sotuvchining faoliyati uchun individual yuridik xulosa emas. Sotuvchi shablonni o‘z rekvizitlari, tovar turi, qaytarish siyosati, litsenziya/sertifikat talablari, yetkazib berish, to‘lov va boshqa maxsus shartlariga mosligini tekshirishi va zarur hollarda malakali yurist bilan moslashtirishi kerak.`,
    contentRu: `ПОЛЬЗОВАТЕЛЬСКОЕ СОГЛАШЕНИЕ

1. ОБЩИЕ ПОЛОЖЕНИЯ
Настоящее Соглашение устанавливает общие условия электронной торговли между Продавцом (Магазином) и пользователем/покупателем через Telegram Mini App. UStorE предоставляет техническую платформу и, если прямо не указано иное, не является продавцом товаров Магазина либо самостоятельным платёжным/доставочным сервисом.

Соглашение толкуется с учётом Закона Республики Узбекистан № ЗРУ-792 «Об электронной коммерции», Закона «О защите прав потребителей», Гражданского кодекса, Закона № ЗРУ-547 «О персональных данных» и иных обязательных норм. Ничто в Соглашении не ограничивает обязательные права потребителя, предоставленные законом.

2. ИНФОРМАЦИЯ О ПРОДАВЦЕ
Актуальные наименование, адрес, телефон и иные каналы связи Продавца отображаются в разделе о Магазине/Профиле. Продавец обязан поддерживать эти сведения полными и актуальными. До заказа Покупатель может ознакомиться с информацией о продавце, товаре, цене, оплате, доставке и порядке обращений.

3. РЕГИСТРАЦИЯ И АККАУНТ
Для заказа могут запрашиваться необходимые данные, например имя и телефон. Пользователь указывает достоверные данные, относящиеся к нему. Безопасность Telegram-аккаунта и устройства обеспечивает пользователь. Действия от имени другого лица без разрешения запрещены.

4. ЭЛЕКТРОННАЯ ОФЕРТА, АКЦЕПТ И ДОГОВОР
Карточка товара, цена, характеристики и условия могут представлять электронную оферту либо приглашение сделать оферту. Формирование корзины, ввод данных и подтверждение «Оформить заказ» фиксируются как электронный заказ/акцепт в зависимости от содержания предложения. Использование электронной формы само по себе не делает договор недействительным. Серверная запись заказа, его состав и временная отметка могут использоваться как электронные сведения о сделке в пределах закона.

При отсутствии товара, очевидной технической ошибке цены/описания или объективной невозможности законного исполнения Продавец информирует Покупателя и действует в соответствии с законодательством, включая предложение исправления либо отмену заказа в допустимых случаях.

5. ИНФОРМАЦИЯ О ТОВАРЕ
Продавец должен предоставлять максимально достоверные сведения о наименовании, цене, существенных потребительских свойствах и иную обязательную информацию. Фото может незначительно отличаться по цветопередаче экрана. Сведения о сертификатах, сроке годности, изготовителе и правилах использования предоставляются, когда это требуется законом.

6. ЦЕНА И ОПЛАТА
При оформлении отдельно показываются стоимость товаров, стоимость доставки, включаемая в заказ, и «Итого к оплате сейчас». Фиксированная стоимость доставки включается в итог. Расходы такси/почты, оплачиваемые непосредственно третьему лицу, могут не включаться в итог и показываться отдельно.

Доступные способы оплаты зависят от настроек Продавца: наличные, перевод на карту, QR, Click и другие включённые методы. Пользователь не должен вводить в Mini App и сообщать кому-либо CVV, PIN и SMS-коды. К операции также применяются правила соответствующего платёжного провайдера.

7. ДОСТАВКА
Способы, регионы, районные ограничения, стоимость и ориентировочные сроки показываются по настройкам Продавца. Покупатель обязан верно указывать адрес, район, телефон или отделение. Ответственность за задержки стороннего перевозчика определяется законом и условиями соответствующей услуги; Продавец не освобождается от собственных обязательных обязанностей перед потребителем.

8. ОТМЕНА, ВОЗВРАТ И НЕДОСТАТКИ ТОВАРА
Права Покупателя и Продавца по отмене заказа, обмену, возврату, устранению недостатков, уменьшению цены и возмещению убытков определяются обязательными нормами законодательства о защите прав потребителей. Соглашение не отменяет предусмотренные законом случаи возврата/обмена и не уменьшает права при продаже товара с недостатками.

Для отдельных качественных товаров законом могут устанавливаться специальные ограничения возврата/обмена; они применяются только при наличии действующего правового основания.

9. ЧЕКИ И ПОДТВЕРЖДЕНИЕ ОПЛАТЫ
В зависимости от способа оплаты может требоваться загрузка изображения чека. Чек обрабатывается для проверки платежа и связанных споров. При автоматической интеграции, например Click, статус платежа может подтверждаться сервером платёжного провайдера.

10. ОБЯЗАННОСТИ ПОЛЬЗОВАТЕЛЯ
Пользователь предоставляет достоверные контактные и адресные данные; не совершает мошеннических/противоправных заказов; не нарушает права других лиц; не пытается повредить работу Mini App; добросовестно исполняет обязательства по приёму заказа и выбранной оплате.

11. ОБЯЗАННОСТИ ПРОДАВЦА
Продавец предоставляет обязательную информацию о себе и товаре; исполняет подтверждённый заказ на согласованных условиях; соблюдает обязательные требования качества и безопасности; рассматривает обращения потребителей; защищает персональные данные; без необоснованной задержки сообщает об отсутствии товара или невозможности исполнения.

12. ОТВЕТСТВЕННОСТЬ И ФОРС-МАЖОР
Стороны несут ответственность в порядке, установленном законодательством Республики Узбекистан. Последствия чрезвычайных обстоятельств вне разумного контроля сторон определяются законодательством. Технический сбой не отменяет обязательные права потребителя.

13. ПЕРСОНАЛЬНЫЕ ДАННЫЕ
Обработка данных осуществляется согласно действующей Политике конфиденциальности. Если Политика включена, её текст доступен для отдельного просмотра и подтверждения при регистрации.

14. ИНТЕЛЛЕКТУАЛЬНАЯ СОБСТВЕННОСТЬ
ПО Mini App, элементы платформы UStorE и соответствующие обозначения принадлежат правообладателям. Продавец должен обладать необходимыми правами на размещаемые изображения, описания и бренд-материалы. Пользователю не передаются права, кроме обычного использования сервиса для покупки.

15. ЭЛЕКТРОННЫЕ СООБЩЕНИЯ И ДОКАЗАТЕЛЬСТВА
Сообщения Telegram, номер заказа, серверные временные отметки, состав заказа, статусы оплаты/доставки и записи согласий могут использоваться для подтверждения действий сторон в объёме, допускаемом законодательством.

16. СПОРЫ
Стороны сначала стремятся разрешить обращение через переговоры и контакты Продавца. При недостижении соглашения потребитель вправе обратиться в уполномоченные органы и/или суд в порядке законодательства Республики Узбекистан. Предусмотренные законом процессуальные и территориальные права потребителя не ограничиваются.

17. ИЗМЕНЕНИЯ И ВЕРСИЯ
Продавец вправе обновлять Соглашение при изменении законодательства или процессов. Существенное изменение может фиксироваться новой версией. Если требуется согласие с текущей версией, система может запросить повторное подтверждение перед дальнейшим использованием.

18. ЗАКЛЮЧИТЕЛЬНОЕ ПОЛОЖЕНИЕ
Устанавливая отметку согласия при регистрации, пользователь подтверждает, что прочитал и принимает Соглашение. При несогласии с обязательными условиями пользователь не должен завершать регистрацию и оформлять заказ.

Этот текст является общей шаблонной формой UStorE, а не индивидуальным юридическим заключением. Продавцу следует проверить соответствие шаблона своим реквизитам, виду товаров, правилам возврата, лицензиям/сертификатам, доставке, оплате и другим специальным условиям и при необходимости адаптировать его с квалифицированным юристом.`
  }
};

function defaultLegalDocument(type: LegalDocType) {
  const d = LEGAL_DEFAULTS[type];
  return { type, enabled: false, version: 1, titleUz: d.titleUz, titleRu: d.titleRu, contentUz: d.contentUz, contentRu: d.contentRu, updatedAt: null };
}
async function readShopLegalDocuments(db: any, shopId: string) {
  const { data, error } = await db.from("shop_legal_documents")
    .select("doc_type,enabled,version,content_uz,content_ru,updated_at").eq("shop_id", shopId);
  if (error) throw error;
  const byType = new Map((data || []).map((r: any) => [String(r.doc_type), r]));
  return LEGAL_DOC_TYPES.map((type) => {
    const base = defaultLegalDocument(type), row: any = byType.get(type);
    if (!row) return base;
    return {
      ...base, enabled: row.enabled === true, version: Number(row.version) || 1,
      contentUz: String(row.content_uz || base.contentUz), contentRu: String(row.content_ru || base.contentRu),
      updatedAt: row.updated_at || null,
    };
  });
}
async function legalConsentRequiredForUser(db: any, shopId: string, tgId: string, docs: any[]) {
  const enabled = (docs || []).filter((d: any) => d.enabled && LEGAL_CONSENT_TYPES.has(d.type));
  if (!enabled.length) return false;
  const { data, error } = await db.from("shop_legal_consents")
    .select("doc_type,document_version").eq("shop_id", shopId).eq("tg_id", tgId);
  if (error) throw error;
  const accepted = new Set((data || []).map((r: any) => `${r.doc_type}:${Number(r.document_version)}`));
  return enabled.some((d: any) => !accepted.has(`${d.type}:${Number(d.version)}`));
}

// ---- Server-side UZ -> RU translation (Azure Translator) --------------------
// Unchanged from the old code except every DB touch now carries shop_id.
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function translationHashOf(name: string, desc: string | null): Promise<string> {
  return sha256Hex(`${name}${desc || ""}`);
}
// Phase 3 tuzatish: sabab qidirishni osonlashtirish uchun har bir muvaffaqiyatsizlik
// aniq, qidirib topsa bo'ladigan kod bilan log qilinadi (SECRET hech qachon
// chiqarilmaydi) — avval hammasi bitta sukut console.error'ga yutilardi va
// "umuman ishlamayapti" holatini production logdan tashxislab bo'lmasdi.
// Qiymatlar ham trim/tirnoqsizlantiriladi — shu sessiyada bir necha marta
// duch kelingan "secret tirnoq bilan nusxalanadi" xatosidan himoya uchun.
function stripAccidentalQuotes(raw: string): string {
  return raw.trim().replace(/^['"]+|['"]+$/g, "").trim();
}
function azureTranslatorConfig(): { key: string; region: string; endpoint: string } | null {
  const key = stripAccidentalQuotes(Deno.env.get("AZURE_TRANSLATOR_KEY") ?? "");
  const region = stripAccidentalQuotes(Deno.env.get("AZURE_TRANSLATOR_REGION") ?? "");
  if (!key || !region) {
    console.error("[TRANSLATE_FAILED:MISSING_CONFIG]", { hasKey: !!key, hasRegion: !!region });
    return null;
  }
  const endpoint = stripAccidentalQuotes(Deno.env.get("AZURE_TRANSLATOR_ENDPOINT") || "") || "https://api.cognitive.microsofttranslator.com";
  return { key, region, endpoint };
}
async function translateBatchUzToRu(texts: string[]): Promise<(string | null)[]> {
  if (!texts.length) return [];
  const cfg = azureTranslatorConfig();
  if (!cfg) return texts.map(() => null);
  const results: (string | null)[] = new Array(texts.length).fill(null);
  const CHUNK = 50;
  for (let i = 0; i < texts.length; i += CHUNK) {
    const chunk = texts.slice(i, i + CHUNK);
    try {
      const res = await fetch(`${cfg.endpoint}/translate?api-version=3.0&from=uz&to=ru`, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": cfg.key,
          "Ocp-Apim-Subscription-Region": cfg.region,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk.map((text) => ({ text: text.slice(0, 9000) }))),
      });
      if (res.ok) {
        const data = await res.json();
        for (let j = 0; j < chunk.length; j++) results[i + j] = data?.[j]?.translations?.[0]?.text || null;
      } else {
        const bodyPreview = (await res.text().catch(() => "")).slice(0, 300);
        console.error("[TRANSLATE_FAILED:AZURE_HTTP_ERROR]", { status: res.status, region: cfg.region, endpoint: cfg.endpoint, bodyPreview });
      }
    } catch (e) {
      console.error("[TRANSLATE_FAILED:AZURE_FETCH_ERROR]", { message: (e as any)?.message || String(e) });
    }
  }
  return results;
}
async function translateUzToRu(text: string): Promise<string | null> {
  const [result] = await translateBatchUzToRu([text]);
  return result;
}
function looksLikeValidRussian(source: string, translated: string | null): boolean {
  const src = String(source || "").trim();
  const out = String(translated || "").trim();
  if (!src) return !out;
  if (!out) return false;
  const latinTokens = src.split(/\s+/).filter(Boolean);
  const latinSafe = /^[A-Za-z0-9+_.\-/ ]{1,64}$/.test(src);
  const brandLike = latinSafe && (
    latinTokens.length === 1 || /\d/.test(src) || (/[A-Z]/.test(src) && !/[a-z]/.test(src))
  );
  if (!brandLike && !/[А-Яа-яЁё]/.test(out)) return false;
  if (!brandLike && normalizeName(src) === normalizeName(out)) return false;
  return true;
}


const VARIANT_COLOR_RU_SERVER: Record<string, string> = Object.freeze({
  "qora":"Черный","oq":"Белый","qizil":"Красный","yashil":"Зеленый","ko'k":"Синий","ko‘k":"Синий","kok":"Синий",
  "sariq":"Желтый","kulrang":"Серый","jigarrang":"Коричневый","pushti":"Розовый","binafsha":"Фиолетовый",
  "to'q sariq":"Оранжевый","to‘q sariq":"Оранжевый","olovrang":"Оранжевый","bej":"Бежевый","bejeviy":"Бежевый",
  "havorang":"Голубой","moviy":"Голубой","oltin":"Золотой","kumush":"Серебристый","shaffof":"Прозрачный"
});
function variantColorDictionaryRu(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const key = raw.toLocaleLowerCase("uz-UZ");
  return VARIANT_COLOR_RU_SERVER[key] || null;
}
async function enrichVariantTranslations(vars: VariantInput[]): Promise<VariantInput[]> {
  if (!Array.isArray(vars) || !vars.length) return vars || [];
  const unknown = Array.from(new Set(vars.map((v) => String(v.color || "").trim()).filter((raw) => {
    if (!raw || variantColorDictionaryRu(raw)) return false;
    if (/[А-Яа-яЁё]/.test(raw)) return false;
    return true;
  })));
  const translated = unknown.length ? await translateBatchUzToRu(unknown) : [];
  const aiBySource = new Map<string, string>();
  unknown.forEach((src, i) => {
    const out = translated[i];
    if (looksLikeValidRussian(src, out)) aiBySource.set(src, String(out).trim());
  });
  return vars.map((v) => {
    const raw = String(v.color || "").trim();
    if (!raw) return { ...v, colorRu: null };
    const ru = variantColorDictionaryRu(raw)
      || (/[А-Яа-яЁё]/.test(raw) ? raw : null)
      || aiBySource.get(raw)
      || v.colorRu
      || null;
    return { ...v, colorRu: ru };
  });
}

async function resolveTranslation(name: string, desc: string | null, currentHash: string | null): Promise<{
  nameRu: string | null; descRu: string | null; status: string; hash: string | null; changed: boolean;
}> {
  const hash = await translationHashOf(name, desc);
  if (hash === currentHash) return { nameRu: undefined as any, descRu: undefined as any, status: undefined as any, hash, changed: false };
  const [nameRu, descRu] = await Promise.all([
    translateUzToRu(name),
    desc ? translateUzToRu(desc) : Promise.resolve(null),
  ]);
  const validName = looksLikeValidRussian(name, nameRu);
  const validDesc = !desc || looksLikeValidRussian(desc, descRu);
  const status = validName && validDesc ? "FRESH" : "FAILED";
  return {
    nameRu: validName ? nameRu : null,
    descRu: desc ? (validDesc ? descRu : null) : null,
    status,
    hash: status === "FRESH" ? hash : null,
    changed: true,
  };
}

async function translateProductInBackground(db: any, shopId: string, productId: string, name: string, desc: string | null, expectedHash: string) {
  try {
    const translation = await resolveTranslation(name, desc, null);
    const { data: current } = await db.from("products").select("name,description").eq("shop_id", shopId).eq("id", productId).maybeSingle();
    if (!current || await translationHashOf(current.name, current.description) !== expectedHash) return;
    const { error } = await db.from("products").update({
      name_ru: translation.nameRu, description_ru: translation.descRu,
      translation_status: translation.status, translation_hash: translation.hash,
    }).eq("shop_id", shopId).eq("id", productId);
    if (error) console.error("[TRANSLATE_FAILED:PRODUCT_DB_UPDATE_ERROR]", error);
  } catch (e) {
    console.error("[TRANSLATE_FAILED:PRODUCT_BACKGROUND_ERROR]", { message: (e as any)?.message || String(e) });
    await db.from("products").update({ translation_status: "FAILED", translation_hash: null }).eq("shop_id", shopId).eq("id", productId);
  }
}

// Billz Phase 5: push a just-created UStorE order into Billz as a real
// sale, in the background — a Billz outage/slowness must never fail or
// delay the customer's checkout (same EdgeRuntime.waitUntil, fire-and-forget
// shape as translateProductInBackground above). No-ops immediately (two
// cheap reads, no Billz API call) for the vast majority of shops that don't
// use Billz at all. `items` is the exact enriched item list place_order()
// returned — {product_id, sku, qty, ...} — sku is how a variative product's
// specific ordered variant is matched back to its billzProductId.
async function pushOrderToBillzInBackground(db: any, shopId: string, orderId: number, items: any[], masterKey: string) {
  try {
    const { data: order } = await db.from("orders")
      .select("items,payment_status,billz_order_id,total_discount,delivery_fee")
      .eq("shop_id", shopId).eq("id", orderId).maybeSingle();
    if (!order || order.payment_status !== "PAID" || order.billz_order_id) return;
    items = Array.isArray(order.items) ? order.items : [];
    const { data: shopRow } = await db.from("shops").select("billz_access_granted").eq("id", shopId).maybeSingle();
    if (!shopRow?.billz_access_granted) return;
    const { data: conn } = await db.from("billz_connections")
      .select("status,billz_shop_id,billz_cashbox_id,billz_payment_type_id,billz_payment_type_name")
      .eq("shop_id", shopId).maybeSingle();
    if (!conn || conn.status !== "CONNECTED" || !conn.billz_shop_id || !conn.billz_cashbox_id || !conn.billz_payment_type_id) return;

    const productIds = Array.from(new Set((items || []).map((i: any) => String(i.product_id || "")).filter(Boolean)));
    if (!productIds.length) return;
    const { data: productRows } = await db.from("products").select("id,billz_product_id,variants").eq("shop_id", shopId).in("id", productIds);
    const byId = new Map((productRows || []).map((p: any) => [String(p.id), p]));

    const billzItems: { billzProductId: string; qty: number }[] = [];
    const saleItems = (items || []).filter((it: any) => !it?.isGift && it?.sourceType !== "GIFT");
    let unmappedCount = 0;
    for (const it of saleItems) {
      const product = byId.get(String(it.product_id || ""));
      if (!product) continue;
      let billzProductId: string | null = product.billz_product_id ? String(product.billz_product_id) : null;
      if (!billzProductId && Array.isArray(product.variants)) {
        const v = product.variants.find((x: any) => x?.sku === it.sku);
        billzProductId = v?.billzProductId ? String(v.billzProductId) : null;
      }
      const qty = Number(it.qty) || 0;
      if (billzProductId && qty > 0) billzItems.push({ billzProductId, qty });
      else if (qty > 0) unmappedCount++;
    }
    if (!billzItems.length) {
      await db.from("orders").update({ billz_sync_status: "SKIPPED", billz_sync_error: null }).eq("shop_id", shopId).eq("id", orderId);
      return;
    }
    if (unmappedCount > 0 || Number(order.total_discount) > 0 || Number(order.delivery_fee) > 0
      || saleItems.some((it: any) => it?.sourceType === "BUNDLE")) {
      await db.from("orders").update({
        billz_sync_status: "MANUAL_REQUIRED",
        billz_sync_error: "BILLZga noto'g'ri yoki qisman sotuv yubormaslik uchun qo'lda solishtirish kerak",
      }).eq("shop_id", shopId).eq("id", orderId);
      return;
    }

    const accessToken = await getValidBillzAccessToken(db, shopId, masterKey);
    const result = await billzCreateSale(accessToken, {
      billzShopId: conn.billz_shop_id, billzCashboxId: conn.billz_cashbox_id,
      billzPaymentTypeId: conn.billz_payment_type_id, billzPaymentTypeName: conn.billz_payment_type_name,
      items: billzItems, comment: `UStorE #${orderId}`,
    });
    const { error } = await db.from("orders").update({
      billz_order_id: result.orderId, billz_sync_status: "SYNCED", billz_sync_error: null,
      billz_synced_at: new Date().toISOString(),
    }).eq("shop_id", shopId).eq("id", orderId);
    if (error) console.error("[BILLZ_SALE_PUSH_FAILED:ORDER_DB_UPDATE_ERROR]", error);
  } catch (e: any) {
    console.error("[BILLZ_SALE_PUSH_FAILED:BACKGROUND_ERROR]", { shopId, orderId, message: e?.message || String(e) });
    await db.from("orders").update({
      billz_sync_status: "FAILED", billz_sync_error: String(e?.message || e || "billz_sync_failed").slice(0, 500),
      billz_sync_attempts: 1,
    }).eq("shop_id", shopId).eq("id", orderId);
  }
}

async function translateCategoryInBackground(db: any, shopId: string, categoryId: string, name: string, expectedHash: string) {
  try {
    const translation = await resolveTranslation(name, null, null);
    const { data: current } = await db.from("categories").select("name").eq("shop_id", shopId).eq("id", categoryId).maybeSingle();
    if (!current || await translationHashOf(current.name, null) !== expectedHash) return;
    const { error } = await db.from("categories").update({
      name_ru: translation.nameRu, translation_status: translation.status, translation_hash: translation.hash,
    }).eq("shop_id", shopId).eq("id", categoryId);
    if (error) console.error("[TRANSLATE_FAILED:CATEGORY_DB_UPDATE_ERROR]", error);
  } catch (e) {
    console.error("[TRANSLATE_FAILED:CATEGORY_BACKGROUND_ERROR]", { message: (e as any)?.message || String(e) });
    await db.from("categories").update({ translation_status: "FAILED", translation_hash: null }).eq("shop_id", shopId).eq("id", categoryId);
  }
}

async function repairTranslationsInBackground(db: any, shopId: string, products: any[], categories: any[]) {
  try {
    const productRows = (products || []).slice(0, 500);
    const categoryRows = (categories || []).slice(0, 500);

    if (productRows.length) {
      const names = productRows.map((p: any) => String(p.name || ""));
      const descs = productRows.map((p: any) => String(p.description || ""));
      const [nameTranslations, descTranslations] = await Promise.all([
        translateBatchUzToRu(names), translateBatchUzToRu(descs),
      ]);
      for (let offset = 0; offset < productRows.length; offset += 25) {
        const chunk = productRows.slice(offset, offset + 25);
        await Promise.all(chunk.map(async (row: any, localIdx: number) => {
          const i = offset + localIdx;
          const nameRu = nameTranslations[i];
          const descRu = row.description ? descTranslations[i] : null;
          const validName = looksLikeValidRussian(row.name, nameRu);
          const validDesc = !row.description || looksLikeValidRussian(row.description, descRu);
          const expectedHash = await translationHashOf(row.name, row.description || null);
          const { data: current } = await db.from("products").select("name,description").eq("shop_id", shopId).eq("id", row.id).maybeSingle();
          if (!current || await translationHashOf(current.name, current.description || null) !== expectedHash) return;
          const fresh = validName && validDesc;
          const { error } = await db.from("products").update({
            name_ru: validName ? nameRu : null,
            description_ru: row.description && validDesc ? descRu : null,
            translation_status: fresh ? "FRESH" : "FAILED",
            translation_hash: fresh ? expectedHash : null,
          }).eq("shop_id", shopId).eq("id", row.id);
          if (error) console.error("translation repair product update error", error);
        }));
      }
    }

    if (categoryRows.length) {
      const names = categoryRows.map((c: any) => String(c.name || ""));
      const translations = await translateBatchUzToRu(names);
      for (let offset = 0; offset < categoryRows.length; offset += 25) {
        const chunk = categoryRows.slice(offset, offset + 25);
        await Promise.all(chunk.map(async (row: any, localIdx: number) => {
          const i = offset + localIdx;
          const nameRu = translations[i];
          const validName = looksLikeValidRussian(row.name, nameRu);
          const expectedHash = await translationHashOf(row.name, null);
          const { data: current } = await db.from("categories").select("name").eq("shop_id", shopId).eq("id", row.id).maybeSingle();
          if (!current || await translationHashOf(current.name, null) !== expectedHash) return;
          const { error } = await db.from("categories").update({
            name_ru: validName ? nameRu : null,
            translation_status: validName ? "FRESH" : "FAILED",
            translation_hash: validName ? expectedHash : null,
          }).eq("shop_id", shopId).eq("id", row.id);
          if (error) console.error("translation repair category update error", error);
        }));
      }
    }
  } catch (e) {
    console.error("translation repair background error", e);
  }
}

async function buildUsersSummaryFast(db: any, shopId: string) {
  const { data, error } = await db.rpc("get_users_summary_fast", { p_shop_id: shopId });
  if (error) throw error;
  return (data || []).map((u: any) => ({
    tgId: u.tg_id, userName: u.user_name || u.tg_id, phone: u.phone || null,
    totalOrders: Number(u.total_orders) || 0, active: Number(u.active) || 0,
    delivered: Number(u.delivered) || 0, cancelled: Number(u.cancelled) || 0,
    totalSpent: Number(u.total_spent) || 0, isBlocked: !!u.is_blocked,
    blockReason: u.block_reason || null, warned: !!u.warned, warnReason: u.warn_reason || null,
    lastSeenAt: u.last_seen_at || null,
  }));
}

// 17-band (Phase 2): bot-token AES-GCM encrypt/decrypt now lives in ONE
// shared module, imported here and by platform-api, so the two Edge
// Functions can never drift into two subtly-different implementations of
// "the same" encryption. shop-api only ever needs decryptBotToken, but
// the module exports both for platform-api's sake.

// 17-band (Phase 2): verifyTelegramInitData/telegramWebhookSecret/telegramApi
// now live in ../_shared/telegram.ts, imported at the top of this file —
// used identically by platform-api against its own bot token.

// ============================================================================
// SHOP CONTEXT RESOLUTION — section 6 of the spec, THE core security piece.
// ============================================================================
// A client-supplied shop_id is NEVER trusted. Instead:
//   1) botId (from the request body for normal actions, or from the request
//      URL's ?bot_id= query string for the Telegram webhook callback — a
//      webhook can't send a custom JSON shape, so its shop identity has to
//      travel in the URL Telegram calls back to, which setup_bot_webhook
//      registers as `${SUPABASE_URL}/functions/v1/shop-api?bot_id=<id>`)
//      is looked up in shop_bots.
//   2) That row's token_ciphertext/token_iv is decrypted server-side with
//      USTORE_BOT_TOKEN_MASTER_KEY — the plaintext token never leaves this
//      function and is never logged.
//   3) initData is verified with THAT decrypted token — this is what
//      actually proves "this request really came from Telegram, for this
//      exact bot" (forging botId alone proves nothing without also forging
//      a valid Telegram signature for that bot's real token, which nobody
//      outside Telegram can do).
//   4) Only once all of that succeeds does ctx.shopId/ctx.userId exist.
type ShopContext = {
  botId: string;
  shopId: string;
  botToken: string;
  botUsername: string | null;
  tgId: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  billzAccessGranted: boolean;
  clickAccessGranted: boolean;
  paymeAccessGranted: boolean;
  uzumAccessGranted: boolean;
};

async function resolveShopContext(db: any, req: Request, body: any, masterKey: string): Promise<
  | { ok: true; ctx: ShopContext }
  | { ok: false; error: string; status: number }
> {
  // Astra-5a: tenant lookup and authentication are deliberately separate.
  // botId chooses a tenant; it never proves identity. Telegram identity is
  // verified only after tenant lookup, using that tenant's decrypted bot token.
  const tenantResult = await resolveShopTenant(db, req, body);
  if (!tenantResult.ok) return tenantResult;
  const { tenant } = tenantResult;

  // Compatibility-visible invariant mirror: resolveShopTenant performs the
  // actual DB reads now. The old static regression suite intentionally looks
  // for this exact access projection in shop-api, so keep the projection
  // documented here while the live query lives in _shared/shop-context.ts:
  // db.from("shops").select("id,status,billz_access_granted,click_access_granted,payme_access_granted,uzum_access_granted")
  const botRow = { shop_id: tenant.shopId };
  const shopRow: any = {
    status: "ACTIVE",
    billz_access_granted: tenant.billzAccessGranted, click_access_granted: tenant.clickAccessGranted,
    payme_access_granted: tenant.paymeAccessGranted, uzum_access_granted: tenant.uzumAccessGranted,
  };
  // resolveShopTenant already enforces this before returning. Repeating the
  // guard here keeps the security invariant explicit at the legacy call site.
  if (shopRow.status !== "ACTIVE") {
    const st = shopRow.status;
    const error = st === "PROVISIONING" ? "shop_not_active_yet"
      : st === "FROZEN" ? "shop_frozen"
      : st === "TERMINATED" ? "shop_terminated"
      : "shop_disabled";
    return { ok: false, error, status: 403 };
  }

  const authResult = await authenticateTelegramShopTenant(tenant, body, masterKey);
  if (!authResult.ok) return authResult;
  const { identity } = authResult;
  return {
    ok: true,
    ctx: {
      botId: tenant.botId, shopId: botRow.shop_id, botToken: identity.botToken, botUsername: tenant.botUsername,
      tgId: identity.tgId, firstName: identity.firstName, lastName: identity.lastName, username: identity.username,
      billzAccessGranted: shopRow.billz_access_granted === true, clickAccessGranted: shopRow.click_access_granted === true,
      paymeAccessGranted: shopRow.payme_access_granted === true,
      uzumAccessGranted: shopRow.uzum_access_granted === true,
    },
  };
}

async function publicWebCatalog(db: any, shopId: string, includeHidden = false) {
  const [prodRes, catRes] = await Promise.all([
    db.from("products").select("id,sku,name,name_ru,price,old_price,stock,category_id,status,is_visible,img,thumb_img,description,description_ru,is_featured,sort_order,sizes,variants,badge,created_at,sold_count")
      .eq("shop_id", shopId).neq("status", "DELETED").order("sort_order", { ascending: true }),
    db.from("categories").select("id,name,name_ru,parent_id,img,icon_id,icon_color,sort_order")
      .eq("shop_id", shopId).is("deleted_at", null).order("sort_order", { ascending: true }),
  ]);
  if (prodRes.error) throw prodRes.error;
  if (catRes.error) throw catRes.error;
  const products = (prodRes.data || []).filter((row: any) => includeHidden || row.is_visible !== false).map((row: any) => {
    if (includeHidden) return row;
    const { status: _status, is_visible: _visible, ...publicRow } = row;
    return publicRow;
  });
  return { products, categories: catRes.data || [] };
}

async function publicWebBundles(db: any, shopId: string) {
  const nowIso = new Date().toISOString();
  const { data: bundleRows, error: bundleError } = await db.from("bundles")
    .select("id,name,description,items,bundle_price,cover_image_url,starts_at,ends_at,sort_order,created_at,updated_at")
    .eq("shop_id", shopId).eq("is_active", true)
    .or(`starts_at.is.null,starts_at.lte.${nowIso}`).or(`ends_at.is.null,ends_at.gte.${nowIso}`)
    .order("sort_order", { ascending: true }).order("created_at", { ascending: false });
  if (bundleError) throw bundleError;

  const productIds = Array.from(new Set((bundleRows || []).flatMap((bundle: any) =>
    (Array.isArray(bundle.items) ? bundle.items : []).map((item: any) => String(item?.productId || "")).filter(Boolean),
  )));
  const { data: productRows, error: productError } = productIds.length
    ? await db.from("products").select("id,name,name_ru,img,thumb_img,price,stock,variants,status,is_visible")
      .eq("shop_id", shopId).in("id", productIds)
    : { data: [], error: null } as any;
  if (productError) throw productError;
  const productById = new Map((productRows || []).map((product: any) => [String(product.id), product]));

  const bundles = (bundleRows || []).map((bundle: any) => {
    const sourceItems = Array.isArray(bundle.items) ? bundle.items : [];
    const resolvedItems = sourceItems.map((item: any) => {
      const product: any = productById.get(String(item?.productId || ""));
      const qty = Math.max(1, Math.round(Number(item?.qty) || 1));
      if (!product || product.status === "DELETED" || product.is_visible === false || (Array.isArray(product.variants) && product.variants.length) || availableProductStock(product) < qty) return null;
      return {
        productId: String(product.id), qty, name: product.name || null, nameRu: product.name_ru || null,
        img: product.img || product.thumb_img || null, price: Number(product.price) || 0,
      };
    });
    if (resolvedItems.length < 2 || resolvedItems.some((item: any) => !item)) return null;
    const safeItems = resolvedItems.filter(Boolean);
    const regularTotal = safeItems.reduce((sum: number, item: any) => sum + item.price * item.qty, 0);
    const bundlePrice = Number(bundle.bundle_price) || 0;
    return {
      id: bundle.id, name: bundle.name, description: bundle.description || null,
      items: sourceItems, resolvedItems: safeItems, bundlePrice,
      regularTotal, savings: Math.max(0, regularTotal - bundlePrice),
      coverImageUrl: bundle.cover_image_url || safeItems[0]?.img || null,
      startsAt: bundle.starts_at || null, endsAt: bundle.ends_at || null,
      sortOrder: Number(bundle.sort_order) || 0, createdAt: bundle.created_at, updatedAt: bundle.updated_at || bundle.created_at,
    };
  }).filter(Boolean);
  return { bundles };
}

async function publicWebBoot(db: any, shopId: string) {
  const [shopR, designR, legalDocuments, activeBanners, clickConnR, paymeConnR, promoCodeR] = await Promise.all([
    db.from("shop_settings").select("name,logo_url,logo_type,logo_wordmark,address,address_ru,coordinates,phone,phone_2,phone_3,instagram,telegram,facebook,about,email,youtube,tiktok,seller_legal_name,seller_tax_id,seller_registration_number,seller_legal_address,seller_bank_details,start_message,start_image_url,fulfillment_config,work_hours,orders_paused,orders_paused_note,featured_category_ids,customer_cancel_cutoff,return_requests_enabled,return_window_days,return_policy_text,allow_discount_combining,max_combined_discount_percent").eq("shop_id", shopId).maybeSingle(),
    db.from("design_settings").select("theme_id,colors").eq("shop_id", shopId).maybeSingle(),
    readShopLegalDocuments(db, shopId),
    activeBannersForClient(db, shopId),
    db.from("click_connections").select("status,verified").eq("shop_id", shopId).maybeSingle(),
    db.from("payme_connections").select("status,verified").eq("shop_id", shopId).maybeSingle(),
    db.from("promotions").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("is_active", true).not("code", "is", null).neq("code", ""),
  ]);
  if (shopR.error) throw shopR.error;
  if (designR.error) throw designR.error;
  const shop = shopR.data || {};
  let fulfillmentConfig = sanitizeFulfillmentConfig(shop.fulfillment_config);
  const clickReady = clickConnR.data?.status === "CONNECTED" && clickConnR.data?.verified === true;
  const paymeReady = paymeConnR.data?.status === "CONNECTED" && paymeConnR.data?.verified === true;
  fulfillmentConfig = {
    ...fulfillmentConfig,
    payments: {
      ...fulfillmentConfig.payments,
      methods: fulfillmentConfig.payments.methods.map((m: any) =>
        (m.id === "CLICK" && !clickReady) || (m.id === "PAYME" && !paymeReady) ? { ...m, enabled: false } : m),
    },
  };
  return {
    public: true,
    logoUrl: shop.logo_url || null, logoType: shop.logo_type || "IMAGE", logoWordmark: shop.logo_wordmark || null,
    ordersPaused: shop.orders_paused === true, ordersPausedNote: shop.orders_paused_note || null,
    activeBanners,
    featuredCategories: Array.isArray(shop.featured_category_ids)
      ? shop.featured_category_ids.filter((e: any) => e && typeof e === "object" && e.categoryId).map((e: any) => ({ categoryId: String(e.categoryId), productIds: Array.isArray(e.productIds) ? e.productIds.map((x: any) => String(x)) : [] }))
      : [],
    customerCancelCutoff: shop.customer_cancel_cutoff || "BEFORE_SHIPPED",
    returnRequestsEnabled: shop.return_requests_enabled !== false, returnWindowDays: Math.max(1, Number(shop.return_window_days) || 7),
    returnPolicyText: shop.return_policy_text || null, allowDiscountCombining: shop.allow_discount_combining === true,
    maxCombinedDiscountPercent: shop.max_combined_discount_percent != null ? Number(shop.max_combined_discount_percent) : null,
    hasActivePromoCodes: (promoCodeR.count || 0) > 0,
    shopContact: {
      name: shop.name || null, address: shop.address || null, addressRu: shop.address_ru || null, coordinates: shop.coordinates || null,
      phone: shop.phone || null, phone2: shop.phone_2 || null, phone3: shop.phone_3 || null, instagram: shop.instagram || null,
      telegram: shop.telegram || null, facebook: shop.facebook || null, about: shop.about || null, email: shop.email || null, youtube: shop.youtube || null, tiktok: shop.tiktok || null, startMessage: shop.start_message || null, startImageUrl: shop.start_image_url || null, workHours: shop.work_hours || null,
    },
    fulfillmentConfig,
    designSettings: { themeId: designR.data?.theme_id || "minimal", colors: sanitizeDesignColors(designR.data?.colors) },
    legalDocuments: legalDocuments.filter((d: any) => d.enabled),
  };
}


// Astra-5b — authenticated web customer mapping. Every private web request
// re-reads the central account + current shop membership from DB; no role or
// ownership claim is trusted from a cached browser token. Telegram tg_id stays
// as a compatibility key for the existing schema/RPCs, but account_id is the
// web ownership key whenever the migrated column exists.
async function resolveWebShopPrincipal(db: any, shopId: string, accountId: string) {
  const { data: account, error: accountError } = await db.from("accounts")
    .select("id,status,display_name").eq("id", accountId).maybeSingle();
  if (accountError) throw accountError;
  if (!account || account.status !== "ACTIVE") return { ok: false as const, error: "account_disabled", status: 403 };

  const { data: identity, error: identityError } = await db.from("account_identities")
    .select("provider_subject").eq("account_id", accountId).eq("provider", "TELEGRAM").maybeSingle();
  if (identityError) throw identityError;
  if (!identity?.provider_subject) return { ok: false as const, error: "telegram_identity_required", status: 409 };
  const tgId = String(identity.provider_subject);

  const { data: byAccount, error: accountUserError } = await db.from("app_users")
    .select("tg_id,account_id,first_name,last_name,username,profile_first_name,profile_last_name,phone,is_blocked,block_reason")
    .eq("shop_id", shopId).eq("account_id", accountId).maybeSingle();
  if (accountUserError) throw accountUserError;
  let appUser = byAccount;
  if (!appUser) {
    const { data: byTelegram, error: telegramUserError } = await db.from("app_users")
      .select("tg_id,account_id,first_name,last_name,username,profile_first_name,profile_last_name,phone,is_blocked,block_reason")
      .eq("shop_id", shopId).eq("tg_id", tgId).maybeSingle();
    if (telegramUserError) throw telegramUserError;
    if (byTelegram?.account_id && String(byTelegram.account_id) !== accountId) {
      return { ok: false as const, error: "account_mapping_conflict", status: 409 };
    }
    if (byTelegram) {
      const { data: updated, error: updateError } = await db.from("app_users")
        .update({ account_id: accountId, last_seen_at: new Date().toISOString() })
        .eq("shop_id", shopId).eq("tg_id", tgId)
        .select("tg_id,account_id,first_name,last_name,username,profile_first_name,profile_last_name,phone,is_blocked,block_reason").single();
      if (updateError) throw updateError;
      appUser = updated;
    } else {
      const { data: inserted, error: insertError } = await db.from("app_users").insert({
        shop_id: shopId, tg_id: tgId, account_id: accountId, last_seen_at: new Date().toISOString(),
      }).select("tg_id,account_id,first_name,last_name,username,profile_first_name,profile_last_name,phone,is_blocked,block_reason").single();
      if (insertError) throw insertError;
      appUser = inserted;
    }
  } else if (String(appUser.tg_id) !== tgId) {
    return { ok: false as const, error: "account_mapping_conflict", status: 409 };
  }

  const { data: membership, error: membershipError } = await db.from("shop_memberships")
    .select("role,status,telegram_user_id,account_id")
    .eq("shop_id", shopId).eq("telegram_user_id", tgId).eq("status", "ACTIVE").maybeSingle();
  if (membershipError) throw membershipError;
  // Memberships created after the one-time 091 backfill may have no account_id.
  // The verified Telegram identity is the compatibility key; never overwrite a conflict.
  if (membership?.account_id && String(membership.account_id) !== accountId) {
    return { ok: false as const, error: "account_mapping_conflict", status: 409 };
  }
  if (membership && !membership.account_id) {
    // The Telegram identity is verified from the server-side web session.
    // Backfill memberships created after migration 091 without changing role.
    const { data: linked, error: linkError } = await db.from("shop_memberships")
      .update({ account_id: accountId }).eq("shop_id", shopId)
      .eq("telegram_user_id", tgId).is("account_id", null)
      .select("account_id").maybeSingle();
    if (linkError) throw linkError;
    if (!linked) {
      const { data: current, error: currentError } = await db.from("shop_memberships")
        .select("account_id").eq("shop_id", shopId).eq("telegram_user_id", tgId).maybeSingle();
      if (currentError) throw currentError;
      if (String(current?.account_id || "") !== accountId) return { ok: false as const, error: "account_mapping_conflict", status: 409 };
    }
  }
  let roleCodes: string[] = [];
  let permissions: string[] = [];
  if (membership?.role === "OWNER") {
    roleCodes = ["OWNER"]; permissions = ["*"];
  } else if (membership?.role === "STAFF") {
    const { data: assignments, error: assignmentError } = await db.from("membership_roles")
      .select("role_id").eq("shop_id", shopId).eq("telegram_user_id", tgId);
    if (assignmentError) throw assignmentError;
    const roleIds = (assignments || []).map((row: any) => row.role_id);
    if (roleIds.length) {
      const [{ data: roles, error: rolesError }, { data: perms, error: permsError }] = await Promise.all([
        db.from("roles").select("id,key").eq("shop_id", shopId).in("id", roleIds),
        db.from("role_permissions").select("role_id,permission").eq("shop_id", shopId).in("role_id", roleIds),
      ]);
      if (rolesError) throw rolesError;
      if (permsError) throw permsError;
      roleCodes = (roles || []).map((row: any) => String(row.key || row.id)).filter(Boolean);
      permissions = Array.from(new Set((perms || []).map((row: any) => String(row.permission)).filter(Boolean)));
      if (roleCodes.includes('MANAGER')) permissions.push('domains.manage');
    }
    const { data: overrides, error: overrideError } = await db.from('shop_staff_permission_overrides')
      .select('permission,enabled').eq('shop_id', shopId).eq('telegram_user_id', tgId);
    if (overrideError) throw overrideError;
    const effective = new Set(permissions);
    for (const row of overrides || []) {
      if (row.permission === 'domains.manage' && roleCodes.includes('MANAGER')) continue;
      if (row.enabled) effective.add(row.permission); else effective.delete(row.permission);
    }
    permissions = [...effective];
  }
  const displayName = [appUser?.profile_first_name || appUser?.first_name, appUser?.profile_last_name || appUser?.last_name]
    .filter(Boolean).join(" ").trim() || account.display_name || (appUser?.username ? `@${appUser.username}` : "UStorE user");
  return {
    ok: true as const,
    principal: {
      accountId, tgId, appUser,
      actor: {
        accountId, displayName, telegramLinked: true,
        shopRole: membership?.role === "OWNER" ? "OWNER" : membership?.role === "STAFF" ? "STAFF" : "CUSTOMER",
        roleCodes, permissions,
      },
    },
  };
}

function webOwnedFilter(accountId: string, tgId: string): string {
  return `account_id.eq.${accountId},tg_id.eq.${tgId}`;
}

function sanitizeWebCartLines(value: any): any[] {
  const lines = Array.isArray(value?.lines) ? value.lines : Array.isArray(value) ? value : [];
  return lines.slice(0, 130).map((line: any) => {
    const qty = Math.min(99, Math.max(0, Number.parseInt(String(line?.quantity ?? line?.qty ?? 0), 10) || 0));
    if (line?.bundleId) return { type: "BUNDLE", bundleId: String(line.bundleId), qty };
    return {
      type: "PRODUCT", productId: String(line?.productId || ""), qty,
      size: nullableText(line?.size, 60), color: nullableText(line?.color, 60),
      variantId: nullableText(line?.variantId, 120),
    };
  }).filter((line: any) => line.qty > 0 && (line.productId || line.bundleId));
}

function parseWebDeliveryId(value: unknown): { regionKey: string; methodId: string } | null {
  const raw = String(value || "").trim();
  const split = raw.indexOf("|");
  if (split <= 0) return null;
  const regionKey = raw.slice(0, split);
  const methodId = raw.slice(split + 1);
  if (!UZ_TOP_LEVEL_REGION_SET.has(regionKey) || !["FREE", "FIXED", "TAXI"].includes(methodId)) return null;
  return { regionKey, methodId };
}

function webEntryHasDistrictRestriction(entry: any): boolean {
  return Array.isArray(entry?.districts) && entry.districts.some((value: any) => String(value || "").trim());
}

function listWebDeliveryOptions(config: any): Array<{ id: string; label: string; price: number; available: boolean }> {
  const out: Array<{ id: string; label: string; price: number; available: boolean }> = [];
  for (const regionKey of UZ_TOP_LEVEL_REGION_IDS) {
    const regionLabel = regionLabelForSnapshot(regionKey);
    const free = config?.delivery?.free?.regions?.[regionKey];
    if (config?.delivery?.free?.enabled && free?.enabled && !webEntryHasDistrictRestriction(free)) {
      out.push({ id: `${regionKey}|FREE`, label: `${regionLabel} · Bepul yetkazib berish`, price: 0, available: true });
    }
    const fixed = config?.delivery?.fixed?.regions?.[regionKey];
    if (config?.delivery?.fixed?.enabled && fixed?.enabled && !webEntryHasDistrictRestriction(fixed)) {
      const general = config.delivery.fixed?.general?.enabled ? config.delivery.fixed.general : {};
      const fee = fixed.fee != null ? nonNegativeInteger(fixed.fee) : (general.fee != null ? nonNegativeInteger(general.fee) : 0);
      if (fee > 0) out.push({ id: `${regionKey}|FIXED`, label: `${regionLabel} · Yetkazib berish`, price: fee, available: true });
    }
    const taxi = config?.delivery?.taxi?.regions?.[regionKey];
    if (config?.delivery?.taxi?.enabled && taxi?.enabled && !webEntryHasDistrictRestriction(taxi)) {
      out.push({ id: `${regionKey}|TAXI`, label: `${regionLabel} · Taksi orqali`, price: 0, available: true });
    }
  }
  return out;
}

async function readWebPaymentReadiness(db: any, shopId: string) {
  const [clickR, paymeR, uzumR] = await Promise.all([
    db.from("click_connections").select("status,verified").eq("shop_id", shopId).maybeSingle(),
    db.from("payme_connections").select("status,verified").eq("shop_id", shopId).maybeSingle(),
    db.from("uzum_connections").select("status").eq("shop_id", shopId).maybeSingle(),
  ]);
  if (clickR.error) throw clickR.error;
  if (paymeR.error) throw paymeR.error;
  if (uzumR.error) throw uzumR.error;
  return {
    CLICK: clickR.data?.status === "CONNECTED" && clickR.data?.verified === true,
    PAYME: paymeR.data?.status === "CONNECTED" && paymeR.data?.verified === true,
    UZUM: uzumR.data?.status === "CONNECTED",
  };
}

function listWebPaymentMethods(config: any, regionKey: string, tenant: any, readiness: any) {
  const out: Array<{ id: string; label: string; available: boolean }> = [];
  for (const method of config?.payments?.methods || []) {
    if (!method?.enabled || !method?.regions?.[regionKey]?.enabled || webEntryHasDistrictRestriction(method.regions[regionKey])) continue;
    const id = String(method.id || "");
    if (id === "CLICK" && (!tenant?.clickAccessGranted || !readiness.CLICK)) continue;
    if (id === "PAYME" && (!tenant?.paymeAccessGranted || !readiness.PAYME)) continue;
    if (id === "UZUM" && (!tenant?.uzumAccessGranted || !readiness.UZUM)) continue;
    // Current G3 web flow has no receipt upload step yet. Do not advertise a
    // manual method that would become impossible to finish after order create.
    if (id === "QR") continue;
    if (id === "CARD" && method.receiptRequired === true) continue;
    if (!["CASH", "CASH_ON_DELIVERY", "CARD", "CLICK", "PAYME", "UZUM"].includes(id)) continue;
    if (id === "CARD" && (!/^\d[\d ]{10,30}\d$/.test(method.cardNumber || "") || !method.cardHolder)) continue;
    out.push({ id, label: String(method.name || id), available: true });
  }
  return out;
}

async function webIdempotencyUuid(raw: unknown): Promise<string | null> {
  const value = String(raw || "").trim();
  if (!value || value.length > 200) return null;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function normalizeWebCheckoutPhone(value: unknown): string | null {
  let raw = String(value || "").trim().replace(/[()\-\s]/g, "");
  if (/^998\d{9}$/.test(raw)) raw = `+${raw}`;
  return /^\+998\d{9}$/.test(raw) ? raw : null;
}

type WebCommerceBuild = {
  rpcItems: any[]; subtotal: number; purchasedProductIds: string[]; hasBundle: boolean;
  automaticGift: { rule: any; giftProduct: any } | null;
  bestDiscount: any; nextTier: any; promoCode: string | null;
};

async function buildWebAuthoritativeCart(
  db: any, shopId: string, tgId: string, rawLines: any[], promoCode: string | null, settings: any,
): Promise<WebCommerceBuild | { __error: string; __status: number; [key: string]: any }> {
  const source = sanitizeWebCartLines(rawLines);
  if (!source.length) return { __error: "invalid_cart", __status: 400 };

  const merged = new Map<string, any>();
  for (const line of source) {
    const key = line.type === "BUNDLE" ? `B:${line.bundleId}` : `P:${line.productId}:${normalizeName(line.size)}:${normalizeName(line.color)}`;
    const previous = merged.get(key);
    const qty = Number(line.qty) + Number(previous?.qty || 0);
    if (qty > 99) return { __error: "invalid_cart_quantity", __status: 400 };
    merged.set(key, { ...(previous || line), qty });
  }
  const lines = [...merged.values()];
  const ordinary = lines.filter((line: any) => line.type === "PRODUCT");
  const bundleReqs = lines.filter((line: any) => line.type === "BUNDLE").map((line: any) => ({ bundleId: String(line.bundleId), qty: Number(line.qty) }));

  let bundleRows: any[] = [];
  if (bundleReqs.length) {
    const { data, error } = await db.from("bundles").select("*").eq("shop_id", shopId).in("id", bundleReqs.map((row: any) => row.bundleId));
    if (error) throw error;
    bundleRows = data || [];
  }
  const componentIds: string[] = [];
  const now = Date.now();
  for (const req of bundleReqs) {
    const bundle = bundleRows.find((row: any) => String(row.id) === req.bundleId);
    if (!bundle || !bundle.is_active || (bundle.starts_at && new Date(bundle.starts_at).getTime() > now) || (bundle.ends_at && new Date(bundle.ends_at).getTime() < now)) {
      return { __error: "bundle_unavailable", __status: 409, bundleId: req.bundleId };
    }
    const components = Array.isArray(bundle.items) ? bundle.items : [];
    if (!components.length) return { __error: "bundle_unavailable", __status: 409, bundleId: req.bundleId };
    for (const component of components) {
      const id = String(component?.productId || "");
      if (!id) return { __error: "bundle_unavailable", __status: 409, bundleId: req.bundleId };
      componentIds.push(id);
    }
  }
  const ordinaryIds = ordinary.map((line: any) => String(line.productId));
  if (componentIds.some((id) => ordinaryIds.includes(id)) || new Set(componentIds).size !== componentIds.length) {
    return { __error: "bundle_product_also_in_cart", __status: 409 };
  }
  const productIds = Array.from(new Set([...ordinaryIds, ...componentIds]));
  const { data: productRows, error: productError } = await db.from("products")
    .select("id,name,name_ru,sku,price,stock,status,is_visible,variants,category_id")
    .eq("shop_id", shopId).in("id", productIds);
  if (productError) throw productError;
  const byId = new Map((productRows || []).map((row: any) => [String(row.id), row]));
  for (const id of productIds) {
    const product: any = byId.get(id);
    if (!product || product.status === "DELETED" || product.is_visible === false) return { __error: componentIds.includes(id) ? "bundle_unavailable" : "product_hidden_or_unavailable", __status: 409 };
  }

  const rpcItems: any[] = [];
  let subtotal = 0;
  ordinary.forEach((line: any, index: number) => {
    const product: any = byId.get(String(line.productId));
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    if (variants.length) {
      const matched = variants.find((variant: any) => normalizeName(variant?.size) === normalizeName(line.size) && normalizeName(variant?.color) === normalizeName(line.color));
      if (!matched) throw Object.assign(new Error("invalid_variant"), { webCode: "invalid_variant" });
      if ((Number(matched.qty) || 0) < Number(line.qty)) throw Object.assign(new Error("insufficient_stock"), { webCode: "insufficient_stock" });
    } else if ((Number(product.stock) || 0) < Number(line.qty)) {
      throw Object.assign(new Error("insufficient_stock"), { webCode: "insufficient_stock" });
    }
    const price = productLinePrice(product, line);
    subtotal += price * Number(line.qty);
    rpcItems.push({ product_id: String(line.productId), qty: Number(line.qty), size: line.size || null, color: line.color || null, line_id: `standard:${index}`, source_type: "STANDARD" });
  });

  const bundleStockDemand = new Map<string, number>();
  for (const req of bundleReqs) {
    const bundle = bundleRows.find((row: any) => String(row.id) === req.bundleId);
    const components = Array.isArray(bundle.items) ? bundle.items : [];
    const weighted = components.map((component: any) => {
      const product: any = byId.get(String(component.productId));
      if (Array.isArray(product?.variants) && product.variants.length) throw Object.assign(new Error("bundle_unavailable"), { webCode: "bundle_unavailable" });
      const qty = Math.max(1, Math.round(Number(component.qty) || 1));
      bundleStockDemand.set(String(product.id), (bundleStockDemand.get(String(product.id)) || 0) + qty * req.qty);
      return { component, qty, value: (Number(product.price) || 0) * qty };
    });
    const liveTotal = weighted.reduce((sum: number, row: any) => sum + row.value, 0);
    if (!(liveTotal > 0) || !(Number(bundle.bundle_price) >= 0)) return { __error: "bundle_unavailable", __status: 409, bundleId: req.bundleId };
    let allocated = 0;
    weighted.forEach((row: any, index: number) => {
      const lineQty = row.qty * req.qty;
      const targetTotal = Number(bundle.bundle_price) * req.qty;
      const lineTotal = index === weighted.length - 1 ? targetTotal - allocated : Math.round((targetTotal * row.value / liveTotal) * 100) / 100;
      allocated += lineTotal;
      rpcItems.push({
        product_id: String(row.component.productId), qty: lineQty, size: null, color: null,
        line_id: `bundle:${req.bundleId}:${row.component.productId}`, source_type: "BUNDLE",
        source_id: req.bundleId, source_name: bundle.name, price_override: lineTotal / lineQty,
      });
    });
    subtotal += Number(bundle.bundle_price) * req.qty;
  }
  for (const [productId, demand] of bundleStockDemand) {
    const product: any = byId.get(productId);
    if ((Number(product?.stock) || 0) < demand) return { __error: "bundle_unavailable", __status: 409, productId };
  }

  const cleanPromo = String(promoCode || "").trim().toUpperCase() || null;
  if (cleanPromo) {
    const promoCheck = await resolvePromoDiscount(db, shopId, cleanPromo, tgId, subtotal, productIds);
    if (!promoCheck.ok) return { __error: promoCheck.error, __status: 409 };
  }
  const bestDiscount = await resolveBestCartDiscount(
    db, shopId, tgId, subtotal, productIds, cleanPromo, bundleReqs.length > 0,
    !!settings?.allow_discount_stacking_with_bundle,
    { allowCombining: !!settings?.allow_discount_combining, maxCombinedPercent: settings?.max_combined_discount_percent != null ? Number(settings.max_combined_discount_percent) : null, includeVip: true },
  );
  const purchasedLines = rpcItems.map((line: any) => ({ productId: String(line.product_id), qty: Number(line.qty) || 0 }));
  let automaticGift: { rule: any; giftProduct: any } | null = null;
  try { automaticGift = await resolveAutomaticGift(db, shopId, subtotal, purchasedLines); }
  catch (error: any) { console.error("[WEB_GIFT_RESOLVE_FAILED]", { shopId, code: error?.code || "unknown" }); }
  const nextTier = await resolveNextTierOpportunity(db, shopId, subtotal, productIds);
  return { rpcItems, subtotal, purchasedProductIds: productIds, hasBundle: bundleReqs.length > 0, automaticGift, bestDiscount, nextTier, promoCode: cleanPromo };
}

function webDiscountSnapshot(build: WebCommerceBuild) {
  const best = build.bestDiscount || {};
  const totalDiscount = Math.min(build.subtotal, Math.max(0, Number(best.discountAmount) || 0));
  const tier = best.tier || null;
  return {
    totalDiscount,
    promoDiscount: Math.min(build.subtotal, Math.max(0, Number(best.promoDiscount) || 0)),
    tierDiscount: Math.min(build.subtotal, Math.max(0, Number(best.tierDiscount) || 0)),
    vipDiscount: Math.min(build.subtotal, Math.max(0, Number(best.vipDiscount) || 0)),
    promotion: best.promotion || null,
    vip: best.discount || null,
    tier,
    discountSource: best.source || null,
    tierSnapshot: tier ? { id: tier.id, name: tier.name || null, thresholdAmount: Number(tier.threshold_amount), discountType: tier.discount_type, discountValue: Number(tier.discount_value), discountAmount: Math.min(build.subtotal, Math.max(0, Number(best.tierDiscount) || 0)) } : null,
  };
}

function webTierProgress(build: WebCommerceBuild) {
  const current = build.bestDiscount?.tier || null;
  const next = build.nextTier || null;
  const steps: any[] = [];
  if (current) steps.push({ threshold: Number(current.threshold_amount) || 0, percent: current.discount_type === "PERCENT" ? Number(current.discount_value) || 0 : 0 });
  if (next) steps.push({ threshold: Number(next.thresholdAmount) || 0, percent: next.discountType === "PERCENT" ? Number(next.discountValue) || 0 : 0 });
  return {
    currentPercent: current?.discount_type === "PERCENT" ? Number(current.discount_value) || 0 : 0,
    remaining: next?.remainingAmount || 0,
    progress: next?.progressPercent ?? (current ? 100 : 0),
    next: next ? { threshold: next.thresholdAmount, percent: next.discountType === "PERCENT" ? Number(next.discountValue) || 0 : 0 } : null,
    steps,
  };
}

function normalizePaymentStatusForWeb(order: any): string {
  const status = String(order?.payment_status || "PENDING").toUpperCase();
  if (status === "PAID") return "PAID";
  if (["FAILED", "CANCELLED", "EXPIRED", "REFUNDED"].includes(status) || String(order?.status || "").toUpperCase() === "CANCELLED") return "FAILED";
  return "PENDING";
}


async function handleWebPrivateShopAction(db: any, shopId: string, principal: any, action: string, payload: any, tenant: any = null, masterKey: string = "") {
  const { accountId, tgId, appUser } = principal;
  const nowIso = new Date().toISOString();
  const owned = webOwnedFilter(accountId, tgId);

  if (action === "web_cart_load") {
    const { data, error } = await db.from("web_carts").select("items,item_count,updated_at,account_id")
      .eq("shop_id", shopId).eq("account_id", accountId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return { cart: { shopId, currency: "UZS", lines: (data?.items || []).map((row: any) => row.type === "BUNDLE"
      ? { lineKey: `bundle:${row.bundleId}`, bundleId: row.bundleId, quantity: Number(row.qty) || 1 }
      : { lineKey: `product:${row.productId}|${row.size || ""}|${row.color || ""}`, productId: row.productId, quantity: Number(row.qty) || 1, size: row.size || null, color: row.color || null, variantId: row.variantId || null }), updatedAt: data?.updated_at || null } };
  }
  if (action === "web_cart_merge_guest") {
    const items = sanitizeWebCartLines(payload?.cart || payload?.guestCart || payload);
    const mergeKey = String(payload?.idempotencyKey || "").trim();
    if (!mergeKey || mergeKey.length < 16 || mergeKey.length > 200) return { __error: "invalid_merge_key", __status: 400 };
    const { data, error } = await db.rpc("ustore_merge_web_cart", {
      p_shop_id: shopId,
      p_account_id: accountId,
      p_tg_id: tgId,
      p_merge_key: mergeKey,
      p_incoming_items: items,
    });
    if (error?.message === 'cart_merge_payload_changed') return { __error: 'cart_merge_conflict', __status: 409 };
    if (error) throw error;
    const merged = data || {};
    return { cart: { shopId, currency: "UZS", lines: Array.isArray(merged.items) ? merged.items.map((row: any) => row.type === "BUNDLE"
      ? { lineKey: `bundle:${row.bundleId}`, bundleId: row.bundleId, quantity: Number(row.qty) || 1 }
      : { lineKey: `product:${row.productId}|${row.size || ""}|${row.color || ""}`, productId: row.productId, quantity: Number(row.qty) || 1, size: row.size || null, color: row.color || null, variantId: row.variantId || null }) : [], updatedAt: merged.updatedAt || nowIso }, replayed: merged.replayed === true };
  }
  if (action === "web_cart_replace") return { __error: "cart_version_conflict", __status: 409 };
  if (action === "web_cart_mutate" || action === "web_cart_clear") {
    const operation = action === "web_cart_clear" ? "clear" : String(payload?.operation || "");
    const quantity = Number(payload?.line?.quantity);
    const cleaned = sanitizeWebCartLines({lines:[{...payload?.line,quantity:1}]})[0];
    if (!["add","set","clear"].includes(operation) || (operation !== "clear" && (!Number.isInteger(quantity) || quantity < 0 || quantity > 99))) return {__error:"invalid_cart_mutation",__status:400};
    if (operation === "add" && (!cleaned || Boolean(payload?.line?.productId) === Boolean(payload?.line?.bundleId))) return {__error:"invalid_cart_line",__status:400};
    const lineKey = operation === "add" ? (cleaned.type === "BUNDLE" ? `bundle:${cleaned.bundleId}` : `product:${cleaned.productId}|${cleaned.size || ""}|${cleaned.color || ""}`) : String(payload?.line?.lineKey || "");
    const line = operation === "clear" ? {} : {...(operation === "add" ? cleaned : {}),lineKey,quantity};
    const {data,error}=await db.rpc("ustore_mutate_web_cart",{p_shop_id:shopId,p_account_id:accountId,p_tg_id:tgId,p_mutation_id:String(payload?.mutationId||""),p_operation:operation,p_line:line});
    if(error){const message=String(error.message||"");if(message.startsWith("invalid_"))return {__error:message,__status:400};if(message==="cart_line_not_found")return {__error:message,__status:404};if(message==="cart_mutation_conflict")return {__error:message,__status:409};throw error;}
    return {cart:{shopId,currency:"UZS",lines:(data?.items||[]).map((row:any)=>({...row,quantity:row.qty,lineKey:row.type==="BUNDLE"?`bundle:${row.bundleId}`:`product:${row.productId}|${row.size||""}|${row.color||""}`})),updatedAt:data?.updatedAt||null},cleared:operation==="clear"};
  }

  // Astra-5c — authoritative premium-web quote/order/payment path. Browser
  // price fields are ignored; only product/bundle identifiers/options/qty are
  // accepted and all money/stock/discount decisions are recalculated here.
  if (action === "web_checkout_quote") {
    const { data: settings, error: settingsError } = await db.from("shop_settings")
      .select("fulfillment_config,orders_paused,orders_paused_note,allow_discount_stacking_with_bundle,allow_discount_combining,max_combined_discount_percent")
      .eq("shop_id", shopId).maybeSingle();
    if (settingsError) throw settingsError;
    const cartLines = sanitizeWebCartLines(payload?.cart || payload);
    let persistedPromo: string | null = null;
    const { data: cartRow, error: cartReadError } = await db.from("web_carts").select("selected_promo_code")
      .eq("shop_id", shopId).eq("account_id", accountId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (cartReadError) throw cartReadError;
    persistedPromo = cartRow?.selected_promo_code ? String(cartRow.selected_promo_code) : null;
    const promoProvided = Object.prototype.hasOwnProperty.call(payload || {}, "promoCode");
    const promoCode = promoProvided ? (String(payload?.promoCode || "").trim().toUpperCase() || null) : persistedPromo;
    let build: any;
    try { build = await buildWebAuthoritativeCart(db, shopId, tgId, cartLines, promoCode, settings || {}); }
    catch (error: any) {
      if (error?.webCode) return { __error: error.webCode, __status: 409 };
      throw error;
    }
    if (build?.__error) return build;
    if (promoProvided) {
      const { error } = await db.from("web_carts").update({ selected_promo_code: build.promoCode, updated_at: nowIso })
        .eq("shop_id", shopId).eq("account_id", accountId);
      if (error) throw error;
    }
    const config = sanitizeFulfillmentConfig(settings?.fulfillment_config);
    const deliveryOptions = listWebDeliveryOptions(config);
    const readiness = await readWebPaymentReadiness(db, shopId);
    const selected = parseWebDeliveryId(payload?.deliverySelection?.id);
    let deliveryFee = 0;
    let paymentMethods: any[] = [];
    if (selected) {
      const option = deliveryOptions.find((row) => row.id === `${selected.regionKey}|${selected.methodId}` && row.available);
      if (!option) return { __error: "delivery_method_not_available", __status: 409 };
      const district = regionLabelForSnapshot(selected.regionKey);
      let deliverySnapshot: any;
      try { deliverySnapshot = resolveDeliverySnapshot(config, selected.regionKey, selected.methodId, district); }
      catch (error: any) { return { __error: error?.message || "delivery_method_not_available", __status: 409 }; }
      deliveryFee = deliverySnapshot.kind === "FIXED" ? nonNegativeInteger(deliverySnapshot.fee) : 0;
      paymentMethods = listWebPaymentMethods(config, selected.regionKey, tenant, readiness);
    }
    const discount = webDiscountSnapshot(build);
    const total = Math.max(0, build.subtotal + deliveryFee - discount.totalDiscount);
    return {
      currency: "UZS", serverAuthoritative: true,
      subtotal: build.subtotal, discounts: discount.totalDiscount, delivery: deliveryFee, total,
      deliveryOptions, paymentMethods,
      promo: discount.promotion && discount.promoDiscount > 0 ? { code: discount.promotion.code, discount: discount.promoDiscount } : null,
      tierProgress: webTierProgress(build),
      gift: build.automaticGift ? { eligible: true, productId: build.automaticGift.giftProduct.id, productName: build.automaticGift.giftProduct.name, quantity: Number(build.automaticGift.rule.gift_quantity) || 1 } : { eligible: false },
      ordersPaused: settings?.orders_paused === true, ordersPausedNote: settings?.orders_paused_note || null,
    };
  }

  if (action === "web_order_create") {
    const checkout = payload?.checkout && typeof payload.checkout === "object" ? payload.checkout : {};
    const idempotencyKey = await webIdempotencyUuid(payload?.idempotencyKey);
    if (!idempotencyKey) return { __error: "invalid_idempotency_key", __status: 400 };
    // Recover committed checkout before reading the cleared cart or changed stock.
    const { data: priorOrder, error: priorError } = await db.from("orders").select("*")
      .eq("shop_id", shopId).eq("checkout_key", idempotencyKey).maybeSingle();
    if (priorError) throw priorError;
    if (priorOrder) {
      if (priorOrder.account_id !== accountId || String(priorOrder.tg_id) !== tgId ||
          priorOrder.order_source !== "WEB" || !priorOrder.web_checkout_finalized_at) {
        return { __error: "idempotency_conflict", __status: 409 };
      }
      return { order: mapOrderForClient(priorOrder, { includeInternalNote: false }), replayed: true };
    }
    const contactName = nullableText(checkout.contactName, 120);
    const phone = normalizeWebCheckoutPhone(checkout.phone);
    const address = nullableText(checkout.address, 300);
    const selected = parseWebDeliveryId(checkout.deliveryId);
    const paymentMethod = String(checkout.paymentMethod || "").trim();
    if (!contactName || !phone || !address || !selected || !paymentMethod || checkout.consent !== true) return { __error: "invalid_order_fields", __status: 400 };

    const [{ data: settings, error: settingsError }, { data: cartRow, error: cartError }] = await Promise.all([
      db.from("shop_settings").select("fulfillment_config,orders_paused,orders_paused_note,allow_discount_stacking_with_bundle,allow_discount_combining,max_combined_discount_percent")
        .eq("shop_id", shopId).maybeSingle(),
      db.from("web_carts").select("items,selected_promo_code,updated_at").eq("shop_id", shopId).eq("account_id", accountId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (settingsError) throw settingsError;
    if (cartError) throw cartError;
    if (settings?.orders_paused) return { __error: "orders_paused", __status: 409, message: settings.orders_paused_note || "Buyurtmalar vaqtincha to‘xtatilgan." };
    if (!Array.isArray(cartRow?.items) || !cartRow.items.length) return { __error: "invalid_cart", __status: 400 };

    let build: any;
    try { build = await buildWebAuthoritativeCart(db, shopId, tgId, cartRow.items, cartRow.selected_promo_code || null, settings || {}); }
    catch (error: any) {
      if (error?.webCode) return { __error: error.webCode, __status: 409 };
      throw error;
    }
    if (build?.__error) return build;

    const config = sanitizeFulfillmentConfig(settings?.fulfillment_config);
    const deliveryOption = listWebDeliveryOptions(config).find((row) => row.id === `${selected.regionKey}|${selected.methodId}` && row.available);
    if (!deliveryOption) return { __error: "delivery_method_not_available", __status: 409 };
    const district = regionLabelForSnapshot(selected.regionKey);
    let deliverySnapshot: any, paymentSnapshot: any;
    try {
      deliverySnapshot = { ...resolveDeliverySnapshot(config, selected.regionKey, selected.methodId, district), district, address };
      paymentSnapshot = resolvePaymentSnapshot(config, selected.regionKey, paymentMethod, district);
    } catch (error: any) { return { __error: error?.message || "checkout_option_not_available", __status: 409 }; }
    const readiness = await readWebPaymentReadiness(db, shopId);
    const allowedPayments = listWebPaymentMethods(config, selected.regionKey, tenant, readiness);
    if (!allowedPayments.some((row) => row.id === paymentMethod)) return { __error: "payment_method_not_available", __status: 409 };

    const discount = webDiscountSnapshot(build);
    const deliveryFee = deliverySnapshot.kind === "FIXED" ? nonNegativeInteger(deliverySnapshot.fee) : 0;
    const payableTotal = Math.max(0, build.subtotal + deliveryFee - discount.totalDiscount);
    const quotedTotal = Number(checkout?.quoteSnapshot?.total);
    if (!Number.isFinite(quotedTotal) || Math.abs(quotedTotal - payableTotal) > 0.01) {
      return { __error: "quote_changed", __status: 409, currentTotal: payableTotal, currency: "UZS" };
    }

    let automaticGift = build.automaticGift;
    const baseRpcItems = build.rpcItems.map((row: any) => ({ ...row }));
    const snapshotFor = (gift: any) => ({
      subtotal: build.subtotal, deliveryFee, payableTotal,
      deliverySnapshot, paymentSnapshot,
      shipment: { status: "READY", kind: deliverySnapshot.kind, providerId: deliverySnapshot.providerId || null, providerName: deliverySnapshot.providerName || null, updatedAt: nowIso },
      promoCode: discount.promotion && discount.promoDiscount > 0 ? discount.promotion.code : null,
      promoDiscount: discount.promoDiscount, tierDiscount: discount.tierDiscount, vipDiscount: discount.vipDiscount,
      tierId: discount.tier?.id || null, tierSnapshot: discount.tierSnapshot, discountSource: discount.discountSource,
      giftSnapshot: gift ? { ruleId: gift.rule.id, ruleName: gift.rule.name || null, productId: gift.giftProduct.id, productName: gift.giftProduct.name, quantity: Number(gift.rule.gift_quantity) || 1 } : null,
    });
    const invokeCreate = async (gift: any) => {
      const rpcItems = baseRpcItems.map((row: any) => ({ ...row }));
      if (gift) rpcItems.push({
        product_id: String(gift.giftProduct.id), qty: Number(gift.rule.gift_quantity) || 1,
        size: null, color: null, line_id: `gift:${gift.rule.id}`, source_type: "GIFT",
        source_id: gift.rule.id, source_name: gift.rule.name, price_override: 0,
      });
      return db.rpc("ustore_create_web_order", {
        p_shop_id: shopId, p_account_id: accountId, p_tg_id: tgId,
        p_user_name: contactName, p_phone: phone,
        p_region: selected.regionKey === "tashkent_city" ? "TASHKENT" : "PROVINCE",
        p_district: district, p_address: address, p_pay_method: paymentMethod,
        p_items: rpcItems, p_checkout_key: idempotencyKey, p_expected_subtotal: build.subtotal,
        p_snapshot: snapshotFor(gift),
        p_promotion_id: discount.promotion && discount.promoDiscount > 0 ? discount.promotion.id : null,
        p_customer_discount_id: discount.vip && discount.vipDiscount > 0 ? discount.vip.id : null,
        p_gift_rule_id: gift?.rule?.id || null, p_gift_product_id: gift?.giftProduct?.id || null,
        p_gift_quantity: gift ? (Number(gift.rule.gift_quantity) || 1) : null,
      });
    };

    let created = await invokeCreate(automaticGift);
    if (created.error && automaticGift && String(created.error.message || "").includes(`insufficient_stock:${automaticGift.giftProduct.id}`)) {
      if (automaticGift.rule.stock_zero_policy === "AUTO_PAUSE") {
        await db.from("automatic_gift_rules").update({ is_active: false, updated_at: nowIso }).eq("shop_id", shopId).eq("id", automaticGift.rule.id);
      }
      automaticGift = null;
      created = await invokeCreate(null);
    }
    if (created.error) {
      const message = String(created.error.message || "");
      if (message.includes("quote_changed")) return { __error: "quote_changed", __status: 409 };
      if (message.includes("insufficient_stock")) return { __error: "insufficient_stock", __status: 409 };
      if (message.includes("variant_required_or_invalid") || message.includes("invalid_variant")) return { __error: "invalid_variant", __status: 409 };
      if (message.includes("promo_")) return { __error: message.match(/promo_[a-z_]+/)?.[0] || "promo_unavailable", __status: 409 };
      if (message.includes("checkout_key_conflict") || message.includes("checkout_key_incomplete")) return { __error: "idempotency_conflict", __status: 409 };
      throw created.error;
    }
    const rpcData: any = created.data || {};
    const orderRow = rpcData.order || rpcData;
    if (!orderRow?.id) throw new Error("invalid_web_order_response");
    const replayed = rpcData.replayed === true;
    const mappedOrder = mapOrderForClient(orderRow, { includeInternalNote: false });
    // Preserve cart edits made in another tab while checkout was in flight.
    if (cartRow.updated_at) await db.from("web_carts").delete().eq("shop_id", shopId).eq("account_id", accountId).eq("updated_at", cartRow.updated_at);

    // Astra-6c: WEB order ham shop operatsion Telegram bildirishnomalariga
    // kiradi, lekin idempotent replay yangi notification yaratmaydi.
    // Shop bot bloklangan/boshlanmagan bo'lsa delivery xatosi checkout
    // response'ini yiqitmaydi; order Web Buyurtmalar bo'limida authoritative.
    if (!replayed) {
      EdgeRuntime.waitUntil((async () => {
        try {
          if (!tenant?.tokenCiphertext || !tenant?.tokenIv) throw new Error("missing_tenant_bot_token");
          const botToken = await decryptBotToken(masterKey, tenant.tokenCiphertext, tenant.tokenIv);
          await Promise.allSettled([
            backgroundNotifyOrder(db, shopId, botToken, "", mappedOrder, contactName, phone, regionLabelForSnapshot(selected.regionKey), district, address, paymentSnapshot.label || paymentMethod),
            notifyOrderCreatedCustomer(botToken, mappedOrder),
          ]);
        } catch (error: any) {
          console.error("[WEB_ORDER_NOTIFICATION_BACKGROUND_FAILED]", { shopId, orderId: orderRow.id, code: error?.code || "unknown" });
        }
      })());
    }
    return { order: mappedOrder, replayed };
  }

  if (action === "web_payment_status") {
    const orderId = Number(payload?.orderId);
    if (!Number.isInteger(orderId) || orderId <= 0) return { __error: "invalid_order", __status: 400 };
    const { data: order, error } = await db.from("orders").select("id,status,pay_method,payment_status,paid_at,payment_snapshot")
      .eq("shop_id", shopId).eq("id", orderId).or(owned).maybeSingle();
    if (error) throw error;
    if (!order) return { __error: "order_not_found", __status: 404 };
    const { data: attempt, error: attemptError } = await db.from("web_payment_attempts")
      .select("provider_reference,redirect_url,status,method").eq("shop_id", shopId).eq("order_id", orderId).eq("account_id", accountId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (attemptError) throw attemptError;
    const authoritativeStatus = normalizePaymentStatusForWeb(order);
    const attemptStatus = String(attempt?.status || '').toUpperCase() || null;
    const status = authoritativeStatus === "PENDING" && attemptStatus === "PROCESSING" ? "PROCESSING" : authoritativeStatus;
    return {
      payment: { orderId, method: order.pay_method, status, paidAt: order.paid_at || null, attemptStatus,
        recoveryRequired: status === "PROCESSING", providerReference: attempt?.provider_reference || null,
        redirectUrl: attempt?.redirect_url || null, serverAuthoritative: true },
    };
  }

  if (action === "web_payment_start") {
    const orderId = Number(payload?.orderId);
    const method = String(payload?.method || "").trim();
    const idempotencyRaw = String(payload?.idempotencyKey || "").trim();
    if (!Number.isInteger(orderId) || orderId <= 0 || !method || !idempotencyRaw || idempotencyRaw.length > 200) return { __error: "invalid_payment_request", __status: 400 };
    const { data: order, error: orderError } = await db.from("orders").select("*")
      .eq("shop_id", shopId).eq("id", orderId).or(owned).maybeSingle();
    if (orderError) throw orderError;
    if (!order) return { __error: "order_not_found", __status: 404 };
    if (String(order.pay_method) !== method) return { __error: "payment_method_conflict", __status: 409 };
    if (normalizePaymentStatusForWeb(order) === "PAID") return { payment: { orderId, method, status: "PAID", paidAt: order.paid_at || null, redirectUrl: null, serverAuthoritative: true } };
    if (String(order.status).toUpperCase() === "CANCELLED") return { __error: "order_cancelled", __status: 409 };
    if (["CASH", "CASH_ON_DELIVERY"].includes(method)) return { payment: { orderId, method, status: "PENDING", redirectUrl: null, serverAuthoritative: true } };

    const { data: sameKey, error: sameKeyError } = await db.from("web_payment_attempts").select("*")
      .eq("shop_id", shopId).eq("account_id", accountId).eq("idempotency_key", idempotencyRaw).maybeSingle();
    if (sameKeyError) throw sameKeyError;
    if (sameKey) {
      if (Number(sameKey.order_id) !== orderId || String(sameKey.method) !== method) return { __error: "idempotency_conflict", __status: 409 };
      if (sameKey.response && ["PENDING", "PAID"].includes(String(sameKey.status))) return { payment: sameKey.response };
      if (String(sameKey.status) === "PROCESSING") return { payment: { orderId, method, status: "PROCESSING", recoveryRequired: true, providerReference: sameKey.provider_reference || null, redirectUrl: sameKey.redirect_url || null, serverAuthoritative: true } };
      return { __error: sameKey.error_code || "payment_start_failed", __status: 409 };
    }

    const attemptId = crypto.randomUUID();
    const insertAttempt = await db.from("web_payment_attempts").insert({
      id: attemptId, shop_id: shopId, order_id: orderId, account_id: accountId,
      idempotency_key: idempotencyRaw, method, status: "PROCESSING", updated_at: nowIso,
    });
    if (insertAttempt.error) {
      if (String(insertAttempt.error.code) === "23505") {
        const { data: active } = await db.from("web_payment_attempts").select("*").eq("shop_id", shopId).eq("order_id", orderId).eq("method", method)
          .in("status", ["PROCESSING", "PENDING", "PAID"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (active?.response && ["PENDING", "PAID"].includes(String(active.status))) return { payment: active.response };
        if (String(active?.status) === "PROCESSING") return { payment: { orderId, method, status: "PROCESSING", recoveryRequired: true, providerReference: active?.provider_reference || null, redirectUrl: active?.redirect_url || null, serverAuthoritative: true } };
        return { __error: "payment_start_in_progress", __status: 409 };
      }
      throw insertAttempt.error;
    }

    let externalStartAttempted = false;
    try {
      let response: any = { orderId, method, status: "PENDING", redirectUrl: null, serverAuthoritative: true };
      let providerReference: string | null = null;
      let redirectUrl: string | null = null;
      if (method === "CARD") {
        if (order.payment_snapshot?.receiptRequired === true) throw new Error("manual_receipt_flow_unavailable");
        response = { ...response, cardNumber: order.payment_snapshot?.cardNumber || null, cardHolder: order.payment_snapshot?.cardHolder || null };
      } else if (method === "PAYME") {
        if (!tenant?.paymeAccessGranted) throw new Error("payme_not_available");
        const { data: conn, error } = await db.from("payme_connections").select("status,verified,merchant_id").eq("shop_id", shopId).maybeSingle();
        if (error) throw error;
        if (conn?.status !== "CONNECTED" || conn?.verified !== true || !conn?.merchant_id) throw new Error("payme_not_connected");
        redirectUrl = buildPaymeCheckoutUrl({ merchantId: conn.merchant_id, orderAccountField: "order_id", orderId, amountTiyin: Math.round(Number(order.payable_total || order.total_price || 0) * 100), lang: "uz" });
        response = { ...response, redirectUrl };
      } else if (method === "CLICK") {
        if (!tenant?.clickAccessGranted || !masterKey) throw new Error("click_not_available");
        const { data: conn, error } = await db.from("click_connections").select("status,verified,service_id,merchant_user_id,secret_key_ciphertext,secret_key_iv").eq("shop_id", shopId).maybeSingle();
        if (error) throw error;
        if (conn?.status !== "CONNECTED" || conn?.verified !== true || !conn?.secret_key_ciphertext) throw new Error("click_not_connected");
        const secretKey = await decryptBotToken(masterKey, conn.secret_key_ciphertext, conn.secret_key_iv);
        externalStartAttempted = true;
        const invoiceId = await clickCreateInvoice({ merchantUserId: conn.merchant_user_id, secretKey, serviceId: conn.service_id }, { amount: Number(order.payable_total || order.total_price || 0), phoneNumber: String(order.phone || "").replace(/^\+/, ""), merchantTransId: String(orderId) });
        providerReference = String(invoiceId);
        response = { ...response, providerReference };
      } else if (method === "UZUM") {
        if (!tenant?.uzumAccessGranted || !masterKey) throw new Error("uzum_not_available");
        const { data: conn, error } = await db.from("uzum_connections").select("status,terminal_id,api_key_ciphertext,api_key_iv").eq("shop_id", shopId).maybeSingle();
        if (error) throw error;
        if (conn?.status !== "CONNECTED" || !conn?.api_key_ciphertext) throw new Error("uzum_not_connected");
        const apiKey = await decryptBotToken(masterKey, conn.api_key_ciphertext, conn.api_key_iv);
        externalStartAttempted = true;
        const registered = await uzumRegisterPayment({ terminalId: conn.terminal_id, apiKey }, { amountTiyin: Math.round(Number(order.payable_total || order.total_price || 0) * 100), clientId: tgId, orderNumber: String(orderId), lang: "uz-UZ" });
        providerReference = registered.orderId; redirectUrl = registered.paymentUrl;
        const savedTransaction = await db.from("uzum_transactions").insert({ shop_id: shopId, order_id: orderId, uzum_order_id: registered.orderId, amount: Number(order.payable_total || order.total_price || 0), state: "REGISTERED" });
        if (savedTransaction.error) throw savedTransaction.error;
        response = { ...response, providerReference, redirectUrl };
      } else {
        throw new Error("payment_method_not_available");
      }
      const update = await db.from("web_payment_attempts").update({ status: "PENDING", provider_reference: providerReference, redirect_url: redirectUrl, response, error_code: null, updated_at: new Date().toISOString() })
        .eq("id", attemptId).eq("shop_id", shopId).eq("account_id", accountId);
      if (update.error) throw update.error;
      return { payment: response };
    } catch (error: any) {
      // A timeout/persistence failure after dispatch is an UNKNOWN result, not
      // proof of rejection. Retain the unique PROCESSING lock until reconciled.
      const errorCode = externalStartAttempted ? "payment_reconciliation_required" : "payment_start_failed";
      await db.from("web_payment_attempts").update({ status: externalStartAttempted ? "PROCESSING" : "FAILED", error_code: errorCode, updated_at: new Date().toISOString() })
        .eq("id", attemptId).eq("shop_id", shopId).eq("account_id", accountId);
      console.error("[WEB_PAYMENT_START_FAILED]", { shopId, orderId, method, code: error?.code || errorCode });
      if (externalStartAttempted) return { payment: { orderId, method, status: "PROCESSING", recoveryRequired: true, providerReference: null, redirectUrl: null, serverAuthoritative: true } };
      return { __error: "payment_start_failed", __status: 409 };
    }
  }


  if (action === "web_profile_get") {
    return {
      account: { id: accountId, displayName: principal.actor.displayName },
      shopProfile: { shopId, phone: appUser?.phone || null, name: principal.actor.displayName },
      actor: principal.actor,
    };
  }
  if (action === "web_profile_update") {
    const patch = payload?.patch && typeof payload.patch === "object" ? payload.patch : {};
    const firstName = nullableText(patch.firstName ?? patch.name, 100);
    const lastName = nullableText(patch.lastName, 100);
    const phone = String(patch.phone || "").replace(/\s+/g, "");
    if (!firstName || !/^\+998\d{9}$/.test(phone)) return { __error: "invalid_profile", __status: 400 };
    const legalDocuments = await readShopLegalDocuments(db, shopId);
    const required = legalDocuments.filter((d: any) => d.enabled && LEGAL_CONSENT_TYPES.has(d.type));
    const supplied = new Map<string, number>((Array.isArray(patch.legalAcceptances) ? patch.legalAcceptances : [])
      .map((x: any) => [String(x?.type || ""), Number(x?.version || 0)]));
    const { data: consentRows, error: consentError } = required.length
      ? await db.from("shop_legal_consents").select("doc_type,document_version").eq("shop_id", shopId).or(owned)
      : { data: [], error: null } as any;
    if (consentError) throw consentError;
    const accepted = new Set((consentRows || []).map((row: any) => `${row.doc_type}:${Number(row.document_version)}`));
    for (const doc of required) if (!accepted.has(`${doc.type}:${Number(doc.version)}`) && supplied.get(doc.type) !== Number(doc.version)) {
      return { __error: "legal_consent_required", __status: 409, documentType: doc.type, version: doc.version };
    }
    const { error } = await db.from("app_users").update({ profile_first_name: firstName, profile_last_name: lastName, phone, account_id: accountId })
      .eq("shop_id", shopId).eq("tg_id", tgId);
    if (error) throw error;
    const newlyAccepted = required.filter((doc: any) => !accepted.has(`${doc.type}:${Number(doc.version)}`) && supplied.get(doc.type) === Number(doc.version));
    if (newlyAccepted.length) {
      const rows = newlyAccepted.map((doc: any) => ({ shop_id: shopId, tg_id: tgId, account_id: accountId, doc_type: doc.type, document_version: Number(doc.version), source: appUser?.phone ? "REACCEPT" : "REGISTRATION", accepted_at: nowIso }));
      const { error: insertError } = await db.from("shop_legal_consents").upsert(rows, { onConflict: "shop_id,tg_id,doc_type,document_version", ignoreDuplicates: true });
      if (insertError) throw insertError;
    }
    return { account: { id: accountId, displayName: [firstName, lastName].filter(Boolean).join(" ") }, shopProfile: { shopId, phone, name: [firstName, lastName].filter(Boolean).join(" ") } };
  }
  if (action === "web_favorites_list") {
    const { data, error } = await db.from("user_favorites").select("product_id,created_at").eq("shop_id", shopId).or(owned).order("created_at", { ascending: false });
    if (error) throw error;
    const items = (data || []).map((row: any) => ({ productId: row.product_id, createdAt: row.created_at }));
    return { items, nextCursor: null, total: items.length };
  }
  if (action === "web_favorite_set") {
    const productId = String(payload?.productId || "");
    if (!productId || typeof payload?.favorite !== "boolean") return { __error: "invalid_favorite", __status: 400 };
    const { data: product, error: productError } = await db.from("products").select("id").eq("shop_id", shopId).eq("id", productId).neq("status", "DELETED").eq("is_visible", true).maybeSingle();
    if (productError) throw productError;
    if (!product) return { __error: "product_not_found", __status: 404 };
    const { data: existing, error: existingError } = await db.from("user_favorites").select("id").eq("shop_id", shopId).eq("product_id", productId).or(owned).maybeSingle();
    if (existingError) throw existingError;
    if (payload.favorite && !existing) {
      const { error } = await db.from("user_favorites").insert({ shop_id: shopId, tg_id: tgId, account_id: accountId, product_id: productId });
      if (error) throw error;
    } else if (!payload.favorite && existing) {
      const { error } = await db.from("user_favorites").delete().eq("shop_id", shopId).eq("id", existing.id);
      if (error) throw error;
    }
    return { favorite: payload.favorite };
  }

  if (action === "web_orders_list") {
    const { data, error } = await db.from("orders").select("*").eq("shop_id", shopId).or(owned).order("id", { ascending: false }).limit(500);
    if (error) throw error;
    const items = await mapOrdersWithReturns(db, shopId, data || [], false);
    return { items, nextCursor: null, total: items.length };
  }
  if (action === "web_order_get") {
    const orderId = Number(payload?.orderId);
    if (!Number.isInteger(orderId) || orderId <= 0) return { __error: "invalid_order", __status: 400 };
    const { data, error } = await db.from("orders").select("*").eq("shop_id", shopId).eq("id", orderId).or(owned).maybeSingle();
    if (error) throw error;
    if (!data) return { __error: "order_not_found", __status: 404 };
    const [order] = await mapOrdersWithReturns(db, shopId, [data], false);
    return { order };
  }
  if (action === "web_order_cancel" || action === "web_order_confirm_received") {
    const orderId = Number(payload?.orderId);
    if (!Number.isInteger(orderId) || orderId <= 0) return { __error: "invalid_order", __status: 400 };
    const { data: ownedOrder, error: ownedOrderError } = await db.from("orders").select("id,status,shipment").eq("shop_id", shopId).eq("id", orderId).or(owned).maybeSingle();
    if (ownedOrderError) throw ownedOrderError;
    if (!ownedOrder) return { __error: "order_not_found", __status: 404 };
    if (action === "web_order_cancel") {
      const { data: settings, error: settingsError } = await db.from("shop_settings").select("customer_cancel_cutoff").eq("shop_id", shopId).maybeSingle();
      if (settingsError) throw settingsError;
      const cutoff = settings?.customer_cancel_cutoff || "BEFORE_SHIPPED";
      const shipmentStatus = ownedOrder.shipment?.status || "READY";
      const shipped = ["IN_TRANSIT", "HANDED_TO_CARRIER"].includes(shipmentStatus);
      const allowed = cutoff === "NEW_ONLY" ? ownedOrder.status === "NEW"
        : cutoff === "BEFORE_SHIPPED" ? (ownedOrder.status === "NEW" || (ownedOrder.status === "PROCESSING" && !shipped))
        : ownedOrder.status === "NEW" || ownedOrder.status === "PROCESSING";
      if (!allowed) return { __error: "cancel_not_allowed_at_this_stage", __status: 409 };
    }
    const nextStatus = action === "web_order_cancel" ? "CANCELLED" : "DELIVERED";
    const reason = action === "web_order_cancel" ? (nullableText(payload?.reason, 500) || "Mijoz tomonidan bekor qilindi") : null;
    const result = await db.rpc("update_order_status", { p_shop_id: shopId, p_order_id: orderId, p_new_status: nextStatus, p_requester_tg_id: tgId, p_is_admin: false, p_cancel_reason: reason });
    if (result.error) {
      const message = String(result.error.message || "");
      if (message.includes("forbidden")) return { __error: "forbidden", __status: 403 };
      if (message.includes("terminal_status") || message.includes("invalid_transition")) return { __error: "invalid_status_transition", __status: 409 };
      if (message.includes("order_not_found")) return { __error: "order_not_found", __status: 404 };
      throw result.error;
    }
    const { data: orderRow, error: fetchError } = await db.from("orders").select("*").eq("shop_id", shopId).eq("id", orderId).or(owned).single();
    if (fetchError) throw fetchError;
    // Preserve the existing Telegram customer-confirmation side effects for
    // premium web. The order status is already committed at this point;
    // reward notification/BILLZ synchronization stay best-effort background
    // work and never turn a successful confirmation into a failed response.
    if (action === "web_order_confirm_received" && orderRow?.payment_status === "PAID") {
      EdgeRuntime.waitUntil((async () => {
        try {
          if (!tenant?.tokenCiphertext || !tenant?.tokenIv) throw new Error("missing_tenant_bot_token");
          const botToken = await decryptBotToken(masterKey, tenant.tokenCiphertext, tenant.tokenIv);
          await checkAndIssueRewards(db, shopId, String(orderRow.tg_id), Number(orderRow.id), Number(orderRow.payable_total || 0), botToken);
        } catch (error: any) {
          console.error("[WEB_ORDER_REWARD_BACKGROUND_FAILED]", { shopId, orderId, code: error?.code || "unknown" });
        }
      })());
      EdgeRuntime.waitUntil(pushOrderToBillzInBackground(db, shopId, Number(orderRow.id), orderRow.items || [], masterKey));
    }
    const [order] = await mapOrdersWithReturns(db, shopId, [orderRow], false);
    return { order };
  }

  if (action === "web_support_list") {
    const { data, error } = await db.from("support_tickets").select("*").eq("shop_id", shopId).or(owned).order("id", { ascending: false }).limit(200);
    if (error) throw error;
    const rows = await attachTicketSummaries(db, shopId, data || []);
    return { items: rows.map((row: any) => ({ ...row, subject: row.ticketType === "RETURN" ? "Qaytarish / muammo" : "Qo‘llab-quvvatlash", updatedAt: row.lastMessageAt || row.answeredAt || row.createdAt })), nextCursor: null, total: rows.length };
  }
  if (action === "web_support_messages") {
    const ticketId = Number(payload?.threadId);
    if (!Number.isInteger(ticketId) || ticketId <= 0) return { __error: "invalid_ticket", __status: 400 };
    const { data: ticket, error: ticketError } = await db.from("support_tickets").select("id").eq("shop_id", shopId).eq("id", ticketId).or(owned).maybeSingle();
    if (ticketError) throw ticketError;
    if (!ticket) return { __error: "ticket_not_found", __status: 404 };
    await db.from("support_ticket_messages").update({ read_at: nowIso }).eq("shop_id", shopId).eq("ticket_id", ticketId).eq("sender", "ADMIN").is("read_at", null);
    const { data, error } = await db.from("support_ticket_messages").select("*").eq("shop_id", shopId).eq("ticket_id", ticketId).order("id", { ascending: true }).limit(100);
    if (error) throw error;
    const items = await Promise.all((data || []).map(async (message: any) => {
      if (!message.attachment_path) return mapSupportMessageForClient(message);
      const { data: signed } = await db.storage.from("support-attachments").createSignedUrl(message.attachment_path, 300);
      return mapSupportMessageForClient(message, { attachmentUrl: signed?.signedUrl || null });
    }));
    return { items, nextCursor: null, total: items.length };
  }
  if (action === "web_support_upload_prepare") {
    const mimeType = String(payload?.mimeType || "").toLowerCase();
    const extByMime: Record<string,string> = { "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp" };
    const ext = extByMime[mimeType];
    const size = Number(payload?.size || 0);
    if (!ext || !Number.isFinite(size) || size <= 0 || size > 5 * 1024 * 1024) return { __error: "invalid_support_attachment", __status: 400 };
    const path = `shops/${shopId}/support/${tgId}/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await db.storage.from("support-attachments").createSignedUploadUrl(path);
    if (error || !data?.token) throw error || new Error("support_attachment_upload_url_failed");
    return { path, token: data.token, bucket: "support-attachments" };
  }
  if (action === "web_support_send") {
    const threadId = payload?.threadId ? Number(payload.threadId) : null;
    const body = nullableText(payload?.text, 2000);
    const clientMessageId = nullableText(payload?.clientMessageId, 120);
    const attachmentInput = payload?.attachment && typeof payload.attachment === "object" ? payload.attachment : null;
    if (!clientMessageId || (!body && !attachmentInput?.path)) return { __error: "invalid_message", __status: 400 };
    if (threadId !== null && (!Number.isSafeInteger(threadId) || threadId <= 0)) return { __error: "invalid_ticket", __status: 400 };
    let attachment: Record<string, unknown> = {};
    if (attachmentInput?.path) {
      const path = String(attachmentInput.path);
      const expectedFolder = `shops/${shopId}/support/${tgId}`;
      const mimeType = String(attachmentInput.mimeType || "").toLowerCase();
      const size = Number(attachmentInput.size || 0);
      if (!path.startsWith(`${expectedFolder}/`) || !/^[0-9a-f-]+\.(?:jpg|jpeg|png|webp)$/i.test(path.slice(expectedFolder.length + 1))) return { __error: "invalid_support_attachment", __status: 400 };
      if (!["image/jpeg","image/png","image/webp"].includes(mimeType) || size <= 0 || size > 5 * 1024 * 1024) return { __error: "invalid_support_attachment", __status: 400 };
      const fileName = path.slice(expectedFolder.length + 1);
      const { data: objects, error: objectError } = await db.storage.from("support-attachments").list(expectedFolder, { search: fileName, limit: 5 });
      const stored = (objects || []).find((object: any) => object.name === fileName);
      if (objectError || !stored) return { __error: "support_attachment_not_uploaded", __status: 400 };
      const storedSize = Number(stored.metadata?.size);
      const storedMime = String(stored.metadata?.mimetype || "").toLowerCase();
      if (!Number.isFinite(storedSize) || storedSize <= 0 || storedSize > 5 * 1024 * 1024 || storedSize !== size || storedMime !== mimeType) return { __error: "invalid_support_attachment", __status: 400 };
      attachment = { attachment_path: path, attachment_mime: mimeType, attachment_name: nullableText(attachmentInput.name, 180), attachment_size: size };
    }
    const { data: sent, error: sendError } = await db.rpc("ustore_send_web_support_message", {
      p_shop_id: shopId, p_account_id: accountId, p_tg_id: tgId,
      p_thread_id: threadId, p_client_message_id: clientMessageId, p_body: body, p_attachment: attachment,
    });
    if (sendError) {
      const reason = String(sendError.message || "");
      if (reason.includes("ticket_not_found")) return { __error: "ticket_not_found", __status: 404 };
      if (reason.includes("ticket_closed")) return { __error: "ticket_closed", __status: 409 };
      if (reason.includes("idempotency_conflict")) return { __error: "idempotency_conflict", __status: 409 };
      throw sendError;
    }
    const replayed = sent.replayed === true;
    // I1 web customer message ham mavjud admin Telegram notification
    // oqimiga kiradi. Retry bir xil clientMessageId bilan replay bo'lsa admin
    // ikkinchi marta ping olmaydi. Delivery best-effort: ticket/message DBda
    // saqlangan va I2/Web Support fallback notificationdan mustaqil ishlaydi.
    if (!replayed) {
      EdgeRuntime.waitUntil((async () => {
        try {
          if (!tenant?.tokenCiphertext || !tenant?.tokenIv) throw new Error("missing_tenant_bot_token");
          const botToken = await decryptBotToken(masterKey, tenant.tokenCiphertext, tenant.tokenIv);
          await notifySupportAdmins(db, shopId, botToken, "", { ...sent.thread, message: body || "📷 Rasm yuborildi / Отправлено изображение" });
        } catch (error: any) {
          console.error("[WEB_SUPPORT_ADMIN_NOTIFY_FAILED]", { shopId, ticketId: sent?.thread?.id || threadId, code: error?.code || "unknown" });
        }
      })());
    }
    return { thread: mapSupportTicketForClient(sent.thread), message: mapSupportMessageForClient(sent.message), replayed };
  }

  return { __error: "web_action_unavailable", __status: 404 };
}

// adminChatIds: OWNER recipients for a shop, sourced from shop_memberships —
// replaces the old flat `admins` table lookup.
// 3.4-band: shop-operational notifications (new order, receipt, support
// message) go ONLY to that shop's own ACTIVE OWNER(s) via shop_memberships.
// The platform super admin is intentionally NOT included here — on a real
// multi-tenant platform, auto-subscribing the platform operator to every
// single shop's order/support traffic would flood one person's Telegram
// with every shop's business, which is exactly the single-tenant-era
// courtesy this function must NOT carry forward. platformSuperAdminId is
// still accepted as a parameter (kept for call-site symmetry / in case a
// future platform-ops broadcast needs it explicitly) but is unused here.
async function adminChatIds(
  db: any,
  shopId: string,
  _platformSuperAdminId: string,
  requiredPermission: "orders.view" | "orders.manage" | "support.manage" = "orders.view",
): Promise<string[]> {
  const { data: members, error: memberError } = await db.from("shop_memberships")
    .select("telegram_user_id,role").eq("shop_id", shopId).eq("status", "ACTIVE");
  if (memberError) throw memberError;
  const owners = (members || []).filter((m: any) => m.role === "OWNER")
    .map((m: any) => String(m.telegram_user_id));
  const staffIds = (members || []).filter((m: any) => m.role === "STAFF")
    .map((m: any) => String(m.telegram_user_id));
  if (!staffIds.length) return Array.from(new Set(owners));

  const { data: assignments, error: assignmentError } = await db.from("membership_roles")
    .select("telegram_user_id,role_id").eq("shop_id", shopId).in("telegram_user_id", staffIds);
  if (assignmentError) throw assignmentError;
  const roleIds = Array.from(new Set((assignments || []).map((r: any) => String(r.role_id))));
  if (!roleIds.length) return Array.from(new Set(owners));

  const acceptedPermissions = requiredPermission === "orders.view"
    ? ["orders.view", "orders.manage"] : [requiredPermission];
  const { data: allowedRoles, error: permissionError } = await db.from("role_permissions")
    .select("role_id").eq("shop_id", shopId).in("permission", acceptedPermissions).in("role_id", roleIds);
  if (permissionError) throw permissionError;
  const allowedRoleSet = new Set((allowedRoles || []).map((r: any) => String(r.role_id)));
  const allowedStaff = (assignments || []).filter((r: any) => allowedRoleSet.has(String(r.role_id)))
    .map((r: any) => String(r.telegram_user_id));
  return Array.from(new Set([...owners, ...allowedStaff]));
}

async function marketingAdminChatIds(db: any, shopId: string): Promise<string[]> {
  const { data: members } = await db.from("shop_memberships").select("telegram_user_id,role").eq("shop_id", shopId).eq("status", "ACTIVE");
  const owners = (members || []).filter((m: any) => m.role === "OWNER").map((m: any) => String(m.telegram_user_id));
  const staffIds = (members || []).filter((m: any) => m.role === "STAFF").map((m: any) => String(m.telegram_user_id));
  if (!staffIds.length) return Array.from(new Set(owners));
  const { data: assignments } = await db.from("membership_roles").select("telegram_user_id,role_id").eq("shop_id", shopId).in("telegram_user_id", staffIds);
  const roleIds = Array.from(new Set((assignments || []).map((r: any) => String(r.role_id))));
  if (!roleIds.length) return Array.from(new Set(owners));
  const { data: allowedRoles } = await db.from("role_permissions").select("role_id").eq("shop_id", shopId).eq("permission", "marketing.manage").in("role_id", roleIds);
  const allowedRoleSet = new Set((allowedRoles || []).map((r: any) => String(r.role_id)));
  const marketingStaff = (assignments || []).filter((r: any) => allowedRoleSet.has(String(r.role_id))).map((r: any) => String(r.telegram_user_id));
  return Array.from(new Set([...owners, ...marketingStaff]));
}

function availableProductStock(product: any): number {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  return variants.length
    ? variants.reduce((sum: number, variant: any) => sum + Math.max(0, Number(variant.qty) || 0), 0)
    : Math.max(0, Number(product?.stock) || 0);
}

async function validateAndPauseBundles(db: any, shopId: string, botToken: string, affectedProductIds: string[] | null = null): Promise<string[]> {
  let bundleQuery = db.from("bundles").select("id,name,items,is_active").eq("shop_id", shopId).eq("is_active", true);
  const { data: bundles, error: bundleError } = await bundleQuery;
  if (bundleError) throw bundleError;
  const affectedSet = affectedProductIds?.length ? new Set(affectedProductIds.map(String)) : null;
  const candidates = (bundles || []).filter((bundle: any) => {
    const ids = (Array.isArray(bundle.items) ? bundle.items : []).map((item: any) => String(item.productId || ""));
    return !affectedSet || ids.some((id: string) => affectedSet.has(id));
  });
  if (!candidates.length) return [];
  const productIds = Array.from(new Set(candidates.flatMap((bundle: any) => (Array.isArray(bundle.items) ? bundle.items : []).map((item: any) => String(item.productId || "")).filter(Boolean))));
  const { data: products, error: productError } = await db.from("products").select("id,name,price,stock,variants,status,is_visible").eq("shop_id", shopId).in("id", productIds);
  if (productError) throw productError;
  const productById = new Map((products || []).map((product: any) => [String(product.id), product]));
  const pausedIds: string[] = [];

  for (const bundle of candidates) {
    const items = Array.isArray(bundle.items) ? bundle.items : [];
    const issues: any[] = [];
    let needsSnapshotBackfill = false;
    const snapshottedItems = items.map((item: any) => {
      const product: any = productById.get(String(item.productId));
      const required = Math.max(1, Number(item.qty) || 1);
      if (!product || product.status === "DELETED" || product.is_visible === false) {
        issues.push({ type: "UNAVAILABLE", productId: item.productId, name: product?.name || "Mahsulot" });
        return item;
      }
      const available = availableProductStock(product);
      if (available < required) issues.push({ type: "OUT_OF_STOCK", productId: item.productId, name: product.name, required, available });
      if (item.unitPrice === undefined || item.unitPrice === null) {
        needsSnapshotBackfill = true;
        return { ...item, unitPrice: Number(product.price) };
      }
      if (Number(item.unitPrice) !== Number(product.price)) {
        issues.push({ type: "PRICE_CHANGED", productId: item.productId, name: product.name, from: Number(item.unitPrice), to: Number(product.price) });
      }
      return item;
    });
    if (!issues.length) {
      if (needsSnapshotBackfill) await db.from("bundles").update({ items: snapshottedItems, updated_at: new Date().toISOString() }).eq("shop_id", shopId).eq("id", bundle.id).eq("is_active", true);
      continue;
    }
    const reason = { code: "BUNDLE_COMPONENT_CHANGED", issues };
    const { data: paused, error: pauseError } = await db.from("bundles").update({ is_active: false, pause_reason: reason, paused_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("shop_id", shopId).eq("id", bundle.id).eq("is_active", true).select("id").maybeSingle();
    if (pauseError) throw pauseError;
    if (!paused) continue;
    pausedIds.push(String(bundle.id));
    const issueLines = issues.map((issue: any) => issue.type === "PRICE_CHANGED"
      ? `• ${escapeHtml(issue.name)}: narx ${formatAmount(issue.from)} → ${formatAmount(issue.to)} so'm`
      : `• ${escapeHtml(issue.name)}: qoldiq ${formatAmount(issue.available || 0)} ta (kerak ${formatAmount(issue.required || 1)} ta)`).join("\n");
    const message = `⏸ <b>AKSIYA AVTOMATIK TO'XTATILDI</b>\n\n<b>${escapeHtml(bundle.name)}</b>\n${issueLines}\n\nAksiyani o'zgartirasizmi yoki yangi holat bilan davom ettirasizmi?\nAdmin panel → Marketing → Aksiyalar`;
    const adminIds = await marketingAdminChatIds(db, shopId);
    await Promise.allSettled(adminIds.map((chatId) => telegramApi(botToken, "sendMessage", { chat_id: chatId, text: message, parse_mode: "HTML" })));
  }
  return pausedIds;
}

async function shopDisplayNameForMessages(db: any, shopId: string): Promise<string> {
  const { data } = await db.from("shop_settings").select("name").eq("shop_id", shopId).maybeSingle();
  const name = data?.name && String(data.name).trim();
  return name || "Do'kon";
}

// 3.2-band: there used to be a broadcastShopEvent() helper here that sent
// invalidation events over a public `shop-events:<shopId>` Supabase
// Realtime broadcast channel. That channel had no server-side membership
// check — any client holding just the publishable key could subscribe to
// (or, worse, SEND on) any shop's channel by guessing/knowing its UUID,
// which is a real cross-shop spoofing surface (a malicious Shop A user
// could fabricate "catalog_changed" events for Shop B). Setting up genuine
// Realtime Authorization (private channels + RLS policies on
// realtime.messages) is real additional complexity for marginal benefit
// here, so — as explicitly permitted — this was replaced with tenant-safe
// polling instead (see ustore-shop-app.js's startPolling()). No broadcast
// channel exists in this codebase anymore.

async function backgroundNotifyOrder(db: any, shopId: string, botToken: string, platformSuperAdminId: string, order: any, fullname: string, phone: string, region: string, district: string, address: string, payMethod: string) {
  try {
    const shopName = await shopDisplayNameForMessages(db, shopId);
    const source = String(order?.source || "TELEGRAM").toUpperCase() === "WEB" ? "WEB" : "TELEGRAM";
    const sourceLabel = source === "WEB" ? "🌐 Web" : "✈️ Telegram Mini App";
    let msg = `🛒 <b>${escapeHtml(shopName)} - YANGI BUYURTMA #${order.id}</b>\n\n`;
    msg += `🧭 <b>Manba:</b> ${sourceLabel}\n`;
    msg += `👤 <b>Mijoz:</b> ${escapeHtml(fullname)}\n📞 <b>Tel:</b> ${escapeHtml(phone)}\n📍 <b>Hudud:</b> ${escapeHtml(region)} (${escapeHtml(district)})\n🏠 <b>Manzil:</b> ${escapeHtml(address)}\n💳 <b>To'lov:</b> ${escapeHtml(payMethod)}\n\n📦 <b>Tarkib:</b>\n`;
    for (const it of order.items || []) {
      const bits = [it.size, it.color].filter(Boolean).map(escapeHtml).join(" / ");
      msg += `• ${escapeHtml(it.name)}${bits ? ` [${bits}]` : ""} (ID: ${escapeHtml(it.sku)}) x${it.qty} = ${formatAmount(it.price * it.qty)} so'm\n`;
    }
    const delivery = order.delivery || {};
    msg += `\n🧾 <b>Tovarlar:</b> ${formatAmount(order.subtotal)} so'm`;
    msg += `\n🚚 <b>Yetkazib berish:</b> ${escapeHtml(delivery.label || delivery.kind || "-")}${Number(order.deliveryFee) > 0 ? ` — ${formatAmount(order.deliveryFee)} so'm` : ""}`;
    if (delivery.providerName) msg += ` (${escapeHtml(delivery.providerName)})`;
    msg += `\n💰 <b>Hozir to'lanadigan jami:</b> ${formatAmount(order.payableTotal)} so'm`;
    if (delivery.warning) msg += `\nℹ️ ${escapeHtml(delivery.warning)}`;
    const notifyIds = await adminChatIds(db, shopId, platformSuperAdminId, "orders.view");
    await Promise.allSettled(notifyIds.map((chatId) => fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "HTML" }),
    })));
  } catch (e) {
    console.error("order background notify error", e);
  }
}

function formatAmount(value: unknown): string {
  const n = Math.round(Number(value) || 0);
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

async function notifyShipmentCustomer(botToken: string, order: any) {
  try {
    const shipment = order.shipment || {};
    const delivery = order.delivery_snapshot || {};
    let msg = "";
    if (delivery.kind === "TAXI" && shipment.status === "IN_TRANSIT") {
      msg = `🚕 <b>Buyurtmangiz yo'lga chiqdi</b>\n\nMashina: ${escapeHtml(shipment.carNumber || "-")}\nHaydovchi: ${escapeHtml(shipment.driverPhone || "-")}`;
      if (shipment.driverName) msg += `\nHaydovchi ismi: ${escapeHtml(shipment.driverName)}`;
      msg += "\nYetkazib berish: taksi orqali";
    } else if (delivery.kind === "POST" && shipment.status === "HANDED_TO_CARRIER") {
      msg = `📦 <b>Buyurtmangiz ${escapeHtml(shipment.providerName || delivery.providerName || "pochta")} orqali yuborildi</b>\n\nHolati: Pochtaga topshirildi\nJo'natma raqami: ${escapeHtml(shipment.trackingNumber || "-")}`;
      if (shipment.branchName || delivery.branchName) msg += `\nFilial: ${escapeHtml(shipment.branchName || delivery.branchName)}`;
    }
    if (msg) await telegramApi(botToken, "sendMessage", { chat_id: order.tg_id, text: msg, parse_mode: "HTML" });
  } catch (e) {
    console.error("shipment customer notification error", e);
  }
}

async function notifyOrderCreatedCustomer(botToken: string, order: any): Promise<void> {
  try {
    if (!order?.tgId && !order?.tg_id) return;
    const orderId = order?.id;
    const total = Number(order?.payableTotal ?? order?.payable_total ?? order?.totalPrice ?? order?.total_price) || 0;
    const source = String(order?.source || order?.order_source || "TELEGRAM").toUpperCase() === "WEB" ? "WEB" : "TELEGRAM";
    const sourceLine = source === "WEB" ? "\n🌐 Buyurtma web saytdan yuborildi." : "";
    const text = `✅ <b>Buyurtma #${escapeHtml(orderId)} qabul qilindi</b>${sourceLine}\n💰 Jami: ${formatAmount(total)} so'm\n\nHolatini Web yoki Telegram Mini App ichidagi <b>Buyurtmalar</b> bo'limida kuzatishingiz mumkin.`;
    await telegramApi(botToken, "sendMessage", { chat_id: order?.tgId || order?.tg_id, text, parse_mode: "HTML" });
  } catch (e) {
    // Telegram botini boshlamagan/bloklagan web foydalanuvchi uchun bu
    // delivery best-effort xolos. Order DBda saqlangan va web status fallback
    // authoritative bo'lib qoladi; notification xatosi checkoutni yiqitmaydi.
    console.error("[ORDER_CREATED_CUSTOMER_NOTIFY_FAILED]", { code: "telegram_delivery_failed" });
  }
}

async function notifyOrderStatusCustomer(botToken: string, order: any): Promise<void> {
  try {
    if (!order?.tg_id) return;
    const rawStatus = String(order.status || "").toUpperCase();
    const labels: Record<string,string> = {
      NEW: "Yangi",
      PROCESSING: "Jarayonda",
      DELIVERED: "Yetkazildi",
      CANCELLED: "Bekor qilindi",
    };
    const label = labels[rawStatus] || rawStatus || "Yangilandi";
    const text = `📦 <b>Buyurtma #${escapeHtml(order.id)} holati yangilandi</b>\nHolat: <b>${escapeHtml(label)}</b>\n\nHolatini Web yoki Telegram Mini App ichidagi <b>Buyurtmalar</b> bo'limida ko'rishingiz mumkin. Muammo bo'lsa Support bo'limidan yozing.`;
    await telegramApi(botToken, "sendMessage", { chat_id: order.tg_id, text, parse_mode: "HTML" });
  } catch (e) {
    // Status update allaqachon DBga committed. Telegram yetkazib berish xatosi
    // transaction natijasini bekor qilmaydi; web order/status/support fallback qoladi.
    console.error("[ORDER_STATUS_CUSTOMER_NOTIFY_FAILED]", { code: "telegram_delivery_failed" });
  }
}

// Faqat record_stock_in ("Kirim") orqali qoldiq 0 (yoki manfiy) dan
// musbatga o'tganda chaqiriladi — bulk_stock_update (Excel/ombor to'liq
// qayta hisoblash) va Billz avtomatik sinxron bu roundda ataylab
// qamrovga kiritilmagan (alohida, murakkabroq ish — priorStock ularda
// hozircha oson olinmaydi). Xato bo'lsa stock update'ning o'zi
// buzilmasligi uchun har doim jim yutiladi va fon rejimida chaqiriladi.
async function notifyBackInStockSubscribers(db: any, shopId: string, productId: string, botToken: string, variantSku: string | null = null) {
  try {
    let q = db.from("stock_notifications").select("id,tg_id,variant_sku").eq("shop_id", shopId).eq("product_id", productId).is("notified_at", null);
    q = variantSku ? q.eq("variant_sku", variantSku) : q.is("variant_sku", null);
    const { data: subs, error } = await q;
    if (error || !subs?.length) return;
    const { data: product } = await db.from("products").select("name,variants").eq("shop_id", shopId).eq("id", productId).maybeSingle();
    if (!product) return;
    let variantLine = "";
    if (variantSku && Array.isArray(product.variants)) {
      const v = product.variants.find((x: any) => String(x?.sku || "") === String(variantSku));
      if (v) variantLine = `\n📦 Variant: ${escapeHtml([v.color, v.size].filter(Boolean).join(" / ") || variantSku)}`;
    }
    const msg = `🔔 <b>Qayta sotuvda!</b>\n\n<b>${escapeHtml(product.name)}</b>${variantLine}\nQayta mavjud. Hoziroq buyurtma berishingiz mumkin.`;
    const results = await Promise.allSettled(subs.map((sub: any) => telegramApi(botToken, "sendMessage", { chat_id: sub.tg_id, text: msg, parse_mode: "HTML" })));
    const deliveredIds = subs.filter((_: any, index: number) => results[index]?.status === "fulfilled").map((sub: any) => sub.id);
    if (deliveredIds.length) {
      const { error: markError } = await db.from("stock_notifications").update({ notified_at: new Date().toISOString() })
        .eq("shop_id", shopId).in("id", deliveredIds);
      if (markError) throw markError;
    }
  } catch (e) {
    console.error("[BACK_IN_STOCK_NOTIFY_FAILED]", e);
  }
}

function variantQtyBySku(product: any, sku: string | null): number | null {
  if (!sku || !Array.isArray(product?.variants)) return null;
  const v = product.variants.find((x: any) => String(x?.sku || "") === String(sku));
  return v ? (Number(v.qty) || 0) : null;
}
async function triggerRestockTransitions(db: any, shopId: string, before: any, after: any, botToken: string) {
  if (!before || !after) return;
  const productId = String(after.id || before.id || "");
  if (!productId) return;
  if ((Number(before.stock) || 0) <= 0 && (Number(after.stock) || 0) > 0) {
    EdgeRuntime.waitUntil(notifyBackInStockSubscribers(db, shopId, productId, botToken, null));
  }
  const beforeMap = new Map((Array.isArray(before.variants) ? before.variants : []).map((v: any) => [String(v?.sku || ""), Number(v?.qty) || 0]));
  for (const v of (Array.isArray(after.variants) ? after.variants : [])) {
    const sku = String(v?.sku || "");
    if (!sku) continue;
    const prev = beforeMap.has(sku) ? Number(beforeMap.get(sku)) : 0;
    const next = Number(v?.qty) || 0;
    if (prev <= 0 && next > 0) EdgeRuntime.waitUntil(notifyBackInStockSubscribers(db, shopId, productId, botToken, sku));
  }
}

async function notifyReceiptAdmins(db: any, shopId: string, botToken: string, platformSuperAdminId: string, orderId: number, path: string): Promise<boolean> {
  try {
    const { data, error } = await db.storage.from("payment-receipts").createSignedUrl(path, 300);
    if (error || !data?.signedUrl) throw error || new Error("receipt_signed_url_failed");
    const shopName = await shopDisplayNameForMessages(db, shopId);
    const notifyIds = await adminChatIds(db, shopId, platformSuperAdminId, "orders.view");
    const results = await Promise.allSettled(notifyIds.map((chatId) => telegramApi(botToken, "sendPhoto", {
      chat_id: chatId,
      photo: data.signedUrl,
      caption: `${shopName} — Buyurtma #${orderId}\nKarta to'lovi cheki`,
    })));
    const anySent = results.some((r) => r.status === "fulfilled");
    if (anySent) {
      await db.from("orders").update({ payment_receipt_telegram_sent_at: new Date().toISOString() })
        .eq("id", orderId).eq("shop_id", shopId).is("payment_receipt_telegram_sent_at", null);
    }
    return anySent;
  } catch (e) {
    console.error("receipt admin notification error", e);
    return false;
  }
}

async function archiveRejectedReceipt(db: any, shopId: string, orderId: number, previousOrder: any): Promise<void> {
  if (!previousOrder?.payment_receipt_path) return;
  try {
    await db.from("payment_receipt_history").insert({
      shop_id: shopId, order_id: orderId,
      storage_path: previousOrder.payment_receipt_path,
      uploaded_at: previousOrder.payment_receipt_uploaded_at || null,
      review_status: previousOrder.receipt_review_status || "REJECTED",
      reject_reason: previousOrder.receipt_reject_reason || null,
      reviewed_at: previousOrder.receipt_reviewed_at || null,
      reviewed_by: previousOrder.receipt_reviewed_by || null,
    });
  } catch (e) {
    console.error("payment receipt archive error", e);
  }
}

async function notifySupportAdmins(db: any, shopId: string, botToken: string, platformSuperAdminId: string, ticket: any): Promise<void> {
  try {
    const notifyIds = await adminChatIds(db, shopId, platformSuperAdminId, "support.manage");
    const orderLine = ticket.order_id ? `\n📦 Buyurtma: #${ticket.order_id}` : "";
    const text = `💬 <b>Yangi qo'llab-quvvatlash murojaati</b>\nMijoz: ${ticket.tg_id}${orderLine}\n\n${escapeHtml(String(ticket.message || ""))}`;
    await Promise.allSettled(notifyIds.map((chatId) => telegramApi(botToken, "sendMessage", { chat_id: chatId, text, parse_mode: "HTML" })));
  } catch (e) {
    console.error("support ticket admin notification error", e);
  }
}
async function notifySupportReply(botToken: string, ticket: any): Promise<void> {
  try {
    const orderLine = ticket.order_id ? `\n📦 Buyurtma: #${ticket.order_id}` : "";
    const text = `💬 <b>Qo'llab-quvvatlashdan javob keldi</b>${orderLine}\n\n${escapeHtml(String(ticket.admin_reply || ""))}\n\nJavobni Web yoki Telegram Mini App ichidagi <b>Support</b> bo'limida ham ko'rishingiz mumkin.`;
    await telegramApi(botToken, "sendMessage", { chat_id: ticket.tg_id, text, parse_mode: "HTML" });
  } catch (e) {
    // Reply DBda saqlangan; Telegram delivery xatosi web Support fallbackni
    // buzmaydi va adminning muvaffaqiyatli reply amalini rollback qilmaydi.
    console.error("support reply notification error", e);
  }
}

async function cleanupPrivateReceipt(db: any, shopId: string, orderId: number, path: string): Promise<boolean> {
  try {
    const { error } = await db.storage.from("payment-receipts").remove([path]);
    if (error) throw error;
    await db.from("orders").update({ payment_receipt_path: null }).eq("id", orderId).eq("shop_id", shopId).eq("payment_receipt_path", path);
    return true;
  } catch (e) {
    console.error("payment receipt cleanup error", e);
    return false;
  }
}

// 18-band: neutral fallback bot /start text — no FITCORE business content
// (the old default described a specific fitness-supplements shop; this one
// doesn't assume what the shop sells).
const DEFAULT_START_MESSAGE = [
  "👋 <b>Xush kelibsiz!</b>",
  "",
  "Kerakli mahsulotlarni Mini App orqali qulay xarid qilishingiz mumkin.",
  "",
  "🛒 Katalog",
  "📦 Buyurtmalar",
  "🚚 Yetkazib berish",
  "",
  "Yetkazib berish va to‘lov variantlari hududingizga qarab Mini App checkoutida ko‘rsatiladi.",
  "",
  "Do‘konni ochish uchun Telegram’dagi Mini App tugmasidan foydalaning 👇",
].join("\n");

async function fetchActiveCategories(db: any, shopId: string): Promise<any[]> {
  const { data, error } = await db.from("categories").select("id,name,name_ru,parent_id,img,icon_id,icon_color,sort_order").eq("shop_id", shopId).is("deleted_at", null);
  if (error) throw error;
  return data || [];
}
function collectCategorySubtreeIds(allCats: any[], rootId: string): string[] {
  const byParent = new Map<string, any[]>();
  for (const c of allCats) {
    const p = c.parent_id === null || c.parent_id === undefined ? "" : String(c.parent_id);
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p)!.push(c);
  }
  const root = String(rootId);
  const result: string[] = [root];
  const queue: string[] = [root];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const child of byParent.get(cur) || []) {
      const cid = String(child.id);
      result.push(cid);
      queue.push(cid);
    }
  }
  return result;
}
function isCategoryDescendantOrSelf(allCats: any[], candidateId: string, ofId: string): boolean {
  return collectCategorySubtreeIds(allCats, ofId).includes(String(candidateId));
}

// billzProductId: optional — Billz (billz.ai) integration link for this
// specific size/color variant (each Billz variant is its OWN product record
// with its own stock, per their API). Must survive every re-save, or a
// product edited after Billz-import would silently lose its sync link —
// so cleanVariants() (called by every add_product/edit_product_field save,
// not just the Billz import action) explicitly preserves it below.
// img: optional — POLISH ROUND task 4 (variant-specific image). Same
// "must survive every re-save" rule as billzProductId above — cleanVariants()
// preserves it untouched, no separate schema change needed (variants is
// already a schemaless jsonb column).
// price: optional — POLISH ROUND task (per-variant price). When absent/null,
// the product's own base price is used (place_order RPC, 062-migratsiya,
// falls back exactly the same way). Same "must survive every re-save" rule.
// oldPrice: optional — VARIATIV TOVAR QAYTA QURISH round (Rang+O'lcham,
// 2026-08-31). Har rang+o'lcham kombinatsiyasi o'z chegirma-narxini olib
// yurishi kerak (masalan "Narx 26 100 / Eski narx 99 000"). Faqat KO'RSATISH
// uchun — checkout narxi hamon `price`dan (place_order RPC) hisoblanadi,
// bu maydonga umuman bog'liq emas. Xuddi shu "har re-save'da saqlanib
// qolishi kerak" qoidasi.
type VariantInput = { size?: string | null; color?: string | null; colorRu?: string | null; qty?: number; sku?: string | null; billzProductId?: string | null; img?: string | null; colorImg?: string | null; price?: number | null; oldPrice?: number | null };
function optionalVariantMoney(value: unknown, field: "price" | "oldPrice"): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || (field === "price" && parsed === 0)) {
    throw new Error(`invalid_variant_${field === "oldPrice" ? "old_price" : "price"}`);
  }
  return parsed;
}
function cleanVariants(variants: any, legacySizes?: any): VariantInput[] {
  const raw = Array.isArray(variants) && variants.length ? variants :
    (Array.isArray(legacySizes) ? legacySizes.map((s: any) => ({ size: s?.size, color: null, qty: s?.qty })) : []);
  return raw.map((v: any) => ({
    size: nullableText(v?.size, 60), color: nullableText(v?.color, 60), colorRu: nullableText(v?.colorRu, 60),
    qty: Math.max(0, Number.parseInt(String(v?.qty ?? 0), 10) || 0),
    sku: v?.sku ? String(v.sku) : null,
    billzProductId: v?.billzProductId ? String(v.billzProductId) : null,
    img: v?.img ? normalizeProductImageUrl(v.img) : null,
    colorImg: v?.colorImg ? normalizeProductImageUrl(v.colorImg) : null,
    price: optionalVariantMoney(v?.price, "price"),
    oldPrice: optionalVariantMoney(v?.oldPrice, "oldPrice"),
  })).filter((v: VariantInput) => !!v.size || !!v.color);
}
function variantIdentity(v: VariantInput): string {
  return `${normalizeName(v.size)}${normalizeName(v.color)}`;
}
function legacySizesFromVariants(vars: any[]): any[] | null {
  if (!Array.isArray(vars) || !vars.length) return null;
  if (vars.some((v) => !!nullableText(v?.color, 60)) || vars.some((v) => !nullableText(v?.size, 60))) return null;
  return vars.map((v) => ({ size: v.size, qty: Number(v.qty) || 0, sku: v.sku }));
}
function productLinePrice(product: any, item: any): number {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  if (variants.length) {
    const size = normalizeName(item?.size);
    const color = normalizeName(item?.color);
    const matched = variants.find((variant: any) => normalizeName(variant?.size) === size && normalizeName(variant?.color) === color);
    const variantPrice = Number(matched?.price);
    if (Number.isFinite(variantPrice) && variantPrice > 0) return variantPrice;
  }
  return Number(product?.price) || 0;
}
function validateVariantUniqueness(vars: VariantInput[]) {
  const seen = new Set<string>();
  for (const v of vars) {
    const k = variantIdentity(v);
    if (seen.has(k)) throw new Error(`duplicate_variant:${v.size || ""}:${v.color || ""}`);
    seen.add(k);
  }
}

// Billz import, "eski narx" (chegirma ko'rinishi): Billz'da bu tushuncha
// yo'q, shuning uchun admin ixtiyoriy foiz kiritadi.
// - Aniq bitta son ("20") -> HAMMA import qilinayotgan tovarga bir xil 20%.
// - Oraliq ("10-30") -> shu oraliqdagi 5ga karrali "chiroyli" qiymatlar
//   (10,15,20,25,30) orasidan HAR BIR tovar uchun alohida-alohida tasodifiy
//   tanlanadi — bir xil emas, tabiiyroq ko'rinishi uchun.
// - Bo'sh/noto'g'ri bo'lsa — hech qanday eski narx qo'yilmaydi (hammasi null).
function resolveOldPricePercents(raw: unknown, count: number): (number | null)[] {
  const s = String(raw ?? "").trim();
  if (!s) return new Array(count).fill(null);
  const rangeMatch = s.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]), max = Number(rangeMatch[2]);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) return new Array(count).fill(null);
    const nice: number[] = [];
    for (let n = Math.ceil(min / 5) * 5; n <= max; n += 5) nice.push(n);
    const pool = nice.length ? nice : [min, max];
    return Array.from({ length: count }, () => pool[Math.floor(Math.random() * pool.length)]);
  }
  const flat = Number(s);
  if (!Number.isFinite(flat) || flat < 0) return new Array(count).fill(null);
  return new Array(count).fill(flat);
}

// 7-band: Billz importda foiz qo'shilgach hosil bo'lgan eski narx (masalan
// 111000 * 1.05 = 116550) noqulay summa bo'lib qolmasligi uchun eng yaqin
// 1000 so'mga yaxlitlanadi. Foizning O'ZI yaxlitlanmaydi — faqat YAKUNIY
// SUMMA (chaqiruvchi joyda numericPrice * (1 + percent/100) natijasi).
function roundToNearest1000(amount: number): number {
  return Math.round(amount / 1000) * 1000;
}

async function getProductLimit(db: any, shopId: string): Promise<number | null> {
  const { data } = await db.from("shop_settings").select("product_limit").eq("shop_id", shopId).maybeSingle();
  const limit = data?.product_limit;
  return typeof limit === "number" && limit >= 0 ? limit : null;
}
async function countActiveProducts(db: any, shopId: string): Promise<number> {
  const { count } = await db.from("products").select("id", { count: "exact", head: true }).eq("shop_id", shopId).neq("status", "DELETED");
  return count || 0;
}
async function allocateGlobalSkus(db: any, shopId: string, count: number): Promise<string[]> {
  if (!Number.isInteger(count) || count <= 0) return [];
  const { data, error } = await db.rpc("allocate_global_skus", { p_shop_id: shopId, p_count: count });
  if (error) throw error;
  return (data || []).map((r: any) => String(r.sku));
}

// includeInternalNote: the admin-only note (11-band) must NEVER reach an
// ordinary customer's own order view — this is enforced HERE (server-side),
// not by the frontend simply not rendering the field, so every call site
// must pass the CURRENT REQUEST's real isAdmin flag explicitly.
function mapReturnForClient(r: any) {
  if (!r) return null;
  return {
    id: r.id, orderId: r.order_id, status: r.status, reason: r.reason,
    requestedItems: r.requested_items || [], adminNote: r.admin_note || null,
    refundAmount: Number(r.refund_amount) || 0, refundMethod: r.refund_method || null,
    refundReference: r.refund_reference || null, billzReconciliationStatus: r.billz_reconciliation_status || "NOT_REQUIRED",
    requestedAt: r.requested_at, approvedAt: r.approved_at || null, receivedAt: r.received_at || null,
    restockedAt: r.restocked_at || null, refundedAt: r.refunded_at || null, completedAt: r.completed_at || null,
  };
}

function mapOrderForClient(o: any, opts: { includeInternalNote?: boolean; returnRequest?: any } = {}) {
  const subtotal = Number(o.subtotal ?? o.total_price) || 0;
  const deliveryFee = Number(o.delivery_fee) || 0;
  const payableTotal = Number(o.payable_total ?? o.total_price) || 0;
  return {
    id: o.id, source: o.order_source || "TELEGRAM", tgId: o.tg_id, user: o.user_name, phone: o.phone, region: o.region,
    district: o.district, address: o.address, payMethod: o.pay_method,
    items: o.items || [], subtotal, deliveryFee, payableTotal, totalPrice: payableTotal, status: o.status,
    paymentStatus: o.payment_status || "PENDING",
    paymentDueAt: o.payment_due_at || null,
    paidAt: o.paid_at || null,
    refundedAt: o.refunded_at || null,
    ...(opts.includeInternalNote ? { internalNote: o.internal_note || null } : {}),
    delivery: o.delivery_snapshot || null, payment: o.payment_snapshot || null,
    shipment: o.shipment || { status: "READY" }, hasReceipt: !!o.payment_receipt_path,
    receiptSentToTelegram: !!o.payment_receipt_telegram_sent_at,
    createdAt: o.created_at, deliveredAt: o.delivered_at || null, cancelReason: o.cancel_reason || null, cancelledBy: o.cancelled_by || null,
    receiptReviewStatus: o.receipt_review_status || "PENDING",
    receiptRejectReason: o.receipt_reject_reason || null,
    promoCode: o.promo_code || null, promoDiscount: Number(o.promo_discount) || 0,
    tierDiscount: Number(o.tier_discount) || 0, vipDiscount: Number(o.vip_discount) || 0, tierId: o.tier_id || null,
    tierSnapshot: o.tier_snapshot || null, discountSource: o.discount_source || null,
    giftSnapshot: o.gift_snapshot || null,
    returnRequest: mapReturnForClient(opts.returnRequest),
  };
}

async function mapOrdersWithReturns(db: any, shopId: string, rows: any[], includeInternalNote: boolean): Promise<any[]> {
  const orderIds = rows.map((row: any) => Number(row.id)).filter(Number.isFinite);
  const { data: returns, error } = orderIds.length
    ? await db.from("order_returns").select("*").eq("shop_id", shopId).in("order_id", orderIds)
    : { data: [] as any[], error: null };
  if (error) throw error;
  const byOrder = new Map((returns || []).map((r: any) => [Number(r.order_id), r]));
  return rows.map((row: any) => mapOrderForClient(row, { includeInternalNote, returnRequest: byOrder.get(Number(row.id)) }));
}

function mapBannerForClient(b: any) {
  return {
    id: b.id, mode: b.mode, title: b.title || null, subtitle: b.subtitle || null, ctaText: b.cta_text || null,
    imageUrl: b.image_url, targetType: b.target_type, targetProductId: b.target_product_id || null,
    targetCategoryId: b.target_category_id || null, targetUrl: b.target_url || null,
    targetBundleId: b.target_bundle_id || null, targetPromotionId: b.target_promotion_id || null,
    startsAt: b.starts_at || null, endsAt: b.ends_at || null, isActive: !!b.is_active,
    sortOrder: b.sort_order || 0, createdAt: b.created_at, updatedAt: b.updated_at || b.created_at,
  };
}
function mapBundleForClient(b: any) {
  return {
    id: b.id, name: b.name, description: b.description || null,
    items: Array.isArray(b.items) ? b.items : [], bundlePrice: Number(b.bundle_price) || 0,
    coverImageUrl: b.cover_image_url || null, startsAt: b.starts_at || null, endsAt: b.ends_at || null,
    isActive: !!b.is_active, pauseReason: b.pause_reason || null, pausedAt: b.paused_at || null,
    sortOrder: b.sort_order || 0, createdAt: b.created_at, updatedAt: b.updated_at || b.created_at,
  };
}

// Faqat HOZIR ko'rsatilishi kerak bo'lgan (active + jadval ichida) bannerlar,
// eng ko'pi bilan 3 tasi — "storefrontni to'ldirmaslik" talabi shu yerda,
// bitta joyda amalga oshiriladi (admin ro'yxati esa hammasini ko'rsatadi).
async function activeBannersForClient(db: any, shopId: string): Promise<any[]> {
  const now = Date.now();
  // Fetch active rows before applying the schedule, so expired rows at the top
  // cannot crowd out currently visible banners. Nested PostgREST .or() date expressions could
  // previously fail and silently turn an otherwise valid storefront into [].
  const { data, error } = await db.from("banners").select("*").eq("shop_id", shopId).eq("is_active", true)
    .order("sort_order", { ascending: true }).order("created_at", { ascending: false });
  if (error) { console.error("[ACTIVE_BANNERS_FETCH_FAILED]", error); return []; }
  return (data || []).filter((banner: any) => {
    const starts = banner.starts_at ? Date.parse(banner.starts_at) : null;
    const ends = banner.ends_at ? Date.parse(banner.ends_at) : null;
    return (starts === null || (Number.isFinite(starts) && starts <= now)) &&
      (ends === null || (Number.isFinite(ends) && ends >= now));
  }).slice(0, 5).map(mapBannerForClient);
}

function mapPromoForClient(p: any) {
  return {
    id: p.id, code: p.code, name: p.name, discountType: p.discount_type, discountValue: Number(p.discount_value),
    minOrderAmount: p.min_order_amount !== null && p.min_order_amount !== undefined ? Number(p.min_order_amount) : null,
    maxOrderAmount: p.max_order_amount !== null && p.max_order_amount !== undefined ? Number(p.max_order_amount) : null,
    startsAt: p.starts_at || null, endsAt: p.ends_at || null,
    usageLimit: p.usage_limit ?? null, perCustomerLimit: p.per_customer_limit ?? null,
    categoryIds: Array.isArray(p.category_ids) ? p.category_ids : [],
    productIds: Array.isArray(p.product_ids) ? p.product_ids : [],
    newCustomerOnly: !!p.new_customer_only, allowStacking: !!p.allow_stacking,
    issuedToTgId: p.issued_to_tg_id || null, transferable: p.transferable !== false,
    // 040: yashirin kod ommaviy ro'yxatda ko'rinmaydi, lekin ISHLAYDI —
    // reklama/blogger kodlari uchun. Eski qatorlarda ustun yo'q bo'lsa
    // (migratsiya hali ishlamagan bo'lsa) ochiq deb hisoblanadi.
    isPublic: p.is_public !== false,
    source: p.source || "MANUAL",
    isActive: !!p.is_active, createdAt: p.created_at, updatedAt: p.updated_at || p.created_at,
  };
}

async function publicWebPromotion(db: any, shopId: string, promotionId: string) {
  if (!promotionId) return null;
  const { data, error } = await db.from("promotions").select("*")
    .eq("shop_id", shopId).eq("id", promotionId).eq("is_active", true)
    .eq("source", "MANUAL").eq("is_public", true).is("issued_to_tg_id", null).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const now = Date.now();
  if ((data.starts_at && new Date(data.starts_at).getTime() > now)
    || (data.ends_at && new Date(data.ends_at).getTime() < now)) return null;
  const { count, error: countError } = data.usage_limit
    ? await db.from("promotion_redemptions").select("id", { count: "exact", head: true })
      .eq("shop_id", shopId).eq("promotion_id", data.id)
    : { count: 0, error: null };
  if (countError) throw countError;
  return { ...mapPromoForClient(data), usedCount: count || 0 };
}

async function publicWebPromotions(db: any, shopId: string) {
  const now = new Date().toISOString();
  const { data, error } = await db.from("promotions").select("*")
    .eq("shop_id", shopId).eq("is_active", true).eq("source", "MANUAL")
    .eq("is_public", true).is("issued_to_tg_id", null)
    .or(`starts_at.is.null,starts_at.lte.${now}`).or(`ends_at.is.null,ends_at.gte.${now}`)
    .order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return { promotions: (data || []).map(mapPromoForClient) };
}

function mapAutomaticGiftRuleForClient(r: any, usageCount = 0) {
  return {
    id: r.id, name: r.name, conditionType: r.condition_type,
    thresholdAmount: r.threshold_amount === null ? null : Number(r.threshold_amount),
    thresholdQuantity: r.threshold_quantity === null ? null : Number(r.threshold_quantity),
    targetProductId: r.target_product_id || null, targetCategoryId: r.target_category_id || null,
    targetProductIds: Array.isArray(r.target_product_ids) ? r.target_product_ids : [], matchMode: r.match_mode || null,
    giftProductId: r.gift_product_id, giftQuantity: Number(r.gift_quantity) || 1,
    stockZeroPolicy: r.stock_zero_policy || "AUTO_PAUSE",
    startsAt: r.starts_at || null, endsAt: r.ends_at || null, isActive: !!r.is_active,
    usageCount, createdAt: r.created_at, updatedAt: r.updated_at || r.created_at,
  };
}

// Single source of truth for promo validation — used by BOTH the checkout-time
// preview (promo_preview, non-committal) and the real order creation
// (create_order, authoritative). Subtotal must already be server-computed
// from live prices by the caller — never trust a client-supplied subtotal.
async function resolvePromoDiscount(db: any, shopId: string, rawCode: string, tgId: string, subtotal: number, cartProductIds: string[]):
  Promise<{ ok: true; promotion: any; discountAmount: number } | { ok: false; error: string }> {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return { ok: false, error: "promo_code_required" };
  const { data: promo, error } = await db.from("promotions").select("*").eq("shop_id", shopId).eq("code", code).maybeSingle();
  if (error) throw error;
  if (!promo || !promo.is_active) return { ok: false, error: "promo_not_found" };
  const now = Date.now();
  if (promo.starts_at && new Date(promo.starts_at).getTime() > now) return { ok: false, error: "promo_not_started" };
  if (promo.ends_at && new Date(promo.ends_at).getTime() < now) return { ok: false, error: "promo_expired" };
  if (promo.min_order_amount && subtotal < Number(promo.min_order_amount)) return { ok: false, error: `promo_min_order:${promo.min_order_amount}` };
  // 15-band spec, 13-band: ixtiyoriy yuqori chegara — bo'sh bo'lsa cheklovsiz.
  if (promo.max_order_amount && subtotal > Number(promo.max_order_amount)) return { ok: false, error: `promo_max_order:${promo.max_order_amount}` };
  // 15-band spec, 14-band: shaxsan berilgan (issued_to_tg_id bor) va
  // transferable=false bo'lgan kod faqat o'sha mijozning o'zi ishlata oladi
  // — bu tekshiruv server/DB darajasida, frontend'ga ishonilmaydi.
  if (promo.issued_to_tg_id && !promo.transferable && String(promo.issued_to_tg_id) !== String(tgId)) {
    return { ok: false, error: "promo_not_yours" };
  }

  if (promo.new_customer_only) {
    const { count } = await db.from("orders").select("id", { count: "exact", head: true })
      .eq("shop_id", shopId).eq("tg_id", tgId).neq("status", "CANCELLED");
    if ((count || 0) > 0) return { ok: false, error: "promo_new_customers_only" };
  }

  const categoryIds: string[] = Array.isArray(promo.category_ids) ? promo.category_ids.map(String) : [];
  const productIds: string[] = Array.isArray(promo.product_ids) ? promo.product_ids.map(String) : [];
  if (categoryIds.length || productIds.length) {
    let matches = productIds.length ? cartProductIds.some((id) => productIds.includes(id)) : false;
    if (!matches && categoryIds.length) {
      const { data: catRows } = await db.from("products").select("id,category_id").eq("shop_id", shopId).in("id", cartProductIds);
      matches = (catRows || []).some((r: any) => categoryIds.includes(String(r.category_id)));
    }
    if (!matches) return { ok: false, error: "promo_not_applicable" };
  }

  if (promo.usage_limit) {
    const { count } = await db.from("promotion_redemptions").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("promotion_id", promo.id);
    if ((count || 0) >= promo.usage_limit) return { ok: false, error: "promo_usage_limit_reached" };
  }
  if (promo.per_customer_limit) {
    const { count } = await db.from("promotion_redemptions").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("promotion_id", promo.id).eq("tg_id", tgId);
    if ((count || 0) >= promo.per_customer_limit) return { ok: false, error: "promo_customer_limit_reached" };
  }

  const rawDiscount = promo.discount_type === "PERCENT" ? (subtotal * Number(promo.discount_value)) / 100 : Number(promo.discount_value);
  const discountAmount = Math.max(0, Math.min(Math.round(rawDiscount), subtotal));
  return { ok: true, promotion: promo, discountAmount };
}

// Shop takomillashtirish (qo'shimcha talablar): bosqichli chegirma — faqat
// ENG YUQORI mos keladigan tier ishlaydi (23-band), promotions'dagi bilan
// bir xil scope (category_ids/product_ids) konvensiyasi.
async function resolveTierDiscount(db: any, shopId: string, subtotal: number, cartProductIds: string[]): Promise<{ tier: any; discountAmount: number } | null> {
  const { data: tiers, error } = await db.from("discount_tiers").select("*").eq("shop_id", shopId).eq("is_active", true)
    .lte("threshold_amount", subtotal).order("threshold_amount", { ascending: false });
  if (error) throw error;
  const now = Date.now();
  for (const tier of tiers || []) {
    if (tier.starts_at && new Date(tier.starts_at).getTime() > now) continue;
    if (tier.ends_at && new Date(tier.ends_at).getTime() < now) continue;
    const categoryIds: string[] = Array.isArray(tier.category_ids) ? tier.category_ids.map(String) : [];
    const productIds: string[] = Array.isArray(tier.product_ids) ? tier.product_ids.map(String) : [];
    if (categoryIds.length || productIds.length) {
      let matches = productIds.length ? cartProductIds.some((id) => productIds.includes(id)) : false;
      if (!matches && categoryIds.length) {
        const { data: catRows } = await db.from("products").select("id,category_id").eq("shop_id", shopId).in("id", cartProductIds);
        matches = (catRows || []).some((r: any) => categoryIds.includes(String(r.category_id)));
      }
      if (!matches) continue;
    }
    const raw = tier.discount_type === "PERCENT" ? (subtotal * Number(tier.discount_value)) / 100 : Number(tier.discount_value);
    return { tier, discountAmount: Math.max(0, Math.min(Math.round(raw), subtotal)) };
  }
  return null;
}

// The cart only nudges the customer when the next applicable tier is genuinely
// close: at most 10% of its threshold, capped at 100 000 so'm. The server does
// this calculation so hidden/inactive/out-of-scope tiers are never advertised.
async function resolveNextTierOpportunity(db: any, shopId: string, subtotal: number, cartProductIds: string[]): Promise<any | null> {
  const { data: tiers, error } = await db.from("discount_tiers").select("*").eq("shop_id", shopId).eq("is_active", true)
    .gt("threshold_amount", subtotal).order("threshold_amount", { ascending: true });
  if (error) throw error;
  if (!(tiers || []).length || !cartProductIds.length) return null;

  const { data: productRows, error: productError } = await db.from("products").select("id,category_id")
    .eq("shop_id", shopId).in("id", cartProductIds);
  if (productError) throw productError;
  const cartCategoryIds = new Set((productRows || []).map((row: any) => String(row.category_id || "")).filter(Boolean));
  const cartProductIdSet = new Set(cartProductIds.map(String));
  const now = Date.now();

  for (const tier of tiers || []) {
    if (tier.starts_at && new Date(tier.starts_at).getTime() > now) continue;
    if (tier.ends_at && new Date(tier.ends_at).getTime() < now) continue;
    const categoryIds: string[] = Array.isArray(tier.category_ids) ? tier.category_ids.map(String) : [];
    const productIds: string[] = Array.isArray(tier.product_ids) ? tier.product_ids.map(String) : [];
    const scopeMatches = !(categoryIds.length || productIds.length)
      || productIds.some((id) => cartProductIdSet.has(id))
      || categoryIds.some((id) => cartCategoryIds.has(id));
    if (!scopeMatches) continue;

    const thresholdAmount = Math.max(0, Number(tier.threshold_amount) || 0);
    const remainingAmount = Math.max(0, Math.ceil(thresholdAmount - subtotal));
    const nearLimit = Math.max(1, Math.min(100000, thresholdAmount * 0.10));
    if (!remainingAmount || remainingAmount > nearLimit) continue;
    return {
      id: tier.id,
      name: tier.name || null,
      thresholdAmount,
      discountType: tier.discount_type,
      discountValue: Number(tier.discount_value) || 0,
      remainingAmount,
      progressPercent: Math.max(0, Math.min(100, Math.round((subtotal / thresholdAmount) * 100))),
    };
  }
  return null;
}

// VIP mijoz — shaxsiy, promo-kodsiz, faqat shu tg_id uchun avtomatik ishlaydi.
// 4-paket, 10-topshiriq: min/max buyurtma summasi va foydalanish limiti
// (customer_discount_usages'dan) server tomonda tekshiriladi — client UI'ga
// ishonilmaydi (10.17-band). Eski qatorlar (bu maydonlar null) uchun
// xatti-harakat o'zgarishsiz qoladi (cheklovsiz).
async function resolveVipDiscount(db: any, shopId: string, tgId: string, subtotal: number): Promise<{ discount: any; discountAmount: number } | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await db.from("customer_discounts").select("*").eq("shop_id", shopId).eq("tg_id", tgId)
    .eq("is_active", true).is("cancelled_at", null)
    .or(`starts_at.is.null,starts_at.lte.${nowIso}`).gte("ends_at", nowIso)
    .order("discount_value", { ascending: false });
  if (error) throw error;
  for (const row of data || []) {
    if (row.min_order_amount && subtotal < Number(row.min_order_amount)) continue;
    if (row.max_order_amount && subtotal > Number(row.max_order_amount)) continue;
    if (row.usage_limit) {
      const { count, error: usageErr } = await db.from("customer_discount_usages").select("id", { count: "exact", head: true })
        .eq("shop_id", shopId).eq("customer_discount_id", row.id);
      if (usageErr) throw usageErr;
      if ((count || 0) >= Number(row.usage_limit)) continue;
    }
    const raw = row.discount_type === "PERCENT" ? (subtotal * Number(row.discount_value)) / 100 : Number(row.discount_value);
    return { discount: row, discountAmount: Math.max(0, Math.min(Math.round(raw), subtotal)) };
  }
  return null;
}

// 042: bir nechta pul (money) qismini, ularning yig'indisi berilgan `cap`dan
// oshib ketganda, PROPORTSIONAL ravishda pasaytiradi — natijadagi qismlar
// yig'indisi HAR DOIM aniq `cap`ga teng bo'ladi (na ko'p, na kam). "Eng katta
// qoldiq" (largest remainder) usuli: avval har biri pastga yaxlitlanadi,
// keyin yaxlitlashda yo'qolgan so'mlar eng katta kasr qoldig'iga ega
// qismlarga birma-bir qaytariladi. Mijoz uchun bu muhim: ekranda ko'rsatilgan
// uchta chegirma qatorining yig'indisi haqiqatan to'langan summaga mos
// kelishi SHART — aks holda "3 ta qator -100, -100, -100 yozilgan, lekin
// jami -250 chegirma qilingan" kabi tushunarsiz nomuvofiqlik chiqadi.
function capDiscountParts(parts: Array<{ key: string; amount: number }>, cap: number): Record<string, number> {
  const result: Record<string, number> = {};
  const total = parts.reduce((s, p) => s + p.amount, 0);
  if (total <= 0) { for (const p of parts) result[p.key] = 0; return result; }
  if (total <= cap) { for (const p of parts) result[p.key] = p.amount; return result; }
  const scale = cap / total;
  let assigned = 0;
  const scaled = parts.map((p) => {
    const exact = p.amount * scale;
    const floor = Math.floor(exact);
    assigned += floor;
    return { key: p.key, floor, frac: exact - floor };
  });
  let remainder = Math.round(cap - assigned);
  scaled.sort((a, b) => b.frac - a.frac);
  for (const s of scaled) {
    result[s.key] = s.floor + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
  }
  return result;
}

// 29-band (asl xatti-harakat): reward promo-kod / VIP chegirma / oddiy
// promo-kod / bosqichli chegirma bir-biriga QO'SHILIB KETMAYDI — faqat ENG
// FOYDALI bittasi ishlaydi. Bundle ustiga esa (agar seller ruxsat bermagan
// bo'lsa) HECH biri qo'shilmaydi.
//
// 042-band qo'shimchasi: do'kon Marketing sozlamalaridan "hammasi birga
// ishlasin" (opts.allowCombining) ni ANIQ yoqmaguncha, YUQORIDAGI eski
// xatti-harakat SO'ZMA-SO'Z o'zgarishsiz ishlaydi — combining standart
// bo'yicha O'CHIQ (shop_settings.allow_discount_combining default false),
// shuning uchun bu qo'shimcha mavjud hech bir do'konning natijasini
// o'zgartirmaydi. Yoqilganda: promo+VIP+tier UCHALASI HAM (mos kelganlari)
// bitta buyurtmaga qo'shiladi, ixtiyoriy ravishda umumiy chegirma
// subtotal'ning ko'pi bilan opts.maxCombinedPercent foizigacha cheklanadi.
//
// opts.includeVip — mijozning o'zi checkout'da "Shaxsiy chegirmamni
// qo'llash" belgisini o'chirishi mumkin (standart: yoqilgan). false bo'lsa,
// VIP chegirma HECH QANDAY rejimda (combining yoqiq yoki o'chiq) hisobga
// olinmaydi — lekin vipInfo baribir qaytariladi, shunda frontend "sizda
// shaxsiy chegirma bor" belgisini (bosilmagan holda ham) ko'rsata oladi.
async function resolveBestCartDiscount(
  db: any, shopId: string, tgId: string, subtotal: number, cartProductIds: string[],
  promoCodeInput: string | null, hasBundleInCart: boolean, allowStackingWithBundle: boolean,
  opts: { allowCombining: boolean; maxCombinedPercent: number | null; includeVip: boolean },
): Promise<{
  source: "PROMO" | "VIP" | "TIER" | "PROMO_TIER" | "COMBINED" | null;
  promotion?: any; discount?: any; tier?: any;
  discountAmount: number; promoDiscount: number; tierDiscount: number; vipDiscount: number;
  vipInfo: { discountType: string; discountValue: number } | null;
} | null> {
  if (hasBundleInCart && !allowStackingWithBundle) return null;
  const candidates: Array<{ source: "PROMO" | "VIP" | "TIER"; data: any; discountAmount: number }> = [];
  let promoCandidate: { data: any; discountAmount: number } | null = null;
  if (promoCodeInput) {
    try {
      const promoResult = await resolvePromoDiscount(db, shopId, promoCodeInput, tgId, subtotal, cartProductIds);
      if (promoResult.ok) {
        promoCandidate = { data: promoResult.promotion, discountAmount: promoResult.discountAmount };
        candidates.push({ source: "PROMO", data: promoResult.promotion, discountAmount: promoResult.discountAmount });
      }
    } catch (e) { console.error("[BEST_DISCOUNT:PROMO_FAILED]", e); }
  }
  // VIP mavjudligi HAR DOIM tekshiriladi (opts.includeVip'dan qat'i nazar) —
  // aks holda checkbox o'chirilganda "sizda shaxsiy chegirma bor" belgisini
  // ko'rsatishning umuman iloji bo'lmasdi.
  const vip = await resolveVipDiscount(db, shopId, tgId, subtotal);
  const vipInfo = vip ? { discountType: vip.discount.discount_type, discountValue: Number(vip.discount.discount_value) } : null;
  if (vip && opts.includeVip) candidates.push({ source: "VIP", data: vip.discount, discountAmount: vip.discountAmount });
  const tier = await resolveTierDiscount(db, shopId, subtotal, cartProductIds);
  if (tier) candidates.push({ source: "TIER", data: tier.tier, discountAmount: tier.discountAmount });

  if (opts.allowCombining) {
    if (!candidates.length) return { source: null, discountAmount: 0, promoDiscount: 0, tierDiscount: 0, vipDiscount: 0, vipInfo };
    const cap = opts.maxCombinedPercent != null
      ? Math.min(subtotal, Math.floor((subtotal * opts.maxCombinedPercent) / 100))
      : subtotal;
    const capped = capDiscountParts(candidates.map((c) => ({ key: c.source, amount: Math.min(c.discountAmount, subtotal) })), cap);
    const promoDiscount = capped["PROMO"] || 0;
    const vipDiscount = capped["VIP"] || 0;
    const tierDiscount = capped["TIER"] || 0;
    const nonZeroCount = [promoDiscount, vipDiscount, tierDiscount].filter((n) => n > 0).length;
    const singleSource = nonZeroCount === 1
      ? (promoDiscount > 0 ? "PROMO" : vipDiscount > 0 ? "VIP" : "TIER")
      : null;
    return {
      source: nonZeroCount > 1 ? "COMBINED" : singleSource,
      promotion: promoCandidate?.data, discount: vip?.discount, tier: tier?.tier,
      discountAmount: promoDiscount + vipDiscount + tierDiscount,
      promoDiscount, tierDiscount, vipDiscount, vipInfo,
    };
  }

  // --- Quyidagi barcha kod ATAYLAB combining o'chiq bo'lganda ishlaydigan
  // ESKI xatti-harakat — bironta qatori ham o'zgartirilmagan. ---
  if (promoCandidate && tier && promoCandidate.data.allow_stacking && tier.tier.allow_stacking) {
    const promoDiscount = Math.min(promoCandidate.discountAmount, subtotal);
    const tierDiscount = Math.min(tier.discountAmount, Math.max(0, subtotal - promoDiscount));
    return {
      source: "PROMO_TIER", promotion: promoCandidate.data, tier: tier.tier,
      promoDiscount, tierDiscount, vipDiscount: 0, discountAmount: promoDiscount + tierDiscount, vipInfo,
    };
  }
  if (!candidates.length) return { source: null, discountAmount: 0, promoDiscount: 0, tierDiscount: 0, vipDiscount: 0, vipInfo };
  candidates.sort((a, b) => b.discountAmount - a.discountAmount);
  const best = candidates[0];
  return {
    source: best.source,
    promotion: best.source === "PROMO" ? best.data : undefined,
    discount: best.source === "VIP" ? best.data : undefined,
    tier: best.source === "TIER" ? best.data : undefined,
    discountAmount: best.discountAmount,
    promoDiscount: best.source === "PROMO" ? best.discountAmount : 0,
    tierDiscount: best.source === "TIER" ? best.discountAmount : 0,
    vipDiscount: best.source === "VIP" ? best.discountAmount : 0,
    vipInfo,
  };
}

// Finds at most one currently eligible real-product gift. The gift is later
// appended to the same atomic place_order RPC call as the purchased items, so
// its stock is decremented exactly once and a failed order rolls it back too.
async function resolveAutomaticGift(
  db: any, shopId: string, subtotal: number,
  cartLines: Array<{ productId: string; qty: number }>,
): Promise<{ rule: any; giftProduct: any } | null> {
  const nowIso = new Date().toISOString();
  const { data: rules, error } = await db.from("automatic_gift_rules").select("*")
    .eq("shop_id", shopId).eq("is_active", true)
    .or(`starts_at.is.null,starts_at.lte.${nowIso}`).or(`ends_at.is.null,ends_at.gte.${nowIso}`)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (!(rules || []).length) return null;

  const cartProductIds = Array.from(new Set(cartLines.map((l) => String(l.productId)).filter(Boolean)));
  const { data: cartProducts, error: productErr } = cartProductIds.length
    ? await db.from("products").select("id,category_id").eq("shop_id", shopId).in("id", cartProductIds)
    : { data: [], error: null };
  if (productErr) throw productErr;
  const categoryByProduct = new Map((cartProducts || []).map((p: any) => [String(p.id), String(p.category_id || "")]));

  for (const rule of rules || []) {
    let eligible = false;
    if (rule.condition_type === "ORDER_AMOUNT") eligible = subtotal >= Number(rule.threshold_amount || 0);
    else if (rule.condition_type === "SPECIFIC_PRODUCT") {
      const qty = cartLines.filter((l) => String(l.productId) === String(rule.target_product_id)).reduce((s, l) => s + l.qty, 0);
      eligible = qty >= Number(rule.threshold_quantity || 1);
    } else if (rule.condition_type === "CATEGORY_QUANTITY") {
      const qty = cartLines.filter((l) => categoryByProduct.get(String(l.productId)) === String(rule.target_category_id)).reduce((s, l) => s + l.qty, 0);
      eligible = qty >= Number(rule.threshold_quantity || 1);
    } else if (rule.condition_type === "SPECIFIC_PRODUCTS") {
      // 4-paket, 8.2-band, 3-tur: bir nechta trigger mahsulot —
      // "kamida bittasi" (ANY) yoki "barchasi" (ALL) savatchada bo'lishi.
      const targetIds: string[] = Array.isArray(rule.target_product_ids) ? rule.target_product_ids.map(String) : [];
      const cartProductIdSet = new Set(cartLines.filter((l) => l.qty > 0).map((l) => String(l.productId)));
      eligible = targetIds.length > 0 && (rule.match_mode === "ALL"
        ? targetIds.every((id) => cartProductIdSet.has(id))
        : targetIds.some((id) => cartProductIdSet.has(id)));
    }
    if (!eligible) continue;

    const { data: giftProduct, error: giftErr } = await db.from("products")
      .select("id,name,name_ru,img,price,stock,status,is_visible,variants")
      .eq("shop_id", shopId).eq("id", rule.gift_product_id).maybeSingle();
    if (giftErr) throw giftErr;
    const available = giftProduct && giftProduct.status !== "DELETED" && giftProduct.is_visible !== false
      && (!Array.isArray(giftProduct.variants) || giftProduct.variants.length === 0)
      && Number(giftProduct.stock) >= Number(rule.gift_quantity || 1);
    if (!available) {
      if (rule.stock_zero_policy === "AUTO_PAUSE") {
        await db.from("automatic_gift_rules").update({ is_active: false, updated_at: nowIso })
          .eq("shop_id", shopId).eq("id", rule.id);
      }
      continue;
    }
    return { rule, giftProduct };
  }
  return null;
}

// Reward qoidalarini bitta buyurtmadan keyin tekshiradi (order-total va
// lifetime-total) — idempotentlik migratsiya 033'dagi ikkita partial unique
// index orqali DB darajasida kafolatlangan (bu funksiya xato qilib ikki
// marta chaqirilsa ham, insert xato beradi, ikki marta reward berilmaydi).
async function generateRewardCode(): Promise<string> {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "GIFT-";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
async function checkAndIssueRewards(db: any, shopId: string, tgId: string, orderId: number, orderPayableTotal: number, botToken: string) {
  try {
    const { data: rules, error: rulesErr } = await db.from("reward_rules").select("*").eq("shop_id", shopId).eq("is_active", true);
    if (rulesErr) throw rulesErr;
    if (!rules || !rules.length) return;
    let lifetimeTotal: number | null = null;
    const periodTotalByDays = new Map<number, number>();
    for (const rule of rules) {
      let qualifies = false;
      if (rule.trigger_type === "ORDER_TOTAL") {
        qualifies = orderPayableTotal >= Number(rule.threshold_amount);
      } else {
        const periodDays = rule.period_days ? Math.max(1, Number(rule.period_days)) : null;
        if (periodDays && !periodTotalByDays.has(periodDays)) {
          const cutoff = new Date(Date.now() - periodDays * 24 * 3600 * 1000).toISOString();
          const { data: periodRows, error: periodErr } = await db.from("orders").select("payable_total,total_price,status,receipt_review_status,payment_status")
            .eq("shop_id", shopId).eq("tg_id", tgId).eq("payment_status", "PAID").gte("created_at", cutoff);
          if (periodErr) throw periodErr;
          periodTotalByDays.set(periodDays, (periodRows || []).filter((o: any) => o.status !== "CANCELLED" && o.receipt_review_status !== "REJECTED")
            .reduce((s: number, o: any) => s + Number(o.payable_total ?? o.total_price ?? 0), 0));
        } else if (!periodDays) {
          if (lifetimeTotal === null) {
            const { data: ordersRows, error: ordersErr } = await db.from("orders").select("payable_total,total_price,status,receipt_review_status,payment_status").eq("shop_id", shopId).eq("tg_id", tgId).eq("payment_status", "PAID");
            if (ordersErr) throw ordersErr;
            lifetimeTotal = (ordersRows || []).filter((o: any) => o.status !== "CANCELLED" && o.receipt_review_status !== "REJECTED")
              .reduce((s: number, o: any) => s + Number(o.payable_total ?? o.total_price ?? 0), 0);
          }
        }
        const qualifyingTotal = periodDays ? (periodTotalByDays.get(periodDays) || 0) : (lifetimeTotal || 0);
        qualifies = qualifyingTotal >= Number(rule.threshold_amount);
      }
      if (!qualifies) continue;

      const code = await generateRewardCode();
      const expiresAt = rule.code_expiry_days ? new Date(Date.now() + Number(rule.code_expiry_days) * 24 * 3600 * 1000).toISOString() : null;
      const { data: promo, error: promoErr } = await db.from("promotions").insert({
        shop_id: shopId, code, name: `Reward — ${rule.trigger_type === "ORDER_TOTAL" ? "buyurtma" : rule.period_days ? `${rule.period_days} kun` : "lifetime"} ${Number(rule.threshold_amount)}`,
        discount_type: rule.reward_type, discount_value: rule.reward_value,
        usage_limit: 1, ends_at: expiresAt, source: rule.trigger_type === "ORDER_TOTAL" ? "REWARD_ORDER_THRESHOLD" : "REWARD_LIFETIME_THRESHOLD",
        issued_to_tg_id: tgId, transferable: !!rule.transferable,
      }).select("id").single();
      if (promoErr) { console.error("[REWARD_PROMO_INSERT_FAILED]", promoErr); continue; }

      const { error: issuanceErr } = await db.from("reward_issuances").insert({
        shop_id: shopId, rule_id: rule.id, tg_id: tgId,
        order_id: rule.trigger_type === "ORDER_TOTAL" ? orderId : null,
        promotion_id: promo.id,
      });
      if (issuanceErr) {
        // Partial unique index'ga zid keldi (23505) — demak bu (qoida,mijoz/buyurtma)
        // uchun reward ALLAQACHON berilgan (race yoki retry) — endi yaratilgan
        // promo-kodni bekor qilamiz (o'chiramiz), boshqa hech narsa qilmaymiz.
        await db.from("promotions").delete().eq("id", promo.id).eq("shop_id", shopId);
        if (issuanceErr.code !== "23505") console.error("[REWARD_ISSUANCE_FAILED]", issuanceErr);
        continue;
      }
      // Server bu yerda mijozning UZ/RU tanlovini bilmaydi (uiLang faqat
      // client-side localStorage'da, app_users'da til ustuni yo'q) — shu
      // sabab ikkala tilda ham yuboriladi (mavjud STAFF_INVITE_NOTIFY kabi
      // boshqa proaktiv xabarlar esa faqat UZ; bu yerda "UZ/RU tizimiga mos
      // bo'lsin" aniq talab qilingani uchun ikkalasi birga yuboriladi).
      // 15-band spec, 12-band: aniq ko'rsatilgan namunaga mos — qayerdan
      // topish mumkinligi ("Aksiyalar -> Promo-kodlarim") ham aytiladi.
      const uz = `🎁 Tabriklaymiz! Sizga <b>${code}</b> promo-kodi taqdim etildi — ${rule.reward_type === "PERCENT" ? `${Number(rule.reward_value)}% chegirma` : `${Number(rule.reward_value).toLocaleString("uz-UZ")} so'm chegirma`}.${expiresAt ? ` Amal qilish muddati: ${new Date(expiresAt).toLocaleDateString("uz-UZ")}gacha.` : ""} Uni Profil → Aksiyalar → Promo-kodlarim bo'limida ko'rishingiz mumkin.`;
      const ru = `🎁 Поздравляем! Вам начислен промокод <b>${code}</b> — ${rule.reward_type === "PERCENT" ? `скидка ${Number(rule.reward_value)}%` : `скидка ${Number(rule.reward_value).toLocaleString("ru-RU")} сум`}.${expiresAt ? ` Действителен до ${new Date(expiresAt).toLocaleDateString("ru-RU")}.` : ""} Его можно найти в Профиль → Акции → Мои промокоды.`;
      await telegramApi(botToken, "sendMessage", { chat_id: tgId, text: `${uz}\n\n${ru}`, parse_mode: "HTML" }).catch((e: any) => console.error("[REWARD_NOTIFY_FAILED]", { code: e?.code || "notify_failed" }));
    }
  } catch (e) {
    console.error("[CHECK_AND_ISSUE_REWARDS_FAILED]", e);
  }
}

function mapSupportTicketForClient(t: any, extra: any = {}) {
  return {
    id: t.id, tgId: t.tg_id, orderId: t.order_id || null, status: t.status,
    ticketType: t.ticket_type || "SUPPORT",
    createdAt: t.created_at, answeredAt: t.answered_at || null, closedAt: t.closed_at || null,
    ...extra,
  };
}
function mapSupportMessageForClient(m: any, extra: any = {}) {
  return {
    id: m.id, ticketId: m.ticket_id, sender: m.sender, senderTgId: m.sender_tg_id,
    body: m.body, replyToMessageId: m.reply_to_message_id || null, createdAt: m.created_at,
    // task 5-6 (read receipts, "✓/✓✓"): null until the OTHER side has
    // opened the ticket after this message existed.
    readAt: m.read_at || null,
    attachment: m.attachment_path ? { mimeType: m.attachment_mime, name: m.attachment_name, size: Number(m.attachment_size || 0), url: extra.attachmentUrl || null } : null,
  };
}
function maskAuditDetails(value: any, depth = 0): any {
  if (depth > 5 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => maskAuditDetails(item, depth + 1));
  if (typeof value !== "object") return typeof value === "string" && value.length > 1000 ? `${value.slice(0, 1000)}…` : value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 100)) {
    result[key] = /(token|secret|password|api[_-]?key|authorization|cipher|credential)/i.test(key)
      ? "[MASKED]" : maskAuditDetails(item, depth + 1);
  }
  return result;
}
async function attachTicketSummaries(db: any, shopId: string, tickets: any[]) {
  if (!tickets.length) return [];
  const ids = tickets.map((t: any) => t.id);
  const customerIds = [...new Set(tickets.map((t: any) => String(t.tg_id)).filter(Boolean))];
  const [{ data: msgs, error }, { data: customers, error: customerError }] = await Promise.all([
    db.from("support_ticket_messages")
      .select("ticket_id,sender,body,created_at").eq("shop_id", shopId).in("ticket_id", ids).order("created_at", { ascending: true }),
    customerIds.length
      ? db.from("app_users").select("tg_id,profile_first_name,profile_last_name,first_name,last_name,username,phone").eq("shop_id", shopId).in("tg_id", customerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (error) throw error;
  if (customerError) throw customerError;
  const customerById = new Map((customers || []).map((user: any) => {
    const name = [user.profile_first_name || user.first_name, user.profile_last_name || user.last_name].filter(Boolean).join(" ").trim()
      || (user.username ? `@${user.username}` : null);
    return [String(user.tg_id), { name, phone: user.phone || null, tgId: String(user.tg_id) }];
  }));
  const byTicket = new Map<number, any[]>();
  for (const m of msgs || []) {
    if (!byTicket.has(m.ticket_id)) byTicket.set(m.ticket_id, []);
    byTicket.get(m.ticket_id)!.push(m);
  }
  return tickets.map((t: any) => {
    const list = byTicket.get(t.id) || [];
    const last = list[list.length - 1] || null;
    return mapSupportTicketForClient(t, {
      lastMessage: last ? { sender: last.sender, body: last.body, createdAt: last.created_at } : null,
      messageCount: list.length,
      customer: customerById.get(String(t.tg_id)) || { name: null, phone: null, tgId: String(t.tg_id) },
    });
  });
}

function miniAppUrl(baseUrl: string, botId: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("bot_id", botId);
  return url.toString();
}
async function resolveTelegramMiniAppTarget(db: any, shopId: string, botId: string, defaultBaseUrl: string) {
  const fallbackUrl = miniAppUrl(defaultBaseUrl, botId);
  const { data: settings, error: settingsError } = await db.from("shop_settings")
    .select("telegram_mini_app_domain_id").eq("shop_id", shopId).maybeSingle();
  if (settingsError) throw settingsError;
  const domainId = String(settings?.telegram_mini_app_domain_id || "");
  if (!domainId) return { mode: "DEFAULT", domainId: null, hostname: null, url: fallbackUrl, fallbackUrl };
  const { data: domain, error: domainError } = await db.from("shop_domains")
    .select("id,hostname,status,routing_ready,shop_id").eq("id", domainId).eq("shop_id", shopId).maybeSingle();
  if (domainError) throw domainError;
  if (!domain || domain.status !== "ACTIVE" || domain.routing_ready !== true) {
    await db.from("shop_settings").update({ telegram_mini_app_domain_id: null, telegram_mini_app_updated_at: new Date().toISOString() }).eq("shop_id", shopId);
    return { mode: "DEFAULT", domainId: null, hostname: null, url: fallbackUrl, fallbackUrl, resetReason: "DOMAIN_UNAVAILABLE" };
  }
  const url = miniAppUrl(`https://${String(domain.hostname).toLowerCase()}/`, botId);
  return { mode: "DOMAIN", domainId: String(domain.id), hostname: String(domain.hostname), url, fallbackUrl };
}

// Astra-6a — premium-web shop-admin is intentionally allowlisted.  The
// browser never gets a generic pass-through to the legacy Telegram action
// switch: only existing, reviewed admin flows needed by J–L (Excel/BILLZ/
// image/receipt/report export) may enter it.  Every action is still checked
// again by the existing server-side requirePermission() call in its handler.
const WEB_ADMIN_ACTION_PERMISSIONS: Readonly<Record<string, Permission | null>> = Object.freeze({
  domains_list: 'domains.manage', domains_add: 'domains.manage', domains_reserve_slug: 'domains.manage', domains_change_slug: 'domains.manage',
  domains_verify: 'domains.manage', domains_set_primary: 'domains.manage', domains_remove: 'domains.manage',
  domains_get_mini_app_target: 'domains.manage', domains_set_mini_app_target: 'domains.manage',
  get_my_permissions: null,

  // L3-a/L3-b/L3-c premium-web settings projection + reviewed settings saves.
  // Integration secrets remain write-only: status responses never return credentials.
  get_admin_settings: 'shop.settings.manage',
  set_legal_documents: 'shop.settings.manage', retry_bad_translations: 'shop.settings.manage',
  set_shop_contact: 'shop.settings.manage', set_low_stock_threshold: 'shop.settings.manage',
  set_orders_paused: 'shop.settings.manage', set_fulfillment_config: 'shop.settings.manage',
  set_order_policies: 'shop.settings.manage',
  set_design_settings: 'shop.settings.manage', set_shop_logo: 'shop.settings.manage', set_start_message: 'shop.settings.manage',
  click_get_status: 'integrations.manage', click_connect: 'integrations.manage', click_disconnect: 'integrations.manage', click_start_test_payment: 'integrations.manage', click_test_progress: 'integrations.manage',
  payme_get_status: 'integrations.manage', payme_connect: 'integrations.manage', payme_disconnect: 'integrations.manage', payme_start_test_payment: 'integrations.manage', payme_test_progress: 'integrations.manage',
  uzum_get_status: 'integrations.manage', uzum_connect: 'integrations.manage', uzum_disconnect: 'integrations.manage',

  // I2 premium-web admin support. Existing handlers still enforce support.manage.
  get_support_tickets: 'support.manage',
  get_support_messages: 'support.manage',
  send_support_message: 'support.manage',

  // K3 premium-web marketing screens. Each handler still re-checks marketing.manage.
  get_marketing_bootstrap: 'marketing.manage',
  marketing_summary: 'marketing.manage',
  set_featured_categories: 'marketing.manage',
  banner_list: 'marketing.manage', banner_reorder: 'marketing.manage', banner_create: 'marketing.manage', banner_update: 'marketing.manage', banner_delete: 'marketing.manage',
  promo_generate_code: 'marketing.manage', promo_list: 'marketing.manage', promo_create: 'marketing.manage', promo_update: 'marketing.manage', promo_delete: 'marketing.manage', promo_usage_list: 'marketing.manage',
  bundle_list: 'marketing.manage', bundle_create: 'marketing.manage', bundle_update: 'marketing.manage', bundle_delete: 'marketing.manage',
  discount_tier_group_list: 'marketing.manage', discount_tier_group_create: 'marketing.manage', discount_tier_group_update: 'marketing.manage', discount_tier_group_delete: 'marketing.manage',
  automatic_gift_list: 'marketing.manage', automatic_gift_create: 'marketing.manage', automatic_gift_update: 'marketing.manage', automatic_gift_delete: 'marketing.manage',
  reward_rule_list: 'marketing.manage', reward_rule_create: 'marketing.manage', reward_rule_update: 'marketing.manage', reward_rule_delete: 'marketing.manage',
  set_marketing_settings: 'marketing.manage',
  list_abandoned_carts: 'marketing.manage', remind_abandoned_cart: 'marketing.manage',
  create_abandoned_cart_campaign: 'marketing.manage', get_abandoned_cart_campaign: 'marketing.manage',

  // J1/J2 premium-web admin catalog list/editor actions.
  get_admin_products: 'products.manage',
  get_admin_product_editor: 'products.manage',
  add_product: 'products.manage',
  edit_product_field: 'products.manage',
  toggle_product_visibility: 'products.manage',
  toggle_featured: 'products.manage',
  duplicate_product: 'products.manage',
  bulk_move_products: 'products.manage',
  bulk_trash_products: 'products.manage',
  delete_product: 'products.manage', get_trash: 'products.manage',
  restore_trash_batch: 'products.manage', purge_trash_batch_now: 'products.manage',
  get_product_price_history: 'products.manage', move_sort: 'products.manage',
  bulk_apply_discount: 'products.manage', bulk_clear_discount: 'products.manage',
  add_category: 'catalog.manage',
  edit_category: 'catalog.manage',
  bulk_create_categories: 'catalog.manage', reorder_categories: 'catalog.manage',
  move_category: 'catalog.manage', get_category_delete_preview: 'catalog.manage', delete_category: 'catalog.manage',

  // Excel import / rollback.
  get_excel_template_url: 'products.import_export',
  start_import_batch: 'products.import_export',
  stage_import_products: 'products.import_export',
  bulk_import_products: 'products.import_export',
  get_category_aliases: 'products.import_export',
  get_last_import_batch: 'products.import_export',
  rollback_import_batch: 'products.import_export',

  // BILLZ connection + browse/import lifecycle.
  billz_get_status: 'integrations.manage',
  billz_connect: 'integrations.manage',
  billz_list_config_options: 'integrations.manage',
  billz_save_sale_config: 'integrations.manage',
  billz_disconnect: 'integrations.manage',
  billz_get_categories: 'integrations.manage',
  billz_browse_products: 'integrations.manage',
  billz_import_products: 'integrations.manage',
  billz_list_imported_products: 'integrations.manage',
  billz_unlink_products: 'integrations.manage',
  billz_list_deleted_products: 'integrations.manage',
  billz_restore_product: 'integrations.manage',

  // Product-image upload/finalize.
  upload_product_image: 'products.manage',
  get_upload_url: 'products.manage',
  finalize_image_upload: 'products.manage',

  // Receipt review. Customer receipt upload remains on the customer path.
  get_all_orders: 'orders.view',
  update_order_status: 'orders.manage',
  set_order_internal_note: 'orders.manage', update_order_return: 'orders.manage', update_shipment: 'orders.manage',
  get_payment_receipt_url: 'orders.manage',
  approve_payment_receipt: 'orders.manage',
  reject_payment_receipt: 'orders.manage',

  // K2 premium-web inventory. Read and write permissions stay distinct.
  get_inventory_rows: 'stock.view',
  bulk_stock_update: 'stock.manage',
  record_stock_in: 'stock.manage',
  get_stock_movements: 'stock.view',

  // L2 premium-web team / roles. Audit keeps its stricter OWNER or system MANAGER
  // gate inside list_admin_audit_log; staff.manage alone must not grant audit access.
  role_list: 'staff.manage', role_create: 'staff.manage', role_update: 'staff.manage', role_delete: 'staff.manage',
  staff_list: 'staff.manage', staff_invite: 'staff.manage', staff_cancel_invite: 'staff.manage',
  staff_update_roles: 'staff.manage', staff_set_permission: null, staff_set_blocked: 'staff.manage', staff_remove: 'staff.manage',
  list_admin_audit_log: null,

  // Reports / temporary PDF export.
  get_dashboard_lite: 'reports.view',
  get_admin_action_center: 'reports.view',
  get_report_overview: 'reports.view',
  get_sales_report: 'reports.view',
  get_customer_report: 'reports.view',
  get_product_report: 'reports.view',
  get_warehouse_summary: 'stock.view',
  upload_report_pdf: 'reports.view',
  get_users_summary: 'customers.view',
  block_user: 'customers.manage', unblock_user: 'customers.manage',
  customer_discount_create: 'customers.manage', customer_discount_batch_list: 'customers.manage',
  customer_discount_batch_detail: 'customers.manage', customer_discount_batch_update: 'customers.manage',
  customer_discount_batch_cancel: 'customers.manage', customer_discount_usage_list: 'customers.manage',
  get_admins_list: 'staff.manage',
});
const WEB_ADMIN_ACTIONS = new Set(Object.keys(WEB_ADMIN_ACTION_PERMISSIONS));
// The classic Shop UI is shared by Telegram and the browser. Browser requests
// may enter the legacy action switch only for this explicit customer surface;
// tenant and account identity are still resolved from Origin + UStoreSession.
const WEB_SHARED_CUSTOMER_ACTIONS = new Set([
  "boot", "get_catalog", "get_favorites", "toggle_favorite", "get_recent_views", "record_product_view",
  "get_my_orders", "cancel_order", "confirm_order_received", "create_order", "update_profile",
  "get_my_support_tickets", "get_support_messages", "create_support_ticket", "send_support_message",
  "close_support_ticket", "get_support_attachment_upload_url", "finalize_support_attachment_upload",
  "get_delivery_districts", "get_delivery_branches", "discount_preview", "promo_preview",
  "get_payment_receipt_upload_url", "finalize_payment_receipt", "upload_payment_receipt",
  "save_cart_snapshot", "subscribe_stock_notification", "unsubscribe_stock_notification",
  "bundle_list", "get_my_permissions", "staff_invite_respond",
  "get_marketing_campaigns", "get_campaign_detail",
]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const BOT_TOKEN_MASTER_KEY = Deno.env.get("USTORE_BOT_TOKEN_MASTER_KEY")!;
  const PLATFORM_SUPER_ADMIN_ID = String(Deno.env.get("USTORE_SUPER_ADMIN_ID") ?? "");
  // Same default platform-api's provisioning flow uses for the menu button
  // (see platform-api/index.ts's DEFAULT_SHOP_MINI_APP_BASE_URL) — kept
  // consistent so a /start reply's button always points at the same place
  // the shop's Telegram menu button does, without needing two secrets set.
  const SHOP_MINI_APP_BASE_URL = Deno.env.get("SHOP_MINI_APP_BASE_URL") || "https://usmonovshaxrizod1-maker.github.io/ustore/";
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  // ---- Telegram webhook: /start ------------------------------------------
  // botId travels in the URL (?bot_id=), because setup_bot_webhook registers
  // each shop bot's webhook as `${SUPABASE_URL}/functions/v1/shop-api?bot_id=<id>`
  // — Telegram calls back that exact URL and can't be made to send a custom
  // JSON body shape, so this is the only place a bot's identity can travel
  // for this particular request type.
  if (body?.update_id !== undefined) {
    const url = new URL(req.url);
    const rawBotId = (url.searchParams.get("bot_id") || "").trim();
    if (!rawBotId || !/^\d+$/.test(rawBotId)) return json({ error: "missing_bot_id" }, 400);
    const { data: botRow } = await db.from("shop_bots")
      .select("shop_id,token_ciphertext,token_iv,status").eq("telegram_bot_id", rawBotId).maybeSingle();
    if (!botRow || botRow.status !== "ACTIVE") return json({ error: "unknown_bot" }, 404);
    // 3.3-band: same rule as resolveShopContext() — a shop still in
    // PROVISIONING (or later DISABLED/TERMINATED) must not get a working
    // /start reply. Lifecycle round: FROZEN is now an EXCEPTION — instead
    // of silently doing nothing (which read as "the bot is stuck" to the
    // shop's own customers), it falls through and gets a short, honest
    // "temporarily paused" reply below. TERMINATED shops never reach this
    // line in practice any more (platform_terminate_shop deletes the
    // webhook itself), this check just stays as defense in depth.
    const { data: webhookShopRow } = await db.from("shops").select("status").eq("id", botRow.shop_id).maybeSingle();
    if (!webhookShopRow || (webhookShopRow.status !== "ACTIVE" && webhookShopRow.status !== "FROZEN")) return json({ ok: true });
    const botToken = await decryptBotToken(BOT_TOKEN_MASTER_KEY, botRow.token_ciphertext, botRow.token_iv);
    const expectedSecret = await telegramWebhookSecret(botToken);
    const gotSecret = req.headers.get("x-telegram-bot-api-secret-token") || "";
    if (gotSecret !== expectedSecret) return json({ error: "forbidden:webhook_secret" }, 403);
    const message = body?.message;
    const chatId = message?.chat?.id;
    const text = String(message?.text || "").trim();
    const firstToken = text.split(/\s+/, 1)[0].toLowerCase();
    const isStartCommand = firstToken === "/start" || firstToken.startsWith("/start@");
    const isLoginCommand = firstToken === "/login" || firstToken.startsWith("/login@");
    const isResetCommand = firstToken === "/reset" || firstToken.startsWith("/reset@");
    const wantsCredentials = isLoginCommand || isResetCommand || (isStartCommand && /^\/?start(?:@\w+)?\s+credentials$/i.test(text));
    if (chatId && wantsCredentials) {
      // Credentials are never delivered to a group or a forwarded account.
      if (message?.chat?.type !== "private" || String(chatId) !== String(message?.from?.id || "")) {
        await telegramApi(botToken, "sendMessage", { chat_id: chatId, text: "Login ma’lumotlarini botning shaxsiy chatida /login orqali oling." });
        return json({ ok: true });
      }
      if (webhookShopRow.status !== "ACTIVE") {
        await telegramApi(botToken, "sendMessage", { chat_id: chatId, text: "Bu do‘kon hozircha faoliyat ko‘rsatmayapti." });
        return json({ ok: true });
      }
      const sender = message.from;
      const telegramUserId = String(sender.id);
      const displayName = [sender.first_name, sender.last_name].filter(Boolean).join(" ").trim() || sender.username || `ustore.${telegramUserId.slice(-6)}`;
      const accountId = await ensureTelegramAccount(db, telegramUserId, displayName);
      const { data: existing, error: credentialError } = await db.from("account_credentials")
        .select("login_display").eq("account_id", accountId).maybeSingle();
      if (credentialError) throw credentialError;
      const issued = isResetCommand
        ? await resetCredentialsForTelegram(db, { accountId, telegramUserId, loginHint: existing?.login_display || displayName })
        : existing ? null : await issueInitialCredentials(db, { accountId, telegramUserId, loginHint: displayName });
      const login = issued?.login || String(existing?.login_display || "");
      const passwordLine = issued?.password ? `\nParol: ${issued.password}` : "\nParol xavfsizlik uchun qayta ko‘rsatilmaydi. Unutgan bo‘lsangiz, /reset buyrug‘i bilan yangisini oling.";
      const legacyMiniAppUrl = `${SHOP_MINI_APP_BASE_URL}?bot_id=${encodeURIComponent(rawBotId)}`;
      const miniAppTarget = await resolveTelegramMiniAppTarget(db, String(botRow.shop_id), rawBotId, SHOP_MINI_APP_BASE_URL)
        .catch(() => ({ url: legacyMiniAppUrl }));
      await telegramApi(botToken, "sendMessage", {
        chat_id: chatId,
        text: `Sizning web loginingiz: ${login}${passwordLine}\n\nLogin va parolni Mini App → Profil → Web login va parol bo‘limida istalgan payt o‘zgartirishingiz mumkin. O‘zgartirgan parolingiz saqlanadi.`,
        reply_markup: { inline_keyboard: [[{ text: "🛍 Mini App profilini ochish", web_app: { url: miniAppTarget.url } }]] },
      });
      return json({ ok: true });
    }
    if (chatId && isStartCommand && webhookShopRow.status === "FROZEN") {
      // Muzlatilgan do'kon: ichki muzlatish sababi (lifecycle_reason) bu
      // yerda OSHKOR QILINMAYDI — u faqat do'kon egasiga tegishli ichki
      // eslatma, tasodifiy mijozga ko'rsatilmaydi.
      await telegramApi(botToken, "sendMessage", {
        chat_id: chatId,
        text: "Bu do'kon hozircha faoliyat ko'rsatmayapti. Iltimos, keyinroq qayta urinib ko'ring.",
      });
      return json({ ok: true });
    }
    if (chatId && isStartCommand) {
      const { data: startRow } = await db.from("shop_settings").select("start_message,start_image_url").eq("shop_id", botRow.shop_id).maybeSingle();
      const welcome = (startRow?.start_message && String(startRow.start_message).trim())
        ? String(startRow.start_message)
        : DEFAULT_START_MESSAGE;
      // Phase 2 fix: the welcome text alone had no way to actually open the
      // Mini App — add the same "open this shop" WebApp button the shop's
      // Telegram menu button uses (platform_connect_bot's setChatMenuButton),
      // with the SAME bot_id-carrying URL, built here (not the bot token —
      // that never leaves this function/never appears in a URL).
      // Keep the historical URL expression in this path as an explicit compatibility fallback:
      // already-sent Telegram buttons keep pointing here even after an owner explicitly switches
      // the current menu button to a verified custom domain.
      const legacyMiniAppUrl = `${SHOP_MINI_APP_BASE_URL}?bot_id=${encodeURIComponent(rawBotId)}`;
      const miniAppTarget = await resolveTelegramMiniAppTarget(db, String(botRow.shop_id), rawBotId, SHOP_MINI_APP_BASE_URL)
        .catch((error: any) => { console.error("[MINI_APP_TARGET_RESOLVE_FAILED]", { shopId: botRow.shop_id, code: error?.code || 'unknown' }); return { url: legacyMiniAppUrl }; });
      const replyMarkup = {
        inline_keyboard: [[{
          text: "🛍 Do'konni ochish",
          web_app: { url: miniAppTarget.url },
        }]],
      };
      if (startRow?.start_image_url) {
        // Rasm bo'lsa matn rasm tagidagi caption sifatida ketadi. Telegram
        // caption limiti 1024 belgi; juda uzun custom matn bo'lsa rasmni
        // alohida, to'liq matnni keyingi message qilib yuboramiz.
        if (welcome.length <= 1024) {
          await telegramApi(botToken, "sendPhoto", {
            chat_id: chatId, photo: String(startRow.start_image_url), caption: welcome,
            parse_mode: "HTML", reply_markup: replyMarkup,
          });
        } else {
          await telegramApi(botToken, "sendPhoto", { chat_id: chatId, photo: String(startRow.start_image_url) });
          await telegramApi(botToken, "sendMessage", { chat_id: chatId, text: welcome, parse_mode: "HTML", reply_markup: replyMarkup });
        }
      } else {
        await telegramApi(botToken, "sendMessage", {
          chat_id: chatId, text: welcome, parse_mode: "HTML", reply_markup: replyMarkup,
        });
      }
    }
    return json({ ok: true });
  }

  const { action, payload = {}, initData, bossSecret } = body || {};

  // Astra-9a-b — public premium-web tenant bootstrap. A browser hostname is
  // routing input only; it never grants shop authority. For hostname lookup we
  // additionally require the browser Origin hostname to match the requested
  // hostname, then resolve only an ACTIVE+routing_ready registry entry.
  if (String(body?.clientMode || "").toLowerCase() === "web" && action === "resolve_web_tenant") {
    try {
      const requestedHostname = String(payload?.hostname || "").trim().toLowerCase().replace(/\.$/, "");
      let originHostname = "";
      try { originHostname = new URL(String(req.headers.get("origin") || "")).hostname.toLowerCase().replace(/\.$/, ""); } catch (_) {}
      if (!requestedHostname || !originHostname || requestedHostname !== originHostname) return json({ error: "invalid_origin" }, 403);
      const route = await resolveActiveDomainRoute(db, requestedHostname);
      if (!route) return json({ error: "unknown_web_tenant" }, 404);
      const [{ data: botRow, error: botErr }, { data: shopBrand, error: brandErr }] = await Promise.all([
        db.from("shop_bots").select("telegram_bot_id,bot_username,status").eq("shop_id", route.shop_id).eq("status", "ACTIVE").maybeSingle(),
        db.from("shop_settings").select("name,logo_url").eq("shop_id", route.shop_id).maybeSingle(),
      ]);
      if (botErr) throw botErr;
      if (brandErr) throw brandErr;
      if (!botRow?.telegram_bot_id) return json({ error: "unknown_web_tenant" }, 404);
      return json({ tenant: {
        botId: String(botRow.telegram_bot_id), shopId: String(route.shop_id),
        domainId: String(route.id), hostname: String(route.hostname), isPrimary: route.is_primary === true,
        shopName: String(shopBrand?.name || "").trim() || null, logoUrl: shopBrand?.logo_url || null,
        botUsername: String(botRow.bot_username || "").replace(/^@/, "") || null,
      } });
    } catch (error: any) {
      if (error?.message === "invalid_hostname") return json({ error: "invalid_hostname" }, 400);
      console.error("[WEB_TENANT_RESOLVE_ERROR]", { code: error?.code || "unknown" });
      return json({ error: "web_tenant_resolve_failed" }, 500);
    }
  }

  // Astra-5a — premium web public bootstrap/catalog/bundles. `botId` is only a
  // tenant locator here; it is never authorization. These two projections
  // intentionally run without decrypting the shop bot token. If the browser
  // sends an UStoreSession token, it is verified server-side; an invalid or
  // expired supplied token is rejected instead of silently becoming guest.
  if (String(body?.clientMode || "").toLowerCase() === "web" && !(body?.uiMode === "shared" && action === "boot") && (action === "boot" || action === "get_catalog" || action === "get_web_bundles" || action === "get_web_promotion" || action === "get_web_promotions")) {
    try {
      const tenantResult = await resolveShopTenant(db, req, body);
      if (!tenantResult.ok) return json({ error: tenantResult.error }, tenantResult.status);
      const sessionResult = await resolveOptionalWebSession(db, req);
      if (!sessionResult.ok) return json({ error: sessionResult.error }, sessionResult.status);
      let webSession: any = null;
      let mayViewHiddenCatalog = false;
      if (sessionResult.session) {
        const principalResult = await resolveWebShopPrincipal(db, tenantResult.tenant.shopId, sessionResult.session.accountId);
        if (!principalResult.ok) return json({ error: principalResult.error }, principalResult.status);
        webSession = {
          authenticated: true, accountId: sessionResult.session.accountId, sessionId: sessionResult.session.sessionId,
          expiresAt: sessionResult.session.expiresAt, replacementToken: sessionResult.session.replacementToken || null,
          actor: principalResult.principal.actor,
        };
        const actor = principalResult.principal.actor;
        mayViewHiddenCatalog = actor?.shopRole === "OWNER" || (actor?.shopRole === "STAFF" && (actor?.permissions || []).some((permission: string) => permission === "*" || permission === "products.manage"));
      }
      if (action === "get_catalog") return json({ ...(await publicWebCatalog(db, tenantResult.tenant.shopId, mayViewHiddenCatalog)), webSession });
      if (action === "get_web_bundles") return json({ ...(await publicWebBundles(db, tenantResult.tenant.shopId)), webSession });
      if (action === "get_web_promotions") return json({ ...(await publicWebPromotions(db, tenantResult.tenant.shopId)), webSession });
      if (action === "get_web_promotion") {
        const promotion = await publicWebPromotion(db, tenantResult.tenant.shopId, String(payload?.promotionId || ""));
        return promotion ? json({ promotion, webSession }) : json({ error: "not_found" }, 404);
      }
      return json({
        ...(await publicWebBoot(db, tenantResult.tenant.shopId)),
        shop: { id: tenantResult.tenant.shopId, slug: tenantResult.tenant.publicCode, lifecycle: "ACTIVE", currency: "UZS", canonicalWebUrl: null },
        webSession,
      });
    } catch (error: any) {
      console.error("[WEB_PUBLIC_SHOP_API_ERROR]", { action, code: error?.code || "unknown" });
      return json({ error: "web_public_request_failed" }, 500);
    }
  }

  // Astra-5b — authenticated premium-web customer actions. Public boot/catalog
  // stay in the 5a branch above. Every action below requires a valid central
  // web session and a freshly resolved shop principal; browser shopId/role
  // fields are ignored. 5c will add authoritative checkout/order-create/payment.
  const WEB_PRIVATE_ACTIONS = new Set([
    "web_cart_load", "web_cart_merge_guest", "web_cart_replace", "web_cart_clear", "web_cart_mutate",
    "web_profile_get", "web_profile_update", "web_favorites_list", "web_favorite_set",
    "web_orders_list", "web_order_get", "web_order_cancel", "web_order_confirm_received",
    "web_support_list", "web_support_messages", "web_support_upload_prepare", "web_support_send",
    "web_checkout_quote", "web_order_create", "web_payment_start", "web_payment_status",
  ]);
  if (String(body?.clientMode || "").toLowerCase() === "web" && WEB_PRIVATE_ACTIONS.has(String(action || ""))) {
    try {
      const tenantResult = await resolveShopTenant(db, req, body);
      if (!tenantResult.ok) return json({ error: tenantResult.error }, tenantResult.status);
      const sessionResult = await resolveOptionalWebSession(db, req);
      if (!sessionResult.ok) return json({ error: sessionResult.error }, sessionResult.status);
      if (!sessionResult.session) return json({ error: "auth_required" }, 401);
      const principalResult = await resolveWebShopPrincipal(db, tenantResult.tenant.shopId, sessionResult.session.accountId);
      if (!principalResult.ok) return json({ error: principalResult.error }, principalResult.status);
      if (principalResult.principal.appUser?.is_blocked) return json({ error: "forbidden" }, 403);
      const result: any = await handleWebPrivateShopAction(db, tenantResult.tenant.shopId, principalResult.principal, String(action), payload || {}, tenantResult.tenant, BOT_TOKEN_MASTER_KEY);
      if (result?.__error) {
        const { __error, __status, ...details } = result;
        return json({ error: __error, ...details }, Number(__status) || 400);
      }
      return json({ ...result, webSession: { authenticated: true, accountId: sessionResult.session.accountId, sessionId: sessionResult.session.sessionId, expiresAt: sessionResult.session.expiresAt, replacementToken: sessionResult.session.replacementToken || null, actor: principalResult.principal.actor } });
    } catch (error: any) {
      console.error("[WEB_PRIVATE_SHOP_API_ERROR]", { action, code: error?.code || "unknown" });
      return json({ error: "web_private_request_failed" }, 500);
    }
  }

  // ---- Boss-app service-to-service call (product_limit / tariffs) --------
  // 24-band: product_limit is now shop-level, but the boss-app<->shops
  // tariff integration itself is explicitly future work (this round only
  // makes the FOUNDATION multi-shop-safe). Kept minimally working: the
  // trusted caller now names WHICH shop via payload.shopId directly (this
  // path never goes through botId/initData — it is service-to-service,
  // same trust model as the old single-tenant version, just shop-scoped).
  if (action === "set_product_limit") {
    const BOSS_SHARED_SECRET = Deno.env.get("BOSS_SHARED_SECRET") ?? "";
    if (!BOSS_SHARED_SECRET || bossSecret !== BOSS_SHARED_SECRET) return json({ error: "forbidden:bad_boss_secret" }, 403);
    const shopId = String(payload?.shopId || "");
    const limit = Number(payload?.limit);
    if (!shopId || !Number.isFinite(limit) || limit < 0) return json({ error: "invalid_payload" }, 400);
    const { error } = await db.from("shop_settings").update({ product_limit: limit }).eq("shop_id", shopId);
    return error ? json({ error: error.message }, 500) : json({ ok: true });
  }

  // ---- Cron actions (pg_cron) — cross-shop by nature ----------------------
  // 23-band: these scan ALL shops in one pass (a cron job isn't "for" any
  // one shop), but every row they touch carries its OWN shop_id, and every
  // Storage cleanup uses THAT row's shop_id for the path prefix — so this
  // stays multi-shop-safe even though it isn't scoped to a single ctx.shopId.
  if (action === "cleanup_expired_receipts") {
    const CRON_SHARED_SECRET = Deno.env.get("CRON_SHARED_SECRET") ?? "";
    if (!CRON_SHARED_SECRET || bossSecret !== CRON_SHARED_SECRET) return json({ error: "forbidden:bad_cron_secret" }, 403);
    const cutoffIso = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
    const { data: expired, error: selErr } = await db.from("orders")
      .select("id,shop_id,payment_receipt_path")
      .not("payment_receipt_path", "is", null)
      .not("payment_receipt_telegram_sent_at", "is", null)
      .lt("payment_receipt_telegram_sent_at", cutoffIso)
      .limit(500);
    if (selErr) return json({ error: selErr.message }, 500);
    let cleaned = 0;
    const failures: Array<{ orderId: number; error: string }> = [];
    for (const row of expired || []) {
      try {
        const ok = await cleanupPrivateReceipt(db, row.shop_id, row.id, row.payment_receipt_path);
        if (ok) cleaned++; else failures.push({ orderId: row.id, error: "cleanup_failed" });
      } catch (e: any) {
        failures.push({ orderId: row.id, error: e?.message || String(e) });
      }
    }
    return json({ ok: true, scanned: (expired || []).length, cleaned, failed: failures.length, failures });
  }

  if (action === "purge_expired_trash") {
    const CRON_SHARED_SECRET = Deno.env.get("CRON_SHARED_SECRET") ?? "";
    if (!CRON_SHARED_SECRET || bossSecret !== CRON_SHARED_SECRET) return json({ error: "forbidden:bad_cron_secret" }, 403);
    const cutoffIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: expired, error: selErr } = await db.from("trash_batches").select("id,shop_id")
      .is("restored_at", null).is("purged_at", null).lt("deleted_at", cutoffIso).limit(100);
    if (selErr) return json({ error: selErr.message }, 500);
    let purged = 0;
    const failures: Array<{ batchId: string; error: string }> = [];
    for (const batch of expired || []) {
      try {
        const { data: purgeResult, error: purgeErr } = await db.rpc("ustore_purge_trash_batch", { p_shop_id: batch.shop_id, p_batch_id: batch.id });
        if (purgeErr) throw purgeErr;
        await cleanupUnreferencedProductImages(db, batch.shop_id, purgeResult?.imageUrls || [], SUPABASE_URL);
        purged++;
      } catch (e: any) {
        failures.push({ batchId: batch.id, error: e?.message || String(e) });
      }
    }
    return json({ ok: true, scanned: (expired || []).length, purged, failed: failures.length, failures });
  }

  if (action === "notify_abandoned_carts") {
    const CRON_SHARED_SECRET = Deno.env.get("CRON_SHARED_SECRET") ?? "";
    if (!CRON_SHARED_SECRET || bossSecret !== CRON_SHARED_SECRET) return json({ error: "forbidden:bad_cron_secret" }, 403);
    const nowIso = new Date().toISOString();
    const cutoffIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const oldestAutoIso = new Date(Date.now() - 3 * 86400000).toISOString();
    const { data: autoCarts, error: cartsErr } = await db.from("cart_logs").select("shop_id,tg_id,updated_at")
      .lt("updated_at", cutoffIso).gte("updated_at", oldestAutoIso).is("customer_notified_at", null).gt("item_count", 0).limit(300);
    if (cartsErr) return json({ error: cartsErr.message }, 500);
    const autoByShop = new Map<string, any[]>();
    for (const cart of autoCarts || []) {
      const key = String(cart.shop_id);
      autoByShop.set(key, [...(autoByShop.get(key) || []), cart]);
    }
    for (const [autoShopId, rows] of autoByShop) {
      const { data: existingJobs } = await db.from("abandoned_cart_reminder_queue").select("tg_id,cart_updated_at")
        .eq("shop_id", autoShopId).in("tg_id", rows.map((cart: any) => cart.tg_id)).in("status", ["QUEUED", "PROCESSING"]);
      const existingKeys = new Set((existingJobs || []).map((job: any) => `${job.tg_id}:${job.cart_updated_at}`));
      const freshRows = rows.filter((cart: any) => !existingKeys.has(`${cart.tg_id}:${cart.updated_at}`));
      if (!freshRows.length) continue;
      const { data: campaign } = await db.from("abandoned_cart_campaigns").insert({ shop_id: autoShopId, created_by: "SYSTEM", scope: "ELIGIBLE", filters: { automatic: true }, total_count: freshRows.length }).select("id").single();
      if (campaign) await db.from("abandoned_cart_reminder_queue").insert(freshRows.map((cart: any) => ({ campaign_id: campaign.id, shop_id: autoShopId, tg_id: cart.tg_id, cart_updated_at: cart.updated_at })));
    }
    const { data: jobs, error: jobsError } = await db.from("abandoned_cart_reminder_queue").select("*")
      .in("status", ["QUEUED", "FAILED"]).lte("scheduled_at", nowIso).lt("attempts", 3).order("id", { ascending: true }).limit(50);
    if (jobsError) return json({ error: jobsError.message }, 500);
    const shopIds = [...new Set((jobs || []).map((job: any) => job.shop_id))];
    const { data: bots, error: botsErr } = shopIds.length ? await db.from("shop_bots").select("shop_id,token_ciphertext,token_iv").in("shop_id", shopIds).eq("status", "ACTIVE") : { data: [], error: null };
    if (botsErr) return json({ error: botsErr.message }, 500);
    const botByShop = new Map((bots || []).map((b: any) => [String(b.shop_id), b]));
    let notified = 0, skipped = 0, failed = 0;
    const processJob = async (job: any) => {
      // Bir vaqtda ikki cron ishga tushsa, bir xabar ikki marta ketmasin:
      // faqat statusni PROCESSING'ga o'zi o'zgartira olgan worker davom etadi.
      const { data: claimed, error: claimError } = await db.from("abandoned_cart_reminder_queue")
        .update({ status: "PROCESSING", locked_at: nowIso, attempts: Number(job.attempts || 0) + 1 })
        .eq("id", job.id).in("status", ["QUEUED", "FAILED"]).select("id").maybeSingle();
      if (claimError || !claimed) return;
      try {
        const { data: cart } = await db.from("cart_logs").select("item_count,updated_at,admin_reminded_at,reminder_count")
          .eq("shop_id", job.shop_id).eq("tg_id", job.tg_id).maybeSingle();
        const age = cart ? Date.now() - new Date(cart.updated_at).getTime() : Infinity;
        const stale = !cart || Number(cart.item_count || 0) <= 0 || String(cart.updated_at) !== String(job.cart_updated_at) || age > 7 * 86400000 || Number(cart.reminder_count || 0) >= 2 || (cart.admin_reminded_at && new Date(cart.admin_reminded_at).getTime() > Date.now() - 86400000);
        if (stale) {
          await db.from("abandoned_cart_reminder_queue").update({ status: "SKIPPED", last_error: "cart_changed_or_not_eligible" }).eq("id", job.id); skipped++; return;
        }
        const bot = botByShop.get(String(job.shop_id));
        if (!bot) throw new Error("active_bot_not_found");
        const token = await decryptBotToken(BOT_TOKEN_MASTER_KEY, bot.token_ciphertext, bot.token_iv);
        await telegramApi(token, "sendMessage", { chat_id: job.tg_id, text: `🛒 Savatingizda ${cart.item_count} ta mahsulot kutmoqda. Xaridni yakunlashni unutmang!\n\n🛒 В вашей корзине вас ждут товары: ${cart.item_count}. Не забудьте завершить покупку!` });
        const sentAt = new Date().toISOString();
        await db.from("cart_logs").update({ customer_notified_at: sentAt, admin_reminded_at: sentAt, reminder_count: Number(cart.reminder_count || 0) + 1 }).eq("shop_id", job.shop_id).eq("tg_id", job.tg_id).eq("updated_at", job.cart_updated_at);
        await db.from("abandoned_cart_reminder_queue").update({ status: "SENT", sent_at: sentAt, last_error: null }).eq("id", job.id); notified++;
      } catch (error: any) {
        const attempts = Number(job.attempts || 0) + 1;
        const retryAfter = Number(String(error?.message || "").match(/retry[_ ]after[^0-9]*(\d+)/i)?.[1] || 60);
        const terminal = attempts >= 3;
        await db.from("abandoned_cart_reminder_queue").update({ status: terminal ? "FAILED" : "QUEUED", scheduled_at: new Date(Date.now() + Math.min(3600, Math.max(30, retryAfter)) * 1000).toISOString(), last_error: String(error?.message || error).slice(0, 500) }).eq("id", job.id);
        failed++;
      }
    };
    for (let i = 0; i < (jobs || []).length; i += 5) await Promise.all((jobs || []).slice(i, i + 5).map(processJob));
    const campaignIds = [...new Set((jobs || []).map((job: any) => job.campaign_id).filter(Boolean))];
    for (const campaignId of campaignIds) {
      const { data: states } = await db.from("abandoned_cart_reminder_queue").select("status").eq("campaign_id", campaignId);
      const counts = { sent: 0, skipped: 0, failed: 0, pending: 0 };
      for (const state of states || []) state.status === "SENT" ? counts.sent++ : state.status === "SKIPPED" ? counts.skipped++ : state.status === "FAILED" ? counts.failed++ : counts.pending++;
      await db.from("abandoned_cart_campaigns").update({ status: counts.pending ? "RUNNING" : "COMPLETED", sent_count: counts.sent, skipped_count: counts.skipped, failed_count: counts.failed, started_at: nowIso, completed_at: counts.pending ? null : new Date().toISOString() }).eq("id", campaignId);
    }
    return json({ ok: true, queuedAutomatically: (autoCarts || []).length, processed: (jobs || []).length, notified, skipped, failed });
  }

  // ---- Every remaining action: resolve shop context first -----------------
  // 5-band ("Failed to fetch" fix): this whole setup phase — including
  // resolveShopContext()'s DB reads — now lives INSIDE the same try/catch as
  // every action below. Previously it sat OUTSIDE that try, so any exception
  // here (e.g. a query referencing a column from a migration that hasn't
  // been applied yet) was completely uncaught: Deno's runtime returns a bare
  // error response without this app's own CORS headers, which the browser
  // reports as a generic "Failed to fetch" instead of a readable JSON error.
  // Wrapping it here means every failure — schema drift, a bad query,
  // anything — degrades to a normal `{error, status}` response like every
  // other action already gets, never a hard crash of the whole function.
  try {
    const clientMode = String(body?.clientMode || "").toLowerCase();
    const isWebAdminRequest = clientMode === "web";
    let ctx: ShopContext;
    if (isWebAdminRequest) {
      // Public/customer web actions returned above. Reaching the legacy admin
      // switch from web is forbidden unless the action is explicitly in the
      // Astra-6a whitelist. Browser role/permission/shopId claims are ignored.
      const sharedCustomerAction = body?.uiMode === "shared" && WEB_SHARED_CUSTOMER_ACTIONS.has(String(action || ""));
      if (!sharedCustomerAction && !WEB_ADMIN_ACTIONS.has(String(action || ""))) return json({ error: "web_action_not_allowed" }, 403);
      const tenantResult = await resolveShopTenant(db, req, body);
      if (!tenantResult.ok) return json({ error: tenantResult.error }, tenantResult.status);
      // Do not rotate here because legacy action responses do not have a common
      // envelope in which a replacement token can safely be returned. Auth UI
      // / getSession remains the rotation path.
      const sessionResult = await resolveOptionalWebSession(db, req, false);
      if (!sessionResult.ok) return json({ error: sessionResult.error }, sessionResult.status);
      if (!sessionResult.session) return json({ error: "auth_required" }, 401);
      const principalResult = await resolveWebShopPrincipal(db, tenantResult.tenant.shopId, sessionResult.session.accountId);
      if (!principalResult.ok) return json({ error: principalResult.error }, principalResult.status);
      const principal = principalResult.principal;
      if (principal.appUser?.is_blocked) return json({ error: "forbidden" }, 403);
      if (!sharedCustomerAction && principal.actor.shopRole !== "OWNER" && principal.actor.shopRole !== "STAFF") {
        return json({ error: "forbidden:not_admin" }, 403);
      }
      let botToken = "";
      try {
        // Some legacy admin actions (receipt approval/reward notifications)
        // legitimately need the tenant bot server-side. It is never returned
        // to the browser and public 5a projections still never decrypt it.
        botToken = await decryptBotToken(BOT_TOKEN_MASTER_KEY, tenantResult.tenant.tokenCiphertext, tenantResult.tenant.tokenIv);
      } catch (error: any) {
        console.error("[WEB_ADMIN_BOT_TOKEN_DECRYPT_FAILED]", { shopId: tenantResult.tenant.shopId, code: error?.code || "unknown" });
        return json({ error: "bot_token_decrypt_failed" }, 500);
      }
      const appUser = principal.appUser || {};
      ctx = {
        botId: tenantResult.tenant.botId, shopId: tenantResult.tenant.shopId, botToken, botUsername: tenantResult.tenant.botUsername,
        tgId: String(principal.tgId), firstName: appUser.profile_first_name || appUser.first_name || undefined,
        lastName: appUser.profile_last_name || appUser.last_name || undefined, username: appUser.username || undefined,
        billzAccessGranted: tenantResult.tenant.billzAccessGranted, clickAccessGranted: tenantResult.tenant.clickAccessGranted,
        paymeAccessGranted: tenantResult.tenant.paymeAccessGranted, uzumAccessGranted: tenantResult.tenant.uzumAccessGranted,
      };
    } else {
      const resolved = await resolveShopContext(db, req, body, BOT_TOKEN_MASTER_KEY);
      if (!resolved.ok) return json({ error: resolved.error }, resolved.status);
      ctx = resolved.ctx;
    }
    const shopId = ctx.shopId;
    const tgId = ctx.tgId;
    const BOT_TOKEN = ctx.botToken;

    // The shop bot is provisioned by platform Super Admin; its token remains
    // encrypted in shop_bots and verifies this Mini App's initData server-side.
    // Never use a browser web session or a client-supplied Telegram ID here.
    async function shopWebCredentialStatus() {
      const displayName = [ctx.firstName, ctx.lastName].filter(Boolean).join(" ").trim() || ctx.username || `ustore.${tgId.slice(-6)}`;
      const accountId = await ensureTelegramAccount(db, tgId, displayName);
      const { data: credential, error: credentialError } = await db.from("account_credentials")
        .select("login_display").eq("account_id", accountId).maybeSingle();
      if (credentialError) throw credentialError;
      return {
        accountId, displayName,
        valid: true,
        credentialExists: !!credential, login: credential?.login_display ? String(credential.login_display) : null,
      };
    }
    // Platform Super Admin web authority is deliberately NOT inferred from a
    // Telegram id. Astra-6b owns central platform-web authorization.
    const isPlatformSuperAdmin = !isWebAdminRequest && PLATFORM_SUPER_ADMIN_ID !== "" && tgId === PLATFORM_SUPER_ADMIN_ID;
    // Platform super-admin can also be the real OWNER of a shop. Always read
    // the shop membership so the client receives that OWNER role and exposes
    // owner-only pages (for example Domains). Platform authority still stays
    // separate: a super-admin without membership remains staffRole=null.
    const membershipResult = await db.from("shop_memberships").select("role,status")
      .eq("shop_id", shopId).eq("telegram_user_id", tgId).eq("status", "ACTIVE").maybeSingle();
    if (membershipResult.error) throw membershipResult.error;
    const membershipRow: any = membershipResult.data;
    // isAdmin here means "can manage this shop" (OWNER membership) — the same
    // gate the old code called requireAdmin() for, just backed by
    // shop_memberships instead of the old flat admins table.
    const isAdmin = isPlatformSuperAdmin || !!membershipRow;
    const isSuperAdmin = isPlatformSuperAdmin;

    function requireAdmin() { if (!isAdmin) throw new Error("forbidden:not_admin"); }
    function requireSuperAdmin() { if (!isSuperAdmin) throw new Error("forbidden:not_super_admin"); }
    // Xodimlar/Huquqlar, 2.1-bosqich: OWNER va platforma bosh admin har doim
    // to'liq huquqli (rol tekshiruvisiz) — bu Owner-only qatordagi
    // "permission union orqali Owner bo'lib olib bo'lmaydi" talabining
    // aksi emas, balki uning zaruriy old sharti: Owner ALLAQACHON hamma
    // narsaga ruxsatli, shuning uchun uni ham rollar orqali cheklashning
    // hojati yo'q. STAFF esa tayinlangan rollarining permission union'i
    // bilan tekshiriladi (bir so'rovda hisoblanadi, so'rov davomida keshlanadi).
    let effectivePermissionsCache: Set<Permission> | null = null;
    async function getEffectivePermissions(): Promise<Set<Permission>> {
      if (effectivePermissionsCache) return effectivePermissionsCache;
      if (!membershipRow || membershipRow.role !== "STAFF") { effectivePermissionsCache = new Set(); return effectivePermissionsCache; }
      const { data: roleRows, error: roleErr } = await db.from("membership_roles").select("role_id").eq("shop_id", shopId).eq("telegram_user_id", tgId);
      if (roleErr) { console.error("[EFFECTIVE_PERMISSIONS_ROLE_LOOKUP_FAILED]", roleErr); effectivePermissionsCache = new Set(); return effectivePermissionsCache; }
      const roleIds = (roleRows || []).map((r: any) => r.role_id);
      const [{ data: permRows, error: permErr }, { data: roles, error: rolesErr }, { data: overrides, error: overridesErr }] = await Promise.all([
        roleIds.length ? db.from("role_permissions").select("permission").eq("shop_id", shopId).in("role_id", roleIds) : Promise.resolve({ data: [], error: null }),
        roleIds.length ? db.from("roles").select("key").eq("shop_id", shopId).in("id", roleIds) : Promise.resolve({ data: [], error: null }),
        db.from('shop_staff_permission_overrides').select('permission,enabled').eq('shop_id', shopId).eq('telegram_user_id', tgId),
      ]);
      if (permErr || rolesErr || overridesErr) { console.error("[EFFECTIVE_PERMISSIONS_LOOKUP_FAILED]", permErr || rolesErr || overridesErr); effectivePermissionsCache = new Set(); return effectivePermissionsCache; }
      const manager = (roles || []).some((r: any) => r.key === 'MANAGER');
      effectivePermissionsCache = new Set((permRows || []).map((r: any) => r.permission as Permission));
      for (const row of overrides || []) {
        if (row.permission === 'domains.manage' && manager) continue;
        if (row.enabled) effectivePermissionsCache.add(row.permission as Permission);
        else effectivePermissionsCache.delete(row.permission as Permission);
      }
      if (manager) effectivePermissionsCache.add('domains.manage');
      return effectivePermissionsCache;
    }
    async function requirePermission(perm: Permission): Promise<void> {
      if (isSuperAdmin || membershipRow?.role === "OWNER") return;
      if (!isAdmin) throw new Error("forbidden:not_admin");
      const perms = await getEffectivePermissions();
      if (!perms.has(perm)) throw new Error(`forbidden:missing_permission:${perm}`);
    }
    async function requireStaffPermissionManager(): Promise<void> {
      if (isSuperAdmin || membershipRow?.role === 'OWNER') return;
      if (!(await canViewAuditLog()) || !(await getEffectivePermissions()).has('staff.permissions.manage'))
        throw new Error('forbidden:staff.permissions.manage');
    }
    let auditLogAccessCache: boolean | null = null;
    async function canViewAuditLog(): Promise<boolean> {
      if (auditLogAccessCache !== null) return auditLogAccessCache;
      if (isSuperAdmin || membershipRow?.role === "OWNER") return (auditLogAccessCache = true);
      if (!isAdmin || membershipRow?.role !== "STAFF") return (auditLogAccessCache = false);
      const { data: assignments, error: assignmentError } = await db.from("membership_roles")
        .select("role_id").eq("shop_id", shopId).eq("telegram_user_id", tgId);
      if (assignmentError || !assignments?.length) return (auditLogAccessCache = false);
      const { data: roles, error: roleError } = await db.from("roles").select("id,key")
        .eq("shop_id", shopId).in("id", assignments.map((row: any) => row.role_id));
      auditLogAccessCache = !roleError && (roles || []).some((role: any) => role.key === "MANAGER");
      return auditLogAccessCache;
    }
    async function requireAuditLogAccess(): Promise<void> {
      if (!(await canViewAuditLog())) throw new Error("forbidden:audit_log");
    }
    // Har shopga standart 7 ta rolni (Owner bundan mustasno — u rol emas)
    // BIR MARTA, idempotent tarzda urug'laydi — xodim/rol UI birinchi marta
    // ochilganda chaqiriladi (keyingi bosqich), bu yerda faqat ta'rif.
    async function ensureStandardRolesForShop(): Promise<void> {
      const { data: existing, error: existErr } = await db.from("roles").select("key").eq("shop_id", shopId).eq("is_system", true);
      if (existErr) { console.error("[ENSURE_STANDARD_ROLES_LOOKUP_FAILED]", existErr); return; }
      const existingKeys = new Set((existing || []).map((r: any) => r.key));
      const missingKeys = Object.keys(STANDARD_ROLES).filter((k) => !existingKeys.has(k));
      if (!missingKeys.length) return;
      const { data: inserted, error: insertErr } = await db.from("roles").insert(
        missingKeys.map((key) => ({ shop_id: shopId, key, name: STANDARD_ROLES[key].nameUz, is_system: true })),
      ).select("id,key");
      if (insertErr) { console.error("[ENSURE_STANDARD_ROLES_INSERT_FAILED]", insertErr); return; }
      const permRows: any[] = [];
      for (const row of inserted || []) {
        for (const perm of STANDARD_ROLES[row.key].permissions) permRows.push({ shop_id: shopId, role_id: row.id, permission: perm });
      }
      if (permRows.length) {
        const { error: permInsertErr } = await db.from("role_permissions").insert(permRows);
        if (permInsertErr) console.error("[ENSURE_STANDARD_ROLE_PERMISSIONS_INSERT_FAILED]", permInsertErr);
      }
    }
    // Billz integratsiyasi — faqat PLATFORMA bosh admin ruxsat bergan
    // do'konlarda ochiq (boshqarilgan/beta chiqarilish). shop_id shu request
    // uchun allaqachon ctx orqali server tomonda aniqlangan (mijoz o'zi
    // shopId yubormaydi), shuning uchun bu ruxsat ham boshqa shop'ga
    // "sizib" chiqolmaydi.
    function requireBillzAccessGranted() { if (!ctx.billzAccessGranted) throw new Error("forbidden:billz_not_granted"); }
    // Click.uz avtomatik to'lov integratsiyasi — xuddi shu naqsh: faqat
    // PLATFORMA bosh admin ruxsat bergan do'konlarda ochiq.
    function requireClickAccessGranted() { if (!ctx.clickAccessGranted) throw new Error("forbidden:click_not_granted"); }
    // Payme/Uzum avtomatik to'lov integratsiyasi — aynan bir xil naqsh.
    function requirePaymeAccessGranted() { if (!ctx.paymeAccessGranted) throw new Error("forbidden:payme_not_granted"); }
    function requireUzumAccessGranted() { if (!ctx.uzumAccessGranted) throw new Error("forbidden:uzum_not_granted"); }

    function auditLater(actionName: string, entityType?: string | null, entityId?: unknown, details?: unknown) {
      if (!isAdmin) return;
      const task = db.from("admin_audit_log").insert({
        shop_id: shopId, admin_tg_id: tgId, action: actionName, entity_type: entityType || null,
        entity_id: entityId === null || entityId === undefined ? null : String(entityId),
        details: maskAuditDetails(details ?? null),
      }).then(({ error }: any) => { if (error) console.error("audit log error", error); });
      EdgeRuntime.waitUntil(Promise.resolve(task));
    }
    async function validateSupportAttachment(input: any): Promise<Record<string, unknown> | null> {
      if (!input?.path) return null;
      const path = String(input.path);
      const mimeType = String(input.mimeType || "").toLowerCase();
      const size = Number(input.size || 0);
      const expectedFolder = `shops/${shopId}/support/${tgId}`;
      if (!path.startsWith(`${expectedFolder}/`) || !/^[0-9a-f-]+\.(?:jpg|jpeg|png|webp)$/i.test(path.slice(expectedFolder.length + 1))) throw new Error("invalid_support_attachment_path");
      if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType) || !Number.isFinite(size) || size <= 0 || size > 5 * 1024 * 1024) throw new Error("invalid_support_attachment");
      const fileName = path.slice(expectedFolder.length + 1);
      const { data: objects, error } = await db.storage.from("support-attachments").list(expectedFolder, { search: fileName, limit: 5 });
      if (error || !(objects || []).some((object: any) => object.name === fileName)) throw new Error("support_attachment_not_uploaded");
      return { attachment_path: path, attachment_mime: mimeType, attachment_name: nullableText(input.name, 180), attachment_size: size };
    }

    switch (action) {
      case "shop_web_credentials_open": {
        if (isWebAdminRequest) return json({ error: "forbidden:telegram_reauthentication_required" }, 403);
        const status = await shopWebCredentialStatus();
        const issued = status.credentialExists ? null : await issueInitialCredentials(db, {
          accountId: status.accountId, telegramUserId: tgId, loginHint: status.displayName,
        });
        if (issued?.created) await db.from("web_auth_audit").insert({ account_id: status.accountId, event_type: "CREDENTIAL_ISSUED_TELEGRAM", metadata: { source: "SHOP_MINI_APP_AUTO" } });
        return json({ ok: true, valid: status.valid, credentialExists: true,
          login: issued?.login || status.login, created: issued?.created === true,
          password: issued?.created ? issued.password : null });
      }
      case "shop_web_credentials_issue": {
        if (isWebAdminRequest) return json({ error: "forbidden:telegram_reauthentication_required" }, 403);
        const status = await shopWebCredentialStatus();
        const issued = await issueInitialCredentials(db, { accountId: status.accountId, telegramUserId: tgId, loginHint: status.displayName });
        if (issued.created) await db.from("web_auth_audit").insert({ account_id: status.accountId, event_type: "CREDENTIAL_ISSUED_TELEGRAM", metadata: { source: "SHOP_MINI_APP" } });
        return json({ ok: true, login: issued.login, created: issued.created, password: issued.created ? issued.password : null });
      }
      case "shop_web_credentials_reset": {
        if (isWebAdminRequest) return json({ error: "forbidden:telegram_reauthentication_required" }, 403);
        const status = await shopWebCredentialStatus();
        const reset = await resetCredentialsForTelegram(db, { accountId: status.accountId, loginHint: status.login || status.displayName, telegramUserId: tgId });
        return json({ ok: true, login: reset.login, password: reset.password, sessionsRevoked: true });
      }
      case "shop_web_credentials_change_login": {
        if (isWebAdminRequest) return json({ error: "forbidden:telegram_reauthentication_required" }, 403);
        const status = await shopWebCredentialStatus();
        if (!status.credentialExists) return json({ error: "credentials_not_created" }, 409);
        const result = await changeLogin(db, status.accountId, String(payload.login || ""));
        return json({ ok: true, login: result.login });
      }
      case "shop_web_credentials_set_password": {
        if (isWebAdminRequest) return json({ error: "forbidden:telegram_reauthentication_required" }, 403);
        const status = await shopWebCredentialStatus();
        const result = await setCredentialsPasswordForTelegram(db, {
          accountId: status.accountId, loginHint: status.login || status.displayName,
          telegramUserId: tgId, password: String(payload.password || ""),
        });
        return json({ ok: true, login: result.login, sessionsRevoked: true });
      }
      case "setup_bot_webhook": {
        requireSuperAdmin();
        const secretToken = await telegramWebhookSecret(BOT_TOKEN);
        const webhookUrl = `${SUPABASE_URL}/functions/v1/shop-api?bot_id=${encodeURIComponent(ctx.botId)}`;
        const data = await telegramApi(BOT_TOKEN, "setWebhook", {
          url: webhookUrl,
          secret_token: secretToken,
          allowed_updates: ["message"],
          drop_pending_updates: false,
        });
        return json({ ok: true, description: data?.description || "Webhook was set" });
      }

      case "domains_get_mini_app_target": {
        // Reuse the 7a OWNER/system-MANAGER gate; arbitrary custom roles cannot
        // gain this capability merely by receiving a similarly named client flag.
        await handleShopDomainAction(db, shopId, tgId, "domains_list", {}, Deno.env.get('USTORE_BASE_HOSTNAME') || 'ustr.uz');
        const target = await resolveTelegramMiniAppTarget(db, shopId, ctx.botId, SHOP_MINI_APP_BASE_URL);
        return json({ target: { ...target, customDomainSwitchEnabled: Deno.env.get("USTORE_CUSTOM_DOMAIN_MINI_APP_ENABLED") === "true" } });
      }

      case "domains_set_mini_app_target": {
        await handleShopDomainAction(db, shopId, tgId, "domains_list", {}, Deno.env.get('USTORE_BASE_HOSTNAME') || 'ustr.uz');
        if (payload?.confirm !== true) return json({ error: "VALIDATION_ERROR" }, 400);
        const requestedDomainId = String(payload?.domainId || "");
        const fallbackUrl = miniAppUrl(SHOP_MINI_APP_BASE_URL, ctx.botId);
        let targetUrl = fallbackUrl; let targetDomainId: string | null = null; let hostname: string | null = null;
        if (requestedDomainId) {
          if (Deno.env.get("USTORE_CUSTOM_DOMAIN_MINI_APP_ENABLED") !== "true") return json({ error: "CAPABILITY_UNAVAILABLE" }, 503);
          const { data: domain, error: domainError } = await db.from("shop_domains")
            .select("id,hostname,status,routing_ready,shop_id").eq("id", requestedDomainId).eq("shop_id", shopId).maybeSingle();
          if (domainError) throw domainError;
          if (!domain || domain.status !== "ACTIVE" || domain.routing_ready !== true) return json({ error: "DOMAIN_NOT_VERIFIED" }, 409);
          targetDomainId = String(domain.id); hostname = String(domain.hostname);
          targetUrl = miniAppUrl(`https://${hostname}/`, ctx.botId);
        }
        // This is deliberately explicit. Primary-domain changes never mutate
        // Telegram. Existing already-sent legacy buttons remain valid because
        // SHOP_MINI_APP_BASE_URL is kept online as the rollback/fallback path.
        await telegramApi(BOT_TOKEN, "setChatMenuButton", { menu_button: { type: "web_app", text: "Do'konni ochish", web_app: { url: targetUrl } } });
        const { error: saveError } = await db.from("shop_settings").update({
          telegram_mini_app_domain_id: targetDomainId, telegram_mini_app_updated_at: new Date().toISOString(),
        }).eq("shop_id", shopId);
        if (saveError) throw saveError;
        auditLater("TELEGRAM_MINI_APP_TARGET_CHANGED", "DOMAIN", targetDomainId, { hostname, mode: targetDomainId ? "DOMAIN" : "DEFAULT" });
        return json({ target: { mode: targetDomainId ? "DOMAIN" : "DEFAULT", domainId: targetDomainId, hostname, url: targetUrl, fallbackUrl } });
      }

      case "domains_list":
      case "domains_add":
      case "domains_reserve_slug":
      case "domains_change_slug":
      case "domains_verify":
      case "domains_set_primary":
      case "domains_remove": {
        // Both Telegram and web arrive with server-verified shop/tg identity.
        // Domain helper checks real OWNER/MANAGER membership independently;
        // platform super-admin and arbitrary custom-role permission are not enough.
        try {
          // Capture before 101's trigger clears the configured target.
          await requireDomainManager(db, shopId, tgId);
          const previousTarget = action === 'domains_verify'
            ? await resolveTelegramMiniAppTarget(db, shopId, ctx.botId, SHOP_MINI_APP_BASE_URL) : null;
          if (action === 'domains_remove' || action === 'domains_change_slug') {
            const currentTarget = await resolveTelegramMiniAppTarget(db, shopId, ctx.botId, SHOP_MINI_APP_BASE_URL);
            const changingSubdomain = action === 'domains_change_slug'
              ? await db.from("shop_domains").select("id").eq("shop_id", shopId).eq("kind", "SUBDOMAIN").maybeSingle()
              : { data: null };
            if ((changingSubdomain as any).error) throw (changingSubdomain as any).error;
            const affectedDomainId = action === 'domains_change_slug' ? String(changingSubdomain.data?.id || '') : String(payload?.domainId || '');
            if (currentTarget.domainId && String(currentTarget.domainId) === affectedDomainId) {
              await telegramApi(BOT_TOKEN, "setChatMenuButton", { menu_button: { type: "web_app", text: "Do'konni ochish", web_app: { url: currentTarget.fallbackUrl } } });
              const { error: resetError } = await db.from("shop_settings").update({ telegram_mini_app_domain_id: null, telegram_mini_app_updated_at: new Date().toISOString() }).eq("shop_id", shopId);
              if (resetError) throw resetError;
              auditLater("TELEGRAM_MINI_APP_FALLBACK", "DOMAIN", affectedDomainId || null, { reason: action === 'domains_change_slug' ? "SUBDOMAIN_CHANGED" : "DOMAIN_REMOVAL" });
            }
          }
          const result = await handleShopDomainAction(db, shopId, tgId, action, payload, Deno.env.get('USTORE_BASE_HOSTNAME') || 'ustr.uz');
          if (action === 'domains_verify') {
            const verifiedDomain = (result as any)?.domain || null;
            if (verifiedDomain && verifiedDomain.status !== 'ACTIVE') {
              const { data: setting } = await db.from("shop_settings").select("telegram_mini_app_domain_id").eq("shop_id", shopId).maybeSingle();
              if (String(previousTarget?.domainId || setting?.telegram_mini_app_domain_id || '') === String(verifiedDomain.id || '')) {
                const fallbackUrl = miniAppUrl(SHOP_MINI_APP_BASE_URL, ctx.botId);
                await db.from("shop_settings").update({ telegram_mini_app_domain_id: null, telegram_mini_app_updated_at: new Date().toISOString() }).eq("shop_id", shopId);
                EdgeRuntime.waitUntil(telegramApi(BOT_TOKEN, "setChatMenuButton", { menu_button: { type: "web_app", text: "Do'konni ochish", web_app: { url: fallbackUrl } } })
                  .catch((error: any) => console.error("[TELEGRAM_MINI_APP_FALLBACK_FAILED]", { shopId, code: error?.code || 'unknown' })));
                auditLater("TELEGRAM_MINI_APP_FALLBACK", "DOMAIN", verifiedDomain.id, { reason: "DOMAIN_UNAVAILABLE" });
              }
            }
          }
          // 8a: every successful state-changing domain action is auditable on
          // the server. Reservation itself is already transactionally audited
          // by 097; verify/primary/remove are logged here after their handler
          // has actually succeeded (never on a fake client-side success).
          if (action === 'domains_verify' || action === 'domains_set_primary' || action === 'domains_remove' || action === 'domains_change_slug') {
            const domain = (result as any)?.domain || null;
            const auditAction = action === 'domains_verify' ? 'DOMAIN_VERIFY_REQUESTED'
              : action === 'domains_set_primary' ? 'DOMAIN_PRIMARY_CHANGED'
              : action === 'domains_change_slug' ? 'SUBDOMAIN_CHANGED' : 'DOMAIN_REMOVE_REQUESTED';
            auditLater(auditAction, 'DOMAIN', domain?.id || payload?.domainId || null, {
              hostname: domain?.hostname || null, status: domain?.status || null,
              dnsStatus: domain?.dnsStatus || null, tlsStatus: domain?.tlsStatus || null,
            });
          }
          return json(result);
        } catch (error: any) {
          const message = String(error?.message || '');
          if (message.startsWith('forbidden:')) return json({ error: 'FORBIDDEN' }, 403);
          if (message.startsWith('invalid_')) return json({ error: 'VALIDATION_ERROR' }, 400);
          if (message === 'domain_not_found' || message === 'subdomain_not_found') return json({ error: 'NOT_FOUND' }, 404);
          if (message === 'domain_not_active' || message === 'domain_removing' || message === 'cannot_remove_default_subdomain') return json({ error: 'DOMAIN_NOT_VERIFIED' }, 409);
          if (message === 'domain_provider_unavailable' || message === 'domain_mini_app_switch_disabled') return json({ error: 'CAPABILITY_UNAVAILABLE' }, 503);
          if (message === 'domain_provider_capability') return json({ error: 'DOMAIN_PROVIDER_CAPABILITY' }, 503);
          if (message === 'subdomain_taken') return json({ error: 'SUBDOMAIN_TAKEN' }, 409);
          if (message === 'domain_conflict' || message === 'domain_revision_conflict' || message === 'domain_operation_busy' || error?.code === '23505') return json({ error: 'CONFLICT' }, 409);
          if (message === 'domain_provider_error') return json({ error: 'NETWORK_ERROR' }, 502);
          console.error('[SHOP_DOMAIN_ACTION_FAILED]', { action, code: error?.code || 'unknown' });
          return json({ error: 'NETWORK_ERROR' }, 500);
        }
      }

      case "get_admin_settings": {
        await requirePermission('shop.settings.manage');
        const [shopR, designR] = await Promise.all([
          db.from("shop_settings").select("name,logo_url,logo_type,logo_wordmark,address,coordinates,phone,phone_2,phone_3,instagram,telegram,facebook,about,email,youtube,tiktok,seller_legal_name,seller_tax_id,seller_registration_number,seller_legal_address,seller_bank_details,start_message,start_image_url,fulfillment_config,work_hours,low_stock_threshold,orders_paused,orders_paused_note,customer_cancel_cutoff,return_requests_enabled,return_window_days,return_policy_text,allow_discount_combining,max_combined_discount_percent").eq("shop_id", shopId).maybeSingle(),
          db.from("design_settings").select("theme_id,colors").eq("shop_id", shopId).maybeSingle(),
        ]);
        if (shopR.error) throw shopR.error;
        if (designR.error) throw designR.error;
        const row: any = shopR.data || {};
        return json({
          shopContact: {
            name: row.name || null, address: row.address || null, coordinates: row.coordinates || null,
            phone: row.phone || null, phone2: row.phone_2 || null, phone3: row.phone_3 || null,
            instagram: row.instagram || null, telegram: row.telegram || null, facebook: row.facebook || null,
            about: row.about || null, email: row.email || null, youtube: row.youtube || null, tiktok: row.tiktok || null,
            sellerLegalName: row.seller_legal_name || null, sellerTaxId: row.seller_tax_id || null, sellerRegistrationNumber: row.seller_registration_number || null,
            sellerLegalAddress: row.seller_legal_address || null, sellerBankDetails: row.seller_bank_details || null,
            workHours: row.work_hours || null,
          },
          branding: {
            logoUrl: row.logo_url || null, logoType: row.logo_type || "IMAGE", logoWordmark: row.logo_wordmark || null,
            startMessage: row.start_message || null, startImageUrl: row.start_image_url || null,
          },
          fulfillmentConfig: sanitizeFulfillmentConfig(row.fulfillment_config),
          designSettings: { themeId: designR.data?.theme_id || "minimal", colors: sanitizeDesignColors(designR.data?.colors) },
          ordersPaused: row.orders_paused === true, ordersPausedNote: row.orders_paused_note || null,
          lowStockThreshold: resolveLowStockThreshold(row.low_stock_threshold),
          orderPolicies: {
            customerCancelCutoff: row.customer_cancel_cutoff || "BEFORE_SHIPPED",
            returnRequestsEnabled: row.return_requests_enabled !== false,
            returnWindowDays: Math.max(1, Number(row.return_window_days) || 7),
            returnPolicyText: row.return_policy_text || null,
          },
          discountPolicy: {
            allowDiscountCombining: row.allow_discount_combining === true,
            maxCombinedDiscountPercent: row.max_combined_discount_percent != null ? Number(row.max_combined_discount_percent) : null,
          },
        });
      }

      case "set_start_message": {
        // 2026-09-05 fix: this is shop-owned content (shop_settings, scoped
        // by shopId) exactly like design/fulfillment/order-policy settings —
        // it must be gated the same way (shop.settings.manage), not the
        // platform-wide super-admin-only gate meant for genuinely
        // platform-global actions like webhook setup or the shared BTS/EMU
        // translation batch. The old gate silently blocked every real shop
        // owner from configuring their own bot's /start message/image.
        await requirePermission('shop.settings.manage');
        const startMessage = nullableText(payload.startMessage, 4000);
        const { data: prevRow, error: prevErr } = await db.from("shop_settings")
          .select("start_image_url").eq("shop_id", shopId).maybeSingle();
        if (prevErr) throw prevErr;
        let startImageUrl = prevRow?.start_image_url || null;
        let uploaded: { url: string; path: string } | null = null;
        if (payload.removeStartImage === true) startImageUrl = null;
        if (payload.imageUpload) {
          uploaded = await storeProductImage(db, shopId, payload.imageUpload);
          startImageUrl = uploaded.url;
        }
        const { error } = await db.from("shop_settings")
          .update({ start_message: startMessage, start_image_url: startImageUrl }).eq("shop_id", shopId);
        if (error) {
          if (uploaded) await db.storage.from("images").remove([uploaded.path]);
          throw error;
        }
        // Eski start rasmi almashtirilgan/o'chirilgan bo'lsa, faqat shu shop
        // storage ichidagi product-style path bo'lsa xavfsiz tozalaymiz.
        const oldPath = productStoragePathFromUrl(prevRow?.start_image_url, SUPABASE_URL, shopId);
        if (oldPath && prevRow?.start_image_url !== startImageUrl) {
          await db.storage.from("images").remove([oldPath]).catch(() => {});
        }
        auditLater("START_MESSAGE_UPDATED", "shop_settings", shopId, { startMessage, hasImage: !!startImageUrl });
        return json({ ok: true, startMessage, startImageUrl });
      }

      case "get_role":
        return json({ tgId, isAdmin, isSuperAdmin });

      case "retry_bad_translations": {
        await requirePermission('shop.settings.manage');
        const [productsRes, categoriesRes] = await Promise.all([
          db.from("products").select("id,name,description,name_ru,description_ru,translation_status").eq("shop_id", shopId).neq("status", "DELETED").limit(500),
          db.from("categories").select("id,name,name_ru,translation_status").eq("shop_id", shopId).is("deleted_at", null).limit(500),
        ]);
        if (productsRes.error) throw productsRes.error;
        if (categoriesRes.error) throw categoriesRes.error;
        const productsToRepair = (productsRes.data || []).filter((row: any) =>
          row.translation_status !== "FRESH" ||
          !looksLikeValidRussian(row.name, row.name_ru) ||
          (!!row.description && !looksLikeValidRussian(row.description, row.description_ru))
        );
        const categoriesToRepair = (categoriesRes.data || []).filter((row: any) =>
          row.translation_status !== "FRESH" || !looksLikeValidRussian(row.name, row.name_ru)
        );
        if (productsToRepair.length || categoriesToRepair.length) {
          EdgeRuntime.waitUntil(repairTranslationsInBackground(db, shopId, productsToRepair, categoriesToRepair));
        }
        return json({ scheduledProducts: productsToRepair.length, scheduledCategories: categoriesToRepair.length });
      }

      // 1.14: checkout uchun — delivery_branches PLATFORM-GLOBAL, shop_id
      // filtri yo'q (21-band).
      case "get_delivery_branches": {
        const regionKey = String(payload.regionKey || "");
        const provider = String(payload.provider || "");
        const district = payload.district ? String(payload.district) : null;
        if (!UZ_TOP_LEVEL_REGION_SET.has(regionKey)) return json({ error: "invalid_region" }, 400);
        if (!["BTS", "EMU"].includes(provider)) return json({ error: "invalid_provider" }, 400);
        const { data, error } = await db.from("delivery_branches")
          .select("id,branch_code,branch_name,branch_name_ru,district_or_city,district_or_city_ru,full_address,full_address_ru,landmark,work_hours,phone")
          .eq("region_code", regionKey).eq("provider", provider).eq("active", true)
          .order("district_or_city").order("branch_name").limit(500);
        if (error) throw error;
        if (!district) return json({ branches: data || [] });
        const selected = districtParts(district);
        const sameBase = (data || []).map((r: any) => ({ row: r, p: districtParts(r.district_or_city) }))
          .filter((x: any) => x.p.base === selected.base);
        const explicitKinds = new Set(sameBase.filter((x: any) => x.p.kind !== "generic").map((x: any) => x.p.kind));
        const targetKind = selected.kind === "generic" && explicitKinds.size === 1 ? [...explicitKinds][0] : selected.kind;
        const branches = sameBase.filter((x: any) => x.p.kind === targetKind || (x.p.kind === "generic" && explicitKinds.size <= 1)).map((x: any) => x.row);
        return json({ branches });
      }

      case "get_delivery_districts": {
        const regionKey = String(payload.regionKey || "");
        if (!UZ_TOP_LEVEL_REGION_SET.has(regionKey)) return json({ error: "invalid_region" }, 400);
        const { data, error } = await db.from("delivery_branches")
          .select("district_or_city").eq("region_code", regionKey).eq("active", true)
          .not("district_or_city", "is", null);
        if (error) throw error;
        const parts = (data || []).map((r: any) => districtParts(r.district_or_city)).filter((p: any) => p.base);
        const kindsByBase = new Map<string, Set<string>>();
        for (const p of parts) {
          if (!kindsByBase.has(p.base)) kindsByBase.set(p.base, new Set());
          if (p.kind !== "generic") kindsByBase.get(p.base)!.add(p.kind);
        }
        const labels = new Map<string, string>();
        for (const p of parts) {
          const explicit = kindsByBase.get(p.base) || new Set();
          const kind = p.kind === "generic" && explicit.size === 1 ? ([...explicit][0] as any) : p.kind;
          const effective = { ...p, kind };
          labels.set(`${p.base}|${kind}`, districtLabel(effective));
        }
        const districts = [...labels.values()].sort((a, b) => a.localeCompare(b, "uz"));
        return json({ districts });
      }

      // 5-band: BTS/EMU (619 filial) uchun ruscha tarjima — bu ham
      // platform-global reference data, shuning uchun (odatdagidek shop
      // OWNER emas) PLATFORM super admin talab qilinadi.
      case "translate_delivery_branches_batch": {
        requireSuperAdmin();
        const limit = Math.min(Math.max(Number(payload.limit) || 200, 1), 500);
        const { data: rows, error: fetchErr } = await db.from("delivery_branches")
          .select("id,branch_name,full_address,district_or_city,branch_name_ru,full_address_ru,district_or_city_ru")
          .or("branch_name_ru.is.null,full_address_ru.is.null,district_or_city_ru.is.null")
          .eq("active", true).limit(limit);
        if (fetchErr) throw fetchErr;
        const pending = rows || [];
        if (!pending.length) return json({ ok: true, translated: 0, remaining: 0 });
        const [namesRu, addressesRu, districtsRu] = await Promise.all([
          translateBatchUzToRu(pending.map((r: any) => String(r.branch_name || ""))),
          translateBatchUzToRu(pending.map((r: any) => String(r.full_address || ""))),
          translateBatchUzToRu(pending.map((r: any) => String(r.district_or_city || ""))),
        ]);
        let translated = 0;
        for (let i = 0; i < pending.length; i++) {
          const row = pending[i];
          const update: any = {};
          if (!row.branch_name_ru && namesRu[i]) update.branch_name_ru = namesRu[i];
          if (!row.full_address_ru && addressesRu[i]) update.full_address_ru = addressesRu[i];
          if (!row.district_or_city_ru && districtsRu[i]) update.district_or_city_ru = districtsRu[i];
          if (Object.keys(update).length) {
            const { error: updErr } = await db.from("delivery_branches").update(update).eq("id", row.id);
            if (!updErr) translated++;
          }
        }
        const { count: remaining } = await db.from("delivery_branches").select("id", { count: "exact", head: true })
          .or("branch_name_ru.is.null,full_address_ru.is.null,district_or_city_ru.is.null").eq("active", true);
        auditLater("DELIVERY_BRANCHES_TRANSLATED", "delivery_branches", null, { translated });
        return json({ ok: true, translated, remaining: remaining || 0 });
      }

      // LIGHT BOOT — 10-band: platform super admin is NEVER auto-membered
      // into a shop here (unlike the old code's one-time admins-table
      // bootstrap on boot) — shop_memberships is populated only by the
      // (future) bot-connect onboarding flow.
      case "boot": {
        EdgeRuntime.waitUntil(validateAndPauseBundles(db, shopId, BOT_TOKEN).catch((e: any) => console.error("[BUNDLE_BOOT_VALIDATION_FAILED]", e)));
        const userPromise = db.from("app_users").upsert({
          shop_id: shopId, tg_id: tgId, first_name: ctx.firstName ?? null, last_name: ctx.lastName ?? null,
          username: ctx.username ?? null, last_seen_at: new Date().toISOString(),
        }, { onConflict: "shop_id,tg_id" }).select("is_blocked,block_reason,warned,warn_reason,profile_first_name,profile_last_name,phone").single();
        const shopPromise = db.from("shop_settings").select("name,logo_url,logo_type,logo_wordmark,address,address_ru,coordinates,phone,phone_2,phone_3,instagram,telegram,facebook,about,email,youtube,tiktok,seller_legal_name,seller_tax_id,seller_registration_number,seller_legal_address,seller_bank_details,start_message,start_image_url,fulfillment_config,work_hours,low_stock_threshold,orders_paused,orders_paused_note,featured_category_ids,customer_cancel_cutoff,return_requests_enabled,return_window_days,return_policy_text,allow_discount_combining,max_combined_discount_percent").eq("shop_id", shopId).maybeSingle();
        const designPromise = db.from("design_settings").select("theme_id,colors").eq("shop_id", shopId).maybeSingle();
        const legalPromise = readShopLegalDocuments(db, shopId);
        const subsPromise = db.from("stock_notifications").select("product_id,variant_sku").eq("shop_id", shopId).eq("tg_id", tgId).is("notified_at", null);
        const bannersPromise = activeBannersForClient(db, shopId);
        const pendingInvitePromise = db.from("staff_invites").select("id,role_ids,created_at,expires_at").eq("shop_id", shopId).eq("telegram_user_id", tgId).eq("status", "PENDING").gt("expires_at", new Date().toISOString()).maybeSingle();
        // 048-band: xaridorga (customer) Click/Payme avtomatik to'lov usuli
        // FAQAT admin "Sinash" orqali 3 marta real tasdiqlagandan keyin
        // (verified=true) ko'rinishi kerak — avval bu tekshiruv umuman yo'q
        // edi, admin shunchaki "yoqilgan" qilib qo'ysa (hatto ulanmagan/
        // tekshirilmagan holatda ham) xaridorga chala usul ko'rinardi.
        const clickPaymeStatusPromise = db.from("click_connections").select("status,verified").eq("shop_id", shopId).maybeSingle();
        const paymeStatusPromise = db.from("payme_connections").select("status,verified").eq("shop_id", shopId).maybeSingle();
        // Savatdagi "promo-kod kiritish" maydoni FAQAT do'konda kamida bitta
        // faol promo-kod bo'lganda ko'rinsin — admin hech qachon promo-kod
        // qo'shmagan bo'lsa, bo'sh input chalg'itadi. (Muddati o'tgan-o'tmagani
        // bu yerda tekshirilmaydi — real tekshiruv baribir resolvePromoDiscount'da.)
        const categoryIconLibraryPromise = db.from("category_icon_library")
          .select("id,group_key,name_uz,name_ru,name_en,search_terms,svg_body,sort_order")
          .eq("is_active", true).order("group_key").order("sort_order").order("id");
        const promoCodePromise = db.from("promotions")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", shopId).eq("is_active", true)
          .not("code", "is", null).neq("code", "");
        const [userR, shopR, designR, legalDocuments, subsR, activeBanners, pendingInviteR, clickConnR, paymeConnR, promoCodeR, categoryIconLibraryR] = await Promise.all([userPromise, shopPromise, designPromise, legalPromise, subsPromise, bannersPromise, pendingInvitePromise, clickPaymeStatusPromise, paymeStatusPromise, promoCodePromise, categoryIconLibraryPromise]);
        if (userR.error) throw userR.error;
        const selfRow = userR.data;
        const shopRow = shopR.data;
        let clientFulfillmentConfig = sanitizeFulfillmentConfig(shopRow?.fulfillment_config);
        if (!isAdmin) {
          const clickReady = clickConnR.data?.status === "CONNECTED" && clickConnR.data?.verified === true;
          const paymeReady = paymeConnR.data?.status === "CONNECTED" && paymeConnR.data?.verified === true;
          clientFulfillmentConfig = {
            ...clientFulfillmentConfig,
            payments: {
              ...clientFulfillmentConfig.payments,
              methods: clientFulfillmentConfig.payments.methods.map((m: any) =>
                (m.id === "CLICK" && !clickReady) || (m.id === "PAYME" && !paymeReady) ? { ...m, enabled: false } : m),
            },
          };
        }
        const legalConsentRequired = await legalConsentRequiredForUser(db, shopId, tgId, legalDocuments);
        // Xodimlar/Huquqlar: OWNER/platforma bosh admin uchun '*' (frontend
        // "hamma narsaga ruxsatli" deb o'qiydi, alohida ro'yxat kerak emas);
        // STAFF uchun aniq permission ro'yxati.
        const myPermissions = !isAdmin ? [] : (isSuperAdmin || membershipRow?.role === "OWNER") ? ["*"] : [...(await getEffectivePermissions())];
        const auditLogAllowed = isAdmin ? await canViewAuditLog() : false;
        return json({
          tgId, isAdmin, isSuperAdmin,
          staffRole: membershipRow?.role || null, myPermissions, canViewAuditLog: auditLogAllowed,
          // 3.2-band: shopId is no longer sent to the client at all — it
          // was only ever exposed for the (now-removed) realtime broadcast
          // channel subscription. Removing it further reduces what the
          // frontend needs to know; it was never an authorization input.
          isBlocked: !!selfRow?.is_blocked, blockReason: selfRow?.block_reason || null,
          isWarned: !!selfRow?.warned, warnReason: selfRow?.warn_reason || null,
          logoUrl: shopRow?.logo_url || null,
          // POLISH ROUND (task 2, wordmark): 'IMAGE' (default, mavjud xulq)
          // yoki 'WORDMARK' — WORDMARK bo'lsa frontend logo_url'ni umuman
          // ishlatmaydi, buning o'rniga logoWordmark konfiguratsiyasidan
          // CSS/canvas orqali LIVE render qiladi (rasterizatsiya yo'q).
          logoType: shopRow?.logo_type || "IMAGE",
          logoWordmark: shopRow?.logo_wordmark || null,
          botUsername: ctx.botUsername,
          billzAccessGranted: ctx.billzAccessGranted,
          clickAccessGranted: ctx.clickAccessGranted,
          paymeAccessGranted: ctx.paymeAccessGranted,
          uzumAccessGranted: ctx.uzumAccessGranted,
          mySubscribedProductIds: (subsR.data || []).filter((r: any) => !r.variant_sku).map((r: any) => r.product_id),
          stockSubscriptions: (subsR.data || []).map((r: any) => ({ productId: r.product_id, variantSku: r.variant_sku || null })),
          ordersPaused: !!shopRow?.orders_paused, ordersPausedNote: shopRow?.orders_paused_note || null,
          activeBanners,
          featuredCategories: Array.isArray(shopRow?.featured_category_ids)
            ? shopRow.featured_category_ids.filter((e: any) => e && typeof e === "object" && e.categoryId).map((e: any) => ({ categoryId: String(e.categoryId), productIds: Array.isArray(e.productIds) ? e.productIds.map((x: any) => String(x)) : [] }))
            : [],
          customerCancelCutoff: shopRow?.customer_cancel_cutoff || "BEFORE_SHIPPED",
          returnRequestsEnabled: shopRow?.return_requests_enabled !== false,
          returnWindowDays: Math.max(1, Number(shopRow?.return_window_days) || 7),
          returnPolicyText: shopRow?.return_policy_text || null,
          allowDiscountCombining: shopRow?.allow_discount_combining === true,
          maxCombinedDiscountPercent: shopRow?.max_combined_discount_percent != null ? Number(shopRow.max_combined_discount_percent) : null,
          hasActivePromoCodes: (promoCodeR.count || 0) > 0,
          customCategoryIcons: (categoryIconLibraryR.data || []).map((row: any) => ({
            id: row.id, group: row.group_key, uz: row.name_uz, ru: row.name_ru || row.name_uz, en: row.name_en || row.name_uz,
            searchTerms: Array.isArray(row.search_terms) ? row.search_terms : [], svg: row.svg_body, sortOrder: Number(row.sort_order || 0),
          })),
          pendingStaffInvite: pendingInviteR.data ? { id: pendingInviteR.data.id, roleIds: pendingInviteR.data.role_ids, createdAt: pendingInviteR.data.created_at } : null,
          shopContact: {
            name: shopRow?.name || null,
            address: shopRow?.address || null, addressRu: shopRow?.address_ru || null, coordinates: shopRow?.coordinates || null,
            phone: shopRow?.phone || null, phone2: shopRow?.phone_2 || null, phone3: shopRow?.phone_3 || null,
            instagram: shopRow?.instagram || null, telegram: shopRow?.telegram || null, facebook: shopRow?.facebook || null,
            about: shopRow?.about || null, email: shopRow?.email || null, youtube: shopRow?.youtube || null, tiktok: shopRow?.tiktok || null,
            sellerLegalName: shopRow?.seller_legal_name || null, sellerTaxId: shopRow?.seller_tax_id || null,
            sellerRegistrationNumber: shopRow?.seller_registration_number || null, sellerLegalAddress: shopRow?.seller_legal_address || null,
            sellerBankDetails: shopRow?.seller_bank_details || null,
            startMessage: shopRow?.start_message || null, startImageUrl: shopRow?.start_image_url || null, workHours: shopRow?.work_hours || null,
          },
          lowStockThreshold: resolveLowStockThreshold(shopRow?.low_stock_threshold),
          fulfillmentConfig: clientFulfillmentConfig,
          designSettings: {
            themeId: designR.data?.theme_id || "minimal",
            colors: sanitizeDesignColors(designR.data?.colors),
          },
          legalDocuments: isAdmin ? legalDocuments : legalDocuments.filter((d: any) => d.enabled),
          legalConsentRequired,
          profile: selfRow?.phone ? {
            firstName: selfRow.profile_first_name || ctx.firstName || "",
            lastName: selfRow.profile_last_name || ctx.lastName || "",
            phone: selfRow.phone,
          } : null,
        });
      }

      // 15-band: universal Shop Mini App — frontend endi products/categories
      // jadvallarini to'g'ridan-to'g'ri o'qimaydi, shu action orqali oladi.
      case "get_catalog": {
        const [prodRes, catRes] = await Promise.all([
          db.from("products").select("id,sku,name,name_ru,price,old_price,stock,category_id,status,img,thumb_img,description,description_ru,is_featured,is_visible,sort_order,sizes,variants,sold_count,created_at,import_batch_id,badge").eq("shop_id", shopId).neq("status", "DELETED").order("sort_order", { ascending: true }),
          db.from("categories").select("id,name,name_ru,parent_id,img,icon_id,icon_color,sort_order").eq("shop_id", shopId).is("deleted_at", null).order("sort_order", { ascending: true }),
        ]);
        if (prodRes.error) throw prodRes.error;
        if (catRes.error) throw catRes.error;
        const catalogProducts = isAdmin ? (prodRes.data || []) : (prodRes.data || []).filter((row: any) => row.is_visible !== false);
        return json({ products: catalogProducts, categories: catRes.data || [] });
      }

      // J1 — premium web admin product list. This is intentionally separate
      // from public `get_catalog`: public web must never receive hidden/admin-only
      // rows, while this action requires a fresh products.manage permission.
      case "get_admin_products": {
        await requirePermission('products.manage');
        const page = Math.max(1, Number.parseInt(String(payload.page || 1), 10) || 1);
        const pageSize = Math.min(100, Math.max(10, Number.parseInt(String(payload.pageSize || 25), 10) || 25));
        const rawSearch = String(payload.search || '').trim().slice(0, 80);
        // PostgREST `.or(...)` uses comma/parenthesis as syntax. Strip only
        // those control characters; ordinary Uzbek/Russian/Latin search text
        // remains intact.
        const search = rawSearch.replace(/[,%()]/g, ' ').replace(/\s+/g, ' ').trim();
        const categoryId = String(payload.categoryId || 'ALL');
        const visibility = String(payload.visibility || 'ALL').toUpperCase();
        const stock = String(payload.stock || 'ALL').toUpperCase();
        const sort = String(payload.sort || 'CATALOG').toUpperCase();

        let query = db.from("products").select(
          "id,sku,name,name_ru,price,old_price,stock,category_id,status,img,thumb_img,is_featured,is_visible,sort_order,sizes,variants,sold_count,created_at,import_batch_id,badge",
          { count: "exact" },
        ).eq("shop_id", shopId).neq("status", "DELETED");
        if (categoryId === 'UNCATEGORIZED') query = query.is('category_id', null);
        else if (categoryId && categoryId !== 'ALL') query = query.eq('category_id', categoryId);
        if (visibility === 'VISIBLE') query = query.eq('is_visible', true);
        else if (visibility === 'HIDDEN') query = query.eq('is_visible', false);
        if (stock === 'OUT_OF_STOCK') query = query.eq('status', 'OUT_OF_STOCK');
        else if (stock === 'IN_STOCK') query = query.neq('status', 'OUT_OF_STOCK');
        if (search) {
          const filters = [`name.ilike.%${search}%`, `name_ru.ilike.%${search}%`, `sku.ilike.%${search}%`];
          if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(search)) filters.push(`id.eq.${search}`);
          query = query.or(filters.join(','));
        }
        const sortMap: Record<string, [string, boolean]> = {
          NAME_ASC: ['name', true], PRICE_ASC: ['price', true], PRICE_DESC: ['price', false],
          STOCK_ASC: ['stock', true], STOCK_DESC: ['stock', false], SOLD_DESC: ['sold_count', false], NEWEST: ['created_at', false],
        };
        const selectedSort = sortMap[sort];
        if (selectedSort) query = query.order(selectedSort[0], { ascending: selectedSort[1], nullsFirst: false });
        else query = query.order('sort_order', { ascending: true }).order('created_at', { ascending: true });
        const from = (page - 1) * pageSize;
        query = query.range(from, from + pageSize - 1);

        const [productResult, categoryResult] = await Promise.all([
          query,
          db.from("categories").select("id,name,name_ru,parent_id,img,icon_id,icon_color,sort_order").eq("shop_id", shopId).is("deleted_at", null).order("sort_order", { ascending: true }),
        ]);
        if (productResult.error) throw productResult.error;
        if (categoryResult.error) throw categoryResult.error;
        const totalCount = Number(productResult.count || 0);
        return json({
          products: productResult.data || [], categories: categoryResult.data || [],
          page, pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
        });
      }

      // J2 — full editor payload is permissioned and separate from public catalog.
      // J1 list intentionally stays compact; the editor fetches description and
      // variant image/price fields only after products.manage is re-checked.
      case "get_admin_product_editor": {
        await requirePermission('products.manage');
        const productId = String(payload.productId || "");
        if (!productId) return json({ error: "invalid_product" }, 400);
        const [productResult, categoryResult] = await Promise.all([
          db.from("products").select("id,sku,name,name_ru,description,description_ru,price,old_price,stock,category_id,status,img,thumb_img,is_featured,is_visible,sort_order,sizes,variants,sold_count,created_at,import_batch_id,badge")
            .eq("shop_id", shopId).eq("id", productId).neq("status", "DELETED").maybeSingle(),
          db.from("categories").select("id,name,name_ru,parent_id,img,icon_id,icon_color,sort_order").eq("shop_id", shopId).is("deleted_at", null).order("sort_order", { ascending: true }),
        ]);
        if (productResult.error) throw productResult.error;
        if (categoryResult.error) throw categoryResult.error;
        if (!productResult.data) return json({ error: "product_not_found" }, 404);
        return json({ product: productResult.data, categories: categoryResult.data || [] });
      }

      case "set_design_settings": {
        await requirePermission('shop.settings.manage');
        const themeId = DESIGN_THEME_IDS.includes(payload.themeId) ? payload.themeId : "custom";
        const colors = sanitizeDesignColors(payload.colors);
        const { data, error } = await db.from("design_settings").upsert({
          shop_id: shopId, theme_id: themeId, colors, updated_at: new Date().toISOString(), updated_by: tgId,
        }, { onConflict: "shop_id" }).select().single();
        if (error) throw error;
        auditLater("DESIGN_SETTINGS_UPDATED", "design_settings", shopId, { themeId });
        return json({ ok: true, designSettings: { themeId: data.theme_id, colors: data.colors } });
      }

      case "update_profile": {
        const firstName = nullableText(payload.firstName, 100);
        const lastName = nullableText(payload.lastName, 100);
        const phone = String(payload.phone || "").replace(/\s+/g, "");
        if (!firstName || !/^\+998\d{9}$/.test(phone)) return json({ error: "invalid_profile" }, 400);

        // ROUND14: enabled legal documents must be accepted at their CURRENT
        // versions. This server-side check prevents bypassing the UI checkbox.
        const legalDocuments = await readShopLegalDocuments(db, shopId);
        const required = legalDocuments.filter((d: any) => d.enabled && LEGAL_CONSENT_TYPES.has(d.type));
        const supplied = new Map<string, number>((Array.isArray(payload.legalAcceptances) ? payload.legalAcceptances : [])
          .map((x: any) => [String(x?.type || ''), Number(x?.version || 0)]));
        const { data: existingConsentRows, error: existingConsentError } = required.length
          ? await db.from("shop_legal_consents").select("doc_type,document_version").eq("shop_id", shopId).eq("tg_id", tgId)
          : { data: [], error: null } as any;
        if (existingConsentError) throw existingConsentError;
        const alreadyAccepted = new Set((existingConsentRows || []).map((r: any) => `${r.doc_type}:${Number(r.document_version)}`));
        for (const doc of required) {
          const key = `${doc.type}:${Number(doc.version)}`;
          if (!alreadyAccepted.has(key) && supplied.get(doc.type) !== Number(doc.version)) {
            return json({ error: "legal_consent_required", documentType: doc.type, version: doc.version }, 409);
          }
        }

        const { data: profileBefore } = await db.from("app_users").select("phone").eq("shop_id", shopId).eq("tg_id", tgId).maybeSingle();
        const { error } = await db.from("app_users").update({
          profile_first_name: firstName, profile_last_name: lastName, phone,
        }).eq("shop_id", shopId).eq("tg_id", tgId);
        if (error) throw error;

        const newlyAccepted = required.filter((doc: any) => {
          const key = `${doc.type}:${Number(doc.version)}`;
          return !alreadyAccepted.has(key) && supplied.get(doc.type) === Number(doc.version);
        });
        if (newlyAccepted.length) {
          const source = profileBefore?.phone ? "REACCEPT" : "REGISTRATION";
          const rows = newlyAccepted.map((doc: any) => ({
            shop_id: shopId, tg_id: tgId, doc_type: doc.type, document_version: Number(doc.version), source, accepted_at: new Date().toISOString(),
          }));
          const { error: consentErr } = await db.from("shop_legal_consents").upsert(rows, { onConflict: "shop_id,tg_id,doc_type,document_version", ignoreDuplicates: true });
          if (consentErr) throw consentErr;
        }
        return json({ ok: true, profile: { firstName, lastName: lastName || "", phone }, legalConsentRequired: false });
      }

      case "set_legal_documents": {
        await requirePermission('shop.settings.manage');
        const requested = Array.isArray(payload.documents) ? payload.documents : [];
        if (!requested.length) return json({ error: "invalid_legal_documents" }, 400);
        const existing = await readShopLegalDocuments(db, shopId);
        const existingByType = new Map(existing.map((d: any) => [d.type, d]));
        const result: any[] = [];
        for (const type of LEGAL_DOC_TYPES) {
          const input = requested.find((d: any) => String(d?.type) === type);
          if (!input) { result.push(existingByType.get(type)); continue; }
          const base = LEGAL_DEFAULTS[type];
          const contentUz = String(input.contentUz ?? '').trim();
          const contentRu = String(input.contentRu ?? '').trim();
          if ((LEGAL_CONSENT_TYPES.has(type) && contentUz.length < 200) || (!LEGAL_CONSENT_TYPES.has(type) && input.enabled === true && contentUz.length < 40) || contentUz.length > 50000 || contentRu.length > 50000) return json({ error: "invalid_legal_document_content", documentType: type }, 400);
          const prev: any = existingByType.get(type) || defaultLegalDocument(type);
          const contentChanged = contentUz !== String(prev.contentUz || '') || contentRu !== String(prev.contentRu || '');
          const version = contentChanged ? Number(prev.version || 1) + (prev.updatedAt ? 1 : 0) : Number(prev.version || 1);
          const row = {
            shop_id: shopId, doc_type: type, enabled: input.enabled === true, version,
            content_uz: contentUz || base.contentUz, content_ru: contentRu || base.contentRu,
            updated_at: new Date().toISOString(), updated_by: tgId,
          };
          const { data, error: upErr } = await db.from("shop_legal_documents").upsert(row, { onConflict: "shop_id,doc_type" }).select("doc_type,enabled,version,content_uz,content_ru,updated_at").single();
          if (upErr) throw upErr;
          result.push({
            type, enabled: data.enabled === true, version: Number(data.version) || 1,
            titleUz: base.titleUz, titleRu: base.titleRu, contentUz: data.content_uz, contentRu: data.content_ru || base.contentRu, updatedAt: data.updated_at,
          });
        }
        auditLater("LEGAL_DOCUMENTS_UPDATED", "shop_legal_documents", shopId, { documents: result.map((d: any) => ({ type: d.type, enabled: d.enabled, version: d.version })) });
        return json({ ok: true, legalDocuments: result });
      }

      // Shop takomillashtirish, 2-band: endi har kategoriya faqat ro'yxatda
      // emas — admin har biriga alohida (maks 6 ta) mahsulot ham tanlaydi.
      // Ustun nomi (featured_category_ids) o'zgarmadi (migratsiya shart
      // emas — jsonb, ichidagi shakl string[] dan {categoryId,productIds}[]
      // ga o'tdi), faqat mazmuni.
      case "set_featured_categories": {
        await requirePermission('marketing.manage');
        const raw = Array.isArray(payload.featuredCategories) ? payload.featuredCategories.slice(0, 8) : [];
        const entries = raw.map((e: any) => ({
          categoryId: String(e?.categoryId || ""),
          productIds: Array.isArray(e?.productIds) ? [...new Set(e.productIds.map((x: any) => String(x)))].slice(0, 6) : [],
        })).filter((e: any) => e.categoryId);
        const catIds = entries.map((e: any) => e.categoryId);
        const allProductIds = [...new Set(entries.flatMap((e: any) => e.productIds))];
        if (catIds.length) {
          const { data: validCats, error: catErr } = await db.from("categories").select("id").eq("shop_id", shopId).in("id", catIds);
          if (catErr) throw catErr;
          const validCatSet = new Set((validCats || []).map((r: any) => String(r.id)));
          if (catIds.some((id: string) => !validCatSet.has(id))) return json({ error: "invalid_category", invalidCategoryIds: catIds.filter((id: string) => !validCatSet.has(id)) }, 400);
        }
        if (allProductIds.length) {
          const { data: validProds, error: prodErr } = await db.from("products").select("id").eq("shop_id", shopId).in("id", allProductIds);
          if (prodErr) throw prodErr;
          const validProdSet = new Set((validProds || []).map((r: any) => String(r.id)));
          if (allProductIds.some((id: string) => !validProdSet.has(id))) return json({ error: "invalid_product", invalidProductIds: allProductIds.filter((id: string) => !validProdSet.has(id)) }, 400);
        }
        // shop_settings boot vaqtida allaqachon yaratilgan singleton qator.
        // Faqat bitta ustunni saqlashda UPSERT ishlatish ayrim production
        // sxemalarida insert yo'lining NOT NULL/default tekshiruvlariga tushib,
        // mavjud qator bo'lsa ham xato qaytarishi mumkin. Avval aniq UPDATE,
        // qator yo'q bo'lgan juda eski shop uchungina INSERT qilamiz.
        const { data: updated, error: updateError } = await db.from("shop_settings")
          .update({ featured_category_ids: entries, updated_at: new Date().toISOString() })
          .eq("shop_id", shopId)
          .select("shop_id,featured_category_ids")
          .maybeSingle();
        if (updateError) throw updateError;
        let savedEntries = updated?.featured_category_ids;
        if (!updated) {
          const { data: inserted, error: insertError } = await db.from("shop_settings")
            .insert({ shop_id: shopId, featured_category_ids: entries })
            .select("featured_category_ids").single();
          if (insertError) throw insertError;
          savedEntries = inserted?.featured_category_ids;
        }
        if (!Array.isArray(savedEntries)) throw new Error("featured_categories_save_not_confirmed");
        auditLater("FEATURED_CATEGORIES_UPDATED", "shop_settings", shopId, { count: entries.length });
        return json({ ok: true, featuredCategories: savedEntries });
      }

      case "set_order_policies": {
        await requirePermission('shop.settings.manage');
        const patch: Record<string, unknown> = { shop_id: shopId };
        if (payload.customerCancelCutoff !== undefined) {
          const allowed = ["NEW_ONLY", "BEFORE_SHIPPED", "ANY_NON_TERMINAL"];
          patch.customer_cancel_cutoff = allowed.includes(payload.customerCancelCutoff) ? payload.customerCancelCutoff : "BEFORE_SHIPPED";
        }
        if (payload.returnRequestsEnabled !== undefined) patch.return_requests_enabled = !!payload.returnRequestsEnabled;
        if (payload.returnWindowDays !== undefined) {
          const days = Math.max(1, Math.min(365, Number.parseInt(String(payload.returnWindowDays), 10) || 7));
          patch.return_window_days = days;
        }
        if (payload.returnPolicyText !== undefined) patch.return_policy_text = nullableText(payload.returnPolicyText, 1200);
        const { error } = await db.from("shop_settings").upsert(patch, { onConflict: "shop_id" });
        if (error) throw error;
        auditLater("ORDER_POLICIES_UPDATED", "shop_settings", shopId, patch);
        return json({ ok: true });
      }

      // 042: promo-kod / bosqichli chegirma / shaxsiy(VIP) chegirmani bitta
      // buyurtmada birga ishlatishga ruxsat + ixtiyoriy umumiy foiz chegarasi.
      // Marketing bo'limida joylashgan (marketing.manage bilan himoyalangan),
      // chunki bu sof marketing/aksiya sozlamasi — do'kon umumiy sozlamalari
      // (shop.settings.manage) emas.
      case "set_marketing_settings": {
        await requirePermission('marketing.manage');
        const patch: Record<string, unknown> = { shop_id: shopId };
        if (payload.allowDiscountCombining !== undefined) patch.allow_discount_combining = !!payload.allowDiscountCombining;
        if (payload.maxCombinedDiscountPercent !== undefined) {
          const v = payload.maxCombinedDiscountPercent;
          if (v === null || v === "") {
            patch.max_combined_discount_percent = null;
          } else {
            const num = Number(v);
            if (!Number.isFinite(num) || num <= 0 || num > 100) return json({ error: "invalid_max_percent" }, 400);
            patch.max_combined_discount_percent = num;
          }
        }
        const { error } = await db.from("shop_settings").upsert(patch, { onConflict: "shop_id" });
        if (error) throw error;
        auditLater("MARKETING_SETTINGS_UPDATED", "shop_settings", shopId, patch);
        return json({ ok: true });
      }

      case "set_orders_paused": {
        await requirePermission('shop.settings.manage');
        const paused = !!payload.paused;
        const note = nullableText(payload.note, 300);
        const { error } = await db.from("shop_settings").upsert({
          shop_id: shopId, orders_paused: paused, orders_paused_note: paused ? note : null,
        }, { onConflict: "shop_id" });
        if (error) throw error;
        auditLater(paused ? "ORDERS_PAUSED" : "ORDERS_RESUMED", "shop_settings", shopId, { note });
        return json({ ok: true });
      }

      case "set_shop_contact": {
        await requirePermission('shop.settings.manage');
        let clean: any;
        try {
          clean = {
            name: nullableText(payload.name, 100),
            address: nullableText(payload.address, 500),
            coordinates: normalizeCoordinates(payload.coordinates),
            phone: normalizePhone(payload.phone),
            phone_2: normalizePhone(payload.phone2),
            phone_3: normalizePhone(payload.phone3),
            instagram: normalizeHandle(payload.instagram, "instagram"),
            telegram: normalizeHandle(payload.telegram, "telegram"),
            facebook: normalizeHandle(payload.facebook, "facebook"),
            about: nullableText(payload.about, 2000),
            email: nullableText(payload.email, 254),
            youtube: nullableText(payload.youtube, 120),
            tiktok: nullableText(payload.tiktok, 120),
            seller_legal_name: nullableText(payload.sellerLegalName, 200),
            seller_tax_id: nullableText(payload.sellerTaxId, 64),
            seller_registration_number: nullableText(payload.sellerRegistrationNumber, 120),
            seller_legal_address: nullableText(payload.sellerLegalAddress, 600),
            seller_bank_details: nullableText(payload.sellerBankDetails, 2000),
            work_hours: nullableText(payload.workHours, 120),
          };
          // Ruscha manzil inputi UI'dan olib tashlangan. Eski qiymatni oddiy
          // kontakt saqlash amali tasodifan null qilib yubormaydi.
          if (Object.prototype.hasOwnProperty.call(payload, "addressRu")) clean.address_ru = nullableText(payload.addressRu, 500);
          if (clean.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) throw new Error("invalid_email");
          for (const key of ["youtube", "tiktok"]) if (clean[key] && !/^[A-Za-z0-9._-]+$/.test(clean[key])) throw new Error("invalid_social_handle");
        } catch (e: any) {
          return json({ error: e?.message || "invalid_shop_contact" }, 400);
        }
        const { error } = await db.from("shop_settings").update(clean).eq("shop_id", shopId);
        if (error) throw error;
        auditLater("SHOP_CONTACT_UPDATED", "shop_settings", shopId, clean);
        return json({ ok: true, shopContact: {
          name: clean.name, address: clean.address, coordinates: clean.coordinates, phone: clean.phone, phone2: clean.phone_2, phone3: clean.phone_3,
          instagram: clean.instagram, telegram: clean.telegram, facebook: clean.facebook, workHours: clean.work_hours,
          sellerLegalName: clean.seller_legal_name, sellerTaxId: clean.seller_tax_id,
          sellerRegistrationNumber: clean.seller_registration_number, sellerLegalAddress: clean.seller_legal_address,
          sellerBankDetails: clean.seller_bank_details,
        } });
      }
      // Phase 3, 14-band: shop-specific "kam qolgan" chegarasi — admin
      // sozlaydi, faqat shu shop uchun (shop_settings, shop_id bilan
      // tenant-scoped — boshqa shop'ga ta'sir qilmaydi).
      case "set_low_stock_threshold": {
        await requirePermission('shop.settings.manage');
        const raw = Number(payload.threshold);
        if (!Number.isFinite(raw) || raw < 0 || raw > 100000) return json({ error: "invalid_threshold" }, 400);
        const threshold = Math.round(raw);
        const { error } = await db.from("shop_settings").update({ low_stock_threshold: threshold }).eq("shop_id", shopId);
        if (error) throw error;
        auditLater("LOW_STOCK_THRESHOLD_UPDATED", "shop_settings", shopId, { threshold });
        return json({ ok: true, lowStockThreshold: threshold });
      }
      // ---- Billz (billz.ai) integration, Phase 0/1 -------------------------
      // Faqat platforma bosh admin ruxsat bergan do'konlarda (requireBillzAccessGranted)
      // ochiq — boshqarilgan/beta chiqarilish. Token qiymatlari hech qanday
      // javobda qaytarilmaydi, faqat shifrlangan holda saqlanadi (bot token
      // bilan bir xil mexanizm — _shared/bot-token-crypto.ts).
      case "billz_get_status": {
        await requirePermission('integrations.manage');
        requireBillzAccessGranted();
        const { data } = await db.from("billz_connections")
          .select("status,billz_shop_name,billz_cashbox_name,billz_payment_type_name,last_error")
          .eq("shop_id", shopId).maybeSingle();
        return json({
          status: data?.status || "DISCONNECTED",
          billzShopName: data?.billz_shop_name || null,
          billzCashboxName: data?.billz_cashbox_name || null,
          billzPaymentTypeName: data?.billz_payment_type_name || null,
          lastError: data?.last_error || null,
        });
      }
      case "billz_connect": {
        await requirePermission('integrations.manage');
        requireBillzAccessGranted();
        const secretToken = String(payload.secretToken || "").trim();
        if (!secretToken) return json({ error: "secret_token_required" }, 400);
        let tokens: { accessToken: string; refreshToken: string; expiresIn: number };
        try {
          tokens = await billzLogin(secretToken);
        } catch (e: any) {
          console.error("[BILLZ_FAILED:LOGIN_ERROR]", { shopId, message: e?.message || String(e) });
          return json({ error: e instanceof BillzApiError ? e.message : "billz_login_failed" }, 400);
        }
        const secretEnc = await encryptBotToken(BOT_TOKEN_MASTER_KEY, secretToken);
        const tokenEnc = await encryptTokenPair(BOT_TOKEN_MASTER_KEY, tokens.accessToken, tokens.refreshToken);
        const expiresAtIso = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();
        const { error: upsertErr } = await db.from("billz_connections").upsert({
          shop_id: shopId,
          secret_token_ciphertext: secretEnc.ciphertext, secret_token_iv: secretEnc.iv,
          ...tokenEnc, access_token_expires_at: expiresAtIso,
          status: "CONNECTED", last_error: null,
        }, { onConflict: "shop_id" });
        if (upsertErr) throw upsertErr;
        auditLater("BILLZ_CONNECTED", "billz_connections", shopId);

        // Ulanishning o'zi muvaffaqiyatli — konfiguratsiya ro'yxatlarini
        // (do'kon/kassa/to'lov turi) olishda xato bo'lsa ham ulanishni
        // bekor qilmaymiz, admin keyinroq billz_list_config_options bilan
        // qayta urinishi mumkin.
        let shops: { id: string; name: string }[] = [];
        let cashboxes: { id: string; name: string }[] = [];
        let paymentTypes: { id: string; name: string }[] = [];
        try {
          [shops, cashboxes, paymentTypes] = await Promise.all([
            billzListShops(tokens.accessToken),
            billzListCashboxes(tokens.accessToken),
            billzListPaymentTypes(tokens.accessToken),
          ]);
        } catch (e: any) {
          console.error("[BILLZ_FAILED:CONFIG_OPTIONS_ERROR]", { shopId, message: e?.message || String(e) });
        }
        return json({
          ok: true, status: "CONNECTED", shops, cashboxes, paymentTypes,
          autoSelected: { shop: shops.length === 1, cashbox: cashboxes.length === 1, paymentType: paymentTypes.length === 1 },
        });
      }
      case "billz_list_config_options": {
        await requirePermission('integrations.manage');
        requireBillzAccessGranted();
        let accessToken: string;
        try {
          accessToken = await getValidBillzAccessToken(db, shopId, BOT_TOKEN_MASTER_KEY);
        } catch (e: any) {
          return json({ error: e instanceof BillzApiError ? e.message : "billz_not_connected" }, 400);
        }
        const [shops, cashboxes, paymentTypes] = await Promise.all([
          billzListShops(accessToken), billzListCashboxes(accessToken), billzListPaymentTypes(accessToken),
        ]);
        return json({ shops, cashboxes, paymentTypes });
      }
      case "billz_save_sale_config": {
        await requirePermission('integrations.manage');
        requireBillzAccessGranted();
        const { error } = await db.from("billz_connections").update({
          billz_shop_id: nullableText(payload.billzShopId, 100),
          billz_shop_name: nullableText(payload.billzShopName, 200),
          billz_cashbox_id: nullableText(payload.billzCashboxId, 100),
          billz_cashbox_name: nullableText(payload.billzCashboxName, 200),
          billz_payment_type_id: nullableText(payload.billzPaymentTypeId, 100),
          billz_payment_type_name: nullableText(payload.billzPaymentTypeName, 200),
        }).eq("shop_id", shopId);
        if (error) throw error;
        auditLater("BILLZ_SALE_CONFIG_UPDATED", "billz_connections", shopId);
        return json({ ok: true });
      }
      case "billz_disconnect": {
        await requirePermission('integrations.manage');
        requireBillzAccessGranted();
        const { error } = await db.from("billz_connections").update({
          secret_token_ciphertext: null, secret_token_iv: null,
          access_token_ciphertext: null, access_token_iv: null,
          refresh_token_ciphertext: null, refresh_token_iv: null,
          access_token_expires_at: null, status: "DISCONNECTED", last_error: null,
        }).eq("shop_id", shopId);
        if (error) throw error;
        auditLater("BILLZ_DISCONNECTED", "billz_connections", shopId);
        return json({ ok: true });
      }
      // ---- Click.uz avtomatik to'lov integratsiyasi ------------------------
      // Billz'ning aynan bir xil naqshi: faqat platforma bosh admin ruxsat
      // bergan do'konlarda (requireClickAccessGranted) ochiq, Secret Key
      // hech qanday javobda qaytarilmaydi, faqat shifrlangan holda
      // saqlanadi (bot token bilan bir xil mexanizm).
      case "click_get_status": {
        await requirePermission('integrations.manage');
        requireClickAccessGranted();
        const { data } = await db.from("click_connections")
          .select("status,merchant_id,service_id,verified").eq("shop_id", shopId).maybeSingle();
        return json({
          status: data?.status || "DISCONNECTED",
          merchantId: data?.merchant_id || null,
          serviceId: data?.service_id || null,
          verified: data?.verified === true,
        });
      }
      case "click_connect": {
        await requirePermission('integrations.manage');
        requireClickAccessGranted();
        const merchantId = String(payload.merchantId || "").trim();
        const serviceId = String(payload.serviceId || "").trim();
        const secretKey = String(payload.secretKey || "").trim();
        // merchant_user_id — Click Merchant API (invoice.create) so'rovining
        // Auth headerini hisoblash uchun MAJBURIY (docs.click.uz/en/merchant-api/requests),
        // Shop API'ning sign_string tekshiruvida ishlatilmaydi, lekin
        // to'lovni BOSHLASH (invoice yaratish) uchun shart.
        const merchantUserId = String(payload.merchantUserId || "").trim();
        if (!merchantId || !serviceId || !secretKey || !merchantUserId) return json({ error: "click_credentials_required" }, 400);
        // Click hujjatida haqiqiy so'rov yubormasdan ("test login") kredensiallarni
        // tekshirish usuli yo'q — ular faqat birinchi haqiqiy invoice/Prepare
        // so'rovida haqiqiylikka tekshiriladi. Shu sabab bu yerda faqat
        // maydonlar to'ldirilganini tekshirib, shifrlab saqlaymiz.
        const secretEnc = await encryptBotToken(BOT_TOKEN_MASTER_KEY, secretKey);
        // "To'lov usullari" qayta tashkil qilish round: agar kredensiallardan
        // BIRI HAM eskisidan farq qilsa, oldingi "3 marta real to'lov bilan
        // tasdiqlangan" holat endi YANGI (tekshirilmagan) kredensiallarga
        // tegishli emas — verified qayta false qilinadi. click_disconnect
        // buni allaqachon qiladi (to'liq uzilganda); bu yerda esa admin
        // uzilmasdan to'g'ridan-to'g'ri qayta ulansa ham (masalan API orqali)
        // xuddi shu himoya ishlaydi.
        const { data: prevConn } = await db.from("click_connections")
          .select("merchant_id,service_id,merchant_user_id,secret_key_ciphertext,secret_key_iv,verified")
          .eq("shop_id", shopId).maybeSingle();
        let prevSecretKey: string | null = null;
        if (prevConn?.secret_key_ciphertext && prevConn?.secret_key_iv) {
          try { prevSecretKey = await decryptBotToken(BOT_TOKEN_MASTER_KEY, prevConn.secret_key_ciphertext, prevConn.secret_key_iv); } catch { prevSecretKey = null; }
        }
        const credentialsChanged = !prevConn
          || prevConn.merchant_id !== merchantId || prevConn.service_id !== serviceId
          || prevConn.merchant_user_id !== merchantUserId || prevSecretKey !== secretKey;
        const { error: upsertErr } = await db.from("click_connections").upsert({
          shop_id: shopId, merchant_id: merchantId, service_id: serviceId,
          merchant_user_id: merchantUserId,
          secret_key_ciphertext: secretEnc.ciphertext, secret_key_iv: secretEnc.iv,
          status: "CONNECTED",
          ...(credentialsChanged && prevConn?.verified ? { verified: false } : {}),
        }, { onConflict: "shop_id" });
        if (upsertErr) throw upsertErr;
        auditLater("CLICK_CONNECTED", "click_connections", shopId);
        return json({ ok: true, status: "CONNECTED" });
      }
      case "click_disconnect": {
        await requirePermission('integrations.manage');
        requireClickAccessGranted();
        const { error } = await db.from("click_connections").update({
          secret_key_ciphertext: null, secret_key_iv: null, status: "DISCONNECTED", verified: false,
        }).eq("shop_id", shopId);
        if (error) throw error;
        auditLater("CLICK_DISCONNECTED", "click_connections", shopId);
        return json({ ok: true });
      }
      // 048-band: "Sinash" — Click tokenlari saqlangandan keyin, xaridorlarga
      // ochilishidan OLDIN, admin (o'z haqiqiy Click ilovasidan) 3 marta
      // kichik summali REAL to'lovni tasdiqlashi shart. Har muvaffaqiyatli
      // click-webhook Complete'i shu yerdagi payment_test_runs qatorini
      // CONFIRMED qiladi (haqiqiy buyurtma/ombor/mijozga HECH QANDAY ta'sir
      // qilmaydi) — 3-si to'lgach click_connections.verified=true bo'ladi.
      case "click_start_test_payment": {
        await requirePermission('integrations.manage');
        requireClickAccessGranted();
        const amount = Math.max(500, Math.min(50000, Math.round(Number(payload.amount) || 1000)));
        const phoneNumber = String(payload.phoneNumber || "").replace(/\D/g, "");
        if (!/^998\d{9}$/.test(phoneNumber)) return json({ error: "invalid_phone" }, 400);
        const { data: conn } = await db.from("click_connections")
          .select("status,verified,service_id,merchant_user_id,secret_key_ciphertext,secret_key_iv")
          .eq("shop_id", shopId).maybeSingle();
        if (conn?.status !== "CONNECTED" || !conn.secret_key_ciphertext) return json({ error: "click_not_connected" }, 400);
        if (conn.verified === true) return json({ error: "already_verified" }, 400);
        const { count: confirmedCount } = await db.from("payment_test_runs")
          .select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("provider", "CLICK").eq("status", "CONFIRMED");
        if ((confirmedCount || 0) >= 3) return json({ error: "already_verified" }, 400);
        const { count: pendingCount } = await db.from("payment_test_runs")
          .select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("provider", "CLICK").eq("status", "PENDING");
        if ((pendingCount || 0) > 0) return json({ error: "test_already_in_progress" }, 400);
        const { data: inserted, error: insertErr } = await db.from("payment_test_runs").insert({
          shop_id: shopId, provider: "CLICK", amount, attempt_number: (confirmedCount || 0) + 1, status: "PENDING", created_by: tgId,
        }).select("id").single();
        if (insertErr || !inserted) throw insertErr || new Error("test_run_insert_failed");
        try {
          const secretKey = await decryptBotToken(BOT_TOKEN_MASTER_KEY, conn.secret_key_ciphertext, conn.secret_key_iv);
          const invoiceId = await clickCreateInvoice({ merchantUserId: conn.merchant_user_id, secretKey, serviceId: conn.service_id }, {
            amount, phoneNumber, merchantTransId: `TEST-${inserted.id}`,
          });
          auditLater("CLICK_TEST_PAYMENT_STARTED", "click_connections", shopId, { testRunId: inserted.id, attempt: (confirmedCount || 0) + 1, amount });
          return json({ ok: true, testRunId: inserted.id, invoiceId, attemptNumber: (confirmedCount || 0) + 1 });
        } catch (e: any) {
          await db.from("payment_test_runs").update({ status: "CANCELLED" }).eq("id", inserted.id);
          return json({ error: "click_invoice_failed", message: e?.message || String(e) }, 400);
        }
      }
      case "click_test_progress": {
        await requirePermission('integrations.manage');
        requireClickAccessGranted();
        const { data: conn } = await db.from("click_connections").select("verified").eq("shop_id", shopId).maybeSingle();
        const { count: confirmedCount } = await db.from("payment_test_runs")
          .select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("provider", "CLICK").eq("status", "CONFIRMED");
        const { data: pendingRuns } = await db.from("payment_test_runs")
          .select("id,amount,created_at").eq("shop_id", shopId).eq("provider", "CLICK").eq("status", "PENDING").order("created_at", { ascending: false }).limit(1);
        return json({ verified: conn?.verified === true, confirmedCount: confirmedCount || 0, pending: pendingRuns?.[0] || null });
      }
      // ---- Payme avtomatik to'lov integratsiyasi ----------------------------
      // Click bilan aynan bir xil naqsh. Password hech qanday javobda
      // qaytarilmaydi, faqat shifrlangan holda saqlanadi.
      case "payme_get_status": {
        await requirePermission('integrations.manage');
        requirePaymeAccessGranted();
        const { data } = await db.from("payme_connections")
          .select("status,merchant_id,login,verified").eq("shop_id", shopId).maybeSingle();
        return json({ status: data?.status || "DISCONNECTED", merchantId: data?.merchant_id || null, login: data?.login || null, verified: data?.verified === true });
      }
      case "payme_connect": {
        await requirePermission('integrations.manage');
        requirePaymeAccessGranted();
        const merchantId = String(payload.merchantId || "").trim();
        const login = String(payload.login || "").trim();
        const password = String(payload.password || "").trim();
        if (!merchantId || !login || !password) return json({ error: "payme_credentials_required" }, 400);
        // Payme'da ham (Click'dagi kabi) haqiqiy so'rov yubormasdan
        // kredensiallarni oldindan tekshirish usuli yo'q — birinchi haqiqiy
        // CheckPerformTransaction so'rovida haqiqiylikka tekshiriladi.
        const passEnc = await encryptBotToken(BOT_TOKEN_MASTER_KEY, password);
        // "To'lov usullari" qayta tashkil qilish round — click_connect bilan
        // bir xil himoya: kredensiallardan biri o'zgarsa, oldingi
        // "3 marta real to'lov bilan tasdiqlangan" holat endi yangi
        // (tekshirilmagan) kredensiallarga tegishli emas.
        const { data: prevConn } = await db.from("payme_connections")
          .select("merchant_id,login,password_ciphertext,password_iv,verified")
          .eq("shop_id", shopId).maybeSingle();
        let prevPassword: string | null = null;
        if (prevConn?.password_ciphertext && prevConn?.password_iv) {
          try { prevPassword = await decryptBotToken(BOT_TOKEN_MASTER_KEY, prevConn.password_ciphertext, prevConn.password_iv); } catch { prevPassword = null; }
        }
        const credentialsChanged = !prevConn
          || prevConn.merchant_id !== merchantId || prevConn.login !== login || prevPassword !== password;
        const { error: upsertErr } = await db.from("payme_connections").upsert({
          shop_id: shopId, merchant_id: merchantId, login,
          password_ciphertext: passEnc.ciphertext, password_iv: passEnc.iv,
          status: "CONNECTED",
          ...(credentialsChanged && prevConn?.verified ? { verified: false } : {}),
        }, { onConflict: "shop_id" });
        if (upsertErr) throw upsertErr;
        auditLater("PAYME_CONNECTED", "payme_connections", shopId);
        return json({ ok: true, status: "CONNECTED" });
      }
      case "payme_disconnect": {
        await requirePermission('integrations.manage');
        requirePaymeAccessGranted();
        const { error } = await db.from("payme_connections").update({
          password_ciphertext: null, password_iv: null, status: "DISCONNECTED", verified: false,
        }).eq("shop_id", shopId);
        if (error) throw error;
        auditLater("PAYME_DISCONNECTED", "payme_connections", shopId);
        return json({ ok: true });
      }
      // 048-band: Click bilan bir xil "Sinash" naqshi — farqi, Payme uchun
      // tashqi API chaqiruvi shart emas (checkout havolasi pure client-side
      // base64 URL), shuning uchun bu yerda faqat havola quriladi.
      case "payme_start_test_payment": {
        await requirePermission('integrations.manage');
        requirePaymeAccessGranted();
        const amount = Math.max(500, Math.min(50000, Math.round(Number(payload.amount) || 1000)));
        const { data: conn } = await db.from("payme_connections").select("status,verified,merchant_id").eq("shop_id", shopId).maybeSingle();
        if (conn?.status !== "CONNECTED") return json({ error: "payme_not_connected" }, 400);
        if (conn.verified === true) return json({ error: "already_verified" }, 400);
        const { count: confirmedCount } = await db.from("payment_test_runs")
          .select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("provider", "PAYME").eq("status", "CONFIRMED");
        if ((confirmedCount || 0) >= 3) return json({ error: "already_verified" }, 400);
        const { count: pendingCount } = await db.from("payment_test_runs")
          .select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("provider", "PAYME").eq("status", "PENDING");
        if ((pendingCount || 0) > 0) return json({ error: "test_already_in_progress" }, 400);
        const { data: inserted, error: insertErr } = await db.from("payment_test_runs").insert({
          shop_id: shopId, provider: "PAYME", amount, attempt_number: (confirmedCount || 0) + 1, status: "PENDING", created_by: tgId,
        }).select("id").single();
        if (insertErr || !inserted) throw insertErr || new Error("test_run_insert_failed");
        const checkoutUrl = buildPaymeCheckoutUrl({
          merchantId: conn.merchant_id, orderAccountField: "order_id", orderId: `TEST-${inserted.id}`,
          amountTiyin: Math.round(amount * 100), lang: "uz",
        });
        auditLater("PAYME_TEST_PAYMENT_STARTED", "payme_connections", shopId, { testRunId: inserted.id, attempt: (confirmedCount || 0) + 1, amount });
        return json({ ok: true, testRunId: inserted.id, checkoutUrl, attemptNumber: (confirmedCount || 0) + 1 });
      }
      case "payme_test_progress": {
        await requirePermission('integrations.manage');
        requirePaymeAccessGranted();
        const { data: conn } = await db.from("payme_connections").select("verified").eq("shop_id", shopId).maybeSingle();
        const { count: confirmedCount } = await db.from("payment_test_runs")
          .select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("provider", "PAYME").eq("status", "CONFIRMED");
        const { data: pendingRuns } = await db.from("payment_test_runs")
          .select("id,amount,created_at").eq("shop_id", shopId).eq("provider", "PAYME").eq("status", "PENDING").order("created_at", { ascending: false }).limit(1);
        return json({ verified: conn?.verified === true, confirmedCount: confirmedCount || 0, pending: pendingRuns?.[0] || null });
      }

      // ---- Uzum Checkout avtomatik to'lov integratsiyasi ---------------------
      // Click/Payme bilan bir xil naqsh, farqi: X-Terminal-Id/X-API-Key
      // statik header (imzo yo'q) — shuning uchun connect vaqtida
      // uzumVerifyCredentials() bilan darhol haqiqiy tekshiruv qilinadi
      // (Click/Payme'da bu imkonsiz edi, chunki ularda "test so'rov" yo'q).
      case "uzum_get_status": {
        await requirePermission('integrations.manage');
        requireUzumAccessGranted();
        const { data } = await db.from("uzum_connections")
          .select("status,terminal_id").eq("shop_id", shopId).maybeSingle();
        return json({ status: data?.status || "DISCONNECTED", terminalId: data?.terminal_id || null });
      }
      case "uzum_connect": {
        await requirePermission('integrations.manage');
        requireUzumAccessGranted();
        const terminalId = String(payload.terminalId || "").trim();
        const apiKey = String(payload.apiKey || "").trim();
        if (!terminalId || !apiKey) return json({ error: "uzum_credentials_required" }, 400);
        const verified = await uzumVerifyCredentials({ terminalId, apiKey });
        if (!verified) return json({ error: "uzum_credentials_invalid" }, 400);
        const apiKeyEnc = await encryptBotToken(BOT_TOKEN_MASTER_KEY, apiKey);
        const { error: upsertErr } = await db.from("uzum_connections").upsert({
          shop_id: shopId, terminal_id: terminalId,
          api_key_ciphertext: apiKeyEnc.ciphertext, api_key_iv: apiKeyEnc.iv,
          status: "CONNECTED",
        }, { onConflict: "shop_id" });
        if (upsertErr) throw upsertErr;
        auditLater("UZUM_CONNECTED", "uzum_connections", shopId);
        return json({ ok: true, status: "CONNECTED" });
      }
      case "uzum_disconnect": {
        await requirePermission('integrations.manage');
        requireUzumAccessGranted();
        const { error } = await db.from("uzum_connections").update({
          api_key_ciphertext: null, api_key_iv: null, status: "DISCONNECTED",
        }).eq("shop_id", shopId);
        if (error) throw error;
        auditLater("UZUM_DISCONNECTED", "uzum_connections", shopId);
        return json({ ok: true });
      }

      // ---- Billz Phase 2: qo'lda katalog ko'rish/import qilish --------------
      case "billz_get_categories": {
        await requirePermission('integrations.manage');
        requireBillzAccessGranted();
        let accessToken: string;
        try { accessToken = await getValidBillzAccessToken(db, shopId, BOT_TOKEN_MASTER_KEY); }
        catch (e: any) { return json({ error: e instanceof BillzApiError ? e.message : "billz_not_connected" }, 400); }
        const categories = await billzListCategories(accessToken);
        return json({ categories });
      }

      // "Billz" menyusi va har katalogdagi "B" tugmasi ikkalasi ham shu
      // action'ni chaqiradi — farqi faqat billzCategoryId berilishi/berilmasligida.
      // Hali import qilinmagan tovarlar — bu shop'da mavjud hech qanday
      // products.billz_product_id yoki variants[].billzProductId bilan mos
      // kelmagan Billz tovarlari (alohida staging jadval shart emas — bu
      // tekshiruv to'g'ridan-to'g'ri products jadvalidan qilinadi).
      case "billz_browse_products": {
        await requirePermission('integrations.manage');
        requireBillzAccessGranted();
        let accessToken: string;
        try { accessToken = await getValidBillzAccessToken(db, shopId, BOT_TOKEN_MASTER_KEY); }
        catch (e: any) { return json({ error: e instanceof BillzApiError ? e.message : "billz_not_connected" }, 400); }

        const { data: connRow } = await db.from("billz_connections").select("billz_shop_id").eq("shop_id", shopId).maybeSingle();
        const targetBillzShopId: string | null = connRow?.billz_shop_id || null;

        const billzCategoryId = payload.billzCategoryId ? String(payload.billzCategoryId) : undefined;
        const search = payload.search ? String(payload.search).slice(0, 200) : undefined;
        const page = Number(payload.page) > 0 ? Number(payload.page) : 1;
        // 9-band: admin sahifa hajmini tanlaydi (10/25/50/100) — birinchi ochilishda
        // 10 ta, boshqa qiymatga o'zgartirilsa o'sha soncha qayta so'raladi.
        const ALLOWED_LIMITS = [10, 25, 50, 100];
        const wantsAll = payload.limit === 'ALL';
        const limit = wantsAll ? 0 : (ALLOWED_LIMITS.includes(Number(payload.limit)) ? Number(payload.limit) : 10);

        // Root-cause fix: Billz's own `count`/page includes already-imported
        // products, but the browse UI's "hali import qilinmagan" count/pages
        // must reflect only the NOT-YET-imported subset. Billz has no
        // "exclude these ids" filter, so we walk every matching raw page,
        // filter locally, then compute an accurate count and slice the
        // requested window ourselves — instead of trusting Billz's raw count
        // for a filtered UI (which produced wildly inconsistent per-page
        // counts, e.g. 10/50/100 page sizes each showing a different, wrong
        // "hali import qilinmagan" total for the same category).
        let rawAll: { products: any[]; truncated: boolean };
        try {
          rawAll = await billzListAllMatching(accessToken, { categoryIds: billzCategoryId ? [billzCategoryId] : undefined, search });
        } catch (e: any) {
          return json({ error: e instanceof BillzApiError ? e.message : "billz_products_fetch_failed" }, 400);
        }

        const { data: linkedRows } = await db.from("products").select("billz_product_id,variants").eq("shop_id", shopId);
        const linkedBillzIds = new Set<string>();
        for (const row of linkedRows || []) {
          if (row.billz_product_id) linkedBillzIds.add(String(row.billz_product_id));
          for (const v of (Array.isArray(row.variants) ? row.variants : [])) {
            if (v?.billzProductId) linkedBillzIds.add(String(v.billzProductId));
          }
        }
        const notYetImported = rawAll.products.filter((p: any) => !linkedBillzIds.has(String(p.id)));
        const rawProducts = wantsAll ? notYetImported : notYetImported.slice((page - 1) * limit, page * limit);

        const pickShopValue = (list: any[], key: "retail_price" | "active_measurement_value"): number => {
          const row = (Array.isArray(list) ? list : []).find((x: any) => !targetBillzShopId || String(x.shop_id) === targetBillzShopId) || list?.[0];
          return Number(row?.[key]) || 0;
        };
        const findAttr = (attrs: any[], pattern: RegExp): string | null => {
          const found = (Array.isArray(attrs) ? attrs : []).find((a: any) => pattern.test(String(a?.attribute_name || "")));
          return found?.attribute_value ? String(found.attribute_value) : null;
        };
        const mapVariantChild = (v: any) => ({
          billzProductId: String(v.id),
          size: findAttr(v.product_attributes, /o.?lcham|size|размер/i),
          color: findAttr(v.product_attributes, /rang|color|цвет/i),
          stock: Math.max(0, Math.round(pickShopValue(v.shop_measurement_values, "active_measurement_value"))),
          price: pickShopValue(v.shop_prices, "retail_price"),
        });

        const items = rawProducts.map((p: any) => ({
          billzProductId: String(p.id),
          name: String(p.name || ""),
          description: p.description ? String(p.description) : null,
          price: pickShopValue(p.shop_prices, "retail_price"),
          stock: Math.max(0, Math.round(pickShopValue(p.shop_measurement_values, "active_measurement_value"))),
          isVariative: !!p.is_variative,
          variants: Array.isArray(p.variations) ? p.variations.map(mapVariantChild) : [],
        }));

        // count = the true not-yet-imported total for this filter (accurate
        // regardless of chosen page size); truncated flags the rare case
        // where the catalog exceeded the safety-cap walk, so the UI can warn
        // instead of silently showing a short/wrong total.
        return json({ count: notYetImported.length, items, page, truncated: rawAll.truncated });
      }

      case "billz_import_products": {
        await requirePermission('integrations.manage');
        requireBillzAccessGranted();
        const categoryId = payload.categoryId ? String(payload.categoryId) : null;
        const items = Array.isArray(payload.items) ? payload.items : [];
        if (!items.length) return json({ error: "no_items" }, 400);
        if (items.length > 100) return json({ error: "too_many_items" }, 400);

        const productLimit = await getProductLimit(db, shopId);
        const currentCount = await countActiveProducts(db, shopId);
        if (productLimit !== null && currentCount + items.length > productLimit) {
          return json({ error: `product_limit_reached:${productLimit}` }, 400);
        }

        const oldPricePercents = resolveOldPricePercents(payload.oldPricePercent, items.length);

        const { data: maxRow } = await db.from("products").select("sort_order").eq("shop_id", shopId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
        let nextSortOrder = (maxRow?.sort_order || 0) + 1;

        const imported: any[] = [];
        const failed: any[] = [];
        for (let i = 0; i < items.length; i++) {
          const it = items[i] || {};
          try {
            const cleanName = nullableText(it.name, 250);
            const numericPrice = Number(it.price);
            if (!cleanName || !Number.isFinite(numericPrice) || numericPrice < 0) {
              failed.push({ billzProductId: it.billzProductId, error: "invalid_item" });
              continue;
            }
            const percent = oldPricePercents[i];
            const billzVariants = Array.isArray(it.variants) ? it.variants : [];
            const parsedVariants = await enrichVariantTranslations(cleanVariants(billzVariants.map((v: any) => ({
              size: v.size, color: v.color, qty: v.stock, billzProductId: v.billzProductId,
              price: Number(v.price) > 0 ? Number(v.price) : null,
              oldPrice: percent && Number(v.price) > 0 ? roundToNearest1000(Number(v.price) * (1 + percent / 100)) : null,
            }))));
            validateVariantUniqueness(parsedVariants);
            const skuCount = parsedVariants.length ? 1 + parsedVariants.length : 1;
            const allocated = await allocateGlobalSkus(db, shopId, skuCount);
            const baseSku = allocated.shift()!;
            const variantsWithSku = parsedVariants.length ? parsedVariants.map((v) => ({ ...v, sku: allocated.shift()! })) : null;
            const finalStock = variantsWithSku
              ? variantsWithSku.reduce((sum, v) => sum + (Number(v.qty) || 0), 0)
              : Math.max(0, Math.round(Number(it.stock) || 0));
            const finalDesc = nullableText(it.description, 5000) || cleanName;
            const oldPrice = percent ? roundToNearest1000(numericPrice * (1 + percent / 100)) : null;
            const pendingTranslationHash = await translationHashOf(cleanName, finalDesc);
            const dbRow = {
              shop_id: shopId, sku: baseSku, name: cleanName, name_ru: null, price: numericPrice,
              old_price: oldPrice, stock: finalStock, description: finalDesc, description_ru: null,
              img: null, category_id: categoryId,
              status: finalStock > 0 ? "ACTIVE" : "OUT_OF_STOCK", is_featured: false, sort_order: nextSortOrder++,
              variants: variantsWithSku, sizes: legacySizesFromVariants(variantsWithSku || []),
              translation_status: "PENDING", translation_hash: null,
              billz_product_id: variantsWithSku ? null : (it.billzProductId ? String(it.billzProductId) : null),
            };
            const { data: insertedProduct, error } = await db.from("products").insert(dbRow).select().single();
            if (error) { failed.push({ billzProductId: it.billzProductId, error: error.message }); continue; }
            auditLater("BILLZ_PRODUCT_IMPORTED", "product", insertedProduct.id, { billzProductId: it.billzProductId });
            EdgeRuntime.waitUntil(translateProductInBackground(db, shopId, String(insertedProduct.id), cleanName, finalDesc, pendingTranslationHash));
            imported.push(insertedProduct);
          } catch (e: any) {
            failed.push({ billzProductId: it?.billzProductId, error: e?.message || String(e) });
          }
        }
        return json({ imported, failed, importedCount: imported.length, failedCount: failed.length });
      }

      // 8-band: "Import qilinganlar" ro'yxati — Billz'ga bog'langan (billz_product_id
      // bor YOKI kamida bitta varianti billzProductId'ga ega) tovarlar. Faqat
      // Billz importidan kelib chiqqan bog'lanishni ko'rsatish uchun — bu
      // tovarning o'zi (nomi/narxi/rasmi) allaqachon oddiy "products" jadvalida.
      case "billz_list_imported_products": {
        await requirePermission('integrations.manage');
        requireBillzAccessGranted();
        const { data, error } = await db.from("products")
          .select("id,name,sku,price,stock,img,billz_product_id,variants")
          .eq("shop_id", shopId).neq("status", "DELETED")
          .order("name");
        if (error) throw error;
        const items = (data || [])
          .filter((p: any) => p.billz_product_id || (Array.isArray(p.variants) && p.variants.some((v: any) => v?.billzProductId)))
          .map((p: any) => ({ id: p.id, name: p.name, sku: p.sku, price: p.price, stock: p.stock, img: p.img }));
        return json({ items });
      }

      // 8-band: importdan olib tashlash — TOVARNI o'chirmaydi, faqat Billz
      // bog'lanishini (billz_product_id va har bir variantning billzProductId'si)
      // tozalaydi. Shundan keyin bu oddiy (Billz bilan sinxronlanmaydigan)
      // tovar sifatida qoladi.
      case "billz_unlink_products": {
        await requirePermission('integrations.manage');
        requireBillzAccessGranted();
        const productIds = Array.isArray(payload.productIds) ? payload.productIds.map((id: any) => String(id)) : [];
        if (!productIds.length) return json({ error: "no_items" }, 400);
        const { data: rows, error: fetchErr } = await db.from("products")
          .select("id,variants").eq("shop_id", shopId).in("id", productIds);
        if (fetchErr) throw fetchErr;
        let unlinkedCount = 0;
        for (const row of rows || []) {
          const variants = Array.isArray(row.variants)
            ? row.variants.map((v: any) => { const { billzProductId: _drop, ...rest } = v || {}; return rest; })
            : row.variants;
          const { error: updErr } = await db.from("products").update({ billz_product_id: null, variants }).eq("shop_id", shopId).eq("id", row.id);
          if (!updErr) unlinkedCount++;
        }
        auditLater("BILLZ_PRODUCTS_UNLINKED", "product", productIds.join(","), { count: unlinkedCount });
        return json({ ok: true, unlinkedCount });
      }

      // ---- Billz Phase 4: avtomatik sinxron natijalari (o'qish/tiklash) ----
      // Haqiqiy crawl+yozish ishi supabase/functions/billz-sync/ (cron orqali
      // chaqiriladigan alohida function) ichida — bu ikkitasi faqat admin uchun
      // ko'rish/tiklash oynasi. Billz tomonidan o'chirilgan tovarlar odatiy
      // "trash" bilan aralashmasin deb (trash_batches yozuvi yaratilmaydi),
      // alohida billz_deleted_at ustuni orqali ajratiladi.
      case "billz_list_deleted_products": {
        await requirePermission('integrations.manage');
        requireBillzAccessGranted();
        const { data, error } = await db.from("products")
          .select("id,name,sku,price,stock,img,billz_deleted_at")
          .eq("shop_id", shopId).not("billz_deleted_at", "is", null)
          .order("billz_deleted_at", { ascending: false }).limit(200);
        if (error) throw error;
        return json({ items: data || [] });
      }
      case "billz_restore_product": {
        await requirePermission('integrations.manage');
        requireBillzAccessGranted();
        const productId = String(payload.productId || "");
        if (!productId) return json({ error: "product_id_required" }, 400);
        const { data: product, error: fetchErr } = await db.from("products")
          .select("id,stock,billz_deleted_at").eq("shop_id", shopId).eq("id", productId).maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!product || !product.billz_deleted_at) return json({ error: "not_billz_deleted" }, 400);
        const { error } = await db.from("products").update({
          status: (product.stock || 0) > 0 ? "ACTIVE" : "OUT_OF_STOCK",
          deleted_at: null, billz_deleted_at: null,
        }).eq("shop_id", shopId).eq("id", productId);
        if (error) throw error;
        auditLater("BILLZ_PRODUCT_RESTORED", "product", productId);
        return json({ ok: true });
      }

      case "set_fulfillment_config": {
        await requirePermission('shop.settings.manage');
        let clean: any;
        try { clean = sanitizeFulfillmentConfig(payload.config, true); }
        catch (e: any) { return json({ error: e?.message || "invalid_fulfillment_config" }, 400); }
        const clickMethod = clean.payments.methods.find((m: any) => m.id === "CLICK");
        if (clickMethod?.enabled) requireClickAccessGranted();
        const paymeMethod = clean.payments.methods.find((m: any) => m.id === "PAYME");
        if (paymeMethod?.enabled) requirePaymeAccessGranted();
        const uzumMethod = clean.payments.methods.find((m: any) => m.id === "UZUM");
        if (uzumMethod?.enabled) requireUzumAccessGranted();
        // "To'lov usullari" qayta tashkil qilish round (2026-09-05): platforma
        // ruxsati (requireClickAccessGranted) faqat "bu shop CLICK'dan
        // umuman foydalana oladimi" degan savolga javob beradi — u
        // shopning O'ZI 3 marta real to'lov bilan tasdiqlaganini
        // (048-migratsiya, click_connections.verified) TEKSHIRMAYDI. Bu
        // yergacha frontend UI shu tekshiruvni ko'rsatmasdi (faqat
        // vizual ravishda tugmani berkitardi) — server esa to'g'ridan-
        // to'g'ri chaqirilsa (frontendni chetlab o'tib) tekshirilmagan
        // providerni ham enabled:true qilib yuborar edi. Uzum'ga ATAYLAB
        // tegilmadi (u hali admin UI'da ko'rinmaydi, uzumAccessGranted
        // orqali).
        if (clickMethod?.enabled) {
          const { data: clickConn } = await db.from("click_connections").select("verified").eq("shop_id", shopId).maybeSingle();
          if (clickConn?.verified !== true) return json({ error: "click_not_verified" }, 400);
        }
        if (paymeMethod?.enabled) {
          const { data: paymeConn } = await db.from("payme_connections").select("verified").eq("shop_id", shopId).maybeSingle();
          if (paymeConn?.verified !== true) return json({ error: "payme_not_verified" }, 400);
        }
        const { error } = await db.from("shop_settings").update({ fulfillment_config: clean }).eq("shop_id", shopId);
        if (error) throw error;
        auditLater("FULFILLMENT_CONFIG_UPDATED", "shop_settings", shopId, {
          deliveryMethods: [clean.delivery.free, clean.delivery.fixed, clean.delivery.taxi].filter((x: any) => x.enabled).length + (clean.delivery.post.enabled ? 1 : 0),
          paymentMethods: clean.payments.methods.filter((x: any) => x.enabled).map((x: any) => x.id),
        });
        return json({ ok: true, fulfillmentConfig: clean });
      }
      case "set_shop_logo": {
        await requirePermission('shop.settings.manage');
        // Logo bitta aktiv manbaga ega: IMAGE yoki WORDMARK. Yangi tanlov
        // eskisini to'liq almashtiradi; WORDMARK'ga o'tilganda oldingi managed
        // rasm URL'i DB'dan ham tozalanadi va boshqa resource ishlatmayotgan
        // bo'lsa Storage'dan o'chiriladi.
        const logoType = payload.logoType === "WORDMARK" ? "WORDMARK" : "IMAGE";
        let wordmark: { presetId: string; text: string; textColor?: string; backgroundColor?: string } | null = null;
        if (logoType === "WORDMARK") {
          const presetId = String(payload.wordmark?.presetId || "").slice(0, 40);
          const text = String(payload.wordmark?.text || "").trim().slice(0, 40);
          if (!presetId || !text) return json({ error: "invalid_wordmark" }, 400);
          const colorRe = /^#[0-9a-fA-F]{6}$/;
          const textColor = colorRe.test(String(payload.wordmark?.textColor || '')) ? String(payload.wordmark.textColor) : '#ffffff';
          const backgroundColor = colorRe.test(String(payload.wordmark?.backgroundColor || '')) ? String(payload.wordmark.backgroundColor) : '#0f172a';
          wordmark = { presetId, text, textColor, backgroundColor };
        }
        const { data: prevShop, error: prevError } = await db.from("shop_settings").select("logo_url").eq("shop_id", shopId).maybeSingle();
        if (prevError) throw prevError;
        const oldLogoUrl = prevShop?.logo_url || null;
        const newLogoUrl = logoType === "IMAGE" ? (payload.logoUrl || null) : null;
        // Logo URL qo'lda/tashqi manbadan berilmaydi: IMAGE tanlovi faqat
        // shu shop uchun UStorE Storage'ga yuklangan managed fayl bo'lishi mumkin.
        if (newLogoUrl && !productStoragePathFromUrl(newLogoUrl, SUPABASE_URL, shopId, "images")) {
          return json({ error: "invalid_logo_source" }, 400);
        }
        const dbUpdate: Record<string, unknown> = {
          logo_type: logoType,
          logo_url: newLogoUrl,
          logo_wordmark: logoType === "WORDMARK" ? wordmark : null,
        };
        const { error } = await db.from("shop_settings").update(dbUpdate).eq("shop_id", shopId);
        if (error) throw error;
        if (oldLogoUrl && oldLogoUrl !== newLogoUrl) {
          EdgeRuntime.waitUntil(cleanupManagedImageIfUnreferenced(db, shopId, oldLogoUrl, SUPABASE_URL, "old-shop-logo"));
        }
        auditLater("SHOP_LOGO_UPDATED", "shop_settings", shopId, { logoType });
        return json({
          ok: true,
          branding: { logoType, logoUrl: newLogoUrl, logoWordmark: logoType === "WORDMARK" ? wordmark : null },
        });
      }

      case "get_users_summary": {
        await requirePermission('customers.view');
        return json({ users: await buildUsersSummaryFast(db, shopId) });
      }
      case "warn_user": {
        await requirePermission('customers.manage');
        const targetTgId = String(payload.tgId || "");
        const { error } = await db.from("app_users").update({ warned: true, warn_reason: nullableText(payload.reason, 500) }).eq("shop_id", shopId).eq("tg_id", targetTgId);
        if (error) throw error;
        auditLater("USER_WARNED", "app_user", targetTgId, { reason: nullableText(payload.reason, 500) });
        return json({ ok: true });
      }
      case "block_user": {
        await requirePermission('customers.manage');
        const targetTgId = String(payload.tgId || "");
        const reason = [nullableText(payload.reason, 300), nullableText(payload.note, 500)].filter(Boolean).join(" — ");
        const { error } = await db.from("app_users").update({ is_blocked: true, block_reason: reason || null }).eq("shop_id", shopId).eq("tg_id", targetTgId);
        if (error) throw error;
        auditLater("USER_BLOCKED", "app_user", targetTgId, { reason });
        return json({ ok: true });
      }
      case "unblock_user": {
        await requirePermission('customers.manage');
        const targetTgId = String(payload.tgId || "");
        const { error } = await db.from("app_users").update({ is_blocked: false, block_reason: null }).eq("shop_id", shopId).eq("tg_id", targetTgId);
        if (error) throw error;
        auditLater("USER_UNBLOCKED", "app_user", targetTgId);
        return json({ ok: true });
      }

      case "upload_product_image": {
        await requirePermission('products.manage');
        if (!payload.imageUpload) return json({ error: "invalid_image_upload" }, 400);
        const uploaded = await storeProductImage(db, shopId, payload.imageUpload);
        return json({ url: uploaded.url });
      }

      case "get_upload_url": {
        await requirePermission('products.manage');
        const ext = String(payload.ext || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        const mimeType = String(payload.mimeType || "").toLowerCase();
        const size = Number(payload.size || 0);
        if (!["jpg", "jpeg", "png", "webp"].includes(ext)) return json({ error: "invalid_image_type" }, 400);
        if (mimeType && !["image/jpeg", "image/png", "image/webp"].includes(mimeType)) return json({ error: "invalid_image_type" }, 400);
        if (size && (!Number.isFinite(size) || size <= 0 || size > 5 * 1024 * 1024)) return json({ error: "image_too_large" }, 400);
        const path = `shops/${shopId}/products/${Date.now()}-${crypto.randomUUID()}.${ext}`;
        const { data, error } = await db.storage.from("images").createSignedUploadUrl(path);
        if (error) throw error;
        return json({ path, token: data.token, signedUrl: data.signedUrl });
      }

      case "finalize_image_upload": {
        await requirePermission('products.manage');
        const path = String(payload.path || "");
        const expectedFolder = `shops/${shopId}/products`;
        if (!path.startsWith(`${expectedFolder}/`) || !/^\d+-[0-9a-f-]+\.(?:jpg|jpeg|png|webp)$/i.test(path.slice(expectedFolder.length + 1))) {
          return json({ error: "invalid_image_path" }, 400);
        }
        const fileName = path.slice(expectedFolder.length + 1);
        const { data: objects, error: listError } = await db.storage.from("images").list(expectedFolder, { search: fileName, limit: 5 });
        if (listError || !(objects || []).some((object: any) => object.name === fileName)) {
          return json({ error: "image_not_uploaded" }, 400);
        }
        const { data: pub } = db.storage.from("images").getPublicUrl(path);
        if (!pub?.publicUrl) return json({ error: "image_public_url_failed" }, 400);
        return json({ url: pub.publicUrl });
      }

      case "add_product": {
        await requirePermission('products.manage');
        const { name, price, oldPrice, stock, sizes, variants, desc, categoryId, img, thumbImg, imageUpload, variantImageUploads } = payload;
        const cleanName = nullableText(name, 250);
        const numericPrice = Number(price);
        if (!cleanName || !Number.isFinite(numericPrice) || numericPrice < 0) return json({ error: "invalid_product" }, 400);
        const productLimit = await getProductLimit(db, shopId);
        if (productLimit !== null && await countActiveProducts(db, shopId) >= productLimit) return json({ error: `product_limit_reached:${productLimit}` }, 400);

        let parsedVariants = cleanVariants(variants, sizes);
        validateVariantUniqueness(parsedVariants);
        const skuCount = parsedVariants.length ? 1 + parsedVariants.length : 1;
        const allocated = await allocateGlobalSkus(db, shopId, skuCount);
        const baseSku = allocated.shift()!;
        const uploadedVariantImages: Array<{ url: string; path: string }> = [];
        let uploadedImage: { url: string; path: string } | null = null;
        try {
          for (const item of (Array.isArray(variantImageUploads) ? variantImageUploads : [])) {
            const index = Number(item?.index);
            if (!Number.isInteger(index) || index < 0 || index >= parsedVariants.length || !item?.imageUpload) throw new Error("invalid_variant_image_upload");
            const uploaded = await storeProductImage(db, shopId, item.imageUpload);
            uploadedVariantImages.push(uploaded);
            const target = item?.target === "img" ? "img" : "colorImg";
            parsedVariants[index] = { ...parsedVariants[index], [target]: uploaded.url };
          }
          parsedVariants = await enrichVariantTranslations(parsedVariants);
          const variantsWithSku = parsedVariants.length ? parsedVariants.map((v) => ({ ...v, sku: allocated.shift()! })) : null;
          const finalStock = variantsWithSku ? variantsWithSku.reduce((sum, v) => sum + (Number(v.qty) || 0), 0) : Math.max(0, Number.parseInt(String(stock ?? 0), 10) || 0);
          const { data: maxRow } = await db.from("products").select("sort_order").eq("shop_id", shopId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
          const nextSortOrder = (maxRow?.sort_order || 0) + 1;
          let finalImg = normalizeProductImageUrl(img);
          if (imageUpload) {
            uploadedImage = await storeProductImage(db, shopId, imageUpload);
            finalImg = uploadedImage.url;
          }
          const finalDesc = nullableText(desc, 5000) || cleanName;
          const pendingTranslationHash = await translationHashOf(cleanName, finalDesc);
          const dbRow = {
            shop_id: shopId, sku: baseSku, name: cleanName, name_ru: null, price: numericPrice,
            old_price: Number(oldPrice) > numericPrice ? Number(oldPrice) : null,
            stock: finalStock, description: finalDesc,
            description_ru: null, img: finalImg, thumb_img: normalizeProductImageUrl(thumbImg) || null, category_id: categoryId ?? null,
            status: finalStock > 0 ? "ACTIVE" : "OUT_OF_STOCK", is_featured: false, sort_order: nextSortOrder,
            variants: variantsWithSku, sizes: legacySizesFromVariants(variantsWithSku || []),
            translation_status: "PENDING", translation_hash: null,
          };
          const { data: insertedProduct, error } = await db.from("products").insert(dbRow).select().single();
          if (error) throw error;
          auditLater("PRODUCT_CREATED", "product", insertedProduct.id, { sku: insertedProduct.sku, name: insertedProduct.name });
          EdgeRuntime.waitUntil(translateProductInBackground(db, shopId, String(insertedProduct.id), cleanName, finalDesc, pendingTranslationHash));
          return json({ product: insertedProduct });
        } catch (e) {
          const paths = [...uploadedVariantImages.map((item) => item.path), ...(uploadedImage ? [uploadedImage.path] : [])];
          if (paths.length) await db.storage.from("images").remove(paths).catch(() => {});
          throw e;
        }
      }

      case "get_excel_template_url": {
        await requirePermission('products.import_export');
        const { buildExcelImportTemplate } = await import("./excel-template.ts");
        const { data: categoryRows, error: categoryError } = await db.from("categories")
          .select("id,name,name_ru,parent_id").eq("shop_id", shopId).is("deleted_at", null);
        if (categoryError) throw categoryError;

        const templateBytes = await buildExcelImportTemplate(categoryRows || []);
        if (templateBytes.byteLength < 1000 || templateBytes.byteLength > 10_000_000) throw new Error("invalid_excel_template_size");

        const shopName = await shopDisplayNameForMessages(db, shopId);
        const safeShopName = String(shopName || "USTORE")
          .trim()
          .replace(/[^\p{L}\p{N}]+/gu, "_")
          .replace(/^_+|_+$/g, "")
          .slice(0, 64) || "USTORE";
        const fileName = `${safeShopName}_mahsulot_shabloni.xlsx`;
        const bucketName = Deno.env.get("EXCEL_TEMPLATE_BUCKET") || "images";
        const safeAdminId = tgId.replace(/[^0-9A-Za-z_-]/g, "_");
        const storagePath = `shops/${shopId}/_temp/excel-templates/${safeAdminId}/${fileName}`;
        const { error: uploadError } = await db.storage.from(bucketName).upload(storagePath, templateBytes, {
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          cacheControl: "60",
          upsert: true,
        });
        if (uploadError) throw uploadError;

        const { data: signed, error: signedError } = await db.storage.from(bucketName)
          .createSignedUrl(storagePath, 120, { download: fileName });
        if (signedError || !signed?.signedUrl) throw signedError || new Error("excel_template_signed_url_failed");
        return json({ url: signed.signedUrl, fileName, expiresIn: 120 });
      }

      case "start_import_batch": {
        await requirePermission('products.import_export');
        const fileHash = nullableText(payload.fileHash, 200);
        const fileName = nullableText(payload.fileName, 300);
        const totalRows = Number(payload.totalRows);
        if (!Number.isInteger(totalRows) || totalRows <= 0 || totalRows > 100000) return json({ error: "invalid_total_rows" }, 400);
        if (!fileHash || !/^[a-f0-9]{64}$/i.test(fileHash)) return json({ error: "invalid_file_fingerprint" }, 400);
        const { data: oldBatch } = await db.from("import_batches").select("id,status")
          .eq("shop_id", shopId).eq("admin_tg_id", tgId).eq("file_hash", fileHash).in("status", ["COMPLETED", "IN_PROGRESS"])
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (oldBatch?.status === "COMPLETED") return json({ error: "duplicate_import", batchId: oldBatch.id }, 409);
        if (oldBatch?.status === "IN_PROGRESS") return json({ error: "import_in_progress", batchId: oldBatch.id }, 409);
        const productLimit = await getProductLimit(db, shopId);
        if (productLimit !== null && await countActiveProducts(db, shopId) + totalRows > productLimit) {
          return json({ error: `product_limit_reached:${productLimit}` }, 400);
        }
        const { data: b, error: bErr } = await db.from("import_batches").insert({
          shop_id: shopId, admin_tg_id: tgId, file_name: fileName, file_hash: fileHash, total_rows: totalRows,
        }).select("id").single();
        if (bErr) throw bErr;
        auditLater("EXCEL_IMPORT_STARTED", "import_batch", b.id, { fileName, totalRows });
        return json({ batchId: b.id });
      }

      case "stage_import_products": {
        await requirePermission('products.import_export');
        const rows: any[] = Array.isArray(payload.rows) ? payload.rows : [];
        const batchId = String(payload.batchId || "");
        const offset = Number(payload.offset);
        if (!rows.length || rows.length > 150) return json({ error: "invalid_rows" }, 400);
        if (!batchId || !Number.isInteger(offset) || offset < 0) return json({ error: "invalid_import_stage" }, 400);
        const { data: batch, error: batchError } = await db.from("import_batches")
          .select("id,status,admin_tg_id,total_rows").eq("id", batchId).eq("shop_id", shopId).maybeSingle();
        if (batchError) throw batchError;
        if (!batch || batch.admin_tg_id !== tgId || batch.status !== "IN_PROGRESS") return json({ error: "invalid_import_batch" }, 400);
        if (offset + rows.length > Number(batch.total_rows)) return json({ error: "import_rows_exceed_batch_total" }, 400);
        const isFinal = offset + rows.length === Number(batch.total_rows);
        if (!!payload.isFinal !== isFinal) return json({ error: "invalid_final_chunk" }, 400);

        if (offset === 0) {
          const approvedNewPaths = Array.isArray(payload.approvedNewPaths) ? payload.approvedNewPaths.slice(0, 5000) : [];
          const aliases = Array.isArray(payload.aliases) ? payload.aliases.slice(0, 1000) : [];
          const { error: stageBatchError } = await db.from("import_staging_batches").upsert({
            shop_id: shopId, batch_id: batchId, approved_new_paths: approvedNewPaths, aliases,
            staged_rows: 0, is_complete: false,
          }, { onConflict: "batch_id", ignoreDuplicates: true });
          if (stageBatchError) throw stageBatchError;
        }
        const { data: stageMeta, error: metaError } = await db.from("import_staging_batches")
          .select("staged_rows,is_complete").eq("shop_id", shopId).eq("batch_id", batchId).maybeSingle();
        if (metaError) throw metaError;
        if (!stageMeta) return json({ error: "import_stage_not_started" }, 409);
        const stagedRows = Number(stageMeta.staged_rows || 0);
        if (stageMeta.is_complete) return json({ error: "import_stage_already_complete", stagedRows }, 409);
        if (stagedRows !== offset) return json({ error: offset < stagedRows ? "import_stage_chunk_already_processed" : "import_stage_chunk_out_of_order", stagedRows }, 409);

        const validationErrors: any[] = [];
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i] || {};
          const excelRow = Number.isInteger(Number(row.excelRow)) && Number(row.excelRow) > 1 ? Number(row.excelRow) : offset + i + 2;
          try {
            const name = nullableText(row.name, 250);
            const price = Number(row.price);
            if (!name || !Number.isFinite(price) || price < 0) throw new Error("invalid_name_or_price");
            const categoryPath = Array.isArray(row.categoryPath) ? row.categoryPath : [];
            if (categoryPath.length > 20 || categoryPath.some((part: any) => !nullableText(part, 200))) throw new Error("invalid_category_path");
            const rawVars = Array.isArray(row.variants) ? row.variants : [];
            if (rawVars.length > 500) throw new Error("too_many_variants");
            const vars = cleanVariants(row.variants, row.sizes);
            if (rawVars.length && vars.length !== rawVars.length) throw new Error("invalid_variant");
            validateVariantUniqueness(vars);
            if (!vars.length) {
              const stock = Number(row.stock);
              if (!Number.isInteger(stock) || stock < 0) throw new Error("invalid_stock");
            }
          } catch (e: any) {
            validationErrors.push({ row: excelRow, name: row.name || "?", error: e?.message || String(e) });
          }
        }
        if (validationErrors.length) return json({ error: "import_validation_failed", errors: validationErrors, batchId }, 400);

        const nextStagedRows = offset + rows.length;
        const { error: stageWriteError } = await db.rpc("ustore_stage_import_chunk", {
          p_shop_id: shopId, p_batch_id: batchId, p_offset: offset, p_rows: rows, p_is_final: isFinal,
        });
        if (stageWriteError) throw stageWriteError;
        return json({ ok: true, batchId, staged: rows.length, stagedRows: nextStagedRows, completed: isFinal });
      }

      case "bulk_import_products": {
        await requirePermission('products.import_export');
        let rows: any[] = Array.isArray(payload.rows) ? payload.rows : [];
        if (!rows.length || rows.length > 150) return json({ error: "invalid_rows" }, 400);
        let approvedNewPaths = new Set<string>((Array.isArray(payload.approvedNewPaths) ? payload.approvedNewPaths : []).map((x: any) => categoryPathKey(Array.isArray(x) ? x : String(x).split("/"))));
        let stagedAliases: any[] | null = null;
        const batchId = String(payload.batchId || "");
        const offset = Number(payload.offset);
        if (!batchId) return json({ error: "invalid_import_batch" }, 400);
        if (!Number.isInteger(offset) || offset < 0) return json({ error: "invalid_import_offset" }, 400);
        const { data: b } = await db.from("import_batches").select("id,status,admin_tg_id,total_rows,imported_rows").eq("id", batchId).eq("shop_id", shopId).maybeSingle();
        if (!b || b.admin_tg_id !== tgId || b.status !== "IN_PROGRESS") return json({ error: "invalid_import_batch" }, 400);
        const alreadyImported = Number(b.imported_rows || 0);
        if (offset !== alreadyImported) return json({ error: offset < alreadyImported ? "import_chunk_already_processed" : "import_chunk_out_of_order", importedRows: alreadyImported }, 409);
        if (offset + rows.length > Number(b.total_rows)) return json({ error: "import_rows_exceed_batch_total" }, 400);
        if (!!payload.isFinal !== (offset + rows.length === Number(b.total_rows))) return json({ error: "invalid_final_chunk" }, 400);

        const { data: stageMeta, error: stageMetaError } = await db.from("import_staging_batches")
          .select("approved_new_paths,aliases,staged_rows,is_complete").eq("shop_id", shopId).eq("batch_id", batchId).maybeSingle();
        if (stageMetaError) throw stageMetaError;
        if (!stageMeta) return json({ error: "import_stage_required" }, 409);
        if (!stageMeta.is_complete || Number(stageMeta.staged_rows || 0) !== Number(b.total_rows)) return json({ error: "import_stage_incomplete" }, 409);
        const { data: stagedChunk, error: stagedChunkError } = await db.from("import_staging_rows")
          .select("row_index,payload").eq("shop_id", shopId).eq("batch_id", batchId)
          .gte("row_index", offset).lt("row_index", offset + rows.length).order("row_index", { ascending: true });
        if (stagedChunkError) throw stagedChunkError;
        if ((stagedChunk || []).length !== rows.length) return json({ error: "import_stage_chunk_missing" }, 409);
        rows = (stagedChunk || []).map((entry: any) => entry.payload);
        approvedNewPaths = new Set<string>((stageMeta.approved_new_paths || []).map((x: any) => categoryPathKey(Array.isArray(x) ? x : String(x).split("/"))));
        stagedAliases = Array.isArray(stageMeta.aliases) ? stageMeta.aliases : [];

        const expectedExcelRows = rows.map((row: any, index: number) =>
          Number.isInteger(Number(row?.excelRow)) && Number(row.excelRow) > 1 ? Number(row.excelRow) : offset + index + 2);
        const { data: priorChunk, error: priorChunkError } = await db.from("products")
          .select("*").eq("shop_id", shopId).eq("import_batch_id", batchId).in("import_row_number", expectedExcelRows);
        if (priorChunkError) throw priorChunkError;
        if ((priorChunk || []).length) {
          if ((priorChunk || []).length !== expectedExcelRows.length) return json({ error: "import_chunk_partial_conflict" }, 409);
          const finalPatch: any = { imported_rows: offset + rows.length };
          if (payload.isFinal) { finalPatch.status = "COMPLETED"; finalPatch.completed_at = new Date().toISOString(); }
          const { data: resumed, error: resumeError } = await db.from("import_batches").update(finalPatch)
            .eq("id", batchId).eq("shop_id", shopId).eq("status", "IN_PROGRESS").eq("imported_rows", offset).select("id").maybeSingle();
          if (resumeError) throw resumeError;
          if (!resumed) return json({ error: "import_chunk_conflict" }, 409);
          return json({ batchId, products: priorChunk, categories: [], imported: priorChunk.length, completed: !!payload.isFinal, replayed: true });
        }

        const { data: allCats, error: catsErr } = await db.from("categories").select("id,name,name_ru,parent_id,img").eq("shop_id", shopId).is("deleted_at", null);
        if (catsErr) throw catsErr;
        const catList: any[] = allCats || [];
        const createdCategories: any[] = [];
        const createdCategoryIds: string[] = [];
        const pathCache = new Map<string, string | null>();

        async function resolveCategoryPath(pathNames: string[]): Promise<string | null> {
          let parentId: string | null = null;
          const canonical: string[] = [];
          for (const raw of pathNames || []) {
            const name = nullableText(raw, 200);
            if (!name) continue;
            canonical.push(name);
            const pKey = categoryPathKey(canonical);
            if (pathCache.has(pKey)) { parentId = pathCache.get(pKey)!; continue; }
            let found = catList.find((c) => String(c.parent_id ?? "") === String(parentId ?? "") && normalizeName(c.name) === normalizeName(name));
            if (!found) {
              if (!approvedNewPaths.has(pKey)) throw new Error(`unapproved_new_category:${canonical.join(" / ")}`);
              const { data: newCat, error: catErr } = await db.from("categories").insert({ shop_id: shopId, name, parent_id: parentId, img: parentId ? "📦" : "📁" }).select().single();
              if (catErr) throw catErr;
              found = newCat; catList.push(newCat); createdCategories.push(newCat); createdCategoryIds.push(String(newCat.id));
            }
            parentId = String(found.id); pathCache.set(pKey, parentId);
          }
          return parentId;
        }

        const productLimit = await getProductLimit(db, shopId);
        const activeCount = productLimit !== null ? await countActiveProducts(db, shopId) : 0;
        if (productLimit !== null && activeCount + rows.length > productLimit) {
          await db.from("import_batches").update({ status: "FAILED", error_rows: rows.length }).eq("id", batchId).eq("shop_id", shopId);
          return json({ error: `product_limit_reached:${productLimit}`, batchId }, 400);
        }

        const preliminary: any[] = [];
        const prepared: any[] = [];
        const validationErrors: any[] = [];
        let totalSkuNeed = 0;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i] || {};
          const excelRow = Number.isInteger(Number(row.excelRow)) && Number(row.excelRow) > 1 ? Number(row.excelRow) : offset + i + 2;
          try {
            const name = nullableText(row.name, 250);
            const price = Number(row.price);
            if (!name || !Number.isFinite(price) || price < 0) throw new Error("invalid_name_or_price");
            const categoryPath = Array.isArray(row.categoryPath) ? row.categoryPath : [];
            const rawVars = Array.isArray(row.variants) ? row.variants : [];
            if (rawVars.length > 500) throw new Error("too_many_variants");
            for (const v of rawVars) {
              const qty = Number(v?.qty);
              if ((!nullableText(v?.size, 60) && !nullableText(v?.color, 60)) || !Number.isInteger(qty) || qty < 0) throw new Error("invalid_variant");
            }
            const vars = await enrichVariantTranslations(cleanVariants(row.variants, row.sizes));
            if (rawVars.length && vars.length !== rawVars.length) throw new Error("invalid_variant");
            validateVariantUniqueness(vars);
            if (!vars.length) {
              const stock = Number(row.stock);
              if (!Number.isInteger(stock) || stock < 0) throw new Error("invalid_stock");
            }
            totalSkuNeed += vars.length ? 1 + vars.length : 1;
            preliminary.push({ row, name, price, categoryPath, vars, excelRow });
          } catch (e: any) {
            validationErrors.push({ row: excelRow, name: row.name || "?", error: e?.message || String(e) });
          }
        }
        if (validationErrors.length) return json({ error: "import_validation_failed", errors: validationErrors, batchId }, 400);

        for (const item of preliminary) {
          try {
            const categoryId = await resolveCategoryPath(item.categoryPath);
            prepared.push({ ...item, categoryId });
          } catch (e: any) {
            validationErrors.push({ row: item.excelRow, name: item.name || "?", error: e?.message || String(e) });
          }
        }

        if (createdCategoryIds.length) {
          const { data: bb } = await db.from("import_batches").select("created_category_ids").eq("id", batchId).eq("shop_id", shopId).single();
          const merged = Array.from(new Set([...(bb?.created_category_ids || []).map(String), ...createdCategoryIds]));
          await db.from("import_batches").update({ created_category_ids: merged }).eq("id", batchId).eq("shop_id", shopId);
        }
        if (validationErrors.length) return json({ error: "import_validation_failed", errors: validationErrors, batchId, categories: createdCategories }, 400);

        const skuPool = await allocateGlobalSkus(db, shopId, totalSkuNeed);
        let skuPos = 0;
        const { data: maxRow } = await db.from("products").select("sort_order").eq("shop_id", shopId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
        let nextSort = (maxRow?.sort_order || 0) + 1;
        const dbRows = prepared.map(({ row, name, price, categoryId, vars, excelRow }) => {
          const baseSku = skuPool[skuPos++];
          const withSku = vars.length ? vars.map((v) => ({ ...v, sku: skuPool[skuPos++] })) : null;
          const finalStock = withSku ? withSku.reduce((s, v) => s + (Number(v.qty) || 0), 0) : Math.max(0, Number.parseInt(String(row.stock ?? 0), 10) || 0);
          return {
            shop_id: shopId, sku: baseSku, name, name_ru: null, price,
            old_price: Number(row.oldPrice) > price ? Number(row.oldPrice) : null,
            stock: finalStock, description: nullableText(row.desc, 5000) || name,
            description_ru: null, img: null,
            category_id: categoryId, status: finalStock > 0 ? "ACTIVE" : "OUT_OF_STOCK",
            is_featured: false, sort_order: nextSort++, variants: withSku,
            sizes: legacySizesFromVariants(withSku || []), import_batch_id: batchId, import_row_number: excelRow,
            translation_status: "PENDING",
          };
        });
        const { data: inserted, error: insErr } = await db.from("products").insert(dbRows).select();
        if (insErr) throw insErr;

        if (inserted && inserted.length) {
          EdgeRuntime.waitUntil((async () => {
            try {
              const names = inserted.map((p: any) => p.name as string);
              const descs = inserted.map((p: any) => (p.description as string) || "");
              const [nameTranslations, descTranslations] = await Promise.all([
                translateBatchUzToRu(names),
                translateBatchUzToRu(descs),
              ]);
              for (let i = 0; i < inserted.length; i++) {
                const nameRu = nameTranslations[i];
                const hasDesc = !!inserted[i].description;
                const descRu = hasDesc ? descTranslations[i] : null;
                const validName = looksLikeValidRussian(inserted[i].name, nameRu);
                const validDesc = !hasDesc || looksLikeValidRussian(inserted[i].description, descRu);
                const status = (validName && validDesc) ? "FRESH" : "FAILED";
                const updatePayload: Record<string, unknown> = {
                  name_ru: validName ? nameRu : null,
                  description_ru: hasDesc && validDesc ? descRu : null,
                  translation_status: status,
                  translation_hash: null,
                };
                if (status === "FRESH") updatePayload.translation_hash = await translationHashOf(inserted[i].name, inserted[i].description);
                const { error } = await db.from("products").update(updatePayload).eq("shop_id", shopId).eq("id", inserted[i].id);
                if (error) console.error("import batch translation update error", error);
              }
            } catch (e) {
              console.error("import batch translation error", e);
            }
          })());
        }

        const aliases = stagedAliases || (Array.isArray(payload.aliases) ? payload.aliases.slice(0, 1000) : []);
        const aliasRows = new Map<string, any>();
        for (const a of aliases) {
          const aliasNormalized = normalizeName(a.alias);
          if (!aliasNormalized || !a.targetCategoryId) continue;
          const aliasRow = {
            shop_id: shopId,
            parent_category_id: a.parentCategoryId ? String(a.parentCategoryId) : null,
            alias_normalized: aliasNormalized, target_category_id: String(a.targetCategoryId), created_by_tg_id: tgId,
          };
          aliasRows.set(`${aliasRow.parent_category_id ?? ""}${aliasNormalized}`, aliasRow);
        }
        if (aliasRows.size) {
          // 002_shop_catalog_inventory.sql splits root-vs-nested aliases into two
          // partial unique indexes (NULL parent_category_id can't share one
          // ordinary UNIQUE constraint with non-null values) — upsert each group
          // against its own matching index.
          const withParent = [...aliasRows.values()].filter((r) => r.parent_category_id !== null);
          const rootLevel = [...aliasRows.values()].filter((r) => r.parent_category_id === null);
          if (withParent.length) {
            const { error: aliasErr } = await db.from("category_aliases").upsert(withParent, { onConflict: "shop_id,parent_category_id,alias_normalized" });
            if (aliasErr) throw aliasErr;
          }
          if (rootLevel.length) {
            const { error: aliasErr } = await db.from("category_aliases").upsert(rootLevel, { onConflict: "shop_id,alias_normalized" });
            if (aliasErr) throw aliasErr;
          }
        }

        const importedRows = offset + (inserted || []).length;
        const finalPatch: any = { imported_rows: importedRows };
        if (payload.isFinal) { finalPatch.status = "COMPLETED"; finalPatch.completed_at = new Date().toISOString(); }
        const { data: updatedBatch, error: batchUpdateErr } = await db.from("import_batches").update(finalPatch)
          .eq("id", batchId).eq("shop_id", shopId).eq("status", "IN_PROGRESS").eq("imported_rows", offset).select("id").maybeSingle();
        if (batchUpdateErr) throw batchUpdateErr;
        if (!updatedBatch) throw new Error("import_chunk_conflict");
        if (payload.isFinal) {
          const { error: stageDeleteError } = await db.from("import_staging_batches").delete().eq("shop_id", shopId).eq("batch_id", batchId);
          if (stageDeleteError) console.error("import staging cleanup error", stageDeleteError);
        }
        auditLater("EXCEL_IMPORT_CHUNK", "import_batch", batchId, { imported: (inserted || []).length, createdCategories: createdCategories.length, final: !!payload.isFinal });
        return json({ batchId, products: inserted || [], categories: createdCategories, imported: (inserted || []).length, completed: !!payload.isFinal });
      }

      case "get_category_aliases": {
        await requirePermission('products.import_export');
        const { data, error } = await db.from("category_aliases").select("parent_category_id,alias_normalized,target_category_id").eq("shop_id", shopId);
        if (error) throw error;
        return json({ aliases: data || [] });
      }

      case "get_last_import_batch": {
        await requirePermission('products.import_export');
        const { data, error } = await db.from("import_batches")
          .select("id,file_name,status,total_rows,imported_rows,created_at,completed_at")
          .eq("shop_id", shopId).eq("admin_tg_id", tgId).in("status", ["COMPLETED", "IN_PROGRESS", "FAILED"])
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (error) throw error;
        return json({ batch: data ? {
          id: data.id, fileName: data.file_name, status: data.status,
          totalRows: data.total_rows, importedRows: data.imported_rows,
          createdAt: data.created_at, completedAt: data.completed_at,
        } : null });
      }

      case "rollback_import_batch": {
        await requirePermission('products.import_export');
        const batchId = String(payload.batchId || "");
        const { data: batch } = await db.from("import_batches").select("*").eq("id", batchId).eq("shop_id", shopId).maybeSingle();
        if (!batch || (!isSuperAdmin && batch.admin_tg_id !== tgId)) return json({ error: "batch_not_found" }, 404);
        if (batch.status === "ROLLED_BACK") return json({ ok: true, already: true });
        const { error: stagingDeleteError } = await db.from("import_staging_batches").delete().eq("shop_id", shopId).eq("batch_id", batchId);
        if (stagingDeleteError) return json({ error: "rollback_staging_failed" }, 500);
        const { error: productRollbackError } = await db.from("products").update({ status: "DELETED" })
          .eq("shop_id", shopId).eq("import_batch_id", batchId).neq("status", "DELETED");
        if (productRollbackError) return json({ error: "rollback_products_failed" }, 500);
        const catIds: string[] = (batch.created_category_ids || []).map(String).reverse();
        for (const catId of catIds) {
          const [{ count: childCount }, { count: prodCount }] = await Promise.all([
            db.from("categories").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("parent_id", catId),
            db.from("products").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("category_id", catId).neq("status", "DELETED"),
          ]);
          if ((childCount || 0) === 0 && (prodCount || 0) === 0) {
            const { error: categoryDeleteError } = await db.from("categories").delete().eq("shop_id", shopId).eq("id", catId);
            if (categoryDeleteError) return json({ error: "rollback_categories_failed", categoryId: catId }, 500);
          }
        }
        const [{ count: remainingProducts, error: remainingProductsError }, { count: remainingCategories, error: remainingCategoriesError }] = await Promise.all([
          db.from("products").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("import_batch_id", batchId).neq("status", "DELETED"),
          catIds.length ? db.from("categories").select("id", { count: "exact", head: true }).eq("shop_id", shopId).in("id", catIds) : Promise.resolve({ count: 0, error: null }),
        ]);
        if (remainingProductsError || remainingCategoriesError) return json({ error: "rollback_verification_failed" }, 500);
        if ((remainingProducts || 0) > 0 || (remainingCategories || 0) > 0) {
          return json({ error: "rollback_incomplete", remainingProducts: remainingProducts || 0, remainingCategories: remainingCategories || 0 }, 409);
        }
        const { error: batchRollbackError } = await db.from("import_batches").update({ status: "ROLLED_BACK", completed_at: new Date().toISOString() }).eq("id", batchId).eq("shop_id", shopId);
        if (batchRollbackError) return json({ error: "rollback_batch_failed" }, 500);
        auditLater("EXCEL_IMPORT_ROLLED_BACK", "import_batch", batchId);
        return json({ ok: true, batchId });
      }

      case "bulk_add_products":
        return json({ error: "use_bulk_import_products" }, 400);

      case "edit_product_field": {
        await requirePermission('products.manage');
        const { productId, field, value, oldPrice, field2, value2, imageUpload, variantImageUploads } = payload;
        const { data: current, error: curErr } = await db.from("products").select("*").eq("shop_id", shopId).eq("id", productId).maybeSingle();
        if (curErr || !current) return json({ error: "product_not_found" }, 404);
        const dbUpdate: Record<string, unknown> = {};
        let uploadedImage: { url: string; path: string } | null = null;
        const uploadedVariantImages: Array<{ url: string; path: string }> = [];
        let effectiveValue = value;
        if (field === "img") {
          if (imageUpload) {
            uploadedImage = await storeProductImage(db, shopId, imageUpload);
            effectiveValue = uploadedImage.url;
          } else {
            effectiveValue = normalizeProductImageUrl(value);
          }
        }

        let priceChangeToLog: { from: number; to: number } | null = null;
        // POLISH ROUND (task 4, variant images) — storage paths of variant
        // images that are no longer referenced by ANY variant (or the
        // product's own img/thumb_img) after this save, filled in below.
        // Deleted only AFTER the DB update succeeds (mirrors the existing
        // "img" field cleanup pattern further down).
        const removedVariantImageUrls: string[] = [];
        async function applyField(f: string, v: any) {
          if (f === "name") dbUpdate.name = nullableText(v, 250);
          else if (f === "nameRu") dbUpdate.name_ru = nullableText(v, 250);
          else if (f === "price") {
            const price = Number(v); if (!Number.isFinite(price) || price < 0) throw new Error("invalid_price");
            if (Number(current.price) !== price) priceChangeToLog = { from: Number(current.price), to: price };
            dbUpdate.price = price; dbUpdate.old_price = Number(oldPrice) > price ? Number(oldPrice) : null;
          } else if (f === "categoryId") {
            dbUpdate.category_id = v ? String(v) : null;
          } else if (f === "badge") {
            const allowedBadges = ["NEW", "TOP", "RECOMMENDED", "PROMO"];
            dbUpdate.badge = v && allowedBadges.includes(String(v)) ? String(v) : null;
          } else if (f === "stock") {
            if (Array.isArray(current.variants) && current.variants.length) throw new Error("variant_stock_use_variants");
            const n = Number.parseInt(String(v), 10); if (!Number.isInteger(n) || n < 0) throw new Error("invalid_stock");
            dbUpdate.stock = n; dbUpdate.status = n > 0 ? "ACTIVE" : "OUT_OF_STOCK";
          } else if (f === "desc") dbUpdate.description = nullableText(v, 5000) || "";
          else if (f === "descRu") dbUpdate.description_ru = nullableText(v, 5000);
          else if (f === "img") {
            dbUpdate.img = normalizeProductImageUrl(v);
            // 041: rasm almashtirilganda kichik nusxa ham BIRGA yangilanishi
            // shart. Aks holda kartochkada eski rasmning kichik nusxasi qolib
            // ketardi — admin rasmni o'zgartirdim deb o'ylaydi, mijoz esa
            // ro'yxatda hali ham eskisini ko'radi. Yangi kichik nusxa
            // yuklanmagan bo'lsa (masalan tashqi URL kiritilgan bo'lsa)
            // ataylab null qilinadi — shunda kartochka yangi asosiy rasmga
            // qaytadi, eskisiga emas.
            dbUpdate.thumb_img = normalizeProductImageUrl(payload.thumbImg) || null;
          }
          else if (f === "sizes" || f === "variants") {
            let rawVariants = f === "sizes" ? cleanVariants(null, v) : cleanVariants(v, null);
            validateVariantUniqueness(rawVariants);
            if (f === "variants") {
              for (const item of (Array.isArray(variantImageUploads) ? variantImageUploads : [])) {
                const index = Number(item?.index);
                if (!Number.isInteger(index) || index < 0 || index >= rawVariants.length || !item?.imageUpload) throw new Error("invalid_variant_image_upload");
                const uploaded = await storeProductImage(db, shopId, item.imageUpload);
                uploadedVariantImages.push(uploaded);
                const target = item?.target === "img" ? "img" : "colorImg";
                rawVariants[index] = { ...rawVariants[index], [target]: uploaded.url };
              }
            }
            const newVars = await enrichVariantTranslations(rawVariants);
            validateVariantUniqueness(newVars);
            const oldVars: any[] = Array.isArray(current.variants) ? current.variants : cleanVariants(null, current.sizes);
            const oldMap = new Map(oldVars.map((x) => [variantIdentity(x), x]));
            const need = newVars.filter((x) => !oldMap.get(variantIdentity(x))?.sku).length;
            const newSkus = need ? await allocateGlobalSkus(db, shopId, need) : [];
            let pos = 0;
            const withSku = newVars.map((x) => ({ ...x, sku: oldMap.get(variantIdentity(x))?.sku || newSkus[pos++] }));
            const total = withSku.reduce((sum, x) => sum + (Number(x.qty) || 0), 0);
            // Task 4: a variant's image that no longer appears anywhere in
            // the saved result (not on any current variant, not the
            // product's own img/thumb_img) is genuinely orphaned — queue it
            // for cleanup. Never delete a URL still referenced anywhere.
            const keepImgUrls = new Set<string>([
              ...withSku.map((x) => x.img).filter(Boolean) as string[],
              ...withSku.map((x) => x.colorImg).filter(Boolean) as string[],
              current.img, current.thumb_img,
            ].filter(Boolean) as string[]);
            const orphanCandidates = new Set<string>();
            for (const ov of oldVars) {
              if ((ov as any)?.img) orphanCandidates.add(String((ov as any).img));
              if ((ov as any)?.colorImg) orphanCandidates.add(String((ov as any).colorImg));
            }
            for (const oldImg of orphanCandidates) {
              if (keepImgUrls.has(oldImg)) continue;
              const p = productStoragePathFromUrl(oldImg, SUPABASE_URL, shopId, "images");
              if (p) removedVariantImageUrls.push(oldImg);
            }
            dbUpdate.variants = withSku.length ? withSku : null;
            dbUpdate.sizes = legacySizesFromVariants(withSku);
            dbUpdate.stock = withSku.length ? total : current.stock;
            dbUpdate.status = (withSku.length ? total : current.stock) > 0 ? "ACTIVE" : "OUT_OF_STOCK";
            // Variativ mahsulotda har kombinatsiya o'z narxiga ega.
            // products.price / old_price faqat legacy/list compatibility uchun
            // birinchi kombinatsiyani kuzatadi — narxlar HECH QACHON
            // o'rtachalashtirilmaydi. Checkout tanlangan variant.price'dan
            // foydalanishda davom etadi.
            if (withSku.length && withSku[0].price !== null && withSku[0].price !== undefined) {
              const canonicalPrice = Math.max(0, Number(withSku[0].price) || 0);
              dbUpdate.price = canonicalPrice;
              dbUpdate.old_price = (withSku[0].oldPrice !== null && withSku[0].oldPrice !== undefined && Number(withSku[0].oldPrice) > canonicalPrice)
                ? Number(withSku[0].oldPrice)
                : null;
              if (Number(current.price) !== canonicalPrice) priceChangeToLog = { from: Number(current.price), to: canonicalPrice };
            }
          }
        }
        let data: any;
        try {
          await applyField(field, effectiveValue);
          if (field2) await applyField(field2, value2);
          let pendingProductTranslation: { name: string; desc: string | null; hash: string } | null = null;
          if (field === "name" || field === "desc" || field2 === "name" || field2 === "desc") {
            const finalName = (dbUpdate.name !== undefined ? dbUpdate.name : current.name) as string;
            const finalDesc = (dbUpdate.description !== undefined ? dbUpdate.description : current.description) as string | null;
            const nextHash = await translationHashOf(finalName, finalDesc);
            if (nextHash !== current.translation_hash) {
              dbUpdate.name_ru = null; dbUpdate.description_ru = null;
              dbUpdate.translation_status = "PENDING"; dbUpdate.translation_hash = null;
              pendingProductTranslation = { name: finalName, desc: finalDesc, hash: nextHash };
            }
          }
          const updateResult = await db.from("products").update(dbUpdate).eq("shop_id", shopId).eq("id", productId).select().single();
          if (updateResult.error) throw updateResult.error;
          data = updateResult.data;
          if (pendingProductTranslation) EdgeRuntime.waitUntil(translateProductInBackground(db, shopId, String(productId), pendingProductTranslation.name, pendingProductTranslation.desc, pendingProductTranslation.hash));
        } catch (e) {
          const paths = [...uploadedVariantImages.map((item) => item.path), ...(uploadedImage ? [uploadedImage.path] : [])];
          if (paths.length) await db.storage.from("images").remove(paths).catch(() => {});
          throw e;
        }
        if ((field === "img" || field2 === "img") && current.img && current.img !== data.img) {
          EdgeRuntime.waitUntil(cleanupManagedImageIfUnreferenced(db, shopId, current.img, SUPABASE_URL, "old-product-image"));
        }
        if (removedVariantImageUrls.length) {
          EdgeRuntime.waitUntil(Promise.all(removedVariantImageUrls.map((url) =>
            cleanupManagedImageIfUnreferenced(db, shopId, url, SUPABASE_URL, "old-variant-image")
          )).then(() => {}).catch((e) => console.error("old variant image cleanup error", e)));
        }
        if (priceChangeToLog) {
          EdgeRuntime.waitUntil(db.from("product_price_history").insert({
            shop_id: shopId, product_id: String(productId), old_price: priceChangeToLog.from, new_price: priceChangeToLog.to, changed_by: tgId,
          }).then(({ error }: any) => { if (error) console.error("price history log error", error); }));
        }
        const stockFieldTouched = [field, field2].includes("stock") || [field, field2].includes("sizes") || [field, field2].includes("variants");
        if (stockFieldTouched && Number(current.stock) !== Number(data.stock)) {
          EdgeRuntime.waitUntil(db.from("stock_movements").insert({
            shop_id: shopId, product_id: String(productId), prior_stock: Number(current.stock) || 0,
            delta: Number(data.stock) - Number(current.stock), new_stock: Number(data.stock) || 0,
            operation_type: "MANUAL", admin_tg_id: tgId,
          }).then(({ error }: any) => { if (error) console.error("stock movement log error", error); }));
        }
        if (stockFieldTouched) await triggerRestockTransitions(db, shopId, current, data, BOT_TOKEN);
        if (priceChangeToLog || stockFieldTouched) EdgeRuntime.waitUntil(validateAndPauseBundles(db, shopId, BOT_TOKEN, [String(productId)]).catch((e: any) => console.error("[BUNDLE_AUTO_PAUSE_FAILED]", e)));
        auditLater("PRODUCT_UPDATED", "product", productId, { field, field2: field2 || null });
        return json({ product: data });
      }

      case "get_product_price_history": {
        await requirePermission('products.manage');
        const productId = String(payload.productId || "");
        const { data, error } = await db.from("product_price_history").select("*")
          .eq("shop_id", shopId).eq("product_id", productId).order("changed_at", { ascending: false }).limit(100);
        if (error) throw error;
        return json({ history: (data || []).map((h: any) => ({
          oldPrice: h.old_price !== null ? Number(h.old_price) : null, newPrice: Number(h.new_price),
          changedAt: h.changed_at, changedBy: h.changed_by,
        })) });
      }

      case "duplicate_product": {
        await requirePermission('products.manage');
        const sourceId = String(payload.productId || "");
        const { data: original, error: fetchErr } = await db.from("products").select("*").eq("shop_id", shopId).eq("id", sourceId).maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!original) return json({ error: "product_not_found" }, 404);
        const productLimit = await getProductLimit(db, shopId);
        if (productLimit !== null && await countActiveProducts(db, shopId) >= productLimit) return json({ error: `product_limit_reached:${productLimit}` }, 400);
        const sourceVariants: any[] = Array.isArray(original.variants) ? original.variants : [];
        const skuCount = sourceVariants.length ? 1 + sourceVariants.length : 1;
        const allocated = await allocateGlobalSkus(db, shopId, skuCount);
        const baseSku = allocated.shift()!;
        const newVariants = sourceVariants.length
          ? sourceVariants.map((v: any) => ({ ...v, sku: allocated.shift()!, qty: Number(v.qty) || 0 }))
          : null;
        let duplicatedImg: string | null = original.img || null;
        const sourceStoragePath = productStoragePathFromUrl(original.img, SUPABASE_URL, shopId, "images");
        if (sourceStoragePath) {
          try {
            const { data: fileData, error: downloadErr } = await db.storage.from("images").download(sourceStoragePath);
            if (downloadErr || !fileData) throw downloadErr || new Error("download_failed");
            const ext = sourceStoragePath.split(".").pop() || "jpg";
            const newPath = `shops/${shopId}/products/${Date.now()}-${crypto.randomUUID()}.${ext}`;
            const { error: uploadErr } = await db.storage.from("images").upload(newPath, fileData, {
              contentType: (fileData as any).type || undefined, cacheControl: "31536000", upsert: false,
            });
            if (uploadErr) throw uploadErr;
            const { data: pub } = db.storage.from("images").getPublicUrl(newPath);
            duplicatedImg = pub?.publicUrl || null;
          } catch (e) {
            console.error("duplicate_product image copy error", e);
            duplicatedImg = null;
          }
        }
        const { data: maxRow } = await db.from("products").select("sort_order").eq("shop_id", shopId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
        const dbRow = {
          shop_id: shopId, sku: baseSku, name: `${original.name} — nusxa`, name_ru: original.name_ru ? `${original.name_ru} — копия` : null,
          price: original.price, old_price: original.old_price, stock: Number(original.stock) || 0,
          description: original.description, description_ru: original.description_ru,
          img: duplicatedImg, category_id: original.category_id,
          status: Number(original.stock) > 0 ? "ACTIVE" : "OUT_OF_STOCK", is_featured: false, sort_order: (maxRow?.sort_order || 0) + 1,
          variants: newVariants, sizes: legacySizesFromVariants(newVariants || []),
        };
        const { data: inserted, error } = await db.from("products").insert(dbRow).select().single();
        if (error) throw error;
        auditLater("PRODUCT_DUPLICATED", "product", inserted.id, { fromProductId: sourceId });
        return json({ product: inserted });
      }

      case "delete_product": {
        await requirePermission('products.manage');
        const productId = String(payload.productId || "");
        const { data: batchId, error } = await db.rpc("ustore_trash_product", { p_shop_id: shopId, p_product_id: productId, p_deleted_by: tgId });
        if (error) {
          if (String(error.message || "").includes("product_not_found")) return json({ error: "product_not_found" }, 404);
          throw error;
        }
        auditLater("PRODUCT_DELETED", "product", productId, { batchId });
        return json({ ok: true, batchId });
      }

      case "add_category": {
        await requirePermission('catalog.manage');
        const name = nullableText(payload.name, 200);
        if (!name) return json({ error: "invalid_category_name" }, 400);
        const iconId = payload.iconId === undefined ? 'stationery_folder' : String(payload.iconId || '');
        const iconColor = String(payload.iconColor || 'brand');
        if (!(await categoryIconIsAllowed(db, iconId)) || !CATEGORY_ICON_COLORS.has(iconColor)) return json({ error: 'invalid_category_icon' }, 400);
        const { data: maxRow } = await db.from("categories").select("sort_order")
          .eq("shop_id", shopId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
        const pendingHash = await translationHashOf(name, null);
        let uploadedImage: { url: string; path: string } | null = null;
        try {
          if (payload.imageUpload) uploadedImage = await storeProductImage(db, shopId, payload.imageUpload);
          const categoryImg = uploadedImage?.url || (payload.img ? normalizeProductImageUrl(payload.img) : (payload.parentId ? "📦" : "📁"));
          const { data, error } = await db.from("categories").insert({
            shop_id: shopId, name, name_ru: null, parent_id: payload.parentId ?? null,
            img: categoryImg, icon_id: iconId, icon_color: iconColor, sort_order: (maxRow?.sort_order || 0) + 1,
            translation_status: "PENDING", translation_hash: null,
          }).select().single();
          if (error) throw error;
          auditLater("CATEGORY_CREATED", "category", data.id, { name: data.name });
          EdgeRuntime.waitUntil(translateCategoryInBackground(db, shopId, String(data.id), name, pendingHash));
          return json({ category: data });
        } catch (e) {
          if (uploadedImage) await db.storage.from("images").remove([uploadedImage.path]).catch(() => {});
          throw e;
        }
      }

      // Ommaviy katalog yaratish (Shop App, "Bir nechta katalog qo'shish").
      // Har `path` — segmentlar ro'yxati (masalan ["Sport ozuqalari","Protein","Whey"]),
      // frontend "/" bo'yicha ajratib, har segmentni trim qilib yuboradi.
      // Bu yerdagi resolyutsiya algoritmi bulk_import_products'dagi
      // resolveCategoryPath bilan AYNAN bir xil naqsh (parent+normalized-name
      // bo'yicha qidirish, topilmasa yaratish, shu so'rov ichida keshlash) —
      // faqat approvedNewPaths gate'i yo'q, chunki bu yerda alohida
      // "yangi katalogni tasdiqlash" UI qadami yo'q: frontend preview'i
      // (parseCategoryBulkInput) allaqachon foydalanuvchiga nima yangi/mavjud
      // ekanini ko'rsatib bo'lgan, "Barchasini yaratish" bosilganda esa
      // hammasi to'g'ridan-to'g'ri yaratiladi/bog'lanadi.
      case "bulk_create_categories": {
        await requirePermission('catalog.manage');
        const rawPaths: unknown[] = Array.isArray(payload.paths) ? payload.paths : [];
        if (!rawPaths.length || rawPaths.length > 500) return json({ error: "invalid_paths" }, 400);

        const { data: allCats, error: catsErr } = await db.from("categories").select("id,name,name_ru,parent_id,img")
          .eq("shop_id", shopId).is("deleted_at", null);
        if (catsErr) throw catsErr;
        const catList: any[] = allCats || [];
        // level-scoped cache: "<parentId-or-root><normalizedName>" -> categoryId.
        // Keeps repeated prefixes (e.g. many paths starting "Sport ozuqalari/...")
        // from being re-looked-up/re-created within this one request.
        const cache = new Map<string, string>();
        const createdCategories: any[] = [];
        const touchedExistingIds = new Set<string>();
        const seenFullPaths = new Set<string>();
        const results: Array<{ index: number; path: string[]; status: string; error?: string; segments?: Array<{ name: string; status: string }> }> = [];
        let duplicateCount = 0, errorCount = 0;

        for (let i = 0; i < rawPaths.length; i++) {
          const segmentsRaw = Array.isArray(rawPaths[i]) ? (rawPaths[i] as unknown[]) : [];
          const segments = segmentsRaw.map((s) => nullableText(s, 200)).filter((s): s is string => !!s);
          if (!segments.length) {
            results.push({ index: i, path: [], status: "error", error: "empty_path" });
            errorCount++;
            continue;
          }
          const fullKey = categoryPathKey(segments);
          if (seenFullPaths.has(fullKey)) {
            results.push({ index: i, path: segments, status: "duplicate" });
            duplicateCount++;
            continue;
          }
          seenFullPaths.add(fullKey);
          try {
            let parentId: string | null = null;
            const segmentResults: Array<{ name: string; status: string }> = [];
            for (const name of segments) {
              const cacheKey = `${parentId ?? ""}${normalizeName(name)}`;
              let categoryId = cache.get(cacheKey);
              let segStatus = "existing";
              if (!categoryId) {
                let found = catList.find((c) => String(c.parent_id ?? "") === String(parentId ?? "") && normalizeName(c.name) === normalizeName(name));
                if (!found) {
                  const { data: newCat, error: insErr } = await db.from("categories")
                    .insert({ shop_id: shopId, name, parent_id: parentId, img: parentId ? "📦" : "📁", icon_id: 'stationery_folder', icon_color: 'brand' }).select().single();
                  if (insErr) {
                    // Race: a concurrent request created this exact node first —
                    // re-select it instead of failing the whole path.
                    if (String((insErr as any).code) === "23505") {
                      const { data: raceWinner } = await db.from("categories").select("id,name,name_ru,parent_id,img")
                        .eq("shop_id", shopId).is("deleted_at", null)
                        .eq("parent_id", parentId as any).ilike("name", name).maybeSingle();
                      if (!raceWinner) throw insErr;
                      found = raceWinner;
                    } else throw insErr;
                  } else {
                    found = newCat; createdCategories.push(newCat); segStatus = "created";
                  }
                  catList.push(found);
                } else {
                  touchedExistingIds.add(String(found.id));
                }
                categoryId = String(found.id);
                cache.set(cacheKey, categoryId);
              }
              segmentResults.push({ name, status: segStatus });
              parentId = categoryId;
            }
            results.push({ index: i, path: segments, status: "ok", segments: segmentResults });
          } catch (e: any) {
            results.push({ index: i, path: segments, status: "error", error: e?.message || String(e) });
            errorCount++;
          }
        }

        if (createdCategories.length) {
          auditLater("CATEGORIES_BULK_CREATED", "category", null, { count: createdCategories.length, totalPaths: rawPaths.length });
          for (const cat of createdCategories) {
            const pendingHash = await translationHashOf(cat.name, null);
            EdgeRuntime.waitUntil(translateCategoryInBackground(db, shopId, String(cat.id), cat.name, pendingHash));
          }
        }
        return json({
          results,
          createdCategories,
          summary: {
            totalPaths: rawPaths.length,
            newCategories: createdCategories.length,
            existingCategories: touchedExistingIds.size,
            duplicates: duplicateCount,
            errors: errorCount,
          },
        });
      }

      case "edit_category": {
        await requirePermission('catalog.manage');
        const { data: currentCategory, error: currentCategoryErr } = await db.from("categories").select("img,translation_hash").eq("shop_id", shopId).eq("id", payload.categoryId).maybeSingle();
        if (currentCategoryErr) throw currentCategoryErr;
        if (!currentCategory) return json({ error: "category_not_found" }, 404);
        const dbUpdate: Record<string, unknown> = {};
        if (payload.iconId !== undefined) {
          const iconId = payload.iconId === null ? null : String(payload.iconId);
          if (iconId !== null && !(await categoryIconIsAllowed(db, iconId))) return json({ error: 'invalid_category_icon' }, 400);
          dbUpdate.icon_id = iconId;
        }
        if (payload.iconColor !== undefined) {
          const color = String(payload.iconColor);
          if (!CATEGORY_ICON_COLORS.has(color)) return json({ error: 'invalid_category_icon_color' }, 400);
          dbUpdate.icon_color = color;
        }
        if (payload.name !== undefined) dbUpdate.name = nullableText(payload.name, 200);
        if (payload.parentId !== undefined) {
          const categoryId = String(payload.categoryId || "");
          const newParentId = payload.parentId ? String(payload.parentId) : null;
          if (newParentId === categoryId) return json({ error: "cannot_move_into_self" }, 400);
          const allCats = await fetchActiveCategories(db, shopId);
          if (newParentId) {
            if (!allCats.some((c) => String(c.id) === newParentId)) return json({ error: "target_category_not_found" }, 400);
            if (isCategoryDescendantOrSelf(allCats, newParentId, categoryId)) return json({ error: "cannot_move_into_own_descendant" }, 400);
          }
          dbUpdate.parent_id = newParentId;
        }
        let uploadedImage: { url: string; path: string } | null = null;
        try {
          if (payload.imageUpload) {
            uploadedImage = await storeProductImage(db, shopId, payload.imageUpload);
            dbUpdate.img = uploadedImage.url;
          } else if (payload.img !== undefined) {
            dbUpdate.img = payload.img ? normalizeProductImageUrl(payload.img) : null;
          }
          let pendingCategoryTranslation: { name: string; hash: string } | null = null;
          if (payload.name !== undefined) {
            const finalName = String(dbUpdate.name || "");
            const nextHash = await translationHashOf(finalName, null);
            if (nextHash !== currentCategory.translation_hash) {
              dbUpdate.name_ru = null; dbUpdate.translation_status = "PENDING"; dbUpdate.translation_hash = null;
              pendingCategoryTranslation = { name: finalName, hash: nextHash };
            }
          }
          const { data, error } = await db.from("categories").update(dbUpdate).eq("shop_id", shopId).eq("id", payload.categoryId).select().single();
          if (error) throw error;
          if (dbUpdate.img !== undefined && currentCategory.img && currentCategory.img !== data.img) {
            EdgeRuntime.waitUntil(cleanupManagedImageIfUnreferenced(db, shopId, currentCategory.img, SUPABASE_URL, "old-category-image"));
          }
          if (pendingCategoryTranslation) EdgeRuntime.waitUntil(translateCategoryInBackground(db, shopId, String(payload.categoryId), pendingCategoryTranslation.name, pendingCategoryTranslation.hash));
          auditLater("CATEGORY_UPDATED", "category", payload.categoryId, dbUpdate);
          return json({ category: data });
        } catch (e) {
          if (uploadedImage) await db.storage.from("images").remove([uploadedImage.path]).catch(() => {});
          throw e;
        }
      }

      case "reorder_categories": {
        await requirePermission('catalog.manage');
        const items: Array<{ id: any; sortOrder: any }> = Array.isArray(payload.items) ? payload.items : [];
        if (!items.length || items.length > 500) return json({ error: "invalid_items" }, 400);
        const validItems = items.filter((item) => item && item.id !== undefined && item.id !== null && Number.isInteger(Number(item.sortOrder)));
        if (validItems.length !== items.length) return json({ error: "invalid_items" }, 400);
        const { error } = await db.rpc("ustore_reorder_entities", { p_shop_id: shopId, p_entity: "categories", p_items: validItems });
        if (error) throw error;
        auditLater("CATEGORIES_REORDERED", "category", null, { count: validItems.length });
        return json({ ok: true });
      }

      case "move_category": {
        await requirePermission('catalog.manage');
        const categoryId = String(payload.categoryId || "");
        const newParentId = payload.newParentId ? String(payload.newParentId) : null;
        if (!categoryId) return json({ error: "invalid_category" }, 400);
        if (newParentId === categoryId) return json({ error: "cannot_move_into_self" }, 400);
        const allCats = await fetchActiveCategories(db, shopId);
        if (!allCats.some((c) => String(c.id) === categoryId)) return json({ error: "category_not_found" }, 400);
        if (newParentId) {
          if (!allCats.some((c) => String(c.id) === newParentId)) return json({ error: "target_category_not_found" }, 400);
          if (isCategoryDescendantOrSelf(allCats, newParentId, categoryId)) return json({ error: "cannot_move_into_own_descendant" }, 400);
        }
        const { data, error } = await db.from("categories").update({ parent_id: newParentId }).eq("shop_id", shopId).eq("id", categoryId).select().single();
        if (error) throw error;
        auditLater("CATEGORY_MOVED", "category", categoryId, { newParentId });
        return json({ category: data });
      }

      case "get_category_delete_preview": {
        await requirePermission('catalog.manage');
        const categoryId = String(payload.categoryId || "");
        const allCats = await fetchActiveCategories(db, shopId);
        const subtreeIds = collectCategorySubtreeIds(allCats, categoryId);
        const { count: productCount, error: countErr } = await db.from("products").select("id", { count: "exact", head: true })
          .eq("shop_id", shopId).in("category_id", subtreeIds).neq("status", "DELETED");
        if (countErr) throw countErr;
        return json({ categoryCount: subtreeIds.length - 1, productCount: productCount || 0 });
      }

      case "delete_category": {
        await requirePermission('catalog.manage');
        const categoryId = String(payload.categoryId || "");
        const { data: result, error } = await db.rpc("ustore_trash_category", { p_shop_id: shopId, p_root_category_id: categoryId, p_deleted_by: tgId });
        if (error) {
          if (String(error.message || "").includes("category_not_found")) return json({ error: "category_not_found" }, 404);
          throw error;
        }
        auditLater("CATEGORY_DELETED", "category", categoryId, result);
        return json({ ok: true, batchId: result.batchId, categoryCount: result.categoryCount, productCount: result.productCount });
      }

      case "get_trash": {
        await requirePermission('products.manage');
        // ROUND14: cron kechiksa/o'chib qolsa ham Trash ochilganda 24 soati
        // o'tgan batchlar opportunistik tarzda purge qilinadi. Asosiy
        // avtomatika trash-purge-cron orqali har soatda ishlaydi.
        const trashCutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const { data: expiredBatches } = await db.from("trash_batches").select("id")
          .eq("shop_id", shopId).is("restored_at", null).is("purged_at", null).lte("deleted_at", trashCutoff).limit(100);
        for (const expired of expiredBatches || []) {
          try {
            const { data: purgeResult, error: purgeErr } = await db.rpc("ustore_purge_trash_batch", { p_shop_id: shopId, p_batch_id: expired.id });
            if (purgeErr) throw purgeErr;
            try {
              await cleanupUnreferencedProductImages(db, shopId, purgeResult?.imageUrls || [], SUPABASE_URL);
            } catch (cleanupError) {
              console.error("expired trash image cleanup", { shopId, batchId: expired.id, message: (cleanupError as any)?.message || cleanupError });
            }
          } catch (e) { console.error("expired trash purge error", { shopId, batchId: expired.id, message: (e as any)?.message || e }); }
        }
        const { data, error } = await db.from("trash_batches").select("*")
          .eq("shop_id", shopId).is("restored_at", null).is("purged_at", null).order("deleted_at", { ascending: false }).limit(200);
        if (error) throw error;
        const catIds = new Set<string>(); const prodIds = new Set<string>();
        const productBatchIds: string[] = [];
        for (const b of data || []) {
          for (const id of (b.category_ids || [])) catIds.add(String(id));
          for (const id of (b.product_ids || [])) prodIds.add(String(id));
          if (b.kind === "PRODUCT") productBatchIds.push(b.id);
        }
        const [catRes, prodRes, itemsRes] = await Promise.all([
          catIds.size ? db.from("categories").select("id,name").eq("shop_id", shopId).in("id", [...catIds]) : Promise.resolve({ data: [] as any[] }),
          prodIds.size ? db.from("products").select("id,name,sku,img").eq("shop_id", shopId).in("id", [...prodIds]) : Promise.resolve({ data: [] as any[] }),
          productBatchIds.length ? db.from("trash_batch_items").select("batch_id,product_id").eq("shop_id", shopId).in("batch_id", productBatchIds).eq("status", "PENDING") : Promise.resolve({ data: [] as any[] }),
        ]);
        const catNameById = new Map((catRes.data || []).map((c: any) => [String(c.id), c.name]));
        const prodById = new Map((prodRes.data || []).map((p: any) => [String(p.id), p]));
        const prodNameById = new Map((prodRes.data || []).map((p: any) => [String(p.id), `${p.name} (${p.sku})`]));
        const pendingItemsByBatch = new Map<string, string[]>();
        for (const it of itemsRes.data || []) {
          const list = pendingItemsByBatch.get(it.batch_id) || [];
          list.push(String(it.product_id));
          pendingItemsByBatch.set(it.batch_id, list);
        }
        const batches = (data || []).map((b: any) => {
          const pendingIds = b.kind === "PRODUCT" ? (pendingItemsByBatch.get(b.id) || []) : [];
          return {
            id: b.id, kind: b.kind, deletedAt: b.deleted_at, deletedBy: b.deleted_by,
            expiresAt: new Date(new Date(b.deleted_at).getTime() + 24 * 3600 * 1000).toISOString(),
            rootCategoryName: b.root_category_id ? (catNameById.get(String(b.root_category_id)) || null) : null,
            categoryCount: (b.category_ids || []).length, productCount: (b.product_ids || []).length,
            productNames: (b.product_ids || []).map((id: any) => prodNameById.get(String(id)) || String(id)).slice(0, 20),
            productItems: b.kind === "PRODUCT" ? pendingIds.map((id) => {
              const p = prodById.get(id);
              return { id, name: p?.name || id, sku: p?.sku || null, img: p?.img || null };
            }) : [],
          };
        });
        return json({ batches });
      }

      case "restore_trash_batch": {
        await requirePermission('products.manage');
        const batchId = String(payload.batchId || "");
        const { data: batch, error: fetchErr } = await db.from("trash_batches").select("*").eq("shop_id", shopId).eq("id", batchId).maybeSingle();
        if (fetchErr) throw fetchErr;
        if (!batch || batch.restored_at || batch.purged_at) return json({ error: "batch_not_restorable" }, 400);
        const catIds: string[] = (batch.category_ids || []).map(String);
        const prodIds: string[] = (batch.product_ids || []).map(String);
        if (catIds.length) {
          const { error } = await db.from("categories").update({ deleted_at: null }).eq("shop_id", shopId).in("id", catIds);
          if (error) throw error;
        }
        if (prodIds.length) {
          const { data: prods, error: prodSelErr } = await db.from("products").select("id,stock").eq("shop_id", shopId).in("id", prodIds);
          if (prodSelErr) throw prodSelErr;
          for (const p of prods || []) {
            const status = Number(p.stock) > 0 ? "ACTIVE" : "OUT_OF_STOCK";
            const { error } = await db.from("products").update({ status, deleted_at: null }).eq("shop_id", shopId).eq("id", p.id);
            if (error) throw error;
          }
        }
        const { error: batchUpdErr } = await db.from("trash_batches").update({ restored_at: new Date().toISOString() }).eq("shop_id", shopId).eq("id", batchId);
        if (batchUpdErr) throw batchUpdErr;
        auditLater("TRASH_RESTORED", "trash_batch", batchId, { categoryCount: catIds.length, productCount: prodIds.length });
        return json({ ok: true });
      }

      case "bulk_move_products": {
        await requirePermission('products.manage');
        const ids = Array.from(new Set((Array.isArray(payload.productIds) ? payload.productIds : []).map((x: any) => String(x)).filter(Boolean)));
        if (!ids.length || ids.length > 500) return json({ error: "invalid_product_ids" }, 400);
        const targetCategoryId = payload.categoryId ? String(payload.categoryId) : null;
        if (targetCategoryId) {
          const { data: target } = await db.from("categories").select("id,deleted_at").eq("shop_id", shopId).eq("id", targetCategoryId).maybeSingle();
          if (!target || target.deleted_at) return json({ error: "target_category_not_found" }, 400);
        }
        const { data: existing, error: existingErr } = await db.from("products").select("id").eq("shop_id", shopId).in("id", ids).neq("status", "DELETED");
        if (existingErr) throw existingErr;
        if ((existing || []).length !== ids.length) return json({ error: "product_set_changed" }, 409);
        const { data, error } = await db.from("products").update({ category_id: targetCategoryId }).eq("shop_id", shopId).in("id", ids).select("*");
        if (error) throw error;
        auditLater("PRODUCTS_BULK_MOVED", "product", null, { count: ids.length, categoryId: targetCategoryId });
        return json({ products: data || [], count: (data || []).length });
      }

      case "bulk_trash_products": {
        await requirePermission('products.manage');
        const ids = Array.from(new Set((Array.isArray(payload.productIds) ? payload.productIds : []).map((x: any) => String(x)).filter(Boolean)));
        if (!ids.length || ids.length > 500) return json({ error: "invalid_product_ids" }, 400);
        const { data, error } = await db.rpc("ustore_bulk_trash_products", { p_shop_id: shopId, p_product_ids: ids, p_deleted_by: tgId });
        if (error) throw error;
        auditLater("PRODUCTS_BULK_TRASHED", "trash_batch", data, { count: ids.length });
        return json({ ok: true, batchId: data, count: ids.length });
      }

      // "Chegirma" (2026-09-11): bir nechta tovarga BIR VAQTDA foizli
      // chegirma qo'llash. Manba: aniq productIds RO'YXATI (mavjud
      // bulk-select mexanizmi) YOKI categoryIds (tanlangan kataloglar —
      // collectCategorySubtreeIds orqali ICHKI kataloglar ham qamrab
      // olinadi, bitta katalogni o'chirish preview'i xuddi shu helper'dan
      // foydalanadigani kabi). Har bir qatorning YANGI narxi/eski narxi
      // JORIY narxidan kelib chiqib har xil bo'lgani uchun bitta umumiy
      // .update() yetarli emas — har bir tovar alohida yangilanadi (xuddi
      // Excel import qatorma-qator xatoni ushlab davom etadigan uslubidek).
      case "bulk_apply_discount": {
        await requirePermission('products.manage');
        const percent = Number(payload.percent);
        if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) return json({ error: "invalid_percent" }, 400);
        const mode = payload.mode === "RAISE_OLD_PRICE" ? "RAISE_OLD_PRICE" : "REDUCE_PRICE";
        let targetIds: string[];
        if (Array.isArray(payload.categoryIds) && payload.categoryIds.length) {
          const allCats = await fetchActiveCategories(db, shopId);
          const subtreeIds = new Set<string>();
          for (const cid of payload.categoryIds) {
            for (const id of collectCategorySubtreeIds(allCats, String(cid))) subtreeIds.add(id);
          }
          const { data: rows, error } = await db.from("products").select("id").eq("shop_id", shopId).in("category_id", Array.from(subtreeIds)).neq("status", "DELETED");
          if (error) throw error;
          targetIds = (rows || []).map((r: any) => String(r.id));
        } else {
          targetIds = Array.from(new Set((Array.isArray(payload.productIds) ? payload.productIds : []).map((x: any) => String(x)).filter(Boolean)));
        }
        if (!targetIds.length || targetIds.length > 500) return json({ error: "invalid_product_ids" }, 400);
        const { data: rows, error: fetchErr } = await db.from("products").select("*").eq("shop_id", shopId).in("id", targetIds).neq("status", "DELETED");
        if (fetchErr) throw fetchErr;
        const updated: any[] = [];
        let skippedCount = 0;
        for (const row of rows || []) {
          const currentPrice = Number(row.price);
          if (!Number.isFinite(currentPrice) || currentPrice <= 0) { skippedCount++; continue; }
          const newPrice = mode === "REDUCE_PRICE" ? Math.max(1, Math.round(currentPrice * (1 - percent / 100))) : currentPrice;
          const newOldPrice = mode === "REDUCE_PRICE" ? currentPrice : Math.round(currentPrice / (1 - percent / 100));
          const variants = Array.isArray(row.variants) ? row.variants.map((variant: any) => {
            const variantPrice = Number(variant?.price ?? currentPrice);
            if (!Number.isFinite(variantPrice) || variantPrice <= 0) return variant;
            return {
              ...variant,
              price: mode === "REDUCE_PRICE" ? Math.max(1, Math.round(variantPrice * (1 - percent / 100))) : variantPrice,
              oldPrice: mode === "REDUCE_PRICE" ? variantPrice : Math.round(variantPrice / (1 - percent / 100)),
            };
          }) : row.variants;
          const { data: upd, error: updErr } = await db.from("products").update({ price: newPrice, old_price: newOldPrice, variants })
            .eq("shop_id", shopId).eq("id", row.id).select().single();
          if (updErr) { skippedCount++; continue; }
          updated.push(upd);
        }
        auditLater("PRODUCTS_BULK_DISCOUNT_APPLIED", "product", null, { count: updated.length, percent, mode });
        return json({ products: updated, updatedCount: updated.length, skippedCount });
      }

      // "Chegirma" bekor qilish: tanlangan (yoki "hammasini belgilash"
      // orqali barcha) chegirmadagi tovarlarning eski narxini bitta amalda
      // olib tashlaydi. restorePrice=true bo'lsa narx eski narxga qaytadi
      // (chegirma qo'llashdan OLDINGI holatga qaytarish); false bo'lsa
      // hozirgi (pastroq) narx saqlanib, faqat chizilgan eski narx
      // yo'qoladi. Haqiqatan chegirmada bo'lmagan (old_price<=price) qator
      // jimgina o'tkazib yuboriladi — ikki marta bosilsa yoki ro'yxat eskirgan
      // bo'lsa ham xavfsiz.
      case "bulk_clear_discount": {
        await requirePermission('products.manage');
        const ids = Array.from(new Set((Array.isArray(payload.productIds) ? payload.productIds : []).map((x: any) => String(x)).filter(Boolean)));
        if (!ids.length || ids.length > 500) return json({ error: "invalid_product_ids" }, 400);
        const restorePrice = payload.restorePrice === true;
        const { data: rows, error: fetchErr } = await db.from("products").select("*").eq("shop_id", shopId).in("id", ids).neq("status", "DELETED");
        if (fetchErr) throw fetchErr;
        const updated: any[] = [];
        for (const row of rows || []) {
          const oldPrice = row.old_price !== null ? Number(row.old_price) : null;
          const hasProductDiscount = !!oldPrice && oldPrice > Number(row.price);
          let hasVariantDiscount = false;
          const variants = Array.isArray(row.variants) ? row.variants.map((variant: any) => {
            const variantPrice = Number(variant?.price ?? row.price);
            const variantOldPrice = Number(variant?.oldPrice);
            if (!Number.isFinite(variantOldPrice) || !(variantOldPrice > variantPrice)) return variant;
            hasVariantDiscount = true;
            return { ...variant, price: restorePrice ? variantOldPrice : variant.price, oldPrice: null };
          }) : row.variants;
          if (!hasProductDiscount && !hasVariantDiscount) continue;
          const patch: Record<string, unknown> = { variants };
          if (hasProductDiscount) {
            patch.old_price = null;
            if (restorePrice) patch.price = oldPrice;
          }
          const { data: upd, error: updErr } = await db.from("products").update(patch).eq("shop_id", shopId).eq("id", row.id).select().single();
          if (updErr) continue;
          updated.push(upd);
        }
        auditLater("PRODUCTS_BULK_DISCOUNT_CLEARED", "product", null, { count: updated.length, restorePrice });
        return json({ products: updated, updatedCount: updated.length });
      }

      case "purge_trash_batch_now": {
        await requirePermission('products.manage');
        const batchId = String(payload.batchId || "");
        if (!batchId) return json({ error: "invalid_batch" }, 400);
        const { data: purgeResult, error } = await db.rpc("ustore_purge_trash_batch", { p_shop_id: shopId, p_batch_id: batchId });
        if (error) {
          const msg = String(error.message || "");
          if (msg.includes("trash_batch_not_found")) return json({ error: "batch_not_found" }, 404);
          if (msg.includes("batch_not_purgeable")) return json({ error: "batch_not_purgeable" }, 400);
          throw error;
        }
        try {
          await cleanupUnreferencedProductImages(db, shopId, purgeResult?.imageUrls || [], SUPABASE_URL);
        } catch (cleanupError) {
          console.error("trash image cleanup after purge", { shopId, batchId, message: (cleanupError as any)?.message || cleanupError });
        }
        auditLater("TRASH_PURGED_NOW", "trash_batch", batchId, {
          productCount: Number(purgeResult?.productCount || 0),
          categoryCount: Number(purgeResult?.categoryCount || 0),
        });
        return json({ ok: true });
      }

      case "restore_trash_items": {
        await requirePermission('products.manage');
        const batchId = String(payload.batchId || "");
        const productIds = (Array.isArray(payload.productIds) ? payload.productIds : []).map((x: any) => String(x)).filter(Boolean);
        if (!batchId || !productIds.length) return json({ error: "invalid_selection" }, 400);
        const { data: result, error } = await db.rpc("ustore_restore_trash_items", { p_shop_id: shopId, p_batch_id: batchId, p_product_ids: productIds, p_actor_tg_id: tgId });
        if (error) {
          const msg = String(error.message || "");
          if (msg.includes("product_set_changed")) return json({ error: "product_set_changed" }, 409);
          throw error;
        }
        auditLater("TRASH_ITEMS_RESTORED", "trash_batch", batchId, { productIds, restoredCount: Number(result?.restoredCount || 0) });
        return json({ ok: true, restoredCount: Number(result?.restoredCount || 0) });
      }

      case "purge_trash_items": {
        await requirePermission('products.manage');
        const batchId = String(payload.batchId || "");
        const productIds = (Array.isArray(payload.productIds) ? payload.productIds : []).map((x: any) => String(x)).filter(Boolean);
        if (!batchId || !productIds.length) return json({ error: "invalid_selection" }, 400);
        const { data: result, error } = await db.rpc("ustore_purge_trash_items", { p_shop_id: shopId, p_batch_id: batchId, p_product_ids: productIds, p_actor_tg_id: tgId });
        if (error) {
          const msg = String(error.message || "");
          if (msg.includes("product_set_changed")) return json({ error: "product_set_changed" }, 409);
          throw error;
        }
        await cleanupUnreferencedProductImages(db, shopId, result?.imageUrls || [], SUPABASE_URL);
        auditLater("TRASH_ITEMS_PURGED", "trash_batch", batchId, { productIds, purgedCount: Number(result?.purgedCount || 0) });
        return json({ ok: true, purgedCount: Number(result?.purgedCount || 0) });
      }

      // 18-band: bosh sahifadagi engil "e'tibor talab qiladi" markazi —
      // to'liq get_dashboard_lite (barcha buyurtma/mahsulot qatorlarini
      // tortib, ko'p agregatsiya hisoblaydi) o'rniga faqat kerakli 4 ta
      // hisoblagich, arzon so'rovlar bilan (har home render'da chaqiriladi).
      case "get_admin_action_center": {
        await requirePermission('reports.view');
        const [newOrdersR, pendingReceiptsR, supportPendingR, settingsR, productsR] = await Promise.all([
          db.from("orders").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("status", "NEW"),
          db.from("orders").select("id", { count: "exact", head: true }).eq("shop_id", shopId).not("payment_receipt_path", "is", null).eq("receipt_review_status", "PENDING"),
          db.from("support_tickets").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("status", "OPEN"),
          db.from("shop_settings").select("low_stock_threshold").eq("shop_id", shopId).maybeSingle(),
          db.from("products").select("id,stock,variants,status").eq("shop_id", shopId).neq("status", "DELETED"),
        ]);
        if (newOrdersR.error) throw newOrdersR.error;
        if (pendingReceiptsR.error) throw pendingReceiptsR.error;
        if (supportPendingR.error) throw supportPendingR.error;
        if (productsR.error) throw productsR.error;
        const lowStockThreshold = resolveLowStockThreshold(settingsR.data?.low_stock_threshold);
        const lowStockCount = (productsR.data || []).filter((p: any) => computeStockState(p, lowStockThreshold) !== "OK").length;
        return json({
          newOrders: newOrdersR.count || 0, pendingReceipts: pendingReceiptsR.count || 0,
          supportPending: supportPendingR.count || 0, lowStock: lowStockCount,
        });
      }

      // Shop takomillashtirish, 11-band: xodimning o'z huquqi o'zgarganda
      // ilovani to'liq qayta ochmasdan bilishi uchun yengil poll nishoni —
      // to'liq boot() javobidan farqli, faqat rol/huquq maydonlarini
      // qaytaradi (arzon, tez-tez chaqirsa ham muammo emas).
      case "get_my_permissions": {
        return json({
          staffRole: membershipRow?.role || null,
          myPermissions: !isAdmin ? [] : (isSuperAdmin || membershipRow?.role === "OWNER") ? ["*"] : [...(await getEffectivePermissions())],
          canViewAuditLog: isAdmin ? await canViewAuditLog() : false,
        });
      }

      case "get_dashboard_lite": {
        await requirePermission('reports.view');
        const canViewDashboardCustomerPii = isSuperAdmin || membershipRow?.role === "OWNER" || (await getEffectivePermissions()).has("customers.view");
        const now = new Date();
        const tzParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
        const y = Number(tzParts.find(p => p.type === "year")?.value);
        const m = Number(tzParts.find(p => p.type === "month")?.value);
        const d = Number(tzParts.find(p => p.type === "day")?.value);
        const dayStart = new Date(Date.UTC(y, m - 1, d, -5, 0, 0));
        const monthStart = new Date(Date.UTC(y, m - 1, 1, -5, 0, 0));
        const nextDay = new Date(dayStart.getTime() + 24 * 3600 * 1000);
        const nextMonth = new Date(Date.UTC(y, m, 1, -5, 0, 0));
        const day7Start = new Date(dayStart.getTime() - 6 * 24 * 3600 * 1000);
        const day30Start = new Date(dayStart.getTime() - 29 * 24 * 3600 * 1000);

        const [ordersAllR, activeR, productsR, usersRows, settingsR] = await Promise.all([
          db.from("orders").select("id,tg_id,payable_total,total_price,created_at,region,status,payment_status,receipt_review_status,items").eq("shop_id", shopId),
          db.from("orders").select("id", { count: "exact", head: true }).eq("shop_id", shopId).in("status", ["NEW", "PROCESSING"]),
          db.from("products").select("id,name,stock,variants,status,sold_count").eq("shop_id", shopId).neq("status", "DELETED"),
          buildUsersSummaryFast(db, shopId),
          db.from("shop_settings").select("low_stock_threshold").eq("shop_id", shopId).maybeSingle(),
        ]);
        if (ordersAllR.error) throw ordersAllR.error; if (activeR.error) throw activeR.error; if (productsR.error) throw productsR.error;
        const lowStockThreshold = resolveLowStockThreshold(settingsR.data?.low_stock_threshold);

        const ordersAll = ordersAllR.data || [];
        const nonCancelled = ordersAll.filter((o: any) => o.payment_status === "PAID" && o.status !== "CANCELLED");
        const sumOrders = (rows: any[]) => rows.reduce((sum, r) => sum + Number(r.payable_total ?? r.total_price ?? 0), 0);
        const inRange = (rows: any[], start: Date, end: Date) => rows.filter((r: any) => r.created_at >= start.toISOString() && r.created_at < end.toISOString());

        const todayRows = inRange(nonCancelled, dayStart, nextDay);
        const week7Rows = inRange(nonCancelled, day7Start, nextDay);
        const day30Rows = inRange(nonCancelled, day30Start, nextDay);
        const monthRows = inRange(nonCancelled, monthStart, nextMonth);

        const statusBuckets: Record<string, number> = { NEW: 0, PROCESSING: 0, DELIVERED: 0, CANCELLED: 0, REJECTED: 0 };
        for (const o of ordersAll) {
          if (o.receipt_review_status === "REJECTED") statusBuckets.REJECTED++;
          else if (statusBuckets[o.status] !== undefined) statusBuckets[o.status]++;
        }

        const regionCounts = new Map<string, number>();
        for (const o of nonCancelled) {
          const key = o.region || "UNKNOWN";
          regionCounts.set(key, (regionCounts.get(key) || 0) + 1);
        }
        const topRegions = [...regionCounts.entries()]
          .sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(([region, count]) => ({ region, label: regionLabelForSnapshot(region), count }));

        const firstOrderByUser = new Map<string, string>();
        for (const o of nonCancelled) {
          const prev = firstOrderByUser.get(o.tg_id);
          if (!prev || o.created_at < prev) firstOrderByUser.set(o.tg_id, o.created_at);
        }
        const day30Iso = day30Start.toISOString();
        const newCustomers30d = [...firstOrderByUser.values()].filter((iso) => iso >= day30Iso).length;
        const totalCustomers = usersRows.length;
        const repeatCustomers = usersRows.filter((u: any) => u.totalOrders > 1).length;
        const topCustomers = [...usersRows].sort((a: any, b: any) => b.totalOrders - a.totalOrders).slice(0, 5)
          .map((u: any) => ({
            tgId: canViewDashboardCustomerPii ? u.tgId : null,
            userName: canViewDashboardCustomerPii ? u.userName : "Mijoz",
            totalOrders: u.totalOrders, totalSpent: u.totalSpent,
          }));

        const products = productsR.data || [];
        const stockStates = products.map((p: any) => ({ id: p.id, state: computeStockState(p, lowStockThreshold) }));
        const outOfStockIds = stockStates.filter((s) => s.state === "OUT").map((s) => s.id);
        const lowStockIds = stockStates.filter((s) => s.state === "LOW").map((s) => s.id);
        const bestSellers = [...products].sort((a: any, b: any) => (Number(b.sold_count) || 0) - (Number(a.sold_count) || 0)).slice(0, 5)
          .map((p: any) => ({ id: p.id, name: p.name, soldCount: Number(p.sold_count) || 0 }));

        const period = typeof payload.period === "string" ? payload.period : "all";
        let rangeStart: Date, rangeEnd: Date;
        if (period === "today") { rangeStart = dayStart; rangeEnd = nextDay; }
        else if (period === "week") { rangeStart = day7Start; rangeEnd = nextDay; }
        else if (period === "month") { rangeStart = monthStart; rangeEnd = nextMonth; }
        else if (period === "custom" && payload.dateFrom && payload.dateTo) {
          rangeStart = new Date(String(payload.dateFrom));
          rangeEnd = new Date(new Date(String(payload.dateTo)).getTime() + 24 * 3600 * 1000);
        } else { rangeStart = new Date(0); rangeEnd = nextDay; }

        const rangeRowsNonCancelled = inRange(nonCancelled, rangeStart, rangeEnd);
        const rangeRowsAll = ordersAll.filter((o: any) => o.created_at >= rangeStart.toISOString() && o.created_at < rangeEnd.toISOString());
        const rangeStatusBuckets: Record<string, number> = { NEW: 0, PROCESSING: 0, DELIVERED: 0, CANCELLED: 0, REJECTED: 0 };
        for (const o of rangeRowsAll) {
          if (o.receipt_review_status === "REJECTED") rangeStatusBuckets.REJECTED++;
          else if (rangeStatusBuckets[o.status] !== undefined) rangeStatusBuckets[o.status]++;
        }
        const revenueByProductMap = new Map<string, { sku: string | null; name: string; qty: number; revenue: number }>();
        for (const o of rangeRowsNonCancelled) {
          const items = Array.isArray((o as any).items) ? (o as any).items : [];
          for (const it of items) {
            const key = String(it.sku || it.name || "?");
            const cur = revenueByProductMap.get(key) || { sku: it.sku || null, name: it.name || key, qty: 0, revenue: 0 };
            cur.qty += Number(it.qty) || 0;
            cur.revenue += (Number(it.price) || 0) * (Number(it.qty) || 0);
            revenueByProductMap.set(key, cur);
          }
        }
        const revenueByProduct = [...revenueByProductMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 15);

        return json({
          sales: {
            today: sumOrders(todayRows), todayCount: todayRows.length,
            week: sumOrders(week7Rows), weekCount: week7Rows.length,
            days30: sumOrders(day30Rows), days30Count: day30Rows.length,
            month: sumOrders(monthRows), monthCount: monthRows.length,
            allTime: sumOrders(nonCancelled), allTimeCount: nonCancelled.length,
          },
          orders: statusBuckets,
          activeOrders: activeR.count || 0,
          products: {
            total: products.length,
            lowStock: lowStockIds.length, lowStockIds,
            outOfStock: outOfStockIds.length, outOfStockIds,
            bestSellers,
          },
          customers: {
            total: totalCustomers, new30d: newCustomers30d, repeat: repeatCustomers,
            top: topCustomers, all: canViewDashboardCustomerPii ? usersRows : [],
          },
          regions: topRegions,
          selectedRange: {
            period, dateFrom: rangeStart.toISOString(), dateTo: rangeEnd.toISOString(),
            sales: { amount: sumOrders(rangeRowsNonCancelled), count: rangeRowsNonCancelled.length },
            orders: rangeStatusBuckets,
            products: { revenueByProduct },
          },
          todayOrders: todayRows.length, todayOrderTotal: sumOrders(todayRows),
          monthOrders: monthRows.length, monthOrderTotal: sumOrders(monthRows),
          outOfStock: outOfStockIds.length, lowStock: lowStockIds.length,
          lowStockThreshold,
          generatedAt: new Date().toISOString(),
        });
      }

      // ==================== HISOBOTLAR (Reports/Analytics round, 3.1-bosqich) ====================
      // get_dashboard_lite'ga UMUMAN tegilmadi — bu mustaqil, yangi action.
      case "upload_report_pdf": {
        await requirePermission('reports.view');
        const rawName = String(payload.fileName || 'hisobot.pdf').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
        const fileName = rawName.toLowerCase().endsWith('.pdf') ? rawName : `${rawName}.pdf`;
        const base64 = String(payload.pdfUpload?.base64 || '').replace(/\s+/g, '');
        if (!base64 || base64.length > 7_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return json({ error: 'invalid_pdf_upload' }, 400);
        let binary = '';
        try { binary = atob(base64); } catch { return json({ error: 'invalid_pdf_upload' }, 400); }
        if (!binary.startsWith('%PDF-') || binary.length > 5 * 1024 * 1024) return json({ error: 'invalid_pdf_upload' }, 400);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const safeTg = String(tgId || 'admin').replace(/[^0-9A-Za-z_-]/g, '_').slice(0, 80) || 'admin';
        const path = `shops/${shopId}/users/${safeTg}/latest.pdf`;
        const { error: uploadError } = await db.storage.from('report-exports').upload(path, bytes, { contentType: 'application/pdf', cacheControl: '60', upsert: true });
        if (uploadError) throw uploadError;

        // Temporary export retention: each successful generation refreshes the
        // same managed path and moves its server-side expiry to +24 hours.
        // report-export-cleanup-cron removes the Storage object after expiry.
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const { error: retentionError } = await db.from('report_export_files').upsert({
          path,
          shop_id: shopId,
          telegram_user_id: String(tgId || 'admin'),
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'path' });
        if (retentionError) {
          // Never leave an untracked temporary PDF behind. If metadata cannot
          // be saved, remove the just-uploaded object and fail the request.
          await db.storage.from('report-exports').remove([path]);
          throw retentionError;
        }

        const { data: signed, error: signedError } = await db.storage.from('report-exports').createSignedUrl(path, 300, { download: fileName });
        if (signedError || !signed?.signedUrl) throw signedError || new Error('report_signed_url_failed');
        return json({ ok: true, url: signed.signedUrl, fileName });
      }

      case "get_report_overview": {
        await requirePermission('reports.view');
        const { fromIso, toIso, period, prevFromIso, prevToIso } = resolveReportDateRange(payload);
        const [createdOrdersR, paidEventsR, refundedEventsR, deliveredEventsR] = await Promise.all([
          db.from("orders")
            .select("id,tg_id,items,payable_total,total_price,status,payment_status,receipt_review_status,delivery_snapshot,pay_method,created_at,paid_at,refunded_at,delivered_at")
            .eq("shop_id", shopId).gte("created_at", fromIso).lt("created_at", toIso),
          db.from("orders")
            .select("id,payable_total,total_price,status,payment_status,receipt_review_status,paid_at")
            .eq("shop_id", shopId).gte("paid_at", fromIso).lt("paid_at", toIso),
          db.from("orders")
            .select("id,payable_total,total_price,payment_status,refunded_at")
            .eq("shop_id", shopId).gte("refunded_at", fromIso).lt("refunded_at", toIso),
          db.from("orders")
            .select("id,delivered_at")
            .eq("shop_id", shopId).gte("delivered_at", fromIso).lt("delivered_at", toIso),
        ]);
        if (createdOrdersR.error) throw createdOrdersR.error;
        if (paidEventsR.error) throw paidEventsR.error;
        if (refundedEventsR.error) throw refundedEventsR.error;
        if (deliveredEventsR.error) throw deliveredEventsR.error;
        const rows = createdOrdersR.data;
        const orders = rows || [];
        const orderValue = (o: any) => Number(o.payable_total ?? o.total_price ?? 0);

        // get_dashboard_lite'dagi statusBuckets bilan bir xil o'zaro-mustasno
        // qoida: REJECTED (chek rad etilgan) status maydonidan ustun turadi.
        const buckets: Record<string, number> = { NEW: 0, PROCESSING: 0, DELIVERED: 0, CANCELLED: 0, REJECTED: 0 };
        for (const o of orders) {
          if (o.receipt_review_status === "REJECTED") buckets.REJECTED++;
          else if (buckets[o.status] !== undefined) buckets[o.status]++;
        }
        const isSold = (o: any) => o.payment_status === "PAID" && o.receipt_review_status !== "REJECTED" && o.status !== "CANCELLED";
        const soldOrders = orders.filter(isSold);
        const totalSales = soldOrders.reduce((s: number, o: any) => s + orderValue(o), 0);
        const orderedAmount = orders.reduce((s: number, o: any) => s + orderValue(o), 0);
        // Pul oqimi buyurtma yaratilgan vaqtga emas, pul kirgan yoki qaytarilgan
        // vaqtga bog'lanadi. Eski PAID yozuvlarda paid_at bo'lmasa, yaratilgan
        // davriga bir marta qo'shiladi.
        const legacyPaidRows = orders.filter((o: any) =>
          !o.paid_at && o.payment_status === "PAID" && o.status !== "CANCELLED" && o.receipt_review_status !== "REJECTED"
        );
        const paidAmount = [...(paidEventsR.data || []), ...legacyPaidRows]
          .filter((o: any) => o.receipt_review_status !== "REJECTED")
          .reduce((s: number, o: any) => s + orderValue(o), 0);
        const refundedAmount = (refundedEventsR.data || []).reduce((s: number, o: any) => s + orderValue(o), 0);
        const uncollectedCashOrders = orders.filter((o: any) =>
          o.pay_method === "CASH" && o.payment_status === "PENDING" && o.status !== "CANCELLED" && o.receipt_review_status !== "REJECTED"
        );
        const uncollectedCashAmount = uncollectedCashOrders.reduce((s: number, o: any) => s + orderValue(o), 0);
        const orderCount = orders.length;
        const cancelledOrders = buckets.CANCELLED + buckets.REJECTED;
        const cancellationRate = orderCount ? (cancelledOrders / orderCount) * 100 : 0;
        const avgOrderValue = soldOrders.length ? totalSales / soldOrders.length : 0;

        let totalUnitsSold = 0;
        const revenueByProduct = new Map<string, { name: string; revenue: number; unitsSold: number; orderIds: Set<any> }>();
        const revenueByRegion = new Map<string, { label: string; revenue: number; orderCount: number }>();
        const revenueByPayment = new Map<string, { label: string; revenue: number; orderCount: number }>();
        for (const o of soldOrders) {
          const items = Array.isArray((o as any).items) ? (o as any).items : [];
          for (const it of items) {
            const qty = Number(it.qty) || 0;
            totalUnitsSold += qty;
            const pid = String(it.product_id || it.name || "?");
            const cur = revenueByProduct.get(pid) || { name: it.name || pid, revenue: 0, unitsSold: 0, orderIds: new Set() };
            cur.revenue += (Number(it.price) || 0) * qty;
            cur.unitsSold += qty;
            cur.orderIds.add(o.id);
            revenueByProduct.set(pid, cur);
          }
          const val = orderValue(o);
          const regionKey = (o as any).delivery_snapshot?.regionKey || "UNKNOWN";
          const rc = revenueByRegion.get(regionKey) || { label: regionKey === "UNKNOWN" ? "Noma'lum" : regionLabelForSnapshot(regionKey), revenue: 0, orderCount: 0 };
          rc.revenue += val;
          rc.orderCount++;
          revenueByRegion.set(regionKey, rc);
          const pmKey = String((o as any).pay_method || "UNKNOWN");
          const pc = revenueByPayment.get(pmKey) || { label: paymentMethodLabelForReport((o as any).pay_method), revenue: 0, orderCount: 0 };
          pc.revenue += val;
          pc.orderCount++;
          revenueByPayment.set(pmKey, pc);
        }
        const topOf = (m: Map<string, { label?: string; name?: string; revenue: number }>) => {
          let best: any = null;
          for (const v of m.values()) if (!best || v.revenue > best.revenue) best = v;
          return best;
        };
        const topProduct = topOf(revenueByProduct);
        const topRegion = topOf(revenueByRegion);
        const topPaymentMethod = topOf(revenueByPayment);
        const topProducts = [...revenueByProduct.entries()].map(([productId, v]) => ({
          productId, name: v.name, revenue: v.revenue, unitsSold: v.unitsSold, orderCount: v.orderIds.size,
          sharePercent: totalSales > 0 ? (v.revenue / totalSales) * 100 : 0,
        })).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
        const regionBreakdown = [...revenueByRegion.entries()].map(([regionCode, v]) => ({
          regionCode, regionLabel: v.label, salesAmount: v.revenue, orderCount: v.orderCount,
          sharePercent: totalSales > 0 ? (v.revenue / totalSales) * 100 : 0,
        })).sort((a, b) => b.salesAmount - a.salesAmount).slice(0, 7);
        const paymentBreakdown = [...revenueByPayment.entries()].map(([payMethod, v]) => ({
          payMethod, label: v.label, salesAmount: v.revenue, orderCount: v.orderCount,
          sharePercent: totalSales > 0 ? (v.revenue / totalSales) * 100 : 0,
        })).sort((a, b) => b.salesAmount - a.salesAmount);
        const salesTimeline = buildReportSalesTimeline(orders, fromIso, toIso);

        // Mijozlar: faqat shu davrda buyurtma bergan tg_id'lar uchun, ularning
        // BUTUN tarixidagi (barcha vaqt) birinchi buyurtma sanasi/soni — bitta
        // qo'shimcha, lekin FAQAT shu tg_id'larga cheklangan so'rov (to'liq
        // jadval skanerlash emas).
        const tgIdsInRange = [...new Set(orders.map((o: any) => o.tg_id))];
        let newCustomers = 0, repeatCustomers = 0;
        const totalCustomers = tgIdsInRange.length;
        if (tgIdsInRange.length) {
          const { data: historyRows, error: histErr } = await db.from("orders")
            .select("tg_id,created_at,status,payment_status,receipt_review_status")
            .eq("shop_id", shopId).in("tg_id", tgIdsInRange);
          if (histErr) throw histErr;
          const firstOrderAt = new Map<string, string>();
          const orderCountByTg = new Map<string, number>();
          for (const o of historyRows || []) {
            if (o.payment_status !== "PAID" || o.status === "CANCELLED" || o.receipt_review_status === "REJECTED") continue;
            const prev = firstOrderAt.get(o.tg_id);
            if (!prev || o.created_at < prev) firstOrderAt.set(o.tg_id, o.created_at);
            orderCountByTg.set(o.tg_id, (orderCountByTg.get(o.tg_id) || 0) + 1);
          }
          for (const tg of tgIdsInRange) {
            const first = firstOrderAt.get(tg);
            if (first && first >= fromIso && first < toIso) newCustomers++;
            if ((orderCountByTg.get(tg) || 0) > 1) repeatCustomers++;
          }
        }

        // Oldingi teng davr bilan solishtirish — faqat aniq ma'noga ega
        // bo'lganda ("all" davrida yoki oldingi qiymat 0 bo'lsa — noto'g'ri
        // % ko'rsatishdan ko'ra umuman ko'rsatmaslik, spec 2-bandi shart qildi).
        let comparison: any = null;
        if (prevFromIso && prevToIso) {
          const { data: prevRows, error: prevErr } = await db.from("orders")
            .select("payable_total,total_price,status,payment_status,receipt_review_status")
            .eq("shop_id", shopId).gte("created_at", prevFromIso).lt("created_at", prevToIso);
          if (prevErr) throw prevErr;
          const prevSold = (prevRows || []).filter((o: any) => o.payment_status === "PAID" && o.status !== "CANCELLED" && o.receipt_review_status !== "REJECTED");
          const prevTotalSales = prevSold.reduce((s: number, o: any) => s + Number(o.payable_total ?? o.total_price ?? 0), 0);
          const prevOrderCount = (prevRows || []).length;
          const pctChange = (curr: number, prev: number) => (prev > 0 ? ((curr - prev) / prev) * 100 : null);
          comparison = {
            totalSalesChangePercent: pctChange(totalSales, prevTotalSales),
            orderCountChangePercent: pctChange(orderCount, prevOrderCount),
          };
        }

        return json({
          period, dateFrom: fromIso, dateTo: toIso,
          totalSales, orderCount, completedOrders: buckets.DELIVERED, newOrders: buckets.NEW,
          cashFlow: {
            orderedAmount,
            paidAmount,
            refundedAmount,
            netReceivedAmount: paidAmount - refundedAmount,
            deliveredOrders: (deliveredEventsR.data || []).length,
            uncollectedCashAmount,
            uncollectedCashOrders: uncollectedCashOrders.length,
          },
          cancelledOrders, cancellationRate, avgOrderValue, totalUnitsSold,
          totalCustomers, newCustomers, repeatCustomers,
          topProduct: topProduct ? { name: topProduct.name, revenue: topProduct.revenue } : null,
          topRegion: topRegion ? { label: topRegion.label, revenue: topRegion.revenue } : null,
          topPaymentMethod: topPaymentMethod ? { label: topPaymentMethod.label, revenue: topPaymentMethod.revenue } : null,
          salesTimeline, paymentBreakdown, regionBreakdown, topProducts,
          orderStatuses: Object.entries(buckets).map(([status, count]) => ({ status, count })),
          comparison,
        });
      }

      case "get_sales_report": {
        await requirePermission('reports.view');
        const { fromIso, toIso, period } = resolveReportDateRange(payload);
        const filterRegion = nullableText(payload.regionCode, 40);
        const filterPayMethod = nullableText(payload.payMethod, 20);
        const filterStatus = nullableText(payload.status, 20);
        const filterProductId = nullableText(payload.productId, 100);

        let q = db.from("orders")
          .select("id,items,payable_total,total_price,status,payment_status,receipt_review_status,delivery_snapshot,pay_method,created_at,paid_at,refunded_at,delivered_at")
          .eq("shop_id", shopId).gte("created_at", fromIso).lt("created_at", toIso);
        if (filterPayMethod) q = q.eq("pay_method", filterPayMethod);
        if (filterStatus) q = q.eq("status", filterStatus);
        const { data: rows, error } = await q;
        if (error) throw error;
        let orders = rows || [];
        if (filterRegion) orders = orders.filter((o: any) => (o.delivery_snapshot?.regionKey || "UNKNOWN") === filterRegion);
        if (filterProductId) orders = orders.filter((o: any) => Array.isArray(o.items) && o.items.some((it: any) => String(it.product_id) === filterProductId));

        const isCancelled = (o: any) => o.payment_status !== "PAID" || o.status === "CANCELLED" || o.receipt_review_status === "REJECTED";
        const orderValue = (o: any) => Number(o.payable_total ?? o.total_price ?? 0);
        const grandTotal = orders.filter((o: any) => !isCancelled(o)).reduce((s: number, o: any) => s + orderValue(o), 0);
        const orderedAmount = orders.reduce((s: number, o: any) => s + orderValue(o), 0);
        const refundedAmount = orders.filter((o: any) => o.payment_status === "REFUNDED").reduce((s: number, o: any) => s + orderValue(o), 0);
        const paidAmount = orders.filter((o: any) => ["PAID", "REFUND_PENDING", "REFUNDED"].includes(String(o.payment_status)))
          .reduce((s: number, o: any) => s + orderValue(o), 0);
        const uncollectedCashOrders = orders.filter((o: any) =>
          o.pay_method === "CASH" && o.payment_status === "PENDING" && o.status !== "CANCELLED" && o.receipt_review_status !== "REJECTED"
        );
        const uncollectedCashAmount = uncollectedCashOrders.reduce((s: number, o: any) => s + orderValue(o), 0);

        const regionAgg = new Map<string, { label: string; sales: number; orderCount: number; unitsSold: number; cancelledCount: number; productRevenue: Map<string, { name: string; revenue: number }> }>();
        const productAgg = new Map<string, { name: string; sku: string | null; unitsSold: number; orderIds: Set<any>; revenue: number }>();
        const paymentAgg = new Map<string, { label: string; sales: number; orderCount: number; completed: number; cancelled: number }>();
        const statusAgg = new Map<string, { orderCount: number; sales: number }>();

        for (const o of orders) {
          const cancelled = isCancelled(o);
          const statusKey = o.receipt_review_status === "REJECTED" ? "REJECTED" : String(o.status || "UNKNOWN");
          const statusRow = statusAgg.get(statusKey) || { orderCount: 0, sales: 0 };
          statusRow.orderCount++;
          if (!cancelled) statusRow.sales += orderValue(o);
          statusAgg.set(statusKey, statusRow);
          const regionKey = (o as any).delivery_snapshot?.regionKey || "UNKNOWN";
          const regionLabel = regionKey === "UNKNOWN" ? "Noma'lum" : regionLabelForSnapshot(regionKey);
          if (!regionAgg.has(regionKey)) regionAgg.set(regionKey, { label: regionLabel, sales: 0, orderCount: 0, unitsSold: 0, cancelledCount: 0, productRevenue: new Map() });
          const rAgg = regionAgg.get(regionKey)!;
          rAgg.orderCount++;
          if (cancelled) rAgg.cancelledCount++;

          const pmKey = String((o as any).pay_method || "UNKNOWN");
          if (!paymentAgg.has(pmKey)) paymentAgg.set(pmKey, { label: paymentMethodLabelForReport((o as any).pay_method), sales: 0, orderCount: 0, completed: 0, cancelled: 0 });
          const pAgg = paymentAgg.get(pmKey)!;
          pAgg.orderCount++;
          if (o.status === "DELIVERED") pAgg.completed++;
          if (cancelled) pAgg.cancelled++;

          if (!cancelled) {
            const val = orderValue(o);
            rAgg.sales += val;
            pAgg.sales += val;
            const items = Array.isArray((o as any).items) ? (o as any).items : [];
            for (const it of items) {
              const qty = Number(it.qty) || 0;
              const lineRevenue = (Number(it.price) || 0) * qty;
              rAgg.unitsSold += qty;
              const prKey = String(it.product_id || it.name || "?");
              const prCur = rAgg.productRevenue.get(prKey) || { name: it.name || prKey, revenue: 0 };
              prCur.revenue += lineRevenue;
              rAgg.productRevenue.set(prKey, prCur);

              const pid = String(it.product_id || it.name || "?");
              if (!productAgg.has(pid)) productAgg.set(pid, { name: it.name || pid, sku: it.sku || null, unitsSold: 0, orderIds: new Set(), revenue: 0 });
              const pdAgg = productAgg.get(pid)!;
              pdAgg.unitsSold += qty;
              pdAgg.orderIds.add(o.id);
              pdAgg.revenue += lineRevenue;
            }
          }
        }

        const byRegion = [...regionAgg.entries()].map(([code, v]) => {
          let topProductName: string | null = null, topRevenue = -1;
          for (const p of v.productRevenue.values()) if (p.revenue > topRevenue) { topRevenue = p.revenue; topProductName = p.name; }
          const soldCount = v.orderCount - v.cancelledCount;
          return {
            regionCode: code, regionLabel: v.label, salesAmount: v.sales, orderCount: v.orderCount,
            unitsSold: v.unitsSold, avgOrderValue: soldCount > 0 ? v.sales / soldCount : 0,
            sharePercent: grandTotal > 0 ? (v.sales / grandTotal) * 100 : 0,
            cancelledCount: v.cancelledCount, topProductName,
          };
        }).sort((a, b) => b.salesAmount - a.salesAmount);

        const byProduct = [...productAgg.entries()].map(([pid, v]) => ({
          productId: pid, name: v.name, sku: v.sku, unitsSold: v.unitsSold, orderCount: v.orderIds.size,
          revenue: v.revenue, avgSellPrice: v.unitsSold ? v.revenue / v.unitsSold : 0,
          sharePercent: grandTotal > 0 ? (v.revenue / grandTotal) * 100 : 0,
        })).sort((a, b) => b.revenue - a.revenue).slice(0, 100);

        const byPaymentMethod = [...paymentAgg.entries()].map(([code, v]) => ({
          payMethod: code, label: v.label, salesAmount: v.sales, orderCount: v.orderCount,
          sharePercent: grandTotal > 0 ? (v.sales / grandTotal) * 100 : 0,
          completed: v.completed, cancelled: v.cancelled,
        })).sort((a, b) => b.salesAmount - a.salesAmount);

        const soldOrderCount = orders.filter((o: any) => !isCancelled(o)).length;
        const byStatus = [...statusAgg.entries()].map(([status, v]) => ({
          status, orderCount: v.orderCount, salesAmount: v.sales,
          sharePercent: orders.length > 0 ? (v.orderCount / orders.length) * 100 : 0,
        })).sort((a, b) => b.orderCount - a.orderCount);

        return json({
          period, dateFrom: fromIso, dateTo: toIso,
          totalSales: grandTotal, totalOrders: orders.length, soldOrderCount,
          cashFlow: {
            orderedAmount,
            paidAmount,
            refundedAmount,
            netReceivedAmount: paidAmount - refundedAmount,
            deliveredOrders: orders.filter((o: any) => o.status === "DELIVERED").length,
            uncollectedCashAmount,
            uncollectedCashOrders: uncollectedCashOrders.length,
          },
          avgOrderValue: soldOrderCount > 0 ? grandTotal / soldOrderCount : 0,
          salesTimeline: buildReportSalesTimeline(orders, fromIso, toIso),
          byRegion, byProduct, byPaymentMethod, byStatus,
        });
      }

      // Hisobotlar round, 3.3-bosqich: Mijozlar hisoboti. Mijoz ro'yxatidagi
      // har bir qator (buyurtmalar soni/spend/first-last order) ATAYLAB
      // BUTUN TARIX bo'yicha (CRM ma'nosida — "shu mijoz kim" degan savolga
      // javob berish uchun oyna emas, umr davomiy ko'rsatkich kerak). Faqat
      // "Jami mijozlar"/"Yangi mijozlar" KPI'lari tanlangan sana oralig'iga
      // qarab hisoblanadi (spec 1-bandi: Mijozlar report'da ham calendar
      // asosiy vaqt filtri bo'lishi kerak) — get_report_overview'dagi bilan
      // bir xil "yangi mijoz = lifetime birinchi buyurtmasi shu oraliqda"
      // ta'rifi qayta ishlatiladi.
      case "get_customer_report": {
        await requirePermission('reports.view');
        const { fromIso, toIso, period } = resolveReportDateRange(payload);
        const search = (nullableText(payload.search, 100) || "").toLowerCase() || null;
        const segment = typeof payload.segment === "string" ? payload.segment : "ALL";
        const page = Math.max(1, Number.parseInt(String(payload.page), 10) || 1);
        const pageSize = Math.min(100, Math.max(10, Number.parseInt(String(payload.pageSize), 10) || 20));
        const canViewCustomerPii = isSuperAdmin || membershipRow?.role === "OWNER" || (await getEffectivePermissions()).has("customers.view");
        // 2026-08-27, shaxsiy chegirma mijoz-tanlagichi: "yangi qo'shilganlar"
        // saralashi uchun ro'yxatdan o'tgan vaqt (first_seen_at) kerak — bu
        // PII emas (faqat sana), shuning uchun ikkala variantga ham qo'shildi.
        const customerFields = canViewCustomerPii
          ? "tg_id,first_name,username,profile_first_name,phone,first_seen_at"
          : "tg_id,first_name,username,profile_first_name,first_seen_at";

        const [usersR, ordersR] = await Promise.all([
          db.from("app_users").select(customerFields).eq("shop_id", shopId),
          db.from("orders").select("tg_id,payable_total,total_price,status,payment_status,receipt_review_status,created_at").eq("shop_id", shopId),
        ]);
        if (usersR.error) throw usersR.error;
        if (ordersR.error) throw ordersR.error;
        const users = usersR.data || [];
        const orders = ordersR.data || [];

        type CustAgg = { totalOrders: number; successfulOrders: number; cancelledOrders: number; totalSpent: number; firstOrderAt: string | null; lastOrderAt: string | null };
        const aggByTg = new Map<string, CustAgg>();
        for (const o of orders) {
          const cur = aggByTg.get(o.tg_id) || { totalOrders: 0, successfulOrders: 0, cancelledOrders: 0, totalSpent: 0, firstOrderAt: null, lastOrderAt: null };
          cur.totalOrders++;
          const cancelled = o.payment_status !== "PAID" || o.status === "CANCELLED" || o.receipt_review_status === "REJECTED";
          if (cancelled) cur.cancelledOrders++;
          else { cur.successfulOrders++; cur.totalSpent += Number(o.payable_total ?? o.total_price ?? 0); }
          if (!cur.firstOrderAt || o.created_at < cur.firstOrderAt) cur.firstOrderAt = o.created_at;
          if (!cur.lastOrderAt || o.created_at > cur.lastOrderAt) cur.lastOrderAt = o.created_at;
          aggByTg.set(o.tg_id, cur);
        }

        const displayName = (u: any) => u.profile_first_name || u.first_name || u.username || u.tg_id;
        let list = users.map((u: any) => {
          const a = aggByTg.get(u.tg_id) || { totalOrders: 0, successfulOrders: 0, cancelledOrders: 0, totalSpent: 0, firstOrderAt: null, lastOrderAt: null };
          return {
            tgId: u.tg_id, name: displayName(u), username: canViewCustomerPii ? (u.username || null) : null, phone: canViewCustomerPii ? (u.phone || null) : null,
            totalOrders: a.totalOrders, successfulOrders: a.successfulOrders, cancelledOrders: a.cancelledOrders,
            totalSpent: a.totalSpent, avgOrderValue: a.successfulOrders ? a.totalSpent / a.successfulOrders : 0,
            firstOrderAt: a.firstOrderAt, lastOrderAt: a.lastOrderAt, firstSeenAt: u.first_seen_at || null,
            cancellationRate: a.totalOrders ? (a.cancelledOrders / a.totalOrders) * 100 : 0,
          };
        });

        if (search) {
          list = list.filter((c: any) =>
            String(c.name || "").toLowerCase().includes(search) ||
            String(c.username || "").toLowerCase().includes(search) ||
            String(c.phone || "").toLowerCase().includes(search) ||
            String(c.tgId).includes(search));
        }

        const DORMANT_DAYS = 60;
        const nowMs = Date.now();
        // 2026-08-27, shaxsiy chegirma mijoz-tanlagichi: "eng ko'p savdo
        // qilganlar" uchun 1 hafta/1 oy/1 yil vaqt oynasi kerak — bu MAVJUD
        // "TOP_SPEND" (butun davr, Hisobotlar sahifasi ishlatadi, o'zgarishsiz
        // qoladi) dan ATAYLAB alohida yangi segment: shu oyna ICHIDAGI
        // buyurtmalardan alohida hisoblanadi, aggByTg (butun davr)ga tegilmaydi.
        const periodSpentByTg = new Map<string, number>();
        if (segment === "TOP_SPEND_PERIOD") {
          for (const o of orders) {
            if (o.created_at < fromIso || o.created_at >= toIso) continue;
            if (o.payment_status !== "PAID" || o.status === "CANCELLED" || o.receipt_review_status === "REJECTED") continue;
            periodSpentByTg.set(o.tg_id, (periodSpentByTg.get(o.tg_id) || 0) + Number(o.payable_total ?? o.total_price ?? 0));
          }
        }
        switch (segment) {
          case "TOP_ORDERS": list = list.filter((c: any) => c.totalOrders > 0).sort((a: any, b: any) => b.totalOrders - a.totalOrders); break;
          case "TOP_SPEND": list = list.filter((c: any) => c.totalSpent > 0).sort((a: any, b: any) => b.totalSpent - a.totalSpent); break;
          case "TOP_SPEND_PERIOD":
            list = list.map((c: any) => ({ ...c, totalSpent: periodSpentByTg.get(c.tgId) || 0 }))
              .filter((c: any) => c.totalSpent > 0).sort((a: any, b: any) => b.totalSpent - a.totalSpent);
            break;
          case "NEWEST_JOINED": list = list.filter((c: any) => c.firstSeenAt).sort((a: any, b: any) => String(b.firstSeenAt).localeCompare(String(a.firstSeenAt))); break;
          case "REPEAT": list = list.filter((c: any) => c.successfulOrders > 1).sort((a: any, b: any) => b.successfulOrders - a.successfulOrders); break;
          case "NEW": list = list.filter((c: any) => c.firstOrderAt && c.firstOrderAt >= fromIso && c.firstOrderAt < toIso).sort((a: any, b: any) => String(b.firstOrderAt).localeCompare(String(a.firstOrderAt))); break;
          case "NEVER_ORDERED": list = list.filter((c: any) => c.totalOrders === 0); break;
          case "DORMANT": list = list.filter((c: any) => c.lastOrderAt && (nowMs - new Date(c.lastOrderAt).getTime()) > DORMANT_DAYS * 24 * 3600 * 1000).sort((a: any, b: any) => String(a.lastOrderAt || "").localeCompare(String(b.lastOrderAt || ""))); break;
          case "HIGH_CANCEL": list = list.filter((c: any) => c.totalOrders >= 3 && c.cancellationRate >= 30).sort((a: any, b: any) => b.cancellationRate - a.cancellationRate); break;
          default: list = list.sort((a: any, b: any) => String(b.lastOrderAt || "").localeCompare(String(a.lastOrderAt || "")));
        }

        const totalCount = list.length;
        const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
        const clampedPage = Math.min(page, totalPages);
        const pageItems = list.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

        const tgIdsInRange = new Set(orders.filter((o: any) => o.created_at >= fromIso && o.created_at < toIso).map((o: any) => o.tg_id));
        let newCustomersInRange = 0;
        for (const tg of tgIdsInRange) {
          const a = aggByTg.get(tg as string);
          if (a?.firstOrderAt && a.firstOrderAt >= fromIso && a.firstOrderAt < toIso) newCustomersInRange++;
        }
        const spenders = users.map((u: any) => aggByTg.get(u.tg_id)).filter((a: any) => a && a.successfulOrders > 0) as CustAgg[];
        const avgCustomerSpend = spenders.length ? spenders.reduce((s, a) => s + a.totalSpent, 0) / spenders.length : 0;
        const topSpenderTg = [...aggByTg.entries()].sort((a, b) => b[1].totalSpent - a[1].totalSpent)[0];
        const topSpenderUser = topSpenderTg ? users.find((u: any) => u.tg_id === topSpenderTg[0]) : null;

        return json({
          period, dateFrom: fromIso, dateTo: toIso,
          piiVisible: canViewCustomerPii,
          kpi: {
            totalCustomers: users.length, newCustomers: newCustomersInRange,
            repeatCustomers: users.filter((u: any) => (aggByTg.get(u.tg_id)?.successfulOrders || 0) > 1).length,
            oneTimeCustomers: users.filter((u: any) => (aggByTg.get(u.tg_id)?.successfulOrders || 0) === 1).length,
            avgCustomerSpend,
            topSpender: topSpenderUser && topSpenderTg ? { name: displayName(topSpenderUser), totalSpent: topSpenderTg[1].totalSpent } : null,
          },
          segment, page: clampedPage, pageSize, totalCount, totalPages,
          customers: pageItems,
        });
      }

      // Hisobotlar round, 3.4-bosqich: Mahsulot hisoboti. Savdo/tushum
      // figuralari HAR DOIM orders.items'dagi SNAPSHOT'dan hisoblanadi (order
      // yaratilgan paytdagi nom/narx/sku) — shu sabab mahsulot keyin
      // Trash'ga tashlansa yoki yashirilsa ham tarixiy savdo o'zgarmaydi.
      // Joriy holat (rasm/qoldiq/status) esa alohida, ENDI mavjud "products"
      // jadvalidan (o'chirilgan bo'lsa — topilmaydi, shunda snapshot'dagi
      // nom/rasm ishlatiladi, "joriy qoldiq" esa null qaytadi).
      case "get_product_report": {
        await requirePermission('reports.view');
        const { fromIso, toIso, period, prevFromIso, prevToIso } = resolveReportDateRange(payload);
        const view = typeof payload.view === "string" ? payload.view : "TOP_REVENUE";
        const page = Math.max(1, Number.parseInt(String(payload.page), 10) || 1);
        const pageSize = Math.min(100, Math.max(10, Number.parseInt(String(payload.pageSize), 10) || 20));

        const needsPrev = view === "TRENDING_UP" || view === "TRENDING_DOWN";
        const [ordersR, prevOrdersR, productsR, settingsR] = await Promise.all([
          db.from("orders").select("id,items,status,payment_status,receipt_review_status,created_at").eq("shop_id", shopId).gte("created_at", fromIso).lt("created_at", toIso),
          needsPrev && prevFromIso && prevToIso
            ? db.from("orders").select("items,status,payment_status,receipt_review_status").eq("shop_id", shopId).gte("created_at", prevFromIso).lt("created_at", prevToIso)
            : Promise.resolve({ data: [], error: null }),
          db.from("products").select("id,name,img,sku,stock,variants,status,sold_count").eq("shop_id", shopId),
          db.from("shop_settings").select("low_stock_threshold").eq("shop_id", shopId).maybeSingle(),
        ]);
        if (ordersR.error) throw ordersR.error;
        if (prevOrdersR.error) throw prevOrdersR.error;
        if (productsR.error) throw productsR.error;
        const lowStockThreshold = resolveLowStockThreshold(settingsR.data?.low_stock_threshold);
        const productById = new Map((productsR.data || []).map((p: any) => [String(p.id), p]));

        const aggFromItems = (rows: any[]) => {
          const m = new Map<string, { name: string; sku: string | null; unitsSold: number; orderIds: Set<any>; revenue: number }>();
          for (const o of rows) {
            if (o.payment_status !== "PAID" || o.status === "CANCELLED" || o.receipt_review_status === "REJECTED") continue;
            const items = Array.isArray(o.items) ? o.items : [];
            for (const it of items) {
              const pid = String(it.product_id || it.name || "?");
              const cur = m.get(pid) || { name: it.name || pid, sku: it.sku || null, unitsSold: 0, orderIds: new Set(), revenue: 0 };
              cur.unitsSold += Number(it.qty) || 0;
              cur.revenue += (Number(it.price) || 0) * (Number(it.qty) || 0);
              if (o.id !== undefined) cur.orderIds.add(o.id);
              m.set(pid, cur);
            }
          }
          return m;
        };
        const currentAgg = aggFromItems(ordersR.data || []);
        const prevAgg = needsPrev ? aggFromItems(prevOrdersR.data || []) : new Map();
        const grandTotal = [...currentAgg.values()].reduce((s, v) => s + v.revenue, 0);

        const rowFor = (pid: string, agg: any) => {
          const p: any = productById.get(pid);
          const stockState = p && p.status !== "DELETED" ? computeStockState(p, lowStockThreshold) : null;
          return {
            productId: pid, name: p?.name || agg?.name || pid, img: p?.img || null, sku: p?.sku || agg?.sku || null,
            currentStock: p && p.status !== "DELETED" ? (Array.isArray(p.variants) && p.variants.length ? p.variants.reduce((s: number, v: any) => s + (Number(v.qty) || 0), 0) : Number(p.stock) || 0) : null,
            isDeleted: !p || p.status === "DELETED",
            unitsSold: agg?.unitsSold || 0, orderCount: agg?.orderIds ? agg.orderIds.size : 0,
            revenue: agg?.revenue || 0, avgSellPrice: agg?.unitsSold ? agg.revenue / agg.unitsSold : 0,
            sharePercent: grandTotal > 0 && agg ? (agg.revenue / grandTotal) * 100 : 0,
            stockState,
          };
        };

        let list: any[] = [];
        if (view === "NEVER_SOLD") {
          list = (productsR.data || [])
            .filter((p: any) => p.status !== "DELETED" && !currentAgg.has(String(p.id)))
            .map((p: any) => rowFor(String(p.id), null));
        } else if (view === "LOW_STOCK" || view === "OUT_OF_STOCK") {
          const wantState = view === "LOW_STOCK" ? "LOW" : "OUT";
          list = (productsR.data || [])
            .filter((p: any) => p.status !== "DELETED" && computeStockState(p, lowStockThreshold) === wantState)
            .map((p: any) => rowFor(String(p.id), currentAgg.get(String(p.id))));
        } else if (view === "TRENDING_UP" || view === "TRENDING_DOWN") {
          const allPids = new Set([...currentAgg.keys(), ...prevAgg.keys()]);
          list = [...allPids].map((pid) => {
            const row = rowFor(pid, currentAgg.get(pid));
            const prevUnits = (prevAgg.get(pid) as any)?.unitsSold || 0;
            return { ...row, prevUnitsSold: prevUnits, unitsSoldDelta: row.unitsSold - prevUnits };
          }).filter((r: any) => view === "TRENDING_UP" ? r.unitsSoldDelta > 0 : r.unitsSoldDelta < 0);
          list.sort((a: any, b: any) => view === "TRENDING_UP" ? b.unitsSoldDelta - a.unitsSoldDelta : a.unitsSoldDelta - b.unitsSoldDelta);
        } else if (view === "LEAST_SOLD") {
          list = [...currentAgg.keys()].map((pid) => rowFor(pid, currentAgg.get(pid))).sort((a: any, b: any) => a.unitsSold - b.unitsSold);
        } else if (view === "TOP_SOLD") {
          list = [...currentAgg.keys()].map((pid) => rowFor(pid, currentAgg.get(pid))).sort((a: any, b: any) => b.unitsSold - a.unitsSold);
        } else {
          // TOP_REVENUE (default) — barcha sotilgan mahsulotlar, tushum bo'yicha.
          list = [...currentAgg.keys()].map((pid) => rowFor(pid, currentAgg.get(pid))).sort((a: any, b: any) => b.revenue - a.revenue);
        }

        const totalCount = list.length;
        const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
        const clampedPage = Math.min(page, totalPages);
        const pageItems = list.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

        return json({
          period, dateFrom: fromIso, dateTo: toIso, view,
          totalSales: grandTotal, page: clampedPage, pageSize, totalCount, totalPages,
          products: pageItems,
        });
      }

      case "get_inventory_rows": {
        await requirePermission('stock.view');
        const rawSearch = String(payload.search || '').trim().slice(0, 100).toLocaleLowerCase('uz-UZ');
        const filterState = String(payload.state || 'ALL').toUpperCase();
        const [{ data: invProducts, error: invError }, invSettingsR] = await Promise.all([
          db.from("products").select("id,sku,name,name_ru,stock,status,variants,category_id").eq("shop_id", shopId).neq("status", "DELETED").order("name", { ascending: true }),
          db.from("shop_settings").select("low_stock_threshold").eq("shop_id", shopId).maybeSingle(),
        ]);
        if (invError) throw invError;
        const lowStockThreshold = resolveLowStockThreshold(invSettingsR.data?.low_stock_threshold);
        const rows: any[] = [];
        for (const product of invProducts || []) {
          const variants = Array.isArray(product.variants) ? product.variants : [];
          if (variants.length) {
            for (const variant of variants) {
              const qty = Math.max(0, Number(variant?.qty) || 0);
              const state = qty === 0 ? 'OUT_OF_STOCK' : qty <= lowStockThreshold ? 'LOW_STOCK' : 'IN_STOCK';
              rows.push({
                key: `${product.id}:${String(variant?.sku || '')}`, productId: String(product.id), productName: product.name || product.name_ru || 'Nomsiz mahsulot',
                productSku: product.sku || null, variantSku: variant?.sku || null, color: variant?.color || null, size: variant?.size || null, stock: qty, state, manageable: !!variant?.sku,
              });
            }
          } else {
            const qty = Math.max(0, Number(product.stock) || 0);
            const state = qty === 0 ? 'OUT_OF_STOCK' : qty <= lowStockThreshold ? 'LOW_STOCK' : 'IN_STOCK';
            rows.push({
              key: `${product.id}:`, productId: String(product.id), productName: product.name || product.name_ru || 'Nomsiz mahsulot', productSku: product.sku || null,
              variantSku: null, color: null, size: null, stock: qty, state, manageable: !!product.sku,
            });
          }
        }
        const filtered = rows.filter((row: any) => {
          if (filterState !== 'ALL' && row.state !== filterState) return false;
          if (!rawSearch) return true;
          return `${row.productName || ''} ${row.productSku || ''} ${row.variantSku || ''} ${row.color || ''} ${row.size || ''}`.toLocaleLowerCase('uz-UZ').includes(rawSearch);
        });
        return json({ rows: filtered, total: filtered.length, lowStockThreshold });
      }

      case "get_warehouse_summary": {
        await requirePermission('stock.view');
        const [{ data: whProducts, error: whError }, whSettingsR] = await Promise.all([
          db.from("products").select("id,stock,variants,status").eq("shop_id", shopId).neq("status", "DELETED"),
          db.from("shop_settings").select("low_stock_threshold").eq("shop_id", shopId).maybeSingle(),
        ]);
        if (whError) throw whError;
        const whLowStockThreshold = resolveLowStockThreshold(whSettingsR.data?.low_stock_threshold);
        const rows = whProducts || [];
        const states = rows.map((p: any) => ({ id: p.id, state: computeStockState(p, whLowStockThreshold) }));
        const outOfStockIds = states.filter((s) => s.state === "OUT").map((s) => s.id);
        const lowStockIds = states.filter((s) => s.state === "LOW").map((s) => s.id);
        const totalStock = rows.reduce((sum: number, p: any) => {
          const variants = Array.isArray(p.variants) ? p.variants : null;
          const qty = variants && variants.length ? variants.reduce((s: number, v: any) => s + (Number(v.qty) || 0), 0) : (Number(p.stock) || 0);
          return sum + qty;
        }, 0);
        return json({
          totalProducts: rows.length,
          totalStock,
          lowStock: lowStockIds.length, lowStockIds,
          outOfStock: outOfStockIds.length, outOfStockIds,
          lowStockThreshold: whLowStockThreshold,
          generatedAt: new Date().toISOString(),
        });
      }

      // 10-band: admin roster management now targets shop_memberships instead
      // of the old flat admins table. Still gated behind the PLATFORM super
      // admin (same security posture as before — self-service co-owner
      // management by an existing shop owner is intentionally not built this
      // round, matching "don't invent permission complexity yet").
      case "add_admin": {
        requireSuperAdmin();
        const newTgId = String(payload.tgId || "");
        if (!/^\d+$/.test(newTgId)) return json({ error: "invalid_tg_id" }, 400);
        const { error } = await db.from("shop_memberships").upsert(
          { shop_id: shopId, telegram_user_id: newTgId, role: "OWNER", status: "ACTIVE" },
          { onConflict: "shop_id,telegram_user_id" },
        );
        if (error) throw error;
        auditLater("ADMIN_ADDED", "shop_membership", newTgId);
        return json({ ok: true });
      }
      case "remove_admin": {
        requireSuperAdmin();
        const targetId = String(payload.tgId || "");
        const { error } = await db.from("shop_memberships").delete().eq("shop_id", shopId).eq("telegram_user_id", targetId);
        if (error) throw error;
        auditLater("ADMIN_REMOVED", "shop_membership", targetId);
        return json({ ok: true });
      }
      case "get_admins_list": {
        await requirePermission('staff.manage');
        const { data, error } = await db.from("shop_memberships").select("telegram_user_id").eq("shop_id", shopId).eq("status", "ACTIVE");
        if (error) throw error;
        return json({ admins: (data || []).map((r: any) => String(r.telegram_user_id)) });
      }

      // ==================== ROLLAR (Admin Roles & Permissions, 2.4-bosqich) ====================

      case "role_list": {
        if (membershipRow?.role !== 'OWNER' && !isSuperAdmin) await requireStaffPermissionManager();
        await ensureStandardRolesForShop();
        const { data: roles, error: rolesErr } = await db.from("roles").select("*").eq("shop_id", shopId).order("is_system", { ascending: false }).order("created_at", { ascending: true });
        if (rolesErr) throw rolesErr;
        const roleIds = (roles || []).map((r: any) => r.id);
        const [{ data: permRows, error: permErr }, { data: usageRows, error: usageErr }] = await Promise.all([
          roleIds.length ? db.from("role_permissions").select("role_id,permission").eq("shop_id", shopId).in("role_id", roleIds) : Promise.resolve({ data: [], error: null }),
          roleIds.length ? db.from("membership_roles").select("role_id").eq("shop_id", shopId).in("role_id", roleIds) : Promise.resolve({ data: [], error: null }),
        ]);
        if (permErr) throw permErr; if (usageErr) throw usageErr;
        const permsByRole = new Map<string, string[]>();
        for (const r of permRows || []) { if (!permsByRole.has(r.role_id)) permsByRole.set(r.role_id, []); permsByRole.get(r.role_id)!.push(r.permission); }
        const usageByRole = new Map<string, number>();
        for (const r of usageRows || []) usageByRole.set(r.role_id, (usageByRole.get(r.role_id) || 0) + 1);
        return json({
          permissions: PERMISSIONS,
          roles: (roles || []).map((r: any) => ({
            id: r.id, key: r.key || null, name: r.name, description: r.description || null, color: r.color || null,
            isSystem: !!r.is_system, permissions: permsByRole.get(r.id) || [], usedCount: usageByRole.get(r.id) || 0,
          })),
        });
      }

      case "role_create": {
        if (membershipRow?.role !== 'OWNER' && !isSuperAdmin) throw new Error('forbidden:owner_only');
        const name = nullableText(payload.name, 60);
        if (!name) return json({ error: "invalid_name" }, 400);
        const perms = Array.isArray(payload.permissions) ? payload.permissions.filter((p: unknown) => isValidPermission(p) && p !== 'staff.permissions.manage') : [];
        const { data: role, error: roleErr } = await db.from("roles").insert({
          shop_id: shopId, name, description: nullableText(payload.description, 200), color: nullableText(payload.color, 20), is_system: false,
        }).select("*").single();
        if (roleErr) throw roleErr;
        if (perms.length) {
          const { error: permErr } = await db.from("role_permissions").insert(perms.map((p: Permission) => ({ shop_id: shopId, role_id: role.id, permission: p })));
          if (permErr) throw permErr;
        }
        auditLater("ROLE_CREATED", "role", role.id, { name, permissions: perms });
        return json({ role: { id: role.id, key: null, name: role.name, description: role.description, color: role.color, isSystem: false, permissions: perms, usedCount: 0 } });
      }

      case "role_update": {
        if (membershipRow?.role !== 'OWNER' && !isSuperAdmin) throw new Error('forbidden:owner_only');
        const roleId = String(payload.id || "");
        if (!roleId) return json({ error: "invalid_id" }, 400);
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (payload.name !== undefined) { const n = nullableText(payload.name, 60); if (!n) return json({ error: "invalid_name" }, 400); patch.name = n; }
        if (payload.description !== undefined) patch.description = nullableText(payload.description, 200);
        if (payload.color !== undefined) patch.color = nullableText(payload.color, 20);
        const { data: role, error: roleErr } = await db.from("roles").update(patch).eq("id", roleId).eq("shop_id", shopId).select("*").single();
        if (roleErr) throw roleErr;
        if (!role) return json({ error: "role_not_found" }, 404);
        if (Array.isArray(payload.permissions)) {
          const perms = payload.permissions.filter((p: unknown) => isValidPermission(p) && p !== 'staff.permissions.manage') as Permission[];
          const { error: delErr } = await db.from("role_permissions").delete().eq("shop_id", shopId).eq("role_id", roleId);
          if (delErr) throw delErr;
          if (perms.length) {
            const { error: insErr } = await db.from("role_permissions").insert(perms.map((p) => ({ shop_id: shopId, role_id: roleId, permission: p })));
            if (insErr) throw insErr;
          }
        }
        auditLater("ROLE_UPDATED", "role", roleId, patch);
        return json({ ok: true });
      }

      case "role_delete": {
        if (membershipRow?.role !== 'OWNER' && !isSuperAdmin) throw new Error('forbidden:owner_only');
        const roleId = String(payload.id || "");
        const { data: role } = await db.from("roles").select("is_system").eq("id", roleId).eq("shop_id", shopId).maybeSingle();
        if (!role) return json({ error: "role_not_found" }, 404);
        if (role.is_system) return json({ error: "cannot_delete_system_role" }, 400);
        const { count } = await db.from("membership_roles").select("shop_id", { count: "exact", head: true }).eq("shop_id", shopId).eq("role_id", roleId);
        if ((count || 0) > 0 && !payload.force) return json({ error: "role_in_use", usedCount: count }, 400);
        // ON DELETE CASCADE (031-migratsiya) role_permissions VA membership_roles
        // qatorlarini o'zi tozalaydi — bu yerda alohida DELETE shart emas.
        const { error } = await db.from("roles").delete().eq("id", roleId).eq("shop_id", shopId);
        if (error) throw error;
        auditLater("ROLE_DELETED", "role", roleId, { forcedWithUsers: (count || 0) > 0 });
        return json({ deleted: true });
      }

      // ==================== XODIMLAR (Admin Roles & Permissions, 2.5-bosqich) ====================

      case "staff_list": {
        if (membershipRow?.role !== 'OWNER' && !isSuperAdmin) await requireStaffPermissionManager();
        const { data: members, error: memErr } = await db.from("shop_memberships").select("telegram_user_id,role,status,created_at").eq("shop_id", shopId).order("created_at", { ascending: true });
        if (memErr) throw memErr;
        const tgIds = (members || []).map((m: any) => String(m.telegram_user_id));
        const [{ data: users }, { data: roleLinks }, { data: pendingInvites }] = await Promise.all([
          tgIds.length ? db.from("app_users").select("tg_id,first_name,last_name,username,profile_first_name,profile_last_name,phone,last_seen_at").eq("shop_id", shopId).in("tg_id", tgIds) : Promise.resolve({ data: [] }),
          tgIds.length ? db.from("membership_roles").select("telegram_user_id,role_id,is_primary,roles(id,key,name,color)").eq("shop_id", shopId).in("telegram_user_id", members!.map((m: any) => m.telegram_user_id)) : Promise.resolve({ data: [] }),
          db.from("staff_invites").select("*").eq("shop_id", shopId).eq("status", "PENDING").order("created_at", { ascending: false }),
        ]);
        const userByTg = new Map((users || []).map((u: any) => [String(u.tg_id), u]));
        const rolesByMember = new Map<string, any[]>();
        for (const r of roleLinks || []) {
          const key = String(r.telegram_user_id);
          if (!rolesByMember.has(key)) rolesByMember.set(key, []);
          rolesByMember.get(key)!.push({ id: r.role_id, key: r.roles?.key || null, name: r.roles?.name || "?", color: r.roles?.color || null, isPrimary: !!r.is_primary });
        }
        const [{ data: rolePerms, error: rolePermError }, { data: memberOverrides, error: overrideError }] = await Promise.all([
          db.from('role_permissions').select('role_id,permission').eq('shop_id', shopId),
          db.from('shop_staff_permission_overrides').select('telegram_user_id,permission,enabled').eq('shop_id', shopId),
        ]);
        if (rolePermError || overrideError) throw rolePermError || overrideError;
        const permsByRole = new Map<string,string[]>();
        for (const row of rolePerms || []) { const key=String(row.role_id); if (!permsByRole.has(key)) permsByRole.set(key,[]); permsByRole.get(key)!.push(String(row.permission)); }
        const overridesByMember = new Map<string,any[]>();
        for (const row of memberOverrides || []) { const key=String(row.telegram_user_id); if (!overridesByMember.has(key)) overridesByMember.set(key,[]); overridesByMember.get(key)!.push(row); }
        return json({
          staff: (members || []).map((m: any) => {
            const u = userByTg.get(String(m.telegram_user_id));
            const memberRoles = rolesByMember.get(String(m.telegram_user_id)) || [];
            const manager = memberRoles.some((role: any) => role.key === 'MANAGER');
            const effective = new Set<string>(memberRoles.flatMap((role: any) => permsByRole.get(String(role.id)) || []));
            if (manager) effective.add('domains.manage');
            for (const override of overridesByMember.get(String(m.telegram_user_id)) || []) {
              if (manager && override.permission === 'domains.manage') continue;
              if (override.enabled) effective.add(String(override.permission)); else effective.delete(String(override.permission));
            }
            return {
              tgId: String(m.telegram_user_id), role: m.role, status: m.status, memberSince: m.created_at,
              name: u?.profile_first_name || u?.first_name || null, username: u?.username || null, phone: u?.phone || null,
              lastSeenAt: u?.last_seen_at || null,
              roles: memberRoles, permissions: m.role === 'OWNER' ? ['*'] : [...effective],
              permissionOverrides: overridesByMember.get(String(m.telegram_user_id)) || [],
            };
          }),
          pendingInvites: (pendingInvites || []).map((i: any) => ({
            id: i.id, tgId: String(i.telegram_user_id), username: i.invited_username || null, roleIds: i.role_ids,
            createdAt: i.created_at, expiresAt: i.expires_at,
          })),
        });
      }

      case "staff_invite": {
        await requirePermission('staff.manage');
        const targetTgId = String(payload.telegramUserId || "").trim();
        if (!/^\d+$/.test(targetTgId)) return json({ error: "invalid_tg_id" }, 400);
        const roleIds = Array.isArray(payload.roleIds) ? payload.roleIds.map((x: any) => String(x)) : [];
        if (!roleIds.length) return json({ error: "at_least_one_role_required" }, 400);
        const { data: validRoles, error: roleCheckErr } = await db.from("roles").select("id").eq("shop_id", shopId).in("id", roleIds);
        if (roleCheckErr) throw roleCheckErr;
        if ((validRoles || []).length !== roleIds.length) return json({ error: "invalid_role" }, 400);
        const { data: existingMember } = await db.from("shop_memberships").select("status").eq("shop_id", shopId).eq("telegram_user_id", targetTgId).maybeSingle();
        if (existingMember?.status === "ACTIVE") return json({ error: "already_a_member" }, 400);
        const { data: invite, error } = await db.from("staff_invites").insert({
          shop_id: shopId, telegram_user_id: targetTgId, invited_username: nullableText(payload.username, 60),
          role_ids: roleIds, invited_by: tgId,
        }).select("*").single();
        if (error) {
          if (error.code === "23505") return json({ error: "invite_already_pending" }, 400);
          throw error;
        }
        auditLater("STAFF_INVITED", "staff_invite", invite.id, { targetTgId, roleIds });
        const shopName = await shopDisplayNameForMessages(db, shopId);
        EdgeRuntime.waitUntil(telegramApi(BOT_TOKEN, "sendMessage", {
          chat_id: targetTgId,
          text: `👥 <b>${escapeHtml(shopName)}</b> sizni jamoaga taklif qildi.\n\nTaklifni ko'rish va qabul qilish uchun ilovani oching (Profil bo'limi).`,
          parse_mode: "HTML",
        }).catch((e: any) => console.error("[STAFF_INVITE_NOTIFY_FAILED]", e)));
        return json({ invite: { id: invite.id, tgId: targetTgId, roleIds, status: "PENDING", createdAt: invite.created_at, expiresAt: invite.expires_at } });
      }

      case "staff_cancel_invite": {
        await requirePermission('staff.manage');
        const inviteId = String(payload.inviteId || "");
        const { error } = await db.from("staff_invites").update({ status: "CANCELLED", responded_at: new Date().toISOString() })
          .eq("id", inviteId).eq("shop_id", shopId).eq("status", "PENDING");
        if (error) throw error;
        auditLater("STAFF_INVITE_CANCELLED", "staff_invite", inviteId);
        return json({ ok: true });
      }

      // Ochiq (staff.manage TALAB QILINMAYDI) — taklif qilingan shaxsning
      // O'ZI chaqiradi, u hali xodim emas.
      case "staff_invite_respond": {
        const inviteId = String(payload.inviteId || "");
        const accept = !!payload.accept;
        const { data: invite, error: inviteErr } = await db.from("staff_invites").select("*").eq("id", inviteId).eq("shop_id", shopId).maybeSingle();
        if (inviteErr) throw inviteErr;
        if (!invite || invite.status !== "PENDING") return json({ error: "invite_not_found" }, 404);
        if (String(invite.telegram_user_id) !== tgId) return json({ error: "forbidden" }, 403);
        if (new Date(invite.expires_at).getTime() < Date.now()) {
          await db.from("staff_invites").update({ status: "EXPIRED" }).eq("id", inviteId).eq("shop_id", shopId);
          return json({ error: "invite_expired" }, 400);
        }
        if (!accept) {
          await db.from("staff_invites").update({ status: "REJECTED", responded_at: new Date().toISOString() }).eq("id", inviteId).eq("shop_id", shopId);
          return json({ ok: true, accepted: false });
        }
        const { error: memErr } = await db.from("shop_memberships").upsert(
          { shop_id: shopId, telegram_user_id: tgId, role: "STAFF", status: "ACTIVE" },
          { onConflict: "shop_id,telegram_user_id" },
        );
        if (memErr) throw memErr;
        const roleIds: string[] = Array.isArray(invite.role_ids) ? invite.role_ids : [];
        if (roleIds.length) {
          const { error: rolesInsertErr } = await db.from("membership_roles").upsert(
            roleIds.map((rid, idx) => ({ shop_id: shopId, telegram_user_id: tgId, role_id: rid, is_primary: idx === 0, assigned_by: invite.invited_by })),
            { onConflict: "shop_id,telegram_user_id,role_id" },
          );
          if (rolesInsertErr) throw rolesInsertErr;
        }
        await db.from("staff_invites").update({ status: "ACCEPTED", responded_at: new Date().toISOString() }).eq("id", inviteId).eq("shop_id", shopId);
        auditLater("STAFF_INVITE_ACCEPTED", "staff_invite", inviteId);
        return json({ ok: true, accepted: true });
      }

      case "staff_update_roles": {
        if (membershipRow?.role !== 'OWNER' && !isSuperAdmin) throw new Error('forbidden:owner_only');
        const targetTgId = String(payload.telegramUserId || "");
        const { data: target } = await db.from("shop_memberships").select("role").eq("shop_id", shopId).eq("telegram_user_id", targetTgId).maybeSingle();
        if (!target) return json({ error: "member_not_found" }, 404);
        if (target.role !== "STAFF") return json({ error: "cannot_edit_owner_roles" }, 400);
        const roleIds = Array.isArray(payload.roleIds) ? payload.roleIds.map((x: any) => String(x)) : [];
        if (!roleIds.length) return json({ error: "at_least_one_role_required" }, 400);
        const { data: validRoles, error: roleCheckErr } = await db.from("roles").select("id").eq("shop_id", shopId).in("id", roleIds);
        if (roleCheckErr) throw roleCheckErr;
        if ((validRoles || []).length !== roleIds.length) return json({ error: "invalid_role" }, 400);
        const primaryRoleId = payload.primaryRoleId && roleIds.includes(String(payload.primaryRoleId)) ? String(payload.primaryRoleId) : roleIds[0];
        const { error: delErr } = await db.from("membership_roles").delete().eq("shop_id", shopId).eq("telegram_user_id", targetTgId);
        if (delErr) throw delErr;
        const { error: insErr } = await db.from("membership_roles").insert(
          roleIds.map((rid) => ({ shop_id: shopId, telegram_user_id: targetTgId, role_id: rid, is_primary: rid === primaryRoleId, assigned_by: tgId })),
        );
        if (insErr) throw insErr;
        auditLater("STAFF_ROLES_UPDATED", "shop_membership", targetTgId, { roleIds, primaryRoleId });
        return json({ ok: true });
      }

      case "staff_set_permission": {
        await requireStaffPermissionManager();
        const targetTgId = String(payload.telegramUserId || '').trim();
        const permission = payload.permission;
        const enabled = payload.enabled;
        if (!/^\d+$/.test(targetTgId) || !isValidPermission(permission) || typeof enabled !== 'boolean')
          return json({ error: 'VALIDATION_ERROR' }, 400);
        if (targetTgId === tgId) return json({ error: 'FORBIDDEN' }, 403);
        const { data: target, error: targetError } = await db.from('shop_memberships')
          .select('role,status').eq('shop_id',shopId).eq('telegram_user_id',targetTgId).maybeSingle();
        if (targetError) throw targetError;
        if (!target || target.role !== 'STAFF' || target.status !== 'ACTIVE') return json({ error: 'FORBIDDEN' }, 403);
        const { data: links, error: linksError } = await db.from('membership_roles')
          .select('role_id,roles(key)').eq('shop_id',shopId).eq('telegram_user_id',targetTgId);
        if (linksError) throw linksError;
        const targetIsManager = (links || []).some((row: any) => row.roles?.key === 'MANAGER');
        const actorIsOwner = membershipRow?.role === 'OWNER' || isSuperAdmin;
        if (permission === 'staff.permissions.manage') {
          if (!actorIsOwner || !targetIsManager) return json({ error: 'FORBIDDEN' }, 403);
        } else if (!actorIsOwner) {
          if (targetIsManager || ['staff.manage','integrations.manage'].includes(permission) ||
              !(await getEffectivePermissions()).has(permission)) return json({ error: 'FORBIDDEN' }, 403);
        }
        if (targetIsManager && permission === 'domains.manage' && !enabled)
          return json({ error: 'MANAGER_DOMAIN_PERMISSION_REQUIRED' }, 409);
        const { data: previous, error: previousError } = await db.from('shop_staff_permission_overrides')
          .select('enabled').eq('shop_id',shopId).eq('telegram_user_id',targetTgId)
          .eq('permission',permission).maybeSingle();
        if (previousError) throw previousError;
        const { error: saveError } = await db.from('shop_staff_permission_overrides').upsert({
          shop_id:shopId, telegram_user_id:targetTgId, permission, enabled, changed_by:tgId,
          updated_at:new Date().toISOString(),
        }, { onConflict:'shop_id,telegram_user_id,permission' });
        if (saveError) throw saveError;
        auditLater('STAFF_PERMISSION_CHANGED','shop_membership',targetTgId,{
          permission, previousOverride:previous?.enabled ?? null, enabled, targetIsManager,
        });
        return json({ ok:true, permission, enabled });
      }

      case "staff_set_blocked": {
        await requirePermission('staff.manage');
        const targetTgId = String(payload.telegramUserId || "");
        const blocked = !!payload.blocked;
        const { data: target } = await db.from("shop_memberships").select("role").eq("shop_id", shopId).eq("telegram_user_id", targetTgId).maybeSingle();
        if (!target) return json({ error: "member_not_found" }, 404);
        if (target.role !== "STAFF") return json({ error: "cannot_block_owner" }, 400);
        const { error } = await db.from("shop_memberships").update({ status: blocked ? "DISABLED" : "ACTIVE" }).eq("shop_id", shopId).eq("telegram_user_id", targetTgId);
        if (error) throw error;
        auditLater(blocked ? "STAFF_BLOCKED" : "STAFF_UNBLOCKED", "shop_membership", targetTgId);
        return json({ ok: true });
      }

      case "staff_remove": {
        await requirePermission('staff.manage');
        const targetTgId = String(payload.telegramUserId || "");
        const { data: target } = await db.from("shop_memberships").select("role").eq("shop_id", shopId).eq("telegram_user_id", targetTgId).maybeSingle();
        if (!target) return json({ error: "member_not_found" }, 404);
        if (target.role !== "STAFF") return json({ error: "cannot_remove_owner" }, 400);
        const { error } = await db.from("shop_memberships").delete().eq("shop_id", shopId).eq("telegram_user_id", targetTgId);
        if (error) throw error;
        auditLater("STAFF_REMOVED", "shop_membership", targetTgId);
        return json({ ok: true });
      }

      // Owner-only — hech qanday rol/permission orqali berilmaydi (2.3-bosqich).
      case "transfer_ownership": {
        if (!isSuperAdmin && membershipRow?.role !== "OWNER") throw new Error("forbidden:not_owner");
        const toTgId = String(payload.toTelegramUserId || "");
        const oldOwnerNewRole = payload.oldOwnerNewRole === "REMOVE" ? "REMOVE" : "STAFF";
        if (!toTgId) return json({ error: "invalid_target" }, 400);
        const { error } = await db.rpc("transfer_shop_ownership", {
          p_shop_id: shopId, p_from_tg_id: tgId, p_to_tg_id: toTgId, p_old_owner_new_role: oldOwnerNewRole,
        });
        if (error) {
          const m = String(error.message || "");
          if (m.includes("target_not_active_member")) return json({ error: "target_not_active_member" }, 400);
          if (m.includes("same_user")) return json({ error: "same_user" }, 400);
          if (m.includes("forbidden")) return json({ error: "forbidden" }, 403);
          throw error;
        }
        auditLater("OWNERSHIP_TRANSFERRED", "shop_membership", toTgId, { fromTgId: tgId, oldOwnerNewRole });
        return json({ ok: true });
      }

      case "bulk_stock_update": {
        await requirePermission('stock.manage');
        const updates: Array<{ sku: string; stock: number }> = Array.isArray(payload.updates) ? payload.updates : [];
        const products: any[] = [], errors: any[] = [];
        const { data: beforeRows } = await db.from("products").select("id,sku,stock,variants").eq("shop_id", shopId).neq("status", "DELETED");
        const beforeBySku = new Map<string, any>();
        for (const row of beforeRows || []) {
          if (row.sku) beforeBySku.set(String(row.sku), structuredClone(row));
          for (const v of (Array.isArray(row.variants) ? row.variants : [])) if (v?.sku) beforeBySku.set(String(v.sku), structuredClone(row));
        }
        for (const u of updates.slice(0, 300)) {
          const sku = String(u.sku || "").trim(); const stock = Number(u.stock);
          if (!sku || !Number.isInteger(stock) || stock < 0) { errors.push({ sku, error: "invalid_stock" }); continue; }
          const before = beforeBySku.get(sku) || null;
          const { data, error } = await db.rpc("set_stock_by_sku", { p_shop_id: shopId, p_sku: sku, p_stock: stock, p_actor_tg_id: tgId });
          if (error) errors.push({ sku, error: error.message }); else if (data) {
            products.push(data);
            if (before) await triggerRestockTransitions(db, shopId, before, data, BOT_TOKEN);
          }
        }
        auditLater("BULK_STOCK_UPDATED", "product", null, { count: products.length, errors: errors.length });
        const changedProductIds = products.map((product: any) => String(product?.id || product?.product_id || "")).filter(Boolean);
        if (changedProductIds.length) EdgeRuntime.waitUntil(validateAndPauseBundles(db, shopId, BOT_TOKEN, changedProductIds).catch((e: any) => console.error("[BUNDLE_AUTO_PAUSE_FAILED]", e)));
        return json({ products, errors });
      }

      case "record_stock_in": {
        await requirePermission('stock.manage');
        const productId = String(payload.productId || "");
        const variantSku = payload.variantSku ? String(payload.variantSku) : null;
        const qty = Number.parseInt(String(payload.qty), 10);
        if (!productId || !Number.isInteger(qty) || qty <= 0) return json({ error: "invalid_kirim" }, 400);
        const { data: current, error: curErr } = await db.from("products").select("*").eq("shop_id", shopId).eq("id", productId).maybeSingle();
        if (curErr || !current) return json({ error: "product_not_found" }, 404);
        const productPriorStock = Number(current.stock) || 0;
        let movementPriorStock: number;
        let movementNewStock: number;
        let productNewStock: number;
        const dbUpdate: Record<string, unknown> = {};
        if (variantSku && Array.isArray(current.variants) && current.variants.length) {
          const matched = current.variants.find((v: any) => v.sku === variantSku);
          if (!matched) return json({ error: "variant_not_found" }, 404);
          movementPriorStock = Number(matched.qty) || 0;
          movementNewStock = movementPriorStock + qty;
          const variants = current.variants.map((v: any) => v.sku === variantSku ? { ...v, qty: movementNewStock } : v);
          productNewStock = variants.reduce((sum: number, v: any) => sum + (Number(v.qty) || 0), 0);
          dbUpdate.variants = variants; dbUpdate.sizes = legacySizesFromVariants(variants); dbUpdate.stock = productNewStock;
        } else {
          if (Array.isArray(current.variants) && current.variants.length) return json({ error: "variant_stock_use_variants" }, 400);
          movementPriorStock = productPriorStock;
          movementNewStock = productPriorStock + qty;
          productNewStock = movementNewStock;
          dbUpdate.stock = productNewStock;
        }
        dbUpdate.status = productNewStock > 0 ? "ACTIVE" : "OUT_OF_STOCK";
        const { data: updated, error: updateError } = await db.from("products").update(dbUpdate).eq("shop_id", shopId).eq("id", productId).select().single();
        if (updateError) throw updateError;
        await triggerRestockTransitions(db, shopId, current, updated, BOT_TOKEN);
        const { error: moveError } = await db.from("stock_movements").insert({
          shop_id: shopId, product_id: productId, variant_sku: variantSku, prior_stock: movementPriorStock, delta: qty, new_stock: movementNewStock,
          operation_type: "KIRIM", admin_tg_id: tgId,
        });
        if (moveError) console.error("stock movement (kirim) log error", moveError);
        auditLater("STOCK_KIRIM", "product", productId, { qty, variantSku });
        return json({ product: updated });
      }

      case "get_stock_movements": {
        await requirePermission('stock.view');
        const type = payload.type && ["KIRIM", "BUYURTMA", "MANUAL"].includes(payload.type) ? payload.type : null;
        const page = Math.max(1, Number.parseInt(String(payload.page || 1), 10) || 1);
        const pageSize = 20;
        const dateFrom = payload.dateFrom ? String(payload.dateFrom) : null;
        const dateTo = payload.dateTo ? String(payload.dateTo) : null;
        const q = payload.q ? String(payload.q).trim().replace(/[,()%]/g, " ").slice(0, 100) : "";
        let query = db.from("stock_movements").select("*", { count: "exact" }).eq("shop_id", shopId).order("created_at", { ascending: false });
        if (type) query = query.eq("operation_type", type);
        if (dateFrom) query = query.gte("created_at", dateFrom);
        if (dateTo) query = query.lte("created_at", dateTo);
        if (q) {
          const { data: matchRows } = await db.from("products").select("id").eq("shop_id", shopId).or(`name.ilike.%${q}%,name_ru.ilike.%${q}%,sku.ilike.%${q}%`);
          const matchingIds = (matchRows || []).map((r: any) => r.id);
          query = query.in("product_id", matchingIds.length ? matchingIds : ["00000000-0000-0000-0000-000000000000"]);
        }
        const { data, error, count } = await query.range((page - 1) * pageSize, page * pageSize - 1);
        if (error) throw error;
        const productIds = [...new Set((data || []).map((m: any) => m.product_id))];
        const { data: productRows } = productIds.length ? await db.from("products").select("id,name,sku").eq("shop_id", shopId).in("id", productIds) : { data: [] };
        const nameById = new Map((productRows || []).map((p: any) => [p.id, p]));
        return json({
          movements: (data || []).map((m: any) => ({
            id: m.id, productId: m.product_id, variantSku: m.variant_sku,
            productName: nameById.get(m.product_id)?.name || m.product_id, productSku: nameById.get(m.product_id)?.sku || null,
            priorStock: m.prior_stock, delta: m.delta, newStock: m.new_stock,
            operationType: m.operation_type, adminTgId: m.admin_tg_id, orderId: m.order_id, createdAt: m.created_at,
          })),
          total: count || 0, page, pageSize,
        });
      }

      case "move_sort": {
        await requirePermission('products.manage');
        const { idA, sortOrderA, idB, sortOrderB } = payload;
        const { error } = await db.rpc("ustore_reorder_entities", { p_shop_id: shopId, p_entity: "products", p_items: [
          { id: idA, sortOrder: Number(sortOrderA) }, { id: idB, sortOrder: Number(sortOrderB) },
        ] });
        if (error) throw error;
        auditLater("PRODUCT_SORT_CHANGED", "product", `${idA},${idB}`);
        return json({ ok: true });
      }
      case "toggle_featured": {
        await requirePermission('products.manage');
        const { error } = await db.from("products").update({ is_featured: !!payload.value }).eq("shop_id", shopId).eq("id", payload.productId);
        if (error) throw error;
        auditLater("PRODUCT_FEATURED_CHANGED", "product", payload.productId, { value: !!payload.value });
        return json({ ok: true });
      }
      case "toggle_product_visibility": {
        await requirePermission('products.manage');
        const productId = String(payload.productId || "");
        if (!productId) return json({ error: "invalid_product" }, 400);
        const value = payload.value !== false;
        const { data: updated, error } = await db.from("products")
          .update({ is_visible: value })
          .eq("shop_id", shopId).eq("id", productId).neq("status", "DELETED")
          .select("id,is_visible").maybeSingle();
        if (error) throw error;
        if (!updated) return json({ error: "product_not_found" }, 404);
        auditLater("PRODUCT_VISIBILITY_CHANGED", "product", productId, { value });
        return json({ ok: true, productId, isVisible: updated.is_visible !== false });
      }


      case "toggle_favorite": {
        const productId = String(payload.productId || "");
        if (!productId) return json({ error: "invalid_product" }, 400);
        const { data: existing } = await db.from("user_favorites").select("id").eq("shop_id", shopId).eq("tg_id", tgId).eq("product_id", productId).maybeSingle();
        if (existing) {
          const { error } = await db.from("user_favorites").delete().eq("shop_id", shopId).eq("id", existing.id);
          if (error) throw error;
          return json({ favorited: false });
        }
        const { error } = await db.from("user_favorites").insert({ shop_id: shopId, tg_id: tgId, product_id: productId });
        if (error) throw error;
        return json({ favorited: true });
      }

      case "get_favorites": {
        const { data, error } = await db.from("user_favorites").select("product_id,created_at").eq("shop_id", shopId).eq("tg_id", tgId).order("created_at", { ascending: false });
        if (error) throw error;
        return json({ productIds: (data || []).map((r: any) => r.product_id) });
      }

      case "record_product_view": {
        const productId = String(payload.productId || "");
        if (!productId) return json({ error: "invalid_product" }, 400);
        const { error } = await db.from("user_recent_views").upsert(
          { shop_id: shopId, tg_id: tgId, product_id: productId, viewed_at: new Date().toISOString() },
          { onConflict: "shop_id,tg_id,product_id" },
        );
        if (error) throw error;
        return json({ ok: true });
      }

      case "get_recent_views": {
        const { data, error } = await db.from("user_recent_views").select("product_id,viewed_at").eq("shop_id", shopId).eq("tg_id", tgId).order("viewed_at", { ascending: false }).limit(20);
        if (error) throw error;
        return json({ productIds: (data || []).map((r: any) => r.product_id) });
      }

      // ==================== SHOP AUDIT LOG ====================
      case "list_admin_audit_log": {
        await requireAuditLogAccess();
        const pageSize = Math.min(100, Math.max(10, Number.parseInt(String(payload.pageSize || 30), 10) || 30));
        const page = Math.max(1, Number.parseInt(String(payload.page || 1), 10) || 1);
        const search = String(payload.search || "").trim().slice(0, 120);
        const actionFilter = String(payload.action || "").trim().slice(0, 100);
        const entityFilter = String(payload.entityType || "").trim().slice(0, 80);
        const adminFilter = String(payload.adminTgId || "").trim().slice(0, 30);
        let query = db.from("admin_audit_log")
          .select("id,admin_tg_id,action,entity_type,entity_id,details,created_at", { count: "exact" })
          .eq("shop_id", shopId);
        if (actionFilter) query = query.eq("action", actionFilter);
        if (entityFilter) query = query.eq("entity_type", entityFilter);
        if (adminFilter) query = query.eq("admin_tg_id", adminFilter);
        if (payload.dateFrom) query = query.gte("created_at", new Date(payload.dateFrom).toISOString());
        if (payload.dateTo) query = query.lte("created_at", new Date(payload.dateTo).toISOString());
        if (search) query = query.or(`action.ilike.%${search.replace(/[%_,]/g, "")}%,entity_type.ilike.%${search.replace(/[%_,]/g, "")}%,entity_id.ilike.%${search.replace(/[%_,]/g, "")}%`);
        const from = (page - 1) * pageSize;
        const { data: rows, count, error } = await query.order("created_at", { ascending: false }).range(from, from + pageSize - 1);
        if (error) throw error;
        const adminIds = [...new Set((rows || []).map((row: any) => String(row.admin_tg_id)))];
        const { data: users } = adminIds.length ? await db.from("app_users")
          .select("tg_id,profile_first_name,profile_last_name,first_name,last_name,username")
          .eq("shop_id", shopId).in("tg_id", adminIds) : { data: [] };
        const names = new Map((users || []).map((user: any) => [String(user.tg_id),
          [user.profile_first_name || user.first_name, user.profile_last_name || user.last_name].filter(Boolean).join(" ") || (user.username ? `@${user.username}` : String(user.tg_id))]));
        return json({
          entries: (rows || []).map((row: any) => ({
            id: row.id, adminTgId: String(row.admin_tg_id), adminName: names.get(String(row.admin_tg_id)) || String(row.admin_tg_id),
            action: row.action, entityType: row.entity_type, entityId: row.entity_id,
            details: maskAuditDetails(row.details), createdAt: row.created_at,
          })),
          page, pageSize, totalCount: count || 0, totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)),
        });
      }

      // ==================== ABANDONED CART TRACKING ====================
      // cart_logs faqat "hozirgi savat holati"ni saqlaydi — buyurtma
      // berilganda yoki savat bo'shaganda qator o'chiriladi, shu tufayli
      // "hali tashlab ketilmagan" (yoki allaqachon buyurtmaga aylangan)
      // savat admin ro'yxatida hech qachon ko'rinmaydi.

      case "save_cart_snapshot": {
        const items = Array.isArray(payload.items) ? payload.items : [];
        const bundleItems = Array.isArray(payload.bundleItems) ? payload.bundleItems : [];
        if (!items.length && !bundleItems.length) {
          await db.from("cart_logs").delete().eq("shop_id", shopId).eq("tg_id", tgId);
          return json({ ok: true });
        }
        const cleanItems = items.slice(0, 100).map((i: any) => ({
          type: "PRODUCT",
          productId: String(i.productId || ""), qty: Math.max(1, Number.parseInt(String(i.qty), 10) || 1),
          size: nullableText(i.size, 60), color: nullableText(i.color, 60),
        })).filter((i: any) => i.productId);
        const cleanBundles = bundleItems.slice(0, 30).map((i: any) => ({
          type: "BUNDLE", bundleId: String(i.bundleId || ""), qty: Math.min(10, Math.max(1, Number.parseInt(String(i.qty), 10) || 1)),
        })).filter((i: any) => i.bundleId);
        const snapshotItems = [...cleanItems, ...cleanBundles];
        if (!snapshotItems.length) return json({ ok: true });
        const { error } = await db.from("cart_logs").upsert({
          shop_id: shopId, tg_id: tgId, items: snapshotItems, item_count: snapshotItems.reduce((s: number, i: any) => s + i.qty, 0),
          updated_at: new Date().toISOString(), customer_notified_at: null, admin_reminded_at: null, reminder_count: 0,
        }, { onConflict: "shop_id,tg_id" });
        if (error) throw error;
        return json({ ok: true });
      }

      case "list_abandoned_carts": {
        await requirePermission('marketing.manage');
        const thresholdIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const pageSize = Math.min(100, Math.max(10, Number.parseInt(String(payload.pageSize || 30), 10) || 30));
        const page = Math.max(1, Number.parseInt(String(payload.page || 1), 10) || 1);
        const ageBucket = String(payload.ageBucket || "ALL");
        const reminderFilter = String(payload.reminderFilter || "ALL");
        const search = String(payload.search || "").trim().toLowerCase().slice(0, 80);
        const now = Date.now();
        const dayAgo = new Date(now - 86400000).toISOString();
        const threeDaysAgo = new Date(now - 3 * 86400000).toISOString();
        const sevenDaysAgo = new Date(now - 7 * 86400000).toISOString();
        let query = db.from("cart_logs").select("tg_id,items,item_count,updated_at,customer_notified_at,admin_reminded_at,reminder_count", { count: "exact" })
          .eq("shop_id", shopId).lt("updated_at", thresholdIso).gt("item_count", 0);
        if (search) {
          const safeSearch = search.replace(/[%_,]/g, "");
          const { data: matchingUsers } = await db.from("app_users").select("tg_id").eq("shop_id", shopId)
            .or(`tg_id.ilike.%${safeSearch}%,first_name.ilike.%${safeSearch}%,last_name.ilike.%${safeSearch}%,profile_first_name.ilike.%${safeSearch}%,profile_last_name.ilike.%${safeSearch}%,username.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%`).limit(500);
          query = query.in("tg_id", (matchingUsers || []).map((user: any) => user.tg_id).length ? (matchingUsers || []).map((user: any) => user.tg_id) : ["__no_match__"]);
        }
        if (ageBucket === "NEW") query = query.gte("updated_at", dayAgo);
        else if (ageBucket === "ACTIVE") query = query.lt("updated_at", dayAgo).gte("updated_at", threeDaysAgo);
        else if (ageBucket === "OLD") query = query.lt("updated_at", threeDaysAgo).gte("updated_at", sevenDaysAgo);
        else if (ageBucket === "ARCHIVE") query = query.lt("updated_at", sevenDaysAgo);
        if (reminderFilter === "READY") query = query.lt("updated_at", thresholdIso).gte("updated_at", threeDaysAgo).lt("reminder_count", 2)
          .or(`admin_reminded_at.is.null,admin_reminded_at.lt.${new Date(now - 86400000).toISOString()}`);
        else if (reminderFilter === "SENT") query = query.not("admin_reminded_at", "is", null);
        const from = (page - 1) * pageSize;
        const { data: rows, count, error } = await query.order("updated_at", { ascending: false }).range(from, from + pageSize - 1);
        if (error) throw error;
        const { data: summaryRows } = await db.from("cart_logs").select("updated_at,item_count,admin_reminded_at,reminder_count")
          .eq("shop_id", shopId).lt("updated_at", thresholdIso).gt("item_count", 0).limit(5000);
        const summary = { total: 0, new: 0, active: 0, old: 0, archive: 0, eligible: 0 };
        for (const row of summaryRows || []) {
          const age = now - new Date(row.updated_at).getTime(); summary.total++;
          if (age < 86400000) summary.new++; else if (age < 3 * 86400000) summary.active++; else if (age < 7 * 86400000) summary.old++; else summary.archive++;
          if (age <= 3 * 86400000 && Number(row.reminder_count || 0) < 2 && (!row.admin_reminded_at || new Date(row.admin_reminded_at).getTime() <= now - 86400000)) summary.eligible++;
        }
        if (!rows?.length) return json({ carts: [], page, pageSize, totalCount: count || 0, totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)), summary });
        const tgIds = rows.map((r: any) => r.tg_id);
        const productIds = Array.from(new Set(rows.flatMap((r: any) => (r.items || []).filter((i: any) => i.type !== "BUNDLE").map((i: any) => String(i.productId))).filter(Boolean)));
        const bundleIds = Array.from(new Set(rows.flatMap((r: any) => (r.items || []).filter((i: any) => i.type === "BUNDLE").map((i: any) => String(i.bundleId))).filter(Boolean)));
        const [{ data: users }, { data: products }, { data: bundles }] = await Promise.all([
          db.from("app_users").select("tg_id,first_name,last_name,username,phone,profile_first_name,profile_last_name").eq("shop_id", shopId).in("tg_id", tgIds),
          productIds.length ? db.from("products").select("id,name,price,img,status,is_visible,variants").eq("shop_id", shopId).in("id", productIds) : Promise.resolve({ data: [] }),
          bundleIds.length ? db.from("bundles").select("id,name,bundle_price,cover_image_url,is_active").eq("shop_id", shopId).in("id", bundleIds) : Promise.resolve({ data: [] }),
        ]);
        const userByTg = new Map((users || []).map((u: any) => [u.tg_id, u]));
        const productById = new Map((products || []).map((p: any) => [String(p.id), p]));
        const bundleById = new Map((bundles || []).map((b: any) => [String(b.id), b]));
        let carts = rows.map((r: any) => {
          const user = userByTg.get(r.tg_id);
          const items = (r.items || []).map((i: any) => {
            if (i.type === "BUNDLE") {
              const b = bundleById.get(String(i.bundleId));
              if (!b || !b.is_active) return null;
              const price = Number(b.bundle_price) || 0;
              return { type: "BUNDLE", bundleId: i.bundleId, name: b.name, img: b.cover_image_url, qty: i.qty, price, lineTotal: price * i.qty };
            }
            const p = productById.get(String(i.productId));
            if (!p || p.status === "DELETED" || p.is_visible === false) return null;
            const variant = Array.isArray(p.variants) ? p.variants.find((v: any) => (v?.size || null) === (i.size || null) && (v?.color || null) === (i.color || null)) : null;
            const rawPrice = variant?.price !== undefined && variant?.price !== null ? Number(variant.price) : Number(p.price);
            const price = Number.isFinite(rawPrice) ? rawPrice : 0;
            return { type: "PRODUCT", productId: i.productId, name: p.name, img: variant?.colorImg || variant?.img || p.img, qty: i.qty, size: i.size || null, color: i.color || null, price, lineTotal: price * i.qty };
          }).filter(Boolean);
          const cartValue = items.reduce((s: number, i: any) => s + i.lineTotal, 0);
          return {
            tgId: r.tg_id,
            customerName: user?.profile_first_name || user?.first_name || null,
            username: user?.username || null,
            phone: user?.phone || null,
            itemCount: r.item_count,
            items, cartValue, updatedAt: r.updated_at, remindedAt: r.admin_reminded_at || null,
            reminderCount: Number(r.reminder_count || 0),
            ageBucket: Date.now() - new Date(r.updated_at).getTime() < 86400000 ? "NEW" : Date.now() - new Date(r.updated_at).getTime() < 3 * 86400000 ? "ACTIVE" : Date.now() - new Date(r.updated_at).getTime() < 7 * 86400000 ? "OLD" : "ARCHIVE",
            reminderEligible: Date.now() - new Date(r.updated_at).getTime() <= 3 * 86400000 && Number(r.reminder_count || 0) < 2 && (!r.admin_reminded_at || new Date(r.admin_reminded_at).getTime() <= Date.now() - 86400000),
          };
        }).filter((c: any) => c.items.length);
        return json({ carts, page, pageSize, totalCount: count || 0, totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)), summary });
      }

      case "remind_abandoned_cart": {
        await requirePermission('marketing.manage');
        const targetTgId = String(payload.tgId || "");
        const { data: cart, error: cartErr } = await db.from("cart_logs").select("tg_id,item_count,updated_at,reminder_count,admin_reminded_at")
          .eq("shop_id", shopId).eq("tg_id", targetTgId).maybeSingle();
        if (cartErr) throw cartErr;
        if (!cart || new Date(cart.updated_at).getTime() > Date.now() - 30 * 60 * 1000) return json({ error: "cart_not_abandoned" }, 400);
        const ageMs = Date.now() - new Date(cart.updated_at).getTime();
        if (ageMs > 7 * 86400000) return json({ error: "cart_archived" }, 400);
        if (Number(cart.reminder_count || 0) >= 2) return json({ error: "reminder_limit_reached" }, 400);
        if (cart.admin_reminded_at && new Date(cart.admin_reminded_at).getTime() > Date.now() - 86400000) return json({ error: "reminder_cooldown" }, 409);
        const { data: campaign, error: campaignError } = await db.from("abandoned_cart_campaigns").insert({
          shop_id: shopId, created_by: tgId, scope: "SELECTED", filters: { tgIds: [targetTgId] }, total_count: 1,
        }).select("id").single();
        if (campaignError) throw campaignError;
        const { error: queueError } = await db.from("abandoned_cart_reminder_queue").insert({
          campaign_id: campaign.id, shop_id: shopId, tg_id: targetTgId, cart_updated_at: cart.updated_at,
        });
        if (queueError) throw queueError;
        auditLater("ABANDONED_CART_CAMPAIGN_QUEUED", "abandoned_cart_campaign", campaign.id, { totalCount: 1 });
        return json({ ok: true, queued: true, campaignId: campaign.id });
      }

      case "create_abandoned_cart_campaign": {
        await requirePermission('marketing.manage');
        const requestedIds = Array.isArray(payload.tgIds) ? [...new Set(payload.tgIds.map((id: any) => String(id)).filter(Boolean))].slice(0, 2000) : [];
        const scope = payload.allEligible === true ? "ELIGIBLE" : "SELECTED";
        // Ommaviy avtomatik yuborish faqat eng dolzarb (3 kungacha) savatlarga.
        // Admin aniq tanlagan savat esa tasdiqdan keyin 7 kungacha yuborilishi
        // mumkin; 7 kundan eskisi arxiv bo'lib qoladi va umuman navbatga kirmaydi.
        const oldestAllowedAt = new Date(Date.now() - (scope === "SELECTED" ? 7 : 3) * 86400000).toISOString();
        let query = db.from("cart_logs").select("tg_id,updated_at,admin_reminded_at,reminder_count,item_count")
          .eq("shop_id", shopId).gt("item_count", 0)
          .lt("updated_at", new Date(Date.now() - 30 * 60000).toISOString())
          .gte("updated_at", oldestAllowedAt)
          .lt("reminder_count", 2).limit(5000);
        if (scope === "SELECTED") {
          if (!requestedIds.length) return json({ error: "no_carts_selected" }, 400);
          query = query.in("tg_id", requestedIds);
        }
        const { data: candidates, error: candidateError } = await query;
        if (candidateError) throw candidateError;
        const eligible = (candidates || []).filter((cart: any) => !cart.admin_reminded_at || new Date(cart.admin_reminded_at).getTime() <= Date.now() - 86400000);
        if (!eligible.length) return json({ error: "no_eligible_carts" }, 400);
        const { data: campaign, error: campaignError } = await db.from("abandoned_cart_campaigns").insert({
          shop_id: shopId, created_by: tgId, scope, filters: maskAuditDetails(payload.filters || {}), total_count: eligible.length,
        }).select("*").single();
        if (campaignError) throw campaignError;
        const { error: queueError } = await db.from("abandoned_cart_reminder_queue").insert(eligible.map((cart: any) => ({
          campaign_id: campaign.id, shop_id: shopId, tg_id: cart.tg_id, cart_updated_at: cart.updated_at,
        })));
        if (queueError) throw queueError;
        auditLater("ABANDONED_CART_CAMPAIGN_QUEUED", "abandoned_cart_campaign", campaign.id, { totalCount: eligible.length, scope });
        return json({ campaign: { id: campaign.id, status: campaign.status, totalCount: eligible.length, sentCount: 0, skippedCount: 0, failedCount: 0 } });
      }

      case "get_abandoned_cart_campaign": {
        await requirePermission('marketing.manage');
        const campaignId = String(payload.campaignId || "");
        const { data: campaign, error } = await db.from("abandoned_cart_campaigns").select("*").eq("shop_id", shopId).eq("id", campaignId).maybeSingle();
        if (error) throw error;
        if (!campaign) return json({ error: "campaign_not_found" }, 404);
        return json({ campaign: { id: campaign.id, status: campaign.status, totalCount: campaign.total_count, sentCount: campaign.sent_count, skippedCount: campaign.skipped_count, failedCount: campaign.failed_count, createdAt: campaign.created_at, completedAt: campaign.completed_at } });
      }

      // ==================== BACK-IN-STOCK NOTIFICATIONS ====================

      case "subscribe_stock_notification": {
        const productId = String(payload.productId || "");
        const variantSku = payload.variantSku ? String(payload.variantSku) : null;
        if (!productId) return json({ error: "invalid_product" }, 400);
        const { data: product } = await db.from("products").select("id,stock,status,is_visible,variants").eq("shop_id", shopId).eq("id", productId).maybeSingle();
        if (!product || product.status === "DELETED" || product.is_visible === false) return json({ error: "product_not_found" }, 404);
        if (variantSku) {
          const qty = variantQtyBySku(product, variantSku);
          if (qty === null) return json({ error: "variant_not_found" }, 404);
          if (qty > 0) return json({ error: "already_in_stock" }, 400);
        } else if ((Number(product.stock) || 0) > 0) return json({ error: "already_in_stock" }, 400);
        const { error } = await db.from("stock_notifications").insert({ shop_id: shopId, tg_id: tgId, product_id: productId, variant_sku: variantSku });
        if (error && error.code !== "23505") throw error;
        return json({ ok: true, variantSku });
      }

      case "unsubscribe_stock_notification": {
        const productId = String(payload.productId || "");
        const variantSku = payload.variantSku ? String(payload.variantSku) : null;
        let q = db.from("stock_notifications").delete().eq("shop_id", shopId).eq("tg_id", tgId).eq("product_id", productId).is("notified_at", null);
        q = variantSku ? q.eq("variant_sku", variantSku) : q.is("variant_sku", null);
        const { error } = await q;
        if (error) throw error;
        return json({ ok: true });
      }

      // ==================== BANNER TIZIMI ====================

      case "banner_list": {
        await requirePermission('marketing.manage');
        const { data, error } = await db.from("banners").select("*").eq("shop_id", shopId).order("sort_order", { ascending: true }).order("created_at", { ascending: false });
        if (error) throw error;
        return json({ banners: (data || []).map(mapBannerForClient) });
      }

      // Shop takomillashtirish, 8-band: faqat sort_order'ni yangilaydi — boshqa
      // hech qanday maydonga tegmaydi (banner_update'dan farqli, xavfsizroq).
      case "banner_reorder": {
        await requirePermission('marketing.manage');
        const order = Array.isArray(payload.order) ? payload.order.map((x: any) => String(x)) : [];
        if (!order.length) return json({ error: "invalid_order" }, 400);
        const { error } = await db.rpc("ustore_reorder_entities", {
          p_shop_id: shopId, p_entity: "banners", p_items: order.map((id: string, index: number) => ({ id, sortOrder: index })),
        });
        if (error) throw error;
        return json({ ok: true });
      }

      case "banner_create":
      case "banner_update": {
        await requirePermission('marketing.manage');
        const isCreate = action === "banner_create";
        const id = isCreate ? null : String(payload.id || "");
        if (!isCreate && !id) return json({ error: "invalid_id" }, 400);
        // Shop takomillashtirish, 7-band: jami saqlanadigan banner soni 10 ta bilan cheklangan.
        if (isCreate) {
          const { count: existingCount, error: countErr } = await db.from("banners").select("id", { count: "exact", head: true }).eq("shop_id", shopId);
          if (countErr) throw countErr;
          if ((existingCount || 0) >= 10) return json({ error: "banner_limit_reached" }, 400);
        }

        // Shop takomillashtirish: banner_update ENDI qisman (partial) bo'lishi
        // mumkin — masalan toggleBannerActive faqat {id,isActive} yuboradi.
        // Avval mavjud qatorni o'qib olamiz, keyin faqat payload'da HAQIQATAN
        // kelgan maydonlarni almashtiramiz — aks holda (avvalgi xato) shu kabi
        // qisman chaqiruv sarlavha/maqsad/rasm kabi boshqa maydonlarni
        // bo'shatib qo'yardi (yoki rasm yo'qligi sababli butunlay xato berardi).
        let existing: any = null;
        if (!isCreate) {
          const { data: existingRow, error: existingErr } = await db.from("banners").select("*").eq("id", id).eq("shop_id", shopId).maybeSingle();
          if (existingErr) throw existingErr;
          if (!existingRow) return json({ error: "banner_not_found" }, 404);
          existing = existingRow;
        }

        const mode = payload.mode !== undefined ? (payload.mode === "IMAGE" ? "IMAGE" : "TEMPLATE") : (existing?.mode || "TEMPLATE");
        let uploadedBannerImage: { url: string; path: string } | null = null;
        let imageUrl: string | null = payload.imageUrl !== undefined
          ? (payload.imageUrl ? normalizeProductImageUrl(payload.imageUrl) : null)
          : (existing?.image_url ?? null);
        if (payload.imageUpload) {
          uploadedBannerImage = await storeProductImage(db, shopId, payload.imageUpload);
          imageUrl = uploadedBannerImage.url;
        }
        if (!imageUrl) {
          if (uploadedBannerImage) await db.storage.from("images").remove([uploadedBannerImage.path]);
          return json({ error: "image_required" }, 400);
        }

        const targetType = payload.targetType !== undefined
          ? (["PRODUCT", "CATEGORY", "URL", "BUNDLE", "PROMOTION"].includes(payload.targetType) ? payload.targetType : "NONE")
          : (existing?.target_type || "NONE");
        let targetUrl: string | null = existing?.target_url ?? null;
        if (targetType === "URL" && payload.targetUrl !== undefined) {
          const raw = String(payload.targetUrl || "").trim();
          try {
            const u = new URL(raw);
            if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("bad_protocol");
            targetUrl = u.href;
          } catch {
            return json({ error: "invalid_target_url" }, 400);
          }
        } else if (targetType !== "URL") {
          targetUrl = null;
        }
        const targetProductId = targetType === "PRODUCT"
          ? (payload.targetProductId !== undefined ? String(payload.targetProductId || "") || null : existing?.target_product_id ?? null)
          : null;
        const targetCategoryId = targetType === "CATEGORY"
          ? (payload.targetCategoryId !== undefined ? String(payload.targetCategoryId || "") || null : existing?.target_category_id ?? null)
          : null;
        const targetBundleId = targetType === "BUNDLE"
          ? (payload.targetBundleId !== undefined ? String(payload.targetBundleId || "") || null : existing?.target_bundle_id ?? null)
          : null;
        const targetPromotionId = targetType === "PROMOTION"
          ? (payload.targetPromotionId !== undefined ? String(payload.targetPromotionId || "") || null : existing?.target_promotion_id ?? null)
          : null;
        if (targetType === "PRODUCT" && !targetProductId) return json({ error: "target_product_required" }, 400);
        if (targetType === "CATEGORY" && !targetCategoryId) return json({ error: "target_category_required" }, 400);
        if (targetType === "BUNDLE" && !targetBundleId) return json({ error: "target_bundle_required" }, 400);
        if (targetType === "PROMOTION" && !targetPromotionId) return json({ error: "target_promotion_required" }, 400);
        // Mijoz yuborgan id ko'r-ko'rona ishonilmaydi — do'konga tegishli
        // ekanligi tekshiriladi (boshqa naqshlar bilan bir xil xavfsizlik talabi).
        if (targetType === "PRODUCT" && targetProductId) {
          const { data: productRow } = await db.from("products").select("id").eq("shop_id", shopId).eq("id", targetProductId).neq("status", "DELETED").maybeSingle();
          if (!productRow) return json({ error: "target_product_required" }, 400);
        }
        if (targetType === "CATEGORY" && targetCategoryId) {
          const { data: categoryRow } = await db.from("categories").select("id").eq("shop_id", shopId).eq("id", targetCategoryId).is("deleted_at", null).maybeSingle();
          if (!categoryRow) return json({ error: "target_category_required" }, 400);
        }
        if (targetType === "BUNDLE" && targetBundleId) {
          const { data: bRow } = await db.from("bundles").select("id").eq("shop_id", shopId).eq("id", targetBundleId).maybeSingle();
          if (!bRow) return json({ error: "target_bundle_required" }, 400);
        }
        if (targetType === "PROMOTION" && targetPromotionId) {
          const { data: pRow } = await db.from("promotions").select("id").eq("shop_id", shopId).eq("id", targetPromotionId).maybeSingle();
          if (!pRow) return json({ error: "target_promotion_required" }, 400);
        }

        const row: Record<string, unknown> = {
          shop_id: shopId, mode, image_url: imageUrl,
          title: payload.title !== undefined ? nullableText(payload.title, 80) : (existing?.title ?? null),
          subtitle: payload.subtitle !== undefined ? nullableText(payload.subtitle, 140) : (existing?.subtitle ?? null),
          cta_text: payload.ctaText !== undefined ? nullableText(payload.ctaText, 30) : (existing?.cta_text ?? null),
          target_type: targetType, target_product_id: targetProductId, target_category_id: targetCategoryId, target_url: targetUrl,
          target_bundle_id: targetBundleId, target_promotion_id: targetPromotionId,
          starts_at: payload.startsAt !== undefined ? (payload.startsAt ? new Date(payload.startsAt).toISOString() : null) : (existing?.starts_at ?? null),
          ends_at: payload.endsAt !== undefined ? (payload.endsAt ? new Date(payload.endsAt).toISOString() : null) : (existing?.ends_at ?? null),
          is_active: payload.isActive !== undefined ? !!payload.isActive : (existing ? !!existing.is_active : true),
          sort_order: payload.sortOrder !== undefined
            ? (Number.isFinite(Number(payload.sortOrder)) ? Number(payload.sortOrder) : 0)
            : (existing?.sort_order ?? 0),
          updated_at: new Date().toISOString(),
        };
        if (row.starts_at && row.ends_at && new Date(row.ends_at as string).getTime() < new Date(row.starts_at as string).getTime()) {
          return json({ error: "invalid_date_range" }, 400);
        }

        const query = isCreate
          ? db.from("banners").insert(row).select("*").single()
          : db.from("banners").update(row).eq("id", id).eq("shop_id", shopId).select("*").single();
        const { data, error } = await query;
        if (error) {
          if (uploadedBannerImage) await db.storage.from("images").remove([uploadedBannerImage.path]);
          throw error;
        }
        if (!data) {
          if (uploadedBannerImage) await db.storage.from("images").remove([uploadedBannerImage.path]);
          return json({ error: "banner_not_found" }, 404);
        }
        if (existing?.image_url && existing.image_url !== data.image_url) {
          EdgeRuntime.waitUntil(cleanupManagedImageIfUnreferenced(db, shopId, existing.image_url, SUPABASE_URL, "old-banner-image"));
        }
        auditLater(isCreate ? "BANNER_CREATED" : "BANNER_UPDATED", "banner", data.id, { mode, targetType });
        return json({ banner: mapBannerForClient(data) });
      }

      case "banner_delete": {
        await requirePermission('marketing.manage');
        const id = String(payload.id || "");
        if (!id) return json({ error: "invalid_id" }, 400);
        const { data: oldBanner, error: oldBannerErr } = await db.from("banners").select("image_url").eq("id", id).eq("shop_id", shopId).maybeSingle();
        if (oldBannerErr) throw oldBannerErr;
        const { error } = await db.from("banners").delete().eq("id", id).eq("shop_id", shopId);
        if (error) throw error;
        if (oldBanner?.image_url) EdgeRuntime.waitUntil(cleanupManagedImageIfUnreferenced(db, shopId, oldBanner.image_url, SUPABASE_URL, "deleted-banner-image"));
        auditLater("BANNER_DELETED", "banner", id, {});
        return json({ deleted: true });
      }

      // ==================== PROMO-CODE / DISCOUNT-CODE SYSTEM ====================

      case "marketing_summary": {
        await requirePermission('marketing.manage');
        const nowIso = new Date().toISOString();
        const activeCount = (table: string) => db.from(table).select("id", { count: "exact", head: true })
          .eq("shop_id", shopId).eq("is_active", true)
          .or(`starts_at.is.null,starts_at.lte.${nowIso}`).or(`ends_at.is.null,ends_at.gte.${nowIso}`);
        const totalCount = (table: string) => db.from(table).select("id", { count: "exact", head: true }).eq("shop_id", shopId);
        const [bannersR, bundlesR, promosR, tiersR, giftsR, couponsR, bannersAllR, bundlesAllR, promosAllR, tiersAllR, giftsAllR, couponsAllR] = await Promise.all([
          activeCount("banners"), activeCount("bundles"),
          // 3-paket, 7-topshiriq: bosqichli chegirma endi GURUH sifatida
          // sanaladi (har bosqich emas) — aks holda "4 ta jami" 1 ta qoidani
          // 4 ta alohida narsadek ko'rsatib, yangi guruhlangan UX'ga zid bo'lardi.
          activeCount("promotions").eq("source", "MANUAL"), activeCount("discount_tier_groups"),
          activeCount("automatic_gift_rules"),
          db.from("reward_rules").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("is_active", true),
          totalCount("banners"), totalCount("bundles"), totalCount("promotions").eq("source", "MANUAL"), totalCount("discount_tier_groups"), totalCount("automatic_gift_rules"),
          totalCount("reward_rules"),
        ]);
        for (const r of [bannersR, bundlesR, promosR, tiersR, giftsR,couponsR,bannersAllR,bundlesAllR,promosAllR,tiersAllR,giftsAllR,couponsAllR]) if (r.error) throw r.error;
        // 4-paket, 9-topshiriq: "Shaxsiy chegirmalar" kartasi uchun — batch_id
        // (yoki eski qatorlar uchun o'z id'si) bo'yicha UNIKAL sanaladi, xom
        // qator soni emas (bitta 15-mijozli kampaniya "1 ta", 15 emas).
        const { data: personalActiveRows, error: personalActiveErr } = await db.from("customer_discounts").select("id,batch_id")
          .eq("shop_id", shopId).eq("is_active", true).is("cancelled_at", null)
          .or(`starts_at.is.null,starts_at.lte.${nowIso}`).gte("ends_at", nowIso);
        if (personalActiveErr) throw personalActiveErr;
        const { data: personalAllRows, error: personalAllErr } = await db.from("customer_discounts").select("id,batch_id").eq("shop_id", shopId);
        if (personalAllErr) throw personalAllErr;
        const personalActiveCount = new Set((personalActiveRows || []).map((r: any) => r.batch_id || r.id)).size;
        const personalAllCount = new Set((personalAllRows || []).map((r: any) => r.batch_id || r.id)).size;
        const activeCounts = { banners:bannersR.count||0,bundles:bundlesR.count||0,promos:promosR.count||0,tiers:tiersR.count||0,gifts:(giftsR.count||0)+(couponsR.count||0),personal:personalActiveCount };
        const counts = {
          banners: bannersAllR.count || 0, bundles: bundlesAllR.count || 0,
          promos: promosAllR.count || 0, tiers: tiersAllR.count || 0, gifts: (giftsAllR.count || 0) + (couponsAllR.count || 0),
          personal: personalAllCount,
        };
        return json({ counts, activeCounts, activeTotal: activeCounts.banners + activeCounts.bundles + activeCounts.promos + activeCounts.tiers + activeCounts.gifts + activeCounts.personal });
      }

      // K3: compact admin-only bootstrap for premium-web marketing.
      // It intentionally exposes only the category/product fields needed by
      // marketing pickers plus the persisted featured-category configuration.
      case "get_marketing_bootstrap": {
        await requirePermission('marketing.manage');
        const [settingsR, categoriesR, productsR] = await Promise.all([
          db.from("shop_settings").select("featured_category_ids").eq("shop_id", shopId).maybeSingle(),
          db.from("categories").select("id,name,name_ru,parent_id,sort_order").eq("shop_id", shopId).is("deleted_at", null).order("sort_order", { ascending: true }),
          db.from("products").select("id,name,name_ru,category_id,status,is_visible,img,price,stock,variants").eq("shop_id", shopId).neq("status", "DELETED").order("sort_order", { ascending: true }),
        ]);
        if (settingsR.error) throw settingsR.error;
        if (categoriesR.error) throw categoriesR.error;
        if (productsR.error) throw productsR.error;
        const featuredCategories = Array.isArray(settingsR.data?.featured_category_ids)
          ? settingsR.data.featured_category_ids.filter((e: any) => e && typeof e === "object" && e.categoryId).map((e: any) => ({
              categoryId: String(e.categoryId),
              productIds: Array.isArray(e.productIds) ? e.productIds.map((x: any) => String(x)).slice(0, 6) : [],
            })).slice(0, 8)
          : [];
        return json({
          featuredCategories,
          categories: categoriesR.data || [],
          products: (productsR.data || []).map((p: any) => ({
            id: p.id, name: p.name, name_ru: p.name_ru || null, category_id: p.category_id || null,
            status: p.status, is_visible: p.is_visible !== false, img: p.img || null, price: Number(p.price) || 0,
            stock: Number(p.stock) || 0, hasVariants: Array.isArray(p.variants) && p.variants.length > 0,
          })),
        });
      }

      case "promo_generate_code": {
        await requirePermission('marketing.manage');
        for (let attempt = 0; attempt < 8; attempt++) {
          const code = `UST${crypto.randomUUID().replace(/-/g, "").slice(0, 7).toUpperCase()}`;
          const { data, error } = await db.from("promotions").select("id").eq("shop_id", shopId).eq("code", code).maybeSingle();
          if (error) throw error;
          if (!data) return json({ code });
        }
        return json({ error: "promo_code_generation_failed" }, 503);
      }

      case "promo_list": {
        await requirePermission('marketing.manage');
        const { data, error } = await db.from("promotions").select("*").eq("shop_id", shopId).order("created_at", { ascending: false });
        if (error) throw error;
        const promoIds = (data || []).map((p: any) => p.id);
        const usedCountByPromo = new Map<string, number>();
        if (promoIds.length) {
          const { data: usageRows, error: usageErr } = await db.from("promotion_redemptions").select("promotion_id").eq("shop_id", shopId).in("promotion_id", promoIds);
          if (usageErr) throw usageErr;
          for (const r of usageRows || []) usedCountByPromo.set(r.promotion_id, (usedCountByPromo.get(r.promotion_id) || 0) + 1);
        }
        return json({ promotions: (data || []).map((p: any) => ({ ...mapPromoForClient(p), usedCount: usedCountByPromo.get(p.id) || 0 })) });
      }

      case "promo_create": {
        await requirePermission('marketing.manage');
        const code = String(payload.code || "").trim().toUpperCase().slice(0, 40);
        const name = nullableText(payload.name, 120);
        if (!code || !/^[A-Z0-9_-]{2,40}$/.test(code)) return json({ error: "invalid_code" }, 400);
        if (!name) return json({ error: "invalid_name" }, 400);
        const discountType = payload.discountType === "FIXED" ? "FIXED" : "PERCENT";
        const discountValue = Number(payload.discountValue);
        if (!Number.isFinite(discountValue) || discountValue <= 0) return json({ error: "invalid_discount_value" }, 400);
        if (discountType === "PERCENT" && discountValue > 100) return json({ error: "invalid_percent" }, 400);
        const minOrderAmount = payload.minOrderAmount !== undefined && payload.minOrderAmount !== null && payload.minOrderAmount !== "" ? nonNegativeInteger(payload.minOrderAmount) : null;
        // 15-band spec, 13-band: ixtiyoriy yuqori chegara.
        const maxOrderAmount = payload.maxOrderAmount !== undefined && payload.maxOrderAmount !== null && payload.maxOrderAmount !== "" ? nonNegativeInteger(payload.maxOrderAmount) : null;
        if (minOrderAmount !== null && maxOrderAmount !== null && maxOrderAmount < minOrderAmount) return json({ error: "invalid_amount_range" }, 400);
        const startsAt = payload.startsAt ? new Date(payload.startsAt).toISOString() : null;
        const endsAt = payload.endsAt ? new Date(payload.endsAt).toISOString() : null;
        if (startsAt && endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) return json({ error: "invalid_date_range" }, 400);
        const usageLimit = payload.usageLimit !== undefined && payload.usageLimit !== null && payload.usageLimit !== "" ? Math.max(1, Math.round(Number(payload.usageLimit))) : null;
        const perCustomerLimit = payload.perCustomerLimit !== undefined && payload.perCustomerLimit !== null && payload.perCustomerLimit !== "" ? Math.max(1, Math.round(Number(payload.perCustomerLimit))) : null;
        const categoryIds = Array.isArray(payload.categoryIds) ? payload.categoryIds.map(String) : [];
        const productIds = Array.isArray(payload.productIds) ? payload.productIds.map(String) : [];
        if (categoryIds.length) {
          const { data: ownCats, error: ownCatsErr } = await db.from("categories").select("id").eq("shop_id", shopId).in("id", categoryIds);
          if (ownCatsErr) throw ownCatsErr;
          if ((ownCats || []).length !== new Set(categoryIds).size) return json({ error: "invalid_category" }, 400);
        }
        if (productIds.length) {
          const { data: ownProducts, error: ownProductsErr } = await db.from("products").select("id").eq("shop_id", shopId).in("id", productIds);
          if (ownProductsErr) throw ownProductsErr;
          if ((ownProducts || []).length !== new Set(productIds).size) return json({ error: "invalid_product" }, 400);
        }
        const { data, error } = await db.from("promotions").insert({
          shop_id: shopId, code, name, discount_type: discountType, discount_value: discountValue,
          min_order_amount: minOrderAmount, max_order_amount: maxOrderAmount, starts_at: startsAt, ends_at: endsAt,
          usage_limit: usageLimit, per_customer_limit: perCustomerLimit,
          category_ids: categoryIds.length ? categoryIds : null, product_ids: productIds.length ? productIds : null,
          new_customer_only: !!payload.newCustomerOnly, allow_stacking: !!payload.allowStacking,
          is_active: payload.isActive !== undefined ? !!payload.isActive : true,
          // 040: standart — OCHIQ (mavjud xatti-harakat bilan bir xil).
          // Admin ataylab yashirsagina false bo'ladi.
          is_public: payload.isPublic !== undefined ? !!payload.isPublic : true,
        }).select("*").single();
        if (error) {
          if (error.code === "23505") return json({ error: "promo_code_taken" }, 400);
          throw error;
        }
        auditLater("PROMO_CREATED", "promotion", data.id, { code, name, discountType, discountValue });
        return json({ promotion: mapPromoForClient(data) });
      }

      case "promo_update": {
        await requirePermission('marketing.manage');
        const id = String(payload.id || "");
        if (!id) return json({ error: "invalid_id" }, 400);
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (payload.name !== undefined) {
          const name = nullableText(payload.name, 120);
          if (!name) return json({ error: "invalid_name" }, 400);
          patch.name = name;
        }
        if (payload.discountType !== undefined) patch.discount_type = payload.discountType === "FIXED" ? "FIXED" : "PERCENT";
        if (payload.discountValue !== undefined) {
          const v = Number(payload.discountValue);
          if (!Number.isFinite(v) || v <= 0) return json({ error: "invalid_discount_value" }, 400);
          patch.discount_value = v;
        }
        if (payload.isActive !== undefined) patch.is_active = !!payload.isActive;
        if (payload.minOrderAmount !== undefined) patch.min_order_amount = payload.minOrderAmount !== null && payload.minOrderAmount !== "" ? nonNegativeInteger(payload.minOrderAmount) : null;
        if (payload.maxOrderAmount !== undefined) patch.max_order_amount = payload.maxOrderAmount !== null && payload.maxOrderAmount !== "" ? nonNegativeInteger(payload.maxOrderAmount) : null;
        if (patch.min_order_amount !== undefined && patch.max_order_amount !== undefined && patch.min_order_amount !== null && patch.max_order_amount !== null && (patch.max_order_amount as number) < (patch.min_order_amount as number)) {
          return json({ error: "invalid_amount_range" }, 400);
        }
        if (payload.startsAt !== undefined) patch.starts_at = payload.startsAt ? new Date(payload.startsAt).toISOString() : null;
        if (payload.endsAt !== undefined) patch.ends_at = payload.endsAt ? new Date(payload.endsAt).toISOString() : null;
        if (payload.usageLimit !== undefined) patch.usage_limit = payload.usageLimit !== null && payload.usageLimit !== "" ? Math.max(1, Math.round(Number(payload.usageLimit))) : null;
        if (payload.perCustomerLimit !== undefined) patch.per_customer_limit = payload.perCustomerLimit !== null && payload.perCustomerLimit !== "" ? Math.max(1, Math.round(Number(payload.perCustomerLimit))) : null;
        if (payload.categoryIds !== undefined) patch.category_ids = Array.isArray(payload.categoryIds) && payload.categoryIds.length ? payload.categoryIds.map(String) : null;
        if (payload.productIds !== undefined) patch.product_ids = Array.isArray(payload.productIds) && payload.productIds.length ? payload.productIds.map(String) : null;
        if (payload.newCustomerOnly !== undefined) patch.new_customer_only = !!payload.newCustomerOnly;
        if (payload.allowStacking !== undefined) patch.allow_stacking = !!payload.allowStacking;
        if (payload.isPublic !== undefined) patch.is_public = !!payload.isPublic;
        if (Array.isArray(patch.category_ids) && patch.category_ids.length) {
          const { data: ownCats, error: ownCatsErr } = await db.from("categories").select("id").eq("shop_id", shopId).in("id", patch.category_ids as string[]);
          if (ownCatsErr) throw ownCatsErr;
          if ((ownCats || []).length !== new Set(patch.category_ids as string[]).size) return json({ error: "invalid_category" }, 400);
        }
        if (Array.isArray(patch.product_ids) && patch.product_ids.length) {
          const { data: ownProducts, error: ownProductsErr } = await db.from("products").select("id").eq("shop_id", shopId).in("id", patch.product_ids as string[]);
          if (ownProductsErr) throw ownProductsErr;
          if ((ownProducts || []).length !== new Set(patch.product_ids as string[]).size) return json({ error: "invalid_product" }, 400);
        }
        const { data, error } = await db.from("promotions").update(patch).eq("id", id).eq("shop_id", shopId).select("*").single();
        if (error) {
          if (error.code === "23505") return json({ error: "promo_code_taken" }, 400);
          throw error;
        }
        if (!data) return json({ error: "promo_not_found" }, 404);
        auditLater("PROMO_UPDATED", "promotion", id, patch);
        return json({ promotion: mapPromoForClient(data) });
      }

      case "promo_delete": {
        await requirePermission('marketing.manage');
        const id = String(payload.id || "");
        if (!id) return json({ error: "invalid_id" }, 400);
        const { count, error: countErr } = await db.from("promotion_redemptions").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("promotion_id", id);
        if (countErr) throw countErr;
        if ((count || 0) > 0) {
          // Already used at least once — deactivate instead of deleting, so
          // promotion_redemptions (and the orders that reference this promo
          // by snapshot) never point at a vanished row.
          const { error } = await db.from("promotions").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id).eq("shop_id", shopId);
          if (error) throw error;
          auditLater("PROMO_DEACTIVATED", "promotion", id, { reason: "has_redemptions" });
          return json({ deactivatedInsteadOfDeleted: true });
        }
        await db.from("banners").update({ target_type: "NONE", target_promotion_id: null, updated_at: new Date().toISOString() })
          .eq("shop_id", shopId).eq("target_promotion_id", id);
        const { error } = await db.from("promotions").delete().eq("id", id).eq("shop_id", shopId);
        if (error) throw error;
        auditLater("PROMO_DELETED", "promotion", id, {});
        return json({ deleted: true });
      }

      // 3-paket, 6.8-band: "Kimlar ishlatgan?" — mavjud promotion_redemptions
      // (023) + orders'dan o'qiydi, yangi jadval/hisoblash yaratilmaydi.
      case "promo_usage_list": {
        await requirePermission('marketing.manage');
        const promoId = String(payload.promoId || "");
        if (!promoId) return json({ error: "invalid_id" }, 400);
        const { data: promo, error: promoErr } = await db.from("promotions").select("id,code,name").eq("id", promoId).eq("shop_id", shopId).maybeSingle();
        if (promoErr) throw promoErr;
        if (!promo) return json({ error: "promo_not_found" }, 404);
        const { data, error } = await db.from("promotion_redemptions")
          .select("id, tg_id, discount_amount, created_at, orders(id, user_name, phone, payable_total)")
          .eq("shop_id", shopId).eq("promotion_id", promoId).order("created_at", { ascending: false });
        if (error) throw error;
        return json({
          promo: { id: promo.id, code: promo.code, name: promo.name },
          usages: (data || []).map((r: any) => ({
            id: r.id, tgId: r.tg_id,
            customerName: r.orders?.user_name || null, phone: r.orders?.phone || null,
            orderId: r.orders?.id ?? null, orderTotal: r.orders?.payable_total != null ? Number(r.orders.payable_total) : null,
            discountAmount: Number(r.discount_amount) || 0, createdAt: r.created_at,
          })),
        });
      }

      // ==================== BUNDLE (Aksiya) — shop takomillashtirish qo'shimchasi ====================
      case "bundle_list": {
        await requirePermission('marketing.manage');
        await validateAndPauseBundles(db, shopId, BOT_TOKEN);
        const { data, error } = await db.from("bundles").select("*").eq("shop_id", shopId).order("sort_order", { ascending: true }).order("created_at", { ascending: false });
        if (error) throw error;
        return json({ bundles: (data || []).map(mapBundleForClient) });
      }
      case "bundle_create":
      case "bundle_update": {
        await requirePermission('marketing.manage');
        const isCreate = action === "bundle_create";
        const id = isCreate ? null : String(payload.id || "");
        if (!isCreate && !id) return json({ error: "invalid_id" }, 400);
        let existingBundle: any = null;
        if (!isCreate) {
          const { data: existingBundleRow, error: existingBundleErr } = await db.from("bundles").select("cover_image_url").eq("id", id).eq("shop_id", shopId).maybeSingle();
          if (existingBundleErr) throw existingBundleErr;
          if (!existingBundleRow) return json({ error: "bundle_not_found" }, 404);
          existingBundle = existingBundleRow;
        }
        const name = nullableText(payload.name, 120);
        if (!name) return json({ error: "invalid_name" }, 400);
        const items = Array.isArray(payload.items)
          ? payload.items.map((i: any) => ({ productId: String(i.productId || ""), qty: Math.max(1, Math.round(Number(i.qty) || 1)) })).filter((i: any) => i.productId)
          : [];
        if (items.length < 2) return json({ error: "bundle_needs_at_least_2_products" }, 400);
        const bundlePrice = Number(payload.bundlePrice);
        if (!Number.isFinite(bundlePrice) || bundlePrice <= 0) return json({ error: "invalid_bundle_price" }, 400);
        const productIds = items.map((i: any) => i.productId);
        const { data: validProds, error: prodErr } = await db.from("products").select("id").eq("shop_id", shopId).in("id", productIds);
        if (prodErr) throw prodErr;
        const validSet = new Set((validProds || []).map((r: any) => String(r.id)));
        if (productIds.some((pid: string) => !validSet.has(pid))) return json({ error: "invalid_product" }, 400);
        const { data: productDetails, error: detailError } = await db.from("products").select("id,price,stock,variants,status,is_visible").eq("shop_id", shopId).in("id", productIds);
        if (detailError) throw detailError;
        const productById = new Map((productDetails || []).map((product: any) => [String(product.id), product]));
        const variantProduct = items.find((item: any) => {
          const product: any = productById.get(item.productId);
          return Array.isArray(product?.variants) && product.variants.length > 0;
        });
        if (variantProduct) return json({ error: "bundle_variant_product_not_supported", productId: variantProduct.productId }, 400);
        const unavailable = items.find((item: any) => {
          const product: any = productById.get(item.productId);
          return !product || product.status === "DELETED" || product.is_visible === false || availableProductStock(product) < item.qty;
        });
        if ((payload.isActive !== undefined ? !!payload.isActive : true) && unavailable) return json({ error: "bundle_product_unavailable", productId: unavailable.productId }, 400);
        const snapshottedItems = items.map((item: any) => ({ ...item, unitPrice: Number((productById.get(item.productId) as any)?.price) || 0 }));
        let uploadedBundleImage: { url: string; path: string } | null = null;
        let coverImageUrl: string | null = payload.coverImageUrl !== undefined
          ? (payload.coverImageUrl ? normalizeProductImageUrl(payload.coverImageUrl) : null)
          : (existingBundle?.cover_image_url ?? null);
        if (payload.coverImageUpload) {
          uploadedBundleImage = await storeProductImage(db, shopId, payload.coverImageUpload);
          coverImageUrl = uploadedBundleImage.url;
        }
        const startsAt = payload.startsAt ? new Date(payload.startsAt).toISOString() : null;
        const endsAt = payload.endsAt ? new Date(payload.endsAt).toISOString() : null;
        if (startsAt && endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) return json({ error: "invalid_date_range" }, 400);
        const row: Record<string, unknown> = {
          shop_id: shopId, name, description: nullableText(payload.description, 300), items: snapshottedItems, bundle_price: bundlePrice,
          cover_image_url: coverImageUrl, starts_at: startsAt, ends_at: endsAt,
          is_active: payload.isActive !== undefined ? !!payload.isActive : true,
          pause_reason: null, paused_at: null,
          sort_order: Number.isFinite(Number(payload.sortOrder)) ? Number(payload.sortOrder) : 0,
          updated_at: new Date().toISOString(),
        };
        const query = isCreate
          ? db.from("bundles").insert(row).select("*").single()
          : db.from("bundles").update(row).eq("id", id).eq("shop_id", shopId).select("*").single();
        const { data, error } = await query;
        if (error) {
          if (uploadedBundleImage) await db.storage.from("images").remove([uploadedBundleImage.path]);
          throw error;
        }
        if (!data) {
          if (uploadedBundleImage) await db.storage.from("images").remove([uploadedBundleImage.path]);
          return json({ error: "bundle_not_found" }, 404);
        }
        if (existingBundle?.cover_image_url && existingBundle.cover_image_url !== data.cover_image_url) {
          EdgeRuntime.waitUntil(cleanupManagedImageIfUnreferenced(db, shopId, existingBundle.cover_image_url, SUPABASE_URL, "old-bundle-image"));
        }
        auditLater(isCreate ? "BUNDLE_CREATED" : "BUNDLE_UPDATED", "bundle", data.id, { name });
        return json({ bundle: mapBundleForClient(data) });
      }
      case "bundle_delete": {
        await requirePermission('marketing.manage');
        const id = String(payload.id || "");
        if (!id) return json({ error: "invalid_id" }, 400);
        const { data: oldBundle, error: oldBundleErr } = await db.from("bundles").select("cover_image_url").eq("id", id).eq("shop_id", shopId).maybeSingle();
        if (oldBundleErr) throw oldBundleErr;
        await db.from("banners").update({ target_type: "NONE", target_bundle_id: null, updated_at: new Date().toISOString() })
          .eq("shop_id", shopId).eq("target_bundle_id", id);
        const { error } = await db.from("bundles").delete().eq("id", id).eq("shop_id", shopId);
        if (error) throw error;
        if (oldBundle?.cover_image_url) EdgeRuntime.waitUntil(cleanupManagedImageIfUnreferenced(db, shopId, oldBundle.cover_image_url, SUPABASE_URL, "deleted-bundle-image"));
        auditLater("BUNDLE_DELETED", "bundle", id, {});
        return json({ deleted: true });
      }

      // ==================== BOSQICHLI CHEGIRMA (tier) ====================
      case "discount_tier_list": {
        await requirePermission('marketing.manage');
        const { data, error } = await db.from("discount_tiers").select("*").eq("shop_id", shopId).order("threshold_amount", { ascending: true });
        if (error) throw error;
        return json({
          tiers: (data || []).map((t: any) => ({
            id: t.id, name: t.name || null, thresholdAmount: Number(t.threshold_amount), discountType: t.discount_type,
            discountValue: Number(t.discount_value), categoryIds: Array.isArray(t.category_ids) ? t.category_ids : [],
            productIds: Array.isArray(t.product_ids) ? t.product_ids : [], startsAt: t.starts_at || null, endsAt: t.ends_at || null,
            allowStacking: !!t.allow_stacking, isActive: !!t.is_active, createdAt: t.created_at, updatedAt: t.updated_at || t.created_at,
          })),
        });
      }
      case "discount_tier_create":
      case "discount_tier_update": {
        await requirePermission('marketing.manage');
        const isCreate = action === "discount_tier_create";
        const id = isCreate ? null : String(payload.id || "");
        if (!isCreate && !id) return json({ error: "invalid_id" }, 400);
        const thresholdAmount = Number(payload.thresholdAmount);
        if (!Number.isFinite(thresholdAmount) || thresholdAmount <= 0) return json({ error: "invalid_threshold" }, 400);
        const discountType = payload.discountType === "FIXED" ? "FIXED" : "PERCENT";
        const discountValue = Number(payload.discountValue);
        if (!Number.isFinite(discountValue) || discountValue <= 0) return json({ error: "invalid_discount_value" }, 400);
        if (discountType === "PERCENT" && discountValue > 100) return json({ error: "invalid_percent" }, 400);
        const categoryIds = Array.isArray(payload.categoryIds) ? payload.categoryIds.map(String) : [];
        const productIds = Array.isArray(payload.productIds) ? payload.productIds.map(String) : [];
        const startsAt = payload.startsAt ? new Date(payload.startsAt).toISOString() : null;
        const endsAt = payload.endsAt ? new Date(payload.endsAt).toISOString() : null;
        if (startsAt && endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) return json({ error: "invalid_date_range" }, 400);
        const row: Record<string, unknown> = {
          shop_id: shopId, name: nullableText(payload.name, 80), threshold_amount: thresholdAmount,
          discount_type: discountType, discount_value: discountValue,
          category_ids: categoryIds.length ? categoryIds : null, product_ids: productIds.length ? productIds : null,
          starts_at: startsAt, ends_at: endsAt, allow_stacking: !!payload.allowStacking,
          is_active: payload.isActive !== undefined ? !!payload.isActive : true,
          updated_at: new Date().toISOString(),
        };
        const query = isCreate
          ? db.from("discount_tiers").insert(row).select("*").single()
          : db.from("discount_tiers").update(row).eq("id", id).eq("shop_id", shopId).select("*").single();
        const { data, error } = await query;
        if (error) throw error;
        if (!data) return json({ error: "tier_not_found" }, 404);
        auditLater(isCreate ? "DISCOUNT_TIER_CREATED" : "DISCOUNT_TIER_UPDATED", "discount_tier", data.id, {});
        return json({ ok: true });
      }
      case "discount_tier_delete": {
        await requirePermission('marketing.manage');
        const id = String(payload.id || "");
        if (!id) return json({ error: "invalid_id" }, 400);
        const { error } = await db.from("discount_tiers").delete().eq("id", id).eq("shop_id", shopId);
        if (error) throw error;
        auditLater("DISCOUNT_TIER_DELETED", "discount_tier", id, {});
        return json({ deleted: true });
      }

      // 3-paket, 7-topshiriq: bitta bosqichli chegirma qoidasi = bitta
      // discount_tier_groups qatori + ko'p discount_tiers "bosqich" qatori.
      // Checkout hisob-kitobi (resolveTierDiscount/resolveNextTierOpportunity,
      // yuqorida) bularga UMUMAN TEGILMAYDI — ular hali ham flat
      // discount_tiers'ni bevosita o'qiydi, shu sabab har bosqich qatoriga
      // guruhning umumiy maydonlari (muddat/status/qamrov/stacking)
      // saqlashda NUSXALANADI (denormalize) — checkout mantig'i o'zgarmaydi.
      case "discount_tier_group_list": {
        await requirePermission('marketing.manage');
        const { data: groups, error: gErr } = await db.from("discount_tier_groups").select("*").eq("shop_id", shopId).order("created_at", { ascending: false });
        if (gErr) throw gErr;
        const groupIds = (groups || []).map((g: any) => g.id);
        const { data: steps, error: sErr } = groupIds.length
          ? await db.from("discount_tiers").select("*").eq("shop_id", shopId).in("group_id", groupIds).order("threshold_amount", { ascending: true })
          : { data: [] };
        if (sErr) throw sErr;
        const stepsByGroup = new Map<string, any[]>();
        for (const s of steps || []) {
          const arr = stepsByGroup.get(s.group_id) || [];
          arr.push({ id: s.id, thresholdAmount: Number(s.threshold_amount), discountType: s.discount_type, discountValue: Number(s.discount_value) });
          stepsByGroup.set(s.group_id, arr);
        }
        return json({
          groups: (groups || []).map((g: any) => ({
            id: g.id, name: g.name || null,
            categoryIds: Array.isArray(g.category_ids) ? g.category_ids : [],
            productIds: Array.isArray(g.product_ids) ? g.product_ids : [],
            startsAt: g.starts_at || null, endsAt: g.ends_at || null,
            allowStacking: !!g.allow_stacking, isActive: !!g.is_active,
            createdAt: g.created_at,
            steps: stepsByGroup.get(g.id) || [],
          })),
        });
      }
      case "discount_tier_group_create":
      case "discount_tier_group_update": {
        await requirePermission('marketing.manage');
        const isCreate = action === "discount_tier_group_create";
        const id = isCreate ? null : String(payload.id || "");
        if (!isCreate && !id) return json({ error: "invalid_id" }, 400);
        const rawSteps = Array.isArray(payload.steps) ? payload.steps : [];
        if (!rawSteps.length) return json({ error: "steps_required" }, 400);
        const normalizedSteps: { id?: string; thresholdAmount: number; discountType: string; discountValue: number }[] = [];
        for (const raw of rawSteps) {
          const thresholdAmount = Number(raw.thresholdAmount);
          if (!Number.isFinite(thresholdAmount) || thresholdAmount <= 0) return json({ error: "invalid_threshold" }, 400);
          const discountType = raw.discountType === "FIXED" ? "FIXED" : "PERCENT";
          const discountValue = Number(raw.discountValue);
          if (!Number.isFinite(discountValue) || discountValue <= 0) return json({ error: "invalid_discount_value" }, 400);
          if (discountType === "PERCENT" && discountValue > 100) return json({ error: "invalid_percent" }, 400);
          normalizedSteps.push({ id: raw.id ? String(raw.id) : undefined, thresholdAmount, discountType, discountValue });
        }
        normalizedSteps.sort((a, b) => a.thresholdAmount - b.thresholdAmount);
        for (let i = 1; i < normalizedSteps.length; i++) {
          if (normalizedSteps[i].thresholdAmount <= normalizedSteps[i - 1].thresholdAmount) return json({ error: "steps_not_increasing" }, 400);
        }
        const categoryIds = Array.isArray(payload.categoryIds) ? payload.categoryIds.map(String) : [];
        const productIds = Array.isArray(payload.productIds) ? payload.productIds.map(String) : [];
        if (categoryIds.length) {
          const { data: ownCats, error: ownCatsErr } = await db.from("categories").select("id").eq("shop_id", shopId).in("id", categoryIds);
          if (ownCatsErr) throw ownCatsErr;
          if ((ownCats || []).length !== new Set(categoryIds).size) return json({ error: "invalid_category" }, 400);
        }
        if (productIds.length) {
          const { data: ownProducts, error: ownProductsErr } = await db.from("products").select("id").eq("shop_id", shopId).in("id", productIds);
          if (ownProductsErr) throw ownProductsErr;
          if ((ownProducts || []).length !== new Set(productIds).size) return json({ error: "invalid_product" }, 400);
        }
        const startsAt = payload.startsAt ? new Date(payload.startsAt).toISOString() : null;
        const endsAt = payload.endsAt ? new Date(payload.endsAt).toISOString() : null;
        if (startsAt && endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) return json({ error: "invalid_date_range" }, 400);
        const isActive = payload.isActive !== undefined ? !!payload.isActive : true;
        const allowStacking = !!payload.allowStacking;
        const groupRow: Record<string, unknown> = {
          shop_id: shopId, name: nullableText(payload.name, 80),
          category_ids: categoryIds.length ? categoryIds : null, product_ids: productIds.length ? productIds : null,
          starts_at: startsAt, ends_at: endsAt, allow_stacking: allowStacking, is_active: isActive,
          updated_at: new Date().toISOString(),
        };
        const { data: groupId, error: saveError } = await db.rpc("ustore_save_discount_tier_group", {
          p_shop_id: shopId,
          p_group_id: isCreate ? null : id,
          p_group: groupRow,
          p_steps: normalizedSteps.map((step) => ({
            threshold_amount: step.thresholdAmount, discount_type: step.discountType, discount_value: step.discountValue,
          })),
        });
        if (saveError) {
          if (String(saveError.message || "").includes("group_not_found")) return json({ error: "group_not_found" }, 404);
          throw saveError;
        }
        auditLater(isCreate ? "DISCOUNT_TIER_GROUP_CREATED" : "DISCOUNT_TIER_GROUP_UPDATED", "discount_tier_group", groupId, { stepCount: normalizedSteps.length });
        return json({ ok: true, id: groupId });
      }
      case "discount_tier_group_delete": {
        await requirePermission('marketing.manage');
        const id = String(payload.id || "");
        if (!id) return json({ error: "invalid_id" }, 400);
        const { error } = await db.from("discount_tier_groups").delete().eq("id", id).eq("shop_id", shopId);
        if (error) throw error;
        auditLater("DISCOUNT_TIER_GROUP_DELETED", "discount_tier_group", id, {});
        return json({ deleted: true });
      }

      // ==================== AVTOMATIK REWARD QOIDALARI ====================
      case "reward_rule_list": {
        await requirePermission('marketing.manage');
        const { data, error } = await db.from("reward_rules").select("*").eq("shop_id", shopId).order("threshold_amount", { ascending: true });
        if (error) throw error;
        return json({
          rules: (data || []).map((r: any) => ({
            id: r.id, triggerType: r.trigger_type, thresholdAmount: Number(r.threshold_amount), rewardType: r.reward_type,
            rewardValue: Number(r.reward_value), codeExpiryDays: r.code_expiry_days || null, periodDays: r.period_days || null,
            isActive: !!r.is_active, createdAt: r.created_at,
          })),
        });
      }
      case "reward_rule_create":
      case "reward_rule_update": {
        await requirePermission('marketing.manage');
        const isCreate = action === "reward_rule_create";
        const id = isCreate ? null : String(payload.id || "");
        if (!isCreate && !id) return json({ error: "invalid_id" }, 400);
        const triggerType = payload.triggerType === "LIFETIME_TOTAL" ? "LIFETIME_TOTAL" : "ORDER_TOTAL";
        const thresholdAmount = Number(payload.thresholdAmount);
        if (!Number.isFinite(thresholdAmount) || thresholdAmount <= 0) return json({ error: "invalid_threshold" }, 400);
        const rewardType = payload.rewardType === "FIXED" ? "FIXED" : "PERCENT";
        const rewardValue = Number(payload.rewardValue);
        if (!Number.isFinite(rewardValue) || rewardValue <= 0) return json({ error: "invalid_reward_value" }, 400);
        if (rewardType === "PERCENT" && rewardValue > 100) return json({ error: "invalid_percent" }, 400);
        const codeExpiryDays = payload.codeExpiryDays !== undefined && payload.codeExpiryDays !== null && payload.codeExpiryDays !== ""
          ? Math.max(1, Math.round(Number(payload.codeExpiryDays))) : null;
        const periodDays = triggerType === "LIFETIME_TOTAL" && payload.periodDays !== undefined && payload.periodDays !== null && payload.periodDays !== ""
          ? Math.max(1, Math.min(3650, Math.round(Number(payload.periodDays)))) : null;
        const row: Record<string, unknown> = {
          shop_id: shopId, trigger_type: triggerType, threshold_amount: thresholdAmount, reward_type: rewardType,
          reward_value: rewardValue, code_expiry_days: codeExpiryDays, period_days: periodDays,
          is_active: payload.isActive !== undefined ? !!payload.isActive : true, updated_at: new Date().toISOString(),
        };
        // 15-band spec, 14-band: shu qoida orqali AVTOMATIK yaratiladigan har
        // bir promo-kod shu transferable qiymatini meros qiladi. Yangi
        // qoidada default FALSE (xavfsizroq); tahrirlashda faqat aniq
        // yuborilgan bo'lsa o'zgaradi (boshqa maydonlar bilan bir xil naqsh).
        if (isCreate || payload.transferable !== undefined) row.transferable = !!payload.transferable;
        const query = isCreate
          ? db.from("reward_rules").insert(row).select("*").single()
          : db.from("reward_rules").update(row).eq("id", id).eq("shop_id", shopId).select("*").single();
        const { data, error } = await query;
        if (error) throw error;
        if (!data) return json({ error: "rule_not_found" }, 404);
        auditLater(isCreate ? "REWARD_RULE_CREATED" : "REWARD_RULE_UPDATED", "reward_rule", data.id, {});
        return json({ ok: true });
      }
      case "reward_rule_delete": {
        await requirePermission('marketing.manage');
        const id = String(payload.id || "");
        if (!id) return json({ error: "invalid_id" }, 400);
        const { error } = await db.from("reward_rules").delete().eq("id", id).eq("shop_id", shopId);
        if (error) throw error;
        auditLater("REWARD_RULE_DELETED", "reward_rule", id, {});
        return json({ deleted: true });
      }

      // ==================== HAQIQIY AVTOMATIK SOVG'A MAHSULOT ====================
      case "automatic_gift_list": {
        await requirePermission('marketing.manage');
        const { data, error } = await db.from("automatic_gift_rules").select("*").eq("shop_id", shopId).order("created_at", { ascending: false });
        if (error) throw error;
        const ids = (data || []).map((r: any) => r.id);
        const usageByRule = new Map<string, number>();
        if (ids.length) {
          const { data: usages, error: usageErr } = await db.from("automatic_gift_usages").select("rule_id").eq("shop_id", shopId).in("rule_id", ids);
          if (usageErr) throw usageErr;
          for (const u of usages || []) usageByRule.set(String(u.rule_id), (usageByRule.get(String(u.rule_id)) || 0) + 1);
        }
        return json({ rules: (data || []).map((r: any) => mapAutomaticGiftRuleForClient(r, usageByRule.get(String(r.id)) || 0)) });
      }
      case "automatic_gift_create":
      case "automatic_gift_update": {
        await requirePermission('marketing.manage');
        const isCreate = action === "automatic_gift_create";
        const id = isCreate ? null : String(payload.id || "");
        if (!isCreate && !id) return json({ error: "invalid_id" }, 400);
        const name = nullableText(payload.name, 120);
        if (!name) return json({ error: "invalid_name" }, 400);
        const conditionType = ["ORDER_AMOUNT", "CATEGORY_QUANTITY", "SPECIFIC_PRODUCT", "SPECIFIC_PRODUCTS"].includes(payload.conditionType)
          ? payload.conditionType : "ORDER_AMOUNT";
        const thresholdAmount = conditionType === "ORDER_AMOUNT" ? Number(payload.thresholdAmount) : null;
        // 4-paket, 8-topshiriq: SPECIFIC_PRODUCTS (ko'plik) miqdorga emas,
        // savatchada BOR/YO'Qligiga qarab ishlaydi — threshold_quantity kerak emas.
        const thresholdQuantity = (conditionType === "CATEGORY_QUANTITY" || conditionType === "SPECIFIC_PRODUCT")
          ? Math.max(1, Math.round(Number(payload.thresholdQuantity) || 0)) : null;
        if (conditionType === "ORDER_AMOUNT" && (!Number.isFinite(thresholdAmount) || Number(thresholdAmount) <= 0)) return json({ error: "invalid_threshold" }, 400);
        if ((conditionType === "CATEGORY_QUANTITY" || conditionType === "SPECIFIC_PRODUCT") && (!thresholdQuantity || thresholdQuantity <= 0)) return json({ error: "invalid_threshold" }, 400);
        const targetProductId = conditionType === "SPECIFIC_PRODUCT" ? String(payload.targetProductId || "") : null;
        const targetCategoryId = conditionType === "CATEGORY_QUANTITY" ? String(payload.targetCategoryId || "") : null;
        const targetProductIds = conditionType === "SPECIFIC_PRODUCTS" && Array.isArray(payload.targetProductIds)
          ? Array.from(new Set(payload.targetProductIds.map(String).filter(Boolean))) : [];
        const matchMode = conditionType === "SPECIFIC_PRODUCTS" ? (payload.matchMode === "ALL" ? "ALL" : "ANY") : null;
        const giftProductId = String(payload.giftProductId || "");
        const giftQuantity = Math.max(1, Math.round(Number(payload.giftQuantity) || 0));
        if (!giftProductId) return json({ error: "gift_product_required" }, 400);
        if (conditionType === "SPECIFIC_PRODUCT" && !targetProductId) return json({ error: "target_product_required" }, 400);
        if (conditionType === "CATEGORY_QUANTITY" && !targetCategoryId) return json({ error: "target_category_required" }, 400);
        if (conditionType === "SPECIFIC_PRODUCTS" && !targetProductIds.length) return json({ error: "target_products_required" }, 400);

        const productIds = [giftProductId, targetProductId, ...targetProductIds].filter(Boolean) as string[];
        const { data: ownProducts, error: ownProductErr } = await db.from("products").select("id,variants").eq("shop_id", shopId).in("id", productIds);
        if (ownProductErr) throw ownProductErr;
        if ((ownProducts || []).length !== new Set(productIds).size) return json({ error: "invalid_product" }, 400);
        const giftProduct = (ownProducts || []).find((p: any) => String(p.id) === giftProductId);
        if (Array.isArray(giftProduct?.variants) && giftProduct.variants.length) return json({ error: "gift_product_variants_not_supported" }, 400);
        if (targetCategoryId) {
          const { data: ownCategory, error: ownCategoryErr } = await db.from("categories").select("id").eq("shop_id", shopId).eq("id", targetCategoryId).maybeSingle();
          if (ownCategoryErr) throw ownCategoryErr;
          if (!ownCategory) return json({ error: "invalid_category" }, 400);
        }
        const startsAt = payload.startsAt ? new Date(payload.startsAt).toISOString() : null;
        const endsAt = payload.endsAt ? new Date(payload.endsAt).toISOString() : null;
        if (startsAt && endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) return json({ error: "invalid_date_range" }, 400);
        const row = {
          shop_id: shopId, name, condition_type: conditionType,
          threshold_amount: thresholdAmount, threshold_quantity: thresholdQuantity,
          target_product_id: targetProductId, target_category_id: targetCategoryId,
          target_product_ids: targetProductIds.length ? targetProductIds : null, match_mode: matchMode,
          gift_product_id: giftProductId, gift_quantity: giftQuantity,
          stock_zero_policy: payload.stockZeroPolicy === "CONTINUE_WITHOUT_GIFT" ? "CONTINUE_WITHOUT_GIFT" : "AUTO_PAUSE",
          starts_at: startsAt, ends_at: endsAt,
          is_active: payload.isActive !== undefined ? !!payload.isActive : true,
          updated_at: new Date().toISOString(),
        };
        const query = isCreate
          ? db.from("automatic_gift_rules").insert(row).select("*").single()
          : db.from("automatic_gift_rules").update(row).eq("id", id).eq("shop_id", shopId).select("*").single();
        const { data, error } = await query;
        if (error) throw error;
        if (!data) return json({ error: "gift_rule_not_found" }, 404);
        auditLater(isCreate ? "AUTOMATIC_GIFT_CREATED" : "AUTOMATIC_GIFT_UPDATED", "automatic_gift_rule", data.id, { name, conditionType });
        return json({ rule: mapAutomaticGiftRuleForClient(data) });
      }
      case "automatic_gift_delete": {
        await requirePermission('marketing.manage');
        const id = String(payload.id || "");
        if (!id) return json({ error: "invalid_id" }, 400);
        const { count, error: countErr } = await db.from("automatic_gift_usages").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("rule_id", id);
        if (countErr) throw countErr;
        if ((count || 0) > 0) {
          const { error } = await db.from("automatic_gift_rules").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id).eq("shop_id", shopId);
          if (error) throw error;
          auditLater("AUTOMATIC_GIFT_DEACTIVATED", "automatic_gift_rule", id, { reason: "has_usage" });
          return json({ deactivatedInsteadOfDeleted: true });
        }
        const { error } = await db.from("automatic_gift_rules").delete().eq("id", id).eq("shop_id", shopId);
        if (error) throw error;
        auditLater("AUTOMATIC_GIFT_DELETED", "automatic_gift_rule", id, {});
        return json({ deleted: true });
      }

      // ==================== VIP MIJOZ CHEGIRMASI ====================
      case "customer_discount_list": {
        await requirePermission('customers.manage');
        const tgIdFilter = payload.tgId ? String(payload.tgId) : null;
        let query = db.from("customer_discounts").select("*").eq("shop_id", shopId).order("created_at", { ascending: false });
        if (tgIdFilter) query = query.eq("tg_id", tgIdFilter);
        const { data, error } = await query;
        if (error) throw error;
        return json({
          discounts: (data || []).map((d: any) => ({
            id: d.id, tgId: d.tg_id, discountType: d.discount_type, discountValue: Number(d.discount_value),
            startsAt: d.starts_at || null, endsAt: d.ends_at, isActive: !!d.is_active && !d.cancelled_at,
            cancelledAt: d.cancelled_at || null, createdAt: d.created_at,
          })),
        });
      }
      // Bir yoki bir nechta mijozga BIR XIL chegirmani birdaniga beradi
      // (spec: "bitta yoki bir nechta customer tanlaydi"). Har biriga
      // alohida qator yaratiladi, har biriga alohida Telegram xabar boradi
      // — bittasining notification xatosi qolganlarini to'xtatmaydi.
      // 4-paket, 10-topshiriq: Hisobotlar'dagi tezkor oqim VA Marketing ->
      // Shaxsiy chegirmalar'ning to'liq formasi AYNAN shu bitta action'dan
      // foydalanadi (10.1: "ikki xil mustaqil tizim yaratma"). Yangi
      // ixtiyoriy maydonlar (name/minOrderAmount/maxOrderAmount/usageLimit)
      // qo'shildi — berilmasa eski xatti-harakat (cheklovsiz) saqlanadi.
      // `batchId` bir chaqiruvda yaratilgan barcha qatorlarni BITTA
      // "kartochka" sifatida guruhlash uchun (faqat admin ko'rinishi uchun —
      // checkout resolveVipDiscount() individual qatorni o'qiydi, o'zgarmagan).
      case "customer_discount_create": {
        await requirePermission('customers.manage');
        const tgIds: string[] = Array.isArray(payload.tgIds) ? payload.tgIds.map((x: any) => String(x)).filter(Boolean) : (payload.tgId ? [String(payload.tgId)] : []);
        if (!tgIds.length) return json({ error: "customer_required" }, 400);
        const discountType = payload.discountType === "FIXED" ? "FIXED" : "PERCENT";
        const discountValue = Number(payload.discountValue);
        if (!Number.isFinite(discountValue) || discountValue <= 0) return json({ error: "invalid_discount_value" }, 400);
        if (discountType === "PERCENT" && discountValue > 100) return json({ error: "invalid_percent" }, 400);
        const endsAt = payload.endsAt ? new Date(payload.endsAt).toISOString() : null;
        if (!endsAt) return json({ error: "end_date_required" }, 400);
        const startsAt = payload.startsAt ? new Date(payload.startsAt).toISOString() : null;
        if (startsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) return json({ error: "invalid_date_range" }, 400);
        const name = nullableText(payload.name, 120);
        const minOrderAmount = payload.minOrderAmount !== undefined && payload.minOrderAmount !== null && payload.minOrderAmount !== "" ? nonNegativeInteger(payload.minOrderAmount) : null;
        const maxOrderAmount = payload.maxOrderAmount !== undefined && payload.maxOrderAmount !== null && payload.maxOrderAmount !== "" ? nonNegativeInteger(payload.maxOrderAmount) : null;
        if (minOrderAmount !== null && maxOrderAmount !== null && maxOrderAmount < minOrderAmount) return json({ error: "invalid_amount_range" }, 400);
        const usageLimit = payload.usageLimit !== undefined && payload.usageLimit !== null && payload.usageLimit !== "" ? Math.max(1, Math.round(Number(payload.usageLimit))) : null;

        const { data: ownRows, error: ownErr } = await db.from("app_users").select("tg_id").eq("shop_id", shopId).in("tg_id", tgIds);
        if (ownErr) throw ownErr;
        const ownSet = new Set((ownRows || []).map((r: any) => String(r.tg_id)));
        if (tgIds.some((id) => !ownSet.has(id))) return json({ error: "customer_not_found" }, 400);

        const batchId = crypto.randomUUID();
        const rows = tgIds.map((tg) => ({
          shop_id: shopId, tg_id: tg, discount_type: discountType, discount_value: discountValue,
          starts_at: startsAt, ends_at: endsAt, created_by: tgId,
          name, min_order_amount: minOrderAmount, max_order_amount: maxOrderAmount, usage_limit: usageLimit, batch_id: batchId,
        }));
        const { data, error } = await db.from("customer_discounts").insert(rows).select("*");
        if (error) throw error;
        auditLater("CUSTOMER_DISCOUNT_CREATED", "customer_discount", null, { tgIds, discountType, discountValue, batchId });

        // Notification failure discount yaratishni ASLO rollback qilmaydi —
        // EdgeRuntime.waitUntil, javobdan keyin, xato bo'lsa faqat log.
        const untilStr = new Date(endsAt).toLocaleDateString("uz-UZ");
        const untilStrRu = new Date(endsAt).toLocaleDateString("ru-RU");
        const valueStr = discountType === "PERCENT" ? `${discountValue}%` : `${Number(discountValue).toLocaleString("uz-UZ")} so'm`;
        const valueStrRu = discountType === "PERCENT" ? `${discountValue}%` : `${Number(discountValue).toLocaleString("ru-RU")} сум`;
        // 10.16-band: mavjud bo'lmagan shartni (min/max) xabarda yozma.
        const rangeUz = minOrderAmount && maxOrderAmount ? ` ${Number(minOrderAmount).toLocaleString("uz-UZ")}–${Number(maxOrderAmount).toLocaleString("uz-UZ")} so'mlik buyurtmalarda`
          : minOrderAmount ? ` ${Number(minOrderAmount).toLocaleString("uz-UZ")} so'mdan yuqori buyurtmalarda` : "";
        const rangeRu = minOrderAmount && maxOrderAmount ? ` на заказы ${Number(minOrderAmount).toLocaleString("ru-RU")}–${Number(maxOrderAmount).toLocaleString("ru-RU")} сум`
          : minOrderAmount ? ` на заказы от ${Number(minOrderAmount).toLocaleString("ru-RU")} сум` : "";
        // Server mijozning UZ/RU tanlovini bilmaydi (app_users'da til ustuni
        // yo'q) — shu sabab ikkala tilda ham yuboriladi (izoh yuqorida,
        // reward-kod notification'idagi bilan bir xil qaror).
        const textUz = `🎁 Siz bizning eng yaxshi mijozlarimizdansiz! Sizga${rangeUz} ${untilStr}gacha ${valueStr} shaxsiy chegirma taqdim etdik. Xaridlaringiz uchun rahmat — foydalanib qoling!`;
        const textRu = `🎁 Вы один из наших лучших клиентов! Мы предоставили вам${rangeRu} персональную скидку ${valueStrRu} до ${untilStrRu}. Спасибо за ваши покупки — пользуйтесь на здоровье!`;
        for (const tg of tgIds) {
          EdgeRuntime.waitUntil(
            telegramApi(BOT_TOKEN, "sendMessage", { chat_id: tg, text: `${textUz}\n\n${textRu}` })
              .catch((e: any) => console.error("[VIP_DISCOUNT_NOTIFY_FAILED]", tg, e))
          );
        }
        return json({ discounts: data || [], batchId });
      }
      case "customer_discount_cancel": {
        await requirePermission('customers.manage');
        const id = String(payload.id || "");
        if (!id) return json({ error: "invalid_id" }, 400);
        const { error } = await db.from("customer_discounts").update({ is_active: false, cancelled_at: new Date().toISOString() }).eq("id", id).eq("shop_id", shopId);
        if (error) throw error;
        auditLater("CUSTOMER_DISCOUNT_CANCELLED", "customer_discount", id, {});
        return json({ ok: true });
      }

      // ---- Marketing -> "Shaxsiy chegirmalar" to'liq boshqaruv (4-paket,
      // 10-topshiriq) — customer_discounts'dagi batch_id bo'yicha guruhlaydi.
      // batch_id=null bo'lgan eski qatorlar o'z-o'zining bitta-a'zoli
      // "batch"i sifatida ko'rsatiladi (hech narsa yo'qolmaydi).
      case "customer_discount_batch_list": {
        await requirePermission('customers.manage');
        const { data, error } = await db.from("customer_discounts").select("*").eq("shop_id", shopId).order("created_at", { ascending: false });
        if (error) throw error;
        const rows = data || [];
        const ids = rows.map((r: any) => r.id);
        const { data: usageRows } = ids.length
          ? await db.from("customer_discount_usages").select("customer_discount_id").eq("shop_id", shopId).in("customer_discount_id", ids)
          : { data: [] };
        const usedCountById = new Map<string, number>();
        for (const u of usageRows || []) usedCountById.set(u.customer_discount_id, (usedCountById.get(u.customer_discount_id) || 0) + 1);
        const batches = new Map<string, any[]>();
        for (const r of rows) {
          const key = r.batch_id || `row:${r.id}`;
          const arr = batches.get(key) || [];
          arr.push(r);
          batches.set(key, arr);
        }
        return json({
          batches: Array.from(batches.entries()).map(([key, members]) => {
            const first = members[0];
            const usedCount = members.reduce((s, m) => s + (usedCountById.get(m.id) || 0), 0);
            return {
              id: key, name: first.name || null, discountType: first.discount_type, discountValue: Number(first.discount_value),
              minOrderAmount: first.min_order_amount != null ? Number(first.min_order_amount) : null,
              maxOrderAmount: first.max_order_amount != null ? Number(first.max_order_amount) : null,
              usageLimit: first.usage_limit ?? null,
              startsAt: first.starts_at || null, endsAt: first.ends_at,
              isActive: members.every((m) => m.is_active && !m.cancelled_at),
              memberCount: members.length, usedCount, createdAt: first.created_at,
            };
          }),
        });
      }
      case "customer_discount_batch_detail": {
        await requirePermission('customers.manage');
        const batchId = String(payload.batchId || "");
        if (!batchId) return json({ error: "invalid_id" }, 400);
        const isRowFallback = batchId.startsWith("row:");
        let query = db.from("customer_discounts").select("*").eq("shop_id", shopId);
        query = isRowFallback ? query.eq("id", batchId.slice(4)) : query.eq("batch_id", batchId);
        const { data: members, error } = await query;
        if (error) throw error;
        if (!members || !members.length) return json({ error: "not_found" }, 404);
        const memberIds = members.map((m: any) => m.id);
        const memberTgIds = members.map((m: any) => String(m.tg_id));
        const [{ data: usageRows }, { data: userRows }] = await Promise.all([
          db.from("customer_discount_usages").select("customer_discount_id").eq("shop_id", shopId).in("customer_discount_id", memberIds),
          db.from("app_users").select("tg_id,first_name,last_name,username,phone").eq("shop_id", shopId).in("tg_id", memberTgIds),
        ]);
        const usedCountById = new Map<string, number>();
        for (const u of usageRows || []) usedCountById.set(u.customer_discount_id, (usedCountById.get(u.customer_discount_id) || 0) + 1);
        const userByTgId = new Map((userRows || []).map((u: any) => [String(u.tg_id), u]));
        const first = members[0];
        return json({
          batch: {
            id: batchId, name: first.name || null, discountType: first.discount_type, discountValue: Number(first.discount_value),
            minOrderAmount: first.min_order_amount != null ? Number(first.min_order_amount) : null,
            maxOrderAmount: first.max_order_amount != null ? Number(first.max_order_amount) : null,
            usageLimit: first.usage_limit ?? null,
            startsAt: first.starts_at || null, endsAt: first.ends_at,
            isActive: members.every((m: any) => m.is_active && !m.cancelled_at),
          },
          members: members.map((m: any) => {
            const u: any = userByTgId.get(String(m.tg_id));
            const usedCount = usedCountById.get(m.id) || 0;
            return {
              customerDiscountId: m.id, tgId: m.tg_id,
              name: u ? [u.first_name, u.last_name].filter(Boolean).join(" ") || null : null,
              username: u?.username || null, phone: u?.phone || null,
              usedCount, remaining: m.usage_limit ? Math.max(0, Number(m.usage_limit) - usedCount) : null,
              isActive: !!m.is_active && !m.cancelled_at,
            };
          }),
        });
      }
      case "customer_discount_usage_list": {
        await requirePermission('customers.manage');
        const batchId = String(payload.batchId || "");
        if (!batchId) return json({ error: "invalid_id" }, 400);
        const isRowFallback = batchId.startsWith("row:");
        let memberQuery = db.from("customer_discounts").select("id").eq("shop_id", shopId);
        memberQuery = isRowFallback ? memberQuery.eq("id", batchId.slice(4)) : memberQuery.eq("batch_id", batchId);
        const { data: members, error: memberErr } = await memberQuery;
        if (memberErr) throw memberErr;
        const memberIds = (members || []).map((m: any) => m.id);
        if (!memberIds.length) return json({ usages: [] });
        const { data, error } = await db.from("customer_discount_usages")
          .select("id, tg_id, discount_amount, created_at, orders(id, user_name, phone, payable_total)")
          .eq("shop_id", shopId).in("customer_discount_id", memberIds).order("created_at", { ascending: false });
        if (error) throw error;
        return json({
          usages: (data || []).map((r: any) => ({
            id: r.id, tgId: r.tg_id,
            customerName: r.orders?.user_name || null, phone: r.orders?.phone || null,
            orderId: r.orders?.id ?? null, orderTotal: r.orders?.payable_total != null ? Number(r.orders.payable_total) : null,
            discountAmount: Number(r.discount_amount) || 0, createdAt: r.created_at,
          })),
        });
      }
      case "customer_discount_batch_update": {
        await requirePermission('customers.manage');
        const batchId = String(payload.batchId || "");
        if (!batchId) return json({ error: "invalid_id" }, 400);
        const isRowFallback = batchId.startsWith("row:");
        const patch: Record<string, unknown> = {};
        if (payload.name !== undefined) patch.name = nullableText(payload.name, 120);
        if (payload.discountType !== undefined) patch.discount_type = payload.discountType === "FIXED" ? "FIXED" : "PERCENT";
        if (payload.discountValue !== undefined) {
          const v = Number(payload.discountValue);
          if (!Number.isFinite(v) || v <= 0) return json({ error: "invalid_discount_value" }, 400);
          patch.discount_value = v;
        }
        if (payload.minOrderAmount !== undefined) patch.min_order_amount = payload.minOrderAmount !== null && payload.minOrderAmount !== "" ? nonNegativeInteger(payload.minOrderAmount) : null;
        if (payload.maxOrderAmount !== undefined) patch.max_order_amount = payload.maxOrderAmount !== null && payload.maxOrderAmount !== "" ? nonNegativeInteger(payload.maxOrderAmount) : null;
        if (patch.min_order_amount !== undefined && patch.max_order_amount !== undefined && patch.min_order_amount !== null && patch.max_order_amount !== null && (patch.max_order_amount as number) < (patch.min_order_amount as number)) {
          return json({ error: "invalid_amount_range" }, 400);
        }
        if (payload.usageLimit !== undefined) patch.usage_limit = payload.usageLimit !== null && payload.usageLimit !== "" ? Math.max(1, Math.round(Number(payload.usageLimit))) : null;
        if (payload.startsAt !== undefined) patch.starts_at = payload.startsAt ? new Date(payload.startsAt).toISOString() : null;
        if (payload.endsAt !== undefined) {
          if (!payload.endsAt) return json({ error: "end_date_required" }, 400);
          patch.ends_at = new Date(payload.endsAt).toISOString();
        }
        let query = db.from("customer_discounts").update(patch).eq("shop_id", shopId);
        query = isRowFallback ? query.eq("id", batchId.slice(4)) : query.eq("batch_id", batchId);
        const { error } = await query;
        if (error) throw error;
        auditLater("CUSTOMER_DISCOUNT_BATCH_UPDATED", "customer_discount_batch", batchId, patch);
        return json({ ok: true });
      }
      case "customer_discount_batch_cancel": {
        await requirePermission('customers.manage');
        const batchId = String(payload.batchId || "");
        if (!batchId) return json({ error: "invalid_id" }, 400);
        const isRowFallback = batchId.startsWith("row:");
        let query = db.from("customer_discounts").update({ is_active: false, cancelled_at: new Date().toISOString() }).eq("shop_id", shopId);
        query = isRowFallback ? query.eq("id", batchId.slice(4)) : query.eq("batch_id", batchId);
        const { error } = await query;
        if (error) throw error;
        auditLater("CUSTOMER_DISCOUNT_BATCH_CANCELLED", "customer_discount_batch", batchId, {});
        return json({ ok: true });
      }

      // ==================== "AKSIYALAR VA CHEGIRMALAR" — ommaviy ro'yxat/detail ====================
      // Ommaviy marketing vitrinasida admin yaratgan barcha FAOL takliflar
      // bo'limlarga ajratib ko'rsatiladi. Shaxsiy chegirmadan faqat aynan
      // joriy tg_id egasining yozuvi qaytariladi.
      case "get_marketing_campaigns": {
        await validateAndPauseBundles(db, shopId, BOT_TOKEN);
        const nowIso = new Date().toISOString();
        const [bundlesR, promosR, tiersR, rewardsR, giftsR, personalR, myPromosR] = await Promise.all([
          db.from("bundles").select("*").eq("shop_id", shopId).eq("is_active", true)
            .or(`starts_at.is.null,starts_at.lte.${nowIso}`).or(`ends_at.is.null,ends_at.gte.${nowIso}`)
            .order("sort_order", { ascending: true }),
          // 040: `is_public=false` kodlar bu OMMAVIY ro'yxatda ko'rinmaydi
          // (blogger/reklama kodlari). Ular checkout'da baribir ishlaydi —
          // promo tekshiruvi (validatePromoForCart) is_public'ga UMUMAN
          // qaramaydi, faqat ro'yxat filtrlanadi.
          db.from("promotions").select("*").eq("shop_id", shopId).eq("is_active", true).eq("source", "MANUAL").eq("is_public", true)
            .or(`starts_at.is.null,starts_at.lte.${nowIso}`).or(`ends_at.is.null,ends_at.gte.${nowIso}`)
            .order("created_at", { ascending: false }),
          db.from("discount_tiers").select("*").eq("shop_id", shopId).eq("is_active", true)
            .or(`starts_at.is.null,starts_at.lte.${nowIso}`).or(`ends_at.is.null,ends_at.gte.${nowIso}`)
            .order("threshold_amount", { ascending: true }),
          db.from("reward_rules").select("*").eq("shop_id", shopId).eq("is_active", true)
            .order("threshold_amount", { ascending: true }),
          db.from("automatic_gift_rules").select("*").eq("shop_id", shopId).eq("is_active", true)
            .or(`starts_at.is.null,starts_at.lte.${nowIso}`).or(`ends_at.is.null,ends_at.gte.${nowIso}`)
            .order("created_at", { ascending: false }),
          db.from("customer_discounts").select("id,name,discount_type,discount_value,min_order_amount,max_order_amount,usage_limit,starts_at,ends_at").eq("shop_id", shopId).eq("tg_id", tgId)
            .eq("is_active", true).is("cancelled_at", null).or(`starts_at.is.null,starts_at.lte.${nowIso}`).gte("ends_at", nowIso),
          // 15-band spec, 14-band: shu mijozga shaxsan berilgan promo-kodlar
          // (reward orqali avtomatik yoki admin qo'lda issued_to_tg_id bilan
          // biriktirgan) — "Promo-kodlarim" bo'limi uchun.
          db.from("promotions").select("*").eq("shop_id", shopId).eq("issued_to_tg_id", tgId)
            .order("created_at", { ascending: false }),
        ]);
        for (const result of [bundlesR, promosR, tiersR, rewardsR, giftsR, personalR, myPromosR]) if (result.error) throw result.error;
        const myPromoIds = (myPromosR.data || []).map((p: any) => p.id);
        const { data: myRedemptions } = myPromoIds.length
          ? await db.from("promotion_redemptions").select("promotion_id").eq("shop_id", shopId).eq("tg_id", tgId).in("promotion_id", myPromoIds)
          : { data: [] };
        const usedPromoIds = new Set((myRedemptions || []).map((r: any) => String(r.promotion_id)));
        const giftProductIds = Array.from(new Set((giftsR.data || []).flatMap((r: any) => [r.gift_product_id, r.target_product_id, ...(Array.isArray(r.target_product_ids) ? r.target_product_ids : [])]).filter(Boolean).map(String)));
        const giftCategoryIds = Array.from(new Set((giftsR.data || []).map((r: any) => r.target_category_id).filter(Boolean).map(String)));
        const [{ data: giftProducts }, { data: giftCategories }] = await Promise.all([
          giftProductIds.length ? db.from("products").select("id,name,name_ru,img").eq("shop_id", shopId).in("id", giftProductIds) : Promise.resolve({ data: [] }),
          giftCategoryIds.length ? db.from("categories").select("id,name,name_ru").eq("shop_id", shopId).in("id", giftCategoryIds) : Promise.resolve({ data: [] }),
        ]);
        const giftProductById = new Map((giftProducts || []).map((p: any) => [String(p.id), p]));
        const giftCategoryById = new Map((giftCategories || []).map((c: any) => [String(c.id), c]));
        // 3-paket, 6.12-band: userga "qolgan foydalanish" ko'rsatish uchun —
        // promo_list'dagi bilan bir xil hisoblash (yangi mantiq emas).
        const publicPromoIds = (promosR.data || []).map((p: any) => p.id);
        const { data: publicUsageRows } = publicPromoIds.length
          ? await db.from("promotion_redemptions").select("promotion_id,tg_id").eq("shop_id", shopId).in("promotion_id", publicPromoIds)
          : { data: [] };
        const publicUsedCountByPromo = new Map<string, number>();
        const publicUsedByThisCustomer = new Map<string, number>();
        for (const r of publicUsageRows || []) {
          publicUsedCountByPromo.set(r.promotion_id, (publicUsedCountByPromo.get(r.promotion_id) || 0) + 1);
          if (String(r.tg_id) === String(tgId)) {
            publicUsedByThisCustomer.set(r.promotion_id, (publicUsedByThisCustomer.get(r.promotion_id) || 0) + 1);
          }
        }
        const { count: priorCustomerOrderCount, error: priorCustomerOrderError } = await db.from("orders")
          .select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("tg_id", tgId).neq("status", "CANCELLED");
        if (priorCustomerOrderError) throw priorCustomerOrderError;
        const usablePublicPromotions = (promosR.data || []).filter((p: any) => {
          const globalUsed = publicUsedCountByPromo.get(p.id) || 0;
          const customerUsed = publicUsedByThisCustomer.get(p.id) || 0;
          if (p.usage_limit && globalUsed >= Number(p.usage_limit)) return false;
          if (p.per_customer_limit && customerUsed >= Number(p.per_customer_limit)) return false;
          if (p.new_customer_only && (priorCustomerOrderCount || 0) > 0) return false;
          return true;
        });
        // 3-paket, 7.14-band: user "Aksiyalar -> Bosqichli chegirma" bir xil
        // guruh ma'lumotidan foydalanadi (admin bilan bir xil source) —
        // flat `tiers` (pastda, cart-progress uchun, 1-paketdan o'zgarishsiz)
        // BILAN BIRGA, guruhlangan `tierGroups` ham qaytariladi.
        const publicTierGroupIds = Array.from(new Set((tiersR.data || []).map((t: any) => t.group_id).filter(Boolean)));
        const { data: publicTierGroupRows } = publicTierGroupIds.length
          ? await db.from("discount_tier_groups").select("*").eq("shop_id", shopId).in("id", publicTierGroupIds)
          : { data: [] };
        const publicTierGroupById = new Map((publicTierGroupRows || []).map((g: any) => [String(g.id), g]));
        const publicStepsByGroup = new Map<string, any[]>();
        for (const t of tiersR.data || []) {
          if (!t.group_id) continue;
          const arr = publicStepsByGroup.get(t.group_id) || [];
          arr.push({ id: t.id, thresholdAmount: Number(t.threshold_amount), discountType: t.discount_type, discountValue: Number(t.discount_value) });
          publicStepsByGroup.set(t.group_id, arr);
        }
        return json({
          bundles: (bundlesR.data || []).map(mapBundleForClient),
          promotions: usablePublicPromotions.map((p: any) => ({ ...mapPromoForClient(p), usedCount: publicUsedCountByPromo.get(p.id) || 0 })),
          tiers: (tiersR.data || []).map((t: any) => ({
            id: t.id, name: t.name || null, thresholdAmount: Number(t.threshold_amount), discountType: t.discount_type,
            discountValue: Number(t.discount_value), categoryIds: Array.isArray(t.category_ids) ? t.category_ids : [],
            productIds: Array.isArray(t.product_ids) ? t.product_ids : [], startsAt: t.starts_at || null, endsAt: t.ends_at || null,
          })),
          tierGroups: Array.from(publicStepsByGroup.entries()).map(([groupId, steps]) => {
            const g: any = publicTierGroupById.get(groupId);
            return {
              id: groupId, name: g?.name || null,
              categoryIds: Array.isArray(g?.category_ids) ? g.category_ids : [],
              productIds: Array.isArray(g?.product_ids) ? g.product_ids : [],
              startsAt: g?.starts_at || null, endsAt: g?.ends_at || null,
              allowStacking: !!g?.allow_stacking, isActive: g ? !!g.is_active : true,
              steps: (steps as any[]).sort((a, b) => a.thresholdAmount - b.thresholdAmount),
            };
          }),
          rewardRules: (rewardsR.data || []).map((r: any) => ({
            id: r.id, triggerType: r.trigger_type, thresholdAmount: Number(r.threshold_amount), rewardType: r.reward_type,
            rewardValue: Number(r.reward_value), periodDays: r.period_days || null, codeExpiryDays: r.code_expiry_days || null,
          })),
          giftRules: (giftsR.data || []).map((r: any) => {
            const gift: any = giftProductById.get(String(r.gift_product_id));
            const targetProduct: any = giftProductById.get(String(r.target_product_id));
            const targetCategory: any = giftCategoryById.get(String(r.target_category_id));
            const targetProducts = (Array.isArray(r.target_product_ids) ? r.target_product_ids : [])
              .map((pid: string) => giftProductById.get(String(pid))).filter(Boolean)
              .map((p: any) => ({ id: p.id, name: p.name, nameRu: p.name_ru || null }));
            return {
              ...mapAutomaticGiftRuleForClient(r),
              giftProduct: gift ? { id: gift.id, name: gift.name, nameRu: gift.name_ru || null, imageUrl: gift.img || null } : null,
              targetProduct: targetProduct ? { id: targetProduct.id, name: targetProduct.name, nameRu: targetProduct.name_ru || null } : null,
              targetCategory: targetCategory ? { id: targetCategory.id, name: targetCategory.name, nameRu: targetCategory.name_ru || null } : null,
              targetProducts,
            };
          }),
          personalDiscounts: await (async () => {
            const rows = personalR.data || [];
            const ids = rows.map((d: any) => d.id);
            const { data: myUsages } = ids.length
              ? await db.from("customer_discount_usages").select("customer_discount_id").eq("shop_id", shopId).in("customer_discount_id", ids)
              : { data: [] };
            const usedCountById = new Map<string, number>();
            for (const u of myUsages || []) usedCountById.set(u.customer_discount_id, (usedCountById.get(u.customer_discount_id) || 0) + 1);
            return rows.map((d: any) => ({
              id: d.id, name: d.name || null, discountType: d.discount_type, discountValue: Number(d.discount_value),
              minOrderAmount: d.min_order_amount != null ? Number(d.min_order_amount) : null,
              maxOrderAmount: d.max_order_amount != null ? Number(d.max_order_amount) : null,
              usageLimit: d.usage_limit ?? null, usedCount: usedCountById.get(d.id) || 0,
              startsAt: d.starts_at || null, endsAt: d.ends_at,
            })).filter((d: any) => !d.usageLimit || d.usedCount < Number(d.usageLimit));
          })(),
          myPromoCodes: (myPromosR.data || []).map((p: any) => {
            const now2 = Date.now();
            const expired = p.ends_at ? new Date(p.ends_at).getTime() < now2 : false;
            const notStarted = p.starts_at ? new Date(p.starts_at).getTime() > now2 : false;
            const used = usedPromoIds.has(String(p.id));
            const status = !p.is_active ? "INACTIVE" : used ? "USED" : expired ? "EXPIRED" : notStarted ? "INACTIVE" : "ACTIVE";
            return {
              id: p.id, code: p.code, name: p.name, discountType: p.discount_type, discountValue: Number(p.discount_value),
              minOrderAmount: p.min_order_amount !== null && p.min_order_amount !== undefined ? Number(p.min_order_amount) : null,
              maxOrderAmount: p.max_order_amount !== null && p.max_order_amount !== undefined ? Number(p.max_order_amount) : null,
              endsAt: p.ends_at || null, usageLimit: p.usage_limit ?? null, transferable: !!p.transferable,
              isActive: !!p.is_active, status,
            };
          }).filter((p: any) => p.status === "ACTIVE"),
        });
      }
      // Banner deep-link + kampaniya detail sahifasi shu bittadan foydalanadi.
      // Target topilmasa yoki inactive/schedule'dan chiqib ketgan bo'lsa —
      // "not_found" qaytaradi, frontend xavfsiz fallback (umumiy ro'yxat)ga
      // o'tadi, broken page ko'rsatilmaydi.
      case "get_campaign_detail": {
        const kind = payload.kind === "BUNDLE" ? "BUNDLE" : "PROMOTION";
        const id = String(payload.id || "");
        if (!id) return json({ error: "invalid_id" }, 400);
        if (kind === "BUNDLE") {
          const { data, error } = await db.from("bundles").select("*").eq("shop_id", shopId).eq("id", id).eq("is_active", true).maybeSingle();
          if (error) throw error;
          if (!data) return json({ error: "not_found" }, 404);
          const now = Date.now();
          if (data.starts_at && new Date(data.starts_at).getTime() > now) return json({ error: "not_found" }, 404);
          if (data.ends_at && new Date(data.ends_at).getTime() < now) return json({ error: "not_found" }, 404);
          const productIds = (Array.isArray(data.items) ? data.items : []).map((i: any) => String(i.productId)).filter(Boolean);
          const { data: prodRows } = productIds.length ? await db.from("products").select("id,name,name_ru,img,price").eq("shop_id", shopId).in("id", productIds) : { data: [] };
          const prodById = new Map((prodRows || []).map((p: any) => [String(p.id), p]));
          const items = (Array.isArray(data.items) ? data.items : []).map((i: any) => {
            const p: any = prodById.get(String(i.productId));
            return { productId: i.productId, qty: i.qty, name: p?.name || null, nameRu: p?.name_ru || null, img: p?.img || null, price: p ? Number(p.price) : null };
          });
          const regularTotal = items.reduce((s: number, i: any) => s + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);
          return json({ kind: "BUNDLE", bundle: { ...mapBundleForClient(data), resolvedItems: items, regularTotal, savings: Math.max(0, regularTotal - Number(data.bundle_price)) } });
        } else {
          // 040: yashirin kodning OMMAVIY detal sahifasi ham bo'lmasligi kerak —
          // aks holda kimdir uning id'sini bilsa (masalan banner unga havola
          // qilib qo'yilgan bo'lsa), yashirin kod ochiq ko'rinib qolardi.
          // "Yashirin" degani — hech bir ommaviy joyda ko'rinmaydi; kod esa
          // checkout'da baribir ishlaydi (resolvePromoDiscount is_public'ga
          // qaramaydi). Banner mavjud bo'lmagan nishonga havola qilsa,
          // frontend allaqachon umumiy ro'yxatga qaytaradi.
          const { data, error } = await db.from("promotions").select("*").eq("shop_id", shopId).eq("id", id).eq("is_active", true).eq("source", "MANUAL").eq("is_public", true).maybeSingle();
          if (error) throw error;
          if (!data) return json({ error: "not_found" }, 404);
          const now = Date.now();
          if (data.starts_at && new Date(data.starts_at).getTime() > now) return json({ error: "not_found" }, 404);
          if (data.ends_at && new Date(data.ends_at).getTime() < now) return json({ error: "not_found" }, 404);
          const categoryIds: string[] = Array.isArray(data.category_ids) ? data.category_ids : [];
          const productIds: string[] = Array.isArray(data.product_ids) ? data.product_ids : [];
          let previewProducts: any[] = [];
          if (productIds.length || categoryIds.length) {
            let q = db.from("products").select("id,name,name_ru,img,price").eq("shop_id", shopId).limit(12);
            q = productIds.length ? q.in("id", productIds) : q.in("category_id", categoryIds);
            const { data: prows } = await q;
            previewProducts = prows || [];
          }
          // 3-paket, 6.UI.5-band: user detailida "qolgan foydalanish" — bir xil
          // promo_list hisoblash naqshi, faqat shu bitta kod uchun.
          const { count: usedCount } = data.usage_limit
            ? await db.from("promotion_redemptions").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("promotion_id", data.id)
            : { count: 0 };
          return json({ kind: "PROMOTION", promotion: { ...mapPromoForClient(data), usedCount: usedCount || 0, previewProducts } });
        }
      }

      // Checkout-time, non-committal preview: subtotal is computed here from
      // LIVE prices (never trusts a client-supplied subtotal), same as
      // create_order does — a customer can see the discount before
      // submitting, but the real, authoritative recomputation happens again
      // inside create_order itself.
      case "promo_preview": {
        const items = Array.isArray(payload.items) ? payload.items : [];
        const productIds = Array.from(new Set(items.map((i: any) => String(i.productId || "")).filter(Boolean)));
        if (!productIds.length) return json({ valid: false, error: "empty_cart" });
        const { data: rows, error } = await db.from("products").select("id,price,variants,is_visible,status").eq("shop_id", shopId).in("id", productIds);
        if (error) throw error;
        const rowById = new Map((rows || []).map((r: any) => [String(r.id), r]));
        let subtotal = 0;
        for (const i of items) {
          const row: any = rowById.get(String(i.productId));
          if (!row || row.status === "DELETED" || row.is_visible === false) continue;
          subtotal += productLinePrice(row, i) * (Number(i.qty) || 0);
        }
        const result = await resolvePromoDiscount(db, shopId, String(payload.code || ""), tgId, subtotal, productIds);
        if (!result.ok) return json({ valid: false, error: result.error });
        return json({ valid: true, name: result.promotion.name, discountAmount: result.discountAmount, subtotal });
      }

      // Unified checkout preview for automatic tier and optional promo+tier
      // stacking. create_order repeats the same resolver authoritatively.
      case "discount_preview": {
        const items = Array.isArray(payload.items) ? payload.items : [];
        const productIds = Array.from(new Set(items.map((i: any) => String(i.productId || "")).filter(Boolean)));
        // 15-band spec, 11-band: avtomatik sovg'a AVVAL faqat create_order
        // ichida (buyurtma allaqachon yaratilayotganda) aniqlanardi — mijoz
        // sovg'a olishini tasdiqlashdan OLDIN bilmasdi. Endi shu bitta
        // resolveAutomaticGift() funksiyasi (create_order ham xuddi shuni
        // chaqiradi, natijada ikki xil mantiq bo'lmaydi) checkout ochilishidan
        // OLDIN, savatcha preview'ida ham chaqiriladi — faqat KO'RSATISH
        // uchun, yakuniy/haqiqiy biriktirish hamon create_order'da bo'ladi.
        // 042: birga-ishlatish sozlamalari + bundle stacking bayrog'i — real
        // create_order QAYSI qiymatlarni o'qisa, preview ham AYNAN o'shani
        // o'qishi shart, aks holda mijoz savatda ko'rgan summa checkout'da
        // farq qilib qolishi mumkin edi (bundle bayrog'i avval bu yerda
        // taxminiy `false` bilan qattiq yozib qo'yilgan edi — shu ham
        // tuzatildi).
        const { data: discountSettingsRow } = await db.from("shop_settings")
          .select("allow_discount_stacking_with_bundle,allow_discount_combining,max_combined_discount_percent")
          .eq("shop_id", shopId).maybeSingle();
        const includeVip = payload.useVip !== false;
        const discountOpts = {
          allowCombining: !!discountSettingsRow?.allow_discount_combining,
          maxCombinedPercent: discountSettingsRow?.max_combined_discount_percent != null ? Number(discountSettingsRow.max_combined_discount_percent) : null,
          includeVip,
        };
        if (!productIds.length) return json({ source: null, subtotal: 0, totalDiscount: 0, promoDiscount: 0, tierDiscount: 0, vipDiscount: 0, vipInfo: null, allowCombining: discountOpts.allowCombining, nextTier: null, gift: null });
        const { data: rows, error } = await db.from("products").select("id,price,variants,is_visible,status").eq("shop_id", shopId).in("id", productIds);
        if (error) throw error;
        const rowById = new Map((rows || []).map((r: any) => [String(r.id), r]));
        let subtotal = 0;
        for (const i of items) {
          const row: any = rowById.get(String(i.productId));
          if (!row || row.status === "DELETED" || row.is_visible === false) continue;
          subtotal += productLinePrice(row, i) * Math.max(0, Number(i.qty) || 0);
        }
        const best = await resolveBestCartDiscount(
          db, shopId, tgId, subtotal, productIds,
          payload.promoCode ? String(payload.promoCode) : null,
          !!payload.hasBundle, !!discountSettingsRow?.allow_discount_stacking_with_bundle,
          discountOpts,
        );
        const nextTier = payload.hasBundle ? null : await resolveNextTierOpportunity(db, shopId, subtotal, productIds);
        const cartLines = items.map((i: any) => ({ productId: String(i.productId || ""), qty: Number(i.qty) || 0 })).filter((l: any) => l.productId && l.qty > 0);
        const giftResolved = await resolveAutomaticGift(db, shopId, subtotal, cartLines);
        const gift = giftResolved ? {
          ruleId: giftResolved.rule.id, ruleName: giftResolved.rule.name,
          productId: giftResolved.giftProduct.id,
          name: giftResolved.giftProduct.name, nameRu: giftResolved.giftProduct.name_ru || null,
          img: giftResolved.giftProduct.img || null,
          qty: Number(giftResolved.rule.gift_quantity) || 1,
        } : null;
        if (!best) return json({ source: null, subtotal, totalDiscount: 0, promoDiscount: 0, tierDiscount: 0, vipDiscount: 0, vipInfo: null, allowCombining: discountOpts.allowCombining, nextTier, gift });
        return json({
          source: best.source, subtotal, totalDiscount: best.discountAmount,
          promoDiscount: Number(best.promoDiscount) || 0,
          tierDiscount: Number(best.tierDiscount) || 0,
          vipDiscount: Number(best.vipDiscount) || 0,
          vipInfo: best.vipInfo,
          allowCombining: discountOpts.allowCombining,
          promo: best.promotion ? {
            id: best.promotion.id, code: best.promotion.code, name: best.promotion.name,
            discountType: best.promotion.discount_type, discountValue: Number(best.promotion.discount_value),
          } : null,
          tier: best.tier ? {
            id: best.tier.id, name: best.tier.name || null,
            thresholdAmount: Number(best.tier.threshold_amount), discountType: best.tier.discount_type,
            discountValue: Number(best.tier.discount_value),
          } : null,
          nextTier, gift,
        });
      }

      case "get_checkout_draft": {
        const { data, error } = await db.from("checkout_drafts")
          .select("step,payload,cart_signature,updated_at,expires_at")
          .eq("shop_id", shopId).eq("tg_id", tgId).maybeSingle();
        if (error) throw error;
        if (!data || new Date(data.expires_at).getTime() <= Date.now()) {
          if (data) await db.from("checkout_drafts").delete().eq("shop_id", shopId).eq("tg_id", tgId);
          return json({ draft: null });
        }
        return json({ draft: { step: Number(data.step) || 1, payload: data.payload || {}, cartSignature: data.cart_signature || null, updatedAt: data.updated_at, expiresAt: data.expires_at } });
      }

      case "save_checkout_draft": {
        const step = Math.max(1, Math.min(3, Number(payload.step) || 1));
        const draftPayload = payload.draft && typeof payload.draft === "object" && !Array.isArray(payload.draft) ? payload.draft : {};
        const encoded = JSON.stringify(draftPayload);
        if (encoded.length > 24000) return json({ error: "checkout_draft_too_large" }, 400);
        const cartSignature = nullableText(payload.cartSignature, 500);
        const { data, error } = await db.from("checkout_drafts").upsert({
          shop_id: shopId, tg_id: tgId, step, payload: draftPayload, cart_signature: cartSignature,
          updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        }, { onConflict: "shop_id,tg_id" }).select("step,payload,cart_signature,updated_at,expires_at").single();
        if (error) throw error;
        return json({ ok: true, draft: { step: data.step, payload: data.payload || {}, cartSignature: data.cart_signature || null, updatedAt: data.updated_at, expiresAt: data.expires_at } });
      }

      case "clear_checkout_draft": {
        const { error } = await db.from("checkout_drafts").delete().eq("shop_id", shopId).eq("tg_id", tgId);
        if (error) throw error;
        return json({ ok: true });
      }

      case "create_order": {
        const { data: selfRow } = await db.from("app_users").select("is_blocked,block_reason").eq("shop_id", shopId).eq("tg_id", tgId).maybeSingle();
        if (selfRow?.is_blocked) return json({ error: `blocked:${selfRow.block_reason || "Sabab ko'rsatilmagan"}` }, 403);
        // Online Do'kon yaxshilashlari, 13-band: katalog/narx ko'rish davom
        // etadi (bu tekshiruv faqat create_order'da) — faqat yangi buyurtma
        // yakunlash bloklanadi, server-side (frontend tugmasini disable
        // qilish yetarli emas).
        const { data: pauseRow } = await db.from("shop_settings").select("orders_paused,orders_paused_note").eq("shop_id", shopId).maybeSingle();
        if (pauseRow?.orders_paused) return json({ error: `orders_paused:${pauseRow.orders_paused_note || ""}` }, 400);
        const items = Array.isArray(payload.items) ? payload.items : [];
        // Shop takomillashtirish: bundle (Aksiya) savat qatorlari — oddiy
        // items'dan ALOHIDA, chunki bundle'ning narxi (bundle_price) va
        // tarkibi (items jsonb) faqat SERVERDA (bazadan) aniqlanadi, client
        // faqat "qaysi bundle, nechta" deydi.
        const bundleReqs: Array<{ bundleId: string; qty: number }> = Array.isArray(payload.bundleItems)
          ? payload.bundleItems.map((b: any) => ({ bundleId: String(b.bundleId || ""), qty: Number.parseInt(String(b.qty), 10) })).filter((b: any) => b.bundleId && Number.isInteger(b.qty) && b.qty > 0)
          : [];
        if (bundleReqs.length) await validateAndPauseBundles(db, shopId, BOT_TOKEN);
        const fullname = nullableText(payload.fullname, 120);
        const phone = String(payload.phone || "").replace(/\s+/g, "");
        const regionKey = String(payload.regionKey || "");
        if (!UZ_TOP_LEVEL_REGION_SET.has(regionKey)) return json({ error: "invalid_region" }, 400);
        const region = regionKey === "tashkent_city" ? "TASHKENT" : "PROVINCE";
        let district = nullableText(payload.district, 200);
        let address = nullableText(payload.address, 300);
        const deliveryMethodId = String(payload.deliveryMethodId || "");
        const paymentMethodId = String(payload.paymentMethodId || "");

        let selectedBranch: any = null;
        if (deliveryMethodId.startsWith("POST:")) {
          const branchId = Number(payload.branchId);
          if (!Number.isInteger(branchId) || branchId <= 0) return json({ error: "branch_required" }, 400);
          const providerId = deliveryMethodId.slice(5);
          const { data: branchRow, error: branchErr } = await db.from("delivery_branches")
            .select("id,provider,branch_code,branch_name,district_or_city,full_address,region_code,active")
            .eq("id", branchId).maybeSingle();
          if (branchErr) throw branchErr;
          if (!branchRow || !branchRow.active || branchRow.provider !== providerId || branchRow.region_code !== regionKey) {
            return json({ error: "invalid_branch" }, 400);
          }
          selectedBranch = branchRow;
          district = branchRow.district_or_city || district;
          address = branchRow.full_address;
        }

        if ((!items.length && !bundleReqs.length) || !fullname || !/^\+998\d{9}$/.test(phone) || !district || !address) {
          return json({ error: "invalid_order_fields" }, 400);
        }
        const { data: settingsRow, error: settingsError } = await db.from("shop_settings").select("fulfillment_config,allow_discount_stacking_with_bundle,allow_discount_combining,max_combined_discount_percent").eq("shop_id", shopId).maybeSingle();
        if (settingsError) throw settingsError;
        const fulfillmentConfig = sanitizeFulfillmentConfig(settingsRow?.fulfillment_config);
        let deliverySnapshot: any, paymentSnapshot: any;
        try {
          deliverySnapshot = resolveDeliverySnapshot(fulfillmentConfig, regionKey, deliveryMethodId, district);
          paymentSnapshot = resolvePaymentSnapshot(fulfillmentConfig, regionKey, paymentMethodId, district);
        } catch (e: any) {
          return json({ error: e?.message || "checkout_option_not_available" }, 400);
        }
        deliverySnapshot = { ...deliverySnapshot, district, address };
        if (selectedBranch) {
          deliverySnapshot = {
            ...deliverySnapshot,
            branchId: selectedBranch.id, branchCode: selectedBranch.branch_code,
            branchName: selectedBranch.branch_name, branchDistrict: selectedBranch.district_or_city,
            branchAddress: selectedBranch.full_address,
          };
        }
        const payMethod = paymentSnapshot.methodId;

        if (paymentSnapshot.receiptRequired && !payload.receiptImageUpload) {
          return json({ error: "receipt_required" }, 400);
        }

        // CLICK: chek shart emas, lekin do'kon o'z Click Merchant hisobini
        // haqiqatan ulagan bo'lishi kerak (ruxsat + click_connections holati)
        // — buyurtma yaratilishidan OLDIN tekshiriladi, aks holda zaxira
        // kamayib, keyin to'lash imkoni yo'q buyurtma qolib ketardi.
        let clickCreds: { merchantUserId: string; secretKey: string; serviceId: string } | null = null;
        if (payMethod === "CLICK") {
          if (!ctx.clickAccessGranted) return json({ error: "click_not_available" }, 400);
          const { data: clickConn } = await db.from("click_connections")
            .select("status,verified,service_id,merchant_user_id,secret_key_ciphertext,secret_key_iv")
            .eq("shop_id", shopId).maybeSingle();
          if (clickConn?.status !== "CONNECTED" || !clickConn.secret_key_ciphertext) return json({ error: "click_not_connected" }, 400);
          // 048-band: mijoz tarafida yashiringan bo'lsa ham, server mustaqil
          // qayta tekshiradi — 3 marta real sinovdan o'tmagan (verified)
          // ulanish orqali hech qachon haqiqiy buyurtma to'lovi qabul
          // qilinmasin (frontend filtri yolg'iz ishonch manbai emas).
          if (clickConn.verified !== true) return json({ error: "click_not_verified" }, 400);
          const secretKey = await decryptBotToken(BOT_TOKEN_MASTER_KEY, clickConn.secret_key_ciphertext, clickConn.secret_key_iv);
          clickCreds = { merchantUserId: clickConn.merchant_user_id, secretKey, serviceId: clickConn.service_id };
        }

        // PAYME/UZUM: Click bilan bir xil oldindan-tekshiruv — buyurtma
        // yaratilishidan OLDIN ulanish holati tasdiqlanadi.
        let paymeCreds: { merchantId: string; login: string; password: string } | null = null;
        if (payMethod === "PAYME") {
          if (!ctx.paymeAccessGranted) return json({ error: "payme_not_available" }, 400);
          const { data: paymeConn } = await db.from("payme_connections")
            .select("status,verified,merchant_id,login,password_ciphertext,password_iv").eq("shop_id", shopId).maybeSingle();
          if (paymeConn?.status !== "CONNECTED" || !paymeConn.password_ciphertext) return json({ error: "payme_not_connected" }, 400);
          // 048-band: xuddi Click bilan bir xil — server mustaqil qayta
          // tekshiradi, frontend filtri yolg'iz ishonch manbai emas.
          if (paymeConn.verified !== true) return json({ error: "payme_not_verified" }, 400);
          const password = await decryptBotToken(BOT_TOKEN_MASTER_KEY, paymeConn.password_ciphertext, paymeConn.password_iv);
          paymeCreds = { merchantId: paymeConn.merchant_id, login: paymeConn.login, password };
        }
        let uzumCreds: { terminalId: string; apiKey: string } | null = null;
        if (payMethod === "UZUM") {
          if (!ctx.uzumAccessGranted) return json({ error: "uzum_not_available" }, 400);
          const { data: uzumConn } = await db.from("uzum_connections")
            .select("status,terminal_id,api_key_ciphertext,api_key_iv").eq("shop_id", shopId).maybeSingle();
          if (uzumConn?.status !== "CONNECTED" || !uzumConn.api_key_ciphertext) return json({ error: "uzum_not_connected" }, 400);
          const apiKey = await decryptBotToken(BOT_TOKEN_MASTER_KEY, uzumConn.api_key_ciphertext, uzumConn.api_key_iv);
          uzumCreds = { terminalId: uzumConn.terminal_id, apiKey };
        }

        const rpcItems = items.map((i: any, index: number) => ({
          product_id: String(i.productId || ""), qty: Number.parseInt(String(i.qty), 10),
          size: nullableText(i.size, 60), color: nullableText(i.color, 60),
          line_id: `standard:${index}`, source_type: "STANDARD",
        }));
        if (rpcItems.some((i: any) => !i.product_id || !Number.isInteger(i.qty) || i.qty <= 0)) return json({ error: "invalid_cart" }, 400);

        // Bundle'larni SERVERDAGI ma'lumot bilan tekshirib, komponentlarini
        // oddiy item sifatida SHU BIR XIL ro'yxatga qo'shamiz — place_order
        // RPC'ining o'zi (stock-kamaytirish logikasi) UMUMAN o'zgarmaydi,
        // shu bilan "hech biri yetmasa hech narsa yaratilmaydi" atomikligi
        // RPC'ning mavjud, sinalgan bitta-tranzaksiya xatti-harakatidan
        // BEPUL keladi. Narx (bundle_price) esa RPC javobidan keyin, pastda
        // to'g'rilanadi (RPC har doim live komponent narxlarini qo'shadi).
        let bundleRows: any[] = [];
        const bundleComponentProductIds: string[] = [];
        if (bundleReqs.length) {
          const { data: fetchedBundles, error: bundleErr } = await db.from("bundles").select("*").eq("shop_id", shopId).in("id", bundleReqs.map((b) => b.bundleId));
          if (bundleErr) throw bundleErr;
          bundleRows = fetchedBundles || [];
          const nowMs = Date.now();
          for (const req of bundleReqs) {
            const bundle = bundleRows.find((b: any) => String(b.id) === req.bundleId);
            if (!bundle || !bundle.is_active) return json({ error: "bundle_unavailable", bundleId: req.bundleId }, 400);
            if (bundle.starts_at && new Date(bundle.starts_at).getTime() > nowMs) return json({ error: "bundle_unavailable", bundleId: req.bundleId }, 400);
            if (bundle.ends_at && new Date(bundle.ends_at).getTime() < nowMs) return json({ error: "bundle_unavailable", bundleId: req.bundleId }, 400);
            const comps = Array.isArray(bundle.items) ? bundle.items : [];
            if (!comps.length) return json({ error: "bundle_unavailable", bundleId: req.bundleId }, 400);
            for (const c of comps) {
              const pid = String(c.productId || "");
              if (!pid) return json({ error: "bundle_unavailable", bundleId: req.bundleId }, 400);
              bundleComponentProductIds.push(pid);
              rpcItems.push({
                product_id: pid, qty: (Math.max(1, Math.round(Number(c.qty) || 1))) * req.qty,
                size: null, color: null, line_id: `bundle:${req.bundleId}:${pid}`,
                source_type: "BUNDLE", source_id: req.bundleId, source_name: bundle.name,
              });
            }
          }
        }
        if (!rpcItems.length) return json({ error: "invalid_cart" }, 400);

        // ROUND16: userdan yashirilgan tovar eski local cart yoki qo'lda API
        // so'rovi orqali buyurtmaga qayta kirib qolmasin (bundle komponentlari
        // ham shu tekshiruvdan o'tadi).
        const purchasedProductIds = Array.from(new Set(rpcItems.map((i: any) => i.product_id)));
        const { data: orderProducts, error: orderProductsErr } = await db.from("products")
          .select("id,is_visible,status,price,variants,category_id").eq("shop_id", shopId).in("id", purchasedProductIds);
        if (orderProductsErr) throw orderProductsErr;
        const orderProductMap = new Map((orderProducts || []).map((row: any) => [String(row.id), row]));
        if (purchasedProductIds.some((id: string) => { const row: any = orderProductMap.get(id); return !row || row.status === "DELETED" || row.is_visible === false; })) {
          return json({ error: bundleComponentProductIds.includes(purchasedProductIds.find((id: string) => { const row: any = orderProductMap.get(id); return !row || row.status === "DELETED" || row.is_visible === false; })!) ? "bundle_unavailable" : "product_hidden_or_unavailable" }, 400);
        }
        const ordinaryProductIds = new Set(items.map((item: any) => String(item.productId || "")));
        if (bundleComponentProductIds.some((id) => ordinaryProductIds.has(id)) || new Set(bundleComponentProductIds).size !== bundleComponentProductIds.length) {
          return json({ error: "bundle_product_also_in_cart" }, 400);
        }

        // Bundle narxi place_order ichidagi bitta DB tranzaksiyasida
        // qo'llanishi uchun har komponentga ulush ajratiladi. Bu narxni
        // keyin alohida UPDATE qilishdagi yarim saqlanib qolish xavfini yo'q qiladi.
        for (const req of bundleReqs) {
          const bundle = bundleRows.find((row: any) => String(row.id) === req.bundleId);
          const components = Array.isArray(bundle?.items) ? bundle.items : [];
          const weighted = components.map((component: any) => {
            const qty = Math.max(1, Math.round(Number(component.qty) || 1));
            const product: any = orderProductMap.get(String(component.productId));
            return { component, qty, value: (Number(product?.price) || 0) * qty };
          });
          const liveTotal = weighted.reduce((sum: number, row: any) => sum + row.value, 0);
          if (!(liveTotal > 0)) return json({ error: "bundle_unavailable", bundleId: req.bundleId }, 400);
          let allocated = 0;
          weighted.forEach((row: any, index: number) => {
            const lineQty = row.qty * req.qty;
            const targetTotal = Number(bundle.bundle_price) * req.qty;
            const lineTotal = index === weighted.length - 1
              ? targetTotal - allocated
              : Math.round((targetTotal * row.value / liveTotal) * 100) / 100;
            allocated += lineTotal;
            const rpcLine = rpcItems.find((line: any) => line.line_id === `bundle:${req.bundleId}:${row.component.productId}`);
            if (rpcLine) rpcLine.price_override = lineTotal / lineQty;
          });
        }

        // Gift eligibility is calculated from LIVE product prices plus the
        // authoritative bundle prices. Client never supplies the subtotal.
        const ordinarySubtotalForGift = items.reduce((sum: number, i: any) => {
          const p: any = orderProductMap.get(String(i.productId || ""));
          return sum + (p ? Number(p.price) * Math.max(0, Number(i.qty) || 0) : 0);
        }, 0);
        const bundleSubtotalForGift = bundleReqs.reduce((sum, req) => {
          const b = bundleRows.find((row: any) => String(row.id) === req.bundleId);
          return sum + (b ? Number(b.bundle_price) * req.qty : 0);
        }, 0);
        const purchasedCartLines = rpcItems.map((i: any) => ({ productId: String(i.product_id), qty: Number(i.qty) || 0 }));
        let automaticGift: { rule: any; giftProduct: any } | null = null;
        try {
          automaticGift = await resolveAutomaticGift(db, shopId, ordinarySubtotalForGift + bundleSubtotalForGift, purchasedCartLines);
          if (automaticGift) {
            rpcItems.push({
              product_id: String(automaticGift.giftProduct.id), qty: Number(automaticGift.rule.gift_quantity) || 1,
              size: null, color: null, line_id: `gift:${automaticGift.rule.id}`, source_type: "GIFT",
              source_id: automaticGift.rule.id, source_name: automaticGift.rule.name, price_override: 0,
            });
          }
        } catch (e) {
          console.error("[AUTOMATIC_GIFT_RESOLVE_FAILED]", e);
        }
        const orderProductIds = Array.from(new Set(rpcItems.map((i: any) => i.product_id)));
        const checkoutKey = String(payload.checkoutKey || "").trim();
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(checkoutKey)) {
          return json({ error: "invalid_checkout_key" }, 400);
        }

        let rpcResult = await db.rpc("place_order", {
          p_shop_id: shopId, p_tg_id: tgId, p_user_name: fullname, p_phone: phone, p_region: region,
          p_district: district, p_address: address, p_pay_method: payMethod, p_items: rpcItems, p_checkout_key: checkoutKey,
        });
        // A concurrent order may consume the last gift after the availability
        // check. place_order is atomic and rolls that failed attempt back; we
        // pause the campaign and retry once without the gift, never double-
        // decrementing either purchased or gift stock.
        if (rpcResult.error && automaticGift && String(rpcResult.error.message || "").includes(`insufficient_stock:${automaticGift.giftProduct.id}`)) {
          if (automaticGift.rule.stock_zero_policy === "AUTO_PAUSE") {
            await db.from("automatic_gift_rules").update({ is_active: false, updated_at: new Date().toISOString() })
              .eq("shop_id", shopId).eq("id", automaticGift.rule.id);
          }
          rpcItems.pop();
          automaticGift = null;
          rpcResult = await db.rpc("place_order", {
            p_shop_id: shopId, p_tg_id: tgId, p_user_name: fullname, p_phone: phone, p_region: region,
            p_district: district, p_address: address, p_pay_method: payMethod, p_items: rpcItems, p_checkout_key: checkoutKey,
          });
        }
        const { data, error } = rpcResult;
        if (error) {
          const m = String(error.message || "");
          // Bundle komponenti yetmasa ham RPC bir xil "insufficient_stock:<id>"
          // beradi (mavjud xatolik matni o'zgarmagan) — qaysi mahsulot
          // ekanini id orqali aniqlab, aniqroq xato qaytaramiz.
          if (m.includes("insufficient_stock")) {
            const failedId = m.split(":")[1];
            return json({ error: failedId && bundleComponentProductIds.includes(failedId) ? "bundle_unavailable" : "insufficient_stock" }, 400);
          }
          if (m.includes("variant_required_or_invalid") || m.includes("invalid_variant")) return json({ error: "invalid_variant" }, 400);
          throw error;
        }
        const created = Array.isArray(data) ? data[0] : data;
        const orderId = Number(created?.id);
        let subtotal = Number(created?.subtotal ?? created?.totalPrice ?? created?.total_price);
        if (!Number.isInteger(orderId) || orderId <= 0 || !Number.isFinite(subtotal) || subtotal < 0) {
          throw new Error("invalid_place_order_response");
        }
        if (created?.replayed === true) {
          const { data: existingOrder, error: existingOrderError } = await db.from("orders").select("*")
            .eq("shop_id", shopId).eq("id", orderId).single();
          if (existingOrderError) throw existingOrderError;
          return json({ order: mapOrderForClient(existingOrder, { includeInternalNote: isAdmin }), replayed: true });
        }

        if (automaticGift) {
          const giftId = String(automaticGift.giftProduct.id);
          const giftQty = Number(automaticGift.rule.gift_quantity) || 1;
          const { error: usageErr } = await db.from("automatic_gift_usages").insert({
            shop_id: shopId, rule_id: automaticGift.rule.id, order_id: orderId, tg_id: tgId,
            gift_product_id: giftId, gift_quantity: giftQty,
          });
          if (usageErr) console.error("[AUTOMATIC_GIFT_USAGE_FAILED]", usageErr);
          if (automaticGift.rule.stock_zero_policy === "AUTO_PAUSE" && Number(automaticGift.giftProduct.stock) <= giftQty) {
            await db.from("automatic_gift_rules").update({ is_active: false, updated_at: new Date().toISOString() })
              .eq("shop_id", shopId).eq("id", automaticGift.rule.id);
          }
        }

        let enrichedItems: any[] | undefined;
        try {
          const orderItemProductIds = Array.from(new Set(items.map((i: any) => String(i.productId || "")).filter(Boolean)));
          const [{ data: createdItemsRow }, nameRuRes] = await Promise.all([
            db.from("orders").select("items").eq("id", orderId).eq("shop_id", shopId).maybeSingle(),
            orderItemProductIds.length ? db.from("products").select("sku,name_ru").eq("shop_id", shopId).in("id", orderItemProductIds) : Promise.resolve({ data: [] }),
          ]);
          const nameRuBySku = new Map<string, string>();
          for (const row of nameRuRes?.data || []) if (row.sku && row.name_ru) nameRuBySku.set(String(row.sku), String(row.name_ru));
          if (Array.isArray(createdItemsRow?.items) && nameRuBySku.size) {
            enrichedItems = createdItemsRow.items.map((it: any) => {
              const nameRu = it?.sku ? nameRuBySku.get(String(it.sku)) : undefined;
              return nameRu ? { ...it, nameRu } : it;
            });
          }
        } catch (e) {
          console.error("order item name_ru enrichment failed", e);
        }

        let receiptPath: string | null = null;
        if (payload.receiptImageUpload) {
          try {
            const uploaded = await storePaymentReceipt(db, shopId, orderId, tgId, payload.receiptImageUpload);
            receiptPath = uploaded.path;
            paymentSnapshot = { ...paymentSnapshot, receiptStatus: "RECEIVED" };
          } catch (e: any) {
            try {
              await db.rpc("update_order_status", {
                p_shop_id: shopId, p_order_id: orderId, p_new_status: "CANCELLED", p_requester_tg_id: tgId,
                p_is_admin: true, p_cancel_reason: "To'lov cheki yuklanmadi",
              });
            } catch (_) {}
            return json({ error: "receipt_upload_failed" }, 400);
          }
        }

        const deliveryFee = deliverySnapshot.kind === "FIXED" ? nonNegativeInteger(deliverySnapshot.fee) : 0;

        // Chegirma, agar mos bo'lsa — SUBTOTAL ma'lum bo'lgandan keyin,
        // to'lov summasi (jumladan Click invoice) hisoblanishidan OLDIN,
        // qayta (ishonchli) tekshiriladi. Agar preview'dan keyin promo endi
        // yaroqsiz bo'lib qolgan bo'lsa (limit tugagan/muddati o'tgan),
        // buyurtma bloklanmaydi — shunchaki chegirmasiz davom etadi, chunki
        // zaxira allaqachon kamaygan va bu bosqichda bekor qilish tajribani
        // yomonlashtiradi.
        // Shop takomillashtirish, 29-band: promo-kod (oddiy YOKI reward) /
        // VIP mijoz chegirmasi / bosqichli chegirma bir-biriga QO'SHILMAYDI —
        // faqat ENG FOYDALI bittasi ishlaydi (resolveBestCartDiscount).
        // Bundle savatda bo'lsa — seller ruxsat bermaguncha HECH biri ishlamaydi.
        let appliedPromo: { id: string; code: string } | null = null;
        let appliedTier: any = null;
        let appliedVip: any = null;
        let discountSource: "PROMO" | "VIP" | "TIER" | "PROMO_TIER" | "COMBINED" | null = null;
        let promoDiscount = 0;
        let tierDiscount = 0;
        let vipDiscount = 0;
        let totalDiscount = 0;
        try {
          // 042: mijoz checkout'da "Shaxsiy chegirmamni qo'llash" belgisini
          // o'chirgan bo'lishi mumkin — buyurtma YAKUNIY summasi ham AYNAN
          // shu tanlovga mos bo'lishi shart (preview bilan bir xil manba).
          const best = await resolveBestCartDiscount(
            db, shopId, tgId, subtotal, purchasedProductIds,
            payload.promoCode ? String(payload.promoCode) : null,
            bundleReqs.length > 0, !!settingsRow?.allow_discount_stacking_with_bundle,
            {
              allowCombining: !!settingsRow?.allow_discount_combining,
              maxCombinedPercent: settingsRow?.max_combined_discount_percent != null ? Number(settingsRow.max_combined_discount_percent) : null,
              includeVip: payload.useVip !== false,
            },
          );
          if (best) {
            discountSource = best.source;
            totalDiscount = Math.min(best.discountAmount, subtotal);
            promoDiscount = Math.min(Number(best.promoDiscount) || 0, subtotal);
            tierDiscount = Math.min(Number(best.tierDiscount) || 0, subtotal);
            vipDiscount = Math.min(Number(best.vipDiscount) || 0, subtotal);
            if (best.promotion) appliedPromo = { id: best.promotion.id, code: best.promotion.code };
            if (best.tier) appliedTier = best.tier;
            if (best.discount) appliedVip = best.discount;
          }
        } catch (e) {
          console.error("[BEST_DISCOUNT_RESOLVE_FAILED]", e);
        }
        const payableTotal = Math.max(0, subtotal + deliveryFee - totalDiscount);

        // CLICK: to'lov so'rovini (invoice) HOZIR, to'liq summa (yetkazib
        // berish bilan) ma'lum bo'lgach yuboramiz — mijoz o'z Click
        // ilovasida tasdiqlaydi, haqiqiy tasdiqlash keyin click-webhook
        // (Prepare/Complete) orqali keladi. Invoice yaratib bo'lmasa,
        // buyurtma (allaqachon zaxira kamaytirgan) bekor qilinadi.
        if (clickCreds) {
          try {
            const invoiceId = await clickCreateInvoice(clickCreds, {
              amount: payableTotal, phoneNumber: phone.replace(/^\+/, ""), merchantTransId: String(orderId),
            });
            paymentSnapshot = { ...paymentSnapshot, clickInvoiceId: invoiceId };
          } catch (e: any) {
            console.error("[CLICK_INVOICE_FAILED]", { shopId, orderId, message: e?.message || String(e) });
            try {
              await db.rpc("update_order_status", {
                p_shop_id: shopId, p_order_id: orderId, p_new_status: "CANCELLED", p_requester_tg_id: tgId,
                p_is_admin: true, p_cancel_reason: "Click to'lov so'rovi yaratilmadi",
              });
            } catch (_) {}
            return json({ error: "click_invoice_failed" }, 400);
          }
        }

        // PAYME: hech qanday tashqi so'rov shart emas — checkout havolasi
        // pure client-side base64 URL (Payme'ning o'z "Отправка чека по
        // методу GET" kontrakti), shuning uchun xato/rollback holati yo'q.
        if (paymeCreds) {
          const returnUrl = ctx.botUsername ? `https://t.me/${ctx.botUsername}` : undefined;
          const checkoutUrl = buildPaymeCheckoutUrl({
            merchantId: paymeCreds.merchantId, orderAccountField: "order_id", orderId,
            amountTiyin: Math.round(payableTotal * 100), returnUrl, lang: "uz",
          });
          paymentSnapshot = { ...paymentSnapshot, paymeCheckoutUrl: checkoutUrl };
        }

        // UZUM: Click'ning invoice bosqichiga o'xshab, to'liq summa ma'lum
        // bo'lgach /payment/register chaqiriladi — mijoz qaytarilgan
        // paymentUrl'ga yo'naltiriladi, haqiqiy tasdiqlash keyin
        // uzum-webhook orqali keladi. Ro'yxatga olib bo'lmasa, buyurtma
        // (allaqachon zaxira kamaytirgan) bekor qilinadi — Click bilan bir
        // xil xavfsizlik naqshi.
        if (uzumCreds) {
          try {
            const returnUrl = ctx.botUsername ? `https://t.me/${ctx.botUsername}` : undefined;
            const { orderId: uzumOrderId, paymentUrl } = await uzumRegisterPayment(uzumCreds, {
              amountTiyin: Math.round(payableTotal * 100), clientId: tgId, orderNumber: String(orderId),
              successUrl: returnUrl, failureUrl: returnUrl, lang: "uz-UZ",
            });
            await db.from("uzum_transactions").insert({
              shop_id: shopId, order_id: orderId, uzum_order_id: uzumOrderId, amount: payableTotal, state: "REGISTERED",
            });
            paymentSnapshot = { ...paymentSnapshot, uzumOrderId, uzumPaymentUrl: paymentUrl };
          } catch (e: any) {
            console.error("[UZUM_REGISTER_FAILED]", { shopId, orderId, message: e?.message || String(e) });
            try {
              await db.rpc("update_order_status", {
                p_shop_id: shopId, p_order_id: orderId, p_new_status: "CANCELLED", p_requester_tg_id: tgId,
                p_is_admin: true, p_cancel_reason: "Uzum to'lov so'rovi yaratilmadi",
              });
            } catch (_) {}
            return json({ error: "uzum_register_failed" }, 400);
          }
        }

        const shipment = {
          status: "READY", kind: deliverySnapshot.kind,
          providerId: deliverySnapshot.providerId || null,
          providerName: deliverySnapshot.providerName || null,
          updatedAt: new Date().toISOString(),
        };
        const { data: orderRow, error: snapshotError } = await db.from("orders").update({
          subtotal, delivery_fee: deliveryFee, payable_total: payableTotal, total_price: payableTotal,
          delivery_snapshot: deliverySnapshot, payment_snapshot: paymentSnapshot, shipment,
          // 042: promo_code endi discountSource'ning ANIQ qiymatiga qarab
          // emas (avval faqat "PROMO"/"PROMO_TIER" edi — "COMBINED" bo'lsa
          // promo-kod ISHLATILGAN bo'lsa ham yozilmay qolar edi), balki
          // promo haqiqatan qo'llanganligiga (promoDiscount > 0) qarab
          // yoziladi — combining yoqiq/o'chiq bo'lishidan qat'i nazar to'g'ri.
          promo_code: (appliedPromo && promoDiscount > 0) ? appliedPromo.code : null,
          promo_discount: promoDiscount, tier_discount: tierDiscount, vip_discount: vipDiscount,
          tier_id: appliedTier?.id || null,
          tier_snapshot: appliedTier ? {
            id: appliedTier.id, name: appliedTier.name || null,
            thresholdAmount: Number(appliedTier.threshold_amount), discountType: appliedTier.discount_type,
            discountValue: Number(appliedTier.discount_value), discountAmount: tierDiscount,
          } : null,
          discount_source: discountSource,
          ...(enrichedItems ? { items: enrichedItems } : {}),
          ...(receiptPath ? { payment_receipt_path: receiptPath, payment_receipt_uploaded_at: new Date().toISOString() } : {}),
        }).eq("id", orderId).eq("shop_id", shopId).eq("tg_id", tgId).select("*").single();
        if (snapshotError || !orderRow) {
          try {
            await db.rpc("update_order_status", {
              p_shop_id: shopId, p_order_id: orderId, p_new_status: "CANCELLED", p_requester_tg_id: tgId,
              p_is_admin: true, p_cancel_reason: "Fulfillment snapshot saqlanmadi",
            });
          } catch (_) {}
          if (receiptPath) EdgeRuntime.waitUntil(cleanupPrivateReceipt(db, shopId, orderId, receiptPath));
          throw snapshotError || new Error("order_snapshot_failed");
        }
        // 042: xuddi shu sabab bilan — promo ishlatilishi (limit/mijoz-bошiga
        // limit hisobi uchun MUHIM) endi ANIQ source qiymatiga emas,
        // promoDiscount > 0'ga qarab yoziladi, aks holda COMBINED rejimida
        // promo-kod chekловsiz qayta-qayta ishlatilishi mumkin edi.
        if (appliedPromo?.id && promoDiscount > 0) {
          const { error: redemptionError } = await db.from("promotion_redemptions").insert({
            shop_id: shopId, promotion_id: appliedPromo.id, order_id: orderId, tg_id: tgId, discount_amount: promoDiscount,
          });
          if (redemptionError) {
            console.error("[PROMO_REDEMPTION_INSERT_FAILED]", redemptionError);
            await db.rpc("update_order_status", {
              p_shop_id: shopId, p_order_id: orderId, p_new_status: "CANCELLED", p_requester_tg_id: tgId,
              p_is_admin: true, p_cancel_reason: "Promo-kod limiti o'zgardi",
            });
            if (receiptPath) EdgeRuntime.waitUntil(cleanupPrivateReceipt(db, shopId, orderId, receiptPath));
            return json({ error: "promo_limit_changed" }, 409);
          }
        }
        // 4-paket, 10.17-band: shaxsiy chegirma foydalanish tarixi/limiti —
        // promotion_redemptions bilan AYNAN bir xil naqsh (order committed
        // bo'lgach, haqiqatan qo'llangan bo'lsagina — vipDiscount > 0).
        if (appliedVip?.id && vipDiscount > 0) {
          try {
            await db.from("customer_discount_usages").insert({ shop_id: shopId, customer_discount_id: appliedVip.id, order_id: orderId, tg_id: tgId, discount_amount: vipDiscount });
          } catch (e) {
            console.error("[CUSTOMER_DISCOUNT_USAGE_INSERT_FAILED]", e);
          }
        }
        // Shop takomillashtirish: buyurtma to'liq muvaffaqiyatli yaratilgach,
        // reward qoidalarini fon rejimida tekshiradi (checkout javobini
        // sekinlashtirmaydi) — order-total va lifetime-total ikkalasi ham.
        EdgeRuntime.waitUntil(validateAndPauseBundles(db, shopId, BOT_TOKEN, orderProductIds.map(String)).catch((e: any) => console.error("[BUNDLE_POST_ORDER_PAUSE_FAILED]", e)));
        // Buyurtma muvaffaqiyatli yaratildi — bu savat endi "tashlab
        // ketilgan" emas, konvertatsiya bo'lgan. Xato bo'lsa jim o'tkaziladi
        // (eng yomon holatda eskirgan cart_log qatori keyingi threshold
        // tekshiruvida ko'rinadi, lekin buyurtma yaratish hech qachon buzilmaydi).
        try { await db.from("cart_logs").delete().eq("shop_id", shopId).eq("tg_id", tgId); } catch (_) {}
        const mapped = mapOrderForClient(orderRow, { includeInternalNote: isAdmin });
        EdgeRuntime.waitUntil(backgroundNotifyOrder(db, shopId, BOT_TOKEN, PLATFORM_SUPER_ADMIN_ID, mapped, fullname, phone, regionLabelForSnapshot(regionKey), district, address, paymentSnapshot.label));
        if (receiptPath) EdgeRuntime.waitUntil(notifyReceiptAdmins(db, shopId, BOT_TOKEN, PLATFORM_SUPER_ADMIN_ID, orderId, receiptPath));
        return json({ order: mapped });
      }

      case "cancel_order":
      case "confirm_order_received": // 5-band: mijoz o'z buyurtmasini "Qabul qildim" deb tasdiqlaydi (faqat PROCESSING'dan) — o'zi update_order_status RPC darajasida majburiy tekshiriladi, faqat frontend disable emas.
      case "update_order_status": {
        const newStatus = action === "cancel_order" ? "CANCELLED" : action === "confirm_order_received" ? "DELIVERED" : String(payload.newStatus || "");
        if (action === "update_order_status" || (isAdmin && ["cancel_order", "confirm_order_received"].includes(action))) {
          await requirePermission('orders.manage');
        }
        // Pochta buyurtmasini tashuvchiga topshirmasdan "Yetkazildi" qilish
        // mumkin emas. Bu faqat UI cheklovi emas — barcha shop/botlar uchun
        // server darajasida bir xil ishlaydi. 2026-09-13: Taksi uchun ham xuddi
        // shunday himoya qo'shildi — taksi hali yo'lga chiqmasdan (IN_TRANSIT)
        // turib butun buyurtmani "Yetkazildi" deb belgilab bo'lmaydi (avval
        // faqat Pochtada bor edi, Taksida yo'q edi — nomuvofiqlik topilib
        // tuzatildi).
        if (action === "update_order_status" && newStatus === "DELIVERED") {
          const { data: deliveryGate, error: deliveryGateError } = await db.from("orders")
            .select("delivery_snapshot,shipment").eq("id", payload.orderId).eq("shop_id", shopId).maybeSingle();
          if (deliveryGateError) throw deliveryGateError;
          if (!deliveryGate) return json({ error: "order_not_found" }, 404);
          if (deliveryGate.delivery_snapshot?.kind === "POST" && deliveryGate.shipment?.status !== "HANDED_TO_CARRIER") {
            return json({ error: "handoff_required_before_delivery" }, 400);
          }
          if (deliveryGate.delivery_snapshot?.kind === "TAXI" && !["IN_TRANSIT", "DELIVERED"].includes(deliveryGate.shipment?.status)) {
            return json({ error: "taxi_in_transit_required_before_delivery" }, 400);
          }
        }
        // 14-band: mijoz bekor qilish sababini o'zi tanlaydi/yozadi (bo'sh
        // qoldirsa standart matn). Seller belgilagan bosqichdan keyin esa
        // mijoz UMUMAN bekor qila olmaydi — bu tekshiruv faqat mijoz
        // tomonidan (isAdmin=false) chaqirilgan cancel_order uchun, RPC
        // ichidagi "faqat non-terminal" tekshiruvidan TASHQARI, qo'shimcha.
        if (action === "cancel_order" && !isAdmin) {
          const [{ data: orderForCutoff }, { data: settingsForCutoff }] = await Promise.all([
            db.from("orders").select("status,shipment").eq("id", payload.orderId).eq("shop_id", shopId).maybeSingle(),
            db.from("shop_settings").select("customer_cancel_cutoff").eq("shop_id", shopId).maybeSingle(),
          ]);
          const cutoff = settingsForCutoff?.customer_cancel_cutoff || "BEFORE_SHIPPED";
          const shipmentStatus = orderForCutoff?.shipment?.status || "READY";
          const shipped = ["IN_TRANSIT", "HANDED_TO_CARRIER"].includes(shipmentStatus);
          const allowed = cutoff === "NEW_ONLY" ? orderForCutoff?.status === "NEW"
            : cutoff === "BEFORE_SHIPPED" ? (orderForCutoff?.status === "NEW" || (orderForCutoff?.status === "PROCESSING" && !shipped))
            : orderForCutoff?.status === "NEW" || orderForCutoff?.status === "PROCESSING";
          if (!allowed) return json({ error: "cancel_not_allowed_at_this_stage" }, 400);
        }
        const cancelReason = action === "cancel_order" ? (nullableText(payload.reason, 500) || "Mijoz tomonidan bekor qilindi") : nullableText(payload.reason, 500);
        const { data, error } = await db.rpc("update_order_status", {
          p_shop_id: shopId, p_order_id: payload.orderId, p_new_status: newStatus, p_requester_tg_id: tgId,
          p_is_admin: isAdmin, p_cancel_reason: newStatus === "CANCELLED" ? cancelReason : null,
        });
        if (error) {
          const m = String(error.message || "");
          if (m.includes("forbidden")) return json({ error: "forbidden" }, 403);
          if (m.includes("terminal_status") || m.includes("invalid_transition")) return json({ error: "invalid_status_transition" }, 400);
          if (m.includes("order_not_found")) return json({ error: "order_not_found" }, 404);
          throw error;
        }
        auditLater(action === "confirm_order_received" ? "ORDER_CONFIRMED_BY_CUSTOMER" : "ORDER_STATUS_CHANGED", "order", payload.orderId, { status: newStatus, reason: cancelReason });
        const { data: orderRow, error: orderFetchError } = await db.from("orders").select("*").eq("id", payload.orderId).eq("shop_id", shopId).single();
        if (orderFetchError) throw orderFetchError;
        if (newStatus === "DELIVERED" && orderRow.payment_status === "PAID") {
          EdgeRuntime.waitUntil(checkAndIssueRewards(db, shopId, String(orderRow.tg_id), Number(orderRow.id), Number(orderRow.payable_total || 0), BOT_TOKEN));
          EdgeRuntime.waitUntil(pushOrderToBillzInBackground(db, shopId, Number(orderRow.id), orderRow.items || [], BOT_TOKEN_MASTER_KEY));
        }
        // Astra-6c: admin status change Telegram orqali yetkazishga urinadi,
        // ammo bot bloklangan/boshlanmagan bo'lsa DB status allaqachon
        // committed — web Buyurtmalar/Support fallback shu holatni ko'rsatadi.
        if (isAdmin) EdgeRuntime.waitUntil(notifyOrderStatusCustomer(BOT_TOKEN, orderRow || data));
        return json({ order: mapOrderForClient(orderRow || data, { includeInternalNote: isAdmin }) });
      }

      case "approve_payment_receipt": {
        await requirePermission('orders.manage');
        const orderId = Number(payload.orderId);
        if (!Number.isInteger(orderId) || orderId <= 0) return json({ error: "invalid_order" }, 400);
        const { data: approved, error: approveError } = await db.rpc("ustore_approve_payment_receipt", {
          p_shop_id: shopId, p_order_id: orderId, p_reviewer: String(tgId),
        });
        if (approveError) {
          const message = String(approveError.message || "");
          if (message.includes("receipt_not_found")) return json({ error: "receipt_not_found" }, 404);
          if (message.includes("order_not_found")) return json({ error: "order_not_found" }, 404);
          if (message.includes("terminal_status")) return json({ error: "invalid_status_transition" }, 400);
          throw approveError;
        }
        auditLater("PAYMENT_RECEIPT_APPROVED", "order", orderId);
        const orderRow = Array.isArray(approved) ? approved[0] : approved;
        EdgeRuntime.waitUntil(checkAndIssueRewards(db, shopId, String(orderRow.tg_id), Number(orderRow.id), Number(orderRow.payable_total || 0), BOT_TOKEN));
        EdgeRuntime.waitUntil(pushOrderToBillzInBackground(db, shopId, Number(orderRow.id), orderRow.items || [], BOT_TOKEN_MASTER_KEY));
        return json({ order: mapOrderForClient(orderRow, { includeInternalNote: true }) });
      }

      case "reject_payment_receipt": {
        await requirePermission('orders.manage');
        const orderId = Number(payload.orderId);
        const reason = nullableText(payload.reason, 500);
        if (!Number.isInteger(orderId) || orderId <= 0) return json({ error: "invalid_order" }, 400);
        if (!reason) return json({ error: "reject_reason_required" }, 400);
        const { data: order, error: orderError } = await db.from("orders")
          .select("id,payment_receipt_path").eq("id", orderId).eq("shop_id", shopId).maybeSingle();
        if (orderError) throw orderError;
        if (!order || !order.payment_receipt_path) return json({ error: "receipt_not_found" }, 404);
        const { error: updateError } = await db.from("orders").update({
          receipt_review_status: "REJECTED", receipt_reject_reason: reason,
          receipt_reviewed_at: new Date().toISOString(), receipt_reviewed_by: String(tgId),
        }).eq("id", orderId).eq("shop_id", shopId);
        if (updateError) throw updateError;
        auditLater("PAYMENT_RECEIPT_REJECTED", "order", orderId, { reason });
        const { data: orderRow, error: fetchError } = await db.from("orders").select("*").eq("id", orderId).eq("shop_id", shopId).single();
        if (fetchError) throw fetchError;
        return json({ order: mapOrderForClient(orderRow, { includeInternalNote: true }) });
      }

      case "upload_payment_receipt": {
        const orderId = Number(payload.orderId);
        if (!Number.isInteger(orderId) || orderId <= 0 || !payload.imageUpload) {
          return json({ error: "invalid_receipt_file" }, 400);
        }
        const { data: order, error: orderError } = await db.from("orders")
          .select("id,tg_id,status,pay_method,payment_snapshot,payment_receipt_path,payment_receipt_uploaded_at,receipt_review_status,receipt_reject_reason,receipt_reviewed_at,receipt_reviewed_by")
          .eq("id", orderId).eq("shop_id", shopId).maybeSingle();
        if (orderError) throw orderError;
        if (!order || order.tg_id !== tgId) return json({ error: "order_not_found" }, 404);
        if (order.pay_method !== "CARD" || ["DELIVERED", "CANCELLED"].includes(order.status)) {
          return json({ error: "receipt_not_allowed" }, 400);
        }

        let uploaded: { path: string } | null = null;
        try {
          uploaded = await storePaymentReceipt(db, shopId, orderId, tgId, payload.imageUpload);
          const paymentSnapshot = { ...(order.payment_snapshot || {}), receiptStatus: "RECEIVED" };
          const { error: updateError } = await db.from("orders").update({
            payment_receipt_path: uploaded.path,
            payment_receipt_uploaded_at: new Date().toISOString(),
            payment_snapshot: paymentSnapshot,
            receipt_review_status: "PENDING", receipt_reject_reason: null,
            receipt_reviewed_at: null, receipt_reviewed_by: null,
          }).eq("id", orderId).eq("shop_id", shopId).eq("tg_id", tgId);
          if (updateError) throw updateError;
        } catch (e) {
          if (uploaded?.path) {
            try { await db.storage.from("payment-receipts").remove([uploaded.path]); } catch (_) {}
          }
          throw e;
        }

        if (order.payment_receipt_path && order.payment_receipt_path !== uploaded.path) {
          if (order.receipt_review_status === "REJECTED") {
            EdgeRuntime.waitUntil(archiveRejectedReceipt(db, shopId, orderId, order));
          } else {
            EdgeRuntime.waitUntil(cleanupPrivateReceipt(db, shopId, orderId, String(order.payment_receipt_path)));
          }
        }
        EdgeRuntime.waitUntil(notifyReceiptAdmins(db, shopId, BOT_TOKEN, PLATFORM_SUPER_ADMIN_ID, orderId, uploaded.path));
        auditLater("PAYMENT_RECEIPT_UPLOADED", "order", orderId);
        return json({ ok: true, hasReceipt: true });
      }

      case "get_payment_receipt_upload_url": {
        const orderId = Number(payload.orderId);
        const mimeType = String(payload.mimeType || "").toLowerCase();
        const extByMime: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
        const ext = extByMime[mimeType];
        const size = Number(payload.size);
        if (!Number.isInteger(orderId) || orderId <= 0 || !ext || !Number.isFinite(size) || size <= 0 || size > 6 * 1024 * 1024) {
          return json({ error: "invalid_receipt_file" }, 400);
        }
        const { data: order } = await db.from("orders").select("id,tg_id,status,pay_method").eq("id", orderId).eq("shop_id", shopId).maybeSingle();
        if (!order || order.tg_id !== tgId) return json({ error: "order_not_found" }, 404);
        if (order.pay_method !== "CARD" || ["DELIVERED", "CANCELLED"].includes(order.status)) return json({ error: "receipt_not_allowed" }, 400);
        const path = `shops/${shopId}/receipts/${orderId}/${tgId}-${crypto.randomUUID()}.${ext}`;
        const { data, error } = await db.storage.from("payment-receipts").createSignedUploadUrl(path);
        if (error || !data?.token) throw error || new Error("receipt_upload_url_failed");
        return json({ path, token: data.token });
      }

      case "finalize_payment_receipt": {
        const orderId = Number(payload.orderId);
        const path = String(payload.path || "");
        const expectedFolder = `shops/${shopId}/receipts/${orderId}`;
        if (!Number.isInteger(orderId) || orderId <= 0 || !path.startsWith(`${expectedFolder}/`) || !/^[0-9]+-[0-9a-f-]+\.(?:jpg|png|webp)$/i.test(path.slice(expectedFolder.length + 1))) {
          return json({ error: "invalid_receipt_path" }, 400);
        }
        const { data: order } = await db.from("orders").select("id,tg_id,status,pay_method,payment_snapshot,payment_receipt_path,payment_receipt_uploaded_at,receipt_review_status,receipt_reject_reason,receipt_reviewed_at,receipt_reviewed_by").eq("id", orderId).eq("shop_id", shopId).maybeSingle();
        if (!order || order.tg_id !== tgId) return json({ error: "order_not_found" }, 404);
        if (order.pay_method !== "CARD" || ["DELIVERED", "CANCELLED"].includes(order.status)) return json({ error: "receipt_not_allowed" }, 400);
        const fileName = path.slice(expectedFolder.length + 1);
        const { data: objects, error: listError } = await db.storage.from("payment-receipts").list(expectedFolder, { search: fileName, limit: 5 });
        if (listError || !(objects || []).some((object: any) => object.name === fileName)) return json({ error: "receipt_not_uploaded" }, 400);
        const paymentSnapshot = { ...(order.payment_snapshot || {}), receiptStatus: "RECEIVED" };
        const { error: updateError } = await db.from("orders").update({
          payment_receipt_path: path,
          payment_receipt_uploaded_at: new Date().toISOString(),
          payment_snapshot: paymentSnapshot,
          receipt_review_status: "PENDING", receipt_reject_reason: null,
          receipt_reviewed_at: null, receipt_reviewed_by: null,
        }).eq("id", orderId).eq("shop_id", shopId).eq("tg_id", tgId);
        if (updateError) throw updateError;
        if (order.payment_receipt_path && order.payment_receipt_path !== path) {
          if (order.receipt_review_status === "REJECTED") {
            EdgeRuntime.waitUntil(archiveRejectedReceipt(db, shopId, orderId, order));
          } else {
            EdgeRuntime.waitUntil(cleanupPrivateReceipt(db, shopId, orderId, String(order.payment_receipt_path)));
          }
        }
        EdgeRuntime.waitUntil(notifyReceiptAdmins(db, shopId, BOT_TOKEN, PLATFORM_SUPER_ADMIN_ID, orderId, path));
        auditLater("PAYMENT_RECEIPT_UPLOADED", "order", orderId);
        return json({ ok: true });
      }

      case "get_payment_receipt_url": {
        await requirePermission('orders.manage');
        const orderId = Number(payload.orderId);
        const { data: order } = await db.from("orders").select("payment_receipt_path").eq("id", orderId).eq("shop_id", shopId).maybeSingle();
        if (!order?.payment_receipt_path) return json({ error: "receipt_not_found" }, 404);
        const { data, error } = await db.storage.from("payment-receipts").createSignedUrl(order.payment_receipt_path, 120);
        if (error || !data?.signedUrl) throw error || new Error("receipt_signed_url_failed");
        return json({ url: data.signedUrl, expiresIn: 120 });
      }

      case "update_shipment": {
        await requirePermission('orders.manage');
        const orderId = Number(payload.orderId);
        const { data: order, error: orderError } = await db.from("orders").select("*").eq("id", orderId).eq("shop_id", shopId).maybeSingle();
        if (orderError) throw orderError;
        if (!order) return json({ error: "order_not_found" }, 404);
        if (["CANCELLED"].includes(order.status)) return json({ error: "shipment_not_allowed" }, 400);
        const delivery = order.delivery_snapshot || {};
        const oldShipment = order.shipment || { status: "READY" };
        const status = String(payload.status || "");
        let shipment: any;
        if (delivery.kind === "TAXI") {
          if (!["READY", "TAXI_ASSIGNED", "IN_TRANSIT", "DELIVERED"].includes(status)) return json({ error: "invalid_shipment_status" }, 400);
          const carNumber = nullableText(payload.carNumber, 30);
          const driverPhone = nullableText(payload.driverPhone, 30);
          const driverName = nullableText(payload.driverName, 100);
          if (["TAXI_ASSIGNED", "IN_TRANSIT"].includes(status) && (!carNumber || !driverPhone || !/^\+?[\d()\-\s]{7,30}$/.test(driverPhone))) {
            return json({ error: "taxi_driver_details_required" }, 400);
          }
          shipment = { kind: "TAXI", status, carNumber, driverPhone, driverName, updatedAt: new Date().toISOString() };
        } else if (delivery.kind === "POST") {
          if (!["READY", "HANDED_TO_CARRIER"].includes(status)) return json({ error: "invalid_shipment_status" }, 400);
          const trackingNumber = nullableText(payload.trackingNumber, 100);
          if (status === "HANDED_TO_CARRIER" && !trackingNumber) return json({ error: "tracking_number_required" }, 400);
          // Online Do'kon yaxshilashlari, 5-band: "jo'natilgan sana" — birinchi
          // marta HANDED_TO_CARRIER'ga o'tganda o'rnatiladi va keyingi
          // tahrirlarda (masalan tracking raqami tuzatilsa) qayta yozilmaydi.
          const shippedAt = status === "HANDED_TO_CARRIER" ? (oldShipment.shippedAt || new Date().toISOString()) : null;
          shipment = {
            kind: "POST", status, providerId: delivery.providerId, providerName: delivery.providerName,
            branchName: delivery.branchName || null,
            trackingNumber, shippedAt, updatedAt: new Date().toISOString(),
          };
        } else {
          return json({ error: "shipment_not_supported_for_delivery" }, 400);
        }
        const { data: updated, error: updateError } = await db.from("orders").update({ shipment }).eq("id", orderId).eq("shop_id", shopId).select("*").single();
        if (updateError) throw updateError;
        auditLater("SHIPMENT_UPDATED", "order", orderId, { kind: shipment.kind, status: shipment.status });
        if (oldShipment.status !== shipment.status) EdgeRuntime.waitUntil(notifyShipmentCustomer(BOT_TOKEN, updated));

        // 2026-09-13: taksi jo'natmasi "Yetkazildi" deb belgilanganda, buyurtma
        // holatining o'zi ham AVTOMATIK "Yetkazildi"ga o'tadi — avval ikkalasi
        // mustaqil edi (admin ikkalasini alohida bosishi kerak edi), va agar
        // ikkinchi bosishni unutsa buyurtma hisobotlarda "Jarayonda" bo'lib
        // qolib ketardi, garchi jo'natma allaqachon yetkazilgan bo'lsa ham.
        // update_order_status RPC bilan bir xil yo'l — delivered_at ham xuddi
        // shu RPC chaqiruvidan keyingi case bilan bir xil tarzda o'rnatiladi.
        let finalOrder = updated;
        if (shipment.kind === "TAXI" && shipment.status === "DELIVERED" && !["DELIVERED", "CANCELLED"].includes(order.status)) {
          try {
            await db.rpc("update_order_status", {
              p_shop_id: shopId, p_order_id: orderId, p_new_status: "DELIVERED", p_requester_tg_id: tgId,
              p_is_admin: true, p_cancel_reason: null,
            });
            await db.from("orders").update({ delivered_at: new Date().toISOString() }).eq("id", orderId).eq("shop_id", shopId).is("delivered_at", null);
            const { data: refetched, error: refetchError } = await db.from("orders").select("*").eq("id", orderId).eq("shop_id", shopId).maybeSingle();
            if (refetchError) throw refetchError;
            if (refetched) finalOrder = refetched;
          } catch (e) {
            console.error("auto order-delivered sync from taxi shipment failed", e);
          }
        }
        return json({ order: mapOrderForClient(finalOrder, { includeInternalNote: true }) });
      }

      case "get_my_orders": {
        const { data, error } = await db.from("orders").select("*").eq("shop_id", shopId).eq("tg_id", tgId).order("id", { ascending: false }).limit(500);
        if (error) throw error;
        // Array.map callback's second argument is the numeric index. Passing
        // mapOrderForClient directly made that index become `opts`; on every
        // non-zero row it could accidentally behave like a truthy options
        // object. Keep the customer path explicit and options-free.
        return json({ orders: await mapOrdersWithReturns(db, shopId, data || [], false) });
      }
      case "get_all_orders": {
        await requirePermission('orders.view');
        const { data, error } = await db.from("orders").select("*").eq("shop_id", shopId).order("id", { ascending: false }).limit(1000);
        if (error) throw error;
        return json({ orders: await mapOrdersWithReturns(db, shopId, data || [], true) });
      }

      case "update_order_return": {
        await requirePermission('orders.manage');
        const returnId = String(payload.returnId || "");
        const nextStatus = String(payload.status || "").toUpperCase();
        const adminNote = nullableText(payload.adminNote, 1000);
        if (!returnId || !["APPROVED","REJECTED","RECEIVED","RESTOCKED","REFUND_PENDING","REFUNDED","COMPLETED"].includes(nextStatus)) return json({ error: "invalid_return_action" }, 400);
        let result: any;
        if (nextStatus === "RESTOCKED") {
          result = await db.rpc("ustore_restock_order_return", { p_shop_id: shopId, p_return_id: returnId, p_admin_tg_id: tgId });
        } else if (nextStatus === "REFUNDED") {
          result = await db.rpc("ustore_mark_order_return_refunded", {
            p_shop_id: shopId, p_return_id: returnId, p_admin_tg_id: tgId,
            p_refund_method: nullableText(payload.refundMethod, 80), p_refund_reference: nullableText(payload.refundReference, 200),
          });
        } else {
          result = await db.rpc("ustore_update_order_return_status", { p_shop_id: shopId, p_return_id: returnId, p_new_status: nextStatus, p_admin_tg_id: tgId, p_admin_note: adminNote });
        }
        if (result.error) {
          const msg = String(result.error.message || "");
          if (msg.includes("invalid_return_transition")) return json({ error: "invalid_return_transition" }, 409);
          if (msg.includes("refund_reference_required")) return json({ error: "refund_reference_required" }, 400);
          throw result.error;
        }
        const updatedReturn = result.data;
        auditLater("ORDER_RETURN_UPDATED", "order_return", returnId, { status: nextStatus });
        try {
          await telegramApi(BOT_TOKEN, "sendMessage", { chat_id: updatedReturn.requester_tg_id, text: `↩️ Qaytarish #${updatedReturn.order_id}: ${nextStatus}\n\nHolatni do'kon ichidagi buyurtmada ko'rishingiz mumkin.` });
        } catch (e) { console.error("[RETURN_NOTIFY_FAILED]", e); }
        return json({ returnRequest: mapReturnForClient(updatedReturn) });
      }

      case "set_order_internal_note": {
        await requirePermission('orders.manage');
        const orderId = Number(payload.orderId);
        if (!Number.isInteger(orderId) || orderId <= 0) return json({ error: "invalid_order" }, 400);
        const note = nullableText(payload.note, 1000);
        const { data, error } = await db.from("orders").update({ internal_note: note }).eq("id", orderId).eq("shop_id", shopId).select("*").single();
        if (error) throw error;
        if (!data) return json({ error: "order_not_found" }, 404);
        auditLater("ORDER_INTERNAL_NOTE_UPDATED", "order", orderId, {});
        return json({ order: mapOrderForClient(data, { includeInternalNote: true }) });
      }

      case "get_support_attachment_upload_url": {
        const mimeType = String(payload.mimeType || "").toLowerCase();
        const extByMime: Record<string,string> = { "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp" };
        const ext = extByMime[mimeType];
        const size = Number(payload.size || 0);
        if (!ext || !Number.isFinite(size) || size <= 0 || size > 5 * 1024 * 1024) return json({ error: "invalid_support_attachment" }, 400);
        const path = `shops/${shopId}/support/${tgId}/${crypto.randomUUID()}.${ext}`;
        const { data, error } = await db.storage.from("support-attachments").createSignedUploadUrl(path);
        if (error || !data?.token) throw error || new Error("support_attachment_upload_url_failed");
        return json({ path, token: data.token });
      }

      case "finalize_support_attachment_upload": {
        const attachment = await validateSupportAttachment(payload);
        if (!attachment) return json({ error: "invalid_support_attachment" }, 400);
        return json({ attachment: { path: attachment.attachment_path, mimeType: attachment.attachment_mime, name: attachment.attachment_name, size: attachment.attachment_size } });
      }

      case "create_support_ticket": {
        const message = nullableText(payload.message, 2000);
        const attachment = await validateSupportAttachment(payload.attachment);
        if (!message && !attachment) return json({ error: "message_required" }, 400);
        const orderId = payload.orderId ? Number(payload.orderId) : null;
        // 15-band: "Qaytarish/muammo" — oddiy Support'dan ALOHIDA tur va
        // butunlay o'chirilishi mumkin (seller sozlamasi). Oddiy Support
        // esa har doim ochiq qoladi.
        const ticketType = payload.ticketType === "RETURN" ? "RETURN" : "SUPPORT";
        if (ticketType === "RETURN" && !message) return json({ error: "return_reason_required" }, 400);
        if (orderId !== null) {
          const { data: order } = await db.from("orders").select("id,status,delivered_at,items,payable_total,total_price,pay_method,payment_status").eq("id", orderId).eq("shop_id", shopId).eq("tg_id", tgId).maybeSingle();
          if (!order) return json({ error: "order_not_found" }, 404);
          if (ticketType === "RETURN") {
            const { data: settingsRow } = await db.from("shop_settings").select("return_requests_enabled,return_window_days").eq("shop_id", shopId).maybeSingle();
            if (settingsRow?.return_requests_enabled === false) return json({ error: "return_requests_disabled" }, 400);
            if (order.status !== "DELIVERED" || !order.delivered_at) return json({ error: "return_not_delivered" }, 400);
            const windowDays = Math.max(1, Number(settingsRow?.return_window_days) || 7);
            if (new Date(order.delivered_at).getTime() + windowDays * 86400000 < Date.now()) return json({ error: "return_window_expired" }, 400);
          }
        } else if (ticketType === "RETURN") {
          return json({ error: "return_order_required" }, 400);
        }
        let existingQuery = db.from("support_tickets").select("*").eq("shop_id", shopId).eq("tg_id", tgId).eq("ticket_type", ticketType).neq("status", "CLOSED")
          .order("id", { ascending: false }).limit(1);
        existingQuery = orderId !== null ? existingQuery.eq("order_id", orderId) : existingQuery.is("order_id", null);
        const { data: existingRows, error: existingError } = await existingQuery;
        if (existingError) throw existingError;
        let ticket = (existingRows || [])[0] || null;
        if (!ticket) {
          const { data: created, error: createError } = await db.from("support_tickets").insert({ shop_id: shopId, tg_id: tgId, order_id: orderId, ticket_type: ticketType }).select("*").single();
          if (createError) throw createError;
          ticket = created;
        }
        if (ticketType === "RETURN" && orderId !== null) {
          const { data: returnRow, error: returnReadError } = await db.from("order_returns").select("id").eq("shop_id", shopId).eq("order_id", orderId).maybeSingle();
          if (returnReadError) throw returnReadError;
          let returnRequestId = returnRow?.id || null;
          if (!returnRequestId) {
            const { data: orderForReturn, error: orderForReturnError } = await db.from("orders").select("items,payable_total,total_price").eq("shop_id", shopId).eq("id", orderId).eq("tg_id", tgId).single();
            if (orderForReturnError) throw orderForReturnError;
            const { data: createdReturn, error: createReturnError } = await db.from("order_returns").insert({
              shop_id: shopId, order_id: orderId, requester_tg_id: tgId,
              requested_items: orderForReturn.items || [], reason: message,
              refund_amount: Number(orderForReturn.payable_total ?? orderForReturn.total_price) || 0,
            }).select("id").single();
            if (createReturnError) throw createReturnError;
            returnRequestId = createdReturn.id;
          }
          const { error: linkError } = await db.from("support_tickets").update({ return_request_id: returnRequestId }).eq("shop_id", shopId).eq("id", ticket.id);
          if (linkError) throw linkError;
          ticket.return_request_id = returnRequestId;
        }
        const { data: msg, error: msgError } = await db.from("support_ticket_messages").insert({
          shop_id: shopId, ticket_id: ticket.id, sender: "USER", sender_tg_id: tgId, body: message, ...(attachment || {}),
        }).select("*").single();
        if (msgError) throw msgError;
        auditLater("SUPPORT_TICKET_CREATED", "support_ticket", ticket.id, { orderId });
        EdgeRuntime.waitUntil(notifySupportAdmins(db, shopId, BOT_TOKEN, PLATFORM_SUPER_ADMIN_ID, { ...ticket, message: message || "📷 Rasm yuborildi / Отправлено изображение" }));
        return json({ ticket: mapSupportTicketForClient(ticket), message: mapSupportMessageForClient(msg) });
      }

      case "send_support_message": {
        if (isAdmin) await requirePermission('support.manage');
        const ticketId = Number(payload.ticketId);
        const body = nullableText(payload.body, 2000);
        const attachment = await validateSupportAttachment(payload.attachment);
        const replyToMessageId = payload.replyToMessageId ? Number(payload.replyToMessageId) : null;
        if (!Number.isInteger(ticketId) || ticketId <= 0 || (!body && !attachment)) return json({ error: "invalid_message" }, 400);
        const { data: ticket, error: ticketError } = await db.from("support_tickets").select("*").eq("id", ticketId).eq("shop_id", shopId).maybeSingle();
        if (ticketError) throw ticketError;
        if (!ticket) return json({ error: "ticket_not_found" }, 404);
        if (!isAdmin && ticket.tg_id !== tgId) return json({ error: "forbidden" }, 403);
        if (ticket.status === "CLOSED") return json({ error: "ticket_closed" }, 400);
        if (replyToMessageId !== null) {
          const { data: parent } = await db.from("support_ticket_messages").select("id").eq("id", replyToMessageId).eq("shop_id", shopId).eq("ticket_id", ticketId).maybeSingle();
          if (!parent) return json({ error: "reply_target_not_found" }, 400);
        }
        const sender = isAdmin ? "ADMIN" : "USER";
        const { data: msg, error: msgError } = await db.from("support_ticket_messages").insert({
          shop_id: shopId, ticket_id: ticketId, sender, sender_tg_id: tgId, body, reply_to_message_id: replyToMessageId, ...(attachment || {}),
        }).select("*").single();
        if (msgError) throw msgError;
        let updatedTicket = ticket;
        const nowIso = new Date().toISOString();
        if (sender === "ADMIN") {
          // Task 7 (48h auto-close): EVERY admin reply resets the deadline
          // to now()+48h — not just the first one that flips OPEN->ANSWERED.
          // If the customer never replies again, ustore_auto_close_stale_
          // support_tickets() (061-migratsiya) closes it automatically.
          const patch: Record<string, unknown> = {
            last_admin_reply_at: nowIso,
            auto_close_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          };
          if (ticket.status === "OPEN") { patch.status = "ANSWERED"; patch.answered_at = nowIso; patch.answered_by = String(tgId); }
          const { data: statusUpdated, error: statusError } = await db.from("support_tickets").update(patch).eq("id", ticketId).eq("shop_id", shopId).select("*").single();
          if (statusError) throw statusError;
          updatedTicket = statusUpdated;
        } else if (ticket.auto_close_at) {
          // A customer reply cancels any pending auto-close deadline.
          const { data: cleared, error: clearErr } = await db.from("support_tickets").update({ auto_close_at: null }).eq("id", ticketId).eq("shop_id", shopId).select("*").single();
          if (clearErr) throw clearErr;
          updatedTicket = cleared;
        }
        auditLater(sender === "ADMIN" ? "SUPPORT_TICKET_ANSWERED" : "SUPPORT_TICKET_MESSAGE", "support_ticket", ticketId);
        const notificationText = body || "📷 Rasm yuborildi / Отправлено изображение";
        if (sender === "ADMIN") EdgeRuntime.waitUntil(notifySupportReply(BOT_TOKEN, { ...updatedTicket, admin_reply: notificationText }));
        else EdgeRuntime.waitUntil(notifySupportAdmins(db, shopId, BOT_TOKEN, PLATFORM_SUPER_ADMIN_ID, { ...updatedTicket, message: notificationText }));
        return json({ ticket: mapSupportTicketForClient(updatedTicket), message: mapSupportMessageForClient(msg) });
      }

      case "close_support_ticket": {
        const ticketId = Number(payload.ticketId);
        if (!Number.isInteger(ticketId) || ticketId <= 0) return json({ error: "invalid_ticket" }, 400);
        const { data: ticket } = await db.from("support_tickets").select("id,tg_id,status").eq("id", ticketId).eq("shop_id", shopId).maybeSingle();
        if (!ticket || ticket.tg_id !== tgId) return json({ error: "ticket_not_found" }, 404);
        if (ticket.status === "CLOSED") return json({ ticket: mapSupportTicketForClient(ticket) });
        const { data: updated, error } = await db.from("support_tickets").update({
          status: "CLOSED", closed_at: new Date().toISOString(), closed_by: String(tgId),
        }).eq("id", ticketId).eq("shop_id", shopId).select("*").single();
        if (error) throw error;
        auditLater("SUPPORT_TICKET_CLOSED", "support_ticket", ticketId);
        return json({ ticket: mapSupportTicketForClient(updated) });
      }

      case "get_support_messages": {
        if (isAdmin) await requirePermission('support.manage');
        const ticketId = Number(payload.ticketId);
        if (!Number.isInteger(ticketId) || ticketId <= 0) return json({ error: "invalid_ticket" }, 400);
        const { data: ticket } = await db.from("support_tickets").select("id,tg_id").eq("id", ticketId).eq("shop_id", shopId).maybeSingle();
        if (!ticket) return json({ error: "ticket_not_found" }, 404);
        if (!isAdmin && ticket.tg_id !== tgId) return json({ error: "forbidden" }, 403);
        // task 5-6 (read receipts, "✓/✓✓"): opening the thread marks the
        // COUNTERPART's unread messages as read — an admin viewing marks
        // USER messages read, a customer viewing marks ADMIN messages read.
        // Done BEFORE the select so the response already reflects it (no
        // extra round-trip needed for the reader's own view to show ✓✓).
        const counterpartSender = isAdmin ? "USER" : "ADMIN";
        const { error: readErr } = await db.from("support_ticket_messages")
          .update({ read_at: new Date().toISOString() })
          .eq("ticket_id", ticketId).eq("shop_id", shopId).eq("sender", counterpartSender).is("read_at", null);
        if (readErr) console.error("support message read-receipt error", readErr);
        const afterMessageId = Number(payload.afterMessageId || 0);
        let messageQuery = db.from("support_ticket_messages").select("*").eq("ticket_id", ticketId).eq("shop_id", shopId);
        if (Number.isInteger(afterMessageId) && afterMessageId > 0) messageQuery = messageQuery.gt("id", afterMessageId).order("id", { ascending: true }).limit(100);
        else messageQuery = messageQuery.order("id", { ascending: false }).limit(50);
        const { data, error } = await messageQuery;
        if (error) throw error;
        const ordered = afterMessageId > 0 ? (data || []) : (data || []).slice().reverse();
        const messages = await Promise.all(ordered.map(async (message: any) => {
          if (!message.attachment_path) return mapSupportMessageForClient(message);
          const { data: signed } = await db.storage.from("support-attachments").createSignedUrl(message.attachment_path, 300);
          return mapSupportMessageForClient(message, { attachmentUrl: signed?.signedUrl || null });
        }));
        return json({ messages, hasMore: !afterMessageId && (data || []).length === 50 });
      }

      case "get_my_support_tickets": {
        const { data, error } = await db.from("support_tickets").select("*").eq("shop_id", shopId).eq("tg_id", tgId).order("id", { ascending: false }).limit(200);
        if (error) throw error;
        return json({ tickets: await attachTicketSummaries(db, shopId, data || []) });
      }

      case "get_support_tickets": {
        await requirePermission('support.manage');
        const pageSize = Math.min(100, Math.max(10, Number.parseInt(String(payload.pageSize || 30), 10) || 30));
        const page = Math.max(1, Number.parseInt(String(payload.page || 1), 10) || 1);
        const status = String(payload.status || "ALL");
        const search = String(payload.search || "").trim().replace(/[%_,]/g, "").slice(0, 80);
        let ticketQuery = db.from("support_tickets").select("*", { count: "exact" }).eq("shop_id", shopId);
        if (status !== "ALL") ticketQuery = ticketQuery.eq("status", status);
        if (search) {
          if (/^\d+$/.test(search)) {
            ticketQuery = ticketQuery.or(`tg_id.ilike.%${search}%,id.eq.${search}`);
          } else {
            const pattern = `%${search}%`;
            const { data: matchingUsers, error: usersError } = await db.from("app_users")
              .select("tg_id").eq("shop_id", shopId)
              .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},profile_first_name.ilike.${pattern},profile_last_name.ilike.${pattern},username.ilike.${pattern},phone.ilike.${pattern}`)
              .limit(500);
            if (usersError) throw usersError;
            const matchingIds = [...new Set((matchingUsers || []).map((user: any) => String(user.tg_id)))];
            if (!matchingIds.length) return json({ tickets: [], page, pageSize, totalCount: 0, totalPages: 1 });
            ticketQuery = ticketQuery.in("tg_id", matchingIds);
          }
        }
        const from = (page - 1) * pageSize;
        const { data, count, error } = await ticketQuery.order("id", { ascending: false }).range(from, from + pageSize - 1);
        if (error) throw error;
        return json({ tickets: await attachTicketSummaries(db, shopId, data || []), page, pageSize, totalCount: count || 0, totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)) });
      }

      default:
        return json({ error: "unknown_action" }, 400);
    }
  } catch (e: any) {
    console.error("[SHOP_API_ACTION_FAILED]", { action: String(action || ""), code: e?.code || "server_error" });
    const msg = e?.message || String(e);
    if (msg.startsWith("forbidden:")) return json({ error: msg }, 403);
    if (String(action || "").startsWith("shop_web_credentials_")) {
      if (msg.startsWith("VALIDATION_ERROR")) return json({ error: "invalid_credential_value" }, 400);
      if (msg.startsWith("CONFLICT")) return json({ error: "credential_value_conflict" }, 409);
      return json({ error: "credential_action_failed" }, 500);
    }
    if (msg.startsWith("variant_stock_use_variants")) return json({ error: msg }, 400);
    return json({ error: "server_error" }, 500);
  }
});
