/**
 * E4 — provision a tenant from a PAID checkout.
 *
 * All identity comes from the server-held pending mapping (written by
 * POST /api/checkout/create) plus the verified webhook. The client's
 * company_id, if one was sent at all, is never an input here.
 *
 * The plant + lazy system route are created with the SAME tenant-scoped
 * helpers used by the audit-fixed hierarchy (findOrCreateTenantPlant /
 * resolveSimpleModeHierarchy) and the NEW company id. No global/first-company
 * path is used.
 */
import {
  resolveSimpleModeHierarchy,
  type Queryable
} from "./hierarchyFlex";
import { MODULE_KEYS, normalizeModuleKeys, type ModuleKey } from "./entitlements";

export interface PendingCheckoutRecord {
  checkout_session_id: string;
  checkout_ref: string;
  company_name: string;
  admin_username: string;
  admin_email: string | null;
  password_hash: string;
  terms_accepted: boolean;
  module_keys: string[];
  square_subscription_id: string | null;
  square_customer_id: string | null;
  company_id: number | null;
  admin_user_id: number | null;
  plant_id: number | null;
  status: string;
}

export interface ProvisionOptions {
  subscriptionId: string | null;
  customerId: string | null;
  now?: () => Date;
}

export interface ProvisionResult {
  companyId: number;
  adminUserId: number;
  plantId: number;
  routeId: number;
  moduleKeys: ModuleKey[];
  alreadyProvisioned: boolean;
}

function numericId(row: Record<string, unknown>, key = "id"): number {
  return Number(row[key]);
}

function errorCode(err: unknown): string | null {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

async function insertCompany(
  db: Queryable,
  pending: PendingCheckoutRecord
): Promise<number> {
  const desired =
    pending.company_name.trim() ||
    `Account ${pending.checkout_ref.slice(0, 8)}`;
  try {
    const inserted = await db.query(
      `INSERT INTO companies (name, subscription_plan)
       VALUES ($1, 'module_entitlements')
       RETURNING id`,
      [desired]
    );
    return numericId(inserted.rows[0]);
  } catch (err) {
    if (errorCode(err) !== "23505") throw err;
    // Company names are UNIQUE. Never reuse the row that owns the colliding
    // name (that would borrow another tenant); create a distinct tenant name.
    const uniqueName = `${desired} (${pending.checkout_ref.slice(0, 8)})`;
    const inserted = await db.query(
      `INSERT INTO companies (name, subscription_plan)
       VALUES ($1, 'module_entitlements')
       RETURNING id`,
      [uniqueName]
    );
    return numericId(inserted.rows[0]);
  }
}

async function ensureAdminUser(
  db: Queryable,
  pending: PendingCheckoutRecord,
  companyId: number,
  acceptedAt: Date | null
): Promise<number> {
  if (pending.admin_user_id != null) return pending.admin_user_id;

  const existing = await db.query(
    "SELECT id, company_id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1",
    [pending.admin_username]
  );
  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    if (Number(row.company_id) !== companyId) {
      throw new Error(
        "The selected username already belongs to another tenant; no cross-tenant user was touched."
      );
    }
    return numericId(row);
  }

  const inserted = await db.query(
    `INSERT INTO users
       (company_id, username, password_hash, role, email, is_temp_password, terms_accepted_at)
     VALUES ($1, $2, $3, 'reliability-manager', $4, FALSE, $5)
     RETURNING id`,
    [
      companyId,
      pending.admin_username,
      pending.password_hash,
      pending.admin_email,
      acceptedAt
    ]
  );
  return numericId(inserted.rows[0]);
}

/**
 * Idempotent provisioning. The pending row is stamped as each step lands, so
 * a webhook replay (or an invoice.paid that arrives after checkout.completed)
 * observes the completed ids and does not duplicate or borrow anything.
 */
export async function provisionTenantFromCheckout(
  db: Queryable,
  pending: PendingCheckoutRecord,
  options: ProvisionOptions
): Promise<ProvisionResult> {
  const modules = normalizeModuleKeys(pending.module_keys);
  if (!modules) {
    throw new Error("Pending checkout carries no valid catalog module keys.");
  }
  const acceptedAt = pending.terms_accepted
    ? (options.now ? options.now() : new Date())
    : null;
  const subscriptionId = options.subscriptionId ?? pending.square_subscription_id;

  if (pending.company_id != null && pending.admin_user_id != null) {
    const existingPlant = await db.query(
      "SELECT id FROM plants WHERE company_id = $1 ORDER BY id ASC LIMIT 1",
      [pending.company_id]
    );
    return {
      companyId: pending.company_id,
      adminUserId: pending.admin_user_id,
      plantId: existingPlant.rows[0]
        ? numericId(existingPlant.rows[0])
        : (pending.plant_id ?? 0),
      routeId: 0,
      moduleKeys: modules,
      alreadyProvisioned: true
    };
  }

  let companyId = pending.company_id;
  if (companyId == null) {
    companyId = await insertCompany(db, pending);
    await db.query(
      `UPDATE checkout_pending_provisioning
          SET company_id = $2, status = 'provisioning', updated_at = NOW()
        WHERE checkout_session_id = $1`,
      [pending.checkout_session_id, companyId]
    );
  }

  // SAME scoped helpers as the hierarchy work: this creates "Main Site" for
  // THIS new company (or finds its own existing plant) plus its is_system route.
  const hierarchy = await resolveSimpleModeHierarchy(db, companyId);
  const plantId = Number(hierarchy.plant.id);
  const routeId = Number(hierarchy.route.id);
  await db.query(
    `UPDATE checkout_pending_provisioning
        SET plant_id = $2, updated_at = NOW()
      WHERE checkout_session_id = $1`,
    [pending.checkout_session_id, plantId]
  );

  const adminUserId = await ensureAdminUser(db, pending, companyId, acceptedAt);
  await db.query(
    "UPDATE plants SET user_id = $1 WHERE id = $2 AND company_id = $3",
    [adminUserId, plantId, companyId]
  );

  for (const [index, moduleKey] of modules.entries()) {
    // The schema's square_subscription_id is UNIQUE, so exactly one row per
    // subscription carries the link; the (company_id, module_key) unique key
    // is the entitlement idempotency guard.
    const linkedSubscription = index === 0 ? subscriptionId : null;
    await db.query(
      `INSERT INTO tenant_entitlements
         (company_id, module_key, status, square_subscription_id)
       VALUES ($1, $2, 'active', $3)
       ON CONFLICT (company_id, module_key) DO UPDATE
         SET status = 'active', updated_at = NOW()`,
      [companyId, moduleKey, linkedSubscription]
    );
  }

  await db.query(
    `UPDATE checkout_pending_provisioning
        SET admin_user_id = $2,
            status = 'provisioned',
            square_subscription_id = COALESCE($3, square_subscription_id),
            square_customer_id = COALESCE($4, square_customer_id),
            updated_at = NOW()
      WHERE checkout_session_id = $1`,
    [pending.checkout_session_id, adminUserId, subscriptionId, options.customerId]
  );

  return {
    companyId,
    adminUserId,
    plantId,
    routeId,
    moduleKeys: modules,
    alreadyProvisioned: false
  };
}

export function allCatalogModuleKeys(): readonly ModuleKey[] {
  return MODULE_KEYS;
}
