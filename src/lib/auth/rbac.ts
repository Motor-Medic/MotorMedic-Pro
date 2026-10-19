/**
 * AR-29 rule 8 — RBAC. The session carries a structured role; the server
 * enforces per-route permissions from it. Legacy DB values ("engineer",
 * "manager", "admin") are mapped onto the structured role set at session
 * load so no route ever compares free-form strings.
 */
import type { AppRole } from "./types";

const STRUCTURED_ROLES: readonly AppRole[] = [
  "plant-engineer",
  "reliability-manager",
  "system-admin",
];

/** Map legacy/free-form role strings from the users table to AppRole. */
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

export const ROLE_PERMISSIONS: Readonly<Record<AppRole, readonly string[]>> = {
  "plant-engineer": [
    "diagnostics:run",
    "diagnostics:read",
    "assets:read",
    "assets:write",
    "notes:write",
    "spectrum:capture",
    "reports:read",
  ],
  "reliability-manager": [
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
  ],
  "system-admin": [
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
    "system:admin",
  ],
};

export function roleHasPermission(role: AppRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function roleAtLeast(role: AppRole, minimum: AppRole): boolean {
  const order: AppRole[] = ["plant-engineer", "reliability-manager", "system-admin"];
  return order.indexOf(role) >= order.indexOf(minimum);
}
