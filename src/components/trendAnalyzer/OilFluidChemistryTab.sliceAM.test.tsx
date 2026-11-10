// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tanTbnTrend } from "../../lib/oilAnalysisMetrics";
import type { OilSample } from "../../types/oilAnalysis";
import OilFluidChemistryTab from "./OilFluidChemistryTab";

const source = readFileSync(
  join(
    process.cwd(),
    "src/components/trendAnalyzer/OilFluidChemistryTab.tsx"
  ),
  "utf8"
);

type Row = Record<string, unknown>;

function baseRow(overrides: Row = {}): Row {
  return {
    id: "sample-1",
    asset_id: "asset-1",
    sample_date: "2026-01-15",
    operating_hours: 500,
    viscosity_40c: "46.0",
    acid_number: "0.80",
    tbn: "8.00",
    water_ppm: "120",
    oxidation: "4.20",
    nitration: "2.10",
    iso_4um: 18,
    iso_6um: 16,
    iso_14um: 13,
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

function mk(
  sampleDate: string,
  acidNumber?: number,
  tbn?: number
): OilSample {
  return {
    assetId: "asset-1",
    sampleDate,
    operatingHours: 0,
    acidNumber,
    tbn,
    ironAlarmLimit: 0,
    copperAlarmLimit: 0,
    chromiumAlarmLimit: 0,
    leadAlarmLimit: 0,
    aluminumAlarmLimit: 0,
    siliconAlarmLimit: 0
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("tanTbnTrend gate", () => {
  it("returns an honest null delta when no sample has both readings", () => {
    expect(tanTbnTrend([])).toEqual({
      delta: null,
      deltaDate: null,
      slopePerSample: null,
      distinctDateCount: 0
    });
    expect(
      tanTbnTrend([mk("2026-01-01", 1.0), mk("2026-02-01", undefined, 6)])
    ).toEqual({
      delta: null,
      deltaDate: null,
      slopePerSample: null,
      distinctDateCount: 0
    });
  });

  it("reports the latest delta but withholds slope below three distinct dates", () => {
    const result = tanTbnTrend([
      mk("2026-01-01", 1.0, 6.0),
      mk("2026-02-01", 2.0, 5.0)
    ]);
    expect(result.delta).toBe(-3);
    expect(result.deltaDate).toBe("2026-02-01");
    expect(result.slopePerSample).toBeNull();
    expect(result.distinctDateCount).toBe(2);
  });

  it("computes the least-squares slope at three distinct dates", () => {
    const result = tanTbnTrend([
      mk("2026-01-01", 1.0, 5.0),
      mk("2026-02-01", 2.0, 4.0),
      mk("2026-03-01", 3.0, 3.0)
    ]);
    expect(result.delta).toBe(0);
    expect(result.deltaDate).toBe("2026-03-01");
    expect(result.slopePerSample).toBeCloseTo(2, 10);
    expect(result.distinctDateCount).toBe(3);
  });

  it("collapses duplicate dates so repeated uploads cannot fake a slope", () => {
    const result = tanTbnTrend([
      mk("2026-01-01", 1.0, 5.0),
      mk("2026-01-01", 2.0, 5.0),
      mk("2026-02-01", 3.0, 5.0)
    ]);
    expect(result.distinctDateCount).toBe(2);
    expect(result.deltaDate).toBe("2026-02-01");
    expect(result.slopePerSample).toBeNull();
  });

  it("keeps the paired reading's own date when newer samples omit TAN or TBN", () => {
    const result = tanTbnTrend([
      mk("2026-01-01", 1.0, 5.0),
      mk("2026-02-01", 2.0, 4.0),
      mk("2026-03-01")
    ]);
    expect(result.delta).toBe(-2);
    expect(result.deltaDate).toBe("2026-02-01");
    expect(result.distinctDateCount).toBe(2);
    expect(result.slopePerSample).toBeNull();
  });
});

describe("OilFluidChemistryTab SLICE-AM", () => {
  it("renders an honest null state with no charts", async () => {
    mockRows([]);
    render(<OilFluidChemistryTab assetId="asset-1" />);
    expect(await screen.findByText("No Oil Analysis Data")).toBeTruthy();
    expect(screen.queryByText(/TAN − TBN/)).toBeNull();
  });

  it("shows the descriptive TAN − TBN delta and no projection strings", async () => {
    mockRows([
      baseRow({ sample_date: "2026-01-15", acid_number: "1.00", tbn: "6.00" }),
      baseRow({
        id: "sample-2",
        sample_date: "2026-02-15",
        acid_number: "2.00",
        tbn: "5.00"
      })
    ]);
    render(<OilFluidChemistryTab assetId="asset-1" />);

    expect(await screen.findByText("TAN − TBN (latest)")).toBeTruthy();
    expect(screen.getByText("-3.00")).toBeTruthy();
    expect(
      screen.getByText(
        /Needs ≥3 distinct-date samples with TAN and TBN \(2 on file\)/
      )
    ).toBeTruthy();

    expect(screen.queryByText(/projected crossover/i)).toBeNull();
    expect(screen.queryByText(/linear trend estimate/i)).toBeNull();
    expect(screen.queryByText(/at current load/i)).toBeNull();
    expect(screen.queryByText(/hours to limit/i)).toBeNull();
    expect(screen.queryByText(/runway/i)).toBeNull();
    expect(screen.queryByText(/weeks/i)).toBeNull();
  });

  it("renders the slope once three distinct dates carry TAN and TBN", async () => {
    mockRows([
      baseRow({ sample_date: "2026-01-15", acid_number: "1.00", tbn: "5.00" }),
      baseRow({
        id: "sample-2",
        sample_date: "2026-02-15",
        acid_number: "2.00",
        tbn: "4.00"
      }),
      baseRow({
        id: "sample-3",
        sample_date: "2026-03-15",
        acid_number: "3.00",
        tbn: "3.00"
      })
    ]);
    render(<OilFluidChemistryTab assetId="asset-1" />);

    expect(await screen.findByText("+2.000")).toBeTruthy();
    expect(screen.getByText(/mg KOH\/g per sample date · 3 distinct dates/)).toBeTruthy();
  });

  it("names the paired reading's date when a newer sample omits TAN or TBN", async () => {
    mockRows([
      baseRow({ sample_date: "2026-01-15", acid_number: "1.00", tbn: "5.00" }),
      baseRow({
        id: "sample-2",
        sample_date: "2026-02-15",
        acid_number: "2.00",
        tbn: "4.00"
      }),
      baseRow({
        id: "sample-3",
        sample_date: "2026-03-15",
        acid_number: null,
        tbn: null
      })
    ]);
    render(<OilFluidChemistryTab assetId="asset-1" />);

    expect(await screen.findByText("-2.00")).toBeTruthy();
    expect(
      screen.getByText(/Measured .*later sample\(s\) omit TAN or TBN/)
    ).toBeTruthy();
    expect(
      screen.queryByText(/Alkaline reserve remains in the latest sample/)
    ).toBeNull();
  });

  it("renders an honest null for a missing ISO triplet", async () => {
    mockRows([
      baseRow({ iso_4um: null, iso_6um: null, iso_14um: null })
    ]);
    render(<OilFluidChemistryTab assetId="asset-1" />);

    expect(await screen.findByText("ISO codes not reported")).toBeTruthy();
    expect(screen.queryByText(/notches? above/)).toBeNull();
    expect(screen.queryByText(/At or below target/)).toBeNull();
  });

  it("renders FTIR as raw Abs/cm with no baseline-driven verdict", async () => {
    mockRows([
      baseRow({ oxidation: "99.90", nitration: "88.80", water_ppm: "120" })
    ]);
    render(<OilFluidChemistryTab assetId="asset-1" />);

    expect(
      await screen.findByText(/No stored fresh-oil or base-stock FTIR baseline/)
    ).toBeTruthy();
    expect(screen.getAllByText("99.90").length).toBeGreaterThan(0);
    expect(screen.getAllByText("88.80").length).toBeGreaterThan(0);
    expect(screen.queryByText(/alarm/i)).toBeNull();
    expect(screen.queryByText(/exceeds/i)).toBeNull();
    expect(screen.queryByText(/critical/i)).toBeNull();
  });

  it("keeps cleanliness descriptive with a recalled-target basis pill", async () => {
    mockRows([baseRow()]);
    render(<OilFluidChemistryTab assetId="asset-1" />);

    expect(
      await screen.findByText(/Target basis: recalled Noria default/)
    ).toBeTruthy();
    expect(screen.getByText(/not a stored per-asset target/)).toBeTruthy();
    expect(screen.queryByText(/Estimated life extension/i)).toBeNull();
    expect(screen.queryByText(/1\.25/)).toBeNull();
    expect(screen.queryByText(/×/)).toBeNull();
  });

  it("locks units and the 40°C reference label on this tab", async () => {
    mockRows([baseRow()]);
    render(<OilFluidChemistryTab assetId="asset-1" />);

    expect(
      (await screen.findAllByText(/Viscosity @ 40°C \(ASTM D445 reference\)/))
        .length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/mg KOH\/g/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Abs/cm").length).toBeGreaterThan(0);
    expect(screen.getByText("ppm")).toBeTruthy();
    expect(screen.queryByText(/°F/)).toBeNull();
    expect(screen.queryByText(/104/)).toBeNull();
  });

  it("windows samples in lockstep and reports an empty window honestly", async () => {
    mockRows([
      baseRow({ sample_date: "2026-01-15" }),
      baseRow({ id: "sample-2", sample_date: "2026-02-15" })
    ]);
    const { unmount } = render(
      <OilFluidChemistryTab
        assetId="asset-1"
        windowStart="2026-02-01"
        windowEnd="2026-02-28"
      />
    );

    expect(await screen.findByText(/1 of 2 samples in range/)).toBeTruthy();
    unmount();

    render(
      <OilFluidChemistryTab
        assetId="asset-1"
        windowStart="2026-05-01"
        windowEnd="2026-05-31"
      />
    );
    expect(
      await screen.findByText("No oil samples in the selected date range")
    ).toBeTruthy();
  });

  it("has no projection, life-model, baseline or unit-conversion escape hatches", () => {
    expect(source).not.toContain("projectTanTbnCrossover");
    expect(source).not.toContain("projectedAtHours");
    expect(source).not.toContain("projectHoursToThreshold");
    expect(source).not.toContain("linearRatePerHour");
    expect(source).not.toContain("connectNulls");
    expect(source).not.toContain("ReferenceDot");
    expect(source).not.toContain("Projected crossover");
    expect(source).not.toContain("linear trend estimate");
    expect(source).not.toContain("noriaLifeExtensionFactor");
    expect(source).not.toContain("Est. Life Extension");
    expect(source).not.toContain("1.25");
    expect(source).not.toMatch(/at current load/i);
    expect(source).not.toMatch(/hours[- ]to[- ](limit|crossover)/i);
    expect(source).not.toMatch(/freshOilBaseline|baseStockBaseline|baselineOxidation/i);
    expect(source).not.toContain("convertAbsoluteTemperature");
    expect(source).not.toContain("toFahrenheit");
    expect(source).not.toContain("useTenantDisplayUnits");

    expect(source).toContain("tanTbnTrend");
    expect(source).toContain("filterOilSamplesToWindow");
    expect(source).toContain("latestOilSample");
    expect(source).toContain("VISCOSITY_REFERENCE_LABEL_40C");
    expect(source).toContain('unit="Abs/cm"');
    expect(source).toContain("mg KOH/g");
  });
});
