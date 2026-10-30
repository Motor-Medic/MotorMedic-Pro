/**
 * SLICE-J2: spectral / harmonic trend resilience.
 *
 * The Spectral & Harmonics chart plots 1X, 2X and overall vibration over time.
 * Order lines are only meaningful when a running speed is recorded: without
 * RPM there is no 1X reference, so amplitudes must stay null instead of being
 * zero-filled or placed at the legacy 1780 RPM guess. Overall vibration does
 * not depend on RPM and must remain plotted.
 *
 * Sparse-date handling reuses the Slice-J guard so a single reading shows a
 * point plus `SPARSE_TREND_HELPER_TEXT`, never a fabricated slope.
 */

import {
  SPARSE_TREND_HELPER_TEXT,
  isSparseTrendSeries
} from "./trendSeries";
import {
  SECONDS_PER_MINUTE,
  hzToOrders,
  type VelocityDisplayUnit
} from "./units";

export const MISSING_RPM_ORDER_HELPER_TEXT =
  "Running speed required to compute order harmonics";

export interface SpectralPeakLike {
  frequency: number;
  amplitude?: number | null;
}

export interface SpectralAnalysisInput {
  timestamp?: string | null;
  /** Display date fallback when no timestamp is stored. */
  date?: string | null;
  rpm?: number | null;
  peaks?: readonly SpectralPeakLike[] | null;
  overall?: number | null;
}

export interface SpectralHarmonicRow {
  date: string;
  timestamp?: string | null;
  amp1X: number | null;
  amp2X: number | null;
  overall: number | null;
}

export interface SpectralHarmonicTrend {
  rows: SpectralHarmonicRow[];
  /** True when readings exist but no row has a usable running speed. */
  ordersUnavailable: boolean;
  /** True when readings exist but fewer than two distinct dates. */
  isSparse: boolean;
}

function amplitudeNearHz(
  peaks: readonly SpectralPeakLike[],
  targetHz: number
): number | null {
  if (!peaks.length || !(targetHz > 0)) return null;
  let best = peaks[0];
  let bestD = Math.abs(best.frequency - targetHz);
  for (const peak of peaks) {
    const distance = Math.abs(peak.frequency - targetHz);
    if (distance < bestD) {
      best = peak;
      bestD = distance;
    }
  }
  const amplitude = best.amplitude;
  return amplitude != null && Number.isFinite(amplitude) ? amplitude : null;
}

function positiveOrNull(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

function round3(value: number | null): number | null {
  return value == null ? null : Number(value.toFixed(3));
}

function displayDate(
  timestamp: string | null | undefined,
  fallback: string | null | undefined
): string {
  if (timestamp) {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric"
    });
  }
  return fallback || "\u2014";
}

/**
 * Build the guarded Spectral & Harmonics time series.
 *
 * - RPM missing -> 1X/2X amplitudes are null (never 0) and `ordersUnavailable`
 *   is true; `overall` is still populated so the overall line survives.
 * - Amplitude missing -> null so a peak is never zero-flattened.
 * - <2 distinct dates -> `isSparse` true (reuses the Slice-J guard).
 */
export function buildSpectralHarmonicTrend(
  inputs: readonly SpectralAnalysisInput[]
): SpectralHarmonicTrend {
  const rows: SpectralHarmonicRow[] = [];
  let sawUsableRpm = false;

  for (const input of inputs) {
    const rpm = input.rpm;
    const canComputeOrders = hzToOrders(1, rpm) != null;
    if (canComputeOrders) sawUsableRpm = true;

    const shaftHz =
      canComputeOrders && rpm != null ? rpm / SECONDS_PER_MINUTE : null;
    const peaks = input.peaks ?? [];
    const amp1X =
      shaftHz != null ? amplitudeNearHz(peaks, shaftHz) : null;
    const amp2X =
      shaftHz != null ? amplitudeNearHz(peaks, shaftHz * 2) : null;
    const overall = positiveOrNull(input.overall);

    if (amp1X == null && amp2X == null && overall == null) continue;

    rows.push({
      date: displayDate(input.timestamp, input.date),
      timestamp: input.timestamp ?? null,
      amp1X: round3(amp1X),
      amp2X: round3(amp2X),
      overall: round3(overall)
    });
  }

  return {
    rows,
    ordersUnavailable: rows.length > 0 && !sawUsableRpm,
    isSparse: isSparseTrendSeries(rows)
  };
}

/** Axis label for the amplitude axis; follows the tenant display unit. */
export function spectralAmplitudeAxisLabel(
  unit: VelocityDisplayUnit
): string {
  return `Peak amplitude (${unit})`;
}

export { SPARSE_TREND_HELPER_TEXT };
