import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SIMPLE_MODE_PLANT_NAME,
  SYSTEM_ROUTE_NAME,
  findOrCreateSimpleModeRoute,
  findOrCreateTenantPlant,
  resolveSimpleModeHierarchy,
  type Queryable
} from "./hierarchyFlex";
import {
  flattenEquipment,
  routeDisplayName,
  type EquipRoute,
  SITE_PLANT_ID
} from "../data/equipmentDb";
import { buildExplorerTree } from "../components/EquipmentExplorer";

const serverSource = readFileSync(
  fileURLToPath(new URL("../../server.ts", import.meta.url)),
  "utf8"
);
const migrationSource = readFileSync(
  fileURLToPath(new URL("../../migrations/017_hierarchy_flex.sql", import.meta.url)),
  "utf8"
);
const explorerSource = readFileSync(
  fileURLToPath(new URL("../components/EquipmentExplorer.tsx", import.meta.url)),
  "utf8"
);

function fakeSimpleModeDb(): Queryable & { calls: string[] } {
  const state = {
    calls: [] as string[],
    query: async (text: string, params?: unknown[]) => {
      state.calls.push(text.trim().split(/\s+/)[0].toUpperCase());
      const sql = text.replace(/\s+/g, " ").trim();
      if (sql.startsWith("SELECT * FROM plants WHERE company_id")) return { rows: [] };
      if (sql.startsWith("INSERT INTO plants")) {
        return {
          rows: [
            {
              id: 42,
              name: params?.[0],
              company_id: params?.[1],
              location: params?.[0]
            }
          ]
        };
      }
      if (sql.startsWith("SELECT * FROM routes WHERE plant_id")) return { rows: [] };
      if (sql.startsWith("INSERT INTO routes")) {
        return {
          rows: [
            {
              id: 7,
              plant_id: params?.[0],
              name: params?.[1],
              is_system: true
            }
          ]
        };
      }
      return { rows: [] };
    }
  };
  return state;
}

describe("H1 simple mode - server auto plant + system route", () => {
  it("creates exactly the D5 system route name with is_system on a new plant", async () => {
    const db = fakeSimpleModeDb();
    const resolved = await resolveSimpleModeHierarchy(db, 5);
    expect(resolved.plant.name).toBe("Main Site");
    expect(resolved.plant.company_id).toBe(5);
    expect(resolved.route.name).toBe(SYSTEM_ROUTE_NAME);
    expect(SYSTEM_ROUTE_NAME).toBe("System (Simple Mode)");
    expect(resolved.route.is_system).toBe(true);
  });

  it("reuses an existing system route instead of creating a second one", async () => {
    const db: Queryable = {
      query: async (text: string) => {
        const sql = text.replace(/\s+/g, " ").trim();
        if (sql.startsWith("SELECT * FROM routes")) {
          return { rows: [{ id: 9, plant_id: 3, name: SYSTEM_ROUTE_NAME, is_system: true }] };
        }
        return { rows: [] };
      }
    };
    const route = await findOrCreateSimpleModeRoute(db, 3);
    expect(route.id).toBe(9);
  });

  it("POST /api/assets no longer treats a missing route_id as a 400", () => {
    const start = serverSource.indexOf('app.post(["/api/assets", "/api/equipment"]');
    const body = serverSource.slice(start, start + 5000);
    expect(body).not.toContain(
      '"Missing or invalid required field: route_id (integer)"'
    );
    expect(body).toContain("resolveSimpleModeHierarchy(pool, companyId)");
    expect(body).toContain("simpleMode");
  });
});

describe("MICRO-FIX empty-tenant first run never dead-ends", () => {
  function fakeTenantDb() {
    const state = {
      plants: [] as Record<string, unknown>[],
      routes: [] as Record<string, unknown>[],
      units: [] as Record<string, unknown>[],
      assets: [] as Record<string, unknown>[],
      plantInserts: 0,
      routeInserts: 0,
      nextId: 100
    };
    const db = {
      state,
      query: async (
        text: string,
        params?: unknown[]
      ): Promise<{ rows: Record<string, unknown>[] }> => {
        const sql = text.replace(/\s+/g, " ").trim();
        if (sql.startsWith("SELECT * FROM plants WHERE company_id = $1")) {
          return { rows: state.plants.filter((p) => p.company_id === params?.[0]) };
        }
        if (sql.startsWith("SELECT * FROM plants WHERE id = $1")) {
          return { rows: state.plants.filter((p) => p.id === params?.[0]) };
        }
        if (sql.startsWith("SELECT * FROM plants ORDER BY id ASC LIMIT 1")) {
          return { rows: state.plants.slice(0, 1) };
        }
        if (sql.startsWith("INSERT INTO plants")) {
          state.plantInserts += 1;
          const row = {
            id: ++state.nextId,
            name: params?.[0],
            location: params?.[0],
            company_id: params?.[1] ?? null
          };
          state.plants.push(row);
          return { rows: [row] };
        }
        if (sql.startsWith("SELECT * FROM routes WHERE plant_id = $1 AND is_system = TRUE")) {
          return {
            rows: state.routes.filter(
              (r) => r.plant_id === params?.[0] && r.is_system === true
            )
          };
        }
        if (sql.startsWith("INSERT INTO routes")) {
          state.routeInserts += 1;
          const row = {
            id: ++state.nextId,
            plant_id: params?.[0],
            name: params?.[1],
            description: params?.[2],
            is_system: true
          };
          state.routes.push(row);
          return { rows: [row] };
        }
        if (sql.startsWith("INSERT INTO units")) {
          const row = { id: ++state.nextId, plant_id: params?.[0], name: params?.[1] };
          state.units.push(row);
          return { rows: [row] };
        }
        if (sql.startsWith("INSERT INTO assets")) {
          const row = { id: ++state.nextId, route_id: params?.[0], name: params?.[1] };
          state.assets.push(row);
          return { rows: [row] };
        }
        if (sql.startsWith("SELECT * FROM units")) return { rows: state.units };
        if (sql.startsWith("SELECT * FROM routes")) return { rows: state.routes };
        if (sql.startsWith("SELECT * FROM assets")) return { rows: state.assets };
        return { rows: [] };
      }
    };
    return db;
  }

  it("GET /api/hierarchy on an empty tenant yields exactly one 'Main Site' plant", async () => {
    const db = fakeTenantDb();
    const plant = await findOrCreateTenantPlant(db, 5);
    expect(plant.name).toBe(SIMPLE_MODE_PLANT_NAME);
    expect(plant.name).toBe("Main Site");
    const reloaded = await db.query("SELECT * FROM plants WHERE id = $1", [plant.id]);
    expect(reloaded.rows).toHaveLength(1);
    expect(db.state.plants).toHaveLength(1);
  });

  it("a unit created immediately after first load succeeds with the returned plant id", async () => {
    const db = fakeTenantDb();
    const plant = await findOrCreateTenantPlant(db, 7);
    const created = await db.query(
      "INSERT INTO units (plant_id, name) VALUES ($1, $2) RETURNING *",
      [plant.id, "Compressor House"]
    );
    expect(created.rows[0].plant_id).toBe(plant.id);
    expect(db.state.units).toHaveLength(1);
  });

  it("a route-less asset under the root lands under the is_system route", async () => {
    const db = fakeTenantDb();
    const plant = await findOrCreateTenantPlant(db, 8);
    const { route } = await resolveSimpleModeHierarchy(db, 8);
    expect(route.plant_id).toBe(plant.id);
    expect(route.is_system).toBe(true);
    const asset = await db.query(
      "INSERT INTO assets (route_id, name) VALUES ($1, $2) RETURNING *",
      [route.id, "P-101"]
    );
    expect(asset.rows[0].route_id).toBe(route.id);
    expect(
      db.state.routes.filter((r) => r.plant_id === plant.id && r.is_system === true)
    ).toHaveLength(1);
  });

  it("repeated hierarchy calls create no duplicate plants or system routes", async () => {
    const db = fakeTenantDb();
    for (let i = 0; i < 3; i += 1) {
      await resolveSimpleModeHierarchy(db, 9);
    }
    expect(db.state.plants).toHaveLength(1);
    expect(db.state.plantInserts).toBe(1);
    expect(db.state.routes.filter((r) => r.is_system === true)).toHaveLength(1);
  });

  it("the hierarchy read resolves the plant before building its payload", () => {
    const start = serverSource.indexOf('app.get("/api/hierarchy"');
    const body = serverSource.slice(start, start + 4000);
    expect(body).toContain("findOrCreateTenantPlant(pool, tenantId)");
    expect(body).toContain("SELECT * FROM plants WHERE id = $1");
    expect(body.indexOf("findOrCreateTenantPlant")).toBeLessThan(
      body.indexOf("const plantIds")
    );
  });

  it("POST /api/assets treats simpleMode as route-less with or without route_id", () => {
    const start = serverSource.indexOf('app.post(["/api/assets", "/api/equipment"]');
    const body = serverSource.slice(start, start + 6000);
    expect(body).toContain("if (hasRoute && !simpleMode)");
    expect(body).toContain("if (!simpleMode && !(await tenantOwnsRow(pool, \"routes\", rId, tenantId)))");
    expect(body).toContain("resolveSimpleModeHierarchy(pool, companyId)");
  });

  it("Explorer re-fetches once when hydration leaves the root without a server id", () => {
    expect(explorerSource).toContain("const resolveServerPlantId");
    expect(explorerSource).toContain(
      "return refreshed.plants.find((p) => p.id === SITE_PLANT_ID)?.serverId ?? null;"
    );
    expect(explorerSource).not.toContain(
      "Plant is not saved on the server yet. Refresh and try again."
    );
  });
});

describe("H2 flat assets are not silently dropped", () => {
  it("dashboard/scorecard/tenant-backfill reads use LEFT JOIN routes", () => {
    const leftRouteJoins = serverSource.match(/LEFT JOIN routes rt ON ast\.route_id = rt\.id/g);
    expect(leftRouteJoins?.length ?? 0).toBeGreaterThanOrEqual(8);
    expect(serverSource).toContain("LEFT JOIN routes r ON r.id = a.route_id");
  });

  it("a system-route asset flattens with a diagnosable route label", () => {
    const systemRoute: EquipRoute = {
      id: "7",
      name: SYSTEM_ROUTE_NAME,
      location: "Plant",
      plantId: SITE_PLANT_ID,
      isSystem: true,
      assets: [
        {
          id: "11",
          tag: "P-101",
          name: "Pump P-101",
          location: "Plant",
          components: [{ id: "21", name: "Motor DE" }]
        }
      ]
    };
    expect(routeDisplayName(systemRoute)).toBe("Facility (direct)");
    const flat = flattenEquipment([systemRoute]);
    expect(flat).toHaveLength(1);
    expect(flat[0].routeName).toBe("Facility (direct)");
  });
});

describe("H3 parent validation returns 400 instead of surfacing FK 500s", () => {
  it("validates parents on the six POST endpoints", () => {
    for (const phrase of [
      "Parent company not found",
      "Parent plant not found",
      "Parent unit not found",
      "Parent route not found",
      "Parent asset not found",
      "Parent component not found",
      "Parent collection point not found"
    ]) {
      expect(serverSource).toContain(phrase);
    }
  });
});

describe("H4 migration and initializeDatabase mirror", () => {
  it("migrations/017 adds is_system and is idempotent", () => {
    expect(migrationSource).toContain(
      "ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE"
    );
    expect(migrationSource).toContain("duplicate_column OR duplicate_object");
    expect(migrationSource).toContain(SYSTEM_ROUTE_NAME);
  });

  it("initializeDatabase mirrors the column + backfill", () => {
    const initIdx = serverSource.indexOf("async function initializeDatabase");
    const initBody = serverSource.slice(initIdx, initIdx + 30000);
    expect(initBody).toContain(
      "ALTER TABLE routes ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;"
    );
    expect(initBody).toContain(SYSTEM_ROUTE_NAME);
    expect(initBody).toContain("UPDATE assets SET route_id = system_route_id WHERE route_id IS NULL");
  });
});

describe("H6/H7 Explorer tree + Diagnose route option", () => {
  const store = {
    plants: [
      {
        id: SITE_PLANT_ID,
        name: "Main Site",
        location: "Main Site",
        facilityType: "Power Plant" as const
      }
    ],
    units: [],
    routes: [
      {
        id: "real-1",
        name: "Boiler Feed",
        location: "Main Site",
        assets: [
          {
            id: "asset-real",
            tag: "P-101",
            name: "Boiler Feed Pump",
            location: "Main Site",
            components: []
          }
        ]
      },
      {
        id: "sys-1",
        name: SYSTEM_ROUTE_NAME,
        location: "Main Site",
        isSystem: true,
        assets: [
          {
            id: "asset-flat",
            tag: "FAN-1",
            name: "Flat Fan",
            location: "Main Site",
            components: [{ id: "comp-flat", name: "Motor DE" }]
          }
        ]
      }
    ]
  };

  it("hides is_system routes but keeps real routes and flat assets", () => {
    const tree = buildExplorerTree(store, "ignored prop name");
    expect(tree[0].label).toBe("Main Site");
    const labels = tree[0].children.map((n) => n.label);
    expect(labels).toContain("Boiler Feed");
    expect(labels).not.toContain(SYSTEM_ROUTE_NAME);
    expect(labels.some((l) => l.startsWith("FAN-1"))).toBe(true);
    const realRoute = tree[0].children.find((n) => n.label === "Boiler Feed");
    expect(realRoute?.children.some((n) => n.label.startsWith("P-101"))).toBe(true);
  });

  it("Diagnose equipmentReady inputs resolve for Facility (direct)", () => {
    const flat = flattenEquipment(store.routes);
    const routeOptions = Array.from(new Set(flat.map((a) => a.routeName)));
    expect(routeOptions).toContain("Facility (direct)");
    const selectedRoute = "Facility (direct)";
    const asset = flat.find((a) => a.routeName === selectedRoute);
    expect(asset).toBeDefined();
    const tag = asset?.tag ?? "";
    const component = asset?.components[0]?.name ?? "";
    const selectedAsset = flat.find(
      (a) => a.tag === tag && a.routeName === selectedRoute
    );
    expect(Boolean(selectedRoute && tag && component && selectedAsset)).toBe(true);
  });
});
