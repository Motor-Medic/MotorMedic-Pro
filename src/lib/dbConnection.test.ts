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
  isLoopbackDatabaseUrl,
  normalizeDatabaseUrl,
  resolveBootTlsMode,
  resolveTlsModeForPool,
  tlsConfigForMode,
  type PoolSslConfig,
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
  ssl?: PoolSslConfig;
}

/** ssl:false = TLS off; the object form carries rejectUnauthorized. */
function rejectsUnauthorizedOf(ssl: PoolSslConfig): boolean {
  return typeof ssl === "object" ? ssl.rejectUnauthorized : false;
}

/** The silent-MITM anti-pattern this slice must make impossible. */
function isSilentMitm(
  mode: TlsMode,
  config: TlsBearingConfig
): boolean {
  if (mode !== "verify-full" && config.sslmode !== "verify-full") return false;
  const ssl = config.ssl;
  return typeof ssl === "object" && ssl.rejectUnauthorized === false;
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
    expect(rejectsUnauthorizedOf(tls.ssl)).toBe(true);
    expect(rejectsUnauthorizedOf(pool.ssl)).toBe(true);
    expect(pool.connectionString).toContain("sslmode=verify-full");
    expect(pool.connectionString).not.toContain("sslmode=require");
    expect(isSilentMitm("verify-full", pool)).toBe(false);
  });

  it("require always derives rejectUnauthorized:false in both representations", () => {
    const tls = tlsConfigForMode("require");
    const pool = buildPoolConfig(DB_URL, "require");

    expect(tls.sslmode).toBe("require");
    expect(rejectsUnauthorizedOf(tls.ssl)).toBe(false);
    expect(rejectsUnauthorizedOf(pool.ssl)).toBe(false);
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
    expect(
      rejectsUnauthorizedOf(tlsConfigForMode("verify-full").ssl)
    ).not.toBe(false);  });
});

describe("TLS-1 G2 boot probe — verify-full, loud non-fatal fallback", () => {
  it("probe targets the same host/port/db as the pool with rejectUnauthorized:true", () => {
    const probe = buildVerifyFullProbeConfig(DB_URL);
    const pool = buildPoolConfig(DB_URL, "verify-full");
    const probeUrl = new URL(probe.connectionString);
    const poolUrl = new URL(pool.connectionString);

    expect(rejectsUnauthorizedOf(probe.ssl)).toBe(true);
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
    expect(
      rejectsUnauthorizedOf(buildPoolConfig(DB_URL, getTlsMode()!).ssl)
    ).toBe(true);
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
    expect(
      rejectsUnauthorizedOf(buildPoolConfig(DB_URL, getTlsMode()!).ssl)
    ).toBe(false);

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

describe("DBLOCAL loopback short-circuit — no probe, no forced TLS on localhost", () => {
  const LOCAL_URLS = [
    "postgres://u:p@localhost:5432/spectracm?channel_binding=require",
    "postgres://u:p@127.0.0.1:5432/spectracm",
    "postgres://u:p@[::1]:5432/spectracm"
  ];

  it.each(LOCAL_URLS)(
    "resolves ssl:false and skips the probe for %s",
    async (localUrl) => {
      expect(isLoopbackDatabaseUrl(localUrl)).toBe(true);

      const probe = vi.fn(async () => undefined);
      const log = vi.fn();

      const mode = await resolveBootTlsMode({
        databaseUrl: localUrl,
        env: {},
        probe,
        log
      });

      expect(mode).toBe("disable");
      expect(getTlsMode()).toBe("disable");
      expect(probe).not.toHaveBeenCalled();

      const pool = buildPoolConfig(localUrl, "disable");
      expect(pool.ssl).toBe(false);
      expect(pool.connectionString).toContain("sslmode=disable");
      expect(isSilentMitm("disable", pool)).toBe(false);
    }
  );

  it("prints exactly one honest boot line — no FAILED/MITM spam", async () => {
    const log = vi.fn();

    await resolveBootTlsMode({
      databaseUrl: "postgres://u:p@localhost:5432/spectracm",
      env: {},
      probe: vi.fn(async () => undefined),
      log
    });

    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0][0]);
    expect(line).toContain("local Postgres - TLS probe skipped (loopback)");
    expect(line).not.toContain("MITM");
    expect(line).not.toContain("FALLING BACK");
    expect(line).not.toContain("FAILED");
  });

  it("honors the URL's sslmode for local hosts", async () => {
    const base = "postgres://u:p@localhost:5432/spectracm";

    const disabled = await resolveBootTlsMode({
      databaseUrl: `${base}?sslmode=disable`,
      env: {},
      probe: vi.fn(async () => undefined),
      log: vi.fn()
    });
    expect(disabled).toBe("disable");
    expect(buildPoolConfig(`${base}?sslmode=disable`, "disable").ssl).toBe(
      false
    );

    // Explicit non-default sslmodes are honored too (still probe-free).
    const required = await resolveBootTlsMode({
      databaseUrl: `${base}?sslmode=require`,
      env: {},
      probe: vi.fn(async () => undefined),
      log: vi.fn()
    });
    expect(required).toBe("require");
    expect(
      rejectsUnauthorizedOf(buildPoolConfig(`${base}?sslmode=require`, "require").ssl)
    ).toBe(false);

    const verified = await resolveBootTlsMode({
      databaseUrl: `${base}?sslmode=verify-full`,
      env: {},
      probe: vi.fn(async () => undefined),
      log: vi.fn()
    });
    expect(verified).toBe("verify-full");
    expect(
      rejectsUnauthorizedOf(
        buildPoolConfig(`${base}?sslmode=verify-full`, "verify-full").ssl
      )
    ).toBe(true);
  });

  it("remote hosts keep the existing probe behavior UNCHANGED — even with sslmode=disable in the URL", async () => {
    const remoteUrl = "postgres://u:p@ep-cool.neon.tech:5432/db?sslmode=disable";
    expect(isLoopbackDatabaseUrl(remoteUrl)).toBe(false);

    const probe = vi.fn(async () => undefined);

    const mode = await resolveBootTlsMode({
      databaseUrl: remoteUrl,
      env: {},
      probe,
      log: vi.fn()
    });

    expect(mode).toBe("verify-full");
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledWith(remoteUrl);
    expect(
      rejectsUnauthorizedOf(buildPoolConfig(remoteUrl, "verify-full").ssl)
    ).toBe(true);
  });

  it("loopback host detection is exact (case-insensitive, no substring matches)", () => {
    expect(isLoopbackDatabaseUrl("postgres://LOCALHOST:5432/db")).toBe(true);
    expect(isLoopbackDatabaseUrl("postgresql://user@localhost:5432/db")).toBe(
      true
    );
    expect(isLoopbackDatabaseUrl("postgres://[::1]:5432/db")).toBe(true);
    expect(isLoopbackDatabaseUrl("postgres://ep-cool.neon.tech:5432/db")).toBe(
      false
    );
    expect(
      isLoopbackDatabaseUrl("postgres://evil.com/localhost/db")
    ).toBe(false);
    expect(isLoopbackDatabaseUrl("not a url")).toBe(false);
  });

  it("lazy pools (src/lib/db.ts path) get ssl:false for a loopback DATABASE_URL even before boot resolves", () => {
    const localEnv: NodeJS.ProcessEnv = {
      DATABASE_URL: "postgres://u:p@127.0.0.1:5432/spectracm?sslmode=disable"
    };

    expect(resolveTlsModeForPool(localEnv)).toBe("disable");
    const pool = buildPoolConfig(
      localEnv.DATABASE_URL!,
      resolveTlsModeForPool(localEnv)
    );
    expect(pool.ssl).toBe(false);
    expect(pool.connectionString).toContain("sslmode=disable");
  });

  it("lazy pools keep the remote default (verify-full) untouched", () => {
    const remoteEnv: NodeJS.ProcessEnv = {
      DATABASE_URL: "postgres://u:p@ep-cool.neon.tech:5432/db"
    };
    expect(resolveTlsModeForPool(remoteEnv)).toBe("verify-full");
    expect(
      rejectsUnauthorizedOf(
        buildPoolConfig(
          remoteEnv.DATABASE_URL!,
          resolveTlsModeForPool(remoteEnv)
        ).ssl
      )
    ).toBe(true);
  });
});
