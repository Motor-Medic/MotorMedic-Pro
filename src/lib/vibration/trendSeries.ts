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
