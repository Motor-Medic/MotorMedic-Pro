/**
 * MCA Winding & Phase Balance — NEMA MG-1 unbalance, temp-corrected R, life derating.
 */

export type WindingBalanceParams = {
  /** Phase-to-phase resistance T1-T2, T2-T3, T3-T1 (Ω). */
  phaseR: [number, number, number];
  /** Phase inductance (mH). */
  phaseL: [number, number, number];
  /** Phase impedance (Ω). */
  phaseZ: [number, number, number];
  /** Phase angle Fi (°). */
  phaseFi: [number, number, number];
  /** I/F ratio (%). */
  phaseIF: [number, number, number];
  /** Measured winding temperature (°C) for copper R correction. */
  windingTempC?: number;
  /** Nameplate HP for NEMA derating usable HP. */
  ratedHp?: number;
};

export type WindingFaultSeverity = "NORMAL" | "WARNING" | "CRITICAL";

export type WindingBalanceResult = {
  /** Resistance normalized to 25°C when windingTempC provided; else measured. */
  phaseR25: [number, number, number];
  unbalanceR: number;
  unbalanceL: number;
  unbalanceZ: number;
  unbalanceFi: number;
  unbalanceIF: number;
  maxUnbalanceRL: number;
  extraTempRiseC: number;
  remainingLifePercent: number;
  nemaDeratingFactor: number;
  usableHp: number | null;
  healthScore: number;
  fault: string;
  severity: WindingFaultSeverity;
  recommendation: string;
  tempCorrected: boolean;
  /** False when all phase metrics are zero / missing. */
  hasData: boolean;
};

const COPPER_K = 234.5;
const REF_TEMP_C = 25;
/** 234.5 + 25 = 259.5 */
const COPPER_REF_NUM = COPPER_K + REF_TEMP_C;

function finiteOr(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asTriplet(raw: unknown): [number, number, number] {
  if (!Array.isArray(raw) || raw.length < 3) {
    return [0, 0, 0];
  }
  return [
    finiteOr(raw[0], 0),
    finiteOr(raw[1], 0),
    finiteOr(raw[2], 0)
  ];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Normalize copper resistance to 25°C: R_25 = R * (259.5 / (234.5 + T)). */
export function normalizeResistanceTo25C(
  rMeasured: number,
  windingTempC: number
): number {
  const r = finiteOr(rMeasured, 0);
  const t = finiteOr(windingTempC, REF_TEMP_C);
  const denom = COPPER_K + t;
  if (!(denom > 0) || !(r >= 0)) return r;
  return r * (COPPER_REF_NUM / denom);
}

/**
 * % unbalance = (max |X_i − X̄| / X̄) × 100
 * Returns 0 when mean is zero / non-finite (no NaN).
 */
export function percentUnbalance(values: [number, number, number]): number {
  const a = finiteOr(values[0], 0);
  const b = finiteOr(values[1], 0);
  const c = finiteOr(values[2], 0);
  const avg = (a + b + c) / 3;
  if (!(avg > 0) || !Number.isFinite(avg)) return 0;
  const maxDev = Math.max(Math.abs(a - avg), Math.abs(b - avg), Math.abs(c - avg));
  return round2((maxDev / avg) * 100);
}

function isolateFault(params: {
  unbalanceR: number;
  unbalanceL: number;
  unbalanceFi: number;
  unbalanceIF: number;
}): {
  fault: string;
  severity: WindingFaultSeverity;
  recommendation: string;
} {
  const { unbalanceR, unbalanceL, unbalanceFi, unbalanceIF } = params;

  if (unbalanceR > 2.0 && unbalanceL < 1.0) {
    return {
      fault: "Terminal / Cable Connection Resistance",
      severity: "WARNING",
      recommendation: "Inspect MCC lugs and terminal box splices"
    };
  }
  if (unbalanceL > 2.0 || unbalanceFi > 2.0 || unbalanceIF > 2.0) {
    return {
      fault: "Stator Turn-to-Turn / Coil Short",
      severity: "CRITICAL",
      recommendation:
        "Perform Surge Test & Phase-to-Phase Insulation Verification"
    };
  }
  if (unbalanceR < 1.5 && unbalanceL < 1.5) {
    return {
      fault: "Balanced Winding (Healthy)",
      severity: "NORMAL",
      recommendation: "Routine Monitoring"
    };
  }
  return {
    fault: "Phase Asymmetry / Moderate Degradation",
    severity: "WARNING",
    recommendation: "Re-check baseline with rotor rotated (RIC Test)"
  };
}

/**
 * Full winding balance analysis per NEMA MG-1 / IEEE-style phase unbalance.
 */
export function calculateWindingBalance(
  params: WindingBalanceParams
): WindingBalanceResult {
  const phaseR = asTriplet(params.phaseR);
  const phaseL = asTriplet(params.phaseL);
  const phaseZ = asTriplet(params.phaseZ);
  const phaseFi = asTriplet(params.phaseFi);
  const phaseIF = asTriplet(params.phaseIF);

  const hasData = [phaseR, phaseL, phaseZ, phaseFi, phaseIF].some((t) =>
    t.some((n) => Number.isFinite(n) && n !== 0)
  );

  if (!hasData) {
    return {
      phaseR25: [0, 0, 0],
      unbalanceR: 0,
      unbalanceL: 0,
      unbalanceZ: 0,
      unbalanceFi: 0,
      unbalanceIF: 0,
      maxUnbalanceRL: 0,
      extraTempRiseC: 0,
      remainingLifePercent: 0,
      nemaDeratingFactor: 0,
      usableHp: null,
      healthScore: 0,
      fault: "Awaiting Data",
      severity: "NORMAL",
      recommendation: "Upload MCA PDF or enter phase values manually",
      tempCorrected: false,
      hasData: false
    };
  }

  const windingTempC =
    params.windingTempC != null && Number.isFinite(Number(params.windingTempC))
      ? Number(params.windingTempC)
      : undefined;
  const ratedHp =
    params.ratedHp != null && Number.isFinite(Number(params.ratedHp))
      ? Number(params.ratedHp)
      : undefined;

  const tempCorrected = windingTempC != null;
  const phaseR25: [number, number, number] = tempCorrected
    ? [
        round2(normalizeResistanceTo25C(phaseR[0], windingTempC!)),
        round2(normalizeResistanceTo25C(phaseR[1], windingTempC!)),
        round2(normalizeResistanceTo25C(phaseR[2], windingTempC!))
      ]
    : [round2(phaseR[0]), round2(phaseR[1]), round2(phaseR[2])];

  const unbalanceR = percentUnbalance(phaseR25);
  const unbalanceL = percentUnbalance(phaseL);
  const unbalanceZ = percentUnbalance(phaseZ);
  const unbalanceFi = percentUnbalance(phaseFi);
  const unbalanceIF = percentUnbalance(phaseIF);
  const maxUnbalanceRL = round2(Math.max(unbalanceR, unbalanceL));

  // NEMA MG-1 thermal / life impact from resistance unbalance
  const extraTempRiseC = round2(2 * Math.pow(unbalanceR, 2));
  const remainingLifePercent = round1(
    Math.max(1, 100 * Math.pow(2, -(extraTempRiseC / 10)))
  );
  const nemaDeratingFactor = round2(
    Math.max(0.7, 1.0 - 0.008 * Math.pow(unbalanceR, 2))
  );
  const usableHp =
    ratedHp != null && ratedHp > 0
      ? round2(ratedHp * nemaDeratingFactor)
      : null;
  const healthScore = Math.round(
    Math.max(0, Math.min(100, nemaDeratingFactor * 100))
  );

  const isolated = isolateFault({
    unbalanceR,
    unbalanceL,
    unbalanceFi,
    unbalanceIF
  });

  return {
    phaseR25,
    unbalanceR,
    unbalanceL,
    unbalanceZ,
    unbalanceFi,
    unbalanceIF,
    maxUnbalanceRL,
    extraTempRiseC,
    remainingLifePercent,
    nemaDeratingFactor,
    usableHp,
    healthScore,
    fault: isolated.fault,
    severity: isolated.severity,
    recommendation: isolated.recommendation,
    tempCorrected,
    hasData: true
  };
}
