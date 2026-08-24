import type {
  OilSample,
  ThresholdStatus,
  WearMetalKey
} from "../types/oilAnalysis";
import { DEFAULT_ALARM_LIMITS } from "../types/oilAnalysis";

export type IsoCodeTriplet = [number, number, number];

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

/** Age of a sample in days, using calendar-day math (no timezone drift). */
export function sampleAgeInDays(raw: string | Date | null | undefined): number {
  const key = toSampleDateKey(raw);
  if (!key) return Number.POSITIVE_INFINITY;
  const [year, month, day] = key.split("-").map(Number);
  const sampleTime = new Date(year, month - 1, day).getTime();
  return (Date.now() - sampleTime) / 86_400_000;
}
