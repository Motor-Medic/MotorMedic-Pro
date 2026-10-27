/**
 * Module entitlements (E2/E5).
 *
 * The owner model is module-based only: a tenant holds an active row per
 * purchased catalog key. There are no seat/capacity/usage counters here, and
 * there never should be. Reads are keyed ONLY by the session's company id;
 * this module never accepts a client-supplied company_id.
 */
import type { NextFunction, Request, Response } from "express";
import { query as defaultQuery } from "./db";

export type ModuleKey = "vibration" | "thermography" | "ultrasound" | "oil";

export type EntitlementStatus = "active" | "expired" | "canceled";

export interface CatalogModule {
  key: ModuleKey;
  name: string;
  description: string;
  price_cents: number;
  currency: "usd";
  square_variation_env: string;
  square_variation_id?: string;
  configured: boolean;
}

export interface ModuleCatalogEntry extends CatalogModule {
  square_variation_id: string | null;
}

export interface EntitlementRow {
  id?: number;
  company_id: number;
  module_key: string;
  status: EntitlementStatus;
  square_subscription_id: string | null;
  created_at?: string | Date;
  updated_at?: string | Date;
}

export interface Queryable {
  query(
    text: string,
    params?: unknown[]
  ): Promise<{ rows: Record<string, unknown>[] }>;
}

const STATIC_CATALOG: readonly Omit<
  CatalogModule,
  "square_variation_id" | "configured"
>[] = [
  {
    key: "vibration",
    name: "Vibration Analysis",
    description:
      "ISO 10816/20816 rotating-equipment diagnostics, spectra and trend analysis.",
    price_cents: 39900,
    currency: "usd",
    square_variation_env: "SQUARE_PRICE_VIBRATION"
  },
  {
    key: "thermography",
    name: "Thermography (Infrared)",
    description:
      "NFPA 70B thermal anomaly detection for electrical and mechanical assets.",
    price_cents: 19900,
    currency: "usd",
    square_variation_env: "SQUARE_PRICE_THERMOGRAPHY"
  },
  {
    key: "ultrasound",
    name: "Ultrasound",
    description:
      "Airborne/contact ultrasound leak, steam-trap and bearing condition detection.",
    price_cents: 14900,
    currency: "usd",
    square_variation_env: "SQUARE_PRICE_ULTRASOUND"
  },
  {
    key: "oil",
    name: "Oil Analysis",
    description:
      "Tribology, contamination, wear-metal and ferrography interpretation.",
    price_cents: 14900,
    currency: "usd",
    square_variation_env: "SQUARE_PRICE_OIL"
  }
];

export const MODULE_CATALOG: readonly Omit<
  CatalogModule,
  "square_variation_id" | "configured"
>[] = STATIC_CATALOG;

export const MODULE_KEYS: readonly ModuleKey[] = MODULE_CATALOG.map(
  (entry) => entry.key
);

export function isModuleKey(value: unknown): value is ModuleKey {
  return typeof value === "string" && (MODULE_KEYS as readonly string[]).includes(value);
}

/**
 * Validate and de-duplicate a client's selected catalog keys. Unknown keys
 * are rejected rather than silently dropped so a typo can never create a
 * half-provisioned tenant.
 */
export function normalizeModuleKeys(raw: unknown): ModuleKey[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const seen = new Set<ModuleKey>();
  for (const value of raw) {
    if (!isModuleKey(value)) return null;
    seen.add(value);
  }
  return [...seen];
}

/** Catalog for GET /api/catalog. Prices are display values (Square variation is source of truth). */
export function getModuleCatalog(
  env: NodeJS.ProcessEnv = process.env
): ModuleCatalogEntry[] {
  return MODULE_CATALOG.map((entry) => {
    const raw = env[entry.square_variation_env];
    const priceId =
      typeof raw === "string" && raw.trim() && !/^YOUR_/i.test(raw.trim())
        ? raw.trim()
        : null;
    return {
      ...entry,
      square_variation_id: priceId,
      configured: Boolean(priceId)
    };
  });
}

const defaultDb: Queryable = {
  query: async (text, params) => {
    const result = await defaultQuery(text, params);
    return { rows: result.rows };
  }
};

function resolveDb(db?: Queryable): Queryable {
  return db ?? defaultDb;
}

function toEntitlement(row: Record<string, unknown>): EntitlementRow {
  const rawStatus = String(row.status ?? "active");
  const status: EntitlementStatus =
    rawStatus === "expired" || rawStatus === "canceled" ? rawStatus : "active";
  return {
    id: row.id == null ? undefined : Number(row.id),
    company_id: Number(row.company_id),
    module_key: String(row.module_key),
    status,
    square_subscription_id:
      row.square_subscription_id == null ? null : String(row.square_subscription_id),
    created_at: row.created_at as string | Date | undefined,
    updated_at: row.updated_at as string | Date | undefined
  };
}

/** Active entitlements for one company. The company id is always supplied by the caller's session. */
export async function getEntitlements(
  companyId: number | null,
  db?: Queryable
): Promise<EntitlementRow[]> {
  if (companyId == null || !Number.isFinite(companyId) || companyId <= 0) return [];
  const result = await resolveDb(db).query(
    `SELECT id, company_id, module_key, status, square_subscription_id, created_at, updated_at
       FROM tenant_entitlements
      WHERE company_id = $1 AND status = 'active'
      ORDER BY module_key ASC`,
    [companyId]
  );
  return result.rows.map(toEntitlement);
}

export async function getActiveModuleKeys(
  companyId: number | null,
  db?: Queryable
): Promise<string[]> {
  const rows = await getEntitlements(companyId, db);
  return rows.map((row) => row.module_key);
}

/** True only when THIS company owns an ACTIVE row for the module. */
export async function isModuleActive(
  companyId: number | null,
  moduleKey: string,
  db?: Queryable
): Promise<boolean> {
  if (companyId == null || !Number.isFinite(companyId) || companyId <= 0) return false;
  if (!isModuleKey(moduleKey)) return false;
  const result = await resolveDb(db).query(
    `SELECT 1
       FROM tenant_entitlements
      WHERE company_id = $1 AND module_key = $2 AND status = 'active'
      LIMIT 1`,
    [companyId, moduleKey]
  );
  return result.rows.length > 0;
}

/**
 * Host app injection so the middleware can consult the same memory/DB store
 * the rest of the server uses without importing server.ts (circular).
 */
export type ModuleAccessResolver = (
  companyId: number,
  moduleKey: ModuleKey
) => Promise<boolean>;

let moduleAccessResolver: ModuleAccessResolver | null = null;

export function registerModuleAccessResolver(
  resolver: ModuleAccessResolver | null
): void {
  moduleAccessResolver = resolver;
}

export function tenantIdFromRequest(req: Request): number | null {
  const authTenant = req.auth?.tenantId;
  const raw = authTenant ?? req.tenantId ?? null;
  if (raw == null || String(raw).trim() === "") return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

/**
 * requireModule(key) — server-side enforcement for protected module APIs.
 *
 * The tenant is read ONLY from the verified session (req.auth / req.tenantId),
 * never from req.query / req.body. Missing entitlement is a 403, and the
 * matching nav entry is absent (hiding is not security; this is).
 */
export function requireModule(moduleKey: ModuleKey) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const companyId = tenantIdFromRequest(req);
    if (companyId == null) {
      return res
        .status(401)
        .json({ error: "Authentication required", code: "NO_SESSION" });
    }

    let active = false;
    try {
      active = moduleAccessResolver
        ? await moduleAccessResolver(companyId, moduleKey)
        : await isModuleActive(companyId, moduleKey);
    } catch (err) {
      console.error("[entitlements] module check failed:", err);
      return res
        .status(503)
        .json({ error: "Entitlement check unavailable", code: "ENTITLEMENT_ERROR" });
    }

    if (!active) {
      return res.status(403).json({
        error: "This module is not enabled for your account.",
        code: "MODULE_NOT_ENTITLED",
        module: moduleKey
      });
    }
    return next();
  };
}
