import type {
  MorphCategoryKey,
  MorphSeverity,
  MorphologyMap,
  OilSample,
  ThresholdStatus,
  WearMetalKey
} from "../types/oilAnalysis";
import { DEFAULT_ALARM_LIMITS, MORPH_CATEGORIES } from "../types/oilAnalysis";

export type IsoCodeTriplet = readonly [number, number, number];

export { MORPH_CATEGORIES };
export type { MorphCategoryKey, MorphSeverity, MorphologyMap };

/**
 * Calculate wear rate in PPM per 100 operating hours.
 * Returns 0 if hours elapsed is 0 or negative.
 */
export function calculateWearRate(
  currentPPM: number,
  baselinePPM: number,
  currentHours: number,
  baselineHours: number
): number {
  const hoursElapsed = currentHours - baselineHours;
  if (hoursElapsed <= 0) return 0;

  const ppmIncrease = Math.max(0, currentPPM - baselinePPM);
  return (ppmIncrease / hoursElapsed) * 100;
}

/**
 * Calculate percentage change from baseline.
 */
export function calculateBaselineDelta(
  currentPPM: number,
  baselinePPM: number
): number {
  if (baselinePPM === 0) return currentPPM > 0 ? 100 : 0;
  return ((currentPPM - baselinePPM) / baselinePPM) * 100;
}

/**
 * Determine threshold status based on current PPM vs alarm limit.
 * Normal: < 50% of limit
 * Warning: 50% - 75% of limit
 * Critical: > 75% of limit
 */
export function getThresholdStatus(
  currentPPM: number,
  alarmLimit: number
): ThresholdStatus {
  if (alarmLimit <= 0) return "normal";
  const ratio = currentPPM / alarmLimit;

  if (ratio < 0.5) return "normal";
  if (ratio < 0.75) return "warning";
  return "critical";
}

/**
 * Get the specific alarm limit for a given metal key.
 */
export function getAlarmLimitForMetal(metal: WearMetalKey): number {
  return DEFAULT_ALARM_LIMITS[metal] || 100;
}

/**
 * Interpret wear pattern based on multiple element concentrations.
 * Returns a human-readable string describing the likely wear mode.
 */
export function interpretWearPattern(sample: OilSample): string {
  const highIron = sample.iron > sample.ironAlarmLimit * 0.5;
  const highChromium = sample.chromium > sample.chromiumAlarmLimit * 0.5;
  const highCopper = sample.copper > sample.copperAlarmLimit * 0.5;
  const highTin = (sample.tin || 0) > 10;
  const highSilicon = sample.silicon > 30; // Typical dirt contamination threshold
  const highAluminum = sample.aluminum > sample.aluminumAlarmLimit * 0.5;

  // Steel component wear (gears, shafts, or bearing races)
  if (highIron && highChromium) {
    return "Steel component wear detected (gears, shafts, or bearing races).";
  }

  // Bronze/brass component wear (bearings, bushings, or oil cooler)
  if (highCopper && highTin) {
    return "Bronze/brass component wear detected (bearings, bushings, or oil cooler).";
  }

  // Dirt contamination
  if (highSilicon && highAluminum) {
    return "Dirt contamination detected - check breather, seals, and filtration.";
  }

  // Abrasive wear
  if (highIron && highSilicon) {
    return "Abrasive wear pattern - dirt contamination accelerating mechanical wear.";
  }

  // Single element spikes
  if (highIron && !highChromium) {
    return "Elevated iron without chromium suggests mild steel wear or rust.";
  }

  return "Normal wear pattern - no significant anomalies detected.";
}

/**
 * Normalize a DB `DATE` value to a YYYY-MM-DD key.
 * Postgres DATE columns serialize as UTC midnight, so parsing them as a
 * timestamp shifts the calendar day in negative-offset timezones.
 */
export function toSampleDateKey(raw: string | Date | null | undefined): string {
  if (!raw) return "";
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return "";
    return raw.toISOString().slice(0, 10);
  }
  const isoPrefix = String(raw).match(/^\d{4}-\d{2}-\d{2}/);
  if (isoPrefix) return isoPrefix[0];
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

/** Locale-formatted sample date that never shifts across the UTC boundary. */
export function formatSampleDate(
  raw: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  const key = toSampleDateKey(raw);
  if (!key) return "—";
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, options);
}

export interface CrossoverProjection {
  status: "exceeded" | "projected" | "none";
  /** Operating hours at which TAN is projected to meet TBN. */
  projectedAtHours?: number;
}

/**
 * PARKED (SLICE-AM): the Fluid Chemistry tab no longer renders a projected
 * crossover. Oil samples carry no load telemetry, so an hours-based runway is
 * not supported. Retained only for the standalone metrics verification script;
 * do not wire this into UI without a load-telemetry basis.
 *
 * Project when the rising TAN curve will meet the falling TBN curve.
 *
 * Rates are measured between the first and last samples that carry BOTH
 * values, so a partially-filled early sample cannot distort the slope.
 */
export function projectTanTbnCrossover(
  samples: OilSample[]
): CrossoverProjection {
  const withBoth = samples.filter(
    (s) =>
      s.acidNumber != null &&
      Number.isFinite(s.acidNumber) &&
      s.tbn != null &&
      Number.isFinite(s.tbn)
  );
  if (withBoth.length === 0) return { status: "none" };

  const last = withBoth[withBoth.length - 1];
  const lastTan = last.acidNumber as number;
  const lastTbn = last.tbn as number;

  // Already crossed — no projection needed.
  const gap = lastTbn - lastTan;
  if (gap <= 0) return { status: "exceeded" };

  if (withBoth.length < 2) return { status: "none" };

  const first = withBoth[0];
  const hours = last.operatingHours - first.operatingHours;
  if (!Number.isFinite(hours) || hours <= 0) return { status: "none" };

  const tanRate = (lastTan - (first.acidNumber as number)) / hours;
  const tbnRate = (lastTbn - (first.tbn as number)) / hours;
  const closingRate = tanRate - tbnRate;

  // Gap is stable or widening — oil chemistry is not trending toward crossover.
  if (closingRate <= 0) return { status: "none" };

  return {
    status: "projected",
    projectedAtHours: last.operatingHours + gap / closingRate
  };
}

export interface TanTbnTrend {
  /** Latest distinct-date sample's TAN − TBN, or null when no sample has both. */
  delta: number | null;
  /**
   * Sample date that produced `delta`, or null when no sample carries both.
   * Lets the UI avoid calling an older paired reading "the latest sample".
   */
  deltaDate: string | null;
  /**
   * Least-squares slope of (TAN − TBN) per distinct-date sample, only at three
   * or more distinct sample dates that carry a valid TAN and TBN. Descriptive
   * only — never extrapolated to an hours/weeks runway.
   */
  slopePerSample: number | null;
  /** Distinct sample dates that carry a valid TAN and TBN. */
  distinctDateCount: number;
}

/**
 * Descriptive TAN/TBN trend: the current TAN − TBN gap plus a regression
 * slope once there are enough distinct-date samples to justify one.
 *
 * No crossover date is projected. Oil samples carry no load telemetry, so any
 * "hours to crossover" figure would be an invented runway.
 */
export function tanTbnTrend(samples: OilSample[]): TanTbnTrend {
  // Collapse duplicate sample dates to one gap so repeated lab uploads cannot
  // overweight a single day in the regression.
  const gapByDate = new Map<string, number>();
  for (const sample of samples) {
    const { acidNumber, tbn } = sample;
    if (acidNumber == null || !Number.isFinite(acidNumber)) continue;
    if (tbn == null || !Number.isFinite(tbn)) continue;
    const dateKey = toSampleDateKey(sample.sampleDate);
    if (!dateKey) continue;
    gapByDate.set(dateKey, acidNumber - tbn);
  }

  const gaps = [...gapByDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b));

  if (gaps.length === 0) {
    return {
      delta: null,
      deltaDate: null,
      slopePerSample: null,
      distinctDateCount: 0
    };
  }

  const [deltaDate, delta] = gaps[gaps.length - 1];
  if (gaps.length < 3) {
    return {
      delta,
      deltaDate,
      slopePerSample: null,
      distinctDateCount: gaps.length
    };
  }

  const n = gaps.length;
  const meanX = (n - 1) / 2;
  const meanY = gaps.reduce((sum, [, gap]) => sum + gap, 0) / n;
  let numerator = 0;
  let denominator = 0;
  gaps.forEach(([, gap], x) => {
    numerator += (x - meanX) * (gap - meanY);
    denominator += (x - meanX) ** 2;
  });

  return {
    delta,
    deltaDate,
    slopePerSample: denominator === 0 ? null : numerator / denominator,
    distinctDateCount: n
  };
}

/**
 * PARKED (SLICE-AM): the Fluid Chemistry tab ships a descriptive
 * current-vs-target comparison only. This modeled multiplier is not rendered
 * because no stored per-asset target and no in-repo ISO 281 factor table exist;
 * the only target is the recalled Noria default.
 *
 * Estimated component life multiplier from reaching a cleaner ISO 4406 target.
 *
 * Uses the worst-case (largest) code reduction across the three channels at
 * roughly 1.25x life per notch, per Noria contamination-control research.
 * This is a planning estimate, not a guarantee.
 */
export function noriaLifeExtensionFactor(
  current: IsoCodeTriplet,
  target: IsoCodeTriplet
): number {
  const notches = Math.max(
    Math.max(0, current[0] - target[0]),
    Math.max(0, current[1] - target[1]),
    Math.max(0, current[2] - target[2])
  );
  return Math.min(10, Math.round(Math.pow(1.25, notches) * 10) / 10);
}

/**
 * Water contamination advisory. Returns null when water is within normal range
 * or was not measured.
 */
export function waterPhaseAlert(waterPpm?: number | null): string | null {
  if (waterPpm == null || !Number.isFinite(waterPpm)) return null;
  if (waterPpm > 500) {
    return "FREE/EMULSIFIED WATER RISK — cavitation and bearing failure risk. Inspect seals and coolers.";
  }
  if (waterPpm > 200) {
    return "Approaching saturation — check breather desiccant.";
  }
  return null;
}

/**
 * Approximate NAS 1638 class from the ISO 4406 >6µm code.
 * Reference equivalency for orientation only — not a certified conversion.
 */
export function isoToNasClass(iso6: number): number {
  return Math.max(0, Math.round(iso6) - 7);
}

/**
 * Approximate SAE AS4059 class from the ISO 4406 >6µm code.
 * Reference equivalency for orientation only — not a certified conversion.
 */
export function isoToSaeClass(iso6: number): number {
  return Math.max(0, Math.round(iso6) - 6);
}

export interface ParticleRatioResult {
  ratio: number | null;
  diagnosis: string;
}

/**
 * Descriptive ratio of fine (>4µm) to coarse (>14µm) particles. Requires raw
 * counts — ISO codes are logarithmic and cannot substitute. The wording is
 * descriptive only: it does not diagnose a failure mode.
 */
export function calculateParticleRatio(
  p4?: number | null,
  p14?: number | null
): ParticleRatioResult {
  if (
    p4 == null ||
    p14 == null ||
    !Number.isFinite(p4) ||
    !Number.isFinite(p14) ||
    p14 <= 0
  ) {
    return {
      ratio: null,
      diagnosis: "Insufficient particle data for wear-mode ratio."
    };
  }

  const ratio = p4 / p14;
  if (ratio > 50) {
    return {
      ratio,
      diagnosis:
        "Consistent with fine silt ingress — fine abrasive particles dominant. Inspect breathers, seals, and filtration."
    };
  }
  if (ratio < 10) {
    return {
      ratio,
      diagnosis:
        "Consistent with coarse wear generation — coarse wear fragments present. Inspect bearings and gear surfaces."
    };
  }
  return {
    ratio,
    diagnosis: "Balanced particle distribution — typical background wear."
  };
}

/**
 * Provenance for the overshoot → beta-ratio recommendation.
 *
 * ISO 16889 is a filter-element beta-ratio TEST standard. It does not prescribe
 * which beta element to install for a given ISO 4406 overshoot; that selection
 * is vendor guidance. Keep this label attached anywhere the table is rendered.
 */
export const FILTER_BETA_GUIDANCE_BASIS =
  "ISO 16889 defines the filter beta-ratio test method only; mapping an ISO 4406 code overshoot to a Beta4(c) selection is vendor guidance, not an ISO 16889 requirement.";

export interface FilterBetaGuidanceRow {
  /** Inclusive minimum worst-channel overshoot, in ISO code steps. */
  minOvershoot: number;
  /** Inclusive maximum overshoot; null means unbounded. */
  maxOvershoot: number | null;
  /** Recommended Beta4(c), or null when no upgrade is indicated. */
  beta: number | null;
  recommendation: string;
}

/** In-repo, labeled guidance table. Not an ISO 16889 pass/fail requirement. */
export const FILTER_BETA_GUIDANCE_TABLE: readonly FilterBetaGuidanceRow[] = [
  {
    minOvershoot: Number.NEGATIVE_INFINITY,
    maxOvershoot: 0,
    beta: null,
    recommendation:
      "At target cleanliness — maintain current filtration."
  },
  {
    minOvershoot: 1,
    maxOvershoot: 2,
    beta: 200,
    recommendation:
      "Beta4(c) ≥ 200 filtration recommended to return to target."
  },
  {
    minOvershoot: 3,
    maxOvershoot: 4,
    beta: 1000,
    recommendation:
      "Beta4(c) ≥ 1000 filtration recommended (consider kidney-loop)."
  },
  {
    minOvershoot: 5,
    maxOvershoot: null,
    beta: 1000,
    recommendation:
      "Beta4(c) ≥ 1000 + offline kidney-loop recommended; investigate ingress sources."
  }
] as const;

/** Worst-channel ISO overshoot against a target (negative = cleaner). */
export function worstChannelOvershoot(
  current: IsoCodeTriplet,
  target: IsoCodeTriplet
): number {
  return Math.max(
    current[0] - target[0],
    current[1] - target[1],
    current[2] - target[2]
  );
}

/** Look up the labeled in-repo beta guidance row for an overshoot. */
export function filterBetaGuidanceFor(
  maxOvershoot: number
): FilterBetaGuidanceRow {
  return (
    FILTER_BETA_GUIDANCE_TABLE.find(
      (row) =>
        maxOvershoot >= row.minOvershoot &&
        (row.maxOvershoot == null || maxOvershoot <= row.maxOvershoot)
    ) ?? FILTER_BETA_GUIDANCE_TABLE[FILTER_BETA_GUIDANCE_TABLE.length - 1]
  );
}

/** Filtration recommendation sized to the worst ISO channel overshoot. */
export function recommendedFilterBeta(
  current: IsoCodeTriplet,
  target: IsoCodeTriplet
): string {
  return filterBetaGuidanceFor(worstChannelOvershoot(current, target))
    .recommendation;
}

/** Per-channel ISO code change between two samples (positive = dirtier). */
export function isoNotchDelta(
  prev: IsoCodeTriplet,
  curr: IsoCodeTriplet
): IsoCodeTriplet {
  return [curr[0] - prev[0], curr[1] - prev[1], curr[2] - prev[2]];
}

/** Read the ISO 4406 triplet off a sample, or null if any channel is missing. */
export function getIsoTriplet(sample: OilSample): IsoCodeTriplet | null {
  const { iso4um, iso6um, iso14um } = sample;
  if (
    iso4um == null ||
    iso6um == null ||
    iso14um == null ||
    !Number.isFinite(iso4um) ||
    !Number.isFinite(iso6um) ||
    !Number.isFinite(iso14um)
  ) {
    return null;
  }
  return [iso4um, iso6um, iso14um];
}

/** Format an ISO 4406 triplet as "18/16/13". */
export function formatIsoCode(triplet: IsoCodeTriplet | null): string {
  return triplet ? triplet.join("/") : "—";
}

/** Practical ISO 4406 display scale used by this app (codes 0–24). */
export const ISO_CODE_SCALE_MIN = 0;
export const ISO_CODE_SCALE_MAX = 24;

export const ISO_TRIPLET_DATA_QUALITY_WARNING =
  "ISO 4406 code physically inconsistent - verify lab entry";

export interface IsoTripletValidation {
  /** All three channels were reported (the triplet exists). */
  present: boolean;
  /** Present AND physically consistent AND on the ISO code scale. */
  valid: boolean;
  /** Human-readable reasons an invalid triplet failed the gate. */
  issues: string[];
}

/**
 * Validate a complete ISO 4406 triplet.
 *
 * A particle count for ">4 µm" must be at least the count for ">6 µm", which
 * must be at least the count for ">14 µm". Each channel also has to be a whole
 * code on the ISO 4406 scale. An incomplete triplet is "not reported" rather
 * than "invalid", so it keeps the existing honest null state.
 *
 * This is a data-quality gate, not a reason to discard a lab entry: callers
 * may still show the raw code alongside the warning, but must suppress every
 * derived alert, equivalency, recommendation and classification.
 */
export function validateIsoTriplet(
  triplet: IsoCodeTriplet | null | undefined
): IsoTripletValidation {
  if (triplet == null) {
    return { present: false, valid: false, issues: [] };
  }

  const issues: string[] = [];
  const [c4, c6, c14] = triplet;

  if (![c4, c6, c14].every((code) => Number.isInteger(code))) {
    issues.push("every channel must be a whole ISO 4406 code");
  }
  if (
    [c4, c6, c14].some(
      (code) =>
        !Number.isFinite(code) ||
        code < ISO_CODE_SCALE_MIN ||
        code > ISO_CODE_SCALE_MAX
    )
  ) {
    issues.push(
      `every channel must sit on the ${ISO_CODE_SCALE_MIN}–${ISO_CODE_SCALE_MAX} ISO code scale`
    );
  }
  if (c4 < c6) {
    issues.push("the >4 μm code cannot be lower than the >6 μm code");
  }
  if (c6 < c14) {
    issues.push("the >6 μm code cannot be lower than the >14 μm code");
  }

  return { present: true, valid: issues.length === 0, issues };
}

/** True only when a sample carries a complete, physically consistent triplet. */
export function hasValidIsoTriplet(sample: OilSample): boolean {
  return validateIsoTriplet(getIsoTriplet(sample)).valid;
}

/**
 * Deterministic sample sequence comparison.
 *
 * Date alone is not an ordering key: two lab uploads can share a calendar day
 * and the same DB read can return them in a different order. Sort by the
 * calendar-day key first, then by the stored created_at timestamp, then by row
 * id. Array.prototype.sort is stable, so identical keys retain fetch order.
 */
export function compareOilSampleSequence(a: OilSample, b: OilSample): number {
  const dateCompare = toSampleDateKey(a.sampleDate).localeCompare(
    toSampleDateKey(b.sampleDate)
  );
  if (dateCompare !== 0) return dateCompare;

  const createdCompare = String(a.createdAt ?? "").localeCompare(
    String(b.createdAt ?? "")
  );
  if (createdCompare !== 0) return createdCompare;

  const idCompare = String(a.id ?? "").localeCompare(String(b.id ?? ""));
  if (idCompare !== 0) return idCompare;

  const hoursCompare = a.operatingHours - b.operatingHours;
  if (Number.isFinite(hoursCompare) && hoursCompare !== 0) return hoursCompare;
  return 0;
}

/** Stable oldest → newest sequence, tie-broken beyond the date string. */
export function orderOilSamplesBySequence(
  samples: readonly OilSample[]
): OilSample[] {
  return [...samples].sort(compareOilSampleSequence);
}

/**
 * Parse a lab-reported ISO 4406 string ("18/16/13", "18 / 16 / 13") into codes.
 * Two-part legacy codes (">6µm/>14µm") are rejected as ambiguous.
 */
export function parseIsoCode(raw: string | null | undefined): IsoCodeTriplet | null {
  if (!raw) return null;
  const parts = String(raw)
    .split("/")
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isFinite(n));
  if (parts.length !== 3) return null;
  return [parts[0], parts[1], parts[2]];
}

// ---------------------------------------------------------------------------
// Ferrography & varnish
// ---------------------------------------------------------------------------

const SEV_RANK: Record<MorphSeverity, number> = {
  not_detected: 0,
  trace: 1,
  mild: 2,
  moderate: 3,
  severe: 4
};

/** Severity at or above which a morphology is considered actionable. */
const ACTIONABLE_RANK = SEV_RANK.mild;

export function morphSeverityRank(severity: MorphSeverity): number {
  return SEV_RANK[severity] ?? 0;
}

// ---------------------------------------------------------------------------
// Ferrography / varnish validity gate
// ---------------------------------------------------------------------------

/** Physical display floors/ceilings for the Section 5 readings. */
export const DR_DENSITY_MIN = 0;
export const MPC_DELTA_E_MIN = 0;
export const RULER_PERCENT_MIN = 0;
export const RULER_PERCENT_MAX = 100;
export const UC_RATING_MIN = 0;
export const UC_RATING_MAX = 8;

export const FERROGRAPHY_DATA_QUALITY_WARNING =
  "Ferrography / varnish reading outside its physical range - verify lab entry";

export type FerrographyField =
  | "drLarge"
  | "drSmall"
  | "mpcDeltaE"
  | "rulerPercent"
  | "ucRating";

export interface FerrographyFieldIssue {
  field: FerrographyField;
  label: string;
  value: number;
  message: string;
}

export interface FerrographyValidation {
  /** At least one ferrography / varnish reading was reported. */
  present: boolean;
  /** Present AND every reported reading sits inside its physical range. */
  valid: boolean;
  /** Human-readable reasons a reported reading failed the gate. */
  issues: string[];
  /** Field-level detail so the UI can name raw values and gate one derivation. */
  fieldIssues: FerrographyFieldIssue[];
}

export interface FerrographyReadings {
  drLarge?: number | null;
  drSmall?: number | null;
  mpcDeltaE?: number | null;
  rulerPercent?: number | null;
  ucRating?: number | null;
}

const FERROGRAPHY_FIELD_LABELS: Record<FerrographyField, string> = {
  drLarge: "DR Large (DL)",
  drSmall: "DR Small (DS)",
  mpcDeltaE: "MPC ΔE",
  rulerPercent: "RULER %",
  ucRating: "UC rating"
};

const FERROGRAPHY_FIELDS = Object.keys(
  FERROGRAPHY_FIELD_LABELS
) as FerrographyField[];

function isMeasuredNumber(
  value: number | null | undefined
): value is number {
  return value != null && Number.isFinite(value);
}

/** A DR density is physical only when reported and non-negative. */
export function isDrDensityValid(value: number | null | undefined): boolean {
  return isMeasuredNumber(value) && value >= DR_DENSITY_MIN;
}

/** MPC ΔE (varnish already formed) cannot be negative. */
export function isMpcDeltaEValid(value: number | null | undefined): boolean {
  return isMeasuredNumber(value) && value >= MPC_DELTA_E_MIN;
}

/** RULER is a remaining-antioxidant percentage, so 0–100. */
export function isRulerPercentValid(value: number | null | undefined): boolean {
  return (
    isMeasuredNumber(value) &&
    value >= RULER_PERCENT_MIN &&
    value <= RULER_PERCENT_MAX
  );
}

/** Ultra-Centrifuge rating lives on the declared 0–8 scale. */
export function isUcRatingValid(value: number | null | undefined): boolean {
  return (
    isMeasuredNumber(value) &&
    value >= UC_RATING_MIN &&
    value <= UC_RATING_MAX
  );
}

/**
 * Validate the reported ferrography / varnish readings.
 *
 * An absent reading is "not measured" rather than invalid, so the honest null
 * state survives. A measured 0 is a real result and stays valid.
 *
 * This is a data-quality gate, not a reason to discard the lab entry: callers
 * still show the raw value alongside the warning, but must suppress every
 * derived output (WPC/WSI/PLP, band badges, varnish risk index) that depends on
 * an invalid reading.
 */
export function validateFerrographyReadings(
  readings: FerrographyReadings | null | undefined
): FerrographyValidation {
  if (!readings) {
    return { present: false, valid: false, issues: [], fieldIssues: [] };
  }

  const reported = FERROGRAPHY_FIELDS.filter((field) =>
    isMeasuredNumber(readings[field])
  );
  if (reported.length === 0) {
    return { present: false, valid: false, issues: [], fieldIssues: [] };
  }

  const fieldIssues: FerrographyFieldIssue[] = [];
  for (const field of reported) {
    const value = readings[field] as number;
    const label = FERROGRAPHY_FIELD_LABELS[field];
    let message: string | null = null;

    if (field === "drLarge" || field === "drSmall") {
      if (!isDrDensityValid(value)) {
        message = `${label} cannot be negative (reported ${value})`;
      }
    } else if (field === "mpcDeltaE") {
      if (!isMpcDeltaEValid(value)) {
        message = `${label} cannot be negative (reported ${value})`;
      }
    } else if (field === "rulerPercent") {
      if (!isRulerPercentValid(value)) {
        message = `${label} must sit between ${RULER_PERCENT_MIN} and ${RULER_PERCENT_MAX} (reported ${value})`;
      }
    } else if (field === "ucRating") {
      if (!isUcRatingValid(value)) {
        message = `${label} must sit on the ${UC_RATING_MIN}–${UC_RATING_MAX} scale (reported ${value})`;
      }
    }

    if (message) {
      fieldIssues.push({ field, label, value, message });
    }
  }

  return {
    present: true,
    valid: fieldIssues.length === 0,
    issues: fieldIssues.map((issue) => issue.message),
    fieldIssues
  };
}

/** Validate the Section 5 readings carried by a saved oil sample. */
export function validateFerrographySample(
  sample: OilSample
): FerrographyValidation {
  return validateFerrographyReadings(sample);
}

/** True only when a sample carries at least one valid Section 5 reading. */
export function hasValidFerrographyReadings(sample: OilSample): boolean {
  return validateFerrographySample(sample).valid;
}

export interface DrFerroIndices {
  /** Wear Particle Concentration: total ferrous density. */
  wpc: number;
  /** Wear Severity Index: amplifies the large-particle contribution. */
  wsi: number;
  /** Percentage Large Particles, as a signed percentage of WPC. */
  plp: number;
  /** Large-to-small density ratio, or null when DS is zero. */
  dlDsRatio: number | null;
}

/** Direct Reading ferrograph indices derived from large/small densities. */
export function drFerroIndices(
  dl?: number | null,
  ds?: number | null
): DrFerroIndices | null {
  if (
    dl == null ||
    ds == null ||
    !Number.isFinite(dl) ||
    !Number.isFinite(ds)
  ) {
    return null;
  }

  const wpc = dl + ds;
  const plp = wpc > 0 ? Math.round(((dl - ds) / wpc) * 100) : 0;
  return {
    wpc,
    wsi: Math.max(0, dl * dl - ds * ds),
    plp,
    dlDsRatio: ds > 0 ? Math.round((dl / ds) * 100) / 100 : null
  };
}

/**
 * PARKED (SLICE-AQ): the Ferrography tab no longer renders an hours-to-onset
 * projection, so this dedupe helper is retained only for its SLICE-AP unit test
 * (AM precedent). Do not re-wire it into UI without a validated load-telemetry
 * basis.
 *
 * One point per distinct sample date that carries a reading.
 *
 * Repeated lab uploads on the same calendar day must not overweight that day in
 * a rate calculation, and a projection needs three distinct dated readings, not
 * three rows. `samples` is expected in oldest → newest sequence; the last
 * sample on a shared date wins.
 */
export function distinctDatePoints(
  samples: readonly OilSample[],
  read: (sample: OilSample) => number | null | undefined
): { dateKey: string; hours: number; value: number }[] {
  const byDate = new Map<string, { hours: number; value: number }>();

  for (const sample of samples) {
    const value = read(sample);
    if (value == null || !Number.isFinite(value)) continue;
    const dateKey = toSampleDateKey(sample.sampleDate);
    if (!dateKey) continue;
    const hours = Number.isFinite(sample.operatingHours)
      ? sample.operatingHours
      : 0;
    byDate.set(dateKey, { hours, value });
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, point]) => ({ dateKey, ...point }));
}

/**
 * Least-effort linear rate between the first and last point, per hour.
 * Returns null when there is no positive elapsed time to divide by.
 */
export function linearRatePerHour(
  points: { hours: number; value: number }[]
): number | null {
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const dh = last.hours - first.hours;
  if (!Number.isFinite(dh) || dh <= 0) return null;
  return (last.value - first.value) / dh;
}

/**
 * PARKED (SLICE-AQ) — hours-to-limit extrapolation (AM precedent), not wired
 * to the Ferrography UI. The generic diagnostics prognosis / RUL panel still
 * consumes this helper, as does the standalone metrics verification script; do
 * not re-wire the Ferrography onset forecast without a validated load-telemetry
 * basis.
 *
 * Hours until a value reaches a threshold at the given rate.
 * Returns 0 if already past it, or null if the trend never gets there.
 */
export function projectHoursToThreshold(
  current: number,
  ratePerHour: number | null,
  threshold: number,
  direction: "rising" | "falling"
): number | null {
  if (ratePerHour == null || !Number.isFinite(ratePerHour)) return null;

  if (direction === "rising") {
    if (current >= threshold) return 0;
    if (ratePerHour <= 0) return null;
    return (threshold - current) / ratePerHour;
  }

  if (current <= threshold) return 0;
  if (ratePerHour >= 0) return null;
  return (threshold - current) / ratePerHour;
}

export type MpcBand = "good" | "monitor" | "abnormal" | "critical";

/** Varnish potential band for an MPC ΔE value (ASTM D7843). */
export function mpcBand(dE: number): MpcBand {
  if (dE < 15) return "good";
  if (dE < 25) return "monitor";
  if (dE < 35) return "abnormal";
  return "critical";
}

export type RulerBand = "healthy" | "monitor" | "warning" | "critical";

/** Remaining antioxidant band for a RULER percentage (ASTM D6971). */
export function rulerBand(pct: number): RulerBand {
  if (pct >= 75) return "healthy";
  if (pct >= 50) return "monitor";
  if (pct >= 25) return "warning";
  return "critical";
}

/**
 * Composite 0–100 varnish risk blending varnish already formed (MPC) with
 * remaining protection (RULER). Requires both inputs.
 */
export function varnishRiskIndex(
  mpc?: number | null,
  ruler?: number | null
): number | null {
  if (
    mpc == null ||
    ruler == null ||
    !Number.isFinite(mpc) ||
    !Number.isFinite(ruler)
  ) {
    return null;
  }
  const mpcNorm = Math.min(100, Math.max(0, (mpc / 35) * 100));
  const rulerNorm = Math.min(100, Math.max(0, 100 - ruler));
  return Math.round(0.5 * mpcNorm + 0.5 * rulerNorm);
}

/**
 * Compare two samples' morphology and describe what newly appeared or got
 * worse. Only escalations to `mild` or above are reported — trace findings
 * are normal background noise on a ferrogram.
 */
export function detectMorphologyTransitions(
  prev: MorphologyMap | null,
  curr: MorphologyMap
): string[] {
  const alerts: string[] = [];

  for (const cat of MORPH_CATEGORIES) {
    const now = curr[cat.key];
    if (!now || now === "not_detected") continue;

    const before = prev?.[cat.key] ?? "not_detected";
    const nowRank = SEV_RANK[now];
    const beforeRank = SEV_RANK[before];

    if (nowRank < ACTIONABLE_RANK) continue;

    if (beforeRank <= SEV_RANK.trace) {
      alerts.push(`NEW ${cat.label} detected (${now}) — ${cat.meaning}.`);
    } else if (nowRank > beforeRank) {
      alerts.push(
        `${cat.label} escalated from ${before} to ${now} — ${cat.meaning}.`
      );
    }
  }

  return alerts;
}

/** The most severe morphology present, for at-a-glance table rows. */
export function primaryMorphology(
  morphology: MorphologyMap | undefined
): { key: MorphCategoryKey; label: string; severity: MorphSeverity } | null {
  if (!morphology) return null;

  let best: {
    key: MorphCategoryKey;
    label: string;
    severity: MorphSeverity;
  } | null = null;

  for (const cat of MORPH_CATEGORIES) {
    const severity = morphology[cat.key];
    if (!severity || severity === "not_detected") continue;
    if (!best || SEV_RANK[severity] > SEV_RANK[best.severity]) {
      best = { key: cat.key, label: cat.label, severity };
    }
  }

  return best;
}

/** Age of a sample in days, using calendar-day math (no timezone drift). */
export function sampleAgeInDays(raw: string | Date | null | undefined): number {
  const key = toSampleDateKey(raw);
  if (!key) return Number.POSITIVE_INFINITY;
  const [year, month, day] = key.split("-").map(Number);
  const sampleTime = new Date(year, month - 1, day).getTime();
  return (Date.now() - sampleTime) / 86_400_000;
}
