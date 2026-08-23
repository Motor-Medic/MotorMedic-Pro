import type {
  OilSample,
  ThresholdStatus,
  WearMetalKey
} from "../types/oilAnalysis";
import { DEFAULT_ALARM_LIMITS } from "../types/oilAnalysis";

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
