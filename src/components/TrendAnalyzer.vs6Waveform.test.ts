import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * SLICE-VS6 source contract for the Waveform Metrics sub-tab.
 *
 * Pins three things that are easy to regress:
 *  1. The waveform snapshot (time waveform + KPI cards) intentionally reads its
 *     own raw latest record — VS-1 exception — and the UI says so.
 *  2. Peak-to-peak still routes through the H2 velocity unit selector
 *     (04be08f) and the phantom Spectrum A/B click handler stays deleted
 *     (a8ab6f6).
 *  3. The crest/impact trend series share the trendSsot window contract with
 *     Broadband/Spectral/Enveloping: window, running-state, sort, same-date
 *     labels, latest-in-window, stopped and empty-window notes.
 */

const src = readFileSync(
  fileURLToPath(new URL("./TrendAnalyzer.tsx", import.meta.url)),
  "utf8"
).replace(/\r\n/g, "\n");

const waveformSrc = readFileSync(
  fileURLToPath(new URL("./trendAnalyzer/WaveformTab.tsx", import.meta.url)),
  "utf8"
).replace(/\r\n/g, "\n");

const waveformTestSrc = readFileSync(
  fileURLToPath(new URL("./trendAnalyzer/WaveformTab.test.tsx", import.meta.url)),
  "utf8"
).replace(/\r\n/g, "\n");

function block(start: string, end: string): string {
  const from = src.indexOf(start);
  const to = src.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return src.slice(from, to);
}

const snapshotBlock = block(
  "const latestWaveformRecord = useMemo",
  "const hasVibrationDiagnosticRecord"
);

const waveformTrendBlock = block(
  "const waveformTrendSeries = useMemo",
  "const latestWaveformAnalysisMetrics = useMemo"
);

describe("SLICE-VS6 waveform snapshot stays on its own raw latest record", () => {
  it("reads the raw newest row, not the windowed SSOT array", () => {
    expect(snapshotBlock).toContain("latestVibrationRecordFromRows(vibAnalyses)");
    expect(snapshotBlock).not.toContain("windowedVibAnalyses");
    expect(src).toContain("const latestWaveformAnalysisMetrics = useMemo");
    expect(src).toContain("const fromRecord = latestWaveformRecord?.waveformAnalysis;");
  });

  it("labels the exception in the UI instead of silently decoupling", () => {
    expect(waveformSrc).toContain('data-testid="waveform-snapshot-exception-note"');
    expect(waveformSrc).toContain(
      "Raw waveform snapshot — not filtered by running-state or window"
    );
    expect(waveformSrc).toContain("charts below use the shared time window");
  });

  it("keeps broadband KPI/matrix readers off the snapshot record", () => {
    expect(src).toContain("readVibrationOverallVelocity(latestVibrationRow)");
    expect(src).toContain("readVibrationPerAxis(latestVibrationRow)");
    expect(src).toContain("reconcileVibrationVerdict(latestVibrationRow");
  });
});

describe("SLICE-VS6 04be08f peak-to-peak through H2", () => {
  it("converts the stored mm/s value with the tenant velocity unit", () => {
    expect(waveformSrc).toContain(
      "formatVelocityValue(latestMetrics.peakToPeak, velocityUnit)"
    );
    expect(waveformSrc).toContain("velocityUnitLabel(velocityUnit)");
    expect(src).toContain("velocityUnit={displayUnits.velocity}");
  });

  it("never re-introduces a raw hedge or an inline conversion factor", () => {
    expect(waveformSrc).not.toContain("or chart unit");
    expect(waveformSrc).not.toContain("MM_PER_INCH");
    expect(waveformSrc).not.toContain("25.4");
  });

  it("keeps the mm/s <-> in/s assertion in the WaveformTab suite", () => {
    expect(waveformTestSrc).toContain('velocityUnit="in/s"');
    expect(waveformTestSrc).toContain('expect(screen.getByText("1.0000")).toBeTruthy();');
    expect(waveformTestSrc).toContain('expect(screen.getByText("in/s")).toBeTruthy();');
  });
});

describe("SLICE-VS6 a8ab6f6 phantom Spectrum A/B removal", () => {
  it("keeps the click handler, A/B state and comparison copy deleted", () => {
    expect(src).not.toContain("handlePointClick");
    expect(src).not.toContain("selectedPointA");
    expect(src).not.toContain("selectedPointB");
    expect(src).not.toContain("nextPick");
    expect(src).not.toContain("Click any data point to set as Spectrum A or B");
    expect(src).not.toContain("HISTORICAL & SPECTRUM COMPARISON");
  });

  it("keeps the regression assertions that lock the removal", () => {
    const expandSrc = readFileSync(
      fileURLToPath(new URL("./TrendAnalyzer.chartExpand.test.ts", import.meta.url)),
      "utf8"
    );
    expect(expandSrc).toContain("SLICE-P phantom Spectrum A/B affordance");
    expect(expandSrc).toContain('expect(src).not.toContain("handlePointClick");');
  });
});

describe("SLICE-VS6 waveform metrics trend SSOT lockstep", () => {
  it("reads the shared windowed array, not a second predicate", () => {
    expect(waveformTrendBlock).toContain("[...windowedVibAnalyses].reverse()");
    expect(waveformTrendBlock).not.toContain("[...vibAnalyses].reverse()");
    expect(waveformTrendBlock).not.toContain("filterTrendByTimeRange(");
    expect(waveformTrendBlock).toContain(
      "vibrationStoppedSampleLabel(analysis)"
    );
    expect(waveformTrendBlock).toContain("applySameDateSequenceLabels(rows)");
  });

  it("keeps latest-in-window, stopped and empty-window guards", () => {
    expect(src).toContain("const latestWaveformTrendPoint =");
    expect(src).toContain("waveformTrendSeries[waveformTrendSeries.length - 1]");
    expect(src).toContain("waveformHasStoppedSamples");
    expect(src).toContain("waveformWindowEmpty");
    expect(waveformSrc).toContain('data-testid="waveform-window-empty-note"');
    expect(waveformSrc).toContain('data-testid="waveform-stopped-series-note"');
    expect(waveformSrc).toContain('data-testid="waveform-latest-trend-summary"');
  });

  it("renders same-date labels and stopped labels in both trend charts", () => {
    expect((waveformSrc.match(/dataKey="dateLabel"/g) ?? []).length).toBe(2);
    expect(waveformSrc).toContain("stoppedLabel: p.stoppedLabel ?? null");
    expect(waveformSrc).toContain("labelFormatter={(label, payload) =>");
    expect(waveformSrc).toContain("isSparseTrendSeries(data)");
  });

  it("keeps null metrics null instead of zero-filling", () => {
    expect(src).toContain(
      "positiveOrNull(fromRecord?.peakToPeak) ?? fromTrend?.peakToPeak ?? null"
    );
    expect(src).toContain("positiveOrNull(fromRecord?.crestFactor) ??");
    expect(waveformSrc).toContain('{crest != null ? crest.toFixed(2) : "—"}');
    expect(waveformSrc).toContain('impacts != null ? String(impacts) : "—"');
  });
});
