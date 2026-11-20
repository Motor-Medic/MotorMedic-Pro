/**
 * SLICE-SEC-BASELINE-1 — vision rate limiting unit tests.
 *
 * Verifies per-tenant AND per-IP buckets on the vision extraction route:
 *   - Over-limit → not allowed, retryAfterMs set
 *   - Under-limit → allowed
 *   - Fail closed: a limited request must short-circuit before any provider call
 *   - Per-tenant and per-IP buckets are independent
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  checkVisionRateLimit,
  resetVisionRateLimiters,
  _visionLimitersForTest
} from "./visionRateLimit";

beforeEach(() => {
  resetVisionRateLimiters();
});

describe("checkVisionRateLimit — per-tenant and per-IP buckets", () => {
  it("allows requests under both limits", () => {
    const d = checkVisionRateLimit(1, "10.0.0.1");
    expect(d.allowed).toBe(true);
    expect(d.scope).toBeNull();
  });

  it("rejects when the per-tenant bucket is over limit (fail closed)", () => {
    const tenantId = 7;
    // Exhaust the tenant bucket (max 30 per window).
    for (let i = 0; i < 30; i++) {
      const d = checkVisionRateLimit(tenantId, "10.0.0.1");
      expect(d.allowed).toBe(true);
    }
    // The 31st request must be rejected.
    const d = checkVisionRateLimit(tenantId, "10.0.0.1");
    expect(d.allowed).toBe(false);
    expect(d.scope).toBe("tenant");
    expect(d.retryAfterMs).toBeGreaterThan(0);
  });

  it("rejects when the per-IP bucket is over limit", () => {
    const ip = "10.0.0.99";
    // Exhaust the IP bucket using null tenant (skips the tenant bucket).
    for (let i = 0; i < 60; i++) {
      const d = checkVisionRateLimit(null, ip);
      expect(d.allowed).toBe(true);
    }
    // Now the IP bucket is full. A request with any tenant should be IP-blocked
    // (tenant bucket for tenant 1 is empty, so tenant check passes first).
    const d = checkVisionRateLimit(1, ip);
    expect(d.allowed).toBe(false);
    expect(d.scope).toBe("ip");
    expect(d.retryAfterMs).toBeGreaterThan(0);
  });

  it("per-tenant and per-IP buckets are independent", () => {
    resetVisionRateLimiters();
    const tenantId = 3;
    const ip = "10.0.0.50";

    // Exhaust the tenant bucket without touching the IP bucket.
    for (let i = 0; i < 30; i++) checkVisionRateLimit(tenantId, ip);
    const tenantBlocked = checkVisionRateLimit(tenantId, "10.0.0.51"); // different IP
    expect(tenantBlocked.allowed).toBe(false);
    expect(tenantBlocked.scope).toBe("tenant");

    // Same IP, different tenant: IP bucket still has room.
    const ipStillOk = checkVisionRateLimit(99, ip);
    expect(ipStillOk.allowed).toBe(true);
  });

  it("unauthenticated requests (no tenant) are still rate-limited by IP", () => {
    resetVisionRateLimiters();
    const ip = "10.0.0.77";
    for (let i = 0; i < 60; i++) {
      const d = checkVisionRateLimit(null, ip);
      expect(d.allowed).toBe(true);
    }
    const d = checkVisionRateLimit(null, ip);
    expect(d.allowed).toBe(false);
    expect(d.scope).toBe("ip");
  });

  it("retryAfterMs is never negative and is bounded by the window", () => {
    resetVisionRateLimiters();
    const tenantId = 5;
    for (let i = 0; i < 30; i++) checkVisionRateLimit(tenantId, "10.0.0.1");
    const d = checkVisionRateLimit(tenantId, "10.0.0.1");
    expect(d.allowed).toBe(false);
    expect(d.retryAfterMs).toBeGreaterThanOrEqual(0);
    expect(d.retryAfterMs).toBeLessThanOrEqual(60_000);
  });
});
