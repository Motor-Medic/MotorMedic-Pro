/**
 * Stripe test-mode guard (non-negotiable).
 *
 * Tests must run offline with no live Stripe keys. The mock checkout client
 * and the unsigned-webhook path are therefore gated STRICTLY by
 * NODE_ENV === 'test' (or an explicit STRIPE_TEST_MODE=true in a non-production
 * boot). Production boot REFUSES STRIPE_TEST_MODE in the same fail-loud family
 * as the DATABASE_URL / SESSION_SECRET guard, so a signature bypass can never
 * fire in production.
 */
import crypto from "crypto";

export interface StripeModeEnv {
  NODE_ENV?: string;
  STRIPE_TEST_MODE?: string;
}

export function isStripeTestMode(env: StripeModeEnv = process.env): boolean {
  if (env.NODE_ENV === "test") return true;
  return env.STRIPE_TEST_MODE === "true" && env.NODE_ENV !== "production";
}

export function assertProductionStripeMode(env: StripeModeEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;
  if (env.STRIPE_TEST_MODE === "true") {
    const banner = [
      "════════════════════════════════════════════════════════════════",
      "❌ FATAL (Stripe guard): refusing to start in production.",
      "   • STRIPE_TEST_MODE=true would enable the unsigned webhook path.",
      "   • A signature bypass in production can forge checkout.session.completed.",
      "Remove STRIPE_TEST_MODE (and set live STRIPE_* keys) then restart.",
      "════════════════════════════════════════════════════════════════"
    ].join("\n");
    throw new Error(banner);
  }
}

let mockSequence = 0;

/**
 * Offline checkout stand-in. Returns a stable local URL that carries the mock
 * session id so the storefront success path can complete without Stripe.
 */
export function createMockCheckoutSession(origin: string): {
  id: string;
  url: string;
} {
  const id = `cs_test_mock_${Date.now().toString(36)}_${++mockSequence}_${crypto
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
  parsedBody: unknown;
  constructEvent: (rawBody: unknown, signature: string, secret: string) => unknown;
}

export class StripeWebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeWebhookVerificationError";
  }
}

/**
 * Single choke point for webhook authenticity. The unsigned path is reachable
 * ONLY when the caller passes isTestMode=true (which comes from the guarded
 * isStripeTestMode above). Anything else requires a configured secret + a
 * signature and delegates to Stripe's constructEvent.
 */
export function resolveStripeWebhookEvent(
  input: WebhookVerificationInput
): unknown {
  if (input.isTestMode && (!input.secret || !input.signature)) {
    return input.parsedBody;
  }
  if (!input.secret) {
    throw new StripeWebhookVerificationError(
      "STRIPE_WEBHOOK_SECRET is not configured; refusing an unsigned webhook."
    );
  }
  if (!input.signature) {
    throw new StripeWebhookVerificationError(
      "Missing stripe-signature header; refusing an unsigned webhook."
    );
  }
  if (input.rawBody == null) {
    throw new StripeWebhookVerificationError(
      "Missing raw request body; cannot verify the Stripe signature."
    );
  }
  return input.constructEvent(input.rawBody, input.signature, input.secret);
}
