import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  RIC_FULL_ROTATION_MAX_GAP_DEG,
  RIC_FULL_ROTATION_MIN_POINTS,
  RIC_FULL_ROTATION_MIN_SPAN_DEG,
  calculateRotorInfluence,
  computeInductanceRatio,
  computeSpatialSecondHarmonic,
  hasFullRotationRicData,
  type RicDataPoint
} from "../lib/mca/rotorInfluenceCalculator";
import {
  MCA_RIC_RATIO_SOURCE,
  MCA_RIC_SPATIAL_FFT_SOURCE,
  MCA_RIC_VARIATION_SOURCE
} from "../lib/maintenance/prescriptiveDictionary";
import { extractMcaRicFromSaved } from "../lib/mca/mcaPersistence";
import type { SavedAnalysisResult } from "../lib/analysisPersistence";

const trendSrc = readFileSync(
  fileURLToPath(new URL("./TrendAnalyzer.tsx", import.meta.url)),
  "utf8"
);

function ricBlock(): string {
  const from = trendSrc.indexOf('mcaMode === "rotor"');
  const to = trendSrc.indexOf('mcaMode === "surge"', from);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return trendSrc.slice(from, to);
}

/** Full 360° waveform in 15° steps (25 points). */
function fullRotation(phase: (angle: number) => [number, number, number]): RicDataPoint[] {
  const out: RicDataPoint[] = [];
  for (let angle = 0; angle <= 360; angle += 15) {
    const [l12, l23, l31] = phase(angle);
    out.push({ angle, l12, l23, l31 });
  }
  return out;
}

function partialRotation(): RicDataPoint[] {
  return [0, 90, 180, 270].map((angle) => ({
    angle,
    l12: 10,
    l23: 11,
    l31: 12
  }));
}

function mcaRow(id: string, timestamp: string, ricData: RicDataPoint[]): SavedAnalysisResult {
  return {
    id,
    asset_id: "M-101",
    component: null,
    analysis_type: "mca",
    timestamp,
    health_score: 80,
    primary_fault: "Rotor Influence Check",
    recommendations: [],
    peaks: [{ type: "mca", ricData }]
  } as unknown as SavedAnalysisResult;
}

describe("SLICE-AH spatial FFT is gated on a stored full rotation", () => {
  it("declares the full-rotation gate constants", () => {
    expect(RIC_FULL_ROTATION_MIN_POINTS).toBeGreaterThan(0);
    expect(RIC_FULL_ROTATION_MIN_SPAN_DEG).toBeGreaterThanOrEqual(330);
    expect(RIC_FULL_ROTATION_MAX_GAP_DEG).toBeLessThanOrEqual(45);
  });

  it("computes the 2nd harmonic only from a full 360° angle-indexed waveform", () => {
    const theta = (deg: number) => (deg * Math.PI) / 180;
    const series = fullRotation((angle) => [
      10 + 2 * Math.cos(2 * theta(angle)) + Math.sin(2 * theta(angle)),
      10,
      10
    ]);
    expect(hasFullRotationRicData(series)).toBe(true);
    const harmonic = computeSpatialSecondHarmonic(series);
    expect(harmonic).not.toBeNull();
    expect(harmonic!.l12).toBeCloseTo(Math.sqrt(5), 2);
    expect(harmonic!.l23).toBeCloseTo(0, 2);
    expect(harmonic!.l31).toBeCloseTo(0, 2);
  });

  it("returns null (never synthesizes) for discrete/partial data", () => {
    const partial = partialRotation();
    expect(hasFullRotationRicData(partial)).toBe(false);
    expect(computeSpatialSecondHarmonic(partial)).toBeNull();
    const result = calculateRotorInfluence(partial);
    expect(result).not.toBeNull();
    expect(result!.spatialSecondHarmonic).toBeNull();
  });

  it("rejects a full span with a large sampling gap", () => {
    const gapped = [
      ...fullRotation(() => [10, 10, 10]).filter((p) => p.angle <= 300),
      { angle: 360, l12: 10, l23: 10, l31: 10 }
    ];
    expect(hasFullRotationRicData(gapped)).toBe(false);
    expect(computeSpatialSecondHarmonic(gapped)).toBeNull();
  });

  it("omits the spatial FFT card cleanly when no full rotation is stored", () => {
    expect(ricBlock()).toContain("mca-ric-spatial-fft");
    expect(ricBlock()).toContain("Spatial FFT (2nd harmonic)");
    expect(MCA_RIC_SPATIAL_FFT_SOURCE).toMatch(/requires stored full-rotation data/i);
    expect(MCA_RIC_SPATIAL_FFT_SOURCE).toMatch(/never interpolated or synthesized/i);
    expect(MCA_RIC_SPATIAL_FFT_SOURCE).not.toContain("IEEE");
    expect(MCA_RIC_SPATIAL_FFT_SOURCE).not.toContain("NEMA");
  });
});

describe("SLICE-AH inductance ratio is present-if-stored and uncited", () => {
  it("computes Lmax/Lmin from stored values", () => {
    const ratio = computeInductanceRatio([
      { angle: 0, l12: 10, l23: 11, l31: 12 },
      { angle: 15, l12: 10, l23: 11, l31: 15 }
    ]);
    expect(ratio).toEqual({ max: 15, min: 10, ratio: 1.5 });
  });

  it("is absent (null) when no values are stored", () => {
    expect(computeInductanceRatio([])).toBeNull();
    expect(computeInductanceRatio(null)).toBeNull();
  });

  it("shows the raw ratio with no fabricated IEEE/NEMA severity badge", () => {
    const block = ricBlock();
    expect(block).toContain('data-testid="mca-ric-inductance-ratio"');
    expect(block).toContain("Lmax/Lmin Inductance Ratio");
    expect(block).toContain("MCA_RIC_RATIO_SOURCE");
    expect(MCA_RIC_RATIO_SOURCE).toMatch(/raw ratio only/i);
    expect(MCA_RIC_RATIO_SOURCE).not.toMatch(/IEEE|NEMA/);
    expect(block).not.toContain("IEEE 43 PASS");
    expect(block).not.toContain("NEMA MG");
  });

  it("labels the existing variation brackets as in-repo heuristics", () => {
    expect(MCA_RIC_VARIATION_SOURCE).toMatch(/in-repo heuristic/i);
    expect(MCA_RIC_VARIATION_SOURCE).toMatch(/no IEEE\/NEMA\/vendor/i);
    const block = ricBlock();
    expect(block).toContain("mca-ric-threshold-provenance");
    expect(block).toContain("MCA_RIC_VARIATION_SOURCE");
  });
});

describe("SLICE-AH baseline provenance is a real stored historical trace", () => {
  it("reads RIC series from saved analysis_results rows", () => {
    const series = fullRotation(() => [10, 11, 12]);
    const row = mcaRow("row-1", "2025-01-01T00:00:00.000Z", series);
    expect(extractMcaRicFromSaved(row)).toHaveLength(series.length);
  });

  it("derives the oldest stored trace and never a local/synthetic baseline", () => {
    const block = ricBlock();
    expect(trendSrc).toContain("extractMcaRicFromSaved(row)");
    expect(trendSrc).toContain("ricStoredTraces.length > 1");
    expect(trendSrc).toContain("ricStoredTraces[ricStoredTraces.length - 1].series");
    expect(trendSrc).toContain('data-testid="mca-ric-baseline-toggle"');
    expect(trendSrc).toContain('data-testid="mca-ric-baseline-provenance"');
    expect(trendSrc).not.toContain("setRicBaselineData");
    expect(trendSrc).not.toContain("saveRicAsBaseline");
    expect(block).not.toMatch(/synthesi[sz]e.*baseline/i);
    expect(block).not.toMatch(/default baseline/i);
  });

  it("shows no baseline toggle when only the latest trace is available", () => {
    expect(ricBlock()).toContain("{hasRicHistoricalBaseline && (");
    expect(trendSrc).toContain("hasRicHistoricalBaseline = ricHistoricalBaselineSeries.length > 0");
    expect(trendSrc).not.toContain("Save Current as Baseline");
  });
});

describe("SLICE-AH null state, windowing, and unit isolation", () => {
  it("returns no result and no ratio/harmonic for empty input", () => {
    expect(calculateRotorInfluence([])).toBeNull();
    expect(computeInductanceRatio([])).toBeNull();
    expect(computeSpatialSecondHarmonic([])).toBeNull();
  });

  it("renders the honest Awaiting Data state without synthetic plots", () => {
    const block = ricBlock();
    expect(block).toContain('Awaiting Data');
    expect(block).toContain("Upload PDF or paste RIC values to view polar map");
    expect(block).toContain("Upload PDF or paste RIC values to view linear trace");
    expect(block).not.toContain("ZERO_RIC");
  });

  it("keeps MCA windowing point-in-time via the shared predicate", () => {
    expect(trendSrc).toContain("windowTrendByTimeRange(mcaAnalyses, timeRange)");
    expect(trendSrc).toContain("const latestMca = windowedMcaAnalyses[0] ?? null");
    expect(ricBlock()).toContain("mca-ric-windowing-note");
    expect(ricBlock()).toContain("selects which");
    expect(ricBlock()).toContain("not a continuous trend");
  });

  it("keeps mH and degrees raw with no H² conversion", () => {
    const block = ricBlock();
    expect(block).toContain('unit=" mH"');
    expect(block).toContain('unit="°"');
    expect(block).toContain("mH and degrees");
    expect(block).toContain("no H² conversion");
    expect(block).not.toContain("hzToCpm");
    expect(block).not.toContain("frequencyValueForDisplay");
    expect(block).not.toContain("velocityValueForDisplay");
  });
});
