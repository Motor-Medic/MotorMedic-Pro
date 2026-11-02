// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: vi.fn()
}));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
  default: ""
}));

import TrendAnalyzer from "./TrendAnalyzer";
import { saveEquipmentStore, type EquipmentStore } from "../data/equipmentDb";
import { calculateLeakImpact, formatLeakUsdPerYear } from "../lib/ultrasound/leakCalculator";

const NOW = new Date().toISOString();

const equipmentStore: EquipmentStore = {
  plants: [
    {
      id: "plant-1",
      name: "Test Plant",
      location: "Test Plant",
      facilityType: "Power Plant"
    }
  ],
  units: [],
  routes: [
    {
      id: "route-1",
      name: "Test Route",
      location: "Test Plant",
      assets: [
        {
          id: "asset-1",
          tag: "M-101",
          name: "Compressor",
          location: "Test Plant",
          components: []
        }
      ]
    }
  ]
};

type Row = Record<string, unknown>;

function baseRow(overrides: Row = {}): Row {
  return {
    id: "row-1",
    asset_id: "M-101",
    component: null,
    analysis_type: "ultrasound",
    timestamp: NOW,
    health_score: 40,
    primary_fault: "Air Leak",
    recommendations: [],
    peaks: [],
    ...overrides
  };
}

function jsonResponse(data: unknown) {
  return { ok: true, json: async () => data } as Response;
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let rows: Row[] = [];

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  saveEquipmentStore(equipmentStore);
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/tenant-settings")) return jsonResponse({});
      if (url.startsWith("/api/analysis-results")) {
        return jsonResponse({ results: rows });
      }
      return jsonResponse({});
    })
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  rows = [];
});

async function openLeaksTab() {
  render(<TrendAnalyzer selectedAssetId="asset-1" />);
  const cards = await screen.findByTestId("trend-tech-cards");
  fireEvent.click(within(cards).getByRole("button", { name: /Ultrasound/ }));
  const tab = await screen.findByRole("button", {
    name: "Compressed Air Leaks"
  });
  fireEvent.click(tab);
  await waitFor(() => {
    expect(screen.queryByText("Loading ultrasound trends…")).toBeNull();
  });
}

describe("SLICE-AB per-run basis in the Compressed Air Leaks pill", () => {
  it("shows the persisted per-run pressure/hours/coefficient and uses them for economics", async () => {
    rows = [
      baseRow({
        peaks: [
          {
            type: "ultrasound",
            peak_dbmv: 55,
            rms_dbmv: 39,
            baseline_dbmv: 28,
            delta_db: 27,
            mode: "leak",
            system_pressure: 150,
            operating_hours: 4000,
            discharge_coefficient: 0.65,
            baseline_source: "stored"
          }
        ]
      })
    ];

    await openLeaksTab();

    const pill = await screen.findByTestId("ue-leak-basis-pill");
    expect(pill.textContent).toContain("Per-run basis");
    expect(pill.textContent).toContain("150 psi");
    expect(pill.textContent).toContain("4,000 h/yr");
    expect(pill.textContent).toContain("Cd 0.65");
    expect(screen.queryByTestId("ue-leak-baseline-fallback-note")).toBeNull();

    const expected = calculateLeakImpact({
      peakDb: 55,
      baselineDb: 28,
      systemPressure: 150,
      operatingHours: 4000,
      dischargeCoefficient: 0.65
    });
    await waitFor(() => {
      expect(
        screen.getAllByText(formatLeakUsdPerYear(expected.annualCost)).length
      ).toBeGreaterThanOrEqual(1);
    });
  });

  it("leaves stored historical economics untouched when per-run basis is present", async () => {
    const storedAnnualCost = 1234.56;
    rows = [
      baseRow({
        peaks: [
          {
            type: "ultrasound",
            peak_dbmv: 55,
            rms_dbmv: 39,
            baseline_dbmv: 28,
            delta_db: 27,
            mode: "leak",
            annual_cost: storedAnnualCost,
            estimated_cfm: 3.21,
            orifice_size: 0.1,
            system_pressure: 150,
            operating_hours: 4000,
            discharge_coefficient: 0.65,
            baseline_source: "stored"
          }
        ]
      })
    ];

    await openLeaksTab();

    expect(
      screen.getAllByText(formatLeakUsdPerYear(storedAnnualCost)).length
    ).toBeGreaterThanOrEqual(1);

    const recomputed = calculateLeakImpact({
      peakDb: 55,
      baselineDb: 28,
      systemPressure: 150,
      operatingHours: 4000,
      dischargeCoefficient: 0.65
    });
    expect(formatLeakUsdPerYear(recomputed.annualCost)).not.toBe(
      formatLeakUsdPerYear(storedAnnualCost)
    );
    expect(
      screen.queryByText(formatLeakUsdPerYear(recomputed.annualCost))
    ).toBeNull();
  });

  it("discloses the 28 dBµV fallback when a run has no stored baseline", async () => {
    rows = [
      baseRow({
        peaks: [
          {
            type: "ultrasound",
            peak_dbmv: 55,
            rms_dbmv: 39,
            delta_db: 27,
            mode: "leak",
            baseline_source: "fallback",
            baseline_fallback_db: 28,
            operating_hours: 8760
          }
        ]
      })
    ];

    await openLeaksTab();

    const pill = await screen.findByTestId("ue-leak-basis-pill");
    expect(pill.textContent).toContain("8760 h/yr");
    const fallback = await screen.findByTestId("ue-leak-baseline-fallback-note");
    expect(fallback.textContent).toContain("28 dBµV");
    expect(fallback.textContent).toContain("no stored baseline");
  });

  it("does not show a fallback note for a run with a stored baseline", async () => {
    rows = [
      baseRow({
        peaks: [
          {
            type: "ultrasound",
            peak_dbmv: 55,
            rms_dbmv: 39,
            baseline_dbmv: 28,
            delta_db: 27,
            mode: "leak"
          }
        ]
      })
    ];

    await openLeaksTab();

    const pill = await screen.findByTestId("ue-leak-basis-pill");
    expect(pill.textContent).toContain("100 psi");
    expect(pill.textContent).toContain("8760 h/yr");
    expect(screen.queryByTestId("ue-leak-baseline-fallback-note")).toBeNull();
  });
});
