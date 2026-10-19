import { describe, it, expect } from "vitest";
import {
  assertProductionAuthEnv,
  collectProductionEnvErrors,
  isDevAuthSeedEnabled,
  isProductionEnv,
} from "./envGuard";

const STRONG_SECRET = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
const REAL_DB_URL = "postgresql://user:pass@db.internal.example.com:5432/app";

describe("AR-29 production env guard", () => {
  it("passes with a strong secret and real database url", () => {
    expect(
      collectProductionEnvErrors({
        NODE_ENV: "production",
        SESSION_SECRET: STRONG_SECRET,
        DATABASE_URL: REAL_DB_URL,
      })
    ).toEqual([]);
  });

  it("rejects a missing SESSION_SECRET", () => {
    const errors = collectProductionEnvErrors({
      NODE_ENV: "production",
      DATABASE_URL: REAL_DB_URL,
    });
    expect(errors.join(" ")).toContain("SESSION_SECRET is missing");
  });

  it("rejects a placeholder SESSION_SECRET", () => {
    const errors = collectProductionEnvErrors({
      NODE_ENV: "production",
      SESSION_SECRET: "YOUR_SESSION_SECRET_HERE_0000000000000000",
      DATABASE_URL: REAL_DB_URL,
    });
    expect(errors.join(" ")).toMatch(/placeholder/i);
  });

  it("rejects short secrets and known CI-mock strings", () => {
    expect(
      collectProductionEnvErrors({
        NODE_ENV: "production",
        SESSION_SECRET: "tooshort",
        DATABASE_URL: REAL_DB_URL,
      }).join(" ")
    ).toContain("too short");

    expect(
      collectProductionEnvErrors({
        NODE_ENV: "production",
        SESSION_SECRET: "ci-mock-session-secret-xxxxxxxxxxxxxxxxxxxx",
        DATABASE_URL: REAL_DB_URL,
      }).join(" ")
    ).toContain("known default");
  });

  it("rejects placeholder / CI-mock DATABASE_URLs and missing values", () => {
    expect(
      collectProductionEnvErrors({
        NODE_ENV: "production",
        SESSION_SECRET: STRONG_SECRET,
      }).join(" ")
    ).toContain("DATABASE_URL is missing");

    expect(
      collectProductionEnvErrors({
        NODE_ENV: "production",
        SESSION_SECRET: STRONG_SECRET,
        DATABASE_URL: "postgres://localhost/ci_mock_db",
      }).join(" ")
    ).toContain("placeholder/CI-mock");
  });

  it("assertProductionAuthEnv throws loudly only in production", () => {
    const badEnv = { NODE_ENV: "production", SESSION_SECRET: "changeme" };
    expect(() => assertProductionAuthEnv(badEnv)).toThrow(/AR-29 env guard/);

    // Dev boots never throw (placeholders are expected in .env.example)
    expect(() =>
      assertProductionAuthEnv({ NODE_ENV: "development", SESSION_SECRET: "" })
    ).not.toThrow();
    expect(() => assertProductionAuthEnv({})).not.toThrow();
  });

  it("isProductionEnv only true for NODE_ENV=production", () => {
    expect(isProductionEnv({ NODE_ENV: "production" })).toBe(true);
    expect(isProductionEnv({ NODE_ENV: "Production" })).toBe(false);
    expect(isProductionEnv({})).toBe(false);
  });
});

describe("AR-29 dev seed gating", () => {
  it("requires the explicit opt-in", () => {
    expect(isDevAuthSeedEnabled({ ENABLE_DEV_AUTH_SEED: "true" })).toBe(true);
    expect(isDevAuthSeedEnabled({})).toBe(false);
    expect(isDevAuthSeedEnabled({ ENABLE_DEV_AUTH_SEED: "1" })).toBe(false);
    expect(isDevAuthSeedEnabled({ ENABLE_DEV_AUTH_SEED: "false" })).toBe(false);
  });

  it("is never effective in production", () => {
    expect(
      isDevAuthSeedEnabled({
        NODE_ENV: "production",
        ENABLE_DEV_AUTH_SEED: "true",
      })
    ).toBe(false);
  });
});
