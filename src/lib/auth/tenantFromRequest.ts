/**
 * SLICE-SEC-BASELINE-1 — tenant id extraction for Next.js route handlers.
 *
 * Next.js App Router route handlers receive a standard `Request` (not an
 * Express request), so the global AR-29 guard in middleware.ts never runs
 * against them. This helper derives the tenant id from the verified server
 * session cookie, mirroring `tenantIdFromRequest` in middleware.ts:238.
 *
 * The tenant id comes ONLY from the server session (company_id). It is never
 * derived from a client-supplied header, query param, or body field.
 */
import { readSessionTokenFromRequest } from "./session";
import { findSessionByToken } from "./session";
import { getPool } from "../db";

export async function tenantIdFromNextRequest(
  request: Request
): Promise<number | null> {
  const cookieHeader = request.headers.get("cookie");
  const token = readSessionTokenFromRequest(cookieHeader);
  if (!token) return null;

  const pool = getPool();
  if (!pool) return null;

  let sessionId: string | null = null;
  let userId: number | null = null;

  try {
    const session = await findSessionByToken(pool, token);
    if (!session) return null;
    sessionId = session.id;
    userId = session.user_id;
  } catch {
    return null;
  }

  if (userId == null) return null;

  // Resolve the user to get company_id (the tenant id). Mirrors
  // loadSessionUser in middleware.ts:89-126 but only needs the tenant id.
  try {
    const result = await pool.query(
      `SELECT u.company_id, u.is_disabled
         FROM users u
        WHERE u.id = $1
        LIMIT 1`,
      [userId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    if (row.is_disabled) return null;
    return row.company_id ?? null;
  } catch {
    return null;
  }
}
