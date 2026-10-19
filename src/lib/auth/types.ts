/**
 * AR-29 shared auth types. The session carries a structured role; the
 * server enforces per-route permissions from it on every protected route.
 * Client-side guards are UX only and are never trusted.
 */
export type AppRole = "plant-engineer" | "reliability-manager" | "system-admin";

export interface SessionUser {
  id: number;
  username: string;
  company_id: number;
  role: AppRole;
  is_temp_password: boolean;
  plant_id: number | null;
  plant_name?: string | null;
}

export interface AuthContext {
  user: SessionUser;
  /** tenant_id derived from the verified server session (company_id). */
  tenantId: number;
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      tenantId?: number;
    }
  }
}

export {};
