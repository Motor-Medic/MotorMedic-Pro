// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  compareIsoTripletToTarget,
  formatIsoCode,
  isIsoTripletReported,
  orderOilSamplesBySequence
} from "../../lib/oilAnalysisMetrics";
import {
  ISO_CODE_DISAGREEMENT_NOTE,
  ISO_CODE_NOT_REPORTED_LABEL,
  ISO_PARTICLE_METHOD_NOT_STORED,
  ISO_TREND_MEAN_NOTE,
  deriveIsoTripletFromParticleCounts,
  isoBandStepChanges,
  isoCodeFromParticleCount,
  isoCodeProvenance,
  latestOilSample
} from "../../lib/oilTribologyGuidance";
import type { OilSample } from "../../types/oilAnalysis";
import OilCleanlinessTab from "./OilCleanlinessTab";

const src = readFileSync(
  join(process.cwd(), "src/components/trendAnalyzer/OilCleanlinessTab.tsx"),
  "utf8",
);

type Row = Record<string, unknown>;

function baseRow(overrides: Row = {}): Row {
  return {
    id: "sample-1",
    asset_id: "asset-1",
    sample_date: "2026-01-15",
    operating_hours: 500,
    iso_4um: 18,
    iso_6um: 16,
    iso_14um: 13,
    particles_4um: "120000",
    particles_6um: "30000",
    particles_14um: "500",
    ...overrides
  };
}

function sample(overrides: Partial<OilSample> = {}): OilSample {
  return {
    assetId: "asset-1",
    sampleDate: "2026-01-15",
    operatingHours: 500,
    ironAlarmLimit: 100,
    copperAlarmLimit: 50,
    chromiumAlarmLimit: 25,
    leadAlarmLimit: 30,
    aluminumAlarmLimit: 40,
    siliconAlarmLimit: 40,
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

describe("cleanliness log axis receives only positive finite counts", () => {
  it("logSafe drops null, non-finite and non-positive values", () => {
    expect(src).toContain("function logSafe(value: number | undefined): number | null");
    expect(src).toContain(
      "return value != null && Number.isFinite(value) && value > 0 ? value : null;",
    );
  });

  it("all three particle series route through logSafe before the chart", () => {
    expect(src).toContain("p4: logSafe(s.particles4um)");
    expect(src).toContain("p6: logSafe(s.particles6um)");
    expect(src).toContain("p14: logSafe(s.particles14um)");
  });

  it("table counts confess non-finite values instead of rendering them", () => {
    expect(src).toContain('if (value == null || !Number.isFinite(value)) return "—";');
  });
});

describe("SLICE-OA3 canonical ISO 4406 view", () => {
  it("renders an unreported triplet as — and never invents a comparison", () => {
    expect(formatIsoCode(null)).toBe("—");
    expect(isIsoTripletReported(null)).toBe(false);
    expect(compareIsoTripletToTarget(null, [15, 13, 10])).toBeNull();
    expect(ISO_CODE_NOT_REPORTED_LABEL).toBe("— / ISO codes not reported");
  });

  it("treats an out-of-range band such as 29 as not reported", () => {
    expect(isIsoTripletReported([29, 1, 0])).toBe(false);
    expect(compareIsoTripletToTarget([29, 1, 0], [15, 13, 10])).toBeNull();
  });

  it("compares a valid triplet per band with ordinal positions, not subtraction", () => {
    const bands = compareIsoTripletToTarget([18, 16, 13], [15, 13, 10]);
    expect(bands).toEqual([
      { channel: ">4 µm", current: 18, target: 15, comparison: "above" },
      { channel: ">6 µm", current: 16, target: 13, comparison: "above" },
      { channel: ">14 µm", current: 13, target: 10, comparison: "above" }
    ]);
    expect(JSON.stringify(bands)).not.toContain("steps");
  });

  it("labels lab-reported and count-derived codes and surfaces disagreement", () => {
    const counts = {
      particles4um: 120000,
      particles6um: 30000,
      particles14um: 500
    };
    const disagree = isoCodeProvenance(
      sample({ iso4um: 18, iso6um: 16, iso14um: 13, ...counts })
    );
    expect(disagree.countDerived).toEqual([24, 22, 16]);
    expect(disagree.provenance).toBe("lab-and-derived-disagree");
    expect(disagree.disagreement).toBe(true);
    expect(disagree.label).toContain("Lab-reported");
    expect(disagree.label).toContain("count-derived");

    const agree = isoCodeProvenance(
      sample({ iso4um: 24, iso6um: 22, iso14um: 16, ...counts })
    );
    expect(agree.provenance).toBe("lab-and-derived-agree");
    expect(agree.disagreement).toBe(false);
  });

  it("renders both provenances when the lab code and count-derived code disagree", async () => {
    mockRows([baseRow()]);
    render(React.createElement(OilCleanlinessTab, { assetId: "asset-1" }));

    expect(await screen.findByText("Code provenance discrepancy")).toBeTruthy();
    expect(screen.getByText(ISO_CODE_DISAGREEMENT_NOTE)).toBeTruthy();
    expect(screen.getAllByText("18/16/13").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/24\/22\/16/).length).toBeGreaterThan(0);
  });

  it("never back-fills raw counts when they are absent", async () => {
    expect(isoCodeFromParticleCount(null)).toBeNull();
    expect(isoCodeFromParticleCount(0)).toBeNull();
    expect(
      deriveIsoTripletFromParticleCounts(
        sample({
          particles4um: undefined,
          particles6um: undefined,
          particles14um: undefined
        })
      )
    ).toBeNull();

    mockRows([
      baseRow({
        particles_4um: null,
        particles_6um: null,
        particles_14um: null
      })
    ]);
    render(React.createElement(OilCleanlinessTab, { assetId: "asset-1" }));

    expect(
      await screen.findByText(/Raw particle counts not stored for the latest sample/)
    ).toBeTruthy();
    expect(screen.getByText(/not back-filled from ISO codes/)).toBeTruthy();
    expect(screen.queryByText("24/22/16")).toBeNull();
  });

  it("prefers a stored per-asset/OEM target and labels its source", async () => {
    mockRows([baseRow()]);
    render(React.createElement(OilCleanlinessTab, { assetId: "asset-1", target: { triplet: [14, 12, 9], source: "OEM gearbox spec rev C" } }));

    expect(
      (
        await screen.findAllByText(
          /OEM gearbox spec rev C — stored per-asset\/OEM target/
        )
      ).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/14\/12\/9/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/recalled Noria default/)).toBeNull();
  });

  it("withholds the trend when particle-counting method is not stored", async () => {
    mockRows([
      baseRow({ id: "s1", sample_date: "2026-01-15" }),
      baseRow({ id: "s2", sample_date: "2026-02-15" })
    ]);
    render(React.createElement(OilCleanlinessTab, { assetId: "asset-1" }));

    expect(await screen.findByText(ISO_PARTICLE_METHOD_NOT_STORED)).toBeTruthy();
    expect(screen.getByText("Cleanliness trend withheld")).toBeTruthy();
    expect(screen.getByText(/no numeric mean of codes is computed/)).toBeTruthy();
  });

  it("renders per-band ordinal steps, never a mean, for two comparable triplets", async () => {
    const older = sample({
      id: "s1",
      sampleDate: "2026-01-15",
      iso4um: 18,
      iso6um: 16,
      iso14um: 13
    });
    const newer = sample({
      id: "s2",
      sampleDate: "2026-02-15",
      iso4um: 20,
      iso6um: 18,
      iso14um: 15
    });
    const steps = isoBandStepChanges([newer, older]);
    expect(steps).toHaveLength(1);
    expect(steps[0].steps).toEqual([2, 2, 2]);
    expect(ISO_TREND_MEAN_NOTE).toContain("never averaged");

    mockRows([
      baseRow({ id: "s1", sample_date: "2026-01-15" }),
      baseRow({
        id: "s2",
        sample_date: "2026-02-15",
        iso_4um: 20,
        iso_6um: 18,
        iso_14um: 15
      })
    ]);
    render(React.createElement(OilCleanlinessTab, { assetId: "asset-1", methodComparable: true }));

    expect(await screen.findByText(ISO_TREND_MEAN_NOTE)).toBeTruthy();
    expect(screen.getAllByText("20/18/15").length).toBeGreaterThan(0);
    expect(screen.getAllByText("+2").length).toBeGreaterThanOrEqual(3);
  });

  it("gives every no-data panel an explicit state instead of bare axes or zero", async () => {
    mockRows([
      baseRow({ id: "s1", sample_date: "2026-01-15" }),
      baseRow({
        id: "s2",
        sample_date: "2026-02-15",
        iso_4um: null,
        iso_6um: null,
        iso_14um: null,
        particles_4um: null,
        particles_6um: null,
        particles_14um: null
      })
    ]);
    render(React.createElement(OilCleanlinessTab, { assetId: "asset-1" }));

    expect(
      (await screen.findAllByText(ISO_CODE_NOT_REPORTED_LABEL)).length
    ).toBeGreaterThan(0);
    expect(screen.getByText(/No per-band comparison is derived/)).toBeTruthy();
    expect(
      screen.getByText(/Raw particle counts not stored for the latest sample/)
    ).toBeTruthy();
    expect(
      screen.getByText(/1 valid reported ISO 4406 triplet in range; at least 2 are required/)
    ).toBeTruthy();
  });

  it("resolves latest through the shared sequence helper used by OA1/OA2", () => {
    const rows = [
      sample({
        id: "sample-b",
        sampleDate: "2026-02-15",
        createdAt: "2026-02-15T08:00:00Z"
      }),
      sample({
        id: "sample-a",
        sampleDate: "2026-02-15",
        createdAt: "2026-02-15T12:00:00Z"
      }),
      sample({ id: "older", sampleDate: "2026-01-15" })
    ];
    const ordered = orderOilSamplesBySequence(rows);
    expect(latestOilSample(rows)?.id).toBe(ordered[ordered.length - 1]?.id);
    expect(latestOilSample(rows)?.id).toBe("sample-a");
    expect(src).toContain("latestOilSample(windowed)");
    expect(src).not.toContain("a.sampleDate.localeCompare");
  });

  it("keeps the ordinal rule, Noria badge and no-baseline wording intact", () => {
    expect(src).toContain("ISO_4406_ORDINAL_RULE");
    expect(src).toContain(
      "recalled Noria default — not a stored per-asset target"
    );
    expect(src).toContain("No baseline is invented");
    expect(src).toContain("ISO_PARTICLE_METHOD_NOT_STORED");
    expect(src).not.toContain("MASTER_VISION_PROMPT");
  });
});
