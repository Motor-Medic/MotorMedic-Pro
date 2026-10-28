/**
 * NOTIFICATIONS-1 - notification ledger contracts and pure builders.
 *
 * The ledger records EVERY dispatch attempt, including failed and skipped
 * sends, so an email problem is visible in AdminPanel instead of vanishing.
 *
 * Tenancy rule: every row is built with a tenant_id supplied by the caller
 * from the verified session. Builders additionally filter recipient/user
 * lists by that same tenant id, so a mixed list can never leak a cross-tenant
 * recipient into another tenant's alert fan-out.
 */
import {
  sendEmail,
  type EmailDispatchResult,
  type SendEmailInput
} from "./email";

export const NOTIFICATION_CHANNELS = ["email", "in_app"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_KINDS = [
  "alert",
  "receipt",
  "welcome",
  "invite",
  "digest"
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_STATUSES = [
  "pending",
  "sent",
  "failed",
  "skipped"
] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export interface NotificationInsert {
  tenant_id: number;
  user_id: number | null;
  channel: NotificationChannel;
  kind: NotificationKind;
  recipient_email: string | null;
  subject: string;
  body_text: string;
  status: NotificationStatus;
  error?: string | null;
  sent_at?: Date | string | null;
  read_at?: Date | string | null;
}

export interface NotificationRepository {
  insert(row: NotificationInsert): Promise<unknown>;
}

export type NotificationEmailSender = (
  input: SendEmailInput
) => Promise<EmailDispatchResult>;

export interface TenantNotificationUser {
  id: number;
  tenant_id: number;
  email?: string | null;
}

export interface TenantAlertRecipient {
  id: number;
  tenant_id: number;
  email: string;
}

export interface AlertNotificationSource {
  id?: string | number | null;
  title: string;
  description?: string | null;
  severity?: string | null;
  asset_id?: string | number | null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidEmail(value: unknown): boolean {
  return EMAIL_PATTERN.test(normalizeEmail(value));
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return String(err ?? "Unknown notification error");
}

export function alertSubject(alert: AlertNotificationSource): string {
  const title = String(alert.title || "Condition alert").trim();
  const severity = String(alert.severity || "").trim().toUpperCase();
  return severity ? `${severity} alert: ${title}` : `Alert: ${title}`;
}

export function alertBody(alert: AlertNotificationSource): string {
  const lines = [
    String(alert.title || "Condition alert").trim(),
    String(alert.description || "").trim(),
    alert.severity ? `Severity: ${String(alert.severity).toUpperCase()}` : "",
    alert.asset_id != null ? `Asset: ${String(alert.asset_id)}` : "",
    alert.id != null ? `Alert ID: ${String(alert.id)}` : ""
  ].filter((line) => line.length > 0);
  return lines.join("\n");
}

export function buildAlertInAppRows(input: {
  tenantId: number;
  alert: AlertNotificationSource;
  users: readonly TenantNotificationUser[];
  now?: Date;
}): NotificationInsert[] {
  const now = input.now ?? new Date();
  const subject = alertSubject(input.alert);
  const body = alertBody(input.alert);
  return input.users
    .filter((user) => Number(user.tenant_id) === input.tenantId)
    .map((user) => ({
      tenant_id: input.tenantId,
      user_id: Number(user.id),
      channel: "in_app" as const,
      kind: "alert" as const,
      recipient_email: null,
      subject,
      body_text: body,
      status: "sent" as const,
      error: null,
      sent_at: now,
      read_at: null
    }));
}

export function buildAlertEmailRows(input: {
  tenantId: number;
  alert: AlertNotificationSource;
  recipients: readonly TenantAlertRecipient[];
}): NotificationInsert[] {
  const subject = alertSubject(input.alert);
  const body = alertBody(input.alert);
  const seen = new Set<string>();
  const rows: NotificationInsert[] = [];
  for (const recipient of input.recipients) {
    if (Number(recipient.tenant_id) !== input.tenantId) continue;
    const email = normalizeEmail(recipient.email);
    if (!isValidEmail(email) || seen.has(email)) continue;
    seen.add(email);
    rows.push({
      tenant_id: input.tenantId,
      user_id: null,
      channel: "email",
      kind: "alert",
      recipient_email: email,
      subject,
      body_text: body,
      status: "pending",
      error: null,
      sent_at: null,
      read_at: null
    });
  }
  return rows;
}

export function buildWelcomeEmail(input: {
  tenantId: number;
  to: string | null | undefined;
  companyName?: string | null;
}): NotificationInsert {
  const company = String(input.companyName || "your plant").trim();
  return {
    tenant_id: input.tenantId,
    user_id: null,
    channel: "email",
    kind: "welcome",
    recipient_email: isValidEmail(input.to) ? normalizeEmail(input.to) : null,
    subject: `Welcome to Spectra CM - ${company}`,
    body_text: [
      `Welcome to Spectra CM, ${company}.`,
      "",
      "Your tenant is provisioned and ready.",
      "Sign in with the account created during checkout to begin configuring assets and running diagnostics."
    ].join("\n"),
    status: "pending",
    error: null,
    sent_at: null,
    read_at: null
  };
}

export function buildReceiptEmail(input: {
  tenantId: number;
  to: string | null | undefined;
  companyName?: string | null;
  modules?: readonly string[];
  amountCents?: number | null;
  checkoutRef?: string | null;
}): NotificationInsert {
  const company = String(input.companyName || "your account").trim();
  const modules = (input.modules ?? []).map(String).join(", ");
  const amount =
    input.amountCents != null && Number.isFinite(Number(input.amountCents))
      ? `$${(Number(input.amountCents) / 100).toFixed(2)}`
      : null;
  return {
    tenant_id: input.tenantId,
    user_id: null,
    channel: "email",
    kind: "receipt",
    recipient_email: isValidEmail(input.to) ? normalizeEmail(input.to) : null,
    subject: `Payment receipt - Spectra CM - ${company}`,
    body_text: [
      `Payment received for ${company}.`,
      amount ? `Amount: ${amount}` : "",
      modules ? `Modules: ${modules}` : "",
      input.checkoutRef ? `Checkout reference: ${input.checkoutRef}` : "",
      "",
      "Thank you for subscribing to Spectra CM."
    ]
      .filter((line, index, all) => line.length > 0 || index < all.length - 1)
      .join("\n"),
    status: "pending",
    error: null,
    sent_at: null,
    read_at: null
  };
}

/**
 * Send a queued email row, then persist the final status. Provider failures
 * become 'failed' rows; a missing key becomes 'skipped'. The ledger insert is
 * the only operation allowed to reject, and the server call sites attach a
 * .catch() that records a final failed row as a last resort.
 */
export async function dispatchEmailNotification(
  repository: NotificationRepository,
  row: NotificationInsert,
  send: NotificationEmailSender = sendEmail
): Promise<void> {
  const to = normalizeEmail(row.recipient_email);
  if (!to) {
    await repository.insert({
      ...row,
      status: "skipped",
      error: "No valid recipient email.",
      sent_at: null
    });
    return;
  }

  let result: EmailDispatchResult;
  try {
    result = await send({ to, subject: row.subject, body: row.body_text });
  } catch (err) {
    result = { status: "failed", error: errorMessage(err), id: null };
  }

  await repository.insert({
    ...row,
    recipient_email: to,
    status: result.status,
    error: result.error ?? null,
    sent_at: result.status === "sent" ? new Date() : null
  });
}

export function failedNotificationRow(
  row: NotificationInsert,
  err: unknown
): NotificationInsert {
  return {
    ...row,
    status: "failed",
    error: errorMessage(err),
    sent_at: null
  };
}
