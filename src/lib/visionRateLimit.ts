/**
 * SLICE-SEC-BASELINE-1 — per-tenant AND per-IP rate limiting for the
 * expensive vision extraction route (/api/oil-analysis/vision-extract).
 *
 * Reuses the existing `createInMemoryRateLimiter` from checkoutRateLimit.ts
 * (no new dependency). Two independent buckets are enforced:
 *   - per-tenant  (key: `tenant:<tenantId>`)
 *   - per-IP      (key: `ip:<ip>`)
 *
 * A request is rejected with HTTP 429 + Retry-After when EITHER bucket is
 * over limit. Fail closed: a limited request never reaches the vision
 * provider.
 */
import { createInMemoryRateLimiter } from "./checkoutRateLimit";

export interface VisionRateLimitDecision {
  allowed: boolean;
  retryAfterMs: number;
  scope: "tenant" | "ip" | null;
}

const VISION_PER_TENANT_MAX = 30;   // requests per window per tenant
const VISION_PER_IP_MAX = 60;       // requests per window per IP
const VISION_WINDOW_MS = 60_000;    // 1 minute

const tenantLimiter = createInMemoryRateLimiter({
  windowMs: VISION_WINDOW_MS,
  max: VISION_PER_TENANT_MAX,
});

const ipLimiter = createInMemoryRateLimiter({
  windowMs: VISION_WINDOW_MS,
  max: VISION_PER_IP_MAX,
});

export function resetVisionRateLimiters(): void {
  tenantLimiter.reset();
  ipLimiter.reset();
}

/**
 * Check both buckets. Returns the first rejection (tenant takes precedence).
 * Fail closed: when not allowed, the caller must short-circuit before any
 * provider call.
 */
export function checkVisionRateLimit(
  tenantId: number | null,
  ip: string | null
): VisionRateLimitDecision {
  // Per-tenant check (skip when no tenant — unauthenticated requests are
  // still subject to the per-IP bucket below).
  if (tenantId != null) {
    const decision = tenantLimiter.check(`tenant:${tenantId}`);
    if (!decision.allowed) {
      return { allowed: false, retryAfterMs: decision.retryAfterMs, scope: "tenant" };
    }
  }

  // Per-IP check (applies to every request, authenticated or not).
  if (ip != null) {
    const decision = ipLimiter.check(`ip:${ip}`);
    if (!decision.allowed) {
      return { allowed: false, retryAfterMs: decision.retryAfterMs, scope: "ip" };
    }
  }

  return { allowed: true, retryAfterMs: 0, scope: null };
}

/** Exposed for tests only. */
export function _visionLimitersForTest() {
  return { tenantLimiter, ipLimiter };
}
