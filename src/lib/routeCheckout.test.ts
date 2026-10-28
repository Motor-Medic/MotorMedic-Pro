/**
 * ROUTE-CHECKOUT - work queue state, DB double-checkout lock, permissions,
 * tenant isolation, and audit fields.
 *
 * The API half mounts the REAL Express handlers from server.ts through a fake
 * Express app in DATABASE_URL-less memory mode (the same harness as
 * goodCatches.test.ts and multiTenantIsolation.test.ts), registers independent
 * tenants through the real POST /api/auth/register handler and drives the real
 * AR-29 session guard.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  buildRouteQueue,
  canCheckInAssignment,
  canCloseAssignment,
  canManageRouteAssignment,
  type RouteAssignmentRow,
  type RouteQueueRouteRow
} from "./routeCheckout";

const serverSource = readFileSync(
  fileURLToPath(new URL("../../server.ts", import.meta.url)),
  "utf8"
);
const migrationSource = readFileSync(
  fileURLToPath(
    new URL("../../migrations/024_route_assignments.sql", import.meta.url)
  ),
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
  if (!raw) throw new Error("request did not set a session cookie");
  const token = /motormedic_session=([^;]+)/.exec(raw)?.[1];
  if (!token) throw new Error("session cookie missing motormedic_session");
  return `motormedic_session=${token}`;
}

interface Tenant {
  companyId: number;
  userId: number;
  plantId: number | null;
  username: string;
  cookie: string;
}

const run = Date.now().toString(36);

async function registerTenant(label: string): Promise<Tenant> {
  const companyName = `Route Queue ${label} ${run}`;
  const username = `rq_${label}_${run}`;
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
    username,
    cookie: cookieFrom(res)
  };
}

async function createRoute(tenant: Tenant, name: string): Promise<number> {
  const res = await callApi("POST", "/api/routes", {
    cookie: tenant.cookie,
    body: { plant_id: tenant.plantId, name }
  });
  expect(res.statusCode).toBe(201);
  return res.body.id;
}

async function login(username: string): Promise<string> {
  const res = await callApi("POST", "/api/auth/login", {
    body: { username, password: "password123" }
  });
  expect(res.statusCode).toBe(200);
  return cookieFrom(res);
}

let tenantA: Tenant;
let tenantB: Tenant;
let aRouteId: number;
let bRouteId: number;
let aAssignmentId: number;
let secondUserCookie: string;

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.ENABLE_DEV_AUTH_SEED;
  process.env.NODE_ENV = "test";

  await import("../../server.ts");

  tenantA = await registerTenant("a");
  tenantB = await registerTenant("b");

  aRouteId = await createRoute(tenantA, `A collection route ${run}`);
  bRouteId = await createRoute(tenantB, `B collection route ${run}`);
});

describe("ROUTE-CHECKOUT - tenant isolation", () => {
  it("tenant B's routes and assignments are invisible to tenant A", async () => {
    const aQueue = await callApi("GET", "/api/route-queue", {
      cookie: tenantA.cookie
    });
    expect(aQueue.statusCode).toBe(200);
    const aUnassigned = (aQueue.body.queue.unassigned ?? []).map(
      (row: any) => row.route_id
    );
    expect(aUnassigned).toContain(aRouteId);
    expect(aUnassigned).not.toContain(bRouteId);
    expect(aQueue.body.queue.tenant_id).toBe(tenantA.companyId);

    const bQueue = await callApi("GET", "/api/route-queue", {
      cookie: tenantB.cookie
    });
    const bUnassigned = (bQueue.body.queue.unassigned ?? []).map(
      (row: any) => row.route_id
    );
    expect(bUnassigned).toContain(bRouteId);
    expect(bUnassigned).not.toContain(aRouteId);
    expect(bQueue.body.queue.tenant_id).toBe(tenantB.companyId);
  });

  it("cross-tenant route and assignment ids return 404", async () => {
    const foreignRoute = await callApi(
      "POST",
      `/api/routes/${bRouteId}/checkout`,
      { cookie: tenantA.cookie }
    );
    expect(foreignRoute.statusCode).toBe(404);

    const checkoutOwn = await callApi(
      "POST",
      `/api/routes/${aRouteId}/checkout`,
      { cookie: tenantA.cookie }
    );
    expect(checkoutOwn.statusCode).toBe(201);
    aAssignmentId = checkoutOwn.body.assignment.id;

    const foreignCheckIn = await callApi(
      "POST",
      `/api/route-assignments/${aAssignmentId}/check-in`,
      { cookie: tenantB.cookie, body: { notes: "B must not touch A" } }
    );
    expect(foreignCheckIn.statusCode).toBe(404);

    const foreignClose = await callApi(
      "POST",
      `/api/route-assignments/${aAssignmentId}/close`,
      { cookie: tenantB.cookie }
    );
    expect(foreignClose.statusCode).toBe(404);
  });
});

describe("ROUTE-CHECKOUT - database double-checkout lock", () => {
  it("the partial UNIQUE index is the DB-level lock, mirrored idempotently", () => {
    const indexPattern =
      /CREATE UNIQUE INDEX IF NOT EXISTS route_assignments_active_unique\s+ON route_assignments \(route_id\) WHERE status = 'checked_out';/;

    expect(migrationSource).toMatch(indexPattern);
    expect(serverSource).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS route_assignments_active_unique ON route_assignments (route_id) WHERE status = 'checked_out';"
    );
    expect(migrationSource).toContain("CREATE TABLE IF NOT EXISTS route_assignments");
    expect(serverSource).toContain("CREATE TABLE IF NOT EXISTS route_assignments");
    expect(migrationSource).toContain(
      "status IN ('checked_out', 'checked_in', 'closed')"
    );
    expect(serverSource).toContain(
      "status IN ('checked_out', 'checked_in', 'closed')"
    );

    const start = serverSource.indexOf('app.post("/api/routes/:id/checkout"');
    const end = serverSource.indexOf(
      'app.post("/api/route-assignments/:id/check-in"',
      start
    );
    const checkoutHandler = serverSource.slice(start, end);
    expect(checkoutHandler).toContain('err?.code === "23505"');
  });

  it("a second checkout of the same route is rejected with 409", async () => {
    const first = await callApi("GET", "/api/route-queue", {
      cookie: tenantA.cookie
    });
    expect(first.body.queue.active.map((row: any) => row.assignment_id)).toContain(
      aAssignmentId
    );

    const doubleCheckout = await callApi(
      "POST",
      `/api/routes/${aRouteId}/checkout`,
      { cookie: tenantA.cookie }
    );
    expect(doubleCheckout.statusCode).toBe(409);
    expect(String(doubleCheckout.body.error)).toMatch(/already checked out/i);
  });
});

describe("ROUTE-CHECKOUT - check-in permissions and audit fields", () => {
  it("a different non-admin user in the same tenant gets 403", async () => {
    const invited = await callApi("POST", "/api/company/users/invite", {
      cookie: tenantA.cookie,
      body: {
        company_id: tenantA.companyId,
        email: `rq_second_${run}@example.com`,
        role: "plant-engineer",
        username: `rq_second_${run}`
      }
    });
    expect(invited.statusCode).toBe(200);
    secondUserCookie = await login(`rq_second_${run}`);

    const forbidden = await callApi(
      "POST",
      `/api/route-assignments/${aAssignmentId}/check-in`,
      { cookie: secondUserCookie, body: { notes: "not mine" } }
    );
    expect(forbidden.statusCode).toBe(403);
    expect(String(forbidden.body.error)).toMatch(/tenant admin/i);
  });

  it("close is invalid before check-in, then records timestamps and notes", async () => {
    const earlyClose = await callApi(
      "POST",
      `/api/route-assignments/${aAssignmentId}/close`,
      { cookie: tenantA.cookie }
    );
    expect(earlyClose.statusCode).toBe(409);
    expect(String(earlyClose.body.error)).toMatch(/checked-in/i);

    const checkedIn = await callApi(
      "POST",
      `/api/route-assignments/${aAssignmentId}/check-in`,
      {
        cookie: tenantA.cookie,
        body: { notes: "Collected 12 points; two greases due next pass." }
      }
    );
    expect(checkedIn.statusCode).toBe(200);
    expect(checkedIn.body.assignment.status).toBe("checked_in");
    expect(checkedIn.body.assignment.checked_in_at).toBeTruthy();
    expect(checkedIn.body.assignment.notes).toBe(
      "Collected 12 points; two greases due next pass."
    );

    const queue = await callApi("GET", "/api/route-queue", {
      cookie: tenantA.cookie
    });
    const awaiting = queue.body.queue.awaiting_review.find(
      (row: any) => row.assignment_id === aAssignmentId
    );
    expect(awaiting).toBeTruthy();
    expect(awaiting.notes).toBe(
      "Collected 12 points; two greases due next pass."
    );
    expect(awaiting.checked_in_at).toBeTruthy();
    expect(queue.body.queue.active).toEqual([]);
  });

  it("a non-admin non-owner cannot close the checked-in pass", async () => {
    const forbidden = await callApi(
      "POST",
      `/api/route-assignments/${aAssignmentId}/close`,
      { cookie: secondUserCookie }
    );
    expect(forbidden.statusCode).toBe(403);
  });

  it("close only succeeds from checked_in and records closed_at", async () => {
    const closed = await callApi(
      "POST",
      `/api/route-assignments/${aAssignmentId}/close`,
      { cookie: tenantA.cookie }
    );
    expect(closed.statusCode).toBe(200);
    expect(closed.body.assignment.status).toBe("closed");
    expect(closed.body.assignment.closed_at).toBeTruthy();

    const queue = await callApi("GET", "/api/route-queue", {
      cookie: tenantA.cookie
    });
    expect(
      queue.body.queue.closed.map((row: any) => row.assignment_id)
    ).toContain(aAssignmentId);
    expect(queue.body.queue.awaiting_review).toEqual([]);
    expect(
      queue.body.queue.unassigned.map((row: any) => row.route_id)
    ).toContain(aRouteId);

    const repeatCheckIn = await callApi(
      "POST",
      `/api/route-assignments/${aAssignmentId}/check-in`,
      { cookie: tenantA.cookie, body: { notes: "again" } }
    );
    expect(repeatCheckIn.statusCode).toBe(409);
  });
});

describe("ROUTE-CHECKOUT - pure state helpers", () => {
  const route: RouteQueueRouteRow = {
    id: 10,
    name: "North route",
    plant_id: 1,
    plant_name: "Plant A"
  };

  function assignment(
    overrides: Partial<RouteAssignmentRow>
  ): RouteAssignmentRow {
    return {
      id: 1,
      tenant_id: 1,
      route_id: 10,
      assigned_to: 5,
      status: "checked_out",
      checked_out_at: "2026-03-01T10:00:00.000Z",
      ...overrides
    };
  }

  it("groups rows into the four tabs and excludes tenant B", () => {
    const queue = buildRouteQueue({
      tenantId: 1,
      routes: [route],
      assignments: [
        assignment({ id: 1, status: "checked_out" }),
        assignment({ id: 2, tenant_id: 2, status: "closed" })
      ]
    });
    expect(queue.active).toHaveLength(1);
    expect(queue.closed).toEqual([]);
    expect(queue.unassigned).toEqual([]);
    expect(queue.counts).toEqual({
      active: 1,
      awaitingReview: 0,
      closed: 0,
      unassigned: 0
    });
  });

  it("allows only the owner or an existing RBAC admin to manage a pass", () => {
    expect(
      canManageRouteAssignment({
        assignedTo: 5,
        userId: 5,
        role: "plant-engineer"
      })
    ).toBe(true);
    expect(
      canManageRouteAssignment({
        assignedTo: 5,
        userId: 6,
        role: "plant-engineer"
      })
    ).toBe(false);
    expect(
      canManageRouteAssignment({
        assignedTo: 5,
        userId: 6,
        role: "reliability-manager"
      })
    ).toBe(true);
    expect(
      canManageRouteAssignment({
        assignedTo: 5,
        userId: 6,
        role: "system-admin"
      })
    ).toBe(true);
  });

  it("check-in only from checked_out and close only from checked_in", () => {
    expect(canCheckInAssignment("checked_out")).toBe(true);
    expect(canCheckInAssignment("checked_in")).toBe(false);
    expect(canCheckInAssignment("closed")).toBe(false);
    expect(canCloseAssignment("checked_in")).toBe(true);
    expect(canCloseAssignment("checked_out")).toBe(false);
    expect(canCloseAssignment("closed")).toBe(false);
  });
});

describe("ROUTE-CHECKOUT - scope lock and DEP-1 mirror", () => {
  it("all three handlers derive tenant from the session, never req.query", () => {
    const start = serverSource.indexOf('app.get("/api/route-queue"');
    const end = serverSource.indexOf(
      "// ASSETS/EQUIPMENT ENDPOINTS",
      start
    );
    expect(start).toBeGreaterThan(-1);
    const block = serverSource.slice(start, end);
    expect(block).toContain("requestTenantId(req)");
    expect(block).toContain("ra.tenant_id = $1");
    expect(block).toContain("WHERE r.id = $1 AND pl.company_id = $2");
    expect(block).toContain("WHERE ra.id = $1 AND ra.tenant_id = $2");
    expect(block).toContain("sessionUserId(req)");
    expect(block).not.toMatch(/req\.query/);
    expect(block).not.toMatch(/company_id\s*=\s*req\./);
  });

  it("migration 024 and initializeDatabase share the same idempotent DDL", () => {
    expect(migrationSource).toContain("CREATE TABLE IF NOT EXISTS route_assignments");
    expect(serverSource).toContain("CREATE TABLE IF NOT EXISTS route_assignments");
    expect(migrationSource).toContain(
      "CREATE INDEX IF NOT EXISTS idx_route_assignments_tenant_status"
    );
    expect(serverSource).toContain(
      "CREATE INDEX IF NOT EXISTS idx_route_assignments_tenant_status"
    );
    expect(migrationSource).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS route_assignments_active_unique"
    );
    expect(serverSource).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS route_assignments_active_unique"
    );
  });
});
