/**
 * pfEngine — shared P-F prognostics math (pure functions).
 *
 * Extracted from VibrationPrognosticsTab without behavior change, then
 * extended with an explicit SERIES SELECTION POLICY:
 *   default projected series = tracked candidate with the LARGEST N;
 *   ties broken by severity rank (higher wins).
 *
 * G8: every RUL / F-window value is a modeled projection, not a measurement.
 * G9: N < MIN_POINTS or span < MIN_SPAN_DAYS → no projection (confess).
 * Absence of a functional threshold → slope only, no F window (confess).
 * Worsening direction is part of the question: rising metrics (amplitude,
 * ΔT, ppm, imbalance %) vs falling metrics (insulation resistance).
 *
 * Trend gate (statistical, not calendar-superstitious): a trend is
 * established iff N ≥ MIN_POINTS AND span ≥ MIN_SPAN_DAYS AND
 * |slope| ≥ TREND_SIG_FACTOR × SE of slope. Every verdict names its own
 * reason (verdict + verdict-derived text in the tabs): WINDOW / STABLE /
 * IMPROVING / THIN / NO THRESHOLD. Honesty cuts both ways — suppressing a
 * significant healthy trend (IMPROVING) is as false as extrapolating noise.
 */

export const MIN_POINTS = 4;
export const MIN_SPAN_DAYS = 7;
export const ISO_C_D_BOUNDARY = 7.1;
export const MAX_WINDOW_DAYS = 180;
/** Statistical significance factor for the trend gate: |slope| ≥ factor × SE. */
export const TREND_SIG_FACTOR = 2;
/** Wording stated on every tab's basis card. */
export const TREND_GATE_LABEL = "trend gate: |slope| >= 2 x SE";

/** Which message the tab renders; every kind names its own reason. */
export type PfVerdict = "window" | "stable" | "improving" | "thin" | "no-threshold";

/** How the measurement gets worse over time. */
export type WorseningDirection = "increase" | "decrease";

export interface SeriesPoint {
  day: number;
  value: number;
  date: string;
}

export interface RawPoint {
  value: number;
  date: string;
}

export interface Fit {
  slope: number;
  intercept: number;
  stdErr: number;
  seOfSlope: number;
}

export interface Threshold {
  value: number;
  provenance: string;
}

export interface FWindow {
  lower: number;
  upper: number;
  median: number;
}

/** One tracked series an analyst may project. */
export interface SeriesCandidate {
  id: string;
  label: string;
  unit: string;
  /** Raw stored points (date + value); engine applies fractional day offsets. */
  points: RawPoint[];
  /** Higher = more severe; used only to break N ties. */
  severityRank: number;
  /** Default "increase" (vibration-style rising metrics). */
  worsening?: WorseningDirection;
}

export interface PfDerivation {
  seriesLabel: string;
  unit: string;
  pts: SeriesPoint[];
  n: number;
  spanDays: number;
  fit: Fit | null;
  functionalThreshold: Threshold | null;
  detectionDate: string | null;
  g9Pass: boolean;
  significancePass: boolean;
  slopeGatePass: boolean;
  verdict: PfVerdict;
  fWindow: FWindow | null;
  rulLabel: string | null;
  selectionNote: string;
  worsening: WorseningDirection;
  candidateSummaries: { id: string; label: string; n: number; severityRank: number }[];
}

export function leastSquares(pts: SeriesPoint[]): Fit | null {
  const n = pts.length;
  if (n < 2) return null;
  const meanX = pts.reduce((s, p) => s + p.day, 0) / n;
  const meanY = pts.reduce((s, p) => s + p.value, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of pts) {
    sxx += (p.day - meanX) ** 2;
    sxy += (p.day - meanX) * (p.value - meanY);
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  let sse = 0;
  for (const p of pts) {
    const pred = intercept + slope * p.day;
    sse += (p.value - pred) ** 2;
  }
  const se = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
  const seOfSlope = sxx > 0 ? se / Math.sqrt(sxx) : 0;
  return { slope, intercept, stdErr: se, seOfSlope };
}

export function dayLabel(days: number): string {
  if (!Number.isFinite(days)) return "—";
  if (days > MAX_WINDOW_DAYS) return `Unconstrained (>${MAX_WINDOW_DAYS}d)`;
  if (days < 0) return "already crossed";
  return `${Math.round(days)} days`;
}

export function findDetectionDate(
  pts: SeriesPoint[],
  functional: number,
  storedDetection: string | null,
  worsening: WorseningDirection = "increase",
): string | null {
  if (storedDetection) return storedDetection;
  for (const p of pts) {
    const crossed =
      worsening === "increase" ? p.value >= functional : p.value <= functional;
    if (crossed) return p.date;
  }
  return null;
}

/** Fractional day offsets from the first point (same-day-safe; no rounding). */
export function toDayOffsets(raw: RawPoint[]): SeriesPoint[] {
  if (raw.length === 0) return [];
  const sorted = [...raw].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const t0 = new Date(sorted[0].date).getTime();
  if (sorted.length < 2) {
    return sorted.map((p) => ({ day: 0, value: p.value, date: p.date }));
  }
  return sorted.map((p) => ({
    day: (new Date(p.date).getTime() - t0) / 86400000,
    value: p.value,
    date: p.date,
  }));
}

export function spanDaysOf(pts: SeriesPoint[]): number {
  const n = pts.length;
  return n >= 2 ? pts[n - 1].day - pts[0].day : 0;
}

/**
 * Selection policy: largest N wins; ties broken by severityRank (higher first).
 * Stable for equal N and severity (first in list order).
 */
export function selectDefaultCandidate(candidates: SeriesCandidate[]): SeriesCandidate | null {
  if (!candidates.length) return null;
  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    if (c.points.length > best.points.length) best = c;
    else if (c.points.length === best.points.length && c.severityRank > best.severityRank) best = c;
  }
  return best;
}

export function resolveSelectedId(
  candidates: SeriesCandidate[],
  overrideId: string | null,
): string | null {
  if (!candidates.length) return null;
  if (overrideId != null && candidates.some((c) => c.id === overrideId)) {
    return overrideId;
  }
  return selectDefaultCandidate(candidates)?.id ?? null;
}

export interface ExclusionVerdict {
  count: number;
  components: string[];
}

export function componentExclusionVerdict(
  rows: { component?: string | null }[],
  trackedComponent: string | null,
): ExclusionVerdict {
  if (!trackedComponent) return { count: 0, components: [] };
  const dropped = rows.filter((r) => r.component !== trackedComponent);
  const components = [...new Set(dropped.map((r) => r.component ?? "unlabeled"))].sort();
  return { count: dropped.length, components };
}

export function slopeGatePass(fit: Fit | null, worsening: WorseningDirection): boolean {
  if (!fit) return false;
  return worsening === "increase" ? fit.slope > 0 : fit.slope < 0;
}

/** Statistical trend gate: |slope| ≥ TREND_SIG_FACTOR × SE of slope. */
export function significanceGatePass(fit: Fit | null): boolean {
  if (!fit) return false;
  if (!Number.isFinite(fit.slope) || !Number.isFinite(fit.seOfSlope)) return false;
  // Perfect fit (SE = 0): slope stands on its own only if it is not flat.
  if (fit.seOfSlope === 0) return fit.slope !== 0;
  return Math.abs(fit.slope) >= TREND_SIG_FACTOR * fit.seOfSlope;
}

export interface DerivePfInput {
  candidates: SeriesCandidate[];
  overrideId: string | null;
  threshold: Threshold | null;
  storedDetection: string | null;
}

export function derivePf(input: DerivePfInput): PfDerivation {
  const { candidates, threshold, storedDetection } = input;
  const selectedId = resolveSelectedId(candidates, input.overrideId);
  const selected = candidates.find((c) => c.id === selectedId) ?? null;
  const isDefault =
    selected != null &&
    (input.overrideId == null ||
      selectDefaultCandidate(candidates)?.id === selected.id);

  const worsening: WorseningDirection = selected?.worsening ?? "increase";
  const pts = selected ? toDayOffsets(selected.points) : [];
  const n = pts.length;
  const spanDays = spanDaysOf(pts);
  const fit = n >= 2 ? leastSquares(pts) : null;

  const detectionDate =
    pts.length > 0 && threshold
      ? findDetectionDate(pts, threshold.value, storedDetection, worsening)
      : storedDetection;

  // Gate chain: (1) thin history, (2) statistical significance, (3) direction.
  const g9Pass = n >= MIN_POINTS && spanDays >= MIN_SPAN_DAYS;
  const significancePass = significanceGatePass(fit);
  const gatePass = slopeGatePass(fit, worsening);

  // Every verdict names its own reason; selection policy/thresholds unchanged.
  const verdict: PfVerdict = !g9Pass
    ? "thin"
    : !significancePass
      ? "stable"
      : !gatePass
        ? "improving"
        : !threshold
          ? "no-threshold"
          : "window";

  let fWindow: FWindow | null = null;
  let rulLabel: string | null = null;
  if (verdict === "window" && fit && threshold) {
    const last = pts[n - 1];
    const toDays = (sl: number): number => {
      if (worsening === "increase") {
        if (!Number.isFinite(sl) || sl <= 0) return Infinity;
        return (threshold.value - last.value) / sl;
      }
      // falling toward threshold: sl must be negative; remaining = last - threshold
      if (!Number.isFinite(sl) || sl >= 0) return Infinity;
      return (last.value - threshold.value) / -sl;
    };
    const faster = worsening === "increase" ? fit.slope + fit.seOfSlope : fit.slope - fit.seOfSlope;
    const slower = worsening === "increase" ? fit.slope - fit.seOfSlope : fit.slope + fit.seOfSlope;
    const dMed = toDays(fit.slope);
    const dFast = toDays(faster);
    const dSlow = toDays(slower);
    fWindow = {
      lower: dFast,
      upper: Number.isFinite(dSlow) ? dSlow : Infinity,
      median: dMed,
    };
    rulLabel = Number.isFinite(dMed) ? dayLabel(dMed) : `Unconstrained (>${MAX_WINDOW_DAYS}d)`;
  }

  const seriesLabel = selected
    ? selected.label
    : "no tracked series on this record — series unavailable";

  const selectionNote = selected
    ? isDefault
      ? `projected series: ${selected.label} — longest history, ${selected.points.length} points (policy: largest N, ties by severity)`
      : `projected series: ${selected.label} — analyst override (${selected.points.length} points; default was ${
          selectDefaultCandidate(candidates)?.label ?? "—"
        })`
    : "no candidate series";

  return {
    seriesLabel,
    unit: selected?.unit ?? "",
    pts,
    n,
    spanDays,
    fit,
    functionalThreshold: threshold,
    detectionDate,
    g9Pass,
    significancePass,
    slopeGatePass: gatePass,
    verdict,
    fWindow,
    rulLabel,
    selectionNote,
    worsening,
    candidateSummaries: candidates.map((c) => ({
      id: c.id,
      label: c.label,
      n: c.points.length,
      severityRank: c.severityRank,
    })),
  };
}
