import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AUDIT_SAFE_FALLBACK,
  VibrationActionCard,
  VibrationIsoMatrix,
  VibrationKpiSummary,
  consensusContradicts
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

  it("suppresses an aggressive repair when the ISO zone is unresolved", () => {
    const html = renderToStaticMarkup(
      <VibrationActionCard
        valueMmS={null}
        machineClass={machineClass}
        summary="Early-Stage Bearing Defect Detected"
        recommendation="Allocate the correct replacement bearing from inventory (match DE/NDE OEM spec)."
      />
    );
    expect(html).toContain(AUDIT_SAFE_FALLBACK);
    expect(html).not.toContain("Allocate the correct replacement bearing");
  });

  it("suppresses an aggressive repair when the agents contradict", () => {
    const html = renderToStaticMarkup(
      <VibrationActionCard
        valueMmS={5}
        machineClass={machineClass}
        summary="Early-Stage Bearing Defect Detected"
        recommendation="Allocate the correct replacement bearing from inventory (match DE/NDE OEM spec)."
        consensusConflict
      />
    );
    expect(html).toContain("Zone C");
    expect(html).toContain(AUDIT_SAFE_FALLBACK);
    expect(html).not.toContain("Allocate the correct replacement bearing");
  });

  it("keeps the repair recommendation when zone and consensus agree", () => {
    const html = renderToStaticMarkup(
      <VibrationActionCard
        valueMmS={5}
        machineClass={machineClass}
        summary="Outer-race bearing defect"
        recommendation="Allocate the correct replacement bearing from inventory (match DE/NDE OEM spec)."
      />
    );
    expect(html).toContain("Allocate the correct replacement bearing");
    expect(html).not.toContain(AUDIT_SAFE_FALLBACK);
  });

  it("enables the work-order button only when a prefill handler is wired", () => {
    const withoutHandler = renderToStaticMarkup(
      <VibrationActionCard
        valueMmS={5}
        machineClass={machineClass}
        summary="Outer-race bearing defect"
        recommendation="Inspect bearing."
      />
    );
    expect(withoutHandler).toContain("disabled");

    const withHandler = renderToStaticMarkup(
      <VibrationActionCard
        valueMmS={5}
        machineClass={machineClass}
        summary="Outer-race bearing defect"
        recommendation="Inspect bearing."
        onCreateWorkOrder={() => {}}
      />
    );
    expect(withHandler).not.toContain("disabled");
    expect(withHandler).toContain("Prefill a work order from this action");
  });

  it("detects a persisted multi-agent contradiction", () => {
    expect(
      consensusContradicts({
        refereeDebateSummary:
          'Agents disagreed on fault classification: AgentA="Early-Stage Bearing Defect Detected" vs AgentB="Normal" ISO Zone A.'
      })
    ).toBe(true);
    expect(
      consensusContradicts({
        modelA_Hypothesis: "Normal (90%)",
        modelB_Hypothesis: "Bearing defect ISO Zone D (85%)"
      })
    ).toBe(true);
    expect(
      consensusContradicts({
        modelA_Hypothesis: "Bearing defect (90%)",
        modelB_Hypothesis: "Bearing defect ISO Zone C (88%)"
      })
    ).toBe(false);
    expect(consensusContradicts(null)).toBe(false);
  });
});
