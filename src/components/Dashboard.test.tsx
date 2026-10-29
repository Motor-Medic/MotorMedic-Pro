import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Dashboard, { type DashboardPayload } from "./Dashboard";

const makePayload = (
  overrides: Partial<DashboardPayload> = {}
): DashboardPayload => ({
  plantName: "Test Plant",
  assetCount: 1,
  fleetHealthScore: 82,
  highAlerts: 0,
  warningAlerts: 0,
  unacknowledgedAlerts: 0,
  scheduledWorkOrders: 0,
  unassignedWorkOrders: 0,
  financialRisk: { failureExposure: 1200, costToFix: 300, roiPercent: 300 },
  techCoverage: [
    { name: "Vibration Analysis", pct: 100, detail: "Route Coverage" }
  ],
  aiBriefing: "Latest analysis: P-101 - Imbalance.",
  badActors: [],
  liveAlarms: [
    {
      id: "alarm-1",
      name: "P-101",
      zone: "Zone A",
      detail: "High vibration",
      severity: "warning",
      acknowledged: false,
      assetId: "asset-1"
    }
  ],
  healthZones: { A: 1, B: 0, C: 0, D: 0 },
  recentAnalyses: [
    {
      assetId: "asset-1",
      component: "DE Bearing",
      healthScore: 82,
      primaryFault: "Imbalance",
      severity: "MEDIUM",
      summary: "Imbalance detected.",
      timestamp: null,
      telemetryProvenance: null
    }
  ],
  correlationData: [],
  assetHealthScores: [
    {
      assetId: "asset-1",
      assetName: "P-101",
      healthScore: 82,
      scoreComponents: "vibration"
    }
  ],
  fleetAggregates: {
    totalAssets: 1,
    criticalCount: 0,
    warningCount: 0,
    healthyCount: 1,
    avgHealthIndex: 82,
    assetsWithScoresCount: 1
  },
  ...overrides
});

const noReadingsPayload = (
  overrides: Partial<DashboardPayload> = {}
) =>
  makePayload({
    assetCount: 2,
    fleetHealthScore: null,
    financialRisk: null,
    techCoverage: [],
    aiBriefing: null,
    liveAlarms: [],
    healthZones: { A: 0, B: 0, C: 0, D: 0 },
    recentAnalyses: [],
    assetHealthScores: [
      {
        assetId: "asset-1",
        assetName: "P-101",
        healthScore: null,
        scoreComponents: ""
      },
      {
        assetId: "asset-2",
        assetName: "P-102",
        healthScore: null,
        scoreComponents: ""
      }
    ],
    fleetAggregates: {
      totalAssets: 2,
      criticalCount: 0,
      warningCount: 0,
      healthyCount: 0,
      avgHealthIndex: null,
      assetsWithScoresCount: 0
    },
    ...overrides
  });

const noAssetsPayload = (
  overrides: Partial<DashboardPayload> = {}
) =>
  noReadingsPayload({
    assetCount: 0,
    assetHealthScores: [],
    fleetAggregates: {
      totalAssets: 0,
      criticalCount: 0,
      warningCount: 0,
      healthyCount: 0,
      avgHealthIndex: null,
      assetsWithScoresCount: 0
    },
    ...overrides
  });

const noPlantPayload = () =>
  noAssetsPayload({
    plantName: null
  });

const renderDashboard = (data: DashboardPayload) =>
  renderToStaticMarkup(
    <Dashboard
      companyId={1}
      onNavigate={() => {}}
      onStartQuickAnalysis={() => {}}
      onAddAsset={() => {}}
      initialData={data}
      initialLoading={false}
    />
  );

const CARD_CTAS = [
  ["fleet health", "dashboard-empty-fleet-health-cta"],
  ["asset status", "dashboard-empty-asset-status-cta"],
  ["financial risk", "dashboard-empty-financial-risk-cta"],
  ["multi-tech coverage", "dashboard-empty-tech-coverage-cta"],
  ["AI shift briefing", "dashboard-empty-ai-briefing-cta"],
  ["live alarm feed", "dashboard-empty-live-alarms-cta"],
  ["ISO 20816 distribution", "dashboard-empty-health-distribution-cta"]
] as const;

describe("Dashboard empty-state onboarding CTAs", () => {
  it.each(CARD_CTAS)(
    "%s shows the diagnostic CTA when readings are missing and hides it once populated",
    (_name, testId) => {
      const emptyHtml = renderDashboard(noReadingsPayload());
      expect(emptyHtml).toContain(`data-testid="${testId}"`);
      expect(emptyHtml).toContain("Run First Diagnostic");

      const populatedHtml = renderDashboard(makePayload());
      expect(populatedHtml).not.toContain(`data-testid="${testId}"`);
      expect(populatedHtml).not.toContain("Run First Diagnostic");
    }
  );

  it("total monitored shows the import CTA when assets are missing and hides it once populated", () => {
    const emptyHtml = renderDashboard(noAssetsPayload());
    expect(emptyHtml).toContain(
      'data-testid="dashboard-empty-total-monitored-cta"'
    );
    expect(emptyHtml).toContain("Import Assets");

    const populatedHtml = renderDashboard(makePayload());
    expect(populatedHtml).not.toContain(
      'data-testid="dashboard-empty-total-monitored-cta"'
    );
    expect(populatedHtml).not.toContain("Import Assets");
  });

  it("uses asset import as the only next step when a plant exists but has no assets", () => {
    const html = renderDashboard(noAssetsPayload());

    expect(html).toContain("Import Assets");
    expect(html).not.toContain("Set Up Plant");
    expect(html).not.toContain("Run First Diagnostic");
  });

  it("takes plant setup precedence and suppresses asset and diagnostic CTAs", () => {
    const html = renderDashboard(noPlantPayload());

    expect(html).toContain('data-testid="dashboard-empty-fleet-health-cta"');
    expect(html).toContain(
      'data-testid="dashboard-empty-total-monitored-cta"'
    );
    expect(html).toContain('data-testid="dashboard-empty-asset-status-cta"');
    expect(html).toContain('data-testid="dashboard-empty-financial-risk-cta"');
    expect(html).toContain('data-testid="dashboard-empty-tech-coverage-cta"');
    expect(html).toContain('data-testid="dashboard-empty-ai-briefing-cta"');
    expect(html).toContain('data-testid="dashboard-empty-live-alarms-cta"');
    expect(html).toContain(
      'data-testid="dashboard-empty-health-distribution-cta"'
    );
    expect(html).toContain("Set Up Plant");
    expect(html).not.toContain("Import Assets");
    expect(html).not.toContain("Run First Diagnostic");
  });
});
