/**
 * Run Diagnostics → Oil SSOT save contract.
 *
 * The Trend Analyzer Oil tab (Wear Metals, Fluid Chemistry, Cleanliness,
 * Ferrography) reads `oil_samples` through `fetchOilSamples`. Run Diagnostics
 * historically only rendered the oil results dashboard and never wrote that
 * row, so a completed oil run was invisible in Trend Analyzer.
 *
 * This module is the single client-side mapping from the oil intake form to
 * the POST /api/oil-analysis body. It is deliberately pure so the save gate
 * (hasOil) and the field mapping are unit-testable without a database.
 */

import {
  MORPH_CATEGORIES,
  MORPH_SEVERITIES,
  type MorphSeverity,
  type MorphologyMap
} from "../types/oilAnalysis";

/** Shared wire path for the oil_samples SSOT (keep off the eager bundle deps). */
export const OIL_ANALYSIS_API_PATH = "/api/oil-analysis";

/** Oil lab values captured by the Run Diagnostics oil intake form. */
export interface OilLabSnapshot {
  iron?: number | null;
  copper?: number | null;
  chromium?: number | null;
  lead?: number | null;
  aluminum?: number | null;
  silicon?: number | null;
  tin?: number | null;
  nickel?: number | null;
  viscosity40C?: number | null;
  viscosity100C?: number | null;
  viscosityIndex?: number | null;
  acidNumber?: number | null;
  tbn?: number | null;
  waterPpm?: number | null;
  oxidation?: number | null;
  nitration?: number | null;
  iso4um?: number | null;
  iso6um?: number | null;
  iso14um?: number | null;
  particles4um?: number | null;
  particles6um?: number | null;
  particles14um?: number | null;
  drLarge?: number | null;
  drSmall?: number | null;
  mpcDeltaE?: number | null;
  rulerPercent?: number | null;
  ucRating?: number | null;
  /** Operator-observed morphology. Absent means "not reported". */
  morphology?: MorphologyMap | null;
  operatingHours?: number | null;
}

/**
 * Measurements that make an oil run worth persisting. Operating hours alone is
 * telemetry, not a lab result, so it is intentionally excluded: a run with no
 * measured value must be dropped instead of writing an all-null sample.
 */
export const OIL_LAB_MEASUREMENT_KEYS = [
  "iron",
  "copper",
  "chromium",
  "lead",
  "aluminum",
  "silicon",
  "tin",
  "nickel",
  "viscosity40C",
  "viscosity100C",
  "viscosityIndex",
  "acidNumber",
  "tbn",
  "waterPpm",
  "oxidation",
  "nitration",
  "iso4um",
  "iso6um",
  "iso14um",
  "particles4um",
  "particles6um",
  "particles14um",
  "drLarge",
  "drSmall",
  "mpcDeltaE",
  "rulerPercent",
  "ucRating"
] as const satisfies readonly (keyof OilLabSnapshot)[];

function isMeasured(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function isMorphSeverity(value: unknown): value is MorphSeverity {
  return (
    typeof value === "string" &&
    (MORPH_SEVERITIES as readonly string[]).includes(value)
  );
}

/**
 * Any recognized operator observation means the run carries a real lab result.
 * An empty map (or only unknown severities) is "not reported", not a result.
 */
export function hasMorphologyObservation(
  morphology: MorphologyMap | null | undefined
): boolean {
  if (!morphology) return false;
  return MORPH_CATEGORIES.some((cat) => isMorphSeverity(morphology[cat.key]));
}

/**
 * Copy only recognized severity observations. Blank categories stay absent so
 * the row can never read back as a fabricated "not detected" (0-like) value.
 */
function optionalMorphology(
  morphology: MorphologyMap | null | undefined
): MorphologyMap | undefined {
  if (!morphology) return undefined;
  const result: MorphologyMap = {};
  for (const cat of MORPH_CATEGORIES) {
    const severity = morphology[cat.key];
    if (isMorphSeverity(severity)) result[cat.key] = severity;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Save gate: true when the snapshot carries at least one real measurement.
 * A measured zero counts (0 ppm is a lab result); null/undefined does not.
 */
export function hasOilLabData(
  snapshot: OilLabSnapshot | null | undefined
): boolean {
  if (!snapshot) return false;
  return (
    OIL_LAB_MEASUREMENT_KEYS.some((key) => isMeasured(snapshot[key])) ||
    hasMorphologyObservation(snapshot.morphology)
  );
}

/** Body accepted by POST /api/oil-analysis (camelCase wire contract). */
export interface OilSampleSavePayload {
  assetId: string;
  sampleDate: string;
  operatingHours: number;
  iron: number;
  copper: number;
  chromium: number;
  lead: number;
  aluminum: number;
  silicon: number;
  tin?: number;
  nickel?: number;
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
  drLarge?: number;
  drSmall?: number;
  mpcDeltaE?: number;
  rulerPercent?: number;
  ucRating?: number;
  morphology?: MorphologyMap;
}

function optional(value: number | null | undefined): number | undefined {
  return isMeasured(value) ? (value as number) : undefined;
}

/**
 * Build the POST body for an oil sample, or null when the run has no measured
 * lab data / no asset key. Wear metals default to 0, matching AddOilSampleModal
 * and the server's `coerceSaveOilSampleInput` contract.
 */
export function buildOilSampleSavePayload(
  snapshot: OilLabSnapshot | null | undefined,
  assetId: string | null | undefined,
  sampleDate: string
): OilSampleSavePayload | null {
  const key = assetId && String(assetId).trim();
  if (!key || !sampleDate || !hasOilLabData(snapshot)) return null;
  const s = snapshot as OilLabSnapshot;

  return {
    assetId: key,
    sampleDate,
    operatingHours: optional(s.operatingHours) ?? 0,
    iron: optional(s.iron) ?? 0,
    copper: optional(s.copper) ?? 0,
    chromium: optional(s.chromium) ?? 0,
    lead: optional(s.lead) ?? 0,
    aluminum: optional(s.aluminum) ?? 0,
    silicon: optional(s.silicon) ?? 0,
    tin: optional(s.tin),
    nickel: optional(s.nickel),
    viscosity40C: optional(s.viscosity40C),
    viscosity100C: optional(s.viscosity100C),
    viscosityIndex: optional(s.viscosityIndex),
    acidNumber: optional(s.acidNumber),
    tbn: optional(s.tbn),
    waterPpm: optional(s.waterPpm),
    oxidation: optional(s.oxidation),
    nitration: optional(s.nitration),
    iso4um: optional(s.iso4um),
    iso6um: optional(s.iso6um),
    iso14um: optional(s.iso14um),
    particles4um: optional(s.particles4um),
    particles6um: optional(s.particles6um),
    particles14um: optional(s.particles14um),
    drLarge: optional(s.drLarge),
    drSmall: optional(s.drSmall),
    mpcDeltaE: optional(s.mpcDeltaE),
    rulerPercent: optional(s.rulerPercent),
    ucRating: optional(s.ucRating),
    morphology: optionalMorphology(s.morphology)
  };
}
