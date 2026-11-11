import { describe, expect, it } from "vitest";
import type { OilSample } from "../types/oilAnalysis";
import {
  calculateWearGenerationRate,
  interpretWearPattern
} from "./oilAnalysisMetrics";
import {
  alloyCoElevationRatios,
  METALLURGY_RATIOS_NOTE,
  siliconAluminumRatio
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

describe("SLICE-AR wear generation rate gate", () => {
  it("returns insufficient for an all-zero-hour demo", () => {
    const rate = calculateWearGenerationRate(
      [
        sample({ sampleDate: "2026-01-01", operatingHours: 0, iron: 10 }),
        sample({ sampleDate: "2026-02-01", operatingHours: 0, iron: 20 })
      ],
      (s) => s.iron
    );

    expect(rate.status).toBe("insufficient");
    expect(rate.ppmPer100Hours).toBeNull();
    expect(rate.distinctHourCount).toBe(0);
    expect(rate.pointCount).toBe(0);
  });

  it("returns insufficient when hours are repeated even if readings differ", () => {
    const rate = calculateWearGenerationRate(
      [
        sample({ sampleDate: "2026-01-01", operatingHours: 100, iron: 10 }),
        sample({ sampleDate: "2026-02-01", operatingHours: 100, iron: 20 })
      ],
      (s) => s.iron
    );

    expect(rate.status).toBe("insufficient");
    expect(rate.ppmPer100Hours).toBeNull();
    expect(rate.distinctHourCount).toBe(1);
  });

  it("returns insufficient when a reading is missing", () => {
    const rate = calculateWearGenerationRate(
      [
        sample({ sampleDate: "2026-01-01", operatingHours: 100, iron: 10 }),
        sample({ sampleDate: "2026-02-01", operatingHours: 200 })
      ],
      (s) => s.iron
    );

    expect(rate.status).toBe("insufficient");
    expect(rate.pointCount).toBe(1);
  });

  it("calculates Δppm per 100 hours only at distinct non-zero hours", () => {
    const rate = calculateWearGenerationRate(
      [
        sample({ sampleDate: "2026-01-01", operatingHours: 100, iron: 10 }),
        sample({ sampleDate: "2026-02-01", operatingHours: 200, iron: 20 })
      ],
      (s) => s.iron
    );

    expect(rate.status).toBe("available");
    expect(rate.ppmPer100Hours).toBe(10);
    expect(rate.distinctHourCount).toBe(2);
    expect(rate.hoursElapsed).toBe(100);
  });

  it("ignores zero-hour samples when other distinct hours exist", () => {
    const rate = calculateWearGenerationRate(
      [
        sample({ sampleDate: "2026-01-01", operatingHours: 0, iron: 1 }),
        sample({ sampleDate: "2026-02-01", operatingHours: 100, iron: 10 }),
        sample({ sampleDate: "2026-03-01", operatingHours: 200, iron: 20 })
      ],
      (s) => s.iron
    );

    expect(rate.status).toBe("available");
    expect(rate.pointCount).toBe(2);
    expect(rate.ppmPer100Hours).toBe(10);
  });
});

describe("SLICE-AR alloy co-elevation ratios", () => {
  it("emits Cu/Pb, Cu/Sn, Pb/Sn and Fe/Cr only from stored pairs", () => {
    const ratios = alloyCoElevationRatios(
      sample({
        copper: 60,
        lead: 30,
        tin: 10,
        iron: 90,
        chromium: 3
      })
    );

    expect(ratios.map((ratio) => [ratio.label, ratio.value])).toEqual([
      ["Cu/Pb", 2],
      ["Cu/Sn", 6],
      ["Pb/Sn", 3],
      ["Fe/Cr", 30]
    ]);
  });

  it("omits ratios with a missing element or a zero denominator", () => {
    expect(
      alloyCoElevationRatios(
        sample({ copper: 10, lead: undefined, tin: 0, iron: 10 })
      )
    ).toEqual([]);
  });

  it("keeps the descriptive-only note and never names a component", () => {
    const ratios = alloyCoElevationRatios(
      sample({ copper: 60, lead: 30, tin: 10, iron: 90, chromium: 3 })
    );
    const text = [
      METALLURGY_RATIOS_NOTE,
      ...ratios.map((ratio) => ratio.label)
    ].join(" ");

    expect(METALLURGY_RATIOS_NOTE).toContain("not component metallurgy");
    expect(text).not.toMatch(
      /journal bearing|bearing overlay|bushing|steel component|bronze\/brass/i
    );
  });
});

describe("SLICE-AR Si:Al null-vs-zero discipline", () => {
  it("says Not measured when aluminum is unreported", () => {
    expect(siliconAluminumRatio(sample({ silicon: 12 }))).toEqual({
      status: "not-measured",
      missing: ["aluminum"]
    });
  });

  it("says Not measured when silicon is unreported", () => {
    expect(siliconAluminumRatio(sample({ aluminum: 4 }))).toEqual({
      status: "not-measured",
      missing: ["silicon"]
    });
  });

  it("reports both missing without inventing a zero", () => {
    expect(siliconAluminumRatio(sample({}))).toEqual({
      status: "not-measured",
      missing: ["silicon", "aluminum"]
    });
  });

  it("calculates the ratio only when both elements are measured", () => {
    expect(siliconAluminumRatio(sample({ silicon: 12, aluminum: 4 }))).toEqual({
      status: "measured",
      value: 3,
      silicon: 12,
      aluminum: 4
    });
  });

  it("does not divide by a measured zero aluminum", () => {
    expect(siliconAluminumRatio(sample({ silicon: 12, aluminum: 0 }))).toEqual({
      status: "not-computable",
      reason: "aluminum-zero",
      silicon: 12,
      aluminum: 0
    });
  });

  it("does not mention recalled Si>20 / 5:1 thresholds or D5185", () => {
    const source = siliconAluminumRatio.toString();
    expect(source).not.toMatch(/Si\s*>\s*20|5\s*:\s*1|D5185/i);
  });
});

describe("SLICE-AR descriptive wear pattern", () => {
  it("reports Fe/Cr co-elevation without a component attribution", () => {
    const text = interpretWearPattern(
      sample({ iron: 90, chromium: 20, copper: 1, silicon: 2 })
    );

    expect(text).toContain("Iron and chromium are co-elevated");
    expect(text).toContain("wear origin not identified");
    expect(text).not.toMatch(
      /gears|shafts|bearing races|bronze|brass|bushing|oil cooler/i
    );
  });

  it("does not use hard-coded Si contamination thresholds", () => {
    const text = interpretWearPattern(
      sample({ silicon: 25, aluminum: 2, iron: 1, chromium: 1 })
    );

    expect(text).toContain("Silicon is elevated");
    expect(text).toContain("sealant vs dust origin not classified");
  });
});
