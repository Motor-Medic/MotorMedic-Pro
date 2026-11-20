import { describe, expect, it } from "vitest";
import type { OilSample } from "../types/oilAnalysis";
import {
  compareIsoTripletToTarget,
  fluidChemistryAudit,
  ftirBaselineVerdict,
  ftirComparability,
  ftirFieldBaselineVerdict,
  hasFreshOilFtirBaseline,
  isIsoTripletReported,
  ISO_4406_ORDINAL_RULE,
  orderOilSamplesBySequence,
  tanTbnTrend,
  wearMetalLimitDisplay,
  type IsoCodeTriplet
} from "./oilAnalysisMetrics";
import {
  latestOilSample,
  VISCOSITY_TEMPERATURE_EXCLUSION_LABEL,
  viscosityTemperatureGuard
} from "./oilTribologyGuidance";

function sample(overrides: Partial<OilSample> = {}): OilSample {
  return {
    assetId: "asset-1",
    sampleDate: "2026-01-01",
    operatingHours: 100,
    ironAlarmLimit: 100,
    copperAlarmLimit: 50,
    chromiumAlarmLimit: 25,
    leadAlarmLimit: 30,
    aluminumAlarmLimit: 40,
    siliconAlarmLimit: 30,
    ...overrides
  };
}

describe("SLICE-OA2 latest-sample agreement", () => {
  it("resolves same-date, zero-hour rows through one sequence helper", () => {
    // Three uploads share one calendar day and all report 0 operating hours;
    // only created_at/id can decide the tie.
    const rows = [
      sample({ id: "b", createdAt: "2026-11-19T10:00:00.000Z", acidNumber: 2.0, iron: 20 }),
      sample({ id: "c", createdAt: "2026-11-19T12:00:00.000Z", acidNumber: 2.85, iron: 30 }),
      sample({ id: "a", createdAt: "2026-11-19T08:00:00.000Z", acidNumber: 1.5, iron: 10 })
    ];

    const ordered = orderOilSamplesBySequence(rows);
    const expected = ordered[ordered.length - 1];
    const latest = latestOilSample(rows);

    expect(latest).toBe(expected);
    expect(latest?.acidNumber).toBe(2.85);

    // The Wear Metals card resolves the same row, so both tabs agree.
    const wear = wearMetalLimitDisplay(rows, "iron");
    expect(wear.latestPpm).toBe(expected?.iron);
    expect(wear.latestPpm).toBe(30);
  });
});

describe("SLICE-OA2 TAN − TBN pair integrity", () => {
  it("keeps the delta null for unpaired TAN and never zero-fills TBN", () => {
    const result = tanTbnTrend([
      sample({ sampleDate: "2026-01-01", acidNumber: 2.0 }),
      sample({ sampleDate: "2026-02-01", acidNumber: 2.5 })
    ]);

    expect(result.delta).toBeNull();
    expect(result.deltaDate).toBeNull();
    expect(result.delta).not.toBe(0);
    expect(result.distinctDateCount).toBe(0);
  });

  it("withholds the slope below three paired distinct dates", () => {
    const result = tanTbnTrend([
      sample({ sampleDate: "2026-01-01", acidNumber: 1.0, tbn: 5.0 }),
      sample({ sampleDate: "2026-02-01", acidNumber: 2.0, tbn: 4.0 })
    ]);

    expect(result.slopePerDay).toBeNull();
    expect(result.slopeBasis).toBeNull();
    expect(result.distinctDateCount).toBe(2);
  });

  it("normalizes the slope by elapsed time, not sample count", () => {
    const tenDayGaps = tanTbnTrend([
      sample({ sampleDate: "2026-01-01", acidNumber: 1.0, tbn: 5.0 }),
      sample({ sampleDate: "2026-01-11", acidNumber: 2.0, tbn: 4.0 }),
      sample({ sampleDate: "2026-01-21", acidNumber: 3.0, tbn: 3.0 })
    ]);
    const thirtyDayGaps = tanTbnTrend([
      sample({ sampleDate: "2026-01-01", acidNumber: 1.0, tbn: 5.0 }),
      sample({ sampleDate: "2026-01-31", acidNumber: 2.0, tbn: 4.0 }),
      sample({ sampleDate: "2026-03-02", acidNumber: 3.0, tbn: 3.0 })
    ]);

    expect(tenDayGaps.slopePerDay).toBeCloseTo(0.2, 10);
    expect(thirtyDayGaps.slopePerDay).toBeCloseTo(0.0667, 3);
    expect(tenDayGaps.slopeBasis).toBe("elapsed-days");
    expect(tenDayGaps.elapsedDays).toBe(20);
  });

  it("adds no weight when the same date is uploaded twice", () => {
    const base = [
      sample({ sampleDate: "2026-01-01", acidNumber: 1.0, tbn: 5.0 }),
      sample({ sampleDate: "2026-01-11", acidNumber: 2.0, tbn: 4.0 }),
      sample({ sampleDate: "2026-01-21", acidNumber: 3.0, tbn: 3.0 })
    ];
    const duplicate = [
      ...base,
      sample({ sampleDate: "2026-01-11", acidNumber: 9.0, tbn: 9.0 })
    ];

    expect(tanTbnTrend(duplicate).distinctDateCount).toBe(3);
    expect(tanTbnTrend(duplicate).slopePerDay).toBeCloseTo(
      tanTbnTrend(base).slopePerDay as number,
      10
    );
  });

  it("gates the operating-hour slope on distinct non-zero hour stamps", () => {
    const zeroHours = tanTbnTrend([
      sample({ sampleDate: "2026-01-01", operatingHours: 0, acidNumber: 1.0, tbn: 5.0 }),
      sample({ sampleDate: "2026-01-11", operatingHours: 0, acidNumber: 2.0, tbn: 4.0 }),
      sample({ sampleDate: "2026-01-21", operatingHours: 0, acidNumber: 3.0, tbn: 3.0 })
    ]);
    expect(zeroHours.slopePer100Hours).toBeNull();

    const stamped = tanTbnTrend([
      sample({ sampleDate: "2026-01-01", operatingHours: 100, acidNumber: 1.0, tbn: 5.0 }),
      sample({ sampleDate: "2026-01-11", operatingHours: 200, acidNumber: 2.0, tbn: 4.0 }),
      sample({ sampleDate: "2026-01-21", operatingHours: 300, acidNumber: 3.0, tbn: 3.0 })
    ]);
    expect(stamped.slopePer100Hours).toBeCloseTo(2, 10);
  });
});

describe("SLICE-OA2 ISO 4406 reporting gate", () => {
  it("treats placeholder and out-of-range bands as not reported", () => {
    expect(isIsoTripletReported(null)).toBe(false);
    expect(
      isIsoTripletReported("—" as unknown as IsoCodeTriplet)
    ).toBe(false);
    expect(
      isIsoTripletReported("n/a" as unknown as IsoCodeTriplet)
    ).toBe(false);
    expect(isIsoTripletReported([18, 16, 13])).toBe(true);
    expect(isIsoTripletReported([29, 16, 13])).toBe(false);
    expect(isIsoTripletReported([18.5, 16, 13])).toBe(false);
  });

  it("counts only fully numeric ISO triplets in the audit line", () => {
    const audit = fluidChemistryAudit([
      sample({ iso4um: 18, iso6um: 16, iso14um: 13 }),
      sample({ iso4um: 18, iso6um: undefined, iso14um: 13 }),
      sample({
        iso4um: "n/a" as unknown as number,
        iso6um: 16,
        iso14um: 13
      }),
      sample({ iso4um: 29, iso6um: 16, iso14um: 13 })
    ]);

    expect(audit.isoReportedCount).toBe(1);
    expect(audit.sampleCount).toBe(4);
  });

  it("compares per band and never subtracts or averages codes", () => {
    const rows = compareIsoTripletToTarget([18, 12, 13], [15, 13, 10]);

    expect(rows).toEqual([
      { channel: ">4 µm", current: 18, target: 15, comparison: "above" },
      { channel: ">6 µm", current: 12, target: 13, comparison: "at-or-below" },
      { channel: ">14 µm", current: 13, target: 10, comparison: "above" }
    ]);
    expect(rows?.every((row) => !("delta" in row) && !("steps" in row))).toBe(
      true
    );
    expect(ISO_4406_ORDINAL_RULE).toContain("ordinal log bands");
    expect(ISO_4406_ORDINAL_RULE).toContain("never be averaged");
    expect(ISO_4406_ORDINAL_RULE).toContain("arithmetically subtracted");
  });

  it("withholds the comparison unless both current and target are reported", () => {
    expect(compareIsoTripletToTarget(null, [15, 13, 10])).toBeNull();
    expect(compareIsoTripletToTarget([18, 16, 13], null)).toBeNull();
    expect(
      compareIsoTripletToTarget(
        [18, 16, 13],
        "—" as unknown as IsoCodeTriplet
      )
    ).toBeNull();
  });
});

describe("SLICE-OA2 FTIR provenance", () => {
  it("withholds the raw-absorbance trend when method metadata is not stored", () => {
    const result = ftirComparability([
      sample({ sampleDate: "2026-01-01", oxidation: 1.0 }),
      sample({ sampleDate: "2026-02-01", oxidation: 2.0 })
    ]);

    expect(result.comparable).toBe(false);
    expect(result.note).toContain("not comparable across samples");
  });

  it("allows the trend only for an identical stored signature", () => {
    const meta = {
      ftirInstrument: "PerkinElmer",
      ftirPathlengthMm: 0.1,
      ftirMethod: "ASTM E2412"
    };
    expect(
      ftirComparability([
        sample({ sampleDate: "2026-01-01", oxidation: 1.0, ...meta }),
        sample({ sampleDate: "2026-02-01", oxidation: 2.0, ...meta })
      ]).comparable
    ).toBe(true);

    expect(
      ftirComparability([
        sample({ sampleDate: "2026-01-01", oxidation: 1.0, ...meta }),
        sample({
          sampleDate: "2026-02-01",
          oxidation: 2.0,
          ...meta,
          ftirMethod: "in-house"
        })
      ]).comparable
    ).toBe(false);
  });

  it("never derives a verdict without a stored fresh-oil reference record", () => {
    expect(hasFreshOilFtirBaseline(null)).toBe(false);
    expect(hasFreshOilFtirBaseline(undefined)).toBe(false);
    // A caller-supplied flag is not a record and cannot unlock a verdict.
    expect(hasFreshOilFtirBaseline(true as unknown)).toBe(false);
    expect(ftirBaselineVerdict(true as unknown, 2.5)).toBeNull();
    expect(ftirFieldBaselineVerdict({}, "oxidation", 2.5)).toBeNull();
  });

  it("uses a stored reference when one exists", () => {
    const reference = { oxidation: 1.0, nitration: 0.5 };
    expect(hasFreshOilFtirBaseline(reference)).toBe(true);
    expect(ftirFieldBaselineVerdict(reference, "oxidation", 1.2)).toBe(
      "above-reference"
    );
    expect(ftirFieldBaselineVerdict(reference, "nitration", 0.4)).toBe(
      "at-or-below-reference"
    );
  });
});

describe("SLICE-OA2 viscosity temperature guard", () => {
  it("keeps a 40°C-column reading in the series", () => {
    const guard = viscosityTemperatureGuard({ viscosity40C: 46 });
    expect(guard.comparable).toBe(true);
    expect(guard.temperatureC).toBe(40);
    expect(guard.exclusionLabel).toBeNull();
  });

  it("excludes a declared non-40°C reading and labels it", () => {
    const guard = viscosityTemperatureGuard({
      viscosity40C: 46,
      viscosityTestTemperatureC: 100
    });
    expect(guard.comparable).toBe(false);
    expect(guard.reason).toBe("temperature-not-40c");
    expect(guard.exclusionLabel).toBe(
      "not comparable to the 40°C series"
    );
    expect(guard.exclusionLabel).toBe(VISCOSITY_TEMPERATURE_EXCLUSION_LABEL);
  });

  it("excludes KV with no recorded 40°C basis", () => {
    const guard = viscosityTemperatureGuard({ viscosity100C: 7.2 });
    expect(guard.comparable).toBe(false);
    expect(guard.reason).toBe("temperature-not-recorded");
    expect(guard.exclusionLabel).toBe(
      VISCOSITY_TEMPERATURE_EXCLUSION_LABEL
    );
  });
});
