import type {
  MorphCategoryKey,
  MorphSeverity,
  MorphologyMap,
  OilSample,
  ThresholdStatus,
  WearMetalKey
} from "../types/oilAnalysis";
import { DEFAULT_ALARM_LIMITS, MORPH_CATEGORIES } from "../types/oilAnalysis";

export type IsoCodeTriplet = [number, number, number];

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

/**
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
 * Ratio of fine (>4µm) to coarse (>14µm) particles, which separates silt-type
 * ingress from fatigue spalling. Requires raw counts — ISO codes are
 * logarithmic and cannot substitute.
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
        "Siltation risk — fine abrasive particles dominant. Inspect breathers, seals, and filtration."
    };
  }
  if (ratio < 10) {
    return {
      ratio,
      diagnosis:
        "Spalling/fatigue risk — coarse wear fragments present. Inspect bearings and gear surfaces."
    };
  }
  return {
    ratio,
    diagnosis: "Balanced particle distribution — typical background wear."
  };
}

/** Filtration recommendation sized to the worst ISO channel overshoot. */
export function recommendedFilterBeta(
  current: IsoCodeTriplet,
  target: IsoCodeTriplet
): string {
  const maxDelta = Math.max(
    current[0] - target[0],
    current[1] - target[1],
    current[2] - target[2]
  );
  if (maxDelta <= 0) return "At target cleanliness — maintain current filtration.";
  if (maxDelta <= 2) {
    return "Beta4(c) ≥ 200 filtration recommended to return to target.";
  }
  if (maxDelta <= 4) {
    return "Beta4(c) ≥ 1000 filtration recommended (consider kidney-loop).";
  }
  return "Beta4(c) ≥ 1000 + offline kidney-loop recommended; investigate ingress sources.";
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
