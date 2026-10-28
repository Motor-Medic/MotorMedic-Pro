/**
 * ASSESSMENT-WIZARD - tenant isolation, link ownership, taxonomy validation,
 * disposition enforcement and metadata snapshot round-trip.
 *
 * The API half mounts the REAL Express handlers from server.ts through the same
 * fake Express app used by multiTenantIsolation.test.ts / goodCatches.test.ts
 * in DATABASE_URL-less memory mode and drives the real session guard.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  ASSESSMENT_DISPOSITIONS,
  findMissingMetadata,
  isAssessmentDisposition,
  validateAssessmentDraft,
  validateAssessmentLinks
} from "./assessmentWizard";
import {
  FAILURE_MODES,
  FAILURE_MODE_KEYS,
  failureModeLabel,
  isFailureModeKey
} from "./failureModes";

const serverSource = readFileSync(
  fileURLToPath(new URL("../../server.ts", import.meta.url)),
  "utf8"
);
const migrationSource = readFileSync(
  fileURLToPath(
    new URL("../../migrations/025_component_assessments.sql", import.meta.url)
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
  if (!raw) throw new Error("register did not set a session cookie");
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
  const username = `aw_${label}_${run}`;
  const res = await callApi("POST", "/api/auth/register", {
    body: {
      username,
      password: "audit-password-123",
      plantCompanyName: `Assessment ${label} ${run}`,
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

/**
 * ROLES-1 - assessment.save requires the analyst role. Registration creates a
 * plant-engineer viewer, so the isolation suite runs as the owner-assigned
 * reliability-manager analyst.
 */
async function promoteToAnalyst(tenant: Tenant): Promise<Tenant> {
  const adminUsername = `${tenant.username}_admin`;
  const invited = await callApi("POST", "/api/company/users/invite", {
    cookie: tenant.cookie,
    body: {
      company_id: tenant.companyId,
      email: `${adminUsername}@example.com`,
      role: "reliability-manager",
      username: adminUsername
    }
  });
  expect(invited.statusCode).toBe(200);
  const adminLogin = await callApi("POST", "/api/auth/login", {
    body: { username: adminUsername, password: "password123" }
  });
  expect(adminLogin.statusCode).toBe(200);
  const promoted = await callApi(
    "POST",
    `/api/tenant-users/${tenant.userId}/role`,
    {
      cookie: cookieFrom(adminLogin),
      body: { role: "reliability-manager" }
    }
  );
  expect(promoted.statusCode).toBe(200);
  const relogin = await callApi("POST", "/api/auth/login", {
    body: { username: tenant.username, password: "audit-password-123" }
  });
  expect(relogin.statusCode).toBe(200);
  tenant.cookie = cookieFrom(relogin);
  return tenant;
}

async function createComponentFor(
  tenant: Tenant,
  label: string
): Promise<{ assetId: number; componentId: number }> {
  const asset = await callApi("POST", "/api/assets", {
    cookie: tenant.cookie,
    body: { name: `${label} asset ${run}`, tag_number: `AW-${label}-${run}` }
  });
  expect(asset.statusCode).toBe(201);
  const component = await callApi("POST", "/api/components", {
    cookie: tenant.cookie,
    body: { asset_id: asset.body.id, name: `${label} component ${run}` }
  });
  expect(component.statusCode).toBe(201);
  return { assetId: asset.body.id, componentId: component.body.id };
}

let tenantA: Tenant;
let tenantB: Tenant;
let tenantC: Tenant;
let aComponentId: number;
let bComponentId: number;
let cComponentId: number;
let firstAssessmentId: number;

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.ENABLE_DEV_AUTH_SEED;
  process.env.NODE_ENV = "test";

  await import("../../server.ts");

  tenantA = await promoteToAnalyst(await registerTenant("a"));
  tenantB = await promoteToAnalyst(await registerTenant("b"));
  tenantC = await promoteToAnalyst(await registerTenant("c"));

  aComponentId = (await createComponentFor(tenantA, "A")).componentId;
  bComponentId = (await createComponentFor(tenantB, "B")).componentId;
  cComponentId = (await createComponentFor(tenantC, "C")).componentId;

  const first = await callApi("POST", "/api/component-assessments", {
    cookie: tenantA.cookie,
    body: {
      component_id: aComponentId,
      failure_mode_key: "unbalance",
      disposition: "defect",
      notes: "1x radial peak confirmed unbalance.",
      metadata_missing_at_assessment: ["baseplate", "coupling_type"]
    }
  });
  expect(first.statusCode).toBe(201);
  firstAssessmentId = first.body.assessment.id;
});

describe("ASSESSMENT-WIZARD - tenant isolation", () => {
  it("tenant B cannot see tenant A's assessments", async () => {
    const aList = await callApi("GET", `/api/components/${aComponentId}/assessments`, {
      cookie: tenantA.cookie
    });
    expect(aList.statusCode).toBe(200);
    expect(aList.body.assessments.map((row: any) => row.id)).toContain(
      firstAssessmentId
    );

    const foreignList = await callApi(
      "GET",
      `/api/components/${aComponentId}/assessments`,
      { cookie: tenantB.cookie }
    );
    expect(foreignList.statusCode).toBe(404);

    const bList = await callApi("GET", `/api/components/${bComponentId}/assessments`, {
      cookie: tenantB.cookie
    });
    expect(bList.statusCode).toBe(200);
    expect(bList.body.assessments).toEqual([]);
  });

  it("cross-tenant component and alert links are rejected with 404", async () => {
    const foreignComponent = await callApi("POST", "/api/component-assessments", {
      cookie: tenantA.cookie,
      body: {
        component_id: bComponentId,
        disposition: "anomaly",
        failure_mode_key: "looseness"
      }
    });
    expect(foreignComponent.statusCode).toBe(404);
    expect(foreignComponent.body.field).toBe("component_id");

    const unknownAlert = await callApi("POST", "/api/component-assessments", {
      cookie: tenantA.cookie,
      body: {
        component_id: aComponentId,
        alert_id: "00000000-0000-4000-8000-000000000000",
        disposition: "anomaly",
        failure_mode_key: "looseness"
      }
    });
    expect(unknownAlert.statusCode).toBe(404);
    expect(unknownAlert.body.field).toBe("alert_id");

    const owned = {
      components: new Set<number>([1]),
      alerts: new Set<string>()
    };
    const linkCheck = validateAssessmentLinks(
      { component_id: 1, alert_id: "other-tenant-alert" },
      owned
    );
    expect(linkCheck.ok).toBe(false);
    if ("error" in linkCheck) {
      expect(linkCheck.status).toBe(404);
      expect(linkCheck.field).toBe("alert_id");
    }
  });

  it("an empty tenant gets an honest empty state", async () => {
    const list = await callApi("GET", `/api/components/${cComponentId}/assessments`, {
      cookie: tenantC.cookie
    });
    expect(list.statusCode).toBe(200);
    expect(list.body.assessments).toEqual([]);

    const latest = await callApi(
      "GET",
      `/api/components/${cComponentId}/assessment-latest`,
      { cookie: tenantC.cookie }
    );
    expect(latest.statusCode).toBe(200);
    expect(latest.body.assessment).toBeNull();
  });
});

describe("ASSESSMENT-WIZARD - validation", () => {
  it("rejects a disposition outside the fixed vocabulary", async () => {
    const invalid = await callApi("POST", "/api/component-assessments", {
      cookie: tenantA.cookie,
      body: {
        component_id: aComponentId,
        disposition: "maybe",
        failure_mode_key: "unbalance"
      }
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.body.field).toBe("disposition");

    expect(isAssessmentDisposition("defect")).toBe(true);
    expect(isAssessmentDisposition("maybe")).toBe(false);
  });

  it("validates failure-mode keys against the starter taxonomy", async () => {
    const invalidMode = await callApi("POST", "/api/component-assessments", {
      cookie: tenantA.cookie,
      body: {
        component_id: aComponentId,
        disposition: "anomaly",
        failure_mode_key: "not_a_real_mode"
      }
    });
    expect(invalidMode.statusCode).toBe(400);
    expect(invalidMode.body.field).toBe("failure_mode_key");

    expect(isFailureModeKey("bearing_defect_bpfo")).toBe(true);
    expect(isFailureModeKey("not_a_real_mode")).toBe(false);
    expect(failureModeLabel("bearing_defect_bpfo")).toBe("BPFO - Outer Race");

    const draft = validateAssessmentDraft({
      disposition: "defect",
      failure_mode_key: "wear_metals",
      metadata_missing_at_assessment: ["baseplate", "baseplate", ""]
    });
    expect(draft.ok).toBe(true);
    if (!("error" in draft)) {
      expect(draft.failureModeKey).toBe("wear_metals");
      expect(draft.metadataMissing).toEqual(["baseplate"]);
    }
  });

  it("keeps the taxonomy extensible (array additions become valid keys)", () => {
    expect(FAILURE_MODES.length).toBeGreaterThan(0);
    expect(FAILURE_MODE_KEYS).toEqual(
      expect.arrayContaining(["unbalance", "contamination", "other_oil"])
    );
    const synthetic = { key: "future_mode", label: "Future Mode" };
    const extended = [
      ...FAILURE_MODE_KEYS,
      synthetic.key
    ];
    expect(extended).toContain("future_mode");
  });

  it("metadata completeness flags null/empty required fields", () => {
    expect(
      findMissingMetadata({
        bearing_type: "6314-C3",
        coupling_type: "   ",
        baseplate: null,
        criticality: "High"
      })
    ).toEqual(["coupling_type", "baseplate"]);

    expect(
      findMissingMetadata({
        bearing_type: "6314-C3",
        coupling_type: "Flexible Grid",
        baseplate: "Fabricated steel",
        criticality: "High"
      })
    ).toEqual([]);
  });
});

describe("ASSESSMENT-WIZARD - latest + metadata round-trip", () => {
  it("latest query returns the most recent assessment", async () => {
    const second = await callApi("POST", "/api/component-assessments", {
      cookie: tenantA.cookie,
      body: {
        component_id: aComponentId,
        failure_mode_key: "bearing_defect_bpfo",
        disposition: "anomaly",
        notes: "BPFO harmonics visible.",
        metadata_missing_at_assessment: []
      }
    });
    expect(second.statusCode).toBe(201);
    const secondId = second.body.assessment.id;

    const latest = await callApi(
      "GET",
      `/api/components/${aComponentId}/assessment-latest`,
      { cookie: tenantA.cookie }
    );
    expect(latest.statusCode).toBe(200);
    expect(latest.body.assessment.id).toBe(secondId);
    expect(latest.body.assessment.disposition).toBe("anomaly");
    expect(latest.body.assessment.failure_mode_key).toBe("bearing_defect_bpfo");

    const list = await callApi("GET", `/api/components/${aComponentId}/assessments`, {
      cookie: tenantA.cookie
    });
    expect(list.body.assessments[0].id).toBe(secondId);
  });

  it("metadata_missing_at_assessment is preserved round-trip", async () => {
    const list = await callApi("GET", `/api/components/${aComponentId}/assessments`, {
      cookie: tenantA.cookie
    });
    const first = list.body.assessments.find(
      (row: any) => row.id === firstAssessmentId
    );
    expect(first).toBeTruthy();
    expect(first.metadata_missing_at_assessment).toEqual([
      "baseplate",
      "coupling_type"
    ]);
  });
});

describe("ASSESSMENT-WIZARD - scope lock and DEP-1 mirror", () => {
  it("reads/writes derive the tenant from the session, never req.query", () => {
    const start = serverSource.indexOf(
      'app.post("/api/component-assessments"'
    );
    const end = serverSource.indexOf(
      "// USER AUTHENTICATION ENDPOINTS",
      start
    );
    expect(start).toBeGreaterThan(-1);
    const block = serverSource.slice(start, end);
    expect(block).toContain("requestTenantId(req)");
    expect(block).toContain("WHERE tenant_id = $1 AND component_id = $2");
    expect(block).toContain("ORDER BY assessed_at DESC, id DESC");
    expect(block).not.toMatch(/req\.query/);
    expect(block).not.toMatch(/company_id\s*=\s*req\./);
  });

  it("migration 025 and initializeDatabase share the same idempotent table", () => {
    expect(migrationSource).toContain(
      "CREATE TABLE IF NOT EXISTS component_assessments"
    );
    expect(serverSource).toContain(
      "CREATE TABLE IF NOT EXISTS component_assessments"
    );
    expect(migrationSource).toContain(
      "idx_component_assessments_tenant_component"
    );
    expect(serverSource).toContain(
      "idx_component_assessments_tenant_component"
    );
    expect(migrationSource).toContain(
      "CHECK (disposition IN ('none', 'anomaly', 'defect', 'unable'))"
    );
    expect(serverSource).toContain(
      "CHECK (disposition IN ('none', 'anomaly', 'defect', 'unable'))"
    );
  });

  it("disposition vocabulary is shared with the UI list", () => {
    expect(ASSESSMENT_DISPOSITIONS.map((item) => item.key)).toEqual([
      "none",
      "anomaly",
      "defect",
      "unable"
    ]);
  });
});
