/**
 * H1/H7 hierarchy flexibility helpers.
 *
 * Assets may be added without a route ("simple mode"). The server then
 * find-or-creates the tenant's plant and a single invisible system route
 * named "System (Simple Mode)" so those assets still participate in every
 * dashboard / scorecard query instead of vanishing behind an INNER JOIN.
 *
 * The helpers take a narrow Queryable so they can be exercised without a
 * live PostgreSQL instance.
 */

export interface Queryable {
  query(
    text: string,
    params?: unknown[]
  ): Promise<{ rows: Record<string, unknown>[] }>;
}

export const SYSTEM_ROUTE_NAME = "System (Simple Mode)";
export const SIMPLE_MODE_PLANT_NAME = "Main Site";

/** Client-facing label for the system route (D4/D5, H7). */
export const SYSTEM_ROUTE_DISPLAY_NAME = "Facility (direct)";

export interface SimpleModePlant {
  id: number;
  name: string;
  company_id: number | null;
}

export interface SimpleModeRoute {
  id: number;
  plant_id: number;
  name: string;
  is_system: boolean;
}

function toRoute(row: Record<string, unknown>): SimpleModeRoute {
  return {
    id: Number(row.id),
    plant_id: Number(row.plant_id),
    name: String(row.name),
    is_system: row.is_system === true
  };
}

function toPlant(row: Record<string, unknown>): SimpleModePlant {
  return {
    id: Number(row.id),
    name: String(row.name),
    company_id: row.company_id == null ? null : Number(row.company_id)
  };
}

/**
 * D5 — exactly one system route per plant. Re-running this is a no-op once
 * the route exists; the explicit is_system lookup is the idempotency guard.
 */
export async function findOrCreateSimpleModeRoute(
  db: Queryable,
  plantId: number
): Promise<SimpleModeRoute> {
  const existing = await db.query(
    "SELECT * FROM routes WHERE plant_id = $1 AND is_system = TRUE ORDER BY id ASC LIMIT 1",
    [plantId]
  );
  if (existing.rows.length > 0) {
    return toRoute(existing.rows[0]);
  }
  const inserted = await db.query(
    `INSERT INTO routes (plant_id, name, description, is_system)
     VALUES ($1, $2, $3, TRUE)
     RETURNING *`,
    [
      plantId,
      SYSTEM_ROUTE_NAME,
      "Auto-created route for assets added without a route."
    ]
  );
  return toRoute(inserted.rows[0]);
}

/**
 * Find the tenant's plant or create "Main Site" when the tenant has none.
 * Shared by GET /api/hierarchy (so the Explorer root always has a real id)
 * and POST /api/assets simple mode; repeated calls are no-ops once a plant
 * exists.
 */
export async function findOrCreateTenantPlant(
  db: Queryable,
  companyId: number | null
): Promise<SimpleModePlant> {
  let plant: SimpleModePlant | undefined;
  if (companyId != null) {
    const plantRes = await db.query(
      "SELECT * FROM plants WHERE company_id = $1 ORDER BY id ASC LIMIT 1",
      [companyId]
    );
    plant = plantRes.rows[0] ? toPlant(plantRes.rows[0]) : undefined;
  } else {
    const fallback = await db.query(
      "SELECT * FROM plants ORDER BY id ASC LIMIT 1"
    );
    plant = fallback.rows[0] ? toPlant(fallback.rows[0]) : undefined;
  }
  if (plant) return plant;
  const created = await db.query(
    `INSERT INTO plants (name, location, company_id)
     VALUES ($1, $1, $2)
     RETURNING *`,
    [SIMPLE_MODE_PLANT_NAME, companyId]
  );
  return toPlant(created.rows[0]);
}

/**
 * Resolve the tenant's plant (auto-creating "Main Site" when the tenant has
 * no plant yet) and its invisible system route.
 */
export async function resolveSimpleModeHierarchy(
  db: Queryable,
  companyId: number | null
): Promise<{ plant: SimpleModePlant; route: SimpleModeRoute }> {
  const plant = await findOrCreateTenantPlant(db, companyId);
  const route = await findOrCreateSimpleModeRoute(db, Number(plant.id));
  return { plant, route };
}

/** Parent existence check used by the H3 POST validators. */
export async function parentExists(
  db: Queryable,
  table: "plants" | "routes" | "assets" | "components" | "collection_points",
  id: number
): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM ${table} WHERE id = $1 LIMIT 1`,
    [id]
  );
  return result.rows.length > 0;
}
