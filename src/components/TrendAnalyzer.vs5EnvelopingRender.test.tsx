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

interface EnvelopeRowOptions {
  id: string;
  timestamp: string;
  loadFactorPercent: number | null;
  rpm?: number | null;
  rpmSource?: string | null;
  enveloping?: Array<{ frequency: number; amplitude: number; label?: string }>;
}

function analysisRow(options: EnvelopeRowOptions) {
  const enveloping = options.enveloping ?? [
    { frequency: 110, amplitude: 0.08, label: "BPFO" }
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
      ...(options.rpmSource != null ? { rpm_source: options.rpmSource } : {}),
      vibration_trend_record: {
        assetId: "M-101",
        timestamp: options.timestamp,
        ...(options.rpm != null ? { rpm: options.rpm } : {}),
        broadband: {
          overallVelocity: 2.5,
          overallAcceleration: 0.42,
          healthScore: 82,
          primaryFault: "Imbalance",
          peakGe: 0.08,
          kurtosis: 4.2
        },
        context: {
          ...(options.loadFactorPercent != null
            ? { loadFactorPercent: options.loadFactorPercent }
            : {}),
          analysisType: "vibration"
        },
        spectral: [],
        enveloping,
        waveform: []
      }
    }
  };
}

function equipmentStore(options: {
  bearingType?: string;
  speedRpm?: number;
}): EquipmentStore {
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
            name: "Motor",
            location: "Test Plant",
            ...(options.bearingType ? { bearingType: options.bearingType } : {}),
            ...(options.speedRpm != null ? { speedRpm: options.speedRpm } : {}),
            components: [
              {
                id: "comp-1",
                name: "Motor DE",
                ...(options.bearingType || options.speedRpm != null
                  ? {
                      kinematics: {
                        ...(options.speedRpm != null
                          ? { ratedRpm: String(options.speedRpm) }
                          : {}),
                        ...(options.bearingType
                          ? { bearingDe: options.bearingType }
                          : {}),
                        isoClass: "Class II"
                      }
                    }
                  : {})
              }
            ]
          }
        ]
      }
    ]
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

let currentRows: ReturnType<typeof analysisRow>[] = [];

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
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

async function renderEnvelopingTab() {
  render(<TrendAnalyzer selectedAssetId="asset-1" />);
  await screen.findByRole("button", { name: "Expand Health Score Trend" });
  fireEvent.click(screen.getByRole("button", { name: "Enveloping & Bearing" }));
}

describe("SLICE-VS5 enveloping defect-frequency dormancy", () => {
  it("renders no overlay and an honest dormant note without geometry/RPM", async () => {
    saveEquipmentStore(equipmentStore({}));
    currentRows = [
      analysisRow({
        id: "row-1",
        timestamp: new Date().toISOString(),
        loadFactorPercent: 90,
        rpm: 1780
      })
    ];

    await renderEnvelopingTab();

    const dormant = await screen.findByTestId(
      "enveloping-bearing-dormant-note"
    );
    expect(dormant.textContent).toContain(
      "envelope trends shown without defect-frequency overlay"
    );
    expect(dormant.textContent).toContain(
      "RPM defaulted at capture \u2014 not measured"
    );
    expect(screen.queryByTestId("enveloping-order-overlay")).toBeNull();
    expect(screen.queryByTestId("enveloping-order-BPFO")).toBeNull();
  });

  it("renders the overlay only with stored geometry AND gating-quality RPM", async () => {
    saveEquipmentStore(
      equipmentStore({ bearingType: "SKF 6320 C3", speedRpm: 1780 })
    );
    currentRows = [
      analysisRow({
        id: "row-geo",
        timestamp: new Date().toISOString(),
        loadFactorPercent: 90
      })
    ];

    await renderEnvelopingTab();

    const overlay = await screen.findByTestId("enveloping-order-overlay");
    expect(overlay).toBeTruthy();
    expect(screen.getByTestId("enveloping-order-BPFO").textContent).toContain(
      "Hz"
    );
    expect(screen.queryByTestId("enveloping-bearing-dormant-note")).toBeNull();
  });

  it("treats a capture-default RPM as NOT gating even with geometry", async () => {
    saveEquipmentStore(equipmentStore({ bearingType: "SKF 6320 C3" }));
    currentRows = [
      analysisRow({
        id: "row-default",
        timestamp: new Date().toISOString(),
        loadFactorPercent: 90,
        rpm: 1780
      })
    ];

    await renderEnvelopingTab();

    const dormant = await screen.findByTestId(
      "enveloping-bearing-dormant-note"
    );
    expect(dormant.textContent).toContain(
      "RPM defaulted at capture \u2014 not measured"
    );
    expect(screen.queryByTestId("enveloping-order-overlay")).toBeNull();
  });
});

describe("SLICE-VS5 enveloping SSOT lockstep", () => {
  it("labels same-date rows deterministically and guards a sparse window", async () => {
    saveEquipmentStore(
      equipmentStore({ bearingType: "SKF 6320 C3", speedRpm: 1780 })
    );
    const start = Date.now() - 60_000;
    const sameTimestamp = new Date(start).toISOString();
    currentRows = [
      analysisRow({
        id: "row-a",
        timestamp: sameTimestamp,
        loadFactorPercent: 90
      }),
      analysisRow({
        id: "row-b",
        timestamp: sameTimestamp,
        loadFactorPercent: 90
      })
    ];

    await renderEnvelopingTab();

    await waitFor(() => {
      expect(screen.getAllByText(/· 1/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/· 2/).length).toBeGreaterThan(0);
    });
    expect(screen.getByTestId("chart-body-envelopingGe").textContent).toContain(
      "Additional historical readings required to plot trend slope"
    );
  });

  it("hides stopped samples when ON and labels them when OFF", async () => {
    saveEquipmentStore(
      equipmentStore({ bearingType: "SKF 6320 C3", speedRpm: 1780 })
    );
    const recent = new Date(Date.now() - 60_000).toISOString();
    currentRows = [
      analysisRow({
        id: "row-stopped",
        timestamp: recent,
        loadFactorPercent: 72
      }),
      analysisRow({
        id: "row-running",
        timestamp: new Date(Date.now() - 86_400_000).toISOString(),
        loadFactorPercent: 90
      })
    ];

    await renderEnvelopingTab();

    fireEvent.click(screen.getByRole("button", { name: /Running State Only/ }));
    const note = await screen.findByTestId("enveloping-stopped-series-note");
    expect(note.textContent).toContain("Includes stopped samples");
    expect(screen.getAllByText("stopped sample").length).toBeGreaterThan(0);
  });

  it("states an empty window honestly instead of a stale full-range line", async () => {
    saveEquipmentStore(
      equipmentStore({ bearingType: "SKF 6320 C3", speedRpm: 1780 })
    );
    currentRows = [
      analysisRow({
        id: "row-old",
        timestamp: "2020-01-01T00:00:00.000Z",
        loadFactorPercent: 90
      })
    ];

    await renderEnvelopingTab();

    const empty = await screen.findByTestId("enveloping-window-empty-note");
    expect(empty.textContent).toContain(
      "No running-state enveloping samples in this range"
    );
    expect(screen.getByTestId("chart-body-envelopingGe").textContent).toContain(
      "No recorded g"
    );
  });
});
