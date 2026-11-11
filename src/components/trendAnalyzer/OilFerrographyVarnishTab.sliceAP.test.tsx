// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FERROGRAPHY_DATA_QUALITY_WARNING,
  distinctDatePoints,
  validateFerrographyReadings,
  validateFerrographySample
} from "../../lib/oilAnalysisMetrics";
import {
  buildOilSampleSavePayload,
  ferrographySaveWarnings
} from "../../lib/oilDiagnosticSave";
import type { OilSample } from "../../types/oilAnalysis";
import OilFerrographyVarnishTab from "./OilFerrographyVarnishTab";
import OilWearMetalsTab from "./OilWearMetalsTab";

type Row = Record<string, unknown>;

function sample(overrides: Partial<OilSample> = {}): OilSample {
  return {
    assetId: "a",
    sampleDate: "2026-01-01",
    operatingHours: 0,
    ironAlarmLimit: 100,
    copperAlarmLimit: 50,
    chromiumAlarmLimit: 25,
    leadAlarmLimit: 30,
    aluminumAlarmLimit: 40,
    siliconAlarmLimit: 30,
    ...overrides
  };
}

const fetchMock = vi.fn();

function mockRows(rows: Row[]) {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ samples: rows })
  });
}

function baseRow(overrides: Row = {}): Row {
  return {
    id: "sample-1",
    asset_id: "asset-1",
    sample_date: "2026-03-01",
    operating_hours: 300,
    iron: 20,
    copper: 5,
    chromium: 1,
    lead: 2,
    aluminum: 3,
    silicon: 8,
    dr_large: 12.5,
    dr_small: 4.2,
    mpc_delta_e: 28.4,
    ruler_percent: 42,
    uc_rating: 3,
    ...overrides
  };
}

function kpiCount(): number | null {
  const text = document.body.textContent ?? "";
  const match = text.match(/(\d+) of (\d+) samples in range/);
  return match ? Number(match[1]) : null;
}

function bodyRowCount(): number {
  return document.querySelectorAll("tbody tr").length;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("Ferrography validity gate SLICE-AP (pure)", () => {
  it("rejects the demo negatives and accepts measured zeros", () => {
    const dsNegative = validateFerrographyReadings({ drSmall: -3.0 });
    expect(dsNegative.present).toBe(true);
    expect(dsNegative.valid).toBe(false);
    expect(dsNegative.issues.join(" ")).toContain("DR Small (DS)");
    expect(dsNegative.issues.join(" ")).toContain("-3");

    const rulerNegative = validateFerrographyReadings({ rulerPercent: -5 });
    expect(rulerNegative.valid).toBe(false);
    expect(rulerNegative.issues.join(" ")).toContain("RULER %");

    expect(validateFerrographyReadings({ drLarge: 0, drSmall: 0 }).valid).toBe(
      true
    );
    expect(validateFerrographyReadings({ mpcDeltaE: 0 }).valid).toBe(true);
    expect(validateFerrographyReadings({ rulerPercent: 0 }).valid).toBe(true);
    expect(validateFerrographyReadings({ ucRating: 0 }).valid).toBe(true);
  });

  it("enforces RULER 0-100, MPC >= 0, UC 0-8 and non-negative densities", () => {
    expect(validateFerrographyReadings({ rulerPercent: 101 }).valid).toBe(false);
    expect(validateFerrographyReadings({ mpcDeltaE: -0.1 }).valid).toBe(false);
    expect(validateFerrographyReadings({ ucRating: 9 }).valid).toBe(false);
    expect(validateFerrographyReadings({ drLarge: -1 }).valid).toBe(false);
    expect(validateFerrographyReadings({ ucRating: 8 }).valid).toBe(true);
  });

  it("treats an absent reading as not measured, not invalid", () => {
    expect(validateFerrographyReadings({})).toEqual({
      present: false,
      valid: false,
      issues: [],
      fieldIssues: []
    });
    expect(
      validateFerrographySample(
        sample({ assetId: "a", sampleDate: "2026-01-01", operatingHours: 1 })
      ).present
    ).toBe(false);
  });

  it("carries the same warning through the save path without dropping raw data", () => {
    const warnings = ferrographySaveWarnings({ drSmall: -3, rulerPercent: -5 });
    expect(warnings.length).toBe(2);

    const payload = buildOilSampleSavePayload(
      { drLarge: 4, drSmall: -3, rulerPercent: -5 },
      "asset-1",
      "2026-03-01"
    );
    expect(payload?.drSmall).toBe(-3);
    expect(payload?.rulerPercent).toBe(-5);
  });

  it("dedupes projection points by date and requires three distinct dates", () => {
    const samples = [
      sample({
        sampleDate: "2026-01-01",
        operatingHours: 100,
        mpcDeltaE: 10
      }),
      sample({
        sampleDate: "2026-01-01",
        operatingHours: 110,
        mpcDeltaE: 12
      }),
      sample({
        sampleDate: "2026-02-01",
        operatingHours: 200,
        mpcDeltaE: 20
      })
    ];
    const points = distinctDatePoints(samples, (s) => s.mpcDeltaE);
    expect(points).toHaveLength(2);
    expect(points[0].value).toBe(12);
  });
});

describe("OilFerrographyVarnishTab SLICE-AP validity gate", () => {
  it("warns on DS=-3.0 and suppresses WPC/WSI/PLP while showing the raw value", async () => {
    mockRows([
      baseRow({ id: "bad-ds", dr_large: 4, dr_small: -3, mpc_delta_e: 19.5 })
    ]);

    render(<OilFerrographyVarnishTab assetId="asset-1" />);

    expect(await screen.findByText("Ferrography & Varnish")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      FERROGRAPHY_DATA_QUALITY_WARNING
    );
    expect(screen.getByText(/DR Small \(DS\) cannot be negative/)).toBeTruthy();
    // Raw lab entry stays visible in the table.
    expect(screen.getAllByText("-3.0").length).toBeGreaterThan(0);
    // Pre-fix this sample rendered PLP 400% and a WSI from squared negatives.
    expect(screen.queryByText("400%")).toBeNull();
    expect(screen.getByText(/Out of range — see data-quality warning/)).toBeTruthy();
    expect(screen.queryByText("Needs both DL and DS densities")).toBeNull();
  });

  it("warns on RULER=-5% and withholds the band badge, risk index and projection", async () => {
    mockRows([
      baseRow({ id: "bad-ruler", ruler_percent: -5, mpc_delta_e: 12 })
    ]);

    render(<OilFerrographyVarnishTab assetId="asset-1" />);

    expect(await screen.findByText("Ferrography & Varnish")).toBeTruthy();
    expect(screen.getByText(/RULER % must sit between 0 and 100/)).toBeTruthy();
    expect(screen.getAllByText("-5%").length).toBeGreaterThan(0);
    // rulerBand(-5) would be "critical"; the badge is suppressed.
    expect(screen.queryByText(/^critical$/i)).toBeNull();
    expect(
      screen.getAllByText(/Withheld — reading failed the data-quality check/)
        .length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/cannot project — reading failed the data-quality check/)
        .length
    ).toBeGreaterThan(0);
  });

  it("renders derivations normally for in-range values", async () => {
    mockRows([baseRow()]);

    render(<OilFerrographyVarnishTab assetId="asset-1" />);

    expect(await screen.findByText("Ferrography & Varnish")).toBeTruthy();
    expect(screen.getAllByText("16.7").length).toBeGreaterThan(0);
    expect(screen.getAllByText("139").length).toBeGreaterThan(0);
    expect(screen.getAllByText("50%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("abnormal").length).toBeGreaterThan(0);
    expect(screen.getAllByText("warning").length).toBeGreaterThan(0);
    expect(screen.getByText("/ 100")).toBeTruthy();
    expect(
      screen.getByText(
        "WPC = DL + DS | WSI = DL² - DS² | PLP = (DL - DS) / (DL + DS) × 100"
      )
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("OilFerrographyVarnishTab SLICE-AP projection gate", () => {
  it("refuses to project below three distinct-date samples", async () => {
    mockRows([
      baseRow({
        id: "a",
        sample_date: "2026-01-01",
        operating_hours: 100,
        mpc_delta_e: 10
      }),
      baseRow({
        id: "b",
        sample_date: "2026-02-01",
        operating_hours: 200,
        mpc_delta_e: 20
      })
    ]);

    render(<OilFerrographyVarnishTab assetId="asset-1" />);

    expect(await screen.findByText("Ferrography & Varnish")).toBeTruthy();
    expect(
      screen.getAllByText(
        /cannot project — insufficient dated samples \(2 of 3 required\)/
      ).length
    ).toBe(2);
    expect(screen.queryByText(/projected to cross/)).toBeNull();
    expect(screen.queryByText(/operating hours \(in ~/)).toBeNull();
  });

  it("does not count duplicate same-day uploads toward the three-date gate", async () => {
    mockRows([
      baseRow({
        id: "a1",
        sample_date: "2026-01-01",
        operating_hours: 100,
        mpc_delta_e: 10
      }),
      baseRow({
        id: "a2",
        sample_date: "2026-01-01",
        operating_hours: 110,
        mpc_delta_e: 12
      }),
      baseRow({
        id: "b",
        sample_date: "2026-02-01",
        operating_hours: 200,
        mpc_delta_e: 20
      })
    ]);

    render(<OilFerrographyVarnishTab assetId="asset-1" />);

    expect(await screen.findByText("Ferrography & Varnish")).toBeTruthy();
    expect(
      screen.getAllByText(
        /cannot project — insufficient dated samples \(2 of 3 required\)/
      ).length
    ).toBe(2);
  });

  it("projects once three distinct dates carry the reading and labels the default band", async () => {
    mockRows([
      baseRow({
        id: "a",
        sample_date: "2026-01-01",
        operating_hours: 100,
        mpc_delta_e: 10
      }),
      baseRow({
        id: "b",
        sample_date: "2026-02-01",
        operating_hours: 200,
        mpc_delta_e: 20
      }),
      baseRow({
        id: "c",
        sample_date: "2026-03-01",
        operating_hours: 300,
        mpc_delta_e: 28
      })
    ]);

    render(<OilFerrographyVarnishTab assetId="asset-1" />);

    expect(await screen.findByText("Ferrography & Varnish")).toBeTruthy();
    expect(screen.getByText(/projected to cross 30 ΔE/)).toBeTruthy();
    expect(
      screen.getByText(/in-repo default band \(MPC 30 ΔE \/ RULER 25%\), not an OEM or lab limit/)
    ).toBeTruthy();
    expect(
      screen.getByText(/planning estimate,\s+not a guarantee/)
    ).toBeTruthy();
  });
});

describe("OilFerrographyVarnishTab SLICE-AP windowing lockstep", () => {
  it("keeps the in-range KPI equal to the rendered rows and filters cards", async () => {
    mockRows([
      baseRow({ id: "jan", sample_date: "2026-01-15", mpc_delta_e: 10 }),
      baseRow({ id: "feb", sample_date: "2026-02-15", mpc_delta_e: 18 }),
      baseRow({ id: "mar", sample_date: "2026-03-15", mpc_delta_e: 26 })
    ]);

    render(
      <OilFerrographyVarnishTab
        assetId="asset-1"
        windowStart="2026-02-01"
        windowEnd="2026-03-31"
      />
    );

    expect(await screen.findByText("Ferrography & Varnish")).toBeTruthy();
    expect(kpiCount()).toBe(2);
    expect(bodyRowCount()).toBe(2);
    // Latest in-window sample drives the summary card.
    expect(screen.getAllByText("26.0").length).toBeGreaterThan(0);
  });

  it("shows an honest empty state when the window contains no samples", async () => {
    mockRows([baseRow({ sample_date: "2026-01-15" })]);

    render(
      <OilFerrographyVarnishTab assetId="asset-1" windowStart="2027-01-01" />
    );

    expect(
      await screen.findByText("No oil samples in the selected date range")
    ).toBeTruthy();
    expect(screen.queryByText("Ferrography & Varnish")).toBeNull();
  });
});

describe("OilFerrographyVarnishTab SLICE-AP transition anchoring", () => {
  it("anchors to the nearest earlier VALID morphology sample in sequence order", async () => {
    mockRows([
      baseRow({
        id: "old-valid",
        sample_date: "2026-01-01",
        morph_cutting: "mild"
      }),
      baseRow({
        id: "middle-invalid",
        sample_date: "2026-02-01",
        dr_small: -3,
        morph_cutting: "severe"
      }),
      baseRow({
        id: "latest-valid",
        sample_date: "2026-03-01",
        morph_cutting: "severe"
      })
    ]);

    render(<OilFerrographyVarnishTab assetId="asset-1" />);

    expect(await screen.findByText("Ferrography & Varnish")).toBeTruthy();
    // If the invalid middle record anchored the comparison, this alert would
    // not fire (severe → severe). The nearest earlier valid sample is mild.
    expect(
      screen.getByText(/Cutting Wear escalated from mild to severe/)
    ).toBeTruthy();
  });

  it("suppresses transition banners when the latest record fails validity", async () => {
    mockRows([
      baseRow({
        id: "old-valid",
        sample_date: "2026-01-01",
        morph_cutting: "trace"
      }),
      baseRow({
        id: "latest-invalid",
        sample_date: "2026-02-01",
        dr_small: -3,
        morph_cutting: "severe"
      })
    ]);

    render(<OilFerrographyVarnishTab assetId="asset-1" />);

    expect(await screen.findByText("Ferrography & Varnish")).toBeTruthy();
    expect(screen.queryByText(/NEW Cutting Wear detected/)).toBeNull();
    expect(screen.queryByText(/Cutting Wear escalated/)).toBeNull();
  });

  it("uses the deterministic sequence helper rather than fetch order", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/components/trendAnalyzer/OilFerrographyVarnishTab.tsx"
      ),
      "utf8"
    );
    expect(source).toContain("orderOilSamplesBySequence");
    expect(source).toContain("validation.present && !validation.valid");
  });
});

describe("OilWearMetalsTab SLICE-AP windowing lockstep", () => {
  it("keeps the in-range KPI equal to the rendered rows", async () => {
    mockRows([
      baseRow({ id: "jan", sample_date: "2026-01-15", iron: 10 }),
      baseRow({ id: "feb", sample_date: "2026-02-15", iron: 18 }),
      baseRow({ id: "mar", sample_date: "2026-03-15", iron: 26 })
    ]);

    render(
      <OilWearMetalsTab
        assetId="asset-1"
        windowStart="2026-02-01"
        windowEnd="2026-03-31"
      />
    );

    expect(await screen.findByText("Wear Metals & Debris")).toBeTruthy();
    expect(kpiCount()).toBe(2);
    expect(bodyRowCount()).toBe(2);
  });

  it("shows an honest empty state when the window contains no samples", async () => {
    mockRows([baseRow({ sample_date: "2026-01-15" })]);

    render(<OilWearMetalsTab assetId="asset-1" windowStart="2027-01-01" />);

    expect(
      await screen.findByText("No oil samples in the selected date range")
    ).toBeTruthy();
    expect(screen.queryByText("Wear Metals & Debris")).toBeNull();
  });
});
