/**
 * AR-29 rule 3 — secure server sessions. Tokens are 32 random bytes
 * (base64url); only their sha256 digest is stored server-side. The
 * browser holds the raw token in an httpOnly, SameSite=Lax (Strict in
 * prod opt-in via AUTH_COOKIE_SAMESITE), Secure (production) cookie.
 * Logout deletes the session row server-side and clears the cookie.
 */
import crypto from "crypto";
import type { Pool } from "pg";

export const DEFAULT_AUTH_COOKIE_NAME = "motormedic_session";
export const DEFAULT_SESSION_TTL_HOURS = 336; // 14 days

export interface SessionCookieOptions {
  secure: boolean;
  sameSite: "Lax" | "Strict" | "None";
  maxAgeSeconds: number;
}

export function authCookieName(env: NodeJS.ProcessEnv = process.env): string {
  return env.AUTH_COOKIE_NAME?.trim() || DEFAULT_AUTH_COOKIE_NAME;
}

export function sessionTtlHours(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number.parseInt(env.SESSION_TTL_HOURS ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SESSION_TTL_HOURS;
}

export function sessionCookieOptions(
  env: NodeJS.ProcessEnv = process.env
): SessionCookieOptions {
  const secure = env.NODE_ENV === "production";
  const rawSame = env.AUTH_COOKIE_SAMESITE?.trim();
  const sameSite: SessionCookieOptions["sameSite"] =
    rawSame === "Strict" ? "Strict" : rawSame === "None" ? "None" : "Lax";
  return {
    secure,
    sameSite,
    maxAgeSeconds: sessionTtlHours(env) * 3600,
  };
}

/** Raw token handed to the browser; never persisted or logged. */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Server-side lookup key: sha256 of the raw token, hex. */
export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function buildSessionCookie(
  token: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const name = authCookieName(env);
  const opts = sessionCookieOptions(env);
  const parts = [
    `${name}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${opts.sameSite}`,
    `Max-Age=${opts.maxAgeSeconds}`,
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearSessionCookie(env: NodeJS.ProcessEnv = process.env): string {
  const name = authCookieName(env);
  const opts = sessionCookieOptions(env);
  const parts = [
    `${name}=`,
    "Path=/",
    "HttpOnly",
    `SameSite=${opts.sameSite}`,
    "Max-Age=0",
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

/** Minimal cookie-header parser (no extra dependency). */
export function parseCookies(
  header: string | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

export function readSessionTokenFromRequest(
  cookieHeader: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const token = parseCookies(cookieHeader)[authCookieName(env)];
  return token && token.length >= 32 ? token : null;
}

export interface PersistedSession {
  id: string;
  user_id: number;
  expires_at: Date;
}

/**
 * Create a session row for a user. Returns the raw token (for the cookie)
 * and the stored session id. Only the sha256 digest is written to the DB.
 */
export async function createSession(
  pool: Pool,
  userId: number,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ token: string; sessionId: string }> {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const ttlHours = sessionTtlHours(env);
  const result = await pool.query(
    `INSERT INTO auth_sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3 || ' hours')::interval)
     RETURNING id`,
    [userId, tokenHash, String(ttlHours)]
  );
  return { token, sessionId: result.rows[0].id as string };
}

/**
 * Look up a live session by raw token. Returns null when absent or
 * expired. Expired rows are deleted opportunistically.
 */
export async function findSessionByToken(
  pool: Pool,
  token: string
): Promise<PersistedSession | null> {
  const tokenHash = hashSessionToken(token);
  const result = await pool.query(
    `DELETE FROM auth_sessions
     WHERE token_hash = $1 AND expires_at < NOW()
     RETURNING id`,
    [tokenHash]
  );
  if (result.rows.length > 0) return null;
  const row = await pool.query(
    `SELECT id, user_id, expires_at FROM auth_sessions WHERE token_hash = $1 LIMIT 1`,
    [tokenHash]
  );
  if (row.rows.length === 0) return null;
  const s = row.rows[0];
  return { id: s.id, user_id: s.user_id, expires_at: s.expires_at };
}

/** Server-side invalidation (logout, password change, admin revoke). */
export async function deleteSession(pool: Pool, sessionId: string): Promise<void> {
  await pool.query(`DELETE FROM auth_sessions WHERE id = $1`, [sessionId]);
}

export async function deleteSessionsForUser(
  pool: Pool,
  userId: number
): Promise<void> {
  await pool.query(`DELETE FROM auth_sessions WHERE user_id = $1`, [userId]);
}
