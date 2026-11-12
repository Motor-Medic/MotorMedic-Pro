import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * SLICE-VS4 source contract. The Spectral & Harmonics tab is a large single
 * component, so these assertions pin the honesty rules that are easy to
 * regress: stored orders survive without RPM, bin re-extraction is gated on
 * stored RPM, the ratio is pure math, and the spectral series never performs a
 * frequency-less velocity -> acceleration conversion.
 */

const src = readFileSync(
  fileURLToPath(new URL("./TrendAnalyzer.tsx", import.meta.url)),
  "utf8"
).replace(/\r\n/g, "\n");

function block(start: string, end: string): string {
  const from = src.indexOf(start);
  const to = src.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return src.slice(from, to);
}

const spectralScope = block(
  "const spectralScopeRows = useMemo",
  "const hasAnySpectralTrend"
);

const displayProjection = block(
  "const spectralTrendDisplayData = useMemo",
  "const spectralLatestPoint"
);

const inputMapper = block(
  "function toSpectralHarmonicInputs(",
  "function formatRpmHz("
);

const chartBody = block(
  "function SpectralTrendChartBody({",
  "function SpectralOrderReadout({"
);

describe("SLICE-VS4 spectral series reads the shared SSOT", () => {
  it("reads the same windowed, running-state-scoped rows as Broadband", () => {
    expect(src).toContain(
      "vibrationRowsInScope(windowedVibAnalyses, runningOnly)"
    );
    expect(spectralScope).toContain(
      "buildSpectralHarmonicTrend(toSpectralHarmonicInputs(spectralScopeRows))"
    );
    expect(src).toContain(
      "const spectralWindowEmptyNote = spectralWindowEmpty"
    );
    expect(src).toContain('data-testid="spectral-window-empty-note"');
    expect(src).toContain("turn off Running State Only to include stopped samples");
  });

  it("uses the SSOT stopped-sample label and keeps it visible when OFF", () => {
    expect(inputMapper).toContain("vibrationStoppedSampleLabel(analysis)");
    expect(src).toContain("spectralScopeRows.some(");
    expect(src).toContain('data-testid="spectral-stopped-series-note"');
    expect(src).toContain("point.stoppedLabel");
  });
});

describe("SLICE-VS4 stored-vs-derived discipline", () => {
  it("uses only the sample's stored RPM — never the Equipment DB rating", () => {
    expect(inputMapper).toContain("readVibrationRpmProvenance(analysis)");
    expect(inputMapper).toContain("rpmSource: rpmReading.source");
    expect(inputMapper).not.toContain("fallbackRpm");
    expect(inputMapper).not.toContain("machineSpecs.rpm");
    expect(inputMapper).toContain("STORED running speed for THIS sample only");
  });

  it("renders stored order amplitudes with provenance and an honest RPM gate", () => {
    expect(src).toContain('testId="spectral-1x-readout"');
    expect(src).toContain('testId="spectral-2x-readout"');
    expect(src).toContain("spectralOrderProvenanceLabel");
    expect(src).toContain('data-testid="spectral-orders-rpm-gate"');
    expect(src).toContain("SPECTRAL_ORDERS_RPM_GATE_NOTE");
    expect(src).toContain("spectralHasStoredOrders");
    expect(src).toContain("SPECTRAL_ORDERS_STORED_FALLBACK_NOTE");
  });

  it("plots order lines from actual amplitudes, not RPM availability", () => {
    expect(chartBody).toContain("hasOrderSeries &&");
    expect(chartBody).not.toContain("ordersUnavailable");
    expect(
      (src.match(/hasOrderSeries=\{spectralHasOrderSeries\}/g) ?? []).length
    ).toBe(2);
  });
});

describe("SLICE-VS4 ratio and interpretation provenance", () => {
  it("shows the ratio from the latest row with its basis note", () => {
    expect(src).toContain('data-testid="spectral-2x1x-ratio"');
    expect(src).toContain("spectralLatestPoint.ratio.basisNote");
  });

  it("shows interpretation only when the row carries a labeled rubric", () => {
    expect(src).toContain("spectralLatestPoint.ratio.interpretation ? (");
    expect(src).toContain('data-testid="spectral-ratio-interpretation"');
    expect(src).toContain("spectralLatestPoint.ratio.interpretation.source");
  });

  it("never asserts a fault in the ratio copy", () => {
    expect(src).not.toContain("fault confirmed");
    expect(src).not.toContain("confirmed misalignment");
    expect(src).not.toContain("diagnosis: ");
  });
});

describe("SLICE-VS4 unit physics and sweep guards", () => {
  it("applies only the frequency-independent velocity display conversion", () => {
    expect(displayProjection).toContain("velocityValueForDisplay(");
    expect(displayProjection).not.toContain("gToMmPerSecondSquared");
    expect(displayProjection).not.toContain("formatAccelerationDisplay");
    expect(displayProjection).not.toContain("frequencyValueForDisplay");
    expect(src).toContain('data-testid="spectral-unit-physics-note"');
    expect(src).toContain("SPECTRAL_UNIT_PHYSICS_NOTE");
  });

  it("labels same-date points deterministically on the X axis", () => {
    expect(chartBody).toContain('dataKey="dateLabel"');
    expect(src).toContain("dateLabel: point.dateLabel || point.date");
  });

  it("keeps the sparse and null guards intact", () => {
    expect(chartBody).toContain("isSparse");
    expect(chartBody).toContain("SPARSE_TREND_HELPER_TEXT");
    expect(chartBody).toContain('data[0]?.overall != null');
    expect(src).toContain("spectralTrendIsSparse");
  });
});
