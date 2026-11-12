// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
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

function analysisRow(options: {
  id: string;
  timestamp: string;
  loadFactorPercent: number | null;
  primaryFault?: string;
  rpm?: number | null;
}) {
  return {
    id: options.id,
    asset_id: "M-101",
    component: null,
    analysis_type: "vibration",
    timestamp: options.timestamp,
    health_score: 82,
    primary_fault: options.primaryFault ?? "Imbalance",
    recommendations: [],
    peaks: [],
    telemetry_data: {
      vibration_trend_record: {
        assetId: "M-101",
        timestamp: options.timestamp,
        // Deliberately NO rpm unless the test supplies one: the stored labeled
        // orders must still render, but RPM-dependent interpretation is gated.
        ...(options.rpm != null ? { rpm: options.rpm } : {}),
        broadband: {
          overallVelocity: 2.5,
          overallAcceleration: 0.42,
          healthScore: 82,
          primaryFault: options.primaryFault ?? "Imbalance"
        },
        context: {
          ...(options.loadFactorPercent != null
            ? { loadFactorPercent: options.loadFactorPercent }
            : {}),
          analysisType: "vibration"
        },
        spectral: [
          { frequency: 30, amplitude: 1.2, label: "1X" },
          { frequency: 60, amplitude: 0.6, label: "2X" }
        ],
        enveloping: [],
        waveform: []
      }
    }
  };
}

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
          name: "Motor",
          location: "Test Plant",
          components: [
            {
              id: "comp-1",
              name: "Motor DE",
              // Equipment-DB rating exists on purpose. It must never be used to
              // re-extract orders for a sample that stored no RPM.
              kinematics: {
                ratedRpm: "1800",
                bearingDe: "SKF 6205",
                isoClass: "Class II"
              }
            }
          ]
        }
      ]
    }
  ]
};

function jsonResponse(data: unknown) {
  return { ok: true, json: async () => data } as Response;
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let currentRows: ReturnType<typeof analysisRow>[] = [];

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
        return jsonResponse({ results: currentRows });
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
});

async function renderSpectralTab() {
  render(<TrendAnalyzer selectedAssetId="asset-1" />);
  await screen.findByRole("button", { name: "Expand Health Score Trend" });
  fireEvent.click(screen.getByRole("button", { name: "Spectral & Harmonics" }));
}

describe("SLICE-VS4 Spectral tab renders stored orders without RPM", () => {
  it("shows stored 1X/2X provenance and the honest RPM gate", async () => {
    const now = new Date().toISOString();
    currentRows = [
      analysisRow({ id: "row-1", timestamp: now, loadFactorPercent: 90 })
    ];

    await renderSpectralTab();

    const gate = await screen.findByTestId("spectral-orders-rpm-gate");
    expect(gate.textContent).toContain(
      "1X/2X order extraction requires configured RPM in Equipment DB"
    );
    expect(gate.textContent).toContain(
      "Showing stored order amplitudes as extracted at collection"
    );

    // Real measurements survive: no RPM, yet both stored orders render.
    const oneX = screen.getByTestId("spectral-1x-readout");
    expect(oneX.textContent).toContain("1.200");
    expect(oneX.textContent).toContain("as extracted at collection");
    const twoX = screen.getByTestId("spectral-2x-readout");
    expect(twoX.textContent).toContain("0.600");
    expect(twoX.textContent).toContain("as extracted at collection");

    // Ratio is pure math on the stored amplitudes and carries its basis.
    const ratio = screen.getByTestId("spectral-2x1x-ratio");
    expect(ratio.textContent).toContain("0.50");
    expect(ratio.textContent).toContain(
      "basis: stored 1X/2X amplitudes"
    );

    // Without a stored RPM the descriptive interpretation is gated off: the
    // pure ratio remains, but no fault-interpretation copy is asserted.
    expect(screen.queryByTestId("spectral-ratio-interpretation")).toBeNull();

    // Unit physics is stated, not silently applied.
    expect(screen.getByTestId("spectral-unit-physics-note").textContent).toContain(
      "frequency-dependent"
    );
  });

  it("adds the labeled descriptive interpretation only when RPM is stored", async () => {
    const now = new Date().toISOString();
    currentRows = [
      analysisRow({
        id: "row-rpm",
        timestamp: now,
        loadFactorPercent: 90,
        rpm: 1780
      })
    ];

    await renderSpectralTab();

    const ratio = await screen.findByTestId("spectral-2x1x-ratio");
    expect(ratio.textContent).toContain("0.50");
    // Present RPM clears the gate: extraction is allowed, so no RPM note.
    expect(screen.queryByTestId("spectral-orders-rpm-gate")).toBeNull();

    const interpretation = await screen.findByTestId(
      "spectral-ratio-interpretation"
    );
    expect(interpretation.textContent).toContain("consistent with");
    expect(interpretation.textContent).not.toMatch(/confirmed|diagnosis/i);
    expect(ratio.textContent).toContain("not an ISO 20816");
  });

  it("excludes a stopped-only window when ON and labels it when OFF", async () => {
    const now = Date.now();
    currentRows = [
      analysisRow({
        id: "row-stopped",
        timestamp: new Date(now - 86_400_000).toISOString(),
        loadFactorPercent: 72
      })
    ];

    await renderSpectralTab();

    const emptyNote = await screen.findByTestId("spectral-window-empty-note");
    expect(emptyNote.textContent).toContain(
      "turn off Running State Only to include stopped samples"
    );

    fireEvent.click(screen.getByRole("button", { name: /Running State Only/ }));

    await waitFor(() => {
      expect(screen.queryByTestId("spectral-window-empty-note")).toBeNull();
    });
    const stoppedNote = await screen.findByTestId("spectral-stopped-series-note");
    expect(stoppedNote.textContent).toContain("Includes stopped samples");
    expect(screen.getByTestId("spectral-latest-summary").textContent).toContain(
      "stopped sample"
    );
  });
});
