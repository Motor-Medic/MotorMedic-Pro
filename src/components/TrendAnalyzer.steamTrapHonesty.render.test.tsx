// @vitest-environment jsdom
import { join } from "node:path";
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
import {
  calculateAdvancedSteamLoss,
  estimateSteamOrificeFromPeakDb,
  formatSteamUsdPerYear
} from "../lib/steam/advancedSteamCalculator";

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
          name: "Steam Header",
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
    primary_fault: "Steam Trap Blow-by",
    recommendations: [],
    peaks: [],
    ...overrides
  };
}

function steamPeak(overrides: Row = {}): Row {
  return {
    type: "ultrasound",
    peak_dbmv: 52,
    mode: "steam_trap",
    system_pressure_psi: 150,
    trap_id: "ST-12",
    trap_type: "Thermodynamic",
    upstream_temp: 300,
    downstream_temp: 290,
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

async function openSteamTab() {
  render(<TrendAnalyzer selectedAssetId="asset-1" />);
  const cards = await screen.findByTestId("trend-tech-cards");
  fireEvent.click(within(cards).getByRole("button", { name: /Ultrasound/ }));
  const tab = await screen.findByRole("button", { name: "Steam Traps" });
  fireEvent.click(tab);
  await waitFor(() => {
    expect(screen.queryByText("Loading ultrasound trends…")).toBeNull();
  });
}

describe("SLICE-AD steam trap render honesty", () => {
  it("shows the basis pill, assumes payback, and rounds dollars honestly", async () => {
    rows = [baseRow({ peaks: [steamPeak()] })];
    await openSteamTab();

    const pill = await screen.findByTestId("ue-steam-basis-pill");
    expect(pill.textContent).toContain("14.7 psia atmospheric");
    expect(pill.textContent).toContain("no boiler-efficiency term");

    const paybackBasis = await screen.findByTestId("ue-steam-payback-basis");
    expect(paybackBasis.textContent).toContain("hardcoded");
    expect(paybackBasis.textContent).toContain(
      "not a stored repair estimate"
    );

    const result = calculateAdvancedSteamLoss({
      orificeSize: estimateSteamOrificeFromPeakDb(52),
      steamPressurePsig: 150,
      ultrasoundPeakDb: 52,
      upstreamTemp: 300,
      downstreamTemp: 290,
      trapType: "Thermodynamic"
    });
    const expectedDollars = formatSteamUsdPerYear(result.annualCost);
    expect(screen.getAllByText(expectedDollars).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/\$\d[\d,]*\.\d{2}\/yr/)).toBeNull();
  });

  it("labels ΔT as stored per-scan and never as a water-hammer risk", async () => {
    rows = [baseRow({ peaks: [steamPeak()] })];
    await openSteamTab();

    expect(screen.getByText(/ΔT 10\.0 °F/)).toBeTruthy();
    expect(screen.getByText(/with stored per-scan ΔT/)).toBeTruthy();
    expect(screen.queryByText(/water hammer/i)).toBeNull();
    expect(screen.getByText(/Blown-Through \(Live Steam Loss\)/)).toBeTruthy();
  });

  it("shows ΔT N/A when the trap scan stored no endpoints", async () => {
    rows = [
      baseRow({
        peaks: [
          steamPeak({
            upstream_temp: undefined,
            downstream_temp: undefined
          })
        ]
      })
    ];
    await openSteamTab();

    expect(screen.getByText("ΔT N/A (no stored per-trap temps)")).toBeTruthy();
    expect(
      screen.getByText(/no stored per-trap ΔT — acoustic priority only/)
    ).toBeTruthy();
    expect(screen.getByText(/Leaking \/ Passing/)).toBeTruthy();
  });

  it("renders N/A rather than zeros when the window holds no trap scans", async () => {
    rows = [
      baseRow({
        primary_fault: "Compressed Air Leak",
        peaks: [{ type: "ultrasound", peak_dbmv: 40, mode: "leaks" }]
      })
    ];
    await openSteamTab();

    expect(screen.getAllByText("N/A").length).toBeGreaterThanOrEqual(3);
    expect(
      screen.getByText(/No stored ultrasound steam-trap scans/)
    ).toBeTruthy();
  });

  it("wires Generate Work Order to the real draft prefill with trap context", async () => {
    rows = [baseRow({ peaks: [steamPeak()] })];
    await openSteamTab();

    fireEvent.click(
      screen.getByRole("button", { name: "Generate Work Order" })
    );

    const raw = sessionStorage.getItem("spectra_work_order_prefill_v1");
    expect(raw).toBeTruthy();
    const prefill = JSON.parse(String(raw));
    expect(prefill.modality).toBe("ultrasound");
    expect(prefill.modalityLabel).toBe("Ultrasound / Steam Trap");
    expect(prefill.component).toContain("ST-12");
    expect(prefill.description).toContain("Trap status:");
    expect(prefill.description).toContain("Stored per-scan ΔT: 10.0 °F");
    expect(prefill.description).toContain("hardcoded replacement-cost assumption");
  });
});
