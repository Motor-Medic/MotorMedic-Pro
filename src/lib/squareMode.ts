/**
 * Square test-mode / environment guard (non-negotiable).
 *
 * Tests must run offline with no live Square keys. The mock checkout client
 * and the unsigned-webhook path are therefore gated STRICTLY by
 * NODE_ENV === 'test' (or an explicit SQUARE_TEST_MODE=true in a non-production
 * boot). Production boot REFUSES SQUARE_TEST_MODE in the same fail-loud family
 * as the DATABASE_URL / SESSION_SECRET guard, so a signature bypass can never
 * fire in production.
 *
 * Environment/token coherence (S1b): the SDK `environment` is derived from a
 * SINGLE source. When both SQUARE_ENVIRONMENT and a recognizable
 * SQUARE_ACCESS_TOKEN are present they MUST agree; a sandbox token paired with
 * production (or a live token paired with sandbox) makes the process refuse to
 * start. This closes the divergence hole that would either 401 every call or,
 * worse, silently drop real charges into the sandbox.
 *
 * Webhook signature scheme is the official Square scheme, verified through the
 * installed SDK's WebhooksHelper: HMAC-SHA256 over
 * `notification_url + raw_body`, base64, carried in the
 * `x-square-hmacsha256-signature` header. (Square docs, "Verify and validate
 * an event notification"; node_modules/square/wrapper/WebhooksHelper.js.)
 * There is no timestamp or event_type component in Square's scheme.
 */
import crypto from "crypto";
import { WebhooksHelper } from "square";

export type SquareEnvironmentName = "sandbox" | "production";
export type SquareTokenEnvironment = SquareEnvironmentName | "unknown";

export interface SquareModeEnv {
  NODE_ENV?: string;
  SQUARE_TEST_MODE?: string;
  SQUARE_ENVIRONMENT?: string;
  SQUARE_ACCESS_TOKEN?: string;
  SQUARE_WEBHOOK_SIGNATURE_SECRET?: string;
  SQUARE_WEBHOOK_NOTIFICATION_URL?: string;
}

export const SQUARE_SIGNATURE_HEADER = "x-square-hmacsha256-signature";

export class SquareEnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SquareEnvironmentError";
  }
}

export function parseSquareEnvironment(
  value: string | undefined
): SquareEnvironmentName | null {
  if (value == null) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "sandbox" || normalized === "test") return "sandbox";
  if (normalized === "production" || normalized === "live") return "production";
  if (normalized === "https://connect.squareupsandbox.com") return "sandbox";
  if (normalized === "https://connect.squareup.com") return "production";
  if (normalized.includes("sandbox")) return "sandbox";
  return null;
}

/**
 * Best-effort token classification using Square's documented credential
 * formats. Tokens that do not match a known prefix are "unknown" and must be
 * paired with an explicit SQUARE_ENVIRONMENT.
 */
export function inferSquareTokenEnvironment(
  token: string | undefined
): SquareTokenEnvironment {
  const value = String(token ?? "").trim();
  if (!value) return "unknown";
  const lower = value.toLowerCase();
  if (lower.startsWith("sandbox-") || lower.startsWith("sandbox_")) {
    return "sandbox";
  }
  if (lower.startsWith("sq0atb-")) return "sandbox";
  if (lower.startsWith("sq0atp-") || lower.startsWith("sq0csp-")) {
    return "production";
  }
  return "unknown";
}

/**
 * Resolve the one environment the SDK client may use. Throws when the source
 * is missing/ambiguous or when the explicit environment disagrees with a
 * recognizable token type.
 */
export function resolveSquareEnvironmentName(
  env: SquareModeEnv = process.env
): SquareEnvironmentName {
  const rawExplicit = env.SQUARE_ENVIRONMENT?.trim();
  const explicit = parseSquareEnvironment(rawExplicit);
  if (rawExplicit && !explicit) {
    throw new SquareEnvironmentError(
      `Invalid SQUARE_ENVIRONMENT "${rawExplicit}". Use "sandbox" or "production".`
    );
  }

  const token = env.SQUARE_ACCESS_TOKEN?.trim();
  if (!token) {
    if (explicit) return explicit;
    throw new SquareEnvironmentError(
      "SQUARE_ACCESS_TOKEN or SQUARE_ENVIRONMENT is required to construct the Square client."
    );
  }

  const inferred = inferSquareTokenEnvironment(token);
  if (inferred === "unknown") {
    if (explicit) return explicit;
    throw new SquareEnvironmentError(
      "Unable to infer the Square environment from SQUARE_ACCESS_TOKEN. " +
        "Set SQUARE_ENVIRONMENT explicitly (sandbox | production) so the client cannot guess."
    );
  }

  if (explicit && explicit !== inferred) {
    throw new SquareEnvironmentError(
      `Square token/environment mismatch: SQUARE_ENVIRONMENT="${explicit}" but the ` +
        `access token is a ${inferred} token. Refusing to start; a mismatched pair ` +
        `would either fail auth or silently drop live charges into the sandbox.`
    );
  }

  return explicit ?? inferred;
}

/** Boot choke point: fail loud on an ambiguous/mismatched token+environment. */
export function assertSquareEnvironmentCoherence(
  env: SquareModeEnv = process.env
): void {
  const hasToken = Boolean(env.SQUARE_ACCESS_TOKEN?.trim());
  const hasExplicit = Boolean(env.SQUARE_ENVIRONMENT?.trim());
  if (!hasToken && !hasExplicit) return;
  resolveSquareEnvironmentName(env);
}

export function isSquareTestMode(env: SquareModeEnv = process.env): boolean {
  if (env.NODE_ENV === "test") return true;
  return env.SQUARE_TEST_MODE === "true" && env.NODE_ENV !== "production";
}

export function assertProductionSquareMode(
  env: SquareModeEnv = process.env
): void {
  if (env.NODE_ENV !== "production") return;
  if (env.SQUARE_TEST_MODE === "true") {
    const banner = [
      "============================================================",
      "FATAL (Square guard): refusing to start in production.",
      "   - SQUARE_TEST_MODE=true would enable the unsigned webhook path.",
      "   - A signature bypass in production can forge a paid checkout.",
      "Remove SQUARE_TEST_MODE (and set live SQUARE_* keys) then restart.",
      "============================================================"
    ].join("\n");
    throw new Error(banner);
  }
  // A live boot must also be coherent; ambiguous token/environment is refused.
  assertSquareEnvironmentCoherence(env);
}

let mockSequence = 0;

/**
 * Offline checkout stand-in. Returns a stable local URL that carries the mock
 * session id so the storefront success path can complete without Square.
 */
export function createMockCheckoutSession(origin: string): {
  id: string;
  url: string;
} {
  const id = `sq_test_mock_${Date.now().toString(36)}_${++mockSequence}_${crypto
    .randomBytes(6)
    .toString("hex")}`;
  const successUrl = `${origin}/storefront?checkout=success&checkout_session_id=${encodeURIComponent(
    id
  )}`;
  return { id, url: successUrl };
}

export interface WebhookVerificationInput {
  isTestMode: boolean;
  rawBody: Buffer | string | undefined;
  signature: string | undefined;
  secret: string | undefined;
  notificationUrl: string | undefined;
  parsedBody: unknown;
  verifySignature?: (input: {
    requestBody: string;
    signatureHeader: string;
    signatureKey: string;
    notificationUrl: string;
  }) => Promise<boolean>;
}

export class SquareWebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SquareWebhookVerificationError";
  }
}

/**
 * Single choke point for webhook authenticity. The unsigned path is reachable
 * ONLY when the caller passes isTestMode=true (which comes from the guarded
 * isSquareTestMode above). Anything else requires a configured signature key,
 * a signature header, the raw body and the notification URL, and delegates to
 * Square's official WebhooksHelper (HMAC-SHA256 of notificationUrl + body).
 */
export async function resolveSquareWebhookEvent(
  input: WebhookVerificationInput
): Promise<unknown> {
  if (input.isTestMode && (!input.secret || !input.signature)) {
    return input.parsedBody;
  }
  if (!input.secret) {
    throw new SquareWebhookVerificationError(
      "SQUARE_WEBHOOK_SIGNATURE_SECRET is not configured; refusing an unsigned webhook."
    );
  }
  if (!input.signature) {
    throw new SquareWebhookVerificationError(
      `Missing ${SQUARE_SIGNATURE_HEADER} header; refusing an unsigned webhook.`
    );
  }
  if (input.rawBody == null) {
    throw new SquareWebhookVerificationError(
      "Missing raw request body; cannot verify the Square signature."
    );
  }
  const notificationUrl = String(input.notificationUrl ?? "").trim();
  if (!notificationUrl) {
    throw new SquareWebhookVerificationError(
      "SQUARE_WEBHOOK_NOTIFICATION_URL is not configured; cannot verify the Square signature."
    );
  }

  const requestBody = Buffer.isBuffer(input.rawBody)
    ? input.rawBody.toString("utf8")
    : String(input.rawBody);
  const verify = input.verifySignature ?? WebhooksHelper.verifySignature;

  let valid: boolean;
  try {
    valid = await verify({
      requestBody,
      signatureHeader: input.signature,
      signatureKey: input.secret,
      notificationUrl
    });
  } catch (error: any) {
    throw new SquareWebhookVerificationError(
      `Square webhook signature verification failed: ${error?.message || "invalid signature"}`
    );
  }
  if (!valid) {
    throw new SquareWebhookVerificationError(
      "Invalid Square webhook signature."
    );
  }
  return input.parsedBody;
}
