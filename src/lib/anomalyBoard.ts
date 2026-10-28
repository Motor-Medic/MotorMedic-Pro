/**
 * ANOMALY-BOARD - pure aggregation over the EXISTING diagnostics ledger.
 *
 * Source tables (read-only; no schema invented here):
 * - alerts: the cross-module fault ledger. Its severity vocabulary is the
 *   literal CHECK constraint in server.ts:
 *     severity VARCHAR(20) NOT NULL CHECK (severity IN ('HIGH', 'MEDIUM', 'LOW'))
 *   mirrored client-side by `AlertSeverity = "HIGH" | "MEDIUM" | "LOW"` in
 *   src/lib/analysisPersistence.ts.
 * - analysis_results: module lineage (`analysis_type`) and the first-detected
 *   timestamp (`timestamp`). We use COALESCE(analysis_results.timestamp,
 *   alerts.created_at): timestamp is the measurement/detection time; created_at
 *   is the fallback for legacy alerts with no linked analysis row.
 * - work_orders: linked repair order number (`work_orders.id`) joined on the
 *   SAME tenant and asset. A cross-tenant work order is never attached.
 *
 * "Open" uses the status vocabulary already in the product: alerts carry
 * `acknowledged BOOLEAN DEFAULT FALSE`, and the dashboard counts live alarms
 * with `WHERE acknowledged IS NOT TRUE`. AlertsControl renders the same states
 * as "New" / "Acknowledged". There is no alerts.status column, so we do not
 * invent one.
 *
 * `buildAnomalyBoard` re-checks tenant ownership even though the SQL already
 * filters by the session tenant, so a future read-helper regression cannot
 * leak another tenant's rows through this module.
 */

export const DAY_MS = 86400000;

export const ANOMALY_SEVERITY_BUCKETS = ["HIGH", "MEDIUM", "LOW"] as const;
export type AnomalySeverityBucket = (typeof ANOMALY_SEVERITY_BUCKETS)[number];

/**
 * Weights verified against the severity values that actually reach this
 * ledger. `mapUiSeverityToAlert` (server.ts) folds CRITICAL -> HIGH and
 * ANOMALY/WARNING -> MEDIUM before insert, so the stored vocabulary is only
 * HIGH/MEDIUM/LOW. The brief's weights are:
 *   Critical=10, High=5, Low=2, Anomaly/Warning=1.
 * MEDIUM is the extra stored tier (the CRITICAL/HIGH/ANOMALY/WARNING inputs all
 * collapse into it or HIGH), so it gets a sensible midpoint of 3 between High
 * (5) and Low (2). CRITICAL / ANOMALY / WARNING remain in the map so a legacy
 * or future row carrying the pre-collapse label still prices correctly.
 */
export const ANOMALY_SEVERITY_WEIGHTS: Record<string, number> = {
  CRITICAL: 10,
  HIGH: 5,
  MEDIUM: 3,
  LOW: 2,
  ANOMALY: 1,
  WARNING: 1
};

export interface AnomalyBoardSourceRow {
  id: string;
  tenant_id: number | null;
  asset_id?: string | null;
  severity?: string | null;
  title?: string | null;
  description?: string | null;
  created_at?: string | Date | null;
  first_detected_at?: string | Date | null;
  acknowledged?: boolean | null;
  analysis_type?: string | null;
  analysis_result_id?: string | null;
  work_order_number?: number | string | null;
  work_order_status?: string | null;
  work_order_tenant_id?: number | null;
  asset_name?: string | null;
  asset_tag?: string | null;
  route_id?: number | null;
  route_name?: string | null;
  plant_id?: number | null;
  plant_name?: string | null;
}

export interface AnomalyBoardItem {
  id: string;
  tenantId: number;
  assetId: string | null;
  title: string;
  description: string | null;
  severity: AnomalySeverityBucket;
  rawSeverity: string;
  weight: number;
  module: string;
  moduleLabel: string;
  detectedAt: string;
  daysOpen: number;
  riskIndex: number;
  workOrderNumber: number | null;
  workOrderStatus: string | null;
  assetName: string | null;
  assetTag: string | null;
  routeId: number | null;
  routeName: string | null;
  plantId: number | null;
  plantName: string | null;
}

export interface AnomalyBoardModule {
  key: string;
  label: string;
  count: number;
}

export interface AnomalyBoard {
  tenantId: number;
  empty: boolean;
  openCount: number;
  counts: Record<AnomalySeverityBucket, number>;
  totalRiskIndex: number;
  oldestOpen: AnomalyBoardItem | null;
  modules: AnomalyBoardModule[];
  items: AnomalyBoardItem[];
}

const MODULE_LABELS: Record<string, string> = {
  vibration: "Vibration",
  thermography: "Thermography",
  infrared: "Thermography",
  ultrasound: "Ultrasound",
  oil_analysis: "Oil Analysis",
  oil: "Oil Analysis",
  mca: "MCA",
  unknown: "Unknown"
};

function toMs(value: string | number | Date | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function normalizeAnomalyModule(raw: unknown): string {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  if (s === "infrared") return "thermography";
  if (s === "oil") return "oil_analysis";
  return s;
}

export function anomalyModuleLabel(key: string): string {
  return MODULE_LABELS[key] ?? (key || "Unknown");
}

/**
 * Map any severity label already present in the codebase onto the stored
 * alerts bucket. CRITICAL folds to HIGH here because `mapUiSeverityToAlert`
 * does that at write time; it is still priced at the CRITICAL weight below.
 */
export function normalizeAnomalySeverity(raw: unknown): AnomalySeverityBucket {
  const s = String(raw ?? "").trim().toUpperCase();
  if (s === "CRITICAL" || s === "HIGH") return "HIGH";
  if (s === "LOW") return "LOW";
  return "MEDIUM";
}

export function anomalySeverityWeight(raw: unknown): number {
  const s = String(raw ?? "").trim().toUpperCase();
  return ANOMALY_SEVERITY_WEIGHTS[s] ?? ANOMALY_SEVERITY_WEIGHTS.MEDIUM;
}

/**
 * days_open = floor((now - first_detected_at) / 86400000), never negative.
 * 86400000 is the milliseconds in one day.
 */
export function daysOpen(
  firstDetectedAt: string | number | Date | null | undefined,
  now: string | number | Date = Date.now()
): number {
  const start = toMs(firstDetectedAt);
  const end = toMs(now);
  if (start == null || end == null) return 0;
  return Math.max(0, Math.floor((end - start) / DAY_MS));
}

/**
 * RISK INDEX FORMULA - the single place it is computed.
 *
 *   risk_index = severity_weight * days_open
 *
 * severity_weight comes from ANOMALY_SEVERITY_WEIGHTS above (Critical=10,
 * High=5, Low=2, Anomaly/Warning=1, with the extra MEDIUM tier at 3).
 * days_open is the floor difference from daysOpen(). A missing/invalid
 * detection timestamp yields 0 days rather than a fabricated age.
 */
export function computeRiskIndex(rawSeverity: unknown, daysOpenValue: number): number {
  const days = Number.isFinite(daysOpenValue) ? Math.max(0, daysOpenValue) : 0;
  return anomalySeverityWeight(rawSeverity) * days;
}

function emptyBoard(tenantId: number): AnomalyBoard {
  return {
    tenantId,
    empty: true,
    openCount: 0,
    counts: { HIGH: 0, MEDIUM: 0, LOW: 0 },
    totalRiskIndex: 0,
    oldestOpen: null,
    modules: [],
    items: []
  };
}

export function buildAnomalyBoard(input: {
  tenantId: number | null | undefined;
  rows: AnomalyBoardSourceRow[];
  now?: string | number | Date;
}): AnomalyBoard {
  const numericTenant = input.tenantId == null ? NaN : Number(input.tenantId);
  const tenantId = Number.isFinite(numericTenant) ? numericTenant : -1;
  if (tenantId < 0) return emptyBoard(tenantId);

  const nowMs = toMs(input.now ?? Date.now()) ?? Date.now();
  const items: AnomalyBoardItem[] = [];
  const counts: Record<AnomalySeverityBucket, number> = {
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0
  };
  const moduleCounts = new Map<string, number>();

  for (const row of input.rows) {
    // Isolation guard: the endpoint query already scopes by tenant, but the
    // aggregation refuses cross-tenant rows even if that predicate regresses.
    if (Number(row.tenant_id) !== tenantId) continue;
    if (row.acknowledged === true) continue;

    const detected = toMs(row.first_detected_at ?? row.created_at);
    if (detected == null) continue;

    const rawSeverity = String(row.severity ?? "").trim().toUpperCase() || "MEDIUM";
    const severity = normalizeAnomalySeverity(rawSeverity);
    const age = daysOpen(detected, nowMs);
    const weight = anomalySeverityWeight(rawSeverity);

    // Same-tenant only: never surface a work order number unless the joined
    // row proves it belongs to this tenant.
    const workOrderNumber =
      row.work_order_number != null &&
      Number(row.work_order_tenant_id) === tenantId
        ? Number(row.work_order_number)
        : null;

    const module = normalizeAnomalyModule(row.analysis_type);
    const item: AnomalyBoardItem = {
      id: String(row.id),
      tenantId,
      assetId: row.asset_id != null && String(row.asset_id).trim() !== ""
        ? String(row.asset_id)
        : null,
      title: String(row.title ?? "").trim() || "Unnamed anomaly",
      description:
        row.description != null && String(row.description).trim() !== ""
          ? String(row.description)
          : null,
      severity,
      rawSeverity,
      weight,
      module,
      moduleLabel: anomalyModuleLabel(module),
      detectedAt: new Date(detected).toISOString(),
      daysOpen: age,
      riskIndex: computeRiskIndex(rawSeverity, age),
      workOrderNumber:
        workOrderNumber != null && Number.isFinite(workOrderNumber)
          ? workOrderNumber
          : null,
      workOrderStatus:
        workOrderNumber != null && row.work_order_status != null
          ? String(row.work_order_status)
          : null,
      assetName: row.asset_name != null ? String(row.asset_name) : null,
      assetTag: row.asset_tag != null ? String(row.asset_tag) : null,
      routeId: row.route_id != null ? Number(row.route_id) : null,
      routeName: row.route_name != null ? String(row.route_name) : null,
      plantId: row.plant_id != null ? Number(row.plant_id) : null,
      plantName: row.plant_name != null ? String(row.plant_name) : null
    };

    items.push(item);
    counts[severity] += 1;
    moduleCounts.set(module, (moduleCounts.get(module) ?? 0) + 1);
  }

  items.sort((a, b) => {
    const byDate = Date.parse(a.detectedAt) - Date.parse(b.detectedAt);
    if (byDate !== 0) return byDate;
    return a.id.localeCompare(b.id);
  });

  const modules: AnomalyBoardModule[] = Array.from(moduleCounts.entries())
    .map(([key, count]) => ({ key, label: anomalyModuleLabel(key), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const totalRiskIndex = items.reduce((sum, item) => sum + item.riskIndex, 0);

  if (items.length === 0) return emptyBoard(tenantId);

  return {
    tenantId,
    empty: false,
    openCount: items.length,
    counts,
    totalRiskIndex,
    oldestOpen: items[0],
    modules,
    items
  };
}
