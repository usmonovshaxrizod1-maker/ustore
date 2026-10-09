import bcrypt from "npm:bcryptjs@2.4.3";
import { ensureTelegramAccount } from "./account-identity.ts";

const BCRYPT_COST = 12;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const SESSION_ROTATE_BEFORE_SECONDS = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();

export function normalizeLogin(value: unknown): string {
  return String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

export function validateLogin(login: string): boolean {
  return /^[\p{L}\p{N}][\p{L}\p{N}._-]{3,39}$/u.test(login);
}

export function validatePassword(password: string): boolean {
  const bytes = encoder.encode(password).byteLength;
  return Array.from(password).length >= 6 && bytes <= 72;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*+-_";
  const bytes = randomBytes(20);
  let out = "Aa7!";
  for (let i = 0; i < 14; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function generateSessionToken(): string {
  return `us1_${base64Url(randomBytes(32))}`;
}

function slugBase(value: string): string {
  const base = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, ".")
    .replace(/^\.+|\.+$/g, "").slice(0, 28) || "ustore.user";
  return Array.from(base).length >= 4 ? base : `${base}.user`;
}

async function uniqueGeneratedLogin(db: any, baseHint: string, telegramUserId: string): Promise<string> {
  const base = slugBase(baseHint);
  for (let i = 0; i < 20; i++) {
    const suffix = i === 0 ? "" : `.${String(telegramUserId).slice(-4)}${i === 1 ? "" : i}`;
    const candidate = `${base}${suffix}`.slice(0, 40);
    const { data } = await db.from("account_credentials").select("account_id").eq("login_normalized", candidate).maybeSingle();
    if (!data) return candidate;
  }
  return `${base}.${crypto.randomUUID().slice(0, 8)}`.slice(0, 40);
}

export async function issueInitialCredentials(db: any, input: { accountId: string; telegramUserId: string; loginHint: string }): Promise<{ login: string; password: string; created: boolean }> {
  const { data: existing, error } = await db.from("account_credentials")
    .select("login_display").eq("account_id", input.accountId).maybeSingle();
  if (error) throw error;
  if (existing) return { login: String(existing.login_display), password: "", created: false };
  for (let attempt = 0; attempt < 4; attempt++) {
    const login = await uniqueGeneratedLogin(db, input.loginHint, input.telegramUserId);
    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const { error: insertError } = await db.from("account_credentials").insert({
      account_id: input.accountId, login_normalized: normalizeLogin(login), login_display: login,
      password_hash: passwordHash, password_algo: "bcrypt",
    });
    if (!insertError) return { login, password, created: true };
    if (String(insertError?.code || "") !== "23505") throw insertError;
    const { data: raced, error: racedError } = await db.from("account_credentials")
      .select("login_display").eq("account_id", input.accountId).maybeSingle();
    if (racedError) throw racedError;
    if (raced) return { login: String(raced.login_display), password: "", created: false };
  }
  throw new Error("CONFLICT:credential_issue");
}

export async function resetCredentialsForTelegram(db: any, input: { accountId: string; loginHint: string; telegramUserId: string }): Promise<{ login: string; password: string }> {
  const { data: existing, error } = await db.from("account_credentials")
    .select("login_display").eq("account_id", input.accountId).maybeSingle();
  if (error) throw error;
  const login = existing?.login_display ? String(existing.login_display) : await uniqueGeneratedLogin(db, input.loginHint, input.telegramUserId);
  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const { data, error: rotateError } = await db.rpc("ustore_replace_credentials_and_revoke", {
    p_account_id: input.accountId,
    p_login_normalized: normalizeLogin(login),
    p_login_display: login,
    p_password_hash: passwordHash,
    p_reason: "CREDENTIAL_RESET_TELEGRAM",
    p_expected_password_hash: null,
    p_allow_create: true,
  });
  if (rotateError) throw rotateError;
  const row = Array.isArray(data) ? data[0] : data;
  if (String(row?.result || "") !== "OK") throw new Error("CONFLICT:credential_reset");
  return { login, password };
}

export async function setCredentialsPasswordForTelegram(db: any, input: {
  accountId: string; loginHint: string; telegramUserId: string; password: string;
}): Promise<{ login: string }> {
  if (!validatePassword(input.password)) throw new Error("VALIDATION_ERROR:password");
  const { data: existing, error } = await db.from("account_credentials")
    .select("login_display").eq("account_id", input.accountId).maybeSingle();
  if (error) throw error;
  const login = existing?.login_display ? String(existing.login_display)
    : await uniqueGeneratedLogin(db, input.loginHint, input.telegramUserId);
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  const { data, error: rotateError } = await db.rpc("ustore_replace_credentials_and_revoke", {
    p_account_id: input.accountId, p_login_normalized: normalizeLogin(login), p_login_display: login,
    p_password_hash: passwordHash, p_reason: "PASSWORD_SET_TELEGRAM",
    p_expected_password_hash: null, p_allow_create: true,
  });
  if (rotateError) throw rotateError;
  const row = Array.isArray(data) ? data[0] : data;
  if (String(row?.result || "") !== "OK") throw new Error("CONFLICT:credential_changed");
  return { login };
}

export async function authenticatePassword(db: any, loginRaw: string, password: string, rateKeyExtra = ""): Promise<
  | { ok: true; accountId: string; sessionToken: string; sessionId: string; expiresAt: string }
  | { ok: false; code: "INVALID_CREDENTIALS" | "RATE_LIMITED"; retryAfter?: number }
> {
  const login = normalizeLogin(loginRaw);
  // Account throttle must survive IP/header changes. IP hints are not identity.
  const rateKeyHash = await sha256Hex(`password:${login}`);
  const { data: rateRows, error: rateError } = await db.rpc("ustore_auth_rate_limit_consume", { p_key_hash: rateKeyHash, p_limit: 8, p_window_seconds: 900, p_block_seconds: 900 });
  if (rateError) throw rateError;
  const rate = Array.isArray(rateRows) ? rateRows[0] : rateRows;
  if (rate && rate.allowed === false) return { ok: false, code: "RATE_LIMITED", retryAfter: Number(rate.retry_after_seconds || 900) };
  if (!validateLogin(login) || !validatePassword(password)) return { ok: false, code: "INVALID_CREDENTIALS" };

  const { data: cred, error } = await db.from("account_credentials")
    .select("account_id,password_hash,password_algo").eq("login_normalized", login).maybeSingle();
  if (error) throw error;
  // Generic result: missing account and wrong password are indistinguishable.
  if (!cred || cred.password_algo !== "bcrypt" || !(await bcrypt.compare(password, cred.password_hash))) {
    return { ok: false, code: "INVALID_CREDENTIALS" };
  }
  const { data: account, error: accountError } = await db.from("accounts").select("status,session_version").eq("id", cred.account_id).maybeSingle();
  if (accountError) throw accountError;
  if (!account || account.status !== "ACTIVE") return { ok: false, code: "INVALID_CREDENTIALS" };
  try {
    const newSession = await createSession(db, String(cred.account_id), "PASSWORD", Number(account.session_version || 1), String(cred.password_hash));
    await db.rpc("ustore_auth_rate_limit_clear", { p_key_hash: rateKeyHash });
    await db.from("web_auth_audit").insert({ account_id: cred.account_id, event_type: "PASSWORD_SIGN_IN", metadata: {} });
    return { ok: true, accountId: String(cred.account_id), ...newSession };
  } catch (error) {
    if (error instanceof Error && error.message === "SESSION_VERSION_CHANGED") return { ok: false, code: "INVALID_CREDENTIALS" };
    throw error;
  }
}

export async function createSession(db: any, accountId: string, createdVia: "PASSWORD", expectedSessionVersion: number, expectedPasswordHash: string) {
  const sessionToken = generateSessionToken();
  const tokenHash = await sha256Hex(sessionToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  const { data, error } = await db.rpc("ustore_create_web_session", {
    p_account_id: accountId,
    p_token_hash: tokenHash,
    p_created_via: createdVia,
    p_expires_at: expiresAt,
    p_expected_session_version: expectedSessionVersion,
    p_expected_password_hash: expectedPasswordHash,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (String(row?.result || "") !== "OK" || !row?.session_id) throw new Error("SESSION_VERSION_CHANGED");
  return { sessionToken, sessionId: String(row.session_id), expiresAt };
}

export async function resolveSession(db: any, token: string, rotate = true): Promise<null | { accountId: string; sessionId: string; expiresAt: string; replacementToken?: string }> {
  if (!token || token.length < 40 || token.length > 160) return null;
  const tokenHash = await sha256Hex(token);
  const { data: session, error } = await db.from("web_sessions")
    .select("id,account_id,expires_at,revoked_at,session_version").eq("token_hash", tokenHash).maybeSingle();
  if (error) throw error;
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) return null;
  const { data: account } = await db.from("accounts").select("status,session_version").eq("id", session.account_id).maybeSingle();
  if (!account || account.status !== "ACTIVE" || Number(account.session_version || 1) !== Number(session.session_version || 1)) return null;
  await db.from("web_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", session.id);
  const secondsLeft = Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000);
  if (rotate && secondsLeft < SESSION_ROTATE_BEFORE_SECONDS) {
    const replacementToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
    // Compare-and-swap the existing row: concurrent rotation/revocation must
    // not create a fresh active session after the original was revoked.
    const { data: rotated, error: rotationError } = await db.from("web_sessions")
      .update({ token_hash: await sha256Hex(replacementToken), expires_at: expiresAt })
      .eq("id", session.id).eq("token_hash", tokenHash).is("revoked_at", null).select("id").maybeSingle();
    if (rotationError) throw rotationError;
    if (!rotated) return null;
    return { accountId: String(session.account_id), sessionId: String(session.id), expiresAt, replacementToken };
  }
  return { accountId: String(session.account_id), sessionId: String(session.id), expiresAt: String(session.expires_at) };
}

export async function revokeSession(db: any, accountId: string, sessionId: string, reason = "USER_REVOKED") {
  const { error } = await db.from("web_sessions").update({ revoked_at: new Date().toISOString(), revoke_reason: reason })
    .eq("id", sessionId).eq("account_id", accountId).is("revoked_at", null);
  if (error) throw error;
}

export async function revokeAllSessions(db: any, accountId: string, reason = "USER_REVOKED_ALL") {
  const { error } = await db.rpc("ustore_revoke_all_web_sessions_atomic", { p_account_id: accountId, p_reason: reason });
  if (error) throw error;
}

export async function changeLogin(db: any, accountId: string, nextRaw: string): Promise<{ login: string }> {
  const login = normalizeLogin(nextRaw);
  if (!validateLogin(login)) throw new Error("VALIDATION_ERROR:login");
  const { error } = await db.from("account_credentials").update({ login_normalized: login, login_display: nextRaw.trim(), updated_at: new Date().toISOString() }).eq("account_id", accountId);
  if (error) {
    if (String(error.code) === "23505") throw new Error("CONFLICT:login_taken");
    throw error;
  }
  await db.from("web_auth_audit").insert({ account_id: accountId, event_type: "LOGIN_CHANGED", metadata: {} });
  return { login: nextRaw.trim() };
}

export async function changePassword(db: any, accountId: string, currentPassword: string, nextPassword: string): Promise<void> {
  if (!validatePassword(nextPassword)) throw new Error("VALIDATION_ERROR:password");
  const { data: cred, error } = await db.from("account_credentials").select("password_hash,login_normalized,login_display").eq("account_id", accountId).maybeSingle();
  if (error) throw error;
  if (!cred || !(await bcrypt.compare(currentPassword, cred.password_hash))) throw new Error("INVALID_CREDENTIALS");
  const nextHash = await bcrypt.hash(nextPassword, BCRYPT_COST);
  const { data, error: rotateError } = await db.rpc("ustore_replace_credentials_and_revoke", {
    p_account_id: accountId,
    p_login_normalized: String(cred.login_normalized),
    p_login_display: String(cred.login_display),
    p_password_hash: nextHash,
    p_reason: "PASSWORD_CHANGED",
    p_expected_password_hash: String(cred.password_hash),
    p_allow_create: false,
  });
  if (rotateError) throw rotateError;
  const row = Array.isArray(data) ? data[0] : data;
  if (String(row?.result || "") === "CREDENTIAL_CHANGED") throw new Error("CONFLICT:credential_changed");
  if (String(row?.result || "") !== "OK") throw new Error("INVALID_CREDENTIALS");
}


