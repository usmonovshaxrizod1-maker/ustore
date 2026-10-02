// USTORE — Click.uz Shop API sign verification. Click's sign_string is
// MD5-based (docs.click.uz/en/shop-api/requests) — Deno's Web Crypto
// (crypto.subtle) only supports the SHA family, not MD5, so a small,
// dependency-free RFC 1321 MD5 implementation lives here instead of an
// external esm.sh package (avoids a deploy-time network fetch for a
// security-critical primitive; this file is pure JS math, verified against
// the standard RFC 1321 test vectors in tests/ustore-click-payment.test.cjs).

function md5(input: string): string {
  function rotl(x: number, c: number): number { return (x << c) | (x >>> (32 - c)); }
  function toHex(word: number): string {
    let s = "";
    for (let i = 0; i < 4; i++) s += ((word >> (i * 8)) & 0xff).toString(16).padStart(2, "0");
    return s;
  }

  const K = new Int32Array(64);
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0;
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];

  const bytes = new TextEncoder().encode(input);
  const bitLen = bytes.length * 8;
  const padLen = (((bytes.length + 8) >> 6) + 1) << 6;
  const buf = new Uint8Array(padLen);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  // 64-bit little-endian bit-length, low 32 bits only matter for realistic payload sizes.
  view.setUint32(padLen - 8, bitLen >>> 0, true);
  view.setUint32(padLen - 4, Math.floor(bitLen / 2 ** 32), true);

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;

  for (let chunk = 0; chunk < padLen; chunk += 64) {
    const M = new Int32Array(16);
    for (let j = 0; j < 16; j++) M[j] = view.getInt32(chunk + j * 4, true);
    let [A, B, C, D] = [a0, b0, c0, d0];
    for (let i = 0; i < 64; i++) {
      let F = 0, g = 0;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) | 0;
      A = D; D = C; C = B;
      B = (B + rotl(F, S[i])) | 0;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }

  return toHex(a0) + toHex(b0) + toHex(c0) + toHex(d0);
}

export interface ClickPrepareFields {
  clickTransId: string | number;
  serviceId: string | number;
  merchantTransId: string;
  amount: string | number;
  action: string | number;
  signTime: string;
}
export interface ClickCompleteFields extends ClickPrepareFields {
  merchantPrepareId: string | number;
}

// Prepare: md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id + amount + action + sign_time)
export function computeClickPrepareSign(secretKey: string, f: ClickPrepareFields): string {
  return md5(`${f.clickTransId}${f.serviceId}${secretKey}${f.merchantTransId}${f.amount}${f.action}${f.signTime}`);
}
// Complete: md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id + merchant_prepare_id + amount + action + sign_time)
export function computeClickCompleteSign(secretKey: string, f: ClickCompleteFields): string {
  return md5(`${f.clickTransId}${f.serviceId}${secretKey}${f.merchantTransId}${f.merchantPrepareId}${f.amount}${f.action}${f.signTime}`);
}

// ----------------------------------------------------------------------------
// Merchant API — Invoice creation (docs.click.uz/en/merchant-api/requests,
// fetched live). This is a DIFFERENT API surface from the Shop API sign
// above: it's how UStorE INITIATES a payment (sends an SMS/push to the
// customer's Click app for them to approve), while the Shop API
// Prepare/Complete webhook is how Click later CONFIRMS it happened. Auth
// here is a per-request SHA-1 header, not a body sign_string — Web Crypto's
// crypto.subtle DOES support SHA-1 (unlike MD5), so no custom hash needed.
export class ClickApiError extends Error {
  errorCode: number;
  constructor(message: string, errorCode: number) { super(message); this.errorCode = errorCode; }
}

async function sha1Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function clickAuthHeader(merchantUserId: string, secretKey: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = await sha1Hex(`${timestamp}${secretKey}`);
  return `${merchantUserId}:${digest}:${timestamp}`;
}

export interface ClickCredentials {
  merchantUserId: string;
  secretKey: string;
  serviceId: string;
}

// phoneNumber: digits only (no leading "+"), e.g. "998901234567" — the
// customer approves the payment request inside their own Click app.
export async function clickCreateInvoice(creds: ClickCredentials, params: { amount: number; phoneNumber: string; merchantTransId: string }): Promise<number> {
  const auth = await clickAuthHeader(creds.merchantUserId, creds.secretKey);
  const res = await fetch("https://api.click.uz/v2/merchant/invoice/create", {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json", "Auth": auth },
    body: JSON.stringify({
      service_id: Number(creds.serviceId), amount: params.amount,
      phone_number: params.phoneNumber, merchant_trans_id: params.merchantTransId,
    }),
  });
  const data = await res.json().catch(() => ({} as any));
  if (!res.ok || data?.error_code !== 0) {
    throw new ClickApiError(data?.error_note || `click_invoice_http_${res.status}`, Number(data?.error_code ?? -1));
  }
  return Number(data.invoice_id);
}

export { md5 as _md5ForTests, sha1Hex as _sha1HexForTests };
