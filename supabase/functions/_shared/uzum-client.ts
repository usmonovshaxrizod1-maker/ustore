// USTORE — Uzum Checkout API helpers (developer.uzumbank.uz/en/checkout/,
// fetched live — this handles real money). This is the HOSTED PAYMENT FORM
// product ("Uzum Checkout"), not the separate "Merchant API" (which makes
// the customer search for us inside the Uzum app and type an order number
// by hand — a worse UX for our use case). Auth is a pair of static headers
// (X-Terminal-Id + X-API-Key) issued by Uzum when the merchant terminal is
// provisioned — no request signing, unlike Click/Payme.
//
// ⚠️ UNVERIFIED: the exact production base URL for Uzum Checkout was not
// visible anywhere in the rendered docs (no "Servers" section text, no
// separate openapi.json network request — the spec is bundled into a JS
// chunk Redoc renders client-side, which I could not extract via browser
// automation). `UZUM_CHECKOUT_BASE_URL` below is a plausible placeholder
// following Uzum's own domain pattern (merchants.uzumbank.uz,
// developer.uzumbank.uz) — CONFIRM THE REAL VALUE with your Uzum Bank
// account manager during onboarding before enabling this in production
// (uzum_connect can take it as an optional override field if it differs).
const UZUM_CHECKOUT_BASE_URL = "https://checkout.uzumbank.uz";

export interface UzumCredentials {
  terminalId: string;
  apiKey: string;
  baseUrl?: string;
}

export class UzumApiError extends Error {
  errorCode: number;
  constructor(message: string, errorCode: number) { super(message); this.errorCode = errorCode; }
}

function uzumHeaders(creds: UzumCredentials, extra: Record<string, string> = {}) {
  return {
    "Content-Type": "application/json",
    "X-Terminal-Id": creds.terminalId,
    "X-API-Key": creds.apiKey,
    ...extra,
  };
}

// POST /api/v1/payment/register — registers a one-step card payment and
// returns a hosted payment-form URL to redirect the customer to. `cart` is
// deliberately omitted (matches Click's skip_ofd / Payme's no-detail-object
// approach): auto-fiscalization is opt-in and configured with the Uzum
// account manager, off by default, so omitting `cart` keeps this the
// simple "without auto-fiscalization" flow documented for payType=ONE_STEP.
//
// ⚠️ UNVERIFIED result shape: the docs UI showed the response envelope as
// {errorCode, message, result:{}} without expanding `result`'s fields (the
// schema viewer left it collapsed). The flow description says Uzum "sends
// you a unique order ID (orderId) and a payment page URL" — this function
// reads result.orderId and tries a short list of plausible URL field names
// (paymentUrl / formUrl / redirectUrl / url) and throws a clear error
// naming the actual keys received if none match, so a real sandbox test
// call will surface the true field name immediately instead of failing
// silently.
export async function uzumRegisterPayment(creds: UzumCredentials, params: {
  amountTiyin: number; clientId: string; orderNumber: string;
  successUrl?: string; failureUrl?: string; lang: "ru-RU" | "uz-UZ" | "en-EN";
}): Promise<{ orderId: string; paymentUrl: string }> {
  const base = creds.baseUrl || UZUM_CHECKOUT_BASE_URL;
  const res = await fetch(`${base}/api/v1/payment/register`, {
    method: "POST",
    headers: uzumHeaders(creds, { "Content-Language": params.lang }),
    body: JSON.stringify({
      amount: Math.round(params.amountTiyin),
      clientId: params.clientId,
      currency: 860,
      orderNumber: params.orderNumber,
      successUrl: params.successUrl,
      failureUrl: params.failureUrl,
      viewType: "REDIRECT",
      paymentParams: {},
      payType: "ONE_STEP",
      sessionTimeoutSecs: 1800,
    }),
  });
  const data = await res.json().catch(() => ({} as any));
  if (!res.ok || Number(data?.errorCode) !== 0) {
    throw new UzumApiError(data?.message || `uzum_register_http_${res.status}`, Number(data?.errorCode ?? -1));
  }
  const result = data?.result || {};
  const orderId = result.orderId || result.order_id;
  const paymentUrl = result.paymentUrl || result.formUrl || result.redirectUrl || result.url || result.paymentFormUrl;
  if (!orderId || !paymentUrl) {
    throw new UzumApiError(`uzum_register_unexpected_response_shape:${Object.keys(result).join(",")}`, -1);
  }
  return { orderId: String(orderId), paymentUrl: String(paymentUrl) };
}

// A lightweight credential check (used by uzum_connect before saving) —
// calls getOrderStatus with a random UUID; ANY structured JSON response
// (even a "not found" errorCode) proves the headers were accepted, while an
// auth failure (1xxx per the documented error table) proves they were not.
export async function uzumVerifyCredentials(creds: UzumCredentials): Promise<boolean> {
  const base = creds.baseUrl || UZUM_CHECKOUT_BASE_URL;
  try {
    const res = await fetch(`${base}/api/v1/payment/getOrderStatus`, {
      method: "POST",
      headers: uzumHeaders(creds),
      body: JSON.stringify({ orderId: "00000000-0000-0000-0000-000000000000" }),
    });
    const data = await res.json().catch(() => ({} as any));
    const code = Number(data?.errorCode);
    return code !== 1001 && code !== 1006;
  } catch {
    return false;
  }
}
