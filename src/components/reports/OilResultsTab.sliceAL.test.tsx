// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OilResultsTab from "./OilResultsTab";

const source = readFileSync(
  join(process.cwd(), "src/components/reports/OilResultsTab.tsx"),
  "utf8"
);

type Row = Record<string, unknown>;

function baseRow(overrides: Row = {}): Row {
  return {
    id: "sample-1",
    asset_id: "asset-1",
    sample_date: "2026-01-15",
    operating_hours: 500,
    iron: "12",
    copper: "30",
    lead: "4",
    aluminum: "2",
    silicon: "8",
    tin: "3",
    viscosity_40c: "44",
    viscosity_100c: "7.1",
    viscosity_index: "100",
    acid_number: "1.20",
    tbn: "8.0",
    water_ppm: "120",
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

function byTextContent(value: string, tagName = "P") {
  return (_content: string, node: Element | null) =>
    node?.tagName === tagName &&
    (node.textContent ?? "").replace(/\s+/g, " ").includes(value);
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("OilResultsTab SLICE-AL", () => {
  it("renders an honest null state with no synthetic grids", async () => {
    mockRows([]);
    render(
      <OilResultsTab selectedAnalysis={null} equipmentAssetId="asset-1" />
    );
    expect(await screen.findByText(/No oil samples on file/)).toBeTruthy();
    expect(screen.queryByText(/Viscosity @ 40/m)).toBeNull();
    expect(screen.queryByText(/ISO 4406-derived ranges/)).toBeNull();
  });

  it("keeps viscosity at the fixed 40°C reference and stays raw-cSt without a grade", async () => {
    mockRows([baseRow()]);
    render(
      <OilResultsTab
        selectedAnalysis={null}
        equipmentAssetId="asset-1"
        windowStart="2026-01-01"
        windowEnd="2026-01-31"
      />
    );

    expect(
      await screen.findByText((_, node) => node?.textContent === "Viscosity @ 40°C (ASTM D445 reference)")
    ).toBeTruthy();
    expect(screen.queryByText(/104°F/)).toBeNull();
    expect(screen.queryByText(/@ 104/)).toBeNull();
    expect(screen.getByText(/ISO VG grade not recorded/)).toBeTruthy();
    expect(screen.getByText(/1 of 1 samples in range/)).toBeTruthy();
    expect(screen.getByText(">4 µm")).toBeTruthy();
    expect(screen.getByText(/ISO 4406-derived ranges/)).toBeTruthy();
    expect(screen.getByText(/Cu\/Fe/)).toBeTruthy();
    expect(screen.getByText(/component metallurgy not stored/)).toBeTruthy();
    expect(screen.getByText(/ISO 3448 viscosity grade bands/)).toBeTruthy();
    expect(screen.getByText(/ASTM D445 - cited as a test method/)).toBeTruthy();
  });

  it("shows the ISO 3448 band and deviation pill only when a grade is stored", async () => {
    mockRows([baseRow({ lubricant_grade: "ISO VG 46", viscosity_40c: "55" })]);
    render(
      <OilResultsTab selectedAnalysis={null} equipmentAssetId="asset-1" />
    );

    expect(
      await screen.findByText(byTextContent("ISO VG 46 band 41.4–50.6 cSt @ 40°C"))
    ).toBeTruthy();
    expect(screen.getByText(/\+19\.6% deviation/)).toBeTruthy();
    expect(screen.getByText(/outside band/)).toBeTruthy();
    expect(screen.queryByText(/ISO VG grade not recorded/)).toBeNull();
  });

  it("omits every card when the window excludes the sample", async () => {
    mockRows([baseRow()]);
    render(
      <OilResultsTab
        selectedAnalysis={null}
        equipmentAssetId="asset-1"
        windowStart="2026-02-01"
        windowEnd="2026-02-28"
      />
    );

    expect(
      await screen.findByText(/No oil samples in the selected date range/)
    ).toBeTruthy();
    expect(screen.queryByText(/Viscosity @ 40/m)).toBeNull();
  });

  it("never imports temperature conversion or display-unit preferences", () => {
    expect(source).not.toContain("convertAbsoluteTemperature");
    expect(source).not.toContain("convertTemperatureDelta");
    expect(source).not.toContain("useTenantDisplayUnits");
    expect(source).not.toContain("displayUnits");
    expect(source).not.toContain("toFahrenheit");
    expect(source).toContain("VISCOSITY_REFERENCE_LABEL_40C");
  });

  it("has no zero-fill or synthetic trend path", () => {
    expect(source).not.toMatch(/\.fill\(0\)/);
    expect(source).not.toContain("Array.from({ length");
    expect(source).toContain("v != null ? v.toFixed(0) : notTested");
    expect(source).toContain("filterOilSamplesToWindow");
    expect(source).toContain("latestOilSample");
    expect(source).toContain("decodeIso4406");
    expect(source).toContain("resolveViscosityGradeGuard");
  });
});
