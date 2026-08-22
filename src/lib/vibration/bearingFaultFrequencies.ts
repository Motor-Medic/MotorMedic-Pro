/**
 * Bearing fault frequency kinematics (BPFO, BPFI, BSF, FTF).
 * Uses catalog geometry when available, or order multipliers from asset kinematics.
 * Never invents frequencies when RPM/geometry are missing.
 */

export interface BearingGeometry {
  /** Number of rolling elements */
  n: number;
  /** Ball/roller diameter */
  bd: number;
  /** Pitch diameter */
  pd: number;
  /** Contact angle in degrees (0 for deep-groove ball) */
  contactAngleDeg: number;
  /** Catalog designation used for the lookup */
  designation: string;
  source: "catalog" | "kinematics" | "manual";
}

export interface BearingFaultFrequenciesHz {
  bpfo: number;
  bpfi: number;
  bsf: number;
  ftf: number;
  shaftHz: number;
  rpm: number;
  geometry: BearingGeometry;
}

/** Approximate deep-groove geometry for common designations (SI-consistent ratios). */
const DEEP_GROOVE_CATALOG: Record<
  string,
  Omit<BearingGeometry, "designation" | "source">
> = {
  "6205": { n: 9, bd: 7.938, pd: 39.04, contactAngleDeg: 0 },
  "6206": { n: 9, bd: 9.525, pd: 46.0, contactAngleDeg: 0 },
  "6207": { n: 9, bd: 11.112, pd: 53.5, contactAngleDeg: 0 },
  "6208": { n: 9, bd: 12.0, pd: 60.0, contactAngleDeg: 0 },
  "6308": { n: 8, bd: 15.081, pd: 65.0, contactAngleDeg: 0 },
  "6309": { n: 8, bd: 17.462, pd: 72.5, contactAngleDeg: 0 },
  "6310": { n: 8, bd: 19.05, pd: 80.0, contactAngleDeg: 0 },
  "6312": { n: 8, bd: 22.225, pd: 95.0, contactAngleDeg: 0 },
  "6314": { n: 8, bd: 25.4, pd: 110.0, contactAngleDeg: 0 },
  "6316": { n: 8, bd: 28.575, pd: 125.0, contactAngleDeg: 0 },
  "6318": { n: 8, bd: 30.162, pd: 140.0, contactAngleDeg: 0 },
  "6320": { n: 8, bd: 34.925, pd: 157.5, contactAngleDeg: 0 },
  "6322": { n: 8, bd: 38.1, pd: 170.0, contactAngleDeg: 0 },
  "22212": { n: 16, bd: 18.0, pd: 95.0, contactAngleDeg: 0 },
  "22214": { n: 17, bd: 19.0, pd: 110.0, contactAngleDeg: 0 },
  "22216": { n: 18, bd: 21.0, pd: 125.0, contactAngleDeg: 0 }
};

/** Extract a catalog code like 6320 or 22216 from "SKF 6320 C3". */
export function parseBearingDesignation(raw: string | null | undefined): string | null {
  const s = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, " ");
  if (!s.trim()) return null;
  const m =
    s.match(/\b(2[0-9]{3,4})\b/) ||
    s.match(/\b(6[0-9]{3})\b/) ||
    s.match(/\b([0-9]{4,5})\b/);
  return m?.[1] || null;
}

export function lookupBearingGeometry(
  bearingLabel: string | null | undefined
): BearingGeometry | null {
  const designation = parseBearingDesignation(bearingLabel);
  if (!designation) return null;
  const geo = DEEP_GROOVE_CATALOG[designation];
  if (!geo) return null;
  return {
    ...geo,
    designation,
    source: "catalog"
  };
}

/**
 * Standard kinematic formulas (Hz):
 * BPFO = (n/2)×(1 − (bd/pd)cosφ)×(RPM/60)
 * BPFI = (n/2)×(1 + (bd/pd)cosφ)×(RPM/60)
 * BSF  = (pd/(2×bd))×(1 − ((bd/pd)cosφ)²)×(RPM/60)
 * FTF  = (1/2)×(1 − (bd/pd)cosφ)×(RPM/60)
 */
export function calculateBearingFaultFrequencies(
  geometry: BearingGeometry,
  rpm: number
): BearingFaultFrequenciesHz | null {
  if (!(rpm > 0) || !(geometry.n > 0) || !(geometry.bd > 0) || !(geometry.pd > 0)) {
    return null;
  }
  const shaftHz = rpm / 60;
  const phi = (geometry.contactAngleDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const ratio = geometry.bd / geometry.pd;
  const bpfo = (geometry.n / 2) * (1 - ratio * cos) * shaftHz;
  const bpfi = (geometry.n / 2) * (1 + ratio * cos) * shaftHz;
  const bsf =
    (geometry.pd / (2 * geometry.bd)) *
    (1 - Math.pow(ratio * cos, 2)) *
    shaftHz;
  const ftf = (1 / 2) * (1 - ratio * cos) * shaftHz;
  return {
    bpfo: round3(bpfo),
    bpfi: round3(bpfi),
    bsf: round3(bsf),
    ftf: round3(ftf),
    shaftHz: round3(shaftHz),
    rpm,
    geometry
  };
}

/** Parse "4.12" or "4.12 × RPM" style order multipliers into Hz. */
export function frequenciesFromOrders(
  orders: {
    bpfo?: string | number | null;
    bpfi?: string | number | null;
    bsf?: string | number | null;
    ftf?: string | number | null;
  },
  rpm: number,
  designation = "kinematics"
): BearingFaultFrequenciesHz | null {
  if (!(rpm > 0)) return null;
  const shaftHz = rpm / 60;
  const parseOrder = (v: string | number | null | undefined): number | null => {
    if (v == null || v === "") return null;
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
    const m = String(v).match(/([0-9]+(?:\.[0-9]+)?)/);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const oBpfo = parseOrder(orders.bpfo);
  const oBpfi = parseOrder(orders.bpfi);
  const oBsf = parseOrder(orders.bsf);
  const oFtf = parseOrder(orders.ftf);
  if (oBpfo == null && oBpfi == null && oBsf == null && oFtf == null) return null;
  return {
    bpfo: round3((oBpfo ?? 0) * shaftHz),
    bpfi: round3((oBpfi ?? 0) * shaftHz),
    bsf: round3((oBsf ?? 0) * shaftHz),
    ftf: round3((oFtf ?? 0) * shaftHz),
    shaftHz: round3(shaftHz),
    rpm,
    geometry: {
      n: 0,
      bd: 0,
      pd: 0,
      contactAngleDeg: 0,
      designation,
      source: "kinematics"
    }
  };
}

/**
 * Prefer catalog geometry; fall back to kinematics order fields on the component.
 */
export function resolveBearingFaultFrequencies(params: {
  bearingLabel?: string | null;
  rpm?: number | null;
  kinematics?: Record<string, unknown> | null;
}): BearingFaultFrequenciesHz | null {
  const rpm = Number(params.rpm);
  if (!Number.isFinite(rpm) || rpm <= 0) return null;

  const kin = params.kinematics || {};
  const fromOrders = frequenciesFromOrders(
    {
      bpfo: (kin.bpfo ?? kin.BPFO) as string | number | null | undefined,
      bpfi: (kin.bpfi ?? kin.BPFI) as string | number | null | undefined,
      bsf: (kin.bsf ?? kin.BSF) as string | number | null | undefined,
      ftf: (kin.ftf ?? kin.FTF) as string | number | null | undefined
    },
    rpm,
    String(params.bearingLabel || "kinematics")
  );
  if (fromOrders && (fromOrders.bpfo > 0 || fromOrders.bpfi > 0)) {
    return fromOrders;
  }

  const geo = lookupBearingGeometry(params.bearingLabel);
  if (!geo) return null;
  return calculateBearingFaultFrequencies(geo, rpm);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
