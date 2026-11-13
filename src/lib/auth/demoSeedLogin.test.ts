/**
 * SLICE-AUTHFIX — seed/login credential agreement for the demo account.
 *
 * Contract under test (scripts/seedLocalDemo.ts resolveTenant):
 *   - login (POST /api/auth/login) verifies with verifyPassword against
 *     password_hash, looking the user up strictly by LOWER(username);
 *   - the seed must therefore always leave the demo row's password_hash in a
 *     form verifyPassword accepts for demo123 — including when the row already
 *     existed with a stale hash (the branch that used to early-return without
 *     touching the password).
 *
 * The fake client mimics pg.PoolClient.query only; verification runs against
 * the REAL stored form via the real verifyPassword helper.
 */
import { describe, it, expect } from "vitest";
import { verifyPassword, hashPasswordSync, isBcryptHash } from "./password";
import { resolveTenant } from "../../../scripts/seedLocalDemo";

interface FakeRow {
  [column: string]: unknown;
}

interface RecordedCall {
  sql: string;
  params: unknown[];
}

type QueryResult = { rows: FakeRow[] };

function makeFakeClient(resolver: (sql: string, params: unknown[]) => FakeRow[]) {
  const calls: RecordedCall[] = [];
  const client = {
    query(sql: string, params?: unknown[]): Promise<QueryResult> {
      const p = params ?? [];
      calls.push({ sql, params: p });
      return Promise.resolve({ rows: resolver(sql, p) });
    }
  };
  return { client: client as unknown as import("pg").PoolClient, calls };
}

function updateUserParams(calls: RecordedCall[]): unknown[] {
  const upd = calls.find(c => c.sql.includes("UPDATE users"));
  if (!upd) throw new Error("expected an UPDATE users statement");
  return upd.params;
}

function insertUserParams(calls: RecordedCall[]): unknown[] {
  const ins = calls.find(c => c.sql.includes("INSERT INTO users"));
  if (!ins) throw new Error("expected an INSERT INTO users statement");
  return ins.params;
}

const STALE_HASH = hashPasswordSync("some-other-password-from-2024");

describe("SLICE-AUTHFIX demo seed/login agreement", () => {
  it("re-stamps a pre-existing demo row's stale password so demo123 verifies", async () => {
    // Simulates the bug scenario: username='demo' row already exists with a
    // company and an old password hash. The old seed early-returned without
    // repairing password_hash, so login rejected demo/demo123 forever.
    const { client, calls } = makeFakeClient((sql, params) => {
      if (sql.includes("LOWER(username)")) {
        return [{ id: 1, company_id: 7 }];
      }
      if (sql.includes("UPDATE users")) {
        return [{ id: params![4] }];
      }
      return [];
    });

    const tenant = await resolveTenant(client);

    expect(tenant).toEqual({ companyId: 7, userId: 1, createdUser: false });
    const params = updateUserParams(calls);
    const storedHash = String(params[2]); // password_hash column
    expect(isBcryptHash(storedHash)).toBe(true);
    expect(storedHash).not.toBe(STALE_HASH);

    // Against the real stored form, through the exact helper login uses:
    expect((await verifyPassword("demo123", storedHash)).valid).toBe(true);
  });

  it("wrong password is still rejected against the re-stamped hash", async () => {
    const { client, calls } = makeFakeClient((sql, params) => {
      if (sql.includes("LOWER(username)")) {
        return [{ id: 1, company_id: 7 }];
      }
      if (sql.includes("UPDATE users")) {
        return [{ id: params![4] }];
      }
      return [];
    });

    await resolveTenant(client);
    const storedHash = String(updateUserParams(calls)[2]);

    expect((await verifyPassword("wrong-password", storedHash)).valid).toBe(false);
  });

  it("adopts an email-only row and renames it to username 'demo' (login looks up by username only)", async () => {
    const { client, calls } = makeFakeClient(sql => {
      if (sql.includes("LOWER(username)")) {
        return []; // no 'demo' username anywhere
      }
      if (sql.includes("LOWER(email)")) {
        return [{ id: 9, company_id: 3 }];
      }
      if (sql.includes("UPDATE users")) {
        return [{ id: 9 }];
      }
      return [];
    });

    const tenant = await resolveTenant(client);

    expect(tenant).toEqual({ companyId: 3, userId: 9, createdUser: false });
    const params = updateUserParams(calls);
    expect(params[0]).toBe(3); // company_id kept
    expect(params[1]).toBe("demo"); // username — the field login authenticates by
    const storedHash = String(params[2]);
    expect((await verifyPassword("demo123", storedHash)).valid).toBe(true);
    expect((await verifyPassword("nope", storedHash)).valid).toBe(false);
  });

  it("fresh insert path stores a bcrypt hash that verifyPassword accepts for demo123", async () => {
    const { client, calls } = makeFakeClient(sql => {
      if (sql.includes("LOWER(username)") || sql.includes("LOWER(email)")) {
        return [];
      }
      if (sql.includes("FROM companies")) {
        return [{ id: 5 }]; // demo company already exists
      }
      if (sql.includes("INSERT INTO users")) {
        return [{ id: 42 }];
      }
      return [];
    });

    const tenant = await resolveTenant(client);

    expect(tenant).toEqual({ companyId: 5, userId: 42, createdUser: true });
    const params = insertUserParams(calls);
    expect(params[1]).toBe("demo");
    const storedHash = String(params[3]);
    expect(isBcryptHash(storedHash)).toBe(true);
    expect((await verifyPassword("demo123", storedHash)).valid).toBe(true);
    expect((await verifyPassword("letmein", storedHash)).valid).toBe(false);
  });
});
