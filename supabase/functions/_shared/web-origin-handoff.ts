import { resolveActiveDomainRoute } from "./shop-domains.ts";
import { canonicalHttpOrigin, isSafeReturnPath } from "./web-telegram-auth.ts";

const HANDOFF_TTL_MS = 5 * 60 * 1000;
const AUTH_CODE_TTL_MS = 60 * 1000;
const encoder = new TextEncoder();

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateSessionToken(): string {
  return `us1_${randomToken(32)}`;
}

function randomToken(bytes = 32): string {
  const out = new Uint8Array(bytes);
  crypto.getRandomValues(out);
  let binary = "";
  for (const value of out) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function pkceChallenge(verifier: string): Promise<string> {
  if (!isValidPkceVerifier(verifier)) throw new Error("VALIDATION_ERROR:pkce_verifier");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function isValidPkceVerifier(value: unknown): boolean {
  return typeof value === "string" && value.length >= 43 && value.length <= 128 && /^[A-Za-z0-9._~-]+$/.test(value);
}

export function isValidPkceChallenge(value: unknown): boolean {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function canonicalHttpsOrigin(value: unknown): string | null {
  const origin = canonicalHttpOrigin(value);
  if (!origin) return null;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "https:" ? parsed.origin : null;
  } catch (_) {
    return null;
  }
}

export async function resolveActiveReturnOrigin(db: any, originRaw: unknown) {
  const origin = canonicalHttpsOrigin(originRaw);
  if (!origin) return null;
  const parsed = new URL(origin);
  const route = await resolveActiveDomainRoute(db, parsed.hostname);
  if (!route) return null;
  if (origin !== `https://${String(route.hostname).toLowerCase()}`) return null;
  return { origin, route };
}

export async function resolveDefaultSubdomainOrigin(db: any, shopId: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(String(shopId || ""))) return null;
  const { data, error } = await db.from("shop_domains")
    .select("hostname,shops!inner(status)").eq("shops.status", "ACTIVE")
    .eq("shop_id", shopId).eq("kind", "SUBDOMAIN").eq("status", "ACTIVE").eq("routing_ready", true).maybeSingle();
  if (error) throw error;
  const hostname = String(data?.hostname || "").toLowerCase();
  return hostname ? `https://${hostname}` : null;
}

function fallbackUrl(origin: string | null, returnTo: string): string | null {
  if (!origin || !isSafeReturnPath(returnTo)) return null;
  return new URL(returnTo, `${origin}/`).toString();
}

function centralAuthorizeUrl(baseRaw: string, state: string): string {
  const origin = canonicalHttpsOrigin(baseRaw);
  if (!origin) throw new Error("CAPABILITY_UNAVAILABLE:central_auth_origin");
  const url = new URL("/auth/handoff", origin);
  url.searchParams.set("state", state);
  return url.toString();
}

function callbackUrl(targetOrigin: string, state: string, code: string): string {
  const url = new URL("/auth/callback", targetOrigin);
  url.searchParams.set("state", state);
  url.searchParams.set("code", code);
  return url.toString();
}

export async function beginOriginAuthHandoff(db: any, input: {
  origin: string;
  returnTo: string;
  codeChallenge: string;
  centralAuthBaseUrl: string;
}) {
  if (!isSafeReturnPath(input.returnTo) || !isValidPkceChallenge(input.codeChallenge)) {
    throw new Error("VALIDATION_ERROR:origin_handoff");
  }
  const target = await resolveActiveReturnOrigin(db, input.origin);
  if (!target) throw new Error("DOMAIN_NOT_VERIFIED:return_origin");
  const state = randomToken(32);
  const authorizeUrl = centralAuthorizeUrl(input.centralAuthBaseUrl, state);
  const stateHash = await sha256Hex(state);
  const expiresAt = new Date(Date.now() + HANDOFF_TTL_MS).toISOString();
  const { error } = await db.from("web_origin_auth_handoffs").insert({
    state_hash: stateHash,
    target_origin: target.origin,
    target_hostname: String(target.route.hostname),
    target_shop_id: String(target.route.shop_id),
    target_domain_id: String(target.route.id),
    return_path: input.returnTo,
    code_challenge: input.codeChallenge,
    expires_at: expiresAt,
  });
  if (error) throw error;
  const fallbackOrigin = await resolveDefaultSubdomainOrigin(db, String(target.route.shop_id));
  return {
    state,
    authorizeUrl,
    expiresAt,
    targetOrigin: target.origin,
    fallbackOrigin,
  };
}

export async function getOriginAuthHandoff(db: any, state: string) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(state)) throw new Error("VALIDATION_ERROR:handoff_state");
  const stateHash = await sha256Hex(state);
  const { data: row, error } = await db.from("web_origin_auth_handoffs")
    .select("target_origin,target_hostname,target_shop_id,target_domain_id,return_path,expires_at,authorized_at,consumed_at,cancelled_at")
    .eq("state_hash", stateHash).maybeSingle();
  if (error) throw error;
  if (!row) return { status: "NOT_FOUND" as const };
  const fallbackOrigin = await resolveDefaultSubdomainOrigin(db, String(row.target_shop_id));
  const fallback = fallbackUrl(fallbackOrigin, String(row.return_path || "/"));
  if (row.consumed_at) return { status: "CONSUMED" as const };
  if (row.cancelled_at) return { status: "CANCELLED" as const, fallbackOrigin, fallbackUrl: fallback, returnTo: String(row.return_path || "/") };
  if (new Date(row.expires_at).getTime() <= Date.now()) return { status: "EXPIRED" as const, fallbackOrigin, fallbackUrl: fallback, returnTo: String(row.return_path || "/") };
  const target = await resolveActiveReturnOrigin(db, row.target_origin);
  if (!target || String(target.route.id) !== String(row.target_domain_id) || String(target.route.shop_id) !== String(row.target_shop_id)) {
    await db.from("web_origin_auth_handoffs").update({ cancelled_at: new Date().toISOString() }).eq("state_hash", stateHash).is("consumed_at", null).is("cancelled_at", null);
    return { status: "DOMAIN_UNAVAILABLE" as const, fallbackOrigin, fallbackUrl: fallback, returnTo: String(row.return_path || "/") };
  }
  const [{ data: shop, error: shopError }, { data: bot, error: botError }] = await Promise.all([
    db.from("shop_settings").select("name").eq("shop_id", row.target_shop_id).maybeSingle(),
    db.from("shop_bots").select("bot_username").eq("shop_id", row.target_shop_id).eq("status", "ACTIVE").maybeSingle(),
  ]);
  if (shopError) throw shopError;
  if (botError) throw botError;
  return {
    status: row.authorized_at ? "AUTHORIZED" as const : "PENDING" as const,
    targetOrigin: String(row.target_origin),
    targetHostname: String(row.target_hostname),
    shopName: shop?.name ? String(shop.name).slice(0, 160) : null,
    botUsername: bot?.bot_username ? String(bot.bot_username).replace(/^@/, "").slice(0, 32) : null,
    returnTo: String(row.return_path),
    expiresAt: String(row.expires_at),
    fallbackOrigin,
    fallbackUrl: fallback,
  };
}

export async function authorizeOriginAuthHandoff(db: any, input: { state: string; accountId: string; sessionId: string }) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(input.state) || !/^[0-9a-f-]{36}$/i.test(input.accountId)) {
    throw new Error("VALIDATION_ERROR:origin_handoff_authorize");
  }
  const stateHash = await sha256Hex(input.state);
  const authorizationCode = randomToken(32);
  const authorizationCodeHash = await sha256Hex(authorizationCode);
  const authorizationExpiresAt = new Date(Date.now() + AUTH_CODE_TTL_MS).toISOString();
  const { data, error } = await db.rpc("ustore_authorize_origin_handoff", {
    p_state_hash: stateHash,
    p_account_id: input.accountId,
    p_session_id: input.sessionId,
    p_authorization_code_hash: authorizationCodeHash,
    p_authorization_expires_at: authorizationExpiresAt,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const result = String(row?.result || "INVALID");
  if (result !== "OK") return { ok: false as const, result };
  const targetOrigin = canonicalHttpsOrigin(row?.target_origin);
  if (!targetOrigin || !isSafeReturnPath(String(row?.return_path || ""))) return { ok: false as const, result: "INVALID_TARGET" };
  return {
    ok: true as const,
    redirectUrl: callbackUrl(targetOrigin, input.state, authorizationCode),
    expiresAt: authorizationExpiresAt,
    targetOrigin,
  };
}

export async function exchangeOriginAuthHandoff(db: any, input: {
  origin: string;
  state: string;
  authorizationCode: string;
  codeVerifier: string;
}) {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(input.state)
    || !/^[A-Za-z0-9_-]{40,60}$/.test(input.authorizationCode)
    || !isValidPkceVerifier(input.codeVerifier)) {
    throw new Error("VALIDATION_ERROR:origin_handoff_exchange");
  }
  const target = await resolveActiveReturnOrigin(db, input.origin);
  if (!target) return { ok: false as const, result: "DOMAIN_UNAVAILABLE" };
  const [stateHash, codeHash, challenge] = await Promise.all([
    sha256Hex(input.state),
    sha256Hex(input.authorizationCode),
    pkceChallenge(input.codeVerifier),
  ]);
  const sessionToken = generateSessionToken();
  const sessionTokenHash = await sha256Hex(sessionToken);
  const { data, error } = await db.rpc("ustore_exchange_origin_handoff", {
    p_state_hash: stateHash,
    p_authorization_code_hash: codeHash,
    p_code_challenge: challenge,
    p_origin: target.origin,
    p_session_token_hash: sessionTokenHash,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const result = String(row?.result || "INVALID");
  if (result !== "OK") return { ok: false as const, result };
  if (String(row.target_origin) !== target.origin || String(row.target_domain_id) !== String(target.route.id)
    || String(row.target_shop_id) !== String(target.route.shop_id) || !isSafeReturnPath(String(row.return_path || ""))) {
    return { ok: false as const, result: "ORIGIN_MISMATCH" };
  }
  return {
    ok: true as const,
    accountId: String(row.account_id),
    session: { id: String(row.session_id), token: sessionToken, expiresAt: String(row.session_expires_at) },
    returnTo: String(row.return_path),
    targetOrigin: String(row.target_origin),
    shopId: String(row.target_shop_id),
  };
}
