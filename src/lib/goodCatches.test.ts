/**
 * GOOD-CATCHES - tenant isolation, link ownership, integer-cent totals and
 * scoped mutation tests.
 *
 * The API half mounts the REAL Express handlers from server.ts through a fake
 * Express app in DATABASE_URL-less memory mode (the same proven harness as
 * multiTenantIsolation.test.ts), registers independent tenants through the real
 * POST /api/auth/register handler and drives the real AR-29 session guard.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  buildGoodCatchSummary,
  dollarsInputToCents,
  formatCents,
  parseAvoidedCostCents,
  validateGoodCatchLinks,
  type GoodCatchRow
} from "./goodCatches";

const serverSource = readFileSync(
  fileURLToPath(new URL("../../server.ts", import.meta.url)),
  "utf8"
);
const migrationSource = readFileSync(
  fileURLToPath(new URL("../../migrations/022_good_catches.sql", import.meta.url)),
  "utf8"
);

type Handler = (req: any, res: any, next?: any) => unknown;

interface Route {
  method: string;
  regex: RegExp;
  keys: string[];
  handler: Handler;
}

const harness = vi.hoisted(() => {
  const routes: Route[] = [];
  let apiGuard: Handler | null = null;

  const makeRegex = (pattern: string) => {
    const keys: string[] = [];
    const source = pattern.replace(/:[^/]+/g, (token) => {
      keys.push(token.slice(1));
      return "([^/]+)";
    });
    return { regex: new RegExp(`^${source}$`), keys };
  };

  const compose = (middleware: Handler[], terminal: Handler): Handler => {
    return (req: any, res: any, next?: any) => {
      let index = -1;
      const dispatch = (position: number): unknown => {
        if (position <= index) throw new Error("next() called multiple times");
        index = position;
        const fn = middleware[position];
        if (!fn) return terminal(req, res, next);
        return fn(req, res, () => dispatch(position + 1));
      };
      return dispatch(0);
    };
  };

  const register = (method: string, args: unknown[]) => {
    const terminal = args[args.length - 1] as Handler;
    const leading = args.slice(0, -1);
    const paths = leading
      .filter(
        (item): item is string | string[] =>
          typeof item === "string" || Array.isArray(item)
      )
      .flat();
    const middleware = leading.filter(
      (item): item is Handler => typeof item === "function"
    );
    const handler = compose(middleware, terminal);
    for (const pattern of paths) {
      if (typeof pattern !== "string") continue;
      const { regex, keys } = makeRegex(pattern);
      routes.push({ method, regex, keys, handler });
    }
    return app;
  };

  const app: any = {
    use(...args: any[]) {
      const first = args[0];
      const fn = args[args.length - 1];
      if (first === "/api" && typeof fn === "function" && fn.length >= 3) {
        apiGuard = fn as Handler;
      }
      return app;
    },
    get(...args: any[]) {
      return register("GET", args);
    },
    post(...args: any[]) {
      return register("POST", args);
    },
    put(...args: any[]) {
      return register("PUT", args);
    },
    patch(...args: any[]) {
      return register("PATCH", args);
    },
    delete(...args: any[]) {
      return register("DELETE", args);
    },
    listen(_port: unknown, _host: unknown, cb?: () => void) {
      cb?.();
      return { timeout: 0, headersTimeout: 0 };
    }
  };

  const express: any = () => app;
  express.json = () => (_req: any, _res: any, next: any) => next?.();
  express.urlencoded = () => (_req: any, _res: any, next: any) => next?.();
  express.static = () => (_req: any, _res: any, next: any) => next?.();

  return { routes, express, getGuard: () => apiGuard, noop: () => undefined };
});

vi.mock("express", () => ({ default: harness.express }));
vi.mock("vite", () => ({
  createServer: async () => ({ middlewares: harness.noop })
}));
vi.mock("dotenv", () => ({ default: { config: () => ({ parsed: {} }) } }));

function makeRes() {
  const headers: Record<string, string> = {};
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    header(name: string, value: string) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    setTimeout() {
      return this;
    }
  };
  return res;
}

function findRoute(method: string, path: string) {
  for (const route of harness.routes) {
    if (route.method !== method) continue;
    const match = route.regex.exec(path);
    if (!match) continue;
    const params: Record<string, string> = {};
    route.keys.forEach((key, i) => {
      params[key] = decodeURIComponent(match[i + 1]);
    });
    return { route, params };
  }
  throw new Error(`No route registered for ${method} ${path}`);
}

async function callApi(
  method: string,
  path: string,
  options: { body?: Record<string, unknown>; cookie?: string } = {}
) {
  const { route, params } = findRoute(method, path);
  const req: any = {
    method,
    path: path.replace(/^\/api/, "") || "/",
    originalUrl: path,
    url: path,
    params,
    query: {},
    body: options.body ?? {},
    headers: options.cookie ? { cookie: options.cookie } : {}
  };
  const res = makeRes();
  const guard = harness.getGuard();
  const next = () => Promise.resolve(route.handler(req, res, next));
  if (guard) {
    await guard(req, res, next);
  } else {
    await next();
  }
  return res;
}

function cookieFrom(res: any): string {
  const raw = res.headers["set-cookie"] as string | undefined;
  if (!raw) throw new Error("register did not set a session cookie");
  const token = /motormedic_session=([^;]+)/.exec(raw)?.[1];
  if (!token) throw new Error("session cookie missing motormedic_session");
  return `motormedic_session=${token}`;
}

interface Tenant {
  companyId: number;
  userId: number;
  plantId: number | null;
  cookie: string;
}

const run = Date.now().toString(36);

async function registerTenant(label: string): Promise<Tenant> {
  const companyName = `Good Catch ${label} ${run}`;
  const username = `gc_${label}_${run}`;
  const res = await callApi("POST", "/api/auth/register", {
    body: {
      username,
      password: "audit-password-123",
      plantCompanyName: companyName,
      termsAccepted: true
    }
  });
  expect(res.statusCode).toBe(201);
  return {
    companyId: res.body.company_id,
    userId: res.body.id,
    plantId: res.body.plant_id,
    cookie: cookieFrom(res)
  };
}

let tenantA: Tenant;
let tenantB: Tenant;
let tenantC: Tenant;
let aAssetId: number;
let aComponentId: number;
let bAssetId: number;
let bComponentId: number;
let aCatchId: number;
let bCatchId: number;

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.ENABLE_DEV_AUTH_SEED;
  process.env.NODE_ENV = "test";

  await import("../../server.ts");

  tenantA = await registerTenant("a");
  tenantB = await registerTenant("b");
  tenantC = await registerTenant("c");

  const aAsset = await callApi("POST", "/api/assets", {
    cookie: tenantA.cookie,
    body: { name: `A-only asset ${run}`, tag_number: `GCA-${run}` }
  });
  expect(aAsset.statusCode).toBe(201);
  aAssetId = aAsset.body.id;

  const aComponent = await callApi("POST", "/api/components", {
    cookie: tenantA.cookie,
    body: { asset_id: aAssetId, name: `A-only component ${run}` }
  });
  expect(aComponent.statusCode).toBe(201);
  aComponentId = aComponent.body.id;

  const bAsset = await callApi("POST", "/api/assets", {
    cookie: tenantB.cookie,
    body: { name: `B-only asset ${run}`, tag_number: `GCB-${run}` }
  });
  expect(bAsset.statusCode).toBe(201);
  bAssetId = bAsset.body.id;

  const bComponent = await callApi("POST", "/api/components", {
    cookie: tenantB.cookie,
    body: { asset_id: bAssetId, name: `B-only component ${run}` }
  });
  expect(bComponent.statusCode).toBe(201);
  bComponentId = bComponent.body.id;

  const aCatch = await callApi("POST", "/api/good-catches", {
    cookie: tenantA.cookie,
    body: {
      title: `A coupling catch ${run}`,
      description: "Caught a cracked coupling spider before failure.",
      catch_date: "2026-03-01",
      avoided_cost_cents: 125050,
      downtime_hours_avoided: 8.5,
      safety_hazard: true,
      safety_note: "Guard exposure removed.",
      asset_id: aAssetId,
      component_id: aComponentId
    }
  });
  expect(aCatch.statusCode).toBe(201);
  aCatchId = aCatch.body.catch.id;

  const bCatch = await callApi("POST", "/api/good-catches", {
    cookie: tenantB.cookie,
    body: {
      title: `B bearing catch ${run}`,
      catch_date: "2026-03-02",
      avoided_cost_cents: 999999,
      downtime_hours_avoided: 1.25,
      safety_hazard: false,
      asset_id: bAssetId,
      component_id: bComponentId
    }
  });
  expect(bCatch.statusCode).toBe(201);
  bCatchId = bCatch.body.catch.id;
});

describe("GOOD-CATCHES - tenant isolation", () => {
  it("tenant B's catches are invisible to tenant A (and vice versa)", async () => {
    const aList = await callApi("GET", "/api/good-catches", {
      cookie: tenantA.cookie
    });
    expect(aList.statusCode).toBe(200);
    const aIds = (aList.body.catches ?? []).map((row: any) => row.id);
    expect(aIds).toContain(aCatchId);
    expect(aIds).not.toContain(bCatchId);
    expect(aList.body.summary.total_avoided_cost_cents).toBe(125050);
    expect(aList.body.summary.safety_catch_count).toBe(1);

    const bList = await callApi("GET", "/api/good-catches", {
      cookie: tenantB.cookie
    });
    const bIds = (bList.body.catches ?? []).map((row: any) => row.id);
    expect(bIds).toContain(bCatchId);
    expect(bIds).not.toContain(aCatchId);
    expect(bList.body.summary.total_avoided_cost_cents).toBe(999999);
  });

  it("cross-tenant lineage / work-order links are rejected with 404", async () => {
    const foreignAsset = await callApi("POST", "/api/good-catches", {
      cookie: tenantA.cookie,
      body: {
        title: "A catch with B asset",
        avoided_cost_cents: 100,
        asset_id: bAssetId
      }
    });
    expect(foreignAsset.statusCode).toBe(404);
    expect(foreignAsset.body.field).toBe("asset_id");

    const foreignComponent = await callApi("POST", "/api/good-catches", {
      cookie: tenantA.cookie,
      body: {
        title: "A catch with B component",
        avoided_cost_cents: 100,
        component_id: bComponentId
      }
    });
    expect(foreignComponent.statusCode).toBe(404);
    expect(foreignComponent.body.field).toBe("component_id");

    // No work order with this id exists for A -> treated as 404, never linked.
    const missingWorkOrder = await callApi("POST", "/api/good-catches", {
      cookie: tenantA.cookie,
      body: {
        title: "A catch with a foreign work order",
        avoided_cost_cents: 100,
        work_order_id: 987654
      }
    });
    expect(missingWorkOrder.statusCode).toBe(404);
    expect(missingWorkOrder.body.field).toBe("work_order_id");
  });

  it("PATCH and DELETE are scoped to the session tenant", async () => {
    const patchForeign = await callApi("PATCH", `/api/good-catches/${bCatchId}`, {
      cookie: tenantA.cookie,
      body: { title: "A must not rename B" }
    });
    expect(patchForeign.statusCode).toBe(404);

    const deleteForeign = await callApi("DELETE", `/api/good-catches/${bCatchId}`, {
      cookie: tenantA.cookie
    });
    expect(deleteForeign.statusCode).toBe(404);

    const patchOwn = await callApi("PATCH", `/api/good-catches/${bCatchId}`, {
      cookie: tenantB.cookie,
      body: { title: "B renamed", avoided_cost_cents: 777 }
    });
    expect(patchOwn.statusCode).toBe(200);
    expect(patchOwn.body.catch.title).toBe("B renamed");
    expect(patchOwn.body.catch.avoided_cost_cents).toBe(777);

    const deleteOwn = await callApi("DELETE", `/api/good-catches/${bCatchId}`, {
      cookie: tenantB.cookie
    });
    expect(deleteOwn.statusCode).toBe(200);

    const bList = await callApi("GET", "/api/good-catches", {
      cookie: tenantB.cookie
    });
    expect(bList.body.catches).toEqual([]);
    expect(bList.body.summary.empty).toBe(true);
  });

  it("an empty tenant gets an honest empty state", async () => {
    const empty = await callApi("GET", "/api/good-catches", {
      cookie: tenantC.cookie
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.body.catches).toEqual([]);
    expect(empty.body.summary).toMatchObject({
      catch_count: 0,
      total_avoided_cost_cents: 0,
      total_downtime_hours_avoided: 0,
      safety_catch_count: 0,
      empty: true
    });
  });
});

describe("GOOD-CATCHES - integer-cent totals", () => {
  function row(overrides: Partial<GoodCatchRow>): GoodCatchRow {
    return {
      id: 1,
      tenant_id: 1,
      title: "fixture",
      avoided_cost_cents: 0,
      downtime_hours_avoided: 0,
      safety_hazard: false,
      ...overrides
    };
  }

  it("sums cents as integers and excludes tenant B's rows", () => {
    const summary = buildGoodCatchSummary({
      tenantId: 1,
      rows: [
        row({ id: 1, avoided_cost_cents: 10, downtime_hours_avoided: 1.25, safety_hazard: true }),
        row({ id: 2, avoided_cost_cents: 20, downtime_hours_avoided: 0.5 }),
        row({ id: 3, avoided_cost_cents: 30, downtime_hours_avoided: 0.25 }),
        row({ id: 4, tenant_id: 2, avoided_cost_cents: 999999 })
      ]
    });

    expect(summary.catchCount).toBe(3);
    expect(summary.totalAvoidedCostCents).toBe(60);
    expect(Number.isInteger(summary.totalAvoidedCostCents)).toBe(true);
    expect(summary.totalDowntimeHoursAvoided).toBe(2);
    expect(summary.safetyCatchCount).toBe(1);
    expect(summary.empty).toBe(false);
    expect(summary.catches.map((item) => item.id)).not.toContain(4);
  });

  it("rejects decimal (dollar-style) cents instead of silently rounding", () => {
    expect(parseAvoidedCostCents(1250)).toEqual({ ok: true, cents: 1250 });
    expect(parseAvoidedCostCents("1250")).toEqual({ ok: true, cents: 1250 });
    expect(parseAvoidedCostCents("12.50").ok).toBe(false);
    expect(parseAvoidedCostCents(12.5).ok).toBe(false);
    expect(parseAvoidedCostCents(-1).ok).toBe(false);
  });

  it("converts human dollar input to integer cents without float math", () => {
    expect(dollarsInputToCents("1,234.56")).toBe(123456);
    expect(dollarsInputToCents("$0.10")).toBe(10);
    expect(dollarsInputToCents("1.005")).toBeNull();
    expect(formatCents(60)).toBe("$0.60");
    expect(formatCents(123456)).toBe("$1,234.56");
  });

  it("work orders are validated against session-owned ids (404 on foreign)", () => {
    const owned = {
      plants: new Set<number>(),
      routes: new Set<number>(),
      assets: new Set<number>(),
      components: new Set<number>(),
      alerts: new Set<string>(),
      workOrders: new Set<number>([101])
    };
    expect(validateGoodCatchLinks({ work_order_id: 101 }, owned).ok).toBe(true);
    const foreign = validateGoodCatchLinks({ work_order_id: 303 }, owned);
    expect(foreign.ok).toBe(false);
    if ("status" in foreign) {
      expect(foreign.status).toBe(404);
      expect(foreign.field).toBe("work_order_id");
    }
  });
});

describe("GOOD-CATCHES - scope lock and DEP-1 mirror", () => {
  it("reads/writes derive the tenant from the session, never req.query", () => {
    const start = serverSource.indexOf('app.get("/api/good-catches"');
    const end = serverSource.indexOf(
      "// USER AUTHENTICATION ENDPOINTS",
      start
    );
    expect(start).toBeGreaterThan(-1);
    const block = serverSource.slice(start, end);
    expect(block).toContain("requestTenantId(req)");
    expect(block).toContain("gc.tenant_id = $1");
    expect(block).toContain("WHERE id = $1 AND tenant_id = $2");
    expect(block).toContain("DELETE FROM good_catches WHERE id = $1 AND tenant_id = $2");
    expect(block).not.toMatch(/req\.query/);
    expect(block).not.toMatch(/company_id\s*=\s*req\./);
  });

  it("migration 022 and initializeDatabase share the same idempotent table", () => {
    expect(migrationSource).toContain("CREATE TABLE IF NOT EXISTS good_catches");
    expect(serverSource).toContain("CREATE TABLE IF NOT EXISTS good_catches");
    expect(migrationSource).toContain(
      "CREATE INDEX IF NOT EXISTS idx_good_catches_tenant"
    );
    expect(serverSource).toContain(
      "CREATE INDEX IF NOT EXISTS idx_good_catches_tenant"
    );
  });

  it("money stays integer cents: no float / dollar NUMERIC column", () => {
    expect(migrationSource).toMatch(/avoided_cost_cents\s+INTEGER\s+NOT NULL/i);
    expect(migrationSource).not.toMatch(
      /avoided_cost_cents\s+(NUMERIC|DECIMAL|REAL|DOUBLE|FLOAT)/i
    );
    expect(migrationSource).not.toMatch(/\b(price_dollars|cost_dollars)\b/i);
    expect(serverSource).toContain(
      "avoided_cost_cents INTEGER NOT NULL DEFAULT 0"
    );
  });
});
