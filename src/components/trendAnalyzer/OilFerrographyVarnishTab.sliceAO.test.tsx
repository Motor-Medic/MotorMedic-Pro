// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildOilSampleSavePayload } from "../../lib/oilDiagnosticSave";
import OilFerrographyVarnishTab from "./OilFerrographyVarnishTab";

type Row = Record<string, unknown>;

const fetchMock = vi.fn();

function mockRows(rows: Row[]) {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ samples: rows })
  });
}

function rowFromPayload(
  payload: NonNullable<ReturnType<typeof buildOilSampleSavePayload>>,
  overrides: Row = {}
): Row {
  return {
    id: "sample-1",
    asset_id: payload.assetId,
    sample_date: payload.sampleDate,
    operating_hours: payload.operatingHours,
    iron: payload.iron,
    copper: payload.copper,
    chromium: payload.chromium,
    lead: payload.lead,
    aluminum: payload.aluminum,
    silicon: payload.silicon,
    mpc_delta_e: payload.mpcDeltaE ?? null,
    ruler_percent: payload.rulerPercent ?? null,
    dr_large: payload.drLarge ?? null,
    dr_small: payload.drSmall ?? null,
    uc_rating: payload.ucRating ?? null,
    morph_rubbing: payload.morphology?.rubbing ?? null,
    morph_cutting: payload.morphology?.cutting ?? null,
    morph_spherical: payload.morphology?.spherical ?? null,
    morph_fatigue_chunk: payload.morphology?.fatigue_chunk ?? null,
    morph_severe_sliding: payload.morphology?.severe_sliding ?? null,
    morph_corrosive: payload.morphology?.corrosive ?? null,
    morph_nonmetallic: payload.morphology?.nonmetallic ?? null,
    morph_fibers: payload.morphology?.fibers ?? null,
    ...overrides
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

describe("OilFerrographyVarnishTab SLICE-AO", () => {
  it("renders the saved MPC, RULER, DR and operator morphology on the tab", async () => {
    const payload = buildOilSampleSavePayload(
      {
        mpcDeltaE: 28.4,
        rulerPercent: 42,
        drLarge: 12.5,
        drSmall: 4.2,
        morphology: { cutting: "moderate" }
      },
      "asset-1",
      "2026-03-01"
    );
    expect(payload).not.toBeNull();
    mockRows([rowFromPayload(payload!)]);

    render(<OilFerrographyVarnishTab assetId="asset-1" />);

    expect(await screen.findByText("Ferrography & Varnish")).toBeTruthy();
    expect(screen.getAllByText("28.4").length).toBeGreaterThan(0);
    expect(screen.getAllByText("42%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("12.5").length).toBeGreaterThan(0);
    expect(screen.getAllByText("4.2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("16.7").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cutting Wear").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Moderate").length).toBeGreaterThan(0);
    // Categories the operator did not report stay "Not reported", not
    // "Not detected" (absence is not a measured negative).
    expect(screen.getAllByText("Not reported").length).toBeGreaterThan(0);
    expect(screen.getByText(/Operator Observation/)).toBeTruthy();
    expect(screen.queryByText(/none include MPC/)).toBeNull();
  });

  it("flips the empty state honestly once a sample carries section 5 data", async () => {
    mockRows([]);
    const empty = render(<OilFerrographyVarnishTab assetId="asset-1" />);
    expect(await screen.findByText("No Oil Analysis Data")).toBeTruthy();
    empty.unmount();

    mockRows([
      {
        id: "iron-only",
        asset_id: "asset-1",
        sample_date: "2026-03-01",
        operating_hours: 100,
        iron: "12"
      }
    ]);
    const partial = render(<OilFerrographyVarnishTab assetId="asset-1" />);
    expect(
      await screen.findByText("No Ferrography or Varnish Data")
    ).toBeTruthy();
    expect(screen.getByText(/none include MPC, RULER, DR ferrography/)).toBeTruthy();
    partial.unmount();

    const payload = buildOilSampleSavePayload(
      { mpcDeltaE: 19.5, morphology: { fatigue_chunk: "mild" } },
      "asset-1",
      "2026-03-01"
    );
    mockRows([rowFromPayload(payload!, { id: "ferro" })]);
    render(<OilFerrographyVarnishTab assetId="asset-1" />);
    expect(await screen.findByText("Ferrography & Varnish")).toBeTruthy();
    expect(screen.queryByText("No Ferrography or Varnish Data")).toBeNull();
    expect(screen.getAllByText("19.5").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Fatigue Chunks").length).toBeGreaterThan(0);
  });

  it("keeps unmeasured fields null/“not measured” instead of rendering zero", async () => {
    mockRows([
      {
        id: "mpc-only",
        asset_id: "asset-1",
        sample_date: "2026-03-01",
        operating_hours: 100,
        mpc_delta_e: "22.1",
        ruler_percent: null,
        dr_large: null,
        dr_small: null,
        morph_cutting: null
      }
    ]);

    render(<OilFerrographyVarnishTab assetId="asset-1" />);

    expect(await screen.findByText("Ferrography & Varnish")).toBeTruthy();
    expect(screen.getAllByText("Not measured").length).toBeGreaterThan(0);
    expect(screen.getByText("Needs both DL and DS densities")).toBeTruthy();
    expect(
      screen.getByText("No morphology recorded for this sample.")
    ).toBeTruthy();
    expect(screen.queryByText("0%")).toBeNull();
    expect(screen.queryByText("0.0")).toBeNull();
  });

  it("does not add new ASTM strings outside the tab's pre-existing citations", () => {
    const tabSource = readFileSync(
      join(process.cwd(), "src/components/trendAnalyzer/OilFerrographyVarnishTab.tsx"),
      "utf8"
    );
    const inputSource = readFileSync(
      join(process.cwd(), "src/components/OilInputAccordions.tsx"),
      "utf8"
    );
    const modalSource = readFileSync(
      join(process.cwd(), "src/components/trendAnalyzer/AddOilSampleModal.tsx"),
      "utf8"
    );

    // Pre-existing, in-repo citations on this tab are the only ASTM strings.
    expect(tabSource).toContain("ASTM D7843");
    expect(tabSource).toContain("ASTM D6971");

    // Section 5 adds unit labels only — no new standards citations.
    const section5Start = inputSource.indexOf(
      "SECTION 5 — Ferrography & Varnish"
    );
    expect(section5Start).toBeGreaterThan(-1);
    expect(inputSource.slice(section5Start)).not.toContain("ASTM");
    expect(modalSource).not.toContain("ASTM");
  });
});
