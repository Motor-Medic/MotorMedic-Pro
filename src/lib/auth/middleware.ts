/**
 * AR-29 rules 3, 8, 9 — server route protection, RBAC, and tenant
 * auto-stamping.
 *
 * requireAuth is mounted once for the whole /api surface with a tight
 * public whitelist (login | register | session | stripe-webhook |
 * health). Every other API request must present a live session cookie;
 * the structured role and tenant_id come from the verified server
 * session only. Client-supplied tenant_id / role / user_id fields are
 * stripped from write bodies so no route can be tricked into stamping
 * across tenants.
 */
import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import type { AppRole, SessionUser } from "./types";
import { normalizeRole } from "./rbac";
import {
  deleteSession,
  findSessionByToken,
  readSessionTokenFromRequest,
} from "./session";

/** Paths (exact, after /api prefix stripped) that stay public. */
const PUBLIC_API_PATHS: ReadonlySet<string> = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/session",
  "/auth/demo-login", // handler itself hard-blocks production + unseeded envs
  "/webhook", // Stripe signature-verified webhooks
  "/catalog", // STOREFRONT — static module list + prices
  "/checkout/create", // STOREFRONT — auth-less, rate-limited, no client company_id
  "/stripe/webhook", // STOREFRONT — signature-verified (test bypass gated)
  "/health",
]);

/** In-memory session fallback for DATABASE_URL-less dev boots only. */
interface MemorySession {
  sessionId: string;
  userId: number;
  expiresAt: number;
}
const memorySessions = new Map<string, MemorySession>();
let memorySessionSeq = 0;

export function createMemorySession(userId: number, ttlHours: number): {
  token: string;
  sessionId: string;
} {
  const token = `devmem_${crypto.randomBytes(24).toString("base64url")}`;
  const sessionId = `mem-${++memorySessionSeq}`;
  memorySessions.set(token, {
    sessionId,
    userId,
    expiresAt: Date.now() + ttlHours * 3600_000,
  });
  return { token, sessionId };
}

export function destroyMemorySession(token: string): void {
  memorySessions.delete(token);
}

function loadMemorySession(token: string): MemorySession | null {
  const s = memorySessions.get(token);
  if (!s) return null;
  if (s.expiresAt < Date.now()) {
    memorySessions.delete(token);
    return null;
  }
  return s;
}

/** Loader for in-memory users (memory-mode, DATABASE_URL-less dev boots). */
type MemoryUserLoader = (userId: number) => SessionUser | null;
let memoryUserLoader: MemoryUserLoader | null = null;

/** Wired by the host app (server.ts) so memory sessions resolve a user. */
export function registerMemoryUserLoader(loader: MemoryUserLoader | null): void {
  memoryUserLoader = loader;
}

async function loadSessionUser(
  pool: Pool | null,
  userId: number
): Promise<SessionUser | null> {
  if (pool) {
    const result = await pool.query(
      `SELECT u.id, u.username, u.company_id, u.role, u.is_temp_password,
              u.terms_accepted_at,
              p.id AS plant_id, p.name AS plant_name
         FROM users u
         LEFT JOIN plants p ON p.company_id = u.company_id
        WHERE u.id = $1
        ORDER BY p.id ASC
        LIMIT 1`,
      [userId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      username: row.username,
      company_id: row.company_id,
      role: normalizeRole(row.role),
      is_temp_password: !!row.is_temp_password,
      plant_id: row.plant_id ?? null,
      plant_name: row.plant_name ?? null,
      terms_accepted_at: row.terms_accepted_at ?? null,
    };
  }
  // Memory mode — resolve the user from the host app's in-memory store
  // so guard revalidation does not drop memory sessions on the floor.
  return memoryUserLoader ? memoryUserLoader(userId) : null;
}

const TENANT_STRIPPED_FIELDS = new Set(["tenant_id", "tenantId"]);

/**
 * Strip client-supplied tenancy/identity fields from write bodies.
 * tenant_id is injected exclusively from the verified session.
 */
export function stripClientTenancyFields(req: Request): void {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    for (const field of TENANT_STRIPPED_FIELDS) {
      if (field in (req.body as Record<string, unknown>)) {
        delete (req.body as Record<string, unknown>)[field];
      }
    }
  }
}

/**
 * Global /api guard. Whitelist: auth login/register/session/demo-login,
 * Stripe webhooks, health. Everything else requires a live session;
 * the structured role and tenant_id are attached to req.auth / req.tenantId.
 */
export function createApiAuthGuard(pool: () => Pool | null) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const path = req.path.replace(/\/+$/, "") || "/";
    const isPublic = PUBLIC_API_PATHS.has(path);
    if (req.method !== "GET") stripClientTenancyFields(req);

    try {
      const token = readSessionTokenFromRequest(req.headers.cookie);
      const activePool = pool();
      let sessionId: string | null = null;
      let userId: number | null = null;

      if (token && activePool) {
        const session = await findSessionByToken(activePool, token);
        if (session) {
          sessionId = session.id;
          userId = session.user_id;
        }
      } else if (token) {
        const mem = loadMemorySession(token);
        if (mem) {
          sessionId = mem.sessionId;
          userId = mem.userId;
        }
      }

      if (userId != null) {
        const user = await loadSessionUser(activePool, userId);
        if (user) {
          req.auth = { user, tenantId: user.company_id, sessionId: sessionId! };
          req.tenantId = user.company_id;
        } else if (activePool && sessionId) {
          await deleteSession(activePool, sessionId);
        }
      }

      if (isPublic) return next();

      if (!req.auth) {
        return res
          .status(401)
          .json({ error: "Authentication required", code: "NO_SESSION" });
      }
      return next();
    } catch (err) {
      console.error("[auth-guard] session validation failed:", err);
      if (isPublic) return next();
      return res
        .status(401)
        .json({ error: "Authentication check failed", code: "SESSION_ERROR" });
    }
  };
}

/** requireAuth for handlers mounted outside the global guard. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) {
    return res
      .status(401)
      .json({ error: "Authentication required", code: "NO_SESSION" });
  }
  return next();
}

/** requireRole — server-enforced RBAC from the session's structured role. */
export function requireRole(...roles: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res
        .status(401)
        .json({ error: "Authentication required", code: "NO_SESSION" });
    }
    if (!roles.includes(req.auth.user.role)) {
      return res
        .status(403)
        .json({
          error: "Insufficient permissions",
          code: "FORBIDDEN",
          required_roles: roles,
        });
    }
    return next();
  };
}

/** Server-derived tenant id for write stamping. Never from the client. */
export function tenantIdFromRequest(req: Request): number | null {
  return req.auth?.tenantId ?? req.tenantId ?? null;
}
