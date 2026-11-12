/**
 * SLICE-VS4 — Spectral & Harmonics stored-vs-derived order discipline.
 *
 * Contract:
 *   1. STORED order amplitudes are real measurements captured at collection
 *      (spectral peaks labeled "1X" / "2X"). They render as stored, with a
 *      provenance label, even when the sample carries no RPM.
 *   2. DERIVED (re-extracted) order amplitudes are only computed from raw FFT
 *      bins when the SAMPLE itself stores a running speed. There is no
 *      Equipment-DB fallback here: without a stored RPM there is no 1X
 *      frequency, so no bin may be re-extracted.
 *   3. The 2X:1X ratio is pure math (2X / 1X) present only when both
 *      amplitudes exist and 1X > 0. Interpretation comes from the in-repo
 *      labeled descriptive rubric below; it is omitted when the rubric or the
 *      ratio is absent. No fault is ever asserted.
 *   4. Amplitudes keep their stored unit. The g and Hz display selectors never
 *      convert a velocity amplitude: velocity -> acceleration is
 *      frequency-dependent (a = omega * v) and needs the order frequency
 *      (i.e. stored RPM). Only the frequency-independent mm/s <-> in/s
 *      conversion is applied by callers.
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

/** The sample has no stored RPM, so bin re-extraction is not honest. */
export const SPECTRAL_ORDERS_RPM_GATE_NOTE =
  "1X/2X order extraction requires configured RPM in Equipment DB";

export const SPECTRAL_ORDERS_STORED_FALLBACK_NOTE =
  "Showing stored order amplitudes as extracted at collection; raw FFT bins were not re-extracted.";

export const SPECTRAL_UNIT_PHYSICS_NOTE =
  "Spectral amplitudes stay in their stored velocity unit. The g and Hz display selectors do not convert velocity amplitudes: velocity \u2192 acceleration is frequency-dependent (a = \u03c9v) and needs an order frequency, which requires stored RPM. Only the frequency-independent mm/s \u2194 in/s conversion is applied.";

/** Provenance vocabulary — never conflate a re-extraction with a measurement. */
export type OrderAmplitudeSource = "stored" | "derived";

export const SPECTRAL_ORDER_PROVENANCE_STORED =
  "as extracted at collection";
export const SPECTRAL_ORDER_PROVENANCE_DERIVED =
  "re-extracted from stored FFT bins at the sample RPM";
export const SPECTRAL_ORDER_PROVENANCE_MIXED =
  "mixed \u2014 stored and re-extracted order amplitudes";

/** Human provenance for a single order amplitude. */
export function spectralOrderProvenanceLabel(
  source: OrderAmplitudeSource | null | undefined
): string | null {
  if (source === "stored") return SPECTRAL_ORDER_PROVENANCE_STORED;
  if (source === "derived") return SPECTRAL_ORDER_PROVENANCE_DERIVED;
  return null;
}

export interface SpectralPeakLike {
  frequency: number;
  amplitude?: number | null;
  /** Order tags such as "1X" / "2X" are stored measurements. */
  label?: string | null;
}

export interface SpectralAnalysisInput {
  timestamp?: string | null;
  /** Display date fallback when no timestamp is stored. */
  date?: string | null;
  /**
   * Running speed stored on THIS sample. Never an Equipment-DB fallback:
   * re-extraction from raw bins is only honest when the sample carries RPM.
   */
  rpm?: number | null;
  peaks?: readonly SpectralPeakLike[] | null;
  overall?: number | null;
  /** Running-state label from the shared SSOT predicate ("stopped sample"). */
  stoppedLabel?: string | null;
}

export type HarmonicRatioBasis = "stored" | "derived" | "mixed";

export interface HarmonicRatioInterpretation {
  label: string;
  source: string;
  rubricId: string;
}

export interface HarmonicRatio {
  /** 2X / 1X — pure arithmetic, no unit conversion. */
  ratio: number;
  basis: HarmonicRatioBasis;
  /** Provenance sentence shown beside the number. */
  basisNote: string;
  /** Descriptive only; null when the rubric is absent. */
  interpretation: HarmonicRatioInterpretation | null;
}

export interface SpectralHarmonicRow {
  /** Clean display date (e.g. "Oct 30"). */
  date: string;
  /** Deterministic X-axis label; same-date rows get a "· n" sequence. */
  dateLabel: string;
  /** 1-based ordinal within this display date. */
  sequence: number;
  timestamp?: string | null;
  amp1X: number | null;
  amp2X: number | null;
  overall: number | null;
  amp1XSource: OrderAmplitudeSource | null;
  amp2XSource: OrderAmplitudeSource | null;
  /** Running-state label from the SSOT predicate, when present. */
  stoppedLabel: string | null;
  /** Present only when both amplitudes exist and 1X > 0. */
  ratio: HarmonicRatio | null;
}

export interface SpectralHarmonicTrend {
  rows: SpectralHarmonicRow[];
  /**
   * True when readings exist but no row carries a usable stored running speed.
   * This gates bin re-extraction and interpretation — it never suppresses a
   * stored order amplitude.
   */
  ordersUnavailable: boolean;
  /** At least one row has a stored (labeled) order amplitude. */
  hasStoredOrders: boolean;
  /** At least one row has a re-extracted order amplitude. */
  hasDerivedOrders: boolean;
  /** At least one 1X/2X amplitude exists (stored or derived). */
  hasOrderSeries: boolean;
  /** True when readings exist but fewer than two distinct dates. */
  isSparse: boolean;
}

/** Stored order tags: "1X", "1X RPM", "order 1", "1st order". */
const ORDER_LABEL_PATTERNS: Record<1 | 2, RegExp> = {
  1: /^(?:1\s*x|order\s*1|1st\s*order|first\s*order)(?=$|[^0-9a-z])/i,
  2: /^(?:2\s*x|order\s*2|2nd\s*order|second\s*order)(?=$|[^0-9a-z])/i
};

interface StoredOrderRead {
  /** A labeled order peak exists for this sample. */
  matched: boolean;
  /** Its stored amplitude, or null when the label carries no usable value. */
  amplitude: number | null;
}

/**
 * Read a STORED order amplitude from labeled spectral peaks.
 *
 * Amplitude 0 is a legacy vision placeholder ("frequency only"), not a
 * measurement, so it is treated as absent rather than plotted as a real zero.
 * Other unlabeled peaks are left for RPM-gated re-extraction.
 */
function readStoredOrder(
  peaks: readonly SpectralPeakLike[],
  order: 1 | 2
): StoredOrderRead {
  const pattern = ORDER_LABEL_PATTERNS[order];
  let matched = false;
  for (const peak of peaks) {
    const label = String(peak.label ?? "");
    if (!pattern.test(label)) continue;
    matched = true;
    const amplitude = peak.amplitude;
    if (amplitude != null && Number.isFinite(amplitude) && amplitude > 0) {
      return { matched: true, amplitude };
    }
  }
  return { matched, amplitude: null };
}

function amplitudeNearHz(
  peaks: readonly SpectralPeakLike[],
  targetHz: number
): number | null {
  if (!peaks.length || !(targetHz > 0)) return null;
  let best: SpectralPeakLike | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const peak of peaks) {
    if (!Number.isFinite(peak.frequency)) continue;
    const distance = Math.abs(peak.frequency - targetHz);
    if (distance < bestD) {
      best = peak;
      bestD = distance;
    }
  }
  const amplitude = best?.amplitude;
  return amplitude != null && Number.isFinite(amplitude) && amplitude > 0
    ? amplitude
    : null;
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

export interface HarmonicRatioRubricBand {
  /** Inclusive lower bound for 2X / 1X. */
  minRatio: number;
  label: string;
}

export interface HarmonicRatioRubric {
  id: string;
  /** Provenance shown with every interpretation pill. */
  source: string;
  bands: readonly HarmonicRatioRubricBand[];
}

/**
 * In-repo descriptive rubric for the 2X:1X harmonic balance.
 *
 * This is NOT an ISO 20816 severity limit and it asserts no fault. It only
 * describes which order dominates; the UI phrase is always "consistent with".
 */
export const HARMONIC_RATIO_RUBRIC: HarmonicRatioRubric = {
  id: "2x-1x-harmonic-balance-v1",
  source:
    "in-repo descriptive 2X:1X harmonic-balance rubric \u2014 not an ISO 20816 severity limit; descriptive only, no fault verdict",
  bands: [
    {
      minRatio: 1.5,
      label:
        "2X \u2265 1.5\u00d7 1X \u2014 consistent with a 2X-dominant harmonic balance"
    },
    {
      minRatio: 0.8,
      label: "2X and 1X comparable \u2014 mixed harmonic balance"
    },
    {
      minRatio: 0,
      label:
        "1X dominant over 2X \u2014 consistent with a 1X-dominant harmonic balance"
    }
  ]
};

/** Descriptive band for a ratio; null when no labeled rubric is available. */
export function describeHarmonicRatio(
  ratio: number,
  rubric: HarmonicRatioRubric | null | undefined = HARMONIC_RATIO_RUBRIC
): HarmonicRatioInterpretation | null {
  if (
    !rubric ||
    !Number.isFinite(ratio) ||
    ratio < 0 ||
    rubric.bands.length === 0
  ) {
    return null;
  }
  const band = [...rubric.bands]
    .sort((a, b) => b.minRatio - a.minRatio)
    .find((candidate) => ratio >= candidate.minRatio);
  if (!band) return null;
  return { label: band.label, source: rubric.source, rubricId: rubric.id };
}

function ratioBasis(
  source1: OrderAmplitudeSource,
  source2: OrderAmplitudeSource
): HarmonicRatioBasis {
  return source1 === source2 ? source1 : "mixed";
}

function ratioBasisNote(basis: HarmonicRatioBasis): string {
  if (basis === "stored") {
    return "basis: stored 1X/2X amplitudes \u2014 as extracted at collection";
  }
  if (basis === "derived") {
    return "basis: 1X/2X re-extracted from stored FFT bins at the stored running speed";
  }
  return "basis: mixed \u2014 one order stored at collection, one re-extracted at the stored running speed";
}

/**
 * Pure 2X:1X math, present only when both amplitudes exist and 1X > 0.
 * Interpretation is attached only from a labeled rubric, and is descriptive.
 */
export function computeHarmonicRatio(
  amp1X: number | null,
  amp2X: number | null,
  source1: OrderAmplitudeSource | null,
  source2: OrderAmplitudeSource | null,
  rubric: HarmonicRatioRubric | null | undefined = HARMONIC_RATIO_RUBRIC
): HarmonicRatio | null {
  if (
    amp1X == null ||
    amp2X == null ||
    !Number.isFinite(amp1X) ||
    !Number.isFinite(amp2X) ||
    !(amp1X > 0) ||
    amp2X < 0 ||
    !source1 ||
    !source2
  ) {
    return null;
  }
  const ratio = round3(amp2X / amp1X);
  if (ratio == null) return null;
  const basis = ratioBasis(source1, source2);
  return {
    ratio,
    basis,
    basisNote: ratioBasisNote(basis),
    interpretation: describeHarmonicRatio(ratio, rubric)
  };
}

/**
 * Build the guarded Spectral & Harmonics time series.
 *
 * - Stored labeled 1X/2X peaks render as stored, with source provenance, even
 *   when the sample has no RPM.
 * - Unlabeled peaks are re-extracted only when the sample stores a positive
 *   running speed; otherwise amplitudes stay null (never 0, never a guessed
 *   RPM).
 * - Amplitude missing -> null so a peak is never zero-flattened.
 * - <2 distinct dates -> `isSparse` true (reuses the Slice-J guard).
 * - Same-date rows receive a deterministic "· n" X-axis sequence label in the
 *   caller-provided (SSOT) order.
 */
export function buildSpectralHarmonicTrend(
  inputs: readonly SpectralAnalysisInput[]
): SpectralHarmonicTrend {
  const rows: SpectralHarmonicRow[] = [];
  let sawUsableRpm = false;
  let hasStoredOrders = false;
  let hasDerivedOrders = false;

  for (const input of inputs) {
    const rpm = input.rpm;
    const canComputeOrders = hzToOrders(1, rpm) != null;
    if (canComputeOrders) sawUsableRpm = true;

    const shaftHz =
      canComputeOrders && rpm != null ? rpm / SECONDS_PER_MINUTE : null;
    const peaks = input.peaks ?? [];

    // Stored measurements win: a labeled 1X/2X peak is what was captured.
    const stored1 = readStoredOrder(peaks, 1);
    const stored2 = readStoredOrder(peaks, 2);

    const amp1X = stored1.matched
      ? stored1.amplitude
      : shaftHz != null
        ? amplitudeNearHz(peaks, shaftHz)
        : null;
    const amp2X = stored2.matched
      ? stored2.amplitude
      : shaftHz != null
        ? amplitudeNearHz(peaks, shaftHz * 2)
        : null;

    const source1: OrderAmplitudeSource | null =
      amp1X == null ? null : stored1.matched ? "stored" : "derived";
    const source2: OrderAmplitudeSource | null =
      amp2X == null ? null : stored2.matched ? "stored" : "derived";

    if (source1 === "stored" || source2 === "stored") hasStoredOrders = true;
    if (source1 === "derived" || source2 === "derived") hasDerivedOrders = true;

    const overall = positiveOrNull(input.overall);

    if (amp1X == null && amp2X == null && overall == null) continue;

    const ratio = computeHarmonicRatio(amp1X, amp2X, source1, source2);
    /**
     * Fault-interpretation copy is RPM-gated even when the amplitudes are
     * stored: without a stored running speed we cannot verify the order
     * reference. The pure 2X:1X math and its basis note remain present.
     */
    const gatedRatio =
      ratio && !canComputeOrders ? { ...ratio, interpretation: null } : ratio;

    const date = displayDate(input.timestamp, input.date);
    rows.push({
      date,
      dateLabel: date,
      sequence: 1,
      timestamp: input.timestamp ?? null,
      amp1X: round3(amp1X),
      amp2X: round3(amp2X),
      overall: round3(overall),
      amp1XSource: source1,
      amp2XSource: source2,
      stoppedLabel: input.stoppedLabel ?? null,
      ratio: gatedRatio
    });
  }

  // Deterministic same-date sequence labels: chronological input order (the
  // caller passes newest-first SSOT rows reversed) yields "· 1", "· 2", …
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.date, (totals.get(row.date) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  for (const row of rows) {
    const ordinal = (seen.get(row.date) ?? 0) + 1;
    seen.set(row.date, ordinal);
    row.sequence = ordinal;
    row.dateLabel =
      (totals.get(row.date) ?? 0) > 1 ? `${row.date} \u00b7 ${ordinal}` : row.date;
  }

  const hasOrderSeries = rows.some(
    (row) => row.amp1X != null || row.amp2X != null
  );

  return {
    rows,
    ordersUnavailable: rows.length > 0 && !sawUsableRpm,
    hasStoredOrders,
    hasDerivedOrders,
    hasOrderSeries,
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
