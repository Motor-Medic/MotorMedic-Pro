/**
 * Log-domain helpers for ultrasound levels.
 *
 * dBµV is a logarithmic quantity: two readings may only be combined in the
 * power domain, never with an arithmetic mean. For dB values the power-domain
 * mean is
 *
 *     10 · log10( mean( 10^(L/10) ) )
 *
 * and the same expression applies to a set of dB *deltas* (they are ratios
 * relative to a baseline). Never convert dBµV with an affine transform
 * (e.g. x·a + b); the only legal operations here are subtraction (ΔdB) and
 * the log/power round-trip above.
 *
 * Linear crest factor lives in `ultrasoundAnalysis.ts` because it needs a
 * 20·log10 amplitude round-trip, not a 10·log10 power round-trip.
 */

/** True when every value is finite (empty arrays are not a valid mean). */
export function hasFiniteDbValues(levels: readonly number[]): boolean {
  return levels.length > 0 && levels.every((level) => Number.isFinite(level));
}

/**
 * Power-domain mean of dB levels or dB deltas.
 * Returns null for an empty / non-finite input so callers can render an
 * honest blank instead of a fabricated 0 dB.
 */
export function powerMeanDb(levels: readonly number[]): number | null {
  if (!hasFiniteDbValues(levels)) return null;
  let powerSum = 0;
  for (const level of levels) powerSum += Math.pow(10, level / 10);
  const meanPower = powerSum / levels.length;
  if (!Number.isFinite(meanPower) || meanPower <= 0) return null;
  return 10 * Math.log10(meanPower);
}

/** Convenience wrapper: rounded power mean or null. */
export function powerMeanDbRounded(
  levels: readonly number[],
  digits = 1
): number | null {
  const mean = powerMeanDb(levels);
  if (mean == null) return null;
  const factor = Math.pow(10, digits);
  return Math.round(mean * factor) / factor;
}

/** ΔdB is a subtraction of two log levels — never a converted absolute level. */
export function dbDelta(
  peakDb: number,
  baselineDb: number
): number | null {
  if (!Number.isFinite(peakDb) || !Number.isFinite(baselineDb)) return null;
  return Math.round((peakDb - baselineDb) * 10) / 10;
}

/** User-visible disclosure for every power-domain mean surfaced in the UI. */
export const DB_POWER_MEAN_NOTE =
  "power-domain mean — 10·log10(mean(10^(L/10))); dB values are never arithmetically averaged";
