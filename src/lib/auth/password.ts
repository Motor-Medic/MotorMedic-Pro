/**
 * AR-29 rule 2 — cryptographic credentials. Passwords are hashed with
 * bcrypt (bcryptjs, pure JS) via a vetted library. Plaintext and weakly
 * hashed (legacy sha256) passwords are never stored going forward; legacy
 * sha256 rows are supported read-only for upgrade-on-login and are
 * transparently re-hashed to bcrypt on the first successful sign-in.
 */
import bcrypt from "bcryptjs";

const BCRYPT_COST = 10;

/** Legacy unsalted sha256 hex (pre-AR-29 rows) — upgrade path only. */
const LEGACY_SHA256_RE = /^[a-f0-9]{64}$/i;

export function isBcryptHash(hash: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(hash);
}

export function isLegacySha256Hash(hash: string): boolean {
  return LEGACY_SHA256_RE.test(hash);
}

/** Hash a plaintext password with bcrypt. Never log or return plaintext. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/** Synchronous variant for one-time dev seeding only. */
export function hashPasswordSync(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_COST);
}

export interface VerifyResult {
  valid: boolean;
  /** True when the stored hash was a legacy sha256 digest that matched. */
  legacyUpgradeNeeded: boolean;
}

/**
 * Constant-time-ish credential verification. Accepts bcrypt hashes; also
 * verifies legacy sha256 digests so existing dev accounts keep working and
 * can be upgraded in place by the caller.
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<VerifyResult> {
  if (!storedHash || typeof storedHash !== "string") {
    return { valid: false, legacyUpgradeNeeded: false };
  }
  if (isBcryptHash(storedHash)) {
    const valid = await bcrypt.compare(password, storedHash);
    return { valid, legacyUpgradeNeeded: false };
  }
  if (isLegacySha256Hash(storedHash)) {
    const { createHash, timingSafeEqual } = await import("crypto");
    const candidate = createHash("sha256").update(password).digest();
    const expected = Buffer.from(storedHash, "hex");
    const valid =
      candidate.length === expected.length && timingSafeEqual(candidate, expected);
    return { valid, legacyUpgradeNeeded: valid };
  }
  return { valid: false, legacyUpgradeNeeded: false };
}
