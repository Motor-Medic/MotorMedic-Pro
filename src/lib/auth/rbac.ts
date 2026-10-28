/**
 * AR-29 rule 8 - RBAC. The session carries a structured role; the server
 * enforces per-route permissions from it. Legacy DB values ("engineer",
 * "manager", "admin") are mapped onto the structured role set at session
 * load so no route ever compares free-form strings.
 *
 * ROLES-1 moved the ROLE_PERMISSIONS matrix and normalizeRole into
 * src/lib/roles.ts. This file keeps the original public API as thin delegates
 * so existing imports and the role ladder keep working unchanged.
 */
import type { AppRole } from "./types";
import { hasPermission, type Permission } from "../roles";

export { normalizeRole } from "../roles";

export function roleHasPermission(role: AppRole, permission: string): boolean {
  return hasPermission(role, permission as Permission);
}

export function roleAtLeast(role: AppRole, minimum: AppRole): boolean {
  const order: AppRole[] = ["plant-engineer", "reliability-manager", "system-admin"];
  return order.indexOf(role) >= order.indexOf(minimum);
}
