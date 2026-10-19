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
