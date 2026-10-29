/**
 * SLICE-A - atomic, honest, batch-handleable hierarchy import.
 *
 * This mounts the REAL Express handlers from server.ts through the same fake
 * app used by multiTenantIsolation.test.ts, in DATABASE_URL-less memory mode,
 * and drives the real session guard. It proves the bulk-import path is
 * all-or-nothing, returns an import_id only on success, stamps one batch id on
 * every created row, and discards exactly that batch (never NULL-import rows
 * and never another tenant's batch).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";

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
  companyName: string;
  companyId: number;
  plantId: number;
  cookie: string;
}

const run = Date.now().toString(36);

async function registerTenant(label: string): Promise<Tenant> {
  const companyName = `Import Audit ${label} ${run}`;
  const res = await callApi("POST", "/api/auth/register", {
    body: {
      username: `import_audit_${label}_${run}`,
      password: "audit-password-123",
      plantCompanyName: companyName,
      termsAccepted: true
    }
  });
  expect(res.statusCode).toBe(201);
  return {
    companyName,
    companyId: res.body.company_id,
    plantId: res.body.plant_id,
    cookie: cookieFrom(res)
  };
}

let tenantA: Tenant;
let tenantB: Tenant;

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.ENABLE_DEV_AUTH_SEED;
  process.env.NODE_ENV = "test";
  await import("../../server.ts");
  tenantA = await registerTenant("a");
  tenantB = await registerTenant("b");
}, 60_000);

function importRow(suffix: string, overrides: Record<string, unknown> = {}) {
  return {
    plantName: "Import Plant",
    routeName: `Import Route ${suffix}`,
    assetTag: `IMP-${suffix}`,
    assetName: `Import Asset ${suffix}`,
    assetType: "Pump",
    componentName: `Import Component ${suffix}`,
    ...overrides
  };
}

async function hierarchy(tenant: Tenant) {
  const res = await callApi("GET", "/api/hierarchy", { cookie: tenant.cookie });
  expect(res.statusCode).toBe(200);
  return res.body as {
    plants: any[];
    routes: any[];
    assets: any[];
    components: any[];
    collection_points: any[];
  };
}

describe("SLICE-A - bulk import is atomic and honest", () => {
  it("mid-batch failure rolls back every row, returns an error, and never says success:true", async () => {
    const before = await hierarchy(tenantA);
    const routeName = `Atomic Failure Route ${run}`;

    const res = await callApi("POST", "/api/assets/bulk-import", {
      cookie: tenantA.cookie,
      body: {
        assets: [
          importRow(`${run}-OK`, { routeName, assetName: `Atomic first row ${run}` }),
          importRow(`${run}-BAD`, {
            routeName,
            assetName: `Atomic bad row ${run}`,
            assetType: ""
          })
        ]
      }
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.failingRow).toMatchObject({
      index: 2,
      identifier: `IMP-${run}-BAD`
    });
    expect(res.body.failingRow.reason).toMatch(/Missing required fields/);
    expect(res.body.error).toContain(`IMP-${run}-BAD`);
    expect(res.body).not.toMatchObject({ success: true });

    const after = await hierarchy(tenantA);
    expect(after.plants).toHaveLength(before.plants.length);
    expect(after.routes).toHaveLength(before.routes.length);
    expect(after.assets).toHaveLength(before.assets.length);
    expect(after.components).toHaveLength(before.components.length);
    expect(after.routes.map((r) => r.name)).not.toContain(routeName);
    expect(after.assets.map((a) => a.name)).not.toContain(`Atomic first row ${run}`);
  });

  it("a successful batch stamps every created row with the same import_id", async () => {
    const routeName = `Shared Batch Route ${run}`;
    const res = await callApi("POST", "/api/assets/bulk-import", {
      cookie: tenantA.cookie,
      body: {
        assets: [
          importRow(`${run}-S1`, { routeName }),
          importRow(`${run}-S2`, { routeName })
        ]
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.skipped).toBe(0);
    expect(Number.isInteger(res.body.import_id)).toBe(true);
    const importId = res.body.import_id;

    const tree = await hierarchy(tenantA);
    const assets = tree.assets.filter((a) =>
      [`IMP-${run}-S1`, `IMP-${run}-S2`].includes(a.tag_number)
    );
    expect(assets).toHaveLength(2);
    expect(assets.map((a) => a.import_id)).toEqual([importId, importId]);

    const route = tree.routes.find((r) => r.name === routeName);
    expect(route?.import_id).toBe(importId);

    const components = tree.components.filter((c) =>
      assets.some((a) => a.id === c.asset_id)
    );
    expect(components.length).toBeGreaterThan(0);
    expect(components.every((c) => c.import_id === importId)).toBe(true);

    const tenantPlant = tree.plants.find((p) => p.id === tenantA.plantId);
    expect(tenantPlant?.import_id ?? null).toBeNull();
  });

  it("discard-by-import_id removes exactly one batch and leaves NULL-import rows untouched", async () => {
    const preExisting = await callApi("POST", "/api/assets", {
      cookie: tenantA.cookie,
      body: {
        name: `Pre-existing asset ${run}`,
        tag_number: `PRE-${run}`
      }
    });
    expect(preExisting.statusCode).toBe(201);

    const importA = await callApi("POST", "/api/assets/bulk-import", {
      cookie: tenantA.cookie,
      body: {
        assets: [
          importRow(`${run}-D1`, {
            routeName: `Discard Route A ${run}`,
            assetName: `Discard asset A ${run}`
          })
        ]
      }
    });
    const importB = await callApi("POST", "/api/assets/bulk-import", {
      cookie: tenantA.cookie,
      body: {
        assets: [
          importRow(`${run}-D2`, {
            routeName: `Discard Route B ${run}`,
            assetName: `Discard asset B ${run}`
          })
        ]
      }
    });
    expect(importA.body.success).toBe(true);
    expect(importB.body.success).toBe(true);

    const discarded = await callApi("DELETE", `/api/imports/${importA.body.import_id}`, {
      cookie: tenantA.cookie
    });
    expect(discarded.statusCode).toBe(200);
    expect(discarded.body.success).toBe(true);
    expect(discarded.body.deleted.assets).toBe(1);
    expect(discarded.body.deleted.routes).toBe(1);

    const tree = await hierarchy(tenantA);
    const names = tree.assets.map((a) => a.name);
    expect(names).not.toContain(`Discard asset A ${run}`);
    expect(names).toContain(`Discard asset B ${run}`);
    expect(names).toContain(`Pre-existing asset ${run}`);
    expect(tree.routes.map((r) => r.name)).not.toContain(`Discard Route A ${run}`);
    expect(tree.routes.map((r) => r.name)).toContain(`Discard Route B ${run}`);

    const preExistingRow = tree.assets.find((a) => a.tag_number === `PRE-${run}`);
    expect(preExistingRow?.import_id ?? null).toBeNull();
    expect(tree.assets.filter((a) => (a.import_id ?? null) === null).map((a) => a.name))
      .toContain(`Pre-existing asset ${run}`);
  });

  it("cross-tenant discard is a 404 no-op and leaves the owner's batch intact", async () => {
    const created = await callApi("POST", "/api/assets/bulk-import", {
      cookie: tenantA.cookie,
      body: {
        assets: [
          importRow(`${run}-X1`, {
            routeName: `Cross Tenant Route ${run}`,
            assetName: `Cross tenant asset ${run}`
          })
        ]
      }
    });
    expect(created.body.success).toBe(true);
    const importId = created.body.import_id;

    const attempt = await callApi("DELETE", `/api/imports/${importId}`, {
      cookie: tenantB.cookie
    });
    expect(attempt.statusCode).toBe(404);
    expect(attempt.body.success).toBeUndefined();

    const ownerTree = await hierarchy(tenantA);
    expect(ownerTree.assets.map((a) => a.name)).toContain(`Cross tenant asset ${run}`);

    const otherTree = await hierarchy(tenantB);
    expect(otherTree.assets.map((a) => a.name)).not.toContain(`Cross tenant asset ${run}`);
  });
});

describe("SLICE-B - tag-keyed idempotent upsert", () => {
  async function bulkImport(tenant: Tenant, rows: Record<string, unknown>[]) {
    return callApi("POST", "/api/assets/bulk-import", {
      cookie: tenant.cookie,
      body: { assets: rows }
    });
  }

  it("re-uploading the SAME tagged payload updates in place and leaves row count unchanged", async () => {
    const routeName = `Upsert Route ${run}`;
    const tag = `UPS-${run}`;
    const name = `Upsert Asset ${run}`;

    const first = await bulkImport(tenantA, [
      importRow(`${run}-UPS`, { routeName, assetTag: tag, assetName: name })
    ]);
    expect(first.body.success).toBe(true);

    const before = await hierarchy(tenantA);
    const beforeRows = before.assets.filter((a) => a.tag_number === tag);
    expect(beforeRows).toHaveLength(1);
    const assetId = beforeRows[0].id;

    const second = await bulkImport(tenantA, [
      importRow(`${run}-UPS`, {
        routeName,
        assetTag: tag,
        assetName: `${name} v2`,
        assetType: "Motor"
      })
    ]);
    expect(second.body.success).toBe(true);

    const after = await hierarchy(tenantA);
    const afterRows = after.assets.filter((a) => a.tag_number === tag);
    expect(afterRows).toHaveLength(1);
    expect(afterRows[0].id).toBe(assetId);
    expect(afterRows[0].name).toBe(`${name} v2`);
    expect(afterRows[0].type).toBe("Motor");
    expect(after.assets).toHaveLength(before.assets.length);
  });

  it("re-uploading with a CORRECTED tag updates the old row in place with no orphan", async () => {
    const routeName = `Corrected Route ${run}`;
    const name = `Corrected Asset ${run}`;
    const oldTag = `COR-${run}-OLD`;
    const newTag = `COR-${run}-NEW`;

    const first = await bulkImport(tenantA, [
      importRow(`${run}-COR`, { routeName, assetTag: oldTag, assetName: name })
    ]);
    expect(first.body.success).toBe(true);

    const before = await hierarchy(tenantA);
    const original = before.assets.find((a) => a.tag_number === oldTag);
    expect(original).toBeTruthy();

    const second = await bulkImport(tenantA, [
      importRow(`${run}-COR`, { routeName, assetTag: newTag, assetName: name })
    ]);
    expect(second.body.success).toBe(true);

    const after = await hierarchy(tenantA);
    expect(after.assets.filter((a) => a.tag_number === oldTag)).toHaveLength(0);
    const healed = after.assets.filter((a) => a.tag_number === newTag);
    expect(healed).toHaveLength(1);
    expect(healed[0].id).toBe(original.id);
    expect(healed[0].name).toBe(name);
    expect(after.assets).toHaveLength(before.assets.length);
  });

  it("untagged rows insert without colliding twice (NULL-exempt key)", async () => {
    const routeName = `Untagged Route ${run}`;
    const name = `Untagged Asset ${run}`;
    const before = await hierarchy(tenantA);

    const payload = [importRow(`${run}-NULL`, { routeName, assetTag: null, assetName: name })];
    const first = await bulkImport(tenantA, payload);
    const second = await bulkImport(tenantA, payload);
    expect(first.body.success).toBe(true);
    expect(second.body.success).toBe(true);

    const after = await hierarchy(tenantA);
    const rows = after.assets.filter((a) => a.name === name && a.tag_number == null);
    expect(rows).toHaveLength(2);
    expect(after.assets).toHaveLength(before.assets.length + 2);
  });

  it("a duplicate non-NULL tag in one payload is handled by the conflict clause", async () => {
    const routeName = `Duplicate Route ${run}`;
    const tag = `DUP-${run}`;
    const before = await hierarchy(tenantA);

    const res = await bulkImport(tenantA, [
      importRow(`${run}-DUP-A`, { routeName, assetTag: tag, assetName: `Dup first ${run}` }),
      importRow(`${run}-DUP-B`, { routeName, assetTag: tag, assetName: `Dup second ${run}` })
    ]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const after = await hierarchy(tenantA);
    const rows = after.assets.filter((a) => a.tag_number === tag);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe(`Dup second ${run}`);
    expect(after.assets).toHaveLength(before.assets.length + 1);
  });

  it("cross-tenant rows with the same tag do NOT conflict", async () => {
    const tag = `XT-${run}`;
    const routeA = `Cross Tenant A ${run}`;
    const routeB = `Cross Tenant B ${run}`;

    const a = await bulkImport(tenantA, [
      importRow(`${run}-XTA`, { routeName: routeA, assetTag: tag, assetName: `Tenant A ${run}` })
    ]);
    const b = await bulkImport(tenantB, [
      importRow(`${run}-XTB`, { routeName: routeB, assetTag: tag, assetName: `Tenant B ${run}` })
    ]);
    expect(a.body.success).toBe(true);
    expect(b.body.success).toBe(true);

    const treeA = await hierarchy(tenantA);
    const treeB = await hierarchy(tenantB);
    const rowA = treeA.assets.filter((x) => x.tag_number === tag);
    const rowB = treeB.assets.filter((x) => x.tag_number === tag);
    expect(rowA).toHaveLength(1);
    expect(rowB).toHaveLength(1);
    expect(rowA[0].name).toBe(`Tenant A ${run}`);
    expect(rowB[0].name).toBe(`Tenant B ${run}`);
  });

  it("mid-batch failure still rolls back an upserted existing row (A's atomicity preserved)", async () => {
    const routeName = `Rollback Upsert Route ${run}`;
    const tag = `RB-${run}`;
    const name = `Rollback Asset ${run}`;

    const first = await bulkImport(tenantA, [
      importRow(`${run}-RB`, { routeName, assetTag: tag, assetName: name })
    ]);
    expect(first.body.success).toBe(true);
    const originalImportId = first.body.import_id;

    const before = await hierarchy(tenantA);
    const original = before.assets.find((a) => a.tag_number === tag);
    expect(original?.name).toBe(name);

    const failed = await bulkImport(tenantA, [
      importRow(`${run}-RB`, { routeName, assetTag: tag, assetName: `Mutated ${run}` }),
      importRow(`${run}-RBBAD`, { routeName, assetType: "" })
    ]);
    expect(failed.statusCode).toBe(400);
    expect(failed.body.success).toBe(false);
    expect(failed.body.failingRow.index).toBe(2);

    const after = await hierarchy(tenantA);
    const rows = after.assets.filter((a) => a.tag_number === tag);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(original?.id);
    expect(rows[0].name).toBe(name);
    expect(rows[0].import_id).toBe(originalImportId);
    expect(after.assets).toHaveLength(before.assets.length);
  });

  it("discard-by-import_id removes exactly the re-uploaded batch", async () => {
    const routeName = `Discard Upsert Route ${run}`;
    const tag = `DU-${run}`;
    const name = `Discard Upsert Asset ${run}`;

    const first = await bulkImport(tenantA, [
      importRow(`${run}-DU`, { routeName, assetTag: tag, assetName: name })
    ]);
    const second = await bulkImport(tenantA, [
      importRow(`${run}-DU`, { routeName, assetTag: tag, assetName: `${name} v2` })
    ]);
    expect(first.body.success).toBe(true);
    expect(second.body.success).toBe(true);

    const discarded = await callApi("DELETE", `/api/imports/${second.body.import_id}`, {
      cookie: tenantA.cookie
    });
    expect(discarded.statusCode).toBe(200);
    expect(discarded.body.deleted.assets).toBe(1);

    const tree = await hierarchy(tenantA);
    expect(tree.assets.filter((a) => a.tag_number === tag)).toHaveLength(0);
  });
});

describe("SLICE-B - source contracts", () => {
  const serverSource = readFileSync(
    fileURLToPath(new URL("../../server.ts", import.meta.url)),
    "utf8"
  );
  const migrationSource = readFileSync(
    fileURLToPath(new URL("../../migrations/029_import_tag_unique.sql", import.meta.url)),
    "utf8"
  );

  it("migration 029 uses a plain unique key because no soft-delete column exists", () => {
    expect(migrationSource).toContain("ADD CONSTRAINT assets_company_tag_number_key");
    expect(migrationSource).toContain("UNIQUE (company_id, tag_number)");
    expect(migrationSource).toContain("NULL values as distinct");
    expect(migrationSource).not.toContain("CREATE UNIQUE INDEX");
    expect(migrationSource).not.toContain("WHERE tag_number IS NOT NULL;");
    expect(migrationSource).not.toContain("deleted_at IS NULL");
    expect(serverSource).toContain("// migrations/029 - SLICE-B");
    expect(serverSource).toContain("ADD CONSTRAINT assets_company_tag_number_key");
  });

  it("bulk-import upsert keys on tenant+tag with DO UPDATE and stamps the batch id", () => {
    const start = serverSource.indexOf('app.post(["/api/assets/bulk-import"');
    const end = serverSource.indexOf("// DELETE /api/imports/:id", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = serverSource.slice(start, end);
    expect(body).toContain("ON CONFLICT (company_id, tag_number) DO UPDATE");
    expect(body).toContain("import_id = EXCLUDED.import_id");
    expect(body).toContain("const assetTagTrimmed");
    expect(body).toContain("if (assetTagTrimmed)");
  });
});

describe("SLICE-A - source contracts and caller audit", () => {
  const serverSource = readFileSync(
    fileURLToPath(new URL("../../server.ts", import.meta.url)),
    "utf8"
  );
  const migrationSource = readFileSync(
    fileURLToPath(new URL("../../migrations/028_imports.sql", import.meta.url)),
    "utf8"
  );

  it("the 14603 path writes through ONE pinned client transaction", () => {
    const start = serverSource.indexOf('app.post(["/api/assets/bulk-import"');
    const end = serverSource.indexOf('// DELETE /api/imports/:id', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = serverSource.slice(start, end);
    expect(body).toContain("const client = await pool.connect();");
    expect(body).toContain('await client.query("BEGIN");');
    expect(body).toContain('await client.query("COMMIT");');
    expect(body).toContain('await client.query("ROLLBACK");');
    expect(body).toContain("client.release();");
    expect(body).not.toContain("pool.query(");
    expect(body).not.toContain("continue;");
  });

  it("migration 028 is mirrored idempotently in initializeDatabase and scopes by session tenant", () => {
    expect(migrationSource).toContain("CREATE TABLE IF NOT EXISTS imports");
    expect(migrationSource).toContain("tenant_id INTEGER NOT NULL REFERENCES companies(id)");
    for (const table of [
      "plants",
      "routes",
      "assets",
      "components",
      "collection_points",
      "measurement_points"
    ]) {
      expect(migrationSource).toContain(`ALTER TABLE ${table}`);
      expect(migrationSource).toContain(`ADD COLUMN IF NOT EXISTS import_id`);
    }

    const initStart = serverSource.indexOf("// migrations/028 - SLICE-A");
    const initEnd = serverSource.indexOf("// Backfill derivable tenants", initStart);
    expect(initStart).toBeGreaterThan(-1);
    expect(initEnd).toBeGreaterThan(initStart);
    const initBody = serverSource.slice(initStart, initEnd);
    expect(initBody).toContain("CREATE TABLE IF NOT EXISTS imports");
    expect(initBody).toContain("ADD COLUMN IF NOT EXISTS import_id");
    expect(initBody).toContain("for (const table of [");

    const start = serverSource.indexOf('app.post(["/api/assets/bulk-import"');
    const end = serverSource.indexOf("// POST create asset/equipment", start);
    const batchAndDiscard = serverSource.slice(start, end);
    expect(batchAndDiscard).not.toContain("req.query");
    expect(batchAndDiscard).toContain("requestTenantId(req)");
    expect(batchAndDiscard).toContain("WHERE id = $1 AND tenant_id = $2");
  });

  it("STEP 0: AIDataMigration is a simulation and the screenshot builder is a SEPARATE flow", () => {
    const migrationUi = readFileSync(
      fileURLToPath(new URL("../components/AIDataMigration.tsx", import.meta.url)),
      "utf8"
    );
    const cmmsUi = readFileSync(
      fileURLToPath(
        new URL("../components/diagnostics/CmmsPayloadBridge.tsx", import.meta.url)
      ),
      "utf8"
    );

    expect(migrationUi).not.toContain("/api/assets/bulk-import");
    expect(migrationUi).not.toContain("/api/bulk-import");
    expect(migrationUi).toContain("setInterval");
    expect(cmmsUi).toContain("/api/cmms/parse-screenshot");
    expect(cmmsUi).not.toContain("/api/assets/bulk-import");
  });
});
