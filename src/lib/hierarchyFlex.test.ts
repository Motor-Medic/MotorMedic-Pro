import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SYSTEM_ROUTE_NAME,
  findOrCreateSimpleModeRoute,
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
