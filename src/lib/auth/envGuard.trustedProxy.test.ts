import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  assertTrustedProxyEnv,
  collectTrustedProxyErrors,
  isProductionEnv,
} from "./envGuard";

const STRONG_SECRET = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
const REAL_DB_URL = "postgresql://user:pass@db.internal.example.com:5432/app";

function prodEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: "production",
    SESSION_SECRET: STRONG_SECRET,
    DATABASE_URL: REAL_DB_URL,
    ...overrides,
  };
}

function devEnv(overrides: Record<string, string | undefined> = {}) {
  return { NODE_ENV: "development", ...overrides };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SEC-12 trusted proxy env guard", () => {
  it("isProductionEnv only true for NODE_ENV=production", () => {
    expect(isProductionEnv({ NODE_ENV: "production" })).toBe(true);
    expect(isProductionEnv({ NODE_ENV: "development" })).toBe(false);
    expect(isProductionEnv({})).toBe(false);
  });

  it("collectTrustedProxyErrors: production + missing TRUSTED_PROXY_IPS", () => {
    const errors = collectTrustedProxyErrors(prodEnv());
    expect(errors.join(" ")).toContain("TRUSTED_PROXY_IPS");
    expect(errors.join(" ")).toContain("missing");
  });

  it("collectTrustedProxyErrors: production + empty TRUSTED_PROXY_IPS", () => {
    const errors = collectTrustedProxyErrors(prodEnv({ TRUSTED_PROXY_IPS: "" }));
    expect(errors.join(" ")).toContain("TRUSTED_PROXY_IPS");
    expect(errors.join(" ")).toContain("missing");
  });

  it("collectTrustedProxyErrors: production + whitespace-only TRUSTED_PROXY_IPS", () => {
    const errors = collectTrustedProxyErrors(
      prodEnv({ TRUSTED_PROXY_IPS: "   " })
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it("collectTrustedProxyErrors: production + valid IPs and CIDRs", () => {
    const errors = collectTrustedProxyErrors(
      prodEnv({ TRUSTED_PROXY_IPS: "10.0.0.1, 10.0.0.0/8, ::1" })
    );
    expect(errors).toEqual([]);
  });

  it("collectTrustedProxyErrors: production + valid IPv4-mapped IPv6", () => {
    const errors = collectTrustedProxyErrors(
      prodEnv({ TRUSTED_PROXY_IPS: "::ffff:10.0.0.1" })
    );
    expect(errors).toEqual([]);
  });

  it("collectTrustedProxyErrors: tolerates trailing / double commas", () => {
    const errors = collectTrustedProxyErrors(
      prodEnv({ TRUSTED_PROXY_IPS: "10.0.0.1,," })
    );
    expect(errors).toEqual([]);
  });

  it("collectTrustedProxyErrors: malformed IP throws in production", () => {
    const errors = collectTrustedProxyErrors(
      prodEnv({ TRUSTED_PROXY_IPS: "10.0.0.999" })
    );
    expect(errors.join(" ")).toContain("invalid IP/CIDR");
    expect(errors.join(" ")).toContain("TRUSTED_PROXY_IPS");
  });

  it("collectTrustedProxyErrors: malformed input throws in dev too", () => {
    const errors = collectTrustedProxyErrors(
      devEnv({ TRUSTED_PROXY_IPS: "not-an-ip" })
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(" ")).toContain("invalid IP/CIDR");
  });

  it("collectTrustedProxyErrors: dev + missing is allowed (no error)", () => {
    const errors = collectTrustedProxyErrors(devEnv());
    expect(errors).toEqual([]);
  });

  it("assertTrustedProxyEnv throws in production when missing", () => {
    expect(() => assertTrustedProxyEnv(prodEnv())).toThrow(/SEC-12 trusted proxy/);
    expect(() => assertTrustedProxyEnv(prodEnv())).toThrow(/TRUSTED_PROXY_IPS/);
  });

  it("assertTrustedProxyEnv does not throw in production when valid", () => {
    expect(() =>
      assertTrustedProxyEnv(
        prodEnv({ TRUSTED_PROXY_IPS: "10.0.0.0/8" })
      )
    ).not.toThrow();
  });

  it("assertTrustedProxyEnv does not throw in dev when missing, but warns", () => {
    const warn = vi.mocked(console.warn);
    expect(() => assertTrustedProxyEnv(devEnv())).not.toThrow();
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.some((c) => String(c[0]).includes("TRUSTED_PROXY_IPS"))).toBe(true);
  });

  it("assertTrustedProxyEnv throws on malformed in dev", () => {
    expect(() =>
      assertTrustedProxyEnv(devEnv({ TRUSTED_PROXY_IPS: "999.999.999.999" }))
    ).toThrow(/SEC-12 trusted proxy/);
  });

  it("assertTrustedProxyEnv throws on malformed in production", () => {
    expect(() =>
      assertTrustedProxyEnv(prodEnv({ TRUSTED_PROXY_IPS: "garbage" }))
    ).toThrow(/SEC-12 trusted proxy/);
  });

  it("assertTrustedProxyEnv does not throw in dev when valid", () => {
    expect(() =>
      assertTrustedProxyEnv(devEnv({ TRUSTED_PROXY_IPS: "10.0.0.1" }))
    ).not.toThrow();
  });
});
