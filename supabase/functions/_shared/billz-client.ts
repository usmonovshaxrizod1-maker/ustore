// USTORE — Billz (billz.ai) POS/ERP HTTP client. Phase 0/1: auth + token
// lifecycle + the read-only lookup endpoints needed to populate the
// connection settings UI (Billz shop/cashbox/payment-type pickers). Later
// phases (catalog sync, order push) extend this same module rather than
// duplicating the auth/refresh logic.
//
// Modeled on _shared/telegram.ts's thin telegramApi() wrapper — small
// single-purpose functions, no framework. Token encryption reuses
// _shared/bot-token-crypto.ts as-is (those functions are already generic
// over any plaintext string, not bot-token specific despite the name) —
// no new crypto code here.
//
// NOTE on response shapes: Billz's own docs show a `{code,message,error,
// data}` envelope for the auth endpoints specifically (and for error
// responses generally), but plain resource bodies (e.g. `{"shops":[...]}`)
// for most GET list endpoints — confirmed for /v2/products and
// /v2/product-type, but the docs did not show a worked example response
// body for /v1/shop, /v1/cash-box or /v1/company-payment-type specifically
// (only the request). extractList() below tries several plausible key
// names for exactly that reason — verify against a real account once
// connected, and adjust the key list here if the real key differs.

import { encryptBotToken, decryptBotToken } from "./bot-token-crypto.ts";

const BILLZ_BASE_URL = "https://api-admin.billz.ai";
// Static per Billz's own docs (their auth/refresh example) — not
// shop-specific, not a secret.
const BILLZ_PLATFORM_ID = "7d4a4c38-dd84-4902-b744-0488b80a4c01";

export class BillzApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function extractList(data: any, ...keys: string[]): any[] {
  for (const k of keys) {
    const v = data?.[k] ?? data?.data?.[k];
    if (Array.isArray(v)) return v;
  }
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

async function billzFetch(path: string, init: (RequestInit & { accessToken?: string }) = {}) {
  const headers: Record<string, string> = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.accessToken) headers["Authorization"] = `Bearer ${init.accessToken}`;
  const res = await fetch(`${BILLZ_BASE_URL}${path}`, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message || data?.error || data?.message || `billz_http_${res.status}`;
    throw new BillzApiError(String(message).slice(0, 300), res.status);
  }
  // Asynchronous BILLZ methods can answer with HTTP 200 while the envelope's
  // status_code carries the actual processing error. Never treat that as a
  // successful product add/update.
  const envelopeStatus = Number(data?.status_code);
  if (Number.isFinite(envelopeStatus) && envelopeStatus >= 400) {
    const message = data?.error?.message || data?.error?.code || data?.error || data?.message || `billz_status_${envelopeStatus}`;
    throw new BillzApiError(String(message).slice(0, 300), envelopeStatus);
  }
  return data;
}

export async function billzLogin(secretToken: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const data = await billzFetch("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ secret_token: secretToken }),
  });
  const d = data?.data;
  if (!d?.access_token || !d?.refresh_token) throw new BillzApiError("billz_login_bad_response", 502);
  return { accessToken: d.access_token, refreshToken: d.refresh_token, expiresIn: Number(d.expires_in) || 86400 };
}

export async function billzRefresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const data = await billzFetch("/v2/auth/refresh", {
    method: "POST",
    headers: { "platform-id": BILLZ_PLATFORM_ID },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const d = data?.data;
  if (!d?.access_token || !d?.refresh_token) throw new BillzApiError("billz_refresh_bad_response", 502);
  return { accessToken: d.access_token, refreshToken: d.refresh_token, expiresIn: Number(d.expires_in) || 1209600 };
}

// Encrypts a freshly-issued access+refresh pair, ready to spread into a
// billz_connections update. Doesn't touch the DB itself (DB-client-agnostic,
// same convention as bot-token-crypto.ts's own functions).
export async function encryptTokenPair(masterKey: string, accessToken: string, refreshToken: string) {
  const [access, refresh] = await Promise.all([
    encryptBotToken(masterKey, accessToken),
    encryptBotToken(masterKey, refreshToken),
  ]);
  return {
    access_token_ciphertext: access.ciphertext, access_token_iv: access.iv,
    refresh_token_ciphertext: refresh.ciphertext, refresh_token_iv: refresh.iv,
  };
}

// Resolves a valid, ready-to-use Billz access token for a shop: decrypts
// the stored one if it still has >1 day of life left, otherwise refreshes
// it (or, if refresh itself fails, falls back to a full secret_token
// re-login) — persisting whatever gets renewed back onto billz_connections.
// Throws BillzApiError if the shop has no connection or everything fails;
// callers should catch and surface billz_connections.status/last_error
// (already set here on the failure path) rather than leak this upward as
// a generic 500.
export async function getValidBillzAccessToken(db: any, shopId: string, masterKey: string): Promise<string> {
  const { data: row, error } = await db.from("billz_connections")
    .select("secret_token_ciphertext,secret_token_iv,access_token_ciphertext,access_token_iv,refresh_token_ciphertext,refresh_token_iv,access_token_expires_at,status")
    .eq("shop_id", shopId).maybeSingle();
  if (error) throw error;
  if (!row || !row.secret_token_ciphertext) throw new BillzApiError("billz_not_connected", 400);

  const expiresAtMs = row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() : 0;
  const stillFresh = expiresAtMs && (expiresAtMs - Date.now() > 24 * 3600 * 1000);

  if (stillFresh && row.access_token_ciphertext) {
    try {
      return await decryptBotToken(masterKey, row.access_token_ciphertext, row.access_token_iv);
    } catch (e) {
      console.error("[BILLZ_FAILED:ACCESS_TOKEN_DECRYPT]", { shopId, code: (e as any)?.code || "decrypt_failed" });
      // fall through — try refresh/re-login below instead of failing outright
    }
  }

  const persist = async (tokens: { accessToken: string; refreshToken: string; expiresIn: number }) => {
    const enc = await encryptTokenPair(masterKey, tokens.accessToken, tokens.refreshToken);
    const expiresAtIso = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();
    const { error: updErr } = await db.from("billz_connections").update({
      ...enc, access_token_expires_at: expiresAtIso, status: "CONNECTED", last_error: null,
    }).eq("shop_id", shopId);
    if (updErr) throw updErr;
    return tokens.accessToken;
  };

  if (row.refresh_token_ciphertext) {
    try {
      const refreshToken = await decryptBotToken(masterKey, row.refresh_token_ciphertext, row.refresh_token_iv);
      const tokens = await billzRefresh(refreshToken);
      return await persist(tokens);
    } catch (e) {
      console.error("[BILLZ_FAILED:REFRESH_ERROR]", { shopId, code: (e as any)?.code || "refresh_failed" });
      // fall through — try a full re-login with the secret_token below
    }
  }

  try {
    const secretToken = await decryptBotToken(masterKey, row.secret_token_ciphertext, row.secret_token_iv);
    const tokens = await billzLogin(secretToken);
    return await persist(tokens);
  } catch (e) {
    const code = (e as any)?.code || "billz_reauth_failed";
    console.error("[BILLZ_FAILED:REAUTH_ERROR]", { shopId, code });
    await db.from("billz_connections").update({ status: "ERROR", last_error: String(code).slice(0, 120) }).eq("shop_id", shopId);
    throw e;
  }
}

export async function billzListShops(accessToken: string): Promise<{ id: string; name: string }[]> {
  const data = await billzFetch("/v1/shop?limit=100&only_allowed=true", { accessToken });
  return extractList(data, "shops").map((s: any) => ({ id: String(s.id), name: String(s.name || s.id) }));
}

export async function billzListCashboxes(accessToken: string): Promise<{ id: string; name: string }[]> {
  const data = await billzFetch("/v1/cash-box?limit=100", { accessToken });
  return extractList(data, "cash_boxes", "cashboxes", "cash_box").map((c: any) => ({ id: String(c.id), name: String(c.name || c.id) }));
}

export async function billzListPaymentTypes(accessToken: string): Promise<{ id: string; name: string }[]> {
  const data = await billzFetch("/v1/company-payment-type?limit=1000", { accessToken });
  return extractList(data, "company_payment_types", "payment_types").map((p: any) => ({ id: String(p.id), name: String(p.name || p.id) }));
}

export async function billzListCategories(accessToken: string): Promise<{ id: string; name: string; parentId: string | null }[]> {
  const data = await billzFetch("/v2/category?limit=1000&page=1&search=&is_deleted=false", { accessToken });
  return extractList(data, "categories").map((c: any) => ({
    id: String(c.id), name: String(c.name || c.id), parentId: c.parent_id ? String(c.parent_id) : null,
  }));
}

// Phase 2: catalog browsing for manual import. `group_variations:true`
// nests each variant (own id, own stock/price) under its parent's
// `variations` array — confirmed by Billz's own "Фильтрация продуктов" docs.
//
// 12-band (fix, re-verified against the LIVE docs page, not memory):
// category filtering is NOT a query-string param on GET /v2/products at
// all — that was the actual bug (Billz silently ignored/ never supported
// `category_ids` there, so a category-filtered browse always came back
// unfiltered/empty depending on what else was in the query). The real,
// documented category filter lives on a COMPLETELY DIFFERENT endpoint:
// POST /v2/product-search-with-filters, with category_ids as a JSON array
// in the body (see the exact curl example on the "Фильтрация продуктов"
// page). That endpoint's documented filters (shop/category/sku/brand/
// supplier/attribute ids, price ranges) do NOT include a free-text name
// search parameter — so when a search term is present, this still goes
// through the original, PROVEN-WORKING GET /v2/products?search=... path,
// completely untouched (the working search feature must never be touched).
export async function billzListProducts(accessToken: string, opts: {
  categoryIds?: string[]; search?: string; page?: number; limit?: number;
} = {}): Promise<{ count: number; products: any[] }> {
  if (opts.categoryIds?.length && !opts.search) {
    const data = await billzFetch("/v2/product-search-with-filters", {
      method: "POST",
      accessToken,
      body: JSON.stringify({
        category_ids: opts.categoryIds,
        status: "all",
        group_variations: true,
        statistics: true,
        limit: opts.limit || 30,
        page: opts.page || 1,
      }),
    });
    return { count: Number(data?.count) || 0, products: extractList(data, "products") };
  }
  const params = new URLSearchParams();
  params.set("page", String(opts.page || 1));
  params.set("limit", String(opts.limit || 30));
  params.set("group_variations", "true");
  if (opts.search) params.set("search", opts.search);
  const data = await billzFetch(`/v2/products?${params.toString()}`, { accessToken });
  return { count: Number(data?.count) || 0, products: extractList(data, "products") };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Root-cause fix for the "browse" count/pagination mismatch: billzListProducts's
// own `count` is Billz's raw total for the category/search filter — it includes
// products ALREADY imported into UStorE. The browse UI needs the count/paging
// of the NOT-YET-imported subset instead, and Billz has no "exclude these ids"
// filter — so the only correct way to get an accurate not-yet-imported total
// (and a correctly-filled page, even when whole raw pages turn out to be
// already-imported) is to walk every matching raw page ourselves and let the
// caller filter+slice the concatenated result. Bounded by a safety cap (same
// spirit as the frontend's old 200-page "ALL" cap) so one admin click can never
// hang on an unexpectedly huge catalog.
export async function billzListAllMatching(accessToken: string, opts: {
  categoryIds?: string[]; search?: string;
}, maxPages = 50): Promise<{ products: any[]; truncated: boolean }> {
  const limit = 100;
  let page = 1;
  let all: any[] = [];
  let truncated = false;
  for (;;) {
    const { count, products } = await billzListProducts(accessToken, { ...opts, page, limit });
    all = all.concat(products);
    if (!products.length || page * limit >= count) break;
    if (page >= maxPages) { truncated = true; break; }
    page++;
    await sleep(550);
  }
  return { products: all, truncated };
}

// Phase 4: full paginated crawl of every product (and every variant child)
// in the given Billz shop, used by billz-sync to (a) refresh stock/name/
// description/price for already-linked UStorE products/variants and
// (b) detect ones no longer present at all (deleted in Billz) — a linked
// billz_product_id missing from this map is exactly the deletion signal.
// 550ms between page requests keeps this comfortably under Billz's
// documented 2 req/sec cap even for a large catalog, since the crawl runs
// unattended in the background (a cron tick, not a human waiting on a
// click).
//
// name/description/price are always the PARENT product's values, even for
// a variant's own map entry — UStorE stores one shared name/description/
// price per product row (not per variant), same decision Phase 2's import
// already made for price. Billz is the confirmed source of truth for these
// fields once linked (see billz_apply_sync, 015_billz_field_sync.sql):
// editing them directly in UStorE after import gets overwritten by the next
// sync, by product decision.
export async function billzCrawlProductMap(accessToken: string, billzShopId: string | null): Promise<Map<string, { stock: number; name: string; description: string | null; price: number }>> {
  const map = new Map<string, { stock: number; name: string; description: string | null; price: number }>();
  const pickStock = (list: any[]): number => {
    const row = (Array.isArray(list) ? list : []).find((x: any) => !billzShopId || String(x.shop_id) === billzShopId) || list?.[0];
    return Math.max(0, Math.round(Number(row?.active_measurement_value) || 0));
  };
  const pickPrice = (list: any[]): number => {
    const row = (Array.isArray(list) ? list : []).find((x: any) => !billzShopId || String(x.shop_id) === billzShopId) || list?.[0];
    return Number(row?.retail_price) || 0;
  };
  const limit = 100;
  let page = 1;
  for (;;) {
    const { count, products } = await billzListProducts(accessToken, { page, limit });
    for (const p of products) {
      const parentFields = { name: String(p.name || ""), description: p.description ? String(p.description) : null, price: pickPrice(p.shop_prices) };
      map.set(String(p.id), { ...parentFields, stock: pickStock(p.shop_measurement_values) });
      for (const v of (Array.isArray(p.variations) ? p.variations : [])) {
        const variantPrice = pickPrice(v.shop_prices) || Number(v.retail_price) || parentFields.price;
        map.set(String(v.id), { ...parentFields, price: variantPrice, stock: pickStock(v.shop_measurement_values) });
      }
    }
    if (!products.length || page * limit >= count) break;
    page++;
    await sleep(550);
  }
  return map;
}

// Phase 5: push one completed UStorE order into Billz as a real sale, so
// Billz's own stock decreases too — the OTHER direction of the bidirectional
// sync (billz_apply_sync/billz-sync handles Billz -> UStorE; this is
// UStorE -> Billz). Modeled exactly on Billz's own "Продажа" flow
// (draft -> add each product -> pay): create a draft order in the shop's
// configured Billz shop/cashbox, add every Billz-linked item one at a time,
// then pay it with the shop's configured payment type. If even one item
// fails, the draft is deliberately left unpaid: a partial BILLZ sale would
// corrupt stock reconciliation. `skip_ofd: true` means no fiscal
// cheque is requested — per the product decision, Billz only needs to know
// something sold, a real cheque was explicitly ruled unnecessary.
//
// Re-verified against the current official BILLZ 2.0 docs: seller_ids is
// optional; the minimal add-product body is product_id plus
// sold_measurement_value. The documented recalculate endpoint is called
// after all additions so payment always uses BILLZ's own final total.
export async function billzCreateSale(accessToken: string, opts: {
  billzShopId: string; billzCashboxId: string; billzPaymentTypeId: string; billzPaymentTypeName?: string | null;
  items: { billzProductId: string; qty: number }[]; comment?: string;
}): Promise<{ orderId: string; itemsAdded: number; itemsFailed: number }> {
  const createRes = await billzFetch(`/v2/order?Billz-Response-Channel=HTTP`, {
    method: "POST",
    headers: { "platform-id": BILLZ_PLATFORM_ID },
    accessToken,
    body: JSON.stringify({ shop_id: opts.billzShopId, cashbox_id: opts.billzCashboxId }),
  });
  const orderId = createRes?.data?.id ? String(createRes.data.id) : "";
  if (!orderId) throw new BillzApiError("billz_sale_create_bad_response", 502);

  let itemsAdded = 0, itemsFailed = 0;
  for (const item of opts.items) {
    try {
      await billzFetch(`/v2/order-product/${orderId}?Billz-Response-Channel=HTTP`, {
        method: "POST",
        accessToken,
        body: JSON.stringify({
          sold_measurement_value: item.qty, product_id: item.billzProductId,
          used_wholesale_price: false, is_manual: false, response_type: "HTTP",
        }),
      });
      itemsAdded++;
    } catch (e) {
      itemsFailed++;
      console.error("[BILLZ_SALE_FAILED:ADD_ITEM]", { orderId, billzProductId: item.billzProductId, code: (e as any)?.code || "add_item_failed" });
    }
  }
  if (itemsAdded === 0) throw new BillzApiError("billz_sale_no_items_added", 502);
  // A partially recorded sale would make BILLZ stock and the UStorE order
  // disagree. Leave the BILLZ draft unpaid and retry/reconcile instead of
  // closing a sale that silently omitted products.
  if (itemsFailed > 0) throw new BillzApiError("billz_sale_items_incomplete", 502);

  const recalculated = await billzFetch(`/v1/recalculate-order-bill/${orderId}`, {
    method: "POST",
    headers: { "platform-id": BILLZ_PLATFORM_ID },
    accessToken,
  });
  const finalTotal = Number(recalculated?.total_price);
  if (!Number.isFinite(finalTotal) || finalTotal < 0) throw new BillzApiError("billz_sale_total_missing", 502);

  await billzFetch(`/v2/order-payment/${orderId}?Billz-Response-Channel=HTTP`, {
    method: "POST",
    accessToken,
    body: JSON.stringify({
      payments: [{
        company_payment_type_id: opts.billzPaymentTypeId, paid_amount: finalTotal,
        company_payment_type: { name: opts.billzPaymentTypeName || "" }, returned_amount: 0,
      }],
      comment: opts.comment || "", with_cashback: 0, without_cashback: false, skip_ofd: true,
    }),
  });

  return { orderId, itemsAdded, itemsFailed };
}
