/**
 * ROLES-1 - per-user role matrix, server enforcement, and owner assignment.
 *
 * Unit coverage exercises the matrix and the entitlement INTERSECT role rule.
 * Endpoint coverage mounts the REAL Express handlers from server.ts through the
 * same fake-app harness used by USERS-1/NOTIFICATIONS-1, so the REAL AR-29
 * session guard and requirePermission middleware run.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  CANONICAL_ROLES,
  ROLE_PERMISSIONS,
  assignableRoles,
  can,
  effectiveModuleKeys,
  evaluateRoleChange,
  isTenantAdminRole,
  parseAssignableRole,
  requirePermission,
  type Permission
} from "./roles";

const serverSource = readFileSync(
  fileURLToPath(new URL("../../server.ts", import.meta.url)),
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
  options: {
    body?: Record<string, unknown>;
    cookie?: string;
    query?: Record<string, string>;
  } = {}
) {
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
  const username = `role_${label}_${run}`;
  const res = await callApi("POST", "/api/auth/register", {
    body: {
      username,
      password: "audit-password-123",
      plantCompanyName: `Roles ${label} ${run}`,
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

async function login(username: string, password = "password123"): Promise<string> {
  const res = await callApi("POST", "/api/auth/login", {
    body: { username, password }
  });
  expect(res.statusCode).toBe(200);
  return cookieFrom(res);
}

async function inviteUser(
  actorCookie: string,
  tenant: Tenant,
  label: string,
  role: string
): Promise<{ id: number; username: string; cookie: string }> {
  const username = `${label}_${run}`;
  const invited = await callApi("POST", "/api/company/users/invite", {
    cookie: actorCookie,
    body: {
      company_id: tenant.companyId,
      email: `${username}@example.com`,
      role,
      username
    }
  });
  expect(invited.statusCode).toBe(200);
  return {
    id: invited.body.id,
    username,
    cookie: await login(username)
  };
}

async function promoteToAnalyst(tenant: Tenant): Promise<Tenant> {
  const admin = await inviteUser(
    tenant.cookie,
    tenant,
    `${tenant.username}_admin`,
    "reliability-manager"
  );
  const promoted = await callApi(
    "POST",
    `/api/tenant-users/${tenant.userId}/role`,
    { cookie: admin.cookie, body: { role: "reliability-manager" } }
  );
  expect(promoted.statusCode).toBe(200);
  tenant.cookie = await login(tenant.username, "audit-password-123");
  return tenant;
}

async function createComponent(tenant: Tenant): Promise<number> {
  const asset = await callApi("POST", "/api/assets", {
    cookie: tenant.cookie,
    body: { name: `Role asset ${run}`, tag_number: `ROLE-${run}` }
  });
  expect(asset.statusCode).toBe(201);
  const component = await callApi("POST", "/api/components", {
    cookie: tenant.cookie,
    body: { asset_id: asset.body.id, name: `Role component ${run}` }
  });
  expect(component.statusCode).toBe(201);
  return component.body.id;
}

async function createRoute(tenant: Tenant): Promise<number> {
  const res = await callApi("POST", "/api/routes", {
    cookie: tenant.cookie,
    body: { plant_id: tenant.plantId, name: `Role route ${run}` }
  });
  expect(res.statusCode).toBe(201);
  return res.body.id;
}

let tenantA: Tenant;
let tenantB: Tenant;
let viewerDenied: { id: number; username: string; cookie: string };
let viewerPromote: { id: number; username: string; cookie: string };
let componentId: number;
let routeId: number;
let storeTenant: Tenant;
let storeWorker: { id: number; username: string; cookie: string };

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.ENABLE_DEV_AUTH_SEED;
  delete process.env.OPENAI_API_KEY;
  delete process.env.RESEND_API_KEY;
  process.env.NODE_ENV = "test";

  await import("../../server.ts");

  tenantA = await promoteToAnalyst(await registerTenant("a"));
  tenantB = await registerTenant("b");
  viewerDenied = await inviteUser(
    tenantA.cookie,
    tenantA,
    "viewer_denied",
    "plant-engineer"
  );
  viewerPromote = await inviteUser(
    tenantA.cookie,
    tenantA,
    "viewer_promote",
    "plant-engineer"
  );
  componentId = await createComponent(tenantA);
  routeId = await createRoute(tenantA);

  // Storefront provisioning with a REAL active thermography entitlement.
  const storeUsername = `store_${run}`;
  const storePassword = "store-password-123";
  const checkout = await callApi("POST", "/api/checkout/create", {
    body: {
      moduleKeys: ["thermography", "vibration"],
      companyName: `Roles Store ${run}`,
      username: storeUsername,
      password: storePassword,
      email: `store_${run}@example.com`,
      termsAccepted: true
    }
  });
  expect([200, 201]).toContain(checkout.statusCode);
  const webhook = await callApi("POST", "/api/square/webhook", {
    body: {
      event_id: `evt_role_${run}`,
      type: "payment.created",
      data: {
        object: {
          payment: {
            id: `pay_role_${run}`,
            status: "COMPLETED",
            referenceId: checkout.body.checkout_ref,
            subscriptionId: `sub_role_${run}`,
            customerId: `cus_role_${run}`
          }
        }
      }
    }
  });
  expect(webhook.statusCode).toBe(200);

  const storeLogin = await callApi("POST", "/api/auth/login", {
    body: { username: storeUsername, password: storePassword }
  });
  expect(storeLogin.statusCode).toBe(200);
  storeTenant = {
    companyId: storeLogin.body.company_id,
    userId: storeLogin.body.id,
    plantId: storeLogin.body.plant_id,
    username: storeUsername,
    cookie: cookieFrom(storeLogin)
  };
  storeWorker = await inviteUser(
    storeTenant.cookie,
    storeTenant,
    "store_worker",
    "plant-engineer"
  );
});

const ALL_PERMISSIONS: Permission[] = [
  "view_module:vibration",
  "view_module:thermography",
  "view_module:ultrasound",
  "view_module:oil",
  "assessment.save",
  "goodcatch.write",
  "route.checkout",
  "route.checkin",
  "bearing.write",
  "reports.export",
  "anomaly.view",
  "users.manage",
  "recipients.manage"
];

describe("ROLES-1 - matrix over the EXISTING role strings", () => {
  it("uses only the canonical users.role values, no new role vocabulary", () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(
      [...CANONICAL_ROLES].sort()
    );
    expect(CANONICAL_ROLES).toEqual([
      "plant-engineer",
      "reliability-manager",
      "system-admin"
    ]);
  });

  it("matches can(user, perm) to the matrix for every role x permission", () => {
    for (const role of CANONICAL_ROLES) {
      for (const permission of ALL_PERMISSIONS) {
        const expected = ROLE_PERMISSIONS[role].includes(permission);
        expect(can({ role }, permission)).toBe(expected);
      }
    }
  });

  it("viewer (plant-engineer) cannot write; analyst (reliability-manager) can", () => {
    expect(can({ role: "plant-engineer" }, "assessment.save")).toBe(false);
    expect(can({ role: "plant-engineer" }, "goodcatch.write")).toBe(false);
    expect(can({ role: "plant-engineer" }, "route.checkout")).toBe(false);
    expect(can({ role: "reliability-manager" }, "assessment.save")).toBe(true);
    expect(can({ role: "reliability-manager" }, "goodcatch.write")).toBe(true);
    expect(can({ role: "reliability-manager" }, "route.checkout")).toBe(true);
  });

  it("maps users.manage/recipients.manage onto the existing owner/admin bar", () => {
    expect(isTenantAdminRole("plant-engineer")).toBe(false);
    expect(isTenantAdminRole("reliability-manager")).toBe(true);
    expect(isTenantAdminRole("system-admin")).toBe(true);
    expect(assignableRoles("reliability-manager")).toEqual([
      "plant-engineer",
      "reliability-manager"
    ]);
    expect(assignableRoles("system-admin")).toContain("system-admin");
  });

  it("does not write legacy aliases as role values", () => {
    expect(parseAssignableRole("engineer")).toBeNull();
    expect(parseAssignableRole("manager")).toBeNull();
    expect(parseAssignableRole("plant-engineer")).toBe("plant-engineer");
  });

  it("effectiveModuleKeys is the INTERSECTION of entitlement and role", () => {
    expect(
      effectiveModuleKeys(["vibration", "thermography"], {
        role: "plant-engineer"
      })
    ).toEqual(["vibration"]);
    expect(
      effectiveModuleKeys(["vibration", "thermography"], {
        role: "reliability-manager"
      })
    ).toEqual(["vibration", "thermography"]);
    // Role permission cannot manufacture an unpaid module.
    expect(
      effectiveModuleKeys([], { role: "system-admin" })
    ).toEqual([]);
  });

  it("role-change guard blocks self-demotion and the last admin", () => {
    const self = evaluateRoleChange({
      targetId: 1,
      currentUserId: 1,
      targetRole: "reliability-manager",
      newRole: "plant-engineer",
      tenantUsers: [{ id: 1, role: "reliability-manager" }]
    });
    expect(self.ok).toBe(false);
    expect(self.reason).toBe("SELF_DEMOTION");

    const last = evaluateRoleChange({
      targetId: 2,
      currentUserId: 1,
      targetRole: "reliability-manager",
      newRole: "plant-engineer",
      tenantUsers: [{ id: 2, role: "reliability-manager" }]
    });
    expect(last.ok).toBe(false);
    expect(last.reason).toBe("LAST_ADMIN");
  });

  it("requirePermission 401s without a session and 403s a viewer", () => {
    const makeReq = (role?: string): any =>
      role ? { auth: { user: { role } } } : {};
    const makeRes = () => {
      const res: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: unknown) {
          this.body = payload;
          return this;
        }
      };
      return res;
    };
    const next = vi.fn();

    const noSession = makeRes();
    requirePermission("assessment.save")(makeReq(), noSession, next);
    expect(noSession.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();

    const viewer = makeRes();
    requirePermission("assessment.save")(
      makeReq("plant-engineer"),
      viewer,
      next
    );
    expect(viewer.statusCode).toBe(403);
    expect(viewer.body.code).toBe("ROLE_FORBIDDEN");
    expect(next).not.toHaveBeenCalled();
  });
});

describe("ROLES-1 - endpoint enforcement", () => {
  it("viewer gets 403 on assessment/good-catch/checkout; analyst succeeds", async () => {
    const assessment = {
      component_id: componentId,
      failure_mode_key: "unbalance",
      disposition: "defect"
    };
    const viewerAssessment = await callApi(
      "POST",
      "/api/component-assessments",
      { cookie: viewerDenied.cookie, body: assessment }
    );
    expect(viewerAssessment.statusCode).toBe(403);
    expect(viewerAssessment.body.code).toBe("ROLE_FORBIDDEN");
    const analystAssessment = await callApi(
      "POST",
      "/api/component-assessments",
      { cookie: tenantA.cookie, body: assessment }
    );
    expect(analystAssessment.statusCode).toBe(201);

    const catchBody = {
      title: `Role catch ${run}`,
      catch_date: "2026-03-01",
      avoided_cost_cents: 10000,
      downtime_hours_avoided: 1.5,
      safety_hazard: false
    };
    const viewerCatch = await callApi("POST", "/api/good-catches", {
      cookie: viewerDenied.cookie,
      body: catchBody
    });
    expect(viewerCatch.statusCode).toBe(403);
    const analystCatch = await callApi("POST", "/api/good-catches", {
      cookie: tenantA.cookie,
      body: { ...catchBody, title: `Analyst catch ${run}` }
    });
    expect(analystCatch.statusCode).toBe(201);

    const viewerCheckout = await callApi(
      "POST",
      `/api/routes/${routeId}/checkout`,
      { cookie: viewerDenied.cookie }
    );
    expect(viewerCheckout.statusCode).toBe(403);
    const analystCheckout = await callApi(
      "POST",
      `/api/routes/${routeId}/checkout`,
      { cookie: tenantA.cookie }
    );
    expect(analystCheckout.statusCode).toBe(201);
  });

  it("role lacks view_module even though the tenant is entitled => 403", async () => {
    // The store tenant is entitled to thermography, but plant-engineer does
    // not hold view_module:thermography. The hidden module stays 403 direct.
    expect(
      effectiveModuleKeys(["thermography", "vibration"], {
        role: "plant-engineer"
      })
    ).toEqual(["vibration"]);

    const denied = await callApi("POST", "/api/analyze-thermography", {
      cookie: storeWorker.cookie,
      body: {}
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.body.code).toBe("ROLE_FORBIDDEN");

    // Same tenant, same entitlement, analyst role passes the role gate.
    const allowed = await callApi("POST", "/api/analyze-thermography", {
      cookie: storeTenant.cookie,
      body: {}
    });
    expect(allowed.statusCode).not.toBe(403);
  });

  it("role has view_module but the module is unentitled => MODULE_NOT_ENTITLED", async () => {
    const denied = await callApi("POST", "/api/analyze-thermography", {
      cookie: tenantA.cookie,
      body: {}
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.body.code).toBe("MODULE_NOT_ENTITLED");
  });

  it("role assignment is tenant-scoped: cross-tenant is 404, self-demotion 409", async () => {
    const crossTenant = await callApi(
      "POST",
      `/api/tenant-users/${tenantB.userId}/role`,
      {
        cookie: tenantA.cookie,
        body: { role: "reliability-manager" }
      }
    );
    expect(crossTenant.statusCode).toBe(404);

    const selfDemotion = await callApi(
      "POST",
      `/api/tenant-users/${tenantA.userId}/role`,
      {
        cookie: tenantA.cookie,
        body: { role: "plant-engineer" }
      }
    );
    expect(selfDemotion.statusCode).toBe(409);
    expect(selfDemotion.body.code).toBe("SELF_DEMOTION");
  });

  it("role change takes effect on the next request without session disruption", async () => {
    const before = await callApi("POST", "/api/component-assessments", {
      cookie: viewerPromote.cookie,
      body: {
        component_id: componentId,
        failure_mode_key: "looseness",
        disposition: "anomaly"
      }
    });
    expect(before.statusCode).toBe(403);

    const changed = await callApi(
      "POST",
      `/api/tenant-users/${viewerPromote.id}/role`,
      {
        cookie: tenantA.cookie,
        body: { role: "reliability-manager" }
      }
    );
    expect(changed.statusCode).toBe(200);

    // Same cookie, no re-login and no session deletion: per-request role read
    // (src/lib/auth/middleware.ts loadSessionUser / memory loader).
    const after = await callApi("POST", "/api/component-assessments", {
      cookie: viewerPromote.cookie,
      body: {
        component_id: componentId,
        failure_mode_key: "looseness",
        disposition: "anomaly"
      }
    });
    expect(after.statusCode).toBe(201);
  });

  it("system-admin invite path still works (role gate + insert path intact)", async () => {
    expect(serverSource).toContain('"/api/auth/invites"');
    expect(serverSource).toContain('requireRole("system-admin")');
    expect(serverSource).toContain("INSERT INTO auth_invites");
    expect(serverSource).toContain("token_hash");

    const sys = await inviteUser(
      tenantA.cookie,
      tenantA,
      "sys_inviter",
      "plant-engineer"
    );
    const promoted = await callApi(
      "PUT",
      `/api/company/users/${sys.id}/role`,
      { cookie: sys.cookie, body: { role: "system-admin" } }
    );
    expect(promoted.statusCode).toBe(200);
    const sysCookie = await login(sys.username);

    // Role gate passes; memory mode then honestly reports no DATABASE_URL.
    const allowed = await callApi("POST", "/api/auth/invites", {
      cookie: sysCookie,
      body: { email: `sys_${run}@example.com`, role: "plant-engineer" }
    });
    expect(allowed.statusCode).toBe(503);
    expect(String(allowed.body.error)).toMatch(/Database is not configured/i);

    const forbidden = await callApi("POST", "/api/auth/invites", {
      cookie: viewerDenied.cookie,
      body: { email: `sys_no_${run}@example.com`, role: "plant-engineer" }
    });
    expect(forbidden.statusCode).toBe(403);
  });
});
