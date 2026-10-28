/**
 * NOTIFICATIONS-1 - single email choke point.
 *
 * Transport choice: plain HTTPS to Resend's REST API via the platform `fetch`
 * (no SDK dependency, no extra bundle weight). This matches the pre-existing
 * Resend call in server.ts and keeps the request/response shape auditable.
 *
 * Tests inject a transport with setEmailTransport(); the default transport is
 * never touched in the test suite, so no network call is possible there.
 *
 * Boot guard: production refuses to start without RESEND_API_KEY, the same
 * fail-loud family as the DATABASE_URL / SESSION_SECRET guard in
 * src/lib/auth/envGuard.ts (assertProductionAuthEnv).
 */

export type EmailDispatchStatus = "sent" | "failed" | "skipped";

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
}

export interface EmailTransportInput extends SendEmailInput {
  apiKey: string;
  from: string;
}

export interface EmailTransportResult {
  id?: string | null;
}

export type EmailTransport = (
  input: EmailTransportInput
) => Promise<EmailTransportResult | void>;

export interface EmailDispatchResult {
  status: EmailDispatchStatus;
  error: string | null;
  id?: string | null;
}

export interface SendEmailOptions {
  env?: NodeJS.ProcessEnv;
  transport?: EmailTransport;
  from?: string;
  warn?: (message: string) => void;
}

/** The pre-existing sender identity used by the legacy alert dispatch. */
export const DEFAULT_EMAIL_FROM = "Spectra Alerts <onboarding@resend.dev>";
export const RESEND_EMAILS_ENDPOINT = "https://api.resend.com/emails";

let injectedTransport: EmailTransport | null = null;

/** Test/dev hook: replace the network transport. Pass null to restore. */
export function setEmailTransport(transport: EmailTransport | null): void {
  injectedTransport = transport;
}

export function __resetEmailTransportForTests(): void {
  injectedTransport = null;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return String(err ?? "Unknown email transport error");
}

/** Default transport: plain HTTPS against the Resend REST API. */
const resendHttpsTransport: EmailTransport = async ({
  apiKey,
  from,
  to,
  subject,
  body
}) => {
  const response = await fetch(RESEND_EMAILS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      // Plain-text bodies per NOTIFICATIONS-1; no HTML template assembly here.
      text: body
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Resend API returned ${response.status}${detail ? `: ${detail}` : ""}`
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | { id?: string }
    | null;
  return { id: payload?.id ?? null };
};

/**
 * Send one plain-text email. Never throws for a provider failure: the result
 * carries the status so the notification ledger can persist 'failed' instead
 * of losing the event. Dev/memory mode (no key) records 'skipped' + warns.
 */
export async function sendEmail(
  input: SendEmailInput,
  options: SendEmailOptions = {}
): Promise<EmailDispatchResult> {
  const env = options.env ?? process.env;
  const apiKey = env.RESEND_API_KEY?.trim() || "";
  const warn = options.warn ?? console.warn;

  if (!apiKey) {
    warn(
      "[email] RESEND_API_KEY is not configured; recording notification as skipped."
    );
    return { status: "skipped", error: null, id: null };
  }

  const transport = options.transport ?? injectedTransport ?? resendHttpsTransport;
  const from = options.from ?? DEFAULT_EMAIL_FROM;

  try {
    const result = await transport({
      apiKey,
      from,
      to: input.to,
      subject: input.subject,
      body: input.body
    });
    return {
      status: "sent",
      error: null,
      id: result && typeof result === "object" ? result.id ?? null : null
    };
  } catch (err) {
    return { status: "failed", error: errorMessage(err), id: null };
  }
}

export interface EmailEnvLike {
  NODE_ENV?: string;
  RESEND_API_KEY?: string;
}

/** Production boot refuses to start without a configured email provider. */
export function assertProductionEmailEnv(env: EmailEnvLike = process.env): void {
  if (env.NODE_ENV !== "production") return;
  if (env.RESEND_API_KEY?.trim()) return;

  const banner = [
    "============================================================",
    "FATAL (email guard): refusing to start in production.",
    "   - RESEND_API_KEY is missing.",
    "   - Alert, welcome and receipt email would be silently skipped.",
    "Set RESEND_API_KEY then restart (same fail-loud family as the",
    "DATABASE_URL / SESSION_SECRET guard in src/lib/auth/envGuard.ts).",
    "============================================================"
  ].join("\n");
  throw new Error(banner);
}
