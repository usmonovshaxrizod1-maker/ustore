const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function randomToken(bytes = 32): string {
  const out = new Uint8Array(bytes);
  crypto.getRandomValues(out);
  let binary = "";
  for (const value of out) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

const encoder = new TextEncoder();

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateSessionToken(): string {
  return `us1_${randomToken(32)}`;
}

export function isSafeReturnPath(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return false;
  if (/^[\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const parsed = new URL(value, "https://return.invalid");
    return parsed.origin === "https://return.invalid" && `${parsed.pathname}${parsed.search}${parsed.hash}` === value;
  } catch (_) { return false; }
}

export function canonicalHttpOrigin(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    const localHttp = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
    if (url.protocol !== "https:" && !localHttp) return null;
    return url.origin;
  } catch (_) { return null; }
}

export function parseAllowedOrigins(values: Array<string | null | undefined>): Set<string> {
  const out = new Set<string>();
  for (const raw of values) {
    for (const piece of String(raw || "").split(",")) {
      const trimmed = piece.trim();
      if (!trimmed) continue;
      let candidate = trimmed;
      try { candidate = new URL(trimmed).origin; } catch (_) {}
      const origin = canonicalHttpOrigin(candidate);
      if (origin) out.add(origin);
    }
  }
  return out;
}

export function isAllowedOrigin(originRaw: unknown, allowed: Set<string>): boolean {
  const origin = canonicalHttpOrigin(originRaw);
  return !!origin && allowed.has(origin);
}

export function telegramDeepLink(botUsernameRaw: unknown, state: string): string {
  const username = String(botUsernameRaw || "").trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) throw new Error("CAPABILITY_UNAVAILABLE:platform_bot_username");
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(state)) throw new Error("VALIDATION_ERROR:state");
  return `https://t.me/${username}?start=webauth_${state}`;
}

export async function beginTelegramWebChallenge(db: any, input: { origin: string; returnTo: string; botUsername: string }) {
  if (!canonicalHttpOrigin(input.origin) || !isSafeReturnPath(input.returnTo)) throw new Error("VALIDATION_ERROR:return_to");
  const state = randomToken(32);
  const browserVerifier = randomToken(32);
  const stateHash = await sha256Hex(state);
  const browserVerifierHash = await sha256Hex(browserVerifier);
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
  const { error } = await db.from("web_telegram_auth_challenges").insert({
    state_hash: stateHash,
    browser_verifier_hash: browserVerifierHash,
    return_origin: input.origin,
    return_path: input.returnTo,
    expires_at: expiresAt,
  });
  if (error) throw error;
  return {
    state,
    browserVerifier,
    redirectUrl: telegramDeepLink(input.botUsername, state),
    expiresAt,
    pollAfterMs: 1200,
  };
}

export async function approveTelegramWebChallenge(db: any, input: { state: string; accountId: string; telegramUserId: string }): Promise<string> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(input.state)) return "NOT_FOUND";
  const stateHash = await sha256Hex(input.state);
  const { data, error } = await db.rpc("ustore_approve_telegram_web_challenge", {
    p_state_hash: stateHash,
    p_account_id: input.accountId,
    p_telegram_user_id: String(input.telegramUserId),
  });
  if (error) throw error;
  return String(data || "NOT_FOUND");
}

export async function getTelegramWebChallengeStatus(db: any, input: { origin: string; state: string; browserVerifier: string }) {
  if (!canonicalHttpOrigin(input.origin) || !/^[A-Za-z0-9_-]{40,60}$/.test(input.state) || !/^[A-Za-z0-9_-]{40,60}$/.test(input.browserVerifier)) {
    throw new Error("VALIDATION_ERROR:challenge");
  }
  const [stateHash, verifierHash] = await Promise.all([sha256Hex(input.state), sha256Hex(input.browserVerifier)]);
  const { data: row, error } = await db.from("web_telegram_auth_challenges")
    .select("account_id,telegram_user_id,return_origin,expires_at,approved_at,consumed_at,rejected_at")
    .eq("state_hash", stateHash).eq("browser_verifier_hash", verifierHash).maybeSingle();
  if (error) throw error;
  if (!row || row.return_origin !== input.origin) return { status: "INVALID" as const };
  if (row.consumed_at) return { status: "CONSUMED" as const };
  if (row.rejected_at) return { status: "REJECTED" as const };
  if (new Date(row.expires_at).getTime() <= Date.now()) return { status: "EXPIRED" as const };
  if (!row.approved_at || !row.account_id) return { status: "PENDING" as const };
  const { data: account } = await db.from("accounts").select("display_name").eq("id", row.account_id).maybeSingle();
  const tg = String(row.telegram_user_id || "");
  return {
    status: "APPROVED" as const,
    approvedAccountId: String(row.account_id),
    displayName: account?.display_name ? String(account.display_name).slice(0, 160) : "Telegram foydalanuvchisi",
    telegramHint: tg ? `••••${tg.slice(-4)}` : null,
    requiresExplicitConfirmation: true,
  };
}

export async function exchangeTelegramWebChallenge(db: any, input: {
  origin: string; state: string; browserVerifier: string; approvedAccountId: string; confirmed: boolean;
}) {
  if (input.confirmed !== true) throw new Error("VALIDATION_ERROR:confirmation_required");
  if (!canonicalHttpOrigin(input.origin) || !/^[0-9a-f-]{36}$/i.test(input.approvedAccountId)) throw new Error("VALIDATION_ERROR:challenge");
  const [stateHash, verifierHash] = await Promise.all([sha256Hex(input.state), sha256Hex(input.browserVerifier)]);
  // return_origin is immutable after challenge creation. Check it before the
  // consuming RPC so another allowlisted origin cannot burn this challenge.
  const { data: boundChallenge, error: boundError } = await db.from("web_telegram_auth_challenges")
    .select("return_origin").eq("state_hash", stateHash).eq("browser_verifier_hash", verifierHash).maybeSingle();
  if (boundError) throw boundError;
  if (!boundChallenge || boundChallenge.return_origin !== input.origin) return { ok: false as const, result: "ORIGIN_MISMATCH" };
  const sessionToken = generateSessionToken();
  const sessionTokenHash = await sha256Hex(sessionToken);
  const { data, error } = await db.rpc("ustore_exchange_telegram_web_challenge", {
    p_state_hash: stateHash,
    p_browser_verifier_hash: verifierHash,
    p_confirm_account_id: input.approvedAccountId,
    p_session_token_hash: sessionTokenHash,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const result = String(row?.result || "INVALID");
  if (result !== "OK") return { ok: false as const, result };
  if (String(row.return_origin) !== input.origin || !isSafeReturnPath(String(row.return_path || ""))) return { ok: false as const, result: "ORIGIN_MISMATCH" };
  return {
    ok: true as const,
    accountId: String(row.account_id),
    session: { id: String(row.session_id), token: sessionToken, expiresAt: String(row.session_expires_at) },
    returnTo: String(row.return_path),
  };
}
