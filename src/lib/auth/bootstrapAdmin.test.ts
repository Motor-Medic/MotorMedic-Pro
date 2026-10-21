import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  bootstrapFirstAdmin,
  type BootstrapQueryable
} from "./bootstrapAdmin";
import { verifyPassword } from "./password";

/** Minimal in-memory fake of the users table for the two SQL statements
 *  bootstrapFirstAdmin issues (COUNT + guarded INSERT). */
function fakeUsersPool(options: {
  existingUsers?: number;
  raceLoses?: boolean;
}): BootstrapQueryable & { inserted: Array<{ params: unknown[] }>; insertCalls: number } {
  let nextId = 1;
  const state = {
    inserted: [] as Array<{ params: unknown[] }>,
    insertCalls: 0,
    query: async (text: string, params?: unknown[]) => {
      if (text.includes("COUNT(*)")) {
        return {
          rows: [{ count: options.existingUsers ?? 0 }]
        };
      }
      if (text.includes("INSERT INTO users")) {
        state.insertCalls += 1;
        if (options.raceLoses) return { rows: [] };
        const id = nextId++;
        state.inserted.push({ params: params ?? [] });
        return { rows: [{ id }] };
      }
      throw new Error(`unexpected query: ${text}`);
    }
  };
  return state;
}

describe("DEP-2 first-admin bootstrap — empty DB creates exactly one admin", () => {
  it("creates a single system-admin from BOOTSTRAP_ADMIN_* env", async () => {
    const pool = fakeUsersPool({ existingUsers: 0 });
    const logs: string[] = [];

    const result = await bootstrapFirstAdmin(
      pool,
      {
        BOOTSTRAP_ADMIN_EMAIL: "Root@Example.com",
        BOOTSTRAP_ADMIN_PASSWORD: "correct-horse-battery"
      },
      (m) => logs.push(m)
    );

    expect(result.status).toBe("created");
    if (result.status !== "created") throw new Error("unreachable");
    expect(result.email).toBe("root@example.com");

    // Exactly one INSERT, exactly one row.
    expect(pool.insertCalls).toBe(1);
    expect(pool.inserted).toHaveLength(1);

    const [email, passwordHash] = pool.inserted[0].params as [
      string,
      string
    ];
    expect(email).toBe("root@example.com");
    // bcrypt-hashed, not plaintext.
    expect(passwordHash).not.toBe("correct-horse-battery");
    expect(passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
    const { valid } = await verifyPassword(
      "correct-horse-battery",
      passwordHash
    );
    expect(valid).toBe(true);

    // One log line, mentioning the delete-the-vars hygiene.
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("[bootstrap] Created first system-admin");
    expect(logs[0]).toContain("delete BOOTSTRAP_ADMIN_EMAIL");
  });

  it("normalizes the email (trim + lowercase) for username and email columns", async () => {
    const pool = fakeUsersPool({ existingUsers: 0 });
    await bootstrapFirstAdmin(pool, {
      BOOTSTRAP_ADMIN_EMAIL: "  Admin@Acme.ORG  ",
      BOOTSTRAP_ADMIN_PASSWORD: "pw12345678"
    });
    expect(pool.inserted[0].params[0]).toBe("admin@acme.org");
  });
});

describe("DEP-2 first-admin bootstrap — non-empty DB ignores the vars entirely", () => {
  it("skips without hashing or inserting when any user exists", async () => {
    const pool = fakeUsersPool({ existingUsers: 3 });
    const logs: string[] = [];

    const result = await bootstrapFirstAdmin(
      pool,
      {
        BOOTSTRAP_ADMIN_EMAIL: "root@example.com",
        BOOTSTRAP_ADMIN_PASSWORD: "correct-horse-battery"
      },
      (m) => logs.push(m)
    );

    expect(result).toEqual({ status: "skipped", reason: "users-exist" });
    expect(pool.insertCalls).toBe(0);
    expect(pool.inserted).toHaveLength(0);
    expect(logs).toHaveLength(0);
  });

  it("a raced double-boot that loses the NOT EXISTS guard inserts nothing", async () => {
    const pool = fakeUsersPool({ existingUsers: 0, raceLoses: true });
    const logs: string[] = [];
    const result = await bootstrapFirstAdmin(
      pool,
      {
        BOOTSTRAP_ADMIN_EMAIL: "root@example.com",
        BOOTSTRAP_ADMIN_PASSWORD: "correct-horse-battery"
      },
      (m) => logs.push(m)
    );
    expect(result).toEqual({ status: "skipped", reason: "raced" });
    expect(pool.inserted).toHaveLength(0);
    expect(logs).toHaveLength(0);
  });
});

describe("DEP-2 first-admin bootstrap — env gating", () => {
  it("skips when BOOTSTRAP_ADMIN_EMAIL is absent (empty DB stays empty)", async () => {
    const pool = fakeUsersPool({ existingUsers: 0 });
    const result = await bootstrapFirstAdmin(pool, {
      BOOTSTRAP_ADMIN_PASSWORD: "correct-horse-battery"
    });
    expect(result).toEqual({ status: "skipped", reason: "missing-email" });
    expect(pool.insertCalls).toBe(0);
  });

  it("skips when BOOTSTRAP_ADMIN_PASSWORD is absent", async () => {
    const pool = fakeUsersPool({ existingUsers: 0 });
    const result = await bootstrapFirstAdmin(pool, {
      BOOTSTRAP_ADMIN_EMAIL: "root@example.com"
    });
    expect(result).toEqual({
      status: "skipped",
      reason: "missing-password"
    });
    expect(pool.insertCalls).toBe(0);
  });

  it("skips when both vars are absent (default dev boot)", async () => {
    const pool = fakeUsersPool({ existingUsers: 0 });
    const result = await bootstrapFirstAdmin(pool, {});
    expect(result.status).toBe("skipped");
    expect(pool.insertCalls).toBe(0);
  });
});

describe("DEP-2 first-admin bootstrap — the INSERT SQL itself is race-guarded", () => {
  it("the real statement carries WHERE NOT EXISTS and ON CONFLICT backstops", () => {
    const src = readFileSync(
      fileURLToPath(new URL("./bootstrapAdmin.ts", import.meta.url)),
      "utf8"
    );
    // Non-vacuous: assert on the shipped SQL string, not a copy.
    expect(src).toContain("WHERE NOT EXISTS (SELECT 1 FROM users)");
    expect(src).toContain("ON CONFLICT (username) DO NOTHING");
    expect(src).toContain("'system-admin'");
    expect(src).toContain("is_temp_password");
  });
});
