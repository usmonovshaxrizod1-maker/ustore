import { createClient } from "https://esm.sh/@supabase/supabase-js@2.116.0";
import { beginOfficialTelegramLogin, exchangeOfficialTelegramLogin } from "../_shared/telegram-oidc.ts";
import { authenticatePassword, changeLogin, changePassword, resolveSession, revokeAllSessions, revokeSession } from "../_shared/web-auth.ts";
import {
  beginTelegramWebChallenge,
  canonicalHttpOrigin,
  exchangeTelegramWebChallenge,
  getTelegramWebChallengeStatus,
  isAllowedOrigin,
  isSafeReturnPath,
  parseAllowedOrigins,
} from "../_shared/web-telegram-auth.ts";
import {
  authorizeOriginAuthHandoff,
  beginOriginAuthHandoff,
  canonicalHttpsOrigin,
  exchangeOriginAuthHandoff,
  getOriginAuthHandoff,
  resolveActiveReturnOrigin,
} from "../_shared/web-origin-handoff.ts";

const BASE_CORS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "600",
};

function allowedOrigins(): Set<string> {
  return parseAllowedOrigins([
    Deno.env.get("WEB_AUTH_ALLOWED_ORIGINS"),
    Deno.env.get("WEB_APP_BASE_URL"),
    Deno.env.get("PLATFORM_MINI_APP_URL"),
    Deno.env.get("WEB_AUTH_CENTRAL_URL"),
  ]);
}

function requestOrigin(req: Request): string | null {
  return canonicalHttpOrigin(req.headers.get("origin"));
}

function centralAuthBaseUrl(): string {
  return String(Deno.env.get("WEB_AUTH_CENTRAL_URL") || Deno.env.get("WEB_APP_BASE_URL") || "").trim();
}

function centralAuthOrigin(): string | null {
  return canonicalHttpsOrigin(centralAuthBaseUrl());
}

function officialTelegramOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (origin === "https://usmonovshaxrizod1-maker.github.io") return true;
  const central = centralAuthOrigin();
  if (!central) return false;
  const hostname = new URL(central).hostname.replace(/^www\./, "");
  return origin === `https://${hostname}` || origin === `https://www.${hostname}`;
}

function responseHeaders(corsOrigin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    ...BASE_CORS,
    "Content-Type": "application/json",
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "Pragma": "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
  if (corsOrigin) headers["Access-Control-Allow-Origin"] = corsOrigin;
  return headers;
}

function reply(corsOrigin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(corsOrigin) });
}

function bearer(req: Request): string {
  const raw = req.headers.get("authorization") || "";
  const match = raw.match(/^UStoreSession\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function challengeOrigin(req: Request): string | null {
  const origin = requestOrigin(req);
  return origin && isAllowedOrigin(origin, allowedOrigins()) ? origin : null;
}

async function corsOriginFor(db: any, req: Request, action = ""): Promise<string | null> {
  const origin = requestOrigin(req);
  if (!origin) return null;
  if (isAllowedOrigin(origin, allowedOrigins())) return origin;
  const activeDomainActions = new Set([
    "begin_origin_handoff", "exchange_origin_handoff",
    "get_session", "sign_out", "list_sessions", "revoke_session", "revoke_all_sessions",
    "change_login", "change_password",
  ]);
  if (activeDomainActions.has(action) || req.method === "OPTIONS") {
    const target = await resolveActiveReturnOrigin(db, origin).catch(() => null);
    if (target) return target.origin;
  }
  return null;
}

function originHandoffError(result: string) {
  if (result === "SESSION_VERSION_CHANGED") return { status: 401, code: "SESSION_EXPIRED", retryable: false };
    if (result === "EXPIRED") return { status: 410, code: "SESSION_EXPIRED", retryable: false };
  if (result === "DOMAIN_UNAVAILABLE" || result === "ORIGIN_MISMATCH") return { status: 409, code: "DOMAIN_NOT_VERIFIED", retryable: false };
  if (result === "ACCOUNT_UNAVAILABLE") return { status: 403, code: "FORBIDDEN", retryable: false };
  if (result === "NOT_FOUND") return { status: 404, code: "NOT_FOUND", retryable: false };
  if (result === "INVALID" || result === "PKCE_MISMATCH") return { status: 400, code: "VALIDATION_ERROR", retryable: false };
  return { status: 409, code: "CONFLICT", retryable: false };
}

Deno.serve(async (req: Request) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  if (req.method === "OPTIONS") {
    const origin = await corsOriginFor(db, req);
    if (!origin) return new Response("forbidden_origin", { status: 403, headers: { ...BASE_CORS, "Vary": "Origin" } });
    return new Response("ok", { headers: { ...BASE_CORS, "Access-Control-Allow-Origin": origin, "Vary": "Origin" } });
  }
  if (req.method !== "POST") return reply(challengeOrigin(req), { error: "method_not_allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return reply(challengeOrigin(req), { error: "invalid_json" }, 400); }
  const action = String(body?.action || "");
  const payload = body?.payload || {};
  const corsOrigin = await corsOriginFor(db, req, action);
  // Premium auth is a browser bearer-token API, not a cookie API. Still require
  // an explicitly allowed/ACTIVE Origin for every POST so credential/session
  // mutations are never callable as an ambient cross-site endpoint.
  if (!corsOrigin) return reply(null, { error: { code: "FORBIDDEN", message: "Origin not allowed", retryable: false } }, 403);
  const respond = (bodyValue: unknown, status = 200) => reply(corsOrigin, bodyValue, status);

  try {
    if (action === "begin_telegram_oidc" || action === "exchange_telegram_oidc") {
      const origin = challengeOrigin(req);
      if (!officialTelegramOriginAllowed(origin))
        return respond({ error: { code: "FORBIDDEN", message: "Central auth origin required", retryable: false } }, 403);
      const clientId = String(Deno.env.get("USTORE_TELEGRAM_OIDC_CLIENT_ID") || "");
      const clientSecret = String(Deno.env.get("USTORE_TELEGRAM_OIDC_CLIENT_SECRET") || "");
      if (!/^\d{5,20}$/.test(clientId) || !clientSecret)
        return respond({ error: { code: "CAPABILITY_UNAVAILABLE", message: "Telegram Login is not configured", retryable: false } }, 503);
      if (action === "begin_telegram_oidc") {
        const challenge = await beginOfficialTelegramLogin(db, {
          origin, returnTo: String(payload.returnTo || "/platform/app"),
          codeChallenge: String(payload.codeChallenge || ""), clientId,
        });
        return respond({ ok: true, challenge });
      }
      const result = await exchangeOfficialTelegramLogin(db, {
        origin, state: String(payload.state || ""), browserVerifier: String(payload.browserVerifier || ""),
        code: String(payload.code || ""), codeVerifier: String(payload.codeVerifier || ""), clientId, clientSecret,
      });
      if (!result.ok) {
        const code = result.result === "EXPIRED" ? "SESSION_EXPIRED" : "VALIDATION_ERROR";
        return respond({ error: { code, message: "Telegram login could not be completed", retryable: false } }, code === "SESSION_EXPIRED" ? 410 : 400);
      }
      return respond({ ok: true, accountId: result.accountId, session: result.session, returnTo: result.returnTo });
    }
    if (action === "begin_origin_handoff") {
      const origin = requestOrigin(req);
      if (!origin || !corsOrigin) return respond({ error: { code: "DOMAIN_NOT_VERIFIED", message: "Return origin is not active", retryable: false } }, 409);
      const handoff = await beginOriginAuthHandoff(db, {
        origin,
        returnTo: String(payload.returnTo || "/"),
        codeChallenge: String(payload.codeChallenge || ""),
        centralAuthBaseUrl: centralAuthBaseUrl(),
      });
      return respond({ ok: true, handoff });
    }

    if (action === "get_origin_handoff") {
      const origin = requestOrigin(req);
      if (!origin || origin !== centralAuthOrigin()) return respond({ error: { code: "FORBIDDEN", message: "Central auth origin required", retryable: false } }, 403);
      const handoff = await getOriginAuthHandoff(db, String(payload.state || ""));
      return respond({ ok: true, handoff });
    }

    if (action === "authorize_origin_handoff") {
      const origin = requestOrigin(req);
      if (!origin || origin !== centralAuthOrigin()) return respond({ error: { code: "FORBIDDEN", message: "Central auth origin required", retryable: false } }, 403);
      const session = await resolveSession(db, bearer(req), false);
      if (!session) return respond({ error: { code: "SESSION_EXPIRED", message: "Session expired", retryable: false } }, 401);
      const result = await authorizeOriginAuthHandoff(db, { state: String(payload.state || ""), accountId: session.accountId, sessionId: session.sessionId });
      if (!result.ok) {
        const mapped = originHandoffError(result.result);
        return respond({ error: { code: mapped.code, message: "Origin handoff cannot be authorized", retryable: mapped.retryable } }, mapped.status);
      }
      return respond({ ok: true, redirectUrl: result.redirectUrl, expiresAt: result.expiresAt, targetOrigin: result.targetOrigin });
    }

    if (action === "exchange_origin_handoff") {
      const origin = requestOrigin(req);
      if (!origin || !corsOrigin) return respond({ error: { code: "DOMAIN_NOT_VERIFIED", message: "Return origin is not active", retryable: false } }, 409);
      const result = await exchangeOriginAuthHandoff(db, {
        origin,
        state: String(payload.state || ""),
        authorizationCode: String(payload.code || ""),
        codeVerifier: String(payload.codeVerifier || ""),
      });
      if (!result.ok) {
        const mapped = originHandoffError(result.result);
        return respond({ error: { code: mapped.code, message: "Origin handoff cannot be exchanged", retryable: mapped.retryable } }, mapped.status);
      }
      return respond({ ok: true, accountId: result.accountId, session: result.session, returnTo: result.returnTo, shopId: result.shopId });
    }

    if (action === "begin_credential_issue") {
      const origin = challengeOrigin(req);
      if (!origin) return respond({ error: { code: "FORBIDDEN", message: "Origin not allowed", retryable: false } }, 403);
      const returnTo = String(payload.returnTo || "/");
      if (!isSafeReturnPath(returnTo)) return respond({ error: { code: "VALIDATION_ERROR", message: "Invalid return path", retryable: false } }, 400);
      const botUsername = Deno.env.get("USTORE_PLATFORM_BOT_USERNAME") || "";
      if (!/^[A-Za-z0-9_]{5,32}$/.test(botUsername)) return respond({ error: { code: "CAPABILITY_UNAVAILABLE", message: "Central Telegram bot is not configured", retryable: false } }, 503);
      return respond({ ok: true, redirectUrl: `https://t.me/${botUsername}?start=credentials`, returnTo });
    }

    if (action === "begin_telegram_sign_in") {
      const origin = challengeOrigin(req);
      if (!origin) return respond({ error: { code: "FORBIDDEN", message: "Origin not allowed", retryable: false } }, 403);
      const botUsername = String(Deno.env.get("USTORE_PLATFORM_BOT_USERNAME") || "");
      const challenge = await beginTelegramWebChallenge(db, { origin, returnTo: String(payload.returnTo || "/"), botUsername });
      return respond({ ok: true, challenge });
    }

    if (action === "get_telegram_sign_in_status") {
      const origin = challengeOrigin(req);
      if (!origin) return respond({ error: { code: "FORBIDDEN", message: "Origin not allowed", retryable: false } }, 403);
      const status = await getTelegramWebChallengeStatus(db, {
        origin,
        state: String(payload.state || ""),
        browserVerifier: String(payload.browserVerifier || ""),
      });
      return respond({ ok: true, challenge: status });
    }

    if (action === "exchange_telegram_sign_in") {
      const origin = challengeOrigin(req);
      if (!origin) return respond({ error: { code: "FORBIDDEN", message: "Origin not allowed", retryable: false } }, 403);
      const result = await exchangeTelegramWebChallenge(db, {
        origin,
        state: String(payload.state || ""),
        browserVerifier: String(payload.browserVerifier || ""),
        approvedAccountId: String(payload.approvedAccountId || ""),
        confirmed: payload.confirmed === true,
      });
      if (!result.ok) {
        const code = result.result === "EXPIRED" || result.result === "SESSION_VERSION_CHANGED" ? "SESSION_EXPIRED"
          : result.result === "ACCOUNT_MISMATCH" || result.result === "ORIGIN_MISMATCH" ? "FORBIDDEN"
          : result.result === "PENDING" || result.result === "CONSUMED" ? "CONFLICT"
          : "VALIDATION_ERROR";
        const status = code === "FORBIDDEN" ? 403 : code === "SESSION_EXPIRED" ? 410 : code === "CONFLICT" ? 409 : 400;
        return respond({ error: { code, message: "Telegram sign-in challenge cannot be exchanged", retryable: result.result === "PENDING" } }, status);
      }
      return respond({ ok: true, accountId: result.accountId, session: result.session, returnTo: result.returnTo });
    }

    if (action === "sign_in_password") {
      if (!challengeOrigin(req)) return respond({ error: { code: "FORBIDDEN", message: "Central auth origin required", retryable: false } }, 403);
      const login = String(payload.login || "");
      const password = String(payload.password || "");
      // Header/IP changes must never reset the authoritative login throttle.
      const ipHint = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim().slice(0, 80);
      const result = await authenticatePassword(db, login, password, ipHint);
      if (!result.ok) {
        if (result.code === "RATE_LIMITED") return respond({ error: { code: "RATE_LIMITED", message: "Too many attempts", retryable: true, retryAfter: result.retryAfter } }, 429);
        return respond({ error: { code: "INVALID_CREDENTIALS", message: "Login yoki parol noto‘g‘ri", retryable: false } }, 401);
      }
      return respond({ ok: true, accountId: result.accountId, session: { id: result.sessionId, token: result.sessionToken, expiresAt: result.expiresAt } });
    }

    const token = bearer(req);
    const session = await resolveSession(db, token, action === "get_session");
    if (!session) return respond({ error: { code: "SESSION_EXPIRED", message: "Session expired", retryable: false } }, 401);

    switch (action) {
      case "get_session":
        return respond({ ok: true, accountId: session.accountId, session: { id: session.sessionId, expiresAt: session.expiresAt }, replacementToken: session.replacementToken || null });
      case "sign_out":
        await revokeSession(db, session.accountId, session.sessionId, "SIGN_OUT");
        return respond({ ok: true });
      case "list_sessions": {
        const { data, error } = await db.from("web_sessions").select("id,created_via,created_at,last_seen_at,expires_at,revoked_at,revoke_reason")
          .eq("account_id", session.accountId).order("created_at", { ascending: false }).limit(100);
        if (error) throw error;
        return respond({ ok: true, sessions: data || [], currentSessionId: session.sessionId });
      }
      case "revoke_session":
        await revokeSession(db, session.accountId, String(payload.sessionId || ""));
        return respond({ ok: true, revoked: true });
      case "revoke_all_sessions":
        await revokeAllSessions(db, session.accountId);
        return respond({ ok: true, revoked: true });
      case "change_login":
        return respond({ ok: true, ...(await changeLogin(db, session.accountId, String(payload.login || ""))) });
      case "change_password":
        await changePassword(db, session.accountId, String(payload.currentPassword || ""), String(payload.newPassword || ""));
        return respond({ ok: true, sessionsRevoked: true });
      default:
        return respond({ error: { code: "NOT_FOUND", message: "Unknown auth action", retryable: false } }, 404);
    }
  } catch (error: any) {
    const message = String(error?.message || "");
    if (message.startsWith("VALIDATION_ERROR")) return respond({ error: { code: "VALIDATION_ERROR", message: "Invalid value", retryable: false } }, 400);
    if (message.startsWith("DOMAIN_NOT_VERIFIED")) return respond({ error: { code: "DOMAIN_NOT_VERIFIED", message: "Domain is not active", retryable: false } }, 409);
    if (message.startsWith("CAPABILITY_UNAVAILABLE")) return respond({ error: { code: "CAPABILITY_UNAVAILABLE", message: "Auth handoff is not configured", retryable: false } }, 503);
    if (message.startsWith("CONFLICT")) return respond({ error: { code: "CONFLICT", message: "Value already in use", retryable: false } }, 409);
    if (message === "INVALID_CREDENTIALS") return respond({ error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials", retryable: false } }, 401);
    if (message === "SESSION_VERSION_CHANGED") return respond({ error: { code: "SESSION_EXPIRED", message: "Session changed. Retry sign-in.", retryable: false } }, 409);
    console.error("[WEB_AUTH_ERROR]", { action, code: error?.code || "unknown" });
    return respond({ error: { code: "NETWORK_ERROR", message: "Auth request failed", retryable: true } }, 500);
  }
});
