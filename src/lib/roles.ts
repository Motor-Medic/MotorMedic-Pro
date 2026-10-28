/**
 * ROLES-1 - single-source per-role permission matrix.
 *
 * The role keys are the EXISTING canonical users.role values
 * (plant-engineer | reliability-manager | system-admin; see
 * src/lib/auth/types.ts:6 and migrations/008_auth_sessions_rbac.sql:23-26).
 * No role is renamed and no role value is migrated. Legacy user rows still
 * normalize through src/lib/auth/rbac.ts before they reach this matrix.
 *
 * Access rule: effective module access = tenant entitlement INTERSECT role
 * view permission. A role permission never unlocks an unpaid module, and an
 * entitlement never unlocks a tool the role lacks. Server middleware below is
 * the enforcement; UI checks are a UX mirror only.
 */
import type { NextFunction, Request, Response } from "express";
import type { AppRole } from "./auth/types";
import type { ModuleKey } from "./entitlements";

export const CANONICAL_ROLES: readonly AppRole[] = [
  "plant-engineer",
  "reliability-manager",
  "system-admin"
];

/**
 * Legacy permission strings retained for the pre-ROLES-1 call sites and tests.
 * They live in this same matrix so there is exactly one ROLE_PERMISSIONS map.
 */
export type LegacyPermission =
  | "diagnostics:run"
  | "diagnostics:read"
  | "assets:read"
  | "assets:write"
  | "notes:write"
  | "spectrum:capture"
  | "reports:read"
  | "reports:write"
  | "workorders:write"
  | "users:invite"
  | "users:manage"
  | "tenants:manage"
  | "system:admin";

export type Permission =
  | "view_module:vibration"
  | "view_module:thermography"
  | "view_module:ultrasound"
  | "view_module:oil"
  | "assessment.save"
  | "goodcatch.write"
  | "route.checkout"
  | "route.checkin"
  | "bearing.write"
  | "reports.export"
  | "anomaly.view"
  | "users.manage"
  | "recipients.manage"
  | "system.admin"
  | LegacyPermission;

const STRUCTURED_ROLES: readonly AppRole[] = [
  "plant-engineer",
  "reliability-manager",
  "system-admin"
];

/**
 * Map legacy/free-form users.role values onto the canonical role set. This is
 * the same AR-29 mapping that lived in src/lib/auth/rbac.ts; it is re-exported
 * from there so no caller or stored role value changes.
 */
export function normalizeRole(raw: unknown): AppRole {
  if (typeof raw === "string") {
    const value = raw.trim().toLowerCase();
    if (value === "system-admin" || value === "admin" || value === "sysadmin") {
      return "system-admin";
    }
    if (
      value === "reliability-manager" ||
      value === "manager" ||
      value === "reliability"
    ) {
      return "reliability-manager";
    }
    if (value === "plant-engineer" || value === "engineer") {
      return "plant-engineer";
    }
    if ((STRUCTURED_ROLES as readonly string[]).includes(value)) {
      return value as AppRole;
    }
  }
  // Unknown/legacy default: least privilege.
  return "plant-engineer";
}

const ALL_MODULE_VIEWS: readonly Permission[] = [
  "view_module:vibration",
  "view_module:thermography",
  "view_module:ultrasound",
  "view_module:oil"
];

/**
 * The matrix. plant-engineer is the least-privilege field role: it may read
 * vibration/oil data and check in a route it already owns, but cannot create
 * assessments, log good catches, check routes out, or manage users.
 */
export const ROLE_PERMISSIONS: Readonly<
  Record<AppRole, readonly Permission[]>
> = {
  "plant-engineer": [
    "view_module:vibration",
    "view_module:oil",
    "route.checkin",
    "bearing.write",
    "reports.export",
    "anomaly.view",
    "diagnostics:run",
    "diagnostics:read",
    "assets:read",
    "assets:write",
    "notes:write",
    "spectrum:capture",
    "reports:read"
  ],
  "reliability-manager": [
    ...ALL_MODULE_VIEWS,
    "assessment.save",
    "goodcatch.write",
    "route.checkout",
    "route.checkin",
    "bearing.write",
    "reports.export",
    "anomaly.view",
    "users.manage",
    "recipients.manage",
    "diagnostics:run",
    "diagnostics:read",
    "assets:read",
    "assets:write",
    "notes:write",
    "spectrum:capture",
    "reports:read",
    "reports:write",
    "workorders:write",
    "users:invite"
  ],
  "system-admin": [
    ...ALL_MODULE_VIEWS,
    "assessment.save",
    "goodcatch.write",
    "route.checkout",
    "route.checkin",
    "bearing.write",
    "reports.export",
    "anomaly.view",
    "users.manage",
    "recipients.manage",
    "system.admin",
    "diagnostics:run",
    "diagnostics:read",
    "assets:read",
    "assets:write",
    "notes:write",
    "spectrum:capture",
    "reports:read",
    "reports:write",
    "workorders:write",
    "users:invite",
    "users:manage",
    "tenants:manage",
    "system:admin"
  ]
};

export interface RoleBearer {
  role?: unknown;
}

/** Canonicalize an existing role string without inventing a new one. */
export function canonicalRole(raw: unknown): AppRole {
  return normalizeRole(raw);
}

/** Exact canonical role accepted by owner assignment (legacy aliases are not written). */
export function parseAssignableRole(raw: unknown): AppRole | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  return (CANONICAL_ROLES as readonly string[]).includes(value)
    ? (value as AppRole)
    : null;
}

export function hasPermission(role: unknown, permission: Permission): boolean {
  const canonical = normalizeRole(role);
  return ROLE_PERMISSIONS[canonical].includes(permission);
}

/** UI/server helper: effective permission for a session user. */
export function can(
  user: RoleBearer | null | undefined,
  permission: Permission
): boolean {
  if (!user) return false;
  return hasPermission(user.role, permission);
}

/**
 * Existing owner/admin bar, now expressed once through the matrix.
 * reliability-manager and system-admin both hold users.manage, which is the
 * same population that roleAtLeast(..., "reliability-manager") accepted.
 */
export function isTenantAdminRole(role: unknown): boolean {
  return hasPermission(role, "users.manage");
}

/** Roles this actor may assign. Only a platform system-admin may create another. */
export function assignableRoles(actorRole: unknown): readonly AppRole[] {
  return normalizeRole(actorRole) === "system-admin"
    ? CANONICAL_ROLES
    : ["plant-engineer", "reliability-manager"];
}

/** Active entitlements INTERSECT role view permissions. */
export function effectiveModuleKeys(
  activeModuleKeys: readonly string[] | null | undefined,
  user: RoleBearer | null | undefined
): ModuleKey[] {
  if (!user || !Array.isArray(activeModuleKeys)) return [];
  return ALL_MODULE_VIEWS.filter(
    (permission) =>
      activeModuleKeys.includes(permission.slice("view_module:".length)) &&
      can(user, permission)
  ).map((permission) => permission.slice("view_module:".length) as ModuleKey);
}

/** Server enforcement: 401 without a session, 403 without the role permission. */
export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res
        .status(401)
        .json({ error: "Authentication required", code: "NO_SESSION" });
    }
    if (!can(req.auth.user, permission)) {
      return res.status(403).json({
        error:
          "Your role does not allow that action. Ask a tenant owner/admin to update your role.",
        code: "ROLE_FORBIDDEN",
        permission
      });
    }
    return next();
  };
}

export type RoleChangeBlockReason = "SELF_DEMOTION" | "LAST_ADMIN";

export interface RoleChangeEvaluation {
  ok: boolean;
  reason: RoleChangeBlockReason | null;
  message: string | null;
}

/**
 * USERS-1 guard pattern (src/lib/tenantInvites.ts:126 evaluateDisableUser),
 * reused for role changes: never allow self-demotion and never leave a tenant
 * with zero active admin-capable users.
 */
export function evaluateRoleChange(input: {
  targetId: number;
  currentUserId: number;
  targetRole: unknown;
  newRole: unknown;
  tenantUsers: ReadonlyArray<{
    id: number;
    role?: unknown;
    is_disabled?: boolean | number | null;
  }>;
}): RoleChangeEvaluation {
  const targetIsAdmin = isTenantAdminRole(input.targetRole);
  const nextIsAdmin = isTenantAdminRole(input.newRole);

  if (
    input.targetId === input.currentUserId &&
    targetIsAdmin &&
    !nextIsAdmin
  ) {
    return {
      ok: false,
      reason: "SELF_DEMOTION",
      message: "You cannot remove your own admin access. Ask another admin to change your role."
    };
  }

  if (targetIsAdmin && !nextIsAdmin) {
    const otherActiveAdmins = input.tenantUsers.filter(
      (user) =>
        Number(user.id) !== input.targetId &&
        !user.is_disabled &&
        isTenantAdminRole(user.role)
    );
    if (otherActiveAdmins.length === 0) {
      return {
        ok: false,
        reason: "LAST_ADMIN",
        message:
          "At least one active admin must remain for this tenant. Promote another user first."
      };
    }
  }

  return { ok: true, reason: null, message: null };
}

/**
 * UI-only convenience for components that do not receive the session object.
 * Reads the existing cached session (instant-paint cache); the server remains
 * the only authority and rejects a hidden-but-requested tool with 403.
 */
export function cachedSessionRole(): unknown {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem("motormedic_user_session");
    if (!raw) return null;
    return JSON.parse(raw)?.role ?? null;
  } catch {
    return null;
  }
}

export function canCurrent(permission: Permission): boolean {
  return can({ role: cachedSessionRole() }, permission);
}
