/**
 * GOOD-CATCHES - pure validation and totals for defects caught BEFORE
 * functional failure.
 *
 * MONEY CONVENTION (one convention only): `avoided_cost_cents` is an integer
 * number of cents. The existing storefront catalog already prices in integer
 * minor units as `price_cents` (src/lib/entitlements.ts:20, :57, :66, :75, :84)
 * and the Square price-parity guard compares those cents directly against
 * `priceMoney.amount` (server.ts:6858-6865). This module therefore never
 * multiplies/divides money by 100 and never stores a dollar amount; every
 * aggregation is integer-cent addition.
 *
 * Tenant ownership is re-checked here even though the SQL already filters by
 * the session tenant, so a future read-helper regression cannot leak rows.
 */

export const GOOD_CATCH_LINK_MISSING_STATUS = 404;

export interface GoodCatchRow {
  id: number;
  tenant_id: number;
  plant_id?: number | null;
  route_id?: number | null;
  asset_id?: number | null;
  component_id?: number | null;
  alert_id?: string | null;
  work_order_id?: number | null;
  title: string;
  description?: string | null;
  catch_date?: string | Date | null;
  avoided_cost_cents?: number | string | null;
  downtime_hours_avoided?: number | string | null;
  safety_hazard?: boolean | null;
  safety_note?: string | null;
  recorded_by?: number | null;
  created_at?: string | Date | null;
  plant_name?: string | null;
  route_name?: string | null;
  asset_name?: string | null;
  asset_tag?: string | null;
  component_name?: string | null;
  work_order_status?: string | null;
  alert_title?: string | null;
}

export interface GoodCatchLinkRefs {
  plant_id?: number | null;
  route_id?: number | null;
  asset_id?: number | null;
  component_id?: number | null;
  alert_id?: string | null;
  work_order_id?: number | null;
}

export interface GoodCatchOwnedLinks {
  plants: ReadonlySet<number>;
  routes: ReadonlySet<number>;
  assets: ReadonlySet<number>;
  components: ReadonlySet<number>;
  alerts: ReadonlySet<string>;
  workOrders: ReadonlySet<number>;
}

export type GoodCatchLinkField =
  | "plant_id"
  | "route_id"
  | "asset_id"
  | "component_id"
  | "alert_id"
  | "work_order_id";

export interface GoodCatchLinkError {
  ok: false;
  status: typeof GOOD_CATCH_LINK_MISSING_STATUS;
  field: GoodCatchLinkField;
  id: string | number;
  error: string;
}

export interface GoodCatchLinkOk {
  ok: true;
}

export type GoodCatchLinkValidation = GoodCatchLinkOk | GoodCatchLinkError;

export interface GoodCatchTotals {
  tenantId: number;
  catchCount: number;
  totalAvoidedCostCents: number;
  totalDowntimeHoursAvoided: number;
  safetyCatchCount: number;
  empty: boolean;
}

export interface GoodCatchSummary extends GoodCatchTotals {
  catches: GoodCatchRow[];
}

function numericTenant(tenantId: number | null | undefined): number {
  const numeric = tenantId == null ? NaN : Number(tenantId);
  return Number.isFinite(numeric) ? numeric : -1;
}

function nonNegativeInteger(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.trunc(numeric));
}

function nonNegativeHours(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, numeric);
}

/**
 * Strict avoided-cost input gate. A supplied value must be whole cents; a
 * decimal (dollar-style) value is rejected rather than silently rounded.
 * Missing/empty defaults to 0 cents.
 */
export function parseAvoidedCostCents(
  raw: unknown
): { ok: true; cents: number } | { ok: false; error: string } {
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) {
    return { ok: true, cents: 0 };
  }
  if (typeof raw === "number") {
    if (Number.isSafeInteger(raw) && raw >= 0) {
      return { ok: true, cents: raw };
    }
    return {
      ok: false,
      error: "Avoided cost must be a whole number of cents (no decimals)."
    };
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!/^\d+$/.test(trimmed)) {
      return {
        ok: false,
        error: "Avoided cost must be a whole number of cents (no decimals)."
      };
    }
    const cents = Number(trimmed);
    if (Number.isSafeInteger(cents)) return { ok: true, cents };
  }
  return {
    ok: false,
    error: "Avoided cost must be a whole number of cents (no decimals)."
  };
}

/** Downtime is stored as exact NUMERIC hours, never as money. */
export function parseDowntimeHours(
  raw: unknown
): { ok: true; hours: number } | { ok: false; error: string } {
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) {
    return { ok: true, hours: 0 };
  }
  const hours = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(hours) || hours < 0) {
    return {
      ok: false,
      error: "Downtime hours avoided must be a non-negative number."
    };
  }
  return { ok: true, hours };
}

/**
 * Convert a dollars string typed by a human into integer cents using string
 * arithmetic only (never parseFloat / floating-point money). Returns null for
 * malformed input so the caller can show a validation error.
 */
export function dollarsInputToCents(raw: unknown): number | null {
  if (raw == null) return 0;
  const cleaned = String(raw).trim().replace(/^\$/, "").replace(/,/g, "");
  if (cleaned === "") return 0;
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;
  const dollars = Number(match[1]);
  const centsPart = (match[2] ?? "").padEnd(2, "0");
  const cents = Number(centsPart || "0");
  if (!Number.isSafeInteger(dollars) || !Number.isSafeInteger(cents)) return null;
  const total = dollars * 100 + cents;
  return Number.isSafeInteger(total) ? total : null;
}

/** Integer-only cents formatter; no floating-point arithmetic touches money. */
export function formatCents(cents: number): string {
  const safe = nonNegativeInteger(cents);
  const dollars = Math.floor(safe / 100);
  const remainder = safe % 100;
  return `$${dollars.toLocaleString("en-US")}.${String(remainder).padStart(2, "0")}`;
}

/**
 * Validate every supplied lineage / alert / work-order id against the set of
 * ids that PROVE session-tenant ownership. A missing or cross-tenant link is
 * indistinguishable from a non-existent one and yields 404, never a leak.
 */
export function validateGoodCatchLinks(
  refs: GoodCatchLinkRefs,
  owned: GoodCatchOwnedLinks
): GoodCatchLinkValidation {
  if (refs.plant_id != null) {
    const id = Number(refs.plant_id);
    if (!Number.isSafeInteger(id) || !owned.plants.has(id)) {
      return {
        ok: false,
        status: GOOD_CATCH_LINK_MISSING_STATUS,
        field: "plant_id",
        id: refs.plant_id,
        error: "Plant not found."
      };
    }
  }
  if (refs.route_id != null) {
    const id = Number(refs.route_id);
    if (!Number.isSafeInteger(id) || !owned.routes.has(id)) {
      return {
        ok: false,
        status: GOOD_CATCH_LINK_MISSING_STATUS,
        field: "route_id",
        id: refs.route_id,
        error: "Route not found."
      };
    }
  }
  if (refs.asset_id != null) {
    const id = Number(refs.asset_id);
    if (!Number.isSafeInteger(id) || !owned.assets.has(id)) {
      return {
        ok: false,
        status: GOOD_CATCH_LINK_MISSING_STATUS,
        field: "asset_id",
        id: refs.asset_id,
        error: "Asset not found."
      };
    }
  }
  if (refs.component_id != null) {
    const id = Number(refs.component_id);
    if (!Number.isSafeInteger(id) || !owned.components.has(id)) {
      return {
        ok: false,
        status: GOOD_CATCH_LINK_MISSING_STATUS,
        field: "component_id",
        id: refs.component_id,
        error: "Component not found."
      };
    }
  }
  if (refs.alert_id != null && String(refs.alert_id).trim() !== "") {
    const id = String(refs.alert_id).trim();
    if (!owned.alerts.has(id)) {
      return {
        ok: false,
        status: GOOD_CATCH_LINK_MISSING_STATUS,
        field: "alert_id",
        id,
        error: "Alert not found."
      };
    }
  }
  if (refs.work_order_id != null) {
    const id = Number(refs.work_order_id);
    if (!Number.isSafeInteger(id) || !owned.workOrders.has(id)) {
      return {
        ok: false,
        status: GOOD_CATCH_LINK_MISSING_STATUS,
        field: "work_order_id",
        id: refs.work_order_id,
        error: "Work order not found."
      };
    }
  }
  return { ok: true };
}

/**
 * Executive totals for the ROI page's CLEARLY LABELED additive block.
 * Money is summed as integers; tenant B's rows can never contribute to A.
 */
export function buildGoodCatchSummary(input: {
  tenantId: number | null | undefined;
  rows: GoodCatchRow[];
}): GoodCatchSummary {
  const tenantId = numericTenant(input.tenantId);
  if (tenantId < 0) {
    return {
      tenantId,
      catchCount: 0,
      totalAvoidedCostCents: 0,
      totalDowntimeHoursAvoided: 0,
      safetyCatchCount: 0,
      empty: true,
      catches: []
    };
  }

  const catches = input.rows
    .filter((row) => Number(row.tenant_id) === tenantId)
    .slice()
    .sort((a, b) => {
      const aDate = String(a.catch_date ?? a.created_at ?? "");
      const bDate = String(b.catch_date ?? b.created_at ?? "");
      if (aDate !== bDate) return aDate < bDate ? 1 : -1;
      return Number(b.id) - Number(a.id);
    });

  let totalAvoidedCostCents = 0;
  let totalDowntimeHoursAvoided = 0;
  let safetyCatchCount = 0;

  for (const row of catches) {
    totalAvoidedCostCents += nonNegativeInteger(row.avoided_cost_cents);
    totalDowntimeHoursAvoided += nonNegativeHours(row.downtime_hours_avoided);
    if (row.safety_hazard === true) safetyCatchCount += 1;
  }

  return {
    tenantId,
    catchCount: catches.length,
    totalAvoidedCostCents,
    totalDowntimeHoursAvoided,
    safetyCatchCount,
    empty: catches.length === 0,
    catches
  };
}

/** Scoped row check used by PATCH/DELETE guards in tests and callers. */
export function isGoodCatchVisibleToTenant(
  row: Pick<GoodCatchRow, "tenant_id">,
  tenantId: number | null | undefined
): boolean {
  const tenant = numericTenant(tenantId);
  return tenant >= 0 && Number(row.tenant_id) === tenant;
}
