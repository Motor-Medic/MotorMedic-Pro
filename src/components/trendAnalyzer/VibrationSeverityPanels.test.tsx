import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  VibrationActionCard,
  VibrationIsoMatrix,
  VibrationKpiSummary
} from "./VibrationSeverityPanels";
import VibrationComparisonTab from "../reports/VibrationComparisonTab";
import type { SavedAnalysisResult } from "../../lib/analysisPersistence";

const machineClass = "Class II";

function zoneText(html: string): string | null {
  const match = html.match(/Zone [ABCD]/);
  return match?.[0] ?? null;
}

function renderPanels(valueMmS: number) {
  const matrix = renderToStaticMarkup(
    <VibrationIsoMatrix valueMmS={valueMmS} machineClass={machineClass} />
  );
  const kpi = renderToStaticMarkup(
    <VibrationKpiSummary
      valueMmS={valueMmS}
      machineClass={machineClass}
      healthScore={80}
      primaryFault="Imbalance"
      analysesCount={1}
      source="PostgreSQL"
    />
  );
  const action = renderToStaticMarkup(
    <VibrationActionCard
      valueMmS={valueMmS}
      machineClass={machineClass}
      summary="Same analysis row"
      recommendation="Inspect bearing."
    />
  );
  return { matrix, kpi, action };
}

describe("Trend Analyzer vibration severity panels", () => {
  it.each([
    [2.29, "Zone A"],
    [2.3, "Zone B"],
    [4.5, "Zone C"],
    [7.1, "Zone D"]
  ])("agrees on %s mm/s RMS → %s", (value, expected) => {
    const { matrix, kpi, action } = renderPanels(value);
    expect(zoneText(matrix)).toBe(expected);
    expect(zoneText(kpi)).toBe(expected);
    expect(zoneText(action)).toBe(expected);
  });

  it("shows the canonical unit everywhere the value is rendered", () => {
    const { matrix, kpi } = renderPanels(5);
    expect(matrix).toContain("5.00 mm/s RMS");
    expect(kpi).toContain("5.00 mm/s RMS");
  });

  it("SLICE-H2 displays the tenant unit while classifying canonical mm/s", () => {
    const common = {
      valueMmS: 11.85,
      machineClass,
      healthScore: 80,
      primaryFault: "Imbalance",
      analysesCount: 1,
      source: "PostgreSQL"
    };
    const inches = renderToStaticMarkup(
      <VibrationKpiSummary {...common} velocityUnit="in/s" />
    );
    expect(inches).toContain("0.4665 in/s");
    expect(zoneText(inches)).toBe("Zone D");

    const millimetres = renderToStaticMarkup(
      <VibrationKpiSummary {...common} velocityUnit="mm/s" />
    );
    expect(millimetres).toContain("11.85 mm/s");
    expect(zoneText(millimetres)).toBe("Zone D");

    const matrix = renderToStaticMarkup(
      <VibrationIsoMatrix
        valueMmS={11.85}
        velocityUnit="in/s"
        machineClass={machineClass}
      />
    );
    expect(matrix).toContain("0.4665 in/s");
    expect(zoneText(matrix)).toBe("Zone D");
  });

  it("keeps the report Actions tab (action card) on the same zone", () => {
    const timestamp = "2026-01-01T00:00:00.000Z";
    const row = {
      id: "row-1",
      asset_id: "asset-1",
      component: "DE Bearing",
      timestamp,
      health_score: 80,
      primary_fault: "Imbalance",
      fault_list: [],
      peaks: [],
      spectrum_image_url: null,
      recommendations: [],
      financial_impact: {},
      severity: "MEDIUM",
      summary: "Same analysis row",
      telemetry_data: {
        vibration_trend_record: {
          assetId: "asset-1",
          timestamp,
          broadband: {
            overallVelocity: 5,
            overallAcceleration: 0.5,
            healthScore: 80,
            primaryFault: "Imbalance"
          },
          spectral: [],
          enveloping: [],
          waveform: []
        }
      }
    } as SavedAnalysisResult;

    const html = renderToStaticMarkup(
      <VibrationComparisonTab
        isActive
        selectedAnalysis={row}
        loadedAnalyses={[row]}
      />
    );

    expect(html).toContain("Zone C");
    expect(zoneText(html)).toBe("Zone C");
  });
});
