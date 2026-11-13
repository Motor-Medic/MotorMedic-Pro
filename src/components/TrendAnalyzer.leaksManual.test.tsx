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

/** Measured leak-mode peaks only — no economic fields (they are parked). */
function leakPeak(peak: number, baseline: number, overrides: Row = {}): Row {
  return {
    type: "ultrasound",
    peak_dbmv: peak,
    baseline_dbmv: baseline,
    delta_db: peak - baseline,
    mode: "leak",
    probe_type: "airborne",
    baseline_source: "stored",
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

describe("SLICE-VS8 manual demo-tenant leak behavior (measured readings only)", () => {
  it("renders the parked-model pill and measured dBµV rows with probe labels", async () => {
    rows = [baseRow({ peaks: [leakPeak(55, 28)] })];
    await openLeaksTab();

    const pill = await screen.findByTestId("ue-leak-basis-pill");
    expect(pill.textContent).toContain("Measured dBµV readings only");
    expect(pill.textContent).toContain("parked (SLICE-VS8)");
    expect(pill.textContent).toContain("power-domain mean");

    // Measured cells: peak / baseline / delta in dBµV/dB, one decimal.
    expect(screen.getAllByText("55.0 dBµV").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("28.0 dBµV").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("27.0 dB").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Airborne").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Stored baseline").length).toBeGreaterThanOrEqual(1);
  });

  it("renders no derived economics — no dollar amount, CFM figure, orifice or CO₂", async () => {
    rows = [
      baseRow({
        peaks: [
          leakPeak(55, 28, {
            // Legacy stored model output must be ignored, not re-rendered.
            annual_cost: 48.95,
            estimated_cfm: 0.26,
            orifice_size: 0.0112,
            co2_emissions: 0.16
          })
        ]
      })
    ];
    await openLeaksTab();

    const provenance = await screen.findByTestId("ue-leak-status-provenance");
    expect(provenance.textContent).toContain("No CFM");
    expect(provenance.textContent).toContain("SLICE-VS8");

    expect(screen.queryByText(/payback/i)).toBeNull();
    expect(screen.queryByText("$49/yr")).toBeNull();
    expect(screen.queryByText("0.26 CFM")).toBeNull();
    expect(screen.queryByText("0.011 in")).toBeNull();
    expect(screen.queryByText("0.16 MT/yr")).toBeNull();
    expect(screen.queryByText(/Equivalent orifice/i)).toBeNull();
    expect(
      screen.queryByText(/Derived daily savings/i)
    ).toBeNull();
    // The parked KPI card confesses instead of showing a number.
    expect(screen.getAllByText("Parked").length).toBeGreaterThanOrEqual(1);
  });

  it("computes the mean Δ as a power-domain mean, not an arithmetic mean", async () => {
    rows = [
      baseRow({ id: "r-1", peaks: [leakPeak(38, 28)] }),
      baseRow({ id: "r-2", peaks: [leakPeak(48, 28)] })
    ];
    await openLeaksTab();

    // 10·log10(mean(10^(10/10), 10^(20/10))) = 17.4 dB. An arithmetic mean
    // would fabricate 15.0 dB.
    await waitFor(() => {
      expect(screen.getByText("17.4 dB")).toBeTruthy();
    });
    expect(screen.queryByText("15.0 dB")).toBeNull();
  });

  it("labels two same-day runs deterministically (· 1 / · 2)", async () => {
    const morning = new Date(Date.now() - 3_600_000).toISOString();
    const afternoon = new Date().toISOString();
    rows = [
      baseRow({ id: "r-morning", timestamp: morning, peaks: [leakPeak(55, 28)] }),
      baseRow({ id: "r-afternoon", timestamp: afternoon, peaks: [leakPeak(60, 28)] })
    ];
    await openLeaksTab();

    const table = await screen.findByRole("table");
    expect(table.textContent).toMatch(/· 1/);
    expect(table.textContent).toMatch(/· 2/);
  });

  it("sorts the inventory newest-first with no user-facing sort ambiguity", async () => {
    const older = new Date(Date.now() - 10 * 86_400_000).toISOString();
    rows = [
      baseRow({ id: "r-old", timestamp: older, peaks: [leakPeak(50, 28)] }),
      baseRow({ id: "r-new", timestamp: NOW, peaks: [leakPeak(55, 28)] })
    ];
    await openLeaksTab();

    const table = await screen.findByRole("table");
    const dataRows = within(table).getAllByRole("row");
    // Header + newest first: the newer run's peak leads the body.
    expect(dataRows.length).toBe(3);
    expect(dataRows[1].textContent).toContain("55.0 dBµV");
    expect(dataRows[2].textContent).toContain("50.0 dBµV");
  });

  it("discloses the modeled fallback baseline with the 28 dBµV default", async () => {
    rows = [
      baseRow({
        peaks: [
          leakPeak(55, 28, {
            baseline_dbmv: undefined,
            baseline_db: undefined,
            delta_db: 27,
            baseline_source: "fallback",
            baseline_fallback: true,
            baseline_fallback_db: 28
          })
        ]
      })
    ];
    await openLeaksTab();

    const fallback = await screen.findByTestId("ue-leak-baseline-fallback-note");
    expect(fallback.textContent).toContain("no stored baseline");
    expect(fallback.textContent).toContain("28 dBµV applied");
    expect(screen.getAllByText("Modeled fallback").length).toBeGreaterThanOrEqual(1);
  });

  it("shows no fallback note when the baseline is stored", async () => {
    rows = [baseRow({ peaks: [leakPeak(55, 28)] })];
    await openLeaksTab();

    await screen.findByTestId("ue-leak-basis-pill");
    expect(screen.queryByTestId("ue-leak-baseline-fallback-note")).toBeNull();
  });

  it("renders the honest no-scans state with N/A KPIs (not fabricated zeros)", async () => {
    // At least one ultrasound row must exist for the technology body to
    // render; the leak tab itself must then confess no leak scans exist.
    rows = [
      baseRow({
        id: "mech-1",
        primary_fault: "Bearing Defect",
        peaks: [
          { type: "ultrasound", peak_dbmv: 55, rms_dbmv: 39, mode: "mechanical" }
        ]
      })
    ];
    await openLeaksTab();

    expect(
      await screen.findByText(/No stored ultrasound leak scans for this asset/)
    ).toBeTruthy();
    expect(screen.getByText("N/A")).toBeTruthy();
    expect(screen.queryByTestId("ue-leak-basis-pill")).toBeNull();
  });

  it("renders the empty-window state when scans exist but fall outside 30D", async () => {
    const ancient = "2026-01-01T00:00:00.000Z";
    rows = [baseRow({ timestamp: ancient, peaks: [leakPeak(55, 28)] })];
    await openLeaksTab();

    await screen.findByText(/No leak scans in the selected .* window\./);
    // Mean Δ is N/A — no scans are in the window to average.
    expect(screen.getByText("N/A")).toBeTruthy();
  });

  it("renders honest dashes for stored scans that carry no readable dB values", async () => {
    rows = [
      baseRow({
        peaks: [{ type: "ultrasound", mode: "leak" }]
      })
    ];
    await openLeaksTab();

    // The scan is never dropped or filled with a zero: the missing peak and
    // Δ render explicit em dashes, the baseline confesses the modeled 28
    // fallback, and the KPI says N/A.
    const table = await screen.findByRole("table");
    const dataRows = within(table).getAllByRole("row");
    expect(dataRows.length).toBe(2);
    expect((dataRows[1].textContent.match(/—/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(dataRows[1].textContent).toContain("Modeled fallback");
    expect(screen.getByText("N/A")).toBeTruthy();
  });
});
