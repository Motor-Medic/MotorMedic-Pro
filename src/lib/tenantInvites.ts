/**
 * USERS-1 - tenant owner/admin invites.
 *
 * Extends the EXISTING AR-29 invite/auth machinery (auth_invites already has
 * company_id, created_by, token_hash, expires_at and used_at; see
 * migrations/008_auth_sessions_rbac.sql and server.ts initializeDatabase).
 * This module only adds the token/email helpers for the tenant-scoped flow.
 *
 * Token rule: the raw token is crypto.randomBytes(32) hex and is only ever
 * placed in the invite email. The database stores its SHA-256 hex digest, so
 * a resend can rotate the hash without any raw token existing server-side.
 */
import crypto from "crypto";
import {
  isValidEmail,
  normalizeEmail,
  type NotificationInsert
} from "./notifications";
import { normalizeRole, roleAtLeast } from "./auth/rbac";

export const INVITE_TOKEN_BYTES = 32;
export const INVITE_TTL_DAYS = 7;
export const DEFAULT_INVITED_ROLE = "plant-engineer";
export const DEV_APP_BASE_URL = "http://localhost:3000";

/** Raw invite token: 32 random bytes as hex, sent only in the email. */
export function generateInviteToken(): string {
  return crypto.randomBytes(INVITE_TOKEN_BYTES).toString("hex");
}

/** Server-side lookup key: sha256 of the raw token, hex. */
export function hashInviteToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function inviteExpiryFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function resolveAppBaseUrl(
  env: NodeJS.ProcessEnv = process.env
): string {
  const configured = env.APP_BASE_URL?.trim();
  return (configured || DEV_APP_BASE_URL).replace(/\/+$/, "");
}

export function buildInviteAcceptUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/invite/${encodeURIComponent(token)}`;
}

export function isInviteExpired(
  invite: { expires_at?: string | Date | null },
  now: Date = new Date()
): boolean {
  if (!invite.expires_at) return true;
  const expiresAt = new Date(invite.expires_at).getTime();
  return !Number.isFinite(expiresAt) || expiresAt <= now.getTime();
}

export function isInviteUsable(
  invite: {
    expires_at?: string | Date | null;
    used_at?: string | Date | null;
    revoked_at?: string | Date | null;
  },
  now: Date = new Date()
): boolean {
  return (
    !invite.used_at &&
    !invite.revoked_at &&
    !isInviteExpired(invite, now)
  );
}

export interface InviteNotificationInput {
  tenantId: number;
  to: string | null | undefined;
  tenantName?: string | null;
  acceptUrl: string;
}

export function buildInviteNotification(
  input: InviteNotificationInput
): NotificationInsert {
  const tenant = String(input.tenantName || "your tenant").trim();
  return {
    tenant_id: input.tenantId,
    user_id: null,
    channel: "email",
    kind: "invite",
    recipient_email: isValidEmail(input.to) ? normalizeEmail(input.to) : null,
    subject: `You're invited to ${tenant} - Spectra CM`,
    body_text: [
      `You have been invited to join ${tenant} in Spectra CM.`,
      "",
      "Set your password and accept the invite here:",
      input.acceptUrl,
      "",
      `This invite expires in ${INVITE_TTL_DAYS} days and can only be used once.`,
      "If you were not expecting this invite, you can ignore this email."
    ].join("\n"),
    status: "pending",
    error: null,
    sent_at: null,
    read_at: null
  };
}

export type DisableUserBlockReason = "SELF" | "LAST_ADMIN";

export interface DisableUserEvaluation {
  ok: boolean;
  reason: DisableUserBlockReason | null;
  message: string | null;
}

export function isTenantAdmin(role: unknown): boolean {
  return roleAtLeast(normalizeRole(role), "reliability-manager");
}

/**
 * Guard for the disable action. Self-disable is always blocked. Removing the
 * last active tenant admin is blocked so a tenant can never be left with no
 * one able to invite, disable, or re-enable users.
 */
export function evaluateDisableUser(input: {
  targetId: number;
  currentUserId: number;
  targetRole: unknown;
  tenantUsers: ReadonlyArray<{
    id: number;
    role?: unknown;
    is_disabled?: boolean | number | null;
  }>;
}): DisableUserEvaluation {
  if (input.targetId === input.currentUserId) {
    return {
      ok: false,
      reason: "SELF",
      message: "You cannot disable your own account."
    };
  }
  if (isTenantAdmin(input.targetRole)) {
    const otherActiveAdmins = input.tenantUsers.filter(
      (user) =>
        Number(user.id) !== input.targetId &&
        !user.is_disabled &&
        isTenantAdmin(user.role)
    );
    if (otherActiveAdmins.length === 0) {
      return {
        ok: false,
        reason: "LAST_ADMIN",
        message:
          "At least one active admin must remain for this tenant. Enable or promote another admin first."
      };
    }
  }
  return { ok: true, reason: null, message: null };
}
