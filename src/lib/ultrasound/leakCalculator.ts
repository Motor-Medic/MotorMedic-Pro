/**
 * Compressed-air leak impact calculator (industry orifice + DOE-style energy).
 * Pure math — safe for client or server.
 *
 * Every economic/CO2 output below is MODELED from a single measured peak dBµV
 * delta. The constants are hardcoded defaults; nothing here is stored or
 * configured per tenant. Callers must surface `LEAK_BASIS_TEXT` beside any
 * derived dollar/CO2 figure so a model is never presented as a measurement.
 */

export type LeakImpactParams = {
  peakDb: number;
  baselineDb: number;
  /** Gauge pressure in PSI. Default 100. */
  systemPressure?: number;
  /** Electricity cost $/kWh. Default 0.12. */
  electricityCost?: number;
  /** Operating hours per year. Default 8760. */
  operatingHours?: number;
  /** Compressor specific power: kW per 100 CFM. Default 18. */
  compressorEfficiency?: number;
  /**
   * Orifice discharge coefficient (e.g. 0.79 smooth hole). Scales the choked
   * flow relative to the default coefficient. Default 0.79.
   */
  dischargeCoefficient?: number;
};

export type LeakImpactResult = {
  /** Equivalent orifice diameter (inches). */
  orificeSize: number;
  /** Continuous volumetric loss (CFM). */
  flowRateCfm: number;
  /** Annual energy waste (kWh/year). */
  annualKwh: number;
  /** Annual financial cost ($/year). */
  annualCost: number;
  /** CO₂ emissions (metric tons/year, US EPA eGRID). */
  co2Emissions: number;
};

/**
 * Single source of truth for the modeled-leak assumptions. These are hardcoded
 * defaults used only when a scan did not persist its own per-run basis; they are
 * not tenant settings.
 */
export const LEAK_IMPACT_DEFAULTS = {
  systemPressurePsi: 100,
  electricityCostPerKwh: 0.12,
  operatingHoursPerYear: 8760,
  /** kW per 100 CFM — annualKwh uses (efficiency / 100) as kW/CFM. */
  compressorSpecificPowerKwPer100Cfm: 18,
  /** US EPA eGRID factor: metric tons CO₂e per kWh. */
  egridMetricTonsCo2PerKwh: 0.000385,
  /** Acoustic amplitude scaling: orifice_in = coeff · 10^(ΔdB/20). */
  orificeAmplitudeCoeff: 0.0005,
  /** Choked-orifice flow coeff: CFM = coeff · orifice_in² · (psi + atmosphere). */
  chokedFlowCoeff: 18,
  atmospherePsi: 14.7,
  /** Reference orifice discharge coefficient (smooth/round hole). */
  dischargeCoefficient: 0.79
} as const;

/** User-visible disclosure of the exact model basis. */
export const LEAK_BASIS_TEXT =
  `Basis: ${LEAK_IMPACT_DEFAULTS.systemPressurePsi} psi | ` +
  `$${LEAK_IMPACT_DEFAULTS.electricityCostPerKwh}/kWh | ` +
  `${LEAK_IMPACT_DEFAULTS.operatingHoursPerYear} h/yr | ` +
  `Cd ${LEAK_IMPACT_DEFAULTS.dischargeCoefficient} | ` +
  `${LEAK_IMPACT_DEFAULTS.compressorSpecificPowerKwPer100Cfm} kW/100 CFM | ` +
  `eGRID US avg ${LEAK_IMPACT_DEFAULTS.egridMetricTonsCo2PerKwh} MT/kWh`;

export const LEAK_BASIS_NOTE =
  "Modeled from peak ΔdBµV — not measured. Per-scan economics are shown when stored; " +
  "otherwise they are recomputed from that scan's persisted basis, using the defaults " +
  "above only when no basis was stored.";

export type LeakRunBasisInput = {
  systemPressure?: number | null;
  operatingHours?: number | null;
  dischargeCoefficient?: number | null;
  electricityCost?: number | null;
  compressorEfficiency?: number | null;
  baselineSource?: "stored" | "fallback" | "unknown" | null;
  baselineFallbackDb?: number | null;
};

export type LeakBasisSummary = {
  /** True when every run used the documented calculator defaults. */
  isDefault: boolean;
  /** User-visible basis text — defaults or the distinct per-run bases. */
  text: string;
  /** Number of runs whose ΔdB economics rest on a fallback baseline. */
  fallbackCount: number;
  /** Fallback baseline dBµV (null when no run used one). */
  fallbackDb: number | null;
  runCount: number;
};

function basisPressure(b: LeakRunBasisInput): number {
  return b.systemPressure != null && Number.isFinite(Number(b.systemPressure))
    ? Number(b.systemPressure)
    : LEAK_IMPACT_DEFAULTS.systemPressurePsi;
}
function basisHours(b: LeakRunBasisInput): number {
  return b.operatingHours != null && Number.isFinite(Number(b.operatingHours))
    ? Number(b.operatingHours)
    : LEAK_IMPACT_DEFAULTS.operatingHoursPerYear;
}
function basisCoefficient(b: LeakRunBasisInput): number {
  return b.dischargeCoefficient != null &&
    Number.isFinite(Number(b.dischargeCoefficient)) &&
    Number(b.dischargeCoefficient) > 0
    ? Number(b.dischargeCoefficient)
    : LEAK_IMPACT_DEFAULTS.dischargeCoefficient;
}
function basisElectricity(b: LeakRunBasisInput): number {
  return b.electricityCost != null && Number.isFinite(Number(b.electricityCost))
    ? Number(b.electricityCost)
    : LEAK_IMPACT_DEFAULTS.electricityCostPerKwh;
}

/** A run uses the documented defaults when none of its inputs differ. */
export function leakRunBasisIsDefault(b: LeakRunBasisInput): boolean {
  return (
    basisPressure(b) === LEAK_IMPACT_DEFAULTS.systemPressurePsi &&
    basisHours(b) === LEAK_IMPACT_DEFAULTS.operatingHoursPerYear &&
    basisCoefficient(b) === LEAK_IMPACT_DEFAULTS.dischargeCoefficient &&
    basisElectricity(b) === LEAK_IMPACT_DEFAULTS.electricityCostPerKwh
  );
}

/** Format the exact basis used for one run (pressure/hours/Cd included). */
export function formatLeakRunBasis(b: LeakRunBasisInput): string {
  const hours = basisHours(b).toLocaleString("en-US", {
    maximumFractionDigits: 0
  });
  return (
    `Basis: ${formatNumber(basisPressure(b), 1)} psi | ` +
    `$${basisElectricity(b)}/kWh | ` +
    `${hours} h/yr | ` +
    `Cd ${basisCoefficient(b)} | ` +
    `${LEAK_IMPACT_DEFAULTS.compressorSpecificPowerKwPer100Cfm} kW/100 CFM | ` +
    `eGRID US avg ${LEAK_IMPACT_DEFAULTS.egridMetricTonsCo2PerKwh} MT/kWh`
  );
}

/**
 * Basis pill summary. When any run differs from the defaults the pill must
 * show the per-run bases (grouped, with run counts) instead of the defaults.
 * Fallback baselines are counted so the note can disclose the 28 dBµV default.
 */
export function summarizeLeakRunBases(
  bases: readonly LeakRunBasisInput[]
): LeakBasisSummary {
  const fallback = bases.filter((b) => b.baselineSource === "fallback");
  const fallbackCount = fallback.length;
  const fallbackDb =
    fallback.length > 0
      ? fallback.reduce<number>(
          (db, b) =>
            b.baselineFallbackDb != null &&
            Number.isFinite(Number(b.baselineFallbackDb))
              ? Number(b.baselineFallbackDb)
              : db,
          28
        )
      : null;

  const nonDefault = bases.filter((b) => !leakRunBasisIsDefault(b));
  if (nonDefault.length === 0) {
    return {
      isDefault: true,
      text: LEAK_BASIS_TEXT,
      fallbackCount,
      fallbackDb,
      runCount: bases.length
    };
  }

  const groups = new Map<
    string,
    { count: number; basis: LeakRunBasisInput }
  >();
  for (const b of bases) {
    const key = `${basisPressure(b)}|${basisHours(b)}|${basisCoefficient(
      b
    )}|${basisElectricity(b)}`;
    const existing = groups.get(key);
    if (existing) existing.count += 1;
    else groups.set(key, { count: 1, basis: b });
  }

  const parts: string[] = [];
  for (const { count, basis } of groups.values()) {
    parts.push(
      `${formatLeakRunBasis(basis)} (${count} run${count === 1 ? "" : "s"})`
    );
  }

  return {
    isDefault: false,
    text: `Per-run basis — ${parts.join("; ")}`,
    fallbackCount,
    fallbackDb,
    runCount: bases.length
  };
}

/**
 * No repair labor rate is stored or configured per tenant, so the ROI-days
 * sentence stays gated off. Daily savings (annual cost ÷ 365) is still shown.
 */
export const LEAK_REPAIR_LABOR_RATE_USD_PER_HOUR: number | null = null;

/**
 * Static in-repo guidance. Dollar-per-year bands for one leak — NOT an
 * ISO/DOE standard and not derived from a stored severity field.
 */
export const LEAK_COST_SEVERITY_BANDS = [
  { severity: "small", maxAnnualCost: 100, inclusive: false },
  { severity: "medium", maxAnnualCost: 1000, inclusive: false },
  { severity: "large", maxAnnualCost: 5000, inclusive: true }
] as const;

export const LEAK_COST_SEVERITY_SOURCE =
  "Static in-repo $/yr bands — guidance, not an ISO/DOE standard";

export type LeakCostSeverity = "small" | "medium" | "large" | "critical";

/** Classify modeled annual cost using the explicit in-repo bands above. */
export function leakCostSeverity(annualCost: number): LeakCostSeverity {
  const cost = Number(annualCost);
  if (!Number.isFinite(cost)) return "small";
  for (const band of LEAK_COST_SEVERITY_BANDS) {
    if (band.inclusive ? cost <= band.maxAnnualCost : cost < band.maxAnnualCost) {
      return band.severity;
    }
  }
  return "critical";
}

/** Round to a fixed number of significant figures (2 = honest for a dB input). */
export function roundToSignificant(n: number, significantDigits = 2): number {
  if (!Number.isFinite(n) || n === 0) return 0;
  const magnitude = Math.ceil(Math.log10(Math.abs(n)));
  const factor = Math.pow(10, significantDigits - magnitude);
  return Math.round(n * factor) / factor;
}

function formatNumber(n: number, maximumFractionDigits: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits });
}

/** $ at two significant figures — never four from a one-decimal dB reading. */
export function formatLeakUsdAmount(n: number): string {
  return `$${formatNumber(roundToSignificant(n, 2), 2)}`;
}

export function formatLeakUsdPerYear(n: number): string {
  return `${formatLeakUsdAmount(n)}/yr`;
}

export function formatLeakCfm(n: number): string {
  return `${formatNumber(roundToSignificant(n, 2), 2)} CFM`;
}

export function formatLeakOrificeIn(n: number): string {
  return `${formatNumber(roundToSignificant(n, 2), 4)} in`;
}

export function formatLeakCo2(n: number): string {
  return `${formatNumber(roundToSignificant(n, 2), 2)} MT/yr`;
}

export type LeakInventoryTotals = {
  totalAnnualCost: number;
  totalCfm: number;
  totalCo2: number;
};

export type LeakInventoryTotalsInput = {
  annualCost: number;
  estimatedCfm: number;
  co2Emissions: number;
};

/**
 * KPI totals are the sum of the DISPLAYED inventory rows (the caller passes the
 * same windowed/filtered array it renders). Keeping this pure makes the
 * window↔totals lockstep directly testable.
 */
export function summarizeLeakInventory(
  rows: readonly LeakInventoryTotalsInput[]
): LeakInventoryTotals {
  let totalAnnualCost = 0;
  let totalCfm = 0;
  let totalCo2 = 0;
  for (const row of rows) {
    totalAnnualCost += Number.isFinite(row.annualCost) ? row.annualCost : 0;
    totalCfm += Number.isFinite(row.estimatedCfm) ? row.estimatedCfm : 0;
    totalCo2 += Number.isFinite(row.co2Emissions) ? row.co2Emissions : 0;
  }
  return {
    totalAnnualCost: Math.round(totalAnnualCost * 100) / 100,
    totalCfm: Math.round(totalCfm * 10) / 10,
    totalCo2: Math.round(totalCo2 * 10) / 10
  };
}

/** Derived daily savings — present only when an annual cost exists. */
export function leakDailySavingsUsd(annualCost: number): number | null {
  const n = Number(annualCost);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round((n / 365) * 100) / 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

const ZERO_RESULT: LeakImpactResult = {
  orificeSize: 0,
  flowRateCfm: 0,
  annualKwh: 0,
  annualCost: 0,
  co2Emissions: 0
};

/**
 * Estimate orifice size, CFM loss, annual kWh / $, and CO₂ from ultrasound dB levels.
 */
export function calculateLeakImpact(params: LeakImpactParams): LeakImpactResult {
  const peakDb = Number(params.peakDb);
  const baselineDb = Number(params.baselineDb);
  if (!Number.isFinite(peakDb) || !Number.isFinite(baselineDb)) {
    return { ...ZERO_RESULT };
  }

  const dbDelta = Math.max(0, peakDb - baselineDb);
  if (dbDelta === 0) {
    return { ...ZERO_RESULT };
  }

  const systemPressure =
    Number.isFinite(Number(params.systemPressure)) &&
    Number(params.systemPressure)! > 0
      ? Number(params.systemPressure)
      : LEAK_IMPACT_DEFAULTS.systemPressurePsi;
  const electricityCost =
    Number.isFinite(Number(params.electricityCost)) &&
    Number(params.electricityCost)! >= 0
      ? Number(params.electricityCost)
      : LEAK_IMPACT_DEFAULTS.electricityCostPerKwh;
  const operatingHours =
    Number.isFinite(Number(params.operatingHours)) &&
    Number(params.operatingHours)! > 0
      ? Number(params.operatingHours)
      : LEAK_IMPACT_DEFAULTS.operatingHoursPerYear;
  const compressorEfficiency =
    Number.isFinite(Number(params.compressorEfficiency)) &&
    Number(params.compressorEfficiency)! > 0
      ? Number(params.compressorEfficiency)
      : LEAK_IMPACT_DEFAULTS.compressorSpecificPowerKwPer100Cfm;
  const dischargeCoefficient =
    Number.isFinite(Number(params.dischargeCoefficient)) &&
    Number(params.dischargeCoefficient)! > 0
      ? Number(params.dischargeCoefficient)
      : LEAK_IMPACT_DEFAULTS.dischargeCoefficient;

  // 1/8″ @ ~Δ20 dBµV ballpark; scales with acoustic amplitude ratio
  const orificeSize =
    LEAK_IMPACT_DEFAULTS.orificeAmplitudeCoeff * Math.pow(10, dbDelta / 20);

  // Choked orifice approximation (gauge PSI + atmosphere). The selected
  // discharge coefficient scales flow relative to the default (smooth hole).
  const flowRateCfm =
    LEAK_IMPACT_DEFAULTS.chokedFlowCoeff *
    Math.pow(orificeSize, 2) *
    (systemPressure + LEAK_IMPACT_DEFAULTS.atmospherePsi) *
    (dischargeCoefficient / LEAK_IMPACT_DEFAULTS.dischargeCoefficient);

  // DOE-style: CFM × (kW per 100 CFM) / 100 × hours
  const annualKwh =
    flowRateCfm * (compressorEfficiency / 100) * operatingHours;

  const annualCost = annualKwh * electricityCost;
  const co2Emissions = annualKwh * LEAK_IMPACT_DEFAULTS.egridMetricTonsCo2PerKwh;

  return {
    orificeSize: round4(orificeSize),
    flowRateCfm: round2(flowRateCfm),
    annualKwh: round2(annualKwh),
    annualCost: round2(annualCost),
    co2Emissions: round2(co2Emissions)
  };
}
