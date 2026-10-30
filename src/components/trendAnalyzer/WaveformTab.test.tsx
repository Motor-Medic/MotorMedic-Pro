// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import WaveformTab, {
  CrestFactorTrendChartBody,
  ImpactCountTrendChartBody,
  buildWaveformChartModel,
  type WaveformChartModel
} from "./WaveformTab";
import {
  SPARSE_TREND_HELPER_TEXT,
  isSparseTrendSeries
} from "../../lib/vibration/trendSeries";
import { normalizeWaveformMetrics } from "../../lib/waveformMetrics";
import {
  extractWaveformTrendPoint,
  type WaveformTrendPoint
} from "../../lib/vibration/vibrationDiagnosticRecord";
import type { SavedAnalysisResult } from "../../lib/analysisPersistence";
import { reportCsvText } from "../../lib/reportExport";

const EMPTY_MODEL: WaveformChartModel = {
  crestTrend: [],
  impactTrend: [],
  waveformChartData: [],
  oneXMarkers: [],
  sampleWindowMs: 10000
};

const BASE_PROPS = {
  rpm: 1800,
  trendPoints: [],
  model: EMPTY_MODEL,
  waveformSamples: [],
  emptyAlert: <div>empty</div>,
  analysesCount: 1
};

const LATEST = {
  peakToPeak: 25.4,
  crestFactor: null,
  impactCount: null,
  symmetry: null,
  modulation: null,
  timePerRevolutionMs: null
};

function point(overrides: Partial<WaveformTrendPoint>): WaveformTrendPoint {
  return {
    analysisId: "row-1",
    date: "Jan 1",
    timestamp: "2026-01-01T00:00:00.000Z",
    peakToPeak: null,
    crestFactor: null,
    impactCount: null,
    symmetry: null,
    modulation: null,
    healthScore: null,
    primaryFault: "—",
    rpm: null,
    ...overrides
  };
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|js|jsx|css)$/.test(entry) ? [full] : [];
  });
}

afterEach(() => {
  cleanup();
});

describe("SLICE-S waveform Peak-to-Peak unit label", () => {
  it("follows the tenant velocity preference and converts the value", () => {
    const { rerender } = render(
      <WaveformTab {...BASE_PROPS} latestMetrics={LATEST} velocityUnit="mm/s" />
    );
    expect(screen.getByText("25.40")).toBeTruthy();
    expect(screen.getByText("mm/s")).toBeTruthy();

    rerender(
      <WaveformTab {...BASE_PROPS} latestMetrics={LATEST} velocityUnit="in/s" />
    );
    expect(screen.getByText("1.0000")).toBeTruthy();
    expect(screen.getByText("in/s")).toBeTruthy();
  });

  it("keeps a clean unit label when the value is an em dash", () => {
    render(
      <WaveformTab
        {...BASE_PROPS}
        latestMetrics={{ ...LATEST, peakToPeak: null, crestFactor: 4.2 }}
        velocityUnit="in/s"
      />
    );
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getByText("in/s")).toBeTruthy();
  });

  it("removes the vague hedge from every source file", () => {
    const srcRoot = path.join(process.cwd(), "src");
    const hedge = ["or", "chart", "unit"].join(" ");
    const offenders = sourceFiles(srcRoot)
      .filter((file) => !/\.test\.(ts|tsx)$/.test(file))
      .filter((file) => readFileSync(file, "utf8").includes(hedge));
    expect(offenders).toEqual([]);
  });
});

describe("SLICE-S Impact Count empty-state parity (J2 reuse)", () => {
  it("reuses the J2 guard/constant instead of forking a new string", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/components/trendAnalyzer/WaveformTab.tsx"),
      "utf8"
    );
    expect(src).toContain('from "../../lib/vibration/trendSeries"');
    expect(src).toContain("isSparseTrendSeries(");
    expect(src).toContain("SPARSE_TREND_HELPER_TEXT");
    expect(src).not.toContain("No crest factor history yet.");
    expect(src).not.toContain("No impact count history yet.");
    expect((src.match(/<WaveformSeriesFallback/g) ?? []).length).toBe(2);
  });

  it("shows the shared honest empty state when the impact series is absent", () => {
    render(<ImpactCountTrendChartBody data={[]} />);
    expect(screen.getByText(SPARSE_TREND_HELPER_TEXT)).toBeTruthy();
  });

  it("still plots a real measured zero when data exists", () => {
    render(
      <ImpactCountTrendChartBody
        data={[
          { date: "Jan 1", impactCount: 0, fault: "—" },
          { date: "Jan 2", impactCount: 0, fault: "—" }
        ]}
      />
    );
    expect(screen.queryByText(SPARSE_TREND_HELPER_TEXT)).toBeNull();
    expect(screen.getByTestId("chart-body-waveformImpact")).toBeTruthy();
  });

  it("renders the same honest empty state for Crest Factor", () => {
    render(<CrestFactorTrendChartBody data={[]} />);
    expect(screen.getByText(SPARSE_TREND_HELPER_TEXT)).toBeTruthy();
  });

  it("keeps missing impact data null while preserving a measured zero", () => {
    expect(normalizeWaveformMetrics({ peakToPeak: 10 })?.impactCount).toBeNull();
    expect(normalizeWaveformMetrics({ impactCount: 0 })?.impactCount).toBe(0);
    expect(normalizeWaveformMetrics({ impactCount: 3 })?.impactCount).toBe(3);
  });

  it("does not turn a null impact field into a zero at extraction time", () => {
    const row = {
      id: "row-1",
      asset_id: "asset-1",
      timestamp: "2026-01-01T00:00:00.000Z",
      telemetry_data: {
        vibration_trend_record: {
          assetId: "asset-1",
          timestamp: "2026-01-01T00:00:00.000Z",
          broadband: {
            overallVelocity: 2,
            overallAcceleration: 0.1,
            healthScore: 80,
            primaryFault: "—"
          },
          spectral: [],
          enveloping: [],
          waveform: [],
          waveformAnalysis: {
            peakToPeak: 5,
            crestFactor: 0,
            impactCount: null,
            symmetry: "Symmetric"
          }
        }
      }
    } as unknown as SavedAnalysisResult;

    const extracted = extractWaveformTrendPoint(row);
    expect(extracted?.impactCount).toBeNull();
  });

  it("separates an absent impact series from a measured zero in the model", () => {
    const absent = buildWaveformChartModel({
      rpm: null,
      trendPoints: [point({ impactCount: null })],
      waveformSamples: []
    });
    expect(absent.impactTrend).toHaveLength(0);

    const measuredZero = buildWaveformChartModel({
      rpm: null,
      trendPoints: [point({ impactCount: 0 })],
      waveformSamples: []
    });
    expect(measuredZero.impactTrend).toHaveLength(1);
    expect(measuredZero.impactTrend[0].impactCount).toBe(0);
  });

  it("reuses the J2 sparse guard for the single-reading case", () => {
    expect(isSparseTrendSeries([{ date: "Jan 1" }])).toBe(true);
    expect(isSparseTrendSeries([])).toBe(false);
  });
});

describe("SLICE-T Waveform Metrics name and capability branches", () => {
  const stalePromise = ["Waveform", "&", "Phase"].join(" ");
  const waveformSource = readFileSync(
    path.join(process.cwd(), "src/components/trendAnalyzer/WaveformTab.tsx"),
    "utf8"
  );

  it("renders no raw waveform plot or phase indicator without stored samples", () => {
    const history = [point({ crestFactor: 4.2, impactCount: 2 })];
    const model = buildWaveformChartModel({
      rpm: 1800,
      trendPoints: history,
      waveformSamples: []
    });
    render(
      <WaveformTab
        {...BASE_PROPS}
        trendPoints={history}
        model={model}
        latestMetrics={LATEST}
      />
    );
    expect(screen.queryByTestId("chart-body-waveformTime")).toBeNull();
    expect(screen.queryByText("Time Waveform")).toBeNull();
    expect(screen.queryByText(/Δφ/)).toBeNull();
    expect(screen.queryByText(/phase angle/i)).toBeNull();
    expect(screen.getByTestId("waveform-phase-capture-note").textContent).toContain(
      "Phase/keyphasor capture requires reference-channel acquisition hardware"
    );
  });

  it("renders the stored-sample viewer only when samples exist, with a collapse toggle", () => {
    const samples = [
      { time: 0, amplitude: 1.2 },
      { time: 5, amplitude: -0.8 },
      { time: 10, amplitude: 0.6 }
    ];
    const model = buildWaveformChartModel({
      rpm: 1800,
      trendPoints: [],
      waveformSamples: samples
    });
    render(
      <WaveformTab
        {...BASE_PROPS}
        model={model}
        waveformSamples={samples}
        latestMetrics={null}
      />
    );
    expect(screen.getByTestId("chart-body-waveformTime")).toBeTruthy();
    const collapse = screen.getByRole("button", {
      name: "Collapse time waveform"
    });
    fireEvent.click(collapse);
    expect(screen.queryByTestId("chart-body-waveformTime")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Expand time waveform" })
    ).toBeTruthy();
  });

  it("never synthesizes a waveform series or a phase polar plot", () => {
    expect(waveformSource).not.toContain("generateWaveformData");
    expect(waveformSource).not.toContain("vibrationDataGenerator");
    expect(waveformSource).not.toContain("RadarChart");
    expect(waveformSource).not.toContain("PolarAngleAxis");
    expect(waveformSource).not.toContain("Δφ");
  });

  it("removes the old tab promise from every screen and export surface", () => {
    const surfaces = [
      "src/components/TrendAnalyzer.tsx",
      "src/components/trendAnalyzer/WaveformTab.tsx",
      "src/lib/reportExport.ts",
      "src/lib/reports/technologySummary.ts",
      "src/components/TrendAnalyzer.chartExpandClick.test.tsx",
      "migrations/005_analysis_results_waveform_metrics.sql"
    ];
    for (const surface of surfaces) {
      expect(readFileSync(path.join(process.cwd(), surface), "utf8")).not.toContain(
        stalePromise
      );
    }
    const offenders = sourceFiles(path.join(process.cwd(), "src"))
      .filter((file) => !/\.test\.(ts|tsx)$/.test(file))
      .filter((file) => readFileSync(file, "utf8").includes(stalePromise));
    expect(offenders).toEqual([]);
    expect(
      readFileSync(
        path.join(process.cwd(), "src/components/TrendAnalyzer.tsx"),
        "utf8"
      )
    ).toContain('label: "Waveform Metrics"');
  });

  it("stamps no old tab promise into a CSV export", () => {
    const row = {
      id: "row-t",
      asset_id: "asset-t",
      component: "Drive End",
      timestamp: "2026-01-01T00:00:00.000Z",
      health_score: 70,
      primary_fault: "Imbalance",
      fault_list: [],
      peaks: [],
      spectrum_image_url: null,
      recommendations: [],
      financial_impact: {},
      waveform_peak_to_peak: 5,
      waveform_crest_factor: 4,
      waveform_impact_count: 3,
      telemetry_data: {
        overall_velocity: 5,
        overall_acceleration: 0.2,
        rpm: 1800
      }
    } as unknown as SavedAnalysisResult;
    const csv = reportCsvText({
      assetLabel: "Test Motor",
      technology: "Vibration",
      analysis: row
    });
    expect(csv).not.toContain(stalePromise);
    expect(csv).toContain("Waveform Peak-to-Peak");
    expect(csv).toContain("Waveform Crest Factor");
    expect(csv).toContain("Waveform Impact Count");
  });
});
