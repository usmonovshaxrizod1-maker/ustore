import { ensureTelegramAccount } from "./account-identity.ts";
import { canonicalHttpOrigin, isSafeReturnPath } from "./web-telegram-auth.ts";

const TTL = 5 * 60 * 1000;
const TOKEN_ENDPOINT = "https://oauth.telegram.org/token";
const KEYS_ENDPOINT = "https://oauth.telegram.org/.well-known/jwks.json";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,128}$/;
const PKCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const encoder = new TextEncoder();

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function hash(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(bytes, (v) => v.toString(16).padStart(2, "0")).join("");
}
async function pkce(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("VALIDATION_ERROR:token");
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}
function redirectUri(origin: string) {
  // Exact origin and callback path, never a user-supplied redirect URL.
  const preview = origin === "https://usmonovshaxrizod1-maker.github.io";
  return `${origin}${preview ? "/ustore/web/" : "/"}`;
}
function validateOrigin(origin: string) {
  if (canonicalHttpOrigin(origin) !== origin) throw new Error("VALIDATION_ERROR:origin");
}
function safeLoginDestination(path: string) {
  return isSafeReturnPath(path) && (path.startsWith("/platform/") || path.startsWith("/auth/origin/handoff?"));
}

export async function beginOfficialTelegramLogin(db: any, input: {
  origin: string; returnTo: string; codeChallenge: string; clientId: string;
}) {
  validateOrigin(input.origin);
  if (!safeLoginDestination(input.returnTo) ||
      !PKCE_PATTERN.test(input.codeChallenge) || !/^\d{5,20}$/.test(input.clientId)) {
    throw new Error("VALIDATION_ERROR:oidc_begin");
  }
  const state = randomToken();
  const browserVerifier = randomToken();
  const nonce = randomToken();
  const callback = redirectUri(input.origin);
  const expiresAt = new Date(Date.now() + TTL).toISOString();
  const { error } = await db.from("web_telegram_oidc_challenges").insert({
    state_hash: await hash(state), browser_verifier_hash: await hash(browserVerifier),
    code_challenge: input.codeChallenge, nonce_hash: await hash(nonce),
    return_origin: input.origin, return_path: input.returnTo,
    redirect_uri: callback, expires_at: expiresAt,
  });
  if (error) throw error;
  const url = new URL("https://oauth.telegram.org/auth");
  for (const [key, value] of Object.entries({
    client_id: input.clientId, redirect_uri: callback, response_type: "code",
    scope: "openid profile", state, nonce, code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  })) url.searchParams.set(key, value);
  return { state, browserVerifier, redirectUrl: url.href, expiresAt };
}

export async function verifyTelegramIdToken(token: string, clientId: string, expectedNonceHash: string,
  fetchImpl: typeof fetch = fetch) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || token.length > 8192) throw new Error("VALIDATION_ERROR:id_token");
  const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) throw new Error("VALIDATION_ERROR:algorithm");
  const keysResponse = await fetchImpl(KEYS_ENDPOINT, { headers: { accept: "application/json" } });
  if (!keysResponse.ok) throw new Error("CAPABILITY_UNAVAILABLE:telegram_keys");
  const jwks = await keysResponse.json();
  const keys = Array.isArray(jwks?.keys) ? jwks.keys : [];
  const jwk = keys.find((entry: any) => entry.kid === header.kid && entry.kty === "RSA" &&
    (!entry.alg || entry.alg === "RS256") && (!entry.use || entry.use === "sig"));
  if (!jwk) throw new Error("VALIDATION_ERROR:key");
  const publicKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey,
    decodeBase64Url(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`))) throw new Error("VALIDATION_ERROR:signature");
  const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== "https://oauth.telegram.org" || claims.aud !== clientId ||
      typeof claims.exp !== "number" || claims.exp <= now ||
      typeof claims.iat !== "number" || claims.iat > now + 60 || claims.iat < now - 86400 ||
      typeof claims.nonce !== "string" || await hash(claims.nonce) !== expectedNonceHash) {
    throw new Error("VALIDATION_ERROR:claims");
  }
  const id = String(claims.id || "");
  // OIDC sub can differ from the numeric Telegram account ID; profile scope
  // supplies `id`, which is the Mini App identity key.
  if (!/^\d{5,20}$/.test(id) || typeof claims.sub !== "string" || !claims.sub) throw new Error("VALIDATION_ERROR:user_id");
  return { telegramUserId: id, displayName: typeof claims.name === "string" ? claims.name.slice(0, 160) : null };
}

export async function exchangeOfficialTelegramLogin(db: any, input: {
  origin: string; state: string; browserVerifier: string; code: string;
  codeVerifier: string; clientId: string; clientSecret: string;
}, fetchImpl: typeof fetch = fetch) {
  validateOrigin(input.origin);
  if (!TOKEN_PATTERN.test(input.state) || !TOKEN_PATTERN.test(input.browserVerifier) ||
      !PKCE_PATTERN.test(input.codeVerifier) || !/^[\x21-\x7e]{1,2048}$/.test(input.code))
    throw new Error("VALIDATION_ERROR:oidc_callback");
  const stateHash = await hash(input.state);
  const verifierHash = await hash(input.browserVerifier);
  const codeChallenge = await pkce(input.codeVerifier);
  const { data: row, error } = await db.from("web_telegram_oidc_challenges")
    .select("return_origin,redirect_uri,code_challenge,nonce_hash,expires_at,consumed_at")
    .eq("state_hash", stateHash).eq("browser_verifier_hash", verifierHash).maybeSingle();
  if (error) throw error;
  if (!row || row.return_origin !== input.origin || row.redirect_uri !== redirectUri(input.origin) ||
      row.code_challenge !== codeChallenge) return { ok: false as const, result: "MISMATCH" };
  if (row.consumed_at || new Date(row.expires_at).getTime() <= Date.now()) return { ok: false as const, result: "EXPIRED" };
  const credentials = btoa(`${input.clientId}:${input.clientSecret}`);
  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST", headers: { authorization: `Basic ${credentials}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: input.code,
      redirect_uri: row.redirect_uri, client_id: input.clientId, code_verifier: input.codeVerifier }),
  });
  if (!response.ok) return { ok: false as const, result: "TOKEN_REJECTED" };
  const tokens = await response.json();
  const verified = await verifyTelegramIdToken(tokens.id_token, input.clientId, row.nonce_hash, fetchImpl);
  const accountId = await ensureTelegramAccount(db, verified.telegramUserId, verified.displayName);
  const sessionToken = `us1_${randomToken()}`;
  const { data, error: rpcError } = await db.rpc("ustore_finish_telegram_oidc", {
    p_state_hash: stateHash, p_browser_verifier_hash: verifierHash,
    p_code_challenge: codeChallenge, p_nonce_hash: row.nonce_hash,
    p_origin: input.origin, p_account_id: accountId,
    p_telegram_user_id: verified.telegramUserId, p_session_token_hash: await hash(sessionToken),
  });
  if (rpcError) throw rpcError;
  const finished = Array.isArray(data) ? data[0] : data;
  if (finished?.result !== "OK") return { ok: false as const, result: String(finished?.result || "INVALID") };
  if (!safeLoginDestination(String(finished.return_path)))
    return { ok: false as const, result: "MISMATCH" };
  return { ok: true as const, accountId: String(finished.account_id),
    session: { id: String(finished.session_id), token: sessionToken, expiresAt: String(finished.session_expires_at) },
    returnTo: finished.return_path };
}
