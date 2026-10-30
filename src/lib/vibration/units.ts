/**
 * Vibration unit conversion helpers.
 *
 * Canonical velocity unit across the app is **mm/s RMS**. Alternate display
 * units are derived here so the conversion constant lives in exactly one
 * place: `in/s = mm/s / 25.4`.
 */

export const MM_PER_INCH = 25.4;

export const CANONICAL_VELOCITY_UNIT = "mm/s RMS" as const;

/** Convert a velocity expressed in in/s to the canonical mm/s. */
export function inchPerSecondToMmPerSecond(value: number): number {
  return value * MM_PER_INCH;
}

/** Convert a canonical mm/s velocity to in/s for alternate display. */
export function mmPerSecondToInchPerSecond(value: number): number {
  return value / MM_PER_INCH;
}

/** Round a number to a fixed number of decimal places (banker-safe enough here). */
export function roundTo(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Format a canonical mm/s RMS value with its unit always attached. */
export function formatVelocityMmS(value: number, digits = 2): string {
  return `${roundTo(value, digits).toFixed(digits)} ${CANONICAL_VELOCITY_UNIT}`;
}
