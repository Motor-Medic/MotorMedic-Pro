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
 */

export const MIN_POINTS = 4;
export const MIN_SPAN_DAYS = 30;
export const ISO_C_D_BOUNDARY = 7.1;
export const MAX_WINDOW_DAYS = 180;

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
  slopeGatePass: boolean;
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

export function slopeGatePass(fit: Fit | null, worsening: WorseningDirection): boolean {
  if (!fit) return false;
  return worsening === "increase" ? fit.slope > 0 : fit.slope < 0;
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

  const g9Pass = n >= MIN_POINTS && spanDays >= MIN_SPAN_DAYS;
  const gatePass = slopeGatePass(fit, worsening);

  let fWindow: FWindow | null = null;
  let rulLabel: string | null = null;
  if (g9Pass && gatePass && fit && threshold) {
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
      upper: dSlow <= 0 || !Number.isFinite(dSlow) ? Infinity : dSlow,
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
    slopeGatePass: gatePass,
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
