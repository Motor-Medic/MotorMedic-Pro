import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  filterTrendByTimeRange,
  isSparseTrendSeries
} from "../lib/vibration/trendSeries";

const src = readFileSync(
  fileURLToPath(new URL("./TrendAnalyzer.tsx", import.meta.url)),
  "utf8"
);

function block(start: string, end: string): string {
  const from = src.indexOf(start);
  const to = src.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return src.slice(from, to);
}

describe("SLICE-N one shared window across all Trend Analyzer surfaces", () => {
  it("filters the raw vibration analyses exactly once into the shared window", () => {
    const shared = block(
      "const windowedVibAnalyses = useMemo",
      "const healthTrendSeries = useMemo"
    );
    expect(shared).toContain(
      "filterTrendByTimeRange(vibAnalyses, timeRange)"
    );
    expect((src.match(/filterTrendByTimeRange\(/g) ?? []).length).toBe(1);
  });

  it("derives broadband (health + peak velocity) from the shared window", () => {
    const health = block(
      "const healthTrendSeries = useMemo",
      "const velocityTrendSeries = useMemo"
    );
    const velocity = block(
      "const velocityTrendSeries = useMemo",
      "const healthTrendIsSparse = useMemo"
    );
    expect(health).toContain("[...windowedVibAnalyses]");
    expect(health).toContain("[windowedVibAnalyses]");
    expect(velocity).toContain("[...windowedVibAnalyses]");
    expect(velocity).toContain("[windowedVibAnalyses]");
  });

  it("derives the spectral 1X/2X/overall series from the same window", () => {
    const spectral = block(
      "const spectralHarmonicTrend = useMemo",
      "const hasAnySpectralTrend"
    );
    expect(spectral).toContain(
      "toSpectralHarmonicInputs(spectralScopeRows)"
    );
    expect(spectral).not.toContain("[...vibAnalyses].reverse()");
  });

  it("derives the enveloping chart + table window from the same window", () => {
    const enveloping = block(
      "const envelopingTrendWindow = useMemo",
      "const envelopingGeChartData = useMemo"
    );
    expect(enveloping).toContain("[...windowedVibAnalyses].reverse()");
    expect(enveloping).not.toContain("filterTrendByTimeRange(");

    const table = block(
      "Enveloping History",
      "{vibMode === \"waveform\""
    );
    expect(table).toContain("[...envelopingTrendWindow].reverse()");
    expect(table).not.toContain("[...envelopingTrendSeries].reverse()");
  });

  it("evaluates sparse/empty guards on the windowed series", () => {
    expect(src).toContain("isSparseTrendSeries(healthTrendSeries)");
    expect(src).toContain("isSparseTrendSeries(velocityTrendSeries)");
    expect(src).toContain("spectralTrendIsSparse");
    expect(src).toContain(
      "vibrationRowsInScope(windowedVibAnalyses, runningOnly)"
    );
    expect(src).toContain("No spectral readings in the selected {timeRange} window.");
    expect(src).toContain("No enveloping history in the selected {timeRange} window.");
  });

  it("a 7D range over old data is empty, never a stale full-range line", () => {
    const now = Date.parse("2026-10-30T12:00:00.000Z");
    const oldData = [
      { timestamp: "2026-01-01T00:00:00.000Z" },
      { timestamp: "2026-02-01T00:00:00.000Z" }
    ];
    const windowed = filterTrendByTimeRange(oldData, "7D", now);
    expect(windowed).toEqual([]);
    expect(isSparseTrendSeries(windowed)).toBe(false);

    const oneInWindow = filterTrendByTimeRange(
      [
        { timestamp: "2026-02-01T00:00:00.000Z" },
        { timestamp: "2026-10-29T00:00:00.000Z" }
      ],
      "7D",
      now
    );
    expect(oneInWindow).toHaveLength(1);
    expect(isSparseTrendSeries(oneInWindow)).toBe(true);
  });
});

describe("SLICE-N Custom control is no longer silently all-range", () => {
  it("disables Custom with an explanatory tooltip", () => {
    expect(src).toContain('const isCustom = range === "Custom"');
    expect(src).toContain("disabled={isCustom}");
    expect(src).toContain("aria-disabled={isCustom}");
    expect(src).toContain("Custom range picker is not available yet");
    expect(src).toContain("if (!isCustom) setTimeRange(range)");
  });

  it("keeps 7D/30D/90D/1Y as the only live range buttons", () => {
    expect(src).toContain(
      '(["7D", "30D", "90D", "1Y", "Custom"] as TimeRange[])'
    );
    expect(src).toContain('useState<TimeRange>("30D")');
  });
});
