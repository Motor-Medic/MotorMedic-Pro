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
import type { RicDataPoint } from "../lib/mca/rotorInfluenceCalculator";

function store(): EquipmentStore {
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
            components: [{ id: "comp-1", name: "Drive-End Motor" }]
          }
        ]
      }
    ]
  };
}

type Row = Record<string, unknown>;

function fullRotation(offset = 0): RicDataPoint[] {
  const out: RicDataPoint[] = [];
  for (let angle = 0; angle <= 360; angle += 15) {
    const theta = (angle * Math.PI) / 180;
    out.push({
      angle,
      l12: 10 + offset + 2 * Math.cos(2 * theta),
      l23: 11 + offset,
      l31: 12 + offset
    });
  }
  return out;
}

function mcaRow(
  id: string,
  timestamp: string,
  ricData: RicDataPoint[] | null
): Row {
  return {
    id,
    asset_id: "M-101",
    component: null,
    analysis_type: "mca",
    timestamp,
    health_score: 80,
    primary_fault: "Rotor Influence Check",
    recommendations: [],
    peaks: ricData ? [{ type: "mca", ricData }] : [{ type: "mca" }]
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
  saveEquipmentStore(store());
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

async function openRotorTab() {
  render(<TrendAnalyzer selectedAssetId="asset-1" />);
  const cards = await screen.findByTestId("trend-tech-cards");
  fireEvent.click(
    within(cards).getByRole("button", { name: /Motor Circuit Analysis/ })
  );
  const tab = await screen.findByRole("button", {
    name: "Rotor Influence Check"
  });
  fireEvent.click(tab);
  await waitFor(() => {
    expect(screen.queryByText("Loading MCA trends…")).toBeNull();
  });
}

describe("SLICE-AH RIC render honesty", () => {
  it("holds the honest Awaiting Data state with no synthetic plot or ratio", async () => {
    rows = [];
    await openRotorTab();

    expect(screen.queryByTestId("mca-ric-spatial-fft")).toBeNull();
    expect(screen.queryByTestId("mca-ric-inductance-ratio")).toBeNull();
    expect(screen.queryByTestId("mca-ric-baseline-toggle")).toBeNull();
    expect(
      screen.getByText("Upload PDF or paste RIC values to view polar map")
    ).toBeTruthy();
    expect(
      screen.getByText("Upload PDF or paste RIC values to view linear trace")
    ).toBeTruthy();
    expect(screen.getAllByText("Awaiting Data").length).toBeGreaterThan(0);
  });

  it("shows the spatial FFT and raw ratio for a stored full-rotation trace", async () => {
    rows = [
      mcaRow(
        "row-1",
        new Date(Date.now() - 5 * 86400000).toISOString(),
        fullRotation()
      )
    ];
    await openRotorTab();

    const fft = await screen.findByTestId("mca-ric-spatial-fft");
    expect(fft.textContent).toContain("Spatial FFT (2nd harmonic)");
    expect(within(fft).getByTestId("mca-ric-spatial-fft-source").textContent).toMatch(
      /full-rotation/i
    );

    const ratio = screen.getByTestId("mca-ric-inductance-ratio");
    expect(ratio.textContent).toContain("Lmax/Lmin Inductance Ratio");
    expect(ratio.textContent).toContain("raw ratio only");

    // Only one stored trace -> no baseline overlay control at all.
    expect(screen.queryByTestId("mca-ric-baseline-toggle")).toBeNull();
  });

  it("wires Compare to Baseline only when two stored traces exist", async () => {
    rows = [
      mcaRow(
        "row-new",
        new Date(Date.now() - 5 * 86400000).toISOString(),
        fullRotation(0)
      ),
      mcaRow(
        "row-old",
        new Date(Date.now() - 60 * 86400000).toISOString(),
        fullRotation(1)
      )
    ];
    await openRotorTab();

    const toggle = await screen.findByTestId("mca-ric-baseline-toggle");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");

    const provenance = screen.getByTestId("mca-ric-baseline-provenance");
    expect(provenance.textContent).toContain("Oldest stored RIC test");
  });
});
