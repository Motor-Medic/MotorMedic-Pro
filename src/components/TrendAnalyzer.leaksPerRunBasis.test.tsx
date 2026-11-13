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

describe("SLICE-VS8 per-run basis is parked, not priced", () => {
  it("never renders per-run basis economics — legacy stored $/CFM/orifice are ignored", async () => {
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
            probe_type: "airborne",
            baseline_source: "stored",
            // Legacy per-run basis + model output from before SLICE-VS8.
            system_pressure: 150,
            operating_hours: 4000,
            discharge_coefficient: 0.65,
            annual_cost: 1234.56,
            estimated_cfm: 3.21,
            orifice_size: 0.1
          }
        ]
      })
    ];

    await openLeaksTab();

    const pill = await screen.findByTestId("ue-leak-basis-pill");
    // The pill confesses the parked model; it no longer prices per run.
    expect(pill.textContent).toContain("Measured dBµV readings only");
    expect(pill.textContent).toContain("parked (SLICE-VS8)");
    expect(pill.textContent).not.toContain("Per-run basis");
    expect(pill.textContent).not.toContain("150 psi");
    expect(pill.textContent).not.toContain("4,000 h/yr");
    expect(pill.textContent).not.toContain("Cd 0.65");

    expect(screen.getAllByText("Parked").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("$1,235")).toBeNull();
    expect(screen.queryByText("$1,234.56")).toBeNull();
    expect(screen.queryByText(/3\.21 CFM/)).toBeNull();
    expect(screen.queryByText(/0\.1 in/)).toBeNull();
    expect(screen.queryByText(/Derived daily savings/)).toBeNull();
    expect(screen.queryByText(/payback/i)).toBeNull();

    // The measured cells still render honestly.
    expect(screen.getAllByText("55.0 dBµV").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("27.0 dB").length).toBeGreaterThanOrEqual(1);
  });

  it("discloses the 28 dBµV modeled fallback when a run has no stored baseline", async () => {
    rows = [
      baseRow({
        peaks: [
          {
            type: "ultrasound",
            peak_dbmv: 55,
            rms_dbmv: 39,
            delta_db: 27,
            mode: "leak",
            probe_type: "airborne",
            baseline_source: "fallback",
            baseline_fallback: true,
            baseline_fallback_db: 28,
            operating_hours: 8760
          }
        ]
      })
    ];

    await openLeaksTab();

    const fallback = await screen.findByTestId("ue-leak-baseline-fallback-note");
    expect(fallback.textContent).toContain("no stored baseline");
    expect(fallback.textContent).toContain("28 dBµV applied");
    expect(fallback.textContent).toContain("modeled, not measured");
    expect(screen.getAllByText("Modeled fallback").length).toBeGreaterThanOrEqual(1);
  });

  it("shows no fallback note for a run with a stored baseline", async () => {
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
            probe_type: "airborne",
            baseline_source: "stored"
          }
        ]
      })
    ];

    await openLeaksTab();

    await screen.findByTestId("ue-leak-basis-pill");
    expect(screen.queryByTestId("ue-leak-baseline-fallback-note")).toBeNull();
    expect(screen.getAllByText("Stored baseline").length).toBeGreaterThanOrEqual(1);
  });

  it("keeps the probe column labelled so airborne and contact never pool unlabeled", async () => {
    rows = [
      baseRow({
        id: "r-air",
        peaks: [
          {
            type: "ultrasound",
            peak_dbmv: 55,
            baseline_dbmv: 28,
            delta_db: 27,
            mode: "leak",
            probe_type: "airborne",
            baseline_source: "stored"
          }
        ]
      }),
      baseRow({
        id: "r-contact",
        peaks: [
          {
            type: "ultrasound",
            peak_dbmv: 60,
            baseline_dbmv: 28,
            delta_db: 32,
            mode: "leak",
            probe_type: "contact",
            baseline_source: "stored"
          }
        ]
      })
    ];

    await openLeaksTab();

    const table = await screen.findByRole("table");
    expect(table.textContent).toContain("Airborne");
    expect(table.textContent).toContain("Contact / structure-borne");
    // The bearing ladder must not classify an airborne leak delta.
    expect(table.textContent).not.toContain("Class 1");
    expect(table.textContent).not.toContain("Class 2");
    expect(table.textContent).not.toContain("Class 3");
  });

  it("renders the parked provenance footer and honest N/A when no delta exists", async () => {
    rows = [
      baseRow({
        peaks: [
          {
            type: "ultrasound",
            peak_dbmv: 55,
            mode: "leak",
            probe_type: "airborne",
            baseline_source: "stored"
          }
        ]
      })
    ];

    await openLeaksTab();

    const provenance = await screen.findByTestId("ue-leak-status-provenance");
    expect(provenance.textContent).toContain("descriptive subtraction");
    expect(provenance.textContent).toContain("No CFM");
    expect(screen.getByText("N/A")).toBeTruthy();
  });
});
