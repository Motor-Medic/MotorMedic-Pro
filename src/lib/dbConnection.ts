/**
 * TLS-1 — connection-layer single choke point for PostgreSQL TLS.
 *
 * `DATABASE_URL` is normalized here: every pre-existing sslmode/ssl* param is
 * stripped and the resolved mode is injected, while all other params (e.g.
 * channel_binding) are preserved verbatim. Pool config and the boot probe both
 * derive their TLS settings from the same resolved mode so the string
 * representation and pg's `ssl` object can never disagree.
 *
 * Neon certificates chain to public CAs in Node's trust store, so verify-full
 * needs no bundled .pem files — pg's native handling is used.
 *
 * DBLOCAL: loopback targets (localhost / 127.0.0.1 / ::1) short-circuit all of
 * this — there is no MITM concern on loopback, so the verify-full probe is
 * skipped entirely and the URL's own sslmode is honored (defaulting to
 * disable). Forcing TLS against a local Postgres that has no SSL support is
 * what produces the "does not support SSL" boot FATAL.
 */

import pg from "pg";

const { Client } = pg;

export type TlsMode = "verify-full" | "require" | "disable";

/** pg's `ssl` option: false disables TLS entirely; an object configures TLS. */
export type PoolSslConfig = false | { rejectUnauthorized: boolean };

export interface TlsConfig {
  sslmode: TlsMode;
  rejectUnauthorized: boolean;
  ssl: PoolSslConfig;
}

export interface DatabasePoolConfig {
  connectionString: string;
  ssl: PoolSslConfig;
  connectionTimeoutMillis: number;
}

export interface TlsProbeConfig {
  connectionString: string;
  ssl: PoolSslConfig;
  connectionTimeoutMillis: number;
}

export interface ResolveBootTlsOptions {
  /** Absent/empty means memory mode: no probe, no TLS state recorded. */
  databaseUrl?: string | null;
  env?: NodeJS.ProcessEnv;
  probe?: (databaseUrl: string) => Promise<void>;
  log?: (message: string) => void;
}

const DEFAULT_POOL_TIMEOUT_MS = 15_000;
const DEFAULT_PROBE_TIMEOUT_MS = 5_000;

let currentTlsMode: TlsMode | null = null;

/** The mode resolved at boot. Null in memory mode (or before boot resolves). */
export function getTlsMode(): TlsMode | null {
  return currentTlsMode;
}

/** Test helper: clear the recorded boot mode between cases. */
export function __resetTlsModeForTests(): void {
  currentTlsMode = null;
}

/** The ONLY mapping from a resolved mode to TLS settings. */
export function tlsConfigForMode(mode: TlsMode): TlsConfig {
  const rejectUnauthorized = mode === "verify-full";
  return {
    sslmode: mode,
    rejectUnauthorized,
    // disable = TLS off entirely (pg must never offer SSL); the other two
    // modes are TLS with/without certificate verification.
    ssl: mode === "disable" ? false : { rejectUnauthorized }
  };
}

interface UrlParts {
  base: string;
  query: string | null;
  hash: string;
}

function splitUrl(rawUrl: string): UrlParts {
  let withoutHash = rawUrl;
  let hash = "";
  const hashIdx = rawUrl.indexOf("#");
  if (hashIdx >= 0) {
    hash = rawUrl.slice(hashIdx);
    withoutHash = rawUrl.slice(0, hashIdx);
  }
  const queryIdx = withoutHash.indexOf("?");
  if (queryIdx < 0) {
    return { base: withoutHash, query: null, hash };
  }
  return {
    base: withoutHash.slice(0, queryIdx),
    query: withoutHash.slice(queryIdx + 1),
    hash
  };
}

function paramKey(part: string): string {
  const eqIdx = part.indexOf("=");
  return (eqIdx < 0 ? part : part.slice(0, eqIdx)).toLowerCase();
}

/** sslmode plus every ssl* parameter (sslcert, sslkey, sslrootcert, ...). */
function isTlsParam(key: string): boolean {
  return key === "sslmode" || key.startsWith("ssl");
}

function stripTlsParams(query: string | null): string[] {
  if (!query) return [];
  return query
    .split("&")
    .filter((part) => part.length > 0 && !isTlsParam(paramKey(part)));
}

/**
 * Pure normalizer: strips existing sslmode/ssl* params, injects the resolved
 * mode, and preserves every other query parameter verbatim (order included).
 */
export function normalizeDatabaseUrl(rawUrl: string, mode: TlsMode): string {
  const { base, query, hash } = splitUrl(rawUrl);
  const params = stripTlsParams(query);
  params.push(`sslmode=${mode}`);
  return `${base}?${params.join("&")}${hash}`;
}

/**
 * pg-connection-string (v2.14+) treats plain sslmode=require as an alias for
 * verify-full. Pin libpq-compatible semantics for the require fallback so the
 * parsed ssl object really is rejectUnauthorized = false. This lives only in the
 * pool config; the normalizer output stays a clean sslmode=... URL.
 */
function pinLibpqCompatForRequire(url: string): string {
  const { base, query, hash } = splitUrl(url);
  const params = (query ?? "")
    .split("&")
    .filter(
      (part) => part.length > 0 && paramKey(part) !== "uselibpqcompat"
    );
  params.push("uselibpqcompat=true");
  return `${base}?${params.join("&")}${hash}`;
}

/** DBLOCAL: hosts where TLS offers no protection (loopback = same machine). */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * DBLOCAL — true when the DATABASE_URL points at this same machine. Bracketed
 * IPv6 ([::1]) is what URL parsing yields for a loopback IPv6 literal; the
 * unbracketed form is kept for direct callers. An unparseable URL is treated
 * as remote (fail-safe: the verify-full probe path still runs).
 */
export function isLoopbackDatabaseUrl(databaseUrl: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(databaseUrl).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * DBLOCAL — the URL's own sslmode when it maps to a supported TlsMode, so a
 * local URL can explicitly say disable/require/verify-full and be honored.
 * Returns null (caller applies the local default, disable) when absent,
 * unrecognized, or the URL is unparseable.
 */
function sslmodeFromUrl(databaseUrl: string): TlsMode | null {
  try {
    const raw = new URL(databaseUrl).searchParams
      .get("sslmode")
      ?.trim()
      .toLowerCase();
    if (raw === "disable" || raw === "require" || raw === "verify-full") {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

/** Every pg Pool in the app is built from this function (single choke point). */
export function buildPoolConfig(
  databaseUrl: string,
  mode: TlsMode,
  options: { connectionTimeoutMillis?: number } = {}
): DatabasePoolConfig {
  const tls = tlsConfigForMode(mode);
  const normalized = normalizeDatabaseUrl(databaseUrl, mode);
  return {
    connectionString:
      mode === "require" ? pinLibpqCompatForRequire(normalized) : normalized,
    ssl: tls.ssl,
    connectionTimeoutMillis:
      options.connectionTimeoutMillis ?? DEFAULT_POOL_TIMEOUT_MS
  };
}

/** Probe config always uses verify-full semantics against the same target. */
export function buildVerifyFullProbeConfig(
  databaseUrl: string,
  options: { connectionTimeoutMillis?: number } = {}
): TlsProbeConfig {
  const tls = tlsConfigForMode("verify-full");
  return {
    connectionString: normalizeDatabaseUrl(databaseUrl, "verify-full"),
    ssl: tls.ssl,
    connectionTimeoutMillis:
      options.connectionTimeoutMillis ?? DEFAULT_PROBE_TIMEOUT_MS
  };
}

/**
 * One short-timeout SELECT 1 using verify-full semantics. Throws on any
 * certificate/chain/hostname failure; the caller decides the fallback.
 */
export async function probeVerifyFull(
  databaseUrl: string,
  timeoutMs: number = DEFAULT_PROBE_TIMEOUT_MS
): Promise<void> {
  const client = new Client(
    buildVerifyFullProbeConfig(databaseUrl, {
      connectionTimeoutMillis: timeoutMs
    })
  );
  try {
    await client.connect();
    await client.query("SELECT 1");
  } finally {
    try {
      await client.end();
    } catch {
      // A failed probe must never mask the original TLS/connection error.
    }
  }
}

export function resolveTlsModeFromEnv(
  env: NodeJS.ProcessEnv = process.env
): TlsMode | null {
  const raw = env.DATABASE_SSLMODE?.trim().toLowerCase();
  if (raw === "verify-full" || raw === "require") return raw;
  return null;
}

/**
 * Resolve the boot TLS mode:
 *   0. Loopback target (localhost/127.0.0.1/::1): no probe at all — the URL's
 *      sslmode is honored, defaulting to disable (DBLOCAL: no MITM concern on
 *      loopback, and local Postgres often has no SSL support at all).
 *   1. DATABASE_SSLMODE override wins (probe skipped).
 *   2. Otherwise probe verify-full.
 *   3. Probe failure degrades LOUDLY to require, never blocks boot.
 * Memory mode (no DATABASE_URL) returns null and probes nothing.
 */
export async function resolveBootTlsMode(
  options: ResolveBootTlsOptions
): Promise<TlsMode | null> {
  const databaseUrl = options.databaseUrl?.trim() || "";
  if (!databaseUrl) {
    currentTlsMode = null;
    return null;
  }

  const env = options.env ?? process.env;
  const log = options.log ?? console.warn;
  const override = resolveTlsModeFromEnv(env);

  // DBLOCAL: loopback short-circuit — never probe, never force TLS. One quiet
  // line instead of the verify-full FAILED / MITM-warning spam a local
  // Postgres without SSL support would otherwise produce.
  if (isLoopbackDatabaseUrl(databaseUrl)) {
    const mode =
      override ?? sslmodeFromUrl(databaseUrl) ?? "disable";
    currentTlsMode = mode;
    log(
      `🔐 [DATABASE TLS] local Postgres - TLS probe skipped (loopback); sslmode=${mode}.`
    );
    return mode;
  }

  if (override) {
    currentTlsMode = override;
    log(
      `🔐 [DATABASE TLS] DATABASE_SSLMODE=${override} override active (boot probe skipped).`
    );
    return override;
  }

  try {
    await (options.probe ?? probeVerifyFull)(databaseUrl);
    currentTlsMode = "verify-full";
    log(
      "🔐 [DATABASE TLS] verify-full probe succeeded; server identity will be VERIFIED."
    );
    return "verify-full";
  } catch (err) {
    currentTlsMode = "require";
    const detail = err instanceof Error ? err.message : String(err);
    log(
      `🚨 [DATABASE TLS] verify-full probe FAILED (${detail}). ` +
        "FALLING BACK TO sslmode=require — connection is ENCRYPTED BUT SERVER " +
        "IDENTITY IS NOT VERIFIED (MITM exposure). Fix the certificate chain / " +
        "CA trust to restore verify-full. Boot continues (non-fatal)."
    );
    return "require";
  }
}

/**
 * Mode used by lazy pools (src/lib/db.ts) and standalone scripts. Loopback
 * targets never get TLS forced on them — even before boot has resolved —
 * because a local Postgres frequently has no SSL support at all (DBLOCAL).
 * Remote: prefers the boot-resolved mode so every pool agrees with the probe;
 * otherwise the env override; otherwise the audited verify-full default.
 */
export function resolveTlsModeForPool(
  env: NodeJS.ProcessEnv = process.env
): TlsMode {
  const databaseUrl = env.DATABASE_URL?.trim() || "";
  if (databaseUrl && isLoopbackDatabaseUrl(databaseUrl)) {
    return (
      resolveTlsModeFromEnv(env) ?? sslmodeFromUrl(databaseUrl) ?? "disable"
    );
  }
  return currentTlsMode ?? resolveTlsModeFromEnv(env) ?? "verify-full";
}
