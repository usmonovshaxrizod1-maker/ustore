// USTORE — shared Telegram helpers (HMAC initData verification, webhook
// secret derivation, Bot API calls), used by both shop-api and platform-api.
// Each Edge Function calls these against its OWN bot token (shop-api against
// a decrypted per-shop token, platform-api against USTORE_PLATFORM_BOT_TOKEN)
// — there's no cross-function state here, just identical, security-relevant
// logic that has no reason to exist as two separate copies.

async function hmac(keyBytes: BufferSource, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
}
function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyTelegramInitData(initData: string, botToken: string, maxAgeSeconds = 86400): Promise<
  | { ok: true; tgId: string; firstName?: string; lastName?: string; username?: string }
  | { ok: false; reason: string }
> {
  try {
    if (!initData) return { ok: false, reason: "missing_init_data" };
    const params = new URLSearchParams(initData);
    if (new Set(params.keys()).size !== Array.from(params.keys()).length) return { ok: false, reason: "duplicate_fields" };
    const hash = params.get("hash");
    if (!hash) return { ok: false, reason: "missing_hash" };
    params.delete("hash");
    const dataCheckString = Array.from(params.keys()).sort().map((k) => `${k}=${params.get(k)}`).join("\n");
    const enc = new TextEncoder();
    const secretKeyBuf = await hmac(enc.encode("WebAppData"), botToken);
    const computedHex = toHex(await hmac(secretKeyBuf, dataCheckString));
    if (computedHex !== hash) return { ok: false, reason: "bad_signature" };
    const authDate = Number(params.get("auth_date") ?? "0");
    if (!Number.isSafeInteger(authDate) || authDate <= 0) return { ok: false, reason: "missing_auth_date" };
    if (authDate > Math.floor(Date.now() / 1000) + 60) return { ok: false, reason: "future_auth_date" };
    if (Math.floor(Date.now() / 1000) - authDate > maxAgeSeconds) return { ok: false, reason: "expired" };
    const userJson = params.get("user");
    if (!userJson) return { ok: false, reason: "missing_user" };
    const user = JSON.parse(userJson);
    if (!Number.isSafeInteger(user?.id) || user.id <= 0) return { ok: false, reason: "missing_user_id" };
    return { ok: true, tgId: String(user.id), firstName: user.first_name, lastName: user.last_name, username: user.username };
  } catch {
    return { ok: false, reason: "bad_init_data" };
  }
}

// Derives a per-bot webhook secret token from the bot's own token, so
// Telegram's x-telegram-bot-api-secret-token header can be verified without
// storing a second secret anywhere. "ustore:" prefix keeps this namespaced
// from any other use of the same token elsewhere.
export async function telegramWebhookSecret(botToken: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`ustore:${botToken}`));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 48);
}

export async function telegramApi(botToken: string, method: string, payload: any) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) throw new Error(data?.description || `telegram_${method}_failed`);
  return data;
}
