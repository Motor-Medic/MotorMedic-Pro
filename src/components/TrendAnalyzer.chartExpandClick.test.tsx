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

const ANALYSIS_TIMESTAMP = "2020-01-01T00:00:00.000Z";

function analysisRow() {
  return {
    id: "row-1",
    asset_id: "M-101",
    component: null,
    analysis_type: "vibration",
    timestamp: ANALYSIS_TIMESTAMP,
    health_score: 82,
    primary_fault: "Imbalance",
    recommendations: [],
    peaks: [],
    telemetry_data: {
      vibration_trend_record: {
        assetId: "M-101",
        timestamp: ANALYSIS_TIMESTAMP,
        rpm: 1800,
        broadband: {
          overallVelocity: 3.2,
          overallAcceleration: 0.42,
          healthScore: 82,
          primaryFault: "Imbalance",
          kurtosis: 4.2
        },
        spectral: [{ frequency: 30, amplitude: 1.1, label: "1X" }],
        enveloping: [{ frequency: 110, amplitude: 0.08, label: "BPFO" }],
        waveform: [
          { time: 0, amplitude: 0.1 },
          { time: 10, amplitude: -0.2 },
          { time: 20, amplitude: 0.15 }
        ],
        waveformMetrics: {
          peakAmplitude: 0.2,
          crestFactor: 4.2,
          rmsValue: 0.07
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
  return {
    ok: true,
    json: async () => data
  } as Response;
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

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
        return jsonResponse({ results: [analysisRow()] });
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

async function openChartAndAssert({
  modeButton,
  iconLabel,
  dialogLabel,
  bodyId
}: {
  modeButton?: string;
  iconLabel: string;
  dialogLabel: string;
  bodyId: string;
}) {
  if (modeButton) {
    fireEvent.click(screen.getByRole("button", { name: modeButton }));
  }

  const icon = await screen.findByRole("button", { name: iconLabel });
  icon.focus();
  fireEvent.click(icon);

  const dialog = await screen.findByRole("dialog", { name: dialogLabel });
  expect(dialog).toBeTruthy();
  expect(within(dialog).getByTestId(`chart-body-${bodyId}`)).toBeTruthy();
  expect(document.activeElement?.getAttribute("aria-label")).toBe(
    "Close enlarged chart"
  );

  fireEvent.keyDown(document, { key: "Escape" });

  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  expect(document.activeElement).toBe(icon);
}

async function renderAnalyzer() {
  render(<TrendAnalyzer selectedAssetId="asset-1" />);
  await screen.findByRole("button", { name: "Expand Health Score Trend" });
}

describe("SLICE-R chart expand icons open the shared modal", () => {
  it("opens the health score chart from tab 1", async () => {
    await renderAnalyzer();
    await openChartAndAssert({
      iconLabel: "Expand Health Score Trend",
      dialogLabel: "Health Score Trend",
      bodyId: "health"
    });
  });

  it("opens the peak velocity chart from tab 1", async () => {
    await renderAnalyzer();
    await openChartAndAssert({
      iconLabel: "Expand Peak Velocity",
      dialogLabel: "Peak Velocity",
      bodyId: "velocity"
    });
  });

  it("opens the spectral chart from the Spectral & Harmonics tab", async () => {
    await renderAnalyzer();
    await openChartAndAssert({
      modeButton: "Spectral & Harmonics",
      iconLabel: "Enlarge Spectral & Harmonics chart",
      dialogLabel: "Spectral & Harmonics",
      bodyId: "spectral"
    });
  });

  it("opens the peak gE chart from the Enveloping & Bearing tab", async () => {
    await renderAnalyzer();
    await openChartAndAssert({
      modeButton: "Enveloping & Bearing",
      iconLabel: "Enlarge Peak gE Trend chart",
      dialogLabel: "Peak gE Trend",
      bodyId: "envelopingGe"
    });
  });

  it("opens the kurtosis chart from the Enveloping & Bearing tab", async () => {
    await renderAnalyzer();
    await openChartAndAssert({
      modeButton: "Enveloping & Bearing",
      iconLabel: "Enlarge Kurtosis Trend chart",
      dialogLabel: "Kurtosis Trend",
      bodyId: "envelopingKurtosis"
    });
  });

  it("opens the time waveform chart from the Waveform Metrics tab", async () => {
    await renderAnalyzer();
    await openChartAndAssert({
      modeButton: "Waveform Metrics",
      iconLabel: "Enlarge Time Waveform chart",
      dialogLabel: "Time Waveform",
      bodyId: "waveformTime"
    });
  });

  it("opens the crest factor chart from the Waveform Metrics tab", async () => {
    await renderAnalyzer();
    await openChartAndAssert({
      modeButton: "Waveform Metrics",
      iconLabel: "Enlarge Crest Factor Trend chart",
      dialogLabel: "Crest Factor Trend",
      bodyId: "waveformCrest"
    });
  });

  it("opens the impact count chart from the Waveform Metrics tab", async () => {
    await renderAnalyzer();
    await openChartAndAssert({
      modeButton: "Waveform Metrics",
      iconLabel: "Enlarge Impact Count Trend chart",
      dialogLabel: "Impact Count Trend",
      bodyId: "waveformImpact"
    });
  });
});

describe("SLICE-P broadband tab no longer promises Spectrum A/B", () => {
  it("renders no click-to-compare copy or dangling comparison display", async () => {
    await renderAnalyzer();
    expect(
      screen.queryByText(/Click any data point to set as Spectrum A or B/i)
    ).toBeNull();
    expect(screen.queryByText(/next: Spectrum/i)).toBeNull();
    expect(screen.queryByText(/Spectrum A/i)).toBeNull();
    expect(screen.queryByText(/Spectrum B/i)).toBeNull();
    expect(
      screen.queryByText(/Historical & Spectrum Comparison Tools/i)
    ).toBeNull();
    expect(
      screen.queryByText(/populate Spectrum A and B/i)
    ).toBeNull();
  });
});
