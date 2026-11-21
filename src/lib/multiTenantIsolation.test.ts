/**
 * SELL-READINESS AUDIT - self-serve signup + multi-tenant isolation.
 *
 * This file is an AUDIT harness, not a product feature. It mounts the real
 * Express route handlers from server.ts (via a fake Express app) in the
 * DATABASE_URL-less memory mode, then creates two independent tenants through
 * the real POST /api/auth/register handler and drives the real handlers with
 * the real AR-29 session guard.
 *
 * Tests in this file assert the safe/expected behaviour. The former
 * documented-broken cases now run as normal `it(...)` cases and must stay
 * green: tenant scope is enforced in the product code, not waived here.
 */
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";

type Handler = (req: any, res: any, next?: any) => unknown;

interface Route {
  method: string;
  pattern: string;
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
        if (position <= index) {
          throw new Error("next() called multiple times");
        }
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
      .filter((item): item is string | string[] => typeof item === "string" || Array.isArray(item))
      .flat();
    const middleware = leading.filter(
      (item): item is Handler => typeof item === "function"
    );
    const handler = compose(middleware, terminal);
    for (const pattern of paths) {
      if (typeof pattern !== "string") continue;
      const { regex, keys } = makeRegex(pattern);
      routes.push({ method, pattern, regex, keys, handler });
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

// ---- SLICE-SEC-6b POOL-path scaffolding -----------------------------------
// Re-imports server.ts in a sub-suite with DATABASE_URL set and a scriptable
// fake pg Pool so the production SQL branch (server.ts:16188-16256) runs.
// The single `express` mock (line 111) is reused: re-importing server.ts appends
// the pool-branch handlers onto the same `harness.routes` array, so the last
// POST /api/collection-points/batch registration is the pool branch.

// Scriptable fake pg Pool.
let poolQueryImpl: ((text: string, params?: unknown[]) => Promise<any>) | null = null;
const poolCallLog: Array<{ text: string; params?: unknown[] }> = [];

const fakePool: any = {
  query: async (text: string, params?: unknown[]) => {
    poolCallLog.push({ text, params });
    if (poolQueryImpl) return poolQueryImpl(text, params);
    return { rows: [], rowCount: 0, command: "SELECT", oid: 0, fields: [] };
  },
  on() {
    return fakePool;
  }
};

vi.mock("pg", () => ({
  default: { Pool: class { constructor() { return fakePool; } } },
  Pool: class { constructor() { return fakePool; } }
}));

const realProcessExit = process.exit;

function findBatchRouteHandler(): any {
  const matches = harness.routes.filter(
    (r: any) =>
      r.method === "POST" &&
      typeof r.pattern === "string" &&
      /collection.points\/batch/.test(r.pattern)
  );
  if (matches.length === 0) throw new Error("No POST /api/collection-points/batch route registered");
  return matches[matches.length - 1].handler;
}

async function callBatchHandler(
  body: Record<string, unknown>,
  tenantId: number | null
): Promise<any> {
  const handler = findBatchRouteHandler();
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(c: number) { this.statusCode = c; return this; },
    json(p: any) { this.body = p; return this; }
  };
  const req: any = {
    body,
    tenantId,
    auth: tenantId == null ? {} : { tenantId }
  };
  await handler(req, res, () => Promise.resolve());
  return res;
}

function lastCallText(): string | undefined {
  return poolCallLog[poolCallLog.length - 1]?.text as string | undefined;
}
function lastCallParams(): unknown[] | undefined {
  return poolCallLog[poolCallLog.length - 1]?.params as unknown[] | undefined;
}
function findCallText(prefix: string): { text: string; params?: unknown[] } | undefined {
  return poolCallLog.find((c) => String(c.text).startsWith(prefix));
}
function countCallText(exact: string): number {
  return poolCallLog.filter((c) => c.text === exact).length;
}

// ---- end scaffolding ------------------------------------------------------

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

interface CallOptions {
  body?: Record<string, unknown>;
  cookie?: string;
  query?: Record<string, string>;
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

async function callApi(method: string, path: string, options: CallOptions = {}) {
  const { route, params } = findRoute(method, path);
  const req: any = {
    method,
    path: path.replace(/^\/api/, "") || "/",
    originalUrl: path,
    url: path,
    params,
    query: options.query ?? {},
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
  username: string;
  companyName: string;
  companyId: number;
  userId: number;
  plantId: number | null;
  cookie: string;
  termsAcceptedAt: string | null;
}

const run = Date.now().toString(36);

async function registerTenant(label: string): Promise<Tenant> {
  const companyName = `Audit ${label} ${run}`;
  const username = `audit_${label}_${run}`;
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
    username,
    companyName,
    companyId: res.body.company_id,
    userId: res.body.id,
    plantId: res.body.plant_id,
    cookie: cookieFrom(res),
    termsAcceptedAt: res.body.terms_accepted_at
  };
}

let tenantA: Tenant;
let tenantB: Tenant;
let storeTenant: Tenant;
let storePassword: string;
let storeCheckoutSessionId: string;
let storeCheckoutRef: string;
let bSystemRouteId: number;
let bAssetId: number;
let bComponentId: number;
let bCollectionPointId: number;
let bMeasurementPointId: number;

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.ENABLE_DEV_AUTH_SEED;
  process.env.NODE_ENV = "test";

  // Executes server.ts against the fake Express app. All handlers and the
  // AR-29 guard are registered; setupServer()'s listen() is a no-op.
  await import("../../server.ts");

  tenantA = await registerTenant("a");
  tenantB = await registerTenant("b");

  // Tenant B creates a route-less asset, which must auto-create B's own
  // invisible is_system route (H1/H4) scoped to B.
  const assetRes = await callApi("POST", "/api/assets", {
    cookie: tenantB.cookie,
    body: { name: `B-only asset ${run}`, tag_number: `B-${run}` }
  });
  expect(assetRes.statusCode).toBe(201);
  bAssetId = assetRes.body.id;
  bSystemRouteId = assetRes.body.route_id;

  const compRes = await callApi("POST", "/api/components", {
    cookie: tenantB.cookie,
    body: { asset_id: bAssetId, name: `B-only component ${run}` }
  });
  expect(compRes.statusCode).toBe(201);
  bComponentId = compRes.body.id;

  const cpRes = await callApi("POST", "/api/collection-points", {
    cookie: tenantB.cookie,
    body: { component_id: bComponentId, name: `B-only point ${run}` }
  });
  expect(cpRes.statusCode).toBe(201);
  bCollectionPointId = cpRes.body.id;

  const mpRes = await callApi("POST", "/api/measurement-points", {
    cookie: tenantB.cookie,
    body: { collection_point_id: bCollectionPointId, direction: "Horizontal" }
  });
  expect(mpRes.statusCode).toBe(201);
  bMeasurementPointId = mpRes.body.id;

  // STOREFRONT — public build checkout + webhook provisions a third tenant.
  // The checkout body deliberately carries a FORGED company_id (tenant A's)
  // to prove the mapping/provisioning ignores client tenancy.
  storePassword = "store-password-123";
  const storeUsername = `store_${run}`;
  const checkoutRes = await callApi("POST", "/api/checkout/create", {
    body: {
      moduleKeys: ["vibration", "oil"],
      companyName: `Storefront Co ${run}`,
      username: storeUsername,
      password: storePassword,
      email: `store_${run}@example.com`,
      termsAccepted: true,
      company_id: tenantA.companyId
    }
  });
  expect([200, 201]).toContain(checkoutRes.statusCode);
  storeCheckoutSessionId = checkoutRes.body.checkout_session_id;
  storeCheckoutRef = checkoutRes.body.checkout_ref;
  expect(typeof storeCheckoutSessionId).toBe("string");
  expect(typeof storeCheckoutRef).toBe("string");

  const webhookRes = await callApi("POST", "/api/square/webhook", {
    body: {
      event_id: `evt_store_${run}`,
      type: "payment.created",
      data: {
        object: {
          payment: {
            id: `pay_store_${run}`,
            status: "COMPLETED",
            referenceId: storeCheckoutRef,
            subscriptionId: `sub_store_${run}`,
            customerId: `cus_store_${run}`,
            // Forged tenancy carried by the caller: must be ignored; the
            // server-held checkout_ref is the only mapping authority.
            company_id: tenantA.companyId,
            companyId: tenantA.companyId
          }
        }
      }
    }
  });
  expect(webhookRes.statusCode).toBe(200);

  const loginRes = await callApi("POST", "/api/auth/login", {
    body: { username: storeUsername, password: storePassword }
  });
  expect(loginRes.statusCode).toBe(200);
  storeTenant = {
    username: storeUsername,
    companyName: `Storefront Co ${run}`,
    companyId: loginRes.body.company_id,
    userId: loginRes.body.id,
    plantId: loginRes.body.plant_id,
    cookie: cookieFrom(loginRes),
    termsAcceptedAt: loginRes.body.terms_accepted_at
  };
  // Importing server.ts (758 KB) and registering every handler exceeds the
  // 10s default hook timeout once v8 coverage instrumentation is applied, so
  // this suite needs real headroom for the module load plus seed requests.
}, 120_000);

describe("Q1 - self-serve signup creates an isolated tenant shell", () => {
  it("POST /api/auth/register is public and creates a distinct company + user + plant", () => {
    expect(tenantA.companyId).not.toBe(tenantB.companyId);
    expect(tenantA.userId).not.toBe(tenantB.userId);
    expect(tenantA.plantId).not.toBe(tenantB.plantId);
    expect(tenantA.plantId).not.toBeNull();
    expect(tenantB.plantId).not.toBeNull();
  });

  it("registration creates the tenant's own plant, not company 1's", async () => {
    const res = await callApi("GET", "/api/hierarchy", { cookie: tenantA.cookie });
    expect(res.statusCode).toBe(200);
    const ownPlant = (res.body.plants ?? []).find(
      (p: any) => p.id === tenantA.plantId
    );
    expect(ownPlant?.company_id).toBe(tenantA.companyId);
    expect(ownPlant?.company_id).not.toBe(1);
  });

  it("the invisible is_system route is created on the NEW tenant's plant", async () => {
    // The route was created via POST /api/assets for tenant B with no route_id.
    expect(bSystemRouteId).toBeGreaterThan(0);
    // B's own plant must differ from tenant A's and from demo plant 1.
    expect(tenantB.plantId).not.toBe(tenantA.plantId);
    expect(tenantB.plantId).not.toBe(1);

    // The auto-created route must belong to B's plant, not to a demo plant.
    const res = await callApi("GET", "/api/hierarchy", { cookie: tenantB.cookie });
    const systemRoute = (res.body.routes ?? []).find(
      (r: any) => r.id === bSystemRouteId
    );
    expect(systemRoute?.is_system).toBe(true);
    expect(systemRoute?.plant_id).toBe(tenantB.plantId);
  });

  it("LEGAL-WRAPPER-A assent is required per registration, never inherited", async () => {
    // Tenant A already accepted. A brand-new registration without its own
    // assent must still be rejected (server.ts:8708).
    const rejected = await callApi("POST", "/api/auth/register", {
      body: {
        username: `audit_c_${run}`,
        password: "audit-password-123",
        plantCompanyName: `Audit C ${run}`
      }
    });
    expect(rejected.statusCode).toBe(400);
    expect(String(rejected.body.error)).toMatch(/Acceptance/i);

    const tenantC = await registerTenant("c");
    expect(tenantC.termsAcceptedAt).not.toBeNull();
    expect(tenantC.userId).not.toBe(tenantA.userId);
    expect(tenantC.userId).not.toBe(tenantB.userId);
  });
});

describe("Q2 - hierarchy reads are tenant-scoped", () => {
  it(
    "BUG /api/hierarchy: tenant A must only receive A's plants/routes/assets/components/points",
    async () => {
      const res = await callApi("GET", "/api/hierarchy", { cookie: tenantA.cookie });
      expect(res.statusCode).toBe(200);
      const plantCompanies = (res.body.plants ?? []).map((p: any) => p.company_id);
      expect(new Set(plantCompanies)).toEqual(new Set([tenantA.companyId]));
      const assetNames = (res.body.assets ?? []).map((a: any) => a.name);
      expect(assetNames).not.toContain(`B-only asset ${run}`);
    }
  );

  it(
    "BUG GET /api/routes (no filter) leaks every tenant's routes",
    async () => {
      const res = await callApi("GET", "/api/routes", { cookie: tenantA.cookie });
      expect(res.statusCode).toBe(200);
      expect(res.body.map((r: any) => r.id)).not.toContain(bSystemRouteId);
    }
  );

  it(
    "BUG GET /api/assets (no filter) leaks every tenant's assets",
    async () => {
      const res = await callApi("GET", "/api/assets", { cookie: tenantA.cookie });
      expect(res.statusCode).toBe(200);
      expect(res.body.map((a: any) => a.id)).not.toContain(bAssetId);
    }
  );

  it(
    "BUG GET /api/components (no filter) leaks every tenant's components",
    async () => {
      const res = await callApi("GET", "/api/components", { cookie: tenantA.cookie });
      expect(res.statusCode).toBe(200);
      expect(res.body.map((c: any) => c.id)).not.toContain(bComponentId);
    }
  );

  it(
    "BUG GET /api/collection-points (no filter) leaks every tenant's points",
    async () => {
      const res = await callApi("GET", "/api/collection-points", {
        cookie: tenantA.cookie
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.map((cp: any) => cp.id)).not.toContain(bCollectionPointId);
    }
  );

  it(
    "BUG GET /api/measurement-points (no filter) leaks every tenant's points",
    async () => {
      const res = await callApi("GET", "/api/measurement-points", {
        cookie: tenantA.cookie
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.map((mp: any) => mp.id)).not.toContain(bMeasurementPointId);
    }
  );
});

describe("Q2 - direct-ID access must not cross tenants", () => {
  it(
    "BUG direct-ID system route (is_system) is readable by another tenant",
    async () => {
      // server.ts:10026-10034 - SELECT * FROM routes WHERE id = $1, no tenant.
      const res = await callApi("GET", `/api/routes/single/${bSystemRouteId}`, {
        cookie: tenantA.cookie
      });
      expect([403, 404]).toContain(res.statusCode);
    }
  );

  it("BUG direct-ID asset is readable by another tenant", async () => {
    // server.ts:10257-10269 - SELECT * FROM assets WHERE id = $1, no tenant.
    const res = await callApi("GET", `/api/assets/${bAssetId}`, {
      cookie: tenantA.cookie
    });
    expect([403, 404]).toContain(res.statusCode);
  });

  it("BUG direct-ID collection point is readable by another tenant", async () => {
    // server.ts:11231-11239 - no tenant predicate.
    const res = await callApi("GET", `/api/collection-points/${bCollectionPointId}`, {
      cookie: tenantA.cookie
    });
    expect([403, 404]).toContain(res.statusCode);
  });

  it("BUG direct-ID measurement point is readable by another tenant", async () => {
    // server.ts:11625-11633 - no tenant predicate.
    const res = await callApi("GET", `/api/measurement-points/${bMeasurementPointId}`, {
      cookie: tenantA.cookie
    });
    expect([403, 404]).toContain(res.statusCode);
  });

  it("BUG GET /api/companies exposes every tenant's company row", async () => {
    // server.ts:9061-9068 - SELECT * FROM companies (or memoryCompanies).
    const res = await callApi("GET", "/api/companies", { cookie: tenantA.cookie });
    expect(res.statusCode).toBe(200);
    expect(res.body.map((c: any) => c.id)).toEqual([tenantA.companyId]);
  });
});

describe("Q2 - analytics reads must not include another tenant's equipment", () => {
  it(
    "BUG /api/dashboard/fault-distribution must show an honest empty state for a tenant with no analyses",
    async () => {
      // server.ts:8132-8169 - client query param company_id (never req.tenantId),
      // then a 12-record fallback when there are zero rows (:8224-8232).
      const res = await callApi("GET", "/api/dashboard/fault-distribution", {
        cookie: tenantA.cookie
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.total).toBe(0);
    }
  );

  it(
    "BUG /api/dashboard/roi-calculation must not invent savings from other tenants' records",
    async () => {
      // server.ts:8492-8552 - client company_id filter + fallback critical=6.
      const res = await callApi("GET", "/api/dashboard/roi-calculation", {
        cookie: tenantA.cookie
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.critical_faults_prevented).toBe(0);
      expect(res.body.estimated_savings).toBe(0);
    }
  );

  it(
    "BUG /api/dashboard/health-summary must count only the session tenant's assets",
    async () => {
      // server.ts:8081-8084 + getAssetsWithStatus(companyId) where companyId is
      // req.query.company_id; omitting it returns every tenant's assets.
      const res = await callApi("GET", "/api/dashboard/health-summary", {
        cookie: tenantA.cookie
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.total).toBe(0);
    }
  );

  it(
    "BUG /api/dashboard must derive the tenant from the session, not a query param",
    async () => {
      // server.ts:7593-7627 - company_id comes from req.query; the plants
      // (7598) and asset count (7607) queries are unfiltered.
      const res = await callApi("GET", "/api/dashboard", { cookie: tenantA.cookie });
      // Memory mode returns 503 (no pool), but the DB path is the sale path.
      // This assertion documents the required session-derived tenant contract.
      expect(res.statusCode).toBe(200);
      expect(res.body.assetCount).toBe(0);
    }
  );

  it("H2 LEFT JOIN reads exist so flat system-route assets are not silently dropped", () => {
    // Guardrail already covered by hierarchyFlex.test.ts; kept here so this
    // file fails if the LEFT JOINs are reverted to INNER JOINs.
    const fs = require("node:fs") as typeof import("node:fs");
    const serverSource = fs.readFileSync(
      require("node:path").join(process.cwd(), "server.ts"),
      "utf8"
    );
    const leftJoins = serverSource.match(/LEFT JOIN routes rt ON ast\.route_id = rt\.id/g);
    expect(leftJoins?.length ?? 0).toBeGreaterThanOrEqual(8);
  });
});

describe("Q2 - persistence reads are company-scoped", () => {
  it("analysis-results derives tenant_id from the verified session (safe)", () => {
    const serverSource = readServer();
    const start = serverSource.indexOf('app.get("/api/analysis-results"');
    const body = serverSource.slice(start, start + 4000);
    expect(body).toContain("req.tenantId");
    expect(body).toContain("tenant_id = $");
  });

  it("diagnosis-logs derives tenant_id from the verified session (safe)", () => {
    const serverSource = readServer();
    const start = serverSource.indexOf('app.get("/api/diagnosis-logs"');
    const body = serverSource.slice(start, start + 3000);
    expect(body).toContain("dh.tenant_id = $2");
    expect(body).toContain("req.tenantId");
  });

  it(
    "BUG oil-analysis reads are keyed only by asset_id, with no tenant/company predicate",
    () => {
      // server.ts:1904-1915 -> fetchOilSamplesForAsset(assetId);
      // oilAnalysisPersistence.ts:166-199 filters oil_analysis/oil_samples by
      // asset_id only.
      const serverSource = readServer();
      const start = serverSource.indexOf("app.get(OIL_ANALYSIS_API_PATH");
      const body = serverSource.slice(start, start + 900);
      expect(body).toContain("req.tenantId");
    }
  );

  it("reports (a representative write-path read) IS tenant-scoped (safe)", () => {
    const serverSource = readServer();
    expect(serverSource).toContain('push("tenant_id =", req.tenantId ?? -1)');
    expect(serverSource).toContain("WHERE id = $1 AND tenant_id = $2");
  });

  it(
    "BUG dashboard work-order counts are global (no tenant_id predicate)",
    () => {
      // server.ts:7758-7770 - COUNT(*) FROM work_orders with no tenant_id.
      const serverSource = readServer();
      const start = serverSource.indexOf("COUNT(*)::int AS n FROM work_orders WHERE status = 'scheduled'");
      const body = serverSource.slice(start, start + 600);
      expect(body).toContain("tenant_id");
    }
  );

  it(
    "BUG GET /api/analysis-history (and /:id) is not tenant-scoped",
    () => {
      // server.ts:11751-11764 and 11883-11886 - no tenant predicate.
      const serverSource = readServer();
      const start = serverSource.indexOf('app.get(["/api/analysis-history", "/api/analysis_history"');
      const body = serverSource.slice(start, start + 1200);
      expect(body).toContain("tenant_id");
    }
  );

  it(
    "BUG GET /api/alerts has no tenant predicate",
    () => {
      // server.ts:2355-2388 - filters only by client query params.
      const serverSource = readServer();
      const start = serverSource.indexOf('app.get("/api/alerts"');
      const body = serverSource.slice(start, start + 1400);
      expect(body).toContain("tenant_id");
    }
  );
});

describe("Q2 - legal assent and dev-seed/bootstrap do not cross tenant boundaries", () => {
  it("each tenant's session carries its own terms_accepted_at", async () => {
    const a = await callApi("GET", "/api/auth/session", { cookie: tenantA.cookie });
    const b = await callApi("GET", "/api/auth/session", { cookie: tenantB.cookie });
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(a.body.company_id).toBe(tenantA.companyId);
    expect(b.body.company_id).toBe(tenantB.companyId);
    expect(a.body.terms_accepted_at).not.toBeNull();
    expect(b.body.terms_accepted_at).not.toBeNull();
  });

  it(
    "BUG a freshly registered tenant inherits the dev demo companies/plants even with ENABLE_DEV_AUTH_SEED unset",
    async () => {
      // server.ts:7010-7075 seeds memoryCompanies/memoryPlants/memoryRoutes/
      // assets/components/points unconditionally (not behind the AR-29 gate).
      const res = await callApi("GET", "/api/hierarchy", { cookie: tenantA.cookie });
      const plantNames = (res.body.plants ?? []).map((p: any) => p.name);
      expect(plantNames).not.toContain("Houston Refining Plant");
      expect(plantNames).not.toContain("Chicago Manufacturing Facility");
      expect(plantNames).not.toContain("Demo Galveston Refinery");
    }
  );

  it("bootstrap-admin only mints a user (company_id NULL); it never creates a demo company or rows", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/lib/auth/bootstrapAdmin.ts"),
      "utf8"
    );
    expect(src).toContain("SELECT NULL, $1, $2, 'system-admin'");
    expect(src).not.toContain("INSERT INTO companies");
    expect(src).not.toContain("INSERT INTO plants");
    expect(src).not.toContain("INSERT INTO routes");
  });

  it(
    "BUG DB-mode demo company seeding is gated by NODE_ENV, not the AR-29 ENABLE_DEV_AUTH_SEED gate",
    () => {
      // server.ts:12135-12156 inserts Allied Reliability / ExxonMobil / Demo
      // Reliability Corp whenever NODE_ENV !== 'production', even though the
      // AR-29 contract says seeding requires ENABLE_DEV_AUTH_SEED=true.
      const serverSource = readServer();
      const start = serverSource.indexOf("DEV-ONLY: seed standard demo companies");
      const body = serverSource.slice(start, start + 900);
      expect(body).toContain("isDevAuthSeedEnabled(process.env)");
    }
  );
});

describe("E3/E4 - storefront checkout provisions a NEW, isolated tenant", () => {
  it("GET /api/catalog is public and lists the module catalog keys", async () => {
    const res = await callApi("GET", "/api/catalog");
    expect(res.statusCode).toBe(200);
    const keys = (res.body.modules ?? []).map((module: any) => module.key);
    expect(keys).toEqual(["vibration", "thermography", "ultrasound", "oil"]);
    expect(res.body.modules.every((module: any) => module.price_cents > 0)).toBe(
      true
    );
  });

  it("checkout/create ignores a forged client company_id; webhook provisions the new company", () => {
    // The forged tenant A id was sent in beforeAll. The paid tenant must not
    // borrow A's company, plant, user or route.
    expect(storeTenant.companyId).not.toBe(tenantA.companyId);
    expect(storeTenant.companyId).not.toBe(tenantB.companyId);
    expect(storeTenant.plantId).not.toBe(tenantA.plantId);
    expect(storeTenant.plantId).not.toBe(tenantB.plantId);
    expect(storeTenant.userId).not.toBe(tenantA.userId);
    expect(storeTenant.userId).not.toBe(tenantB.userId);
  });

  it("provisioning creates company/user/plant scoped to the NEW company (no borrowed plant/route)", async () => {
    const res = await callApi("GET", "/api/hierarchy", {
      cookie: storeTenant.cookie
    });
    expect(res.statusCode).toBe(200);

    const plants = res.body.plants ?? [];
    expect(plants.length).toBeGreaterThan(0);
    expect(new Set(plants.map((plant: any) => plant.company_id))).toEqual(
      new Set([storeTenant.companyId])
    );
    expect(plants.map((plant: any) => plant.id)).not.toContain(tenantA.plantId);
    expect(plants.map((plant: any) => plant.id)).not.toContain(tenantB.plantId);

    const ownPlantIds = plants.map((plant: any) => plant.id);
    const routes = res.body.routes ?? [];
    expect(routes.length).toBeGreaterThan(0);
    expect(
      routes.every((route: any) => ownPlantIds.includes(route.plant_id))
    ).toBe(true);
    expect(routes.map((route: any) => route.id)).not.toContain(bSystemRouteId);

    const assetNames = (res.body.assets ?? []).map((asset: any) => asset.name);
    expect(assetNames).not.toContain(`B-only asset ${run}`);
  });

  it("terms assent is recorded for the NEW tenant user and remains per-tenant", async () => {
    const storeSession = await callApi("GET", "/api/auth/session", {
      cookie: storeTenant.cookie
    });
    const aSession = await callApi("GET", "/api/auth/session", {
      cookie: tenantA.cookie
    });
    expect(storeSession.statusCode).toBe(200);
    expect(aSession.statusCode).toBe(200);
    expect(storeSession.body.company_id).toBe(storeTenant.companyId);
    expect(aSession.body.company_id).toBe(tenantA.companyId);
    expect(storeSession.body.terms_accepted_at).not.toBeNull();
    expect(aSession.body.terms_accepted_at).not.toBeNull();
    expect(storeSession.body.id).not.toBe(aSession.body.id);
  });

  it("entitlements are module-based: active module present, unpaid module absent/403", async () => {
    const ent = await callApi("GET", "/api/entitlements", {
      cookie: storeTenant.cookie
    });
    expect(ent.statusCode).toBe(200);
    expect(ent.body.company_id).toBe(storeTenant.companyId);
    expect(ent.body.active_modules).toContain("vibration");
    expect(ent.body.active_modules).toContain("oil");
    expect(ent.body.active_modules).not.toContain("thermography");

    // Unpaid module: requireModule rejects before any AI/DB work.
    const denied = await callApi("POST", "/api/analyze-thermography", {
      cookie: storeTenant.cookie,
      body: {}
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.body.code).toBe("MODULE_NOT_ENTITLED");

    // Active module: the guard passes and the handler runs (memory mode has
    // no pool, so the honest downstream answer is 503, never a 403).
    const allowed = await callApi("POST", "/api/oil-analysis", {
      cookie: storeTenant.cookie,
      body: {}
    });
    expect(allowed.statusCode).not.toBe(403);
    expect(allowed.statusCode).toBe(503);

    // The nav builder omits the same unpaid module entry entirely.
    const { visibleTabs } = await import("./moduleNav");
    expect(visibleTabs(["dashboard", "trends", "analysis"], ["oil"])).toEqual([
      "dashboard",
      "analysis"
    ]);
  });

  it("webhook replay is idempotent and does not create a second tenant", async () => {
    const replay = await callApi("POST", "/api/square/webhook", {
      body: {
        event_id: `evt_store_${run}`,
        type: "payment.created",
        data: {
          object: {
            payment: {
              id: `pay_store_${run}`,
              status: "COMPLETED",
              referenceId: storeCheckoutRef,
              subscriptionId: `sub_store_${run}`,
              customerId: `cus_store_${run}`
            }
          }
        }
      }
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.body.duplicate).toBe(true);

    const loginAgain = await callApi("POST", "/api/auth/login", {
      body: { username: storeTenant.username, password: storePassword }
    });
    expect(loginAgain.statusCode).toBe(200);
    expect(loginAgain.body.company_id).toBe(storeTenant.companyId);
    expect(loginAgain.body.id).toBe(storeTenant.userId);
  });
});

describe("SLICE-H2 - display-unit preferences are per-tenant and display-only", () => {
  it("unauthenticated settings reads and writes are rejected", async () => {
    const read = await callApi("GET", "/api/tenant-settings");
    expect(read.statusCode).toBe(401);
    const write = await callApi("PUT", "/api/tenant-settings", {
      body: { display_units: { velocity: "in/s" } }
    });
    expect(write.statusCode).toBe(401);
  });

  it("defaults each tenant to canonical mm/s, g and Hz", async () => {
    const a = await callApi("GET", "/api/tenant-settings", {
      cookie: tenantA.cookie
    });
    const b = await callApi("GET", "/api/tenant-settings", {
      cookie: tenantB.cookie
    });
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(a.body.company_id).toBe(tenantA.companyId);
    expect(b.body.company_id).toBe(tenantB.companyId);
    expect(a.body.display_units).toEqual({
      velocity: "mm/s",
      acceleration: "g",
      frequency: "Hz"
    });
    expect(b.body.display_units).toEqual(a.body.display_units);
  });

  it("set -> read round-trips tenant A without changing tenant B", async () => {
    const chosen = {
      velocity: "in/s",
      acceleration: "mm/s2",
      frequency: "CPM"
    };
    const write = await callApi("PUT", "/api/tenant-settings", {
      cookie: tenantA.cookie,
      body: { display_units: chosen }
    });
    expect(write.statusCode).toBe(200);
    expect(write.body.company_id).toBe(tenantA.companyId);
    expect(write.body.display_units).toEqual(chosen);

    const a = await callApi("GET", "/api/tenant-settings", {
      cookie: tenantA.cookie
    });
    const b = await callApi("GET", "/api/tenant-settings", {
      cookie: tenantB.cookie
    });
    expect(a.body.display_units).toEqual(chosen);
    expect(b.body.display_units).toEqual({
      velocity: "mm/s",
      acceleration: "g",
      frequency: "Hz"
    });

    // Tenant B's own choice must not leak back into A.
    const writeB = await callApi("PUT", "/api/tenant-settings", {
      cookie: tenantB.cookie,
      body: {
        display_units: {
          velocity: "mm/s",
          acceleration: "g",
          frequency: "orders"
        }
      }
    });
    expect(writeB.statusCode).toBe(200);
    const aAgain = await callApi("GET", "/api/tenant-settings", {
      cookie: tenantA.cookie
    });
    const bAgain = await callApi("GET", "/api/tenant-settings", {
      cookie: tenantB.cookie
    });
    expect(aAgain.body.display_units).toEqual(chosen);
    expect(bAgain.body.display_units.frequency).toBe("orders");
  });

  it("never accepts a client company id as tenancy authority", async () => {
    const before = await callApi("GET", "/api/tenant-settings", {
      cookie: tenantB.cookie
    });
    const forged = await callApi("PUT", "/api/tenant-settings", {
      cookie: tenantB.cookie,
      body: {
        company_id: tenantA.companyId,
        display_units: { velocity: "in/s", acceleration: "g", frequency: "Hz" }
      }
    });
    expect(forged.statusCode).toBe(200);
    // The session tenant (B) changed; tenant A's earlier choice is untouched.
    const a = await callApi("GET", "/api/tenant-settings", {
      cookie: tenantA.cookie
    });
    const b = await callApi("GET", "/api/tenant-settings", {
      cookie: tenantB.cookie
    });
    expect(a.body.company_id).toBe(tenantA.companyId);
    expect(a.body.display_units.velocity).toBe("in/s");
    expect(b.body.company_id).toBe(tenantB.companyId);
    expect(b.body.display_units.velocity).toBe("in/s");
    expect(before.body.company_id).toBe(tenantB.companyId);
    // A's tenant_id never moved even though B sent A's id.
    expect(a.body.display_units).not.toEqual(before.body.display_units);
  });
});

describe("SLICE-SEC-6 - batch collection-point upsert re-checks child-row ownership", () => {
  let aAssetId: number;
  let aComponentId: number;
  let aCollectionPointId: number;

  beforeAll(async () => {
    // Tenant A provisions its own equipment so the batch endpoint's parent
    // component check passes for A's own component.
    const assetRes = await callApi("POST", "/api/assets", {
      cookie: tenantA.cookie,
      body: { name: `A-sec asset ${run}`, tag_number: `A-SEC-${run}` }
    });
    expect(assetRes.statusCode).toBe(201);
    aAssetId = assetRes.body.id;

    const compRes = await callApi("POST", "/api/components", {
      cookie: tenantA.cookie,
      body: { asset_id: aAssetId, name: `A-sec component ${run}` }
    });
    expect(compRes.statusCode).toBe(201);
    aComponentId = compRes.body.id;

    const cpRes = await callApi("POST", "/api/collection-points", {
      cookie: tenantA.cookie,
      body: { component_id: aComponentId, name: `A-sec point ${run}` }
    });
    expect(cpRes.statusCode).toBe(201);
    aCollectionPointId = cpRes.body.id;
  });

  async function aPoint() {
    const res = await callApi("GET", "/api/collection-points", {
      cookie: tenantA.cookie,
      query: { component_id: String(aComponentId) }
    });
    expect(res.statusCode).toBe(200);
    return (res.body as any[]).find((cp: any) => cp.id === aCollectionPointId);
  }

  async function bPoint() {
    const res = await callApi("GET", "/api/collection-points", {
      cookie: tenantB.cookie,
      query: { component_id: String(bComponentId) }
    });
    expect(res.statusCode).toBe(200);
    return (res.body as any[]).find((cp: any) => cp.id === bCollectionPointId);
  }

  it("rejects a batch that includes another tenant's collection point id", async () => {
    const beforeB = await bPoint();
    const res = await callApi("POST", "/api/collection-points/batch", {
      cookie: tenantA.cookie,
      body: {
        component_id: aComponentId,
        points: [{ id: bCollectionPointId, name: "hacked by tenant A" }]
      }
    });
    expect([400, 500]).toContain(res.statusCode);
    const afterB = await bPoint();
    expect(afterB?.name).toBe(beforeB?.name);
  });

  it("applies nothing for a mixed-ownership batch", async () => {
    const beforeA = await aPoint();
    const beforeB = await bPoint();
    const res = await callApi("POST", "/api/collection-points/batch", {
      cookie: tenantA.cookie,
      body: {
        component_id: aComponentId,
        points: [
          { id: aCollectionPointId, name: "A-updated" },
          { id: bCollectionPointId, name: "hacked" }
        ]
      }
    });
    expect([400, 500]).toContain(res.statusCode);
    const afterA = await aPoint();
    const afterB = await bPoint();
    expect(afterA?.name).toBe(beforeA?.name);
    expect(afterB?.name).toBe(beforeB?.name);
  });

  it("rejects a child id outside the verified parent (unknown id)", async () => {
    const res = await callApi("POST", "/api/collection-points/batch", {
      cookie: tenantA.cookie,
      body: {
        component_id: aComponentId,
        points: [{ id: 900000000, name: "ghost" }]
      }
    });
    expect([400, 500]).toContain(res.statusCode);
    const afterA = await aPoint();
    expect(afterA?.name).not.toBe("ghost");
  });

  it("succeeds for a valid same-tenant batch", async () => {
    const res = await callApi("POST", "/api/collection-points/batch", {
      cookie: tenantA.cookie,
      body: {
        component_id: aComponentId,
        points: [{ id: aCollectionPointId, name: `A-sec point updated ${run}` }]
      }
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    const afterA = await aPoint();
    expect(afterA?.name).toBe(`A-sec point updated ${run}`);
  });
});

describe("SLICE-SEC-6b - POOL path: batch upsert honors child-row ownership in SQL", () => {
  // Tenant A's own equipment, provisioned through the real memory-mode API
  // (already-imported handlers) so the parent component check passes.
  let secAAssetId: number;
  let secAComponentId: number;
  let secACollectionPointId: number;

  // Owned vs foreign child ids, scoped per test.
  let ownedIds: Set<number>;
  let foreignId: number;

  beforeAll(async () => {
    const assetRes = await callApi("POST", "/api/assets", {
      cookie: tenantA.cookie,
      body: { name: `A-sec6b asset ${run}`, tag_number: `A-SEC6B-${run}` }
    });
    expect(assetRes.statusCode).toBe(201);
    secAAssetId = assetRes.body.id;

    const compRes = await callApi("POST", "/api/components", {
      cookie: tenantA.cookie,
      body: { asset_id: secAAssetId, name: `A-sec6b component ${run}` }
    });
    expect(compRes.statusCode).toBe(201);
    secAComponentId = compRes.body.id;

    const cpRes = await callApi("POST", "/api/collection-points", {
      cookie: tenantA.cookie,
      body: { component_id: secAComponentId, name: `A-sec6b point ${run}` }
    });
    expect(cpRes.statusCode).toBe(201);
    secACollectionPointId = cpRes.body.id;

    foreignId = bCollectionPointId; // tenant B's collection point (foreign to A)
  });

  beforeEach(() => {
    poolCallLog.length = 0;
    poolQueryImpl = null;
    ownedIds = new Set([secACollectionPointId]);
  });

  afterEach(() => {
    process.exit = realProcessExit;
    vi.resetModules();
    delete process.env.DATABASE_URL;
  });

  it("POOL: child UPDATE carries BOTH id and component_id predicates (assert on SQL text + params)", async () => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/sec6b";

    poolQueryImpl = async (text: string, params?: unknown[]) => {
      // Parent component ownership + all SELECT ownership checks -> owned.
      if (/pl\.company_id = \$2/.test(text) || /component_id = \$1/.test(text)) {
        return { rows: [{ 1: 1 }], rowCount: 1, command: "SELECT", oid: 0, fields: [] };
      }
      if (String(text).startsWith("UPDATE collection_points")) {
        const ptId = Number(params?.[2]);
        return {
          rows: [{ id: secACollectionPointId, name: "A-updated" }],
          rowCount: ownedIds.has(ptId) ? 1 : 0,
          command: "UPDATE",
          oid: 0,
          fields: []
        };
      }
      return { rows: [], rowCount: 0, command: "SELECT", oid: 0, fields: [] };
    };

    vi.resetModules();
    await import("../../server.ts");
    // Let setupServer's async boot (pool = new Pool) complete before invoking.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const res = await callBatchHandler(
      {
        component_id: secAComponentId,
        points: [{ id: secACollectionPointId, name: "A-updated" }]
      },
      tenantA.companyId
    );

    const update = findCallText("UPDATE collection_points SET name = $1");
    expect(update).toBeDefined();
    // Assert on the ACTUAL SQL text: both id AND component_id predicates.
    expect(String(update!.text)).toContain("WHERE id = $3 AND component_id = $4");
    expect(String(update!.text)).toContain("RETURNING *");
    // Assert on the ACTUAL params: [name, location_order, id, component_id].
    expect(update!.params).toEqual(["A-updated", 0, secACollectionPointId, secAComponentId]);
    // Commit occurred (all-or-nothing success path).
    expect(countCallText("COMMIT")).toBe(1);
    expect(countCallText("ROLLBACK")).toBe(0);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POOL: rowCount === 0 throws, issues ROLLBACK, and NO COMMIT occurs", async () => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/sec6b";

    // Foreign child id: no row matches id + component_id -> rowCount 0 -> throw.
    poolQueryImpl = async (text: string) => {
      if (/pl\.company_id = \$2/.test(text)) {
        return { rows: [{ 1: 1 }], rowCount: 1, command: "SELECT", oid: 0, fields: [] };
      }
      if (/component_id = \$1/.test(text) && !String(text).startsWith("UPDATE")) {
        return { rows: [{ id: secACollectionPointId }], rowCount: 1, command: "SELECT", oid: 0, fields: [] };
      }
      if (String(text).startsWith("UPDATE collection_points")) {
        return { rows: [], rowCount: 0, command: "UPDATE", oid: 0, fields: [] };
      }
      return { rows: [], rowCount: 0, command: "SELECT", oid: 0, fields: [] };
    };

    vi.resetModules();
    await import("../../server.ts");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const res = await callBatchHandler(
      { component_id: secAComponentId, points: [{ id: foreignId, name: "hacked" }] },
      tenantA.companyId
    );

    expect(res.statusCode).toBe(500);
    // ROLLBACK issued, NO COMMIT.
    expect(countCallText("ROLLBACK")).toBeGreaterThanOrEqual(1);
    expect(countCallText("COMMIT")).toBe(0);
  });

  it("POOL: mixed-ownership batch issues no successful COMMIT", async () => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/sec6b";

    // Drive rowCount from the params actually sent: owned child -> rowCount 1,
    // foreign child -> rowCount 0 -> throw -> ROLLBACK, no COMMIT.
    poolQueryImpl = async (text: string, params?: unknown[]) => {
      if (/pl\.company_id = \$2/.test(text)) {
        return { rows: [{ 1: 1 }], rowCount: 1, command: "SELECT", oid: 0, fields: [] };
      }
      if (/component_id = \$1/.test(text) && !String(text).startsWith("UPDATE")) {
        return { rows: [{ id: secACollectionPointId }], rowCount: 1, command: "SELECT", oid: 0, fields: [] };
      }
      if (String(text).startsWith("UPDATE collection_points")) {
        // params: [name, i, id, component_id]
        const ptId = Number(params?.[2]);
        const rowCount = ownedIds.has(ptId) ? 1 : 0;
        return { rows: rowCount ? [{ id: ptId }] : [], rowCount, command: "UPDATE", oid: 0, fields: [] };
      }
      return { rows: [], rowCount: 0, command: "SELECT", oid: 0, fields: [] };
    };

    vi.resetModules();
    await import("../../server.ts");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const res = await callBatchHandler(
      {
        component_id: secAComponentId,
        points: [
          { id: secACollectionPointId, name: "A-updated" }, // owned
          { id: foreignId, name: "hacked" }                  // foreign -> rowCount 0
        ]
      },
      tenantA.companyId
    );

    expect(res.statusCode).toBe(500);
    // The foreign child forces ROLLBACK; the owned point is NOT committed.
    expect(countCallText("ROLLBACK")).toBeGreaterThanOrEqual(1);
    expect(countCallText("COMMIT")).toBe(0);
  });

  it("POOL: valid same-tenant batch commits", async () => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/sec6b";

    poolQueryImpl = async (text: string, params?: unknown[]) => {
      if (/pl\.company_id = \$2/.test(text)) {
        return { rows: [{ 1: 1 }], rowCount: 1, command: "SELECT", oid: 0, fields: [] };
      }
      if (/component_id = \$1/.test(text) && !String(text).startsWith("UPDATE")) {
        return { rows: [{ id: secACollectionPointId }], rowCount: 1, command: "SELECT", oid: 0, fields: [] };
      }
      if (String(text).startsWith("UPDATE collection_points")) {
        const ptId = Number(params?.[2]);
        const rowCount = ownedIds.has(ptId) ? 1 : 0;
        return { rows: rowCount ? [{ id: ptId, name: "A-updated" }] : [], rowCount, command: "UPDATE", oid: 0, fields: [] };
      }
      return { rows: [], rowCount: 0, command: "SELECT", oid: 0, fields: [] };
    };

    vi.resetModules();
    await import("../../server.ts");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const res = await callBatchHandler(
      {
        component_id: secAComponentId,
        points: [{ id: secACollectionPointId, name: `A-sec6b updated ${run}` }]
      },
      tenantA.companyId
    );

    expect(countCallText("COMMIT")).toBe(1);
    expect(countCallText("ROLLBACK")).toBe(0);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

function readServer(): string {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  return fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
}
