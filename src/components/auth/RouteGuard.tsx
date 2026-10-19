/**
 * AR-29 rule 3/8 — client-side route gating that mirrors the server guard.
 * The server is authoritative (session cookie + RBAC); this component only
 * keeps unauthorized tabs from even rendering. Sessions are validated by
 * GET /api/auth/session on boot, never trusted from localStorage alone.
 */
import React from "react";
import type { UserSession } from "../Login";
import { normalizeRole, roleHasPermission } from "../../lib/auth/rbac";
import { ShieldAlert } from "lucide-react";

interface RouteGuardProps {
  user: UserSession | null;
  /** Require any one of these structured roles. */
  roles?: readonly string[];
  /** Require a specific RBAC permission (see ROLE_PERMISSIONS). */
  permission?: string;
  /** Rendered instead of children when access is denied (or null → fallback). */
  denied?: React.ReactNode;
  children: React.ReactNode;
}

function AccessDenied() {
  return (
    <div
      className="flex flex-col items-center justify-center py-20 text-center gap-3"
      id="route-access-denied"
    >
      <ShieldAlert className="h-10 w-10 text-red-400" />
      <h2 className="text-lg font-semibold text-slate-200">Access Restricted</h2>
      <p className="text-sm text-slate-400 max-w-sm">
        Your account role does not grant access to this area. Contact a system
        administrator if you believe this is an error.
      </p>
    </div>
  );
}

export default function RouteGuard({
  user,
  roles,
  permission,
  denied,
  children,
}: RouteGuardProps) {
  if (!user) return denied ?? <AccessDenied />;

  const role = normalizeRole(user.role);
  const roleOk = roles ? roles.map((r) => normalizeRole(r)).includes(role) : true;
  const permOk = permission ? roleHasPermission(role, permission) : true;

  if (!roleOk || !permOk) return denied ?? <AccessDenied />;
  return <>{children}</>;
}
