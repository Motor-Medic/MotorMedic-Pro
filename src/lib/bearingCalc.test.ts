/**
 * BEARING-CALC - pure math fixtures, validation, tenant isolation, and the
 * "calc stores nothing" guarantee.
 *
 * The API half mounts the REAL Express handlers from server.ts through the
 * same fake Express app used by multiTenantIsolation.test.ts / goodCatches.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  calculateBearingFaultFrequencies,
  calculateBearingFrequencies,
  formatBearingFrequency,
  roundBearingFrequency,
  validateBearingCalcInput,
  validateBearingGeometry
} from "./bearingCalc";

const serverSource = readFileSync(
  fileURLToPath(new URL("../../server.ts", import.meta.url)),
  "utf8"
);
const migrationSource = readFileSync(
  fileURLToPath(new URL("../../migrations/023_bearing_specs.sql", import.meta.url)),
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
  const companyName = `Bearing Calc ${label} ${run}`;
  const username = `bc_${label}_${run}`;
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
let aComponentId: number;
let bComponentId: number;
let aSpecId: number;
let bSpecId: number;

const fixtureInputA = {
  rpm: 3600,
  z: 9,
  bd: 10,
  pd: 50,
  contact_angle: 0
};
const fixtureInputB = {
  rpm: 3600,
  z: 9,
  bd: 10,
  pd: 50,
  contact_angle: 15
};

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.ENABLE_DEV_AUTH_SEED;
  process.env.NODE_ENV = "test";

  await import("../../server.ts");

  tenantA = await registerTenant("a");
  tenantB = await registerTenant("b");

  const aAsset = await callApi("POST", "/api/assets", {
    cookie: tenantA.cookie,
    body: { name: `A-only bearing asset ${run}`, tag_number: `BCA-${run}` }
  });
  expect(aAsset.statusCode).toBe(201);
  const aComponent = await callApi("POST", "/api/components", {
    cookie: tenantA.cookie,
    body: { asset_id: aAsset.body.id, name: `A DE bearing ${run}` }
  });
  expect(aComponent.statusCode).toBe(201);
  aComponentId = aComponent.body.id;

  const bAsset = await callApi("POST", "/api/assets", {
    cookie: tenantB.cookie,
    body: { name: `B-only bearing asset ${run}`, tag_number: `BCB-${run}` }
  });
  expect(bAsset.statusCode).toBe(201);
  const bComponent = await callApi("POST", "/api/components", {
    cookie: tenantB.cookie,
    body: { asset_id: bAsset.body.id, name: `B DE bearing ${run}` }
  });
  expect(bComponent.statusCode).toBe(201);
  bComponentId = bComponent.body.id;

  const aSpec = await callApi("POST", "/api/bearing-specs", {
    cookie: tenantA.cookie,
    body: {
      component_id: aComponentId,
      z: 9,
      bd: 10,
      pd: 50,
      contact_angle: 15,
      unit: "mm",
      reference_label: "Free-text label A (verbatim)"
    }
  });
  expect(aSpec.statusCode).toBe(201);
  aSpecId = aSpec.body.spec.id;

  const bSpec = await callApi("POST", "/api/bearing-specs", {
    cookie: tenantB.cookie,
    body: {
      component_id: bComponentId,
      z: 8,
      bd: 12.5,
      pd: 60,
      contact_angle: 0,
      unit: "mm",
      reference_label: "Free-text label B (verbatim)"
    }
  });
  expect(bSpec.statusCode).toBe(201);
  bSpecId = bSpec.body.spec.id;
});

describe("BEARING-CALC - pure math fixtures", () => {
  it("fixture A (0 deg) matches the published defect-frequency identities", () => {
    const result = calculateBearingFaultFrequencies({
      rpm: 3600,
      z: 9,
      bd: 10,
      pd: 50,
      contactAngle: 0
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(roundBearingFrequency(result.value.shaftHz)).toBe(60);
    expect(roundBearingFrequency(result.value.bpfo)).toBe(216);
    expect(roundBearingFrequency(result.value.bpfi)).toBe(324);
    expect(roundBearingFrequency(result.value.bsf)).toBe(144);
    expect(roundBearingFrequency(result.value.ftf)).toBe(24);
  });

  it("fixture B (15 deg) catches degree/radian bugs fixture A cannot", () => {
    const result = calculateBearingFaultFrequencies({
      rpm: 3600,
      z: 9,
      bd: 10,
      pd: 50,
      contactAngle: 15
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(roundBearingFrequency(result.value.bpfo)).toBe(217.84);
    expect(roundBearingFrequency(result.value.bpfi)).toBe(322.16);
    expect(roundBearingFrequency(result.value.bsf)).toBe(144.4);
    expect(roundBearingFrequency(result.value.ftf)).toBe(24.2);
  });

  it("BPFO + BPFI === Z * shaft_hz on both fixtures", () => {
    for (const angle of [0, 15]) {
      const value = calculateBearingFrequencies({
        rpm: 3600,
        z: 9,
        bd: 10,
        pd: 50,
        contactAngle: angle
      });
      expect(value.bpfo + value.bpfi).toBe(9 * value.shaftHz);
    }
  });

  it("formats an unavailable frequency honestly (em dash, not 0)", () => {
    expect(formatBearingFrequency(216)).toBe("216.00");
    expect(formatBearingFrequency(null)).toBe("—");
    expect(formatBearingFrequency(undefined)).toBe("—");
  });
});

describe("BEARING-CALC - validation", () => {
  it("rejects Bd >= Pd", () => {
    expect(
      validateBearingGeometry({ z: 9, bd: 50, pd: 50, contactAngle: 0 }).ok
    ).toBe(false);
    expect(
      validateBearingGeometry({ z: 9, bd: 60, pd: 50, contactAngle: 0 }).ok
    ).toBe(false);
  });

  it("rejects Z < 3 and non-integer ball counts", () => {
    expect(
      validateBearingGeometry({ z: 2, bd: 10, pd: 50, contactAngle: 0 }).ok
    ).toBe(false);
    expect(
      validateBearingGeometry({ z: 3.5, bd: 10, pd: 50, contactAngle: 0 }).ok
    ).toBe(false);
    expect(
      validateBearingGeometry({ z: 3, bd: 10, pd: 50, contactAngle: 0 }).ok
    ).toBe(true);
  });

  it("rejects RPM <= 0", () => {
    expect(
      validateBearingCalcInput({
        rpm: 0,
        z: 9,
        bd: 10,
        pd: 50,
        contactAngle: 0
      }).ok
    ).toBe(false);
    expect(
      validateBearingCalcInput({
        rpm: -1,
        z: 9,
        bd: 10,
        pd: 50,
        contactAngle: 0
      }).ok
    ).toBe(false);
  });

  it("rejects contact angles outside 0-45 degrees", () => {
    for (const angle of [-1, 45.01, 90]) {
      expect(
        validateBearingGeometry({ z: 9, bd: 10, pd: 50, contactAngle: angle }).ok
      ).toBe(false);
    }
    expect(
      validateBearingGeometry({ z: 9, bd: 10, pd: 50, contactAngle: 45 }).ok
    ).toBe(true);
    expect(
      validateBearingGeometry({ z: 9, bd: 10, pd: 50, contactAngle: 0 }).ok
    ).toBe(true);
  });

  it("the API rejects the same invalid calculator inputs with 400", async () => {
    const cases = [
      { ...fixtureInputA, bd: 50 },
      { ...fixtureInputA, z: 2 },
      { ...fixtureInputA, rpm: 0 },
      { ...fixtureInputA, contact_angle: 46 }
    ];
    for (const body of cases) {
      const res = await callApi("POST", "/api/bearing-calc", {
        cookie: tenantA.cookie,
        body
      });
      expect(res.statusCode).toBe(400);
    }
  });
});

describe("BEARING-CALC - API math", () => {
  it("POST /api/bearing-calc returns fixture A frequencies", async () => {
    const res = await callApi("POST", "/api/bearing-calc", {
      cookie: tenantA.cookie,
      body: fixtureInputA
    });
    expect(res.statusCode).toBe(200);
    expect(roundBearingFrequency(res.body.shaft_hz)).toBe(60);
    expect(roundBearingFrequency(res.body.bpfo)).toBe(216);
    expect(roundBearingFrequency(res.body.bpfi)).toBe(324);
    expect(roundBearingFrequency(res.body.bsf)).toBe(144);
    expect(roundBearingFrequency(res.body.ftf)).toBe(24);
  });

  it("POST /api/bearing-calc returns fixture B frequencies", async () => {
    const res = await callApi("POST", "/api/bearing-calc", {
      cookie: tenantA.cookie,
      body: fixtureInputB
    });
    expect(res.statusCode).toBe(200);
    expect(roundBearingFrequency(res.body.bpfo)).toBe(217.84);
    expect(roundBearingFrequency(res.body.bpfi)).toBe(322.16);
    expect(roundBearingFrequency(res.body.bsf)).toBe(144.4);
    expect(roundBearingFrequency(res.body.ftf)).toBe(24.2);
  });

  it("the calc endpoint stores nothing (row count unchanged)", async () => {
    const before = await callApi("GET", "/api/bearing-specs", {
      cookie: tenantA.cookie
    });
    const beforeCount = before.body.specs.length;
    await callApi("POST", "/api/bearing-calc", {
      cookie: tenantA.cookie,
      body: fixtureInputA
    });
    const after = await callApi("GET", "/api/bearing-specs", {
      cookie: tenantA.cookie
    });
    expect(after.body.specs.length).toBe(beforeCount);
    expect(after.body.specs.map((spec: any) => spec.id)).toEqual(
      before.body.specs.map((spec: any) => spec.id)
    );
  });
});

describe("BEARING-CALC - tenant isolation", () => {
  it("tenant B cannot read tenant A's specs", async () => {
    const aList = await callApi("GET", "/api/bearing-specs", {
      cookie: tenantA.cookie
    });
    expect(aList.body.specs.map((spec: any) => spec.id)).toContain(aSpecId);

    const bList = await callApi("GET", "/api/bearing-specs", {
      cookie: tenantB.cookie
    });
    const bIds = bList.body.specs.map((spec: any) => spec.id);
    expect(bIds).toContain(bSpecId);
    expect(bIds).not.toContain(aSpecId);
  });

  it("cross-tenant component reads/writes return 404", async () => {
    const readForeign = await callApi(
      "GET",
      `/api/bearing-specs/component/${aComponentId}`,
      { cookie: tenantB.cookie }
    );
    expect(readForeign.statusCode).toBe(404);

    const writeForeign = await callApi("POST", "/api/bearing-specs", {
      cookie: tenantB.cookie,
      body: {
        component_id: aComponentId,
        z: 9,
        bd: 10,
        pd: 50,
        contact_angle: 0
      }
    });
    expect(writeForeign.statusCode).toBe(404);

    const patchForeign = await callApi(
      "PATCH",
      `/api/bearing-specs/${aSpecId}`,
      {
        cookie: tenantB.cookie,
        body: { reference_label: "B must not rename A" }
      }
    );
    expect(patchForeign.statusCode).toBe(404);

    const deleteForeign = await callApi(
      "DELETE",
      `/api/bearing-specs/${aSpecId}`,
      { cookie: tenantB.cookie }
    );
    expect(deleteForeign.statusCode).toBe(404);
  });

  it("own-component specs auto-load and can be patched verbatim", async () => {
    const loaded = await callApi(
      "GET",
      `/api/bearing-specs/component/${aComponentId}`,
      { cookie: tenantA.cookie }
    );
    expect(loaded.statusCode).toBe(200);
    expect(loaded.body.spec.id).toBe(aSpecId);
    expect(loaded.body.spec.reference_label).toBe(
      "Free-text label A (verbatim)"
    );

    const patched = await callApi("PATCH", `/api/bearing-specs/${aSpecId}`, {
      cookie: tenantA.cookie,
      body: { reference_label: "  keep spacing  " }
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.body.spec.reference_label).toBe("  keep spacing  ");
  });

  it("DELETE is scoped to the session tenant", async () => {
    const extra = await callApi("POST", "/api/bearing-specs", {
      cookie: tenantA.cookie,
      body: {
        component_id: aComponentId,
        z: 9,
        bd: 10,
        pd: 50,
        contact_angle: 0,
        reference_label: "temporary"
      }
    });
    expect(extra.statusCode).toBe(201);
    const extraId = extra.body.spec.id;

    const deleted = await callApi("DELETE", `/api/bearing-specs/${extraId}`, {
      cookie: tenantA.cookie
    });
    expect(deleted.statusCode).toBe(200);

    const missing = await callApi("DELETE", `/api/bearing-specs/${extraId}`, {
      cookie: tenantA.cookie
    });
    expect(missing.statusCode).toBe(404);
  });
});

describe("BEARING-CALC - scope lock and DEP-1 mirror", () => {
  it("reads/writes derive the tenant from the session, never req.query", () => {
    const start = serverSource.indexOf('app.get("/api/bearing-specs"');
    const end = serverSource.indexOf(
      "// USER AUTHENTICATION ENDPOINTS",
      start
    );
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = serverSource.slice(start, end);
    expect(block).toContain("requestTenantId(req)");
    expect(block).toContain("WHERE tenant_id = $1");
    expect(block).toContain(
      "WHERE id = $1 AND tenant_id = $2"
    );
    expect(block).toContain(
      "DELETE FROM bearing_specs WHERE id = $1 AND tenant_id = $2"
    );
    expect(block).not.toMatch(/req\.query/);
    expect(block).not.toMatch(/company_id\s*=\s*req\./);
  });

  it("migration 023 and initializeDatabase share the same idempotent table", () => {
    expect(migrationSource).toContain(
      "CREATE TABLE IF NOT EXISTS bearing_specs"
    );
    expect(serverSource).toContain(
      "CREATE TABLE IF NOT EXISTS bearing_specs"
    );
    expect(migrationSource).toContain(
      "CREATE INDEX IF NOT EXISTS idx_bearing_specs_tenant_component"
    );
    expect(serverSource).toContain(
      "CREATE INDEX IF NOT EXISTS idx_bearing_specs_tenant_component"
    );
  });

  it("stores no manufacturer catalog and keeps the label free text", () => {
    expect(migrationSource).toContain("reference_label TEXT");
    expect(migrationSource).not.toMatch(/\b(skf|nsk|fag|timken)\b/i);
    expect(serverSource).not.toContain("BEARING_GEOMETRY");
  });

  it("the pure calc handler contains no write statements", () => {
    const start = serverSource.indexOf('app.post("/api/bearing-calc"');
    const end = serverSource.indexOf(
      "// USER AUTHENTICATION ENDPOINTS",
      start
    );
    expect(start).toBeGreaterThan(-1);
    const block = serverSource.slice(start, end);
    expect(block).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
    expect(block).not.toContain("bearing_specs");
  });
});
