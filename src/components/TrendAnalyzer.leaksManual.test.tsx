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

function leakPeak(peak: number, baseline: number) {
  return {
    type: "ultrasound",
    peak_dbmv: peak,
    rms_dbmv: peak - 16,
    baseline_dbmv: baseline,
    delta_db: peak - baseline,
    mode: "leak"
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

describe("SLICE-AA manual demo-tenant leak behavior", () => {
  it("shows the true basis, two-sig-fig values, and daily savings without a payback sentence", async () => {
    rows = [baseRow({ peaks: [leakPeak(55, 28)] })];
    await openLeaksTab();

    const pill = await screen.findByTestId("ue-leak-basis-pill");
    expect(pill.textContent).toContain("100 psi");
    expect(pill.textContent).toContain("$0.12/kWh");
    expect(pill.textContent).toContain("8760 h/yr");
    expect(pill.textContent).toContain("18 kW/100 CFM");
    expect(pill.textContent).toContain("eGRID US avg");
    expect(pill.textContent).toContain("Derived daily savings:");
    expect(screen.queryByText(/payback/i)).toBeNull();

    // Demo 55/28 -> $48.95, 0.0112 in, 0.26 CFM, 0.16 MT at stored precision.
    expect(screen.getAllByText("$49/yr").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("0.011 in").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("0.26 CFM").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("0.16 MT/yr").length).toBeGreaterThanOrEqual(1);
  });

  it("keeps the sort handler live for Date and Annual Cost", async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    rows = [
      baseRow({ id: "r-old", timestamp: tenDaysAgo, peaks: [leakPeak(55, 28)] }),
      baseRow({ id: "r-new", timestamp: NOW, peaks: [leakPeak(60, 28)] })
    ];
    await openLeaksTab();

    fireEvent.click(await screen.findByRole("button", { name: /Annual Cost/ }));
    const rowsAfterSort = within(await screen.findByRole("table")).getAllByRole("row");
    expect(rowsAfterSort.length).toBe(3);

    fireEvent.click(screen.getByRole("button", { name: /^Date/ }));
    expect(within(screen.getByRole("table")).getAllByRole("row").length).toBe(3);
  });

  it("renders $0 and 'no active leaks' for scans that model no loss (not N/A)", async () => {
    rows = [baseRow({ peaks: [leakPeak(20, 28)] })];
    await openLeaksTab();

    expect(await screen.findByText("$0/yr")).toBeTruthy();
    expect(screen.getByText(/No active leaks/)).toBeTruthy();
    expect(screen.queryByText("N/A")).toBeNull();
  });

  it("renders N/A when the asset has no stored leak scans", async () => {
    rows = [
      baseRow({
        id: "mech-1",
        primary_fault: "Bearing Defect",
        peaks: [{ type: "ultrasound", peak_dbmv: 55, rms_dbmv: 39, mode: "mechanical" }]
      })
    ];
    await openLeaksTab();

    await waitFor(() => {
      expect(screen.getAllByText("N/A").length).toBeGreaterThanOrEqual(3);
    });
    expect(screen.getByText(/No stored ultrasound leak scans/)).toBeTruthy();
  });
});
