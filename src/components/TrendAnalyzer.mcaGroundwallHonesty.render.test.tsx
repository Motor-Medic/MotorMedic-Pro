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
import {
  saveEquipmentStore,
  type EquipmentStore
} from "../data/equipmentDb";

const NOW = new Date().toISOString();

function storeWithVoltage(voltage?: string): EquipmentStore {
  return {
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
            components: [
              {
                id: "comp-1",
                name: "Drive-End Motor",
                ...(voltage
                  ? { kinematics: { voltage } }
                  : { kinematics: {} })
              }
            ]
          }
        ]
      }
    ]
  };
}

type Row = Record<string, unknown>;

function mcaRow(groundwall: Row, overrides: Row = {}): Row {
  return {
    id: "mca-row-1",
    asset_id: "M-101",
    component: null,
    analysis_type: "mca",
    timestamp: NOW,
    health_score: 40,
    primary_fault: "Groundwall Insulation",
    recommendations: [],
    peaks: [
      {
        type: "mca",
        groundwall
      }
    ],
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
  saveEquipmentStore(storeWithVoltage());
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

async function openGroundwallTab() {
  render(<TrendAnalyzer selectedAssetId="asset-1" />);
  const cards = await screen.findByTestId("trend-tech-cards");
  fireEvent.click(
    within(cards).getByRole("button", { name: /Motor Circuit Analysis/ })
  );
  const tab = await screen.findByRole("button", {
    name: "Groundwall Insulation"
  });
  fireEvent.click(tab);
  await waitFor(() => {
    expect(screen.queryByText("Loading MCA trends…")).toBeNull();
  });
}

const INVALID_IR = {
  ir30sMOmega: 564,
  ir1mMOmega: 4,
  ir10mMOmega: 343,
  testVoltageV: 250,
  insulationClass: "F"
};

const VALID_IR = {
  ir30sMOmega: 2,
  ir1mMOmega: 4,
  ir10mMOmega: 8,
  testVoltageV: 250,
  insulationClass: "F"
};

describe("SLICE-AG Groundwall render honesty", () => {
  it("warns on non-monotonic IR and suppresses the CRITICAL energize verdict", async () => {
    rows = [mcaRow(INVALID_IR)];
    await openGroundwallTab();

    const warning = await screen.findByTestId("mca-gw-data-quality-warning");
    expect(warning.textContent).toContain("non-monotonic");
    expect(warning.textContent).toContain("564");
    expect(warning.textContent).toContain("343");
    expect(warning.textContent).toMatch(/30s \/ 1m \/ 10m entry order/i);

    expect(screen.queryByText(/Do not energize/i)).toBeNull();
    expect(screen.getByTestId("mca-gw-threshold-badge").textContent).toContain(
      "withheld"
    );

    const tempBasis = screen.getByTestId("mca-gw-temp-basis");
    expect(tempBasis.textContent).toContain("uncorrected");
    expect(tempBasis.textContent).toContain("kt=1");

    const leakage = screen.getByTestId("mca-gw-leakage-caveat");
    expect(leakage.textContent).toContain("1m IR");
    expect(leakage.textContent).toContain("Suppressed");
    expect(screen.getByTestId("mca-gw-leakage-value").textContent).toBe("---");

    expect(screen.queryByTestId("mca-gw-voltage-guard")).toBeNull();

    const drawer = screen.getByTestId("mca-gw-kt-drawer");
    expect(drawer.textContent).toContain("R40 = kt");
    expect(drawer.textContent).toContain("passthrough");
    expect(drawer.textContent).toContain("°C-locked");

    expect(screen.queryByText("Healthy Groundwall Insulation")).toBeNull();
    expect(screen.queryByText("IEEE 43 PASS")).toBeNull();
    expect(screen.queryByText("IEEE 43 FAIL")).toBeNull();
  });

  it("shows the voltage-ceiling guard when nameplate voltage is stored", async () => {
    saveEquipmentStore(storeWithVoltage("460 V"));
    rows = [mcaRow({ ...VALID_IR, testVoltageV: 1000 })];
    await openGroundwallTab();

    const guard = await screen.findByTestId("mca-gw-voltage-guard");
    expect(guard.textContent).toContain("exceeded");
    expect(guard.textContent).toContain("IEEE 43 maximum 500 V DC");
    expect(guard.textContent).toContain("0.46 kV");

    const badge = screen.getByTestId("mca-gw-threshold-badge");
    expect(badge.textContent).toContain("IEEE 43 PASS");
    expect(badge.textContent).toContain("1.46 MΩ");

    const leakage = screen.getByTestId("mca-gw-leakage-caveat");
    expect(leakage.textContent).toContain("Derived from 1m IR (V/R)");

    // The valid sequence + voltage-rated pass must not recommend de-energizing.
    expect(screen.queryByText(/Do not energize/i)).toBeNull();
  });

  it("omits the voltage guard and the verdict when nameplate voltage is absent", async () => {
    rows = [mcaRow(VALID_IR)];
    await openGroundwallTab();

    const badge = await screen.findByTestId("mca-gw-threshold-badge");
    expect(badge.textContent).toContain("No IEEE 43 verdict");
    expect(badge.textContent).toContain("nameplate voltage not stored");

    const provenance = screen.getByTestId("mca-gw-threshold-provenance");
    expect(provenance.textContent).toContain("No nameplate voltage stored");

    expect(screen.queryByTestId("mca-gw-voltage-guard")).toBeNull();
    expect(screen.queryByText(/Do not energize/i)).toBeNull();
  });
});
