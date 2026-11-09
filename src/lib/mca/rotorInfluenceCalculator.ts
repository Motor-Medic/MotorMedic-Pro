/**
 * MCA Rotor Influence Check (RIC) — peak-to-peak variation, baseline degradation, fault isolation.
 */

export interface RicDataPoint {
  angle: number;
  l12: number;
  l23: number;
  l31: number;
}

export type RicFaultSeverity = "NORMAL" | "WARNING" | "CRITICAL";

/** Per-phase amplitude of the spatial 2nd harmonic (mH). */
export type RicSpatialSecondHarmonic = {
  l12: number;
  l23: number;
  l31: number;
};

/** Raw Lmax/Lmin ratio from stored values (no severity verdict). */
export type RicInductanceRatio = {
  max: number;
  min: number;
  ratio: number;
};

export type RotorInfluenceResult = {
  smoothedData: RicDataPoint[];
  variationL12: number;
  variationL23: number;
  variationL31: number;
  maxVariation: number;
  /** Peak-to-peak spread metric used for "erratic" detection. */
  peakVariance: number;
  peakVarianceErratic: boolean;
  eccentricityIndex: number;
  degradationPercent: number | null;
  degradationFlagged: boolean;
  /**
   * Spatial 2nd harmonic (2 cycles/revolution) — null unless the stored
   * series covers a full 360° rotation. Never interpolated or synthesized.
   */
  spatialSecondHarmonic: RicSpatialSecondHarmonic | null;
  /** Lmax/Lmin across stored L12/L23/L31 — null when no values are stored. */
  inductanceRatio: RicInductanceRatio | null;
  fault: string;
  severity: RicFaultSeverity;
  recommendation: string;
  hasData: boolean;
};

/** Gating thresholds for treating a stored RIC series as a full rotation. */
export const RIC_FULL_ROTATION_MIN_POINTS = 12;
export const RIC_FULL_ROTATION_MIN_SPAN_DEG = 330;
export const RIC_FULL_ROTATION_MAX_GAP_DEG = 45;

function finiteOr(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Validate / sanitize a RIC point (angle 0–360, inductance > 0). */
export function sanitizeRicPoint(
  raw: Partial<RicDataPoint> | null | undefined
): RicDataPoint | null {
  if (!raw) return null;
  const angle = finiteOr(raw.angle, NaN);
  const l12 = finiteOr(raw.l12, NaN);
  const l23 = finiteOr(raw.l23, NaN);
  const l31 = finiteOr(raw.l31, NaN);
  if (![angle, l12, l23, l31].every((n) => Number.isFinite(n))) return null;
  if (angle < 0 || angle > 360) return null;
  if (!(l12 > 0) || !(l23 > 0) || !(l31 > 0)) return null;
  return { angle, l12, l23, l31 };
}

export function sanitizeRicSeries(
  data: RicDataPoint[] | null | undefined
): RicDataPoint[] {
  if (!Array.isArray(data) || data.length === 0) return [];
  return data
    .map((p) => sanitizeRicPoint(p))
    .filter((p): p is RicDataPoint => p != null)
    .sort((a, b) => a.angle - b.angle);
}

/**
 * True only when the stored series spans a full rotation with no large
 * sampling gap. A partial/discrete table (e.g. 0°/90°/180°/270°) fails this
 * gate so no spectrum is ever fabricated from incomplete data.
 */
export function hasFullRotationRicData(
  data: RicDataPoint[] | null | undefined
): boolean {
  const series = sanitizeRicSeries(data);
  if (series.length < RIC_FULL_ROTATION_MIN_POINTS) return false;
  const span = series[series.length - 1].angle - series[0].angle;
  if (span < RIC_FULL_ROTATION_MIN_SPAN_DEG) return false;
  for (let i = 1; i < series.length; i++) {
    if (series[i].angle - series[i - 1].angle > RIC_FULL_ROTATION_MAX_GAP_DEG) {
      return false;
    }
  }
  return true;
}

/** Solve a 3x3 linear system via Cramer's rule; null when singular. */
function solve3x3(
  m: [number[], number[], number[]],
  v: [number, number, number]
): [number, number, number] | null {
  const det = (a: number[][]): number =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const d = det(m);
  if (!Number.isFinite(d) || Math.abs(d) < 1e-12) return null;
  const replace = (col: number): number[][] =>
    m.map((row, i) => row.map((val, j) => (j === col ? v[i] : val)));
  return [det(replace(0)) / d, det(replace(1)) / d, det(replace(2)) / d];
}

/**
 * Least-squares amplitude of the spatial harmonic at `order` cycles/revolution.
 * For a full rotation this equals the Fourier coefficient magnitude without
 * requiring uniformly spaced samples. Returns null when the fit is singular.
 */
function harmonicAmplitudeAtOrder(
  samples: { angleDeg: number; value: number }[],
  order: number
): number | null {
  const n = samples.length;
  if (n < order * 4) return null;
  let s0 = 0;
  let sc = 0;
  let ss = 0;
  let scc = 0;
  let scs = 0;
  let sss = 0;
  let sy = 0;
  let scy = 0;
  let ssy = 0;
  for (const { angleDeg, value } of samples) {
    const theta = ((angleDeg * Math.PI) / 180) * order;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    s0 += 1;
    sc += c;
    ss += s;
    scc += c * c;
    scs += c * s;
    sss += s * s;
    sy += value;
    scy += value * c;
    ssy += value * s;
  }
  const solved = solve3x3(
    [
      [s0, sc, ss],
      [sc, scc, scs],
      [ss, scs, sss]
    ],
    [sy, scy, ssy]
  );
  if (!solved) return null;
  const [, b, c] = solved;
  return Math.sqrt(b * b + c * c);
}

/**
 * Spatial FFT 2nd harmonic (2 cycles/revolution). Returns null unless the
 * stored waveform covers a full rotation — never interpolates or pads.
 */
export function computeSpatialSecondHarmonic(
  data: RicDataPoint[] | null | undefined
): RicSpatialSecondHarmonic | null {
  if (!hasFullRotationRicData(data)) return null;
  const series = sanitizeRicSeries(data);
  const l12 = harmonicAmplitudeAtOrder(
    series.map((p) => ({ angleDeg: p.angle, value: p.l12 })),
    2
  );
  const l23 = harmonicAmplitudeAtOrder(
    series.map((p) => ({ angleDeg: p.angle, value: p.l23 })),
    2
  );
  const l31 = harmonicAmplitudeAtOrder(
    series.map((p) => ({ angleDeg: p.angle, value: p.l31 })),
    2
  );
  if (l12 == null || l23 == null || l31 == null) return null;
  return { l12: round3(l12), l23: round3(l23), l31: round3(l31) };
}

/** Raw Lmax/Lmin across all stored L12/L23/L31 values. */
export function computeInductanceRatio(
  data: RicDataPoint[] | null | undefined
): RicInductanceRatio | null {
  const series = sanitizeRicSeries(data);
  if (series.length === 0) return null;
  let max = -Infinity;
  let min = Infinity;
  for (const p of series) {
    for (const v of [p.l12, p.l23, p.l31]) {
      if (v > max) max = v;
      if (v < min) min = v;
    }
  }
  if (!Number.isFinite(max) || !(min > 0)) return null;
  return { max: round3(max), min: round3(min), ratio: round2(max / min) };
}

function smoothSeries(
  values: number[],
  applySmoothing: boolean
): number[] {
  if (!applySmoothing || values.length === 0) return [...values];
  return values.map((v, i) => {
    if (i === 0 || i === values.length - 1) return v;
    return (values[i - 1] + values[i] + values[i + 1]) / 3;
  });
}

function applySmoothingFilter(
  data: RicDataPoint[],
  applySmoothing: boolean
): RicDataPoint[] {
  if (!applySmoothing || data.length === 0) return data.map((p) => ({ ...p }));
  const l12 = smoothSeries(
    data.map((p) => p.l12),
    true
  );
  const l23 = smoothSeries(
    data.map((p) => p.l23),
    true
  );
  const l31 = smoothSeries(
    data.map((p) => p.l31),
    true
  );
  return data.map((p, i) => ({
    angle: p.angle,
    l12: l12[i],
    l23: l23[i],
    l31: l31[i]
  }));
}

/** % Peak-to-Peak Variation = ((Max − Min) / Average) × 100 */
export function percentPeakToPeak(values: number[]): number {
  const nums = values.filter((n) => Number.isFinite(n));
  if (nums.length === 0) return 0;
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  if (!(avg > 0) || !Number.isFinite(avg)) return 0;
  return round2(((max - min) / avg) * 100);
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const varSum =
    values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length;
  return Math.sqrt(varSum);
}

/**
 * Erratic peak variance from successive sample-to-sample % swings (mean of 3 phases).
 */
function computePeakVariance(data: RicDataPoint[]): number {
  if (data.length < 3) return 0;
  const phases: ("l12" | "l23" | "l31")[] = ["l12", "l23", "l31"];
  const phaseCvs: number[] = [];
  for (const key of phases) {
    const deltas: number[] = [];
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1][key];
      const cur = data[i][key];
      const mid = (prev + cur) / 2;
      if (mid > 0) deltas.push(Math.abs(((cur - prev) / mid) * 100));
    }
    if (deltas.length > 0) phaseCvs.push(stdDev(deltas));
  }
  if (phaseCvs.length === 0) return 0;
  return round2(phaseCvs.reduce((a, b) => a + b, 0) / phaseCvs.length);
}

function meanInductance(data: RicDataPoint[]): number {
  if (data.length === 0) return 0;
  let sum = 0;
  for (const p of data) sum += (p.l12 + p.l23 + p.l31) / 3;
  return sum / data.length;
}

function computeDegradation(
  current: RicDataPoint[],
  baseline: RicDataPoint[]
): number | null {
  if (current.length === 0 || baseline.length === 0) return null;
  const curMean = meanInductance(current);
  const baseMean = meanInductance(baseline);
  if (!(baseMean > 0)) return null;
  return round2(Math.abs(((curMean - baseMean) / baseMean) * 100));
}

function isolateRicFault(params: {
  maxVariation: number;
  peakVariance: number;
  peakVarianceErratic: boolean;
}): {
  fault: string;
  severity: RicFaultSeverity;
  recommendation: string;
} {
  const { maxVariation, peakVarianceErratic } = params;

  if (maxVariation > 7.0 && peakVarianceErratic) {
    return {
      fault: "Severe Rotor Asymmetry / Broken Bars",
      severity: "CRITICAL",
      recommendation:
        "Remove from service for rotor bar inspection; verify with MCSA sidebands."
    };
  }
  if (maxVariation > 4.0 || params.peakVariance > 5) {
    return {
      fault: "Dynamic Air Gap Eccentricity",
      severity: "WARNING",
      recommendation:
        "Inspect bearing fit, rotor centering, and soft-foot; re-run RIC after correction."
    };
  }
  return {
    fault: "Symmetrical Magnetic Rotor Circuit",
    severity: "NORMAL",
    recommendation: "Routine monitoring — rotor magnetic circuit within limits."
  };
}

/**
 * Full RIC analysis. Returns null when input series is empty / invalid.
 */
export function calculateRotorInfluence(
  data: RicDataPoint[],
  options?: { applySmoothing?: boolean; baselineData?: RicDataPoint[] }
): RotorInfluenceResult | null {
  const cleaned = sanitizeRicSeries(data);
  if (cleaned.length === 0) return null;

  const applySmoothing = Boolean(options?.applySmoothing);
  const smoothedData = applySmoothingFilter(cleaned, applySmoothing);

  const variationL12 = percentPeakToPeak(smoothedData.map((p) => p.l12));
  const variationL23 = percentPeakToPeak(smoothedData.map((p) => p.l23));
  const variationL31 = percentPeakToPeak(smoothedData.map((p) => p.l31));
  const maxVariation = round2(
    Math.max(variationL12, variationL23, variationL31)
  );
  const peakVariance = computePeakVariance(smoothedData);
  const peakVarianceErratic = peakVariance > 5;

  const eccentricityIndex = round2(
    (variationL12 + variationL23 + variationL31) / 3
  );

  // Computed from the raw cleaned waveform, not the smoothed display series:
  // smoothing can attenuate a real spatial harmonic.
  const spatialSecondHarmonic = computeSpatialSecondHarmonic(cleaned);
  const inductanceRatio = computeInductanceRatio(cleaned);

  const baselineClean = sanitizeRicSeries(options?.baselineData);
  const degradationPercent =
    baselineClean.length > 0
      ? computeDegradation(smoothedData, baselineClean)
      : null;
  const degradationFlagged =
    degradationPercent != null && degradationPercent > 2;

  const isolated = isolateRicFault({
    maxVariation,
    peakVariance,
    peakVarianceErratic
  });

  return {
    smoothedData,
    variationL12,
    variationL23,
    variationL31,
    maxVariation,
    peakVariance,
    peakVarianceErratic,
    eccentricityIndex,
    degradationPercent,
    degradationFlagged,
    spatialSecondHarmonic,
    inductanceRatio,
    fault: isolated.fault,
    severity: isolated.severity,
    recommendation: isolated.recommendation,
    hasData: true
  };
}

/** Radar / polar chart rows: `{ angleLabel, L12, L23, L31 }`. */
export function toRicRadarData(
  data: RicDataPoint[]
): { angleLabel: string; L12: number; L23: number; L31: number }[] {
  return sanitizeRicSeries(data).map((p) => ({
    angleLabel: `${Math.round(p.angle)}°`,
    L12: round3(p.l12),
    L23: round3(p.l23),
    L31: round3(p.l31)
  }));
}

/**
 * Parse clipboard / CSV / TSV RIC tables (Angle, L12, L23, L31).
 * Skips header rows and non-numeric junk safely.
 */
export function parseRicClipboardText(text: string): RicDataPoint[] {
  if (!text || typeof text !== "string") return [];
  const lines = text.split(/\r?\n/);
  const points: RicDataPoint[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    // Skip obvious headers
    if (/angle|deg|position|l12|t1|inductance|phase/i.test(line) && !/\d/.test(line)) {
      continue;
    }
    if (/^[a-zA-Z_\-%°]+/.test(line) && !/\d/.test(line.slice(0, 3))) {
      // header-ish; still try parse if numbers exist later
    }

    const cells = line
      .split(/[\t,;|]+/)
      .map((c) => c.trim().replace(/°/g, ""))
      .filter((c) => c.length > 0);

    if (cells.length < 4) continue;

    const nums = cells
      .map((c) => Number(c.replace(/[^0-9.+\-eE]/g, "")))
      .filter((n) => Number.isFinite(n));

    if (nums.length < 4) continue;

    // Prefer first 4 as angle, l12, l23, l31
    const point = sanitizeRicPoint({
      angle: nums[0],
      l12: nums[1],
      l23: nums[2],
      l31: nums[3]
    });
    if (point) points.push(point);
  }

  // Deduplicate by angle (last wins)
  const byAngle = new Map<number, RicDataPoint>();
  for (const p of points) byAngle.set(round2(p.angle), p);
  return [...byAngle.values()].sort((a, b) => a.angle - b.angle);
}
