import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * SLICE-VS5 source contract. The Enveloping tab is large, so these assertions
 * pin the honesty rules that are easy to regress: defect frequencies are
 * dormant unless geometry AND gating-quality RPM exist, the series reads the
 * shared trendSsot window, and the capture-default 1780 is never persisted.
 */

const src = readFileSync(
  fileURLToPath(new URL("./TrendAnalyzer.tsx", import.meta.url)),
  "utf8"
).replace(/\r\n/g, "\n");

const recordSrc = readFileSync(
  fileURLToPath(
    new URL("../lib/vibration/vibrationDiagnosticRecord.ts", import.meta.url)
  ),
  "utf8"
).replace(/\r\n/g, "\n");

function block(start: string, end: string): string {
  const from = src.indexOf(start);
  const to = src.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return src.slice(from, to);
}

const envelopingWindow = block(
  "const envelopingTrendWindow = useMemo",
  "const envelopingHasStoppedSamples"
);

const bearingCalculation = block(
  "const calculatedBearingFaults = useMemo",
  "const latestEnvelopingPoint"
);

describe("SLICE-VS5 defect-frequency dormancy", () => {
  it("gates calculated defect frequencies on stored geometry AND quality RPM", () => {
    expect(bearingCalculation).toContain("if (!bearingGeometryConfigured) return null;");
    expect(bearingCalculation).toContain("if (!bearingRpmReading.gatingQuality");
    expect(bearingCalculation).not.toContain("machineSpecs.rpm");
    expect(bearingCalculation).not.toContain("1780");
    expect(src).toContain("readVibrationRpmProvenance(latestVibrationRow)");
  });

  it("renders the overlay only from the gated calculation", () => {
    expect(src).toContain(
      "{calculatedBearingFaults && vibExtractedEnvelopeChart.length > 0 && ("
    );
    expect(src).toContain('data-testid="enveloping-order-overlay"');
    expect(src).toContain('data-testid={`enveloping-order-${line.key}`}');
  });

  it("shows an honest dormant note instead of a guessed frequency", () => {
    expect(src).toContain('data-testid="enveloping-bearing-dormant-note"');
    expect(src).toContain("ENVELOPING_BEARING_DORMANT_NOTE");
    expect(src).toContain(
      "envelope trends shown without defect-frequency overlay"
    );
  });

  it("never persists the silent 1780 capture default", () => {
    expect(recordSrc).not.toContain(": 1780");
    expect(recordSrc).toContain("NO silent 1780 capture default");
    expect(recordSrc).toContain("motorSpeedRPM: storedRpm");
  });
});

describe("SLICE-VS5 enveloping SSOT lockstep", () => {
  it("reads the shared windowed analysis array, never a second predicate", () => {
    expect(envelopingWindow).toContain("[...windowedVibAnalyses].reverse()");
    expect(envelopingWindow).not.toContain("filterTrendByTimeRange(");
    expect(envelopingWindow).toContain("vibrationStoppedSampleLabel(analysis)");
    expect(envelopingWindow).toContain("applySameDateSequenceLabels(rows)");
    expect(src).toContain(
      "vibrationRowsInScope(windowedVibAnalyses, runningOnly)"
    );
  });

  it("keeps latest-in-window metrics, sparse, stopped, and empty guards", () => {
    expect(src).toContain("const latestEnvelopingPoint =");
    expect(src).toContain("envelopingTrendWindow.length > 0");
    expect(src).toContain("isSparseTrendSeries(envelopingTrendWindow)");
    expect(src).toContain("envelopingWindowEmpty");
    expect(src).toContain('data-testid="enveloping-window-empty-note"');
    expect(src).toContain('data-testid="enveloping-stopped-series-note"');
  });

  it("renders same-date labels and honest nulls in the history table", () => {
    expect(src).toContain("{row.dateLabel}");
    expect(src).toContain("{row.stoppedLabel ? (");
    expect(src).toContain('data-testid="enveloping-envelope-provenance"');
  });

  it("states the envelope unit physics without converting gE", () => {
    expect(src).toContain('data-testid="enveloping-unit-physics-note"');
    expect(src).toContain("ENVELOPING_UNIT_PHYSICS_NOTE");
    expect(src).toContain("never convert them");
  });
});
