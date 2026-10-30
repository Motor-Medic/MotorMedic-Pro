import { describe, expect, it } from "vitest";
import {
  SPARSE_TREND_HELPER_TEXT,
  distinctTrendTimestampCount,
  isSparseTrendSeries
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
