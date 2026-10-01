// USTORE — Payme Merchant API helpers (developer.help.paycom.uz, fetched
// live — this handles real money). Unlike Click.uz's Shop API, Payme does
// NOT sign each request body — authentication is a per-request HTTP Basic
// Auth header (Authorization: Basic base64(login:password)) that Payme
// sends TO our webhook, using the login/password issued when the merchant
// adds a web-kassa. There is also no outbound "create invoice" call: the
// checkout link is a pure client-side base64 URL construction (Payme's own
// "Отправка чека по методу GET" contract) — no network round-trip needed to
// start a payment, only to receive Payme's later JSON-RPC callbacks.

// ---- JSON-RPC response envelope -------------------------------------------

export function paymeResult(result: Record<string, unknown>, id: number | string | null) {
  return { result, id };
}
export function paymeError(code: number, message: { uz: string; ru: string; en: string }, data: unknown, id: number | string | null) {
  return { error: { code, message, data: data ?? null }, id };
}

// General (protocol-level) errors, per "Общие ошибки".
export const PAYME_ERROR = {
  METHOD_NOT_POST: -32300,
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INSUFFICIENT_PRIVILEGE: -32504,
  SYSTEM_ERROR: -32400,
  TRANSACTION_NOT_FOUND: -31003,
  CANNOT_PERFORM: -31008,
  INVALID_AMOUNT: -31001,
  ORDER_ALREADY_DONE: -31007,
  ACCOUNT_ERROR: -31050,
} as const;

// ---- Basic Auth verification (Payme -> our webhook) ------------------------

export function verifyPaymeBasicAuth(authHeader: string | null, login: string, password: string): boolean {
  if (!authHeader || !authHeader.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = atob(authHeader.slice(6).trim());
  } catch {
    return false;
  }
  const sep = decoded.indexOf(":");
  if (sep < 0) return false;
  return decoded.slice(0, sep) === login && decoded.slice(sep + 1) === password;
}

// ---- Checkout link (GET method, "Отправка чека по методу GET") -------------
// Format: https://checkout.paycom.uz/base64("m=<id>;ac.<field>=<value>;a=<tiyin>;c=<return_url>;l=<lang>")
export function buildPaymeCheckoutUrl(params: { merchantId: string; orderAccountField: string; orderId: string | number; amountTiyin: number; returnUrl?: string; lang?: "uz" | "ru" | "en" }): string {
  const parts = [
    `m=${params.merchantId}`,
    `ac.${params.orderAccountField}=${params.orderId}`,
    `a=${Math.round(params.amountTiyin)}`,
  ];
  if (params.returnUrl) parts.push(`c=${params.returnUrl}`);
  if (params.lang) parts.push(`l=${params.lang}`);
  const encoded = btoa(parts.join(";"));
  return `https://checkout.paycom.uz/${encoded}`;
}
