// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OIL_ALARM_LIMIT_CITATION,
  OIL_SPECTROSCOPY_CITATION
} from "../../lib/maintenance/prescriptiveDictionary";
import OilWearMetalsTab from "./OilWearMetalsTab";

type Row = Record<string, unknown>;

const source = readFileSync(
  join(process.cwd(), "src/components/trendAnalyzer/OilWearMetalsTab.tsx"),
  "utf8"
);
const viscositySource = readFileSync(
  join(
    process.cwd(),
    "src/components/trendAnalyzer/ViscosityTanTrendChart.tsx"
  ),
  "utf8"
);

function baseRow(overrides: Row = {}): Row {
  return {
    id: "sample-1",
    asset_id: "asset-1",
    sample_date: "2026-01-15",
    operating_hours: 0,
    iron: "10",
    copper: "5",
    chromium: "1",
    lead: "2",
    aluminum: "3",
    silicon: "8",
    tin: "1",
    viscosity_40c: "46",
    acid_number: "1.20",
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

function bodyText(): string {
  return document.body.textContent ?? "";
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("SLICE-AR alarm-limit citation", () => {
  it("labels limits as in-repo / lab-OEM guidance and D5185 as the method only", async () => {
    mockRows([baseRow()]);
    render(<OilWearMetalsTab assetId="asset-1" />);

    expect(await screen.findByText("Wear Metals & Debris")).toBeTruthy();
    expect(
      screen.getByText(/ASTM D5185 governs the ICP elemental-analysis method only/)
    ).toBeTruthy();
    expect(screen.getByText(OIL_SPECTROSCOPY_CITATION)).toBeTruthy();
    expect(bodyText()).toContain("lab and OEM guidance");
    expect(bodyText()).toContain("defines no alarm limits");
  });

  it("does not present D5185 as the source of alarm limits", () => {
    const text = bodyText();
    expect(text).not.toMatch(
      /alarm limits? (?:per|from|by|based on) ASTM D5185/i
    );
    expect(source).toContain("OIL_ALARM_LIMIT_CITATION");
    expect(source).not.toMatch(/D5185[^\n]*(?:limit source|alarm limit source)/i);
  });

  it("names a stored baseline as stored and a recalled baseline as first in-window", async () => {
    mockRows([
      baseRow({
        id: "a",
        sample_date: "2026-01-15",
        operating_hours: 100,
        iron: "10"
      }),
      baseRow({
        id: "b",
        sample_date: "2026-02-15",
        operating_hours: 200,
        iron: "20"
      })
    ]);
    render(<OilWearMetalsTab assetId="asset-1" />);

    expect(await screen.findByText("Wear Metals & Debris")).toBeTruthy();
    expect(screen.getAllByText(/first in-window sample/).length).toBeGreaterThan(
      0
    );
    expect(screen.queryByText(/vs stored baseline/)).toBeNull();
  });

  it("names a recorded baseline column as stored", async () => {
    mockRows([
      baseRow({
        id: "a",
        sample_date: "2026-01-15",
        baseline_iron: "5",
        operating_hours: 100,
        iron: "10"
      }),
      baseRow({
        id: "b",
        sample_date: "2026-02-15",
        operating_hours: 200,
        iron: "20"
      })
    ]);
    render(<OilWearMetalsTab assetId="asset-1" />);

    expect(await screen.findByText("Wear Metals & Debris")).toBeTruthy();
    expect(screen.getAllByText(/vs stored baseline/).length).toBeGreaterThan(0);
  });

  it("shows no delta when a single sample has no baseline", async () => {
    mockRows([baseRow()]);
    render(<OilWearMetalsTab assetId="asset-1" />);

    expect(await screen.findByText("Wear Metals & Debris")).toBeTruthy();
    expect(screen.queryByText(/Δ .*% vs/)).toBeNull();
  });
});

describe("SLICE-AR generation rate hard gate", () => {
  it("all-0h demo shows insufficient operating-hour data, never a synthesized rate", async () => {
    mockRows([
      baseRow({ id: "a", sample_date: "2026-01-15", operating_hours: 0, iron: "10" }),
      baseRow({ id: "b", sample_date: "2026-02-15", operating_hours: 0, iron: "20" })
    ]);
    render(<OilWearMetalsTab assetId="asset-1" />);

    expect(await screen.findByText("Wear Metals & Debris")).toBeTruthy();
    expect(
      screen.getAllByText(/insufficient operating-hour data/).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/PPM\/100h/)).toBeNull();
    expect(bodyText()).not.toMatch(/acceleration|runway/);
    expect(source).not.toMatch(/acceleration|runway|per 100h acceleration/i);
  });

  it("renders a rate only at two distinct non-zero operating hours", async () => {
    mockRows([
      baseRow({ id: "a", sample_date: "2026-01-15", operating_hours: 100, iron: "10" }),
      baseRow({ id: "b", sample_date: "2026-02-15", operating_hours: 200, iron: "20" })
    ]);
    render(<OilWearMetalsTab assetId="asset-1" />);

    expect(await screen.findByText("Wear Metals & Debris")).toBeTruthy();
    expect(screen.getByText(/Rate: 10\.00 PPM\/100h/)).toBeTruthy();
  });

  it("does not synthesize a rate when operating hours repeat", async () => {
    mockRows([
      baseRow({ id: "a", sample_date: "2026-01-15", operating_hours: 100, iron: "10" }),
      baseRow({ id: "b", sample_date: "2026-02-15", operating_hours: 100, iron: "20" })
    ]);
    render(<OilWearMetalsTab assetId="asset-1" />);

    expect(await screen.findByText("Wear Metals & Debris")).toBeTruthy();
    expect(
      screen.getAllByText(/insufficient operating-hour data/).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/PPM\/100h/)).toBeNull();
  });
});

describe("SLICE-AR alloy co-elevation is descriptive-only", () => {
  it("shows Cu/Pb, Cu/Sn, Pb/Sn and Fe/Cr ratios with no component attribution", async () => {
    mockRows([
      baseRow({
        iron: "90",
        copper: "60",
        lead: "30",
        tin: "10",
        chromium: "3"
      })
    ]);
    render(<OilWearMetalsTab assetId="asset-1" />);

    expect(
      await screen.findByText("Alloy co-elevation (descriptive)")
    ).toBeTruthy();
    expect(screen.getByText("Cu/Pb")).toBeTruthy();
    expect(screen.getByText("Cu/Sn")).toBeTruthy();
    expect(screen.getByText("Pb/Sn")).toBeTruthy();
    expect(screen.getByText("Fe/Cr")).toBeTruthy();
    expect(bodyText()).toContain("not component metallurgy");
    expect(bodyText()).not.toMatch(
      /Steel component wear|Bronze\/brass component wear|journal bearing|bearing overlay wear|bushing sliding/i
    );
  });
});

describe("SLICE-AR Si:Al null-vs-zero discipline", () => {
  it("renders Not measured for unreported aluminum, never a zero ratio", async () => {
    mockRows([baseRow({ silicon: "12", aluminum: null })]);
    render(<OilWearMetalsTab assetId="asset-1" />);

    expect(await screen.findByText("Si:Al (descriptive)")).toBeTruthy();
    expect(bodyText()).toContain("Aluminum: Not measured");
    expect(screen.queryByText(/Si:Al =/)).toBeNull();
    expect(bodyText()).not.toMatch(/zero aluminum|Aluminum: 0/i);
  });

  it("computes Si:Al only when both elements are measured", async () => {
    mockRows([baseRow({ silicon: "12", aluminum: "4" })]);
    render(<OilWearMetalsTab assetId="asset-1" />);

    expect(await screen.findByText("Si:Al (descriptive)")).toBeTruthy();
    expect(screen.getByText(/Si:Al = 3\.000/)).toBeTruthy();
  });

  it("omits recalled Si>20 / 5:1 thresholds and the D5185 method from the ratio", () => {
    expect(source).not.toMatch(/Si\s*>\s*20|5\s*:\s*1/);
    expect(source).not.toMatch(/D5185[^\n]*(?:Si:Al|5:1|Si > 20)/i);
    expect(bodyText()).not.toMatch(/D5185[^\n]*(?:Si:Al|5:1|Si > 20)/i);
  });
});

describe("SLICE-AR viscosity-vs-TAN module nature", () => {
  it("stays a descriptive time trend with no projection or extrapolation", async () => {
    mockRows([baseRow()]);
    render(<OilWearMetalsTab assetId="asset-1" />);

    expect(await screen.findByText("Viscosity vs. TAN Trend")).toBeTruthy();
    expect(screen.getByText(/Descriptive time trend/)).toBeTruthy();
    expect(viscositySource).not.toMatch(
      /projectHoursToThreshold|projectTanTbnCrossover|linearRatePerHour|hoursTo/i
    );
    expect(bodyText()).not.toMatch(/hours to (?:crossover|limit)|projected/i);
  });
});

describe("SLICE-OA1 display layer", () => {
  it("renders percent of limit and stays — for an unreported element", async () => {
    mockRows([baseRow({ iron: "10", chromium: null })]);
    render(<OilWearMetalsTab assetId="asset-1" />);

    expect(await screen.findByText("Wear Metals & Debris")).toBeTruthy();
    expect(bodyText()).toContain("10.0% of limit");
    expect(bodyText()).toContain("— of limit");
  });

  it("renders the static ICP particle-size disclosure beside the D5185 note", async () => {
    mockRows([baseRow()]);
    render(<OilWearMetalsTab assetId="asset-1" />);

    expect(await screen.findByText("Wear Metals & Debris")).toBeTruthy();
    expect(bodyText()).toContain("large spalling debris");
    expect(bodyText()).toContain("does not rule out macroscopic wear");
  });

  it("marks a lone TAN point on the Viscosity vs TAN timeline as a GAP", async () => {
    mockRows([baseRow({ viscosity_40c: null, operating_hours: 100 })]);
    render(<OilWearMetalsTab assetId="asset-1" />);

    expect(await screen.findByText("Viscosity vs. TAN Trend")).toBeTruthy();
    expect(screen.getAllByText("GAP").length).toBeGreaterThan(0);
    expect(bodyText()).toContain("read as a gap");
  });

  it("renders the hour-gate wording when co-movement cannot be judged", async () => {
    mockRows([
      baseRow({ id: "a", sample_date: "2026-01-15", operating_hours: 0 }),
      baseRow({ id: "b", sample_date: "2026-02-15", operating_hours: 0 })
    ]);
    render(<OilWearMetalsTab assetId="asset-1" />);

    expect(await screen.findByText("Co-movement status (descriptive)")).toBeTruthy();
    expect(bodyText()).toContain(
      "insufficient operating-hour data — co-movement flag withheld"
    );
  });
});

describe("SLICE-AR AP windowing lockstep and honest nulls", () => {
  it("keeps the in-range KPI equal to the rendered rows", async () => {
    mockRows([
      baseRow({ id: "jan", sample_date: "2026-01-15", iron: "10" }),
      baseRow({ id: "feb", sample_date: "2026-02-15", iron: "18" }),
      baseRow({ id: "mar", sample_date: "2026-03-15", iron: "26" })
    ]);

    render(
      <OilWearMetalsTab
        assetId="asset-1"
        windowStart="2026-02-01"
        windowEnd="2026-03-31"
      />
    );

    expect(await screen.findByText("Wear Metals & Debris")).toBeTruthy();
    expect(screen.getAllByText(/2 of 3 samples in range/).length).toBeGreaterThan(
      0
    );
    expect(document.querySelectorAll("tbody tr").length).toBe(2);
  });

  it("renders Not measured instead of undefined or a synthetic zero", async () => {
    mockRows([
      baseRow({
        iron: null,
        copper: "",
        chromium: null,
        silicon: null,
        aluminum: null
      })
    ]);
    render(<OilWearMetalsTab assetId="asset-1" />);

    expect(await screen.findByText("Wear Metals & Debris")).toBeTruthy();
    expect(screen.getAllByText("Not measured").length).toBeGreaterThanOrEqual(4);
    expect(bodyText()).not.toContain("undefined");
  });

  it("keeps ppm, viscosity and TAN units raw", async () => {
    mockRows([baseRow()]);
    render(<OilWearMetalsTab assetId="asset-1" />);

    expect(await screen.findByText("Wear Metals & Debris")).toBeTruthy();
    expect(bodyText()).toContain("cSt @ 40°C");
    expect(bodyText()).toContain("mg KOH/g");
    expect(source).toContain("viscosity40C != null ? s.viscosity40C : \"—\"");
    expect(source).toContain("acidNumber != null ? s.acidNumber : \"—\"");
  });
});
