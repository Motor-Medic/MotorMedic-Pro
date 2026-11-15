// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen
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

interface EnvRowOptions {
  id: string;
  timestamp: string;
  loadFactorPercent: number | null;
  rpm?: number | null;
  rpmSource?: string | null;
  /** Stored waveform crest factor + peak / RMS (capture-time computed). */
  waveformMetrics?: {
    peakAmplitude: number;
    crestFactor: number;
    rmsValue: number;
  };
}

function analysisRow(options: EnvRowOptions) {
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
          kurtosis: options.waveformMetrics?.crestFactor ?? 4.2
        },
        context: {
          ...(options.loadFactorPercent != null
            ? { loadFactorPercent: options.loadFactorPercent }
            : {}),
          analysisType: "vibration"
        },
        spectral: [],
        enveloping: [{ frequency: 110, amplitude: 0.08, label: "BPFO" }],
        waveform: [],
        ...(options.waveformMetrics
          ? { waveformMetrics: options.waveformMetrics }
          : {})
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

describe("SLICE-VIB-ENV crest-factor audit renders", () => {
  it("renders dormant gating + absent-CF fallback without geometry and without stored CF", async () => {
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

    // Kinematic gate stays dormant — no geometry.
    const dormant = await screen.findByTestId("enveloping-bearing-dormant-note");
    expect(dormant.textContent).toContain(
      "envelope trends shown without defect-frequency overlay"
    );
    expect(screen.queryByTestId("enveloping-order-overlay")).toBeNull();
    expect(
      screen.queryByTestId("enveloping-kinematic-theoretical-note")
    ).toBeNull();

    // CF audit confesses absence — no fabricated shock index.
    const audit = screen.getByTestId("enveloping-crest-factor-audit");
    const absent = screen.getByTestId("enveloping-crest-absent-note");
    expect(absent.textContent).toContain(
      "No stored waveform crest factor in this window"
    );
    expect(absent.textContent).toContain("no shock index is fabricated");
    expect(screen.queryByTestId("enveloping-crest-value")).toBeNull();
    expect(audit.textContent).toContain("CF = peak / RMS");
  });

  it("renders the gated kinematic label and the stored CF audit when configured", async () => {
    saveEquipmentStore(
      equipmentStore({ bearingType: "SKF 6320 C3", speedRpm: 1780 })
    );
    currentRows = [
      analysisRow({
        id: "row-cf",
        timestamp: new Date().toISOString(),
        loadFactorPercent: 90,
        waveformMetrics: {
          peakAmplitude: 2.1,
          crestFactor: 6.3,
          rmsValue: 0.33
        }
      })
    ];

    await renderEnvelopingTab();

    // Theoretical kinematic frequencies label appears inside the gate.
    const kin = await screen.findByTestId(
      "enveloping-kinematic-theoretical-note"
    );
    expect(kin.textContent).toContain(
      "Theoretical kinematic frequencies (from stored geometry + RPM)"
    );
    expect(kin.textContent).toContain("never a confirmed fault");
    expect(screen.getByTestId("enveloping-order-overlay")).toBeTruthy();

    // CF audit: stored value, dimensionless, threshold labeled in-repo heuristic.
    const value = screen.getByTestId("enveloping-crest-value");
    expect(value.textContent).toBe("6.30");
    expect(value.textContent).not.toMatch(/mm\/s|in\/s|\bg\b/);
    expect(screen.getByTestId("enveloping-crest-peak").textContent).toBe("2.1");
    expect(screen.getByTestId("enveloping-crest-rms").textContent).toBe("0.33");
    const threshold = screen.getByTestId("enveloping-crest-threshold-note");
    expect(threshold.textContent).toContain("in-repo heuristic");
    expect(threshold.textContent).toContain("not a published standard");
    expect(threshold.textContent).toContain("never unit-converted");
    const audit = screen.getByTestId("enveloping-crest-factor-audit");
    expect(audit.textContent).toContain("dimensionless");
    expect(audit.textContent).not.toContain("mm/s");
    expect(audit.textContent).not.toContain("in/s");
  });

  it("keeps the CF audit inside the shared SSOT window (old rows confess absence)", async () => {
    saveEquipmentStore(
      equipmentStore({ bearingType: "SKF 6320 C3", speedRpm: 1780 })
    );
    currentRows = [
      analysisRow({
        id: "row-old",
        timestamp: "2020-01-01T00:00:00.000Z",
        loadFactorPercent: 90,
        waveformMetrics: {
          peakAmplitude: 2.1,
          crestFactor: 6.3,
          rmsValue: 0.33
        }
      })
    ];

    await renderEnvelopingTab();

    // The stored CF exists in history but is outside the 7D default window —
    // the audit must NOT reach past the window for it.
    expect(await screen.findByTestId("enveloping-crest-absent-note")).toBeTruthy();
    expect(screen.queryByTestId("enveloping-crest-value")).toBeNull();
  });
});
