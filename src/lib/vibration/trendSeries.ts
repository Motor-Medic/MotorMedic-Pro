/**
 * Honest trend-slope guard.
 *
 * A trend line needs at least two distinct measurement timestamps. With fewer
 * than two, Recharts draws a degenerate flat or diagonal line from a single
 * row, which implies a slope that was never measured. Callers render the lone
 * point plus this helper instead.
 */

export const SPARSE_TREND_HELPER_TEXT =
  "Additional historical readings required to plot trend slope";

export interface TrendTimestampLike {
  timestamp?: string | null;
  date?: string | null;
}

/** Shared time-range vocabulary for every vibration trend surface. */
export type TrendTimeRange = "7D" | "30D" | "90D" | "1Y" | "Custom";

export const TREND_RANGE_DAYS: Record<
  Exclude<TrendTimeRange, "Custom">,
  number
> = {
  "7D": 7,
  "30D": 30,
  "90D": 90,
  "1Y": 365
};

const DAY_MS = 86_400_000;

export function trendTimestampMs(point: TrendTimestampLike): number | null {
  const raw = point.timestamp || point.date || "";
  if (!raw.trim()) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/** Null cutoff means "no upper bound" (Custom = all saved rows). */
export function trendRangeCutoffMs(
  range: TrendTimeRange,
  nowMs: number = Date.now()
): number | null {
  if (range === "Custom") return null;
  return nowMs - TREND_RANGE_DAYS[range] * DAY_MS;
}

/**
 * Single window predicate used by both the enveloping charts and the
 * Enveloping History table so they can never drift apart.
 */
export function filterTrendByTimeRange<T extends TrendTimestampLike>(
  points: readonly T[],
  range: TrendTimeRange,
  nowMs: number = Date.now()
): T[] {
  const cutoff = trendRangeCutoffMs(range, nowMs);
  if (cutoff == null) return points.slice();
  return points.filter((point) => {
    const timestampMs = trendTimestampMs(point);
    return timestampMs != null && timestampMs >= cutoff && timestampMs <= nowMs;
  });
}

/**
 * Non-forking adapter for surfaces that must share the exact same window
 * predicate but live outside the vibration tab (e.g. the IR trend charts).
 * It delegates to `filterTrendByTimeRange` so 7D/30D/90D/1Y can never drift.
 */
export function windowTrendByTimeRange<T extends TrendTimestampLike>(
  points: readonly T[],
  range: TrendTimeRange,
  nowMs: number = Date.now()
): T[] {
  return filterTrendByTimeRange(points, range, nowMs);
}

export function distinctTrendTimestampCount(
  points: readonly TrendTimestampLike[]
): number {
  const keys = new Set<string>();
  for (const point of points) {
    const key = String(point.timestamp || point.date || "").trim();
    if (key) keys.add(key);
  }
  return keys.size;
}

/** True when there are readings but fewer than two distinct timestamps. */
export function isSparseTrendSeries(
  points: readonly TrendTimestampLike[]
): boolean {
  return points.length > 0 && distinctTrendTimestampCount(points) < 2;
}
