/**
 * SLICE-SEC-10 — Reports tenant isolation: eliminate body-derived companyId.
 *
 * Audit finding (SEC-4a row 8): POST /api/reports accepted companyId from the
 * request body and stamped it onto reports.company_id, so a caller could forge
 * another tenant's tenancy. GET /api/reports and GET /api/reports/:id already
 * bound tenant_id from the session but did not fail closed when the session
 * lacked a tenant.
 *
 * Fix (server.ts):
 *   POST /api/reports — companyId/tenantId/organizationId are stripped from the
 *   body (never read); tenant is derived strictly from the verified session
 *   (requestTenantId); company_id is stamped from the session; 401 when the
 *   session has no tenant.
 *   GET /api/reports and GET /api/reports/:id — 401 when the session has no
 *   tenant; the existing tenant_id predicate now binds the session tenant.
 *
 * This file mounts the real Express handlers from server.ts through a fake
 * Express app with a scriptable fake pg Pool (DATABASE_URL set), so the
 * production SQL branch runs without a real database. Tenant ids are distinct
 * constants; no client-supplied id is ever trusted.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

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
      .filter((item): item is string | string[] => typeof item === "string" || Array.isArray(item))
      .flat();
    const middleware = leading.filter((item): item is Handler => typeof item === "function");
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

const realProcessExit = process.exit;

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

vi.mock("express", () => ({ default: harness.express }));
vi.mock("vite", () => ({
  createServer: async () => ({ middlewares: harness.noop })
}));
vi.mock("dotenv", () => ({ default: { config: () => ({ parsed: {} }) } }));
vi.mock("pg", () => ({
  default: { Pool: class { constructor() { return fakePool; } } },
  Pool: class { constructor() { return fakePool; } }
}));

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

/** Re-imports server.ts with DATABASE_URL set and the fake pg Pool active. */
async function bootPoolServer(): Promise<void> {
  vi.resetModules();
  process.env.DATABASE_URL = "postgresql://localhost:5432/sec10";
  await import("../../server.ts");
  await new Promise((resolve) => setTimeout(resolve, 0));
  poolCallLog.length = 0;
}

function findReportHandler(method: string, pattern: string): any {
  const matches = harness.routes.filter(
    (r: any) => r.method === method && typeof r.pattern === "string" && r.pattern === pattern
  );
  if (matches.length === 0) throw new Error(`No route registered for ${method} ${pattern}`);
  return matches[matches.length - 1].handler;
}

async function invokeHandler(
  handler: any,
  tenantId: number | null,
  body: Record<string, unknown> | null,
  params: Record<string, string> = {},
  query: Record<string, string> = {}
): Promise<any> {
  const res = makeRes();
  const req: any = {
    method: body == null ? "GET" : "POST",
    path: "",
    originalUrl: "",
    url: "",
    params,
    query,
    body: body ?? {},
    headers: {},
    tenantId,
    // requirePermission runs first on GET routes; supply a valid session user
    // so it passes and the handler's own tenant check is what is exercised.
    auth:
      tenantId == null
        ? { user: { role: "plant-engineer", id: null }, tenantId: null, sessionId: "sess" }
        : { user: { role: "plant-engineer", id: tenantId }, tenantId, sessionId: "sess" }
  };
  await handler(req, res, () => Promise.resolve());
  return res;
}

function poolMatches(pattern: string | RegExp): boolean {
  return poolCallLog.some((c) => String(c.text).match(pattern));
}

// Two independent tenants. company_id is denormalized onto reports, so it must
// equal the session tenant, never a caller-supplied id.
const tenantA = 101;
const tenantB = 202;

describe("SLICE-SEC-10 — reports tenant isolation (pool path)", () => {
  beforeEach(() => {
    poolCallLog.length = 0;
    poolQueryImpl = null;
  });

  afterEach(() => {
    process.exit = realProcessExit;
    vi.resetModules();
    delete process.env.DATABASE_URL;
    poolQueryImpl = null;
    poolCallLog.length = 0;
  });

  it("POST: tenant A's forged Tenant B companyId in the body is ignored; company_id is session tenant A", async () => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/sec10";
    poolQueryImpl = async (text: string) => {
      if (String(text).startsWith("INSERT INTO reports")) {
        return { rows: [{ id: "rep-new" }], rowCount: 1, command: "INSERT", oid: 0, fields: [] };
      }
      return { rows: [], rowCount: 0, command: "SELECT", oid: 0, fields: [] };
    };
    await bootPoolServer();

    const handler = findReportHandler("POST", "/api/reports");
    // Body carries forged companyId / company_id (tenant B) — must be ignored.
    const res = await invokeHandler(handler, tenantA, {
      assetId: "asset-a",
      companyId: tenantB,
      company_id: tenantB,
      organizationId: tenantB,
      overallSeverity: "NORMAL",
      technologySummary: {}
    }, {});

    expect(res.statusCode).toBe(200);
    const insert = poolCallLog.find((c) => String(c.text).startsWith("INSERT INTO reports"));
    expect(insert).toBeDefined();
    const p = insert!.params as unknown[];
    // $2 is company_id, $10 is tenant_id — both must be the session tenant A.
    expect(p[1]).toBe(tenantA);
    expect(p[9]).toBe(tenantA);
    // Tenant B's forged id must never be bound to the query.
    expect(p).not.toContain(tenantB);
    expect(res.body.success).toBe(true);
  });

  it("POST: absent tenant returns 401 and issues no reports write", async () => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/sec10";
    poolQueryImpl = async () => ({ rows: [], rowCount: 0, command: "SELECT", oid: 0, fields: [] });
    await bootPoolServer();

    const handler = findReportHandler("POST", "/api/reports");
    const res = await invokeHandler(handler, null, {
      assetId: "asset-a",
      companyId: tenantB,
      overallSeverity: "NORMAL",
      technologySummary: {}
    }, {});

    expect(res.statusCode).toBe(401);
    expect(poolMatches(/INSERT INTO reports/)).toBe(false);
  });

  it("POST: valid same-tenant request succeeds with company_id = session tenant", async () => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/sec10";
    poolQueryImpl = async (text: string) => {
      if (String(text).startsWith("INSERT INTO reports")) {
        return { rows: [{ id: "rep-ok" }], rowCount: 1, command: "INSERT", oid: 0, fields: [] };
      }
      return { rows: [], rowCount: 0, command: "SELECT", oid: 0, fields: [] };
    };
    await bootPoolServer();

    const handler = findReportHandler("POST", "/api/reports");
    const res = await invokeHandler(handler, tenantA, {
      assetId: "asset-a",
      overallSeverity: "NORMAL",
      technologySummary: {}
    }, {});

    expect(res.statusCode).toBe(200);
    const insert = poolCallLog.find((c) => String(c.text).startsWith("INSERT INTO reports"));
    expect(insert).toBeDefined();
    const p = insert!.params as unknown[];
    expect(p[1]).toBe(tenantA);
    expect(p[9]).toBe(tenantA);
    expect(res.body.success).toBe(true);
  });

  it("GET /api/reports: SELECT carries the session tenant_id and never another tenant's", async () => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/sec10";
    poolQueryImpl = async (text: string) => {
      if (String(text).startsWith("SELECT * FROM reports")) {
        return { rows: [], rowCount: 0, command: "SELECT", oid: 0, fields: [] };
      }
      return { rows: [], rowCount: 0, command: "SELECT", oid: 0, fields: [] };
    };
    await bootPoolServer();

    const handler = findReportHandler("GET", "/api/reports");
    const res = await invokeHandler(handler, tenantA, null, {}, { asset_id: "asset-a" });

    expect(res.statusCode).toBe(200);
    const select = poolCallLog.find((c) => String(c.text).startsWith("SELECT * FROM reports"));
    expect(select).toBeDefined();
    const sql = String(select!.text);
    const p = select!.params as unknown[];
    expect(sql).toContain("tenant_id");
    expect(p).toContain(tenantA);
    expect(p).not.toContain(tenantB);
  });

  it("GET /api/reports: absent tenant returns 401 and issues no query", async () => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/sec10";
    poolQueryImpl = async () => ({ rows: [], rowCount: 0, command: "SELECT", oid: 0, fields: [] });
    await bootPoolServer();

    const handler = findReportHandler("GET", "/api/reports");
    const res = await invokeHandler(handler, null, null, {}, {});

    expect(res.statusCode).toBe(401);
    expect(poolMatches(/SELECT \* FROM reports/)).toBe(false);
  });

  it("GET /api/reports/:id: SELECT carries the session tenant predicate and never another tenant's", async () => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/sec10";
    poolQueryImpl = async (text: string) => {
      if (String(text).startsWith("SELECT * FROM reports WHERE id")) {
        return { rows: [{ id: "rep-1" }], rowCount: 1, command: "SELECT", oid: 0, fields: [] };
      }
      return { rows: [], rowCount: 0, command: "SELECT", oid: 0, fields: [] };
    };
    await bootPoolServer();

    const REPORT_ID = "00000000-0000-0000-0000-000000000001";
    const handler = findReportHandler("GET", "/api/reports/:id");
    const res = await invokeHandler(handler, tenantA, null, { id: REPORT_ID }, {});

    expect(res.statusCode).toBe(200);
    const select = poolCallLog.find((c) =>
      String(c.text).startsWith("SELECT * FROM reports WHERE id")
    );
    expect(select).toBeDefined();
    const sql = String(select!.text);
    const p = select!.params as unknown[];
    expect(sql).toContain("tenant_id");
    expect(p).toContain(tenantA);
    expect(p).not.toContain(tenantB);
  });

  it("GET /api/reports/:id: absent tenant returns 401 and issues no query", async () => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/sec10";
    const REPORT_ID = "00000000-0000-0000-0000-000000000001";
    poolQueryImpl = async () => ({ rows: [], rowCount: 0, command: "SELECT", oid: 0, fields: [] });
    await bootPoolServer();

    const handler = findReportHandler("GET", "/api/reports/:id");
    const res = await invokeHandler(handler, null, null, { id: REPORT_ID }, {});

    expect(res.statusCode).toBe(401);
    expect(poolMatches(/SELECT \* FROM reports WHERE id/)).toBe(false);
  });
});
