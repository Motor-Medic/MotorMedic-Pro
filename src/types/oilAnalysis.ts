/** Wear particle morphology severity, ordered least to most severe. */
export type MorphSeverity =
  | "not_detected"
  | "trace"
  | "mild"
  | "moderate"
  | "severe";

export const MORPH_SEVERITIES: readonly MorphSeverity[] = [
  "not_detected",
  "trace",
  "mild",
  "moderate",
  "severe"
] as const;

/**
 * The eight wear particle morphologies read off a ferrogram, with what each
 * one implies about the failure mode in progress.
 */
export const MORPH_CATEGORIES = [
  {
    key: "rubbing",
    label: "Rubbing Wear",
    meaning: "Normal boundary lubrication wear"
  },
  {
    key: "cutting",
    label: "Cutting Wear",
    meaning: "Abrasive particle contamination"
  },
  {
    key: "spherical",
    label: "Spherical Debris",
    meaning: "Bearing micro-spalling / fatigue"
  },
  {
    key: "fatigue_chunk",
    label: "Fatigue Chunks",
    meaning: "Macro spalling / gear surface fatigue"
  },
  {
    key: "severe_sliding",
    label: "Severe Sliding",
    meaning: "Adhesive wear / scuffing"
  },
  {
    key: "corrosive",
    label: "Corrosive Wear",
    meaning: "Acid or water chemical attack"
  },
  {
    key: "nonmetallic",
    label: "Non-Metallic Ingress",
    meaning: "Environmental dirt / sand ingress"
  },
  {
    key: "fibers",
    label: "Fibers",
    meaning: "Filter media degradation / cloth fibers"
  }
] as const;

export type MorphCategoryKey = (typeof MORPH_CATEGORIES)[number]["key"];

export type MorphologyMap = Partial<Record<MorphCategoryKey, MorphSeverity>>;

/** DB column name for a morphology category. */
export const MORPH_COLUMN: Record<MorphCategoryKey, string> = {
  rubbing: "morph_rubbing",
  cutting: "morph_cutting",
  spherical: "morph_spherical",
  fatigue_chunk: "morph_fatigue_chunk",
  severe_sliding: "morph_severe_sliding",
  corrosive: "morph_corrosive",
  nonmetallic: "morph_nonmetallic",
  fibers: "morph_fibers"
};

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
  viscosity40C?: number; // cSt @ 40°C
  viscosity100C?: number; // cSt @ 100°C
  viscosityIndex?: number;
  acidNumber?: number; // TAN mg KOH/g
  tbn?: number; // Base number mg KOH/g
  waterPpm?: number;
  oxidation?: number; // Abs/cm
  nitration?: number; // Abs/cm

  // ISO 4406 particle counts (code per >4µm / >6µm / >14µm channel)
  iso4um?: number;
  iso6um?: number;
  iso14um?: number;

  // Raw particle counts per mL, when the lab reports them alongside the codes.
  // Never back-calculated from the ISO codes.
  particles4um?: number;
  particles6um?: number;
  particles14um?: number;

  // Ferrography & varnish. WPC / WSI / PLP / DL:DS are derived from
  // drLarge + drSmall at read time, never stored.
  drLarge?: number;
  drSmall?: number;
  mpcDeltaE?: number; // ASTM D7843 membrane patch colorimetry
  rulerPercent?: number; // ASTM D6971 remaining antioxidant
  ucRating?: number; // Ultra-Centrifuge rating, 0–8
  morphology?: MorphologyMap;
  ferrographImageUrl?: string;

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
  viscosityIndex?: number;
  acidNumber?: number;
  tbn?: number;
  waterPpm?: number;
  oxidation?: number;
  nitration?: number;
  iso4um?: number;
  iso6um?: number;
  iso14um?: number;
  particles4um?: number;
  particles6um?: number;
  particles14um?: number;
}

/**
 * Noria-recommended ISO 4406 cleanliness target for general industrial
 * bearing/gear service, expressed as >4µm / >6µm / >14µm codes.
 */
export const ISO_CLEANLINESS_TARGET: readonly [number, number, number] = [
  15, 13, 10
] as const;

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
