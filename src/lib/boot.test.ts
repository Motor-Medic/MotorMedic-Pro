import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { connectWithRetry, type BootPingable } from "./db";

const serverSource = readFileSync(
  fileURLToPath(new URL("../../server.ts", import.meta.url)),
  "utf8"
);

function fakePool(failuresBeforeSuccess: number): BootPingable & {
  calls: number;
} {
  const state = {
    calls: 0,
    query: async (_text: string) => {
      state.calls += 1;
      if (state.calls <= failuresBeforeSuccess) {
        throw new Error("ECONNREFUSED");
      }
      return { rows: [{ "?column?": 1 }] };
    }
  };
  return state;
}

const noSleep = async (): Promise<void> => undefined;

describe("DEP-2 connectWithRetry — DB connect-with-retry probe", () => {
  it("resolves on the first attempt when the DB is reachable", async () => {
    const pool = fakePool(0);
    await expect(
      connectWithRetry(pool, { sleep: noSleep })
    ).resolves.toBeUndefined();
    expect(pool.calls).toBe(1);
  });

  it("retries with backoff and resolves once the DB comes up", async () => {
    const pool = fakePool(2);
    const delays: number[] = [];
    await connectWithRetry(pool, {
      attempts: 5,
      baseDelayMs: 100,
      sleep: async (ms) => {
        delays.push(ms);
      }
    });
    expect(pool.calls).toBe(3);
    // Exponential backoff: 100, 200.
    expect(delays).toEqual([100, 200]);
  });

  it("caps the backoff at maxDelayMs", async () => {
    const pool = fakePool(3);
    const delays: number[] = [];
    await connectWithRetry(pool, {
      attempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 1500,
      sleep: async (ms) => {
        delays.push(ms);
      }
    });
    expect(delays).toEqual([1000, 1500, 1500]);
  });

  it("throws after exhausting attempts (boot must fail loud, never lying green)", async () => {
    const pool = fakePool(Number.MAX_SAFE_INTEGER);
    await expect(
      connectWithRetry(pool, {
        attempts: 3,
        baseDelayMs: 1,
        sleep: noSleep
      })
    ).rejects.toThrow(/Database not reachable after 3 attempts/);
    expect(pool.calls).toBe(3);
  });

  it("probes with SELECT 1 — a fast liveness query, not a schema walk", async () => {
    const texts: string[] = [];
    const pool: BootPingable = {
      query: async (text: string) => {
        texts.push(text);
        return { rows: [] };
      }
    };
    await connectWithRetry(pool, { sleep: noSleep });
    expect(texts).toEqual(["SELECT 1"]);
  });
});

describe("DEP-2 boot order in server.ts — source-level wiring", () => {
  it("setupServer awaits connectWithRetry BEFORE app.listen", () => {
    const setupIdx = serverSource.indexOf("async function setupServer");
    expect(setupIdx).toBeGreaterThan(-1);
    const setupBody = serverSource.slice(setupIdx, setupIdx + 4000);
    const awaitIdx = setupBody.indexOf("await connectWithRetry(pool)");
    const listenIdx = setupBody.indexOf("app.listen(");
    expect(awaitIdx).toBeGreaterThan(-1);
    expect(listenIdx).toBeGreaterThan(-1);
    expect(awaitIdx).toBeLessThan(listenIdx);
  });

  it("connectWithRetry is gated on pool (DATABASE_URL set) — dev/in-memory boots keep non-blocking behavior", () => {
    const setupIdx = serverSource.indexOf("async function setupServer");
    const setupBody = serverSource.slice(setupIdx, setupIdx + 4000);
    expect(setupBody).toContain("if (pool) {");
    // The non-blocking init call (unchanged) still follows the gate.
    expect(setupBody).toContain("initializeDatabase().catch(");
  });

  it("a boot-order failure exits non-zero (Render restarts; no half-alive process)", () => {
    expect(serverSource).toMatch(
      /setupServer\(\)\.catch\([\s\S]{0,200}?process\.exit\(1\)/
    );
  });

  it("/api/health stays an instant liveness probe — no pool.query, no await, no DB in the handler", () => {
    const healthIdx = serverSource.indexOf('app.get("/api/health"');
    expect(healthIdx).toBeGreaterThan(-1);
    const handler = serverSource.slice(healthIdx, healthIdx + 300);
    expect(handler).toContain('res.json({ status: "ok"');
    expect(handler).not.toContain("pool");
    expect(handler).not.toContain("await");
    expect(handler).not.toContain("query");
    // It is registered before the global auth-guard's whitelist matters,
    // and the middleware whitelist must keep it public.
    const middlewareSrc = readFileSync(
      fileURLToPath(new URL("./auth/middleware.ts", import.meta.url)),
      "utf8"
    );
    expect(middlewareSrc).toContain('"/health"');
  });

  it("initializeDatabase calls bootstrapFirstAdmin (one-time first-admin bootstrap is wired)", () => {
    const initIdx = serverSource.indexOf("async function initializeDatabase");
    expect(initIdx).toBeGreaterThan(-1);
    const initSlice = serverSource.slice(initIdx, initIdx + 6000);
    expect(initSlice).toContain("await bootstrapFirstAdmin(pool, process.env)");
  });

  it("the bootstrap call is inside a try/catch so a bootstrap failure never kills schema init", () => {
    const initIdx = serverSource.indexOf("async function initializeDatabase");
    const initSlice = serverSource.slice(initIdx, initIdx + 6000);
    const tryIdx = initSlice.indexOf("await bootstrapFirstAdmin");
    const guardStart = initSlice.lastIndexOf("try {", tryIdx);
    const guardEnd = initSlice.indexOf("} catch (bootstrapErr)", tryIdx);
    expect(guardStart).toBeGreaterThan(-1);
    expect(guardEnd).toBeGreaterThan(tryIdx);
  });
});
