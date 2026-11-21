/**
 * SLICE-SEC-5 — unscoped destructive route lock.
 *
 * Audit finding: POST /api/wipe-equipment had no session, no tenant predicate
 * and no role gate, and deleted every tenant's hierarchy, analysis_history and
 * measurements (server.ts, pre-slice lines 13961-13990).
 *
 * Step 1 found no client fetch for the path, so the route was removed rather
 * than gated. These locks fail the build if an ungated destructive route or an
 * unscoped full-table DELETE returns.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const serverSource = readFileSync(
  fileURLToPath(new URL("../../server.ts", import.meta.url)),
  "utf8"
);
const srcRoot = fileURLToPath(new URL("..", import.meta.url));
const thisFile = fileURLToPath(import.meta.url);

const WIPE_PATH = "/api/wipe-equipment";

/** Tables the removed route truncated for every tenant at once. */
const WIPE_TABLES = [
  "analysis_history",
  "measurement_points",
  "collection_points",
  "components",
  "assets",
  "routes"
] as const;

/** `DELETE FROM <table>` with no WHERE clause (optionally terminated). */
const UNSCOPED_DELETE = new RegExp(
  `DELETE\\s+FROM\\s+(?:${WIPE_TABLES.join("|")})\\s*(?:;|"|'|\`)`,
  "i"
);

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      sourceFiles(full, found);
    } else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !/\.test\.(ts|tsx)$/.test(entry.name)
    ) {
      found.push(full);
    }
  }
  return found;
}

describe("SLICE-SEC-5 — no unscoped destructive route", () => {
  it("POST /api/wipe-equipment is not registered", () => {
    expect(serverSource).not.toContain(WIPE_PATH);
    expect(serverSource).not.toMatch(
      /app\.(post|put|patch|delete)\s*\(\s*["'`]\/api\/wipe-equipment/
    );
  });

  it("no DELETE statement without a tenant predicate remains", () => {
    // The removed handler issued bare `DELETE FROM <table>;` statements. Every
    // surviving DELETE in server.ts carries a WHERE predicate.
    expect(serverSource.match(UNSCOPED_DELETE) ?? []).toEqual([]);
  });

  it("no client code calls the removed endpoint", () => {
    const offenders = sourceFiles(srcRoot)
      .filter((file) => file !== thisFile)
      .filter((file) => readFileSync(file, "utf8").includes(WIPE_PATH));
    expect(offenders).toEqual([]);
  });

  it("a reintroduced wipe route must be session-gated, admin-only, tenant-scoped and confirmed", () => {
    const marker = `app.post("${WIPE_PATH}"`;
    const start = serverSource.indexOf(marker);
    // Removed today. If the route ever returns, the handler must carry every
    // guard the audit finding called out before this lock can pass again.
    if (start === -1) return;
    const end = serverSource.indexOf("\n});", start);
    const handler = serverSource.slice(start, end === -1 ? undefined : end);

    expect(handler).toMatch(/requireRole|isTenantAdminRole/);
    expect(handler).toMatch(/tenant_id|company_id/);
    expect(handler).toMatch(/confirm/i);
    expect(handler).not.toMatch(UNSCOPED_DELETE);
  });
});
