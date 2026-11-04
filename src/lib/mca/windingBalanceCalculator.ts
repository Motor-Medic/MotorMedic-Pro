/**
 * MCA Winding & Phase Balance — descriptive phase unbalance, material-gated
 * °C-locked resistance normalization, and descriptive L/Z divergence.
 *
 * This module computes descriptive inter-phase asymmetry only. Without a
 * stored healthy reference there is no zero-point for absolute degradation,
 * so it never emits a "fault detected" verdict.
 */

import { evaluateMcaSeverity } from "../maintenance/prescriptiveDictionary";

export type ConductorMaterial = "copper" | "aluminum" | "unknown";

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
  /** Measured winding temperature (°C) for resistance correction. */
  windingTempC?: number;
  /** Conductor material for the resistance temperature coefficient. */
  conductorMaterial?: ConductorMaterial;
  /** Nameplate HP for the indicative derating estimate. */
  ratedHp?: number;
};

export type WindingFaultSeverity = "NORMAL" | "WARNING" | "CRITICAL";

export type WindingMetricAvailability = {
  R: boolean;
  L: boolean;
  Z: boolean;
  Fi: boolean;
  IF: boolean;
};

export type TemperatureNormalization = {
  /** True only when a winding temperature AND a complete R triplet were stored. */
  applied: boolean;
  referenceTempC: number;
  windingTempC?: number;
  material: ConductorMaterial;
  /** True when material was unknown and copper math was applied with a label. */
  materialAssumed: boolean;
  basis: string;
};

export type WindingBalanceResult = {
  /** Resistance normalized to 25°C when a °C winding temp was provided; else measured. */
  phaseR25: [number, number, number];
  unbalanceR: number;
  unbalanceL: number;
  unbalanceZ: number;
  unbalanceFi: number;
  unbalanceIF: number;
  maxUnbalanceRL: number;
  /** Max of every metric that actually has a complete stored triplet. */
  maxUnbalance: number;
  extraTempRiseC: number;
  remainingLifePercent: number;
  nemaDeratingFactor: number;
  usableHp: number | null;
  healthScore: number;
  fault: string;
  severity: WindingFaultSeverity;
  recommendation: string;
  tempCorrected: boolean;
  /** Which R/L/Z/Fi/I-F triplets were actually stored (null-vs-zero guard). */
  metricData: WindingMetricAvailability;
  /** Descriptive difference between L and Z unbalance, percentage points. */
  phaseLZDivergencePct: number | null;
  normalization: TemperatureNormalization;
  /** False when all phase metrics are missing / incomplete. */
  hasData: boolean;
};

/** Copper resistance temperature coefficient constant (°C). */
export const COPPER_TEMP_COEFFICIENT_K = 234.5;
/** Aluminum resistance temperature coefficient constant (°C). */
export const ALUMINUM_TEMP_COEFFICIENT_K = 228;
export const TEMP_NORMALIZATION_REFERENCE_C = 25;

/** Backward-compatible aliases for existing call sites/tests. */
const COPPER_K = COPPER_TEMP_COEFFICIENT_K;
const REF_TEMP_C = TEMP_NORMALIZATION_REFERENCE_C;

export function temperatureCoefficientK(material: ConductorMaterial): number {
  return material === "aluminum"
    ? ALUMINUM_TEMP_COEFFICIENT_K
    : COPPER_TEMP_COEFFICIENT_K;
}

function finiteOr(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Coerce a raw phase triplet into a complete triplet.
 *
 * Null / blank / non-finite elements are treated as an ABSENT measurement,
 * never as 0. A partial parse must not fabricate a 0 Ω resistance (which would
 * read as a dead short) or a 0 % unbalance.
 */
function asTriplet(
  raw: unknown,
  requirePositive = false
): [number, number, number] {
  if (!Array.isArray(raw) || raw.length < 3) {
    return [0, 0, 0];
  }
  const out: number[] = [];
  for (let i = 0; i < 3; i++) {
    const v = raw[i];
    if (v == null || v === "") return [0, 0, 0];
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return [0, 0, 0];
    if (requirePositive && n <= 0) return [0, 0, 0];
    out.push(n);
  }
  return [out[0], out[1], out[2]];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Normalize resistance to 25°C using the material's temperature coefficient.
 * The input is always °C (the formula is °C-locked; display-unit conversion
 * happens at the UI boundary, never here).
 *
 * R_25 = R * ((K + 25) / (K + T))
 */
export function normalizeResistanceTo25C(
  rMeasured: number,
  windingTempC: number,
  conductorMaterial: ConductorMaterial = "unknown"
): number {
  const k = temperatureCoefficientK(conductorMaterial);
  const r = finiteOr(rMeasured, 0);
  const t = finiteOr(windingTempC, REF_TEMP_C);
  const denom = k + t;
  if (!(denom > 0) || !(r >= 0)) return r;
  return r * ((k + REF_TEMP_C) / denom);
}

/**
 * % unbalance = (max |X_i − X̄| / X̄) × 100
 * The denominator is the three-phase mean, not max-min.
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

function tripletAvailable(
  triplet: [number, number, number],
  requirePositive: boolean
): boolean {
  return requirePositive
    ? triplet.every((n) => Number.isFinite(n) && n > 0)
    : triplet.some((n) => Number.isFinite(n) && n !== 0);
}

function normalizationBasis(
  material: ConductorMaterial,
  materialAssumed: boolean,
  applied: boolean
): string {
  if (!applied) {
    return "raw R — not temperature-corrected (winding temperature not recorded)";
  }
  if (materialAssumed) {
    return `R @${REF_TEMP_C}°C — assumed copper (K=${COPPER_K}); conductor material not recorded`;
  }
  if (material === "aluminum") {
    return `R @${REF_TEMP_C}°C — aluminum (K=${ALUMINUM_TEMP_COEFFICIENT_K})`;
  }
  return `R @${REF_TEMP_C}°C — copper (K=${COPPER_K})`;
}

/**
 * Descriptive asymmetry descriptor. Mirrors the in-repo unbalance rubric for
 * the severity tag, but the fault text never asserts an inter-turn short or a
 * diagnosis: without a stored healthy baseline it is only inter-phase
 * asymmetry.
 */
function describePhaseAsymmetry(params: {
  metricData: WindingMetricAvailability;
  unbalanceR: number;
  unbalanceL: number;
  unbalanceFi: number;
  unbalanceIF: number;
  maxUnbalance: number;
}): {
  fault: string;
  severity: WindingFaultSeverity;
  recommendation: string;
} {
  const { metricData, unbalanceR, unbalanceL, unbalanceFi, unbalanceIF } =
    params;
  const bracket = evaluateMcaSeverity(params.maxUnbalance);
  const severity: WindingFaultSeverity = bracket.clazz.includes("Class 1")
    ? "CRITICAL"
    : bracket.clazz.includes("Class 2") || bracket.clazz.includes("Class 3")
      ? "WARNING"
      : "NORMAL";

  if (
    metricData.R &&
    unbalanceR > 2.0 &&
    (!metricData.L || unbalanceL < 1.0)
  ) {
    return {
      fault:
        "Resistance asymmetry — descriptive (terminal / cable / connection candidate)",
      severity,
      recommendation: "Inspect MCC lugs and terminal box splices"
    };
  }
  if (
    (metricData.L && unbalanceL > 2.0) ||
    (metricData.Fi && unbalanceFi > 2.0) ||
    (metricData.IF && unbalanceIF > 2.0)
  ) {
    return {
      fault:
        "Inductance / phase-angle asymmetry — descriptive; confirm with a surge test",
      severity,
      recommendation:
        "Perform Surge Test & Phase-to-Phase Insulation Verification"
    };
  }
  if (
    (!metricData.R || unbalanceR < 1.5) &&
    (!metricData.L || unbalanceL < 1.5)
  ) {
    return {
      fault: "Phase balance within descriptive tolerance",
      severity,
      recommendation: "Routine Monitoring"
    };
  }
  return {
    fault: "Phase asymmetry — descriptive",
    severity,
    recommendation: "Re-check baseline with rotor rotated (RIC Test)"
  };
}

/**
 * Full winding balance analysis. Unbalance is descriptive inter-phase
 * asymmetry; it is not a fault verdict.
 */
export function calculateWindingBalance(
  params: WindingBalanceParams
): WindingBalanceResult {
  const phaseR = asTriplet(params.phaseR, true);
  const phaseL = asTriplet(params.phaseL, true);
  const phaseZ = asTriplet(params.phaseZ, true);
  const phaseFi = asTriplet(params.phaseFi);
  const phaseIF = asTriplet(params.phaseIF);

  const metricData: WindingMetricAvailability = {
    R: tripletAvailable(phaseR, true),
    L: tripletAvailable(phaseL, true),
    Z: tripletAvailable(phaseZ, true),
    Fi: tripletAvailable(phaseFi, false),
    IF: tripletAvailable(phaseIF, false)
  };

  const hasData = Object.values(metricData).some(Boolean);

  if (!hasData) {
    return {
      phaseR25: [0, 0, 0],
      unbalanceR: 0,
      unbalanceL: 0,
      unbalanceZ: 0,
      unbalanceFi: 0,
      unbalanceIF: 0,
      maxUnbalanceRL: 0,
      maxUnbalance: 0,
      extraTempRiseC: 0,
      remainingLifePercent: 0,
      nemaDeratingFactor: 0,
      usableHp: null,
      healthScore: 0,
      fault: "Awaiting Data",
      severity: "NORMAL",
      recommendation: "Upload MCA PDF or enter phase values manually",
      tempCorrected: false,
      metricData,
      phaseLZDivergencePct: null,
      normalization: {
        applied: false,
        referenceTempC: REF_TEMP_C,
        material: params.conductorMaterial ?? "unknown",
        materialAssumed: (params.conductorMaterial ?? "unknown") === "unknown",
        basis: normalizationBasis(
          params.conductorMaterial ?? "unknown",
          (params.conductorMaterial ?? "unknown") === "unknown",
          false
        )
      },
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
  const conductorMaterial: ConductorMaterial =
    params.conductorMaterial ?? "unknown";
  const materialAssumed = conductorMaterial === "unknown";

  const tempCorrected = windingTempC != null && metricData.R;
  const phaseR25: [number, number, number] = tempCorrected
    ? [
        round2(
          normalizeResistanceTo25C(phaseR[0], windingTempC!, conductorMaterial)
        ),
        round2(
          normalizeResistanceTo25C(phaseR[1], windingTempC!, conductorMaterial)
        ),
        round2(
          normalizeResistanceTo25C(phaseR[2], windingTempC!, conductorMaterial)
        )
      ]
    : [round2(phaseR[0]), round2(phaseR[1]), round2(phaseR[2])];

  const unbalanceR = metricData.R ? percentUnbalance(phaseR25) : 0;
  const unbalanceL = metricData.L ? percentUnbalance(phaseL) : 0;
  const unbalanceZ = metricData.Z ? percentUnbalance(phaseZ) : 0;
  const unbalanceFi = metricData.Fi ? percentUnbalance(phaseFi) : 0;
  const unbalanceIF = metricData.IF ? percentUnbalance(phaseIF) : 0;
  const maxUnbalanceRL = round2(Math.max(unbalanceR, unbalanceL));
  const maxUnbalance = round2(
    Math.max(
      metricData.R ? unbalanceR : 0,
      metricData.L ? unbalanceL : 0,
      metricData.Z ? unbalanceZ : 0,
      metricData.Fi ? unbalanceFi : 0,
      metricData.IF ? unbalanceIF : 0
    )
  );

  // Descriptive L/Z divergence: difference between inductance and impedance
  // unbalance, percentage points. No severity, no diagnosis — only present
  // when both stored triplets exist.
  const phaseLZDivergencePct =
    metricData.L && metricData.Z
      ? round2(Math.abs(unbalanceL - unbalanceZ))
      : null;

  // Indicative thermal / life impact from resistance unbalance. This is a
  // resistance-unbalance proxy, NOT a NEMA MG-1 compliance calculation.
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

  const described = describePhaseAsymmetry({
    metricData,
    unbalanceR,
    unbalanceL,
    unbalanceFi,
    unbalanceIF,
    maxUnbalance
  });

  return {
    phaseR25,
    unbalanceR,
    unbalanceL,
    unbalanceZ,
    unbalanceFi,
    unbalanceIF,
    maxUnbalanceRL,
    maxUnbalance,
    extraTempRiseC,
    remainingLifePercent,
    nemaDeratingFactor,
    usableHp,
    healthScore,
    fault: described.fault,
    severity: described.severity,
    recommendation: described.recommendation,
    tempCorrected,
    metricData,
    phaseLZDivergencePct,
    normalization: {
      applied: tempCorrected,
      referenceTempC: REF_TEMP_C,
      ...(windingTempC != null ? { windingTempC } : {}),
      material: conductorMaterial,
      materialAssumed,
      basis: normalizationBasis(conductorMaterial, materialAssumed, tempCorrected)
    },
    hasData: true
  };
}
