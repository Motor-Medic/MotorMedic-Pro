import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import {
  hashPassword,
  hashPasswordSync,
  verifyPassword,
  isBcryptHash,
  isLegacySha256Hash,
} from "./password";

describe("AR-29 password hashing (bcrypt)", () => {
  it("hashPasswordSync produces a bcrypt hash at cost 10", () => {
    const hash = hashPasswordSync("s3cure-Passw0rd!");
    expect(isBcryptHash(hash)).toBe(true);
    expect(hash.startsWith("$2")).toBe(true);
    expect(hash).toContain("$10$");
  });

  it("hashPassword (async) produces a bcrypt hash", async () => {
    const hash = await hashPassword("another-Passw0rd!");
    expect(isBcryptHash(hash)).toBe(true);
  });

  it("never stores the plaintext password", () => {
    const hash = hashPasswordSync("super-secret-plain");
    expect(hash).not.toContain("super-secret-plain");
  });

  it("verifyPassword accepts the correct password for a bcrypt hash", async () => {
    const hash = hashPasswordSync("correct-horse");
    const res = await verifyPassword("correct-horse", hash);
    expect(res).toEqual({ valid: true, legacyUpgradeNeeded: false });
  });

  it("verifyPassword rejects the wrong password", async () => {
    const hash = hashPasswordSync("correct-horse");
    const res = await verifyPassword("wrong-horse", hash);
    expect(res.valid).toBe(false);
  });

  it("rejects empty/garbage stored hashes", async () => {
    expect((await verifyPassword("x", "")).valid).toBe(false);
    expect((await verifyPassword("x", "not-a-hash")).valid).toBe(false);
  });
});

describe("AR-29 legacy sha256 upgrade path", () => {
  const legacy = createHash("sha256").update("legacy-pass").digest("hex");

  it("recognizes legacy sha256 digests", () => {
    expect(isLegacySha256Hash(legacy)).toBe(true);
    expect(isLegacySha256Hash("abc")).toBe(false);
  });

  it("verifies a legacy sha256 hash and flags the upgrade", async () => {
    const res = await verifyPassword("legacy-pass", legacy);
    expect(res).toEqual({ valid: true, legacyUpgradeNeeded: true });
  });

  it("rejects a wrong password against a legacy hash", async () => {
    const res = await verifyPassword("nope", legacy);
    expect(res.valid).toBe(false);
    expect(res.legacyUpgradeNeeded).toBe(false);
  });
});
