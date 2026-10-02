/**
 * Closed-WO verification loop (H3-1) - client-side store + demo seed.
 *
 * Server-side truth today: PG work_orders table exists (server.ts) but holds
 * 0 rows and exposes no API, and this slice may not edit the server. Closed
 * work orders and the post-repair verification run therefore live in a
 * browser store that seeds itself once and declares its demo provenance on
 * every seeded record. The pre-repair run is NOT seeded - it is fetched from
 * /api/analysis-results (real measured data for PMP030 / Motor).
 */

export const CLOSED_WO_STORE_KEY = "spectra_closed_work_orders_v1";
export const CLOSED_WO_STORE_VERSION = 1;

export interface ClosedWorkOrder {
  id: string;
  assetId: string;
  component: string;
  targetFault: string;
  trackedHz: number | null;
  closeDate: string;
  title: string;
  severityClass: "Critical" | "High" | "Medium" | "Low";
  seeded: boolean;
}

export interface SeededVerificationRun {
  id: string;
  assetId: string;
  component: string;
  timestamp: string;
  analysisType: string;
  peaks: { frequencyHz: number; amplitude: number }[];
  fault_list: { title: string; frequencyHz?: number; severity?: string }[];
  primary_fault: string | null;
  severity: string | null;
  health_score: number | null;
  summary: string | null;
  seeded: true;
}

export interface ClosedWoStore {
  version: number;
  provenance: string;
  workOrders: ClosedWorkOrder[];
  postRepairRuns: SeededVerificationRun[];
}

export const DEMO_PROVENANCE =
  "demo seed (declared) - client-side browser store, not a CMMS record";

export const DEMO_CLOSED_WO_STORE: ClosedWoStore = {
  version: CLOSED_WO_STORE_VERSION,
  provenance: DEMO_PROVENANCE,
  workOrders: [
    {
      id: "WO-DEMO-PMP030-001",
      assetId: "PMP030",
      component: "Motor",
      targetFault: "Unbalance",
      trackedHz: 58.83,
      closeDate: "2026-09-14T17:00:00.000Z",
      title: "Balance rotor - residual unbalance at 58.83 Hz (1X)",
      severityClass: "Medium",
      seeded: true
    }
  ],
  postRepairRuns: [
    {
      id: "demo-post-verification-pmp030-001",
      assetId: "PMP030",
      component: "Motor",
      timestamp: "2026-09-16T09:30:00.000Z",
      analysisType: "vibration",
      peaks: [
        { frequencyHz: 58.83, amplitude: 0.06 },
        { frequencyHz: 117.67, amplitude: 0.02 },
        { frequencyHz: 176.5, amplitude: 0.01 }
      ],
      fault_list: [],
      primary_fault: "Machine Healthy / Normal Operation",
      severity: "NORMAL",
      health_score: 92,
      summary:
        "Machine Healthy / Normal Operation - ISO Zone A, overall 0.12 mm/s at 3530 RPM (1X = 58.83 Hz). Post-repair verification run - demo seed, declared, not a field measurement.",
      seeded: true
    }
  ]
};

function emptyStore(reason: string): ClosedWoStore {
  return {
    version: CLOSED_WO_STORE_VERSION,
    provenance: reason,
    workOrders: [],
    postRepairRuns: []
  };
}

function sanitizeRuns(value: unknown): SeededVerificationRun[] {
  if (!Array.isArray(value)) return [];
  const runs: SeededVerificationRun[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.timestamp !== "string") continue;
    if (typeof o.assetId !== "string") continue;
    runs.push({
      id: o.id,
      assetId: o.assetId,
      component: typeof o.component === "string" ? o.component : "",
      timestamp: o.timestamp,
      analysisType: typeof o.analysisType === "string" ? o.analysisType : "vibration",
      peaks: Array.isArray(o.peaks)
        ? o.peaks
            .filter((p): p is { frequencyHz: number; amplitude: number } => {
              const rec = p as Record<string, unknown> | null;
              return (
                !!rec &&
                Number.isFinite(Number(rec.frequencyHz)) &&
                Number.isFinite(Number(rec.amplitude))
              );
            })
            .map((p) => ({ frequencyHz: Number(p.frequencyHz), amplitude: Number(p.amplitude) }))
        : [],
      fault_list: Array.isArray(o.fault_list)
        ? o.fault_list.map((f) => {
            const rec = (f ?? {}) as Record<string, unknown>;
            return {
              title: typeof rec.title === "string" ? rec.title : "",
              frequencyHz: Number.isFinite(Number(rec.frequencyHz))
                ? Number(rec.frequencyHz)
                : undefined,
              severity: typeof rec.severity === "string" ? rec.severity : undefined
            };
          })
        : [],
      primary_fault: typeof o.primary_fault === "string" ? o.primary_fault : null,
      severity: typeof o.severity === "string" ? o.severity : null,
      health_score: Number.isFinite(Number(o.health_score)) ? Number(o.health_score) : null,
      summary: typeof o.summary === "string" ? o.summary : null,
      seeded: true
    });
  }
  return runs;
}

function sanitizeWorkOrders(value: unknown): ClosedWorkOrder[] {
  if (!Array.isArray(value)) return [];
  const orders: ClosedWorkOrder[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.assetId !== "string") continue;
    if (typeof o.closeDate !== "string") continue;
    const trackedHz = Number.isFinite(Number(o.trackedHz)) ? Number(o.trackedHz) : null;
    const sev = typeof o.severityClass === "string" ? o.severityClass : "";
    orders.push({
      id: o.id,
      assetId: o.assetId,
      component: typeof o.component === "string" ? o.component : "",
      targetFault: typeof o.targetFault === "string" ? o.targetFault : "",
      trackedHz,
      closeDate: o.closeDate,
      title: typeof o.title === "string" ? o.title : "",
      severityClass:
        sev === "Critical" || sev === "High" || sev === "Medium" || sev === "Low"
          ? sev
          : "Medium",
      seeded: o.seeded === true
    });
  }
  return orders;
}

/**
 * Seed-once loader. Key absent -> seed the declared demo store. Key present
 * -> honor it verbatim, including an emptied list (empty confession), so the
 * empty state stays reachable after clearing.
 */
export function loadClosedWoStore(): ClosedWoStore {
  try {
    const raw = localStorage.getItem(CLOSED_WO_STORE_KEY);
    if (raw === null) {
      localStorage.setItem(CLOSED_WO_STORE_KEY, JSON.stringify(DEMO_CLOSED_WO_STORE));
      return DEMO_CLOSED_WO_STORE;
    }
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return emptyStore("store cleared on record - no closed work orders");
    }
    if (parsed && typeof parsed === "object") {
      const rec = parsed as Record<string, unknown>;
      return {
        version: Number.isFinite(Number(rec.version)) ? Number(rec.version) : CLOSED_WO_STORE_VERSION,
        provenance:
          typeof rec.provenance === "string" ? rec.provenance : "browser store on record",
        workOrders: sanitizeWorkOrders(rec.workOrders),
        postRepairRuns: sanitizeRuns(rec.postRepairRuns)
      };
    }
    return emptyStore("store unreadable on record - no closed work orders");
  } catch {
    try {
      localStorage.setItem(CLOSED_WO_STORE_KEY, JSON.stringify(DEMO_CLOSED_WO_STORE));
    } catch {
      return DEMO_CLOSED_WO_STORE;
    }
    return DEMO_CLOSED_WO_STORE;
  }
}
