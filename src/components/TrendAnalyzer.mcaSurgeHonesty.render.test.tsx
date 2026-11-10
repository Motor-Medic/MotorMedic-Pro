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
import type { SurgeDataPoint } from "../lib/mca/surgeCalculator";

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

function surgeRow(
  waveform: SurgeDataPoint[] | null,
  testVoltageV: number | null
): Row {
  return {
    id: "mca-surge-row",
    asset_id: "M-101",
    component: null,
    analysis_type: "mca",
    timestamp: NOW,
    health_score: 70,
    primary_fault: "Surge",
    recommendations: [],
    peaks: [
      {
        type: "mca",
        surge: {
          waveform,
          test_voltage_v: testVoltageV,
          ear: 3.2
        }
      }
    ]
  };
}

/** Alternating peaks with troughs: a genuine stored decaying envelope. */
function decayingWaveform(): SurgeDataPoint[] {
  const peaks = [1000, 700, 490, 343, 240, 168, 118, 82];
  const out: SurgeDataPoint[] = [];
  let t = 0;
  for (const peak of peaks) {
    out.push({ time: t, v12: peak, v23: peak * 0.99, v31: peak * 0.98 });
    t += 1;
    out.push({ time: t, v12: 0, v23: 0, v31: 0 });
    t += 1;
  }
  return out;
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

async function openSurgeTab() {
  render(<TrendAnalyzer selectedAssetId="asset-1" />);
  const cards = await screen.findByTestId("trend-tech-cards");
  fireEvent.click(
    within(cards).getByRole("button", { name: /Motor Circuit Analysis/ })
  );
  const tab = await screen.findByRole("button", { name: "Surge Waveforms" });
  fireEvent.click(tab);
  await waitFor(() => {
    expect(screen.queryByText("Loading MCA trends…")).toBeNull();
  });
}

describe("SLICE-AI Surge render honesty", () => {
  it("shows an honest Awaiting-Data state with no synthetic plots or guard", async () => {
    await openSurgeTab();

    expect(screen.getAllByText("Awaiting Data").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        /Upload Surge CSV or paste Time \/ V12 \/ V23 \/ V31 to/i
      )
    ).toBeTruthy();
    expect(screen.queryByTestId("mca-surge-voltage-guard")).toBeNull();
    expect(screen.queryByTestId("mca-surge-damping")).toBeNull();
    expect(screen.queryByTestId("mca-surge-ear-source")).toBeNull();
  });

  it("renders the IEEE 522 guard, true-source EAR label, and gated damping from stored data", async () => {
    saveEquipmentStore(storeWithVoltage("460 V"));
    rows = [surgeRow(decayingWaveform(), 2500)];
    await openSurgeTab();

    const guard = await screen.findByTestId("mca-surge-voltage-guard");
    expect(guard.textContent).toContain("exceeded");
    expect(guard.textContent).toContain("986 V");
    expect(guard.textContent).toContain("IEEE 522");

    const source = screen.getByTestId("mca-surge-ear-source");
    expect(source.textContent).toContain("Vendor heuristic");
    expect(source.textContent).toMatch(/not an IEEE 522 or NEMA pass\/fail limit/i);

    const damping = screen.getByTestId("mca-surge-damping");
    expect(damping.textContent).toContain("Mean");
    expect(damping.textContent).toContain("V12");
    expect(damping.textContent).toContain("stored multi-point decay");
  });

  it("omits the guard when the nameplate voltage is absent", async () => {
    rows = [surgeRow(decayingWaveform(), 2500)];
    await openSurgeTab();

    expect(await screen.findByTestId("mca-surge-ear-source")).toBeTruthy();
    expect(screen.queryByTestId("mca-surge-voltage-guard")).toBeNull();
  });

  it("omits damping alpha when the stored trace has only a few samples", async () => {
    saveEquipmentStore(storeWithVoltage("460 V"));
    rows = [
      surgeRow(
        [
          { time: 0, v12: 100, v23: 99, v31: 98 },
          { time: 1, v12: 60, v23: 59, v31: 58 },
          { time: 2, v12: 35, v23: 34, v31: 33 }
        ],
        900
      )
    ];
    await openSurgeTab();

    expect(await screen.findByTestId("mca-surge-ear-source")).toBeTruthy();
    expect(screen.queryByTestId("mca-surge-damping")).toBeNull();
  });

  it("populates the real grid when a CSV is uploaded", async () => {
    await openSurgeTab();

    const csv =
      "Time,V12,V23,V31\n0,100,99,98\n1,50,49,48\n2,25,24,23\n3,12,11,10";
    const file = {
      name: "surge.csv",
      type: "text/csv",
      text: async () => csv
    } as unknown as File;

    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/4 waveform samples loaded/i)).toBeTruthy();
    });
    expect(screen.queryByText(/Upload Surge CSV or paste/i)).toBeNull();
    expect(screen.queryByText("Awaiting Data")).toBeNull();
  });
});
