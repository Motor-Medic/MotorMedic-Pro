// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FILTER_BETA_GUIDANCE_BASIS,
  FILTER_BETA_GUIDANCE_TABLE,
  ISO_CODE_SCALE_MAX,
  ISO_TRIPLET_DATA_QUALITY_WARNING,
  calculateParticleRatio,
  validateIsoTriplet
} from "../../lib/oilAnalysisMetrics";
import OilCleanlinessTab from "./OilCleanlinessTab";

const source = readFileSync(
  join(
    process.cwd(),
    "src/components/trendAnalyzer/OilCleanlinessTab.tsx"
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
    iron: "20",
    copper: "5",
    chromium: "1",
    lead: "2",
    aluminum: "3",
    silicon: "8",
    iso_4um: 18,
    iso_6um: 16,
    iso_14um: 13,
    particles_4um: "120000",
    particles_6um: "30000",
    particles_14um: "500",
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

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("ISO 4406 triplet validity gate (pure)", () => {
  it("rejects the demo 12/34/8 code and accepts 18/16/13", () => {
    expect(validateIsoTriplet([12, 34, 8]).valid).toBe(false);
    expect(validateIsoTriplet([12, 34, 8]).issues.length).toBeGreaterThan(0);
    expect(validateIsoTriplet([18, 16, 13]).valid).toBe(true);
  });

  it("rejects non-monotonic triplets and missing channels honestly", () => {
    expect(validateIsoTriplet([12, 8, 14]).valid).toBe(false);
    expect(validateIsoTriplet([18, 17, 19]).valid).toBe(false);
    expect(validateIsoTriplet(null)).toEqual({
      present: false,
      valid: false,
      issues: []
    });
  });

  it("keeps the gate on the declared ISO scale", () => {
    expect(validateIsoTriplet([ISO_CODE_SCALE_MAX + 1, 1, 0]).valid).toBe(false);
    expect(validateIsoTriplet([ISO_CODE_SCALE_MAX, 0, 0]).valid).toBe(true);
  });

  it("labels the beta table as vendor guidance, not an ISO 16889 limit", () => {
    expect(FILTER_BETA_GUIDANCE_TABLE.length).toBeGreaterThan(0);
    expect(source).toContain("FILTER_BETA_GUIDANCE_BASIS");
    expect(FILTER_BETA_GUIDANCE_BASIS).toContain("ISO 16889");
    expect(FILTER_BETA_GUIDANCE_BASIS).toContain("vendor guidance");
  });

  it("keeps fine/coarse wording descriptive", () => {
    expect(
      calculateParticleRatio(120000, 500).diagnosis
    ).toContain("Consistent with fine silt ingress");
    expect(
      calculateParticleRatio(4000, 800).diagnosis
    ).toContain("Consistent with coarse wear generation");
  });
});

describe("OilCleanlinessTab SLICE-AN", () => {
  it("warns on 12/34/8 and suppresses every derived value while showing the raw code", async () => {
    mockRows([
      baseRow({ id: "valid-older", sample_date: "2026-01-15" }),
      baseRow({
        id: "invalid-latest",
        sample_date: "2026-02-15",
        iso_4um: 12,
        iso_6um: 34,
        iso_14um: 8
      })
    ]);
    render(<OilCleanlinessTab assetId="asset-1" />);

    expect(
      await screen.findByText(ISO_TRIPLET_DATA_QUALITY_WARNING)
    ).toBeTruthy();
    expect(screen.getAllByText("12/34/8").length).toBeGreaterThan(0);

    // Degradation alert, equivalencies, recommendation, overshoot and
    // fine/coarse classification must all be absent.
    expect(
      screen.queryByText("Possible filter bypass or ingress event")
    ).toBeNull();
    expect(screen.queryByText(/NAS 1638 ~/)).toBeNull();
    expect(screen.queryByText(/SAE AS4059 ~/)).toBeNull();
    expect(screen.queryByText(/Beta4\(c\) ≥/)).toBeNull();
    expect(screen.queryByText("2^steps multiplier")).toBeNull();
    expect(screen.getByText("Overshoot comparison withheld")).toBeTruthy();
    expect(
      screen.queryByText(/fine silt ingress|coarse wear generation/i)
    ).toBeNull();
    expect(
      screen.getAllByText("Withheld - ISO 4406 code failed validity check").length
    ).toBeGreaterThan(0);
  });

  it("renders equivalencies, recommendation and the overshoot matrix for a valid 18/16/13 triplet", async () => {
    mockRows([baseRow()]);
    render(<OilCleanlinessTab assetId="asset-1" />);

    expect(await screen.findByText("NAS 1638 ~ 9 | SAE AS4059 ~ 10")).toBeTruthy();
    expect(screen.getAllByText(/Beta4\(c\) ≥ 1000/).length).toBeGreaterThan(0);
    expect(screen.getByText("2^steps multiplier")).toBeTruthy();
    expect(screen.getAllByText("18").length).toBeGreaterThan(0);
    expect(screen.getAllByText("15").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+3").length).toBeGreaterThan(0);
    expect(screen.getAllByText("8×").length).toBeGreaterThan(0);
  });

  it("labels every target comparison as a recalled Noria default", async () => {
    mockRows([baseRow()]);
    render(<OilCleanlinessTab assetId="asset-1" />);

    expect(
      await screen.findByText(/Target 15\/13\/10 · recalled Noria default/)
    ).toBeTruthy();
    expect(
      screen.getByText(/Based on worst-channel overshoot against the recalled Noria default/)
    ).toBeTruthy();
    expect(
      screen.getAllByText(/Target basis: recalled Noria default/i).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/not a stored per-asset target/).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Above recalled Noria default/).length
    ).toBeGreaterThan(0);
  });

  it("only profiles fine/coarse at >=2 valid multi-channel samples", async () => {
    mockRows([baseRow()]);
    const first = render(<OilCleanlinessTab assetId="asset-1" />);
    expect(
      await screen.findByText("Needs ≥2 valid multi-channel samples (1 on file)")
    ).toBeTruthy();
    expect(
      screen.queryByText(/fine silt ingress|coarse wear generation/i)
    ).toBeNull();
    first.unmount();

    mockRows([
      baseRow({ id: "s1", sample_date: "2026-01-15" }),
      baseRow({ id: "s2", sample_date: "2026-02-15" })
    ]);
    render(<OilCleanlinessTab assetId="asset-1" />);

    expect(
      await screen.findByText(/Consistent with fine silt ingress/)
    ).toBeTruthy();
    expect(screen.getByText("240.0:1")).toBeTruthy();
  });

  it("orders same-date samples by a deterministic sequence, not the date label", async () => {
    mockRows([
      baseRow({
        id: "sample-b",
        sample_date: "2026-02-15",
        iso_4um: 18,
        iso_6um: 16,
        iso_14um: 13
      }),
      baseRow({
        id: "sample-a",
        sample_date: "2026-02-15",
        iso_4um: 20,
        iso_6um: 18,
        iso_14um: 15
      })
    ]);
    render(<OilCleanlinessTab assetId="asset-1" />);

    // id ascending => sample-a is #1, sample-b is #2/latest.
    expect(await screen.findByText(/notches vs sample #1/)).toBeTruthy();
    expect(screen.getByText(/same-day earlier entry/)).toBeTruthy();
    expect(screen.getAllByText("18/16/13").length).toBeGreaterThan(0);
    expect(source).toContain("orderOilSamplesBySequence");
    expect(source).not.toContain("a.sampleDate.localeCompare");
  });

  it("uses created_at before id when same-date samples disagree", async () => {
    mockRows([
      baseRow({
        id: "sample-a",
        sample_date: "2026-02-15",
        created_at: "2026-02-15T12:00:00Z",
        iso_4um: 18,
        iso_6um: 16,
        iso_14um: 13
      }),
      baseRow({
        id: "sample-b",
        sample_date: "2026-02-15",
        created_at: "2026-02-15T08:00:00Z",
        iso_4um: 20,
        iso_6um: 18,
        iso_14um: 15
      })
    ]);
    render(<OilCleanlinessTab assetId="asset-1" />);

    // created_at, not the lexicographic id, decides the sequence: sample-b is
    // the earlier entry (#1) and sample-a is the latest (#2).
    expect(await screen.findByText(/notches vs sample #1/)).toBeTruthy();
    expect(screen.getAllByText("18/16/13").length).toBeGreaterThan(0);
  });

  it("windows samples in lockstep and reports an empty window honestly", async () => {
    mockRows([
      baseRow({ id: "s1", sample_date: "2026-01-15" }),
      baseRow({ id: "s2", sample_date: "2026-02-15" })
    ]);
    const { unmount } = render(
      <OilCleanlinessTab
        assetId="asset-1"
        windowStart="2026-02-01"
        windowEnd="2026-02-28"
      />
    );

    expect(await screen.findByText(/1 of 2 samples in range/)).toBeTruthy();
    unmount();

    render(
      <OilCleanlinessTab
        assetId="asset-1"
        windowStart="2026-05-01"
        windowEnd="2026-05-31"
      />
    );
    expect(
      await screen.findByText("No oil samples in the selected date range")
    ).toBeTruthy();
  });

  it("keeps null states honest and units isolated with the NAS/SAE footnote", async () => {
    mockRows([
      baseRow({
        iso_4um: null,
        iso_6um: null,
        iso_14um: null,
        particles_4um: null,
        particles_6um: null,
        particles_14um: null
      })
    ]);
    const { unmount } = render(<OilCleanlinessTab assetId="asset-1" />);
    expect(await screen.findByText("No Cleanliness Data Recorded")).toBeTruthy();
    unmount();

    mockRows([
      baseRow({
        particles_4um: null,
        particles_6um: null,
        particles_14um: null
      })
    ]);
    render(<OilCleanlinessTab assetId="asset-1" />);

    expect(
      await screen.findByText(/Raw counts not recorded — plotting ISO 4406 codes/)
    ).toBeTruthy();
    expect(
      screen.getByText(/not certified conversions/)
    ).toBeTruthy();
    expect(screen.getByText(/dimensionless/)).toBeTruthy();
    expect(screen.queryByText(/°F/)).toBeNull();
    expect(screen.queryByText(/\bH2\b/)).toBeNull();
    expect(screen.queryByText(/\bpsi\b/i)).toBeNull();
  });

  it("has no unlabeled beta string or date-only ordering escape hatch", () => {
    expect(source).toContain("validateIsoTriplet");
    expect(source).toContain("ISO_TRIPLET_DATA_QUALITY_WARNING");
    expect(source).toContain("FILTER_BETA_GUIDANCE_BASIS");
    expect(source).toContain("TARGET_BASIS_LABEL");
    expect(source).toContain("orderOilSamplesBySequence");
    expect(source).not.toMatch(/Siltation risk/);
    expect(source).not.toMatch(/Spalling\/fatigue risk/);
  });
});
