/**
 * TLS-1 — connection-layer TLS normalization, boot probe, and observable
 * degradation. Fully offline: the probe is injected, no live DB is contacted.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetTlsModeForTests,
  buildPoolConfig,
  buildVerifyFullProbeConfig,
  getTlsMode,
  normalizeDatabaseUrl,
  resolveBootTlsMode,
  tlsConfigForMode,
  type TlsMode
} from "./dbConnection";

const DB_URL =
  "postgres://user:secret@ep-cool.neon.tech:5432/spectra?channel_binding=require";

const readRel = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const CONNECTION_LAYER = {
  "dbConnection.ts": readRel("./dbConnection.ts"),
  "db.ts": readRel("./db.ts"),
  "server.ts": readRel("../../server.ts"),
  "backfill-envelopes.ts": readRel("../../backfill-envelopes.ts"),
  "backfill-spectra.ts": readRel("../../backfill-spectra.ts")
};

interface TlsBearingConfig {
  sslmode?: string;
  ssl?: { rejectUnauthorized?: boolean };
}

/** The silent-MITM anti-pattern this slice must make impossible. */
function isSilentMitm(
  mode: TlsMode,
  config: TlsBearingConfig
): boolean {
  return (
    (mode === "verify-full" || config.sslmode === "verify-full") &&
    config.ssl?.rejectUnauthorized === false
  );
}

beforeEach(() => {
  __resetTlsModeForTests();
});

describe("TLS-1 G1 normalizer — pure URL rewrite", () => {
  it("strips existing sslmode/ssl* params and injects the resolved mode", () => {
    const input =
      "postgres://u:p@h:5432/db?sslmode=require&ssl=true&sslcert=%2Ftmp%2Fcert.pem&sslkey=%2Ftmp%2Fkey.pem&sslrootcert=%2Ftmp%2Fca.pem&sslnegotiation=direct";
    const output = normalizeDatabaseUrl(input, "verify-full");

    expect(output).toContain("sslmode=verify-full");
    expect(output).not.toContain("sslmode=require");
    expect(output).not.toMatch(/(?:^|[?&])ssl=/);
    expect(output).not.toContain("sslcert");
    expect(output).not.toContain("sslkey");
    expect(output).not.toContain("sslrootcert");
    expect(output).not.toContain("sslnegotiation");
  });

  it("preserves every other param verbatim, including channel_binding", () => {
    const input =
      "postgres://u:p@h:5432/db?channel_binding=require&application_name=spectra&sslmode=require&options=-c%20search_path%3Dpublic";
    const output = normalizeDatabaseUrl(input, "verify-full");

    expect(output).toContain("channel_binding=require");
    expect(output).toContain("application_name=spectra");
    expect(output).toContain("options=-c%20search_path%3Dpublic");
    expect(output).toContain("sslmode=verify-full");
    expect(output.match(/sslmode=/g)).toHaveLength(1);
  });

  it("adds the mode even when the URL has no query string, preserving the hash", () => {
    expect(normalizeDatabaseUrl("postgres://u:p@h:5432/db", "require")).toBe(
      "postgres://u:p@h:5432/db?sslmode=require"
    );
    expect(
      normalizeDatabaseUrl("postgres://u:p@h:5432/db#fragment", "verify-full")
    ).toBe("postgres://u:p@h:5432/db?sslmode=verify-full#fragment");
  });
});

describe("TLS-1 G1b single source of truth — mode maps to exactly one TLS config", () => {
  it("verify-full always derives rejectUnauthorized:true in both representations", () => {
    const tls = tlsConfigForMode("verify-full");
    const pool = buildPoolConfig(DB_URL, "verify-full");

    expect(tls.sslmode).toBe("verify-full");
    expect(tls.ssl.rejectUnauthorized).toBe(true);
    expect(pool.ssl.rejectUnauthorized).toBe(true);
    expect(pool.connectionString).toContain("sslmode=verify-full");
    expect(pool.connectionString).not.toContain("sslmode=require");
    expect(isSilentMitm("verify-full", pool)).toBe(false);
  });

  it("require always derives rejectUnauthorized:false in both representations", () => {
    const tls = tlsConfigForMode("require");
    const pool = buildPoolConfig(DB_URL, "require");

    expect(tls.sslmode).toBe("require");
    expect(tls.ssl.rejectUnauthorized).toBe(false);
    expect(pool.ssl.rejectUnauthorized).toBe(false);
    expect(pool.connectionString).toContain("sslmode=require");
    expect(isSilentMitm("require", pool)).toBe(false);
  });

  it("no raw rejectUnauthorized:false can bypass the single choke point", () => {
    for (const [file, source] of Object.entries(CONNECTION_LAYER)) {
      if (file === "dbConnection.ts") continue;
      expect(source).not.toMatch(/rejectUnauthorized:\s*false/);
      expect(source).not.toMatch(/new\s+(pg\.)?Pool\(\s*\{[^}]*connectionString\s*:\s*process\.env\.DATABASE_URL/);
    }

    // The mapping computes the boolean from the mode, so no raw
    // rejectUnauthorized:false literal exists to drift away from the label.
    const connectionSource = CONNECTION_LAYER["dbConnection.ts"];
    expect(connectionSource).not.toMatch(/rejectUnauthorized:\s*false/);
    expect(isSilentMitm("verify-full", tlsConfigForMode("verify-full"))).toBe(
      false
    );
    expect(tlsConfigForMode("verify-full").ssl.rejectUnauthorized).not.toBe(
      false
    );
  });
});

describe("TLS-1 G2 boot probe — verify-full, loud non-fatal fallback", () => {
  it("probe targets the same host/port/db as the pool with rejectUnauthorized:true", () => {
    const probe = buildVerifyFullProbeConfig(DB_URL);
    const pool = buildPoolConfig(DB_URL, "verify-full");
    const probeUrl = new URL(probe.connectionString);
    const poolUrl = new URL(pool.connectionString);

    expect(probe.ssl.rejectUnauthorized).toBe(true);
    expect(probeUrl.hostname).toBe(poolUrl.hostname);
    expect(probeUrl.port).toBe(poolUrl.port);
    expect(probeUrl.pathname).toBe(poolUrl.pathname);
    expect(probeUrl.searchParams.get("sslmode")).toBe("verify-full");
    expect(probeUrl.searchParams.get("channel_binding")).toBe("require");
    expect(probe.connectionTimeoutMillis).toBeLessThan(
      pool.connectionTimeoutMillis
    );
  });

  it("probe success resolves verify-full and the pool derives verify-full", async () => {
    const probe = vi.fn(async () => undefined);
    const log = vi.fn();

    const mode = await resolveBootTlsMode({
      databaseUrl: DB_URL,
      env: {},
      probe,
      log
    });

    expect(mode).toBe("verify-full");
    expect(getTlsMode()).toBe("verify-full");
    expect(probe).toHaveBeenCalledWith(DB_URL);
    expect(buildPoolConfig(DB_URL, getTlsMode()!).ssl.rejectUnauthorized).toBe(
      true
    );
  });

  it("probe failure degrades to require, logs LOUDLY, and the state is observable", async () => {
    const probe = vi.fn(async () => {
      throw new Error("SELF_SIGNED_CERT_IN_CHAIN");
    });
    const log = vi.fn();

    const mode = await resolveBootTlsMode({
      databaseUrl: DB_URL,
      env: {},
      probe,
      log
    });

    expect(mode).toBe("require");
    expect(getTlsMode()).toBe("require");
    expect(buildPoolConfig(DB_URL, getTlsMode()!).ssl.rejectUnauthorized).toBe(
      false
    );

    expect(log).toHaveBeenCalledTimes(1);
    const warning = String(log.mock.calls[0][0]);
    expect(warning).toContain("verify-full probe FAILED");
    expect(warning).toContain("FALLING BACK TO sslmode=require");
    expect(warning).toContain("MITM");
    expect(warning).toContain("Boot continues");
  });

  it("a probe failure never rejects — boot continues in degraded mode", async () => {
    const probe = vi.fn(async () => {
      throw new Error("certificate has expired");
    });

    await expect(
      resolveBootTlsMode({ databaseUrl: DB_URL, env: {}, probe, log: vi.fn() })
    ).resolves.toBe("require");
  });
});

describe("TLS-1 G3 DATABASE_SSLMODE override — wins over the probe both ways", () => {
  it("forces require even when the verify-full probe would succeed", async () => {
    const probe = vi.fn(async () => undefined);

    const mode = await resolveBootTlsMode({
      databaseUrl: DB_URL,
      env: { DATABASE_SSLMODE: "require" },
      probe,
      log: vi.fn()
    });

    expect(mode).toBe("require");
    expect(getTlsMode()).toBe("require");
    expect(probe).not.toHaveBeenCalled();
  });

  it("forces verify-full even when the probe would fail", async () => {
    const probe = vi.fn(async () => {
      throw new Error("chain broken");
    });

    const mode = await resolveBootTlsMode({
      databaseUrl: DB_URL,
      env: { DATABASE_SSLMODE: "VERIFY-FULL" },
      probe,
      log: vi.fn()
    });

    expect(mode).toBe("verify-full");
    expect(getTlsMode()).toBe("verify-full");
    expect(probe).not.toHaveBeenCalled();
  });
});

describe("TLS-1 G3 memory mode — no DATABASE_URL means no probe", () => {
  it("returns null, records no TLS mode, and never probes", async () => {
    const probe = vi.fn(async () => undefined);
    const log = vi.fn();

    const mode = await resolveBootTlsMode({
      databaseUrl: undefined,
      env: {},
      probe,
      log
    });

    expect(mode).toBeNull();
    expect(getTlsMode()).toBeNull();
    expect(probe).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});
