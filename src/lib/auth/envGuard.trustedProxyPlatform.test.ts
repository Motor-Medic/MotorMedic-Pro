/**
 * SLICE-SEC-14 — `platform` sentinel for TRUSTED_PROXY_IPS.
 *
 * On a managed platform (Vercel) the reverse proxy has no fixed public IP
 * list, so SEC-12's IP/CIDR validator made production unbootable. The exact
 * literal `platform` (case-sensitive) now means "trust the immediate platform
 * hop", which the server wires to Express `trust proxy = 1`. Every other
 * non-IP/CIDR value still fails fast, and all SEC-12 behaviors are preserved:
 * prod+missing throws, malformed throws, dev+missing warns and stays untrusted.
 *
 * server.ts cannot be imported in tests, so the wiring is audited by source.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PLATFORM_TRUST_PROXY_HOPS,
  TRUSTED_PROXY_PLATFORM,
  assertTrustedProxyEnv,
  collectTrustedProxyErrors,
  trustedProxyIps,
} from "./envGuard";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const serverSrc = readFileSync(here("../../../server.ts"), "utf8");

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

describe("SEC-14 platform sentinel", () => {
  it("uses the exact literal and a single-hop trust proxy value", () => {
    expect(TRUSTED_PROXY_PLATFORM).toBe("platform");
    expect(PLATFORM_TRUST_PROXY_HOPS).toBe(1);
  });

  it("production + platform boots", () => {
    const env = prodEnv({ TRUSTED_PROXY_IPS: "platform" });
    expect(collectTrustedProxyErrors(env)).toEqual([]);
    expect(() => assertTrustedProxyEnv(env)).not.toThrow();
  });

  it("production + platform sets trust proxy 1 (marker, not an IP list)", () => {
    const env = prodEnv({ TRUSTED_PROXY_IPS: "platform" });
    expect(trustedProxyIps(env)).toBe(TRUSTED_PROXY_PLATFORM);
    expect(trustedProxyIps(env)).not.toBeInstanceOf(Array);
    expect(PLATFORM_TRUST_PROXY_HOPS).toBe(1);
    expect(serverSrc).toContain(
      "if (trustedProxyIps(process.env) === TRUSTED_PROXY_PLATFORM)"
    );
    expect(serverSrc).toContain(
      'app.set("trust proxy", PLATFORM_TRUST_PROXY_HOPS)'
    );
  });

  it("production + missing still throws", () => {
    expect(() => assertTrustedProxyEnv(prodEnv())).toThrow(
      /SEC-12 trusted proxy/
    );
    expect(collectTrustedProxyErrors(prodEnv()).join(" ")).toContain("missing");
  });

  it("production + garbage still throws", () => {
    expect(() =>
      assertTrustedProxyEnv(prodEnv({ TRUSTED_PROXY_IPS: "garbage" }))
    ).toThrow(/SEC-12 trusted proxy/);
    expect(
      collectTrustedProxyErrors(prodEnv({ TRUSTED_PROXY_IPS: "garbage" })).join(
        " "
      )
    ).toContain("invalid IP/CIDR");
  });

  it("development + platform boots without the missing-config warning", () => {
    const warn = vi.mocked(console.warn);
    expect(() =>
      assertTrustedProxyEnv(devEnv({ TRUSTED_PROXY_IPS: "platform" }))
    ).not.toThrow();
    expect(trustedProxyIps(devEnv({ TRUSTED_PROXY_IPS: "platform" }))).toBe(
      TRUSTED_PROXY_PLATFORM
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("wrong case PLATFORM throws in production and development", () => {
    expect(() =>
      assertTrustedProxyEnv(prodEnv({ TRUSTED_PROXY_IPS: "PLATFORM" }))
    ).toThrow(/SEC-12 trusted proxy/);
    expect(() =>
      assertTrustedProxyEnv(devEnv({ TRUSTED_PROXY_IPS: "PLATFORM" }))
    ).toThrow(/SEC-12 trusted proxy/);
    expect(
      collectTrustedProxyErrors(
        prodEnv({ TRUSTED_PROXY_IPS: "PLATFORM" })
      ).join(" ")
    ).toContain("invalid IP/CIDR");
  });

  it("platform must be used alone, not mixed with IP/CIDR entries", () => {
    expect(() =>
      assertTrustedProxyEnv(
        prodEnv({ TRUSTED_PROXY_IPS: "platform,10.0.0.1" })
      )
    ).toThrow(/must be used alone/);
  });

  it("preserves SEC-12 dev + missing: warns and stays untrusted", () => {
    const warn = vi.mocked(console.warn);
    expect(() => assertTrustedProxyEnv(devEnv())).not.toThrow();
    expect(warn).toHaveBeenCalled();
    expect(trustedProxyIps(devEnv())).toBeNull();
  });

  it("keeps IP/CIDR allowlists as lists (no trust proxy marker)", () => {
    const env = prodEnv({ TRUSTED_PROXY_IPS: "10.0.0.1, 10.0.0.0/8, ::1" });
    expect(collectTrustedProxyErrors(env)).toEqual([]);
    expect(trustedProxyIps(env)).toEqual(["10.0.0.1", "10.0.0.0/8", "::1"]);
  });
});
