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
  scope: "tenant" | "ip" | "pre-auth" | null;
}

const VISION_PER_TENANT_MAX = 30;   // requests per window per tenant
const VISION_PER_IP_MAX = 60;       // requests per window per IP
const VISION_WINDOW_MS = 60_000;    // 1 minute

/**
 * SLICE-SEC-3 — cheap pre-auth throttle. Runs BEFORE any session lookup so a
 * flood of bogus cookies cannot turn into one DB query per request. The max is
 * deliberately higher than the per-IP vision max: it is a coarse flood guard,
 * not a replacement for the per-tenant / per-IP buckets below.
 */
const PRE_AUTH_PER_IP_MAX = 120;    // requests per window per IP
const PRE_AUTH_WINDOW_MS = 60_000;  // 1 minute

/**
 * SLICE-SEC-3 — key used when the immediate peer is unknown (App Router
 * `Request` has no socket). Every such request shares this one bucket. Fail
 * closed: an unidentifiable peer must never get a fresh per-request bucket.
 */
export const UNVERIFIED_CLIENT_KEY = "unverified";

const preAuthLimiter = createInMemoryRateLimiter({
  windowMs: PRE_AUTH_WINDOW_MS,
  max: PRE_AUTH_PER_IP_MAX,
});

const tenantLimiter = createInMemoryRateLimiter({
  windowMs: VISION_WINDOW_MS,
  max: VISION_PER_TENANT_MAX,
});

const ipLimiter = createInMemoryRateLimiter({
  windowMs: VISION_WINDOW_MS,
  max: VISION_PER_IP_MAX,
});

/**
 * SLICE-SEC-3 — normalize an address so allowlist entries and peers compare
 * consistently (IPv4-mapped IPv6, brackets, optional port).
 */
function normalizeIp(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  let value = raw.trim();
  if (!value) return null;
  if (value.startsWith("[")) {
    const close = value.indexOf("]");
    value = close === -1 ? value.slice(1) : value.slice(1, close);
  }
  if (value.toLowerCase().startsWith("::ffff:")) {
    value = value.slice("::ffff:".length);
  }
  // Strip an IPv4 port ("203.0.113.9:41234") but keep bare IPv6 intact.
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(value)) {
    value = value.slice(0, value.lastIndexOf(":"));
  }
  return value.toLowerCase() || null;
}

/** Parse the comma-separated TRUSTED_PROXY_IPS allowlist (exact IP matches). */
export function parseTrustedProxyIps(
  raw: string | null | undefined
): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((entry) => normalizeIp(entry))
    .filter((entry): entry is string => entry != null);
}

/** Read the trusted-proxy allowlist from the environment. */
export function trustedProxyIps(): string[] {
  return parseTrustedProxyIps(process.env.TRUSTED_PROXY_IPS);
}

export function isTrustedProxy(
  peerIp: string | null | undefined,
  allowlist: readonly string[]
): boolean {
  const peer = normalizeIp(peerIp);
  if (!peer) return false;
  return allowlist.some((entry) => normalizeIp(entry) === peer);
}

/**
 * SLICE-SEC-3 — resolve the client IP without trusting client-supplied
 * forwarding headers.
 *
 * X-Forwarded-For / X-Real-IP are only honored when the immediate peer is in
 * the TRUSTED_PROXY_IPS allowlist; otherwise the peer address itself is used,
 * so rotating the header cannot mint a fresh bucket.
 *
 * When the peer is unknown (App Router `Request` exposes no socket), this
 * returns null and callers fall back to the shared UNVERIFIED_CLIENT_KEY
 * bucket. Fail closed: no peer identity means no per-client bucket.
 */
export function resolveClientIp(input: {
  peerIp: string | null | undefined;
  forwardedFor?: string | null;
  realIp?: string | null;
  trustedProxies?: readonly string[];
}): string | null {
  const peer = normalizeIp(input.peerIp);
  if (!peer) return null;

  const allowlist = input.trustedProxies ?? trustedProxyIps();
  if (!isTrustedProxy(peer, allowlist)) {
    // Untrusted immediate peer: forwarding headers are attacker-controlled.
    return peer;
  }

  const forwarded = input.forwardedFor;
  if (typeof forwarded === "string") {
    const first = normalizeIp(forwarded.split(",")[0]);
    if (first) return first;
  }
  const realIp = normalizeIp(input.realIp);
  if (realIp) return realIp;
  return peer;
}

/**
 * SLICE-SEC-3 — pre-auth throttle. Call before tenantIdFromNextRequest or any
 * session lookup. Returns a 429-worthy decision when the IP floods.
 */
export function checkPreAuthRateLimit(
  ip: string | null
): VisionRateLimitDecision {
  const key = ip ?? UNVERIFIED_CLIENT_KEY;
  const decision = preAuthLimiter.check(`pre-auth:${key}`);
  if (!decision.allowed) {
    return {
      allowed: false,
      retryAfterMs: decision.retryAfterMs,
      scope: "pre-auth",
    };
  }
  return { allowed: true, retryAfterMs: 0, scope: null };
}

export function resetVisionRateLimiters(): void {
  tenantLimiter.reset();
  ipLimiter.reset();
  preAuthLimiter.reset();
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

  // Per-IP check (applies to every request, authenticated or not). A null IP
  // (unknown peer) shares the fail-closed unverified bucket instead of
  // bypassing the bucket entirely.
  const ipKey = ip ?? UNVERIFIED_CLIENT_KEY;
  {
    const decision = ipLimiter.check(`ip:${ipKey}`);
    if (!decision.allowed) {
      return { allowed: false, retryAfterMs: decision.retryAfterMs, scope: "ip" };
    }
  }

  return { allowed: true, retryAfterMs: 0, scope: null };
}

/** Exposed for tests only. */
export function _visionLimitersForTest() {
  return { tenantLimiter, ipLimiter, preAuthLimiter };
}
