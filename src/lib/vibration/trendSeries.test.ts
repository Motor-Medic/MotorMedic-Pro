import { describe, expect, it } from "vitest";
import {
  SPARSE_TREND_HELPER_TEXT,
  applySameDateSequenceLabels,
  distinctTrendTimestampCount,
  filterTrendByTimeRange,
  isSparseTrendSeries,
  trendRangeCutoffMs
} from "./trendSeries";

describe("SLICE-J sparse trend guard", () => {
  it("flags a single reading as sparse", () => {
    const points = [{ timestamp: "2026-01-01T00:00:00.000Z" }];
    expect(distinctTrendTimestampCount(points)).toBe(1);
    expect(isSparseTrendSeries(points)).toBe(true);
  });

  it("flags duplicate timestamps as sparse (one distinct measurement)", () => {
    const points = [
      { timestamp: "2026-01-01T00:00:00.000Z" },
      { timestamp: "2026-01-01T00:00:00.000Z" }
    ];
    expect(distinctTrendTimestampCount(points)).toBe(1);
    expect(isSparseTrendSeries(points)).toBe(true);
  });

  it("does not flag an empty series (empty state owns that case)", () => {
    expect(isSparseTrendSeries([])).toBe(false);
  });

  it("plots normally with two or more distinct timestamps", () => {
    const points = [
      { timestamp: "2026-01-01T00:00:00.000Z" },
      { timestamp: "2026-01-02T00:00:00.000Z" }
    ];
    expect(distinctTrendTimestampCount(points)).toBe(2);
    expect(isSparseTrendSeries(points)).toBe(false);
  });

  it("falls back to the display date when no timestamp is stored", () => {
    const points = [{ date: "Jan 1" }, { date: "Jan 2" }];
    expect(distinctTrendTimestampCount(points)).toBe(2);
    expect(isSparseTrendSeries(points)).toBe(false);
  });

  it("uses the required helper copy", () => {
    expect(SPARSE_TREND_HELPER_TEXT).toBe(
      "Additional historical readings required to plot trend slope"
    );
  });
});

describe("SLICE-VS5 deterministic same-date labels", () => {
  it("suffixes repeated dates in input order and leaves singles clean", () => {
    const rows = [
      { date: "Oct 30", dateLabel: "Oct 30" },
      { date: "Oct 30", dateLabel: "Oct 30" },
      { date: "Oct 31", dateLabel: "Oct 31" }
    ];
    const first = applySameDateSequenceLabels(rows);
    const second = applySameDateSequenceLabels(rows);
    expect(first.map((row) => row.dateLabel)).toEqual([
      "Oct 30 \u00b7 1",
      "Oct 30 \u00b7 2",
      "Oct 31"
    ]);
    expect(second).toEqual(first);
    // Original rows are not mutated.
    expect(rows[0].dateLabel).toBe("Oct 30");
  });
});

describe("SLICE-L shared trend time window", () => {
  const now = Date.parse("2026-10-30T12:00:00.000Z");
  const daysAgo = (days: number) =>
    new Date(now - days * 86_400_000).toISOString();
  const series = [
    { id: "1d", timestamp: daysAgo(1) },
    { id: "10d", timestamp: daysAgo(10) },
    { id: "45d", timestamp: daysAgo(45) },
    { id: "100d", timestamp: daysAgo(100) },
    { id: "400d", timestamp: daysAgo(400) },
    { id: "missing", timestamp: "" }
  ];

  it("windows each range with the same cutoff the charts use", () => {
    expect(trendRangeCutoffMs("7D", now)).toBe(now - 7 * 86_400_000);
    expect(trendRangeCutoffMs("30D", now)).toBe(now - 30 * 86_400_000);
    expect(trendRangeCutoffMs("90D", now)).toBe(now - 90 * 86_400_000);
    expect(trendRangeCutoffMs("1Y", now)).toBe(now - 365 * 86_400_000);
    expect(trendRangeCutoffMs("Custom", now)).toBeNull();
  });

  it("returns exactly the rows inside 7D / 30D / 90D / 1Y", () => {
    expect(filterTrendByTimeRange(series, "7D", now).map((p) => p.id)).toEqual([
      "1d"
    ]);
    expect(
      filterTrendByTimeRange(series, "30D", now).map((p) => p.id)
    ).toEqual(["1d", "10d"]);
    expect(
      filterTrendByTimeRange(series, "90D", now).map((p) => p.id)
    ).toEqual(["1d", "10d", "45d"]);
    expect(
      filterTrendByTimeRange(series, "1Y", now).map((p) => p.id)
    ).toEqual(["1d", "10d", "45d", "100d"]);
  });

  it("Custom has no cutoff and a zero-row window stays honestly empty", () => {
    expect(filterTrendByTimeRange(series, "Custom", now)).toHaveLength(
      series.length
    );
    expect(filterTrendByTimeRange(series, "7D", now - 500 * 86_400_000)).toEqual(
      []
    );
  });

  it("table window === chart window for the same range", () => {
    const chartWindow = filterTrendByTimeRange(series, "30D", now);
    const tableWindow = filterTrendByTimeRange(series, "30D", now);
    expect(tableWindow).toEqual(chartWindow);
  });
});
