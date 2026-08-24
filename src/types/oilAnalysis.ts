/**
 * Represents a single oil sample from a laboratory analysis
 */
export interface OilSample {
  id?: string;
  assetId: string;
  sampleDate: string; // ISO date string
  operatingHours: number;

  // Wear Metals (PPM - parts per million)
  iron: number;
  copper: number;
  chromium: number;
  lead: number;
  aluminum: number;
  silicon: number;
  tin?: number;
  nickel?: number;

  // Fluid chemistry (optional — from vision / CSV)
  viscosity40C?: number;
  viscosity100C?: number;
  acidNumber?: number; // TAN mg KOH/g

  // Baseline values (from new oil or first sample)
  baselineIron?: number;
  baselineCopper?: number;
  baselineChromium?: number;
  baselineLead?: number;
  baselineAluminum?: number;
  baselineSilicon?: number;

  // Alarm limits (from ISO standards or custom thresholds)
  ironAlarmLimit: number;
  copperAlarmLimit: number;
  chromiumAlarmLimit: number;
  leadAlarmLimit: number;
  aluminumAlarmLimit: number;
  siliconAlarmLimit: number;

  // Calculated metrics (populated by utility functions)
  ironWearRate?: number; // PPM per 100 operating hours
  copperWearRate?: number;
  chromiumWearRate?: number;
  ironDeltaPercent?: number; // % change from baseline
  copperDeltaPercent?: number;
  chromiumDeltaPercent?: number;

  createdAt?: string;
  updatedAt?: string;
}

/**
 * Aggregated oil analysis record for an asset
 */
export interface OilAnalysisRecord {
  id?: string;
  assetId: string;
  technologyType: "oil_analysis";
  samples: OilSample[];
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Threshold status for display purposes
 */
export type ThresholdStatus = "normal" | "warning" | "critical";

/**
 * Wear metal element keys for dynamic access
 */
export type WearMetalKey =
  | "iron"
  | "copper"
  | "chromium"
  | "lead"
  | "aluminum"
  | "silicon";

/**
 * CSV row structure for importing lab data
 */
export interface OilSampleCSVRow {
  sampleDate: string;
  operatingHours: number;
  iron: number;
  copper: number;
  chromium: number;
  lead: number;
  aluminum: number;
  silicon: number;
  viscosity40C?: number;
  viscosity100C?: number;
  acidNumber?: number;
}

/**
 * Default alarm limits based on ISO 4406 and industry standards
 * for a typical industrial pump/motor (adjust per machine class)
 */
export const DEFAULT_ALARM_LIMITS = {
  iron: 100, // PPM
  copper: 50, // PPM
  chromium: 25, // PPM
  lead: 30, // PPM
  aluminum: 40, // PPM
  silicon: 30 // PPM (dirt contamination threshold)
} as const;
