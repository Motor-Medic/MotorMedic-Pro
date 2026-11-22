/**
 * AR-29 rules 5 & 10 — production fail-fast environment validation.
 *
 * Production startup must crash loudly when SESSION_SECRET or
 * DATABASE_URL is missing, a placeholder, or a known default/fallback
 * string (including the CI mock values — CI only builds, never boots,
 * so rejecting those at boot is safe). Dev seeding is gated by an
 * explicit ENABLE_DEV_AUTH_SEED=true.
 */

/** Known placeholder / fallback / CI-mock secrets that must never boot. */
export const FORBIDDEN_SESSION_SECRETS: readonly string[] = [
  "changeme",
  "change-me",
  "secret",
  "session-secret",
  "your_session_secret_here",
  "your-session-secret-here",
  "placeholder",
  "test",
  "testsecret",
  "devsecret",
  "ci-mock",
  "ci_mock",
  "ci-mock-session-secret",
  "motormedic",
  "supersecret",
];

/** Placeholder / mock database URLs that must never boot in production. */
export const FORBIDDEN_DATABASE_URL_PATTERNS: readonly string[] = [
  "your_database_url_here",
  "your-database-url-here",
  "ci-mock",
  "ci_mock",
  "changeme",
  "change-me",
  "placeholder",
];

export interface EnvLike {
  NODE_ENV?: string;
  SESSION_SECRET?: string;
  DATABASE_URL?: string;
  ENABLE_DEV_AUTH_SEED?: string;
  TRUSTED_PROXY_IPS?: string;
}

export function isProductionEnv(env: EnvLike): boolean {
  return env.NODE_ENV === "production";
}

/** Dev seeding (demo/engineer accounts) requires an explicit opt-in. */
export function isDevAuthSeedEnabled(env: EnvLike): boolean {
  return env.ENABLE_DEV_AUTH_SEED === "true" && !isProductionEnv(env);
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Returns the list of fatal problems; empty means the env is boot-safe. */
export function collectProductionEnvErrors(env: EnvLike): string[] {
  const errors: string[] = [];

  const secret = env.SESSION_SECRET?.trim() || "";
  if (!secret) {
    errors.push("SESSION_SECRET is missing.");
  } else if (secret.length < 32) {
    errors.push(
      `SESSION_SECRET is too short (${secret.length} chars; minimum 32).`
    );
  } else if (/^your[_-].*[_-]here$/i.test(secret) || secret.includes("YOUR_")) {
    errors.push("SESSION_SECRET is a placeholder (YOUR_* pattern).");
  } else if (
    FORBIDDEN_SESSION_SECRETS.some((f) => normalize(secret).includes(f))
  ) {
    errors.push("SESSION_SECRET matches a known default/fallback/CI-mock string.");
  }

  const dbUrl = env.DATABASE_URL?.trim() || "";
  if (!dbUrl) {
    errors.push("DATABASE_URL is missing.");
  } else {
    const lower = normalize(dbUrl);
    for (const pattern of FORBIDDEN_DATABASE_URL_PATTERNS) {
      if (lower.includes(pattern)) {
        errors.push(
          `DATABASE_URL matches a known placeholder/CI-mock pattern ("${pattern}").`
        );
        break;
      }
    }
  }

  return errors;
}

/* ------------------------------------------------------------------ */
/* SEC-12 — fail-fast on untrusted / malformed proxy config at boot   */
/* ------------------------------------------------------------------ */

/** A single octet with no leading-zero (octal-ambiguity) forms. */
function isValidIpv4Octet(part: string): boolean {
  const n = Number(part);
  return n >= 0 && n <= 255 && String(n) === part;
}

/** Structural validation for an IPv6 address (compressed "::" allowed). */
function isValidIpv6(ip: string): boolean {
  if (!/^[0-9a-fA-F:]+$/.test(ip)) return false;
  const doubleColonCount = (ip.match(/::/g) || []).length;
  if (doubleColonCount > 1) return false;
  // A lone leading or trailing colon (not part of "::") is invalid.
  if (/^:(?!:)/.test(ip)) return false;
  if (/(?!:):$/.test(ip)) return false;
  const groups = ip.split(":");
  const nonEmpty = groups.filter((g) => g !== "");
  if (nonEmpty.length > 8) return false;
  if (doubleColonCount === 0 && nonEmpty.length !== 8) return false;
  for (const g of nonEmpty) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* SEC-14 — `platform` sentinel for managed reverse proxies (Vercel)   */
/* ------------------------------------------------------------------ */

/**
 * SEC-14 — TRUSTED_PROXY_IPS may be the exact literal `platform` when the app
 * sits behind a managed platform proxy (e.g. Vercel) whose public IP list is
 * not expressible. It means "trust the immediate platform hop" and maps to
 * Express `trust proxy = PLATFORM_TRUST_PROXY_HOPS` (one hop), never to an IP
 * allowlist. Case-sensitive: `PLATFORM` is not the sentinel and fails.
 */
export const TRUSTED_PROXY_PLATFORM = "platform";

/** Express `trust proxy` hop count for TRUSTED_PROXY_IPS=platform. */
export const PLATFORM_TRUST_PROXY_HOPS = 1;

/**
 * SEC-14 — resolved TRUSTED_PROXY_IPS value for the server.
 *   - `platform` sentinel => the marker (server sets trust proxy = 1 hop).
 *   - IP/CIDR allowlist => the parsed entries (never treated as trust proxy).
 *   - unset/empty => null (proxy stays untrusted).
 */
export function trustedProxyIps(
  env: EnvLike = process.env
): string[] | typeof TRUSTED_PROXY_PLATFORM | null {
  const raw = env.TRUSTED_PROXY_IPS;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed === TRUSTED_PROXY_PLATFORM) return TRUSTED_PROXY_PLATFORM;
  return trimmed
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Validate one comma-separated TRUSTED_PROXY_IPS entry as a valid IPv4,
 * IPv4-mapped IPv6 ("::ffff:a.b.c.d"), IPv6, or CIDR of either family.
 */
function isValidIpOrCidr(entry: string): boolean {
  const trimmed = entry.trim();
  if (!trimmed) return false;

  // Accept IPv4-mapped IPv6 by stripping the well-known prefix first.
  let ipPart = trimmed.replace(/^::ffff:/i, "");
  let cidr: number | null = null;
  const slash = ipPart.indexOf("/");
  if (slash !== -1) {
    const cidrPart = ipPart.slice(slash + 1).trim();
    if (!/^\d+$/.test(cidrPart)) return false;
    cidr = Number(cidrPart);
    ipPart = ipPart.slice(0, slash);
  }

  // IPv4 (possibly the remainder of ::ffff:a.b.c.d).
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const m4 = ipv4.exec(ipPart);
  if (m4) {
    const parts = [m4[1], m4[2], m4[3], m4[4]];
    if (parts.some((p) => !isValidIpv4Octet(p))) return false;
    if (cidr !== null) {
      return Number.isInteger(cidr) && cidr >= 0 && cidr <= 32;
    }
    return true;
  }

  // IPv6.
  if (isValidIpv6(ipPart)) {
    if (cidr !== null) {
      return Number.isInteger(cidr) && cidr >= 0 && cidr <= 128;
    }
    return true;
  }

  return false;
}

/**
 * Returns fatal problems with the TRUSTED_PROXY_IPS configuration.
 *   - Production + absent/empty => error (fail fast at boot).
 *   - Any environment + malformed entry => error (fail fast everywhere).
 *   - SEC-14: the exact literal `platform` is valid in every environment and
 *     must be used alone (it selects the immediate platform hop, not a list).
 * Non-production absence is intentionally not an error here; callers log a
 * warning and keep the proxy untrusted.
 */
export function collectTrustedProxyErrors(env: EnvLike): string[] {
  const errors: string[] = [];
  const raw = env.TRUSTED_PROXY_IPS;
  const present = typeof raw === "string" && raw.trim().length > 0;

  if (!present) {
    if (isProductionEnv(env)) {
      errors.push(
        "TRUSTED_PROXY_IPS is missing in production. Set it to `platform` " +
          "(trust the immediate platform hop, e.g. Vercel) or a " +
          "comma-separated list of trusted proxy IPs/CIDRs (e.g. 10.0.0.0/8)."
      );
    }
    return errors;
  }

  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  // SEC-14 — the platform sentinel is exact, case-sensitive, and exclusive.
  if (entries.some((entry) => entry === TRUSTED_PROXY_PLATFORM)) {
    if (entries.length !== 1) {
      errors.push(
        `TRUSTED_PROXY_IPS: "${TRUSTED_PROXY_PLATFORM}" must be used alone, ` +
          "not combined with IP/CIDR entries."
      );
    }
    return errors;
  }

  for (const trimmed of entries) {
    if (!isValidIpOrCidr(trimmed)) {
      errors.push(
        `TRUSTED_PROXY_IPS contains an invalid IP/CIDR: "${trimmed}".`
      );
    }
  }
  return errors;
}

/**
 * Throws with a loud, actionable message when the trusted-proxy config is
 * unsafe. Call during startup BEFORE app.listen so a bad deploy never serves
 * a single request. Non-production absence is allowed (warning logged, proxy
 * stays untrusted); malformed input throws in every environment.
 */
export function assertTrustedProxyEnv(env: EnvLike = process.env): void {
  const errors = collectTrustedProxyErrors(env);
  if (errors.length > 0) {
    const banner = [
      "═══════════════════════════════════════════════════════════════",
      "❌ FATAL (SEC-12 trusted proxy): refusing to start.",
      ...errors.map((e) => `   • ${e}`),
      "Set TRUSTED_PROXY_IPS to `platform` (trust the immediate platform hop) " +
        "or a comma-separated list of trusted proxy IPs/CIDRs.",
      "═══════════════════════════════════════════════════════════════",
    ].join("\n");
    throw new Error(banner);
  }

  // Non-production with no allowlist: degrade loudly, keep proxy untrusted.
  if (!isProductionEnv(env)) {
    const raw = env.TRUSTED_PROXY_IPS;
    if (!raw || !raw.trim()) {
      console.warn(
        "[SEC-12] TRUSTED_PROXY_IPS is not set; proxy is untrusted. IP-derived " +
          "controls (rate limiting) may be degraded."
      );
    }
  }
}

/**
 * Throws with a loud, actionable message when production env is unsafe.
 * Call during startup BEFORE app.listen so a bad deploy never serves
 * a single request.
 */
export function assertProductionAuthEnv(env: EnvLike = process.env): void {
  if (!isProductionEnv(env)) return;
  const errors = collectProductionEnvErrors(env);
  if (errors.length > 0) {
    const banner = [
      "════════════════════════════════════════════════════════════════",
      "❌ FATAL (AR-29 env guard): refusing to start in production.",
      ...errors.map((e) => `   • ${e}`),
      "Set a strong SESSION_SECRET (>=32 random chars, e.g. from",
      "  `openssl rand -hex 32`) and a real DATABASE_URL, then restart.",
      "════════════════════════════════════════════════════════════════",
    ].join("\n");
    throw new Error(banner);
  }
}
