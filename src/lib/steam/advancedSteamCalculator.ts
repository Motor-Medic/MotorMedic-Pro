/**
 * Advanced steam trap loss calculator —
 * domain-safe choked/subsonic Napier flow + priority multi-modal fusion matrix.
 */

export type SteamFusionSeverity = "NORMAL" | "WARNING" | "CRITICAL";

export type AdvancedSteamLossParams = {
  /** Orifice / seat equivalent diameter (inches). */
  orificeSize: number;
  /** Upstream gauge steam pressure (psig). */
  steamPressurePsig: number;
  /** Ultrasound peak level (dBµV). */
  ultrasoundPeakDb: number;
  /** Optional IR upstream / inlet temperature (°F). */
  upstreamTemp?: number;
  /** Optional IR downstream / outlet temperature (°F). */
  downstreamTemp?: number;
  /** Trap style — affects replacement cost. */
  trapType?: string;
  /** Operating hours per year. Default 8760. */
  operatingHours?: number;
  /** Fuel / steam cost per 1,000 lb. Default 18.50. */
  fuelCostPerThousandLb?: number;
  /** Downstream absolute pressure (psia). Default 14.7 (atmosphere). */
  downstreamPressurePsia?: number;
};

export type AdvancedSteamLossResult = {
  massFlowLbHr: number;
  pressureRatio: number;
  flowRegime: "none" | "choked" | "subcritical";
  orificeAreaIn2: number;
  pAbsPsia: number;
  tempDrop: number | null;
  status: string;
  severity: SteamFusionSeverity;
  action: string;
  annualSteamLossLbs: number;
  annualCost: number;
  co2Emissions: number;
  replacementCost: number;
  dailyCost: number;
  roiPaybackDays: number | null;
  thermalAvailable: boolean;
};

const ATM_PSIA = 14.7;
const CHOKED_RATIO = 0.58;
const NAPIER_COEFF = 24.27;
const DEFAULT_HOURS = 8760;
const DEFAULT_FUEL_COST = 18.5;
const CO2_LB_FACTOR = 0.000055;

function finiteOr(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function optionalFinite(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Domain-safe steam mass flow (lb/hr) via Napier coefficient with
 * choked / subcritical / no-flow regimes.
 */
export function computeSteamMassFlowLbHr(params: {
  orificeSize: number;
  steamPressurePsig: number;
  downstreamPressurePsia?: number;
}): {
  W: number;
  A: number;
  P_psia: number;
  r: number;
  flowRegime: "none" | "choked" | "subcritical";
} {
  const orificeSize = Math.max(0, finiteOr(params.orificeSize, 0));
  const steamPressurePsig = Math.max(0, finiteOr(params.steamPressurePsig, 0));
  const P_psia = steamPressurePsig + ATM_PSIA;
  const A = Math.PI * Math.pow(orificeSize / 2, 2);
  const P_down = finiteOr(params.downstreamPressurePsia, ATM_PSIA);
  const r = P_psia > 0 ? P_down / P_psia : 1;

  if (!(A > 0) || !(P_psia > 0) || r >= 1.0) {
    return { W: 0, A: round4(A), P_psia: round2(P_psia), r: round4(r), flowRegime: "none" };
  }

  if (r <= CHOKED_RATIO) {
    return {
      W: NAPIER_COEFF * A * P_psia,
      A: round4(A),
      P_psia: round2(P_psia),
      r: round4(r),
      flowRegime: "choked"
    };
  }

  const subFactor = Math.max(0, 1 - (r - CHOKED_RATIO) / 0.42);
  return {
    W: NAPIER_COEFF * A * P_psia * subFactor,
    A: round4(A),
    P_psia: round2(P_psia),
    r: round4(r),
    flowRegime: "subcritical"
  };
}

/**
 * Priority-based multi-modal fusion (thermal blockage first, then blown-through).
 */
export function classifySteamTrapFusionStatus(params: {
  ultrasoundPeakDb: number;
  upstreamTemp?: number;
  downstreamTemp?: number;
}): {
  status: string;
  severity: SteamFusionSeverity;
  action: string;
  tempDrop: number | null;
  thermalAvailable: boolean;
} {
  const ultrasoundPeakDb = finiteOr(params.ultrasoundPeakDb, 0);
  const up = optionalFinite(params.upstreamTemp);
  const down = optionalFinite(params.downstreamTemp);
  const thermalAvailable = up != null && down != null;
  const tempDrop =
    thermalAvailable ? round2(up! - down!) : null;

  if (!thermalAvailable && typeof console !== "undefined" && console.warn) {
    console.warn(
      "[advancedSteamCalculator] Thermal correlation unavailable — upstreamTemp/downstreamTemp missing. Using acoustic-priority fusion with null tempDrop."
    );
  }

  // Priority 1 — Blockage
  if (tempDrop !== null && tempDrop < 10) {
    return {
      status: "Cold / Blocked (Water Hammer Risk)",
      severity: "CRITICAL",
      action: "Immediate Isolate & Inspect - Freeze/Blockage Hazard",
      tempDrop,
      thermalAvailable
    };
  }

  // Priority 2 — Blown-through (requires thermal confirmation of low ΔT)
  if (
    ultrasoundPeakDb > 35 &&
    tempDrop !== null &&
    tempDrop < 15
  ) {
    return {
      status: "Blown-Through (Live Steam Loss)",
      severity: "CRITICAL",
      action: "Emergency Valve Replacement",
      tempDrop,
      thermalAvailable
    };
  }

  // Priority 3 — Passing / leaking (acoustic)
  if (ultrasoundPeakDb > 25) {
    return {
      status: "Leaking / Passing",
      severity: "WARNING",
      action: "Schedule Maintenance",
      tempDrop,
      thermalAvailable
    };
  }

  // Priority 4 — Healthy
  if (ultrasoundPeakDb < 15 && (tempDrop === null || tempDrop >= 10)) {
    return {
      status: "Healthy / Normal Cycling",
      severity: "NORMAL",
      action: "None",
      tempDrop,
      thermalAvailable
    };
  }

  // Fallback
  return {
    status: "Manual Inspection Required",
    severity: "WARNING",
    action: "Verify Baseline Telemetry",
    tempDrop,
    thermalAvailable
  };
}

/**
 * Canonical advanced steam loss + fusion + guarded ROI payback.
 */
export function calculateAdvancedSteamLoss(
  params: AdvancedSteamLossParams
): AdvancedSteamLossResult {
  const orificeSize = Math.max(0, finiteOr(params.orificeSize, 0));
  const steamPressurePsig = Math.max(0, finiteOr(params.steamPressurePsig, 100));
  const ultrasoundPeakDb = finiteOr(params.ultrasoundPeakDb, 0);
  const operatingHours = Math.max(
    0,
    finiteOr(params.operatingHours, DEFAULT_HOURS)
  );
  const fuelCostPerThousandLb = Math.max(
    0,
    finiteOr(params.fuelCostPerThousandLb, DEFAULT_FUEL_COST)
  );

  const flow = computeSteamMassFlowLbHr({
    orificeSize,
    steamPressurePsig,
    downstreamPressurePsia: params.downstreamPressurePsia
  });

  const classified = classifySteamTrapFusionStatus({
    ultrasoundPeakDb,
    upstreamTemp: params.upstreamTemp,
    downstreamTemp: params.downstreamTemp
  });

  const annualSteamLossLbs =
    classified.severity === "NORMAL"
      ? 0
      : flow.W * operatingHours;

  const annualCost = (annualSteamLossLbs / 1000) * fuelCostPerThousandLb;
  const co2Emissions = annualSteamLossLbs * CO2_LB_FACTOR;

  const trapType = String(params.trapType || "").trim();
  const replacementCost =
    /inverted\s*bucket/i.test(trapType) ? 650 : 150;

  const dailyCost = annualCost / 365;
  const roiPaybackDays =
    dailyCost > 0 ? Math.round(replacementCost / dailyCost) : null;

  return {
    massFlowLbHr: round2(flow.W),
    pressureRatio: flow.r,
    flowRegime: flow.flowRegime,
    orificeAreaIn2: flow.A,
    pAbsPsia: flow.P_psia,
    tempDrop: classified.tempDrop,
    status: classified.status,
    severity: classified.severity,
    action: classified.action,
    annualSteamLossLbs: round2(annualSteamLossLbs),
    annualCost: round2(annualCost),
    co2Emissions: round2(co2Emissions),
    replacementCost,
    dailyCost: round2(dailyCost),
    roiPaybackDays,
    thermalAvailable: classified.thermalAvailable
  };
}

/** Estimate orifice inches from peak dB when seat size is not persisted. */
export function estimateSteamOrificeFromPeakDb(peakDb: number): number {
  const peak = Math.max(0, finiteOr(peakDb, 0));
  if (peak >= 40) return 0.125;
  if (peak >= 35) return 0.0625;
  if (peak >= 25) return 0.03125;
  if (peak >= 15) return 0.015625;
  return 0.01;
}
