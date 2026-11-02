// @vitest-environment jsdom
import { readFileSync } from "node:fs";
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
  PD_PEAK_DB_BRACKETS,
  PD_PEAK_DB_SOURCE,
  evaluatePdPeakDb
} from "../lib/maintenance/prescriptiveDictionary";

const src = readFileSync(
  join(process.cwd(), "src", "components", "TrendAnalyzer.tsx"),
  "utf8"
);

function block(start: string, end: string): string {
  const from = src.indexOf(start);
  const to = src.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return src.slice(from, to);
}

const pdMemos = block(
  "const ueElectricalAnalyses = useMemo",
  "const ueSteamAnalyses = useMemo"
);

const pdRowBuilder = block(
  "function uePdInventoryFromRow",
  "function optionalPdConfidence"
);

const pdClassifier = block(
  "function classifyPdFromPeakDb",
  "function pdSeverityRank"
);

const pdUi = block(
  ') : ueMode === "electrical" ? (',
  ') : ueMode === "steam" ? ('
);

const advisoryBlock = block(
  "const PD_ELECTRICAL_ADVISORY =",
  "type UePdInventoryRow = {"
);

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
          name: "Switchgear",
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
    primary_fault: "Corona",
    recommendations: [],
    peaks: [],
    ...overrides
  };
}

function electricalPeak(overrides: Row = {}): Row {
  return {
    type: "ultrasound",
    peak_dbmv: 55,
    rms_dbmv: 39,
    baseline_dbmv: 28,
    delta_db: 27,
    mode: "electrical",
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
  rows = [];
});

async function openElectricalTab() {
  render(<TrendAnalyzer selectedAssetId="asset-1" />);
  const cards = await screen.findByTestId("trend-tech-cards");
  fireEvent.click(within(cards).getByRole("button", { name: /Ultrasound/ }));
  const tab = await screen.findByRole("button", { name: "Electrical PD" });
  fireEvent.click(tab);
  await waitFor(() => {
    expect(screen.queryByText("Loading ultrasound trends…")).toBeNull();
  });
}

describe("SLICE-AC PD thresholds are an in-repo labelled table", () => {
  it("keeps peak-dBµV boundaries in an explicit static guidance table", () => {
    expect(PD_PEAK_DB_BRACKETS).toHaveLength(4);
    expect(PD_PEAK_DB_SOURCE).toContain("Static in-repo");
    expect(PD_PEAK_DB_SOURCE).toContain("peak dBµV");
    expect(PD_PEAK_DB_SOURCE).toContain("no in-repo PD mechanism rubric");
    expect(PD_PEAK_DB_SOURCE).toContain("not an industry severity standard");
    expect(pdUi).toContain("PD_PEAK_DB_SOURCE");
  });

  it("preserves the existing screening boundaries exactly", () => {
    expect(evaluatePdPeakDb(14.9).classification).toBe("Normal");
    expect(evaluatePdPeakDb(15).classification).toBe("Corona");
    expect(evaluatePdPeakDb(24.9).classification).toBe("Corona");
    expect(evaluatePdPeakDb(25).classification).toBe("Surface Tracking");
    expect(evaluatePdPeakDb(40).classification).toBe("Surface Tracking");
    expect(evaluatePdPeakDb(40.1).classification).toBe("General Discharge");
  });

  it("keeps the pre-existing classification labels because no in-repo rubric was found", () => {
    expect(PD_PEAK_DB_SOURCE).toContain("no in-repo PD mechanism rubric");
    // No new mechanism brackets were invented; the prior screening labels are
    // retained and consume the same peak-only table as severity.
    expect(PD_PEAK_DB_BRACKETS.map((b) => b.classification)).toEqual([
      "Normal",
      "Corona",
      "Surface Tracking",
      "General Discharge"
    ]);
    expect(PD_PEAK_DB_BRACKETS.map((b) => b.classification)).not.toContain(
      "Arcing"
    );
  });

  it("returns classification and severity from the same bracket (agree-or-both-omit)", () => {
    for (const bracket of PD_PEAK_DB_BRACKETS) {
      const sample =
        bracket.maxPeakDb === Infinity
          ? bracket.minPeakDb + 1
          : bracket.maxInclusive
            ? bracket.maxPeakDb
            : bracket.maxPeakDb - 0.1;
      const evaluated = evaluatePdPeakDb(sample);
      expect(evaluated.severity).toBe(bracket.severity);
      expect(evaluated.classification).toBe(bracket.classification);
    }
    // The row classifier delegates to the table rather than re-listing literals.
    expect(pdClassifier).toContain("evaluatePdPeakDb(");
    expect(pdRowBuilder).toContain("const classified = classifyPdFromPeakDb(peakDb)");
    expect(src).not.toMatch(/if \(peak < 15\)/);
    expect(src).not.toMatch(/if \(peak < 25\)/);
    expect(src).not.toMatch(/if \(peak <= 40\)/);
  });
});

describe("SLICE-AC baseline delta honesty on the PD tab", () => {
  it("reads AB's persisted source/fallback fields and discloses a modeled delta", () => {
    expect(pdRowBuilder).toContain("baseline_source");
    expect(pdRowBuilder).toContain("baseline_fallback_db");
    expect(pdRowBuilder).toContain("baselineFallbackDb");
    expect(pdMemos).toContain('row.baselineSource === "fallback"');
    expect(pdUi).toContain('data-testid="ue-pd-baseline-disclosure"');
    expect(pdUi).toContain('data-testid="ue-pd-baseline-fallback-note"');
    expect(pdUi).toContain("Delta is");
    expect(pdUi).toContain("modeled, not measured");
    expect(pdUi).toContain('data-testid="ue-pd-delta-modeled"');
    expect(pdUi).toContain("(modeled)");
  });

  it("states that severity rests on peak dBµV thresholds, not the fallback delta", () => {
    expect(pdUi).toContain("peak dBµV");
    expect(pdUi).toContain("not the baseline delta");
    // Classification/severity consume peakDb, never baselineDelta.
    expect(pdRowBuilder).toContain("classifyPdFromPeakDb(peakDb)");
    expect(pdRowBuilder).not.toContain("classifyPdFromPeakDb(baselineDelta");
  });
});

describe("SLICE-AC PD render: fallback disclosure and severity basis", () => {
  it("labels a fallback-derived delta as modeled and shows the 28 dBµV basis", async () => {
    rows = [
      baseRow({
        peaks: [
          electricalPeak({
            baseline_source: "fallback",
            baseline_fallback_db: 28
          })
        ]
      })
    ];

    await openElectricalTab();

    const note = await screen.findByTestId("ue-pd-baseline-fallback-note");
    expect(note.textContent).toContain("28 dBµV");
    expect(note.textContent).toContain("no stored baseline");
    expect(note.textContent).toContain("modeled, not measured");

    const disclosure = await screen.findByTestId("ue-pd-baseline-disclosure");
    expect(disclosure.textContent).toContain("peak dBµV");
    expect(disclosure.textContent).toContain("not the baseline delta");

    expect(await screen.findByTestId("ue-pd-delta-modeled")).toBeTruthy();
    expect(screen.getAllByText(/27\.0 dB/).length).toBeGreaterThanOrEqual(1);
  });

  it("derives a modeled delta from the fallback baseline when no delta is stored", async () => {
    rows = [
      baseRow({
        peaks: [
          electricalPeak({
            baseline_dbmv: undefined,
            delta_db: undefined,
            baseline_source: "fallback",
            baseline_fallback_db: 28
          })
        ]
      })
    ];

    await openElectricalTab();

    await screen.findByTestId("ue-pd-baseline-fallback-note");
    expect(screen.getAllByText(/27\.0 dB/).length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByTestId("ue-pd-delta-modeled")).toBeTruthy();
  });

  it("does not label a stored-baseline delta as modeled", async () => {
    rows = [
      baseRow({
        peaks: [electricalPeak({ baseline_source: "stored" })]
      })
    ];

    await openElectricalTab();

    await screen.findByTestId("ue-pd-baseline-disclosure");
    expect(screen.queryByTestId("ue-pd-baseline-fallback-note")).toBeNull();
    expect(screen.queryByTestId("ue-pd-delta-modeled")).toBeNull();
  });
});

describe("SLICE-AC PD windowing lockstep and absent-vs-zero", () => {
  it("windows PD history through the shared predicate", () => {
    expect(pdMemos).toContain(
      "windowTrendByTimeRange(ueElectricalAnalyses, timeRange)"
    );
    expect(pdMemos).toContain(
      "[...windowedUePdAnalyses.map(uePdInventoryFromRow)]"
    );
    expect(pdMemos).not.toContain("ueElectricalAnalyses.map(uePdInventoryFromRow)");
    expect(pdMemos).toContain(
      "const uePdKpisAbsent = windowedUePdAnalyses.length === 0"
    );
    expect(pdMemos).toContain("for (const row of uePdInventoryRows)");
    expect(pdMemos).not.toContain("for (const row of ueElectricalAnalyses)");
  });

  it("excludes an out-of-window PD scan from both the table and the KPIs", async () => {
    rows = [
      baseRow({
        id: "old",
        timestamp: "2020-01-01T00:00:00.000Z",
        peaks: [electricalPeak({ peak_dbmv: 55, delta_db: 27 })]
      }),
      baseRow({
        id: "recent",
        timestamp: NOW,
        peaks: [
          electricalPeak({
            peak_dbmv: 20,
            delta_db: 5,
            baseline_source: "stored"
          })
        ]
      })
    ];

    await openElectricalTab();

    await waitFor(() => {
      expect(screen.getAllByText("20.0 dBµV").length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.queryByText("55.0 dBµV")).toBeNull();
    expect(screen.queryByTestId("ue-pd-electrical-advisory")).toBeNull();
  });

  it("renders N/A instead of zeros when the window holds no PD scans", async () => {
    // A stored non-PD ultrasound scan keeps the Ultrasound view alive so the
    // electrical tab (not the generic tech empty state) is exercised.
    rows = [
      baseRow({
        primary_fault: "Bearing",
        peaks: [
          {
            type: "ultrasound",
            peak_dbmv: 40,
            rms_dbmv: 30,
            mode: "mechanical"
          }
        ]
      })
    ];

    await openElectricalTab();

    expect(await screen.findByText(/No stored electrical PD scans/)).toBeTruthy();
    expect(screen.getAllByText("N/A").length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText("0.0 dBµV")).toBeNull();
    expect(screen.queryByText("0.0 dB")).toBeNull();
  });

  it("keeps KPI fields nullable rather than substituting zero", () => {
    expect(pdMemos).toContain("peakElectricalDb: null as number | null");
    expect(pdMemos).toContain("avgBaselineDelta: null as number | null");
    expect(pdMemos).toContain("threatLabel: \"N/A\"");
    expect(pdUi).toContain('? "N/A"');
  });
});

describe("SLICE-AC electrical advisory is safety-safe", () => {
  it("uses generic guidance with no category, protective-equipment, or energy claim", async () => {
    rows = [
      baseRow({
        peaks: [electricalPeak({ baseline_source: "stored" })]
      })
    ];

    await openElectricalTab();

    const advisory = await screen.findByTestId("ue-pd-electrical-advisory");
    expect(advisory.textContent).toContain("Severe acoustic discharge detected");
    expect(advisory.textContent).toContain(
      "follow site electrical safety procedures before approach"
    );
    expect(advisory.textContent).not.toMatch(/correlat/i);
    expect(advisory.textContent).not.toMatch(/corresponding signature/i);
    expect(advisory.textContent).not.toMatch(/NFPA/i);
    expect(advisory.textContent).not.toMatch(/\bPPE\b|protective equipment|category/i);
    expect(advisory.textContent).not.toMatch(/incident[ -]energy|arc[ -]flash/i);
  });

  it("keeps the cross-tech line a workflow pointer only", () => {
    expect(advisoryBlock).toContain(
      "Consider thermal follow-up per site procedure when critical discharge is present."
    );
    expect(advisoryBlock).not.toMatch(/correlat/i);
    expect(advisoryBlock).not.toMatch(/corresponding signature/i);
    expect(advisoryBlock).not.toMatch(/thermal signature exists/i);
  });

  it("contains zero electrical-standard/category strings anywhere in the PD surface file", () => {
    // Scoped to the file this slice owns: pre-existing Infrared/NFPA 70B copy
    // and unrelated report files are outside the PD advisory surface.
    expect(src).not.toMatch(/NFPA\s*70E/i);
    expect(src).not.toMatch(/incident[ -]energy/i);
    expect(src).not.toMatch(/arc[ -]flash/i);
    expect(src).not.toMatch(/\bPPE\b/);
    expect(src).not.toMatch(/Category\s*[0-9]/i);
  });
});

describe("SLICE-AC dBµV isolation", () => {
  it("keeps dBµV and dB deltas outside the H2 display-unit prefs", () => {
    expect(pdUi).toContain("dBµV");
    expect(pdUi).toContain(" dB");
    for (const forbidden of [
      "displayUnits",
      "formatVelocityDisplay",
      "formatAccelerationDisplay",
      "velocityValueForDisplay",
      "frequencyValueForDisplay",
      "convertTemperature"
    ]) {
      expect(pdUi).not.toContain(forbidden);
    }
  });
});
