// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
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
          name: "Motor 101",
          location: "Test Plant",
          components: []
        }
      ]
    }
  ]
};

type Row = Record<string, unknown>;

function thermoRow(overrides: Row = {}): Row {
  return {
    id: "row-1",
    asset_id: "M-101",
    component: null,
    analysis_type: "thermography",
    timestamp: NOW,
    health_score: 60,
    primary_fault: "Loose connection",
    recommendations: [],
    peaks: [
      {
        type: "thermography",
        hotspot_temp: 120,
        reference_temp: 70,
        delta_t: 50,
        severity_class: "Class 2",
        load_percentage: 75,
        phase_a_temp: 118,
        phase_b_temp: 108,
        phase_c_temp: 104,
        de_bearing_temp: 130,
        ode_bearing_temp: 125,
        refractory_skin_temp: 150,
        ...(overrides.peak as Row | undefined)
      }
    ],
    telemetry_data: {
      environmental: {
        emissivity: 0.92,
        ambient_temp: 70,
        reflected_temp: 75,
        temp_unit: "°F"
      },
      ...(overrides.telemetry as Row | undefined)
    },
    ...Object.fromEntries(
      Object.entries(overrides).filter(
        ([key]) => key !== "peak" && key !== "telemetry"
      )
    )
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
  sessionStorage.clear();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  saveEquipmentStore(equipmentStore);
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal("confirm", vi.fn(() => true));
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
  sessionStorage.clear();
  rows = [];
});

async function openThermographyTab() {
  render(<TrendAnalyzer selectedAssetId="asset-1" />);
  const cards = await screen.findByTestId("trend-tech-cards");
  fireEvent.click(within(cards).getByRole("button", { name: /Thermography/ }));
  await waitFor(() => {
    expect(screen.queryByText("Loading thermography trends…")).toBeNull();
  });
}

describe("SLICE-VS7 thermography render states", () => {
  it("renders stored ε / ambient / NETA and a current-ΔT card (no projection)", async () => {
    rows = [thermoRow()];
    await openThermographyTab();

    const pill = await screen.findByText(/Emissivity: 0\.92/);
    expect(pill.textContent).toContain("Ambient/Ref: 70°F");
    expect(screen.getByText("NETA Repair-Priority Reference")).toBeTruthy();
    expect(screen.getByText("Class 2 (MEDIUM)")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /Phase Delta & I²R Load/ })
    );
    expect(await screen.findByText("Current I²R ΔT")).toBeTruthy();
    expect(
      screen.getByText("Current operating point, not a projection")
    ).toBeTruthy();
    expect(screen.queryByText("Normalized ΔT Projection")).toBeNull();
    expect(screen.queryByText(/100% load/)).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /Radiometric & Isotherm/ })
    );
    expect(screen.queryByTestId("thermo-tref-gate")).toBeNull();
    expect(screen.getByText(/Reflected: 75°F \(stored units\)/)).toBeTruthy();
  });

  it("states the T_ref gate verbatim and marks absent fields honestly", async () => {
    rows = [
      thermoRow({
        peak: {
          hotspot_temp: 80,
          reference_temp: null,
          delta_t: 20,
          severity_class: null,
          load_percentage: null,
          phase_a_temp: null,
          phase_b_temp: null,
          phase_c_temp: null,
          de_bearing_temp: null,
          ode_bearing_temp: null,
          refractory_skin_temp: null
        },
        telemetry: { environmental: { temp_unit: "°F" } }
      })
    ];
    await openThermographyTab();

    expect(screen.getByText(/Hotspot: 80°F/)).toBeTruthy();
    expect(screen.getByText(/Reference: Not measured/)).toBeTruthy();
    expect(screen.queryByText(/Emissivity:/)).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /Radiometric & Isotherm/ })
    );
    const gate = await screen.findByTestId("thermo-tref-gate");
    expect(gate.textContent).toContain(
      "Reference temperature not recorded - radiometric analysis not available"
    );
    expect(screen.getAllByText("Not measured").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Not reported").length).toBeGreaterThanOrEqual(1);
  });

  it("keeps empty-state honesty and the unit-isolation note", async () => {
    rows = [];
    await openThermographyTab();

    expect(
      screen.getByText("No thermography scans for this asset")
    ).toBeTruthy();
    const note = screen.getByTestId("thermo-unit-isolation-note");
    expect(note.textContent).toContain("Reference temps (ambient / T_ref)");
    expect(note.textContent).toContain("concentration fields (ppm) never convert");
    expect(screen.queryByText("Normalized ΔT Projection")).toBeNull();
  });
});