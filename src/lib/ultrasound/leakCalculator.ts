/**
 * Compressed-air leak impact calculator (industry orifice + DOE-style energy).
 * Pure math — safe for client or server.
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

const DEFAULT_SYSTEM_PRESSURE_PSI = 100;
const DEFAULT_ELECTRICITY_COST = 0.12;
const DEFAULT_OPERATING_HOURS = 8760;
/** kW per 100 CFM → annualKwh uses (efficiency / 100) as kW/CFM. */
const DEFAULT_COMPRESSOR_EFFICIENCY = 18;
/** US EPA eGRID factor: metric tons CO₂e per kWh. */
const EPA_EGRID_TONS_PER_KWH = 0.000385;

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
      : DEFAULT_SYSTEM_PRESSURE_PSI;
  const electricityCost =
    Number.isFinite(Number(params.electricityCost)) &&
    Number(params.electricityCost)! >= 0
      ? Number(params.electricityCost)
      : DEFAULT_ELECTRICITY_COST;
  const operatingHours =
    Number.isFinite(Number(params.operatingHours)) &&
    Number(params.operatingHours)! > 0
      ? Number(params.operatingHours)
      : DEFAULT_OPERATING_HOURS;
  const compressorEfficiency =
    Number.isFinite(Number(params.compressorEfficiency)) &&
    Number(params.compressorEfficiency)! > 0
      ? Number(params.compressorEfficiency)
      : DEFAULT_COMPRESSOR_EFFICIENCY;

  // 1/8″ @ ~Δ20 dBµV ballpark; scales with acoustic amplitude ratio
  const orificeSize = 0.0005 * Math.pow(10, dbDelta / 20);

  // Choked orifice approximation (gauge PSI + atmosphere)
  const flowRateCfm =
    18 * Math.pow(orificeSize, 2) * (systemPressure + 14.7);

  // DOE-style: CFM × (kW per 100 CFM) / 100 × hours
  const annualKwh =
    flowRateCfm * (compressorEfficiency / 100) * operatingHours;

  const annualCost = annualKwh * electricityCost;
  const co2Emissions = annualKwh * EPA_EGRID_TONS_PER_KWH;

  return {
    orificeSize: round4(orificeSize),
    flowRateCfm: round2(flowRateCfm),
    annualKwh: round2(annualKwh),
    annualCost: round2(annualCost),
    co2Emissions: round2(co2Emissions)
  };
}
