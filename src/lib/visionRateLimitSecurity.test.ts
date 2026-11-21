/**
 * SLICE-SEC-3 — request-gate hardening tests.
 *
 * Covers:
 *   - spoofed X-Forwarded-For from an untrusted peer does NOT get a fresh bucket
 *   - trusted-proxy XFF / X-Real-IP is honored
 *   - unknown peer fails closed into one shared "unverified" bucket
 *   - pre-auth flood is throttled before any session/DB lookup
 *   - the per-tenant limit is still enforced alongside the pre-auth throttle
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  UNVERIFIED_CLIENT_KEY,
  checkPreAuthRateLimit,
  checkVisionRateLimit,
  isTrustedProxy,
  parseTrustedProxyIps,
  resetVisionRateLimiters,
  resolveClientIp
} from "./visionRateLimit";

beforeEach(() => {
  resetVisionRateLimiters();
});

describe("resolveClientIp — trusted-proxy allowlist", () => {
  it("ignores spoofed X-Forwarded-For from an untrusted peer", () => {
    const ip = resolveClientIp({
      peerIp: "203.0.113.9",
      forwardedFor: "198.51.100.77",
      realIp: "198.51.100.78",
      trustedProxies: ["10.0.0.1"]
    });
    expect(ip).toBe("203.0.113.9");
  });

  it("honors X-Forwarded-For when the immediate peer is a trusted proxy", () => {
    const ip = resolveClientIp({
      peerIp: "10.0.0.1",
      forwardedFor: "198.51.100.77, 10.0.0.1",
      trustedProxies: ["10.0.0.1"]
    });
    expect(ip).toBe("198.51.100.77");
  });

  it("honors X-Real-IP when a trusted proxy sent no X-Forwarded-For", () => {
    const ip = resolveClientIp({
      peerIp: "10.0.0.1",
      realIp: "198.51.100.78",
      trustedProxies: ["10.0.0.1"]
    });
    expect(ip).toBe("198.51.100.78");
  });

  it("returns null for an unknown peer (fail closed to the unverified bucket)", () => {
    const ip = resolveClientIp({
      peerIp: null,
      forwardedFor: "198.51.100.77",
      trustedProxies: ["10.0.0.1"]
    });
    expect(ip).toBeNull();
  });

  it("parses and normalizes the TRUSTED_PROXY_IPS allowlist", () => {
    const allowlist = parseTrustedProxyIps(" 10.0.0.1, ::ffff:10.0.0.2 ,");
    expect(allowlist).toEqual(["10.0.0.1", "10.0.0.2"]);
    expect(isTrustedProxy("::ffff:10.0.0.2", allowlist)).toBe(true);
    expect(isTrustedProxy("203.0.113.9", allowlist)).toBe(false);
  });
});

describe("checkPreAuthRateLimit — pre-auth flood guard", () => {
  it("throttles a single-IP flood before any session lookup", () => {
    const ip = "198.51.100.20";
    for (let i = 0; i < 120; i++) {
      expect(checkPreAuthRateLimit(ip).allowed).toBe(true);
    }
    const decision = checkPreAuthRateLimit(ip);
    expect(decision.allowed).toBe(false);
    expect(decision.scope).toBe("pre-auth");
    expect(decision.retryAfterMs).toBeGreaterThan(0);
  });

  it("shares one bucket when the client IP is unknown", () => {
    for (let i = 0; i < 120; i++) {
      expect(checkPreAuthRateLimit(null).allowed).toBe(true);
    }
    expect(checkPreAuthRateLimit(null).allowed).toBe(false);
    expect(UNVERIFIED_CLIENT_KEY).toBe("unverified");
  });
});

describe("checkVisionRateLimit — existing limits stay intact", () => {
  it("still rejects the 31st request for one tenant under the pre-auth limit", () => {
    const tenantId = 7;
    const ip = "198.51.100.30";
    for (let i = 0; i < 30; i++) {
      expect(checkPreAuthRateLimit(ip).allowed).toBe(true);
      expect(checkVisionRateLimit(tenantId, ip).allowed).toBe(true);
    }
    expect(checkPreAuthRateLimit(ip).allowed).toBe(true);
    const decision = checkVisionRateLimit(tenantId, ip);
    expect(decision.allowed).toBe(false);
    expect(decision.scope).toBe("tenant");
  });

  it("does not let an unknown IP bypass the per-IP bucket", () => {
    for (let i = 0; i < 60; i++) {
      expect(checkVisionRateLimit(null, null).allowed).toBe(true);
    }
    const decision = checkVisionRateLimit(null, null);
    expect(decision.allowed).toBe(false);
    expect(decision.scope).toBe("ip");
  });
});
