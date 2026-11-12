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

interface WaveformRowOptions {
  id: string;
  timestamp: string;
  loadFactorPercent: number | null;
  peakToPeak?: number | null;
  crestFactor?: number | null;
  impactCount?: number | null;
  samples?: Array<{ time: number; amplitude: number }>;
}

function analysisRow(options: WaveformRowOptions) {
  const samples = options.samples ?? [
    { time: 0, amplitude: 1.2 },
    { time: 5, amplitude: -0.8 },
    { time: 10, amplitude: 0.6 }
  ];
  return {
    id: options.id,
    asset_id: "M-101",
    component: null,
    analysis_type: "vibration",
    timestamp: options.timestamp,
    health_score: 82,
    primary_fault: "Imbalance",
    recommendations: [],
    peaks: [],
    telemetry_data: {
      vibration_trend_record: {
        assetId: "M-101",
        timestamp: options.timestamp,
        broadband: {
          overallVelocity: 2.5,
          overallAcceleration: 0.42,
          healthScore: 82,
          primaryFault: "Imbalance"
        },
        context: {
          ...(options.loadFactorPercent != null
            ? { loadFactorPercent: options.loadFactorPercent }
            : {}),
          analysisType: "vibration"
        },
        spectral: [],
        enveloping: [],
        waveform: samples,
        waveformAnalysis: {
          peakToPeak:
            "peakToPeak" in options ? options.peakToPeak ?? null : 25.4,
          crestFactor:
            "crestFactor" in options ? options.crestFactor ?? null : 4.2,
          impactCount:
            "impactCount" in options ? options.impactCount ?? null : 2,
          symmetry: "Symmetric",
          modulation: null,
          timePerRevolutionMs: null
        }
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

async function renderWaveformTab() {
  render(<TrendAnalyzer selectedAssetId="asset-1" />);
  await screen.findByRole("button", { name: "Expand Health Score Trend" });
  fireEvent.click(screen.getByRole("button", { name: "Waveform Metrics" }));
}

describe("SLICE-VS6 waveform snapshot exception", () => {
  it("labels the raw snapshot and still shows an out-of-window capture", async () => {
    currentRows = [
      analysisRow({
        id: "row-old",
        timestamp: "2020-01-01T00:00:00.000Z",
        loadFactorPercent: 90
      })
    ];

    await renderWaveformTab();

    const note = await screen.findByTestId(
      "waveform-snapshot-exception-note"
    );
    expect(note.textContent).toContain(
      "Raw waveform snapshot — not filtered by running-state or window"
    );

    // The snapshot KPI survives the empty trend window: that is the VS-1
    // exception, now labeled rather than silently decoupled.
    expect(screen.getByText("25.40")).toBeTruthy();
    const empty = await screen.findByTestId("waveform-window-empty-note");
    expect(empty.textContent).toContain(
      "No running-state waveform samples in this range"
    );
  });
});

describe("SLICE-VS6 waveform metrics SSOT lockstep", () => {
  it("labels same-date points deterministically in the latest-in-window strip", async () => {
    const now = Date.now();
    currentRows = [
      analysisRow({
        id: "row-a",
        timestamp: new Date(now - 3_600_000).toISOString(),
        loadFactorPercent: 90,
        crestFactor: 4.2,
        impactCount: 2
      }),
      analysisRow({
        id: "row-b",
        timestamp: new Date(now - 60_000).toISOString(),
        loadFactorPercent: 90,
        crestFactor: 5.1,
        impactCount: 3
      })
    ];

    await renderWaveformTab();

    await waitFor(() => {
      const latest = screen.getByTestId("waveform-latest-trend-summary");
      expect(latest.textContent).toContain("· 2");
    });
    expect(
      screen.getByTestId("chart-body-waveformCrest").textContent
    ).not.toContain("Additional historical readings required to plot trend slope");
  });

  it("hides stopped samples when ON and labels them when OFF", async () => {
    const now = Date.now();
    currentRows = [
      analysisRow({
        id: "row-stopped",
        timestamp: new Date(now - 60_000).toISOString(),
        loadFactorPercent: 72,
        crestFactor: 6.2,
        impactCount: 5
      }),
      analysisRow({
        id: "row-running",
        timestamp: new Date(now - 86_400_000).toISOString(),
        loadFactorPercent: 90,
        crestFactor: 4.2,
        impactCount: 2
      })
    ];

    await renderWaveformTab();

    // ON: only the running row is in the trend window, so the single reading
    // gets the shared sparse guard.
    await waitFor(() => {
      expect(screen.getByTestId("waveform-latest-trend-summary").textContent).not.toContain(
        "stopped sample"
      );
    });
    expect(
      screen.getByTestId("chart-body-waveformCrest").textContent
    ).toContain("Additional historical readings required to plot trend slope");

    fireEvent.click(screen.getByRole("button", { name: /Running State Only/ }));

    const note = await screen.findByTestId("waveform-stopped-series-note");
    expect(note.textContent).toContain("Includes stopped samples");
    await waitFor(() => {
      expect(screen.getByTestId("waveform-latest-trend-summary").textContent).toContain(
        "stopped sample"
      );
    });
  });

  it("keeps missing metrics honest instead of plotting a zero", async () => {
    currentRows = [
      analysisRow({
        id: "row-null",
        timestamp: new Date(Date.now() - 60_000).toISOString(),
        loadFactorPercent: 90,
        peakToPeak: null,
        crestFactor: null,
        impactCount: null
      })
    ];

    await renderWaveformTab();

    await screen.findByTestId("waveform-snapshot-exception-note");
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not recorded").length).toBeGreaterThan(0);
    expect(
      screen.getByTestId("chart-body-waveformCrest").textContent
    ).toContain("Additional historical readings required to plot trend slope");
  });
});
